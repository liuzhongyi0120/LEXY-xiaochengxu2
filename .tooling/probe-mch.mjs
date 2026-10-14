#!/usr/bin/env node
/**
 * 商户号能力探测（**只读优先**）—— 回答「这个商户号到底能干什么 / 能不能自收款」
 *
 * 用法（在本机跑即可）：
 *   node .tooling/probe-mch.mjs
 *
 * 设计要点：
 *   ① **凭据不离开服务器**：本机运行时自动 scp 到服务器，`source .env` 后执行（与
 *      .tooling/check-wxpay.mjs 同一套机制），输出里没有任何密钥值。
 *   ② 目的不是「测能不能下单」这一件事，而是**逐接口画出权限边界**：
 *      - 哪些接口 200（这个号真的有能力）
 *      - 哪些接口 403 NO_AUTH（产品权限被闸门挡着）
 *      - 哪些接口 404 / 其他（这个号根本不存在该能力）
 *      单看「下单 403」无法区分「产品没开通」与「号本身不是直连商户」，
 *      把**基础能力**（查单、账单、商户服务）与**产品能力**（各下单口）分开探，
 *      才能看出闸门开在哪一层。
 *   ③ 下单类探测**只为读错误码**；万一某个真返回 200，会立即关单，不留未支付订单。
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const HOST = process.env.LEXY_HOST || 'root@14.103.50.137';
const APP_DIR = '/opt/lexy-mall';
const REMOTE_TMP = '/tmp/lexy-probe-mch.mjs';

/* ═══════════ 本机模式：搬运到服务器执行 ═══════════ */
if (!fs.existsSync(APP_DIR + '/.env')) {
  console.log('▸ 本机模式：把探测脚本送到服务器执行（凭据不离开服务器）\n');
  execFileSync('scp', ['-q', SELF, `${HOST}:${REMOTE_TMP}`], { stdio: 'inherit' });
  try {
    execFileSync('ssh', [HOST,
      `cd ${APP_DIR} && set -a && . ./.env && set +a && node ${REMOTE_TMP}`],
      { stdio: 'inherit' });
    execFileSync('ssh', [HOST, `rm -f ${REMOTE_TMP}`], { stdio: 'ignore' });
  } catch (e) {
    try { execFileSync('ssh', [HOST, `rm -f ${REMOTE_TMP}`], { stdio: 'ignore' }); } catch (e2) { /* ignore */ }
    console.error('\n✗ 探测未跑完（退出码 ' + (e.status === undefined ? '?' : e.status) + '）');
    process.exit(e.status || 1);
  }
  process.exit(0);
}

/* ═══════════ 服务器模式 ═══════════ */
const MCH_ID = process.env.WX_MCH_ID || '';
const APPID = process.env.WX_APPID || '';
const SERIAL = process.env.WX_MCH_SERIAL_NO || '';
const KEY_PATH = process.env.WX_MCH_KEY_PATH || '';
const NOTIFY = process.env.WX_NOTIFY_URL || 'https://mall.lexy.cn/mall-api/api/pay/notify';
const BASE = 'https://api.mch.weixin.qq.com';

