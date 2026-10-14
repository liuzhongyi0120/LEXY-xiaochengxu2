#!/usr/bin/env node
/**
 * 微信支付线上体检（**只读**，可随时复跑）
 *
 * 用法（在本机跑即可）：
 *   node .tooling/check-wxpay.mjs            # 配置 + 签名 + 产品权限探活
 *   node .tooling/check-wxpay.mjs --order    # 额外做一次 1 分钱真实下单（会自动关单）
 *
 * 设计要点：
 *   ① **凭据不离开服务器**。脚本在本机运行时，会把自己 scp 到服务器，
 *      在服务器上 `source .env` 后执行 —— 输出里只有结论，没有任何密钥值。
 *      （本仓库是公开仓库，把密钥拉到本机再打印是绝不能做的事。）
 *   ② 只读优先：默认只打 GET，不产生任何交易。`--order` 才会下单，且收尾主动关单。
 *   ③ 这条链路只有**微信能回答**：签名对不对、商户号有效吗、产品权限开了吗。
 *      本机自测（.tooling/test-wxpay.mjs）只能证明「算得对」，证明不了「微信认」。
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const HOST = process.env.LEXY_HOST || 'root@14.103.50.137';
const APP_DIR = '/opt/lexy-mall';
const REMOTE_TMP = '/tmp/lexy-check-wxpay.mjs';
const WANT_ORDER = process.argv.includes('--order');

/* ═══════════ 本机模式：搬运到服务器执行 ═══════════ */
if (!fs.existsSync(APP_DIR + '/.env')) {
  console.log('▸ 本机模式：把体检脚本送到服务器执行（凭据不离开服务器）\n');
  execFileSync('scp', ['-q', SELF, `${HOST}:${REMOTE_TMP}`], { stdio: 'inherit' });
  try {
    execFileSync('ssh', [HOST,
      `cd ${APP_DIR} && set -a && . ./.env && set +a && node ${REMOTE_TMP}${WANT_ORDER ? ' --order' : ''}`],
      { stdio: 'inherit' });
    execFileSync('ssh', [HOST, `rm -f ${REMOTE_TMP}`], { stdio: 'ignore' });
  } catch (e) {
    try { execFileSync('ssh', [HOST, `rm -f ${REMOTE_TMP}`], { stdio: 'ignore' }); } catch (e2) { /* ignore */ }
    console.error('\n✗ 远程体检未通过（退出码 ' + (e.status === undefined ? '?' : e.status) + '）');
    process.exit(e.status || 1);
  }
  process.exit(0);
}

/* ═══════════ 服务器模式：真实检查 ═══════════ */

const MCH_ID = process.env.WX_MCH_ID || '';
const APPID = process.env.WX_APPID || '';
const APIv3_KEY = process.env.WX_PAY_KEY || '';
const SERIAL = process.env.WX_MCH_SERIAL_NO || '';
const KEY_PATH = process.env.WX_MCH_KEY_PATH || '';
const PUB_PATH = process.env.WX_PAY_PUBLIC_KEY_PATH || '';
const NOTIFY_URL = process.env.WX_NOTIFY_URL || '';

let fails = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { fails++; console.log('  ✗ ' + m); };
const info = (m) => console.log('    ' + m);

console.log('═══ 微信支付线上体检 ═══\n');

