/**
 * 微信支付 APIv3 内核（**零第三方依赖**，只用 node:crypto + fetch）
 *
 * 为什么单独成文件：`lib/wechat.js` 原来把「登录 / 手机号 / 支付」混在一起，
 * 而支付这一块涉及**协议级细节**（签名串格式、AES-GCM 解密、公钥验签、防重放），
 * 写错一处就表现为「下单 500」或更糟的「回调验签失败但没人知道」。
 * 拆出来之后，它的每个环节都能被单测直接打到（见 .tooling/test-wxpay.mjs）。
 *
 * ── 凭据全部来自环境变量 / 文件，代码里一个字都不写 ──────────────────────
 *   WX_MCH_ID               商户号（10 位）
 *   WX_MCH_SERIAL_NO        商户 API 证书序列号
 *   WX_MCH_KEY_PATH         商户 API 私钥 apiclient_key.pem 的路径
 *   WX_PAY_KEY              APIv3 密钥（32 位，用于解密回调 / 平台证书）
 *   WX_PAY_PUBLIC_KEY_PATH  微信支付公钥 pub_key.pem 的路径（新版商户必需）
 *   WX_NOTIFY_URL           支付结果回调地址（默认按 ENV 推导）
 * 本仓库是**公开**的，所以这些值只允许存在服务器 `.env` 与服务器文件系统里。
 *
 * ── 两条验签路线，本项目命中哪条是**实测**出来的，不是猜的 ────────────────
 *   实测 GET /v3/certificates → 404 RESOURCE_NOT_EXISTS
 *   「无可用的平台证书，请在商户平台-API安全申请使用微信支付公钥」
 *   → 2024 年后的新商户不再签发平台证书，**必须用「微信支付公钥」验签**。
 *   两条路线都实现，按回调头 `Wechatpay-Serial` 的形态自动选择：
 *     · `PUB_KEY_ID_…`  → 微信支付公钥
 *     · 32 位十六进制   → 平台证书（惰性拉取 + 12h 缓存，兼容老商户）
 *   两条都取不到 → **验签失败**（绝不「验不了就放行」：那等于让任何人伪造回调白拿订单）。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');

const API_BASE = 'https://api.mch.weixin.qq.com';

/** 时间戳容差：回调的 Wechatpay-Timestamp 与本机时间相差超过它即拒（防重放） */
const NOTIFY_TS_TOLERANCE_SEC = 300;
/** 平台证书缓存时长 */
const CERT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const MCH_ID = process.env.WX_MCH_ID || '';
const SERIAL_NO = process.env.WX_MCH_SERIAL_NO || '';
const APIv3_KEY = process.env.WX_PAY_KEY || '';
const KEY_PATH = process.env.WX_MCH_KEY_PATH || '';
const PUB_KEY_PATH = process.env.WX_PAY_PUBLIC_KEY_PATH || '';
const NOTIFY_URL = process.env.WX_NOTIFY_URL || '';

function readPem(p, label) {
  if (!p) return '';
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.warn(`[warn] 微信支付：${label} 读取失败（${p}）→ ${e.code || e.message}，将按「未配置真实支付」处理`);
    return '';
  }
}

const PRIVATE_KEY_PEM = readPem(KEY_PATH, '商户私钥');
const PUBLIC_KEY_PEM = readPem(PUB_KEY_PATH, '微信支付公钥');

/** 私钥/公钥都预先 parse 成 KeyObject：每笔请求都 parse 一次是纯浪费 */
function tryKey(fn, pem) {
  try {
    return pem ? fn(pem) : null;
  } catch (e) {
    console.warn('[warn] 微信支付：密钥格式无法解析 → ' + (e.message || e));
    return null;
  }
}
const privateKeyObj = tryKey((p) => crypto.createPrivateKey(p), PRIVATE_KEY_PEM);
const publicKeyObj = tryKey((p) => crypto.createPublicKey(p), PUBLIC_KEY_PEM);

/**
 * APIv3 密钥必须是**正好 32 字节**（AES-256 要求）。
 * 不校验的话，长度填错会一路走到「解密回调」那一刻才抛 `Invalid key length`,
 * 表现为「支付成功但订单不入账」—— 排查成本极高。宁可启动时就判定未配置。
 */
const KEY_LENGTH_OK = Buffer.byteLength(APIv3_KEY) === 32;

/**
 * 「真实支付是否可用」的唯一判据。
 *
 * ⚠️ 必须**同时**满足这些条件才为真，缺一不可 —— 这是刻意的：
 *   缺公钥时下单能成功、但**回调验签必然失败** → 用户付了钱、订单还是「待付款」，
 *   比「明确走沙箱」危险得多。所以宁可整体回落到沙箱，也不做「半通」。
 */
const HAS_V3 = !!(MCH_ID && SERIAL_NO && KEY_LENGTH_OK && privateKeyObj && publicKeyObj);

