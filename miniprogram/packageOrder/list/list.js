/**
 * 订单列表（packageOrder）
 *
 * 入口来自「我的」页的「我的订单」区块：`?status=ALL|PENDING_PAY|PENDING_SHIP|SHIPPED|FINISHED`。
 * 页面内页签可自由切换，所以**入参只做初值**，不作为唯一真源 ——
 * 否则用户点页签后地址栏与页面状态会不一致（返回再进入又跳回入参那一档）。
 *
 * ⚠️ 「退款/售后」不在本页：后端订单状态机只有
 *    pending_pay / pending_ship / shipped / finished / cancelled，
 *    **没有退款态**。所以「我的」页的退款入口指向「功能未开放」页，
 *    而不是在这里做一个永远查不到数据的页签（不假装可用）。
 */

const { fetchList, fetchCount, cancel, confirm } = require('../../services/order');
const { payOrder } = require('../../utils/pay');
const { ROUTES, ORDER_STATUS } = require('../../utils/constants');
const { assetUrl } = require('../../utils/asset');
const { money } = require('../../utils/format');

const PAGE_SIZE = 10;

/**
 * 「我的」页区块里的入口 key（大写）→ 后端订单状态。
 * 只在这里做一次映射：页面内部一律用后端口径（小写），
 * 大小写两套字符串在页面里混着传，是「筛选没生效」这类问题的常见来源。
 */
const ENTRY_STATUS = {
  ALL: 'all',
  PENDING_PAY: ORDER_STATUS.PENDING_PAY,
  PENDING_SHIP: ORDER_STATUS.PENDING_SHIP,
  SHIPPED: ORDER_STATUS.SHIPPED,
  FINISHED: ORDER_STATUS.FINISHED,
  CANCELLED: ORDER_STATUS.CANCELLED
};

const TABS = [
  { key: 'all', label: '全部' },
  { key: ORDER_STATUS.PENDING_PAY, label: '待付款' },
  { key: ORDER_STATUS.PENDING_SHIP, label: '待发货' },
  { key: ORDER_STATUS.SHIPPED, label: '待收货' },
  { key: ORDER_STATUS.FINISHED, label: '已完成' }
];

