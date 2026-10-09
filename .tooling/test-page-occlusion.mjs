/**
 * 页面遮挡哨兵（真 Chrome 量像素，零依赖，直连 CDP）
 *
 * 为什么需要它：
 *   2026-10-09 后台控制台「数据概览」整页黑屏 —— 根因是 lightbox 的裸 `.lb` 样式
 *   （position:fixed; inset:0; background:rgba(12,16,22,.93)）命中了销售趋势图的 x 轴标签
 *   `<div class="lb">`，7 个图例一起变成铺满全屏的深色层，叠成纯黑。
 *
 *   现有的三层验证**全都漏了它**：
 *     - check-all.mjs 静态断言：只查文件在不在、断言跑得通，不管版式；
 *     - test-media-ui.mjs（jsdom）：**jsdom 不做布局**（getBoundingClientRect 全 0），
 *       元素还在、文字还在，断言自然全绿；
 *     - test-media-layout.mjs（真浏览器）：只量素材库页，而事故发生在概览页。
 *
 *   这个脚本不看类名、不看数据，只看**用户眼睛里会发生什么**：
 *   页面渲染完成后，视口里是否被「非预期的、铺满视口的 fixed/absolute 层」盖住。
 *   任何「撞车式」的样式事故（不管叫什么名字）都会在这里现形。
 *
 * 用法：node .tooling/test-page-occlusion.mjs [--base http://127.0.0.1:3000] [--w 1440] [--h 900]
 * 退出码：0 = 全部页面干净；1 = 有页面被遮挡
 *
 * 报告 08 之后：控制台与装修台的接口都要求管理员身份。不登录的话每个页面都会停在
 * 「管理员登录」遮罩上 —— 那是**预期**的登录层（不是遮挡事故），却会让哨兵量错对象。
 * 所以这里先换一个管理员会话写进 localStorage，再开始巡检；
 * 并把「页面是否停在登录层上」单列一条断言：一旦令牌失效就直接报错，
 * 而不是让哨兵对着登录框量出一片"干净"。
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
const opt = { base: 'http://127.0.0.1:3000', w: 1440, h: 900 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--base') opt.base = argv[++i];
  else if (a === '--w') opt.w = Number(argv[++i]);
  else if (a === '--h') opt.h = Number(argv[++i]);
}
const base = opt.base.replace(/\/$/, '');

/* 要巡检的页面：每个控制台菜单页 + 装修台。
 * 素材库（#media）与自定义页编辑器单独放在最后 —— 它们会加载大量图片，等等更久。 */
const PAGES = [
  { name: '概览（数据概览）', url: base + '/console#dashboard', wait: 2200 },
  { name: '订单管理', url: base + '/console#orders', wait: 2200 },
  { name: '客户管理', url: base + '/console#customers', wait: 1800 },
  { name: '商品管理', url: base + '/console#goods', wait: 2000 },
  { name: '分类管理', url: base + '/console#cates', wait: 1800 },
  { name: '评价管理', url: base + '/console#reviews', wait: 1800 },
  { name: '优惠券', url: base + '/console#coupons', wait: 1800 },
  { name: '店铺设置', url: base + '/console#settings', wait: 1800 },
  { name: '素材库', url: base + '/console#media', wait: 2600 },
  { name: '店铺装修', url: base + '/console#decorate', wait: 2000 },
  { name: '装修台 /admin', url: base + '/admin', wait: 2600 }
];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9500 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'occ-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=' + opt.w + ',' + opt.h, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 未就绪 */ }
    await sleep(120);
  }
  throw new Error('连接 chrome 调试端口超时');
}

let ws, msgId = 0;
const pending = new Map();
function send(method, params) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

/**
 * 在页面里跑的探针。判据（只看用户看到什么，不看类名）：
 *  1) 采样视口内 5×3=15 个点，若**所有**采样点都落在同一个铺满视口的 fixed/absolute 层里
 *     → 页面被整层盖住（黑屏/大白幕）。允许弹层根容器存在，但它里面只要有内容就算遮挡。
 *  2) 若存在铺满视口（面积 ≥ 视口 92%）的 fixed/absolute 元素、且它**不在 App 自己的弹层根里**，
 *     → 记为可疑层（可能是撞车导致的 fixed，也可能是设计如此，交由断言判定）。
 *     两个弹层根：#layer（控制台）与 #modal（装修台，静态写在 index.html 里，靠 hidden 开关）。
 *     这不是放水 —— 当年出事的 `.lb` 是**图表 x 轴标签**，既不是弹层根也没在 #layer 里。
 *  3) 顺带记录页面文本长度与「是否停在登录层上」：
 *     0 文本 + 有遮挡 = 典型「整页白/黑」；停在登录层上说明这次量的是登录框而不是页面。
 */
