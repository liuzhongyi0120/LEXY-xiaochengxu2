/**
 * 微信支付内核自测（`.tooling/test-wxpay.mjs`）
 *
 * 为什么可以「没有真实公钥也验证」：支付协议的每个环节都是**纯数学**，
 * 与密钥是谁的无关。这里自造一对 RSA 密钥，把私钥当「商户私钥」、公钥当「微信支付公钥」，
 * 然后自己扮演微信来签一个回调 —— 走的代码路径与线上**完全一致**。
 * 真实凭据只影响「微信认不认」，不影响「我算得对不对」。
 *
 * 覆盖：
 *   · 签名串格式（四行 + 末尾换行）、Authorization 头五个字段
 *   · 回调验签：正确签名通过；篡改 body / 超时时间戳 / 缺头 / 缺公钥 → 必须拒绝
 *   · AES-256-GCM 解密往返
 *   · 「五项凭据缺一即回落沙箱」（子进程验证，避免 require 缓存干扰）
 *   · 沙箱模式下回调必须**整体拒绝**（旧实现是放行 = 真漏洞）
 *
 * 用法：node .tooling/test-wxpay.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const failures = [];
function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failures.push(name + (detail ? ' —— ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')); }
}

/* ── 造一套「假的真凭据」──────────────────────────────────────────────── */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxpay-test-'));
const KEY_PATH = path.join(dir, 'apiclient_key.pem');
const PUB_PATH = path.join(dir, 'pub_key.pem');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync(KEY_PATH, privateKey);
fs.writeFileSync(PUB_PATH, publicKey);

const APIv3_KEY = 'lexy_test_apiv3_key_0123456789ab';   // 必须正好 32 字节
const MCH_ID = '1900000000';
const SERIAL = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';

/* 自测脚本自己也别写错长度 —— 上一版就因为这个直接崩在测试代码里，
 * 报的却是被测函数的错（"Invalid key length" 出自 Cipheriv，看着像实现有 bug）。 */
if (Buffer.byteLength(APIv3_KEY) !== 32) {
  throw new Error('测试夹具错误：APIv3 密钥必须 32 字节，当前 ' + Buffer.byteLength(APIv3_KEY));
}

Object.assign(process.env, {
  WX_APPID: 'wxtestappid1234567',
  WX_MCH_ID: MCH_ID,
  WX_MCH_SERIAL_NO: SERIAL,
  WX_PAY_KEY: APIv3_KEY,
  WX_MCH_KEY_PATH: KEY_PATH,
  WX_PAY_PUBLIC_KEY_PATH: PUB_PATH,
  WX_NOTIFY_URL: 'https://mall.lexy.cn/mall-api/api/pay/notify'
});

const require = createRequire(import.meta.url);
const wxpay = require(path.join(ROOT, 'server/lib/wxpay.js'));

/* ── 1. 配置判定 ─────────────────────────────────────────────────────── */
console.log('\n=== 1. 凭据齐备判定 ===');
assert('五项齐备 → HAS_V3 = true', wxpay.HAS_V3 === true, String(wxpay.HAS_V3));
assert('缺项清单为空', wxpay.missingPieces().length === 0, wxpay.missingPieces().join(','));

/* ── 2. 请求签名 ─────────────────────────────────────────────────────── */
console.log('\n=== 2. 请求签名（Authorization 头）===');
const auth = wxpay._internal.buildAuth('GET', '/v3/certificates');
const m = /^WECHATPAY2-SHA256-RSA2048 mchid="([^"]+)",nonce_str="([^"]+)",signature="([^"]+)",timestamp="([^"]+)",serial_no="([^"]+)"$/.exec(auth);
assert('Authorization 头格式正确（5 个字段）', !!m, auth.slice(0, 60) + '…');
if (m) {
  assert('mchid 正确', m[1] === MCH_ID);
  assert('serial_no 正确', m[5] === SERIAL);
  assert('nonce 为 32 位十六进制', /^[0-9A-F]{32}$/.test(m[2]), m[2]);
  assert('timestamp 为 10 位秒级', /^\d{10}$/.test(m[4]), m[4]);

  /* 独立重算签名串并验签 —— 用「微信会怎么验」来验自己 */
  const message = `GET\n/v3/certificates\n${m[4]}\n${m[2]}\n\n`;
  const ok = crypto.createVerify('RSA-SHA256').update(message).verify(publicKey, m[3], 'base64');
  assert('签名可被公钥验证（含末尾换行、GET 空 body）', ok);

  /* 换行位置少一个就应验不过 —— 反向确认测试本身有效 */
  const bad = crypto.createVerify('RSA-SHA256').update(`GET\n/v3/certificates\n${m[4]}\n${m[2]}\n`).verify(publicKey, m[3], 'base64');
  assert('少末尾换行则验签失败（判据有效）', bad === false);
}

