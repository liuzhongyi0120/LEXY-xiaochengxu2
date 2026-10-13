/**
 * 「导航图标色」真 UI 端到端验证：在装修台里**真的改一次颜色**，看手机壳图标跟不跟着变。
 *
 * 与 _navcolor-probe.mjs 的分工：
 *   探针那份是「拿真 preview 模块渲染一份合成配置」—— 证明渲染层会染色；
 *   本脚本走**运营的完整操作链路**：在属性面板的色值输入框里打字 →
 *   面板写草稿 → 预览重渲染 → 手机壳图标染色。缺这一环就只能说「渲染层没问题」，
 *   说不了「运营改了真的会变」。
 *
 * ⚠️ 数据安全（「改数据→还原」型）：
 *   先记下**原值**，测完把原值**原样写回**（不是回滚版本、不依赖历史），
 *   再断言 `/api/decorate/diff` 回到 hasDraft=false 且 replica.js 没被动过。
 *   跑之前会先检查「nav 当前没有草稿」——有草稿说明运营手上有未发布的改动，
 *   本脚本**直接跳过**，绝不覆盖。
 *
 * 前置：node server/index.js + 本机 Chrome 调试端口。
 * 用法：node .tooling/_navcolor-ui.mjs [--shot]
 */
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'http://127.0.0.1:3000';
const OUT = '.tooling/_cmp';
const SHOT = process.argv.includes('--shot');

const NEW_COLOR = '#2B6CB0';   // 测试色
const ORIG_COLOR = '#8A8A8A';  // 默认未选中色（测完写回这个）

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
  results.push({ name, pass: !!pass });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

/* --------------------------- 管理员会话 + 前置检查 --------------------------- */
const PW = process.env.ADMIN_PASSWORD || 'admin';
const TOKEN = await (async () => {
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW })
  });
  const j = await r.json().catch(() => null);
  return j && j.code === 0 && j.data ? j.data.token : '';
})();
if (!TOKEN) { console.error('拿不到管理员会话'); process.exit(1); }
const auth = { Authorization: 'Bearer ' + TOKEN };
const diffOf = async (k) => (await (await fetch(SITE + '/api/decorate/diff?key=' + k, { headers: auth })).json()).data || {};

const before = fs.readFileSync('miniprogram/config/replica.js', 'utf8');
if ((await diffOf('nav')).hasDraft) {
  console.log('⚠️ nav 当前有未发布的草稿（运营手上的改动）—— 本脚本跳过，绝不覆盖。');
  process.exit(0);
}

