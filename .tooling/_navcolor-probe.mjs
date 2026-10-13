/**
 * 「导航图标色」改造后的装修台侧取证（真浏览器）。
 *
 * 验三件事，每件都要有可复核的证据，不靠「看起来对」：
 *   A. 面板结构：schema 里新拆的两组「导航图标色 / 导航背景色」**默认展开**，
 *      四个色值字段都在（原来是折叠的一个「配色」组，运营找不到入口）。
 *   B. 默认态零变化：replica 里的默认配色下，手机壳图标**不带任何 filter**
 *      （computed style 的 filter 必须是 none / 空），像素与改造前一致。
 *   C. 改色真的生效：调用**真 preview 模块** window.PvTabbar.apply 渲染一份
 *      临时导航条（未选中 #2B6CB0 / 选中 #0F9D58），把图标放大到 66px 好取样，
 *      截图后用 Python 逐项取笔画色 —— 必须命中目标色。
 *      为什么放大：真机导航图标只有 22px，笔画落下不到 1.5px，取到的全是
 *      抗锯齿过渡色，会把「染对了」误判成「染错了」（filter 语义与尺寸无关）。
 *
 * 前置：node server/index.js（DEBUG_PAGE 开）+ 本机 Chrome 开着调试端口。
 * 用法：node .tooling/_navcolor-probe.mjs [--shot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NC = require('../miniprogram/utils/navcolor.js');

const SITE = 'http://127.0.0.1:3000';
const OUT = '.tooling/_cmp';
const SHOT = process.argv.includes('--shot');

/* 用来验色的目标配色（刻意都不是默认值，否则「不染」与「染对了」分不出来） */
const OFF_COLOR = '#2B6CB0';
const ON_COLOR = '#0F9D58';
const ACTIVE_PATH = '/pages/lexy/lexy';   // 第 2 项高亮

/* ----------------------------- 自建 CDP 连接 ----------------------------- */
const PORT_FILE = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/DevToolsActivePort');
const [PORT, WS_PATH] = fs.readFileSync(PORT_FILE, 'utf8').trim().split('\n');
const WS_URL = `ws://127.0.0.1:${PORT}${WS_PATH}`;

let _ws = null, _id = 0;
const _pending = new Map(), _sessions = new Map();

function connect() {
  if (_ws && _ws.readyState === 1) return Promise.resolve(_ws);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener('open', () => { _ws = ws; resolve(ws); });
    ws.addEventListener('error', (e) => reject(new Error('WS error: ' + (e.message || 'unknown'))));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && _pending.has(m.id)) {
        const { res, rej } = _pending.get(m.id);
        _pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message + ' ' + (m.error.data || '')));
        else res(m.result);
      }
    });
  });
}
function raw(method, params, sid) {
  return new Promise((res, rej) => {
    const id = ++_id;
    _pending.set(id, { res, rej });
    const msg = { id, method, params: params || {} };
    if (sid) msg.sessionId = sid;
    _ws.send(JSON.stringify(msg));
    setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); rej(new Error('timeout ' + method)); } }, 90000);
  });
}
async function session(tid) {
  if (_sessions.has(tid)) return _sessions.get(tid);
  const { sessionId } = await raw('Target.attachToTarget', { targetId: tid, flatten: true });
  _sessions.set(tid, sessionId);
  return sessionId;
}
async function ev(tid, expr) {
  const sid = await session(tid);
  const r = await raw('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, sid);
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return r.result && r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: String(detail == null ? '' : detail) });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

/* --------------------------- 取管理员会话令牌 --------------------------- */
const PW = process.env.ADMIN_PASSWORD || 'admin';
const TOKEN = await (async () => {
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW })
  });
  const j = await r.json().catch(() => null);
  return j && j.code === 0 && j.data ? j.data.token : '';
})();
if (!TOKEN) { console.error('拿不到管理员会话（服务没起或口令不对）'); process.exit(1); }

