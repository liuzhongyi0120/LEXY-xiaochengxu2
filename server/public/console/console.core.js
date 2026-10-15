/**
 * 后台控制台 · 核心（路由 / 请求 / 通用组件 / 数据概览 / 店铺设置）
 *
 * 零依赖，纯浏览器端。模块页面注册到 App.views，由 App.go(name) 切换。
 * 与装修台（/admin）的区别：装修台改的是「小程序页面长什么样」，控制台管的是「商品/订单/客户/营销」。
 */

/* ============================== 基础工具 ============================== */

const $ = (sel, root) => (root || document).querySelector(sel);

/** HTML 转义（所有后端数据进模板前必须过一遍） */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const fen2yuan = (fen) => (Number(fen || 0) / 100).toFixed(2);
const money = (fen) => '¥' + Number(fen2yuan(fen)).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wan = (fen) => {
  const y = Number(fen || 0) / 100;
  if (y >= 10000) return '¥' + (y / 10000).toFixed(2) + ' 万';
  return money(fen);
};

function fmtTime(ts, withTime) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  const p = (v) => String(v).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime === false ? day : `${day} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromNow(ts) {
  if (!ts) return '—';
  const diff = Date.now() - Number(ts);
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
}

/* ============================== 头像 ============================== */

/**
 * 头像单元格（客户 / 订单 / 评价三处共用）。
 *
 * ⚠️ 为什么不能直接写 `<img class="avatar" src="{{avatar}}">`：
 *   后台数据里大量客户**根本没有头像**（小程序虚拟用户、从未授权头像），
 *   而 `<img src="">` 在浏览器里不是「空白」而是**「加载失败」** ——
 *   渲染出来是一枚带裂图图标的灰色虚框。客户管理、评价管理两页各挂着几枚，
 *   整张表看着就像坏了。所以：
 *     · 没地址      → 直接渲染首字母文字块（.avatar.letter）
 *     · 有地址但失败 → 由 sweepImages() 兜底换成同样的文字块
 */
function avatarHtml(url, name) {
  const ch = esc(String(name == null ? '' : name).trim().slice(0, 1) || '客');
  if (!url) return '<span class="avatar letter">' + ch + '</span>';
  // 只带一个 data-ch 标记，真正替换交给 sweepImages()——在属性里拼 HTML 极易引号转义出错
  return '<img class="avatar" src="' + esc(url) + '" alt="" data-ch="' + ch + '">';
}

/**
 * 把「已确定加载失败」的图片处理掉。
 *
 * 必须主动扫一遍，不能只听 error 事件：图片 URL 失败会被缓存，**同一 URL 再次插入**时
 * 浏览器直接以 complete=true / naturalWidth=0 落地、不再重发 error 事件，
 * 于是「列表翻页后第二页的破图又回来了」。所以在每次视图渲染完成后扫一次。
 *
 * 两类：
 *   · img.avatar            → 换成首字母文字块（人是主体，不能只剩一个框）
 *   · img[data-optional]    → 直接移除（分类图标这类**装饰性**小图，认不出是哪张也无所谓，
 *                             留个破图框反而更糟；演示数据里的分类图标还是 placehold.co 外链，
 *                             断网 / 内网环境必然加载不到）
 */
function sweepImages(root) {
  const scope = root || document;
  scope.querySelectorAll('img.avatar').forEach((im) => {
    if (!im.complete || im.naturalWidth > 0) return;
    const span = document.createElement('span');
    span.className = 'avatar letter';
    span.textContent = im.getAttribute('data-ch') || '客';
    im.replaceWith(span);
  });
  scope.querySelectorAll('img[data-optional]').forEach((im) => {
    if (!im.complete || im.naturalWidth > 0) return;
    im.remove();
  });
}

/* error 事件不冒泡，必须在捕获阶段接；用于「渲染后才失败的图」（sweep 已扫过一遍） */
document.addEventListener('error', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'IMG') return;
  if (el.classList.contains('avatar')) {
    const span = document.createElement('span');
    span.className = 'avatar letter';
    span.textContent = el.getAttribute('data-ch') || '客';
    el.replaceWith(span);
  } else if (el.hasAttribute('data-optional')) {
    el.remove();
  }
}, true);

/* ============================== 管理员会话 ============================== */

/**
 * 管理员令牌的本地存放处。
 *
 * ⚠️ 为什么必须做这一步（而不是「后台页面本身就是权限」）：
 *   服务端已对 `/api/admin/*`、`/api/decorate/*`、`/api/media/*` 全部要求管理员令牌，
 *   前端不带令牌的话每个请求都会 401 —— 页面能打开，但一行数据都拿不到。
 *
 * 令牌只存在 localStorage，且与「小程序用户令牌」是两个不同的键，
 * 两者在服务端也互不通用（管理员令牌没有 userId，用户令牌没有 admin 标记）。
 */
const AdminSession = {
  TOKEN_KEY: 'lexy_admin_token',
  ME_KEY: 'lexy_admin_me',
  _token: null,
  _me: null,

  token() {
    if (this._token === null) {
      try { this._token = localStorage.getItem(this.TOKEN_KEY) || ''; } catch (e) { this._token = ''; }
    }
    return this._token;
  },

  me() {
    if (this._me === null) {
      try { this._me = JSON.parse(localStorage.getItem(this.ME_KEY) || 'null'); } catch (e) { this._me = null; }
    }
    return this._me;
  },

  save(token, me) {
    this._token = String(token || '');
    this._me = me || null;
    try {
      if (this._token) localStorage.setItem(this.TOKEN_KEY, this._token);
      else localStorage.removeItem(this.TOKEN_KEY);
      if (this._me) localStorage.setItem(this.ME_KEY, JSON.stringify(this._me));
      else localStorage.removeItem(this.ME_KEY);
    } catch (e) { /* 隐私模式下 localStorage 不可写：本次会话内仍可用 */ }
    renderWho();
  },

  clear() { this.save('', null); },

  /**
   * 补齐身份缓存。
   *
   * 令牌与「我是谁」是两条 localStorage 记录：只留下令牌时（换浏览器配置、
   * 手工塞令牌、装修台登录后另一处清了缓存），me() 会是 null ——
   * 于是接口能调通、界面却把每个按钮都当成「未登录」，点一下弹一次登录框。
   * 这里在启动时用令牌向服务端换一次身份，两边保持一致。
   */
  async hydrate() {
    if (this.me() || !this.token()) return this.me();
    try {
      // 注意签名：API.call(path, opts) —— path 在前，别写成 (method, path)
      const who = await API.call('/api/admin/session');
      this.save(this.token(), who);
    } catch (e) {
      // 401 = 令牌真的失效（下面流程会引导重新登录），其余情况是 bug，必须留痕，
      // 否则「静默吞掉」会让界面一直是「未登录」，排查时无从下手。
      if (e && e.code !== 401) console.warn('[admin] 身份补齐失败：', e && e.message);
    }
    return this.me();
  },

  /** 当前角色是否够用（前端只用来做按钮灰显，真正的拦截在服务端） */
  atLeast(role) {
    const rank = { viewer: 1, operator: 2, owner: 3 };
    const me = this.me();
    return !!me && rank[me.role] >= rank[role];
  }
};

/* ============================== 请求层 ============================== */

const API = {
  async call(path, { method = 'GET', query, body } = {}) {
    let url = path;
    if (query) {
      const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
      if (qs) url += (url.indexOf('?') > -1 ? '&' : '?') + qs;
    }
    const opt = { method, headers: {} };
    const tk = AdminSession.token();
    if (tk) opt.headers['Authorization'] = 'Bearer ' + tk;
    if (body && method !== 'GET') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(url, opt);
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error('服务端返回异常（HTTP ' + res.status + '）'); }
    if (json.code !== 0) {
      const err = new Error(json.msg || '请求失败');
      err.code = json.code;
      err.httpStatus = res.status;
      // 401：没登录 / 令牌过期 —— 清掉旧令牌并拉起登录框（不弹 toast，避免刷屏）
      if (json.code === 401) {
        if (AdminSession.token()) AdminSession.clear();
        openLogin({ reason: json.msg });
      }
      throw err;
    }
    return json.data;
  },
  get: (path, query) => API.call(path, { query }),
  post: (path, body) => API.call(path, { method: 'POST', body: body || {} })
};

/* ============================== 提示与弹层 ============================== */

let toastTimer = null;
function toast(msg, isErr) {
  const old = $('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), isErr ? 3200 : 1900);
}

function loading(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text || '加载中…';
  document.body.appendChild(el);
  return () => el.remove();
}

/**
 * 打开弹层
 * @param {{title:string, html:string, footer?:string, width?:'wide'|'narrow'}} opt
 * @returns {{root:HTMLElement, close:Function}}
 */
function openModal(opt) {
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.innerHTML =
    '<div class="modal ' + (opt.width || '') + '">' +
      '<div class="modal-h"><b>' + esc(opt.title || '') + '</b><button class="x" data-close>×</button></div>' +
      '<div class="modal-b">' + (opt.html || '') + '</div>' +
      (opt.footer === null ? '' : '<div class="modal-f">' + (opt.footer || '<button class="btn" data-close>关闭</button>') + '</div>') +
    '</div>';
  $('#layer').appendChild(mask);
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => {
    if (e.target === mask || e.target.hasAttribute('data-close')) close();
  });
  return { root: mask, close, $: (sel) => mask.querySelector(sel) };
}

