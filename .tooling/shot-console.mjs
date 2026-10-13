/**
 * 后台 UI 取证截图（真 Chrome 无头，零依赖，直连 CDP）
 *
 * 用法：node .tooling/shot-console.mjs [--base http://127.0.0.1:3000] [--w 1440]
 * 产物：.tooling/_ui-shots/<view>.png（整页截图）+ 控制台打印每页的标题与正文长度
 *
 * 用途：改后台 UI **之前**先看它到底长什么样（铁律 28：先取证再改码）。
 * 顺带抓一类静态断言看不见的问题：地址栏 hash 与真实视图是否对得上
 * （控制台的 hash 是 App.go 写的「视图 key」，写错会 fallback 到 dashboard 而不报错）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_HELPER = await import('./_admin.mjs');

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', w: 1440, h: 1000 };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') opt.base = argv[++i];
  else if (argv[i] === '--w') opt.w = Number(argv[++i]);
  else if (argv[i] === '--h') opt.h = Number(argv[++i]);
}
const base = opt.base.replace(/\/$/, '');

/* 视图 key 一律取 console.core.js 的 NAV（写错 hash 会静默回落 dashboard，这里用探针盯住） */
const VIEWS = ['dashboard', 'orders', 'customers', 'goods', 'categories', 'comments', 'marketing', 'media', 'decorate', 'settings'];

const OUT = '.tooling/_ui-shots';
mkdirSync(OUT, { recursive: true });

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'shot-'));
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

const META = `(()=>{
  const t = document.getElementById('pgTitle');
  const nav = document.querySelector('.nav-item.on span:last-child');
  const body = document.getElementById('body');
  return JSON.stringify({
    hash: location.hash,
    title: t ? t.textContent.trim() : '',
    navOn: nav ? nav.textContent.trim() : '',
    bodyLen: body ? (body.innerText || '').trim().length : -1,
    cards: body ? body.querySelectorAll('.card').length : -1,
    rows: body ? body.querySelectorAll('tbody tr').length : -1
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

  const ADMIN = await ADMIN_HELPER.adminToken(base);
  await send('Page.navigate', { url: base + '/console' });
  await sleep(1200);
  await send('Runtime.evaluate', {
    expression: 'localStorage.setItem("lexy_admin_token", ' + JSON.stringify(ADMIN) + ')'
  });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);

  console.log('后台 UI 取证（' + opt.w + '×' + opt.h + '，' + base + '）\n');
  console.log('页面'.padEnd(14) + '标题'.padEnd(12) + '高亮菜单'.padEnd(12) + '正文'.padEnd(8) + '卡片/表行');
  const meta = [];
  for (const v of VIEWS) {
    await send('Page.navigate', { url: base + '/console#' + v });
    await sleep(2400);
    const r = await send('Runtime.evaluate', { expression: META, returnByValue: true });
    const d = r.result && r.result.value ? JSON.parse(r.result.value) : {};
    meta.push({ view: v, ...d });
    console.log(String(v).padEnd(14) + String(d.title || '?').padEnd(12) + String(d.navOn || '?').padEnd(12) +
      String(d.bodyLen).padEnd(8) + d.cards + '/' + d.rows);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(join(OUT, 'console-' + v + '.png'), Buffer.from(shot.data, 'base64'));
  }

  /* 装修台：列表页 + 编辑器（组件库）
   *
   * ⚠️ 编辑器必须走 `?edit=home` 直达 —— 列表里的「装修」是
   *    `<a href="/admin?edit=xxx" target="_blank">`，已经没有 data-open 可点了。
   *    只截列表页时看不出组件库的样子（列表页不渲染 libGrid），
   *    而组件库恰恰是「未支持 / 依赖占位收进折叠组」这次改动的主战场。 */
  await send('Page.navigate', { url: base + '/admin' });
  await sleep(3200);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, 'admin-list.png'), Buffer.from(shot.data, 'base64'));
  console.log('\n装修台 /admin 已截图');

  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url: base + '/admin?edit=home' });
  await sleep(3600);
  /* 切到「基础组件」tab —— 默认的「常用组件」tab 是空的，截出来看不出组件库 */
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const t = [...document.querySelectorAll('.lib-tabs .lib-tab')].find((x) => /基础组件/.test(x.textContent));
      if (t) { t.click(); await new Promise((r) => setTimeout(r, 500)); }
      return 'ok';
    })()`,
    awaitPromise: true, returnByValue: true
  });
  await sleep(700);
  const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, 'admin-edit-lib-collapsed.png'), Buffer.from(shot2.data, 'base64'));
  console.log('装修台编辑器（组件库 · 折叠态）已截图');

  /* 展开折叠区再来一张，便于肉眼比对「默认只看到能用的」与「展开是完整清单」 */
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const h = document.querySelector('.lib-rest-head');
      if (h) { h.click(); await new Promise((r) => setTimeout(r, 500)); }
      return 'ok';
    })()`,
    awaitPromise: true, returnByValue: true
  });
  await sleep(700);
  const shot3 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, 'admin-edit-lib-expanded.png'), Buffer.from(shot3.data, 'base64'));
  console.log('装修台编辑器（组件库 · 展开态）已截图');

  writeFileSync(join(OUT, '_meta.json'), JSON.stringify(meta, null, 2));

  const bad = meta.filter((m) => m.title === '' || m.bodyLen <= 0);
  if (bad.length) console.log('\n⚠️ 有页面没渲染出内容：' + bad.map((b) => b.view).join(', '));
  ws.close();
  child.kill();
  process.exit(0);
})().catch((e) => {
  console.error('失败：' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
