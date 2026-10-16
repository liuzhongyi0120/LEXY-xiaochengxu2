/**
 * 有赞首页装修 · 只读取证（无头浏览器，无需登录）
 *
 * 目的：把 `deploy/有赞首页装修-取证.md` 里的结论**变成可复现的命令**，
 *       而不是「某人某天看过一眼」。
 *
 * 取证对象：https://shop46010558.m.youzan.com/wscshop/showcase/homepage?kdt_id=45818390
 * 用法：node .tooling/_yz-home-evidence.mjs [--out .tooling/_yz-home-evidence.json]
 *
 * 取四类事实：
 *   ① 页面底色（复刻时逐字照抄的那个值）
 *   ② 区块清单：每个 .showcase-components-container 的组件类型（data-lazy-log-params.component）
 *   ③ 媒体统计：图片张数 / 视频个数（与复刻后的 12 图 4 视频对账）
 *   ④ 末尾区块的形态（首屏看不到，必须滚到底才触发懒加载）
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];
const URL = 'https://shop46010558.m.youzan.com/wscshop/showcase/homepage?kdt_id=45818390&sub_kdt_id=45818390';

const argv = process.argv.slice(2);
let outFile = '.tooling/_yz-home-evidence.json';
for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') outFile = argv[++i];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'yz-ev-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
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

/*
 * 逐**区块**滚动触发懒加载后，再统一 dump —— 有赞用 .lazy-component + data:image/gif 占位，
 * 不滚到位是不会真的加载的（这也是「首屏看着对、末尾全空」的由来）。
 *
 * ⚠️ 要滚的是**区块**（`.showcase-components-container > .lazy-component`），不是容器。
 *    整个首页只有 1 个 `.showcase-components-container` —— 按容器滚只会滚 1 次，
 *    于是末尾一片区块停在 100px 的占位高度，dump 出来看就像「页面只有 12 块」。
 */
const SCROLL_ALL = `(async () => {
  const blocks = [...document.querySelectorAll('.showcase-components-container > .lazy-component')];
  const root = document.querySelector('.showcase-components-container');
  for (const b of blocks) { b.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 300)); }
  if (root) root.scrollIntoView({ block: 'start' });
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 800));
  return { blocks: blocks.length, containers: document.querySelectorAll('.showcase-components-container').length };
})()`;

const DUMP = `(() => {
  const cs = [...document.querySelectorAll('.showcase-components-container > .lazy-component')];
  const comp = (el) => {
    const raw = el.getAttribute && el.getAttribute('data-lazy-log-params');
    if (!raw) return null;
    try { return (JSON.parse(decodeURIComponent(raw)) || {}).component || null; } catch (e) { return null; }
  };
  const blocks = cs.map((el, i) => {
    const r = el.getBoundingClientRect();
    const imgs = [...el.querySelectorAll('img')];
    const real = imgs.filter((im) => (im.currentSrc || im.src || '').indexOf('data:') !== 0);
    return {
      i: i + 1,
      component: comp(el),
      y: Math.round(r.top + window.scrollY),
      h: Math.round(r.height),
      imgs: real.length,
      videos: el.querySelectorAll('video').length,
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
    };
  });
  const roots = [document.body, document.querySelector('.page'), document.querySelector('#app'), document.querySelector('.showcase-page')]
    .filter(Boolean);
  return JSON.stringify({
    url: location.href,
    title: document.title,
    bodies: roots.map((e) => ({ cls: String(e.className).slice(0, 40), bg: getComputedStyle(e).backgroundColor })),
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    blocks: blocks.length,
    containers: document.querySelectorAll('.showcase-components-container').length,
    totalImgs: document.querySelectorAll('img').length,
    totalVideos: document.querySelectorAll('video').length,
    docH: document.documentElement.scrollHeight,
    blockList: blocks
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
  /*
   * 375×812：与小程序端 iPhone 档一致，量出来的尺寸才能直接对账。
   *
   * UA 一起改成手机 —— 有赞是**按 UA 出页**的，桌面 UA 下量出来的盒子跟真机手机端对不上。
   * 想亲眼看看差别：`NO_UA=1 node .tooling/_yz-home-evidence.mjs`。
   */
  if (!process.env.NO_UA) {
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      acceptLanguage: 'zh-CN,zh;q=0.9'
    });
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

  await send('Page.navigate', { url: URL });
  await sleep(5000);
  let scrolled = 0;
  try {
    const r = await evalJs(SCROLL_ALL, true);
    scrolled = (r && r.blocks) || 0;
  } catch (e) { console.log('滚动触发懒加载失败（继续）:', e.message); }
  console.log('已逐块滚动触发懒加载:', scrolled, '块');
  await sleep(1200);

  const raw = await evalJs(DUMP);
  const data = JSON.parse(raw || '{}');
  writeFileSync(outFile, JSON.stringify(data, null, 2));
  console.log('已写入 →', outFile);
  console.log('底色 html/body :', data.htmlBg, '/', data.bodyBg);
  console.log('区块数:', data.blocks, ' 图:', data.totalImgs, ' 视频:', data.totalVideos, ' 文档高:', data.docH);
  (data.blockList || []).forEach((b) => {
    console.log('  ' + String(b.i).padStart(2) + '. y=' + String(b.y).padStart(5) + ' h=' + String(b.h).padStart(5) +
      ' comp=' + String(b.component).padEnd(14) + ' img=' + b.imgs + ' video=' + b.videos +
      (b.text ? '  「' + b.text + '」' : ''));
  });

  ws.close();
  child.kill();
  process.exit(0);
})().catch((e) => {
  console.error('失败：' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
