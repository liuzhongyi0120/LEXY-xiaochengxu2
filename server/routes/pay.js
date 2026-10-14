/**
 * 支付路由
 *   POST /api/pay/notify        微信支付结果回调（微信服务器调用，非小程序）
 *   POST /api/pay/query         前端查询支付结果（支付结果页轮询）
 *   POST /api/pay/mock-success  联调：模拟支付成功（仅**未启用真实支付**时开放）
 *
 * ── 回调这条路径的三个关键约定（都不在业务逻辑里，但错了就整条链断）──────
 *  1) `rawBody: true` —— 验签签的是**微信发来的原始字节**。走 JSON 解析器再 stringify
 *     回去，键序/空格一变签名就不匹配，且失败得毫无线索。
 *  2) 应答体必须是 `{"code":"SUCCESS","message":"成功"}`，不能用统一 `{code,msg,data}`
 *     包装 → 用 `rawHttp()` 自行掌控应答。
 *  3) 失败必须回 4xx/5xx：微信只对**非 2xx** 才会重试；回 200 等于「我处理完了」，
 *     订单就永远停在待付款了。
 */

const orderLib = require('../lib/order');
const wechat = require('../lib/wechat');
const wxpay = require('../lib/wxpay');
const { BizError, ERR, rawHttp } = require('../lib/http');

/**
 * 是否允许模拟支付。
 *
 * 判据按「失败往安全侧倒」重排（原实现里显式的 `ALLOW_MOCK_PAY=1` 会**越过**
 * 生产环境判断，于是线上 `.env` 里那行 `ALLOW_MOCK_PAY=1` 让这个接口在公网开着 ——
 * 任何已登录用户都能把自己订单免费标成已支付）：
 *   ① 显式 `=0` → 关（最高优先级）
 *   ② **真实支付已启用 → 一律关**（不再需要模拟，也不该有第二条把订单标成已支付的路）
 *   ③ 显式 `=1` → 开（此时必然还没接真实支付）
 *   ④ 其余 → 非生产环境开
 */
const ALLOW_MOCK_PAY = (() => {
  if (process.env.ALLOW_MOCK_PAY === '0') return false;
  if (wechat.HAS_WX_PAY) return false;
  if (process.env.ALLOW_MOCK_PAY === '1') return true;
  return process.env.NODE_ENV !== 'production';
})();

module.exports = [
  {
    method: 'POST',
    path: '/api/pay/notify',
    auth: false,
    rawBody: true,
    desc: '微信支付结果回调（验签 + 解密 + 幂等）',
    async handler(ctx) {
      /* 1) 验签 —— 未启用真实支付时这里会直接拒绝（见 lib/wechat.verifyNotify 的说明） */
      const verdict = await wechat.verifyNotify(ctx.req.headers, ctx.rawBody);
      if (!verdict.ok) {
        console.warn('[warn] 支付回调被拒：' + verdict.reason);
        return rawHttp(403, { code: 'FAIL', message: verdict.reason });
      }

      /* 2) 解析原始体（rawBody 模式下 ctx.body 是空的，这是刻意的） */
      let envelope;
      try {
        envelope = JSON.parse(ctx.rawBody);
      } catch (e) {
        return rawHttp(400, { code: 'FAIL', message: '请求体不是合法 JSON' });
      }
      if (!envelope || !envelope.resource || !envelope.resource.ciphertext) {
        return rawHttp(400, { code: 'FAIL', message: '通知体缺少 resource' });
      }

      /* 3) 解密通知体（AES-256-GCM，密钥 = APIv3 密钥） */
      let notice;
      try {
        notice = wxpay.decryptGcm(envelope.resource);
      } catch (e) {
        console.error('[error] 支付回调解密失败', e.message);
        return rawHttp(400, { code: 'FAIL', message: '通知体解密失败' });
      }

      /* 4) 事件与状态过滤：只有「支付成功」才动订单；
       *    其它状态（如用户支付中、已转入退款）回 SUCCESS 但不动订单，避免微信反复重试 */
      if (envelope.event_type && envelope.event_type !== 'TRANSACTION.SUCCESS') {
        return rawHttp(200, { code: 'SUCCESS', message: '成功' });
      }
      if (notice.trade_state && notice.trade_state !== 'SUCCESS') {
        console.log('[pay] 忽略非成功状态通知：' + notice.trade_state);
        return rawHttp(200, { code: 'SUCCESS', message: '成功' });
      }

      /* 5) 串号防护：通知必须来自本商户 */
      if (notice.mchid && wxpay.MCH_ID && notice.mchid !== wxpay.MCH_ID) {
        console.error('[error] 支付回调商户号不匹配：' + notice.mchid);
        return rawHttp(400, { code: 'FAIL', message: '商户号不匹配' });
      }

      /* 6) 入账（幂等：同一 transaction_id 重复通知只生效一次） */
      try {
        const result = orderLib.markPaid(ctx.db, {
          orderNo: notice.out_trade_no,
          transactionId: notice.transaction_id,
          payAmountFen: notice.amount && notice.amount.total
        });
        console.log(`[pay] 回调入账 ${notice.out_trade_no} → ${result.order.status}` +
          (result.duplicated ? '（重复通知，已忽略）' : ''));
        return rawHttp(200, { code: 'SUCCESS', message: '成功' });
      } catch (e) {
        // 金额不符 / 订单不存在：回 5xx 让微信重试，同时留日志给人排查
        console.error('[error] 支付回调入账失败', notice.out_trade_no, e.message);
        return rawHttp(e instanceof BizError && e.httpStatus === 404 ? 404 : 500,
          { code: 'FAIL', message: e.message });
      }
    }
  },

  {
    method: 'POST',
    path: '/api/pay/query',
    auth: true,
    desc: '查询订单支付结果（供支付结果页轮询；带回调丢失时的主动查单兜底）',
    async handler(ctx) {
      let order = orderLib.detail(ctx.db, ctx.userId, ctx.params.orderId);

      /*
       * 主动查单兜底 —— 支付回调是**异步且可能丢失**的：
       * 部署重启、网络抖动、回调地址短暂 502，都会让微信的重试窗口错过，
       * 结果就是「用户已扣款、订单一直显示待付款」。微信官方也建议用它做补偿。
       * 只在「本地仍待付款 + 已启用真实支付」时才查，且查单失败不影响正常返回。
       */
      if (order.status === orderLib.STATUS.PENDING_PAY && wechat.HAS_WX_PAY) {
        try {
          const q = await wechat.queryPayment(order.orderNo);
          const trade = q.ok && q.trade;
          if (trade && trade.trade_state === 'SUCCESS') {
            orderLib.markPaid(ctx.db, {
              orderNo: order.orderNo,
              transactionId: trade.transaction_id,
              payAmountFen: trade.amount && trade.amount.total
            });
            order = orderLib.detail(ctx.db, ctx.userId, ctx.params.orderId);
            console.log('[pay] 主动查单补齐支付状态：' + order.orderNo);
          }
        } catch (e) {
          console.warn('[warn] 主动查单失败（不影响本次响应）', e.message);
        }
      }

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
    desc: '联调：模拟支付成功（走与真实回调完全相同的处理路径；启用真实支付后自动关闭）',
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