const PROBE = `(()=>{
  const W = innerWidth, H = innerHeight;
  const vw = W * H;
  const isFull = (r) => r.width >= W - 2 && r.height >= H - 2;
  const inOverlay = (e) => !!(e.closest && (e.closest('#layer') || e.closest('#modal')));
  const layers = [];
  for (const e of document.querySelectorAll('body *')) {
    const s = getComputedStyle(e);
    if (s.position !== 'fixed' && s.position !== 'absolute') continue;
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
    const r = e.getBoundingClientRect();
    if (!isFull(r)) continue;
    const bg = s.backgroundColor;
    const alpha = (() => { const m = /rgba?\\(([^)]+)\\)/.exec(bg); if (!m) return 1; const p = m[1].split(','); return p.length > 3 ? Number(p[3]) : 1; })();
    layers.push({
      sel: e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''),
      bg, alpha, z: s.zIndex, inOverlay: inOverlay(e), paints: alpha > 0.05
    });
  }
  // 采样：整页被盖住时，全部采样点会命中同一批层
  const pts = [];
  for (let ix = 1; ix <= 5; ix++) for (let iy = 1; iy <= 3; iy++) {
    pts.push([Math.round(W * ix / 6), Math.round(H * iy / 4)]);
  }
  const hits = pts.map(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    if (!e) return '(null)';
    // IFRAME 不算「遮挡物」：有些页面（如店铺装修）主体就是内嵌的编辑器 iframe，
    // 采样点全命中它是**设计如此**，不是被盖上。真正的遮挡层会命中那个 fixed 层本身。
    if (e.tagName === 'IFRAME') return '(iframe-content)';
    return e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/)[0] : '');
  });
  const uniq = [...new Set(hits)];
  // 全部采样点都命中「同一个非 iframe 元素」→ 整页被一层覆盖（黑屏/白幕）
  const coveredAll = uniq.length === 1 && pts.length > 1 && uniq[0] !== '(iframe-content)';
  const bodyTextLen = (document.body.innerText || '').trim().length;
  const mEl = document.getElementById('modal');
  const loginShown = !!document.querySelector('.login-mask') || (!!mEl && !mEl.hidden);
  return JSON.stringify({
    url: location.href, bodyTextLen, loginShown,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    layers, sampleHits: uniq, coveredAll,
    layerKids: (document.getElementById('layer') || { children: [] }).children.length
  });
})()`;

const results = [];
let pass = 0, fail = 0;

function report(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

(async () => {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: opt.w, height: opt.h, deviceScaleFactor: 1, mobile: false });

  console.log('页面遮挡哨兵（真 Chrome ' + opt.w + '×' + opt.h + '，基址 ' + base + '）\n');

  /* ---------- 先登录：否则量到的是登录遮罩，不是页面 ---------- */
  let ADMIN = '';
  try {
    ADMIN = await ADMIN_HELPER.adminToken(base);
  } catch (e) {
    console.error('拿不到管理员会话，无法巡检（' + e.message + '）');
    try { ws.close(); } catch (e2) { /* ignore */ }
    try { child.kill(); } catch (e2) { /* ignore */ }
    process.exit(2);
  }
  await send('Page.navigate', { url: base + '/console' });
  await sleep(1200);
  const setTok = await send('Runtime.evaluate', {
    expression: 'localStorage.setItem("lexy_admin_token", ' + JSON.stringify(ADMIN) + '); localStorage.getItem("lexy_admin_token").slice(0,10)',
    returnByValue: true
  });
  const tokOk = setTok.result && typeof setTok.result.value === 'string' && setTok.result.value.length === 10;
  console.log('管理员会话已写入浏览器 localStorage：' + (tokOk ? '成功' : '失败'));
  if (!tokOk) {
    console.log('（登录态写入失败，后续断言会以「停在登录层上」报出来）');
  }
  /*
   * 关键：先离开这个文档再开始巡检。
   * 上面为了写 localStorage 已经加载过一次 /console（当时还没有令牌 → 弹了登录框）；
   * 而 /console → /console#dashboard 只改了 hash，属于**同文档内导航，浏览器不会重新加载**，
   * 那个登录框会一直留在屏幕上，于是整轮巡检量的都是登录框。
   */
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(400);

  for (const p of PAGES) {
    let d = null;
    try {
      await send('Page.navigate', { url: p.url });
      await sleep(p.wait);
      for (let i = 0; i < 15; i++) {
        const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (r.result && r.result.value === 'complete') break;
        await sleep(200);
      }
      await sleep(600);
      const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      if (r.exceptionDetails) { report(p.name, false, '探针执行异常：' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description)); continue; }
      d = JSON.parse(r.result.value);
    } catch (e) {
      report(p.name, false, '导航/探测失败：' + e.message);
      continue;
    }
    results.push({ page: p.name, ...d });

    // 断言 1：不能整页被同一层盖住
    report(p.name + '：页面没有被整层遮挡', !d.coveredAll,
      d.coveredAll ? '所有采样点都命中「' + d.sampleHits[0] + '」= 整页被盖住（黑屏/白幕）' : d.sampleHits.slice(0, 3).join(' / '));

    // 断言 2：不许存在「不透明的、铺满视口的、会出画的」可疑层
    // （App 自己的弹层根 #layer / #modal 除外 —— 它们是弹层的正常载体）
    const bad = d.layers.filter((l) => l.paints && !l.inOverlay);
    report(p.name + '：没有铺满视口的可疑浮层', bad.length === 0,
      bad.length ? bad.map((b) => b.sel + '(bg=' + b.bg + ' z=' + b.z + ')').join(' ; ') : '—');

    // 断言 3：页面必须有内容（文本量兜底，防「脚本挂了整页空白」）
    report(p.name + '：渲染出可见内容', d.bodyTextLen > 40, '文本长度 ' + d.bodyTextLen);

    // 断言 4：不能停在登录层上 —— 否则前三条量的都是登录框，等于没测
    report(p.name + '：已登录（量的是页面本身，不是登录框）', !d.loginShown,
      d.loginShown ? '页面停在登录层上：管理员令牌没生效，或该页接口又要求登录' : '—');
  }

  console.log('\n===== 明细 =====');
  for (const r of results) {
    console.log(r.page + ' | 文本 ' + r.bodyTextLen + ' | 采样命中 ' + r.sampleHits.length + ' 种 | 铺满层 ' +
      (r.layers.length ? r.layers.map((l) => l.sel + '(' + l.bg + ')').join(', ') : '无') + ' | #layer 子元素 ' + r.layerKids);
  }

  console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + ' 条）');
  try { ws.close(); } catch (e) { /* ignore */ }
  try { child.kill(); } catch (e) { /* ignore */ }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERR: ' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
