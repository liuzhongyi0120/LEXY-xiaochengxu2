const { get, post } = require('../utils/request');

/**
 * 预下单
 * @param {object} payload
 *   { fromCart: true, addressId, couponId, remark }  购物车结算
 *   { items: [{goodsId, skuId, quantity}], addressId, couponId, remark }  立即购买
 * @returns {Promise<{orderId, orderNo, amounts, payment}>} payment 可直接喂给 wx.requestPayment
 */
function precreate(payload) {
  return post('/api/order/precreate', payload);
}

/**
 * 订单列表
 * @param {object} params { status, page, size }  status 传 'all' 或不传为全部
 */
function fetchList(params) {
  return get('/api/order/list', params);
}

/** 订单详情（含物流节点） */
function fetchDetail(orderId) {
  return get('/api/order/detail', { orderId });
}

/** 各状态订单数量（「我的」页角标） */
function fetchCount() {
  return get('/api/order/count');
}

/** 取消未支付订单 */
function cancel(orderId) {
  return post('/api/order/cancel', { orderId });
}

/** 确认收货 */
function confirm(orderId) {
  return post('/api/order/confirm', { orderId });
}

/** 查询支付结果（支付结果页轮询） */
function queryPay(orderId) {
  return post('/api/pay/query', { orderId });
}

/**
 * 待付款订单「继续支付」：拿到该订单的支付参数
 * @returns {Promise<{orderId, orderNo, amountFen, sandbox, payment}>}
 *   `sandbox === true` 表示未配置商户号，参数是沙箱造的 —— `wx.requestPayment` 必然失败，
 *   页面据此提供「模拟支付成功」入口（真实商户号接入后自动为 false，入口自动消失）。
 */
function prepay(orderId) {
  return post('/api/order/prepay', { orderId });
}

/**
 * 联调：模拟支付成功（服务端走与真实回调完全相同的处理路径）
 * 生产环境已配置商户号时服务端会返回 403，页面必须把失败如实展示出来。
 */
function mockPay(orderId) {
  return post('/api/pay/mock-success', { orderId });
}

module.exports = { precreate, prepay, mockPay, fetchList, fetchDetail, fetchCount, cancel, confirm, queryPay };