/** 诊断用：告诉运维到底缺哪一项（不泄露任何值） */
function missingPieces() {
  const miss = [];
  if (!MCH_ID) miss.push('WX_MCH_ID');
  if (!SERIAL_NO) miss.push('WX_MCH_SERIAL_NO');
  if (!APIv3_KEY) miss.push('WX_PAY_KEY');
  else if (!KEY_LENGTH_OK) miss.push(`WX_PAY_KEY(长度应为 32 字节，当前 ${Buffer.byteLength(APIv3_KEY)})`);
  if (!privateKeyObj) miss.push('WX_MCH_KEY_PATH(apiclient_key.pem)');
  if (!publicKeyObj) miss.push('WX_PAY_PUBLIC_KEY_PATH(pub_key.pem)');
  return miss;
}

/* ══════════════════════════════════════════════════════════════════════
 * 一、请求签名
 * ══════════════════════════════════════════════════════════════════════ */

function nonce() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

/**
 * 生成 Authorization 头。
 * 签名串固定四行 + 末尾换行（GET 无 body 时第 5 行为空串，**末尾仍要 \n**）：
 *   方法\nURL(含 query)\n时间戳\n随机串\n请求体\n
 */
function buildAuth(method, urlPath, body = '') {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = nonce();
  const message = `${method.toUpperCase()}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = crypto.createSign('RSA-SHA256').update(message).sign(privateKeyObj, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonceStr}",` +
    `signature="${signature}",timestamp="${timestamp}",serial_no="${SERIAL_NO}"`;
}

/**
 * 调微信接口。
 *
 * ⚠️ `Accept-Language: zh-CN` 是**必须显式声明**的，不是可选项：
 *    不传时本机链路（公司网络出口）会注入一个微信不认的值，
 *    微信直接回 `406 传入了不支持的Accept-Language` ——
 *    看起来像「接口不能用」，实际只差这一个头（实测踩到）。
 */
async function request(method, urlPath, body) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const res = await fetch(API_BASE + urlPath, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': 'zh-CN',
      Authorization: buildAuth(method, urlPath, raw),
      'User-Agent': 'lexy-mall/1.0'
    },
    body: raw || undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* 非 JSON（如 204 空体） */ }
  return { status: res.status, text, json };
}

/* ══════════════════════════════════════════════════════════════════════
 * 二、AES-256-GCM 解密（回调通知体、平台证书都是这个格式）
 * ══════════════════════════════════════════════════════════════════════ */

function decryptGcm({ ciphertext, nonce: iv, associated_data: aad }) {
  const buf = Buffer.from(ciphertext, 'base64');
  const tag = buf.subarray(buf.length - 16);          // 末 16 字节是认证标签
  const data = buf.subarray(0, buf.length - 16);
  /*
   * ⚠️ `nonce` 必须按 **base64** 解码（微信文档：12 字节随机串的 base64 表示）。
   *    写成 `Buffer.from(iv)` 会默认按 utf8 取字节 → IV 错了 → 解密恒失败，
   *    报的还是 `Unsupported state or unable to authenticate data`（看着像密钥错）。
   *    这一条是被 .tooling/test-wxpay.mjs 的加解密往返用例抓出来的。
   */
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(APIv3_KEY), Buffer.from(iv, 'base64'));
  d.setAuthTag(tag);
  // associated_data 是明文（通常就是 "transaction"），按 utf8 处理
  if (aad) d.setAAD(Buffer.from(aad));
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
}

/* ══════════════════════════════════════════════════════════════════════
 * 三、回调验签
 * ══════════════════════════════════════════════════════════════════════ */

let certCache = { at: 0, bySerial: {} };

/**
 * 拉平台证书（**老商户**路线）。当前商户实测为 404（无平台证书），
 * 所以这条路径默认不会被走到；保留它是为了兼容将来切回的商户，
 * 且失败时**静默降级** —— 不能因为拉不到证书就让回调路径抛异常。
 */
async function fetchPlatformCerts() {
  const r = await request('GET', '/v3/certificates');
  if (r.status !== 200 || !r.json || !Array.isArray(r.json.data)) return {};
  const bySerial = {};
  r.json.data.forEach((item) => {
    try {
      const cert = decryptGcm(item.encrypt_certificate);
      bySerial[item.serial_no] = cert;
    } catch (e) {
      console.warn('[warn] 微信支付：平台证书解密失败（APIv3 密钥不匹配？）');
    }
  });
  return bySerial;
}

async function publicKeyFor(serial) {
  if (publicKeyObj) return publicKeyObj;   // 微信支付公钥：一把到底，无轮换

  const now = Date.now();
  if (!certCache.bySerial[serial] || now - certCache.at > CERT_CACHE_TTL_MS) {
    try {
      certCache = { at: now, bySerial: await fetchPlatformCerts() };
    } catch (e) {
      console.warn('[warn] 微信支付：拉取平台证书失败 → ' + (e.message || e));
    }
  }
  const pem = certCache.bySerial[serial];
  if (!pem) return null;
  try { return new crypto.X509Certificate(pem).publicKey; } catch (e) { return null; }
}

