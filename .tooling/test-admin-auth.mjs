/**
 * 管理端鉴权回归测试（对应《小程序商城非交易功能整改报告》08）
 *
 * 报告 08 的验收原文：
 *   「未登录直接调用商品保存、删除素材和装修发布均被拒绝；普通小程序用户 token
 *     不能代替管理员；只读管理员不能执行写操作。**不要仅隐藏按钮或关闭页面。**」
 *
 * 为什么要单独一个入口：
 *   `check-all.mjs` 是「全量点位连通性」，跑在真实数据文件上；本文件要反复验证
 *   「被拒绝 / 被放行」这类**破坏性**结论，所以：
 *     · 自己拉一个临时端口的服务实例（不与 3000 抢端口）；
 *     · `MALL_DATA_DIR` / `MALL_REPLICA_FILE` 全部指向临时目录，
 *       即使某个请求真的写进去了，也写不到 server/data 与 replica.js；
 *     · 不依赖任何人工先在浏览器里登录 —— 所有凭证都在本文件里现造。
 *
 * 运行：node .tooling/test-admin-auth.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import nodePath from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = nodePath.join(ROOT, 'server', 'index.js');

/* ------------------------------------------------------------------ *
 * 隔离环境
 * ------------------------------------------------------------------ */

const TMP = nodePath.join(os.tmpdir(), 'mall-adminauth-' + process.pid);
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const REAL_DATA = nodePath.join(ROOT, 'server', 'data');
const REAL_REPLICA = nodePath.join(ROOT, 'miniprogram', 'config', 'replica.js');
const snapshot = () => JSON.stringify({
  data: fs.existsSync(REAL_DATA) ? fs.readdirSync(REAL_DATA).sort() : null,
  replica: fs.existsSync(REAL_REPLICA)
    ? [fs.statSync(REAL_REPLICA).size, Math.round(fs.statSync(REAL_REPLICA).mtimeMs)].join(':')
    : null
});
const before = snapshot();

/* ------------------------------------------------------------------ *
 * 断言
 * ------------------------------------------------------------------ */

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); } else {
    fail++;
    fails.push(name);
    console.log('  ✗ ' + name + (detail ? '  —— ' + detail : ''));
  }
}
function section(t) { console.log('\n' + t); }

/* ------------------------------------------------------------------ *
 * 起一个隔离的服务实例
 * ------------------------------------------------------------------ */

const PASSWORD = 'test-admin-pw-2026';
const TOKENS = {
  viewer: 'tok_viewer_000000000001',
  operator: 'tok_operator_000000002',
  owner: 'tok_owner_0000000003'
};
const ADMIN_TOKENS_ENV = JSON.stringify({
  [TOKENS.viewer]: { role: 'viewer', name: '只读账号' },
  [TOKENS.operator]: { role: 'operator', name: '运营账号' },
  [TOKENS.owner]: { role: 'owner', name: '超管账号' }
});

function startServer(port, extraEnv) {
  const env = Object.assign({}, process.env, {
    PORT: String(port),
    MALL_DATA_DIR: nodePath.join(TMP, 'data-' + port),
    MALL_REPLICA_FILE: nodePath.join(TMP, 'replica-' + port + '.js'),
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_TOKENS: ADMIN_TOKENS_ENV,
    DEBUG_PAGE: '1',
    NODE_ENV: 'development'
  }, extraEnv || {});
  // 开发机可能真的配过微信参数，这里强制回到 mock 登录，避免测试依赖外网
  delete env.WX_APPID;
  delete env.WX_SECRET;
  const proc = spawn(process.execPath, [SERVER], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  return { proc, getLog: () => log, stop: () => { try { proc.kill(); } catch (e) { /* ignore */ } } };
}

async function waitHealth(port, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 12000);
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        const j = await r.json();
        // ⚠️ /api/health 也走统一响应壳：真正的内容在 data 里
        if (j && j.code === 0) return j.data;
      }
    } catch (e) { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/** 发一次请求，返回 { status, json } */
async function req(port, method, path, opt) {
  opt = opt || {};
  const headers = {};
  if (opt.token) headers['Authorization'] = 'Bearer ' + opt.token;
  const init = { method, headers };
  if (opt.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opt.body);
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON（如静态页 403 也会是 JSON） */ }
  return { status: res.status, json, text };
}

