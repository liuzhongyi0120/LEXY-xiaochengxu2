const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');

Page({
  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.lexy && replica.PAGE_META.lexy.bg) || '#ffffff',
    series: resolveAssets(replica.LEXY_SERIES)
  },

  /**
   * 商品卡片图内含官方型号与价格（有赞源页面即如此）。
   * 接入真实商品库后，将这里替换为 wx.navigateTo 商品详情跳转。
   */
  onTapProduct(e) {
    const { src } = e.currentTarget.dataset;
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
