/**
 * 本机 CDP 代理「替补」：没有用户 Chrome 的 cdp-proxy 时，用一个无头 Chrome 顶上。
 *
 * 背景：`.tooling/` 里有一批浏览器验收脚本（check-admin-nav / probe-admin-* / test-tabbar…）
 * 走的是 web-access 技能提供的 CDP 代理（http://localhost:3456）。那个代理要求**用户的 Chrome
 * 开着且允许调试** —— 也就是说这些脚本在「用户没开浏览器」时一律 `ECONNREFUSED`，
 * 报出来的还是一堆看不懂的 fetch 失败，很容易被误判成「代码坏了」。
 *
 * 这个脚本补一个**等价的、无头的**代理：同一个端口、同一批路由，
 * 底下自己拉起 chrome-headless-shell 直连 CDP。于是那些脚本一行都不用改就能跑。
 *
 * 用法（后台常驻，跑完杀掉即可）：
 *   node .tooling/_cdp-headless.mjs &
 *   node .tooling/check-admin-nav.mjs
 *
 * 行为：3456 上已经有代理在监听 → 直接退出（绝不去抢用户已经开着的代理）。
 *
 * 实现的路由（与 web-access 的 cdp-proxy 对齐的子集）：
 *   GET  /json/version            → { Browser }
 *   GET  /targets                 → { targets: [{ id, type, title, url }] }
 *   POST /new        body=url     → { targetId }
 *   POST /eval?target=<id> body=js→ { value }（awaitPromise + returnByValue，异常走 { error }）
 *   POST /close?target=<id>       → { ok: true }
 *   POST /nav?target=<id> body=url→ { ok: true }
 *   POST /shot?target=<id> body=png 路径 → 写文件
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LISTEN = 3456;
const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 0. 已有代理就不抢 ---- */
const alive = await fetch(`http://127.0.0.1:${LISTEN}/json/version`)
  .then((r) => r.json()).then(() => true).catch(() => false);
if (alive) {
  console.log(`[cdp-headless] ${LISTEN} 上已经有代理在跑，直接退出（不改动用户环境）`);
  process.exit(0);
}

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('[cdp-headless] 未找到 chrome-headless-shell'); process.exit(2); }

const cdpPort = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'cdp-hl-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + profile,
  '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

/* ---- 1. 等无头 Chrome 起来，并建立一条 flatten 的 CDP 连接 ---- */
let ws = null;
let msgId = 0;
const pending = new Map();

function send(method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, 30000);
  });
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      const t = list.find((x) => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) {
        ws = new WebSocket(t.webSocketDebuggerUrl);
        ws.addEventListener('message', (ev) => {
          let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id); pending.delete(m.id);
            if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
          }
        });
        await new Promise((res, rej) => {
          ws.addEventListener('open', res);
          ws.addEventListener('error', () => rej(new Error('WS 打不开')));
        });
        return;
      }
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('等不到 CDP 端点');
}
await connect();

/* ---- 2. 目标（标签页）管理：flatten 模式按 sessionId 分发 ---- */
const sessions = new Map();   // targetId → sessionId

async function newTarget(url) {
  const r = await send('Target.createTarget', { url: url || 'about:blank' });
  return r.targetId;
}
async function attach(targetId) {
  if (sessions.has(targetId)) return sessions.get(targetId);
  const r = await send('Target.attachToTarget', { targetId, flatten: true });
  sessions.set(targetId, r.sessionId);
  return r.sessionId;
}

/* ---- 3. HTTP 服务：把代理路由翻译成 CDP ---- */
const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b));
});
const sendJson = (res, obj, code = 200) => {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
};

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const body = req.method === 'POST' ? await readBody(req) : '';
  const target = u.searchParams.get('target') || '';
  try {
    if (u.pathname === '/json/version') {
      return sendJson(res, { Browser: 'chrome-headless-shell (cdp-headless 替补)', 'Protocol-Version': '1.3' });
    }
    if (u.pathname === '/targets') {
      const t = await send('Target.getTargets');
      return sendJson(res, {
        targets: (t.targetInfos || []).filter((x) => x.type === 'page')
          .map((x) => ({ id: x.targetId, type: x.type, title: x.title, url: x.url }))
      });
    }
    if (u.pathname === '/new' && req.method === 'POST') {
      const id = await newTarget(body);
      await attach(id);
      return sendJson(res, { targetId: id, id });
    }
    if (u.pathname === '/close' && req.method === 'POST') {
      try { await send('Target.closeTarget', { targetId: target }); } catch (e) { /* 已关 */ }
      sessions.delete(target);
      return sendJson(res, { ok: true });
    }
    if (u.pathname === '/nav' && req.method === 'POST') {
      const sid = await attach(target);
      await send('Page.navigate', { url: body }, sid);
      return sendJson(res, { ok: true });
    }
    if (u.pathname === '/eval' && req.method === 'POST') {
      const sid = await attach(target);
      /* 与 cdp-proxy 同口径：awaitPromise + returnByValue；页面脚本一律 return 字符串 */
      const r = await send('Runtime.evaluate', {
        expression: body, awaitPromise: true, returnByValue: true
      }, sid);
      if (r.exceptionDetails) {
        return sendJson(res, { error: String((r.exceptionDetails.exception || {}).description || 'eval 异常') });
      }
      return sendJson(res, { value: r.result ? r.result.value : null });
    }
    if (u.pathname === '/shot' && req.method === 'POST') {
      const sid = await attach(target);
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sid);
      writeFileSync(body, Buffer.from(s.data, 'base64'));
      return sendJson(res, { ok: true, file: body });
    }
    return sendJson(res, { error: '未实现的路由 ' + u.pathname }, 404);
  } catch (e) {
    return sendJson(res, { error: e.message }, 500);
  }
});

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(`[cdp-headless] 无头代理已就绪：http://127.0.0.1:${LISTEN}（底层 chrome-headless-shell :${cdpPort}）`);
  console.log('[cdp-headless] 用完请杀掉本进程（Ctrl-C）');
});

const shutdown = () => { try { child.kill(); } catch (e) { /* ignore */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