const code = (r) => (r.json ? r.json.code : null);
const msg = (r) => (r.json ? String(r.json.msg || '') : r.text.slice(0, 80));

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const PORT = 3311;
const PORT_OFF = 3312;
const srv = startServer(PORT);
const srvOff = startServer(PORT_OFF, { ADMIN_PAGE: 'off' });

try {
  const health = await waitHealth(PORT);
  if (!health) {
    console.error('服务未能启动，日志：\n' + srv.getLog());
    process.exit(1);
  }

  /* ============================ 1. health 自述 ============================ */
  section('1. /api/health 是否如实自述管理端状态');
  ok('adminPage 开启时 health.adminPage = on', health.adminPage === 'on', '实际 ' + health.adminPage);
  ok('已配置管理员凭证', health.adminAuth && health.adminAuth.credentials === 'on', JSON.stringify(health.adminAuth));
  ok('长期令牌条数与配置一致（3 条）', health.adminAuth && health.adminAuth.tokens === 3,
    '实际 ' + (health.adminAuth && health.adminAuth.tokens));
  ok('存在可写凭证', health.adminAuth && health.adminAuth.writable === 'yes');
  ok('口令不是开发默认值（应为 custom）', health.adminAuth && health.adminAuth.password === 'custom',
    '实际 ' + (health.adminAuth && health.adminAuth.password));

  /* ============================ 2. 匿名一律拒绝 ============================ */
  section('2. 匿名调用（未登录）—— 逐条对应报告 08 的三类高危操作');

  let r = await req(PORT, 'GET', '/api/admin/goods/list');
  ok('匿名读管理列表 → 401 / code 401', code(r) === 401 && r.status === 401, `HTTP ${r.status} code ${code(r)}`);

  r = await req(PORT, 'POST', '/api/admin/goods/save', { body: { name: '测试商品' } });
  ok('匿名保存商品 → 401（不是先落到业务校验）', code(r) === 401 && r.status === 401, `HTTP ${r.status} code ${code(r)}`);

  r = await req(PORT, 'POST', '/api/admin/settings/save', { body: { shopName: '被篡改' } });
  ok('匿名改店铺设置 → 401', code(r) === 401, `code ${code(r)}`);

  r = await req(PORT, 'POST', '/api/media/delete', { body: { name: 'x.png', force: 1 } });
  ok('匿名删除素材 → 401', code(r) === 401, `code ${code(r)}`);

  r = await req(PORT, 'POST', '/api/media/upload');
  ok('匿名上传素材 → 401', code(r) === 401, `code ${code(r)}`);

  r = await req(PORT, 'POST', '/api/decorate/publish', { body: { key: 'home' } });
  ok('匿名发布装修 → 401', code(r) === 401, `code ${code(r)}`);

  r = await req(PORT, 'POST', '/api/decorate/page/delete', { body: { key: 'home' } });
  ok('匿名删除页面 → 401', code(r) === 401, `code ${code(r)}`);

  /* ============================ 3. 用户令牌 ≠ 管理员令牌 ============================ */
  section('3. 普通小程序用户 token 不能代替管理员');

  const login = await req(PORT, 'POST', '/api/auth/login', { body: { code: 'adminauth-test-code' } });
  ok('小程序登录成功并拿到用户令牌', code(login) === 0 && !!(login.json.data || {}).token,
    JSON.stringify(login.json && login.json.msg));
  const userToken = (login.json.data || {}).token || '';

  // 先证明这个用户令牌在用户链路里是有效的（否则下一条「被拒」可能只是因为令牌本来就不认）
  const mine = await req(PORT, 'GET', '/api/user/profile', { token: userToken });
  ok('该用户令牌在用户链路可用（GET /api/user/profile code 0）', code(mine) === 0, `code ${code(mine)}`);

  r = await req(PORT, 'GET', '/api/admin/goods/list', { token: userToken });
  ok('用户令牌读管理列表 → 401', code(r) === 401, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/settings/save', { token: userToken, body: { shopName: 'x' } });
  ok('用户令牌改店铺设置 → 401', code(r) === 401, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/decorate/publish', { token: userToken, body: { key: 'home' } });
  ok('用户令牌发布装修 → 401', code(r) === 401, `code ${code(r)}`);
  r = await req(PORT, 'GET', '/api/admin/session', { token: userToken });
  ok('用户令牌查管理员会话 → 401', code(r) === 401, `code ${code(r)}`);

  /* ============================ 4. 只读（viewer） ============================ */
  section('4. 只读管理员（viewer）：能看，不能写');

  r = await req(PORT, 'GET', '/api/admin/goods/list', { token: TOKENS.viewer });
  ok('viewer 读商品列表 → 放行（code 0）', code(r) === 0, `code ${code(r)} ${msg(r)}`);

  r = await req(PORT, 'GET', '/api/admin/dashboard', { token: TOKENS.viewer });
  ok('viewer 读数据概览 → 放行', code(r) === 0, `code ${code(r)}`);

  r = await req(PORT, 'GET', '/api/admin/session', { token: TOKENS.viewer });
  ok('viewer 查会话 → 回显 role=viewer', code(r) === 0 && (r.json.data || {}).role === 'viewer',
    JSON.stringify(r.json && r.json.data));

  r = await req(PORT, 'POST', '/api/admin/goods/save', { token: TOKENS.viewer, body: { name: '不该被保存' } });
  ok('viewer 保存商品 → 403', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/goods/status', { token: TOKENS.viewer, body: { id: 'x', status: 'off_sale' } });
  ok('viewer 上下架 → 403', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/media/folder', { token: TOKENS.viewer, body: { op: 'create', name: 'x' } });
  ok('viewer 建素材夹 → 403', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/decorate/draft/save', { token: TOKENS.viewer, body: { key: 'home' } });
  ok('viewer 存装修草稿 → 403', code(r) === 403, `code ${code(r)}`);

  /* ============================ 5. 运营（operator） ============================ */
  section('5. 运营管理员（operator）：日常能改，高危仍被拒');

  // 用「空 body 的商品保存」证明角色门放行了 —— 返回的应当是业务校验错误（PARAM），而不是 401/403
  r = await req(PORT, 'POST', '/api/admin/goods/save', { token: TOKENS.operator, body: {} });
  ok('operator 保存商品 → 通过角色门（业务码非 401/403）',
    code(r) !== 401 && code(r) !== 403, `code ${code(r)} ${msg(r)}`);

  r = await req(PORT, 'POST', '/api/admin/category/save', { token: TOKENS.operator, body: {} });
  ok('operator 保存分类 → 通过角色门', code(r) !== 401 && code(r) !== 403, `code ${code(r)} ${msg(r)}`);

  r = await req(PORT, 'POST', '/api/admin/settings/save', { token: TOKENS.operator, body: { shopName: 'x' } });
  ok('operator 改店铺设置 → 403（需 owner）', code(r) === 403, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/goods/delete', { token: TOKENS.operator, body: { id: 'g1' } });
  ok('operator 删商品 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/category/delete', { token: TOKENS.operator, body: { id: 'c1' } });
  ok('operator 删分类 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/media/delete', { token: TOKENS.operator, body: { name: 'x.png', force: 1 } });
  ok('operator 删素材 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/media/move', { token: TOKENS.operator, body: { names: [], folder: '' } });
  ok('operator 移动素材 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/decorate/publish', { token: TOKENS.operator, body: { key: 'home' } });
  ok('operator 发布装修 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/decorate/rollback', { token: TOKENS.operator, body: { key: 'home' } });
  ok('operator 回滚版本 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/decorate/page/create', { token: TOKENS.operator, body: { name: 'x' } });
  ok('operator 新建页面 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);

  /* ============================ 6. 超管（owner） ============================ */
  section('6. 超级管理员（owner）：高危操作通过角色门');

  r = await req(PORT, 'POST', '/api/decorate/publish', { token: TOKENS.owner, body: { key: 'home' } });
  ok('owner 发布装修 → 通过角色门（业务码非 401/403）',
    code(r) !== 401 && code(r) !== 403, `code ${code(r)} ${msg(r)}`);

  // 用 notice 而不是 shopName：店铺名称 / Logo 的唯一数据源是装修台的「店铺信息」
  // （报告 10），传 shopName 会拿到 1001，那是数据源约束、不是角色门 —— 混在一起会把
  // 「owner 到底有没有权限」这个断言测糊。这里只要证明「角色门放行、落到正常业务处理」。
  r = await req(PORT, 'POST', '/api/admin/settings/save', { token: TOKENS.owner, body: { notice: '鉴权自检' } });
  ok('owner 改店铺设置 → 成功', code(r) === 0, `code ${code(r)} ${msg(r)}`);

  // 顺带锁住报告 10 的行为：owner 也改不了店铺名称（真源在 replica.SHOP）
  r = await req(PORT, 'POST', '/api/admin/settings/save', { token: TOKENS.owner, body: { shopName: '莱克测试店铺' } });
  ok('owner 改店铺名称 → 被数据源约束拒绝（1001，即使角色最高）', code(r) === 1001, `code ${code(r)} ${msg(r)}`);

  /* ============================ 7. 令牌来源与识别 ============================ */
  section('7. 令牌识别：长期令牌 / 口令会话 / 伪造令牌');

  r = await req(PORT, 'GET', '/api/admin/session', { token: TOKENS.owner });
  ok('长期令牌 → source=env 且角色正确',
    code(r) === 0 && (r.json.data || {}).source === 'env' && (r.json.data || {}).role === 'owner',
    JSON.stringify(r.json && r.json.data));

  r = await req(PORT, 'GET', '/api/admin/session', { token: 'tok_totally_fake_token_xx' });
  ok('伪造令牌 → 401', code(r) === 401, `code ${code(r)}`);

  r = await req(PORT, 'GET', '/api/admin/session', { token: 'tok_viewer_00000000000' });
  ok('只差一位的令牌 → 401（不是前缀匹配）', code(r) === 401, `code ${code(r)}`);

  let blank = await req(PORT, 'GET', '/api/admin/goods/list', { token: '   ' });
  ok('空白 Authorization → 401', code(blank) === 401, `code ${code(blank)}`);

  const bad = await req(PORT, 'POST', '/api/admin/login', { body: { password: 'wrong-password' } });
  ok('错口令登录 → 403', code(bad) === 403, `code ${code(bad)}`);

  const good = await req(PORT, 'POST', '/api/admin/login', { body: { password: PASSWORD } });
  ok('对口令登录 → 拿到会话令牌', code(good) === 0 && !!(good.json.data || {}).token,
    JSON.stringify(good.json && good.json.msg));
  const sessionToken = (good.json.data || {}).token || '';

  r = await req(PORT, 'GET', '/api/admin/session', { token: sessionToken });
  ok('口令会话令牌 → source=session、角色 owner',
    code(r) === 0 && (r.json.data || {}).source === 'session' && (r.json.data || {}).role === 'owner',
    JSON.stringify(r.json && r.json.data));

  r = await req(PORT, 'POST', '/api/admin/settings/save', { token: sessionToken, body: { notice: '口令会话自检' } });
  ok('口令会话令牌可执行 owner 操作', code(r) === 0, `code ${code(r)} ${msg(r)}`);

  r = await req(PORT, 'GET', '/api/admin/goods/list', { token: 'Bearer ' + TOKENS.viewer });
  ok('Authorization 里多带 "Bearer " 前缀 → 401（前端只该带一次）', code(r) === 401, `code ${code(r)}`);

  /* ============================ 8. 爆破退避 ============================ */
  section('8. 口令爆破退避（5 次 / 60 秒）');

  let lastCode = 0;
  let lastMsg = '';
  for (let i = 0; i < 5; i++) {
    const rr = await req(PORT, 'POST', '/api/admin/login', { body: { password: 'wrong-' + i } });
    lastCode = code(rr); lastMsg = msg(rr);
  }
  ok('连续错口令后被限流（403 或 429）', lastCode === 403 || lastCode === 429, `code ${lastCode} ${lastMsg}`);
  const limited = await req(PORT, 'POST', '/api/admin/login', { body: { password: PASSWORD } });
  ok('限流期间即使口令正确也被挡住（避免「边猜边试」）',
    code(limited) !== 0, `code ${code(limited)} ${msg(limited)}`);

  /* ============================ 9. 开关分层 ============================ */
  section('9. 开关分层：ADMIN_PAGE 与 DEBUG_PAGE 各自独立');

  const healthOff = await waitHealth(PORT_OFF);
  ok('第二个实例（ADMIN_PAGE=off）已启动', !!healthOff);
  if (healthOff) {
    ok('ADMIN_PAGE=off 时 health.adminPage = off', healthOff.adminPage === 'off', '实际 ' + healthOff.adminPage);
    ok('DEBUG_PAGE 仍为 on（两者互不牵连）', healthOff.debugPage === 'on', '实际 ' + healthOff.debugPage);

    r = await req(PORT_OFF, 'GET', '/api/admin/goods/list', { token: TOKENS.owner });
    ok('后台关闭后，连 owner 令牌也读不到管理接口 → 403', code(r) === 403, `code ${code(r)} ${msg(r)}`);

    r = await req(PORT_OFF, 'POST', '/api/admin/login', { body: { password: PASSWORD } });
    ok('后台关闭后登录接口一并关闭 → 403', code(r) === 403, `code ${code(r)} ${msg(r)}`);

    r = await req(PORT_OFF, 'GET', '/api/media/list', { token: TOKENS.viewer });
    ok('素材接口随后台一同关闭 → 403', code(r) === 403, `code ${code(r)}`);

    r = await req(PORT_OFF, 'GET', '/api/decorate/pages', { token: TOKENS.viewer });
    ok('装修接口随后台一同关闭 → 403', code(r) === 403, `code ${code(r)}`);

    const page = await req(PORT_OFF, 'GET', '/console/');
    ok('后台页面本身 → 403', page.status === 403, `HTTP ${page.status}`);
    const adminPage = await req(PORT_OFF, 'GET', '/admin');
    ok('装修台页面本身 → 403', adminPage.status === 403, `HTTP ${adminPage.status}`);
    const dbg = await req(PORT_OFF, 'GET', '/debug');
    ok('调试台页面仍可用（DEBUG_PAGE 未被牵连）', dbg.status === 200, `HTTP ${dbg.status}`);

    // 小程序线上内容不受任何开关影响
    const publicGoods = await req(PORT_OFF, 'GET', '/api/goods/list');
    ok('小程序公开商品接口不受后台开关影响', code(publicGoods) === 0, `code ${code(publicGoods)}`);
  }

  /* ============================ 10. 隔离性 ============================ */
  section('10. 隔离性：本测试不得改动真实数据');

  ok('server/data 目录清单未变', JSON.parse(snapshot()).data && before === snapshot(),
    'before=' + before + ' after=' + snapshot());
  ok('miniprogram/config/replica.js 的 size/mtime 未变',
    JSON.parse(snapshot()).replica === JSON.parse(before).replica,
    'before=' + JSON.parse(before).replica + ' after=' + JSON.parse(snapshot()).replica);
} finally {
  srv.stop();
  srvOff.stop();
  // 给进程一点退出时间，再清理临时目录
  await new Promise((r) => setTimeout(r, 300));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* Windows 可能还占着句柄 */ }
}

/* ------------------------------------------------------------------ */

console.log('\n' + '─'.repeat(60));
console.log(`管理端鉴权：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：\n  - ' + fails.join('\n  - '));
  process.exit(1);
}