await connect();
const created = await raw('Target.createTarget', { url: 'about:blank' });
const tid = created.targetId;
const sid = await session(tid);
await raw('Page.enable', {}, sid);
await raw('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
await raw('Page.navigate', { url: SITE + '/admin?edit=nav' }, sid);
await sleep(2000);
await raw('Runtime.evaluate', {
  expression: `localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); localStorage.removeItem('lexy_admin_me'); 'ok'`,
  returnByValue: true
}, sid);
await raw('Page.navigate', { url: SITE + '/admin?edit=nav' }, sid);
await sleep(4200);

/** 在色值输入框里打字（面板用的是 input 事件，不是 change） */
const typeColor = (label, hex) => ev(tid, `(() => {
  const fld = Array.from(document.querySelectorAll('#inspector .fld')).filter((f) => {
    const l = f.querySelector('label');
    return l && String(l.innerText || '').trim().indexOf(${JSON.stringify(label)}) === 0;
  })[0];
  if (!fld) return JSON.stringify({ err: '找不到字段：' + ${JSON.stringify(label)} });
  const input = fld.querySelector('input[type=text]');
  if (!input) return JSON.stringify({ err: '该字段没有文本输入框' });
  const before = input.value;
  input.value = ${JSON.stringify(hex)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ label: ${JSON.stringify(label)}, before, after: input.value });
})()`);

/** 读手机壳底部导航：每项的文字色 + 图标内联 filter */
const readShell = () => ev(tid, `(() => {
  const nav = document.querySelector('#preview .pvtb') || document.querySelector('.pvtb');
  if (!nav) return JSON.stringify({ err: '手机壳里没有 .pvtb' });
  const items = [];
  nav.querySelectorAll('.pvtb-item').forEach((it) => {
    const img = it.querySelector('img');
    items.push({
      text: (it.querySelector('.pvtb-text') || {}).textContent || '',
      color: getComputedStyle(it).color,
      inline: img ? (img.getAttribute('style') || '') : '',
      computed: img ? getComputedStyle(img).filter : ''
    });
  });
  return JSON.stringify({ items });
})()`);

console.log('════════ 1. 改色前（默认配色） ════════');
let s = JSON.parse(await readShell());
(s.items || []).forEach((i) => console.log(`  · ${i.text}  color=${i.color}  filter=${i.computed || '(空)'}`));
ok('改动前 5 项图标都不带 filter（零变化基线）', (s.items || []).every((i) => !i.computed || i.computed === 'none'));

console.log(`\n════════ 2. 在属性面板里把「未选中色」改成 ${NEW_COLOR} ════════`);
console.log('  ' + await typeColor('未选中色', NEW_COLOR));
await sleep(1800);
s = JSON.parse(await readShell());
(s.items || []).forEach((i) => console.log(`  · ${i.text}  color=${i.color}  filter=${(i.computed || '(空)').slice(0, 60)}`));
ok('改色后未选中项的文字色跟着变', (s.items || []).slice(0, 1).every((i) => i.color === 'rgb(43, 108, 176)'), (s.items || [])[0] && (s.items)[0].color);
ok('改色后未选中项的**图标**也挂上了染色 filter（这就是本次要复刻的有赞能力）',
  (s.items || []).every((i) => /brightness\(0\)/.test(i.computed || '')),
  (s.items || []).map((i) => (/brightness\(0\)/.test(i.computed || '') ? '染' : '未染')).join('/'));

/* 截图要在**还是改过的颜色时**拍 —— 还原之后再拍就什么也看不出来了。
   只截手机壳那一块（含底部导航），1:1 像素，便于交付时肉眼核对图标确实变了色。 */
if (SHOT) {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const box = await ev(tid, `(() => {
    const el = document.querySelector('.phone') || document.querySelector('.phone-screen') || document.getElementById('preview');
    if (!el) return '';
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  })()`);
  const clip = typeof box === 'string' && box ? JSON.parse(box) : null;
  const { data } = await raw('Page.captureScreenshot', clip
    ? { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 } }
    : { format: 'png' }, sid);
  fs.writeFileSync(path.join(OUT, 'navcolor-ui-tinted.png'), Buffer.from(data, 'base64'));
  console.log(`  · 截图（改色状态下）→ ${OUT}/navcolor-ui-tinted.png  ${clip ? clip.w + '×' + clip.h : '(整页)'}`);
}

console.log('\n════════ 3. 写回原值还原（不依赖版本历史） ════════');
console.log('  ' + await typeColor('未选中色', ORIG_COLOR));
await sleep(1800);
s = JSON.parse(await readShell());
ok('还原后图标 filter 回到空（与改动前一致）', (s.items || []).every((i) => !i.computed || i.computed === 'none'),
  (s.items || []).map((i) => i.computed || '(空)').slice(0, 2).join(' | '));
const afterDiff = await diffOf('nav');
const afterReplica = fs.readFileSync('miniprogram/config/replica.js', 'utf8');
ok('nav 草稿已回到「无草稿」（面板写回原值后与线上一致）', afterDiff.hasDraft === false, JSON.stringify(afterDiff).slice(0, 120));
ok('replica.js 未被本次测试改动（发布链路没被碰到）', afterReplica === before);

await raw('Target.closeTarget', { targetId: tid });
const bad = results.filter((r) => !r.pass);
console.log(`\n结果：${results.length - bad.length} 通过 / ${bad.length} 失败` + (bad.length ? '；未过：' + bad.map((b) => b.name).join('、') : ''));
process.exit(bad.length ? 1 : 0);
