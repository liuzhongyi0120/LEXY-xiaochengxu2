/**
 * 装修台「组件库分桶」哨兵（真 Chrome，零依赖，直连 CDP）
 *
 * 为什么需要它：
 *   组件库里 59 个组件只有 25 个在真机上跑得起来，另外 34 个是**照抄有赞面板留档**的
 *   依赖占位（铁律 8：不假装可用）。平铺在一起时，运营要在 59 张卡里挑 25 张、
 *   还得分清哪些点下去只会看到一个「依赖」占位卡 —— 这是「看上去很全、其实不好用」。
 *   所以 2026-10-13 改成：能跑的常态展示，跑不起来的收进一个**默认折叠**的分组。
 *
 * 为什么必须用真浏览器量：
 *   「默认折叠」这件事**只在 DOM 里成立**（折叠时那些卡片根本不渲染），
 *   静态断言最多能证明源码里有这么一段逻辑，证明不了「运营打开时真的只看到 25 张」。
 *   而且这个项目的分组渲染已经被文本级断言骗过一次（写死 tab 名 → 整块渲染不出来却全绿）。
 *
 * 判据全部**从服务端数据现取**（/api/decorate/pages 的 lib + schema 的 dep），
 * 不在脚本里写死 22 / 33 / 55 这类数字 —— 两边各写一份必然走样。
 *
 * 用法：node .tooling/test-admin-lib.mjs [--base http://127.0.0.1:3000]
 * 退出码：0 = 全部通过；1 = 有失败项
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_HELPER = await import('./_admin.mjs');

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const argv = process.argv.slice(2);
let base = 'http://127.0.0.1:3000';
for (let i = 0; i < argv.length; i++) if (argv[i] === '--base') base = argv[++i];
base = base.replace(/\/$/, '');

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9900 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'lib-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null;
let msgId = 0;
const pending = new Map();

function send(method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, 30000);
  });
}

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const t = list.find((x) => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) return t.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('等不到 CDP 端点');
}

/* ---------------- 期望值：从服务端现取，不写死 ---------------- */
const token = await ADMIN_HELPER.adminToken(base);
const authHeaders = { Authorization: 'Bearer ' + token };

async function libFacts() {
  const r = await fetch(base + '/api/decorate/pages', { headers: authHeaders });
  const j = await r.json();
  const lib = j && j.data && j.data.lib;
  if (!lib) throw new Error('拿不到 /api/decorate/pages 的 lib');
  const basicDep = lib.basic.filter((x) => x.ok && x.dep).length;   // 基础 tab 里的依赖占位
  const groups = lib.groups || [];
  /* 分桶后「空组会被丢弃」，所以展开态的分组头 = 有可用项的组数 + 有占位项的组数 */
  const gAvail = groups.filter((g) => (g.items || []).some((x) => x.ok && !x.dep)).length;
  const gRest = groups.filter((g) => (g.items || []).some((x) => !(x.ok && !x.dep))).length;
  return {
    basicTotal: lib.basic.length,
    basicAvail: lib.basic.length - basicDep,
    basicDep,
    advTotal: lib.adv.length,
    expectedRest: basicDep,
    /* 展开后应有的分组头数量（默认态 + 折叠区，两段各自的非空组） */
    expandedGroups: gAvail + gRest,
    restGroups: gRest
  };
}
const facts = await libFacts();

/* ---------------- 断言统计 ---------------- */
let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

/** 采集组件库当前状态 */
const PROBE = `(() => {
  const grid = document.getElementById('libGrid');
  const cards = [...document.querySelectorAll('.lib-item')];
  const head = document.querySelector('.lib-rest-head');
  return JSON.stringify({
    cards: cards.length,
    dep: cards.filter((c) => c.querySelector('.lib-dep')).length,
    off: cards.filter((c) => c.classList.contains('off')).length,
    groups: [...document.querySelectorAll('.lib-group')].length,
    head: !!head,
    headCount: head ? Number((head.querySelector('i') || {}).textContent || 0) : -1,
    headBtn: head ? ((head.querySelector('em') || {}).textContent || '').trim() : '',
    headOpen: head ? head.classList.contains('on') : null,
    desc: ((document.getElementById('libDesc') || {}).textContent || '').replace(/\\s+/g, ' ').trim()
  });
})()`;

const CLICK_HEAD = `(async () => {
  const head = document.querySelector('.lib-rest-head');
  if (!head) return 'nohead';
  head.click();
  await new Promise((r) => setTimeout(r, 350));
  return 'ok';
})()`;