/* ── 1. 配置齐备性（只看有没有，不打印值）────────────────────────────── */
console.log('【1】配置齐备性');
const items = [
  ['WX_APPID', APPID, '小程序 AppID（须与商户号绑定）'],
  ['WX_MCH_ID', MCH_ID, '商户号'],
  ['WX_MCH_SERIAL_NO', SERIAL, '商户 API 证书序列号'],
  ['WX_PAY_KEY', APIv3_KEY, `APIv3 密钥（须 32 字节，当前 ${Buffer.byteLength(APIv3_KEY)}）`],
  ['WX_MCH_KEY_PATH', KEY_PATH, '商户私钥 apiclient_key.pem'],
  ['WX_PAY_PUBLIC_KEY_PATH', PUB_PATH, '微信支付公钥 pub_key.pem（新版商户验签必需）']
];
items.forEach(([name, val, note]) => {
  (val ? ok : bad)(`${name}${val ? ' 已配置' : ' 未配置'} —— ${note}`);
});
info('序列号指纹：' + (SERIAL ? SERIAL.slice(0, 8) + '…' : '(空)'));
info('商户号是否 10 位数字：' + (/^\d{10}$/.test(MCH_ID) ? '是' : '否（' + MCH_ID.length + ' 位）'));
if (KEY_PATH) info('私钥文件：' + (fs.existsSync(KEY_PATH) ? '存在' : '不存在 ✗'));

let privateKey = null;
try {
  privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_PATH, 'utf8'));
  ok('私钥可解析为 RSA 私钥');
} catch (e) {
  bad('私钥无法解析：' + (e.message || e));
}

const ready = !!(MCH_ID && SERIAL && Buffer.byteLength(APIv3_KEY) === 32 && privateKey && PUB_PATH && fs.existsSync(PUB_PATH));
console.log('  → 真实支付' + (ready ? '已具备启用条件 ✓' : '**未启用**（将走沙箱；缺少的项见上）'));

if (!ready) {
  console.log('\n提示：把缺口补齐后重启服务即可 —— systemctl restart lexy-mall');
  console.log('      （启动日志会明确列出缺哪一项，见 /var/log/lexy-mall.log）');
}

/* ── 2. 服务侧状态 ───────────────────────────────────────────────────── */
console.log('\n【2】服务侧状态');
let health = null;
try {
  const out = execFileSync('curl', ['-sS', '-m', '10', 'http://127.0.0.1:3000/api/health'], { encoding: 'utf8' });
  health = JSON.parse(out).data;
  ok(`服务在跑，点位 ${health.routes} 个`);
  info('health.wechat = ' + JSON.stringify(health.wechat));
  if (health.wechat.pay === 'real' && !ready) bad('health 说 pay=real 但凭据不齐 —— 状态不一致，需排查');
} catch (e) {
  bad('取 /api/health 失败：' + (e.message || e));
}

/* ── 3. 微信侧只读探活 ───────────────────────────────────────────────── */
/* 签名助手提到模块级：第 3、4 节都要用（原来写在 else 块里，第 4 节取不到 —— 
 * 报错是 `ts is not defined`，看着像语法问题，其实是作用域）。 */