/** 二次确认 */
function confirmBox(msg, okText) {
  return new Promise((resolve) => {
    const m = openModal({
      title: '请确认',
      width: 'narrow',
      html: '<div style="padding:6px 0 2px;line-height:1.7">' + msg + '</div>',
      footer: '<button class="btn" data-cancel>取消</button><button class="btn primary" data-ok>' + esc(okText || '确定') + '</button>'
    });
    m.root.querySelector('[data-cancel], .x').addEventListener('click', () => resolve(false));
    m.root.querySelectorAll('.x').forEach((x) => x.addEventListener('click', () => resolve(false)));
    m.root.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(true); });
  });
}

/** 输入框弹层（新建 / 重命名文件夹等场景），返回 Promise<string|null>；取消返回 null */
function promptBox(title, defaultValue, placeholder) {
  return new Promise((resolve) => {
    const m = openModal({
      title: title,
      width: 'narrow',
      html: '<div class="field" style="padding:4px 0"><input type="text" data-input style="flex:1" placeholder="' +
        esc(placeholder || '') + '" value="' + esc(defaultValue || '') + '"></div>',
      footer: '<button class="btn" data-cancel>取消</button><button class="btn primary" data-ok>确定</button>'
    });
    const input = m.root.querySelector('[data-input]');
    const done = (v) => { m.close(); resolve(v); };
    setTimeout(() => { input.focus(); input.select(); }, 30);
    m.root.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    m.root.querySelector('[data-ok]').addEventListener('click', () => done(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      if (e.key === 'Escape') done(null);
    });
    // 点遮罩或右上角 × 也要收尾，否则 Promise 永远挂起（调用方 await 后整段逻辑不执行）
    m.root.addEventListener('click', (e) => {
      if (e.target === m.root || e.target.hasAttribute('data-close')) done(null);
    });
  });
}

/* ============================== 管理员登录与身份 ============================== */

const ROLE_TEXT = { viewer: '只读', operator: '运营', owner: '超级管理员' };

/**
 * 身份的显示文案。
 *
 * ⚠️ 名字与角色标签**经常会一模一样**：口令登录拿到的就是 owner，
 *    服务端 `issue('owner', '超级管理员')` 让 name 与 roleLabel 都是「超级管理员」，
 *    直接拼 `name · roleLabel` 会在顶栏显示成「超级管理员 · 超级管理员」。
 *    所以这里去重：两者相同（或名为空）时只显示一次。
 * @returns {{text:string, title:string}} text=顶栏文案；title=悬停说明
 */
function whoText(me) {
  if (!me) return { text: '未登录管理员', title: '点击使用管理员口令或长期令牌登录' };
  const roleText = String(me.roleLabel || ROLE_TEXT[me.role] || '').trim();
  const name = String(me.name || '').trim();
  const text = name && roleText && name !== roleText ? name + ' · ' + roleText : (name || roleText || '管理员');
  return { text, title: '当前身份：' + text };
}

/** 同步顶栏的「当前身份」显示 */
function renderWho() {
  const btn = $('#btnWho');
  const tag = $('#whoTag');
  const me = AdminSession.me();
  if (btn) {
    btn.textContent = me ? '退出' : '登录';
    btn.title = me
      ? '来源：' + (me.source === 'env' ? '长期令牌' : '口令登录会话') + '，点击退出'
      : '点击使用管理员口令或长期令牌登录';
  }
  if (tag) {
    // ⚠️ 不要用 hidden 属性切换 —— 「.tag」自带 display，会盖过 UA 的 [hidden]{display:none}
    tag.textContent = whoText(me).text;
    tag.title = whoText(me).title;
    /* 已登录用 .id（中性）而不是 .on（绿）：
     * .on 在整套后台里表示「上架 / 发放中 / 正常」这类**业务状态**，
     * 拿来标「超级管理员」会让身份看着像一个状态，且顶栏右侧多出一块绿，抢注意力。
     * 身份回答的是「我是谁」，中性色就够；未登录才需要描边（.ghost）提示「这里要处理」。 */
    tag.className = 'tag ' + (me ? 'id' : 'ghost');
  }
}

/**
 * 引导去登录页。
 *
 * ⚠️ 2026-10-15 起这里**不再弹框**，改成跳「登录」栏目（App.views.login，左侧导航栏里那一栏）。
 *    原因：登录界面原来只存在于一个弹层里，「登录」就没有自己的位置 ——
 *    未登录时能看到整套导航、点进去只有一屏 401，而真正能做事的地方藏着。
 *    现在登录是一个正常页面，未登录时整个后台强制落在它上面。
 *
 * 保留这个函数名与签名，是因为调用点有四处（顶栏、401、needRole、退出），
 * 全部改成「跳页面」比在四处各写一遍 `App.go('login')` 更不容易漏。
 * @param {{reason?:string}} [info] 为什么被叫来登录（显示在表单上方）
 */
function openLogin(info) {
  if (AdminSession.me()) return;              // 已有身份（别的标签页刚登录）就不再打扰
  if (App.view === GATE_VIEW) return;         // 已经在登录页：避免 401 → 跳登录 → 再 401 的死循环
  if (info && info.reason) loginReason = String(info.reason);
  App.go(GATE_VIEW);
}

/** 登录页表单上方的一句话（「会话已过期」这类上下文，比干巴巴一个登录框有用） */
let loginReason = '';

/** 顶栏身份按钮：未登录 → 去登录页；已登录 → 确认后退出 */
async function onTapWho() {
  if (!AdminSession.me()) return openLogin({});
  if (await confirmBox('退出管理后台登录？退出后需重新登录（成员账号或共享口令）。')) {
    AdminSession.clear();
    toast('已退出管理员登录');
    /* 重跑 boot：它会重新认身份、按 gate 落回登录页，并刷新顶栏与导航锁态。
     * 不在这里逐件手动刷新，是为了「退出」与「刷新页面」走同一条路 ——
     * 两处各写一套，迟早有一处忘了更新导航锁态。 */
    boot();
  }
}

/**
 * 需要某个角色才能做的事，前端先拦一道（给出人话提示）。
 * 真正的判定在服务端 —— 这里只是把「点了才报错」提前成「点之前就说清」。
 */
function needRole(role, action) {
  if (AdminSession.atLeast(role)) return true;
  if (!AdminSession.me()) openLogin({ reason: '该操作需要管理员身份' });
  else toast('当前身份「' + (ROLE_TEXT[(AdminSession.me() || {}).role] || '未知') +
    '」无权' + (action || '执行该操作') + '（需要「' + (ROLE_TEXT[role] || role) + '」及以上）', true);
  return false;
}

/** 角色能做什么 —— 直接对着服务端的规则说人话，别让人试出来 */
function roleHint(role) {
  if (role === 'owner') return '全部权限：改商品/订单/客户/营销与设置，还能删素材、发布装修、管成员。';
  if (role === 'operator') return '日常运营：改商品价格库存、上下架、发货、回评、上传素材、存装修草稿；删素材与发布装修要超级管理员。';
  if (role === 'viewer') return '只读：能看所有列表与详情，不能做任何修改。';
  return '未知角色，请联系超级管理员确认。';
}

/** 登录成功后的收尾：带着新身份回到数据概览（并补一次角标） */
function afterLogin() {
  loginReason = '';
  renderWho();
  App.view = 'dashboard';
  location.hash = '#dashboard';
  App.renderNav();
  App.render();
  App.refreshBadges();
}

/* ============================== 大图预览 ============================== */

/**
 * 大图预览浮层（素材库点缩略图打开）
 *
 * 四个刻意的取舍，都是为了让「看图」这件事不出岔子：
 *   ① 由调用方传入**当前这一页的整个列表** + 当前下标，而不是只传一张图的地址。
 *      这样 ←/→ 翻的就是「你正在看的这个筛选结果」，预览层不必自己再发一次请求 ——
 *      也就不会出现「预览里的顺序和网格里的顺序对不上」这种事后很难查的错位。
 *   ② 切换只改 <img> 的 src，不重建浮层：重建会让遮罩闪一下。
 *      相邻一张提前 `new Image()` 预载，翻页不空等（视频不预载，代价不成比例）。
 *   ③ 加载失败必须给可见提示 + 兜底入口 —— 素材可能刚在别处被删掉，
 *      此时白屏会让人以为「后台坏了」，而不是「这张图没了」。
 *   ④ 键盘监听挂在 document 上，关闭时必须解绑：否则关掉预览后按 ←/→，
 *      事件还会打到已经不在屏幕上的浮层上。
 *
 * 视频分支（kind === 'video'）：
 *   同一套翻页 / 删除 / 下载逻辑，只是把 <img> 换成 <video controls>；
 *   切走或关闭时**必须 pause + 清 src**，否则会在后台继续缓冲、甚至继续出声。
 *
 * @param {{list:Array, index?:number, actions?:boolean,
 *          onDelete?:Function, onPick?:Function, pickText?:string}} opt
 *        onDelete(item) 返回 Promise<boolean>，resolve true 表示「确实删掉了」，
 *        浮层会把它从当前列表里摘掉并跳到下一张（全删光则自动关闭）。
 * @returns {{close:Function}}
 */
