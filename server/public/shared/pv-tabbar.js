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

      var iconHtml = showIconBox
        ? '<div class="pvtb-ico"' + (hideIcon ? ' style="visibility:hidden"' : '') + '>' +
            '<img src="' + esc(src) + '" alt="">' +
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
    CUSTOM_PAGE_PREFIX: CUSTOM_PAGE_PREFIX,
    DEFAULT: DEFAULT,
    PAGES: PAGES,
    MAX_ITEMS: MAX_ITEMS,
    MIN_ITEMS: MIN_ITEMS
  };
})(typeof window !== 'undefined' ? window : this);
