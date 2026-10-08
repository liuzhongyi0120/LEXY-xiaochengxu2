const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, loadGoodsData, applyShopAvatar } = require('../../utils/blocks');
const { blockPageBehavior } = require('../../utils/blockPage');

Page(Object.assign({}, blockPageBehavior, {
  data: {
    shop: resolveAssets(replica.SHOP),
    meta: (replica.PAGE_META && replica.PAGE_META.home) || { bg: '#F5F6F8', desc: '' },
    blocks: []
  },

  onLoad() {
    const blocks = applyShopAvatar(
      normalizeBlocks(replica.HOME_BLOCKS || []),
      (this.data.shop && this.data.shop.avatar) || ''
    );
    this.setData({ blocks }, () => this.loadGoodsBlocks());
  },

  /** 商品组件需要实时数据，统一拉一次后分发到各「商品」区块 */
  loadGoodsBlocks() {
    return loadGoodsData(this.data.blocks).then((next) => {
      if (next && Object.keys(next).length) this.setData(next);
    });
  },

  /** 离开页面时释放语音播放器（区块事件见 utils/blockPage.js） */
  onUnload() {
    this.onUnloadBlockAudio();
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
}));
