const { get } = require('../utils/request');

/** 分类树（含二级分类） */
function fetchCategories() {
  return get('/api/goods/categories');
}

/**
 * 商品列表
 * @param {object} params { categoryId, keyword, sort, page, size }
 * @returns {Promise<{total: number, list: Array, hasMore: boolean}>}
 */
function fetchList(params) {
  return get('/api/goods/list', params);
}

/**
 * 商品详情（含 SKU 矩阵、图文详情、推荐商品）
 * @param {string} id 商品 ID
 */
function fetchDetail(id) {
  return get('/api/goods/detail', { id });
}

/**
 * 商品评价
 * @param {object} params { goodsId, page, size }
 */
function fetchComments(params) {
  return get('/api/goods/comments', params);
}

module.exports = { fetchCategories, fetchList, fetchDetail, fetchComments };