const ts = () => String(Math.floor(Date.now() / 1000));
const nc = () => crypto.randomBytes(16).toString('hex').toUpperCase();
const H = { Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Language': 'zh-CN' };
/** 生成 Authorization 头（签名串：方法\nURL\n时间戳\n随机串\n请求体\n） */
function auth(method, urlPath, body = '') {
  const t = ts();
  const n = nc();
  const sig = crypto.createSign('RSA-SHA256')
    .update(`${method}\n${urlPath}\n${t}\n${n}\n${body}\n`).sign(privateKey, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${n}",signature="${sig}",timestamp="${t}",serial_no="${SERIAL}"`;
}

console.log('\n【3】微信侧探活（只读接口，无副作用）');
if (!MCH_ID || !privateKey) {
  bad('缺少商户号或私钥，无法探活');
} else {
  try {
    const p = '/v3/merchant-service/complaints-v2?begin_date=2026-10-01&end_date=2026-10-14&limit=1';
    const r = await fetch('https://api.mch.weixin.qq.com' + p, { headers: { ...H, Authorization: auth('GET', p) } });
    if (r.status === 200) ok('签名被微信认可 + 商户号有效（HTTP 200）');
    else bad(`微信返回 HTTP ${r.status}：${(await r.text()).slice(0, 160)}`);
  } catch (e) {
    bad('请求微信失败：' + (e.message || e));
  }

  try {
    const r = await fetch('https://api.mch.weixin.qq.com/v3/certificates', { headers: { ...H, Authorization: auth('GET', '/v3/certificates') } });
    const txt = await r.text();
    if (r.status === 200) ok('可拉平台证书 → 用平台证书验签（老商户路线）');
    else if (r.status === 404) ok('无平台证书 → 必须用「微信支付公钥」验签（新版商户，符合预期）');
    else bad(`GET /v3/certificates → HTTP ${r.status}：${txt.slice(0, 160)}`);
  } catch (e) {
    bad('请求微信失败：' + (e.message || e));
  }
}

/* ── 4. 可选：真实下单（1 分钱，随后关单）────────────────────────────── */
if (WANT_ORDER) {
  console.log('\n【4】真实下单（1 分钱，不支付，随后关单）');
  let openid = '';
  try {
    const db = JSON.parse(fs.readFileSync(APP_DIR + '/server/data/db.json', 'utf8'));
    const u = (db.users || []).find((x) => x.openid && !String(x.openid).startsWith('mock_'));
    openid = u ? u.openid : '';
  } catch (e) { /* ignore */ }
  if (!openid) bad('库里没有真实 openid，无法下单（可先真机登录一次）');
  else {
    info('使用库内真实用户 openid（长度 ' + openid.length + '）');
    const outTradeNo = 'CHECK' + Date.now();
    const P_ORDER = '/v3/pay/transactions/jsapi';
    const body = JSON.stringify({
      appid: APPID, mchid: MCH_ID, description: '体检（不会支付）', out_trade_no: outTradeNo,
      notify_url: NOTIFY_URL || 'https://mall.lexy.cn/mall-api/api/pay/notify',
      amount: { total: 1, currency: 'CNY' }, payer: { openid }
    });
    const r = await fetch('https://api.mch.weixin.qq.com' + P_ORDER, {
      method: 'POST',
      headers: { ...H, Authorization: auth('POST', P_ORDER, body) },
      body
    });
    const txt = await r.text();
    if (r.status === 200) {
      ok('下单成功（appid 与商户号已绑定、参数与签名均被认可）');
      // 关单，不留未支付订单
      const P_CLOSE = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`;
      const cb = JSON.stringify({ mchid: MCH_ID });
      const rc = await fetch('https://api.mch.weixin.qq.com' + P_CLOSE, {
        method: 'POST',
        headers: { ...H, Authorization: auth('POST', P_CLOSE, cb) },
        body: cb
      });
      ok('测试单已关闭（HTTP ' + rc.status + '）');
    } else {
      let code = '', msg = '';
      try { const j = JSON.parse(txt); code = j.code; msg = j.message; } catch (e) { msg = txt.slice(0, 200); }
      bad(`下单失败 HTTP ${r.status} ${code}：${msg}`);
      if (/产品权限未开通|NO_AUTH/.test(code + msg)) {
        info('→ 去商户平台「产品中心」开通「JSAPI 支付」（需先绑定 AppID）');
        info('   ⚠️ 若该平台**根本没有「产品中心」**（顶部导航只有「账户中心 / 数据中心」）→');
        info('      这是「开不了产品权限」的号（多为服务商模式的特约/子商户、或平台协助入驻的号），');
        info('      去「产品中心」这个提示指向一个进不去的入口。先跑 `node .tooling/probe-mch.mjs`');
        info('      看能力分层；处置见 deploy/微信支付接入清单.md 第零节（出路=另开「普通商户」号）。');
      } else if (/APPID_MCHID_NOT_MATCH|appid/i.test(code + msg)) {
        info('→ 商户平台「产品中心 → AppID账号管理」绑定 ' + APPID + '，并到小程序后台确认（双向）');
      }
    }
  }
}

/* ── 5. 公钥验签实测 ─────────────────────────────────────────────────── */
/* 这一节回答一个关键问题：**这把公钥到底能不能验通微信的签名**。
 * 公钥只用于「验签微信的应答/回调」，与产品权限**无关** → 所以 JSAPI 权限还没开通时
 * 也能把这条链路完整验完（等待审核期间唯一能提前验完的一环）。
 * 做法：发一次只读请求，把**微信应答的原始头 + 原始体**拿来做一次完整验签，并加一条
 * 「篡改原始体必须验签失败」的反面对照 —— 否则「验签通过」可能只是验签器根本没在比对。 */
console.log('\n【5】公钥验签实测');
const pubPath = PUB_PATH || (fs.existsSync(APP_DIR + '/cert/pub_key.pem') ? APP_DIR + '/cert/pub_key.pem' : '');
let pubKeyPem = '';
if (!pubPath) {
  bad('找不到公钥文件（WX_PAY_PUBLIC_KEY_PATH 未配，且 ' + APP_DIR + '/cert/pub_key.pem 不存在）');
} else {
  try {
    pubKeyPem = fs.readFileSync(pubPath, 'utf8');
    if (!/-----BEGIN PUBLIC KEY-----/.test(pubKeyPem)) throw new Error('不是 PEM 公钥（缺少 BEGIN PUBLIC KEY 头）');
    const pk = crypto.createPublicKey(pubKeyPem);
    const bits = (pk.asymmetricKeyDetails && pk.asymmetricKeyDetails.modulusLength) || 0;
    ok(`公钥可解析 —— ${pubPath}${bits ? '（' + bits + ' bit）' : ''}`);
  } catch (e) {
    pubKeyPem = '';
    bad('公钥无法解析：' + (e.message || e));
  }
}

if (pubKeyPem && MCH_ID && privateKey) {
  try {
    const p5 = '/v3/merchant-service/complaints-v2?begin_date=2026-10-01&end_date=2026-10-14&limit=1';
    const r5 = await fetch('https://api.mch.weixin.qq.com' + p5, { headers: { ...H, Authorization: auth('GET', p5) } });
    const raw5 = await r5.text();
    const serial5 = r5.headers.get('wechatpay-serial') || '';
    const t5 = r5.headers.get('wechatpay-timestamp') || '';
    const n5 = r5.headers.get('wechatpay-nonce') || '';
    const sig5 = r5.headers.get('wechatpay-signature') || '';
    if (!sig5) {
      bad('微信应答没带 Wechatpay-Signature，无法验签（HTTP ' + r5.status + '）');
    } else {
      info('微信应答头 Wechatpay-Serial = ' + serial5);
      if (/^PUB_KEY_ID_/.test(serial5)) info('形态：微信支付**公钥**模式（与新版商户一致 ✓）');
      else if (/^[0-9A-Fa-f]{32}$/.test(serial5)) info('形态：32 位十六进制 → **平台证书**模式（老商户路线）');
      else info('形态：未知 —— 需人工确认');
      const msg5 = `${t5}\n${n5}\n${raw5}\n`;
      const pass = crypto.createVerify('RSA-SHA256').update(msg5).verify(pubKeyPem, sig5, 'base64');
      if (pass) ok('★ 用这把公钥验签微信应答 → **验签通过**（公钥真实有效 + 验签代码正确）');
      else bad('验签不通过（公钥与微信当前签名不匹配 —— 确认下载的是本商户号的公钥）');
      const tampered = crypto.createVerify('RSA-SHA256').update(`${t5}\n${n5}\n${raw5} \n`).verify(pubKeyPem, sig5, 'base64');
      if (!tampered) ok('反面对照：篡改原始体后验签失败（证明验签器真的在比对，不是恒真）');
      else bad('反面对照失败：篡改后仍通过 → 验签实现有问题');
    }
  } catch (e) {
    bad('发起验签实测失败：' + (e.message || e));
  }
}

/* ── 汇总 ────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(56));
if (fails) {
  console.log(`✗ 有 ${fails} 项未通过 —— 见上面的 ✗ 行`);
  process.exit(1);
}
console.log('✓ 体检通过');
