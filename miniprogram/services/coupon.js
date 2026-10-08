const { get, post } = require('../utils/request');

/**
 * 我的优惠券
 * @param {string} status available | used | expired | all
 */
function fetchList(status) {
  return get('/api/coupon/list', { status });
}

/**
 * 下单页可用券（服务端按金额/分类判定是否可用，并算出可抵扣金额）
 * @param {number} goodsAmount 商品金额（分）
 * @param {string[]} categoryIds 订单内商品的分类 ID
 */
function fetchAvailable(goodsAmount, categoryIds) {
  return get('/api/coupon/available', {
    goodsAmount,
    categoryIds: JSON.stringify(categoryIds || [])
  });
}

/** 领取优惠券 */
function receive(templateId) {
  return post('/api/coupon/receive', { templateId });
}

module.exports = { fetchList, fetchAvailable, receive };
