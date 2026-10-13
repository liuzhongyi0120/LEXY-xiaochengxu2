/**
 * 自定义底部导航（tabBar）
 *
 * 为什么要有这个组件：
 *   原生 tabBar 的文字 / 图标 / 配色全部写死在 app.json 里，改一次就要改代码、重新提审。
 *   app.json 里把 tabBar.custom 设为 true 后，底部导航完全由本组件渲染，
 *   数据源是 miniprogram/config/replica.js 的 TABBAR —— 也就是装修台
 *   「店铺导航」面板发布出来的配置（导航名称 / 图标 / 顺序 / 配色）。
 *
 * ⚠️ 三条必须记住的规则：
 *   1. 组件实例是「每个 tab 页各一份」，切页时微信**不会**自动改高亮，
 *      必须由页面在 onShow 里调 utils/tabbar.js 的 syncTabBar(this) 主动同步 ——
 *      漏掉哪个页面，就会出现「切过去了还高亮着上一个」。
 *   2. app.json 的 tabBar.list 仍要完整声明这 5 个内置页（微信用它识别哪些是 tab 页）。
 *      自定义页**不在** list 里，switchTab 打不开它 —— 所以点自定义页项时改用
 *      navigateTo，并由 pages/custom/index 自己再渲染一份本组件。
 *      这正是对标有赞「店铺导航」：它的跳转目标可以是「微页面」，而且明确写着
 *      「指定微页面被选为底部导航跳转页时，也会展示底部导航」。
 *   3. 点击时**不要**在组件里立刻 setData 改高亮 —— 官方示例验证过，
 *      这样会和目标页 onShow 的同步打架，出现高亮闪烁。交给目标页同步即可。
 */

const replica = require('../config/replica');
const { resolveAssets } = require('../utils/asset');
const { BASE_URL } = require('../utils/constants');
const { iconSrc } = require('../utils/navcolor');

/**
 * 兜底配置：replica 里还没有 TABBAR（装修台没发布过导航）时使用，
 * 与后端 schema.tabbarDefault() 的默认值一致。
 *
 * 兜底项**自带图标** —— 图标是**包内资源**（miniprogram/images/tabbar/），
 * 复刻自有赞「店铺导航」配置页的图标字体 yz-tabbar-icon-v2
 * （未选中 / 选中是同一个字形、两种颜色），生成脚本 `.tooling/make-tabbar-icons.py`。
 * 放包内而不是素材库的理由：① 微信原生 tabBar 的 iconPath 只认包内路径；
 * ② 底部导航是每个页面都要立刻显示的界面骨架，不该依赖「素材已同步到线上」。
 */
const FALLBACK = {
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

const ICON_MODES = ['always', 'active', 'never'];
const MAX_ITEMS = 5;

/**
 * 自定义页在导航项 path 里的统一写法 ——
 * 与后端 schema.CUSTOM_PAGE_PREFIX / 装修台 linkOptions 生成的字面**必须一致**。
 */
const CUSTOM_PAGE_PREFIX = '/pages/custom/index?key=';

/** 这 5 个是真 tab 页（在 app.json 的 tabBar.list 里），只能用 wx.switchTab 打开 */
const TAB_PATHS = FALLBACK.items.map(function (it) { return it.path; });

function isTabPath(path) {
  return TAB_PATHS.indexOf(path) >= 0;
}

/**
 * 取导航项里的自定义页 key；不是自定义页则返回空串。
 *
 * 为什么要单独判一次：**微信只允许 wx.switchTab 打开 tabBar.list 里声明的页面**，
 * 而自定义页共用 pages/custom/index（靠 ?key= 区分），既不在 list 里、
 * switchTab 也传不了参数。所以「底部导航能选自定义页」只能靠这条替代路径：
 *   navigateTo 打开 → 目标页自己再渲染一份底部导航（见 pages/custom/index）。
 */
function customKeyOf(path) {
  const s = String(path == null ? '' : path);
  return s.indexOf(CUSTOM_PAGE_PREFIX) === 0 ? s.slice(CUSTOM_PAGE_PREFIX.length) : '';
}

/** 文案截断口径与后端 schema.tabbarItem / 预览 pv-tabbar.js 字面一致：trim → slice(5) → trim */
function cutText(v) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, 5).trim();
}

