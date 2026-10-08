const { get, post, del } = require('../utils/request');

/** 浏览记录 */
function fetchList(params) {
  return get('/api/footprint/list', params);
}

/** 记录一次浏览（商品详情页 onLoad 调用） */
function add(goodsId) {
  return post('/api/footprint/add', { goodsId });
}

/** 清空浏览记录 */
function clear() {
  return del('/api/footprint/clear');
}

module.exports = { fetchList, add, clear };
