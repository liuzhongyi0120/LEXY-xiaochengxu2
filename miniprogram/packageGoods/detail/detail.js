const app = getApp();
const { fetchDetail } = require('../../services/goods');
const { addToCart, fetchCart } = require('../../services/cart');
const { ensureLogin } = require('../../utils/auth');
const { splitPrice, shortNumber, money } = require('../../utils/format');
const { ROUTES } = require('../../utils/constants');

Page({
  data: {
    id: '',
    loading: true,
    /** 首屏加载失败：goods 为 null 且 loading 为 false 时页面原本什么都不渲染（整页空白），必须单独给状态 */
    loadFailed: false,
    /** 失败原因是否为「商品已下架 / 不存在」（确定的业务结论，与网络异常提示不同） */
    gone: false,
    goods: null,

    priceParts: { int: '0', dec: '.00' },
    priceMaxText: '',
    salesText: '0',

    currentImage: 0,
    detailBlocks: [],
    recommends: [],

    skuVisible: false,
    skuMode: 'both',
    cartCount: 0
  },

  onLoad(options) {
    const id = options.id || '';
    if (!id) {
      wx.showToast({ title: '缺少商品参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.setData({ id });
    this.loadDetail();
  },

  onShow() {
    this.refreshCartBadge();
  },

  onPullDownRefresh() {
    this.loadDetail();
  },

  /* ----------------------- 数据 ----------------------- */

  loadDetail() {
    this.setData({ loading: true, loadFailed: false });

    return fetchDetail(this.data.id)
      .then((goods) => {
        // 给图文详情块补 key，便于 wx:for 渲染
        const detailBlocks = (goods.detailBlocks || []).map((block, index) => ({
          key: `block_${index}`,
          type: block.type,
          content: block.content
        }));

        const hasRange = goods.priceMax && goods.priceMax > goods.price;

        this.setData({
          goods,
          detailBlocks,
          recommends: goods.recommends || [],
          priceParts: splitPrice(goods.price),
          priceMaxText: hasRange ? ` - ${money(goods.priceMax)}` : '',
          salesText: shortNumber(goods.sales),
          currentImage: 0,
          loading: false,
          loadFailed: false
        });

        wx.setNavigationBarTitle({ title: goods.name.slice(0, 12) });
      })
      .catch((err) => {
        console.error('[detail] 商品详情加载失败', err);
        // 「商品已下架/不存在」是确定的业务结论，与网络异常区分提示
        const gone = err && (err.code === 404 || /不存在|已下架/.test(err.message || ''));
        this.setData({ loading: false, loadFailed: true, gone });
      })
      .then(() => wx.stopPullDownRefresh());
  },

  /** 加载失败后原地重试（不需要退出小程序） */
  onRetryLoad() {
    return this.loadDetail();
  },

  /** 商品已下架/不存在 → 回商品列表，避免用户停在死页面 */
  onBackToList() {
    wx.redirectTo({ url: ROUTES.GOODS_LIST, fail: () => wx.navigateBack() });
  },

  refreshCartBadge() {
    fetchCart()
      .then((res) => {
        this.setData({ cartCount: res.totalCount });
        app.updateCartBadge(res.totalCount);
      })
      .catch(() => {});
  },

  /* ----------------------- 交互 ----------------------- */

  onSwiperChange(e) {
    this.setData({ currentImage: e.detail.current });
  },

  onPreviewImage(e) {
    const { index } = e.currentTarget.dataset;
    const goods = this.data.goods;
    if (!goods || !goods.images || !goods.images.length) return;
    wx.previewImage({
      current: goods.images[index],
      urls: goods.images
    });
  },

  /** 打开 SKU 弹层，mode 决定按钮组合 */
  openSku(e) {
    const mode = (e.currentTarget.dataset && e.currentTarget.dataset.mode) || 'both';
    this.setData({ skuVisible: true, skuMode: mode });
  },

  closeSku() {
    this.setData({ skuVisible: false });
  },

  /** SKU 弹层确认回调 */
  onSkuConfirm(e) {
    const { action, sku, quantity } = e.detail;

    ensureLogin()
      .then(() => {
        if (action === 'buy') {
          this.setData({ skuVisible: false });
          wx.showToast({ title: '结算功能开发中，请先加入购物车', icon: 'none' });
          return;
        }
        return this.handleAddToCart(sku, quantity);
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      });
  },

  handleAddToCart(sku, quantity) {
    return addToCart({
      goodsId: this.data.goods.id,
      skuId: sku.skuId,
      quantity
    }).then((res) => {
      this.setData({ skuVisible: false, cartCount: res.totalCount });
      app.updateCartBadge(res.totalCount);
      wx.showToast({ title: '已加入购物车', icon: 'success' });
    });
  },

  onTapCart() {
    // 购物车当前不在 tabBar 中，用普通页面跳转
    wx.navigateTo({ url: ROUTES.CART });
  },

  onTapGoods(e) {
    const { id } = e.detail;
    wx.redirectTo({ url: `${ROUTES.GOODS_DETAIL}?id=${id}` });
  },

  onShareAppMessage() {
    const goods = this.data.goods;
    return {
      title: goods ? goods.name : '莱克官方商城',
      path: `${ROUTES.GOODS_DETAIL}?id=${this.data.id}`,
      imageUrl: goods ? goods.cover : ''
    };
  }
});
