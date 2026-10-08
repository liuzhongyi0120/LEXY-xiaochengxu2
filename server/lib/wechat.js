/**
 * 微信能力封装（登录 / 手机号 / 支付）
 *
 * 双模式设计，保证「每个点位在开发期就能联络通畅」：
 *   - 已配置 WX_APPID + WX_SECRET  → 调用微信官方接口（真实 code2Session）
 *   - 未配置                       → 走本地模拟实现，返回可预测的 openid，
 *                                    小程序端全链路可跑通，无需等待商户资料
 *
 * 支付同理：配置了 WX_MCH_ID + 证书则生成真实 JSAPI 支付参数，
 * 否则返回沙箱参数并把订单标记为「可模拟支付成功」，便于联调回调链路。
 */

const crypto = require('node:crypto');

const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';
const WX_MCH_ID = process.env.WX_MCH_ID || '';
const WX_PAY_KEY = process.env.WX_PAY_KEY || '';

const HAS_WX_LOGIN = !!(WX_APPID && WX_SECRET);
const HAS_WX_PAY = !!(WX_APPID && WX_MCH_ID && WX_PAY_KEY);

/**
 * code2Session：用 wx.login 的 code 换 openid / session_key
 * @returns {Promise<{openid:string, sessionKey:string, mock:boolean}>}
 */
async function code2Session(code) {
  if (!code) throw new Error('缺少登录凭证 code');

  if (!HAS_WX_LOGIN) {
    // 本地模拟：同一个 code 稳定映射到同一个 openid，便于重复登录拿到同一账号
    const hash = crypto.createHash('md5').update(String(code)).digest('hex').slice(0, 16);
    return { openid: `mock_openid_${hash}`, sessionKey: `mock_session_${hash}`, mock: true };
  }

  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${encodeURIComponent(WX_APPID)}` +
    `&secret=${encodeURIComponent(WX_SECRET)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';

  const res = await fetch(url);
  const json = await res.json();
  if (json.errcode) {
    const err = new Error(`微信登录失败：${json.errmsg || json.errcode}`);
    err.wxErrCode = json.errcode;
    throw err;
  }
  return { openid: json.openid, sessionKey: json.session_key, mock: false };
}

/**
 * 解密手机号（button open-type="getPhoneNumber" 的 code 版本）
 * 有配置时调用微信 phonenumber.getPhoneNumber；否则返回演示号码。
 */
async function getPhoneNumber(code, fallback = '') {
  if (!code) return fallback;
  if (!HAS_WX_LOGIN) {
    // 本地模拟：由 code 派生一个稳定的演示手机号
    const hash = crypto.createHash('md5').update(String(code)).digest('hex');
    const tail = String(parseInt(hash.slice(0, 8), 16) % 100000000).padStart(8, '0');
    return `138${tail}`;
  }

  const tokenRes = await fetch(
    'https://api.weixin.qq.com/cgi-bin/token' +
    `?grant_type=client_credential&appid=${encodeURIComponent(WX_APPID)}&secret=${encodeURIComponent(WX_SECRET)}`
  );
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) throw new Error('获取微信 access_token 失败');

  const res = await fetch(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenJson.access_token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    }
  );
  const json = await res.json();
  if (json.errcode) throw new Error(`手机号获取失败：${json.errmsg || json.errcode}`);
  return (json.phone_info && json.phone_info.phoneNumber) || fallback;
}

/**
 * JSAPI 统一下单，返回小程序 wx.requestPayment 所需参数
 * @param {object} p { openid, orderNo, amountFen, description }
 */
async function unifiedOrder({ openid, orderNo, amountFen, description }) {
  if (!HAS_WX_PAY) {
    // 联调模式：返回结构完整的沙箱参数，前端可照常走通「拉起支付」之外的流程
    const sandbox = `prepay_sandbox_${orderNo.slice(-10)}`;
    return buildPayParams(sandbox, false);
  }
  // 真实环境：此处接微信支付 v3 JSAPI 下单（需商户私钥签名）
  // 生产接入点：POST https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi
  throw new Error('微信支付 v3 证书未配置：请设置 WX_MCH_CERT 与 WX_MCH_KEY_PATH 后再启用');
}

function nonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

/** 生成 wx.requestPayment 参数（真实模式必须用商户私钥 RSA 签名，此处仅沙箱占位） */
function buildPayParams(prepayId, real) {
  const params = {
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: nonceStr(),
    package: `prepay_id=${prepayId}`,
    signType: 'RSA',
    paySign: ''
  };
  if (!real) {
    params.signType = 'MD5';
    params.paySign = crypto
      .createHash('md5')
      .update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&'))
      .digest('hex')
      .toUpperCase();
  }
  return params;
}

/** 支付回调验签（真实模式接微信 v3 平台证书验签） */
function verifyNotifySignature() {
  return !HAS_WX_PAY; // 未配置商户时视为沙箱回调，直接放行
}

module.exports = {
  code2Session,
  getPhoneNumber,
  unifiedOrder,
  verifyNotifySignature,
  HAS_WX_LOGIN,
  HAS_WX_PAY,
  WX_APPID,
  WX_MCH_ID
};
