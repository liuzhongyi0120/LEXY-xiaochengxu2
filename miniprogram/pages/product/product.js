const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { openLink } = require('../../utils/link');

/** 深拷贝，避免运行时错误标记污染配置数据 */
function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

/** 装修数据先整体做一次素材地址解析，后续切换品牌都从这里取 */
const BRANDS = resolveAssets(replica.PRODUCT_BRANDS);

Page({
  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.product && replica.PAGE_META.product.bg) || '#ffffff',
    /** 左侧导航顶部固定 logo */
    navLogo: resolveAssets(replica.PRODUCT_NAV_LOGO),
    /** 6 个品牌，各自带 groups */
    brands: BRANDS,
    activeBrand: 0,
    /** 当前品牌右侧展示的分组 */
    groups: clone(BRANDS[0].groups),
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
      groups: clone(brand.groups),
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
