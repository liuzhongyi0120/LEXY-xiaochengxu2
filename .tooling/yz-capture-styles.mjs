/* 逐个切换「标题风格 A~E」，抓预览 iframe 里左侧导航的选中态 DOM/样式差异，最后复位。
 * 只改装修台内存态（不点「保存草稿」），截图抓完后点回风格C。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readDevTools() {
  const la = process.env.LOCALAPPDATA || '';
  const cands = [
    path.join(la, 'Google/Chrome/User Data/DevToolsActivePort'),
    path.join(la, 'Microsoft/Edge/User Data/DevToolsActivePort')
  ];
  for (const p of cands) {
    try {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      const port = parseInt(lines[0], 10);
      if (port > 0) return { port, wsPath: (lines[1] || '').trim() };
    } catch { }
  }
  return null;
}

const dt = readDevTools();
const ws = new WebSocket(`ws://127.0.0.1:${dt.port}${dt.wsPath}`);
let cmdId = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
  if (m.id && pending.has(m.id)) { const { resolve, timer } = pending.get(m.id); clearTimeout(timer); pending.delete(m.id); resolve(m); }
});
function send(method, params = {}, sessionId = null) {
  return new Promise((resolve, reject) => {
    const id = ++cmdId; const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP 超时 ' + method)); }, 30000);
    pending.set(id, { resolve, timer }); ws.send(JSON.stringify(msg));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('WS failed')), { once: true }); });

const t = await send('Target.getTargets');
const page = (t.result.targetInfos || []).find((x) => x.type === 'page' && x.url.indexOf('store.youzan.com/v4/deco/decorate') >= 0);
if (!page) { console.error('未找到装修台页面'); process.exit(1); }
const sid = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).result.sessionId;

const tree = await send('Page.getFrameTree', {}, sid);
let pf = null;
(function walk(f) { if (!pf && f.frame.url.indexOf('wscdeco/decorate/preview') >= 0) pf = f.frame; (f.childFrames || []).forEach(walk); })(tree.result.frameTree);
if (!pf) { console.error('未找到预览 frame'); process.exit(2); }

async function previewCtx() {
  const w = await send('Page.createIsolatedWorld', { frameId: pf.id, worldName: 'yzsty' + Date.now(), grantUniveralAccess: true }, sid);
  return w.result.executionContextId;
}

const SNAP = `(() => {
  const root = document.querySelector('.com-item--extension-cnzoom-category-4-1');
  if (!root) return { err: 'no root' };
  const nav = root.querySelectorAll('div.scroll')[0];
  const wrap = nav ? nav.children[1] : null;
  if (!wrap) return { err: 'no navwrap' };
  const items = [...wrap.children].filter(c => c.tagName === 'DIV');
  const brief = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      w: Math.round(b.width), h: Math.round(b.height),
      style: (el.getAttribute('style') || ''),
      bg: cs.backgroundColor, color: cs.color, fw: cs.fontWeight, fs: cs.fontSize,
      radius: cs.borderRadius, pos: cs.position,
      pad: cs.padding, mar: cs.margin,
      borderTop: cs.borderTop, borderLeft: cs.borderLeft,
      kidStyle: el.firstElementChild ? (el.firstElementChild.getAttribute('style') || '') : '',
      kidKidStyle: el.firstElementChild && el.firstElementChild.firstElementChild ? (el.firstElementChild.firstElementChild.getAttribute('style') || '') : '',
      text: (el.textContent || '').trim().slice(0, 10)
    };
  };
  return {
    navWrapStyle: wrap.getAttribute('style') || '',
    navStyle: nav.getAttribute('style') || '',
    itemCount: items.length,
    sel: brief(items[0]),
    unsel: brief(items[1]),
    last: brief(items[items.length - 1])
  };
})()`;

async function clickStyle(name) {
  const js = `(() => {
    const labs = [...document.querySelectorAll('.zent-radio-label, .zent-radio-wrap, .zent-radio-button__content')];
    const el = labs.find(x => x.textContent.trim() === '${name}');
    if (!el) {
      const any = [...document.querySelectorAll('span,div')].filter(x => x.children.length === 0 && x.textContent.trim() === '${name}');
      if (!any.length) return { err: 'not found' };
      (any[0].closest('label') || any[0]).click();
      return { ok: true, via: 'text-node' };
    }
    const lab = el.closest('label') || el;
    lab.click();
    return { ok: true, via: 'radio-label', tag: lab.tagName };
  })()`;
  const r = await send('Runtime.evaluate', { expression: js, returnByValue: true }, sid);
  return r.result && r.result.result ? r.result.result.value : null;
}

/* 先切到「样式设置」tab：风格按钮在那个 panel 里，隐藏状态下点击可能不触发 */
const tabSw = await send('Runtime.evaluate', {
  expression: `(() => { const el = [...document.querySelectorAll('.zent-tabs-tab-inner')].find(x => x.textContent.trim() === '样式设置'); if (!el) return 'no tab'; el.click(); return 'ok'; })()`,
  returnByValue: true
}, sid);
console.error('切到样式设置 tab:', JSON.stringify(tabSw.result && tabSw.result.result && tabSw.result.result.value));
await sleep(1000);

const out = {};
for (const name of ['风格A', '风格B', '风格C', '风格D', '风格E']) {
  const c = await clickStyle(name);
  await sleep(1200);
  const ctxId = await previewCtx();
  const r = await send('Runtime.evaluate', { expression: SNAP, contextId: ctxId, returnByValue: true }, sid);
  out[name] = { click: c, snap: r.result && r.result.result ? r.result.result.value : null };
  console.error('抓取完成:', name, c && c.ok ? 'ok' : JSON.stringify(c).slice(0, 80));
}

await clickStyle('风格C');
await sleep(600);
console.error('已复位为 风格C');

fs.writeFileSync('.tooling/_yz-styles.json', JSON.stringify(out, null, 1));
console.error('已写 .tooling/_yz-styles.json');
ws.close();
