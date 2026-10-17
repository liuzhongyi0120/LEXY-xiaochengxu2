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

  /* ============================ 7.5 成员管理（后台账号） ============================
   *
   * 这一节补的是「后台里**有人**」这件事：把「谁能进后台、各是什么角色」
   * 从 `.env` 变成后台里能看能改的数据（控制台「成员管理」栏目）。
   *
   * ⚠️ 必须排在第 8 节（爆破退避）之前：那一节会故意把登录打成限流状态，
   *    60 秒内任何登录都进不来，成员登录的用例会全部假红。
   */
  section('7.5 成员管理：后台账号体系（建 / 改 / 停用 / 重置口令 / 删）');

  const ownerTok = sessionToken; // 共享口令会话 = owner

  /** 当前成员列表（每次都现查，用来做「被拒之后数据没变」的后果断言） */
  const membersNow = async () => {
    const x = await req(PORT, 'GET', '/api/admin/members', { token: ownerTok });
    return (x.json && x.json.data) || {};
  };
  const memberList = async () => (await membersNow()).list || [];
  const activeOwners = async () => (await memberList()).filter((m) => m.role === 'owner' && m.enabled).length;

  /* —— ① 建成员 —— */
  let m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok,
    body: { username: 'OperA', name: '运营甲', role: 'operator', password: 'member-pw-one' }
  });
  ok('owner（共享口令会话）新建运营成员 → 成功', code(m) === 0, `code ${code(m)} ${msg(m)}`);
  const memAId = ((m.json || {}).data || {}).id;
  const memAPub = (m.json || {}).data || {};
  ok('新建返回体是**安全形状**：有 id / roleLabel / pwdSet，没有 pwd / hash / salt',
    !!memAId && memAPub.pwdSet === true && memAPub.roleLabel === '运营' &&
    !('pwd' in memAPub) && !('hash' in memAPub) && !('salt' in memAPub),
    JSON.stringify(memAPub));

  /* —— ② 账号唯一性按小写归一 —— */
  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'opera', name: '重名', role: 'viewer', password: 'member-pw-two' }
  });
  ok('账号唯一性按**小写归一**：`opera` 与 `OperA` 视为同一个（否则各建一个号，运营输哪个全凭记忆）',
    code(m) !== 0 && /占用/.test(msg(m)), `code ${code(m)} ${msg(m)}`);
  ok('被拒的重名账号没有落库（成员仍只有 1 个）',
    (await memberList()).length === 1, `实际 ${(await memberList()).length} 个`);

  /* —— ③ 账号 / 口令边界 —— */
  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'ab', role: 'viewer', password: 'member-pw-three' }
  });
  ok('账号太短（2 位，下限 3）→ 1001', code(m) === 1001, `code ${code(m)} ${msg(m)}`);
  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'has space', role: 'viewer', password: 'member-pw-three' }
  });
  ok('账号含空格 → 1001（白名单口径，登录框里少一类输错）', code(m) === 1001, `code ${code(m)} ${msg(m)}`);
  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'shortpw', role: 'viewer', password: '123' }
  });
  ok('口令太短（3 位，下限 8）→ 1001', code(m) === 1001, `code ${code(m)} ${msg(m)}`);
  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'rolebad', role: 'god', password: 'member-pw-three' }
  });
  ok('未知角色 → 1001（不能靠拼一个角色名提权）', code(m) === 1001, `code ${code(m)} ${msg(m)}`);

  /* —— ④ 列表形状 + 绝不吐哈希 + 口令口径 —— */
  const mm = await membersNow();
  ok('成员列表返回：成员 + 角色说明 + 账号规则 + 启用中 owner 数 + 凭证来源',
    Array.isArray(mm.list) && Array.isArray(mm.roles) && !!mm.rules &&
    typeof mm.activeOwners === 'number' && typeof mm.envTokens === 'number' &&
    typeof mm.sharedPassword === 'boolean',
    JSON.stringify({ n: (mm.list || []).length, roles: (mm.roles || []).length, activeOwners: mm.activeOwners }));
  ok('账号规则与 lib/members.js 同源（口令 8~64 位 · 姓名 20 字 · 上限 50 人）',
    mm.rules.pwdMin === 8 && mm.rules.pwdMax === 64 && mm.rules.nameMax === 20 && mm.rules.max === 50,
    JSON.stringify(mm.rules));
  ok('如实报告凭证来源：长期令牌 3 条 / 共享口令可用 / 成员表里还没有 owner',
    mm.envTokens === 3 && mm.sharedPassword === true && mm.activeOwners === 0,
    JSON.stringify({ envTokens: mm.envTokens, sharedPassword: mm.sharedPassword, activeOwners: mm.activeOwners }));
  /*
   * 两条**等价对账**：同一件事算了两遍（服务端 stats 与逐条列表）就必须一起动。
   * ⚠️ 这两条在成员表为空时是 `0 === 0` 恒真 —— 所以它们**不能**写在 check-all 里
   *    （那里跑在真实数据上，通常没有成员），只能放在本节。本节第一句就建了一个成员，
   *    判据从这里开始有边界：把 health 的 memberCount 写死、或让 activeOwners 另算，都会红。
   */
  /* ⚠️ 必须**现查** health：顶部那份是本进程刚起来时的快照（那时成员表还是空的），
   *    拿快照跟当前列表比，红的是「快照过期」而不是「口径不一致」—— 假红。 */
  const healthNow = await waitHealth(PORT);
  ok('health 自述的成员数 == 成员列表长度（两处各算一次迟早会漂）',
    !!healthNow && healthNow.adminAuth.members === (mm.list || []).length,
    `health.members=${healthNow && healthNow.adminAuth.members}　列表=${(mm.list || []).length}`);
  ok('列表的 activeOwners == 逐条统计的「启用中 owner」数（不是另算的一个数）',
    mm.activeOwners === (mm.list || []).filter((x) => x.role === 'owner' && x.enabled).length,
    `activeOwners=${mm.activeOwners}　逐条统计=${(mm.list || []).filter((x) => x.role === 'owner' && x.enabled).length}`);
  /*
   * 「不能吐哈希」不能拿「响应里有没有 pwd」当判据 —— `rules.pwdMin` / `pwdMax` 本来就该有。
   * 判据落在：每行没有 pwd/hash/salt 字段 + 整包不出现 scrypt 字样。
   */
  const memDump = JSON.stringify(mm);
  ok('成员列表绝不吐出**口令哈希 / 盐 / scrypt 参数**（出接口只走 members.pub()，手拼字段迟早漏一次）',
    !/scrypt/i.test(memDump) &&
    (mm.list || []).every((x) => !('pwd' in x) && !('hash' in x) && !('salt' in x)),
    `scrypt 字样=${/scrypt/i.test(memDump)}`);

  /* —— ⑤ 成员登录与会话 —— */
  let ml = await req(PORT, 'POST', '/api/admin/login', { body: { username: 'opera', password: 'member-pw-one' } });
  ok('成员账号登录 → 成功，且角色**按成员配置回显**（operator，不是写死的 owner）',
    code(ml) === 0 && (ml.json.data || {}).role === 'operator' && (ml.json.data || {}).roleLabel === '运营',
    JSON.stringify(ml.json && ml.json.data));
  let memTok = (ml.json.data || {}).token || '';

  r = await req(PORT, 'GET', '/api/admin/session', { token: memTok });
  /*
   * 回显的 username 是**建号时填的原样**（这里是 "OperA"），不是登录时输入的小写 ——
   * 「存原样、比小写」是有意的：运营回头在成员管理里看到的还是自己当初写的那个写法，
   * 但登录时 `operA` / `OPERA` / `opera` 都进得来。所以这里按小写比。
   */
  ok('成员会话：source=member / 带 username（原样大小写）/ canChangePassword=true',
    code(r) === 0 && (r.json.data || {}).source === 'member' &&
    String((r.json.data || {}).username || '').toLowerCase() === 'opera' &&
    (r.json.data || {}).canChangePassword === true,
    JSON.stringify(r.json && r.json.data));

  r = await req(PORT, 'GET', '/api/admin/goods/list', { token: memTok });
  ok('operator 成员读商品列表 → 放行', code(r) === 0, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/goods/save', { token: memTok, body: {} });
  ok('operator 成员保存商品 → 通过角色门（业务码非 401/403）',
    code(r) !== 401 && code(r) !== 403, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/decorate/publish', { token: memTok, body: { key: 'home' } });
  ok('operator 成员发布装修 → 403（成员角色照常受同一套角色门约束）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/media/delete', { token: memTok, body: { name: 'x.png', force: 1 } });
  ok('operator 成员删素材 → 403（需 owner）', code(r) === 403, `code ${code(r)}`);

  /* —— ⑥ 登录失败不区分「账号不存在 / 口令不对 / 已停用」 —— */
  const wrongPw = await req(PORT, 'POST', '/api/admin/login', { body: { username: 'opera', password: 'nope-nope-nope' } });
  ok('成员口令错 → 403', code(wrongPw) === 403, `code ${code(wrongPw)}`);
  const noSuch = await req(PORT, 'POST', '/api/admin/login', { body: { username: 'no_such_user', password: 'whatever-123' } });
  ok('账号不存在 → 403，且文案与「口令错」**逐字相同**（差一个字就等于送出「这账号存不存在」的探测器）',
    code(noSuch) === 403 && msg(noSuch) === msg(wrongPw),
    `不存在="${msg(noSuch)}" 口令错="${msg(wrongPw)}"`);

  /* —— ⑦ 用户令牌 / 匿名一律进不来 —— */
  r = await req(PORT, 'GET', '/api/admin/members', { token: userToken });
  ok('小程序用户令牌读成员列表 → 401（有 token ≠ 有管理员身份）', code(r) === 401, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/save', {
    token: userToken, body: { username: 'hacker', password: 'hacker-pw-1' }
  });
  ok('用户令牌新建成员 → 401', code(r) === 401, `code ${code(r)}`);
  r = await req(PORT, 'GET', '/api/admin/members', {});
  ok('匿名读成员列表 → 401', code(r) === 401, `code ${code(r)}`);

  /* —— ⑧ 只读 / 运营：能看列表，不能动成员 —— */
  r = await req(PORT, 'GET', '/api/admin/members', { token: TOKENS.viewer });
  ok('viewer 读成员列表 → 放行（只读成员也要能看清自己是谁）', code(r) === 0, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/save', {
    token: TOKENS.viewer, body: { username: 'x1', password: 'x1-password' }
  });
  ok('viewer 新建成员 → 403', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/save', {
    token: TOKENS.operator, body: { username: 'x2', password: 'x2-password' }
  });
  ok('operator 新建成员 → 403（能改「谁能进后台」= 最高危，只给 owner）', code(r) === 403, `code ${code(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/delete', { token: TOKENS.operator, body: { id: memAId } });
  const afterOpDel = await memberList();
  ok('operator 删成员 → 403，**且成员仍在**（只锁「403」挡不住「403 但已经删掉了」）',
    code(r) === 403 && afterOpDel.length === 1,
    `code ${code(r)}　剩余成员 ${afterOpDel.length}`);

  /* —— ⑨ 改自己的口令（成员专用） —— */
  r = await req(PORT, 'POST', '/api/admin/me/password', {
    token: memTok, body: { oldPassword: 'member-pw-one', newPassword: 'member-pw-ONE-2' }
  });
  ok('成员自助改口令 → 成功', code(r) === 0, `code ${code(r)} ${msg(r)}`);
  const oldLogin = await req(PORT, 'POST', '/api/admin/login', { body: { username: 'opera', password: 'member-pw-one' } });
  ok('改完口令：旧口令登录 → 403', code(oldLogin) === 403, `code ${code(oldLogin)}`);
  const newLogin = await req(PORT, 'POST', '/api/admin/login', { body: { username: 'opera', password: 'member-pw-ONE-2' } });
  ok('改完口令：新口令登录 → 成功', code(newLogin) === 0, `code ${code(newLogin)} ${msg(newLogin)}`);
  memTok = (newLogin.json.data || {}).token || '';

  r = await req(PORT, 'POST', '/api/admin/me/password', {
    token: memTok, body: { oldPassword: 'wrong-old-pw', newPassword: 'whatever-12345' }
  });
  ok('自助改口令时旧口令错 → 403（放宽到 viewer ≠ 不验旧口令）', code(r) === 403, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/me/password', {
    token: ownerTok, body: { oldPassword: PASSWORD, newPassword: 'whatever-12345' }
  });
  ok('共享口令会话改「个人口令」→ 403（共享口令没有「个人口令」这回事）', code(r) === 403, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/me/password', {
    token: TOKENS.viewer, body: { oldPassword: 'x', newPassword: 'whatever-12345' }
  });
  ok('长期令牌身份改「个人口令」→ 403', code(r) === 403, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/me/password', { body: { oldPassword: 'x', newPassword: 'whatever-12345' } });
  ok('匿名改「个人口令」→ 401', code(r) === 401, `code ${code(r)}`);

  /* —— ⑩ 三条自锁防护：不能消灭最后一个启用中的 owner ——
   *
   * 三条路（停用 / 降级 / 删除）都要拦，而且**每条被拒之后都要回头看一眼数据**：
   * 「被拒」只说明接口报了错，不说明那个 owner 还在。
   */
  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'OwnerB', name: '超管乙', role: 'owner', password: 'owner-b-pw-1' }
  });
  ok('再建一个 owner 成员 → 成功', code(m) === 0, `code ${code(m)} ${msg(m)}`);
  const memBId = ((m.json || {}).data || {}).id;

  r = await req(PORT, 'POST', '/api/admin/members/status', { token: ownerTok, body: { id: memBId, enabled: false } });
  ok('停用唯一一个启用中的 owner 成员 → 被拒（否则没人能再登录后台）',
    code(r) !== 0 && /最后一个/.test(msg(r)), `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/save', { token: ownerTok, body: { id: memBId, role: 'operator' } });
  ok('把唯一一个启用中的 owner 降级 → 被拒', code(r) !== 0 && /最后一个/.test(msg(r)), `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: memBId } });
  ok('删除唯一一个启用中的 owner → 被拒', code(r) !== 0 && /最后一个/.test(msg(r)), `code ${code(r)} ${msg(r)}`);
  ok('三次被拒之后：那个 owner 仍在 / 仍是 owner / 仍启用（后果断言，不只锁「被拒」）',
    (await activeOwners()) === 1 && (await memberList()).length === 2,
    `启用中的 owner=${await activeOwners()}　成员总数=${(await memberList()).length}`);

  m = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'OwnerC', name: '超管丙', role: 'owner', password: 'owner-c-pw-1' }
  });
  ok('再补一个 owner → 成功（防护只拦「归零」，不是禁止管理 owner）', code(m) === 0, `code ${code(m)} ${msg(m)}`);
  const memCId = ((m.json || {}).data || {}).id;
  r = await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: memBId } });
  ok('有第二个 owner 之后，删掉原来的 owner → 放行', code(r) === 0, `code ${code(r)} ${msg(r)}`);

  /* —— ⑪ 停用 / 启用 / 降级**立刻**生效（token 每次回查成员表） —— */
  r = await req(PORT, 'POST', '/api/admin/members/status', { token: ownerTok, body: { id: memAId, enabled: false } });
  ok('停用成员 A → 成功', code(r) === 0, `code ${code(r)} ${msg(r)}`);
  const offLogin = await req(PORT, 'POST', '/api/admin/login', { body: { username: 'opera', password: 'member-pw-ONE-2' } });
  ok('已停用成员登录 → 403，且文案与「口令错 / 账号不存在」逐字相同（不暴露「号还在、只是停了」）',
    code(offLogin) === 403 && msg(offLogin) === msg(wrongPw), `code ${code(offLogin)} msg=${msg(offLogin)}`);
  r = await req(PORT, 'GET', '/api/admin/goods/list', { token: memTok });
  ok('已停用成员的**旧会话令牌立刻失效**（下一个请求就 401 —— 否则「停用」要等 12 小时 TTL 才真停）',
    code(r) === 401, `code ${code(r)} ${msg(r)}`);

  r = await req(PORT, 'POST', '/api/admin/members/status', { token: ownerTok, body: { id: memAId, enabled: true } });
  ok('重新启用成员 A → 成功', code(r) === 0, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/members/save', { token: ownerTok, body: { id: memAId, role: 'viewer' } });
  ok('把成员 A 降级为只读 → 成功', code(r) === 0, `code ${code(r)} ${msg(r)}`);
  r = await req(PORT, 'POST', '/api/admin/goods/save', { token: memTok, body: {} });
  ok('降级**立刻生效**：同一条令牌改商品 → 403（不必等人重新登录）', code(r) === 403, `code ${code(r)} ${msg(r)}`);

  /* —— ⑫ 收尾 ——
   *
   * 注意：成员表**不可能被清空到 0 owner** —— 上一条防护的必然结果。
   * 这不是「收尾没做干净」，而是「后台永远不会处于『有一堆成员、但没有一个 owner』」。
   * 运营真要只剩一个人，走的是环境变量那条救援通道（ADMIN_PASSWORD / ADMIN_TOKENS），
   * 那两条不经过成员表。本节的数据全在临时目录里，进程一退就连目录一起删掉。
   */
  r = await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: memAId } });
  ok('删除成员 A（只读）→ 成功', code(r) === 0, `code ${code(r)} ${msg(r)}`);
  const leftMembers = await memberList();
  ok('非 owner 成员可以删干净，成员表只剩那个 owner 成员',
    leftMembers.length === 1 && leftMembers[0].role === 'owner',
    leftMembers.map((x) => `${x.username}(${x.role})`).join('、') || '空');
  r = await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: memCId } });
  ok('成员表里**最后一个 owner** 删不掉（设计如此：不留「后台在跑但没人能登录」的状态）',
    code(r) !== 0 && /最后一个/.test(msg(r)), `code ${code(r)} ${msg(r)}`);

  /* ============================ 7.6 审查 F01 / F02 / F04 回归 ============================
   *
   * 2026-10-17《商城全维度审查》复现出的三个问题，必须转成断言，
   * 否则「改过了」只是口头结论，下次重构又会退回去：
   *   F01（P0）：令牌表用普通对象 → `constructor` 这类**继承属性名**被当成有效令牌；
   *   F02（P1）：JWT 只绑用户名 → 改名 / 删号重建后旧 viewer 令牌变成新 owner；
   *   F04（P1）：改口令不能撤销既有会话 → 泄露的令牌在 TTL（12h）内继续可用。
   *
   * ⚠️ 必须排在第 8 节（爆破退避）之前：那一节会把共享口令那条桶打成限流，
   *    本节的成员登录用的是**另一个桶**（IP + 账号），不受影响，
   *    但 F01 那组用例要新起实例，早一点起更省时间。
   */
  section('7.6 F01 令牌继承属性绕过 / F02 用户名重用提权 / F04 改口令不撤会话');

  /* —— F01-A：本机实例（已配置 3 条长期令牌）用继承属性名当令牌 —— */
  const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'];
  const protoBad = [];
  for (const k of PROTO_KEYS) {
    const x = await req(PORT, 'GET', '/api/admin/members', { token: k });
    if (code(x) !== 401) protoBad.push(`${k}→HTTP${x.status}/code${code(x)}`);
  }
  ok(`F01 · 继承属性名当令牌一律 401（${PROTO_KEYS.length} 个：${PROTO_KEYS.slice(0, 3).join(' / ')} …）`,
    protoBad.length === 0, protoBad.join('；'));

  /* 真正要命的一半：这些"令牌"不只被认成身份，还被认成了 **owner** ——
     所以必须单独验证它们过不了 owner 专属的成员保存。 */
  const protoWrite = [];
  for (const k of PROTO_KEYS) {
    const x = await req(PORT, 'POST', '/api/admin/members/save', {
      token: k, body: { username: 'proto_' + k.slice(0, 6), password: 'proto-pw-1234' }
    });
    if (code(x) !== 401) protoWrite.push(`${k}→code${code(x)}`);
  }
  ok('F01 · 继承属性名也**不能**执行 owner 专属的成员保存（旧实现里 role=undefined 会绕过等级比较）',
    protoWrite.length === 0, protoWrite.join('；'));

  /* —— F01-B：另起一个「一条长期令牌都没配」的实例 ——
     原实现在**空令牌表**上同样中招（继承属性永远存在），这是报告里最狠的一条：
     没配任何令牌的部署照样能被人拿 `constructor` 走进来。 */
  const PORT_NOTOK = 3313;
  const srvNoTok = startServer(PORT_NOTOK, { ADMIN_TOKENS: '' });
  try {
    const hNoTok = await waitHealth(PORT_NOTOK);
    ok('F01 · 另起的「未配置长期令牌」实例已启动', !!hNoTok);
    if (hNoTok) {
      ok('F01 · 该实例自述长期令牌 0 条（确认这条路径真的是「空表」）',
        hNoTok.adminAuth.tokens === 0, '实际 ' + hNoTok.adminAuth.tokens);
      const bad2 = [];
      for (const k of PROTO_KEYS) {
        const x = await req(PORT_NOTOK, 'GET', '/api/admin/members', { token: k });
        if (code(x) !== 401) bad2.push(`${k}→HTTP${x.status}/code${code(x)}`);
      }
      ok('F01 · **空令牌表**下继承属性名同样一律 401（没有长期令牌也不该有万能令牌）',
        bad2.length === 0, bad2.join('；'));
      const w2 = await req(PORT_NOTOK, 'POST', '/api/admin/members/save', {
        token: 'constructor', body: { username: 'proto_ctor2', password: 'proto-pw-1234' }
      });
      ok('F01 · 空令牌表下 `constructor` 也建不了成员', code(w2) === 401, `code ${code(w2)}`);
      const stillEmpty = await req(PORT_NOTOK, 'GET', '/api/admin/members', { token: ownerTok });
      ok('F01 · 上面几次尝试一个成员都没建出来（锁「被拒」也锁「没落库」）',
        ((stillEmpty.json && stillEmpty.json.data && stillEmpty.json.data.list) || []).length === 0,
        JSON.stringify(((stillEmpty.json || {}).data || {}).list || []).slice(0, 120));
    }
  } finally {
    srvNoTok.stop();
  }

  /* —— F02：改个名就能提权 —— */
  const v2 = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'F02Viewer', name: '只读甲', role: 'viewer', password: 'f02-viewer-pw' }
  });
  ok('F02 · 建一个只读成员 → 成功', code(v2) === 0, `code ${code(v2)} ${msg(v2)}`);
  const v2Id = ((v2.json || {}).data || {}).id;
  const v2Login = await req(PORT, 'POST', '/api/admin/login', {
    body: { username: 'f02viewer', password: 'f02-viewer-pw' }
  });
  ok('F02 · 该只读成员登录成功，角色回显 viewer',
    code(v2Login) === 0 && (v2Login.json.data || {}).role === 'viewer',
    JSON.stringify(v2Login.json && v2Login.json.data));
  const v2Tok = (v2Login.json.data || {}).token || '';

  const v2Rename = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { id: v2Id, username: 'F02Renamed' }
  });
  ok('F02 · 把它改名（腾出原用户名）→ 成功', code(v2Rename) === 0, `code ${code(v2Rename)} ${msg(v2Rename)}`);
  const o2 = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'F02Viewer', name: '超管顶替', role: 'owner', password: 'f02-owner-pw' }
  });
  ok('F02 · 用**腾出来的同名**建一个 owner → 成功（这正是旧实现的提权入口）',
    code(o2) === 0, `code ${code(o2)} ${msg(o2)}`);
  const o2Id = ((o2.json || {}).data || {}).id;

  const v2Session = await req(PORT, 'GET', '/api/admin/session', { token: v2Tok });
  const v2Role = (v2Session.json && v2Session.json.data ? v2Session.json.data.role : null);
  ok('F02 · 旧 viewer 令牌**没有**变成 owner（要么仍是 viewer，要么已失效 401）',
    v2Role === 'viewer' || code(v2Session) === 401,
    `HTTP ${v2Session.status} code ${code(v2Session)} role=${v2Role}`);
  const v2Write = await req(PORT, 'POST', '/api/admin/settings/save', {
    token: v2Tok, body: { notice: 'F02 提权尝试' }
  });
  ok('F02 · 旧 viewer 令牌执行 owner 操作（改店铺设置）→ 403（提权没成功）',
    code(v2Write) === 403, `code ${code(v2Write)} ${msg(v2Write)}`);

  const v2Del = await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: v2Id } });
  ok('F02 · 删掉原只读成员 → 成功', code(v2Del) === 0, `code ${code(v2Del)} ${msg(v2Del)}`);
  const v2AfterDel = await req(PORT, 'GET', '/api/admin/session', { token: v2Tok });
  ok('F02 · 删号后旧令牌立刻 401（身份绑的是不可复用的成员 ID，不是用户名）',
    code(v2AfterDel) === 401, `code ${code(v2AfterDel)} ${msg(v2AfterDel)}`);

  /* —— F04：改口令必须能撤掉已签发的会话 —— */
  const p4 = await req(PORT, 'POST', '/api/admin/members/save', {
    token: ownerTok, body: { username: 'F04Oper', name: '运营乙', role: 'operator', password: 'f04-pw-old-01' }
  });
  ok('F04 · 建一个运营成员 → 成功', code(p4) === 0, `code ${code(p4)} ${msg(p4)}`);
  const p4Id = ((p4.json || {}).data || {}).id;
  const p4Login = await req(PORT, 'POST', '/api/admin/login', {
    body: { username: 'f04oper', password: 'f04-pw-old-01' }
  });
  const p4Tok = ((p4Login.json || {}).data || {}).token || '';
  const p4Before = await req(PORT, 'GET', '/api/admin/session', { token: p4Tok });
  ok('F04 · 改口令前：该令牌可用（先证明它不是本来就无效）',
    code(p4Before) === 0 && (p4Before.json.data || {}).source === 'member',
    `code ${code(p4Before)} ${msg(p4Before)}`);

  const p4Self = await req(PORT, 'POST', '/api/admin/me/password', {
    token: p4Tok, body: { oldPassword: 'f04-pw-old-01', newPassword: 'f04-pw-new-02' }
  });
  ok('F04 · 成员自助改口令 → 成功', code(p4Self) === 0, `code ${code(p4Self)} ${msg(p4Self)}`);
  const p4After = await req(PORT, 'GET', '/api/admin/session', { token: p4Tok });
  ok('F04 · 改完口令，**改前签发的旧令牌立即 401**（否则改密码挡不住已泄露的会话）',
    code(p4After) === 401, `code ${code(p4After)} ${msg(p4After)}`);
  const p4Relogin = await req(PORT, 'POST', '/api/admin/login', {
    body: { username: 'f04oper', password: 'f04-pw-new-02' }
  });
  ok('F04 · 新口令可以重新登录（只撤旧会话，不把人锁在外面）',
    code(p4Relogin) === 0, `code ${code(p4Relogin)} ${msg(p4Relogin)}`);

  /* owner 代重置口令也要撤会话 */
  const p4Tok2 = ((p4Relogin.json || {}).data || {}).token || '';
  const p4Reset = await req(PORT, 'POST', '/api/admin/members/password', {
    token: ownerTok, body: { id: p4Id, password: 'f04-pw-reset-3' }
  });
  ok('F04 · owner 代重置口令 → 成功', code(p4Reset) === 0, `code ${code(p4Reset)} ${msg(p4Reset)}`);
  const p4AfterReset = await req(PORT, 'GET', '/api/admin/session', { token: p4Tok2 });
  ok('F04 · 被 owner 重置口令后，该成员的旧会话同样立即 401',
    code(p4AfterReset) === 401, `code ${code(p4AfterReset)} ${msg(p4AfterReset)}`);

  /* 收尾：清掉本节建的两个成员（owner 成员受「最后一个 owner」保护，删不掉也无妨） */
  await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: p4Id } });
  await req(PORT, 'POST', '/api/admin/members/delete', { token: ownerTok, body: { id: o2Id } });

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
