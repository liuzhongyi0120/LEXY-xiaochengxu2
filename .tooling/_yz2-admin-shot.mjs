/**
 * 装修台（/admin）「混合排列」区块的**真浏览器验收**。
 *
 * 为什么必须单独有这一个：
 *   `/preview` 走的是「编译真机 WXML + WXSS」链路，**不经过** `shared/pv-render.js`；
 *   而装修台的手机预览走的是 pv-render。
 *   也就是说 —— 只跑对账脚本 / 只跑 test-mp-render，`pvBlock()` 里那段 mixed_grid 分支
 *   **一次都不会被执行**。它要是抛异常或渲染成空白，静态断言（只查字符串在不在）照样全绿。
 *
 * 用法：node .tooling/_yz2-admin-shot.mjs [--key=p288] [--base http://127.0.0.1:3000] [--out=...]
 * 退出码：0 = 全部通过；1 = 有断言失败
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import adminToken from './_admin.mjs';

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', key: 'p288', out: null };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') opt.base = argv[++i];
  else if (argv[i] === '--key') opt.key = argv[++i];
  else if (argv[i] === '--out') opt.out = argv[++i];
}
const BASE = opt.base.replace(/\/$/, '');
const OUT = opt.out || resolve('.tooling/_cmp/yz2-admin.png');
mkdirSync(resolve(OUT, '..'), { recursive: true });

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const results = [];
const assert = (name, ok, msg) => { results.push({ name, ok: !!ok, msg: msg || '' }); };

const port = 9900 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(join(tmpdir(), 'yz2adm-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--window-size=1440,900',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
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
  setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); rj(new Error('timeout ' + method)); } }, 60000);
});
const ev = async (sid, expression) => {
  const r = await raw('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sid);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
};

const TOKEN = await adminToken(BASE);
const { targetId } = await raw('Target.createTarget', { url: BASE + '/admin?edit=' + opt.key });
const sid = (await raw('Target.attachToTarget', { targetId, flatten: true })).sessionId;
await sleep(1500);
await ev(sid, `localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); location.reload(); true`);
await sleep(5000);

/* (1) 编辑器真的停在这一页（不是登录层、不是页面列表）
 * ⚠️ 判定口径（别信 phTitle —— 静态 HTML 里就有默认文案）：
 *    进入编辑器 = `#viewList.hidden === true` 且 `#viewEdit.hidden === false`（见 admin.js 的 showEdit/showList）。 */
const state = await ev(sid, `(() => {
  const viewList = document.getElementById('viewList');
  const viewEdit = document.getElementById('viewEdit');
  return {
    listHidden: viewList ? viewList.hidden : null,
    editHidden: viewEdit ? viewEdit.hidden : null,
    title: (document.getElementById('phTitle') || {}).textContent || '',
    loginOverlay: !!document.querySelector('.admin-login, #login, .login-mask'),
  };
})()`);
assert('装修台进入编辑器（?edit= 直达，未停在登录层）',
  state.listHidden === true && state.editHidden === false && !state.loginOverlay,
  JSON.stringify(state));

/* (2) 手机预览里真把 8 张卡片画出来了 —— 这一段只有 pv-render 的 mixed_grid 分支在跑 */
const preview = await ev(sid, `(() => {
  const root = document.getElementById('preview');
  if (!root) return { err: '没有 #preview' };
  const cards = root.querySelectorAll('.pv-mgcard');
  const pics = root.querySelectorAll('.pv-mgcard img');
  const names = [...root.querySelectorAll('.pv-mgcard')].map((c) => (c.textContent || '').trim());
  const module = root.querySelector('[style*="background:#DFDEDE"], [style*="background: rgb(223, 222, 222)"]');
  return {
    cards: cards.length,
    pics: pics.length,
    names,
    emptyText: (root.textContent || '').indexOf('未添加卡片') >= 0,
    hasModule: !!module,
    rawLen: root.innerHTML.length,
  };
})()`);
assert('装修台手机预览渲染出 8 张「混合排列」卡片（pv-render 的该分支真被执行）',
  preview.cards === 8 && !preview.emptyText && preview.rawLen > 500,
  `卡片=${preview.cards} 图片=${preview.pics} 空态文案=${preview.emptyText} 预览长度=${preview.rawLen}`);
