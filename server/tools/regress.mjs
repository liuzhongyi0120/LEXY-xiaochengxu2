#!/usr/bin/env node
/**
 * 确定性非交易回归（审查 F28）
 *
 * 背景：本轮审查里最严重的几个缺陷（令牌原型键绕过、用户名重用提权、旧表单覆盖新库存）
 * **都不是「某个接口不通」**，而是跨模块的语义错误 —— 点位连通性全绿也照样存在。
 * 所以发布门槛不能只有 `check-all.mjs`（点位连通），还要有一条
 * 「把每个已修缺陷的复现转成断言」的命令，并且：
 *
 *   · **不碰真实数据**：临时数据目录 + 临时端口，跑完核对真实数据指纹没变；
 *   · **确定性**：不依赖人工先在浏览器登录，凭证在用例里现造；
 *   · **非交易**：不跑结算 / 支付 / 退款金额链路（本轮范围外）。
 *
 * 用法
 *   node server/tools/regress.mjs           # 语法门 + 4 个专项套件（约 30 秒）
 *   node server/tools/regress.mjs --full    # 追加跑 check-all.mjs（需 3000 端口已有服务）
 */

import { spawn, spawnSync } from 'node:child_process';
import nodePath from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';

const ROOT = nodePath.resolve(nodePath.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const FULL = process.argv.includes('--full');

/* ---------------------------- 真实数据指纹 ---------------------------- */

const REAL_DATA = nodePath.join(ROOT, 'server', 'data');
const REAL_REPLICA = nodePath.join(ROOT, 'miniprogram', 'config', 'replica.js');

function fingerprint(p) {
  if (!fs.existsSync(p)) return 'missing';
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    return fs.readdirSync(p).sort().join(',');
  }
  return [st.size, Math.round(st.mtimeMs)].join(':');
}
const snapshot = () => JSON.stringify({
  data: fingerprint(REAL_DATA),
  catalog: fingerprint(nodePath.join(REAL_DATA, 'catalog.json')),
  uploads: fingerprint(nodePath.join(REAL_DATA, 'uploads', 'index.json')),
  replica: fingerprint(REAL_REPLICA)
});
const before = snapshot();

/* ------------------------------ 小工具 ------------------------------ */

let suiteFail = 0;
function run(name, args, env, timeoutMs) {
  console.log('\n▶ ' + name);
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: Object.assign({}, process.env, env || {}),
    encoding: 'utf8',
    timeout: timeoutMs || 180000
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  if (out.trim()) console.log(out.trim().split('\n').map((l) => '   ' + l).join('\n'));
  const okRun = r.status === 0;
  if (!okRun) suiteFail += 1;
  console.log(okRun ? '   ✅ 通过' : `   ❌ 失败（exit ${r.status}）`);
  return okRun;
}

/* --------------------------- 1. 语法门 --------------------------- */

const SKIP_DIRS = new Set(['node_modules', '.git', '.tooling', 'cert', 'shots', '_archive']);
function walk(dir, out) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return out; }
  names.forEach((n) => {
    if (SKIP_DIRS.has(n) || /^_archive/.test(n)) return;
    const p = nodePath.join(dir, n);
    let st = null;
    try { st = fs.statSync(p); } catch (e) { return; }
    if (st.isDirectory()) walk(p, out);
    else if (n.endsWith('.js') || n.endsWith('.mjs')) out.push(p);
  });
  return out;
}

console.log('================ 确定性非交易回归（审查 F28）================');
console.log('\n▶ 语法门');
const files = [];
walk(nodePath.join(ROOT, 'server'), files);
walk(nodePath.join(ROOT, 'miniprogram'), files);
let bad = [];
files.forEach((f) => {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) bad.push(f);
});
if (bad.length) { suiteFail += 1; console.log('   ❌ 语法错误 ' + bad.length + ' 个：\n     ' + bad.slice(0, 10).join('\n     ')); }
else console.log(`   ✅ ${files.length} 个 JS 文件全部通过 node --check`);

/* ------------------- 2. 管理端鉴权与角色（自带隔离实例） ------------------- */

