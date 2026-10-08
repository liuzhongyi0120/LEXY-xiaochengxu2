/* =========================================================================
 * 小程序预览页（/preview）
 *
 * 用途：装修台点「立即发布」后，不用开微信开发者工具，直接在这里看线上效果。
 *
 * 两个关键约定：
 *   1. 渲染核心与装修台**同一份**（/shared/pv-render.js），只是传 edit:false ——
 *      所以这里看到的是干净的真机观感（没有选中框、操作条、区块角标、跳转角标）。
 *   2. 数据取**已发布**（/api/decorate/page 的 published），不是草稿 ——
 *      「预览」的字面意思就是看线上。装修台有未发布草稿时这里会明确标出来，
 *      避免出现「我明明改了怎么没变」的误判。
 * ========================================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var API = location.origin;

  /** 当前页面的标识与数据 */
  var CUR = { key: '', meta: null, published: null };

  /** 轮播手动翻页位置：{ 'blocks.1': 2 }（展示态的轮播不会自动播放，点指示点/缩略图翻） */
  var SLIDE = {};

  /** 自动刷新轮询句柄 */
  var TIMER = null;
  var LAST_SIG = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function req(method, path, query) {
    var qs = '';
    if (query) {
      qs = '?' + Object.keys(query).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
      }).join('&');
    }
    return fetch(API + path + qs, { method: method, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { code: r.status, msg: 'HTTP ' + r.status }; }); })
      .then(function (j) {
        if (!j || j.code !== 0) throw new Error((j && j.msg) || '请求失败');
        return j.data;
      });
  }

  function toast(msg) {
    var t = $('pvToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t.__tm);
    t.__tm = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function stamp(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var p = function (v) { return String(v).padStart(2, '0'); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ----------------------------- 左栏列表 ----------------------------- */

  function loadPages() {
    return req('GET', '/api/decorate/pages').then(function (d) {
      var list = d.list || [];
      renderList(list);
      var sig = list.map(function (p) {
        return p.key + ':' + (p.lastVersion ? p.lastVersion.at : 0) + ':' + (p.hasDraft ? 1 : 0);
      }).join('|');
      var changed = LAST_SIG && sig !== LAST_SIG;
      LAST_SIG = sig;
      return { list: list, changed: changed };
    });
  }

  function renderList(list) {
    $('pvCount').textContent = '共 ' + list.length + ' 个';
    var builtin = ['home', 'lexy', 'news', 'product', 'mine'];
    var host = $('pvPages');
    host.innerHTML = list.map(function (p) {
      var isCustom = builtin.indexOf(p.key) < 0;
      var badges = '';
      if (isCustom) badges += '<span class="pv-badge custom">自定义页</span>';
      if (p.hasDraft) badges += '<span class="pv-badge draft">有未发布草稿</span>';
      badges += '<span class="pv-badge">' + p.blockCount + ' 个内容块</span>';
      return '<button class="pv-item' + (p.key === CUR.key ? ' on' : '') + '" data-key="' + esc(p.key) + '">' +
        '<b>' + esc(p.name) + '</b>' +
        '<small>' + esc(p.path || '') + '</small>' +
        '<div class="pv-badges">' + badges + '</div>' +
        '</button>';
    }).join('');
  }

  /* ----------------------------- 右侧渲染 ----------------------------- */

  function openPage(key) {
    if (!key) return Promise.resolve();
    CUR.key = key;
    // 切页要清掉翻页位置（与装修台一致：翻页是页面级状态）
    SLIDE = {};
    markActive();
    $('preview').innerHTML = '<div class="pv-loading">加载已发布内容…</div>';
    return req('GET', '/api/decorate/page', { key: key }).then(function (d) {
      CUR.meta = d.meta || {};
      CUR.published = d.published || {};
      CUR.hasDraft = !!d.hasDraft;
      CUR.draftAtText = d.draftAtText || '';
      CUR.publishedAt = (d.versions && d.versions[0]) ? d.versions[0].at : null;
      $('pvCur').textContent = (CUR.meta.name || key) + ' · ' + (CUR.meta.path || '');
      $('phTitle').textContent = CUR.meta.name || key;
      applyChrome();
      renderPreview();
    }).catch(function (e) {
      $('preview').innerHTML = '<div class="pv-error">加载失败：' + esc(e.message) +
        '<code>若提示「管理页面已关闭」，说明服务以 DEBUG_PAGE=off 启动（预览页与装修台同进同退）</code></div>';
    });
  }

  function markActive() {
    var items = $('pvPages').querySelectorAll('.pv-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('on', items[i].getAttribute('data-key') === CUR.key);
    }
  }

  /** 自定义页不属于 tabBar 的 5 个主页面 —— 与装修台同样把底部导航隐藏掉 */
  function applyChrome() {
    var isCustom = !!(CUR.meta && CUR.meta.custom);
    $('phTabbar').hidden = isCustom;
    highlightTab(CUR.key);
  }

  function highlightTab(key) {
    var order = ['home', 'lexy', 'news', 'product', 'mine'];
    var idx = order.indexOf(key);
    var spans = $('phTabbar').querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      spans[i].style.color = i === idx ? '#C8102E' : '';
      spans[i].style.fontWeight = i === idx ? '600' : '';
    }
  }

  function renderPreview() {
    var host = $('preview');
    var head = '<div class="pv-meta' + (CUR.hasDraft ? ' warn' : '') + '">' +
      '<b>已发布</b>' +
      '<span>最近发布：' + (CUR.publishedAt ? stamp(CUR.publishedAt) : '（本页还没有发布记录）') + '</span>' +
      (CUR.hasDraft ? '<span>· 装修台有未发布草稿（' + esc(CUR.draftAtText) + ' 存的），这里显示的仍是线上内容</span>' : '') +
      '</div>';
    var body;
    try {
      // edit:false → 展示态：不带任何编辑装饰，与真机观感一致
      body = PvRender.render(CUR.key, CUR.published, { edit: false, slide: SLIDE });
    } catch (e) {
      console.error('[预览渲染失败]', e);
      body = '<div class="pv-error">渲染失败：' + esc(e && e.message) + '</div>';
    }
    host.innerHTML = head + body;
    $('pvFoot').innerHTML = '渲染核心与装修台同一份<br>（展示态：无编辑装饰）';
  }

  /* ----------------------------- 交互 ----------------------------- */

  function bind() {
    // 页面切换（事件委托，列表重绘后依然有效）
    $('pvPages').addEventListener('click', function (e) {
      var it = e.target.closest('.pv-item');
      if (!it) return;
      openPage(it.getAttribute('data-key'));
    });

    // 轮播翻页：展示态里点指示点 / 双列缩略图（真机是自动播放，这里手动看第 n 张）
    $('preview').addEventListener('click', function (e) {
      var sl = e.target.closest('[data-slide]');
      if (!sl) return;
      e.preventDefault();
      var path = sl.getAttribute('data-path');
      SLIDE[path] = Number(sl.getAttribute('data-slide')) || 0;
      renderPreview();
    });

    // 机型：手机壳本身按 375 基准渲染，用 zoom 等比缩放 —— 与 rpx（750 基准等比）的行为一致
    $('pvDevice').addEventListener('change', function () {
      var w = Number(this.value) || 375;
      $('phone').style.zoom = String(w / 375);
    });

    // 整页铺开 ↔ 一屏高滚动
    $('pvScreenMode').addEventListener('click', function () {
      var st = $('pvStage');
      var on = st.classList.toggle('screen-mode');
      this.textContent = on ? '整页铺开' : '按手机屏查看';
      this.classList.toggle('primary', on);
    });

    $('pvReload').addEventListener('click', function () {
      refresh(true);
    });

    $('pvAuto').addEventListener('change', function () {
      if (this.checked) startAuto(); else stopAuto();
      paintDot();
      toast(this.checked ? '已开启自动刷新（装修台发布后自动更新）' : '已关闭自动刷新');
    });
  }

  function refresh(manual) {
    var dot = $('pvDot');
    dot.classList.add('busy');
    return loadPages().then(function (r) {
      dot.classList.remove('busy');
      if (!CUR.key && r.list.length) return openPage(r.list[0].key);
      if (r.changed) { if (manual) toast('内容已更新'); return openPage(CUR.key); }
      if (manual) toast('已是最新');
    }).catch(function (e) {
      dot.classList.remove('busy');
      if (manual) toast('刷新失败：' + e.message);
    });
  }

  function paintDot() {
    $('pvDot').classList.toggle('on', $('pvAuto').checked);
  }

  function startAuto() {
    stopAuto();
    TIMER = setInterval(function () {
      if (document.hidden) return; // 页面在后台时不轮询
      loadPages().then(function (r) {
        // 只在「发布版本变了」时重渲染，避免无谓地重建 <img> 导致图片闪白
        if (r.changed && CUR.key) openPage(CUR.key);
      }).catch(function () { /* 轮询失败静默，下轮再试 */ });
    }, 5000);
  }
  function stopAuto() { if (TIMER) { clearInterval(TIMER); TIMER = null; } }

  /* ----------------------------- 启动 ----------------------------- */

  if (typeof PvRender === 'undefined') {
    $('preview').innerHTML = '<div class="pv-error">渲染核心 /shared/pv-render.js 未加载，请检查服务是否已重启</div>';
    return;
  }

  bind();
  paintDot();
  startAuto();
  refresh(false);
})();
