const app = getApp();
const { fetchCart, updateCartItem, removeCartItems } = require('../../services/cart');
const { splitPrice, money } = require('../../utils/format');
const { ROUTES } = require('../../utils/constants');

Page({
  data: {
    loading: true,
    items: [],
    totalCount: 0,
    selectedCount: 0,
    allSelected: false,
    totalParts: { int: '0', dec: '.00' }
  },

  onShow() {
    this.loadCart();
  },

  onPullDownRefresh() {
    this.loadCart().then(() => wx.stopPullDownRefresh());
  },

  /* ----------------------- 数据 ----------------------- */

  loadCart() {
    return fetchCart()
      .then((res) => {
        // 价格在 JS 层格式化，避免在 WXML 中做数值运算
        const items = (res.items || []).map((item) =>
          Object.assign({}, item, {
            priceText: money(item.price),
            imgError: false,
            fallbackText: String(item.name || '').replace(/[·\s]/g, '').slice(0, 4)
          })
        );
        this.setData({ items, loading: false });
        this.recalculate();
      })
      .catch((err) => {
        console.error('[cart] 购物车加载失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 统一在本地重算合计，避免每改一项就请求一次 */
  recalculate() {
    const items = this.data.items;
    const selected = items.filter((item) => item.selected);

    const totalAmount = selected.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

    this.setData({
      selectedCount: selected.reduce((sum, item) => sum + item.quantity, 0),
      totalCount,
      allSelected: items.length > 0 && selected.length === items.length,
      totalParts: splitPrice(totalAmount)
    });

    app.updateCartBadge(totalCount);
  },

  /* ----------------------- 交互 ----------------------- */

  onToggleSelect(e) {
    const { id } = e.currentTarget.dataset;
    const item = this.data.items.find((i) => i.cartItemId === id);
    if (!item) return;

    const nextSelected = !item.selected;
    // 乐观更新：先改界面，再同步服务端
    item.selected = nextSelected;
    this.setData({ items: this.data.items });
    this.recalculate();

    updateCartItem({ cartItemId: id, selected: nextSelected }).catch((err) => {
      item.selected = !nextSelected;
      this.setData({ items: this.data.items });
      this.recalculate();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    });
  },

  onToggleAll() {
    const nextSelected = !this.data.allSelected;
    const items = this.data.items.map((item) => Object.assign({}, item, { selected: nextSelected }));
    this.setData({ items });
    this.recalculate();

    Promise.all(
      items.map((item) => updateCartItem({ cartItemId: item.cartItemId, selected: nextSelected }))
    ).catch((err) => {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      this.loadCart();
    });
  },

  onQuantityChange(e) {
    const { id, delta } = e.currentTarget.dataset;
    const item = this.data.items.find((i) => i.cartItemId === id);
    if (!item) return;

    const next = item.quantity + Number(delta);
    if (next < 1) return;
    if (next > item.stock) {
      wx.showToast({ title: `库存仅剩 ${item.stock} 件`, icon: 'none' });
      return;
    }

    const prev = item.quantity;
    item.quantity = next;
    this.setData({ items: this.data.items });
    this.recalculate();

    updateCartItem({ cartItemId: id, quantity: next }).catch((err) => {
      item.quantity = prev;
      this.setData({ items: this.data.items });
      this.recalculate();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    });
  },

  onRemove(e) {
    const { id } = e.currentTarget.dataset;

    wx.showModal({
      title: '移出购物车',
      content: '确定要移除这件商品吗？',
      confirmColor: '#C8102E',
      success: (res) => {
        if (!res.confirm) return;
        removeCartItems([id])
          .then(() => this.loadCart())
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
      }
    });
  },

  onTapGoods(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `${ROUTES.GOODS_DETAIL}?id=${id}` });
  },

  /** 商品图加载失败，降级为色块 + 名称首字 */
  onImgError(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ ['items[' + index + '].imgError']: true });
  },

  onCheckout() {
    if (!this.data.selectedCount) {
      wx.showToast({ title: '请先选择商品', icon: 'none' });
      return;
    }
    wx.showToast({ title: '结算功能开发中，下一批交付', icon: 'none' });
  },

  onGoShopping() {
    wx.switchTab({ url: ROUTES.INDEX });
  }
});
