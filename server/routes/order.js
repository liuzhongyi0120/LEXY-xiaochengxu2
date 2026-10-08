/**
 * 交易路由
 *   POST /api/order/precreate  预下单（返回订单号 + 支付参数）
 *   GET  /api/order/list       订单列表
 *   GET  /api/order/detail     订单详情
 *   GET  /api/order/count      各状态数量（「我的」页角标）
 *   POST /api/order/cancel     取消未支付订单
 *   POST /api/order/confirm    确认收货
 *   POST /api/order/ship       发货（联调辅助，真实环境由后台/ERP 触发）
 */

const orderLib = require('../lib/order');

module.exports = [
  {
    method: 'POST',
    path: '/api/order/precreate',
    auth: true,
    desc: '预下单：服务端重算金额、锁库存、核销券、返回支付参数',
    async handler(ctx) {
      const created = orderLib.precreate(ctx.db, ctx.userId, ctx.params);
      // 同一响应里直接给出支付参数，少一次往返
      const pay = await orderLib.buildPayment(ctx.db, ctx.userId, created.orderId);
      return Object.assign({}, created, { payment: pay.payment, amountFen: pay.amountFen });
    }
  },

  {
    method: 'GET',
    path: '/api/order/list',
    auth: true,
    desc: '订单列表（按状态筛选、分页）',
    async handler(ctx) {
      return orderLib.list(ctx.db, ctx.userId, ctx.params);
    }
  },

  {
    method: 'GET',
    path: '/api/order/detail',
    auth: true,
    desc: '订单详情（含物流节点）',
    async handler(ctx) {
      return orderLib.detail(ctx.db, ctx.userId, ctx.params.orderId);
    }
  },

  {
    method: 'GET',
    path: '/api/order/count',
    auth: true,
    desc: '各状态订单数量',
    async handler(ctx) {
      return orderLib.countByStatus(ctx.db, ctx.userId);
    }
  },

  {
    method: 'POST',
    path: '/api/order/cancel',
    auth: true,
    desc: '取消未支付订单（回滚库存 + 退还优惠券）',
    async handler(ctx) {
      return orderLib.cancel(ctx.db, ctx.userId, ctx.params.orderId);
    }
  },

  {
    method: 'POST',
    path: '/api/order/confirm',
    auth: true,
    desc: '确认收货',
    async handler(ctx) {
      return orderLib.confirm(ctx.db, ctx.userId, ctx.params.orderId);
    }
  },

  {
    method: 'POST',
    path: '/api/order/ship',
    auth: true,
    desc: '发货（联调辅助）',
    async handler(ctx) {
      return orderLib.ship(
        ctx.db,
        ctx.userId,
        ctx.params.orderId,
        ctx.params.company,
        ctx.params.no
      );
    }
  }
];
