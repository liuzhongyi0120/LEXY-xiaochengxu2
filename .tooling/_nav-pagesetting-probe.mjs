/**
 * 「页面布局」浮层底部那个入口（`#btnPageSetting`）在**店铺导航**装修页上的行为验收
 * （真浏览器端到端）。
 *
 * 背景（原缺陷，2026-10-13 修）：导航页的 schema 是 `TABBAR_NODE`，**没有 `meta` 字段**，
 * 而入口无条件 `locate('meta')` → 点下去只弹一句红字「该页面没有页面级设置」、
 * 属性面板一动不动，运营的原话就是「点这个页面设置没反应，点击应该是导航的整体属性设置」。
 *
 * 本脚本走运营的完整操作链路：
 *   右上角「页面布局」→ 浮层里点第 1 项（把选中从根视图挪开）→ 点浮层底部的入口
 *   → 断言（a）面板回到「导航整体属性」、（b）给的是普通提示而不是红字报错、
 *   （c）入口文案在导航页上是「导航整体属性」。
 * 对照组跑一遍「首页」：它承载的确实是页面设置（meta），行为必须一字不改。
 *
 * 前置：node server/index.js + 本机 Chrome 调试端口（DevToolsActivePort）。
 * 用法：node .tooling/_nav-pagesetting-probe.mjs [--shot]
 */
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'http://127.0.0.1:3000';
const OUT = '.tooling/_cmp';
const SHOT = process.argv.includes('--shot');

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
const say = (name, detail) => console.log(`  · ${name}${detail ? '：' + detail : ''}`);

