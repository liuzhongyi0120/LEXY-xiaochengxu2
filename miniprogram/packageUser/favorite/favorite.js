/**
 * 我的收藏（packageUser）
 *
 * 数据源 `GET /api/favorite/list`（返回的是商品列表项，已带实时价与库存）。
 * 取消收藏直接调 `POST /api/favorite/toggle` —— 服务端是按「在列表里就删、不在就加」
 * 实现的开关，所以这一页只负责「取消」这一半，不需要另做一个 delete 接口。
 *
 * ⚠️ 商品图必须过 `assetUrl`：接口下发的是 `/uploads/…` 相对路径，
 * 直接塞给 `<image src>` 在真机上会被当成包内文件（浏览器预览同源能显示，所以测不出来）。
 */

const { fetchList, toggle } = require('../../services/favorite');
const { ROUTES } = require('../../utils/constants');
const { assetUrl } = require('../../utils/asset');
const { money, shortNumber } = require('../../utils/format');

const PAGE_SIZE = 10;

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
        const rows = (res.list || []).map(decorateGoods);
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
        console.error('[favorite] 加载失败', err);
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

  /** 取消收藏：先二次确认（这个动作会真的把商品从列表里去掉，误触代价高） */
  onTapRemove(e) {
    const id = (e.currentTarget.dataset || {}).id;
    if (!id) return;
    wx.showModal({
      title: '取消收藏',
      content: '确定不再收藏这件商品吗？',
      confirmText: '取消收藏',
      cancelText: '再想想',
      success: (r) => {
        if (!r.confirm) return;
        toggle(id)
          .then(() => {
            wx.showToast({ title: '已取消收藏', icon: 'none' });
            this.loadList(1);
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
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

function decorateGoods(g) {
  return {
    id: g.id,
    name: g.name,
    cover: assetUrl(g.cover),
    priceText: money(g.price),
    salesText: shortNumber(g.sales),
    soldOut: Number(g.stock) <= 0,
    imgErr: false
  };
}
