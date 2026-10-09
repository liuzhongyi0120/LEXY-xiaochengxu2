const { syncTabBar } = require('../../utils/tabbar');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { openLink } = require('../../utils/link');

/**
 * 装修数据先整体做一次素材地址解析，后续切换品牌都从这里取。
 *
 * 这里不需要再对 groups 做深拷贝防污染：resolveAssets 本身就返回一份深拷贝，
 * BRANDS 及其中每个 groups 都已经是游离对象，运行时标记（headerFailed 等）
 * 写进去不会影响 replica 配置。
 *
 * ⚠️ 必须容忍「配置被清空」：装修后台允许把产品页的品牌全部删掉，
 *    而早前这里直接读 BRANDS[0].groups —— 空数组时页面初始化就抛
 *    `Cannot read properties of undefined (reading 'groups')`，整页白屏。
 *    空配置不是异常数据，是运营的合法状态，页面必须显示空状态而不是崩掉。
 */
const BRANDS = (function () {
  const raw = resolveAssets(replica.PRODUCT_BRANDS);
  return Array.isArray(raw) ? raw.filter((b) => b && typeof b === 'object') : [];
})();

/** 取某品牌的右侧分组；品牌存在但没配分组时同样是空数组，不能是 undefined */
function groupsOf(brand) {
  return brand && Array.isArray(brand.groups) ? brand.groups : [];
}

Page({
  /** 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知） */
  onShow() {
    syncTabBar(this);
  },

  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.product && replica.PAGE_META.product.bg) || '#ffffff',
    /** 左侧导航顶部固定 logo */
    navLogo: resolveAssets(replica.PRODUCT_NAV_LOGO),
    /** 品牌列表，各自带 groups（可能为空数组） */
    brands: BRANDS,
    activeBrand: 0,
    /** 当前品牌右侧展示的分组 */
    groups: groupsOf(BRANDS[0]),
    /** 当前品牌对象（左侧信息与分享用），空配置时为 undefined */
    activeBrandName: (BRANDS[0] && BRANDS[0].name) || '',
    /** 整页没有任何品牌 → 显示空状态，而不是左边的空栏 + 右边空白 */
    noBrands: BRANDS.length === 0,
    /** 切换品牌后右侧回到顶部（scroll-top 需产生变化才生效） */
    scrollTop: 0
  },

  /** 左侧品牌切换：右侧内容整体替换 */
  onTapBrand(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.activeBrand) return;

    const brand = this.data.brands[index];
    if (!brand) return;

    this.setData({
      activeBrand: index,
      activeBrandName: brand.name || '',
      groups: groupsOf(brand),
      scrollTop: this.data.scrollTop === 0 ? 1 : 0
    });
  },

  /** 分组头图跳转（装修台「头图跳转」） */
  onTapBlock(e) {
    openLink(e.currentTarget.dataset.link, { failText: '页面暂未开放' });
  },

  /**
   * 型号卡片点击。
   *
   * 装修台里给每个型号配了「跳转链接」就按它跳 —— 挂上商品库里的商品后，
   * 真机上点这个型号就直接进商品详情页；没配则保持老行为：放大看图。
   */
  onTapProduct(e) {
    const { src, link } = e.currentTarget.dataset;
    if (openLink(link)) return;
    if (!src) return;
    wx.previewImage({ urls: [src] });
  },

  onHeaderError(e) {
    const { gindex } = e.currentTarget.dataset;
    this.setData({ [`groups[${gindex}].headerFailed`]: true });
  },

  onProdError(e) {
    const { gindex, pindex } = e.currentTarget.dataset;
    this.setData({ [`groups[${gindex}].products[${pindex}].failed`]: true });
  },

  onShareAppMessage() {
    const brand = this.data.brands[this.data.activeBrand] || {};
    const first = this.data.groups[0] || {};
    return {
      title: `莱克产品 · ${brand.name || ''}`,
      path: '/pages/product/product',
      imageUrl: first.header || this.data.navLogo
    };
  }
});
