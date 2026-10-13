/* =========================================================================
 * 底部导航（tabBar）预览渲染 —— 装修台手机壳与 /preview 共用**唯一一份**实现
 *
 * 为什么抽出来：底部导航会出现在三处渲染（小程序 custom-tab-bar 组件、
 * 装修台手机壳、/preview），各写一份的结果必然走样 —— 本项目已经因为
 * 「同一份数据两处消费」踩过高度单位二次换算的坑（首屏海报变成 1.55 屏高）。
 * 所以这里把「结构 + 样式」一起收进来，调用方只负责传配置和高亮项。
 *
 * 渲染规则严格对齐 miniprogram/custom-tab-bar/index.wxml：
 *   · 图标框**常驻占位** —— 「仅选中显示图标」时未选中项只是把图标隐藏
 *     （visibility），文字不会上下跳动
 *   · 选中项用 selectedColor，其余用 color（装修台可配）
 *   · 背景色 / 顶部分割线色同样来自配置
 *   · 高度 50px —— 与微信原生 tabBar 一致，也是页面可视区高度扣减的基准
 *
 * 数据源是 replica.TABBAR（装修台「店铺导航」发布时写回），
 * 没有配置时回落这里的 DEFAULT —— 与后端 schema.js、小程序组件的兜底值三处一致。
 * ========================================================================= */
