/**
 * 订单详情（packageOrder）
 *
 * 数据源 `GET /api/order/detail`。金额明细、物流节点、券使用情况全部由服务端下发，
 * 页面**不做任何金额重算** —— 前端算出来的数字与服务端不一致时，
 * 用户看到的是两个都对不上的「实付金额」，这是交易链路里最不该出现的分歧。
 *
 * 状态相关文案集中在 STATUS_HINT：不同状态下用户最需要知道的信息不一样
 * （待付款要知道还剩多久、待收货要知道怎么确认）。
 */

const { fetchDetail, cancel, confirm } = require('../../services/order');
const { payOrder } = require('../../utils/pay');
const { ORDER_STATUS } = require('../../utils/constants');
const { assetUrl } = require('../../utils/asset');
const { money, formatTime } = require('../../utils/format');

const STATUS_HINT = {
  [ORDER_STATUS.PENDING_PAY]: '请尽快完成支付，超时系统会自动取消订单',
  [ORDER_STATUS.PENDING_SHIP]: '商家正在准备发货，请耐心等待',
  [ORDER_STATUS.SHIPPED]: '商品已发出，收到后请确认收货',
  [ORDER_STATUS.FINISHED]: '交易已完成，感谢您的购买',
  [ORDER_STATUS.CANCELLED]: '订单已取消'
};

Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    loadFailed: false
  },

  onLoad(options) {
    const orderId = (options && options.orderId) || '';
    this.setData({ orderId });
    if (!orderId) {
      this.setData({ loading: false, loadFailed: true });
      return;
    }
    this.loadDetail();
  },

  /** 从支付结果页返回时状态可能已变（已支付），必须重新拉一次 */
  onShow() {
    if (this._loaded) this.loadDetail();
    this._loaded = true;
  },

  /* ------------------------------ 数据 ------------------------------ */

  loadDetail() {
    this.setData({ loading: true });
    return fetchDetail(this.data.orderId)
      .then((o) => {
        this.setData({ order: decorate(o), loading: false, loadFailed: false });
      })
      .catch((err) => {
        console.error('[order-detail] 加载失败', err);
        this.setData({ loading: false, loadFailed: true });
        if (!err.needLogin) wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onRetryLoad() {
    this.loadDetail();
  },

  /* ------------------------------ 交互 ------------------------------ */

  /** 复制订单号：客服沟通时用户要报的就是这个号 */
  onCopyOrderNo() {
    const o = this.data.order;
    if (!o || !o.orderNo) return;
    wx.setClipboardData({
      data: o.orderNo,
      success: () => wx.showToast({ title: '订单号已复制', icon: 'none' })
    });
  },

  onTapPay() {
    payOrder(this.data.orderId)
      .then((r) => {
        if (!r.paid) return;
        wx.showToast({ title: '支付成功', icon: 'success' });
        this.loadDetail();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '支付未完成', icon: 'none' }));
  },

  onTapCancel() {
    wx.showModal({
      title: '取消订单',
      content: '取消后库存与使用的优惠券会退回，订单不可恢复。',
      confirmText: '取消订单',
      cancelText: '再想想',
      success: (r) => {
        if (!r.confirm) return;
        cancel(this.data.orderId)
          .then(() => {
            wx.showToast({ title: '已取消', icon: 'none' });
            this.loadDetail();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' }));
      }
    });
  },

  onTapConfirm() {
    wx.showModal({
      title: '确认收货',
      content: '确认后订单将完成，此操作不可撤销。',
      confirmText: '确认收货',
      success: (r) => {
        if (!r.confirm) return;
        confirm(this.data.orderId)
          .then(() => {
            wx.showToast({ title: '已确认收货', icon: 'success' });
            this.loadDetail();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
      }
    });
  },

  onImgError(e) {
    const { gi } = e.currentTarget.dataset || {};
    if (gi === undefined) return;
    this.setData({ [`order.items[${gi}].imgErr`]: true });
  }
});

/** 订单 → 视图模型（规则见文件头：金额不重算，只做格式化与图片地址解析） */
function decorate(o) {
  const a = o.amounts || {};
  const items = (o.items || []).map((g) => ({
    goodsId: g.goodsId,
    name: g.name,
    specText: g.specText,
    priceText: money(g.price),
    quantity: g.quantity,
    image: assetUrl(g.image),
    imgErr: false
  }));
  const addr = o.address || {};

  return {
    orderId: o.orderId,
    orderNo: o.orderNo,
    status: o.status,
    statusText: o.statusText,
    /* 状态头底色修饰类：在 JS 里算好（详见 packageOrder/list/list.js 的 statusClassOf 注释 ——
       wxml 里写 `hero-{{status}}` 或带比较字符串的三元式都会被静态校验当成不存在的类名）。 */
    heroClass: o.status === ORDER_STATUS.CANCELLED ? 'hero-cancelled' : '',
    hint: o.cancelReason || STATUS_HINT[o.status] || '',
    items,
    totalQty: items.reduce((n, g) => n + g.quantity, 0),
    address: {
      name: addr.name || '',
      phone: addr.phone || '',
      line: [addr.province, addr.city, addr.district, addr.detail].filter(Boolean).join(' ')
    },
    amounts: {
      goods: money(a.goodsAmount),
      coupon: money(a.couponAmount),
      freight: money(a.freightAmount),
      pay: money(a.payAmount),
      hasCoupon: Number(a.couponAmount) > 0,
      freightFree: Number(a.freightAmount) === 0
    },
    remark: o.remark || '',
    /** 物流节点按时间正序展示（最早在上），与快递查询习惯一致 */
    logistics: (o.logistics || []).map((n) => ({ text: n.text, atText: formatTime(n.at) })),
    times: [
      { label: '下单时间', value: formatTime(o.createdAt), on: !!o.createdAt },
      { label: '付款时间', value: formatTime(o.paidAt), on: !!o.paidAt },
      { label: '发货时间', value: formatTime(o.shippedAt), on: !!o.shippedAt },
      { label: '完成时间', value: formatTime(o.finishedAt), on: !!o.finishedAt },
      { label: '取消时间', value: formatTime(o.cancelledAt), on: !!o.cancelledAt }
    ].filter((t) => t.on),
    canPay: o.status === ORDER_STATUS.PENDING_PAY,
    canCancel: o.status === ORDER_STATUS.PENDING_PAY,
    canConfirm: o.status === ORDER_STATUS.SHIPPED
  };
}
