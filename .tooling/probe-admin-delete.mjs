/**
 * 装修台「删除区块免二次确认 + 撤销气泡」—— 浏览器验收脚本
 *
 * 需求（2026-10-10）：「删除组件不需要二次确定」。
 * 光看代码没去掉 confirm 是不够的 —— 要真的在浏览器里点一次，确认：
 *   1. 点删除时**没有**触发原生 confirm（若代码回退成 confirm，delete 会被拦下 → 计数不变 → 本脚本报红）
 *   2. 区块**立即**少一个（即时生效）
 *   3. 弹出带「撤销」按钮的 toast（.t-act 存在，文案含「可撤销」）
 *   4. 点「撤销」→ 区块**原位恢复**（位置也要对，不是追加到末尾）
 *   5. 全程没碰服务端：草稿数不变、replica.js 不变（页面内存改动，关标签页即消失）
 *
 * 保留的 3 处 confirm（有意为之，不在本脚本范围）：退出登录 / 丢弃草稿 / 退出编辑器。
 *
 * 前置：
 *   1) node server/index.js       （后端，端口 3000）
 *   2) node scripts/cdp-proxy.mjs （CDP 代理，监听 3456；Chrome 需允许调试）
 *
 * 用法：node .tooling/probe-admin-delete.mjs
 *
 * ⚠️ 装修台有未保存改动时点「返回列表」会触发原生「离开？」弹窗并卡死标签页 → 只关标签页，不点返回。
 */
const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';

let pass = 0;
let fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(url, wait = 2300) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id || (r.target && r.target.id);
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return '';
  if (r.error) return '';
  if (r.value !== undefined) return typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
  return '';
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });

const ADMIN_PW = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
let ADMIN_TOKEN = '';

async function fetchAdminToken() {
  const env = String(process.env.ADMIN_TOKEN || '').trim();
  if (env) {
    const r = await fetch(SITE + '/api/admin/session', { headers: { Authorization: 'Bearer ' + env } });
    const jj = await r.json().catch(() => null);
    if (jj && jj.code === 0) return env;
  }
  if (!ADMIN_PW) return '';
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW })
  });
  const jj = await r.json().catch(() => null);
  return jj && jj.code === 0 && jj.data ? jj.data.token : '';
}