/* ── 3. AES-256-GCM 解密 ─────────────────────────────────────────────── */
console.log('\n=== 3. 通知体解密（AES-256-GCM）===');
function encryptGcm(obj, key, aad = 'transaction') {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final()]);
  return {
    ciphertext: Buffer.concat([enc, c.getAuthTag()]).toString('base64'),
    nonce: iv.toString('base64'),
    associated_data: aad
  };
}
const notice = {
  out_trade_no: 'LEXY202610140000001',
  transaction_id: '4200001234202610141234567890',
  trade_state: 'SUCCESS',
  amount: { total: 1, payer_total: 1, currency: 'CNY' }
};
const decrypted = wxpay.decryptGcm(encryptGcm(notice, APIv3_KEY));
assert('解密往返一致', decrypted.out_trade_no === notice.out_trade_no && decrypted.amount.total === 1,
  JSON.stringify(decrypted));
assert('用错密钥解密必须失败（认证标签校验）', (() => {
  // 用 repeat 造 32 字节，别手数 —— 手写「32 字节」字符串极易数错
  try { wxpay.decryptGcm(encryptGcm(notice, 'z'.repeat(32))); return false; }
  catch (e) { return true; }
})());

/* ── 4. 回调验签 ─────────────────────────────────────────────────────── */
console.log('\n=== 4. 回调验签（扮演微信签名）===');
function signNotify(bodyStr, { tsOffset = 0, serial = 'PUB_KEY_ID_0112345678901234567890123456789012345678' } = {}) {
  const ts = String(Math.floor(Date.now() / 1000) + tsOffset);
  const nc = crypto.randomBytes(16).toString('hex').toUpperCase();
  const sig = crypto.createSign('RSA-SHA256')
    .update(`${ts}\n${nc}\n${bodyStr}\n`).sign(privateKey, 'base64');
  return {
    headers: {
      'wechatpay-timestamp': ts,
      'wechatpay-nonce': nc,
      'wechatpay-signature': sig,
      'wechatpay-serial': serial
    }
  };
}
const notifyBody = JSON.stringify({ id: 'evt-1', event_type: 'TRANSACTION.SUCCESS', resource: encryptGcm(notice, APIv3_KEY) });

const good = await wxpay.verifyNotify(signNotify(notifyBody).headers, notifyBody);
assert('合法通知 → 验签通过', good.ok === true, good.reason);
assert('serial 为 PUB_KEY_ID_ 形态也可验（微信支付公钥模式）', good.ok === true);

/*
 * 篡改用「末尾加一个空格」，而不是替换某个明文串 ——
 * 加密后的 ciphertext 里不可能出现明文（上一版用 replace('LEXY2026', …) 改的是密文，
 * 一个字都没变，于是用例白跑：它「通过」时说明的是我没改到东西，不是代码没防住）。
 */
const tampered = await wxpay.verifyNotify(signNotify(notifyBody).headers, notifyBody + ' ');
assert('body 被篡改一个字节 → 必须拒绝', tampered.ok === false, tampered.reason);

const old = await wxpay.verifyNotify(signNotify(notifyBody, { tsOffset: -600 }).headers, notifyBody);
assert('时间戳超 5 分钟 → 必须拒绝（防重放）', old.ok === false, old.reason);

const noHead = await wxpay.verifyNotify({}, notifyBody);
assert('缺验签头 → 必须拒绝', noHead.ok === false, noHead.reason);

const badSig = signNotify(notifyBody);
badSig.headers['wechatpay-signature'] = 'AAAA' + badSig.headers['wechatpay-signature'].slice(4);
const broken = await wxpay.verifyNotify(badSig.headers, notifyBody);
assert('签名被改坏 → 必须拒绝', broken.ok === false, broken.reason);

/* ── 5. 时间格式 ─────────────────────────────────────────────────────── */
console.log('\n=== 5. time_expire 格式（微信只认带时区的 RFC3339）===');
const rfc = wxpay.rfc3339(Date.UTC(2026, 9, 14, 8, 0, 0));  // 2026-10-14T16:00:00+08:00
assert('形如 2026-10-14T16:00:00+08:00', rfc === '2026-10-14T16:00:00+08:00', rfc);
assert('不是 Z 结尾的 UTC 写法', !rfc.endsWith('Z'), rfc);
assert('默认回调地址拼装正确', wxpay.defaultNotifyUrl() === 'https://mall.lexy.cn/mall-api/api/pay/notify',
  wxpay.defaultNotifyUrl());

/* ── 6. 回落与沙箱（子进程，避免 require 缓存）───────────────────────── */
console.log('\n=== 6. 缺凭据必须回落沙箱 / 沙箱下回调必须拒绝 ===');