/* --------------------------- 管理员会话 --------------------------- */
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
await raw('Network.enable', {}, sid);
await raw('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
await raw('Page.navigate', { url: SITE + '/admin?edit=nav' }, sid);
await sleep(2000);
await raw('Runtime.evaluate', {
  expression: `localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); localStorage.removeItem('lexy_admin_me'); 'ok'`,
  returnByValue: true
}, sid);

/** 读属性面板当前状态（路径标签 / 面板里有没有导航的那几组字段） */
const readInsp = `(() => {
  const path = document.getElementById('inspectorPath');
  const host = document.getElementById('inspector');
  const txt = host ? (host.textContent || '') : '';
  return JSON.stringify({
    pathText: path ? path.textContent.trim() : '',
    hasColorGroup: /导航图标色/.test(txt),
    hasBgField: /背景色/.test(txt),
    hasPageMeta: /页面描述|背景颜色/.test(txt)
  });
})()`;

/* --------------------------- 验收：单个页面 --------------------------- */
async function probePage(key, label) {
  console.log(`\n===== ${label}（/admin?edit=${key}）=====`);
  await raw('Network.clearBrowserCache', {}, sid);
  await raw('Page.navigate', { url: SITE + '/admin?edit=' + key + '&_=' + Date.now() }, sid);
  await sleep(4500);

  // ① 运营的操作路径：右上角「页面布局」→ 浮层底部入口
  const opened = await ev(tid, `(() => {
    const b = document.getElementById('btnPageLayout');
    if (!b) return 'no-btn';
    b.click();
    const p = document.getElementById('layoutPanel');
    const foot = document.getElementById('btnPageSetting');
    const head = p && p.querySelector('.col-head b');
    return JSON.stringify({
      panelHidden: p ? !!p.hidden : null,
      title: head ? head.textContent.trim() : '',
      treeRows: p ? p.querySelectorAll('#tree .tnode').length : -1,
      footVisible: foot ? (foot.offsetParent !== null) : null,
      footText: foot ? foot.textContent.trim() : ''
    });
  })()`);
  say('点开浮层', opened);
  const o = JSON.parse(opened || '{}');
  ok(`${label}：浮层底部入口可见`, o.footVisible === true, `文案「${o.footText}」`);

  const inspAtRoot = JSON.parse((await ev(tid, readInsp)) || '{}');
  say('根视图面板标签', inspAtRoot.pathText);

  // ② 先点浮层里的第 1 项，把选中从根视图挪开（否则「点入口没变化」分不清是缺陷还是本来就在根视图）
  const pick = await ev(tid, `(() => {
    const rows = document.querySelectorAll('#layoutPanel #tree .tnode');
    if (!rows.length) return '';
    rows[0].click();
    const path = document.getElementById('inspectorPath');
    return path ? path.textContent.trim() : '';
  })()`);
  say('点了浮层第 1 项后面板标签', pick);

  // ③ 点浮层底部的入口
  const after = JSON.parse((await ev(tid, `(() => {
    const foot = document.getElementById('btnPageSetting');
    foot.click();
    const box = document.getElementById('toast');
    const t = box ? box.querySelector('.t') : null;
    return JSON.stringify({
      toastText: t ? String(t.textContent || '').trim() : '',
      toastErr: t ? /(^|\\s)err(\\s|$)/.test(t.className) : null
    });
  })()`)) || '{}');
  const inspAfter = JSON.parse((await ev(tid, readInsp)) || '{}');
  say('点入口后', JSON.stringify(Object.assign({}, after, inspAfter)));

  if (SHOT) {
    const r = await raw('Page.captureScreenshot', { format: 'png' }, sid);
    fs.writeFileSync(OUT + `/nav-ps-${key}-after.png`, Buffer.from(r.data, 'base64'));
  }
  return { key, label, o, inspAtRoot, pick, after, inspAfter };
}

const nav = await probePage('nav', '店铺导航');
const home = await probePage('home', '首页');

console.log('\n===== 判定 =====');

/* --- 店铺导航：入口承载「导航整体属性」 --- */
ok('店铺导航：入口文案是「导航整体属性」（不是「页面设置」）',
  nav.o.footText === '导航整体属性', `实际「${nav.o.footText}」`);
ok('店铺导航：根视图的面板标签是「导航整体属性」',
  nav.inspAtRoot.pathText === '导航整体属性', `实际「${nav.inspAtRoot.pathText}」`);
ok('店铺导航：浮层里能选中单个导航项（选中从根视图挪开）',
  /^items\.\d+$/.test(String(nav.pick)), `实际「${nav.pick}」`);
ok('店铺导航：点入口后属性面板回到「导航整体属性」（图标色 / 背景色可见）',
  nav.inspAfter.pathText === '导航整体属性' && nav.inspAfter.hasColorGroup === true && nav.inspAfter.hasBgField === true,
  `实际「${nav.inspAfter.pathText}」hasColorGroup=${nav.inspAfter.hasColorGroup}`);
ok('店铺导航：点入口给的是普通提示，不是红字报错',
  nav.after.toastErr !== true && /整体属性/.test(String(nav.after.toastText)),
  `toast「${nav.after.toastText}」err=${nav.after.toastErr}`);
ok('店铺导航：面板不得再出现「该页面没有页面级设置」这类错误提示',
  !/没有页面级设置/.test(String(nav.after.toastText)));

/* --- 首页（对照组）：页面设置行为一字不改 --- */
ok('首页（对照组）：入口文案仍是「页面设置」', home.o.footText === '页面设置', `实际「${home.o.footText}」`);
ok('首页（对照组）：点入口后面板切到 meta（页面级设置）',
  home.inspAfter.pathText === 'meta' && home.inspAfter.hasPageMeta === true,
  `实际「${home.inspAfter.pathText}」`);
ok('首页（对照组）：面板里不该出现导航的配色字段',
  home.inspAfter.hasColorGroup === false && home.inspAfter.hasBgField === false);

console.log('\n----- 汇总 -----');
const pass = results.filter((r) => r.pass).length;
console.log(`  通过 ${pass} / ${results.length}${pass === results.length ? ' 全部通过 ✓' : ' —— 有失败项 ✗'}`);
if (!SHOT) console.log('  （加 --shot 可留存截图）');
process.exit(pass === results.length ? 0 : 1);