/**
 * 下载一个素材（预览浮层与卡片的「下载」共用这一份实现）
 *   - 本站素材（/uploads/… 或同源）：<a download> 直接落盘，文件名取原始名
 *   - 外链（有赞 CDN 等）：跨域下 download 属性会被忽略，只能新窗口打开
 * 抽出来的原因和删除一样：两处各写一份，迟早会有一处忘了处理外链。
 */
function downloadUrl(it) {
  const url = (it && it.url) ? it.url : String(it || '');
  if (!url) return;
  const same = url.indexOf('/uploads/') === 0 || url.indexOf(location.origin) === 0;
  const a = document.createElement('a');
  a.href = url;
  if (same) a.download = String((it && (it.orig || it.name)) || 'media').replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_');
  else a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function lightbox(opt) {
  const list = (opt.list || []).filter((x) => x && x.url).slice();
  if (!list.length) return { close() {} };

  let i = Math.min(Math.max(0, Number(opt.index) || 0), list.length - 1);
  const showActions = opt.actions !== false;
  const single = list.length < 2;

  const el = document.createElement('div');
  /*
   * 根类名刻意叫 `lbx` 而不是 `lb`：`lb`（label 的缩写）太短、太容易被别处占用 ——
   * 概览页销售趋势图的 x 轴标签就是 `<div class="lb">`，CSS 里那条裸 `.lb{position:fixed;inset:0}`
   * 会把 7 个图例一起变成铺满全屏的深色层，整页看起来就是「黑屏」。
   * 子元素类名（lb-h / lb-view …）保持不变但 CSS 里一律挂在 .lbx 之下，杜绝同类事故。
   */
  el.className = 'lbx';
  el.innerHTML =
    '<div class="lb-h">' +
      '<div class="lb-t"><b data-name></b><span class="lb-meta" data-meta></span></div>' +
      '<span class="grow"></span>' +
      (single ? '' : '<span class="lb-idx" data-idx></span>') +
      '<button class="lb-x" data-close title="关闭（Esc）">×</button>' +
    '</div>' +
    '<div class="lb-stage">' +
      (single ? '' : '<button class="lb-nav prev" data-prev title="上一张（←）">‹</button>') +
      '<div class="lb-view">' +
        '<img data-img alt="">' +
        '<video data-video controls playsinline preload="metadata" hidden></video>' +
        '<div class="lb-tip" data-tip>加载中…</div>' +
        '<div class="lb-err" data-err hidden>' +
          '<b data-errtitle>加载失败</b>' +
          '<span class="sub" data-errmeta></span>' +
          '<button class="btn sm" data-new>在新窗口打开</button>' +
        '</div>' +
      '</div>' +
      (single ? '' : '<button class="lb-nav next" data-next title="下一张（→）">›</button>') +
    '</div>' +
    '<div class="lb-f">' +
      '<span class="grow"></span>' +
      (opt.onPick ? '<button class="btn sm primary" data-pickbtn>' + esc(opt.pickText || '使用这张') + '</button>' : '') +
      (showActions
        ? '<button class="btn sm" data-copy>复制地址</button>' +
          '<button class="btn sm" data-down>下载</button>'
        : '') +
      (opt.onDelete ? '<button class="btn sm danger" data-del>删除</button>' : '') +
    '</div>';

  const q = (s) => el.querySelector(s);
  const img = q('[data-img]');
  const vid = q('[data-video]');
  const tip = q('[data-tip]');
  const errBox = q('[data-err]');

  /** 是不是视频：优先看后端的 kind，外链（导入的旧素材）则用扩展名兜底 */
  const isVideo = (it) => (it.kind ? it.kind === 'video' : /\.(mp4|m4v|mov|webm)(\?|$)/i.test(String(it.url || '')));

  /** 只换 src，不重建浮层；同一张重复渲染时跳过赋值（同 src 再赋值不会重新触发 load） */
  const show = () => {
    const it = list[i];
    const video = isVideo(it);
    q('[data-name]').textContent = it.orig || it.name || '';
    const bits = [];
    if (it.width && it.height) bits.push(it.width + '×' + it.height);
    if (it.size) bits.push((it.size / 1024).toFixed(0) + 'KB');
    if (video && it.durationText) bits.push('时长 ' + it.durationText);
    if (it.folder) bits.push('文件夹：' + it.folder);
    q('[data-meta]').textContent = bits.join('  ·  ');
    const idxEl = q('[data-idx]');
    if (idxEl) idxEl.textContent = (i + 1) + ' / ' + list.length;

    errBox.setAttribute('hidden', '');
    q('[data-errtitle]').textContent = video ? '视频加载失败' : '图片加载失败';

    // 切换时把用不到的那一路彻底停掉：视频不 pause + 清 src 会在后台继续下载 / 出声
    if (video) {
      img.setAttribute('hidden', '');
      img.removeAttribute('src');
      vid.removeAttribute('hidden');
      if (vid.getAttribute('src') !== it.url) {
        vid.setAttribute('src', it.url);
        tip.textContent = '加载中…';
        tip.removeAttribute('hidden');
      } else {
        tip.setAttribute('hidden', '');
      }
    } else {
      vid.pause();
      vid.setAttribute('hidden', '');
      vid.removeAttribute('src');   // 清 src 才会真正停止缓冲，只 hidden 不够
      vid.load();
      img.removeAttribute('hidden');
      if (img.getAttribute('src') !== it.url) {
        tip.textContent = '加载中…';
        tip.removeAttribute('hidden');
        img.setAttribute('src', it.url);
        // 命中缓存时浏览器不会派发 load 事件（网格里的缩略图早就把这张拉过了），
        // 不校对的话「加载中…」会一直挂着。这里补一次判定。
        const settle = () => { if (img.complete && img.naturalWidth > 0) tip.setAttribute('hidden', ''); };
        settle();
        setTimeout(settle, 60);
      }
    }
    // 预载下一张：翻页时不至于先看到空白（视频不预载 —— 视频首帧要 Range 拉一段，代价不成比例）
    if (!single) {
      const nextIt = list[(i + 1) % list.length];
      if (nextIt && nextIt.url !== it.url && !isVideo(nextIt)) { const pre = new Image(); pre.src = nextIt.url; }
    }
    q('[data-errmeta]').textContent = it.url;
  };

  const fail = () => {
    tip.setAttribute('hidden', '');
    errBox.removeAttribute('hidden');
  };
  img.addEventListener('load', () => tip.setAttribute('hidden', ''));
  img.addEventListener('error', fail);
  // 视频：loadeddata 之前撤占位；错误（格式不支持 / 文件没了）同样给可见提示
  vid.addEventListener('loadeddata', () => tip.setAttribute('hidden', ''));
  vid.addEventListener('error', fail);

  const step = (d) => { i = (i + d + list.length) % list.length; show(); };
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (single) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // 关掉浮层必须停掉视频：只 remove 节点的话，部分浏览器会把已经缓冲的片段继续播完
    vid.pause();
    vid.removeAttribute('src');
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevOverflow;
    el.remove();
    if (opt.onClose) opt.onClose();
  };

  q('[data-close]').addEventListener('click', close);
  const pv = q('[data-prev]'); if (pv) pv.addEventListener('click', () => step(-1));
  const nx = q('[data-next]'); if (nx) nx.addEventListener('click', () => step(1));

  // 复制地址：非 https 环境（内网 http）没有 clipboard API，退化为直接显示地址
  const cp = q('[data-copy]');
  if (cp) cp.addEventListener('click', async () => {
    const u = list[i].url;
    try { await navigator.clipboard.writeText(u); toast('已复制：' + u); } catch (e) { toast(u); }
  });

  const dn = q('[data-down]');
  if (dn) dn.addEventListener('click', () => downloadUrl(list[i]));

  const pk = q('[data-pickbtn]');
  if (pk) pk.addEventListener('click', () => { const it = list[i]; close(); opt.onPick(it); });

  // 加载失败时的兜底出口：至少让人能拿到地址，而不是只看到一个「失败」
  const nw = q('[data-new]');
  if (nw) nw.addEventListener('click', () => { try { window.open(list[i].url, '_blank', 'noopener'); } catch (e) { /* 弹窗被拦也不影响其它操作 */ } });

  const dl = q('[data-del]');
  if (dl) dl.addEventListener('click', async () => {
    const ok = await opt.onDelete(list[i]);
    if (!ok) return;
    list.splice(i, 1);
    if (!list.length) { close(); return; }
    if (i >= list.length) i = 0;            // 删的是最后一张 → 回绕，而不是越界取到 undefined
    show();
  });

  /*
   * 点空白处关闭。
   * 判定必须用「点到的**元素**是不是媒体本身」，不能用容器（早先写成 `.lb-view`）——
   * `.lb-view` 是铺满整个舞台的 flex 容器，图片四周的留白全都在它里面，
   * 于是"点空白关不掉、只有点最外圈几像素才关"，等于这个功能形同虚设。
   * 现在：点在图片 / 视频上不关（凑近看细节时最容易误触），其余任何位置一律关闭。
   */
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) return;
    if (t.closest && (t.closest('.lb-nav') || t.closest('.lb-h') || t.closest('.lb-f') || t.closest('.lb-err'))) return;
    close();
  });

  document.addEventListener('keydown', onKey, true);
  (document.getElementById('layer') || document.body).appendChild(el);
  show();

  return { close: close };
}

/* ============================== 图片选择器 ============================== */

/**
 * 选图（本地上传 / 素材库 / 外链），返回 Promise<string[]>
 * @param {{multi?:boolean, max?:number, value?:string[]}} opt
 */
