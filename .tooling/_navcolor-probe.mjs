/**
 * 装修台「店铺导航」面板 · 结构 + 默认态零变化（真浏览器，只读）
 *
 * 为什么要有这份（与另外两份的分工）：
 *   · check-all.mjs         —— 纯逻辑/服务端：字段结构、染色规则、染色路由的**像素**
 *   · _navcolor-ui.mjs      —— **运营的完整操作链路**：在面板里真的打字改色 → 图标变
 *   · 本脚本                —— 装修台 DOM 侧的两件事：
 *       A. 面板结构（「导航图标色 / 导航背景色」两组默认展开、4 个色值字段、旧的折叠组已消失）
 *       B. 默认配色下手机壳的 5 个图标**还是包内原图**（改造前后零变化、零网络请求）
 *
 * ⚠️ 本脚本**不改任何数据**（不写草稿、不点发布），随时可跑。
 *
 * 前置：node server/index.js + 本机 Chrome 调试端口。
 * 用法：node .tooling/_navcolor-probe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'http://127.0.0.1:3000';

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
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text };
  return r.result && r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

/* --------------------------- 管理员会话 --------------------------- */
const PW = process.env.ADMIN_PASSWORD || 'admin';
const TOKEN = await (async () => {
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW })
  });
  const j = await r.json().catch(() => null);
  return j && j.code === 0 && j.data ? j.data.token : '';
})();
if (!TOKEN) { console.error('拿不到管理员会话'); process.exit(1); }

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
console.log('\n════════════ B. 默认配色下手机壳图标仍是包内原图（零变化、零网络请求） ════════════');
const shell = await ev(tid, `(() => {
  const nav = document.querySelector('#preview .pvtb') || document.querySelector('.pvtb');
  if (!nav) return JSON.stringify({ err: '手机壳里没有 .pvtb' });
  const items = [];
  nav.querySelectorAll('.pvtb-item').forEach((it) => {
    const img = it.querySelector('img');
    items.push({
      text: (it.querySelector('.pvtb-text') || {}).textContent || '',
      color: getComputedStyle(it).color,
      src: img ? (img.getAttribute('src') || '') : '',
      natural: img ? (img.naturalWidth + 'x' + img.naturalHeight) : ''
    });
  });
  return JSON.stringify({ items });
})()`);
let shellData = null;
try { shellData = JSON.parse(shell); } catch (e) { console.log('  ' + String(shell).slice(0, 300)); }
if (shellData && shellData.items) {
  shellData.items.forEach((i) => console.log(`  · ${i.text}  color=${i.color}  ${i.natural}  ${i.src}`));
  ok('5 项图标都指向包内原图（改造前后像素零变化，且不发任何网络请求）',
    shellData.items.length === 5 && shellData.items.every((i) => /^\/images\/tabbar\//.test(i.src)),
    shellData.items.map((i) => i.src).join(' | '));
  ok('5 项图标都真的加载成功（66×66 —— 不是裂图）',
    shellData.items.every((i) => i.natural === '66x66'),
    shellData.items.map((i) => i.natural).join('/'));
} else {
  ok('手机壳底部导航可读', false, 'dump 失败');
}

await raw('Target.closeTarget', { targetId: tid });
const bad = results.filter((r) => !r.pass);
console.log(`\n结果：${results.length - bad.length} 通过 / ${bad.length} 失败` +
  (bad.length ? '；未过：' + bad.map((b) => b.name).join('、') : ''));
process.exit(bad.length ? 1 : 0);