await connect();
const created = await raw('Target.createTarget', { url: 'about:blank' });
const tid = created.targetId;
const sid = await session(tid);
await raw('Page.enable', {}, sid);
await raw('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
await raw('Page.navigate', { url: SITE + '/admin?edit=nav' }, sid);
await sleep(2200);
await raw('Runtime.evaluate', {
  expression: `localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); localStorage.removeItem('lexy_admin_me'); 'ok'`,
  returnByValue: true
}, sid);
await raw('Page.navigate', { url: SITE + '/admin?edit=nav' }, sid);
await sleep(4200);

/* ========================= A. 面板结构 ========================= */
console.log('════════════ A. 面板结构（分组默认展开 + 四个色值字段） ════════════');
const panel = await ev(tid, `(() => {
  const host = document.getElementById('inspector');
  if (!host) return JSON.stringify({ err: '没有 #inspector' });
  const groups = [];
  host.querySelectorAll('.grp').forEach((g) => {
    const head = g.querySelector('.grp-head');
    const label = head ? String(head.innerText || '').trim().split('\\n')[0] : '';
    if (!label || label === '页面设置') return;
    const flds = [];
    g.querySelectorAll('.grp-body > .fld').forEach((f) => {
      const lb = f.querySelector('label');
      const t = lb ? String(lb.innerText || '').trim() : '';
      const hex = f.querySelector('input[type=text]');
      if (t) flds.push(t + (hex && hex.value ? '=' + hex.value : ''));
    });
    groups.push({ label, open: g.classList.contains('open'), fields: flds });
  });
  return JSON.stringify({ groups });
})()`);
let panelData = null;
try { panelData = JSON.parse(panel); } catch (e) { console.log('  ' + String(panel).slice(0, 400)); }
if (panelData && panelData.groups) {
  panelData.groups.forEach((g) => console.log(`  · 「${g.label}」 open=${g.open}  →  ${g.fields.join(' / ')}`));
  const iconGrp = panelData.groups.filter((g) => g.label === '导航图标色')[0];
  const bgGrp = panelData.groups.filter((g) => g.label === '导航背景色')[0];
  ok('存在「导航图标色」组且默认展开', iconGrp && iconGrp.open, iconGrp ? 'open=' + iconGrp.open : '没找到该组');
  ok('存在「导航背景色」组且默认展开', bgGrp && bgGrp.open, bgGrp ? 'open=' + bgGrp.open : '没找到该组');
  ok('两组共 4 个色值字段（未选中色/选中色/背景色/顶部分割线）',
    !!iconGrp && !!bgGrp && iconGrp.fields.length === 2 && bgGrp.fields.length === 2,
    [iconGrp && iconGrp.fields.join(','), bgGrp && bgGrp.fields.join(',')].filter(Boolean).join(' | '));
  ok('不再有旧的折叠「配色」组', !panelData.groups.some((g) => g.label === '配色'));
} else {
  ok('面板结构可读', false, 'dump 失败');
}

/* ========================= B. 默认态零变化 ========================= */
console.log('\n════════════ B. 默认配色下手机壳图标不带 filter（零变化） ════════════');
const shell = await ev(tid, `(() => {
  const nav = document.querySelector('#preview .pvtb') || document.querySelector('.pvtb');
  if (!nav) return JSON.stringify({ err: '手机壳里没有 .pvtb' });
  const items = [];
  nav.querySelectorAll('.pvtb-item').forEach((it) => {
    const img = it.querySelector('img');
    const cs = img ? getComputedStyle(img) : null;
    items.push({
      text: (it.querySelector('.pvtb-text') || {}).textContent || '',
      color: getComputedStyle(it).color,
      src: img ? img.getAttribute('src') : '',
      filter: cs ? cs.filter : '',
      inline: img ? (img.getAttribute('style') || '') : ''
    });
  });
  const cfg = (window.CUR && window.CUR.tabbar) || null;
  return JSON.stringify({ items, color: cfg && cfg.color, selectedColor: cfg && cfg.selectedColor });
})()`);
let shellData = null;
try { shellData = JSON.parse(shell); } catch (e) { console.log('  ' + String(shell).slice(0, 300)); }
if (shellData && shellData.items) {
  console.log(`  当前配置 color=${shellData.color} selectedColor=${shellData.selectedColor}`);
  shellData.items.forEach((i) => console.log(`  · ${i.text}  color=${i.color}  filter=${i.filter || '(空)'}  ${i.src}`));
  ok('默认态：所有图标 computed filter 为 none',
    shellData.items.every((i) => !i.filter || i.filter === 'none'),
    shellData.items.map((i) => i.filter || 'none').join(' | '));
  ok('默认态：图标 inline style 里没有 filter',
    shellData.items.every((i) => !/filter/.test(i.inline)),
    shellData.items.map((i) => i.inline || '(无)').slice(0, 2).join(' | '));
} else {
  ok('手机壳底部导航可读', false, 'dump 失败');
}

/* ========================= C. 改色真的生效 ========================= */
console.log('\n════════════ C. 改色生效（真 preview 模块渲染 + 像素取样） ════════════');
/* 把临时导航条放到页面右上角一个干净区域，图标放大到 66px 便于取样。
   宽度 375 = 手机壳基准宽，5 项均分 → 每 75px 一项。 */
const SCRATCH = { x: 20, y: 20, w: 375, h: 130 };
const renderOut = await ev(tid, `(() => {
  if (!window.PvTabbar) return JSON.stringify({ err: '页面里没有 PvTabbar' });
  const old = document.getElementById('navcolorScratch');
  if (old) old.remove();
  const st = document.createElement('style');
  st.id = 'navcolorScratchStyle';
  st.textContent = '#navcolorScratch{position:fixed;left:${SCRATCH.x}px;top:${SCRATCH.y}px;width:${SCRATCH.w}px;' +
    'height:${SCRATCH.h}px;z-index:99999;background:#FFFFFF;box-shadow:0 0 0 1px #ddd} ' +
    '#navcolorScratch .pvtb{height:${SCRATCH.h - 10}px} ' +
    '#navcolorScratch .pvtb-item{overflow:visible;height:auto} ' +
    '#navcolorScratch .pvtb-ico{height:70px} ' +
    '#navcolorScratch .pvtb-ico img{width:66px;height:66px} ' +
    '#navcolorScratch .pvtb-text{font-size:12px}';
  document.head.appendChild(st);
  const box = document.createElement('div');
  box.id = 'navcolorScratch';
  document.body.appendChild(box);
  const cfg = Object.assign({}, (window.CUR && window.CUR.tabbar) || window.PvTabbar.DEFAULT, {
    color: ${JSON.stringify(OFF_COLOR)}, selectedColor: ${JSON.stringify(ON_COLOR)}, iconMode: 'always'
  });
  window.PvTabbar.apply(box, cfg, ${JSON.stringify(ACTIVE_PATH)}, false);
  const out = [];
  box.querySelectorAll('.pvtb-item').forEach((it) => {
    const img = it.querySelector('img');
    out.push({
      text: (it.querySelector('.pvtb-text') || {}).textContent || '',
      color: getComputedStyle(it).color,
      src: img ? img.getAttribute('src') : '',
      filter: img ? getComputedStyle(img).filter : '',
      inline: img ? (img.getAttribute('style') || '') : ''
    });
  });
  return JSON.stringify({ items: out });
})()`);
let scratch = null;
try { scratch = JSON.parse(renderOut); } catch (e) { console.log('  ' + String(renderOut).slice(0, 400)); }
if (scratch && scratch.items) {
  scratch.items.forEach((i) => console.log(`  · ${i.text}  text-color=${i.color}\n      filter=${(i.filter || '(空)').slice(0, 96)}…`));
  const offItems = scratch.items.filter((i) => i.src && !/-active\.png$/.test(i.src));
  const onItems = scratch.items.filter((i) => /-active\.png$/.test(i.src));
  ok('未选中项图标挂上了染色 filter', offItems.length > 0 && offItems.every((i) => /brightness\(0\)/.test(i.filter)),
    offItems.length + ' 项：' + (offItems[0] ? offItems[0].filter.slice(0, 60) : '-'));
  ok('选中项图标挂上了染色 filter', onItems.length > 0 && onItems.every((i) => /brightness\(0\)/.test(i.filter)),
    onItems.length + ' 项：' + (onItems[0] ? onItems[0].filter.slice(0, 60) : '-'));
  ok('两态用的是**不同**的 filter（未选中色 ≠ 选中色）',
    offItems[0] && onItems[0] && offItems[0].filter !== onItems[0].filter);
  /* ⚠️ 不要拿 `getComputedStyle(img).filter` 去比 navcolor.js 的字符串：
     浏览器会把作者写法**归一化**（`saturate(100%)` → `saturate(1)`、`invert(25%)` → `invert(0.25)`），
     逐字符比必然不等 —— 那是断言写错，不是代码坏（本轮实测踩到，报了一条假红）。
     要比的是**作者写进 style 属性的原字符串**，读 inline style 才对。
     末尾分号可有可无（预览渲染层不写、真机组件写），比之前先归一掉。 */
  const stripSemi = (s) => String(s || '').replace(/;\s*$/, '');
  const wantOff = 'filter:' + NC.tintFilter(OFF_COLOR);
  ok('渲染出的 filter 与 navcolor.js 算的逐字符一致（比 inline style，不比 computed）',
    offItems[0] && stripSemi(offItems[0].inline) === wantOff,
    offItems[0] ? (stripSemi(offItems[0].inline) === wantOff ? '一致' : 'inline=' + offItems[0].inline.slice(0, 80)) : '-');
} else {
  ok('临时导航条渲染成功', false, '渲染失败');
}

/* ========================= D. 配色示意（交付图） ========================= */
/* 用真图标 + 真渲染模块（window.PvTabbar）画 4 套配色，2 倍图导出到 deliverables/。
   为什么值得单独出一张：自检与像素取样能证明「对了」，但看不出来「长什么样」；
   这张图是给运营/决策看的 —— 一眼就能确认图标确实跟着色走。 */
const PALETTE = [
  { name: '默认（未选中 #8A8A8A / 选中 #C8102E）· 与改造前逐像素相同', color: '#8A8A8A', selectedColor: '#C8102E' },
  { name: '蓝 / 绿（未选中 #2B6CB0 / 选中 #0F9D58）', color: '#2B6CB0', selectedColor: '#0F9D58' },
  { name: '黑 / 金（未选中 #1A1A1A / 选中 #F5A623）', color: '#1A1A1A', selectedColor: '#F5A623' },
  { name: '品牌红 / 深灰（未选中 #C8102E / 选中 #333333）', color: '#C8102E', selectedColor: '#333333' }
];
const PAL_W = 375, PAL_PAD = 12, PAL_CAP = 26, PAL_BAR = 62;
const PAL_H = PAL_PAD * 2 + PALETTE.length * (PAL_CAP + PAL_BAR);
const palOut = await ev(tid, `(() => {
  const old = document.getElementById('navcolorPalette');
  if (old) old.remove();
  const rows = ${JSON.stringify(PALETTE)};
  const box = document.createElement('div');
  box.id = 'navcolorPalette';
  box.style.cssText = 'position:fixed;left:0;top:0;width:${PAL_W}px;z-index:999999;background:#FFFFFF;' +
    'padding:${PAL_PAD}px;box-sizing:content-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;';
  const paths = ['/pages/index/index','/pages/lexy/lexy','/pages/news/news','/pages/product/product','/pages/mine/mine'];
  const names = ['首页','莱克','资讯','产品','我的'];
  rows.forEach((r) => {
    const cap = document.createElement('div');
    cap.textContent = r.name;
    cap.style.cssText = 'font-size:13px;line-height:${PAL_CAP}px;color:#333;';
    box.appendChild(cap);
    const bar = document.createElement('div');
    bar.style.cssText = 'position:relative;width:${PAL_W}px;height:${PAL_BAR}px;';
    box.appendChild(bar);
    const d = window.PvTabbar.DEFAULT;
    const items = paths.map((p, i) => ({ path: p, text: names[i], icon: d.items[i].icon, activeIcon: d.items[i].activeIcon }));
    window.PvTabbar.apply(bar, { color: r.color, selectedColor: r.selectedColor, background: '#FFFFFF',
      borderColor: '#EEEEEE', iconMode: 'always', items: items }, paths[1], false);
  });
  document.body.appendChild(box);
  return box.getBoundingClientRect().height;
})()`);
await sleep(600);
const palPng = await raw('Page.captureScreenshot', {
  format: 'png', clip: { x: 0, y: 0, width: PAL_W + PAL_PAD * 2, height: Math.round(Number(palOut) || PAL_H), scale: 2 }
}, sid, 120000);
fs.writeFileSync(path.resolve('deliverables/导航图标配色-实测.png'), Buffer.from(palPng.data, 'base64'));
console.log(`✓ 配色示意已导出 → deliverables/导航图标配色-实测.png（2 倍图，${PAL_W + PAL_PAD * 2}×${Math.round(Number(palOut) || PAL_H)}）`);

if (SHOT) {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  /* 整页截图（面板 + 手机壳） */
  const { data } = await raw('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(path.join(OUT, 'navcolor-panel.png'), Buffer.from(data, 'base64'));
  /* 临时导航条单独截一张（deviceScaleFactor=1，取样即 1:1） */
  const { data: d2 } = await raw('Page.captureScreenshot', {
    format: 'png', clip: { x: SCRATCH.x, y: SCRATCH.y, width: SCRATCH.w, height: SCRATCH.h, scale: 1 }
  }, sid);
  fs.writeFileSync(path.join(OUT, 'navcolor-scratch.png'), Buffer.from(d2, 'base64'));
  fs.writeFileSync(path.join(OUT, 'navcolor-scratch.json'), JSON.stringify({
    off: OFF_COLOR, on: ON_COLOR, activePath: ACTIVE_PATH, rect: SCRATCH,
    items: (scratch && scratch.items) || []
  }, null, 1));
  console.log(`  · 截图 → ${OUT}/navcolor-panel.png、${OUT}/navcolor-scratch.png`);
}

await raw('Target.closeTarget', { targetId: tid });

console.log('\n──────── 小结 ────────');
const bad = results.filter((r) => !r.pass);
console.log(`  ${results.length - bad.length}/${results.length} 通过` + (bad.length ? '；未过：' + bad.map((b) => b.name).join('、') : ''));
process.exit(bad.length ? 1 : 0);