/**
 * 在「指定的环境变量组合」下重新加载一个模块。
 *
 * 为什么不 spawn 子进程：Windows 上 `spawnSync(process.execPath, …)` 会
 * **EBUSY** —— 启动不了正在运行的同一个 node.exe（实测）。
 * 改用「清 require 缓存 + 改 env + 重新 require」：模块顶层的判定逻辑会重新执行，
 * 效果等价于换一套环境启动，而且在任何平台上都稳。
 *
 * 用完立即还原 env，避免污染后面的用例。
 */
const ENV_KEYS = ['WX_APPID', 'WX_MCH_ID', 'WX_MCH_SERIAL_NO', 'WX_PAY_KEY',
  'WX_MCH_KEY_PATH', 'WX_PAY_PUBLIC_KEY_PATH', 'WX_NOTIFY_URL'];

/** 一套「齐备」的环境变量，用于派生各种缺失组合 */
const baseEnv = {
  WX_APPID: 'wxtestappid1234567',
  WX_MCH_ID: MCH_ID,
  WX_MCH_SERIAL_NO: SERIAL,
  WX_PAY_KEY: APIv3_KEY,
  WX_MCH_KEY_PATH: KEY_PATH,
  WX_PAY_PUBLIC_KEY_PATH: PUB_PATH
};

function loadFresh(env, modulePath) {
  const saved = {};
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; });
  ENV_KEYS.forEach((k) => {
    if (k in env) process.env[k] = env[k];
    else delete process.env[k];
  });
  ['wxpay.js', 'wechat.js'].forEach((f) => {
    const abs = path.join(ROOT, 'server/lib', f);
    try { delete require.cache[require.resolve(abs)]; } catch (e) { /* 尚未加载 */ }
  });
  try {
    return require(modulePath);
  } finally {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  }
}

const WXP = path.join(ROOT, 'server/lib/wxpay.js');
const WEC = path.join(ROOT, 'server/lib/wechat.js');

// 6a 缺公钥 → HAS_V3 必须为 false（否则会出现「下单成功、回调验不了」的死人状态）
const wxNoPub = loadFresh({ ...baseEnv, WX_PAY_PUBLIC_KEY_PATH: '' }, WXP);
assert('缺公钥 → HAS_V3 = false', wxNoPub.HAS_V3 === false, 'HAS_V3=' + wxNoPub.HAS_V3);
assert('缺项清单指出是公钥', wxNoPub.missingPieces().join(',').includes('pub_key.pem'),
  wxNoPub.missingPieces().join(','));

// 6b 私钥文件不存在 → 也必须 false
const wxNoKey = loadFresh({ ...baseEnv, WX_MCH_KEY_PATH: path.join(dir, 'nope.pem') }, WXP);
assert('私钥文件不存在 → HAS_V3 = false', wxNoKey.HAS_V3 === false, 'HAS_V3=' + wxNoKey.HAS_V3);

// 6c APIv3 密钥长度不对 → 也必须 false（否则会到解密那一步才炸）
const wxBadKeyLen = loadFresh({ ...baseEnv, WX_PAY_KEY: 'too_short' }, WXP);
assert('APIv3 密钥长度错 → HAS_V3 = false', wxBadKeyLen.HAS_V3 === false, 'HAS_V3=' + wxBadKeyLen.HAS_V3);
assert('缺项清单写明长度问题', wxBadKeyLen.missingPieces().join(',').includes('长度应为 32'),
  wxBadKeyLen.missingPieces().join(','));

// 6d 沙箱模式：回调必须整体拒绝（旧实现放行 = 任何人可标记订单已支付）
const wechatSandbox = loadFresh(
  { WX_APPID: '', WX_MCH_ID: '', WX_MCH_SERIAL_NO: '', WX_PAY_KEY: '', WX_MCH_KEY_PATH: '', WX_PAY_PUBLIC_KEY_PATH: '' },
  WEC);
const sandboxVerdict = await wechatSandbox.verifyNotify({}, '{}');
assert('沙箱模式回调被拒绝（不是放行）', sandboxVerdict.ok === false, JSON.stringify(sandboxVerdict));
assert('且给出可读原因', /mock-success/.test(sandboxVerdict.reason), sandboxVerdict.reason);
assert('沙箱模式下 HAS_WX_PAY = false', wechatSandbox.HAS_WX_PAY === false, String(wechatSandbox.HAS_WX_PAY));

/* ── 汇总 ────────────────────────────────────────────────────────────── */
fs.rmSync(dir, { recursive: true, force: true });
console.log('\n' + '─'.repeat(60));
if (failures.length) {
  console.log(`✗ 失败 ${failures.length} 条（通过 ${pass} 条）：`);
  failures.forEach((f) => console.log('   · ' + f));
  process.exit(1);
}
console.log(`✓ 全部通过：${pass} 条`);
