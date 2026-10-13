/**
 * 浏览记录（packageUser）
 *
 * 数据源 `GET /api/footprint/list` —— 记录由**商品详情页**写入（`/api/footprint/add`），
 * 服务端按 goodsId 去重并只保留最近 100 条（FOOTPRINT_MAX），所以这里不需要再排序。
 *
 * 「清空」是不可撤销操作，必须二次确认；确认文案要写清后果而不是只问「确定吗」。
 */

const { fetchList, clear } = require('../../services/footprint');
const { ROUTES } = require('../../utils/constants');
const { assetUrl } = require('../../utils/asset');
const { money, formatTime } = require('../../utils/format');

const PAGE_SIZE = 20;

Page({
  data: {
    list: [],
    page: 1,
    total: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadFailed: false,
    needLogin: false
  },

  onLoad() {
    this.loadList(1);
  },

  onShow() {
    if (this._loaded) this.loadList(1);
    this._loaded = true;
  },

  onPullDownRefresh() {
    this.loadList(1).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.loadList(this.data.page + 1);
    }
  },

  loadList(page) {
    const isFirst = page === 1;
    this.setData(isFirst ? { loading: true, loadingMore: false } : { loadingMore: true });

    return fetchList({ page, size: PAGE_SIZE })
      .then((res) => {
        const rows = (res.list || []).map((g) => ({
          id: g.id,
          name: g.name,
          cover: assetUrl(g.cover),
          priceText: money(g.price),
          atText: formatTime(g.at),
          imgErr: false
        }));
        this.setData({
          list: isFirst ? rows : this.data.list.concat(rows),
          page,
          total: Number(res.total) || 0,
          hasMore: !!res.hasMore,
          loadFailed: false,
          needLogin: false,
          loading: false,
          loadingMore: false
        });
      })
      .catch((err) => {
        console.error('[footprint] 加载失败', err);
        this.setData(isFirst
          ? { loading: false, loadingMore: false, loadFailed: true, needLogin: !!err.needLogin, list: [], total: 0 }
          : { loading: false, loadingMore: false });
      });
  },

  onRetryLoad() {
    this.loadList(1);
  },

  onGoLogin() {
    wx.switchTab({ url: ROUTES.MINE });
  },

  onTapGoods(e) {
    const id = (e.currentTarget.dataset || {}).id;
    if (!id) return;
    wx.navigateTo({ url: `${ROUTES.GOODS_DETAIL}?id=${id}` });
  },

  onTapClear() {
    if (!this.data.list.length) {
      wx.showToast({ title: '还没有浏览记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空浏览记录',
      content: '清空后所有浏览过的商品都会从本页移除，且不可恢复。',
      confirmText: '清空',
      confirmColor: '#EE0A24',
      success: (r) => {
        if (!r.confirm) return;
        clear()
          .then(() => {
            wx.showToast({ title: '已清空', icon: 'none' });
            this.loadList(1);
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '清空失败', icon: 'none' }));
      }
    });
  },

  onTapGoShopping() {
    wx.switchTab({ url: ROUTES.INDEX });
  },

  onImgError(e) {
    const { i } = e.currentTarget.dataset || {};
    if (i === undefined) return;
    this.setData({ [`list[${i}].imgErr`]: true });
  }
});
