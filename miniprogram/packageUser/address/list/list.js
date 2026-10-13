/**
 * 收货地址（packageUser）
 *
 * 数据源 `/api/address/*`。四条真实能力：新增、编辑、删除、设默认。
 *
 * 为什么单独一页而不是弹层：地址是「下单前置」，通常要维护多条，
 * 弹层里做增删改会让用户在弹层与弹层之间来回跳（编辑完还要再开一次选择）。
 * 有赞也是独立页，保持一致。
 *
 * 「选地址」模式（`?select=1`）留给下单页用：本页现在只被「我的 → 收货地址」进入，
 * 直接管理；下单页交付后带 select=1 进来即变为选择模式（选中后把 addressId
 * 交给上一页），不需要再改这一页的骨架。
 */

/*
 * ⚠️ 相对路径层级：本文件在 `packageUser/address/list/` 里，是**四层**目录，
 *    到 `services` / `utils` 要上行三级（`../../../`）。
 *    这里曾经写成 `../../services/address`（少一级）—— 页面一加载就
 *    「Cannot find module」，在开发者工具里是这个页面整个打不开（点了没反应）。
 *    自检 15.80 现在会真的 require 每个页面来抓这类问题。
 */
const { fetchList, remove, setDefault } = require('../../../services/address');
const { ROUTES } = require('../../../utils/constants');

Page({
  data: {
    list: [],
    loading: true,
    loadFailed: false,
    /** 选择模式：点条目回传上一页而不是进编辑 */
    selectMode: false
  },

  onLoad(options) {
    this.setData({ selectMode: String((options && options.select) || '') === '1' });
    this.loadList();
  },

  /** 从编辑页返回后必须重新拉：否则新增/改了地址列表还是旧的 */
  onShow() {
    if (this._loaded) this.loadList();
    this._loaded = true;
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  /* ------------------------------ 数据 ------------------------------ */

  loadList() {
    this.setData({ loading: true });
    return fetchList()
      .then((res) => {
        this.setData({
          list: (res.list || []).map((a) => ({
            addressId: a.addressId,
            name: a.name,
            phone: a.phone,
            isDefault: !!a.isDefault,
            /** 省市区 + 详细地址拼一行，展示不用在 WXML 里做运算 */
            region: [a.province, a.city, a.district].filter(Boolean).join(' '),
            detail: a.detail || ''
          })),
          loading: false,
          loadFailed: false
        });
      })
      .catch((err) => {
        console.error('[address] 加载失败', err);
        this.setData({ loading: false, loadFailed: true, list: [] });
        if (!err.needLogin) wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onRetryLoad() {
    this.loadList();
  },

  onGoLogin() {
    wx.switchTab({ url: ROUTES.MINE });
  },

  /* ------------------------------ 交互 ------------------------------ */

  onTapAdd() {
    wx.navigateTo({ url: ROUTES.ADDRESS_EDIT });
  },

  onTapEdit(e) {
    const addressId = (e.currentTarget.dataset || {}).id;
    if (!addressId) return;
    wx.navigateTo({ url: `${ROUTES.ADDRESS_EDIT}?addressId=${addressId}` });
  },

  /** 点条目本体：选择模式下回传，否则等同编辑（用户点地址多半是想改） */
  onTapItem(e) {
    const addressId = (e.currentTarget.dataset || {}).id;
    if (!addressId) return;
    if (this.data.selectMode) {
      const pages = getCurrentPages();
      const prev = pages[pages.length - 2];
      if (prev && typeof prev.setData === 'function') prev.setData({ addressId });
      wx.navigateBack();
      return;
    }
    wx.navigateTo({ url: `${ROUTES.ADDRESS_EDIT}?addressId=${addressId}` });
  },

  onTapSetDefault(e) {
    const addressId = (e.currentTarget.dataset || {}).id;
    if (!addressId) return;
    setDefault(addressId)
      .then(() => {
        wx.showToast({ title: '已设为默认', icon: 'none' });
        this.loadList();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
  },

  onTapDelete(e) {
    const addressId = (e.currentTarget.dataset || {}).id;
    if (!addressId) return;
    wx.showModal({
      title: '删除地址',
      content: '删除后不可恢复，收货时需要使用其它地址。',
      confirmText: '删除',
      confirmColor: '#EE0A24',
      success: (r) => {
        if (!r.confirm) return;
        remove(addressId)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'none' });
            this.loadList();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
      }
    });
  }
});