function pickImage(opt) {
  const o = opt || {};
  const multi = !!o.multi;
  const max = o.max || (multi ? 9 : 1);
  const picked = (o.value || []).slice(0, max);

  return new Promise((resolve) => {
    const html =
      '<div class="tabs" style="display:flex;gap:6px;margin-bottom:12px">' +
        '<button class="btn sm tab on" data-tab="upload">本地上传</button>' +
        '<button class="btn sm tab" data-tab="lib">素材库</button>' +
        '<button class="btn sm tab" data-tab="url">外链地址</button>' +
      '</div>' +
      '<div data-pane="upload">' +
        '<div class="upzone" data-zone><b>点击选择图片</b>，或把图片拖到这里<br><span class="sub">支持 PNG / JPG / WebP / GIF，单张 ≤ 5MB</span>' +
        '<input type="file" accept="image/*" multiple hidden data-file></div>' +
        '<div class="media-grid" style="margin-top:10px" data-uplist></div>' +
      '</div>' +
      '<div data-pane="lib" hidden>' +
        '<div class="filter" style="padding:0 0 10px;border:0"><input type="text" class="w160" placeholder="搜索素材…" data-q>' +
        '<select class="w120" data-sort><option value="new">最新</option><option value="old">最早</option><option value="big">最大</option></select>' +
        '<span class="sub" data-stat></span></div>' +
        '<div class="media-grid" data-liblist></div>' +
      '</div>' +
      '<div data-pane="url" hidden>' +
        '<div class="field"><label>图片地址</label><input type="text" class="w220" style="flex:1" placeholder="https://… 或 /uploads/…" data-url>' +
        '<button class="btn" data-addurl>添加</button></div>' +
        '<div class="sub" style="margin-top:8px">支持外链，也支持本站素材相对路径 /uploads/…</div>' +
      '</div>' +
      '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">' +
        '<div class="sub" style="margin-bottom:6px">已选 <b data-cnt>0</b> / ' + max + '</div>' +
        '<div class="img-list" data-picked></div>' +
      '</div>';

    const m = openModal({
      title: multi ? '选择图片（可多选）' : '选择图片',
      width: 'wide',
      html,
      footer: '<span class="grow sub" data-foot></span><button class="btn" data-close>取消</button><button class="btn primary" data-ok>确定</button>'
    });

    const root = m.root;
    const renderPicked = () => {
      root.querySelector('[data-cnt]').textContent = picked.length;
      root.querySelector('[data-picked]').innerHTML = picked.length
        ? picked.map((u, i) => '<div class="img-slot filled" style="background-image:url(' + esc(u) + ')"><button class="del" data-rm="' + i + '">×</button><span class="lv">' + (i + 1) + '</span></div>').join('')
        : '<span class="sub">还没有选图片</span>';
      root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
        picked.splice(Number(b.getAttribute('data-rm')), 1);
        renderPicked();
      }));
    };

    const add = (urls) => {
      (Array.isArray(urls) ? urls : [urls]).forEach((u) => {
        if (!u) return;
        if (picked.length >= max) { toast('最多选 ' + max + ' 张', true); return; }
        if (picked.indexOf(u) === -1) picked.push(u);
      });
      renderPicked();
    };

    /* --- tab 切换 --- */
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('primary', 'on'));
        btn.classList.add('primary', 'on');
        const t = btn.getAttribute('data-tab');
        root.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.getAttribute('data-pane') !== t; });
        if (t === 'lib') loadLib();
      });
    });
    root.querySelector('[data-tab]').classList.add('primary', 'on');

    /* --- 本地上传 --- */
    const upload = async (files) => {
      const list = Array.from(files || []).filter((f) => f.type.indexOf('image/') === 0);
      if (!list.length) return;
      const stop = loading('上传中…');
      const box = root.querySelector('[data-uplist]');
      try {
        for (const f of list) {
          const fd = new FormData();
          fd.append('file', f, f.name);
          const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.msg || '上传失败');
          const up = json.data.list[0];
          add(up.url);
          box.insertAdjacentHTML('afterbegin',
            '<div class="media-it">' +
              '<div class="mt"><img src="' + esc(up.url) + '" alt=""></div>' +
              '<div class="inf"><div class="nm">' + esc(f.name) + '</div>' +
              '<div class="meta">' + up.width + '×' + up.height + '</div></div></div>');
        }
        toast('上传成功，已自动勾选');
      } catch (e) {
        toast(e.message, true);
      } finally { stop(); }
    };
    root.querySelector('[data-zone]').addEventListener('click', () => root.querySelector('[data-file]').click());
    root.querySelector('[data-file]').addEventListener('change', (e) => upload(e.target.files));
    const zone = root.querySelector('[data-zone]');
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('on'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('on'); }));
    zone.addEventListener('drop', (e) => upload(e.dataTransfer.files));
    root.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) upload(items);
    });

    /* --- 素材库 --- */
    let libLoaded = false;
    const loadLib = async () => {
      if (libLoaded) return;
      libLoaded = true;
      await refreshLib();
    };
    const refreshLib = async () => {
      const q = root.querySelector('[data-q]').value.trim();
      const sort = root.querySelector('[data-sort]').value;
      try {
        const d = await API.get('/api/media/list', { q, sort, page: 1, size: 60, kind: 'image' });
        root.querySelector('[data-stat]').textContent = `共 ${d.stat.count} 张 · 占用 ${(d.stat.bytes / 1024 / 1024).toFixed(1)}MB`;
        root.querySelector('[data-liblist]').innerHTML = d.list.length
          ? d.list.map((it, i) =>
            '<div class="media-it" data-pick="' + esc(it.url) + '">' +
              '<div class="mt"><img src="' + esc(it.url) + '" alt="">' +
                '<button class="zoombtn" data-zoom="' + i + '" title="查看大图">' +
                  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" ' +
                  'stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.2"/>' +
                  '<path d="M10.2 10.2 13.5 13.5M7 5.2v3.6M5.2 7h3.6"/></svg></button>' +
              '</div>' +
              '<div class="inf"><div class="nm" title="' + esc(it.orig || it.name) + '">' + esc(it.orig || it.name) + '</div>' +
              '<div class="meta">' + it.width + '×' + it.height + (it.sizeText ? ' · ' + it.sizeText : '') + '</div></div>' +
            '</div>').join('')
          : '<div class="empty-state">素材库里还没有图片（视频素材请在「素材库」页面管理）</div>';
        // 这里点卡片 = 选图（选图是这个弹层的主操作），所以「看大图」单独做成角标按钮，
        // 且点它时 stopPropagation —— 否则看一眼大图就把图选上了，一次误触要手动取消。
        root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = b.closest('.media-it');
          lightbox({
            list: d.list,
            index: Number(b.getAttribute('data-zoom')) || 0,
            pickText: '使用这张',
            onPick: (it) => {
              add(it.url);
              if (card) card.classList.add('sel');
            }
          });
        }));
        root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('click', () => {
          add(el.getAttribute('data-pick'));
          el.classList.add('sel');
        }));
      } catch (e) { toast(e.message, true); }
    };
    let libTimer = null;
    root.querySelector('[data-q]').addEventListener('input', () => {
      clearTimeout(libTimer);
      libTimer = setTimeout(refreshLib, 300);
    });
    root.querySelector('[data-sort]').addEventListener('change', refreshLib);

    /* --- 外链 --- */
    root.querySelector('[data-addurl]').addEventListener('click', () => {
      const v = root.querySelector('[data-url]').value.trim();
      if (!v) return;
      add(v);
      root.querySelector('[data-url]').value = '';
    });

    renderPicked();
    root.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(picked); });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(null)));
  });
}

/* ============================== 导航与路由 ============================== */

/*
 * 侧栏图标：原来用的是 ▤ ▦ ☺ ▣ ☰ ✦ ◈ ▨ ✎ ⚙ 这些字符，
 * 依赖系统字体里有没有对应字形 —— 实测「店铺装修」的 ✎ 在 Windows 上被字体回退成了「↘」，
 * 同一排里还有实心/空心/线框三种风格，看着像拼凑的。
 * 这里改成内联 SVG（16×16，stroke=currentColor），统一线性风格且不依赖字体。
 */
