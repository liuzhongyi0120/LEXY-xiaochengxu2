/**
 * 通用自定义页面
 *
 * 装修台「店铺页面 → + 新建页面」建出来的页面都跑在这一个页面上，
 * 通过 query.key 区分（小程序 pages 是编译期固定的，没法动态加页面）。
 * 数据来自 replica.CUSTOM_PAGES[key]，结构是 { name, blocks, meta }，
 * 与首页的区块完全同构，所以渲染逻辑直接复用 utils/blocks.js。
 *
 * 打开方式：/pages/custom/index?key=页面标识
 */

const replica = require('../../config/replica');
const { normalizeBlocks, loadGoodsData, applyShopAvatar } = require('../../utils/blocks');
const { blockPageBehavior } = require('../../utils/blockPage');

Page(Object.assign({}, blockPageBehavior, {
  data: {
    key: '',
    title: '',
    meta: { bg: '#F5F6F8' },
    blocks: [],
    missing: false
  },

  onLoad(query) {
    const key = (query && query.key) || '';
    const page = (replica.CUSTOM_PAGES || {})[key];

    // 找不到页面：多半是运营建了页面但还没点「发布」，或标识填错了
    if (!page) {
      this.setData({ key: key, missing: true, title: '页面不存在' });
      wx.setNavigationBarTitle({ title: '页面不存在' });
      return;
    }

    const blocks = applyShopAvatar(normalizeBlocks(page.blocks || []), (replica.SHOP && replica.SHOP.avatar) || '');
    this.setData({
      key: key,
      title: page.name || '活动页',
      meta: page.meta || { bg: '#F5F6F8' },
      blocks: blocks
    }, () => {
      // 商品区块要实时数据，装修时存的是快照
      loadGoodsData(blocks).then((next) => {
        if (next && Object.keys(next).length) this.setData(next);
      });
    });

    wx.setNavigationBarTitle({ title: page.name || '活动页' });
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
      title: this.data.title || 'LEXY莱克',
      path: '/pages/custom/index?key=' + this.data.key,
      imageUrl: img
    };
  }
}));
