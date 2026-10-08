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
const { normalizeBlocks, loadGoodsData } = require('../../utils/blocks');
const { openLink } = require('../../utils/link');

Page({
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

    const blocks = normalizeBlocks(page.blocks || []);
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

  /** 图片加载失败兜底，避免出现破图 */
  onImgError(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ ['blocks[' + index + '].failed']: true });
  },

  /** 商品区块内单张商品图加载失败，降级为色块（与首页同一套处理） */
  onGoodsImgError(e) {
    const { b, g } = e.currentTarget.dataset;
    if (b === undefined || g === undefined) return;
    this.setData({ ['blocks[' + b + '].goods[' + g + '].failed']: true });
  },

  /**
   * 区块点击跳转。
   *
   * 标题 / 公告 / 导航 / 魔方 / 热区 / 单图 / 轮播每一张 / 店铺信息 都走这里，
   * 跳转规则统一在 utils/link.js（tab 页必须 switchTab，否则点了没反应）。
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
      title: this.data.title || 'LEXY莱克',
      path: '/pages/custom/index?key=' + this.data.key,
      imageUrl: img
    };
  }
});