try {
  ws = new WebSocket(await getWsUrl());
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
    setTimeout(() => rej(new Error('WebSocket 打不开')), 10000);
  });

  console.log('期望值（服务端现取）：' + JSON.stringify(facts));

  /* 先写管理员令牌：装修台与 /console 共用 lexy_admin_token */
  await send('Page.navigate', { url: base + '/console' });
  await sleep(1200);
  const setTok = await send('Runtime.evaluate', {
    expression: 'localStorage.setItem("lexy_admin_token", ' + JSON.stringify(token) + '); localStorage.getItem("lexy_admin_token").slice(0,8)',
    returnByValue: true
  });
  report('管理员会话写入 localStorage',
    setTok.result && typeof setTok.result.value === 'string' && setTok.result.value.length === 8);

  /* 离开这个文档再进装修台（同文档 hash 导航不会重载，令牌读不到）
   *
   * ⚠️ 必须走 `?edit=home` 直达编辑器：页面列表里的「装修」是
   *    `<a href="/admin?edit=xxx" target="_blank">`，**没有 data-open 了**
   *    （见 admin.js 的点击委托注释）。此前用 `#pageRows [data-open]` 去点，
   *    在这个版本里永远点不中 → 编辑器进不去 → 左侧组件库是空的、卡片数恒为 0。
   */
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url: base + '/admin?edit=home' });
  await sleep(3800);

  /* 切到「基础组件」tab（默认是「常用组件」，那里没有分桶） */
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const t = [...document.querySelectorAll('.lib-tabs .lib-tab')].find((x) => /基础组件/.test(x.textContent));
      if (t) { t.click(); await new Promise((r) => setTimeout(r, 400)); }
      return 'ok';
    })()`,
    awaitPromise: true, returnByValue: true
  });
  await sleep(600);

  const readProbe = async () => {
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    if (r.exceptionDetails) throw new Error('探针异常：' + (r.exceptionDetails.exception || {}).description);
    return JSON.parse(r.result.value);
  };

  /* ---- 1. 默认态（折叠）：只看到能直接用的那些 ---- */
  const closed = await readProbe();
  report('默认态：组件库里只渲染「能直接跑」的卡片',
    closed.cards === facts.basicAvail,
    '可见卡片 ' + closed.cards + ' / 期望 ' + facts.basicAvail + '（基础组件共 ' + facts.basicTotal + '）');
  report('默认态：一个「依赖」角标都不露（依赖项都在折叠里）',
    closed.dep === 0, '依赖角标 ' + closed.dep);
  report('默认态：折叠头存在、写着折叠数量',
    closed.head && closed.headCount === facts.expectedRest && !closed.headOpen,
    'head=' + closed.head + ' count=' + closed.headCount + ' / 期望 ' + facts.expectedRest + ' open=' + closed.headOpen);
  report('默认态：折叠头按钮文案是「展开」', closed.headBtn === '展开', JSON.stringify(closed.headBtn));
  report('默认态：说明里点出折叠了多少个（避免运营以为组件库变少了）',
    closed.desc.indexOf(String(facts.expectedRest)) >= 0,
    JSON.stringify(closed.desc).slice(0, 150));

  /* ---- 2. 点开折叠头：完整的有赞分组清单回来 ---- */
  const clicked = await send('Runtime.evaluate', { expression: CLICK_HEAD, awaitPromise: true, returnByValue: true });
  report('点折叠头成功', clicked.result && clicked.result.value === 'ok', String(clicked.result && clicked.result.value));
  await sleep(500);
  const opened = await readProbe();
  report('展开后：卡片数 = 基础组件全量（55）',
    opened.cards === facts.basicTotal,
    '卡片 ' + opened.cards + ' / 期望 ' + facts.basicTotal);
  report('展开后：「依赖」角标数 = schema 里的依赖占位数',
    opened.dep === facts.basicDep,
    '依赖角标 ' + opened.dep + ' / 期望 ' + facts.basicDep);
  report('展开后：分组头数量 = 两段各自的非空组之和（可用段 + 折叠段）',
    opened.groups === facts.expandedGroups,
    '分组头 ' + opened.groups + ' / 期望 ' + facts.expandedGroups +
      '（可用段 ' + (facts.expandedGroups - facts.restGroups) + ' 组 + 折叠段 ' + facts.restGroups + ' 组）');
  report('展开后：折叠头按钮文案变成「收起」', opened.headBtn === '收起', JSON.stringify(opened.headBtn));

  /* ---- 3. 再点一次收回 ---- */
  await send('Runtime.evaluate', { expression: CLICK_HEAD, awaitPromise: true, returnByValue: true });
  await sleep(500);
  const recl = await readProbe();
  report('再点一次收起：卡片数回到默认态',
    recl.cards === facts.basicAvail && !recl.headOpen,
    '卡片 ' + recl.cards + ' / 期望 ' + facts.basicAvail);

  /* ---- 4. 默认态里每一张卡都必须是「点了真能加上」的 ---- */
  report('默认态：没有一张卡是「未接入」灰显的（灰卡就是点了没反应）',
    closed.off === 0, '灰显卡 ' + closed.off);

  console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + ' 条）');
} catch (e) {
  console.error('ERR: ' + e.message);
  fail++;
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { child.kill(); } catch (e) { /* ignore */ }
}
process.exit(fail === 0 ? 0 : 1);