Page({
  data: {
    tabs: TABS,
    status: 'all',
    /** 各状态数量（页签角标）：待付款 / 待发货 / 待收货 三档才展示 */
    counts: {},
    list: [],
    page: 1,
    total: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    /** 首屏失败：与「确实没有订单」区分开，否则断网会显示成「还没有订单」 */
    loadFailed: false,
    /** 未登录：登录态接口拿不到数据，这里给登录入口而不是空白 */
    needLogin: false
  },

  onLoad(options) {
    const raw = String((options && options.status) || 'ALL');
    const initial = ENTRY_STATUS[raw] || (TABS.some((t) => t.key === raw) ? raw : 'all');
    this.setData({ status: initial });
    this.loadCounts();
    this.loadList(1);
  },

  /**
   * 每次回到本页都刷新：用户可能在订单详情里取消/确认收货，
   * 只靠 onLoad 会出现「详情里已经取消，退回列表还显示待付款」。
   */
  onShow() {
    if (this._loaded) {
      this.loadCounts();
      this.loadList(1);
    }
    this._loaded = true;
  },

  onPullDownRefresh() {
    Promise.all([this.loadCounts(), this.loadList(1)]).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.loadList(this.data.page + 1);
    }
  },

  /* ------------------------------ 数据 ------------------------------ */

  /**
   * 请求版本号：切页签会开新版本，慢网下旧响应回来时直接丢弃。
   * 没有这层保护就会出现「页签显示待付款、列表却是全部」（快网永远复现不出来）。
   * 翻页沿用当前版本，因此切页签后仍在飞的“下一页”也会被丢弃。
   */
  loadList(page) {
    const isFirst = page === 1;
    if (isFirst) this._seq = (this._seq || 0) + 1;
    const seq = this._seq || 1;

    this.setData(isFirst ? { loading: true, loadingMore: false } : { loadingMore: true });

    const params = { page, size: PAGE_SIZE };
    if (this.data.status !== 'all') params.status = this.data.status;

    return fetchList(params)
      .then((res) => {
        if (seq !== this._seq) return;
        const rows = (res.list || []).map(decorateOrder);
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
        if (seq !== this._seq) return;
        console.error('[order-list] 加载失败', err);
        this.setData(
          isFirst
            ? { loading: false, loadingMore: false, loadFailed: true, needLogin: !!err.needLogin, list: [], total: 0 }
            : { loading: false, loadingMore: false }
        );
        if (!isFirst && !err.needLogin) wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 页签角标数量。失败静默：角标是锦上添花，不该因此弹错误 */
  loadCounts() {
    return fetchCount()
      .then((res) => {
        this.setData({ counts: res || {} });
      })
      .catch(() => {});
  },

  onRetryLoad() {
    this.loadCounts();
    this.loadList(1);
  },

  onGoLogin() {
    wx.switchTab({ url: ROUTES.MINE });
  },

  /* ------------------------------ 交互 ------------------------------ */

  onTapTab(e) {
    const key = String((e.currentTarget.dataset || {}).key || 'all');
    if (key === this.data.status) return;
    this.setData({ status: key, list: [], total: 0, hasMore: true });
    this.loadList(1);
  },

  onTapDetail(e) {
    const orderId = (e.currentTarget.dataset || {}).id;
    if (!orderId) return;
    wx.navigateTo({ url: `${ROUTES.ORDER_DETAIL}?orderId=${orderId}` });
  },

  /** 去付款：支付逻辑在 utils/pay.js（唯一一份），这里只负责成功后刷新 */
  onTapPay(e) {
    const orderId = (e.currentTarget.dataset || {}).id;
    if (!orderId) return;
    payOrder(orderId).then((r) => {
      if (!r.paid) return;
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.loadCounts();
      this.loadList(1);
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '支付未完成', icon: 'none' });
    });
  },

  onTapCancel(e) {
    const orderId = (e.currentTarget.dataset || {}).id;
    if (!orderId) return;
    wx.showModal({
      title: '取消订单',
      content: '取消后库存与使用的优惠券会退回，订单不可恢复。',
      confirmText: '取消订单',
      cancelText: '再想想',
      success: (r) => {
        if (!r.confirm) return;
        cancel(orderId)
          .then(() => {
            wx.showToast({ title: '已取消', icon: 'none' });
            this.loadCounts();
            this.loadList(1);
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' }));
      }
    });
  },

  onTapConfirm(e) {
    const orderId = (e.currentTarget.dataset || {}).id;
    if (!orderId) return;
    wx.showModal({
      title: '确认收货',
      content: '确认后订单将完成，此操作不可撤销。',
      confirmText: '确认收货',
      success: (r) => {
        if (!r.confirm) return;
        confirm(orderId)
          .then(() => {
            wx.showToast({ title: '已确认收货', icon: 'success' });
            this.loadCounts();
            this.loadList(1);
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
      }
    });
  },

  /** 图片加载失败降级为色块（不显示破图） */
  onImgError(e) {
    const { oi, gi } = e.currentTarget.dataset || {};
    if (oi === undefined || gi === undefined) return;
    this.setData({ [`list[${oi}].items[${gi}].imgErr`]: true });
  }
});

/**
 * 订单 → 视图模型。
 *
 * 放在页面而不是模板里做：WXML 不支持表达式运算（价格换算、件数累加都要先在 js 里算好），
 * 而且图片地址必须过 `assetUrl` —— 后端下发的是 `/uploads/…` 相对路径，
 * 直接塞给 `<image src>` 在小程序里会被当成**包内文件**，真机上是裂图
 * （浏览器预览同源能显示，所以测不出来；services/goods.js 里踩过同一个坑）。
 */
function decorateOrder(o) {
  const items = (o.items || []).map((g) => ({
    goodsId: g.goodsId,
    name: g.name,
    specText: g.specText,
    priceText: money(g.price),
    quantity: g.quantity,
    image: assetUrl(g.image),
    imgErr: false
  }));
  return {
    orderId: o.orderId,
    orderNo: o.orderNo,
    status: o.status,
    statusText: o.statusText,
    statusClass: statusClassOf(o.status),
    items,
    totalQty: items.reduce((n, g) => n + g.quantity, 0),
    payAmountYuan: o.payAmountYuan || money(o.amounts && o.amounts.payAmount),
    canPay: o.status === ORDER_STATUS.PENDING_PAY,
    canCancel: o.status === ORDER_STATUS.PENDING_PAY,
    canConfirm: o.status === ORDER_STATUS.SHIPPED,
    createdAtText: createdAtText(o.createdAt)
  };
}

/**
 * 订单状态的修饰类（已取消 / 已完成用中性色，不是「待办」不该报红）。
 *
 * ⚠️ 只能在 JS 里算好，**不能**在 wxml 里写这两种形式：
 *   · `class="od-st st-{{od.status}}"` —— 静态校验会把 `st-` 当成一个类名（根本不存在）；
 *   · `class="od-st {{od.status === 'cancelled' ? 'st-cancelled' : ''}}"` ——
 *     `{{ }}` 里**比较用的那个字符串**也会被当成类名要求有定义。
 *   两种写法都会让「哑样式」检查永远红着，红久了就没人看了 —— 那才是真危险。
 *   所以类名在 JS 里拼好（与装修区块的 sizeClass / cardClass 同一做法）。
 */
function statusClassOf(status) {
  return (status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.FINISHED) ? ('st-' + status) : '';
}

function createdAtText(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