(function (root) {
  'use strict';

  var MAX_ITEMS = 5;
  var MIN_ITEMS = 2;
  var ICON_MODES = ['always', 'active', 'never'];
  var HEX_RE = /^#[0-9a-fA-F]{6}$/;

  /* 文案截断口径与后端 schema.tabbarItem / 小程序组件 readConfig 字面一致：
     trim → slice(5) → trim（先 trim 才不会让前导空格吃掉字数配额） */
  function cutText(v) {
    return String(v == null ? '' : v).trim().slice(0, 5).trim();
  }

  /*
   * 候选页面与中文名。真源是 miniprogram/app.json 的 tabBar.list ——
   * 微信要求 tabBar 页面必须静态声明，所以只可能是这 5 个内置页面。
   * 这份表必须与后端 schema.TABBAR_PAGES 逐项一致：装修台是拿**草稿数据**
   * 直接喂给本模块预览的，如果这里的页面名/回落规则和后端不同，
   * 就会出现「装修台预览显示一个样、发布后真机另一个样」。自检会锁死这条。
   */
  var PAGES = [
    { path: '/pages/index/index', name: '首页' },
    { path: '/pages/lexy/lexy', name: '莱克' },
    { path: '/pages/news/news', name: '资讯' },
    { path: '/pages/product/product', name: '产品' },
    { path: '/pages/mine/mine', name: '我的' }
  ];

  /* 自定义页在导航项 path 里的写法 —— 与后端 schema.CUSTOM_PAGE_PREFIX、
     小程序 custom-tab-bar 里的同名字面**必须一致**。 */
  var CUSTOM_PAGE_PREFIX = '/pages/custom/index?key=';

  /*
   * 装修台新建的自定义页（path → 页面名），由 setCustomPages 注入。
   *
   * 为什么需要：**草稿里的导航文案是允许为空的**（运营刚加一项、还没起名），
   * 空文案要回落成页面名。预览端手上没有 replica 的完整自定义页表，
   * 认不出自定义页名就会渲染成空文字 —— 而后端 schema.tabbarItem 是认得的，
   * 发布后真机上显示的是页面名。两边不一致 = 运营照着错的预览去配。
   */
  var CUSTOM = {};

  function setCustomPages(list) {
    CUSTOM = {};
    (list || []).forEach(function (p) {
      var path = p && p.path;
      if (typeof path === 'string' && path.indexOf(CUSTOM_PAGE_PREFIX) === 0) {
        CUSTOM[path] = String(p.name || '');
      }
    });
  }

  function pageName(path) {
    for (var i = 0; i < PAGES.length; i++) { if (PAGES[i].path === path) return PAGES[i].name; }
    if (CUSTOM[path] !== undefined) return CUSTOM[path] || String(path == null ? '' : path);
    return String(path == null ? '' : path);
  }

  /**
   * 能当底部导航目标的路径：内置 5 个 tab 页 + 自定义页。
   * 与后端 schema.isTabbarPath 同一口径 —— 分类 / 购物车 / 全部商品都不算。
   *
   * ⚠️ 自定义页只按**字面形式**放行，不依赖 CUSTOM 表是否已注入：
   *    否则装修台少调一次 setCustomPages，所有自定义页就会被判成非法、
   *    静默回落成「首页」——预览显示的是首页、保存后真机也是首页，很难查。
   */
  function isPage(path) {
    if (typeof path === 'string' && path.indexOf(CUSTOM_PAGE_PREFIX) === 0 &&
        path.length > CUSTOM_PAGE_PREFIX.length) return true;
    for (var i = 0; i < PAGES.length; i++) { if (PAGES[i].path === path) return true; }
    return false;
  }

  /*
   * 兜底配置：replica 里还没有 TABBAR（装修台从没发布过导航）时用它。
   *
   * ⚠️ 必须与后端 `schema.tabbarDefault()`、小程序 `custom-tab-bar/index.js` 的 FALLBACK
   *    **逐字段一致**（自检锁死）。默认项**自带图标** —— 图标是包内资源
   *    （miniprogram/images/tabbar/，复刻自有赞「店铺导航」的图标字体），
   *    所以「没配过导航」的站点底部也是有图标的，与真机一致。
   */
  var DEFAULT = {
    color: '#8A8A8A',
    selectedColor: '#C8102E',
    background: '#FFFFFF',
    borderColor: '#EEEEEE',
    iconMode: 'always',
    items: [
      { path: '/pages/index/index', text: '首页', icon: '/images/tabbar/home.png', activeIcon: '/images/tabbar/home-active.png' },
      { path: '/pages/lexy/lexy', text: '莱克', icon: '/images/tabbar/lexy.png', activeIcon: '/images/tabbar/lexy-active.png' },
      { path: '/pages/news/news', text: '资讯', icon: '/images/tabbar/news.png', activeIcon: '/images/tabbar/news-active.png' },
      { path: '/pages/product/product', text: '产品', icon: '/images/tabbar/product.png', activeIcon: '/images/tabbar/product-active.png' },
      { path: '/pages/mine/mine', text: '我的', icon: '/images/tabbar/mine.png', activeIcon: '/images/tabbar/mine-active.png' }
    ]
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** 色值：非法回落默认，合法统一转大写（与后端 tabbarColor 同口径，避免同一份数据两种写法） */
  function hex(v, def) {
    var s = (typeof v === 'string') ? v.trim() : '';
    return HEX_RE.test(s) ? s.toUpperCase() : def;
  }

  /**
   * 规整配置 —— **逐条对齐后端 schema.normalizeTabbar**，且同样幂等：
   *   非法 path 回落第一个候选页 / 空文案回落页面名 / 同页面去重 /
   *   文案截 5 字 / 项数收敛到 2~5 / 色值大写 / 多余字段丢掉。
   * 为什么必须逐条对齐：装修台是拿草稿（还没经过后端归一化）直接渲染预览的。
   *
   * 注意**不在这里补默认图标**：图标是数据的一部分（发布时写进 replica.TABBAR），
   * 归一化补了就会与后端结果字段级不一致 —— 那样自检报的「装修台口径 ≠ 后端口径」
   * 就成了真问题，而不是噪音。
   */
  function normalize(cfg) {
    var src = (cfg && typeof cfg === 'object') ? cfg : {};
    var raw = (Array.isArray(src.items) && src.items.length) ? src.items : DEFAULT.items;

    var items = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var o = (raw[i] && typeof raw[i] === 'object') ? raw[i] : {};
      var path = isPage(o.path) ? o.path : PAGES[0].path;
      if (seen[path]) continue; // 同一页面只保留第一次出现（否则底部有两处同时高亮）
      seen[path] = true;
      items.push({
        path: path,
        text: cutText(o.text) || pageName(path),
        icon: typeof o.icon === 'string' ? o.icon : '',
        activeIcon: typeof o.activeIcon === 'string' ? o.activeIcon : ''
      });
    }
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
    var guard = 0;
    while (items.length < MIN_ITEMS && guard++ < PAGES.length) {
      var free = PAGES[0];
      for (var j = 0; j < PAGES.length; j++) { if (!seen[PAGES[j].path]) { free = PAGES[j]; break; } }
      seen[free.path] = true;
      items.push({ path: free.path, text: free.name, icon: '', activeIcon: '' });
    }

    return {
      color: hex(src.color, DEFAULT.color),
      selectedColor: hex(src.selectedColor, DEFAULT.selectedColor),
      background: hex(src.background, DEFAULT.background),
      borderColor: hex(src.borderColor, DEFAULT.borderColor),
      iconMode: ICON_MODES.indexOf(src.iconMode) >= 0 ? src.iconMode : DEFAULT.iconMode,
      items: items
    };
  }

  /* ======================================================================
   * 图标染色 —— 与 miniprogram/utils/navcolor.js **同一算法**（自检喂同一批
   * 色值给两边、逐字符比 filter 字符串；改一边必须同步改另一边）。
   *
   * 为什么预览也要染：内置图标是 PNG，颜色画死在图里（未选中 #8A8A8A /
   * 选中 #C8102E）。只改 color 的话文字会变、图标不变 —— 运营在装修台里
   * 改「未选中颜色」看不到图标跟着变，就以为这功能坏了。有赞的内置图标是
   * 图标字体（yz-tabbar-icon-v2），字形跟着 color 走；我们等效地用 CSS filter
   * 把位图染成目标色（算法取舍见 navcolor.js 顶部注释）。
   * ====================================================================== */
  var BUILTIN_PREFIX = '/images/tabbar/';
  var SRC_OFF = '#8A8A8A';   // home.png 等未选中图标的主色（生成脚本固定写的）
  var SRC_ON = '#C8102E';    // 对应的 -active.png 主色

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  function hexToRgb(hex) {
    var s = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
    if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }

  /* CSS Filter Effects Level 1 的色彩矩阵，统一表示成 3×4：
     [m00,m01,m02,o0, m10,m11,m12,o1, m20,m21,m22,o2]，作用在非预乘 sRGB 上 */
  function fApply(m, v) {
    return [
      clamp01(m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3]),
      clamp01(m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7]),
      clamp01(m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11])
    ];
  }

  function fInvert(p) { var a = 1 - 2 * p; return [a, 0, 0, p, 0, a, 0, p, 0, 0, a, p]; }

  var SEPIA9 = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];

  function mixIdentity(m9, t) {
    var o = [];
    for (var i = 0; i < 9; i++) {
      var id = (i === 0 || i === 4 || i === 8) ? 1 : 0;
      o[i] = id * (1 - t) + m9[i] * t;
    }
    return [o[0], o[1], o[2], 0, o[3], o[4], o[5], 0, o[6], o[7], o[8], 0];
  }

  function fSepia(p) { return mixIdentity(SEPIA9, p); }

  function fSaturate(s) {
    return [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0
    ];
  }

  function fHueRotate(deg) {
    var c = Math.cos(deg * Math.PI / 180);
    var s = Math.sin(deg * Math.PI / 180);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0
    ];
  }

  function fBrightness(b) { return [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0]; }

  function fContrast(k) { var o = 0.5 - 0.5 * k; return [k, 0, 0, o, 0, k, 0, o, 0, 0, k, o]; }

  /* 参数量纲：[invert, sepia, saturate, hueRotate(deg), brightness, contrast] */
  var RANGE = [[0, 1], [0, 1], [0, 30], [-180, 180], [0, 2], [0.5, 2]];
  var STEP = [0.01, 0.01, 0.01, 1, 0.01, 0.01];
  var SEEDS = [
    [0.5, 1, 1, 0, 1, 1],
    [0.5, 0, 1, 0, 1, 1],
    [0.2, 1, 8, 0, 1, 1],
    [0.8, 1, 8, 0, 1, 1],
    [0.5, 1, 12, 120, 1, 1],
    [0.5, 1, 12, -120, 1, 1]
  ];

  function fEvaluate(p, target) {
    var v = [0, 0, 0]; // brightness(0) saturate(100%) 之后恒为黑
    v = fApply(fInvert(p[0]), v);
    v = fApply(fSepia(p[1]), v);
    v = fApply(fSaturate(p[2]), v);
    v = fApply(fHueRotate(p[3]), v);
    v = fApply(fBrightness(p[4]), v);
    v = fApply(fContrast(p[5]), v);
    var dr = v[0] - target[0], dg = v[1] - target[1], db = v[2] - target[2];
    return { v: v, e: dr * dr + dg * dg + db * db };
  }

  function clampParam(k, x) {
    var lo = RANGE[k][0], hi = RANGE[k][1];
    return x < lo ? lo : (x > hi ? hi : x);
  }

  function snap(k, x) { return clampParam(k, Math.round(x / STEP[k]) * STEP[k]); }

  /** 确定性求解（无随机数）→ 同样输入在任何一端都得到同样的 filter 字符串 */
  function tintSolve(target) {
    var best = null;
    for (var si = 0; si < SEEDS.length; si++) {
      var p = SEEDS[si].slice();
      var span = [0.5, 0.5, 15, 180, 0.5, 0.5];
      var cur = fEvaluate(p, target);
      for (var round = 0; round < 24; round++) {
        for (var k = 0; k < 6; k++) {
          var c0 = clampParam(k, p[k] - span[k]);
          var c1 = clampParam(k, p[k] + span[k]);
          if (c1 <= c0) continue;
          var N = 8;
          for (var j = 0; j <= N; j++) {
            var cand = p.slice();
            cand[k] = c0 + (c1 - c0) * j / N;
            var ce = fEvaluate(cand, target);
            if (ce.e < cur.e) { cur = ce; p = cand; }
          }
        }
        for (var q = 0; q < 6; q++) span[q] *= 0.6;
      }
      if (!best || cur.e < best.e) best = { e: cur.e, p: p };
    }
    for (var pk = 0; pk < 6; pk++) best.p[pk] = snap(pk, best.p[pk]);
    var bestQ = { e: fEvaluate(best.p, target).e, p: best.p.slice() };
    for (var pass = 0; pass < 8; pass++) {
      var improved = false;
      for (var kk = 0; kk < 6; kk++) {
        for (var dir = -1; dir <= 1; dir += 2) {
          var c2 = bestQ.p.slice();
          c2[kk] = snap(kk, c2[kk] + dir * STEP[kk]);
          var e2 = fEvaluate(c2, target).e;
          if (e2 < bestQ.e) { bestQ = { e: e2, p: c2 }; improved = true; }
        }
      }
      if (!improved) break;
    }
    return bestQ;
  }

  /** 参数 → filter 字符串。六个原语恒定输出，不做「恒等就省略」的分支 */
  function toFilter(p) {
    return 'brightness(0) saturate(100%)' +
      ' invert(' + Math.round(p[0] * 100) + '%)' +
      ' sepia(' + Math.round(p[1] * 100) + '%)' +
      ' saturate(' + Math.round(p[2] * 100) + '%)' +
      ' hue-rotate(' + Math.round(p[3]) + 'deg)' +
      ' brightness(' + Math.round(p[4] * 100) + '%)' +
      ' contrast(' + Math.round(p[5] * 100) + '%)';
  }

  var tintCache = {};

  function tintFilter(hex) {
    var t = hexToRgb(hex);
    if (!t) return '';
    var key = String(hex).trim().toUpperCase();
    if (tintCache[key] === undefined) tintCache[key] = toFilter(tintSolve(t).p);
    return tintCache[key];
  }

  /** 源图主色：只对内置图标（/images/tabbar/）成立，别的返回 '' */
  function sourceColor(src) {
    var s = typeof src === 'string' ? src : '';
    if (s.indexOf(BUILTIN_PREFIX) !== 0) return '';
    return /-active\.png$/i.test(s) ? SRC_ON : SRC_OFF;
  }

  /**
   * 该图标在该颜色下要不要染色、染成什么。
   * 两条「不染」：① 非内置图标（素材库 / 自传图保持原色，与有赞一致）；
   *              ② 目标色 == 源色（默认态 → 零变化，像素与改造前逐点相同）。
   */
  function iconFilter(src, color) {
    var ref = sourceColor(src);
    if (!ref) return '';
    if (String(color || '').trim().toUpperCase() === ref) return '';
    return tintFilter(color);
  }

  var STYLE_ID = 'pvtbStyle';

  /** 样式只注入一次（装修台与预览页的宿主样式表都不必再重复写一份） */
  function ensureStyle(doc) {
    doc = doc || root.document;
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.pvtb{display:flex;height:50px;box-sizing:border-box;border-top:1px solid #eee;background:#fff;',
      'font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,sans-serif;}',
      /* 作者样式里的 display 会盖过 UA 样式表的 [hidden]{display:none}，必须显式写一条 */
      '.pvtb[hidden]{display:none !important;}',
      '.pvtb-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;}',
      '.pvtb-ico{height:22px;margin-bottom:2px;display:flex;align-items:center;justify-content:center;}',
      '.pvtb-ico img{width:22px;height:22px;display:block;object-fit:contain;border-radius:0;background:none;}',
      '.pvtb-text{max-width:100%;font-size:10px;line-height:1;color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    ].join('');
    (doc.head || doc.documentElement).appendChild(style);
  }

  /**
   * 渲染进容器。
   * @param {Element} container 手机壳里的底部导航容器（会被整体接管 class / style / innerHTML）
   * @param {object}  cfg       replica.TABBAR 或装修台草稿里的导航配置
   * @param {string}  activePath 当前高亮页面的路径（如 /pages/product/product）；空串则都不高亮
   * @param {boolean} hidden     是否隐藏。**自定义页不再一律隐藏** ——
   *   被装修台配成某个导航项的自定义页，真机上底部是有一条导航的
   *   （对标有赞「指定微页面被选为底部导航跳转页时，也会展示底部导航」），
   *   预览里也必须显示，否则运营按着「没有导航」的样子去排版，真机上会被盖住。
   */
  function apply(container, cfg, activePath, hidden) {
    if (!container) return;
    ensureStyle(container.ownerDocument);

    var c = normalize(cfg);
    var active = String(activePath || '');

    container.className = 'pvtb';
    container.hidden = !!hidden;
    container.style.background = c.background;
    container.style.borderTopColor = c.borderColor;

    container.innerHTML = c.items.map(function (it) {
      var on = !!active && it.path === active;
      var hasIcon = !!(it.icon || it.activeIcon);
      var showIconBox = hasIcon && c.iconMode !== 'never';
      var src = (on ? (it.activeIcon || it.icon) : (it.icon || it.activeIcon)) || '';
      // 「仅选中显示图标」：未选中项把图标藏起来但**保留占位**，文字不会跳
      var hideIcon = c.iconMode === 'active' && !on;
      /* 图标染色：内置图标跟着配色走（computed style 里也能看到 filter，
         便于自检/探针直接断言「预览确实染了」）。自传图 / 素材库图不染。
         ⚠️ visibility 只挂外层 `.pvtb-ico`（visibility 会继承给 img），
         别再往 img 上写一遍 —— 那会多出一份冗余内联样式，
         也会让「数 visibility 出现次数」这类渲染断言凭空翻倍（实测被 test-tabbar 抓到）。 */
      var tint = iconFilter(src, on ? c.selectedColor : c.color);

      var iconHtml = showIconBox
        ? '<div class="pvtb-ico"' + (hideIcon ? ' style="visibility:hidden"' : '') + '>' +
            '<img src="' + esc(src) + '" alt=""' + (tint ? ' style="filter:' + esc(tint) + '"' : '') + '>' +
          '</div>'
        : '';

      return '<div class="pvtb-item' + (on ? ' on' : '') + '"' +
        ' style="color:' + esc(on ? c.selectedColor : c.color) + '">' +
        iconHtml +
        '<span class="pvtb-text">' + esc(it.text) + '</span>' +
      '</div>';
    }).join('');
  }

  root.PvTabbar = {
    apply: apply,
    normalize: normalize,
    ensureStyle: ensureStyle,
    setCustomPages: setCustomPages,
    isPage: isPage,
    pageName: pageName,
    /* 图标染色 —— 自检会拿这三个（tintFilter / iconFilter / sourceColor）
       与 miniprogram/utils/navcolor.js 的同名实现喂同一批输入比结果 */
    tintFilter: tintFilter,
    iconFilter: iconFilter,
    sourceColor: sourceColor,
    CUSTOM_PAGE_PREFIX: CUSTOM_PAGE_PREFIX,
    DEFAULT: DEFAULT,
    PAGES: PAGES,
    MAX_ITEMS: MAX_ITEMS,
    MIN_ITEMS: MIN_ITEMS
  };
})(typeof window !== 'undefined' ? window : this);
