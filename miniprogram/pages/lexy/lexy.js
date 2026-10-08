const { syncTabBar } = require('../../utils/tabbar');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { openLink } = require('../../utils/link');

Page({
  /** 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知） */
  onShow() {
    syncTabBar(this);
  },

  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.lexy && replica.PAGE_META.lexy.bg) || '#ffffff',
    series: resolveAssets(replica.LEXY_SERIES)
  },

  /** 系列头图跳转（装修台「主图跳转」） */
  onTapBlock(e) {
    openLink(e.currentTarget.dataset.link, { failText: '页面暂未开放' });
  },

  /**
   * 商品卡片点击。
   *
   * 装修台里给每张卡片配了「跳转链接」就按它跳（可直接挂到某个商品的详情页）；
   * 没配的时候保持老行为：放大看图（历史上的卡片图里自带官方型号与价格）。
   */
  onTapProduct(e) {
    const { src, link } = e.currentTarget.dataset;
    if (openLink(link)) return;
    if (!src) return;
    wx.previewImage({ urls: [src] });
  },

  onHeroError(e) {
    const { sindex } = e.currentTarget.dataset;
    this.setData({ [`series[${sindex}].heroFailed`]: true });
  },

  onProdError(e) {
    const { sindex, pindex } = e.currentTarget.dataset;
    this.setData({ [`series[${sindex}].products[${pindex}].failed`]: true });
  },

  onShareAppMessage() {
    return {
      title: '莱克产品中心',
      path: '/pages/lexy/lexy',
      imageUrl: this.data.series[0].hero
    };
  }
});
