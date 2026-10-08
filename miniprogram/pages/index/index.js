const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, loadGoodsData } = require('../../utils/blocks');
const { openLink } = require('../../utils/link');

Page({
  data: {
    shop: resolveAssets(replica.SHOP),
    meta: (replica.PAGE_META && replica.PAGE_META.home) || { bg: '#F5F6F8', desc: '' },
    blocks: []
  },

  onLoad() {
    const blocks = normalizeBlocks(replica.HOME_BLOCKS || []);
    this.setData({ blocks }, () => this.loadGoodsBlocks());
  },

  /** 商品组件需要实时数据，统一拉一次后分发到各「商品」区块 */
  loadGoodsBlocks() {
    return loadGoodsData(this.data.blocks).then((next) => {
      if (next && Object.keys(next).length) this.setData(next);
    });
  },

  /** 图片加载失败兜底，避免出现破图 */
  onImgError(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ ['blocks[' + index + '].failed']: true });
  },

  /** 商品区块内单张商品图加载失败，降级为色块 */
  onGoodsImgError(e) {
    const { b, g } = e.currentTarget.dataset;
    if (b === undefined || g === undefined) return;
    this.setData({ ['blocks[' + b + '].goods[' + g + '].failed']: true });
  },

  /**
   * 区块点击跳转。
   *
   * 标题 / 公告 / 导航 / 魔方 / 热区 / 单图 / 轮播每一张 / 店铺信息 都走这里，
   * 跳转规则（tab 页 switchTab、外链复制、电话拨号）统一在 utils/link.js 一份实现里。
   */
  onTapBlock(e) {
    openLink(e.currentTarget.dataset.link, { failText: '页面暂未开放' });
  },

  /** 商品卡片 → 商品详情 */
  onTapGoods(e) {
    const id = e.currentTarget.dataset.goods;
    if (!id) return;
    wx.navigateTo({
      url: '/packageGoods/detail/detail?id=' + id,
      fail: () => wx.showToast({ title: '商品详情页开发中', icon: 'none' })
    });
  },

  /** 双层轮播：主图切换 */
  onDoubleChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ ['blocks[' + index + '].dCur']: e.detail.current });
  },

  /** 双层轮播：点缩略图切主图 */
  onPickThumb(e) {
    const { block, i } = e.currentTarget.dataset;
    this.setData({ ['blocks[' + block + '].dCur']: Number(i) });
  },

  onShareAppMessage() {
    const first = (this.data.blocks || [])[0] || {};
    // images 的元素是 { image, link } 对象（每张图可单独设跳转），取图要 .image
    const first0 = (first.images || [])[0];
    const img = (first0 && first0.image) || first.src || '';
    return {
      title: (this.data.shop && this.data.shop.name) || 'LEXY莱克',
      path: '/pages/index/index',
      imageUrl: img
    };
  }
});
