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
 *   2. app.json 的 tabBar.list 仍要完整声明（微信用它识别哪些是 tab 页），
 *      所以底部导航只能放这 5 个内置页面，不能塞自定义页（微信限制）。
 *   3. 点击时**不要**在组件里立刻 setData 改高亮 —— 官方示例验证过，
 *      这样会和目标页 onShow 的同步打架，出现高亮闪烁。交给目标页同步即可。
 */

const replica = require('../config/replica');
const { resolveAssets } = require('../utils/asset');

/** 兜底配置：replica 里还没有 TABBAR（装修台没发布过导航）时使用，与后端 schema 的默认值一致 */
const FALLBACK = {
  color: '#8A8A8A',
  selectedColor: '#C8102E',
  background: '#FFFFFF',
  borderColor: '#EEEEEE',
  iconMode: 'always',
  items: [
    { path: '/pages/index/index', text: '首页' },
    { path: '/pages/lexy/lexy', text: '莱克' },
    { path: '/pages/news/news', text: '资讯' },
    { path: '/pages/product/product', text: '产品' },
    { path: '/pages/mine/mine', text: '我的' }
  ]
};

const ICON_MODES = ['always', 'active', 'never'];
const MAX_ITEMS = 5;

/** 文案截断口径与后端 schema.tabbarItem / 预览 pv-tabbar.js 字面一致：trim → slice(5) → trim */
function cutText(v) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, 5).trim();
}

/**
 * 读一份「一定能渲染」的导航配置。
 * 这里再做一遍兜底（而不是直接信任 replica）：装修数据是运营配的，
 * 隔一层防御就能保证「配错了也不会白屏 / 不会出现空导航条」。
 */
function readConfig() {
  const src = (replica.TABBAR && typeof replica.TABBAR === 'object') ? replica.TABBAR : FALLBACK;
  const raw = (Array.isArray(src.items) && src.items.length) ? src.items : FALLBACK.items;

  const items = [];
  const seen = {};
  for (let i = 0; i < raw.length && items.length < MAX_ITEMS; i++) {
    const it = raw[i];
    if (!it || !it.path || seen[it.path]) continue;
    /* 同一页面只保留第一次出现 —— 与后端 normalizeTabbar / 预览 pv-tabbar 同口径。
       重复项会让底部出现两处同时高亮（手改 replica.js 时很容易写出来）。 */
    seen[it.path] = true;
    const icon = resolveAssets(it.icon || '');
    const activeIcon = resolveAssets(it.activeIcon || it.icon || '');
    items.push({
      path: it.path,
      text: cutText(it.text),
      icon: icon,
      activeIcon: activeIcon,
      hasIcon: !!(icon || activeIcon)
    });
  }

  return {
    color: src.color || FALLBACK.color,
    selectedColor: src.selectedColor || FALLBACK.selectedColor,
    background: src.background || FALLBACK.background,
    borderColor: src.borderColor || FALLBACK.borderColor,
    iconMode: ICON_MODES.indexOf(src.iconMode) >= 0 ? src.iconMode : FALLBACK.iconMode,
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

    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = (this.data.items || [])[index];
      if (!item || !item.path) return;
      // 点的是当前页就不跳，避免无意义的 switchTab 闪动
      if (index === this.data.selected) return;
      wx.switchTab({
        url: item.path,
        fail: () => wx.showToast({ title: '页面打开失败', icon: 'none' })
      });
    }
  }
});
