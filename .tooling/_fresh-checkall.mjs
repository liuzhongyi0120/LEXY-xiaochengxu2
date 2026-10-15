/**
 * 跑门禁之前，先把 :3000 上那个后端换成「当前磁盘上的代码」——一次调用搞定。
 *
 * 为什么需要它：改后端（server/**.js 是 require 时读一次）跑运行时断言时必须重启，
 * 而手工「查端口 → taskkill → 起服务 → 等健康」每轮要三步、还容易忘了收尾，
 * 留下一个没人管的 node 进程。这个脚本把整条链走完就退出，服务不会留在后台。
 *
 *   node .tooling/_fresh-checkall.mjs            # 重启后端 → 跑 server/tools/check-all.mjs
 *   node .tooling/_fresh-checkall.mjs <脚本路径>  # 重启后端 → 跑指定脚本
 *   node .tooling/_fresh-checkall.mjs --keep      # 只重启后端，不跑任何脚本（本机联调用）
 *
 * ⚠️ 本机没有 curl/netstat 在 PATH 里，必须用绝对路径调 System32 下的 exe。
 * ⚠️ 跑完一定会 taskkill 掉自己起的那个 PID；如果 :3000 上原本就有别的服务，
 *    它也会被替换掉（这正是「换成当前代码」的含义）。
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SYS = 'C:\\Windows\\System32\\';
const NODE = process.execPath;
const PORT = 3000;

const args = process.argv.slice(2);
const keep = args.indexOf('--keep') >= 0;
const script = args.filter((a) => a !== '--keep')[0] || 'server/tools/check-all.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pidOnPort() {
  try {
    const out = execSync(SYS + 'netstat.exe -ano', { encoding: 'utf8' });
    const line = out.split(/\r?\n/).find((l) => /LISTENING/.test(l) && new RegExp(':' + PORT + '\\b').test(l));
    return line ? line.trim().split(/\s+/).pop() : '';
  } catch (e) { return ''; }
}
function killPid(pid) {
  if (!pid) return;
  try { execSync(SYS + 'taskkill.exe /PID ' + pid + ' /F', { stdio: 'ignore' }); } catch (e) { /* 已经没了 */ }
}

const old = pidOnPort();
if (old) { console.log('[fresh] 停掉 :' + PORT + ' 上的旧进程 PID=' + old); killPid(old); }
await sleep(400);

console.log('[fresh] 启动后端（' + NODE + ' server/index.js）');
const child = spawn(NODE, ['server/index.js'], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { DEBUG_PAGE: 'on', ADMIN_PAGE: 'on' }),
  stdio: ['ignore', 'ignore', 'ignore'],
  windowsHide: true
});

/* 等健康：最多 20 秒 */
let up = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    const r = await fetch('http://127.0.0.1:' + PORT + '/api/health');
    if (r.ok) { up = true; break; }
  } catch (e) { /* 还没起来 */ }
}
if (!up) { console.log('[fresh] ✗ 后端 20 秒内没起来'); killPid(String(child.pid)); process.exit(3); }
console.log('[fresh] 后端已就绪（PID=' + child.pid + '）');

if (keep) {
  console.log('[fresh] --keep：后端留着跑（PID=' + child.pid + '），本脚本退出但**不**杀它');
  child.unref();
  process.exit(0);
}

console.log('[fresh] 跑 ' + script + '\n');
const res = spawnSync(NODE, [script], { cwd: ROOT, stdio: 'inherit' });

console.log('\n[fresh] 收尾：杀掉自己起的后端 PID=' + child.pid);
killPid(String(child.pid));
process.exit(res.status === null ? 4 : res.status);
