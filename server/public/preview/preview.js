/* =========================================================================
 * 小程序预览页（/preview）
 *
 * 一句话：**不再写 HTML 近似，而是把真机的页面 JS + WXML + WXSS 直接编译出来渲染。**
 *
 * 为什么改：原来的做法是照着小程序手写一份 HTML，靠人肉保持两边一致。
 * 结果就是会走样 —— 实测产品页写成了 3 列（真机 2 列）、左栏选中态写成红字白底
 * （真机黑底白字）、左栏宽度 88px（真机 196rpx = 98px）。预览一旦跟真机不一样就失去意义。
 *
 * 现在的链路（每一环都是真机的源码，没有第二份实现）：
 *   miniprogram/pages/xxx/xxx.js   ← 无头运行时执行，拿到页面 data（mp-runtime.js）
 *   miniprogram/pages/xxx/xxx.wxml ← 编译成 HTML（mp-wxml.js）
 *   miniprogram 下所有 wxss      ← 编译成 CSS（mp-wxss.js）
 *
 * 数据来源就是 replica.js —— 而装修台「立即发布」正是写回 replica.js，
 * 所以这里看到的内容天然等于线上内容，不需要另走接口。
 * ========================================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SCREEN = { w: 375, h: 718 };

  /** 内置 5 个 tab 页 → 真机页面路径；自定义页统一走 pages/custom */
  var BUILTIN = [
    { key: 'home', name: '首页', path: '/pages/index/index', tab: 0 },
    { key: 'lexy', name: '莱克', path: '/pages/lexy/lexy', tab: 1 },
    { key: 'news', name: '资讯', path: '/pages/news/news', tab: 2 },
    { key: 'product', name: '产品', path: '/pages/product/product', tab: 3 },
    { key: 'mine', name: '我的', path: '/pages/mine/mine', tab: 4 }
  ];

  var CUR = { key: '', target: null, meta: null, hasDraft: false, publishedAt: null };
  var SWIPER = {};   // 页面 key → 当前轮播页码（真机自动播放，这里手动翻）
  var TIMER = null;
  var LAST_SIG = '';

  if (window.MpWxss) window.MpWxss.setViewport({ width: SCREEN.w, height: SCREEN.h });

  function toast(msg) {
    var t = $('pvToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t.__tm);
    t.__tm = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function stamp(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var p = function (v) { return String(v).padStart(2, '0'); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function req(path, query) {
    var qs = '';
    if (query) {
      qs = '?' + Object.keys(query).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
      }).join('&');
    }
    return fetch(path + qs, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { code: r.status, msg: 'HTTP ' + r.status }; }); })
      .then(function (j) {
        if (!j || j.code !== 0) throw new Error((j && j.msg) || '请求失败');
        return j.data;
      });
  }

  /** 页面 key → 真机页面路径（自定义页带 ?key= 参数） */
  function targetOf(key) {
    var b = BUILTIN.filter(function (x) { return x.key === key; })[0];
    if (b) return { path: b.path, query: {}, tab: b.tab, name: b.name, builtin: true };
    return { path: '/pages/custom/index', query: { key: key }, tab: -1, name: key, builtin: false };
  }

  /* ----------------------------- 左栏列表 ----------------------------- */

  function loadPages() {
    return req('/api/decorate/pages').then(function (d) {
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
    var host = $('pvPages');
    host.innerHTML = list.map(function (p) {
      var isCustom = !BUILTIN.filter(function (x) { return x.key === p.key; }).length;
      var badges = '';
      if (isCustom) badges += '<span class="pv-badge custom">自定义页</span>';
      if (p.hasDraft) badges += '<span class="pv-badge draft">有未发布草稿</span>';
      badges += '<span class="pv-badge">' + p.blockCount + ' 个内容块</span>';
      return '<button class="pv-item' + (p.key === CUR.key ? ' on' : '') + '" data-key="' + esc(p.key) + '">' +
        '<b>' + esc(p.name) + '</b>' +
        '<small>' + esc(targetOf(p.key).path + (isCustom ? '?key=' + p.key : '')) + '</small>' +
        '<div class="pv-badges">' + badges + '</div>' +
        '</button>';
    }).join('');
  }

  function markActive() {
    var items = $('pvPages').querySelectorAll('.pv-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('on', items[i].getAttribute('data-key') === CUR.key);
    }
  }

  /* ----------------------------- 渲染 ----------------------------- */

  function openPage(key, force) {
    if (!key) return Promise.resolve();
    CUR.key = key;
    CUR.target = targetOf(key);
    markActive();
    applyChrome();

    var screen = $('preview');
    screen.innerHTML = '<div class="pv-loading">正在编译真机页面源码…</div>';
    $('pvNote').textContent = '';
    $('pvNote').className = 'pv-note';

    if (force && window.MpRuntime) window.MpRuntime.clearCache();
    if (window.MpWxml && window.MpWxml.resetStats) window.MpWxml.resetStats();

    // 顺带取一下页面标题（真机导航栏标题来自页面 json，不是装修台里的页面名）
    var titlePromise = window.MpRuntime
      ? window.MpRuntime.fetchText(CUR.target.path + '.json').then(function (t) {
        try { return (JSON.parse(t) || {}).navigationBarTitleText || ''; } catch (e) { return ''; }
      })
      : Promise.resolve('');

    var renderPromise = window.MpRuntime
      ? window.MpRuntime.renderPage(CUR.target.path, CUR.target.query, { swiperIndex: SWIPER[key] || 0 })
      : Promise.reject(new Error('渲染内核 /shared/mp-runtime.js 未加载，请确认服务已重启'));

    return Promise.all([titlePromise, renderPromise]).then(function (r) {
      var title = r[0] || CUR.target.name;
      var out = r[1];
      $('phTitle').textContent = title;
      // 注入真机样式 → 再放 DOM
      $('mpStyle').textContent = out.css;
      screen.innerHTML = out.html;
      applySwiper(key);
      reportStats();
      renderStatus();
    }).catch(function (e) {
      console.error('[预览渲染失败]', e);
      screen.innerHTML = '<div class="pv-error">渲染失败：' + esc(e && e.message) +
        '<code>常见原因：\n' +
        '· /mp-src/ 未开放 —— 服务需以 DEBUG_PAGE 开启启动（重启 node server/index.js）\n' +
        '· 页面源码读取失败 —— 打开浏览器控制台看 /mp-src/… 的请求状态码</code></div>';
      $('pvNote').className = 'pv-note err';
      $('pvNote').textContent = String((e && e.message) || e);
    });
  }

  /** 展示态真机观感：自定义页不属于 tabBar，真机上也没有底部导航 */
  function applyChrome() {
    var t = CUR.target || { tab: -1 };
    var bar = $('phTabbar');
    bar.hidden = t.tab < 0;
    var spans = bar.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i === t.tab);
  }

  function renderStatus() {
    var el = $('pvStatus');
    var parts = ['<b>真机渲染</b>'];
    parts.push('页面源码 <code>' + esc(CUR.target.path) + '</code>');
    parts.push('replica.js 最后发布：' + stamp(CUR.publishedAt));
    if (CUR.hasDraft) parts.push('· 装修台有未发布草稿，这里显示的仍是线上内容');
    el.className = 'pv-status' + (CUR.hasDraft ? ' warn' : '');
    el.innerHTML = parts.join(' ');
  }

  /** 渲染体检：图片总数 / 破损数 / 未支持语法 —— 出问题一眼能看见，不靠人肉比对截图 */
  function reportStats() {
    var screen = $('preview');
    var imgs = screen.querySelectorAll('img');
    var broken = 0;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete && imgs[i].naturalWidth === 0) broken += 1;
    }
    var st = (window.MpWxml && window.MpWxml.stats) || {};
    var bad = (st.exprFail || 0) + (st.unsupportedTag || 0) + (st.missingInclude || 0);

    var bits = [
      imgs.length + ' 张图（破损 ' + broken + '）',
      screen.querySelectorAll('*').length + ' 个节点'
    ];
    var el = $('pvNote');
    if (bad) {
      bits.push('⚠️ 表达式失败 ' + (st.exprFail || 0) + ' · 未支持组件 ' + (st.unsupportedTag || 0) +
        ' · include 未解析 ' + (st.missingInclude || 0));
      el.className = 'pv-note err';
      el.textContent = bits.join(' · ') + ((st.samples || []).length ? '\n' + st.samples.join('\n') : '');
    } else {
      el.className = 'pv-note';
      el.textContent = bits.join(' · ');
    }
  }

  /* ----------------------------- 轮播翻页 ----------------------------- */

  /** 真机轮播是自动播放；预览里按选择的页码显示，便于确认新加的图在第几张 */
  function applySwiper(key) {
    var cur = SWIPER[key] || 0;
    var swipers = $('preview').querySelectorAll('[data-swiper]');
    for (var i = 0; i < swipers.length; i++) {
      var items = swipers[i].querySelectorAll('[data-swiper-item]');
      for (var j = 0; j < items.length; j++) items[j].toggleAttribute('data-on', j === cur);
      var dots = swipers[i].querySelectorAll('.mp-dots i');
      for (var k = 0; k < dots.length; k++) dots[k].className = (k === cur ? 'on' : '');
    }
  }

  /* ----------------------------- 交互 ----------------------------- */

  function bind() {
    $('pvPages').addEventListener('click', function (e) {
      var it = e.target.closest('.pv-item');
      if (!it) return;
      openPage(it.getAttribute('data-key'));
    });

    // 机型：手机壳按 375 基准渲染，用 zoom 等比缩放 —— 与 rpx 的等比行为一致
    $('pvDevice').addEventListener('change', function () {
      var w = Number(this.value) || 375;
      $('phone').style.zoom = String(w / 375);
    });

    $('pvSwiper').addEventListener('change', function () {
      SWIPER[CUR.key] = Number(this.value) || 0;
      applySwiper(CUR.key);
    });

    $('pvReload').addEventListener('click', function () {
      openPage(CUR.key, true).then(function () { toast('已重新编译页面源码'); });
    });

    $('pvAuto').addEventListener('change', function () {
      if (this.checked) startAuto(); else stopAuto();
      paintDot();
      toast(this.checked ? '已开启自动刷新（装修台发布后自动重新编译）' : '已关闭自动刷新');
    });

    // 点手机屏里的轮播：翻到下一张（真机自动播放，这里手动看）
    $('preview').addEventListener('click', function (e) {
      var sw = e.target.closest('[data-swiper]');
      if (!sw) return;
      var items = sw.querySelectorAll('[data-swiper-item]');
      if (items.length < 2) return;
      SWIPER[CUR.key] = ((SWIPER[CUR.key] || 0) + 1) % items.length;
      $('pvSwiper').value = String(Math.min(2, SWIPER[CUR.key]));
      applySwiper(CUR.key);
    });
  }

  function refresh(manual) {
    var dot = $('pvDot');
    dot.classList.add('busy');
    return loadPages().then(function (r) {
      dot.classList.remove('busy');
      var hit = r.list.filter(function (p) { return p.key === CUR.key; })[0];
      if (hit) {
        CUR.hasDraft = !!hit.hasDraft;
        CUR.publishedAt = (hit.lastVersion && hit.lastVersion.at) || null;
      }
      if (!CUR.key && r.list.length) return openPage(r.list[0].key, true);
      if (r.changed) return openPage(CUR.key, true);   // 内容变了 → 清缓存重新编译
      if (manual) toast('已是最新');
      renderStatus();
    }).catch(function (e) {
      dot.classList.remove('busy');
      if (manual) toast('刷新失败：' + e.message);
    });
  }

  function paintDot() { $('pvDot').classList.toggle('on', $('pvAuto').checked); }

  function startAuto() {
    stopAuto();
    TIMER = setInterval(function () {
      if (document.hidden) return;
      loadPages().then(function (r) {
        if (!r.changed) return;
        var hit = r.list.filter(function (p) { return p.key === CUR.key; })[0];
        if (hit) {
          CUR.hasDraft = !!hit.hasDraft;
          CUR.publishedAt = (hit.lastVersion && hit.lastVersion.at) || null;
        }
        return openPage(CUR.key, true);
      }).catch(function () { /* 轮询失败静默，下轮再试 */ });
    }, 5000);
  }
  function stopAuto() { if (TIMER) { clearInterval(TIMER); TIMER = null; } }

  /* ----------------------------- 启动 ----------------------------- */

  if (typeof window.MpRuntime === 'undefined' || typeof window.MpWxml === 'undefined' || typeof window.MpWxss === 'undefined') {
    $('preview').innerHTML = '<div class="pv-error">渲染内核未加载（/shared/mp-wxss.js · mp-wxml.js · mp-runtime.js）<code>请确认服务已重启，且 DEBUG_PAGE 为开启状态</code></div>';
    return;
  }

  bind();
  paintDot();
  startAuto();
  refresh(false);
})();
