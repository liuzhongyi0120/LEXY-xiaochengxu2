const DATA = require('../data.js');

/** 深层链接若指向已单独复刻的 tab 页，则切到对应 tab */
const TAB_PAGES = {
  lexy: '/pages/lexy/lexy',
  product: '/pages/product/product'
};

/** 允许用语义化的栏目 key（about / news / …）或微页面 alias 打开同一页 */
function resolveKey(key) {
  if (!key) return '';
  if (DATA.PAGES[key]) return key;
  const s = DATA.SECTIONS.filter((x) => x.key === key)[0];
  return s ? s.alias : '';
}

/**
 * 把配置里的链接对象展开成视图层可直接用的字段：
 *   lk = 链接类型（feature / tab / note）
 *   lv = 目标（微页面 alias 或 tab 页路径）
 * 避免在 wxml 里写复杂表达式。
 */
function decorate(blocks) {
  const one = (x) => {
    if (!x || !x.l) return x;
    const k = x.l.k;
    const v = k === 'tab' ? TAB_PAGES[x.l.a] || '' : k === 'feature' ? x.l.a : '';
    return Object.assign({}, x, { lk: k, lv: v });
  };
  return blocks.map((b) => {
    if (b.t === 'cards') return Object.assign({}, b, { a: b.a.map(one) });
    if (b.t === 'notes') {
      return Object.assign({}, b, { a: b.a.map((x) => Object.assign({}, x, { lk: 'note', lv: '' })) });
    }
    if (b.t === 'img') return one(b);
    return b;
  });
}

Page({
  data: {
    key: '',
    rawKey: '',
    page: null,
    tabIndex: 0,
    blocks: [],
    hasNote: false,
    /** 二级导航栏高度（px），锚点定位时要扣掉 */
    navH: 46
  },

  onLoad(query) {
    this.loadPage((query && query.key) || '');
  },

  /* ---------------- 数据 ---------------- */

  loadPage(rawKey) {
    const key = resolveKey(rawKey);
    const page = DATA.PAGES[key];
    if (!page) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
      return;
    }
    wx.setNavigationBarTitle({ title: page.title });
    const src = page.tabs.length ? page.tabs[0].b : page.blocks;
    this.setData({
      key,
      rawKey: rawKey || key,
      page,
      tabIndex: 0,
      blocks: decorate(src),
      hasNote: this.detectNote(page)
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  /** 页面内是否含「店铺笔记」条目（源站需登录查看原文，此处展示其封面） */
  detectNote(page) {
    const has = (blocks) =>
      blocks.some((b) => {
        if (b.t === 'notes') return true;
        if (Array.isArray(b.a)) return b.a.some((x) => x && x.l && x.l.k === 'note');
        return false;
      });
    return has(page.blocks) || page.tabs.some((t) => has(t.b));
  },

  /* ---------------- 交互 ---------------- */

  onTab(e) {
    const i = Number(e.currentTarget.dataset.i);
    const tab = this.data.page.tabs[i];
    if (!tab) return;
    this.setData({ tabIndex: i, blocks: decorate(tab.b) });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  /** 电梯锚点：滚到对应的板块标题（扣掉吸顶导航高度） */
  onAnchor(e) {
    const i = Number(e.currentTarget.dataset.i);
    // 锚点顺序 = 页面内 title 区块的出现顺序
    const titles = [];
    this.data.blocks.forEach((b, k) => {
      if (b.t === 'title') titles.push(k);
    });
    const target = titles[i];
    if (target === undefined) return;
    wx.createSelectorQuery()
      .select('#blk' + target)
      .boundingClientRect()
      .selectViewport()
      .scrollOffset()
      .exec((res) => {
        if (!res || !res[0] || !res[1]) return;
        const top = res[0].top + res[1].scrollTop - this.data.navH;
        wx.pageScrollTo({ scrollTop: top > 0 ? top : 0, duration: 300 });
      });
  },

  onTapImage(e) {
    const src = e.currentTarget.dataset.src;
    if (src) wx.previewImage({ urls: [src] });
  },

  /** 整宽图区块：带链接走卡片逻辑，否则直接看大图 */
  onTapBlock(e) {
    if (e.currentTarget.dataset.lk) return this.onTapCard(e);
    return this.onTapImage(e);
  },

  onTapCard(e) {
    const { src, title, lk, lv } = e.currentTarget.dataset;
    if (lk === 'tab' && lv) {
      wx.switchTab({ url: lv, fail: () => wx.navigateTo({ url: lv }) });
      return;
    }
    if (lk === 'feature' && lv) {
      wx.navigateTo({ url: '/packageNews/detail/detail?key=' + lv });
      return;
    }
    if (lk === 'note') {
      wx.showModal({
        title: title || '店铺笔记',
        content: '该项在源站为「店铺笔记」，需登录后查看原文。此处可先查看其封面大图。',
        confirmText: '看封面',
        cancelText: '返回',
        success: (r) => {
          if (r.confirm && src) wx.previewImage({ urls: [src] });
        }
      });
      return;
    }
    if (src) wx.previewImage({ urls: [src] });
  },

  onShareAppMessage() {
    const p = this.data.page;
    return {
      title: p ? p.title : 'LEXY莱克官方旗舰店',
      path: '/packageNews/detail/detail?key=' + (this.data.rawKey || this.data.key)
    };
  },

  onShareTimeline() {
    const p = this.data.page;
    return { title: p ? p.title : 'LEXY莱克官方旗舰店', query: 'key=' + (this.data.rawKey || this.data.key) };
  }
});
