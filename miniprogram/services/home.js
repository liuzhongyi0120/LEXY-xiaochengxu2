const { get } = require('../utils/request');

/**
 * 首页聚合数据：轮播 / 分类快捷入口 / 推荐商品
 * @returns {Promise<{banners: Array, categories: Array, recommends: Array}>}
 */
function fetchHome() {
  return get('/api/home');
}

module.exports = { fetchHome };
