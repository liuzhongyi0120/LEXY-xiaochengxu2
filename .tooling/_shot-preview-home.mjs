/**
 * 取证截图：本机服务在跑时，首页（/preview，只编译真机源码那条链路）到底显示出了什么。
 *
 * 用法：node .tooling/_shot-preview-home.mjs [--out .tooling/_shot-preview.png] [--path /preview]
 *
 * ⚠️ 判据必须是「图片真的解码成功」而不是「DOM 里有 img」：
 *    本机服务没起时，img 元素照样在 DOM 里，只是 naturalWidth === 0（破图）。
 *    只数 DOM 会得出「一切正常」的假绿 —— 这正是本次故障「整页空白却零报错」的形态。
 *    所以本脚本把「破图」逐张列出来，并且**证据不足时拒绝产出截图**。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ADMIN_HELPER = await import('./_admin.mjs');

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', path: '/preview', out: '.tooling/_shot-preview.png', w: 440, h: 1000 };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') opt.base = argv[++i];
  else if (argv[i] === '--path') opt.path = argv[++i];
  else if (argv[i] === '--out') opt.out = argv[++i];
}
const base = opt.base.replace(/\/$/, '');

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'shotpv-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=' + opt.w + ',' + opt.h, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 未就绪 */ }
    await sleep(120);
  }
  throw new Error('连接 chrome 调试端口超时');
}

let ws, msgId = 0;
const pending = new Map();
function send(method, params) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evalJs(expression, awaitPromise) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: !!awaitPromise });
  if (r.exceptionDetails) throw new Error('页面内异常: ' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
  return r.result ? r.result.value : undefined;
}

/* 采集页面内所有图片的解码状态 + 舞台几何。返回 JSON 字符串。 */
const PROBE = `(() => {
  const scope = document.querySelector('.pv-stage') || document.querySelector('.phone') || document.body;
  const imgs = [...document.querySelectorAll('img')];
  const broken = imgs.filter((im) => im.complete && im.naturalWidth === 0).map((im) => im.currentSrc || im.src || '(空 src)');
  const loading = imgs.filter((im) => !im.complete).map((im) => im.src);
  const rect = scope.getBoundingClientRect();
  return JSON.stringify({
    imgTotal: imgs.length,
    imgOk: imgs.filter((im) => im.complete && im.naturalWidth > 0).length,
    broken: broken.slice(0, 8),
    loading: loading.slice(0, 8),
    stageText: (scope.innerText || '').trim().length,
    stageH: Math.round(rect.height),
    stageW: Math.round(rect.width)
  });
})()`;

(async () => {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('WS 失败'))); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: opt.w, height: opt.h, deviceScaleFactor: 1, mobile: false });

  /* /preview 的渲染数据来自需要管理员令牌的接口 → 先把令牌放进 localStorage（与 shot-console.mjs 同法） */
  const ADMIN = await ADMIN_HELPER.adminToken(base);
  await send('Page.navigate', { url: base + '/console' });
  await sleep(1200);
  await evalJs('localStorage.setItem("lexy_admin_token", ' + JSON.stringify(ADMIN) + ')');
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);

  await send('Page.navigate', { url: base + opt.path });
  /* 轮询等「目标事实」：图片全部 load 完（或超时）—— 不用固定 sleep（数据量一大就报废） */
  let st = null;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    st = JSON.parse(await evalJs(PROBE) || '{}');
    if (st.imgTotal > 0 && (st.broken || []).length === 0 && (st.loading || []).length === 0) break;
  }
  console.log('探测结果:', JSON.stringify(st));

  if (!st || !st.imgTotal) {
    throw new Error('页面上一个 img 都没有 —— 渲染链路没跑起来，拒绝产出截图（假证据比没有更糟）');
  }
  if ((st.broken || []).length) {
    throw new Error('存在破图（naturalWidth=0）: ' + st.broken.join(' , ') + ' —— 说明素材链路仍不通');
  }

  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const buf = Buffer.from(shot.data, 'base64');
  mkdirSync(dirname(opt.out), { recursive: true });
  writeFileSync(opt.out, buf);
  console.log('已截图 →', opt.out, '(' + Math.round(buf.length / 1024) + ' KB, 图片 ' + st.imgOk + '/' + st.imgTotal + ' 全部解码成功)');
  ws.close();
  child.kill();
  process.exit(0);
})().catch((e) => {
  console.error('失败：' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
