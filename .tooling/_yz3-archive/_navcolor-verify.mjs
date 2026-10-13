/**
 * 导航图标染色（CSS filter 逼近）**真浏览器实测**探针。
 *
 * ⚠️ **已归档（2026-10-13 第 48 批）**：本脚本验的是第 46 批的 **CSS filter** 方案，
 *    该方案已被推翻 —— 微信渲染层对 `<image>` 的 filter 不可靠（实测出实心色块、alpha 被丢），
 *    现改为**服务端像素级染色** `/navicon/`（见 `server/lib/png.js` + `server/lib/navicon.js`
 *    与 `.workbuddy/memory/PITFALLS.md` T 节）。本脚本连同比对脚本 `navcolor-verify.py` 一起挪进
 *    `_yz3-archive/` 仅作历史保留：**它验的「浏览器里 Δmax=2」是真的，只是验错了层**。
 *
 * 为什么当初必须实测：`miniprogram/utils/navcolor.js` 里的误差是我**自己按 CSS 规范矩阵
 * 模拟**出来的。真实浏览器在「每个滤镜原语之后是否立即把通道夹到 0..1」这件事上
 * 与模拟未必一致，而这会直接改变结果色。模拟说 Δmax≤2，不实测就等于自说自话。
 *
 * 测法（把不确定因素降到最少）：
 *   ① 纯色块等效法：图标压黑后是「黑色 + 原 alpha」，不透明笔画的最终颜色
 *      = 同样的 filter 作用在**纯色块**上的颜色。所以拿一个大色块量中心像素，
 *      既没有抗锯齿干扰，也不依赖图标笔画的形状 —— 量到的就是笔画的真实颜色。
 *   ② 再顺带把真图标（img + filter）渲染出来取「出现次数最多的非背景色」，
 *      确认 filter 在 <img> 上确实生效（不只是色块上生效）。
 *
 * 产出：.tooling/_cmp/navcolor-grid.png ＋ .tooling/_cmp/navcolor-cells.json
 *      （取样与比对交给同目录的 navcolor-verify.py，它带 PIL）
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const NC = require('../miniprogram/utils/navcolor.js');

const BASE = (process.env.NAV_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = resolve('.tooling/_cmp');
mkdirSync(OUT, { recursive: true });

/**
 * 图标以 **base64 内联**进测试页，不走网络。
 * 原因（实测踩到）：测试页是 `data:text/html` 文档，它拉 `http://127.0.0.1:3000/images/…`
 * 一律失败（naturalWidth 全 0）——那样「量到的是白底」会被误读成「染色失败」。
 * 内联的 PNG 与服务器返回的是**同一份字节**，只去掉了网络这个变量。
 */
const inlined = {};
['home.png', 'home-active.png'].forEach((f) => {
  inlined[f] = 'data:image/png;base64,' +
    readFileSync(resolve('miniprogram/images/tabbar', f)).toString('base64');
});

/* 目标色：覆盖默认灰 / 品牌红 / 纯黑白 / 深浅灰 / 高饱和与低饱和的多种色相 */
const COLORS = [
  '#8A8A8A', '#C8102E', '#000000', '#FFFFFF', '#1A1A1A', '#2B6CB0',
  '#0F9D58', '#F5A623', '#7B3FE4', '#FF0080', '#00A0A0', '#666666',
  '#C0C0C0', '#334155', '#E11D48'
];

/** 源色（图标笔画的原色）—— 用真实的原色做底，链路与真机完全一致 */
const SRC_OFF = NC.SRC_OFF;
const SRC_ON = NC.SRC_ON;

const CELL = 100;     // 色块边长
const PITCH = 110;    // 含间隙的步距
const COLS = 5;
const MARGIN = 10;

const blockCells = [];
COLORS.forEach((hex, i) => {
  blockCells.push({
    kind: 'block', hex, src: SRC_OFF,
    filter: NC.tintFilter(hex),
    x: MARGIN + (i % COLS) * PITCH,
    y: MARGIN + Math.floor(i / COLS) * PITCH
  });
});