assert('卡片名称与源页一致（关于莱克 … 加入我们）',
  (preview.names || []).join('/') === '关于莱克/新闻大事/创业故事/我们品牌/用户分享/业务模式/售后服务/加入我们',
  (preview.names || []).join('/'));
assert('模块底色按配置渲染（#DFDEDE / rgb(223,222,222)）', preview.hasModule, `hasModule=${preview.hasModule}`);

/* (3) 区块角标 + 属性面板：证明它被当成一个正常区块，而不是「未知类型」 */
const editor = await ev(sid, `(() => {
  const tag = document.querySelector('#preview .pv-tag');
  const treeNodes = [...document.querySelectorAll('#tree .tnode, .tree .tnode')].map((n) => (n.textContent || '').trim());
  return { tag: tag ? tag.textContent.trim() : '', treeNodes };
})()`);
assert('区块角标显示「混合排列 1」（KIND_LABEL 命中，不是显示 kind 原文）',
  /混合排列\s*1/.test(editor.tag), `角标="${editor.tag}" 区块树=${JSON.stringify(editor.treeNodes)}`);

/* (4) 组件库里「混合排列」是可点的正常卡片（不是「未接入」灰显）
 * 卡片类名 = `.lib-item`，未接入的项多一个 `off`（见 admin.js 的 renderLib）；
 * ⚠️ 必须**先切到「高级组件」tab** —— 组件库按 tab 渲染，别的 tab 下这张卡根本不在 DOM 里，
 *    直接查会得到 found=false 的假红（第一次跑就是这么红的）。 */
const lib = await ev(sid, `(() => {
  const tabs = [...document.querySelectorAll('#libTabs .lib-tab')];
  const adv = tabs.filter((b) => /高级/.test(b.textContent || ''))[0];
  if (!adv) return { err: '没有「高级组件」tab', tabs: tabs.map((b) => (b.textContent || '').trim()) };
  adv.click();
  const cards = [...document.querySelectorAll('.lib-item')];
  const hit = cards.filter((c) => (c.textContent || '').indexOf('混合排列') >= 0)[0];
  if (!hit) return { found: false, total: cards.length, texts: cards.map((c) => (c.textContent || '').trim().slice(0, 12)) };
  const cls = (hit.className || '').toString();
  return { found: true, total: cards.length, cls, text: (hit.textContent || '').trim().slice(0, 60),
    off: /(^|\\s)off(\\s|$)/.test(cls), disabled: hit.hasAttribute('disabled') };
})()`);
assert('组件库「高级组件」tab 里有「混合排列」且不是灰显/未接入状态',
  lib.found && !lib.off && !lib.disabled, JSON.stringify(lib));

/* 截图存档 */
await raw('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
await sleep(1000);
const m = await raw('Page.getLayoutMetrics', {}, sid);
const cs = m.cssContentSize || m.contentSize;
const { data } = await raw('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 },
}, sid);
writeFileSync(OUT, Buffer.from(data, 'base64'));

console.log('\n装修台「混合排列」区块验收（真 Chrome + CDP）');
console.log('─'.repeat(56));
results.forEach((r) => console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}` + (r.ok ? '' : `\n      ↳ ${r.msg}`)));
console.log('─'.repeat(56));
const failed = results.filter((r) => !r.ok);
console.log(`结果：${results.length - failed.length} 通过 / ${failed.length} 失败`);
console.log(`截图：${OUT}`);

await raw('Target.closeTarget', { targetId }).catch(() => {});
child.kill();
process.exit(failed.length ? 1 : 0);