run('管理端鉴权 / 角色矩阵（含 F01 原型键绕过）',
  [nodePath.join('.tooling', 'test-admin-auth.mjs')], null, 240000);

/* ---------------- 3~4. 素材生命周期与去重（临时数据目录） ---------------- */

const TMP = nodePath.join(os.tmpdir(), 'mall-regress-' + process.pid);
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const PORT = 3417;

/*
 * 给临时目录放一份「历史发布版本」：素材引用检查（F17）要扫 decorate/backup，
 * 空目录会让「历史版本保护」那条用例空跑 —— 那就等于没验证。
 * 直接把当前 replica.js 复制成一份历史快照：内容相同，但它是**另一个版本**，
 * 足以验证「当前数据里没有、历史版本里有」的素材不会被判成未引用。
 */
const TMP_BACKUP = nodePath.join(TMP, 'decorate', 'backup');
fs.mkdirSync(TMP_BACKUP, { recursive: true });
try {
  fs.copyFileSync(REAL_REPLICA, nodePath.join(TMP_BACKUP, 'replica.' + Date.now() + '.js'));
} catch (e) {
  console.log('   ⚠️ 复制历史版本快照失败：' + e.message);
}

const srv = spawn(process.execPath, [nodePath.join('server', 'index.js')], {
  cwd: ROOT,
  env: Object.assign({}, process.env, {
    MALL_DATA_DIR: TMP,
    PORT: String(PORT),
    ADMIN_PASSWORD: 'regress-only-pwd',
    JWT_SECRET: 'regress-only-secret-' + Math.random().toString(36).slice(2)
  }),
  stdio: 'ignore'
});

const alive = () => new Promise((resolve) => {
  const t0 = Date.now();
  const tick = () => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => (Date.now() - t0 > 15000 ? resolve(false) : setTimeout(tick, 300)));
    req.on('timeout', () => { req.destroy(); (Date.now() - t0 > 15000 ? resolve(false) : setTimeout(tick, 300)); });
  };
  tick();
});

const up = await alive();
if (!up) {
  suiteFail += 1;
  console.log('\n▶ 隔离服务启动失败（端口 ' + PORT + '）');
} else {
  console.log(`\n▶ 隔离服务已就绪：端口 ${PORT}，数据目录 ${TMP}`);
  /*
   * F17 用例要同时用两样东西：HTTP 服务（验证 /uploads 的下架与恢复）与
   * 同一份数据目录（验证索引与文件状态）。所以把 MALL_DATA_DIR 也指向临时目录 ——
   * 两者必须同源，否则「删了但接口还返回 200」这类问题会测不出来。
   */
  run('素材生命周期：回收站 + 历史版本保护（F17）',
    [nodePath.join('.tooling', 'test-media-f17.mjs')],
    { BASE: `http://127.0.0.1:${PORT}`, MALL_DATA_DIR: TMP }, 240000);
  run('重复素材：同内容复用 + 合并引用（F18）',
    [nodePath.join('.tooling', 'test-media-f18.mjs')], null, 240000);
}
try { srv.kill(); } catch (e) { /* 已退出 */ }

/* --------------------- 5.（可选）全量点位连通性 --------------------- */

if (FULL) {
  run('全量点位连通性（check-all.mjs，需 3000 端口已在跑）',
    [nodePath.join('server', 'tools', 'check-all.mjs')], null, 600000);
}

/* --------------------------- 真实数据未变 --------------------------- */

const after = snapshot();
console.log('\n▶ 真实数据未被改动');
if (before === after) {
  console.log('   ✅ server/data 与 replica.js 指纹一致（测试确实跑在临时目录里）');
} else {
  suiteFail += 1;
  console.log('   ❌ 指纹变了 —— 有测试写到了真实数据上');
  console.log('     before: ' + before);
  console.log('     after : ' + after);
}

console.log('\n================================================================');
if (suiteFail) {
  console.log(` ❌ 回归未通过：${suiteFail} 个套件失败`);
  process.exit(1);
}
console.log(' ✅ 回归全部通过（语法门 + 鉴权 + 素材生命周期 + 重复治理）');
process.exit(0);