/* 第二段：真图标（<img> + filter）。用 132px（≈2× 原始 66px）让笔画宽到能取纯色 */
const IMG_CELL = 140;
const imgBaseY = MARGIN + Math.ceil(COLORS.length / COLS) * PITCH + 20;
const ICON_COLORS = ['#2B6CB0', '#0F9D58', '#F5A623', '#7B3FE4', '#000000'];
const imgCells = [];
ICON_COLORS.forEach((hex, i) => {
  imgCells.push({
    kind: 'img', hex, src: SRC_OFF, file: 'home.png',
    filter: NC.iconFilter('/images/tabbar/' + 'home.png', hex),
    x: MARGIN + i * IMG_CELL, y: imgBaseY, w: IMG_CELL, h: IMG_CELL
  });
});
const imgOnY = imgBaseY + IMG_CELL;
ICON_COLORS.forEach((hex, i) => {
  imgCells.push({
    kind: 'img', hex, src: SRC_ON, file: 'home-active.png',
    filter: NC.iconFilter('/images/tabbar/' + 'home-active.png', hex),
    x: MARGIN + i * IMG_CELL, y: imgOnY, w: IMG_CELL, h: IMG_CELL
  });
});

/* 画布宽要同时容下两段 —— 只按色块那段算的话，图标行右侧两格会落在截图之外，
   PIL 裁到越界区会补黑，取色就变成「#000000，228 级误差」这种假故障。 */
const W = Math.max(
  MARGIN * 2 + COLS * PITCH - (PITCH - CELL),
  MARGIN * 2 + ICON_COLORS.length * IMG_CELL
);
const H = imgOnY + IMG_CELL + MARGIN;

const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#FFFFFF;}
  .blk{position:absolute;width:${CELL}px;height:${CELL}px;}
  .cell{position:absolute;display:flex;align-items:center;justify-content:center;background:#FFFFFF;}
  .cell img{width:132px;height:132px;display:block;}
</style>
${blockCells.map((c) => `<div class="blk" data-hex="${c.hex}" style="left:${c.x}px;top:${c.y}px;background:${c.src};filter:${c.filter || 'none'}"></div>`).join('\n')}
${imgCells.map((c) => `<div class="cell" data-hex="${c.hex}" data-file="${c.file}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px"><img src="${inlined[c.file]}" style="filter:${c.filter || 'none'}"></div>`).join('\n')}
`;

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe',
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9900 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(join(tmpdir(), 'navcol-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=800,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const p = list.filter((t) => t.type === 'page')[0];
    if (p && p.webSocketDebuggerUrl) {
      ws = new WebSocket(p.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
      break;
    }
  } catch (e) { /* 未就绪 */ }
  await sleep(120);
}
if (!ws) throw new Error('连接 chrome 调试端口超时');

let _id = 0;
const _pending = new Map();
ws.addEventListener('message', (evt) => {
  const m = JSON.parse(evt.data);
  if (m.id && _pending.has(m.id)) {
    const { resolve: rs, reject: rj } = _pending.get(m.id);
    _pending.delete(m.id);
    if (m.error) rj(new Error(m.error.message + ' :: ' + JSON.stringify(m.error.data || '')));
    else rs(m.result);
  }
});
const raw = (method, params, sessionId, timeoutMs) => new Promise((rs, rj) => {
  const id = ++_id;
  _pending.set(id, { resolve: rs, reject: rj });
  const msg = { id, method, params: params || {} };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); rj(new Error('timeout ' + method)); } }, timeoutMs || 60000);
});
const ev = async (sid, expression) => {
  const r = await raw('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sid);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
};

const tid = (await raw('Target.createTarget', { url: 'about:blank' })).targetId;
const sid = (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
await raw('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: false, screenWidth: W, screenHeight: H,
}, sid);
await raw('Page.enable', {}, sid);

const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
await raw('Page.navigate', { url: dataUrl }, sid);
await sleep(1200);

/* 等图标真的加载完（加载失败时 naturalWidth=0，用图取色会得出「背景色」这种假结论） */
const imgStat = await ev(sid, `(async () => {
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; })));
  return JSON.stringify({ n: imgs.length, ok: imgs.filter((i) => i.naturalWidth > 0).length,
                          sizes: imgs.slice(0, 2).map((i) => i.naturalWidth + 'x' + i.naturalHeight) });
})()`);
console.log('图标加载：', imgStat);

const { data } = await raw('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
}, sid, 120000);
writeFileSync(join(OUT, 'navcolor-grid.png'), Buffer.from(data, 'base64'));
writeFileSync(join(OUT, 'navcolor-cells.json'), JSON.stringify({
  base: BASE, w: W, h: H, cell: CELL,
  blocks: blockCells, imgs: imgCells,
}, null, 1));

console.log(`已写出 .tooling/_cmp/navcolor-grid.png（${W}×${H}）与 navcolor-cells.json`);
console.log('色块数 =', blockCells.length, ' 图标格数 =', imgCells.length);
child.kill();
ws.close();
process.exit(0);
