/**
 * 底色探针：把「有赞原页」与「本店 /preview」的**整条祖先链背景色**并排打出来。
 *
 * 为什么要单独一个脚本（而不是塞进 _yz3-compare.mjs）：
 *   对账表量的是「模块自己的盒子与样式」，而底色差异出在**模块之外**（页面根节点的 background）。
 *   复刻 03 页时对账表全绿，但逐像素一取样就发现「卡片外我们 247,248,250、有赞 255」——
 *   这类问题只有把祖先链摊开才定位得到。
 *
 * ⚠️ 关键前提：`/preview` 里 `#preview` 元素**本身就是** `.mp-root`
 *   （`server/public/preview/index.html`：`<div class="phone-screen mp-root" id="preview">`），
 *   真机 WXSS 的 `page{}` 就编译到它身上。所以 `#preview` 的背景色 == 真机页面底色。
 *
 * 用法：node .tooling/_yz3-bg-probe.mjs [--key p297] [--yz <url>] [--base http://127.0.0.1:3000]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import adminToken from './_admin.mjs';

const argv = process.argv.slice(2);
const opt = {
  base: 'http://127.0.0.1:3000',
  key: 'p297',
  yz: 'https://shop46010558.m.youzan.com/wscshop/feature/pWuQ9DAXB8',
  yzsel: '[class*="cap-showcase-wrapper"]',
  sel: '.c-ccard',
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]; const eq = a.indexOf('=');
  const k = eq > 0 ? a.slice(0, eq) : a;
  const v = eq > 0 ? a.slice(eq + 1) : argv[i + 1];
  if (k === '--key') { opt.key = v; if (eq < 0) i++; }
  else if (k === '--yz') { opt.yz = v; if (eq < 0) i++; }
  else if (k === '--yzsel') { opt.yzsel = v; if (eq < 0) i++; }
  else if (k === '--sel') { opt.sel = v; if (eq < 0) i++; }
  else if (k === '--base') { opt.base = v; if (eq < 0) i++; }
}
const BASE = opt.base.replace(/\/$/, '');

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe',
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'yz3bg-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=900,1400', 'about:blank',
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
const raw = (method, params, sessionId) => new Promise((rs, rj) => {
  const id = ++_id;
  _pending.set(id, { resolve: rs, reject: rj });
  const msg = { id, method, params: params || {} };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); rj(new Error('timeout ' + method)); } }, 90000);
});
const newTab = async (url) => (await raw('Target.createTarget', { url })).targetId;
const attach = async (tid) => (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
const ev = async (sid, expression) => {
  const r = await raw('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sid);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
};

/** 从某点往上走，把每个祖先的背景色 + 盒子 + **会裁掉子元素视觉的属性**都记下来。
 *  overflow 尤其要有：复刻 01 页卡片投影时，计算样式里 `box-shadow` 明明一致（都 0 2px 4px 6%），
 *  像素上却一点投影都没有 —— 根因就是某一层祖先的 `overflow: hidden` 把它裁掉了。
 *  这类问题只看单元素的 computed style 永远查不出来。 */