/**
 * 空文案回落页面名 —— 与后端 schema.tabbarItem / 预览 pv-tabbar.js 的 `cutText(o.text) || pageName(path)` 同口径。
 * 名字表就用下面的 FALLBACK（正是那 5 个内置 tab 页），不另外写死一份。
 * 漏了这条会出现「有图标、没文字」的空白 tab —— 装修台预览与真机长得不一样。
 *
 * ⚠️ 自定义页（/pages/custom/index?key=xxx）也要认得 —— 名字取自 replica.CUSTOM_PAGES，
 *    与后端 `schema.tabbarPageName()` 同源。
 *    只认那 5 个内置页的话：运营给「全系」这种自定义页**留空文案**（合法，后端会回落成页面名）
 *    时，装修台预览显示「全系」、真机却渲染成一个**只有高亮色、没有文字的空白 tab**。
 *    三处（schema / 本组件 / pv-tabbar）对同一份输入必须给出同一个名字。
 *    注意**不要**在这里做 5 字截断：后端是 `text || tabbarPageName(path)`，
 *    回落出来的页面名不参与截断（页面名可以比 5 个字长），三处口径保持一致。
 */
function pageName(path) {
  for (let i = 0; i < FALLBACK.items.length; i++) {
    if (FALLBACK.items[i].path === path) return FALLBACK.items[i].text;
  }
  const ck = customKeyOf(path);
  if (ck) {
    const p = (replica.CUSTOM_PAGES || {})[ck];
    if (p && p.name) return String(p.name);
  }
  return '';
}

/**
 * 读一份「一定能渲染」的导航配置。
 * 这里再做一遍兜底（而不是直接信任 replica）：装修数据是运营配的，
 * 隔一层防御就能保证「配错了也不会白屏 / 不会出现空导航条」。
 */
function readConfig() {
  const src = (replica.TABBAR && typeof replica.TABBAR === 'object') ? replica.TABBAR : FALLBACK;
  const raw = (Array.isArray(src.items) && src.items.length) ? src.items : FALLBACK.items;

  /* 配色先定下来：图标染色要用它（见下） */
  const color = src.color || FALLBACK.color;
  const selectedColor = src.selectedColor || FALLBACK.selectedColor;
  const iconMode = ICON_MODES.indexOf(src.iconMode) >= 0 ? src.iconMode : FALLBACK.iconMode;

  const items = [];
  const seen = {};
  for (let i = 0; i < raw.length && items.length < MAX_ITEMS; i++) {
    const it = raw[i];
    if (!it || !it.path || seen[it.path]) continue;
    /* 同一页面只保留第一次出现 —— 与后端 normalizeTabbar / 预览 pv-tabbar 同口径。
       重复项会让底部出现两处同时高亮（手改 replica.js 时很容易写出来）。 */
    seen[it.path] = true;
    /* 图标取值直接来自数据（发布时已写进 replica.TABBAR）；
       activeIcon 空则沿用未选中图标 —— 运营只传了一张图时，两态用同一张。 */
    const icon = resolveAssets(it.icon || '');
    const activeIcon = resolveAssets(it.activeIcon || it.icon || '');

    /*
     * 图标染色（对齐有赞「导航图标色」）：内置 PNG 图标颜色是画死在图里的，
     * 只改 `color` 的话文字会变、图标不变。
     *
     * 这里只负责**拼地址**，像素级的染色在服务端做（换 RGB、留 alpha，输出标准 PNG，
     * 见 server/lib/navicon.js）。目标色 == 源色（默认配色）时 iconSrc 原样返回包内路径
     * —— 零网络请求、零变化；只有真改了色，图标才指向 /navicon/<名>@<色>.png。
     *
     * ⚠️ 别再改回 CSS filter：微信渲染层对 <image> 的 filter 支持不可靠 ——
     * 实测开发者工具里选中项图标渲染成一个 22×22 的**实心**色块（alpha 被丢），
     * 而浏览器里同样的 filter 逐像素正确 →「装修台预览好看、真机是色块」。
     * 详见 utils/navcolor.js 顶部注释。
     */
    const srcOff = iconSrc(icon, color, BASE_URL);
    const srcOn = iconSrc(activeIcon, selectedColor, BASE_URL);

    items.push({
      path: it.path,
      text: cutText(it.text) || pageName(it.path),
      icon: icon,
      activeIcon: activeIcon,
      hasIcon: !!(icon || activeIcon),
      /* 两态各自的最终地址（默认配色下就是包内原图本身） */
      srcOff: srcOff,
      srcOn: srcOn,
      /* 原图兜底：染色图加载失败时回落（宁可图标是原色，也不要一个空白 tab） */
      rawOff: icon,
      rawOn: activeIcon,
      /*
       * 「仅选中显示图标」的未选中态要**隐藏图标但保留占位**（visibility 而非 display:none），
       * 这样文字不会上下跳。字符串在 JS 里预生成 —— 放到 wxml 里拼，
       * 漏一个字符就会静默失效，而且没有单测能拦。
       */
      styleOff: iconMode === 'active' ? 'visibility:hidden' : ''
    });
  }

  return {
    color: color,
    selectedColor: selectedColor,
    background: src.background || FALLBACK.background,
    borderColor: src.borderColor || FALLBACK.borderColor,
    iconMode: iconMode,
    items: items
  };
}