const ICONS = {
  dashboard: '<rect x="2.4" y="2.4" width="4.9" height="4.9" rx="1.1"/><rect x="8.7" y="2.4" width="4.9" height="4.9" rx="1.1"/>' +
    '<rect x="2.4" y="8.7" width="4.9" height="4.9" rx="1.1"/><rect x="8.7" y="8.7" width="4.9" height="4.9" rx="1.1"/>',
  orders: '<path d="M3.2 2.4h9.6v11.2l-1.7-1.2-1.6 1.2-1.5-1.2-1.6 1.2-1.6-1.2-1.6 1.2z"/>' +
    '<path d="M5.6 6.2h4.8M5.6 8.8h3.1"/>',
  customers: '<circle cx="8" cy="5.6" r="2.5"/><path d="M3.1 13.6c0-2.5 2.2-4.1 4.9-4.1s4.9 1.6 4.9 4.1"/>',
  goods: '<path d="M8 1.9 13.7 5v6L8 14.1 2.3 11V5z"/><path d="M2.6 5.2 8 8.2l5.4-3M8 8.2v5.7"/>',
  categories: '<path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h10.8"/>',
  comments: '<path d="M13.6 8.4c0 2.5-2.5 4.5-5.6 4.5-.7 0-1.4-.1-2-.3L2.9 14l.9-2.4C3.1 10.7 2.4 9.6 2.4 8.4 2.4 5.9 4.9 3.9 8 3.9s5.6 2 5.6 4.5z"/>',
  marketing: '<path d="M2.4 6.4h2.3L10 3.5v9L4.7 9.6H2.4z"/><path d="M5.6 9.6v2.2a1.2 1.2 0 0 0 2.4 0v-1.3"/>' +
    '<path d="M12 6.3a2.5 2.5 0 0 1 0 3.4"/>',
  media: '<rect x="2.4" y="3" width="11.2" height="10" rx="1.5"/><circle cx="5.9" cy="6.4" r="1.1"/>' +
    '<path d="M2.7 11.1 6.1 8.2l2.3 2 1.9-1.6 2.9 2.5"/>',
  decorate: '<path d="M11.3 2.4 13.6 4.7 6.2 12.1l-2.9.7.7-2.9z"/><path d="M9.7 4 12 6.3"/>',
  /* 店铺笔记：一页带折角的纸 + 两条正文线（与「素材库」的方框、「店铺装修」的笔区分开） */
  notes: '<path d="M3.4 2.4h6.2l3 3v8.2H3.4z"/><path d="M9.4 2.5v3h3"/>' +
    '<path d="M5.6 8.4h4.8M5.6 10.8h3.2"/>',
  /* 成员管理：两个人（后一个留半身轮廓，读起来就是「多个人」而不是「客户」） */
  members: '<circle cx="6.2" cy="5.9" r="2.2"/><path d="M2.4 13.4c0-2.1 1.7-3.4 3.8-3.4s3.8 1.3 3.8 3.4"/>' +
    '<path d="M10.4 4.2a2 2 0 0 1 0 3.5M11.3 10.4c1.4.4 2.3 1.5 2.3 3"/>',
  /* 登录：门 + 向右的箭头（钥匙孔的另一种画法，避免与「店铺设置」的齿轮混淆） */
  login: '<path d="M6.4 2.6H3.2v10.8h3.2"/><path d="M9.2 5.2 12 8l-2.8 2.8"/><path d="M12 8H6.6"/>',
  settings: '<circle cx="8" cy="8" r="2.1"/>' +
    '<path d="M8 2.1v1.5M8 12.4v1.5M13.9 8h-1.5M3.6 8H2.1M12.2 3.8l-1.1 1.1M4.9 11.1l-1.1 1.1M12.2 12.2l-1.1-1.1M4.9 4.9 3.8 3.8"/>'
};

