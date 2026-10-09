const { get } = require('../utils/request');
const { resolveAssets } = require('../utils/asset');

/**
 * 商品域服务层 —— 同时是**商品摘要契约的唯一适配处**。
 *
 * 两个历史上分开演进、后来撞车的东西，都在这里收口：
 *
 * 1）字段命名：服务端列表/详情返回的是 `id` / `cover`（见 server/lib/catalog.js 的 toListItem），
 *    而装修「商品」区块的模板读的是 `goodsId` / `image`。中间一度没有适配层，
 *    结果是商品卡片 `data-goods` 拿到空串 → 点击直接 return，图片也是空的（点不动、图空白）。
 *    现在在这里同时提供两种写法，页面与区块都只认这一份契约，不再各写一套。
 *
 * 2）素材地址：后台「本地上传」的商品图存的是 `/uploads/…` 相对路径，
 *    浏览器预览能显示（同源），**真机上却是裂图**。商品接口此前没有过 resolveAssets，
 *    装修数据过了、商品数据没过 —— 这条裂缝就是「后台传的图小程序看不到」的根因。
 *    在这里统一补成完整地址，覆盖封面 / 图集 / SKU 图 / 图文详情 / 推荐 / 分享图。
 *
 * resolveAssets 只改写以 `/uploads/` 开头的字符串，外链与站内路径原样保留，
 * 因此对非图片字段（描述文字、跳转路径）是安全的。
 */

/** 单件商品归一：补 goodsId/image 别名 + 统一素材地址 */
function normGoods(g) {
  if (!g || typeof g !== 'object') return g;
  const o = resolveAssets(g);
  o.goodsId = o.goodsId || o.id || '';
  o.id = o.id || o.goodsId;
  o.cover = o.cover || (Array.isArray(o.images) ? o.images[0] : '') || '';
  o.image = o.cover;
  if (Array.isArray(o.skus)) {
    o.skus = o.skus.map((s) => (s && typeof s === 'object' ? Object.assign({}, s, { image: s.image || '' }) : s));
  }
  // 推荐位是同一份「商品摘要」，必须走同一层归一 ——
  // 否则详情页相关推荐会缺 goodsId（点不动）且图片字段名与列表不一致
  if (Array.isArray(o.recommends)) o.recommends = o.recommends.map(normGoods);
  return o;
}

/** 分类树（含二级分类） */
function fetchCategories() {
  return get('/api/goods/categories').then((d) => resolveAssets(d));
}

/**
 * 商品列表
 * @param {object} params { categoryId, keyword, sort, page, size }
 * @returns {Promise<{total: number, list: Array, hasMore: boolean}>}
 */
function fetchList(params) {
  return get('/api/goods/list', params).then((d) =>
    Object.assign({}, d, { list: ((d && d.list) || []).map(normGoods) })
  );
}

/**
 * 商品详情（含 SKU 矩阵、图文详情、推荐商品）
 * @param {string} id 商品 ID
 */
function fetchDetail(id) {
  return get('/api/goods/detail', { id }).then(normGoods);
}

/**
 * 商品评价
 * @param {object} params { goodsId, page, size }
 */
function fetchComments(params) {
  return get('/api/goods/comments', params);
}

module.exports = { fetchCategories, fetchList, fetchDetail, fetchComments, normGoods };