Component({
  data: Object.assign({ selected: 0 }, readConfig()),

  lifetimes: {
    attached() {
      // 重新编译后配置可能已经变了，挂载时重新读一次（保留当前高亮）
      this.setData(Object.assign({ selected: this.data.selected }, readConfig()));
    }
  },

  methods: {
    /**
     * 供页面 onShow 调用：按「页面路径」定位高亮项。
     * 用路径而不是写死的序号 —— 运营在装修台把顺序调整过后，序号会全部错位。
     * 找不到（某一项被运营删掉了）时设为 -1：宁可都不高亮，也不要错误地高亮别人。
     */
    setActive(path) {
      const items = this.data.items || [];
      let index = -1;
      for (let i = 0; i < items.length; i++) {
        if (items[i].path === path) { index = i; break; }
      }
      if (index !== this.data.selected) this.setData({ selected: index });
    },

    /**
     * 染色图标加载失败 → 回落到包内原图。
     *
     * 什么时候会失败：运营把配色改成了非默认值，图标就变成一条对服务端的请求
     * （/navicon/…），网络不好 / 服务端没起来 / 线上还没同步到新代码时就会失败。
     * 不做这条兜底的话，那个 tab 会变成**一个空白图标**（文字还在），
     * 比「图标是原色灰/红」糟糕得多 —— 后者至少还是个正常的导航条。
     *
     * 已经在用原图时直接返回，否则每次 error 都 setData 会把这条路径变成死循环。
     */
    onIconError(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = (this.data.items || [])[index];
      if (!item) return;
      const isOn = index === this.data.selected;
      const key = isOn ? 'srcOn' : 'srcOff';
      const raw = isOn ? item.rawOn : item.rawOff;
      if (!raw || item[key] === raw) return;
      const patch = {};
      patch['items[' + index + '].' + key] = raw;
      this.setData(patch);
    },

    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = (this.data.items || [])[index];
      if (!item || !item.path) return;
      // 点的是当前页就不跳，避免无意义的 switchTab 闪动
      if (index === this.data.selected) return;

      const fail = () => wx.showToast({ title: '页面打开失败', icon: 'none' });

      if (isTabPath(item.path)) {
        wx.switchTab({ url: item.path, fail });
        return;
      }

      /* 自定义页：switchTab 打不开（不在 tabBar.list 里，且 tab 跳转不支持带参数）。
         用 navigateTo 压栈打开 —— 这也正是「底部导航项点进去后，底部导航还在」的原因：
         目标页 pages/custom/index 会自己再渲染一份本组件。 */
      if (customKeyOf(item.path)) {
        const pages = getCurrentPages();
        const cur = pages.length ? (pages[pages.length - 1].route || '') : '';
        /* 已经在自定义页容器里 → 用 redirectTo 替换当前页。
           不然「自定义页 A → 自定义页 B → …」会把页面栈越堆越深（微信上限 10 层），
           而且用户连按返回要按很多次才回得到 tab 页。 */
        const go = cur === 'pages/custom/index' ? wx.redirectTo : wx.navigateTo;
        go({ url: item.path, fail });
        return;
      }

      fail();
    }
  }
});