/** 生成一个侧栏图标；名字不在表里就返回空串，不会画出一个方框里带问号的破图 */
function navIcon(name) {
  const p = ICONS[name];
  if (!p) return '';
  return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

/*
 * 侧栏栏目表。改这里就等于改左侧导航 —— 但**三处要一起改**，否则会出现「点得进去、
 * 页面空白」或「页面存在、没有入口」这种半截状态（细节见 check-all 的导航断言）：
 *   ① 本表；② 图标表 ICONS 里的 ico 键；③ App.views 里的同名视图。
 *
 * 分组顺序与有赞后台一致（经营 / 商品 / 营销与内容 / 系统），
 * 2026-10-15 起「店铺笔记」「成员管理」「登录」各自**独立成栏**：
 *   · 店铺笔记 —— 原先长在装修台的页面列表工具栏里（「+ 新建笔记」），
 *     但它是**内容**，不是「页面长什么样」，跟店铺装修混在一起说不清归属；
 *   · 成员管理 —— 后台账号（谁能登录、各是什么角色）；
 *   · 登录     —— 独立登录页；未登录时整个后台强制落在这里。
 */
const NAV = [
  { group: '经营' },
  { key: 'dashboard', text: '数据概览', ico: 'dashboard' },
  { key: 'orders', text: '订单管理', ico: 'orders' },
  { key: 'customers', text: '客户管理', ico: 'customers' },
  { group: '商品' },
  { key: 'goods', text: '商品管理', ico: 'goods' },
  { key: 'categories', text: '分类管理', ico: 'categories' },
  { key: 'comments', text: '评价管理', ico: 'comments' },
  { group: '营销与内容' },
  { key: 'marketing', text: '优惠券', ico: 'marketing' },
  { key: 'media', text: '素材库', ico: 'media' },
  { key: 'shopnotes', text: '店铺笔记', ico: 'notes' },
  { key: 'decorate', text: '店铺装修', ico: 'decorate' },
  { group: '系统' },
  { key: 'settings', text: '店铺设置', ico: 'settings' },
  { key: 'members', text: '成员管理', ico: 'members' },
  { key: 'login', text: '登录', ico: 'login' }
];

/** 未登录时唯一可进的栏目 —— 其余一律不可点（真正的拦截在服务端，这里只是别让人白点） */
const GATE_VIEW = 'login';

const App = {
  view: 'dashboard',
  /** 各视图的查询状态（切页保留筛选条件） */
  q: {},
  views: {},
  badges: {},

  /**
   * 路由守卫：**未登录只能落在登录页**。
   *
   * 单点判定 —— `go()`、boot()、hashchange 三处入口都过它，不再各写一遍 `if (token)`。
   * 各写一遍的后果是「某个入口漏判 → 未登录也能停在数据概览页，页面里全是 401」，
   * 而那看起来像「接口坏了」，不像「没登录」。
   */
  gate(view) {
    const v = this.views[view] ? view : 'dashboard';
    if (!AdminSession.me()) return GATE_VIEW;
    return v;
  },

  go(view) {
    const v = this.gate(view);
    /* 已经在同一页就不重渲染：登录页里调 go('login')（如 401 回退）会无限自渲染 */
    if (v === this.view && this.view !== GATE_VIEW) return;
    this.view = v;
    location.hash = '#' + v;
    this.renderNav();
    this.render();
  },

  /** 当前视图的查询状态 */
  state(view) {
    if (!this.q[view]) this.q[view] = { page: 1 };
    return this.q[view];
  },

  renderNav() {
    /* 未登录：除「登录」外一律置灰不可点。
     * 只是**提示**，不是权限 —— 真正的拦截在服务端（每个管理接口都要管理员令牌）。 */
    const locked = !AdminSession.me();
    $('#nav').innerHTML = NAV.map((n) => {
      if (n.group) return '<div class="nav-group">' + esc(n.group) + '</div>';
      const b = this.badges[n.key];
      const off = locked && n.key !== GATE_VIEW;
      return '<button class="nav-item' + (n.key === this.view ? ' on' : '') + (off ? ' locked' : '') +
        '" data-view="' + n.key + '"' + (off ? ' title="需要先登录管理员账号"' : '') + '>' +
        '<span class="ico">' + navIcon(n.ico) + '</span><span>' + esc(n.text) + '</span>' +
        (b ? '<span class="badge">' + b + '</span>' : '') + '</button>';
    }).join('');
    $('#nav').querySelectorAll('[data-view]').forEach((el) => {
      el.addEventListener('click', () => this.go(el.getAttribute('data-view')));
    });
    /* 顶部标题跟着走：未登录时标题必须显示「登录」，
     * 否则停在数据概览的标题上、内容却是登录框，看着像页面坏了 */
    const cur = NAV.find((n) => n.key === this.view) || {};
    $('#pgTitle').textContent = cur.text || '数据概览';
    document.title = '莱克商城后台 · ' + (cur.text || '');
  },

  async render() {
    const v = this.views[this.view];
    const body = $('#body');
    body.innerHTML = '<div class="empty-state"><span class="spinner"></span>加载中…</div>';
    try {
      await v.render(body, this.state(this.view));
    } catch (e) {
      body.innerHTML = '<div class="card"><div class="card-b"><div class="empty-state"><div class="ic">⚠</div>' +
        '加载失败：' + esc(e.message) + '<div style="margin-top:10px"><button class="btn" onclick="App.render()">重试</button></div></div></div></div>';
    }
    /* 渲染完成后统一兜底图片（失败图被缓存时不会再发 error 事件，只能主动扫） */
    sweepImages(body);
  },

  /** 侧栏角标（待发货等） */
  async refreshBadges() {
    try {
      const d = await API.get('/api/admin/dashboard', { days: 7 });
      this.badges = {
        orders: d.todo.pendingShip || 0,
        goods: d.todo.lowStock || 0
      };
      this.renderNav();
    } catch (e) { /* 静默 */ }
  }
};

/* ============================== 登录（独立页面） ============================== */

/**
 * 登录栏目（左侧导航「系统 → 登录」）。
 *
 * 这是整个后台**唯一**的登录界面 —— 原来那个弹层已经删掉（openLogin 改成跳这里）。
 * 一份界面而不是两份，是因为两份必然走样：弹层里改了文案、页面里没改，
 * 或者一边支持长期令牌、另一边忘了。
 *
 * 未登录 → 表单；已登录 → 当前身份 + 改口令 + 退出。
 */
App.views.login = {
  async render(body) {
    const me = AdminSession.me();
    if (me) return this.renderAccount(body, me);
    return this.renderForm(body);
  },

  /* ---------------------------- 未登录：登录表单 ---------------------------- */
  renderForm(body) {
    body.innerHTML =
      '<div class="card" style="max-width:520px">' +
        '<div class="card-h"><h2>登录后台</h2><div class="grow"></div>' +
          '<span class="hint">登录后才能进入其它栏目</span></div>' +
        '<div class="card-b">' +
          (loginReason
            ? '<div class="login-note">' + esc(loginReason) + '</div>'
            : '') +
          '<div class="form-row"><div class="lbl">账号</div><div class="ctl">' +
            '<input type="text" data-u placeholder="成员账号（如 yy_a）" autocomplete="username" style="flex:1">' +
            '<div class="tip">在「成员管理」里创建的账号。留空则使用服务器共享口令登录（超级管理员）。</div>' +
          '</div></div>' +
          '<div class="form-row"><div class="lbl">口令</div><div class="ctl">' +
            '<input type="password" data-p placeholder="登录口令" autocomplete="current-password" style="flex:1">' +
          '</div></div>' +
          '<div class="form-row"><div class="lbl"></div><div class="ctl">' +
            '<button class="btn primary" data-login>登录</button>' +
            '<span class="tip" data-err hidden></span>' +
          '</div></div>' +

          '<div class="login-sep">或者：用长期令牌直接进入</div>' +
          '<div class="form-row"><div class="lbl">长期令牌</div><div class="ctl">' +
            '<input type="text" data-tk placeholder="粘贴 ADMIN_TOKENS 里的令牌" style="flex:1">' +
            '<div class="tip">令牌的角色由服务端配置决定（只读 / 运营 / 超级管理员）。' +
            '这是给系统对接用的通道，日常请用账号登录。</div>' +
          '</div></div>' +
          '<div class="form-row"><div class="lbl"></div><div class="ctl">' +
            '<button class="btn" data-login-tk>用令牌登录</button>' +
          '</div></div>' +
        '</div>' +
      '</div>';

    const uEl = body.querySelector('[data-u]');
    const pEl = body.querySelector('[data-p]');
    const tkEl = body.querySelector('[data-tk]');
    const errEl = body.querySelector('[data-err]');
    const btn = body.querySelector('[data-login]');
    const btnTk = body.querySelector('[data-login-tk]');

    const showErr = (msg) => {
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
    };

    const submit = async () => {
      const username = uEl.value.trim();
      const password = pEl.value;
      if (!password) return showErr('请填写登录口令');
      btn.disabled = true;
      btn.textContent = '验证中…';
      try {
        const d = await API.post('/api/admin/login', { username, password });
        AdminSession.save(d.token, {
          role: d.role, roleLabel: d.roleLabel, name: d.name || '',
          username: d.username || '', source: d.username ? 'member' : 'session'
        });
        loginReason = '';
        toast('已登录：' + whoText(AdminSession.me()).text);
        return afterLogin();
      } catch (e) {
        showErr(e.message);
      }
      btn.disabled = false;
      btn.textContent = '登录';
    };

    const submitToken = async () => {
      const tk = tkEl.value.trim();
      if (!tk) return showErr('请粘贴长期令牌');
      btnTk.disabled = true;
      btnTk.textContent = '验证中…';
      try {
        /* 长期令牌没有单独的回显接口：先用它请求一次会话，确认「令牌有效、角色被识别」。
         * 不确认就写进 localStorage 的话，坏令牌会留在本地、让之后每个请求都 401。 */
        AdminSession.save(tk, null);
        const me = await API.get('/api/admin/session');
        AdminSession.save(tk, me);
        loginReason = '';
        toast('已登录：' + whoText(AdminSession.me()).text);
        return afterLogin();
      } catch (e) {
        AdminSession.clear();
        showErr(e.message);
      }
      btnTk.disabled = false;
      btnTk.textContent = '用令牌登录';
    };

    btn.addEventListener('click', submit);
    btnTk.addEventListener('click', submitToken);
    [uEl, pEl].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
    tkEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitToken(); });
    setTimeout(() => { (uEl.value ? pEl : uEl).focus(); }, 30);
  },

  /* ---------------------------- 已登录：身份与口令 ---------------------------- */
  renderAccount(body, me) {
    const srcText = { member: '成员账号', env: '长期令牌', session: '共享口令' }[me.source] || me.source || '—';
    const roleText = me.roleLabel || ROLE_TEXT[me.role] || me.role || '—';
    /* 身份那行**只显示「人」**，角色交给右边那枚 tag。
     * 直接用 whoText() 会撞上它内部的去重规则：共享口令登录的 name 是空、
     * 会被回落成角色名，于是屏幕上是「身份 超级管理员 超级管理员」两遍。 */
    const displayName = me.name || me.username ||
      ({ session: '共享口令管理员', env: '长期令牌用户' }[me.source] || '管理员');
    /*
     * 能不能改自己的口令：**只看 source 是不是 member**。
     *
     * ⚠️ 不能只信 `me.canChangePassword` —— 那个字段只有 `/api/admin/session` 会返回，
     *    而刚登录完（还没刷新页面）时 me 来自本地缓存，字段是 undefined，
     *    于是成员账号登录后看到的是「你没有个人口令可改」这句错话。
     *    `source === 'member'` 与服务端 `changeOwnPassword` 前的判定**是同一条规则**
     *    （服务端只在 payload 带 username 时才置 member），所以这里推导出来的结论必然一致。
     */
    const canChangePw = me.source === 'member';
    body.innerHTML =
      '<div class="card" style="max-width:520px">' +
        '<div class="card-h"><h2>当前身份</h2><div class="grow"></div>' +
          '<span class="hint">后台整站需要登录才能进入</span></div>' +
        '<div class="card-b">' +
          '<div class="form-row"><div class="lbl">身份</div><div class="ctl">' +
            '<b>' + esc(displayName) + '</b>' +
            '<span class="tag ' + (me.role === 'owner' ? 'red' : 'id') + '">' + esc(roleText) + '</span>' +
          '</div></div>' +
          '<div class="form-row"><div class="lbl">账号</div><div class="ctl">' +
            (me.username ? esc(me.username) : '<span class="sub">（不是成员账号）</span>') +
            '<div class="tip">登录方式：' + esc(srcText) + '</div>' +
          '</div></div>' +
          '<div class="form-row"><div class="lbl">权限</div><div class="ctl" style="display:block">' +
            '<div class="tip" style="width:auto">' + esc(roleHint(me.role)) + '</div>' +
          '</div></div>' +
          '<div class="form-row"><div class="lbl"></div><div class="ctl">' +
            '<button class="btn" data-go-dashboard>回到数据概览</button>' +
            '<button class="btn danger" data-logout>退出登录</button>' +
          '</div></div>' +
        '</div>' +
      '</div>' +

      (canChangePw
        ? '<div class="card" style="max-width:520px;margin-top:14px">' +
            '<div class="card-h"><h2>修改我的口令</h2></div>' +
            '<div class="card-b">' +
              '<div class="form-row"><div class="lbl">原口令</div><div class="ctl">' +
                '<input type="password" data-old autocomplete="current-password" style="flex:1"></div></div>' +
              '<div class="form-row"><div class="lbl">新口令</div><div class="ctl">' +
                '<input type="password" data-new autocomplete="new-password" style="flex:1">' +
                '<div class="tip">至少 8 位、最多 64 位。改完立即生效，当前登录不受影响。</div></div></div>' +
              '<div class="form-row"><div class="lbl">确认新口令</div><div class="ctl">' +
                '<input type="password" data-new2 autocomplete="new-password" style="flex:1"></div></div>' +
              '<div class="form-row"><div class="lbl"></div><div class="ctl">' +
                '<button class="btn primary" data-save-pw>保存新口令</button>' +
                '<span class="tip" data-pw-err hidden></span></div></div>' +
            '</div>' +
          '</div>'
        : '<div class="card" style="max-width:520px;margin-top:14px">' +
            '<div class="card-b"><div class="hint">当前用' + esc(srcText) +
            '登录，没有「个人口令」可改。要用账号登录，请在「成员管理」里建一个成员账号。</div></div>' +
          '</div>');

    body.querySelector('[data-go-dashboard]').addEventListener('click', () => App.go('dashboard'));
    body.querySelector('[data-logout]').addEventListener('click', () => onTapWho());

    const btn = body.querySelector('[data-save-pw]');
    if (!btn) return;
    const oldEl = body.querySelector('[data-old]');
    const newEl = body.querySelector('[data-new]');
    const new2El = body.querySelector('[data-new2]');
    const errEl = body.querySelector('[data-pw-err]');
    btn.addEventListener('click', async () => {
      const showErr = (m) => { errEl.hidden = !m; errEl.textContent = m || ''; };
      if (!oldEl.value) return showErr('请填写原口令');
      if (newEl.value.length < 8) return showErr('新口令至少 8 位');
      if (newEl.value !== new2El.value) return showErr('两次输入的新口令不一致');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        await API.post('/api/admin/me/password', { oldPassword: oldEl.value, newPassword: newEl.value });
        toast('口令已更新');
        App.render();
        return;
      } catch (e) {
        showErr(e.message);
      }
      btn.disabled = false;
      btn.textContent = '保存新口令';
    });
  }
};

/* ============================== 通用表格片段 ============================== */

/** 分页条 */
function pagerHtml(total, page, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  return '<div class="pager">' +
    '<span>共 ' + total + ' 条 · 第 ' + page + '/' + pages + ' 页</span>' +
    '<button class="btn sm" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
    '<button class="btn sm" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
  '</div>';
}

