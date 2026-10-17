/**
 * 微信能力封装（登录 / 手机号 / 支付）
 *
 * 双模式设计，保证「每个点位在开发期就能联络通畅」：
 *   - 已配置 WX_APPID + WX_SECRET  → 调用微信官方接口（真实 code2Session）
 *   - 未配置                       → 走本地模拟实现，返回可预测的 openid，
 *                                    小程序端全链路可跑通，无需等待商户资料
 *
 * 支付：真实支付的**协议细节全部在 lib/wxpay.js**（v3 签名 / 下单 / 公钥验签 / AES-GCM 解密），
 * 本文件只决定「走真实还是走沙箱」。是否走真实由 lib/wxpay.HAS_V3 决定（五项凭据缺一即回落沙箱）。
 */

const crypto = require('node:crypto');
const { BizError, ERR } = require('./http');
const wxpay = require('./wxpay');

const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';
const WX_MCH_ID = process.env.WX_MCH_ID || '';
const WX_PAY_KEY = process.env.WX_PAY_KEY || '';

const IS_PROD = process.env.NODE_ENV === 'production';
/*
 * 模拟登录**必须显式开启**（审查 F10，P1）。
 *
 * 旧行为：只要 WX_APPID / WX_SECRET 不齐，code2Session 就把**任意非空 code**
 * 映射成 mock_openid —— 不管是不是生产。于是漏配一次环境变量，线上的用户体系
 * 就静默变成「谁拿一个字符串都能造一个账号」的模拟体系，而且从界面上完全看不出来。
 *
 * 现在：
 *   · 生产默认**拒绝**模拟登录（直接启动失败），必须显式 WX_ALLOW_MOCK_LOGIN=1 才放行；
 *   · 放行也只是让它能用，健康检查里始终标注当前是 mock，不会假装是真实登录。
 */
const ALLOW_MOCK_LOGIN = String(process.env.WX_ALLOW_MOCK_LOGIN || '') === '1';
const HAS_WX_LOGIN = !!(WX_APPID && WX_SECRET);
const MOCK_LOGIN_ON = !IS_PROD || ALLOW_MOCK_LOGIN;
/** 登录模式：real（真实微信）/ mock（显式开启的模拟）/ disabled（生产缺配置，登录不可用） */
const LOGIN_MODE = HAS_WX_LOGIN ? 'real' : (MOCK_LOGIN_ON ? 'mock' : 'disabled');

/**
 * 生产启动前必须通过的检查。
 * @returns {string} 空串 = 可以启动；非空 = 拒绝启动的原因
 */
function loginStartupError() {
  if (!IS_PROD) return '';
  if (HAS_WX_LOGIN) return '';
  if (ALLOW_MOCK_LOGIN) return '';
  return 'NODE_ENV=production 但未配置 WX_APPID / WX_SECRET，且未显式开启模拟登录';
}

/**
 * 「真实支付可用」= 所有凭据齐备（见 lib/wxpay.js 的 HAS_V3）。
 *
 * ⚠️ 判据刻意收紧成「全有或全无」：只差公钥时会**整体回落沙箱**。
 *    否则会出现最坏的一种状态 —— 下单成功、回调验签必失败，
 *    用户付了钱而订单还是「待付款」。宁可明确走沙箱，也不要「半通」。
 */
const HAS_WX_PAY = !!(WX_APPID && WX_MCH_ID && WX_PAY_KEY && wxpay.HAS_V3);
if (WX_MCH_ID && WX_PAY_KEY && !wxpay.HAS_V3) {
  console.warn('[warn] 已填商户号/密钥但真实支付未启用，缺少：' + wxpay.missingPieces().join('、'));
}

/**
 * code2Session：用 wx.login 的 code 换 openid / session_key
 * @returns {Promise<{openid:string, sessionKey:string, mock:boolean}>}
 */
async function code2Session(code) {
  if (!code) throw new BizError('缺少登录凭证 code', ERR.PARAM);

  if (!HAS_WX_LOGIN) {
    /*
     * 生产环境缺配置 → **直接失败**，绝不退回模拟身份（F10）。
     * 宁可让用户看到「登录服务暂不可用」，也不能让他用任意字符串登进别人的体系。
     */
    if (!MOCK_LOGIN_ON) {
      throw new BizError('登录服务未正确配置，暂时无法登录（请联系商家）', ERR.BIZ, 503);
    }
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
    /* 同 code2Session：生产缺配置时不编造手机号，直接失败 */
    if (!MOCK_LOGIN_ON) throw new BizError('登录服务未正确配置，暂时无法获取手机号', ERR.BIZ, 503);
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
 * @param {object} p { openid, orderNo, amountFen, description, expireAt }
 */
async function unifiedOrder({ openid, orderNo, amountFen, description, expireAt }) {
  if (!HAS_WX_PAY) {
    // 联调模式：返回结构完整的沙箱参数，前端可照常走通「拉起支付」之外的流程
    const sandbox = `prepay_sandbox_${orderNo.slice(-10)}`;
    return buildPayParams(sandbox, false);
  }
  // 真实环境：APIv3 JSAPI 下单（商户私钥 RSA-SHA256 签名）→ 再用私钥签小程序支付参数
  const prepayId = await wxpay.jsapiPrepay({ openid, orderNo, amountFen, description, expireAt });
  return wxpay.buildPayParams(prepayId);
}

function nonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

/** 生成 wx.requestPayment 参数（**沙箱占位**；真实参数由 lib/wxpay.buildPayParams 产出） */
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

/**
 * 支付回调验签 —— **安全关键路径**
 *
 * ⚠️ 这里修掉了一个真实存在的漏洞。旧实现只有一行 `return !HAS_WX_PAY`，
 *    意思是「没配商户号就放行」。而 `/api/pay/notify` 是公网开放点位（`auth: false`），
 *    于是任何人都能 POST 一个订单号把订单标成「已支付」—— 白拿商品。
 *    「当前是沙箱环境」不构成理由：联调走的是 `/api/pay/mock-success`
 *    （需登录，且服务端走**与真实回调完全相同**的处理路径），根本不需要开放 notify。
 *
 * 现在的口径：沙箱模式一律拒绝并说明；真实模式严格验签（三项判据见 lib/wxpay.verifyNotify）。
 *
 * @param {object} headers 原始请求头
 * @param {string} rawBody 原始请求体字符串（**不能**用重新序列化的 JSON：字节不同则签名必不匹配）
 * @returns {Promise<{ok:boolean, reason:string}>}
 */
async function verifyNotify(headers, rawBody) {
  if (!HAS_WX_PAY) {
    return { ok: false, reason: '未启用真实微信支付，支付回调已关闭（联调请用 /api/pay/mock-success）' };
  }
  return wxpay.verifyNotify(headers, rawBody);
}

/** 主动查单（回调丢失时的兜底），未启用真实支付时返回 ok:false */
async function queryPayment(orderNo) {
  if (!HAS_WX_PAY) return { ok: false, status: 0, trade: null };
  return wxpay.queryByOutTradeNo(orderNo);
}

module.exports = {
  code2Session,
  getPhoneNumber,
  unifiedOrder,
  verifyNotify,
  queryPayment,
  HAS_WX_LOGIN,
  HAS_WX_PAY,
  LOGIN_MODE,
  ALLOW_MOCK_LOGIN,
  loginStartupError,
  WX_APPID,
  WX_MCH_ID
};
