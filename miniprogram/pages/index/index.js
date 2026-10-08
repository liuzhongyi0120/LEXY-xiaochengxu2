const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, loadGoodsData } = require('../../utils/blocks');

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

  /** 区块点击跳转（标题 / 公告 / 导航 / 魔方 / 热区共用） */
  onTapBlock(e) {
    const link = e.currentTarget.dataset.link;
    if (!link) return;
    if (/^https?:\/\//.test(link)) {
      wx.setClipboardData({ data: link, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) });
      return;
    }
    wx.navigateTo({ url: link, fail: () => wx.showToast({ title: '页面暂未开放', icon: 'none' }) });
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
    const img = first.images && first.images[0] ? first.images[0] : first.src;
    return {
      title: (this.data.shop && this.data.shop.name) || 'LEXY莱克',
      path: '/pages/index/index',
      imageUrl: img || ''
    };
  }
});