/** 绑定分页按钮 */
function bindPager(root, state, reload) {
  root.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = Number(b.getAttribute('data-page'));
    if (p < 1) return;
    state.page = p;
    reload();
  }));
}

const statusTag = {
  pending_pay: '<span class="tag warn">待付款</span>',
  pending_ship: '<span class="tag red">待发货</span>',
  shipped: '<span class="tag blue">待收货</span>',
  finished: '<span class="tag on">已完成</span>',
  cancelled: '<span class="tag off">已取消</span>'
};

/* ============================== 视图：数据概览 ============================== */

App.views.dashboard = {
  async render(body, state) {
    const days = state.days || 7;
    const d = await API.get('/api/admin/dashboard', { days });
    const t = d.today;
    const cmp = t.gmvCompare;
    const arrow = cmp >= 0 ? '<span class="up">↑ ' : '<span class="down">↓ ';
    const cmpText = (d.yesterday.gmv ? (Math.abs(cmp / (d.yesterday.gmv || 1)) * 100).toFixed(1) + '%' : '—');

    /*
     * 柱状图：原来所有柱子都走 Math.max(3, …)，GMV=0 的那天也会画出一根 3px 的红色短线，
     * 浮在图表底部看着像误画的横线。现在 0 值改画一根浅灰的「零值刻度」，与真柱子明确区分；
     * 整段区间全是 0 时直接不画图，给一句空态，避免 7 根灰线让人以为页面坏了。
     */
    const totalGmv = d.trend.reduce((s, x) => s + x.gmv, 0);
    const max = Math.max.apply(null, d.trend.map((x) => x.gmv).concat([1]));
    const bars = d.trend.map((x) => {
      const has = x.gmv > 0;
      const tip = esc(x.label) + '：GMV ' + money(x.gmv) + '，订单 ' + x.orders + ' 笔';
      return '<div class="b" title="' + tip + '">' +
        (has
          ? '<div class="bar" style="height:' + Math.max(4, Math.round(x.gmv / max * 138)) + 'px">' +
            '<span class="val">' + wan(x.gmv) + '</span></div>'
          : '<div class="bar zero" title="' + esc(x.label) + '：当日无成交"></div>') +
        '<div class="lb">' + esc(x.label) + '</div></div>';
    }).join('');
    const chartHtml = totalGmv === 0
      ? '<div class="chart-empty">近 ' + days + ' 天还没有已付款订单，暂时没有趋势可画</div>'
      : '<div class="bars">' + bars + '</div>';

    body.innerHTML =
      '<div class="grid c4" style="margin-bottom:14px">' +
        '<div class="kpi primary"><div class="k">今日 GMV</div><div class="v">' + wan(t.gmv) + '</div><div class="d">' +
          arrow + cmpText + '</span> 较昨日（' + wan(d.yesterday.gmv) + '）</div></div>' +
        '<div class="kpi"><div class="k">今日订单</div><div class="v">' + t.orders + ' <small>笔</small></div><div class="d">已付款 ' + t.paidOrders + ' 笔 · 客单价 ' + money(t.avgOrder) + '</div></div>' +
        '<div class="kpi"><div class="k">今日新增客户</div><div class="v">' + t.newCustomers + ' <small>人</small></div><div class="d">累计客户 ' + d.total.customers + ' 人</div></div>' +
        '<div class="kpi"><div class="k">待处理</div><div class="v">' + (d.todo.pendingShip + d.todo.pendingPay) + ' <small>单</small></div><div class="d">待发货 ' + d.todo.pendingShip + ' · 待付款 ' + d.todo.pendingPay + '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>销售趋势</h2><div class="grow"></div>' +
        '<button class="btn sm' + (days === 7 ? ' primary' : '') + '" data-days="7">近 7 天</button>' +
        '<button class="btn sm' + (days === 30 ? ' primary' : '') + '" data-days="30">近 30 天</button>' +
      '</div><div class="card-b">' + chartHtml +
      '<div class="sub" style="margin-top:8px">近 ' + days + ' 天累计 GMV ' + money(totalGmv) +
        ' · 订单 ' + d.trend.reduce((s, x) => s + x.orders, 0) + ' 笔</div></div></div>' +

      /* 计数为 0 的待办加 .zero 降级（灰色）——「不需要处理的事」不该用品牌红抢注意力，
       * 三条里只有真有待办的那条是红的，一眼就能扫出该点哪一条。 */
      '<div class="grid c2">' +
        '<div class="card"><div class="card-h"><h2>待办</h2></div><div class="card-b">' +
          '<div class="todo-item"><span class="n' + (d.todo.pendingShip ? '' : ' zero') + '">' + d.todo.pendingShip + '</span><span class="t"><b>待发货订单</b><span>客户已付款，等待你发货</span></span><button class="btn sm" data-goto="orders" data-status="pending_ship">去处理</button></div>' +
          '<div class="todo-item"><span class="n' + (d.todo.pendingPay ? '' : ' zero') + '">' + d.todo.pendingPay + '</span><span class="t"><b>待付款订单</b><span>超时未付可关闭并释放库存</span></span><button class="btn sm" data-goto="orders" data-status="pending_pay">去看看</button></div>' +
          '<div class="todo-item"><span class="n' + (d.todo.lowStock ? '' : ' zero') + '">' + d.todo.lowStock + '</span><span class="t"><b>库存预警商品</b><span>库存 ≤ 10 件，及时补货</span></span><button class="btn sm" data-goto="goods" data-lowstock="1">去补货</button></div>' +
        '</div></div>' +
        '<div class="card"><div class="card-h"><h2>热销商品 Top 5</h2><div class="grow"></div><span class="hint">按已付款订单销量</span></div>' +
          '<div class="card-b tight"><div class="table-wrap"><table class="tb"><thead><tr><th>商品</th><th class="num">销量</th><th class="num">销售额</th></tr></thead><tbody>' +
          (d.topGoods.length ? d.topGoods.map((g) => '<tr><td>' + esc(g.name) + '</td><td class="num">' + g.qty + '</td><td class="num money">' + money(g.amount) + '</td></tr>').join('')
            : '<tr><td colspan="3" class="empty">暂无已付款订单</td></tr>') +
          '</tbody></table></div></div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>最近订单</h2><div class="grow"></div><button class="btn sm" data-goto="orders">全部订单 →</button></div>' +
        '<div class="card-b tight"><div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th>订单号</th><th>客户</th><th>商品</th><th class="num">实付</th><th>状态</th><th>下单时间</th><th></th></tr></thead><tbody>' +
        (d.recentOrders.length ? d.recentOrders.map((o) =>
          '<tr><td class="nowrap">' + esc(o.orderNo) + '</td><td>' + esc(o.customer || '—') + '</td>' +
          '<td class="sub">' + esc(o.firstItem).slice(0, 16) + (o.itemCount > 1 ? ' 等 ' + o.itemCount + ' 件' : '') + '</td>' +
          '<td class="num money red">' + money(o.payAmount) + '</td><td>' + (statusTag[o.status] || o.status) + '</td>' +
          '<td class="sub nowrap">' + fmtTime(o.createdAt) + '</td>' +
          '<td><button class="btn text sm" data-order="' + esc(o.orderId) + '">详情</button></td></tr>').join('')
          : '<tr><td colspan="7" class="empty">还没有订单</td></tr>') +
        '</tbody></table></div></div></div>' +

      '<div class="sub" style="text-align:right">统计口径：GMV = 已付款订单实付金额（不含已取消） · 更新于 ' + fmtTime(d.updatedAt) + '</div>';

    body.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
      state.days = Number(b.getAttribute('data-days'));
      App.render();
    }));
    body.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      const target = App.state(b.getAttribute('data-goto'));
      if (b.dataset.status) target.status = b.dataset.status;
      if (b.dataset.lowstock) target.lowStock = '1';
      target.page = 1;
      App.go(b.getAttribute('data-goto'));
    }));
    body.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
      App.views.orders.openDetail(b.getAttribute('data-order'));
    }));
  }
};

/* ============================== 视图：店铺设置 ============================== */

