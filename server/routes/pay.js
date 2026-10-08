/**
 * 支付路由
 *   POST /api/pay/notify        微信支付结果回调（微信服务器调用，非小程序）
 *   POST /api/pay/query         前端查询支付结果（支付结果页轮询）
 *   POST /api/pay/mock-success  联调：模拟支付成功（仅非生产环境开放）
 */

const orderLib = require('../lib/order');
const wechat = require('../lib/wechat');
const { BizError, ERR } = require('../lib/http');

/**
 * 是否允许模拟支付：默认在未配置真实商户号时开启，
 * 生产环境请设置 NODE_ENV=production 或显式 ALLOW_MOCK_PAY=0 关闭。
 */
const ALLOW_MOCK_PAY =
  process.env.ALLOW_MOCK_PAY === '1' ||
  (process.env.ALLOW_MOCK_PAY !== '0' && process.env.NODE_ENV !== 'production' && !wechat.HAS_WX_PAY);

module.exports = [
  {
    method: 'POST',
    path: '/api/pay/notify',
    auth: false,
    desc: '微信支付结果回调（验签 + 幂等）',
    async handler(ctx) {
      if (!wechat.verifyNotifySignature(ctx.req.headers)) {
        throw new BizError('支付回调验签失败', ERR.FORBIDDEN, 403);
      }

      const { orderNo, transactionId, payAmountFen } = ctx.params;
      if (!orderNo || !transactionId) {
        // 微信要求回调必须返回 SUCCESS/FAIL 结构，这里统一成业务结构由入口转换
        throw new BizError('回调参数不完整', ERR.PARAM);
      }

      const result = orderLib.markPaid(ctx.db, { orderNo, transactionId, payAmountFen });
      return {
        // 微信侧期望的确认字段
        errcode: 0,
        errmsg: 'SUCCESS',
        orderId: result.order.orderId,
        orderStatus: result.order.status,
        duplicated: result.duplicated
      };
    }
  },

  {
    method: 'POST',
    path: '/api/pay/query',
    auth: true,
    desc: '查询订单支付结果（供支付结果页轮询）',
    async handler(ctx) {
      const order = orderLib.detail(ctx.db, ctx.userId, ctx.params.orderId);
      return {
        orderId: order.orderId,
        orderNo: order.orderNo,
        status: order.status,
        statusText: order.statusText,
        paid: order.status !== orderLib.STATUS.PENDING_PAY && order.status !== orderLib.STATUS.CANCELLED,
        payAmount: order.amounts.payAmount
      };
    }
  },

  {
    method: 'POST',
    path: '/api/pay/mock-success',
    auth: true,
    dev: true,
    desc: '联调：模拟支付成功（走与真实回调完全相同的处理路径）',
    async handler(ctx) {
      if (!ALLOW_MOCK_PAY) {
        throw new BizError('当前环境已关闭模拟支付', ERR.FORBIDDEN, 403);
      }
      const order = orderLib.findOrder(ctx.db, ctx.userId, ctx.params.orderId);
      const result = orderLib.markPaid(ctx.db, {
        orderNo: order.orderNo,
        transactionId: 'MOCKTX' + order.orderNo,
        payAmountFen: order.amounts.payAmount
      });
      return {
        orderId: result.order.orderId,
        status: result.order.status,
        statusText: result.order.statusText,
        mock: true
      };
    }
  }
];
