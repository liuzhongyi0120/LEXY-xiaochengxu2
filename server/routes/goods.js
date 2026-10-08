/**
 * 商品与首页路由
 *   GET /api/home              首页聚合
 *   GET /api/goods/categories  分类树
 *   GET /api/goods/list        商品列表
 *   GET /api/goods/detail      商品详情
 *   GET /api/goods/comments    评价列表
 */

const catalog = require('../lib/catalog');

module.exports = [
  {
    method: 'GET',
    path: '/api/home',
    auth: false,
    desc: '首页聚合（轮播/分类入口/推荐）',
    async handler() {
      return catalog.home();
    }
  },

  {
    method: 'GET',
    path: '/api/goods/categories',
    auth: false,
    desc: '分类树（含二级）',
    async handler() {
      return catalog.categories();
    }
  },

  {
    method: 'GET',
    path: '/api/goods/list',
    auth: false,
    desc: '商品列表（分类/关键词/排序/分页）',
    async handler(ctx) {
      return catalog.listGoods(ctx.params);
    }
  },

  {
    method: 'GET',
    path: '/api/goods/detail',
    auth: false,
    desc: '商品详情（SKU 矩阵/图文/推荐）',
    async handler(ctx) {
      return catalog.detail(ctx.params.id);
    }
  },

  {
    method: 'GET',
    path: '/api/goods/comments',
    auth: false,
    desc: '商品评价列表',
    async handler(ctx) {
      return catalog.comments(ctx.params.goodsId, ctx.params.page, ctx.params.size);
    }
  }
];
