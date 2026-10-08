/**
 * 购物车路由（服务端购物车，跨设备同步）
 *   GET    /api/cart/list
 *   POST   /api/cart/add
 *   PUT    /api/cart/update
 *   DELETE /api/cart/remove
 *   POST   /api/cart/selectAll
 */

const cart = require('../lib/cart');

module.exports = [
  {
    method: 'GET',
    path: '/api/cart/list',
    auth: true,
    desc: '购物车列表',
    async handler(ctx) {
      return cart.list(ctx.db, ctx.userId);
    }
  },

  {
    method: 'POST',
    path: '/api/cart/add',
    auth: true,
    desc: '加入购物车（校验库存）',
    async handler(ctx) {
      return cart.add(ctx.db, ctx.userId, ctx.params);
    }
  },

  {
    method: 'PUT',
    path: '/api/cart/update',
    auth: true,
    desc: '修改数量 / 勾选状态',
    async handler(ctx) {
      return cart.update(ctx.db, ctx.userId, ctx.params);
    }
  },

  {
    method: 'DELETE',
    path: '/api/cart/remove',
    auth: true,
    desc: '批量移除',
    async handler(ctx) {
      return cart.remove(ctx.db, ctx.userId, ctx.params.cartItemIds);
    }
  },

  {
    method: 'POST',
    path: '/api/cart/selectAll',
    auth: true,
    desc: '全选 / 全不选',
    async handler(ctx) {
      return cart.selectAll(ctx.db, ctx.userId, ctx.params.selected);
    }
  }
];
