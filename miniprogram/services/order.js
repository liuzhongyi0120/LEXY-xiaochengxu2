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

module.exports = { precreate, fetchList, fetchDetail, fetchCount, cancel, confirm, queryPay };
