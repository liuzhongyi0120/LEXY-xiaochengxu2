/**
 * 只读探针：逐个页面打开装修台编辑器（`/admin?edit=<key>`），量测「三栏是否真的有东西」。
 *
 * 为什么要有这个：用户报「小程序编辑器里什么都不显示」——「什么都不显示」有五种落点：
 *   ① 左栏组件面板空  ② 中间手机壳 0 高  ③ 右栏属性面板空  ④ 整个页面白屏  ⑤ /preview 空。
 * 靠肉眼看一张截图分不出是哪一种，靠 `/api/*` 也测不出来（接口全绿、UI 照样能空）。
 * 所以这里对**每个页面**都取一次 DOM 事实：几何尺寸 + 文本长度。判据全部落在
 * getBoundingClientRect / innerText 上（铁律 60：缩略图上判色判空必错）。
 *
 * 只读：只 `?edit=` 打开与量测，**不点「返回列表」「存至草稿」「生成代码」**。
 * （装修台有未保存改动时点「返回列表」会弹浏览器原生确认框并卡死标签页 —— 本脚本 navigates 过去。）
 *
 * 前置：需要 3000（本机服务）与 3456（CDP 代理）都在。代理没跑时先起：
 *   node .tooling/_cdp-headless.mjs &
 *
 * 用法：ADMIN_PASSWORD=xxx node .tooling/_probe-editor-pages.mjs
 */
const ADMIN_PW = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
const P = 'http://127.0.0.1:3456';
const SITE = 'http://127.0.0.1:3000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  return r.json();
}
const open = async (url) => {
  const r = await j('/new', { method: 'POST', body: url });
  return r.targetId;
};
const nav = (id, url) => j('/nav?target=' + id, { method: 'POST', body: url });
const run = (id, js) => j('/eval?target=' + id, { method: 'POST', body: js });
const close = (id) => j('/close?target=' + id, { method: 'POST' });

/* 三栏事实一次性取回。用 returnByValue 的字符串（代理同口径）。 */
const PROBE = `JSON.stringify((() => {
  const px = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const txt = (el) => el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : '';
  const panel = document.querySelector('#pvPages') || document.querySelector('.lib, #lib, .components');
  const phone = document.querySelector('#phone');
  const insp  = document.querySelector('#inspector');
  const tree  = document.querySelector('#tree');
  return {
    url: location.href,
    ready: document.readyState,
    err: (document.body.innerText.match(/(无权限|未登录|请先登录|加载失败|接口不存在|403|404)/g) || []).join(','),
    lib:   { geo: px(panel), textLen: txt(panel).length, text: txt(panel).slice(0, 120) },
    phone: { geo: px(phone), textLen: txt(phone).length },
    insp:  { geo: px(insp),  textLen: txt(insp).length,  text: txt(insp).slice(0, 120) },
    tree:  { geo: px(tree),  textLen: txt(tree).length },
    bodyLen: document.body.innerHTML.length
  };
})())`;

/* ---------- 拿页面 key 清单（走接口，避免抄第二份） ---------- */
const login = await fetch(SITE + '/api/admin/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: ADMIN_PW })
}).then((r) => r.json());
const token = login.data && login.data.token;
if (!token) { console.log('✗ 管理员登录失败：' + JSON.stringify(login)); process.exit(1); }
const pages = await fetch(SITE + '/api/decorate/pages', { headers: { Authorization: 'Bearer ' + token } })
  .then((r) => r.json());
const keys = (pages.data.list || []).map((p) => p.key);
console.log('共 ' + keys.length + ' 个页面，逐个打开编辑器量测…\n');

/* ---------- 顺带量一次 /preview（同一件事的另一半） ---------- */
const pvTab = await open(SITE + '/preview?page=home');
await sleep(3500);
const pv = await run(pvTab, `JSON.stringify((() => {
  const px = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const p = document.querySelector('#preview');
  const txt = p ? (p.innerText || '').replace(/\\s+/g, ' ').trim() : '';
  return { url: location.href, geo: px(p), textLen: txt.length, text: txt.slice(0, 160),
           imgs: document.querySelectorAll('#preview img').length,
           brokenImgs: [...document.querySelectorAll('#preview img')].filter((i) => i.complete && i.naturalWidth === 0).length };
})())`);
console.log('【/preview?page=home】' + (pv.value || JSON.stringify(pv)));
await close(pvTab);

/* ---------- 逐页 ---------- */
const tab = await open(SITE + '/admin?edit=' + keys[0]);
await sleep(3000);

const rows = [];
for (const k of keys) {
  await nav(tab, SITE + '/admin?edit=' + k);
  await sleep(2600);
  const r = await run(tab, PROBE);
  let d;
  try { d = JSON.parse(r.value); } catch (e) { d = { err: 'eval 失败: ' + (r.error || r.value) }; }
  const bad = [];
  if (!d.lib || (d.lib.geo && d.lib.geo[0] === 0 && d.lib.textLen === 0)) bad.push('左栏空');
  if (d.phone && d.phone.geo && d.phone.geo[1] < 100) bad.push('手机壳空(' + d.phone.geo[1] + 'px)');
  if (!d.insp || (d.insp.geo && d.insp.geo[1] === 0)) bad.push('右栏空');
  if (d.err) bad.push('页面含错误文案[' + d.err + ']');
  rows.push({ key: k, phone: d.phone && d.phone.geo ? d.phone.geo[1] : '?', lib: d.lib && d.lib.geo ? d.lib.geo[1] : '?', insp: d.insp && d.insp.geo ? d.insp.geo[1] : '?', bad: bad.join(' / ') });
}

console.log('\n页面 key    手机壳高  左栏高  右栏高  异常');
console.log('---------------------------------------------------');
for (const r of rows) {
  console.log('  ' + String(r.key).padEnd(9) + String(r.phone).padStart(7) + String(r.lib).padStart(8) + String(r.insp).padStart(8) + '  ' + (r.bad || '—'));
}
const n = rows.filter((r) => r.bad).length;
console.log('\n结论：' + (n ? n + ' 个页面有异常（见上表「异常」列）' : '全部 ' + rows.length + ' 个页面的三栏都有内容'));

await close(tab);