const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_PATH, 'utf8'));
const H = { Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Language': 'zh-CN' };
const ts = () => String(Math.floor(Date.now() / 1000));
const nc = () => crypto.randomBytes(16).toString('hex').toUpperCase();
function auth(method, urlPath, body = '') {
  const t = ts(), n = nc();
  const sig = crypto.createSign('RSA-SHA256')
    .update(`${method}\n${urlPath}\n${t}\n${n}\n${body}\n`).sign(privateKey, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${n}",signature="${sig}",timestamp="${t}",serial_no="${SERIAL}"`;
}

/* 从业务库里取一个真实 openid 与一个历史订单号（只读，不外传） */
let openid = '', histOrderNo = '';
try {
  const db = JSON.parse(fs.readFileSync(APP_DIR + '/server/data/db.json', 'utf8'));
  const u = (db.users || []).find((x) => x.openid && !String(x.openid).startsWith('mock_'));
  openid = u ? u.openid : '';
  histOrderNo = ((db.orders || [])[0] || {}).orderNo || '';
} catch (e) { /* ignore */ }

const rows = [];
async function probe(label, method, path, body, note) {
  const opts = { method, headers: { ...H, Authorization: auth(method, path, body || '') } };
  if (body) opts.body = body;
  const out = { label, method, path, note, status: 0, code: '', msg: '' };
  try {
    const r = await fetch(BASE + path, opts);
    const txt = await r.text();
    out.status = r.status;
    try { const j = JSON.parse(txt); out.code = j.code || ''; out.msg = j.message || ''; } catch (e) { out.msg = txt.slice(0, 160); }
  } catch (e) { out.msg = 'ERR ' + (e.message || e); }
  const mark = out.status === 200 ? '✓' : '✗';
  console.log(`  ${mark} [${String(out.status).padEnd(3)}] ${label}`);
  console.log(`         ${method} ${path}`);
  if (out.code || out.msg) console.log(`         → ${out.code} ${out.msg}`.trimEnd());
  if (note) console.log(`         · ${note}`);
  rows.push(out);
  return out;
}

const mkBody = (extra = {}) => JSON.stringify({
  appid: APPID, mchid: MCH_ID,
  description: '权限探测（不会支付）',
  out_trade_no: 'PROBE' + Date.now() + Math.floor(Math.random() * 1000),
  notify_url: NOTIFY,
  amount: { total: 1, currency: 'CNY' },
  ...extra
});

console.log('═══ 商户号能力探测 ═══');
console.log(`商户号：${MCH_ID.slice(0, 4)}****${MCH_ID.slice(-2)}（共 ${MCH_ID.length} 位）`);
console.log(`AppID ：${APPID}\n`);

/* ── A. 基础连通性 ───────────────────────────────────────────────────── */
console.log('【A】基础连通性（签名/商户号是否有效）');
await probe('平台证书列表', 'GET', '/v3/certificates', null,
  '404 = 新版商户无平台证书（须用微信支付公钥验签）');
await probe('商户服务·投诉列表', 'GET',
  '/v3/merchant-service/complaints-v2?begin_date=2026-10-01&end_date=2026-10-14&limit=1', null,
  '200 = 签名被认可 + 商户号存在');

/* ── B. 账单与资金（基础能力，通常不需要产品权限）──────────────────── */
console.log('\n【B】账单（判断有无交易历史 / 基础权限）');
await probe('交易账单', 'GET', '/v3/bill/tradebill?bill_date=2026-10-12&bill_type=ALL', null,
  '200 = 有账单能力；NO_STATEMENT_EXIST = 当天无交易');
await probe('资金账单', 'GET', '/v3/bill/fundflowbill?bill_date=2026-10-12', null,
  '200 = 有资金流水能力');

/* ── C. 产品权限矩阵（下单类，只为读错误码）────────────────────────── */
console.log('\n【C】产品权限矩阵（下单口，只看错误码）');
const created = [];
for (const [name, path, extra, note] of [
  ['JSAPI 下单', '/v3/pay/transactions/jsapi', openid ? { payer: { openid } } : null, '小程序/公众号支付'],
  ['Native 下单', '/v3/pay/transactions/native', {}, '扫码支付'],
  ['H5 下单', '/v3/pay/transactions/h5',
    { scene_info: { payer_client_ip: '1.2.3.4', h5_info: { type: 'Wap' } } }, '手机浏览器支付'],
  ['APP 下单', '/v3/pay/transactions/app', {}, 'APP 支付']
]) {
  if (extra === null) { console.log(`  - [skip] ${name}（库里没有真实 openid，无法构造 JSAPI 请求）`); continue; }
  const body = mkBody(extra);
  const r = await probe(name, 'POST', path, body);
  if (r.status === 200) {
    try { created.push(JSON.parse(body).out_trade_no); } catch (e) { /* ignore */ }
  }
}

/* ── D. 订单查询（基础能力，普通商户应可用）────────────────────────── */
console.log('\n【D】订单查询能力（基础能力，通常不需产品权限）');
if (histOrderNo) {
  await probe('查历史订单', 'GET',
    `/v3/pay/transactions/out-trade-no/${histOrderNo}?mchid=${MCH_ID}`, null,
    `本店历史订单号（${histOrderNo.slice(0, 6)}…）：ORDER_NOT_EXIST 说明能查、只是微信侧无此单`);
} else {
  console.log('  - [skip] 库里没有历史订单号');
}
await probe('查不存在的订单', 'GET',
  `/v3/pay/transactions/out-trade-no/LEXYPROBE_NOT_EXIST?mchid=${MCH_ID}`, null,
  'ORDER_NOT_EXIST = 有查单能力（只是单不存在）');

/* ── E. 服务商身份反证 ───────────────────────────────────────────────── */
console.log('\n【E】服务商模式反证（判断这个号是不是「服务商号」）');
if (openid) {
  await probe('服务商 JSAPI 下单', 'POST', '/v3/pay/partner/transactions/jsapi', JSON.stringify({
    sp_appid: APPID, sp_mchid: MCH_ID,
    sub_mchid: MCH_ID,
    description: '服务商身份探测', out_trade_no: 'PROBEPS' + Date.now(),
    notify_url: NOTIFY, amount: { total: 1, currency: 'CNY' },
    payer: { sub_openid: openid }
  }), '⚠️ 判别力有限：微信先做参数校验再校验身份，所以「没报服务商不存在」不构成「它是服务商」的证据。');
}

/* ── F. 退款能力 ─────────────────────────────────────────────────────── */
console.log('\n【F】退款能力');
await probe('查退款', 'GET',
  `/v3/refund/domestic/refunds/LEXYPROBE_NOT_EXIST?mchid=${MCH_ID}`, null,
  'RESOURCE_NOT_EXISTS = 有退款能力；NO_AUTH = 无');

/* ── 收尾：关掉任何意外创建成功的测试单 ─────────────────────────────── */
if (created.length) {
  console.log('\n【收尾】关闭测试单');
  for (const no of created) {
    const p = `/v3/pay/transactions/out-trade-no/${no}/close`;
    const cb = JSON.stringify({ mchid: MCH_ID });
    try {
      const r = await fetch(BASE + p, { method: 'POST', headers: { ...H, Authorization: auth('POST', p, cb) }, body: cb });
      console.log(`  · ${no} → HTTP ${r.status}`);
    } catch (e) { console.log(`  · ${no} → ERR ${e.message}`); }
  }
}

/* ── 汇总 ────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(60));
console.log('【汇总】按能力分层');
const layerOf = (r) => {
  if (/^\/v3\/pay\/transactions\//.test(r.path) && !r.path.includes('out-trade-no')) return '产品能力·下单';
  if (/^\/(v3\/bill|v3\/refund)/.test(r.path)) return '资金能力·账单退款';
  if (r.path.includes('out-trade-no')) return '基础能力·查单';
  if (r.path.includes('/partner/')) return '身份反证·服务商';
  return '基础能力·连通';
};
const groups = {};
rows.forEach((r) => { (groups[layerOf(r)] ||= []).push(r); });
for (const [g, list] of Object.entries(groups)) {
  console.log(`\n  ${g}`);
  list.forEach((r) => {
    const verdict = r.status === 200 ? '可用'
      : /NO_AUTH|权限未开通/.test(r.code + r.msg) ? '被产品权限闸门挡住'
      : /ORDER_NOT_EXIST|NOT_EXIST|NO_STATEMENT/.test(r.code) ? '可用（仅对象不存在）'
      : '不可用';
    console.log(`    · ${r.label.padEnd(16)} HTTP ${String(r.status).padEnd(4)} ${(r.code || '').padEnd(24)} ${verdict}`);
  });
}
console.log('\n' + '─'.repeat(60));
console.log('判读要点：');
console.log('  · C 组**全部** NO_AUTH  → 产品权限整体未开通（不是「只差某一个产品」）');
console.log('  · D 组也 NO_AUTH        → 连基础支付能力都没有（直连商户不该如此）');
console.log('  · D 组 200/ORDER_NOT_EXIST → 有基础能力，闸门只卡在产品层');
