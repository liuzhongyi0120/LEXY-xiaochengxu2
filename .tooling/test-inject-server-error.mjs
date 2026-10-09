/**
 * 整改报告 15 的验收实证：**故意让接口抛服务端错误时，权限 / 参数校验用例必须失败**。
 *
 * 做法（不动一行服务端代码，也不污染真实数据）：
 *   在 3399 起一个「注入代理」—— 请求原样转发给真实服务，
 *   只把 4 个「预期失败」用例对应的请求改成 HTTP 500 + code 5000（模拟服务端崩溃）：
 *     · GET  /api/admin/dashboard   且**不带** Authorization  → 权限类（匿名访问管理接口）
 *     · POST /api/decorate/rollback                          → 资源类（版本不存在）
 *     · GET  /api/decorate/page?key=nope                     → 资源类（未知页面）
 *     · POST /api/media/folder  body 里 name=a/b             → 校验类（非法文件夹名）
 *   挑的都是**叶子用例**（结果只被自己的断言消费），注入后不会有级联崩溃，
 *   所以能干净地看出「这 4 条从 ✓ 变成 ✗」。
 *
 * 为什么必须这么做：改造前 expectFail 的判定是「业务码非 0 就算预期拦截成功」，
 * 于是这些用例在接口崩成 5000 时照样显示 ✓ —— 权限与参数校验等于完全没测。
 *
 * 用法：先起真实服务（node server/index.js），再执行本脚本。
 *   通过 → 注入服务端异常后，这 4 条用例确实失败了；
 *   不通过 → 判定又退化成「非 0 即通过」，报告 15 的漏洞回来了。
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const NODE = process.execPath;
const TARGET = process.argv[2] || 'http://127.0.0.1:3000';
const PROXY_PORT = Number(process.argv[3] || 3399);

/*
 * 这份报告是「故意跑坏」的产物，必须写到临时目录去。
 * 一旦它盖掉 server/CONNECTIVITY.md，仓库里就会留下「自检有十几个失败」的假象，
 * 而真正的原因只是本实验的注入代理 —— 后来的人会照着假报告去查一堆不存在的 bug。
 */
const REPORT_OUT = join(tmpdir(), 'lexy-checkall-injected-' + Date.now() + '.md');

/** 注入规则：命中即返回 HTTP 500 + code 5000 */
const RULES = [
  {
    label: '权限 · 匿名访问管理接口',
    match: (m, p, body, hasAuth) => m === 'GET' && p === '/api/admin/dashboard' && !hasAuth,
    row: { path: '/api/admin/dashboard', note: '预期失败：匿名访问管理接口' }
  },
  {
    label: '资源 · 版本不存在',
    match: (m, p) => m === 'POST' && p === '/api/decorate/rollback',
    row: { path: '/api/decorate/rollback', note: '预期失败：版本不存在' }
  },
  {
    label: '资源 · 未知页面',
    match: (m, p, body, hasAuth, query) => m === 'GET' && p === '/api/decorate/page' && /(^|&)key=nope(&|$)/.test(query),
    row: { path: '/api/decorate/page ', note: '预期失败：未知页面' }
  },
  {
    label: '校验 · 非法文件夹名',
    match: (m, p, body) => m === 'POST' && p === '/api/media/folder' && body.indexOf('"a/b"') > -1,
    row: { path: '/api/media/folder', note: '预期失败：非法文件夹名被拒' }
  }
];

const proxy = http.createServer(async (req, res) => {
  const url = String(req.url || '');
  const path = url.split('?')[0];
  const query = url.split('?')[1] || '';
  const hasAuth = !!(req.headers.authorization || req.headers.Authorization);

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = chunks.length ? Buffer.concat(chunks) : null;
  const bodyText = raw ? raw.toString('utf8') : '';

  const hit = RULES.find((r) => r.match(req.method, path, bodyText, hasAuth, query));
  if (hit) {
    const payload = JSON.stringify({
      code: 5000,
      msg: `注入的服务端异常（用例：${hit.label}）`,
      data: null
    });
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(payload);
  }

  const headers = {};
  Object.keys(req.headers).forEach((k) => {
    if (k !== 'host' && k !== 'content-length' && k !== 'connection') headers[k] = req.headers[k];
  });
  try {
    const r = await fetch(TARGET + url, { method: req.method, headers, body: raw || undefined });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, {
      'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8',
      'Content-Length': buf.length
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 5000, msg: '代理转发失败：' + e.message, data: null }));
  }
});

await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));
console.log(`注入代理已就绪： http://127.0.0.1:${PROXY_PORT} → ${TARGET}`);
RULES.forEach((r) => console.log('  · ' + r.label));

const out = await new Promise((resolve) => {
  const p = spawn(NODE, [join(ROOT, 'server', 'tools', 'check-all.mjs'), `http://127.0.0.1:${PROXY_PORT}`], {
    cwd: ROOT, env: { ...process.env, CHECK_ALL_REPORT: REPORT_OUT }
  });
  let buf = '';
  p.stdout.on('data', (d) => { buf += d.toString(); });
  p.stderr.on('data', (d) => { buf += d.toString(); });
  p.on('close', () => resolve(buf));
});
proxy.close();

const rows = out.split('\n');
let bad = 0;
console.log('\n验收结果（被注入服务端异常的点位，其实例行必须变成 ✗）');
console.log('-'.repeat(78));
RULES.forEach((r) => {
  const hit = rows.filter((l) =>
    l.indexOf(r.row.path) > -1 && l.indexOf(r.row.note) > -1 && l.indexOf('[预期失败') > -1);
  const line = hit[0] || '';
  const ok = hit.length > 0 && line.indexOf('✗') > -1;
  if (!ok) bad += 1;
  console.log(` ${ok ? '✓' : '✗'} ${r.label}`);
  console.log(`     ${line.trim() || '（没找到该点位的「预期失败」行）'}`);
});
console.log('-'.repeat(78));
const injected = (out.match(/注入的服务端异常/g) || []).length;
console.log(` 注入生效次数（响应体出现「注入的服务端异常」标记）：${injected}`);
console.log(` 本次（故意跑坏的）自检报告写到临时文件，未覆盖 server/CONNECTIVITY.md：`);
console.log(`   ${REPORT_OUT}`);
console.log(bad === 0
  ? '\n ✅ 注入服务端异常后这些用例确实被判为失败 —— expectFail 不再把 5000 当成「已拦住」\n'
  : `\n ⚠️ 有 ${bad} 条在服务端异常下仍被判为通过，判定过宽（报告 15 的漏洞）\n`);
process.exit(bad === 0 ? 0 : 1);