const CHAIN = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
  const out = [];
  for (let e = el; e && e !== document.documentElement.parentNode; e = e.parentElement) {
    const c = getComputedStyle(e); const r = e.getBoundingClientRect();
    out.push({ el: tag(e).slice(0, 60), bg: c.backgroundColor,
      ov: c.overflow, bs: c.boxShadow, br: c.borderRadius, pos: c.position,
      x: +r.x.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  }
  return out;
})()`;

const show = (title, chain) => {
  console.log(`\n── ${title} ──`);
  if (!chain) { console.log('  （选择器没选到元素）'); return; }
  for (const r of chain) {
    console.log(`  ${r.bg.padEnd(20)} ov=${r.ov.padEnd(16)} x=${String(r.x).padStart(6)} w=${String(r.w).padStart(6)}  ${r.el}`);
    if (r.bs && r.bs !== 'none') console.log(`      ↳ box-shadow: ${r.bs}`);
  }
};

/* ---------------------------------------------------------------- 本店侧 */
const TOKEN = await adminToken(BASE);
{
  const tid = await newTab(BASE + '/preview');
  const sid = await attach(tid);
  await raw('Page.enable', {}, sid);
  await raw('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: false, screenWidth: 375, screenHeight: 812,
  }, sid);
  await sleep(1200);
  await ev(sid, `localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); location.reload(); true`);
  await sleep(3500);
  const picked = await ev(sid, `(() => {
    const b = document.querySelector('.pv-item[data-key=${JSON.stringify(opt.key)}]');
    if (!b) return '未找到页面 ' + ${JSON.stringify(opt.key)};
    b.click(); return 'ok';
  })()`);
  if (picked !== 'ok') throw new Error(picked);
  await sleep(3500);
  /* 与 _yz3-compare.mjs 完全同一套拆壳动作，保证两边量的是同一状态 */
  await ev(sid, `(() => {
    const set = (sel, css) => { const e = document.querySelector(sel); if (e) Object.assign(e.style, css); };
    set('.pv-top', { display: 'none' }); set('.pv-side', { display: 'none' });
    set('.pv-status', { display: 'none' }); set('.pv-note', { display: 'none' });
    set('.pv-main', { display: 'block', padding: '0' });
    set('.pv-stage', { padding: '0', display: 'block' });
    set('#phone', { width: '375px', border: '0', borderRadius: '0', boxShadow: 'none', margin: '0' });
    set('.phone-bar', { display: 'none' });
    set('#preview', { height: 'auto', maxHeight: 'none', minHeight: '0', overflow: 'visible' });
    set('body', { background: '#fff', margin: '0' });
    return true;
  })()`);
  await sleep(1000);
  console.log('═══ 本店 /preview（' + opt.key + '）═══');
  /* #preview 本身就是 .mp-root —— 它的 backgroundColor 就是真机页面底色 */
  show('#preview 起（含 #preview 自身）', await ev(sid, CHAIN('#preview')));
  show('.c-ccard 起的祖先链', await ev(sid, CHAIN('.c-ccard')));
  if (opt.sel !== '.c-ccard') show(opt.sel + ' 起的祖先链', await ev(sid, CHAIN(opt.sel)));
  /* 直接问「卡片外那一点是谁在画」 */
  console.log('\n── 取色点命中（CSS x=2，从卡片外一路往下取）──');
  console.log(await ev(sid, `(() => {
    const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
      (e.className && typeof e.className === 'string' ? '.' + String(e.className).trim().split(/\\s+/)[0] : '');
    const root = document.querySelector('#preview');
    const r = root.getBoundingClientRect();
    scrollTo(0, 0);
    return [30, 60, 220, 400, 1200].map((cssY) => {
      const e = document.elementFromPoint(2, r.top + cssY);
      return '  ' + cssY + 'px → ' + (e ? tag(e) + ' bg=' + getComputedStyle(e).backgroundColor : 'null');
    }).join('\\n');
  })()`));
  await raw('Target.closeTarget', { targetId: tid }).catch(() => {});
}

/* ---------------------------------------------------------------- 有赞侧 */
{
  const tid = await newTab('about:blank');
  const sid = await attach(tid);
  await raw('Page.enable', {}, sid);
  await raw('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 812,
  }, sid);
  await raw('Page.navigate', { url: opt.yz }, sid);
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    const st = await raw('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sid);
    if (st.result.value === 'complete' && i >= 6) break;
  }
  await sleep(2500);
  console.log('\n═══ 有赞原页 ═══');
  show(opt.yzsel + ' 起的祖先链', await ev(sid, CHAIN(opt.yzsel)));
  /* 有赞微页面真正铺白的是平台级的 `.content`（`body` 自己是 247,248,250 的灰）——
     每次都要确认这一条，否则会误以为「有赞也是灰的」。 */
  show('div.content 起（平台级内容白底）', await ev(sid, CHAIN('div.content')));
  console.log('\n── 取色点命中 ──');
  console.log(await ev(sid, `(() => {
    const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
      (e.className && typeof e.className === 'string' ? '.' + String(e.className).trim().split(/\\s+/)[0] : '');
    const root = document.querySelector('[rm-id*="web-feature-page-steup"]') || document.body;
    const r = root.getBoundingClientRect();
    const probe = (cssY) => {
      const e = document.elementFromPoint(2, r.top + cssY - scrollY);
      return cssY + 'px → ' + (e ? tag(e) + ' bg=' + getComputedStyle(e).backgroundColor : 'null');
    };
    return [220, 400, 1200].map(probe);
  })()`));
  await raw('Target.closeTarget', { targetId: tid }).catch(() => {});
}

child.kill();
process.exit(0);
