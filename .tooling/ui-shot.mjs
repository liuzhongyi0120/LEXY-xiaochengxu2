/**
 * UI 截图 / 断言驱动器（零依赖，用 Node 22 内置 WebSocket 直连 CDP）
 *
 * 为什么不用 agent-browser / cdp-proxy：
 *   两者都要求用户 Chrome 已开启远程调试开关，环境一变就断；
 *   本脚本自己拉起 Playwright 自带的 chrome-headless-shell，只依赖本地磁盘上的二进制。
 *
 * 用法：
 *   node .tooling/ui-shot.mjs <url> <out.png> [选项]
 * 选项：
 *   --eval <file>   截图前执行该 JS 文件（可用 await；最后的表达式即返回值）
 *   --evalstr <js>  同上，直接给字符串
 *   --token <值>    在**页面脚本运行之前**把管理员令牌写入 localStorage。
 *                   报告 08 之后控制台 / 装修台 / 素材库都要管理员身份，
 *                   不带令牌就只会截到登录遮罩，量出来的版式全是登录框的。
 *                   用 CDP 的 addScriptToEvaluateOnNewDocument 注入，天然先于任何页面脚本。
 *   --w <n>         视口宽（默认 1440）
 *   --h <n>         视口高（默认 1100）
 *   --full          整页截图（默认按视口截）
 *   --wait <ms>     导航后额外等待（默认 400）
 *
 * 输出：截图写入 out.png；若用了 --eval，会把返回值 JSON 打印到 stdout（前缀 EVAL:）。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const argv = process.argv.slice(2);
const opt = { w: 1440, h: 1100, full: false, wait: 400, evalFile: '', evalStr: '', token: '' };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--eval') opt.evalFile = argv[++i];
  else if (a === '--evalstr') opt.evalStr = argv[++i];
  else if (a === '--token') opt.token = argv[++i];
  else if (a === '--w') opt.w = Number(argv[++i]);
  else if (a === '--h') opt.h = Number(argv[++i]);
  else if (a === '--wait') opt.wait = Number(argv[++i]);
  else if (a === '--full') opt.full = true;
  else positional.push(a);
}
const [url, out] = positional;
if (!url || !out) {
  console.error('用法: node .tooling/ui-shot.mjs <url> <out.png> [--eval file.js] [--w 1440] [--h 1100] [--full]');
  process.exit(2);
}

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('未找到 chrome-headless-shell，请检查 ms-playwright 安装路径');
  process.exit(2);
}

const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'uiprof-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  '--window-size=' + opt.w + ',' + opt.h,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(120);
  }
  throw new Error('连接 chrome 调试端口超时');
}

let ws;
let msgId = 0;
const pending = new Map();

function send(method, params) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function cleanup(code) {
  try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  try { child.kill(); } catch (e) { /* ignore */ }
  process.exit(code);
}

(async () => {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message + ' @' + m.method));
      else p.resolve(m.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: opt.w, height: opt.h, deviceScaleFactor: 1, mobile: false
  });
  if (opt.token) {
    // 在**任何页面脚本之前**落下令牌：控制台 / 装修台启动时会读它换取管理员会话。
    // 用 addScriptToEvaluateOnNewDocument 而不是「先导航一次再 setItem」——
    // 后者遇到只差 hash 的 URL 时不会重新加载，页面会一直停在登录遮罩上。
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'try{ localStorage.setItem("lexy_admin_token", ' + JSON.stringify(opt.token) + '); }catch(e){}'
    });
  }
  await send('Page.navigate', { url });
  await sleep(opt.wait + 500);

  // 等网络空闲（最多 3 秒）
  for (let i = 0; i < 15; i++) {
    const r = await send('Runtime.evaluate', {
      expression: 'document.readyState', returnByValue: true
    });
    if (r.result && r.result.value === 'complete') break;
    await sleep(200);
  }
  await sleep(opt.wait);

  let script = opt.evalStr;
  if (opt.evalFile) script = readFileSync(opt.evalFile, 'utf8');
  if (script) {
    const r = await send('Runtime.evaluate', {
      expression: '(async()=>{' + script + '})()',
      awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) {
      console.error('EVALERR: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails));
    } else {
      console.log('EVAL: ' + JSON.stringify(r.result && r.result.value));
    }
    await sleep(250);
  }

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: !!opt.full,
    ...(opt.full ? { clip: await fullClip() } : {})
  });
  // 输出目录可能不存在（.tooling/shots/ 不入库，克隆后第一次跑就没有）—— 先建好再写
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT: ' + out);

  async function fullClip() {
    const m = await send('Page.getLayoutMetrics');
    const cs = m.cssContentSize || m.contentSize;
    return { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
  }

  cleanup(0);
})().catch((e) => {
  console.error('ERR: ' + e.message);
  cleanup(1);
});
