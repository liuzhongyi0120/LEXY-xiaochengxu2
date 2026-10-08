const { get, post } = require('../utils/request');

/** 我的收藏 */
function fetchList(params) {
  return get('/api/favorite/list', params);
}

/**
 * 收藏 / 取消收藏
 * @param {string} goodsId
 * @returns {Promise<{goodsId, favorited, total}>} favorited 为 true 表示本次是「收藏」
 */
function toggle(goodsId) {
  return post('/api/favorite/toggle', { goodsId });
}

module.exports = { fetchList, toggle };
