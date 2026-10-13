/**
 * 支付结果（packageOrder）
 *
 * 为什么要有这一页：真实支付是**异步**的 —— `wx.requestPayment` 返回 success 只代表
 * 用户在支付面板上完成了操作，订单状态要等微信回调落到服务端才会变。
 * 所以这里必须**轮询** `/api/pay/query`（最多 10 次、1.2s 一次）而不是把
 * 「requestPayment 成功」直接当成「已支付」—— 那会在回调延迟时显示成订单没付上。
 *
 * 联调环境（未配置商户号）走的是服务端的模拟支付，处理路径与真实回调完全相同，
 * 所以本页逻辑不需要为它开分支。
 */

const { queryPay } = require('../../services/order');
const { ROUTES } = require('../../utils/constants');
const { money } = require('../../utils/format');

const MAX_TRIES = 10;
const INTERVAL = 1200;

Page({
  data: {
    orderId: '',
    /** polling | paid | unpaid | fail */
    state: 'polling',
    orderNo: '',
    amountText: '0.00',
    statusText: ''
  },

  onLoad(options) {
    const orderId = (options && options.orderId) || '';
    this.setData({ orderId });
    if (!orderId) {
      this.setData({ state: 'fail', statusText: '缺少订单号' });
      return;
    }
    this.startPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  /* ------------------------------ 轮询 ------------------------------ */

  startPolling() {
    this.stopPolling();
    this._tries = 0;
    this.setData({ state: 'polling' });
    this.tick();
  },

  stopPolling() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  },

  tick() {
    this._tries += 1;
    queryPay(this.data.orderId)
      .then((res) => {
        this.setData({
          orderNo: res.orderNo || '',
          amountText: money(res.payAmount),
          statusText: res.statusText || ''
        });
        if (res.paid) {
          this.setData({ state: 'paid' });
          return;
        }
        // 已取消：等下去也不会变，直接给「未完成」
        if (res.status === 'cancelled') {
          this.setData({ state: 'unpaid' });
          return;
        }
        if (this._tries >= MAX_TRIES) {
          this.setData({ state: 'unpaid' });
          return;
        }
        this._timer = setTimeout(() => this.tick(), INTERVAL);
      })
      .catch((err) => {
        console.error('[pay-result] 查询失败', err);
        this.setData({ state: 'fail', statusText: (err && err.message) || '查询失败' });
      });
  },

  onRetry() {
    this.startPolling();
  },

  /* ------------------------------ 跳转 ------------------------------ */

  onTapOrder() {
    wx.redirectTo({ url: `${ROUTES.ORDER_DETAIL}?orderId=${this.data.orderId}` });
  },

  onTapOrders() {
    wx.redirectTo({ url: `${ROUTES.ORDER_LIST}?status=ALL` });
  },

  onTapHome() {
    wx.switchTab({ url: ROUTES.INDEX });
  }
});