/**
 * 验签。返回 { ok, reason }。
 *
 * 判据（**三项全过才算通过**）：
 *   ① 三个验签头齐备（timestamp / nonce / signature）
 *   ② 时间戳在 ±5 分钟内（否则视为重放 —— 微信文档要求的时效校验）
 *   ③ RSA-SHA256 验签通过
 * 任一项不过一律拒绝；**绝不返回「验不了就放行」**。
 *
 * @param {object} headers   原始请求头（小写键）
 * @param {string} rawBody   原始请求体**字符串**（必须与微信发来的字节一致，不能用重新序列化的 JSON）
 */
async function verifyNotify(headers, rawBody) {
  const timestamp = String(headers['wechatpay-timestamp'] || '');
  const nonceStr = String(headers['wechatpay-nonce'] || '');
  const signature = String(headers['wechatpay-signature'] || '');
  const serial = String(headers['wechatpay-serial'] || '');

  if (!timestamp || !nonceStr || !signature) return { ok: false, reason: '缺少验签头' };
  if (!rawBody) return { ok: false, reason: '缺少原始请求体' };

  const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(drift) || drift > NOTIFY_TS_TOLERANCE_SEC) {
    return { ok: false, reason: `时间戳超出 ${NOTIFY_TS_TOLERANCE_SEC} 秒容差（可能为重放）` };
  }

  const key = await publicKeyFor(serial);
  if (!key) return { ok: false, reason: `找不到与 Wechatpay-Serial 匹配的公钥（${serial || '空'}）` };

  const message = `${timestamp}\n${nonceStr}\n${rawBody}\n`;
  let ok = false;
  try {
    ok = crypto.createVerify('RSA-SHA256').update(message).verify(key, signature, 'base64');
  } catch (e) {
    return { ok: false, reason: '验签异常：' + (e.message || e) };
  }
  return ok ? { ok: true, reason: '' } : { ok: false, reason: '签名不匹配' };
}

/* ══════════════════════════════════════════════════════════════════════
 * 四、下单与支付参数
 * ══════════════════════════════════════════════════════════════════════ */

/** RFC3339（+08:00）—— 微信要的是带时区的本地时间，`toISOString()` 出来的是 Z，会被拒 */
function rfc3339(ms) {
  const d = new Date(ms + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+08:00`;
}

function defaultNotifyUrl() {
  if (NOTIFY_URL) return NOTIFY_URL;
  const base = process.env.PUBLIC_BASE_URL || '';
  return base ? base.replace(/\/+$/, '') + '/api/pay/notify' : '';
}

/**
 * JSAPI 下单 → 返回 prepay_id
 * @param {object} p { openid, orderNo, amountFen, description, expireAt }
 */
async function jsapiPrepay({ openid, orderNo, amountFen, description, expireAt }) {
  const notifyUrl = defaultNotifyUrl();
  if (!notifyUrl) throw new Error('未配置支付回调地址（WX_NOTIFY_URL 或 PUBLIC_BASE_URL）');

  const body = {
    appid: process.env.WX_APPID || '',
    mchid: MCH_ID,
    description: String(description || '莱克商城商品').slice(0, 127),
    out_trade_no: orderNo,
    notify_url: notifyUrl,
    amount: { total: Number(amountFen), currency: 'CNY' },
    payer: { openid },
    // 附带给微信侧也设上过期时间：本地超时取消与微信侧关单保持一致
    ...(expireAt ? { time_expire: rfc3339(expireAt) } : {})
  };

  const r = await request('POST', '/v3/pay/transactions/jsapi', body);
  if (r.status !== 200 || !r.json || !r.json.prepay_id) {
    const detail = (r.json && (r.json.message || r.json.code)) || r.text.slice(0, 200);
    const err = new Error(`微信下单失败（HTTP ${r.status}）：${detail}`);
    err.wxStatus = r.status;
    err.wxBody = r.json || null;
    throw err;
  }
  return r.json.prepay_id;
}

/**
 * 生成 `wx.requestPayment` 参数。
 * 签名串：appId\ntimeStamp\nnonceStr\npackage\n —— 注意第 4 行是 `prepay_id=xxx` 整体。
 */
function buildPayParams(prepayId) {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = nonce();
  const pkg = `prepay_id=${prepayId}`;
  const message = `${process.env.WX_APPID || ''}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
  const paySign = crypto.createSign('RSA-SHA256').update(message).sign(privateKeyObj, 'base64');
  return { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };
}

/**
 * 主动查单（按商户订单号）。用途：回调可能因部署/网络丢失 ——
 * 支付结果页轮询时用它兜底，避免「用户已付款、订单仍显示待付款」。
 */
async function queryByOutTradeNo(orderNo) {
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${MCH_ID}`;
  const r = await request('GET', urlPath);
  if (r.status !== 200 || !r.json) {
    return { ok: false, status: r.status, trade: null, raw: r.json };
  }
  return { ok: true, status: r.status, trade: r.json };
}

module.exports = {
  HAS_V3,
  missingPieces,
  MCH_ID,
  decryptGcm,
  verifyNotify,
  jsapiPrepay,
  buildPayParams,
  queryByOutTradeNo,
  defaultNotifyUrl,
  rfc3339,
  // 供自测使用（不参与业务流程）
  _internal: { buildAuth, request }
};
