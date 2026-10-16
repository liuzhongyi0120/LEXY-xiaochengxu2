/**
 * 验证「店铺导航缺内置首页」的守卫**真的会显示在装修台里**（不是死代码）。
 *
 * 做法：
 *   1. 存一份 nav 草稿，把指向 /pages/index/index 的那一项删掉；
 *   2. 无头浏览器打开 /admin?edit=nav，读根视图（导航整体属性）里有没有 .tip.warn；
 *   3. 立刻 discard 草稿，**不留任何痕迹**。
 *
 * 为什么要跑这一趟：这类守卫最容易写成「代码在、界面上永远不出现」——
 * 插错父节点、条件永远为假、面板重渲染把提示冲掉，三种都会有。
 * 本项目吃过「看着对、实际没生效」的亏（轮播只画第一张、预览长页滚不动），
 * 所以 UI 层的东西一律在真浏览器里量一次，不靠读代码下结论。
 *
 * 前置：本地服务在 3000 端口。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import adminToken from './_admin.mjs';

const BASE = 'http://127.0.0.1:3000';
const HOME_PATH = '/pages/index/index';
const ADMIN = await adminToken(BASE);
const H = { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' };

const chrome = 'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
if (!existsSync(chrome)) { console.log('❌ 找不到无头浏览器'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name + (extra ? '  —— ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  —— ' + extra : '')); }
};

/* ---------- 1. 存一份「缺首页」的草稿 ---------- */
const cur = (await (await fetch(BASE + '/api/decorate/page?key=nav', { headers: H })).json()).data || {};
const base = cur.data || cur;
const before = (base.items || []).map((i) => i.path);
console.log('改前导航项:', before.join(' '));

if (!before.includes(HOME_PATH)) { console.log('（当前配置本来就缺首页，直接验证显示即可）'); }

const items = (base.items || []).filter((i) => i.path !== HOME_PATH);
const d = await (await fetch(BASE + '/api/decorate/draft', {
  method: 'POST', headers: H, body: JSON.stringify({ key: 'nav', data: Object.assign({}, base, { items }) })
})).json();
console.log('存草稿:', d.code, d.msg || '');
if (d.code !== 0) { console.log('存草稿失败，未做改动'); process.exit(1); }

/* ---------- 2. 无头浏览器量界面 ---------- */
const port = 9300 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(join(tmpdir(), 'navgr-'));
const child = spawn(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1440,900', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'],
  { stdio: 'ignore' });

let ws, _id = 0; const _p = new Map();
for (let i = 0; i < 80; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const pg = l.filter((t) => t.type === 'page')[0];
    if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; }
  } catch (e) { /* 还没起来 */ }
  await sleep(120);
}
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && _p.has(m.id)) { const p = _p.get(m.id); _p.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
});
const send = (m, pr) => new Promise((res, rej) => {
  const id = ++_id; _p.set(id, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id, method: m, params: pr || {} }));
});
const ev = async (e, a) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!a });
  if (r.exceptionDetails) throw new Error('页面异常');
  return r.result && r.result.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: BASE + '/console' }); await sleep(1200);
await ev(`localStorage.setItem("lexy_admin_token", ${JSON.stringify(ADMIN)})`);
await send('Page.navigate', { url: BASE + '/admin?edit=nav' }); await sleep(5000);

const st = JSON.parse(await ev(`(() => {
  const insp = document.getElementById('inspector');
  const warn = insp ? insp.querySelector('.tip.warn') : null;
  return JSON.stringify({
    path: (document.getElementById('inspectorPath') || {}).textContent || '',
    warnCount: insp ? insp.querySelectorAll('.tip.warn').length : -1,
    warnText: warn ? (warn.textContent || '').slice(0, 60) : '',
    warnIsSecond: warn ? (warn.previousElementSibling ? 'yes' : 'no') : '',
    nvWarn: document.querySelectorAll('.nv-warn').length
  });
})()`) || '{}');
console.log('  面板:', JSON.stringify(st));

console.log('\n[缺内置首页时]');
check('进入了店铺导航的整体属性面板', /导航整体属性/.test(st.path || ''), st.path);
check('根视图里出现告警提示条 .tip.warn', st.warnCount === 1, '数量=' + st.warnCount);
check('告警文案说明了后果（整条不高亮）', /不高亮/.test(st.warnText || ''), st.warnText);
check('告警插在组件标题之后（不是被追加到最底部看不见）', st.warnIsSecond === 'yes', '前面有兄弟节点=' + st.warnIsSecond);

/* ---------- 3. 复原：丢弃草稿 ---------- */
const dis = await (await fetch(BASE + '/api/decorate/discard', {
  method: 'POST', headers: H, body: JSON.stringify({ key: 'nav' })
})).json();
console.log('\n丢弃草稿:', dis.code, dis.msg || '');

const after = (await (await fetch(BASE + '/api/decorate/page?key=nav', { headers: H })).json()).data || {};
const afterItems = ((after.data || after).items || []).map((i) => i.path);
const diff = await (await fetch(BASE + '/api/decorate/diff?key=nav', { headers: H })).json();
console.log('复原后导航项:', afterItems.join(' '));
console.log('仍有草稿?', (diff.data || {}).hasDraft);
check('草稿已丢弃（运营手上的导航配置原样保留）', !(diff.data || {}).hasDraft, 'hasDraft=0');
check('导航项与改前完全一致', JSON.stringify(afterItems) === JSON.stringify(before), afterItems.join(' '));

ws.close(); child.kill();
console.log('\n' + pass + '/' + (pass + fail) + ' 通过');
process.exit(fail ? 1 : 0);
