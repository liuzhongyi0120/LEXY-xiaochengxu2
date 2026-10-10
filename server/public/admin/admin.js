/* =========================================================================
 * 店铺装修台
 *
 * 对标有赞「店铺装修」编辑器（/v4/deco/decorate#/edit/<id>），四区布局：
 *   组件库（常用/基础/高级）│ 页面布局（组件大纲，可拖拽排序）│ 手机预览 │ 属性面板
 *
 * 数据流：replica.js（已发布）→ 草稿（本页编辑）→ 发布写回 replica.js
 * 表单完全由 /api/decorate/page 返回的 schema 驱动，后台不硬编码任何字段，
 * 后端加字段（server/decorate/schema.js）这里自动出现。
 * ========================================================================= */
(function () {
  'use strict';

  var API = location.origin;

  /* ----------------------------- 工具 ----------------------------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function isNum(s) { return /^\d+$/.test(s); }
  function attr(s) { return esc(s).replace(/'/g, '&#39;'); }

  function getPath(obj, path) {
    if (!path) return obj;
    var cur = obj;
    var segs = String(path).split('.');
    for (var i = 0; i < segs.length; i++) {
      if (cur == null) return undefined;
      cur = cur[segs[i]];
    }
    return cur;
  }
  function setPath(obj, path, val) {
    var segs = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < segs.length - 1; i++) {
      if (cur[segs[i]] == null) cur[segs[i]] = isNum(segs[i + 1]) ? [] : {};
      cur = cur[segs[i]];
    }
    cur[segs[segs.length - 1]] = val;
  }
  function genId() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function toast(msg, type) {
    var box = $('toast');
    var t = el('div', 't' + (type ? ' ' + type : ''), esc(msg));
    box.appendChild(t);
    // 错误信息（尤其是服务端的校验提示）需要阅读时间，2.2 秒根本来不及看
    setTimeout(function () { t.remove(); }, type === 'err' ? 4600 : 2200);
  }

  /**
   * 服务端的校验信息形如「第 12 个标题文本没有内容」。
   * 只把这句话弹出来，用户还得自己在几十个区块里数到第 12 个；
   * 这里直接解析序号、选中对应区块并滚动过去，报错即定位。
   */
  function locateFromMessage(msg) {
    var m = /第\s*(\d+)\s*个/.exec(String(msg || ''));
    if (!m) return false;
    var idx = Number(m[1]) - 1;
    var list = (S.cur && S.cur.data && S.cur.data.blocks) || [];
    if (idx < 0 || idx >= list.length) return false;
    select('blocks.' + idx);
    scrollToSel();
    return true;
  }

  /**
   * 按钮防重复点击。
   * 发布 / 保存是「点了就写文件」的动作，之前没有任何禁用态，
   * 手快连点两下就会发两次 publish，版本库里多出一条重复版本、replica.js 被重写两遍。
   * 用法：withBusy(btn, function () { return 请求 Promise })
   */
  function withBusy(btn, fn) {
    if (!btn) return fn();
    if (btn.disabled) return;
    var old = btn.textContent;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.textContent = old + '…';
    var done = function () {
      btn.classList.remove('busy');
      btn.textContent = old;
      // 不能在结束时无条件 disabled = false：
      // renderDirty() 会把 btnSave 按「有没有未保存改动」重设，
      // 无条件启用会把刚设好的禁用态覆盖掉（保存成功后按钮又亮起来）。
      // 这里交给 renderDirty 统一裁决，并对其它按钮回落到原态。
      if (btn.id === 'btnSave') renderDirty();
      else btn.disabled = false;
    };
    var r;
    try { r = fn(); } catch (e) { done(); throw e; }
    return Promise.resolve(r).then(
      function (v) { done(); return v; },
      function (e) { done(); throw e; }
    );
  }

  /* ----------------------------- 状态 ----------------------------- */
  var S = {
    pages: [],
    stats: null,
    custom: null,       // 自定义页配额 { count, max }
    templates: [],      // 新建页面可选模板
    filters: { name: '', status: '', belongs: '' },
    cur: null,        // { key, meta, schema, data, published, titles, hasDraft, versions }
    sel: '__root__',
    dirty: false,
    pvBrand: 0,
    lib: null,          // 组件库（来自后端）
    libTab: 'common',
    common: [],         // 常用组件（localStorage 可自定义）
    device: 375,
    pvSlide: {},        // 预览里各轮播区块的手动翻页位置：{ 'blocks.1': 2 }
    tabbar: null        // 店铺导航（底部导航）的**已发布**配置，装修台手机壳按它渲染
  };

  /**
   * 页面 key → 真机页面路径。
   * 底部导航的高亮必须按**路径**匹配（与小程序 custom-tab-bar 的 setActive 同一口径），
   * 不能按序号 —— 运营在「店铺导航」里调整顺序后，序号就全错位了。
   */
  var TAB_PATH = {
    home: '/pages/index/index',
    lexy: '/pages/lexy/lexy',
    news: '/pages/news/news',
    product: '/pages/product/product',
    mine: '/pages/mine/mine'
  };

  /* ----------------------------- 管理员令牌 ----------------------------- */

  /**
   * 装修台的每个接口（`/api/decorate/*`、`/api/media/*`）在服务端都要求管理员令牌。
   *
   * 令牌与后台控制台（/console）共用同一个 localStorage 键：任一处登录，两边都生效。
   * 角色分三级（只读 / 运营 / 超级管理员）：日常改装修与上传素材用「运营」即可，
   * 「生成代码」「删除素材」「新建/改名/删除页面」需要「超级管理员」—— 服务端会拦，
   * 前端这里只提前把提示说清楚。
   */
  var TOKEN_KEY = 'lexy_admin_token';
  var ME_KEY = 'lexy_admin_me';
  var ROLE_TEXT = { viewer: '只读', operator: '运营', owner: '超级管理员' };

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function me() {
    try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(tk, who) {
    try {
      if (tk) localStorage.setItem(TOKEN_KEY, tk); else localStorage.removeItem(TOKEN_KEY);
      if (who) localStorage.setItem(ME_KEY, JSON.stringify(who)); else localStorage.removeItem(ME_KEY);
    } catch (e) { /* 隐私模式下不可写：本次会话内仍可用 */ }
    renderWho();
  }
  function clearSession() { saveSession('', null); }

  /**
   * 「只有令牌、没有身份」时补一次身份查询。
   *
   * 令牌与身份是两个 localStorage 键（`lexy_admin_token` / `lexy_admin_me`）。
   * 令牌可能来自别处：另一个标签页、控制台（/console）登录、或运维预置。
   * 这时 `me()` 为 null，界面会把**已登录**的用户当成「未登录」——
   * 顶栏显示「未登录」，每个操作都走 openLogin 分支被拦下，表现是「点了没反应」。
   * 所以启动时先拿令牌换一次 `/api/admin/session`，把身份补齐。
   * 令牌已失效则清掉，让后续流程正常引导重新登录。
   */
  function hydrateSession() {
    if (me() || !token()) return Promise.resolve(me());
    return api('GET', '/api/admin/session').then(function (who) {
      saveSession(token(), who);
      return who;
    })['catch'](function (e) {
      // 401（api 内部已清凭据并拉起登录框）：令牌真的失效，属正常路径；
      // 其他失败是 bug（接口写错、服务端异常），必须留痕，不能静默变成「未登录」。
      if (!e || e.code !== 401) console.warn('[admin] 身份补齐失败：', e && e.message);
      return null;
    });
  }

  function renderWho() {
    var t = $('tbWho');
    var b = $('btnWho');
    var who = me();
    if (t) t.textContent = who
      ? ((who.name || '管理员') + ' · ' + (who.roleLabel || ROLE_TEXT[who.role] || ''))
      : '未登录';
    if (b) {
      b.textContent = who ? '退出' : '登录';
      b.title = who ? '点击退出管理员登录' : '使用管理员口令或长期令牌登录';
    }
  }

  /** 拉起管理员登录弹层；已有身份或弹层正开着就不重复打扰 */
  function openLogin(opt) {
    opt = opt || {};
    if (me()) return;
    if ($('modal').hidden === false) { toast(opt.reason || '该操作需要管理员身份', 'err'); return; }

    var box = el('div');
    box.innerHTML =
      '<div style="line-height:1.7;color:#5b6472;font-size:13px">' +
        esc(opt.reason || '装修台的接口需要管理员身份') + '</div>' +
      '<div class="fld" style="margin-top:12px"><label>管理员口令</label>' +
        '<input id="lgPw" type="password" placeholder="登录后获得超级管理员会话"></div>' +
      '<div style="color:#8a919e;font-size:12px;margin-top:12px;line-height:1.6">' +
        '也可以粘贴「长期令牌」（服务端 <code>ADMIN_TOKENS</code> 里的那一串）。</div>' +
      '<div class="fld"><label>长期令牌</label>' +
        '<input id="lgTk" type="text" placeholder="粘贴令牌（与口令二选一）"></div>';

    var ok = el('button', 'btn primary', '登录');
    var cancel = el('button', 'btn', '稍后');
    cancel.onclick = closeModal;
    ok.onclick = function () {
      var pwEl = $('lgPw');
      var tkEl = $('lgTk');
      var pw = pwEl ? pwEl.value : '';
      var tk = tkEl ? tkEl.value.trim() : '';
      if (!pw && !tk) { toast('请填写管理员口令，或粘贴长期令牌', 'err'); return; }
      ok.disabled = true;
      ok.textContent = '验证中…';
      var p;
      if (tk) {
        // 长期令牌没有专门的校验接口：先用它请求一次会话，确认令牌有效且角色能被识别
        saveSession(tk, null);
        p = api('GET', '/api/admin/session').then(function (who) { saveSession(tk, who); return who; });
      } else {
        p = api('POST', '/api/admin/login', { body: { password: pw } }).then(function (d) {
          var who = { role: d.role, roleLabel: d.roleLabel, name: '超级管理员', source: 'session' };
          saveSession(d.token, who);
          return who;
        });
      }
      p.then(function (who) {
        toast('已登录：' + ((who && who.name) || '管理员'));
        closeModal();
        loadPages();
      })['catch'](function (e) {
        if (tk) clearSession();   // 令牌填错就把刚写进去的清掉，否则后续每个请求都 401
        ok.disabled = false;
        ok.textContent = '登录';
        toast(e.message, 'err');
      });
    };
    modal('管理员登录', box, [cancel, ok]);
  }

  function buttonWho() {
    if (!me()) { openLogin({}); return; }
    if (!confirm('退出管理员登录？退出后需重新输入口令或令牌。')) return;
    clearSession();
    toast('已退出管理员登录');
    loadPages();
  }

  /** 某个动作需要的最低角色；不够就地给提示（真正的判定在服务端） */
  function needRole(role, action) {
    var who = me();
    var rank = { viewer: 1, operator: 2, owner: 3 };
    if (who && rank[who.role] >= rank[role]) return true;
    if (!who) openLogin({ reason: '「' + (action || '该操作') + '」需要管理员身份' });
    else toast('当前身份「' + (ROLE_TEXT[who.role] || '未知') + '」无权' + (action || '执行该操作') +
      '（需要「' + (ROLE_TEXT[role] || role) + '」及以上）', 'err');
    return false;
  }

  /* ----------------------------- API ----------------------------- */
  function api(method, path, opt) {
    opt = opt || {};
    var url = API + path;
    var qs = new URLSearchParams();
    Object.keys(opt.query || {}).forEach(function (k) {
      var v = opt.query[k];
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    if (qs.toString()) url += '?' + qs.toString();
    var headers = {};
    var tk = token();
    if (tk) headers['Authorization'] = 'Bearer ' + tk;
    var body;
    if (opt.body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opt.body);
    }
    return fetch(url, { method: method, headers: headers, body: body }).then(function (r) {
      return r.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) { /* ignore */ }
        if (!json) return Promise.reject(new Error('响应不是合法 JSON：' + text.slice(0, 120)));
        if (json.code !== 0) {
          // 401：未登录 / 会话过期 → 清掉旧凭据并拉起登录框（只弹一次，避免并发请求弹一摞）
          if (json.code === 401) {
            if (tk) clearSession();
            openLogin({ reason: json.msg });
          }
          var err = new Error(json.msg || ('业务码 ' + json.code));
          err.code = json.code;
          return Promise.reject(err);
        }
        return json.data;
      });
    });
  }

  /* ----------------------------- 视图切换 ----------------------------- */
  /**
   * 顶栏有两种形态（靠 .mode-list 切换，样式在 admin.css）：
   *   list —— 只看得到「LEXY 店铺装修台 / 店铺页面」，
   *           隐藏「正在装修：—」「内置页」与编辑专属按钮（查看变更 / 版本 / 丢弃草稿 / 存至草稿 / 生成代码）。
   *           之前不区分视图，列表页顶栏会显示「正在装修：—」并挂着一排编辑按钮，语义错乱且容易误点发布。
   *   edit —— 完整编辑器工具栏。
   */
  function setTopbar(mode) {
    var tb = $('topbar');
    if (!tb) return;
    if (mode === 'edit') tb.classList.remove('mode-list');
    else tb.classList.add('mode-list');
  }

  function showList() {
    $('viewList').hidden = false;
    $('viewEdit').hidden = true;
    S.cur = null;
    setTopbar('list');
    loadPages();
  }
  function showEdit() {
    $('viewList').hidden = true;
    $('viewEdit').hidden = false;
    setTopbar('edit');
  }

  /* =========================================================================
   * 一、页面列表
   * ========================================================================= */

  function loadPages() {
    // 每次回到列表页都重新拉一次「可跳转目标」：新建 / 删除自定义页后立刻反映到链接选择器
    LINK_OPTS = null;
    PvRender.setLinkOptions(null); // 与上面同步清掉，避免预览角标短暂显示上一轮的路径名
    loadLinkOptions();
    return api('GET', '/api/decorate/pages').then(function (d) {
      S.pages = d.list || [];
      S.stats = d.stats || {};
      S.custom = d.custom || null;
      if (d.templates && d.templates.length) S.templates = d.templates;
      if (d.lib) {
        S.lib = d.lib;
        if (!S.common.length) {
          var saved = null;
          try { saved = JSON.parse(localStorage.getItem('decoCommon') || 'null'); } catch (e) { /* ignore */ }
          S.common = (saved && saved.length ? saved : (d.lib.common || [])).slice();
        }
      }
      renderStats();
      renderBelongs();
      renderList();
      // 店铺导航是全局配置：拉到已发布配置后补渲染列表上方的独立卡片（含是否配过图标）
      loadTabbar(true).then(renderNavCard);
    }).catch(function (e) {
      toast('加载页面列表失败：' + e.message, 'err');
    });
  }

  function renderStats() {
    var st = S.stats || {};
    $('statTarget').innerHTML = '目标文件：<code>' + esc(st.replicaFile || '—') + '</code>';
    $('statData').textContent = '草稿 ' + (st.drafts || 0) + ' · 版本 ' + (st.versions || 0);
    $('statCustom').textContent = S.custom
      ? '自定义页 ' + S.custom.count + ' / ' + S.custom.max
      : '自定义页 —';
    // 计数不含「店铺导航」—— 它是全局配置，不是页面（否则这里永远多一个）
    $('pageCount').textContent = S.pages.filter(function (p) { return !p.nav; }).length;
  }

  function renderBelongs() {
    var sel = $('fBelongs');
    var cur = sel.value;
    var list = [];
    S.pages.forEach(function (p) {
      if (p.nav) return; // 店铺导航不是页面，不进「归属」筛选
      if (list.indexOf(p.belongs) === -1) list.push(p.belongs);
    });
    sel.innerHTML = '<option value="">全部</option>' + list.map(function (b) {
      return '<option value="' + attr(b) + '">' + esc(b) + '</option>';
    }).join('');
    sel.value = cur;
  }

  function filtered() {
    var f = S.filters;
    return S.pages.filter(function (p) {
      if (p.nav) return false; // 店铺导航走列表上方的独立卡片，不混进页面表格
      if (f.name && (p.name + p.key + p.note).toLowerCase().indexOf(f.name.toLowerCase()) === -1) return false;
      if (f.belongs && p.belongs !== f.belongs) return false;
      if (f.status === 'draft' && !p.hasDraft) return false;
      return true;
    });
  }

  /**
   * 「店铺导航」卡片（列表页顶部）。
   *
   * 对标有赞的「导航设置」：底部导航是**全局**的，混在页面列表里会让人误以为
   * 「不装修它就不生效」，所以单独拎出来一张卡 —— 显示导航项、有无未发布草稿，
   * 以及一个直达编辑器的入口。
   */
  function renderNavCard() {
    var box = $('navCard');
    if (!box) return;

    var nav = S.pages.filter(function (p) { return p.nav; })[0];
    if (!nav) { box.hidden = true; return; }
    box.hidden = false;

    var items = (S.tabbar && S.tabbar.items) || [];
    var chips = items.map(function (it) {
      return '<span class="nv-chip">' + esc(it.text || '') + '</span>';
    }).join('');

    box.innerHTML =
      '<div class="nv-main">' +
        '<div class="nv-title">店铺导航' +
          '<span class="type-tag nav">全局配置</span>' +
          (nav.hasDraft
            ? '<span class="tag warn">有未发布草稿</span>'
            : '<span class="tag ok">已发布</span>') +
        '</div>' +
        '<div class="nv-sub">' + esc(nav.desc || '') + '</div>' +
        '<div class="nv-chips">' + (chips || '<span class="dim">—</span>') + '</div>' +
      '</div>' +
      '<div class="nv-ops">' +
        '<button class="btn primary" data-open="nav" title="配置小程序底部导航栏">设置底部导航</button>' +
        '<button class="btn sm" data-vers="nav" title="历史版本与回滚">版本</button>' +
      '</div>';
  }

  /**
   * 数据来源压缩显示。
   * 后端给的是完整表达式，例如
   *   replica.HOME_BLOCKS + replica.SHOP + replica.PAGE_META
   * 直接放进 158px 的列里会被省略号截成「replica.HOME_BLOCK…」，反而看不出是哪个字段。
   * 这里压成「HOME_BLOCKS 等 3 项」，完整值放在 title 里。
   */
  function shortSource(src) {
    var parts = String(src || '').split('+').map(function (s) {
      return s.trim().replace(/^replica\./, '');
    }).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' +' + (parts.length - 1);
  }

  function renderList() {
    var rows = $('pageRows');
    var list = filtered();
    rows.innerHTML = '';
    if (!list.length) {
      rows.innerHTML = '<tr><td colspan="5" class="td-empty">没有匹配的页面' +
        (S.pages.length ? '，试试「重置」筛选条件' : '，点右上角「+ 新建页面」创建第一个自定义页') + '</td></tr>';
    }
    list.forEach(function (p) {
      var tr = el('tr');
      // 内置页对应小程序里固定页面（不可删）；自定义页由「+ 新建页面」创建，可改名 / 删除
      var typeHtml = p.custom
        ? '<span class="type-tag custom">自定义页</span>'
        : '<span class="type-tag builtin">内置页</span>';
      // 9 列压成 5 列：类型 / 归属 / 内容量并进名称单元格，
      // 草稿时间并进状态单元格 —— 否则 1440 宽度下「操作」的 6 个按钮会换行（实测需求 354px / 实际 302px）
      var subParts = [p.path, p.belongs, p.blockCount + ' 项', p.fields + ' 字段'];
      /*
       * 状态列：自定义页要区分「已写进代码包」与「只在后台」——
       * 刚新建、还没点「生成代码」的页面，小程序端其实打不开，
       * 一律标「已发布」会让运营以为线上已经有了。
       */
      var statusHtml = (p.custom && p.generated === false)
        ? '<span class="tag warn">未生成代码</span>'
        : '<span class="tag ok">' + (p.custom ? '代码已生成' : '已发布') + '</span>';
      var aliasHtml = (p.custom && (p.aliasFrom || []).length)
        ? '<div class="psub" title="改过标识：旧地址仍可访问">旧标识 ' +
          esc(p.aliasFrom.join(' / ')) + ' 仍可访问</div>'
        : '';
      tr.innerHTML =
        '<td>' +
          '<div class="pname-row">' +
            '<span class="pname" data-open="' + attr(p.key) + '">' + esc(p.name) + '</span>' + typeHtml +
          '</div>' +
          '<div class="psub" title="' + attr(subParts.join(' · ')) + '">' +
            esc(subParts.join(' · ')) + '</div>' +
        '</td>' +
        '<td>' + statusHtml + aliasHtml +
          (p.hasDraft ? '<div class="psub warn" title="草稿时间">草稿 ' + esc(p.draftAtText) + '</div>' : '') +
        '</td>' +
        '<td class="src-cell"><span class="src" title="' + attr(p.source) + '">' +
          esc(shortSource(p.source)) + '</span></td>' +
        '<td class="note-cell">' +
          (p.note ? '<span title="' + attr(p.note) + '">' + esc(p.note) + '</span>' : '<span class="dim">—</span>') +
        '</td>' +
        '<td><div class="ops">' +
          '<button class="btn sm" data-open="' + attr(p.key) + '" title="进入可视化编辑器">装修</button>' +
          '<button class="btn sm" data-diff="' + attr(p.key) + '" title="查看草稿与已发布内容的差异">查看变更</button>' +
          '<button class="btn sm" data-vers="' + attr(p.key) + '" title="历史版本与回滚">版本</button>' +
          '<button class="btn sm danger" data-discard="' + attr(p.key) + '"' + (p.hasDraft ? '' : ' disabled') +
            ' title="' + (p.hasDraft ? '恢复到已发布内容' : '当前没有草稿') + '">丢弃草稿</button>' +
          (p.custom
            ? '<button class="btn sm" data-rename="' + attr(p.key) + '" title="改名称 / 标识 / 备注">改名</button>' +
              '<button class="btn sm danger" data-del="' + attr(p.key) + '" title="删除该自定义页（不可撤销）">删除</button>'
            : '') +
        '</div></td>';
      rows.appendChild(tr);
    });

    var pagesOnly = S.pages.filter(function (p) { return !p.nav; });
    var draftCount = pagesOnly.filter(function (p) { return p.hasDraft; }).length;
    var customCount = pagesOnly.filter(function (p) { return p.custom; }).length;
    $('listFoot').innerHTML = '共 <b>' + pagesOnly.length + '</b> 个页面（内置 5 个' +
      (customCount ? ' + 自定义 <b>' + customCount + '</b> 个' : '') + '）' +
      (draftCount ? '，其中 <b>' + draftCount + '</b> 个有未发布草稿' : '') +
      '。<br><b>内置页</b>对应小程序的固定页面，不能删除；<b>自定义页</b>用右上角「+ 新建页面」创建，' +
      '发布后写入 <code>replica.CUSTOM_PAGES</code>，小程序端通过 <code>pages/custom/index?key=标识</code> 打开。' +
      '编辑只改草稿；点「生成代码」才写回 <code>miniprogram/config/replica.js</code>（生成小程序代码包里的配置文件），' +
      '生成前自动备份到 <code>server/data/decorate/backup/</code>，可随时回滚（保留最近 20 个版本）。' +
      '<br><b>注意：</b>生成代码 ≠ 线上生效 —— 还需要在微信开发者工具「上传」并在公众平台发布新版本，' +
      '已发布的小程序才会更新；本地 <code>/preview</code> 只是本机渲染效果。' +
      '<br><b>底部导航</b>是全局配置，不在上面的页面列表里 —— 点列表上方的「店铺导航」设置。';
  }

  /* =========================================================================
   * 二、编辑器
   * ========================================================================= */

  function openPage(key) {
    return api('GET', '/api/decorate/page', { query: { key: key } }).then(function (d) {
      d.key = key; // 页面键：API 响应里在 meta.key，这里平铺一层，全文件统一用 S.cur.key
      S.cur = d;
      S.sel = '__root__';
      S.dirty = false;
      S.pvBrand = 0;
      S.pvSlide = {}; // 预览翻页位置是页面级状态，切页要清掉
      showEdit();
      $('edName').textContent = d.meta.name;
      $('edPath').textContent = d.meta.path;
      $('phTitle').textContent = d.meta.name;
      applyPageChrome(d.meta);
      // 底部导航是全局配置，异步补一次（不阻塞编辑器打开）
      loadTabbar().then(function () { renderTabbar(); });
      renderLib();
      renderTree();
      renderInspector();
      renderPreview();
      renderDirty();
      var sc = document.querySelector('.col-layout .col-scroll');
      if (sc) sc.scrollTop = 0;
    }).catch(function (e) {
      toast('打开页面失败：' + e.message, 'err');
    });
  }

  /**
   * 底部导航（手机壳）渲染。
   *
   * 配置来自装修台「店铺导航」的**已发布**数据 —— 它是全局设置，不属于正在编辑的这个页面，
   * 所以编辑别的页面时这里显示的就是线上状态（与真机一致）。
   * 渲染实现与 /preview 共用 PvTabbar：各写一份必然走样，这个项目已经踩过这种坑。
   */
  function renderTabbar() {
    var meta = (S.cur && S.cur.meta) || null;
    var isCustom = !!(meta && meta.custom);
    var cfg = S.tabbar;
    var active = '';

    if (meta && meta.nav) {
      /*
       * 正在编辑「店铺导航」：用**草稿**实时预览（改一个字就能在手机壳上看到），
       * 并把「页面布局」里选中的那一项高亮出来 —— 否则看不出选中态长什么样。
       */
      cfg = (S.cur && S.cur.data) || S.tabbar;
      var m = /^items\.(\d+)$/.exec(String(S.sel || ''));
      if (m) {
        var item = ((S.cur.data || {}).items || [])[Number(m[1])];
        if (item && item.path) active = item.path;
      }
    } else if (!isCustom) {
      active = TAB_PATH[(meta && meta.key) || ''] || '';
    }

    window.PvTabbar.apply($('phTabbar'), cfg, active, isCustom);
  }

  /** 拉一次「店铺导航」的已发布配置（全局配置，缓存住；回到列表页时清缓存以便发布后刷新） */
  function loadTabbar(force) {
    if (S.tabbar && !force) return Promise.resolve(S.tabbar);
    return api('GET', '/api/decorate/page', { query: { key: 'nav' } }).then(function (d) {
      S.tabbar = d.published || null;
      return S.tabbar;
    }).catch(function () {
      return null; // 拉不到就用 PvTabbar 的兜底默认值，不阻塞编辑器
    });
  }

  /**
   * 自定义页与内置页在编辑器里的外观差异：
   * 自定义页是独立落地页，不属于 tabBar 的 5 个主页面，预览里把底部导航隐藏掉，
   * 免得运营误以为它会出现在 tabBar 上（真机上也没有）。
   */
  function applyPageChrome(meta) {
    var isCustom = !!(meta && meta.custom);
    var isNav = !!(meta && meta.nav);
    $('edPageTag').textContent = isNav ? '全局配置' : (isCustom ? '自定义页' : '内置页');
    $('edPageTag').style.color = isNav ? '#b76e00' : (isCustom ? '#155bd4' : '');
    $('phTitle').textContent = (meta && meta.name) || '首页';
    // 店铺导航没有「区块」可加，左栏组件库整栏收起（见 admin.css 的 .nav-mode）
    $('viewEdit').classList.toggle('nav-mode', isNav);
    /*
     * 固定结构页（莱克 / 资讯 / 产品 / 我的）同样收起组件库（.no-blocks）：
     * 它们的 schema 是专属字段，不是「区块流」，点任何组件都只会弹
     * 「该页面暂不支持添加组件」。之前组件库照常展示，运营实测反馈
     * 「点使用组件全部无法使用」—— 不给入口比给了再报错清晰得多。
     * （判断与 addComponent() 用同一个 findBlocksNode，口径天然一致。）
     */
    $('viewEdit').classList.toggle('no-blocks', !findBlocksNode(S.cur && S.cur.schema));
    renderTabbar();
  }

  function renderDirty() {
    var d = $('edDirty');
    d.textContent = S.dirty ? '● 有未保存的改动' : '无未保存改动';
    d.className = 'tb-dirty' + (S.dirty ? ' on' : '');
    $('btnSave').disabled = !S.dirty;
  }

  function markDirty() {
    S.dirty = true;
    renderDirty();
  }

  /* =========================================================================
   * 三、组件库（对标有赞左侧组件库：常用组件 / 基础组件 / 高级组件）
   * ========================================================================= */

  /** 当前页面可添加的组件（首页支持全部区块类型；其余页面用「添加」按钮） */
  function addableList() {
    var node = findBlocksNode(S.cur.schema);
    if (!node) return [];
    return Object.keys(node.kinds).map(function (k) { return node.kinds[k].lib; });
  }

  function findBlocksNode(schema) {
    if (!schema || !schema.fields) return null;
    var hit = null;
    (function walk(n) {
      if (hit || !n || n.type !== 'object') return;
      (n.fields || []).forEach(function (f) {
        if (f.type === 'list' && f.item && f.item.type === 'union' && f.item.kinds) hit = f.item;
        else if (f.type === 'object') walk(f);
      });
    })(schema);
    return hit;
  }

  function renderLib() {
    var lib = S.lib;
    if (!lib) return;

    /* tab */
    var tabs = $('libTabs');
    tabs.innerHTML = '';
    lib.tabs.forEach(function (t) {
      var b = el('button', 'lib-tab' + (S.libTab === t.key ? ' on' : ''), esc(t.name));
      b.onclick = function () { S.libTab = t.key; renderLib(); };
      tabs.appendChild(b);
    });

    var desc = $('libDesc');
    var meta = lib.tabs.filter(function (t) { return t.key === S.libTab; })[0] || {};
    var items = [];

    if (S.libTab === 'common') {
      desc.textContent = meta.desc || '';
      S.common.forEach(function (k) {
        var kk = (lib.kinds || []).filter(function (x) { return x.kind === k; })[0];
        if (kk) items.push(Object.assign({}, kk, { on: true }));
      });
      if (!items.length) desc.textContent = '还没有常用组件，点下方「添加常用组件」挑选。';
    } else {
      var src = lib[S.libTab] || [];
      desc.textContent = (meta.desc || '') + '（共 ' + src.length + ' 个，高亮为本后台已接入、可直接添加）';
      var useGroups = S.libTab === 'basic' && (lib.groups || []).length;
      var pushOne = function (x) {
        var kind = x.kind ? (lib.kinds || []).filter(function (y) { return y.kind === x.kind; })[0] : null;
        // 只有「声明了 ok 且 schema 里真有这个 kind」才算已接入，二者缺一不可
        var on = !!x.ok && !!kind;
        items.push({
          kind: x.kind,
          label: x.n,
          icon: kind ? kind.icon : lib.icons.image_ad,
          desc: kind ? kind.desc : '需在小程序端开发对应组件后接入',
          why: on ? '' : (x.why || '需在小程序端开发对应组件后接入'),
          on: on
        });
      };
      if (useGroups) {
        // 有赞左侧「基础组件」实测分 10 组，这里按真实分组渲染，方便逐个对账
        (lib.groups || []).forEach(function (g) {
          items.push({ __group: g.name, __count: (g.items || []).length });
          (g.items || []).forEach(pushOne);
        });
      } else {
        src.forEach(pushOne);
      }
    }

    var grid = $('libGrid');
    grid.innerHTML = '';
    items.forEach(function (it) {
      if (it.__group) {
        // 分组标题（整行占满），不是可点击项
        var h = el('div', 'lib-group');
        h.innerHTML = '<span>' + esc(it.__group) + '</span><i>' + it.__count + '</i>';
        grid.appendChild(h);
        return;
      }
      var b = el('button', 'lib-item' + (it.on ? '' : ' off'));
      b.innerHTML = (it.icon || '') + '<span class="lib-name">' + esc(it.label) + '</span>' +
        (it.on ? '' : '<span class="lib-flag">未接入</span>');
      b.title = (it.on ? '点击添加到「页面区块」末尾' : '未接入：') + (it.why || it.desc || '');
      if (it.on) b.onclick = function () { addComponent(it.kind); };
      else b.onclick = function () { toast(it.label + '：' + (it.why || it.desc || '暂未接入'), 'err'); };
      grid.appendChild(b);
    });
  }

  /** 点击组件库 → 添加到页面的区块列表末尾 */
  function addComponent(kind) {
    var node = findBlocksNode(S.cur.schema);
    if (!node) { toast('该页面暂不支持添加组件', 'err'); return; }
    var list = collectLists(S.cur.schema, S.cur.data, '').filter(function (L) { return L.item === node; })[0];
    if (!list) { toast('未找到可添加的区块列表', 'err'); return; }
    addItem(list.path, node, kind);
  }

  /* ----------------------------- 页面布局（组件大纲） ----------------------------- */

  /** 由 schema + 数据生成树节点（只保留 list / object 结构；type=group 是 UI 分组，不产生节点） */
  function nodesOf(node, data, path) {
    var out = [];
    if (!node) return out;

    if (node.type === 'object') {
      (node.fields || []).forEach(function (f) {
        if (f.type === 'group') return;   // UI 分组，不占数据层级
        if (f.k === 'meta') return;       // 页面设置已由面板底部入口承载，不重复出现在区块树里
        var p = path ? path + '.' + f.k : f.k;
        var dv = data ? data[f.k] : undefined;
        if (f.type === 'list') {
          out = out.concat(nodesOf(f, dv, p));
        } else if (f.type === 'object') {
          out.push({ path: p, label: f.label, kind: '分组', shared: !!f.shared, children: nodesOf(f, dv, p) });
        }
      });
      return out;
    }

    if (node.type === 'list') {
      var item = node.item;
      if (!item) return out;
      var arr = Array.isArray(data) ? data : [];
      var titles = (S.cur.titles && S.cur.titles[path]) || [];
      arr.forEach(function (v, i) {
        var p = path + '.' + i;
        var kindLabel = '';
        if (item.type === 'union') {
          var k = item.kinds[v[item.kindField]];
          kindLabel = k ? k.label : '未知';
        } else if (item.type === 'object') {
          kindLabel = '条目';
        } else {
          kindLabel = '图片';
        }
        var n = {
          path: p, label: titles[i] || ('第 ' + (i + 1) + ' 项'), kind: kindLabel,
          children: [], listPath: path, index: i, locked: !!(item.locked)
        };
        if (item.type === 'object') {
          (item.fields || []).forEach(function (f) {
            if (f.type === 'list' || f.type === 'object') {
              n.children = n.children.concat(nodesOf(f, v ? v[f.k] : undefined, p + '.' + f.k));
            }
          });
        } else if (item.type === 'union') {
          var kk = item.kinds[v[item.kindField]];
          if (kk) {
            (kk.fields || []).forEach(function (f) {
              if (f.type === 'group') return;
              if (f.type === 'list' || f.type === 'object') {
                n.children = n.children.concat(nodesOf(f, v ? v[f.k] : undefined, p + '.' + f.k));
              }
            });
          }
        }
        out.push(n);
      });
      return out;
    }
    return out;
  }

  function renderTree() {
    var host = $('tree');
    host.innerHTML = '';
    if (!S.cur) return;

    var nodes = nodesOf(S.cur.schema, S.cur.data, '');
    var total = countNodes(nodes);
    $('treeCount').textContent = total + ' 项';

    nodes.forEach(function (n, i) { host.appendChild(renderNode(n, !!n.locked)); });

    renderTreeAdd();
  }

  function countNodes(list) {
    var n = 0;
    (list || []).forEach(function (x) { n += 1 + countNodes(x.children); });
    return n;
  }

  function renderNode(n, lockFirst) {
    var box = el('div');
    var row = el('div', 'tnode' + (S.sel === n.path ? ' active' : ''));
    row.setAttribute('data-path', n.path);
    row.setAttribute('data-list', n.listPath || '');
    row.setAttribute('data-index', n.index == null ? '' : n.index);
    if (n.listPath != null) {
      row.setAttribute('draggable', 'true');
    }
    var seq = (n.index != null) ? String(n.index + 1) : '·';
    row.innerHTML =
      (n.index != null ? '<span class="drag" title="拖拽排序"></span>' : '') +
      '<span class="idx">' + seq + '</span>' +
      (lockFirst ? '<span class="lock" title="页面级组件，锁定">🔒</span>' : '') +
      '<span class="txt">' + esc(n.label) + '</span>' +
      (n.kind ? '<span class="kind">' + esc(n.kind) + '</span>' : '') +
      '<span class="acts">' +
        (n.listPath != null ? '<button class="iconbtn" data-mv="-1" title="上移">↑</button>' +
        '<button class="iconbtn" data-mv="1" title="下移">↓</button>' +
        '<button class="iconbtn" data-dup="1" title="复制">⧉</button>' +
        '<button class="iconbtn danger" data-rm="1" title="删除">✕</button>' : '') +
      '</span>';
    row.onclick = function (e) {
      if (e.target.closest('[data-mv],[data-dup],[data-rm]')) return;
      select(n.path);
    };
    var mvUp = row.querySelector('[data-mv="-1"]');
    var mvDn = row.querySelector('[data-mv="1"]');
    var dup = row.querySelector('[data-dup]');
    var rm = row.querySelector('[data-rm]');
    if (mvUp) mvUp.onclick = function (e) { e.stopPropagation(); moveItem(n.listPath, n.index, -1); };
    if (mvDn) mvDn.onclick = function (e) { e.stopPropagation(); moveItem(n.listPath, n.index, 1); };
    if (dup) dup.onclick = function (e) { e.stopPropagation(); dupItem(n.listPath, n.index); };
    if (rm) rm.onclick = function (e) { e.stopPropagation(); removeItem(n.listPath, n.index); };

    /* 拖拽排序 */
    if (n.listPath != null) {
      row.addEventListener('dragstart', function (e) {
        S.drag = { listPath: n.listPath, index: n.index };
        row.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', n.path); } catch (err) { /* ignore */ }
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('dragging');
        S.drag = null;
        [].forEach.call(document.querySelectorAll('.tnode'), function (x) {
          x.classList.remove('drop-before', 'drop-after');
        });
      });
      row.addEventListener('dragover', function (e) {
        if (!S.drag || S.drag.listPath !== n.listPath) return;
        e.preventDefault();
        var r = row.getBoundingClientRect();
        var after = (e.clientY - r.top) > r.height / 2;
        row.classList.toggle('drop-before', !after);
        row.classList.toggle('drop-after', after);
      });
      row.addEventListener('dragleave', function () {
        row.classList.remove('drop-before', 'drop-after');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!S.drag || S.drag.listPath !== n.listPath) return;
        var r = row.getBoundingClientRect();
        var after = (e.clientY - r.top) > r.height / 2;
        var to = n.index + (after ? 1 : 0);
        if (to > S.drag.index) to -= 1;
        moveItemTo(n.listPath, S.drag.index, to);
      });
    }

    box.appendChild(row);
    if (n.children && n.children.length) {
      var sub = el('div', 'tsub');
      n.children.forEach(function (c) { sub.appendChild(renderNode(c, false)); });
      box.appendChild(sub);
    }
    return box;
  }

  /** 左栏底部「添加」区：为该页面所有可增列表提供添加入口 */
  function renderTreeAdd() {
    var host = $('treeAddWrap');
    host.innerHTML = '';
    var lists = collectLists(S.cur.schema, S.cur.data, '');
    if (!lists.length) return;
    host.appendChild(el('div', 'tgroup', '添加内容'));
    lists.forEach(function (L) {
      var b = el('button', 'btn sm', '+ ' + esc(L.label));
      b.onclick = function () { addItem(L.path, L.item); };
      host.appendChild(b);
    });
  }

  /** 收集页面上所有 list 字段（供添加入口） */
  function collectLists(node, data, path) {
    var out = [];
    if (!node) return out;
    if (node.type === 'object') {
      (node.fields || []).forEach(function (f) {
        if (f.type === 'group') { out = out.concat(collectLists({ type: 'object', fields: f.fields }, data, path)); return; }
        out = out.concat(collectLists(f, data ? data[f.k] : undefined, path ? path + '.' + f.k : f.k));
      });
      return out;
    }
    if (node.type === 'list') {
      out.push({ path: path, label: node.label || path, item: node.item });
      return out;
    }
    return out;
  }

  /* ----------------------------- 定位 ----------------------------- */

  /** 按 path 找到 schema 节点与数据 */
  function locate(path) {
    var node = S.cur.schema;
    var data = S.cur.data;
    if (path === '__root__') return { node: node, data: data, root: true };
    var segs = String(path).split('.');
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (isNum(s)) {
        if (node.type === 'list') { node = node.item; data = data ? data[Number(s)] : undefined; }
        continue;
      }
      if (node.type === 'object') {
        var f = findField(node, s);
        if (!f) return { node: null, data: null };
        node = f; data = data ? data[s] : undefined;
      } else if (node.type === 'union') {
        var kind = node.kinds[data ? data[node.kindField] : ''] || null;
        if (!kind) return { node: null, data: null };
        var f2 = (kind.fields || []).filter(function (x) { return x.k === s; })[0];
        if (!f2) return { node: null, data: null };
        node = f2; data = data ? data[s] : undefined;
      } else if (node.type === 'list') {
        var f3 = (node.item.fields || []).filter(function (x) { return x.k === s; })[0];
        if (!f3) return { node: null, data: null };
        node = f3; data = data ? data[s] : undefined;
      } else {
        return { node: null, data: null };
      }
    }
    return { node: node, data: data };
  }

  /** 在 object 节点里找字段（穿透 UI 分组） */
  function findField(node, key) {
    var hit = null;
    (node.fields || []).forEach(function (f) {
      if (hit) return;
      if (f.type === 'group') {
        var sub = (f.fields || []).filter(function (x) { return x.k === key; })[0];
        if (sub) hit = sub;
      } else if (f.k === key) hit = f;
    });
    return hit;
  }

  function select(path) {
    S.sel = path;
    renderTree();
    renderInspector();
    renderPreview();  // 内部会一并刷新底部导航（选中哪一项就高亮哪一项）
    if ($('autoScroll').checked) scrollToSel();
  }

  function scrollToSel() {
    var target = $('preview').querySelector('[data-path="' + S.sel + '"]');
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* =========================================================================
   * 四、属性面板（对标有赞右侧属性面板）
   * ========================================================================= */

  function renderInspector() {
    var host = $('inspector');
    host.innerHTML = '';
    if (!S.cur) return;
    $('inspectorPath').textContent = S.sel === '__root__' ? '页面设置' : S.sel;

    var loc = locate(S.sel);
    if (!loc.node) {
      host.appendChild(el('div', 'insp-empty', '该节点不存在（可能已被删除）'));
      return;
    }

    /* 组件标题区（名称 + 说明 + 提示条） */
    var titleName = '';
    var titleDesc = '';
    var tip = '';
    var fields = [];
    var lists = [];

    if (loc.root) {
      // 店铺导航没有「页面设置」的概念，标题与提示都换成导航自己的说法
      var isNavRoot = !!(S.cur.meta && S.cur.meta.nav);
      titleName = (isNavRoot ? '' : '页面设置 · ') + S.cur.meta.name;
      titleDesc = S.cur.meta.desc || '';
      tip = isNavRoot
        ? '底部导航是小程序的全局配置：这里的改动「生成代码」后写回 replica.js，5 个内置页面的底部导航会同时更新；已发布的小程序需再上传发布新版本。'
        : '页面级设置作用于整页；页面内的区块请在左侧「页面布局」中增删排序。';
      splitFields(S.cur.schema.fields, fields, lists);
    } else if (loc.node.type === 'union') {
      var kind = loc.node.kinds[loc.data ? loc.data[loc.node.kindField] : ''] || null;
      if (!kind) { host.appendChild(el('div', 'insp-empty', '未知区块类型')); return; }
      titleName = kind.label;
      titleDesc = kind.desc || '';
      tip = kind.tip || '';
      splitFields(kind.fields, fields, lists);
    } else if (loc.node.type === 'object') {
      titleName = loc.node.label || '属性';
      titleDesc = loc.node.hint || '';
      splitFields(loc.node.fields, fields, lists);
    } else {
      host.appendChild(el('div', 'insp-empty', '该节点没有可编辑属性'));
      return;
    }

    host.appendChild(componentTitle(titleName, titleDesc, tip));

    /* 模板选择器（展示形态） */
    var tplField = fields.filter(function (f) { return f.type === 'template'; })[0];
    if (tplField) {
      host.appendChild(templatePicker(tplField, loc.data, joinPath(S.sel, tplField.k)));
    }

    /* 普通字段（跳过 template，已单独渲染） */
    var rows = fields.filter(function (f) { return f.type !== 'template'; });
    var groups = {};   // 分组名 → 字段
    var order = [];
    rows.forEach(function (f) {
      if (f.type === 'group') {
        if (!groups[f.label]) { groups[f.label] = []; order.push(f.label); }
        (f.fields || []).forEach(function (sub) { groups[f.label].push(sub); });
        return;
      }
      if (f.group) {
        if (!groups[f.group]) { groups[f.group] = []; order.push(f.group); }
        groups[f.group].push(f);
        return;
      }
      host.appendChild(fieldNode(f, loc.data, joinPath(S.sel, f.k)));
    });
    order.forEach(function (g) {
      host.appendChild(groupBlock(g, groups[g], loc.data, S.sel));
    });

    /* 列表字段 */
    lists.forEach(function (f) { host.appendChild(listManager(f, loc.data, joinPath(S.sel, f.k))); });
  }

  /**
   * 把 fields 拆成「普通字段」与「列表字段」。
   * UI 分组（type=group）保留为分组节点（渲染成可折叠面板），
   * 但分组内部的列表字段会被提到外层单独渲染。
   */
  function splitFields(fields, outF, outL) {
    (fields || []).forEach(function (f) {
      if (f.type === 'group') {
        var inner = [];
        (f.fields || []).forEach(function (sub) {
          if (sub.type === 'list') outL.push(sub);
          else inner.push(sub);
        });
        outF.push({ type: 'group', label: f.label, fields: inner });
        return;
      }
      if (f.type === 'list') outL.push(f);
      else outF.push(f);
    });
  }

  function joinPath(base, k) {
    if (base === '__root__') return k;
    return base + '.' + k;
  }

  function componentTitle(name, desc, tip) {
    var box = el('div', 'component-title');
    var loc0 = S.sel === '__root__' ? '' : S.sel;
    box.innerHTML =
      '<div class="ct-head"><span class="nm">' + esc(name) + '</span>' +
      (loc0 ? '<a class="doc" href="#" data-doc="1">查看教程</a>' : '') +
      '</div>' +
      (desc ? '<div class="hint" style="margin-top:6px">' + esc(desc) + '</div>' : '') +
      (tip ? '<div class="ct-msg">💡 ' + esc(tip) + '</div>' : '');
    var doc = box.querySelector('[data-doc]');
    if (doc) {
      doc.onclick = function (e) {
        e.preventDefault();
        modal('字段说明 · ' + name,
          '<div style="line-height:1.9;font-size:13px">' +
          '<div><b>组件名称：</b>' + esc(name) + '</div>' +
          (desc ? '<div><b>组件说明：</b>' + esc(desc) + '</div>' : '') +
          (tip ? '<div style="margin-top:8px" class="tip">💡 ' + esc(tip) + '</div>' : '') +
          '<div style="margin-top:10px" class="hint">字段定义来自 <code>server/decorate/schema.js</code>，' +
          '改完保存草稿 → 点「生成代码」即写回 <code>miniprogram/config/replica.js</code>' +
          '（之后仍需上传并发布小程序新版本，真机才会更新）。</div>' +
          '</div>', [btnClose()]);
      };
    }
    return box;
  }

  /** 展示形态选择器（带缩略图，对标有赞 select-template） */
  function templatePicker(f, parentData, fullPath) {
    var cur = parentData ? parentData[f.k] : undefined;
    var box = el('div', 'grp open');
    box.appendChild(el('div', 'grp-head', '<span class="arw"></span>' + esc(f.label) + '<span class="gk">' + (f.options || []).length + ' 种形态</span>'));
    var body = el('div', 'grp-body');
    var row = el('div', 'tpl-row');
    (f.options || []).forEach(function (o) {
      var on = (cur == null ? f.def : cur) === o.value;
      var b = el('button', 'tpl-item' + (on ? ' on' : ''));
      b.innerHTML = tplIcon(o.value) + '<span>' + esc(o.label) + '</span>';
      b.onclick = function () { write(fullPath, o.value); renderInspector(); };
      row.appendChild(b);
    });
    body.appendChild(row);
    if (f.hint) body.appendChild(el('div', 'hint', esc(f.hint)));
    box.appendChild(body);
    return box;
  }

  function tplIcon(v) {
    var s = '<svg viewBox="0 0 44 28" fill="none" stroke="currentColor" stroke-width="1.4">';
    if (v === 'single') return s + '<rect x="3" y="5" width="38" height="18" rx="2"/><path d="M3 19l8-6 6 4 5-3 9 5" stroke-opacity=".5"/></svg>';
    if (v === 'scroll') return s + '<rect x="3" y="6" width="20" height="16" rx="2"/><rect x="26" y="6" width="14" height="16" rx="2" stroke-opacity=".45"/></svg>';
    if (v === 'double') return s + '<rect x="3" y="4" width="38" height="13" rx="2"/><rect x="3" y="20" width="11" height="5" rx="1.5" stroke-opacity=".45"/><rect x="16" y="20" width="11" height="5" rx="1.5" stroke-opacity=".45"/></svg>';
    return s + '<rect x="3" y="5" width="38" height="18" rx="2"/><circle cx="15" cy="25" r="1.2" fill="currentColor"/><circle cx="22" cy="25" r="1.2" fill="currentColor"/><circle cx="29" cy="25" r="1.2" fill="currentColor"/></svg>';
  }

  /** 可折叠分组 */
  function groupBlock(label, fields, parentData, basePath) {
    var box = el('div', 'grp');
    var head = el('div', 'grp-head', '<span class="arw"></span>' + esc(label) + '<span class="gk">' + fields.length + ' 项</span>');
    var body = el('div', 'grp-body');
    fields.forEach(function (f) { body.appendChild(fieldNode(f, parentData, joinPath(basePath, f.k))); });
    head.onclick = function () { box.classList.toggle('open'); };
    box.appendChild(head);
    box.appendChild(body);
    return box;
  }

  /** 单个字段（对标有赞属性面板的控件体系） */
  function fieldNode(f, parentData, fullPath) {
    var wrap = el('div', 'fld');
    var val = parentData ? parentData[f.k] : undefined;
    if (val === undefined && f.def !== undefined) val = f.def;

    if (f.type === 'object') {
      var fs = el('div', 'grp open');
      fs.appendChild(el('div', 'grp-head',
        '<span class="arw"></span>' + esc(f.label) +
        (f.shared ? ' <span class="tag warn">全局共用</span>' : '') +
        '<span class="gk">分组</span>'));
      var fb = el('div', 'grp-body');
      if (f.hint) fb.appendChild(el('div', 'hint', esc(f.hint)));
      (f.fields || []).forEach(function (sub) { fb.appendChild(fieldNode(sub, val, fullPath + '.' + sub.k)); });
      fs.appendChild(fb);
      return fs;
    }

    wrap.appendChild(el('label', null, esc(f.label) + (f.required ? '<span class="req">*</span>' : '')));

    var input;

    if (f.type === 'textarea') {
      input = el('textarea');
      input.value = val == null ? '' : String(val);
      input.oninput = function () { write(fullPath, input.value); };

    } else if (f.type === 'number') {
      input = document.createElement('input');
      input.type = 'number';
      if (f.min != null) input.min = f.min;
      if (f.max != null) input.max = f.max;
      if (f.step != null) input.step = f.step;
      input.value = val == null ? '' : val;
      input.oninput = function () {
        var n = Number(input.value);
        if (isNaN(n)) return;
        if (f.min != null && n < f.min) n = f.min;
        if (f.max != null && n > f.max) n = f.max;
        write(fullPath, n);
      };

    } else if (f.type === 'select') {
      input = document.createElement('select');
      (f.options || []).forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.value !== undefined ? o.value : o;
        op.textContent = o.label !== undefined ? o.label : o;
        input.appendChild(op);
      });
      input.value = val == null ? '' : String(val);
      input.onchange = function () { write(fullPath, input.value); };

    } else if (f.type === 'radiobutton') {
      var rb = el('div', 'rbg');
      (f.options || []).forEach(function (o) {
        var b = el('button', (val == null ? f.def : val) === o.value ? 'on' : '', esc(o.label));
        b.onclick = function () { write(fullPath, o.value); renderInspector(); };
        rb.appendChild(b);
      });
      wrap.appendChild(rb);
      if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
      return wrap;

    } else if (f.type === 'switch') {
      var on = (val == null ? !!f.def : !!val);
      var sw = el('div', 'sw');
      sw.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '><span class="track"></span>' +
        '<span class="txt">' + (on ? '已开启' : '已关闭') + '</span>';
      var cb = sw.querySelector('input');
      var track = sw.querySelector('.track');
      var txt = sw.querySelector('.txt');
      track.onclick = function () {
        cb.checked = !cb.checked;
        txt.textContent = cb.checked ? '已开启' : '已关闭';
        write(fullPath, cb.checked);
      };
      wrap.appendChild(sw);
      return wrap;

    } else if (f.type === 'slider') {
      var cur = val == null ? (f.def || f.min || 0) : Number(val);
      var sl = el('div', 'slider');
      sl.innerHTML = '<input type="range" min="' + (f.min != null ? f.min : 0) + '" max="' + (f.max != null ? f.max : 100) +
        '" step="' + (f.step || 1) + '" value="' + cur + '"><span class="val">' + cur + (f.unit || '') + '</span>';
      var rg = sl.querySelector('input');
      var vv = sl.querySelector('.val');
      rg.oninput = function () {
        var n = Number(rg.value);
        vv.textContent = n + (f.unit || '');
        write(fullPath, n);
      };
      wrap.appendChild(sl);
      if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
      return wrap;

    } else if (f.type === 'color') {
      var cval = val == null ? (f.def || '') : String(val);
      var cf = el('div', 'colorf');
      cf.innerHTML =
        '<span class="chip"><i style="background:' + attr(cval || 'transparent') + '"></i>' +
        '<input type="color" value="' + attr(cval || '#ffffff') + '"></span>' +
        '<input type="text" value="' + attr(cval) + '" placeholder="#FFFFFF 或留空">' +
        '<button class="rst">重置</button>';
      var picker = cf.querySelector('input[type=color]');
      var chipI = cf.querySelector('.chip i');
      var hex = cf.querySelector('input[type=text]');
      picker.oninput = function () {
        chipI.style.background = picker.value;
        hex.value = picker.value.toUpperCase();
        write(fullPath, picker.value.toUpperCase());
      };
      hex.oninput = function () {
        chipI.style.background = hex.value || 'transparent';
        write(fullPath, hex.value);
      };
      cf.querySelector('.rst').onclick = function () {
        var d = f.def || '';
        hex.value = d;
        chipI.style.background = d || 'transparent';
        write(fullPath, d);
      };
      wrap.appendChild(cf);
      if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
      return wrap;

    } else if (f.type === 'readonly') {
      wrap.appendChild(el('div', 'ro', esc(val == null || val === '' ? '（空）' : String(val))));
      if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
      return wrap;

    } else if (f.type === 'link') {
      input = el('div', 'lkf');
      var shown = val == null ? '' : String(val);
      input.innerHTML =
        '<div class="lk-row">' +
        '<span class="lk-ico">🔗</span>' +
        (shown
          ? '<span class="lk-name">' + esc(linkLabel(shown)) + '</span><code class="lk-path">' + esc(shown) + '</code>'
          : '<span class="lk-none">未设置跳转</span>') +
        '</div>' +
        '<input type="text" value="' + attr(shown) + '" placeholder="留空不跳转，也可直接粘路径">' +
        '<div class="lk-acts">' +
        '<button class="btn sm primary">选择链接</button>' +
        '<button class="btn sm ghost">清空</button>' +
        '</div>';
      var lkInp = input.querySelector('input[type=text]');
      lkInp.oninput = function () { write(fullPath, lkInp.value, true); };
      lkInp.onchange = function () { renderInspector(); };
      input.querySelector('.lk-acts .primary').onclick = function () {
        linkPicker({
          value: shown,
          title: (!f.label || f.label === '跳转链接') ? '选择链接' : ('选择链接 · ' + f.label),
          hint: '选好后真机上点这个元素就会跳到对应页面。选「商品」可直接挂到某个商品的详情页。',
          onPick: function (p) {
            write(fullPath, p);
            renderInspector();
            renderPreview();
            toast('跳转已设为：' + linkLabel(p));
          }
        });
      };
      input.querySelector('.lk-acts .ghost').onclick = function () {
        write(fullPath, '');
        renderInspector();
        renderPreview();
      };
      wrap.appendChild(input);
      if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
      return wrap;

    } else if (f.type === 'image') {
      var box = el('div', 'imgf');
      var thumb = el('div', 'thumb');
      thumb.innerHTML = val ? '<img src="' + attr(val) + '" alt=""><span class="zoom">点击放大</span>' : '<span class="no">无图</span>';
      thumb.onclick = function () { if (val) previewImage(val); };
      // 直接把本地图片拖到缩略图上即可上传替换
      thumb.ondragover = function (e) { e.preventDefault(); thumb.classList.add('over'); };
      thumb.ondragleave = function () { thumb.classList.remove('over'); };
      thumb.ondrop = function (e) {
        e.preventDefault();
        thumb.classList.remove('over');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        thumb.classList.add('busy');
        uploadFiles(files).then(function (d) {
          thumb.classList.remove('busy');
          var one = (d.list || [])[0];
          if (!one) { toast('上传失败', 'err'); return; }
          write(fullPath, one.url);
          renderInspector();
          toast('已上传并替换：' + one.orig + '（' + one.sizeText + '），记得保存草稿');
        }).catch(function (err) {
          thumb.classList.remove('busy');
          toast('上传失败：' + err.message, 'err');
        });
      };
      var mid = el('div', 'mid');
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = val || '';
      inp.placeholder = '图片地址（/uploads/… 或 https://…）';
      inp.oninput = function () { write(fullPath, inp.value, true); };
      inp.onchange = function () { renderInspector(); };
      mid.appendChild(inp);
      var btns = el('div', 'btns');
      var bPick = el('button', 'btn sm primary', '选择图片');
      bPick.onclick = function () {
        pickImage({
          value: val,
          title: '选择图片',
          hint: '可以从本地上传、从素材库挑，也可以直接粘外链地址。上传的图片会存到后端素材库，可重复使用。',
          onPick: function (urls) {
            write(fullPath, urls[0]);
            renderInspector();
            toast('图片已更新，记得保存草稿');
          }
        });
      };
      var bClear = el('button', 'btn sm ghost', '清空');
      bClear.onclick = function () { write(fullPath, ''); renderInspector(); };
      btns.appendChild(bPick);
      btns.appendChild(bClear);
      mid.appendChild(btns);
      box.appendChild(thumb);
      box.appendChild(mid);
      wrap.appendChild(box);
      if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
      return wrap;

    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = val == null ? '' : String(val);
      input.oninput = function () { write(fullPath, input.value); };
    }

    wrap.appendChild(input);
    if (f.hint) wrap.appendChild(el('div', 'hint', esc(f.hint)));
    return wrap;
  }

  /** 列表管理区：图片列表 或 对象列表（卡片式，对标有赞 deco-editor-card） */
  function listManager(f, parentData, fullPath) {
    var box = el('div', 'grp open');
    var arr = (parentData && Array.isArray(parentData[f.k])) ? parentData[f.k] : [];
    var head = el('div', 'grp-head',
      '<span class="arw"></span>' + esc(f.label || f.k) +
      '<span class="gk">' + arr.length + (f.max ? ' / ' + f.max : '') + ' 项</span>');
    var body = el('div', 'grp-body');
    head.onclick = function () { box.classList.toggle('open'); };

    if (f.hint) body.appendChild(el('div', 'hint', esc(f.hint)));

    var bar = el('div', 'ins-list-head');
    bar.innerHTML = '<span class="cnt">' + arr.length + ' 项' + (f.max ? '（上限 ' + f.max + '）' : '') + '</span>';
    // 图片型列表有两代结构：老的是「地址字符串数组」，新的是 [{ image, link }]
    var strImg = f.item.type === 'image';
    var objImg = f.item.type === 'object' && f.imageList === true;
    // 声明了 quickAdd 的列表：主按钮换成「关联商品分组」，另给一个手工入口
    var quick = f.quickAdd || '';
    var addBtn = el('button', 'btn sm', quick === 'goods' ? '+ 关联商品分组' : '+ 新增');
    addBtn.onclick = function () {
      if (f.max && arr.length >= f.max) { toast('最多 ' + f.max + ' 项', 'err'); return; }
      if (quick) { pickGoodsInto(fullPath, f); return; }
      if (strImg || objImg) {
        // 图片列表：走统一的选择器，可一次从本地上传 / 素材库里挑多张
        pickImage({
          multiple: true,
          max: f.max ? f.max - arr.length : 0,
          title: '添加图片 · ' + (f.label || f.k),
          hint: '可多选。' + (f.max ? '本列表上限 ' + f.max + ' 张，还能加 ' + (f.max - arr.length) + ' 张。' : '') +
            (objImg ? '每张添加后都能单独设置跳转目标。' : ''),
          onPick: function (urls) {
            var cur = getPath(S.cur.data, fullPath);
            urls.forEach(function (u) { cur.push(objImg ? { image: u, link: '' } : u); });
            afterListChange(fullPath, cur.length - 1);
            toast('已添加 ' + urls.length + ' 张，记得保存草稿');
          }
        });
        return;
      }
      addItem(fullPath, f.item);
    };
    bar.appendChild(addBtn);
    if (quick) {
      var manualBtn = el('button', 'btn sm ghost', '+ 自定义图文分组');
      manualBtn.title = '手工加一条，图片 / 标题 / 跳转自己填';
      manualBtn.onclick = function () {
        if (f.max && arr.length >= f.max) { toast('最多 ' + f.max + ' 项', 'err'); return; }
        addItem(fullPath, f.item);
      };
      bar.appendChild(manualBtn);
    }
    body.appendChild(bar);

    /* 图片 + 跳转：每项既是图片又能单独设跳转（图片广告的轮播图就是这种） */
    if (objImg) {
      arr.forEach(function (v, i) {
        var u = v && v.image ? v.image : '';
        var lk = (v && v.link) || '';
        var item = el('div', 'ins-item ins-img' + (S.sel === fullPath + '.' + i ? ' active' : ''));
        item.innerHTML = (u ? '<img src="' + attr(u) + '" alt="">' : '<span class="lk-ph">无图</span>') +
          '<div class="t">第 ' + (i + 1) + ' 张<small>' +
          (lk ? '🔗 ' + esc(linkLabel(lk)) : '未设置跳转') + '</small></div>' +
          '<div class="ops">' +
          '<button class="iconbtn ' + (lk ? 'has-link' : '') + '" data-lk="1" title="' +
          (lk ? '跳转：' + attr(linkLabel(lk)) : '设置跳转目标') + '">🔗</button>' +
          '<button class="iconbtn" data-rp="1" title="替换图片">⟳</button>' +
          '<button class="iconbtn" data-mv="-1" title="上移">↑</button>' +
          '<button class="iconbtn" data-mv="1" title="下移">↓</button>' +
          '<button class="iconbtn danger" data-rm="1" title="删除">✕</button></div>';
        item.querySelector('[data-lk]').onclick = function (e) {
          e.stopPropagation();
          linkPicker({
            value: lk,
            title: '第 ' + (i + 1) + ' 张图的跳转',
            onPick: function (p) {
              setPath(S.cur.data, fullPath + '.' + i + '.link', p);
              markDirty();
              renderInspector();
              renderPreview();
              toast('第 ' + (i + 1) + ' 张 跳转已设为：' + linkLabel(p));
            }
          });
        };
        item.querySelector('[data-rp]').onclick = function (e) {
          e.stopPropagation();
          pickImage({
            value: u,
            title: '替换第 ' + (i + 1) + ' 张图片',
            onPick: function (urls) {
              setPath(S.cur.data, fullPath + '.' + i + '.image', urls[0]);
              markDirty();
              renderInspector();
              renderPreview();
              toast('已替换，记得保存草稿');
            }
          });
        };
        item.querySelector('[data-mv="-1"]').onclick = function (e) { e.stopPropagation(); moveItem(fullPath, i, -1); };
        item.querySelector('[data-mv="1"]').onclick = function (e) { e.stopPropagation(); moveItem(fullPath, i, 1); };
        item.querySelector('[data-rm]').onclick = function (e) { e.stopPropagation(); removeItem(fullPath, i); };
        if (u) item.querySelector('img').onclick = function () { previewImage(u); };
        item.onclick = function () { select(fullPath + '.' + i); };
        body.appendChild(item);
      });
      if (!arr.length) body.appendChild(el('div', 'ins-empty', '还没有图片，点「+ 新增」从本地上传或素材库里选'));
      box.appendChild(head);
      box.appendChild(body);
      return box;
    }

    if (strImg) {
      arr.forEach(function (u, i) {
        var item = el('div', 'ins-item' + (S.sel === fullPath + '.' + i ? ' active' : ''));
        item.innerHTML = '<img src="' + attr(u) + '" alt="">' +
          '<div class="t">第 ' + (i + 1) + ' 张<small>' + esc(String(u).split('/').pop().slice(0, 30)) + '</small></div>' +
          '<div class="ops">' +
          '<button class="iconbtn" data-rp="1" title="替换图片">⟳</button>' +
          '<button class="iconbtn" data-mv="-1" title="上移">↑</button>' +
          '<button class="iconbtn" data-mv="1" title="下移">↓</button>' +
          '<button class="iconbtn danger" data-rm="1" title="删除">✕</button></div>';
        item.querySelector('[data-rp]').onclick = function (e) {
          e.stopPropagation();
          pickImage({
            value: u,
            title: '替换第 ' + (i + 1) + ' 张图片',
            onPick: function (urls) {
              setPath(S.cur.data, fullPath + '.' + i, urls[0]);
              markDirty();
              renderInspector();
              renderPreview();
              toast('已替换，记得保存草稿');
            }
          });
        };
        item.querySelector('[data-mv="-1"]').onclick = function (e) { e.stopPropagation(); moveItem(fullPath, i, -1); };
        item.querySelector('[data-mv="1"]').onclick = function (e) { e.stopPropagation(); moveItem(fullPath, i, 1); };
        item.querySelector('[data-rm]').onclick = function (e) { e.stopPropagation(); removeItem(fullPath, i); };
        item.querySelector('img').onclick = function () { previewImage(u); };
        body.appendChild(item);
      });
      if (!arr.length) body.appendChild(el('div', 'ins-empty', '还没有图片，点「+ 新增」从本地上传或素材库里选'));
      box.appendChild(head);
      box.appendChild(body);
      return box;
    }

    var titles = (S.cur.titles && S.cur.titles[fullPath]) || [];
    arr.forEach(function (v, i) {
      var p = fullPath + '.' + i;
      var item = el('div', 'ins-item' + (S.sel === p ? ' active' : ''));
      var thumbSrc = thumbOf(f.item, v);
      var kindLabel = f.item.type === 'union'
        ? ((f.item.kinds[v[f.item.kindField]] || {}).label || '未知')
        : '';
      item.innerHTML = (thumbSrc ? '<img src="' + attr(thumbSrc) + '" alt="">' : '') +
        '<div class="t">' + esc(titles[i] || ('第 ' + (i + 1) + ' 项')) +
        '<small>' + esc(kindLabel || f.item.type) + '</small></div>' +
        '<div class="ops">' +
        '<button class="iconbtn" data-mv="-1" title="上移">↑</button>' +
        '<button class="iconbtn" data-mv="1" title="下移">↓</button>' +
        '<button class="iconbtn" data-dup="1" title="复制">⧉</button>' +
        '<button class="iconbtn danger" data-rm="1" title="删除">✕</button></div>';
      item.querySelector('[data-mv="-1"]').onclick = function (e) { e.stopPropagation(); moveItem(fullPath, i, -1); };
      item.querySelector('[data-mv="1"]').onclick = function (e) { e.stopPropagation(); moveItem(fullPath, i, 1); };
      item.querySelector('[data-dup]').onclick = function (e) { e.stopPropagation(); dupItem(fullPath, i); };
      item.querySelector('[data-rm]').onclick = function (e) { e.stopPropagation(); removeItem(fullPath, i); };
      item.onclick = function () { select(p); };
      body.appendChild(item);
    });
    if (!arr.length) body.appendChild(el('div', 'ins-empty', '还没有内容，点「+ 新增」添加'));
    box.appendChild(head);
    box.appendChild(body);
    return box;
  }

  function thumbOf(item, v) {
    if (item.type === 'image') return v;
    if (item.type === 'union') {
      var k = item.kinds[v[item.kindField]];
      if (!k) return '';
      return firstImage(k.fields, v);
    }
    return firstImage(item.fields, v);
  }
  function firstImage(fields, v) {
    var found = '';
    (fields || []).forEach(function (f) {
      if (found) return;
      if (f.type === 'group') { found = firstImage(f.fields, v); return; }
      if (f.type === 'image' && v && v[f.k]) found = v[f.k];
      else if (f.type === 'object' && v && v[f.k]) found = firstImage(f.fields, v[f.k]);
    });
    return found;
  }

  /** 写值 + 联动刷新 */
  function write(path, value, light) {
    setPath(S.cur.data, path, value);
    markDirty();
    renderPreview();
    if (!light) {
      renderTree();
      renderTreeAdd();
    }
  }

  /* ----------------------------- 页面设置面板 ----------------------------- */

  function pageSetting() {
    var loc = locate('meta');
    if (!loc.node) { toast('该页面没有页面级设置', 'err'); return; }
    select('meta');
    var host = $('inspector');
    var tip = el('div', 'tip', '💡 页面设置作用于整页（写回 replica.PAGE_META）：背景颜色会作为小程序页面底色，页面描述仅用于后台备注。');
    host.insertBefore(tip, host.children[1] || null);
  }

  /* ----------------------------- 列表操作 ----------------------------- */

  function blankOf(node) {
    if (!node) return null;
    switch (node.type) {
      case 'text': case 'textarea': case 'readonly': case 'link': return '';
      case 'number': return node.min != null ? node.min : 0;
      case 'image': return '';
      case 'switch': return !!node.def;
      case 'slider': return node.def != null ? node.def : (node.min != null ? node.min : 0);
      case 'color': return node.def || '';
      case 'radiobutton': case 'template': return node.def != null ? node.def : ((node.options || [])[0] ? node.options[0].value : '');
      case 'select': return (node.options || [])[0] ? ((node.options[0].value !== undefined) ? node.options[0].value : node.options[0]) : '';
      case 'group': return undefined;   // UI 分组不产生数据
      case 'object': {
        var o = {};
        (node.fields || []).forEach(function (f) {
          var v = blankOf(f);
          if (v !== undefined) o[f.k] = v;
        });
        return o;
      }
      case 'list': return [];
      default: return '';
    }
  }

  function addItem(listPath, item, kindKey) {
    var arr = getPath(S.cur.data, listPath);
    if (!Array.isArray(arr)) { toast('该列表不存在', 'err'); return; }

    if (item.type === 'union') {
      var doAdd = function (kk) {
        var kind = item.kinds[kk];
        var obj = {};
        obj[item.kindField] = kk;
        (kind.fields || []).forEach(function (f) {
          var v = blankOf(f);
          if (v !== undefined) obj[f.k] = v;
        });
        if (obj.height == null && kind.fields.some(function (f) { return f.k === 'height'; })) {
          var hf = kind.fields.filter(function (f) { return f.k === 'height'; })[0];
          obj.height = hf.def != null ? hf.def : 400;
        }
        obj.id = genId();
        arr.push(obj);
        afterListChange(listPath, arr.length - 1);
      };
      if (kindKey) doAdd(kindKey);
      else chooseKind(item, doAdd);
      return;
    }

    var one = blankOf(item);
    if (item.type === 'object' && one && typeof one === 'object') one.id = genId();
    if (item.type === 'image' && !one) {
      one = 'https://placehold.co/750x400/FDESEE/C8102E/png?text=%E6%96%B0%E5%9B%BE%E7%89%87';
    }
    arr.push(one);
    afterListChange(listPath, arr.length - 1);
  }

  function afterListChange(listPath, index) {
    markDirty();
    S.sel = listPath + '.' + index;
    renderTree();
    renderInspector();
    renderPreview();
    toast('已添加，记得保存草稿');
  }

  function removeItem(listPath, index) {
    var arr = getPath(S.cur.data, listPath);
    if (!Array.isArray(arr)) return;
    if (arr.length <= 1) {
      if (!confirm('这是最后一项，删除后该列表会为空，确定继续？')) return;
    } else if (!confirm('确定删除第 ' + (index + 1) + ' 项？')) {
      return;
    }
    arr.splice(index, 1);
    markDirty();
    if (S.sel.indexOf(listPath + '.') === 0) S.sel = listPath;
    renderTree(); renderInspector(); renderPreview();
    toast('已删除');
  }

  function moveItem(listPath, index, dir) {
    moveItemTo(listPath, index, index + dir);
  }

  function moveItemTo(listPath, from, to) {
    var arr = getPath(S.cur.data, listPath);
    if (!Array.isArray(arr)) return;
    if (to < 0 || to >= arr.length || from === to) return;
    var moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);
    markDirty();
    if (S.sel.indexOf(listPath + '.') === 0) {
      var rest = S.sel.slice((listPath + '.').length).split('.');
      rest[0] = String(to);
      S.sel = listPath + '.' + rest.join('.');
    }
    renderTree(); renderInspector(); renderPreview();
  }

  function dupItem(listPath, index) {
    var arr = getPath(S.cur.data, listPath);
    if (!Array.isArray(arr)) return;
    var copy = clone(arr[index]);
    if (copy && typeof copy === 'object' && copy.id) copy.id = genId();
    arr.splice(index + 1, 0, copy);
    afterListChange(listPath, index + 1);
  }

  /* =========================================================================
   * 五、预览（手机壳内渲染，含选中态与悬浮操作条）
   * ========================================================================= */

  function renderPreview() {
    /*
     * 底部导航跟着一起刷新。
     * 放在这里而不是逐个改 write / moveItem / dupItem / removeItem ——
     * 装修台的约定是「数据变了就 renderPreview()」，挂在这里就不会漏；
     * 逐个加的话，哪天新增一个改数据的方法忘了同步，底部导航就会悄悄停在旧样子。
     */
    renderTabbar();

    var host = $('preview');
    if (!S.cur) { host.innerHTML = ''; return; }

    /*
     * 店铺导航：底部导航是全局配置，没有「页面内容」可预览，
     * 真正的导航条画在手机壳底部的 #phTabbar（见 renderTabbar）。
     * 这里给手机屏里一块说明，免得中间空着让人以为没加载出来。
     */
    if (S.cur.meta && S.cur.meta.nav) {
      host.innerHTML =
        '<div class="nv-hint">' +
          '<b>底部导航是全局设置</b>' +
          '每个「内置页」底部都会出现这一条，改完后小程序里 5 个主页面同时生效。<br>' +
          '点左侧任一项可改名称 / 图标 / 跳转页面；<br>' +
          '在底部这条导航栏里看实时效果，颜色与项数在右侧属性面板里调。' +
        '</div>';
      return;
    }

    try {
      /*
       * 渲染核心在 /shared/pv-render.js —— 装修台（编辑态）与前端预览页（展示态）
       * 共用同一份实现，避免两边各写一套后逐渐走样。
       * edit:true 会带上选中态 / 悬浮操作条 / 区块类型角标 / 跳转角标，与改造前完全一致。
       */
      host.innerHTML = PvRender.render(S.cur.key, S.cur.data, {
        edit: true,
        sel: S.sel,
        slide: S.pvSlide,
        brand: S.pvBrand,
        custom: !!(S.cur.meta && S.cur.meta.custom)
      });
    } catch (e) {
      console.error('[预览渲染失败]', e);
      host.innerHTML = '<div class="insp-empty">预览渲染失败：' + esc(e && e.message) + '</div>';
    }
    if (!host.__bound) {
      host.addEventListener('click', function (e) {
        // 轮播指示点 / 缩略图：只翻预览的页码，不改数据
        var sl = e.target.closest('[data-slide]');
        if (sl) {
          e.stopPropagation();
          S.pvSlide[sl.getAttribute('data-path')] = Number(sl.getAttribute('data-slide'));
          renderPreview();
          return;
        }
        var op = e.target.closest('[data-op]');
        if (op) {
          var p0 = op.getAttribute('data-path');
          var lp = op.getAttribute('data-list');
          var ix = Number(op.getAttribute('data-index'));
          var act = op.getAttribute('data-op');
          if (act === 'up') moveItem(lp, ix, -1);
          else if (act === 'down') moveItem(lp, ix, 1);
          else if (act === 'dup') dupItem(lp, ix);
          else if (act === 'del') removeItem(lp, ix);
          return;
        }
        var t = e.target.closest('[data-path]');
        if (!t) return;
        var p = t.getAttribute('data-path');
        if (p.indexOf('brand:') === 0) { S.pvBrand = Number(p.slice(6)); renderPreview(); return; }
        if (p === '__shop__') { select('shop'); return; }
        select(p);
      });
      host.__bound = true;
    }
  }

  /*
   * 预览渲染（cls / img / normImgs / pvRich / linkBadge / opsBar / pvBlock
   * 与各页面渲染 pvHome / pvCustom / pvLexy / pvNews / pvProduct / pvMine）
   * 已统一迁到 /shared/pv-render.js，本文件不再保留第二份实现。
   */

  /* ----------------------------- 弹层 ----------------------------- */

  function modal(title, bodyNode, footNodes) {
    $('modalTitle').textContent = title;
    var body = $('modalBody');
    body.innerHTML = '';
    if (typeof bodyNode === 'string') body.innerHTML = bodyNode;
    else body.appendChild(bodyNode);
    var foot = $('modalFoot');
    foot.innerHTML = '';
    (footNodes || []).forEach(function (b) { foot.appendChild(b); });
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }

  function chooseKind(item, cb) {
    var box = el('div');
    box.appendChild(el('div', 'hint', '选择要添加的组件类型：'));
    var libKinds = (S.lib && S.lib.kinds) || [];
    Object.keys(item.kinds).forEach(function (key) {
      var k = item.kinds[key];
      var meta = libKinds.filter(function (x) { return x.kind === key; })[0];
      var b = el('button', 'btn',
        (meta ? meta.icon.replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-4px;margin-right:6px"') : '') +
        '<span style="font-size:13px">' + esc(k.label) + '</span>' +
        '<div style="color:#8a919e;font-size:11px;margin-top:2px">' + esc(k.desc || '') + '</div>');
      b.style.cssText = 'display:block;width:100%;text-align:left;margin:8px 0;padding:10px 12px;height:auto';
      b.onclick = function () { closeModal(); cb(key); };
      box.appendChild(b);
    });
    modal('添加组件', box, []);
  }

  function previewImage(url) {
    var p = $('imgPreview');
    p.querySelector('img').src = url;
    p.hidden = false;
  }

  /* =========================================================================
   * 素材库 · 图片选择器
   *
   * 对标有赞「选择图片」弹层，三个 tab：
   *   本地上传 —— 拖拽或点击选择，可一次多张，带真实上传进度（XHR progress）
   *   素材库   —— 后端 /api/media/*，缩略图网格 + 搜索 + 排序 + 删除 + 用量统计
   *   外链地址 —— 粘贴已有图片地址（历史数据里的有赞 CDN 图就是这种）
   *
   * 上传的图统一以「相对路径 /uploads/…」入库，不写死域名：
   * 上线换服务器时只改小程序端 utils/constants.js 一处，历史数据全部自动跟随。
   * ========================================================================= */

  /** 单张上限文案，首次拉素材库后由后端返回的真实值覆盖 */
  var MEDIA_MAX_TEXT = '5MB';
  var MEDIA_PAGE = 60;

  var ICON_UPLOAD =
    '<svg viewBox="0 0 48 48" width="34" height="34" fill="none" stroke="#155bd4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M24 31V11m0 0-7 7m7-7 7 7"/><path d="M10 30v4a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4v-4"/></svg>';

  /** 上传图片（FormData + 真实进度），返回后端 data */
  function uploadFiles(files, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      var n = 0;
      Array.prototype.forEach.call(files, function (f) {
        if (!f || !f.size) return;
        fd.append('file', f, f.name || ('image-' + (n + 1)));
        n += 1;
      });
      if (!n) { reject(new Error('没有选择文件')); return; }

      var xhr = new XMLHttpRequest();
      xhr.open('POST', API + '/api/media/upload');
      // 上传走的是 XHR（要拿真实进度），不带 fetch 那层封装 —— 令牌必须自己加
      var tk = token();
      if (tk) xhr.setRequestHeader('Authorization', 'Bearer ' + tk);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = function () {
        var json = null;
        try { json = JSON.parse(xhr.responseText); } catch (e) { /* 下面统一报错 */ }
        if (!json) { reject(new Error('上传响应不是合法 JSON')); return; }
        if (json.code !== 0) {
          if (json.code === 401) { if (tk) clearSession(); openLogin({ reason: json.msg }); }
          reject(new Error(json.msg || ('业务码 ' + json.code)));
          return;
        }
        resolve(json.data);
      };
      xhr.onerror = function () { reject(new Error('网络异常，上传失败（后端是否已启动？）')); };
      xhr.send(fd);
    });
  }

  /** 拉素材库列表 */
  function fetchMedia(q, sort, pageSize) {
    return api('GET', '/api/media/list', {
      query: { q: q || '', sort: sort || 'new', page: 1, size: Math.min(200, pageSize || MEDIA_PAGE) }
    }).then(function (d) {
      if (d.stat && d.stat.maxText) MEDIA_MAX_TEXT = d.stat.maxText;
      return d;
    });
  }

  /**
   * 打开图片选择器
   *   o.value    当前值（单选时用于回显）
   *   o.multiple 多选（图片列表用）
   *   o.max      多选上限（剩余可加数）
   *   o.onPick   回调，参数为选中的地址数组
   */
  function pickImage(o) {
    o = o || {};
    var multi = !!o.multiple;
    var picked = o.value ? [o.value] : [];
    var st = { tab: 'upload', q: '', sort: 'new', page: 1 };

    var body = el('div', 'pick');
    if (o.hint) body.appendChild(el('div', 'pick-hint', esc(o.hint)));
    var tabBar = el('div', 'pick-tabs');
    var pane = el('div', 'pick-pane');
    body.appendChild(tabBar);
    body.appendChild(pane);

    var confirmBtn = el('button', 'btn primary', '确定');
    confirmBtn.onclick = function () {
      if (!picked.length) { toast('请先选择图片', 'err'); return; }
      var list = picked.slice();
      closeModal();
      if (o.onPick) o.onPick(list);
    };
    var cancelBtn = el('button', 'btn', '取消');
    cancelBtn.onclick = closeModal;

    function syncFoot() {
      confirmBtn.textContent = picked.length ? '确定（' + picked.length + '）' : '确定';
      confirmBtn.disabled = !picked.length;
      confirmBtn.style.opacity = picked.length ? '' : '.45';
    }    /** 立即选中并关闭（单选） */
    function done(url) {
      closeModal();
      if (o.onPick) o.onPick([url]);
    }
    function toggle(url) {
      if (!multi) { done(url); return; }
      var i = picked.indexOf(url);
      if (i === -1) {
        if (o.max && picked.length >= o.max) { toast('最多还能选 ' + (o.max - picked.length) + ' 张', 'err'); return; }
        picked.push(url);
      } else {
        picked.splice(i, 1);
      }
      syncFoot();
      // 只切勾选态，不整块重绘：整块重绘会让所有缩略图重新发起加载请求，画面会闪
      Array.prototype.forEach.call(document.querySelectorAll('.pick-item'), function (it) {
        var im = it.querySelector('img');
        if (im) it.classList.toggle('on', picked.indexOf(im.getAttribute('src')) !== -1);
      });
    }

    /* ---------------- tab 1：本地上传 ---------------- */
    function uploadPanel() {
      var box = el('div');
      var zone = el('div', 'up-zone',
        '<div class="up-ico">' + ICON_UPLOAD + '</div>' +
        '<div class="up-t">点击选择图片，或把图片拖到这里</div>' +
        '<div class="up-s">支持 PNG / JPG / WebP / GIF ｜ 单张 ≤ ' + MEDIA_MAX_TEXT +
        ' ｜ 可一次选多张（按文件真实格式校验，改扩展名无效）</div>');
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/gif';
      input.multiple = true;
      input.style.display = 'none';

      var prog = el('div', 'up-list');

      function handle(files) {
        if (!files || !files.length) return;
        prog.innerHTML = '';
        var row = el('div', 'up-row',
          '<span class="nm">' + files.length + ' 个文件</span><span class="pct">0%</span>');
        var bar = el('div', 'up-bar');
        bar.innerHTML = '<i style="width:0"></i>';
        prog.appendChild(row);
        prog.appendChild(bar);

        uploadFiles(files, function (p) {
          row.querySelector('.pct').textContent = p + '%';
          bar.querySelector('i').style.width = p + '%';
        }).then(function (d) {
          row.querySelector('.pct').textContent = '完成';
          bar.querySelector('i').style.width = '100%';
          var urls = (d.list || []).map(function (x) { return x.url; });
          urls.forEach(function (u) { picked.push(u); });

          if (d.failed) {
            toast(d.success + ' 张成功 · ' + d.failed + ' 张失败：' +
              ((d.failedList[0] || {}).reason || ''), 'err');
          }
          if (!multi) {
            if (urls.length > 1) toast('已上传 ' + urls.length + ' 张，本次使用第 1 张');
            done(urls[0]);
            return;
          }
          (d.list || []).forEach(function (x, i) {
            prog.appendChild(el('div', 'up-ok',
              '✓ ' + esc(x.orig) + '　' + (x.width ? x.width + '×' + x.height + ' ' : '') + x.sizeText));
          });
          toast('已上传 ' + d.success + ' 张，并自动勾选');
          st.tab = 'lib';
          st.page = 1;
          render();
        }).catch(function (e) {
          row.querySelector('.pct').textContent = '失败';
          bar.classList.add('err');
          prog.appendChild(el('div', 'up-err', esc(e.message)));
          toast('上传失败：' + e.message, 'err');
        });
      }

      input.onchange = function () { handle(input.files); input.value = ''; };
      zone.onclick = function () { input.click(); };
      zone.ondragover = function (e) { e.preventDefault(); zone.classList.add('over'); };
      zone.ondragenter = function (e) { e.preventDefault(); zone.classList.add('over'); };
      zone.ondragleave = function () { zone.classList.remove('over'); };
      zone.ondrop = function (e) {
        e.preventDefault();
        zone.classList.remove('over');
        handle(e.dataTransfer && e.dataTransfer.files);
      };
      // 支持截图后直接 Ctrl+V 粘贴
      zone.tabIndex = 0;
      zone.onpaste = function (e) {
        var items = (e.clipboardData || {}).items || [];
        var files = [];
        Array.prototype.forEach.call(items, function (it) {
          if (it.kind === 'file') { var f = it.getAsFile(); if (f) files.push(f); }
        });
        if (files.length) { e.preventDefault(); handle(files); }
      };

      box.appendChild(zone);
      box.appendChild(input);
      box.appendChild(prog);
      box.appendChild(el('div', 'hint', '上传即进入素材库，可重复使用；删除素材时后端会先检查是否仍被页面引用，避免前台出现空白。'));
      return box;
    }

    /* ---------------- tab 2：素材库 ---------------- */
    function libPanel() {
      var box = el('div');
      var bar = el('div', 'pick-toolbar');
      var search = document.createElement('input');
      search.type = 'text';
      search.placeholder = '搜索文件名…';
      search.value = st.q;
      var timer = null;
      var sortSel = document.createElement('select');
      [['new', '最新上传'], ['old', '最早上传'], ['big', '体积从大到小'], ['small', '体积从小到大']]
        .forEach(function (t) {
          var op = document.createElement('option');
          op.value = t[0];
          op.textContent = t[1];
          if (st.sort === t[0]) op.selected = true;
          sortSel.appendChild(op);
        });
      bar.appendChild(search);
      bar.appendChild(sortSel);
      box.appendChild(bar);

      var stat = el('div', 'pick-stat', '加载中…');
      box.appendChild(stat);
      var grid = el('div', 'pick-grid');
      box.appendChild(grid);
      box.appendChild(el('div', 'hint', multi
        ? '点图片勾选/取消，可多选；选好后点右下角「确定」。'
        : '点一下图片就直接用这张。'));

      /**
       * 只刷新统计与网格，不重建搜索框 ——
       * 否则每敲一个字都会因重绘而失焦（对标有赞的搜索体验）
       */
      function loadGrid() {
        grid.innerHTML = '<div class="pick-empty">加载中…</div>';
        fetchMedia(st.q, st.sort, MEDIA_PAGE * st.page).then(function (d) {
          stat.innerHTML = '共 <b>' + d.total + '</b> 张 · 占用 ' + d.stat.sizeText + ' · 单张上限 ' + d.stat.maxText;
          if (!d.list.length) {
            grid.innerHTML = '<div class="pick-empty">' +
              (st.q ? '没有匹配「' + esc(st.q) + '」的素材' : '素材库还是空的，切到「本地上传」传一张试试') + '</div>';
            return;
          }
          grid.innerHTML = '';
          d.list.forEach(function (m) {
            var it = el('div', 'pick-item' + (picked.indexOf(m.url) !== -1 ? ' on' : ''));
            it.innerHTML =
              '<div class="pi-img"><img src="' + attr(m.url) + '" alt="">' +
              '<span class="pi-check">✓</span>' +
              '<button class="pi-del" title="删除该素材">✕</button>' +
              '<button class="pi-zoom" title="放大查看">⤢</button></div>' +
              '<div class="pi-meta"><b title="' + attr(m.orig || m.name) + '">' + esc(m.orig || m.name) + '</b>' +
              '<small>' + (m.width ? m.width + '×' + m.height + ' ｜ ' : '') + m.sizeText + '</small></div>';
            it.onclick = function () { toggle(m.url); };
            it.querySelector('.pi-zoom').onclick = function (e) { e.stopPropagation(); previewImage(m.url); };
            it.querySelector('.pi-del').onclick = function (e) {
              e.stopPropagation();
              // 删素材会直接影响线上图片（可能已被商品/装修引用）：服务端要求 owner
              if (!needRole('owner', '删除素材')) return;
              // 先按普通删除试；被页面引用时后端拒绝，此时在卡片内给「仍然删除」，不再弹嵌套弹层
              api('POST', '/api/media/delete', { body: { name: m.name } })
                .then(function () {
                  toast('素材已删除');
                  picked = picked.filter(function (u) { return u !== m.url; });
                  syncFoot();
                  loadGrid();
                })
                .catch(function (err) {
                  var w = el('div', 'pi-warn', esc(err.message));
                  var b1 = el('button', 'btn sm danger', '仍然删除');
                  b1.onclick = function (ev) {
                    ev.stopPropagation();
                    api('POST', '/api/media/delete', { body: { name: m.name, force: 1 } })
                      .then(function () {
                        toast('素材已强制删除');
                        picked = picked.filter(function (u) { return u !== m.url; });
                        syncFoot();
                        loadGrid();
                      })
                      .catch(function (e2) { toast('删除失败：' + e2.message, 'err'); });
                  };
                  var b2 = el('button', 'btn sm', '取消');
                  b2.onclick = function (ev) { ev.stopPropagation(); w.remove(); };
                  w.appendChild(b1);
                  w.appendChild(b2);
                  it.appendChild(w);
                });
            };
            grid.appendChild(it);
          });

          if (d.total > d.list.length) {
            var more = el('button', 'btn sm pick-more', '加载更多（还有 ' + (d.total - d.list.length) + ' 张）');
            more.onclick = function () { st.page += 1; loadGrid(); };
            grid.appendChild(more);
          }
        }).catch(function (e) {
          stat.textContent = '';
          grid.innerHTML = '<div class="pick-empty">素材库加载失败：' + esc(e.message) + '</div>';
        });
      }

      search.oninput = function () {
        clearTimeout(timer);
        timer = setTimeout(function () { st.q = search.value.trim(); st.page = 1; loadGrid(); }, 300);
      };
      sortSel.onchange = function () { st.sort = sortSel.value; st.page = 1; loadGrid(); };

      loadGrid();
      return box;
    }

    /* ---------------- tab 3：外链地址 ---------------- */
    function urlPanel() {
      var box = el('div', 'pick-url');
      box.appendChild(el('div', 'hint',
        '粘贴图片地址。优先用「素材库」里的自有图片（站内 /uploads/… 相对路径）——' +
        '外链一旦对方下线或换服务器就会裂图。'));
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = picked[0] || '';
      inp.placeholder = '/uploads/202610/20261009-xxxxxx.png';
      box.appendChild(inp);
      var b = el('button', 'btn primary', '使用该地址');
      b.onclick = function () {
        var v = inp.value.trim();
        if (!v) { toast('请先填写图片地址', 'err'); return; }
        if (!/^(https?:)?\/\//.test(v) && v.charAt(0) !== '/') { toast('地址需以 http(s):// 或 / 开头', 'err'); return; }
        done(v);
      };
      inp.onkeydown = function (e) { if (e.key === 'Enter') b.onclick(); };
      box.appendChild(b);
      return box;
    }

    function render() {
      // 每次重绘都同步底部按钮：上传后 picked 变了但面板是新建的，
      // 这里不统一同步的话「确定」会停留在初始的禁用态（上传完点不动）。
      syncFoot();
      tabBar.innerHTML = '';
      [['upload', '本地上传'], ['lib', '素材库'], ['url', '外链地址']].forEach(function (t) {
        var b = el('button', 'pick-tab' + (st.tab === t[0] ? ' on' : ''), t[1]);
        b.onclick = function () { st.tab = t[0]; render(); };
        tabBar.appendChild(b);
      });
      pane.innerHTML = '';
      pane.appendChild(st.tab === 'upload' ? uploadPanel() : st.tab === 'lib' ? libPanel() : urlPanel());
    }

    syncFoot();
    render();
    modal(o.title || '选择图片', body, multi ? [confirmBtn, cancelBtn] : [cancelBtn]);
  }

  /* =========================================================================
   * 跳转链接 · 选择器
   *
   * 对标有赞属性面板的「选择链接」：不让运营手写 /pages/xxx 这种路径
   * （写错了真机上就是「页面暂未开放」，而且没人记得住），
   * 而是从一个真实来源聚合出来的清单里点选：
   *   页面   → 内置 5 页 + 分类 / 购物车 / 全部商品 + 装修台新建的自定义页
   *   商品   → 后端商品库（与后台控制台同一个库，/api/decorate/link-options）
   *   资讯   → replica.NEWS 的大 / 小栏目（key 即内容页标识）
   *   自定义 → 手填页面路径 / 网页链接 / 电话号码
   *
   * 存下来的仍然是普通字符串路径，所以小程序端只按普通路径跳转即可。
   * ========================================================================= */

  var LINK_OPTS = null;

  function loadLinkOptions() {
    if (LINK_OPTS) return Promise.resolve(LINK_OPTS);
    return api('GET', '/api/decorate/link-options').then(function (d) {
      LINK_OPTS = d || { pages: [], goods: [], news: [] };
      PvRender.setLinkOptions(LINK_OPTS); // 预览里的跳转角标要靠它把路径翻成人话
      return LINK_OPTS;
    }).catch(function () {
      LINK_OPTS = { pages: [], goods: [], news: [] };
      PvRender.setLinkOptions(LINK_OPTS);
      return LINK_OPTS;
    });
  }

  /** 把存下来的跳转路径翻译成人看得懂的名字（属性面板与预览角标共用 —— 实现在共享模块里） */
  function linkLabel(link) { return PvRender.linkLabel(link); }

  /** 打开链接选择器：o.value 当前值，o.onPick(路径) 回调 */
  function linkPicker(o) {
    o = o || {};
    var st = { tab: 'page', q: '' };
    var opts = { pages: [], goods: [], news: [] };

    var body = el('div', 'pick');
    if (o.hint) body.appendChild(el('div', 'pick-hint', esc(o.hint)));
    var tabBar = el('div', 'pick-tabs');
    var pane = el('div', 'pick-pane');
    body.appendChild(tabBar);
    body.appendChild(pane);

    var cancelBtn = el('button', 'btn', '取消');
    cancelBtn.onclick = closeModal;

    function done(p) {
      closeModal();
      if (o.onPick) o.onPick(p);
    }

    /** 带搜索的候选列表 */
    function listPanel(items, emptyText) {
      var box = el('div', 'lk-panel');
      var kw = st.q.trim().toLowerCase();
      var hit = items.filter(function (x) {
        if (!kw) return true;
        return (x.name || '').toLowerCase().indexOf(kw) >= 0 || (x.path || '').toLowerCase().indexOf(kw) >= 0;
      });
      if (!hit.length) {
        box.appendChild(el('div', 'ins-empty', kw ? '没有匹配「' + esc(st.q) + '」的目标' : emptyText));
        return box;
      }
      var list = el('div', 'lk-list');
      hit.forEach(function (x) {
        var it = el('div', 'lk-item' + (o.value === x.path ? ' on' : ''));
        var ph = x.kind === 'goods' ? '商' : (x.kind === 'news' ? '讯' : '页');
        it.innerHTML =
          (x.image ? '<img src="' + attr(x.image) + '" alt="">' : '<span class="lk-ph">' + ph + '</span>') +
          '<div class="lk-meta"><b>' + esc(x.name) + '</b><small>' + esc(x.path) + '</small></div>' +
          (x.tab ? '<span class="lk-tag">底部导航</span>' : '') +
          (o.value === x.path ? '<span class="lk-cur">当前</span>' : '');
        it.onclick = function () { done(x.path); };
        list.appendChild(it);
      });
      box.appendChild(list);
      return box;
    }

    /** 自定义：手填页面路径 / 网页链接 / 电话号码 */
    function customPanel() {
      var box = el('div', 'lk-custom');
      box.appendChild(el('div', 'hint',
        '页面路径要以 / 开头（如 /pages/lexy/lexy）；网页链接小程序内打不开，点击会复制；' +
        '电话号码会调起系统拨号。'));
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = o.value || '';
      inp.placeholder = '/pages/xxx 或 https://… 或 tel:400-828-2233';
      box.appendChild(inp);

      var row = el('div', 'lk-quick');
      [['/pages/index/index', '回首页'], ['/pages/product/product', '产品页'],
       ['/packageGoods/list/list', '全部商品'], ['/pages/cart/cart', '购物车']].forEach(function (q) {
        var b = el('button', 'btn sm ghost', q[1]);
        b.onclick = function () { inp.value = q[0]; inp.focus(); };
        row.appendChild(b);
      });
      box.appendChild(row);

      var b = el('button', 'btn primary', '使用这个地址');
      b.onclick = function () {
        var v = inp.value.trim();
        if (!v) { toast('请先填写跳转地址', 'err'); return; }
        if (v.charAt(0) !== '/' && !/^https?:\/\//.test(v) && v.indexOf('tel:') !== 0) {
          toast('地址需以 / 开头，或 http(s):// / tel: 前缀', 'err');
          return;
        }
        done(v);
      };
      inp.onkeydown = function (e) { if (e.key === 'Enter') b.onclick(); };
      box.appendChild(b);
      return box;
    }

    function render() {
      tabBar.innerHTML = '';
      [['page', '页面', opts.pages.length], ['goods', '商品', opts.goods.length],
       ['news', '资讯', opts.news.length], ['custom', '自定义', 0]].forEach(function (t) {
        var b = el('button', 'pick-tab' + (st.tab === t[0] ? ' on' : ''),
          t[1] + (t[2] ? ' <i>' + t[2] + '</i>' : ''));
        b.onclick = function () { st.tab = t[0]; render(); };
        tabBar.appendChild(b);
      });

      pane.innerHTML = '';
      if (!o.__loaded && st.tab !== 'custom') {
        pane.innerHTML = '<div class="ins-empty"><span class="spin"></span> 正在读取可跳转的目标…</div>';
        return;
      }
      if (st.tab === 'custom') { pane.appendChild(customPanel()); return; }

      var search = el('div', 'lk-search');
      search.innerHTML = '<input type="text" placeholder="搜索名称或路径" value="' + attr(st.q) + '">';
      var inp = search.querySelector('input');
      inp.oninput = function () {
        var pos = inp.selectionStart;
        st.q = inp.value;
        var next = pane.querySelector('.lk-panel');
        if (next) pane.replaceChild(listPanel(currentItems(), emptyOf()), next);
        else pane.appendChild(listPanel(currentItems(), emptyOf()));
        var again = pane.querySelector('.lk-search input');
        if (again && again !== inp) { again.value = st.q; again.focus(); }
        else { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) { /* 忽略 */ } }
      };
      pane.appendChild(search);
      pane.appendChild(listPanel(currentItems(), emptyOf()));
    }

    function currentItems() {
      return st.tab === 'goods' ? opts.goods : (st.tab === 'news' ? opts.news : opts.pages);
    }
    function emptyOf() {
      if (st.tab === 'goods') return '商品库里还没有商品，可先到后台控制台「商品」里新建';
      if (st.tab === 'news') return 'replica.NEWS 里还没有栏目';
      return '没有可跳转的页面';
    }

    render();
    modal(o.title || '选择链接', body, [cancelBtn]);

    loadLinkOptions().then(function (d) {
      opts = { pages: d.pages || [], goods: d.goods || [], news: d.news || [] };
      o.__loaded = true;
      render();
    });
  }

  /**
   * 商品多选器（字段上的 `quickAdd: 'goods'` 用它）
   *
   * 对标有赞的「关联商品分组」：一次勾若干商品，自动长成条目，
   * 省掉「一个个加条目 → 一张张挑主图 → 一条条粘详情链接」这套手工活。
   * 数据源与链接选择器的「商品」tab 完全同源（`/api/decorate/link-options`），
   * 不另开接口 —— 否则商品库改了要同步两处。
   *
   *   o.title   弹层标题
   *   o.max     本列表还能加几项（0 / 不传 = 不限）
   *   o.onPick  回调，参数是选中的商品对象数组 [{id,name,path,image,kind}]
   */
  function goodsPicker(o) {
    o = o || {};
    var st = { q: '' };
    var opts = { goods: [] };
    var sel = {};
    var loaded = false;

    var body = el('div', 'pick');
    body.appendChild(el('div', 'pick-hint',
      '勾选商品后点「确定」，会自动写入条目：图片 = 商品主图、标题 = 商品名、跳转 = 商品详情页。' +
      (o.max ? '本列表还能加 ' + o.max + ' 项。' : '')));

    var search = el('div', 'lk-search');
    search.innerHTML = '<input type="text" placeholder="搜索商品名称或编号" value="' + attr(st.q) + '">';
    body.appendChild(search);

    var pane = el('div', 'lk-panel');
    body.appendChild(pane);

    var cnt = el('span', 'cnt', '已选 0 项');
    var bar = el('div', 'pick-sel-bar');
    bar.appendChild(cnt);
    body.appendChild(bar);

    var cancelBtn = el('button', 'btn', '取消');
    cancelBtn.onclick = closeModal;
    var okBtn = el('button', 'btn primary', '确定');
    okBtn.onclick = function () {
      var picked = opts.goods.filter(function (g) { return sel[g.id]; });
      if (!picked.length) { toast('请先勾选商品', 'err'); return; }
      closeModal();
      if (o.onPick) o.onPick(picked);
    };

    function render() {
      cnt.textContent = '已选 ' + Object.keys(sel).length + ' 项';
      pane.innerHTML = '';
      if (!loaded) {
        pane.innerHTML = '<div class="ins-empty"><span class="spin"></span> 正在读取商品库…</div>';
        return;
      }
      var kw = st.q.trim().toLowerCase();
      var hit = opts.goods.filter(function (x) {
        if (!kw) return true;
        return String(x.name || '').toLowerCase().indexOf(kw) >= 0 ||
          String(x.id || '').toLowerCase().indexOf(kw) >= 0;
      });
      if (!hit.length) {
        pane.appendChild(el('div', 'ins-empty', kw
          ? '没有匹配「' + esc(st.q) + '」的商品'
          : '商品库里还没有商品，可先到后台控制台「商品」里新建'));
        return;
      }
      var list = el('div', 'lk-list');
      hit.forEach(function (x) {
        var on = !!sel[x.id];
        var it = el('div', 'lk-item lk-multi' + (on ? ' on' : ''));
        it.innerHTML =
          '<span class="lk-check">' + (on ? '✓' : '') + '</span>' +
          (x.image ? '<img src="' + attr(x.image) + '" alt="">' : '<span class="lk-ph">商</span>') +
          '<div class="lk-meta"><b>' + esc(x.name || x.id) + '</b><small>' + esc(x.path) + '</small></div>';
        it.onclick = function () {
          if (sel[x.id]) delete sel[x.id];
          else {
            if (o.max && Object.keys(sel).length >= o.max) {
              toast('本列表最多还能加 ' + o.max + ' 项', 'err');
              return;
            }
            sel[x.id] = true;
          }
          render();
        };
        list.appendChild(it);
      });
      pane.appendChild(list);
    }

    var inp = search.querySelector('input');
    inp.oninput = function () { st.q = inp.value; render(); };

    render();
    modal(o.title || '关联商品', body, [cancelBtn, okBtn]);

    loadLinkOptions().then(function (d) {
      opts.goods = (d && d.goods) || [];
      loaded = true;
      render();
    });
  }

  /**
   * 「+ 关联商品分组」：把选中的商品批量写进列表
   * 产出的条目结构与「+ 自定义条目」完全一致（有赞也是同一份数据结构）。
   */
  function pickGoodsInto(listPath, f) {
    var arr = getPath(S.cur.data, listPath);
    if (!Array.isArray(arr)) { toast('该列表不存在', 'err'); return; }
    goodsPicker({
      title: '关联商品分组 · ' + (f.label || f.k),
      max: f.max ? (f.max - arr.length) : 0,
      onPick: function (goods) {
        var cur = getPath(S.cur.data, listPath);
        var first = cur.length;
        goods.forEach(function (g) {
          cur.push({
            id: genId(),
            image: g.image || '',
            title: g.name || '',
            desc: '',
            linkMode: 'whole',
            link: g.path || ''
          });
        });
        markDirty();
        S.sel = listPath + '.' + first;
        renderTree(); renderInspector(); renderPreview();
        toast('已关联 ' + goods.length + ' 个商品，记得保存草稿');
      }
    });
  }

  /* ----------------------------- 保存 / 发布 / 版本 ----------------------------- */

  function saveDraft() {
    return api('POST', '/api/decorate/draft', { body: { key: S.cur.key, data: S.cur.data } })
      .then(function (d) {
        S.dirty = false;
        renderDirty();
        toast('草稿已保存 ' + d.atText, 'ok');
        return d;
      })
      .catch(function (e) {
        toast('保存失败：' + e.message, 'err');
        locateFromMessage(e.message);
      });
  }

  function publish() {
    // 发布 = 全站前端内容整体替换（高危）：服务端要求 owner，这里提前把话说清楚
    if (!needRole('owner', '发布装修')) return;
    var doIt = function () {
      api('POST', '/api/decorate/publish', { body: { key: S.cur.key, note: '后台发布' } })
        .then(function (d) {
          toast('已生成代码 ' + d.versionId + '（写回 replica.js，' + d.bytes + ' 字节）', 'ok');
          modal('已生成代码，尚未上线',
            '<div style="line-height:2">' +
            '版本号：<b>' + esc(d.versionId) + '</b><br>' +
            '生成时间：' + esc(d.publishedAtText) + '<br>' +
            '写回文件：<code>miniprogram/config/replica.js</code><br>' +
            '发布前备份：<code>server/data/decorate/backup/' + esc(d.backup) + '</code>' +
            '</div>' +
            // ⚠️ 这里以前写的是「重新编译或下拉刷新即可看到新内容」——对**已发布的**小程序不成立：
            //    replica.js 在代码包里，只有重新上传并发布小程序版本，真机才会拿到新内容。
            //    不能把「浏览器预览」（或开发者工具的热重载）说成「线上已生效」。
            '<div class="tip" style="margin-top:12px;line-height:1.7">' +
            '<b>接下来还需要两步才算上线：</b><br>' +
            '1）在微信开发者工具点「编译」可立即看到本次改动（本机效果，用户看不到）；<br>' +
            '2）要点「上传」并在微信公众平台发布新版本，已发布的小程序才会更新。' +
            '<br><span class="hint" style="display:block;margin-top:6px">' +
            '· 本地 <code>/preview</code> 与装修台手机壳都只是本机渲染，不代表线上已更新；<br>' +
            '· 用户端在没有更新到新版本前，看到的仍是旧内容。</span>' +
            '</div>',
            [btnClose()]);
          S.dirty = false;
          renderDirty();
        })
        .catch(function (e) {
          toast('发布失败：' + e.message, 'err');
          locateFromMessage(e.message);
        });
    };

    if (S.dirty) {
      var b1 = el('button', 'btn primary', '先保存草稿再发布');
      b1.onclick = function () { closeModal(); saveDraft().then(doIt); };
      var b2 = el('button', 'btn', '直接发布当前内容');
      b2.onclick = function () { closeModal(); doIt(); };
      modal('还有未保存的改动', '<div class="hint">建议先保存草稿再发布，这样版本历史里能追溯到这次改动。</div>', [b1, b2, btnClose()]);
      return;
    }
    doIt();
  }

  function showDiff(key) {
    var k = key || (S.cur && S.cur.key);
    if (!k) return;
    api('GET', '/api/decorate/diff', { query: { key: k } }).then(function (d) {
      var box = el('div');
      if (!d.hasDraft) {
        box.innerHTML = '<div class="hint">当前没有草稿，页面与线上一致。</div>';
      } else if (!d.total) {
        box.innerHTML = '<div class="hint">草稿与已发布内容一致，没有差异。</div>';
      } else {
        box.innerHTML = '<div class="hint" style="margin-bottom:8px">共 <b>' + d.total + '</b> 处差异（新增 ' + d.added + ' / 删除 ' + d.removed + ' / 修改 ' + d.changed + '）' +
          (d.truncated ? '，仅显示前 ' + d.list.length + ' 条' : '') + '</div>' +
          d.list.map(function (x) {
            return '<div class="diff-row"><div class="p">' + esc(x.path) + '</div><div class="v">' +
              (x.type === 'add' ? '<span class="add">+ ' + esc(x.to) + '</span>'
                : x.type === 'del' ? '<span class="del">- ' + esc(x.from) + '</span>'
                  : '<span class="del">' + esc(x.from) + '</span> → <span class="add">' + esc(x.to) + '</span>') +
              '</div></div>';
          }).join('');
      }
      modal('查看变更 · ' + k, box, [btnClose()]);
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  function showVersions(key) {
    var k = key || (S.cur && S.cur.key);
    if (!k) return;
    api('GET', '/api/decorate/page', { query: { key: k } }).then(function (d) {
      var box = el('div');
      var vs = d.versions || [];
      if (!vs.length) {
        box.innerHTML = '<div class="hint">还没有发布记录。首次发布后这里会保留最近 20 个版本。</div>';
      } else {
        box.innerHTML = vs.map(function (v) {
          return '<div class="ver-row"><span class="vid">' + esc(v.id) + '</span>' +
            '<span class="vt">' + esc(v.note || '发布') + '<small>' + esc(v.atText) + '</small></span>' +
            '<button class="btn sm" data-rb="' + attr(v.id) + '">恢复为草稿</button>' +
            '<button class="btn sm primary" data-rbp="' + attr(v.id) + '">恢复并发布</button></div>';
        }).join('');
      }
      modal('版本历史 · ' + k, box, [btnClose()]);
      box.querySelectorAll('[data-rb]').forEach(function (b) {
        b.onclick = function () { rollback(k, b.getAttribute('data-rb'), 'draft'); };
      });
      box.querySelectorAll('[data-rbp]').forEach(function (b) {
        b.onclick = function () { rollback(k, b.getAttribute('data-rbp'), 'publish'); };
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  function rollback(key, versionId, mode) {
    api('POST', '/api/decorate/rollback', { body: { key: key, versionId: versionId, mode: mode } })
      .then(function () {
        closeModal();
        toast(mode === 'publish' ? '已恢复到 ' + versionId + ' 并发布' : '已把 ' + versionId + ' 恢复为草稿', 'ok');
        if (S.cur && S.cur.key === key) openPage(key);
        else loadPages();
      })
      .catch(function (e) { toast('回滚失败：' + e.message, 'err'); });
  }

  function discardDraft(key) {
    var k = key || (S.cur && S.cur.key);
    if (!k) return;
    if (!confirm('确定丢弃该页面的草稿？将恢复到已发布内容。')) return;
    api('POST', '/api/decorate/discard', { body: { key: k } }).then(function () {
      toast('草稿已丢弃');
      if (S.cur && S.cur.key === k) openPage(k);
      else loadPages();
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  function btnClose() {
    var b = el('button', 'btn', '关闭');
    b.onclick = closeModal;
    return b;
  }

  /* ----------------------------- 新建 / 改名 / 删除自定义页面 ----------------------------- */

  /** 弹窗表单的一行（标题 + 输入框 + 可选说明） */
  function formRow(labelText, input, hint) {
    var row = el('div', 'form-row');
    row.appendChild(el('label', '', esc(labelText)));
    row.appendChild(input);
    if (hint) row.appendChild(el('div', 'hint', esc(hint)));
    return row;
  }

  function textInput(placeholder, value, maxLength) {
    var i = document.createElement('input');
    i.type = 'text';
    i.placeholder = placeholder || '';
    if (value != null) i.value = value;
    if (maxLength) i.maxLength = maxLength;
    return i;
  }

  /** 新建页面（对标有赞「店铺页面 → 新建页面」） */
  function createPageDialog() {
    if (!needRole('owner', '新建页面')) return;
    var box = el('div');
    box.appendChild(el('div', 'hint',
      '新建后只是后台多出一个页面，装修完点「生成代码」才会写进小程序代码包（replica.js）；' +
      '已发布的小程序要等下一次上传发布新版本才会出现这个页面。'));

    var nameInput = textInput('例如：2026 春季新品（最多 30 字）', '', 30);
    var keyInput = textInput('选填：小写字母 / 数字 / 连字符，如 spring2026', '', 24);
    var noteInput = textInput('选填，仅后台可见', '', 40);

    box.appendChild(formRow('页面名称', nameInput));
    box.appendChild(formRow('页面标识', keyInput,
      '留空自动生成（p1、p2…）。发布后小程序端用 pages/custom/index?key=标识 打开。'));
    box.appendChild(formRow('备注', noteInput));

    var tpl = (S.templates[0] && S.templates[0].key) || 'blank';
    var tplBox = el('div', 'tpl-box');
    S.templates.forEach(function (t) {
      var card = el('button', 'tpl-card' + (t.key === tpl ? ' on' : ''),
        '<b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span>');
      card.type = 'button';
      card.onclick = function () {
        tpl = t.key;
        var all = tplBox.querySelectorAll('.tpl-card');
        for (var i = 0; i < all.length; i++) {
          all[i].className = 'tpl-card' + (all[i] === card ? ' on' : '');
        }
      };
      tplBox.appendChild(card);
    });
    var tplRow = el('div', 'form-row');
    tplRow.appendChild(el('label', '', '初始内容'));
    tplRow.appendChild(tplBox);
    box.appendChild(tplRow);

    var save = el('button', 'btn primary', '创建并开始装修');
    save.onclick = function () {
      var name = nameInput.value.trim();
      if (!name) { toast('请先填写页面名称', 'err'); nameInput.focus(); return; }
      save.disabled = true;
      api('POST', '/api/decorate/page/create', {
        body: {
          name: name,
          key: keyInput.value.trim(),
          note: noteInput.value.trim(),
          template: tpl
        }
      }).then(function (d) {
        closeModal();
        toast('已创建「' + d.page.name + '」');
        return loadPages().then(function () { openPage(d.page.key); });
      }).catch(function (e) {
        save.disabled = false;
        toast('创建失败：' + e.message, 'err');
      });
    };
    modal('新建页面', box, [save, btnClose()]);
    nameInput.focus();
  }

  /**
   * 改名称 / 备注 / 页面标识。
   *
   * 标识就是访问地址，已被分享出去的链接（聊天、朋友圈、二维码、其他页面的跳转）都指向它，
   * 所以：
   *   · 已写进代码包的页面，标识默认**锁住**，要改必须显式勾选解锁；
   *   · 改标识会登记别名（旧链接仍可访问），并把仍指向旧标识的引用列出来给运营看。
   */
  function renamePageDialog(key) {
    if (!needRole('owner', '改名页面')) return;
    var p = S.pages.filter(function (x) { return x.key === key; })[0];
    if (!p) return;

    var box = el('div');
    box.appendChild(el('div', 'hint',
      '改名称不影响内容，也不会影响访问地址。'));

    var nameInput = textInput('页面名称', p.name, 30);
    var keyInput = textInput('页面标识', p.key, 24);
    var noteInput = textInput('备注', p.note || '', 40);
    var locked = !!(p.custom && p.generated !== false);
    if (locked) keyInput.setAttribute('readonly', 'readonly');
    keyInput.style.background = locked ? '#f5f6f8' : '#fff';

    box.appendChild(formRow('页面名称', nameInput));
    var keyRow = formRow('页面标识', keyInput,
      '小程序端路径：pages/custom/index?key=' + p.key +
      (locked ? '。该页面已写进代码包，标识已锁住 —— 旧链接可能已经分享出去，改了会失效（系统会登记别名兜底）。' : ''));
    box.appendChild(keyRow);
    box.appendChild(formRow('备注', noteInput));

    if (locked) {
      var unlock = el('label', 'hint', '');
      unlock.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px;cursor:pointer';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.style.cssText = 'width:auto;margin:0';
      cb.onchange = function () {
        if (cb.checked) {
          keyInput.removeAttribute('readonly');
          keyInput.style.background = '#fff';
          keyInput.focus();
        } else {
          keyInput.setAttribute('readonly', 'readonly');
          keyInput.style.background = '#f5f6f8';
          keyInput.value = p.key;
        }
      };
      unlock.appendChild(cb);
      unlock.appendChild(document.createTextNode('我确认要修改页面标识（旧链接会通过别名继续跳转，但建议尽快更新站内入口）'));
      box.appendChild(unlock);
    }

    // 引用清单：页面标识被哪些地方链接引用（改名前后都值得看）
    var refBox = el('div', 'hint', '正在检查站内引用…');
    refBox.style.marginTop = '6px';
    box.appendChild(refBox);
    if (p.custom) {
      api('GET', '/api/decorate/page/refs', { query: { key: key } })
        .then(function (d) {
          if (!d.count) { refBox.textContent = '站内引用：没有被其他页面链接引用。'; return; }
          refBox.innerHTML = '站内引用（' + d.count + ' 处）：<br>' +
            d.refs.map(function (r) { return '· ' + esc(r.label); }).join('<br>') +
            '<br><span style="color:#8a919e">这些入口指向当前标识；改名后会自动跟到新标识（别名），' +
            '但建议一并更新。</span>';
        })
        .catch(function () { refBox.textContent = ''; });
    }

    var save = el('button', 'btn primary', '保存');
    save.onclick = function () {
      var name = nameInput.value.trim();
      if (!name) { toast('页面名称不能为空', 'err'); nameInput.focus(); return; }
      save.disabled = true;
      api('POST', '/api/decorate/page/rename', {
        body: { key: key, name: name, newKey: keyInput.value.trim(), note: noteInput.value.trim() }
      }).then(function (d) {
        closeModal();
        if (d.renamedFrom) {
          toast('已改名为「' + d.page.name + '」，标识 ' + d.renamedFrom + ' → ' + d.page.key +
            '（旧标识仍可访问，另有 ' + (d.refCount || 0) + ' 处站内引用指向它）', 'ok');
        } else {
          toast('已保存');
        }
        loadPages();
      }).catch(function (e) {
        save.disabled = false;
        toast('保存失败：' + e.message, 'err');
      });
    };
    modal('编辑页面信息', box, [save, btnClose()]);
  }

  /** 删除自定义页面（连带清草稿与版本，并重新生成 replica.js） */
  function deletePage(key) {
    if (!needRole('owner', '删除页面')) return;
    var p = S.pages.filter(function (x) { return x.key === key; })[0];
    if (!p) return;

    // 先拉引用清单：有别的页面/底部导航链接指着它，删除会让那些入口变成空白页，
    // 必须让运营先看到清单再决定（后端也会再拦一次，两边都不放过）。
    api('GET', '/api/decorate/page/refs', { query: { key: key } }).then(function (d) {
      var refs = (d && d.refs) || [];
      var box = el('div');
      box.innerHTML =
        '<div style="line-height:1.9">确定删除 <b>' + esc(p.name) + '</b>？</div>' +
        '<div class="hint" style="margin-top:8px">' +
        '· 该页面的草稿与历史版本会一并清除<br>' +
        '· 会立即重新生成 replica.js，小程序端将无法再打开这个页面<br>' +
        '· 删除前的 replica.js 已自动备份到 server/data/decorate/backup/，需要时可以找回' +
        '</div>' +
        (refs.length
          ? '<div class="tip" style="margin-top:10px;background:#fff5f4;color:#b42318">' +
            '<b>该页面被 ' + refs.length + ' 处引用，删除后这些入口会打不开：</b><br>' +
            refs.map(function (r) { return '· ' + esc(r.label); }).join('<br>') +
            '</div>'
          : '<div class="hint" style="margin-top:10px">站内没有任何地方链接到这个页面。</div>');

      var del = el('button', 'btn danger', refs.length ? '仍然删除' : '删除');
      var cancel = el('button', 'btn', '取消');
      cancel.onclick = closeModal;
      del.onclick = function () {
        del.disabled = true;
        del.textContent = '删除中…';
        api('POST', '/api/decorate/page/delete', { body: { key: key, force: refs.length ? 1 : undefined } })
          .then(function (r) {
            closeModal();
            toast('已删除「' + r.name + '」' +
              (r.removedVersions ? '（清理 ' + r.removedVersions + ' 条版本记录）' : ''));
            if (S.cur && S.cur.key === key) showList(); else loadPages();
          })
          .catch(function (e) {
            del.disabled = false;
            del.textContent = refs.length ? '仍然删除' : '删除';
            toast('删除失败：' + e.message, 'err');
          });
      };
      modal('删除页面', box, [cancel, del]);
    }).catch(function (e) {
      toast('无法读取引用清单：' + e.message, 'err');
    });
  }

  /** 「添加常用组件」（对标有赞组件库底部入口） */
  function addCommonDialog() {
    var lib = S.lib;
    if (!lib) return;
    var box = el('div');
    box.appendChild(el('div', 'hint', '勾选要放进「常用组件」的组件，方便下次一键添加。'));
    var wrap = el('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
    (lib.kinds || []).forEach(function (k) {
      var on = S.common.indexOf(k.kind) !== -1;
      var b = el('button', 'rbg', '');
      var btn = el('button', on ? 'on' : '', esc(k.label));
      btn.style.cssText = 'border-radius:6px;border:1px solid #e8eaee';
      btn.onclick = function () {
        var i = S.common.indexOf(k.kind);
        if (i === -1) S.common.push(k.kind); else S.common.splice(i, 1);
        btn.className = S.common.indexOf(k.kind) !== -1 ? 'on' : '';
        btn.style.border = '1px solid ' + (S.common.indexOf(k.kind) !== -1 ? '#155bd4' : '#e8eaee');
      };
      if (on) btn.style.border = '1px solid #155bd4';
      wrap.appendChild(btn);
    });
    box.appendChild(wrap);
    var save = el('button', 'btn primary', '保存常用组件');
    save.onclick = function () {
      try { localStorage.setItem('decoCommon', JSON.stringify(S.common)); } catch (e) { /* ignore */ }
      S.libTab = 'common';
      renderLib();
      closeModal();
      toast('常用组件已更新');
    };
    modal('添加常用组件', box, [save, btnClose()]);
  }

  /* ----------------------------- 事件绑定 ----------------------------- */

  /** 键盘快捷键说明（顶栏「?」或 Ctrl / ⌘ + K 打开） */
  function keysDialog() {
    var rows = [
      ['Ctrl / ⌘ + S', '保存草稿'],
      ['Ctrl / ⌘ + Enter', '生成代码（写回 replica.js，不等于线上生效）'],
      ['Ctrl / ⌘ + K', '打开这个快捷键说明'],
      ['Esc', '关闭弹层 / 退出图片大图预览'],
      ['点击手机预览里的区块', '直接在预览中选中该组件'],
      ['拖拽「页面布局」里的手柄', '调整区块顺序']
    ];
    var html = '<table class="keys-tb"><tbody>' + rows.map(function (r) {
      return '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table>' +
      '<div class="hint" style="margin-top:10px">Mac 上 ⌘ 与 Ctrl 等价；快捷键在输入框内不生效，可以放心打字。</div>';
    modal('键盘快捷键', html, [btnClose()]);
  }

  $('btnKeys').onclick = keysDialog;
  $('btnReload').onclick = function () { withBusy($('btnReload'), function () { return loadPages(); }).then(function () { toast('已刷新'); }); };
  $('btnFilter').onclick = function () {
    S.filters.name = $('fName').value;
    S.filters.status = $('fStatus').value;
    S.filters.belongs = $('fBelongs').value;
    renderList();
  };
  $('btnResetFilter').onclick = function () {
    $('fName').value = ''; $('fStatus').value = ''; $('fBelongs').value = '';
    S.filters = { name: '', status: '', belongs: '' };
    renderList();
  };

  $('btnCreatePage').onclick = createPageDialog;

  /*
   * 列表页的点击委托挂在 document 上。
   *
   * 原来只绑在 #pageRows（页面表格）上 —— 这次新增的「店铺导航」卡片在表格**之外**，
   * 沿用旧写法会点了没反应（按钮有、事件收不到，最难查的一类 bug）。
   * 改用 closest 取最近的命中元素：按钮里的文字节点也能点中。
   * 用「列表视图可见」做闸门，避免编辑器视图里的同名 data-* 属性被误处理。
   */
  document.addEventListener('click', function (e) {
    if ($('viewList').hidden) return;
    var t = e.target && e.target.closest
      ? e.target.closest('[data-open],[data-diff],[data-vers],[data-discard],[data-rename],[data-del]')
      : null;
    if (!t) return;
    var key = t.getAttribute('data-open'); if (key) { openPage(key); return; }
    key = t.getAttribute('data-diff'); if (key) { showDiff(key); return; }
    key = t.getAttribute('data-vers'); if (key) { showVersions(key); return; }
    key = t.getAttribute('data-discard'); if (key) { discardDraft(key); return; }
    key = t.getAttribute('data-rename'); if (key) { renamePageDialog(key); return; }
    key = t.getAttribute('data-del'); if (key) { deletePage(key); return; }
  });

  $('btnBack').onclick = function () {
    if (S.dirty && !confirm('有未保存的改动，确定退出编辑器？')) return;
    showList();
  };
  $('btnSave').onclick = function () { withBusy($('btnSave'), saveDraft); };
  $('btnPublish').onclick = function () { withBusy($('btnPublish'), publish); };
  $('btnDiff').onclick = function () { showDiff(); };
  $('btnVersions').onclick = function () { showVersions(); };
  $('btnDiscard').onclick = function () { discardDraft(); };
  $('btnAddCommon').onclick = addCommonDialog;
  $('btnPageSetting').onclick = pageSetting;
  /*
   * 机型：手机壳始终按 375 基准渲染，用 zoom 等比缩放 —— 与 /preview 的同名控件口径一致
   * （rpx 本身就是等比缩放，真机换宽度也是等比放大，不是把「375 基准的 px 值」硬塞进窄壳子里）。
   * 只改 width 是错的：换成 320 内容会挤爆、换成 414 右边缘留白。
   */
  $('deviceSel').onchange = function () {
    S.device = Number($('deviceSel').value) || 375;
    $('phone').style.zoom = String(S.device / 375);
  };
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  $('imgPreview').onclick = function () { $('imgPreview').hidden = true; };
  $('btnWho').onclick = buttonWho;

  document.addEventListener('keydown', function (e) {
    // Esc：关掉最上层的弹层与图片大图（任何时候都生效）
    if (e.key === 'Escape') { $('imgPreview').hidden = true; closeModal(); return; }
    // 其余快捷键都要求 Ctrl / ⌘，且在输入框里打字时不劫持
    if (!(e.ctrlKey || e.metaKey)) return;
    var k = String(e.key || '').toLowerCase();
    if (k === 's') {
      e.preventDefault();
      if (!S.cur) return;
      if (!S.dirty) { toast('没有需要保存的改动'); return; }
      withBusy($('btnSave'), saveDraft);
      return;
    }
    if (k === 'enter') {
      e.preventDefault();
      if (S.cur) withBusy($('btnPublish'), publish);
      return;
    }
    if (k === 'k') { e.preventDefault(); keysDialog(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ----------------------------- 启动 ----------------------------- */
  setTopbar('list');
  // 只有令牌没有身份时先补齐，否则首屏会把已登录用户渲染成「未登录」
  hydrateSession().then(function () {
    renderWho();
    loadPages();
  });

  window.__admin = {
    S: S, openPage: openPage, saveDraft: saveDraft, publish: publish, loadPages: loadPages,
    addComponent: addComponent, renderPreview: renderPreview, select: select,
    createPageDialog: createPageDialog, renamePageDialog: renamePageDialog, deletePage: deletePage,
    linkPicker: linkPicker, linkLabel: linkLabel, loadLinkOptions: loadLinkOptions,
    linkOptions: function () { return LINK_OPTS; },
    hydrateSession: hydrateSession, session: function () { return { token: token(), me: me() }; },
    renderInspector: renderInspector, write: write
  };
})();