App.views.settings = {
  async render(body, state) {
    const d = await API.get('/api/admin/settings');
    const s = d.settings;
    const shop = d.shop || { published: {} };
    const pub = shop.published || {};
    const row = (label, tip, input) =>
      '<div class="form-row"><div class="lbl">' + esc(label) + '</div><div class="ctl">' + input +
      (tip ? '<div class="tip">' + tip + '</div>' : '') + '</div></div>';
    /* 服务参数三行共用同一说明 —— 逐行写「同上」等于没写（运营要往上翻才知道「上」是什么） */
    const SERVER_SAVED = '保存在服务端 catalog.json，供客服与后续接口读取；<b>不会</b>自动出现在小程序页面上';
    const ro = (v) => '<span class="ro">' + (v ? esc(v) : '—') + '</span>';
    /** 图片地址是相对路径，这里拼成本机可预览的绝对地址（不是线上地址） */
    const imgUrl = (p) => (p ? (/^https?:/.test(p) ? p : location.origin + p) : '');
    const draftNote = (key, label) => {
      if (!shop.draft) return '';
      if (String(shop.draft[key] || '') === String(pub[key] || '')) return '';
      return '　<span class="tag warn">装修台已改为「' + esc(shop.draft[key] || '空') + '」，尚未生成代码</span>';
    };

    body.innerHTML =
      /*
       * ⚠️ 这一张卡是「只读 + 指路」，刻意不提供编辑框。
       *
       * 店铺名称与头像在小程序端只有一份真源：装修台写回的 replica.SHOP（首页与「我的」页共用）。
       * 之前这里可以编辑，但保存进的是 catalog.settings —— 没有任何小程序接口读它，
       * 于是「后台提示保存成功、前端永远是旧值」。删掉编辑能力比留着假入口更安全。
       */
      '<div class="card"><div class="card-h"><h2>小程序端展示信息</h2><div class="grow"></div>' +
        '<span class="hint">只读 · 唯一数据源：' + esc(shop.source || '装修台') + '</span></div>' +
      '<div class="card-b">' +
        '<div class="grid c2">' +
          '<div>' + row('店铺名称', '', ro(pub.name) + draftNote('name', '店铺名称')) + '</div>' +
          '<div>' + row('店铺标语', '', ro(pub.slogan) + draftNote('slogan', '店铺标语')) + '</div>' +
        '</div>' +
        row('店铺头像', '', (imgUrl(pub.avatar)
          ? '<img src="' + esc(imgUrl(pub.avatar)) + '" alt="" style="width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid #e6e8ec">'
          : '<span class="ro">未设置</span>') + draftNote('avatar', '店铺头像')) +
        '<div class="tip">这三项由<b>装修台「店铺信息」</b>维护（写回 <code>replica.SHOP</code>，首页与「我的」共用）。' +
        '改完要在装修台点「生成代码」，并上传发布小程序新版本，用户端才会更新。' +
        '</div>' +
        '<div class="btn-group" style="margin-top:10px">' +
          /*
           * 走新窗口（<a target="_blank">）：这三项的真源在装修台，进来是要**动手改**的，
           * 在当前页切视图会把运营手上的「店铺设置」页挤掉，改完还得自己找回来。
           * 新窗口里改完点「生成代码」再回来，两边互不打扰。
           *
           * 用普通按钮（不是 .btn.primary）：它是「去别处改」的**跳转**，不是本页的主操作。
           * 品牌红实底在本页应该是「保存设置」那一枚；两个红按钮并排会让人不知道该点哪个。
           */
          '<a class="btn" href="/admin" target="_blank" rel="noopener">去装修台修改 ↗</a>' +
          '<span class="sub" style="align-self:center">在新窗口打开装修台；改完点「生成代码」写回 replica.SHOP</span>' +
        '</div>' +
      '</div></div>' +

      /*
       * 运营参数：这是服务端自己的数据（catalog.json），不与前端展示字段重叠。
       * 所以这里把「谁读它」写清楚 —— 不能再出现「保存后小程序端会读取新值」这种不成立的说明。
       */
      '<div class="grid c2">' +
        '<div class="card"><div class="card-h"><h2>服务参数</h2><div class="grow"></div>' +
          '<span class="hint">存放于 server/data/catalog.json</span></div><div class="card-b">' +
          row('客服电话', SERVER_SAVED, '<input type="text" style="flex:1" data-k="servicePhone" value="' + esc(s.servicePhone) + '">') +
          row('客服时间', SERVER_SAVED, '<input type="text" style="flex:1" data-k="serviceHours" value="' + esc(s.serviceHours) + '">') +
          row('店铺公告', SERVER_SAVED + '；要展示在小程序页面上，请在装修台添加「公告」区块', '<input type="text" style="flex:1" data-k="notice" value="' + esc(s.notice) + '">') +
        '</div></div>' +

        '<div class="card"><div class="card-h"><h2>交易设置</h2><div class="grow"></div>' +
          '<span class="hint">服务端下单与结算参数</span></div><div class="card-b">' +
          row('包邮门槛', '全场满此金额免运费；填 0 表示不启用（单位：元）', '<input type="number" class="w90" data-k="freightFree" value="' + (s.freightFree / 100) + '"><span class="sub">元</span>') +
          row('默认运费', '未达包邮门槛时的运费（单位：元）', '<input type="number" class="w90" data-k="defaultFreight" value="' + (s.defaultFreight / 100) + '"><span class="sub">元</span>') +
          row('自动确认收货', '发货后多少天自动确认（0 = 不自动）', '<input type="number" class="w90" data-k="autoConfirmDays" value="' + s.autoConfirmDays + '"><span class="sub">天</span>') +
          row('支付超时', '下单后多少分钟未付款自动关闭', '<input type="number" class="w90" data-k="payExpireMinutes" value="' + s.payExpireMinutes + '"><span class="sub">分钟</span>') +
        '</div></div>' +
      '</div>' +

      /*
       * 数据资产：原来是一整张大卡 + 三列指标，占掉半屏却只有三个数字。
       * 改成一行紧凑条 —— 信息一点没少，位置从「压在最下面的大块」变成「操作栏上方的一行」。
       * 那句「哪些地方会立即生效」是运营最容易踩的坑（装修区块读的是快照），所以留在条上。
       */
      '<div class="card stat-line"><div class="card-b">' +
        '<span class="sub">数据资产</span>' +
        '<span class="stat">商品<b>' + d.goodsCount + '</b></span>' +
        '<span class="stat">分类<b>' + d.categoryCount + '</b></span>' +
        '<span class="stat">券模板<b>' + d.couponCount + '</b></span>' +
        '<span class="grow"></span>' +
        '<span class="hint" title="商品 / 分类走接口，保存后商品列表页与商品详情页立即读到新值；' +
          '但首页与自定义页里的「商品」区块读的是装修快照（replica.js），需要重新生成代码并发布小程序版本才会变。">' +
          '存于 server/data/catalog.json · 装修区块读的是快照，改商品后需重新生成代码</span>' +
      '</div></div>' +

      '<div class="btn-group"><button class="btn primary" data-save>保存设置</button>' +
      '<button class="btn" data-reset>恢复默认</button>' +
      '<span class="sub" style="align-self:center">仅保存本页的运营参数；店铺名称与头像请到装修台修改</span></div>';

    /** 收集表单：金额字段「元 → 分」；**不含** shopName / logo（真源在装修台，后端会拒收） */
    const collect = () => {
      const g = (k, def) => {
        const el = body.querySelector('[data-k="' + k + '"]');
        return el ? el.value : def;
      };
      return {
        servicePhone: g('servicePhone'),
        serviceHours: g('serviceHours'),
        notice: g('notice'),
        freightFree: Math.round(Number(g('freightFree') || 0) * 100),
        defaultFreight: Math.round(Number(g('defaultFreight') || 0) * 100),
        autoConfirmDays: Math.round(Number(g('autoConfirmDays') || 0)),
        payExpireMinutes: Math.round(Number(g('payExpireMinutes') || 0))
      };
    };

    /*
     * 这里**不再**为「去装修台修改」绑 JS —— 它是 <a href="/admin" target="_blank">，
     * 真链接自己就开新窗口（中键 / 右键也能用）。若还留着 App.go('decorate') 的绑定，
     * 点一下会既在当前页切视图、又在新窗口打开装修台，变成两处入口打架。
     */

    body.querySelector('[data-save]').addEventListener('click', async () => {
      if (!needRole('owner', '保存店铺设置')) return;
      try {
        await API.post('/api/admin/settings/save', collect());
        toast('设置已保存');
      } catch (e) { toast(e.message, true); }
    });
    body.querySelector('[data-reset]').addEventListener('click', async () => {
      if (!needRole('owner', '恢复默认设置')) return;
      if (!(await confirmBox('恢复为默认设置？当前填写内容会丢失。'))) return;
      try {
        /* 默认值直接就是可提交的（第 53 批已把历史遗留的 shopName / logo 从
           catalogStore.DEFAULT_SETTINGS 里删掉，这里不再需要手工摘键） */
        await API.post('/api/admin/settings/save', d.defaults);
        toast('已恢复默认');
        App.render();
      } catch (e) { toast(e.message, true); }
    });
  }
};

/* ============================== 启动 ============================== */

/** 事件只绑一次：登录成功后会再调一次 boot() 重跑数据，重复绑定会让「刷新」点一下跑两遍 */
let booted = false;

async function boot() {
  if (!booted) {
    booted = true;
    $('#btnReload').addEventListener('click', () => App.render());
    const who = $('#btnWho');
    if (who) who.addEventListener('click', onTapWho);
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#', '');
      /* 过 gate：手改地址栏敲 #goods 时，未登录也只能停在登录页 */
      const g = App.gate(v);
      if (g !== App.view) { App.view = g; App.renderNav(); App.render(); }
    });
  }
  // 先把身份缓存补齐（只有令牌没有身份时，按钮会全被当成「未登录」）
  await AdminSession.hydrate();
  renderWho();
  const hash = (location.hash || '').replace('#', '');
  /* ⚠️ gate 只能在这里统一过：boot 是「刷新页面」这条入口，
   *    和 go()（点导航）、hashchange（改地址）是三条不同的路，
   *    任何一条漏判都会出现「未登录也能停在业务页、满屏 401」。 */
  App.view = App.gate(hash);
  /* 被 gate 拦下来时把地址栏也改掉（#goods → #login）：否则地址写着 #goods、
   * 页面是登录页，刷新一次的现象会对不上，排查时非常费解 */
  if (App.view !== hash) location.hash = '#' + App.view;
  App.renderNav();
  App.render();
  /* 未登录时不要去拉角标：那两个请求必然 401，
   * 会让控制台一进来就弹「需要管理员身份」，而用户只是想登录 */
  if (AdminSession.me()) App.refreshBadges();
}