async function loginInPage(tab) {
  const r = await run(tab, `(() => {
    const pw = document.getElementById('lgPw');
    if (!pw) return 'no-login-form';
    pw.value = ${JSON.stringify(ADMIN_PW)};
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...document.querySelectorAll('#modal button')].find((b) => /登录/.test(b.textContent));
    if (!btn) return 'no-login-button';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(1500);
  return r;
}

async function ensureLoggedIn(tab) {
  const rows = async () => Number(await run(tab, `String(document.querySelectorAll('#pageRows tr').length)`));
  const lg = await loginInPage(tab);
  if (await rows() > 0) return lg;
  await sleep(1500);
  if (await rows() > 0) return lg;
  return 'list-empty:' + lg;
}

/* 读首页区块条数 + 每个区块的类型（用来核对「少的是哪一个、恢复回原位没有」）
   DOM 事实：每个区块是 `#tree .tnode`，类型角标是 `.kind`，只统计顶层可删项（带 data-rm） */
const BLOCKS = `(() => {
  const list = [...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]'));
  const kinds = list.map((n) => {
    const tag = n.querySelector('.kind');
    return (tag ? tag.textContent : '').trim();
  });
  return JSON.stringify({ count: list.length, kinds });
})()`;

const draftCount = async () => {
  const r = await fetch(SITE + '/api/decorate/stats', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  const jj = await r.json();
  return jj.data && jj.data.drafts;
};

ADMIN_TOKEN = await fetchAdminToken();
if (!ADMIN_TOKEN) {
  console.error('拿不到管理员会话：请设置 ADMIN_PASSWORD 或 ADMIN_TOKEN 后重跑');
  process.exit(1);
}

console.log('\n[1] 进入首页装修编辑器');
const draftsBefore = await draftCount();
let tab = await open(SITE + '/admin/');
{
  const lg = await ensureLoggedIn(tab);
  if (lg.indexOf('list-empty') === 0) {
    console.error('装修台没进入可用状态（' + lg + '）：请先手动看一次 /admin/');
    process.exit(1);
  }
  const opened = await run(tab, `(() => {
    const a = document.querySelector('#pageRows [data-open="home"]') || document.querySelector('#pageRows [data-open]');
    if (!a) return 'no-open';
    a.click();
    return a.getAttribute('data-open') || 'home';
  })()`);
  await sleep(2200);
  ok(opened && opened !== 'no-open', '从列表进入编辑器（首页）', opened);
}

console.log('\n[2] 拦截原生 confirm 并点一次删除');
let before = { count: 0, kinds: [] };
let after = { count: 0, kinds: [] };
let toastTxt = '';
let actBtn = false;
let confirmCalls = -1;
{
  /* 先把 confirm 换掉：既统计调用次数，又返回 false（=用户点取消）。
     如果删除逻辑还残留 confirm，delete 会被这次「取消」拦下 → 区块数不变 → 下面的断言直接报红。 */
  await run(tab, `(() => {
    window.__confirmCalls = 0;
    window.confirm = function () { window.__confirmCalls++; return false; };
    return 'hooked';
  })()`);

  before = JSON.parse(await run(tab, BLOCKS));
  ok(before.count > 0, '首页区块树有区块可删', 'count=' + before.count);
  if (before.count === 0) { await close(tab); process.exit(1); }

  /* 删「第 2 个」而不是第 1 个 —— 第 1 个删了不好判断「是否恢复回原位」 */
  const target = before.count >= 2 ? 1 : 0;
  await run(tab, `(() => {
    const items = [...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]'));
    const it = items[${target}];
    if (!it) return 'no-item';
    const rm = it.querySelector('[data-rm]');
    if (!rm) return 'no-rm';
    rm.click();
    return 'clicked';
  })()`);
  await sleep(700);

  confirmCalls = Number(await run(tab, `String(window.__confirmCalls)`));
  after = JSON.parse(await run(tab, BLOCKS));

  ok(confirmCalls === 0, '点删除没有触发原生 confirm', 'confirm 调用次数=' + confirmCalls);
  ok(after.count === before.count - 1, '区块立即少一个（即时生效）',
    before.count + ' → ' + after.count);
  ok(after.kinds.join(',') === before.kinds.filter((_, i) => i !== target).join(','),
    '少掉的正是第 ' + (target + 1) + ' 个（顺序其余不变）');

  const t = JSON.parse(await run(tab, `(() => {
    const box = document.getElementById('toast');
    const last = box ? box.lastElementChild : null;
    const act = last ? last.querySelector('.t-act') : null;
    return JSON.stringify({
      text: last ? last.textContent : '',
      hasAct: !!act,
      actText: act ? act.textContent : ''
    });
  })()`));
  toastTxt = t.text || '';
  actBtn = t.hasAct;
  ok(/可撤销/.test(toastTxt), 'toast 文案含「可撤销」', JSON.stringify(toastTxt));
  ok(actBtn && /撤销/.test(t.actText || ''), 'toast 里有「撤销」按钮', JSON.stringify(t.actText));
}

console.log('\n[3] 点「撤销」→ 原位恢复');
{
  await run(tab, `(() => {
    const last = document.getElementById('toast').lastElementChild;
    const act = last && last.querySelector('.t-act');
    if (act) act.click();
    return act ? 'clicked' : 'no-act';
  })()`);
  await sleep(600);
  const restored = JSON.parse(await run(tab, BLOCKS));
  ok(restored.count === before.count, '撤销后区块数恢复', restored.count + ' / 期望 ' + before.count);
  ok(restored.kinds.join(',') === before.kinds.join(','), '撤销后顺序与原来完全一致（原位恢复）',
    restored.kinds.join(',') + ' vs ' + before.kinds.join(','));
}

console.log('\n[4] 顶层区块同样「删一个 → 撤销只回一个」');
{
  /* 顶层区块 = #tree 的直接子 div 里的 .tnode（renderNode 的层级结构：box > row + 子 box） */
  const TOP = `(() => {
    const list = [...document.querySelectorAll('#tree > div > .tnode')].filter((n) => n.querySelector('[data-rm]'));
    return JSON.stringify({ count: list.length, kinds: list.map((n) => ((n.querySelector('.kind') || {}).textContent || '').trim()) });
  })()`;

  const b4 = JSON.parse(await run(tab, TOP));
  ok(b4.count >= 2, '有多个顶层区块可测', 'count=' + b4.count);

  const last = b4.count - 1;
  await run(tab, `(() => {
    const list = [...document.querySelectorAll('#tree > div > .tnode')].filter((n) => n.querySelector('[data-rm]'));
    const it = list[${last}];
    if (!it) return 'no-item';
    it.querySelector('[data-rm]').click();
    return 'clicked';
  })()`);
  await sleep(600);
  const a4 = JSON.parse(await run(tab, TOP));
  ok(a4.count === b4.count - 1, '顶层区块即时少一个', b4.count + ' → ' + a4.count);
  ok(a4.kinds.join(',') === b4.kinds.filter((_, i) => i !== last).join(','), '少掉的是最后一个顶层区块');

  await run(tab, `(() => {
    const last = document.getElementById('toast').lastElementChild;
    const act = last && last.querySelector('.t-act');
    if (act) act.click();
    return act ? 'clicked' : 'no-act';
  })()`);
  await sleep(600);
  const r4 = JSON.parse(await run(tab, TOP));
  /* 这条是「撤销只回一个」的核心：曾经把整份数组插回去，撤销后顶层区块会翻倍 */
  ok(r4.count === b4.count, '撤销后顶层区块数不多不少', r4.count + ' / 期望 ' + b4.count);
  ok(r4.kinds.join(',') === b4.kinds.join(','), '撤销后顶层顺序与原来完全一致', r4.kinds.join(','));
}

console.log('\n[5] 服务端零残留');
{
  const draftsAfter = await draftCount();
  ok(draftsAfter === draftsBefore, '草稿数未变（页面内存改动，未落盘）',
    draftsBefore + ' → ' + draftsAfter);
}

await close(tab);

console.log('\n' + '─'.repeat(56));
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
