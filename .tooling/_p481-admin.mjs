/**
 * 装修台（/admin）「沉浸式」顶栏的真浏览器验收。
 *
 * 为什么必须单独有这一个：装修台的手机预览走 `shared/pv-render.js`，
 * 与 `/preview`（编译真机 WXML/WXSS）**是两条链路** —— 只跑一边，
 * 另一边的 `applyNavStyle` / `.ph-immersive` 一次都不会被执行，
 * 而静态断言（只查字符串在不在）照样全绿。
 *
 * 验收四件事：
 *   ① 沉浸式初始态：手机屏内容顶到最上面（`.phone-bar` 脱离文档流、不占高度）
 *   ② 顶栏 `absolute` + 底色透明 + 标题隐藏（时间与胶囊保留 —— 真机上它们也一直在）
 *   ③ 装修台**不做**「上划浮现」：滚过阈值后**不应**出现 nav-reveal
 *      （`.phone` 的 overflow:hidden 让 sticky 失效，半成品比不做更糟 —— 见 admin.css 注释）
 *   ④ 非沉浸式页面（如 p288）不受影响：顶栏照旧占位、常驻
 *
 * 用法：node .tooling/_p481-admin.mjs [--base http://127.0.0.1:3000] [--out .tooling/_shots/p481-admin]
 * 退出码：0 = 全部通过；1 = 有断言失败
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import adminToken from './_admin.mjs';

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', out: '.tooling/_shots/p481-admin', key: 'p481' };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') opt.base = argv[++i];
  else if (argv[i] === '--out') opt.out = argv[++i];
  /* 默认测 p481（历史用法）；--key home 就是换首页之后的用法 ——
     首页现在也是 14 区块 + 沉浸式，同一套判据照样适用。 */
  else if (argv[i] === '--key') opt.key = argv[++i];
}
const BASE = opt.base.replace(/\/$/, '');

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const results = [];
const check = (name, ok, msg) => { results.push({ name, ok: !!ok, msg: msg || '' }); console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? '' : '  → ' + msg)); };

const port = 9900 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(join(tmpdir(), 'p481adm-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--window-size=1440,900',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, _id = 0; const _pending = new Map();
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
ws.addEventListener('message', (evt) => {
  const m = JSON.parse(evt.data);
  if (m.id && _pending.has(m.id)) {
    const { resolve: rs, reject: rj } = _pending.get(m.id);
    _pending.delete(m.id);
    m.error ? rj(new Error(m.error.message)) : rs(m.result);
  }
});
const send = (method, params) => new Promise((rs, rj) => { const id = ++_id; _pending.set(id, { resolve: rs, reject: rj }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
const evalJs = async (expr, aw) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!aw });
  if (r.exceptionDetails) throw new Error('页面内异常: ' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
  return r.result ? r.result.value : undefined;
};
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.data, 'base64');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log('  截图 →', file, '(' + Math.round(buf.length / 1024) + ' KB)');
}

/*
 * 探针：顶栏几何 + 浮现状态。
 * ⚠️ 那几个带 transition 的属性（background-color / opacity）在**后台标签**里会被 Chrome 节流，
 *    getComputedStyle 会停在中间态 —— 无头这里虽然大多是前台，但仍统一先关掉过渡再读，避免假红。
 */
const PROBE = `(() => {
  const phone = document.getElementById('phone');
  const stage = document.querySelector('.phone-stage');
  const bar = document.querySelector('.phone-bar');
  const screen = document.getElementById('preview');
  const title = document.getElementById('phTitle');
  if (!phone || !stage || !bar || !screen) return JSON.stringify({ error: '装修台手机壳结构缺失' });
  const oldB = bar.style.transition; bar.style.transition = 'none';
  const oldT = title.style.transition; title.style.transition = 'none';
  void bar.offsetHeight;
  const cs = getComputedStyle(bar);
  const before = getComputedStyle(bar, '::before');
  const v = {
    phoneClass: phone.className,
    stageScrollTop: Math.round(stage.scrollTop),
    barPosition: cs.position,
    barHeight: Math.round(bar.getBoundingClientRect().height),
    beforeBg: before.backgroundColor,
    beforeHeight: before.height,
    titleOpacity: getComputedStyle(title).opacity,
    /* 正文区相对手机顶部的偏移：沉浸式应为 0（整屏铺满），标准应为顶栏高度 */
    screenTopInPhone: Math.round(screen.getBoundingClientRect().top - phone.getBoundingClientRect().top),
    stageScrollable: stage.scrollHeight > stage.clientHeight
  };
  bar.style.transition = oldB; title.style.transition = oldT;
  return JSON.stringify(v);
})()`;

async function openEditor(key) {
  const t = await adminToken(BASE);
  await send('Page.navigate', { url: BASE + '/console' });
  await sleep(1200);
  await evalJs('localStorage.setItem("lexy_admin_token", ' + JSON.stringify(t) + ')');
  await send('Page.navigate', { url: BASE + '/admin?edit=' + encodeURIComponent(key) });
  await sleep(3500);
  /* 等手机屏真的画出内容（异步拉页面数据 + pv-render） */
  for (let i = 0; i < 30; i++) {
    const ok = await evalJs('!!document.querySelector("#preview .page, #preview [class*=block-wrap], #preview img")');
    if (ok) break;
    await sleep(400);
  }
  await sleep(800);
}

(async () => {
  await send('Page.enable');
  await send('Runtime.enable');

  /* ---- ①~③ 沉浸式页面 ---- */
  console.log('\n[沉浸式] ' + opt.key);
  await openEditor(opt.key);
  let st = JSON.parse(await evalJs(PROBE) || '{}');
  console.log('  初始态:', JSON.stringify(st));
  check('装修台：沉浸式页面的手机壳带 ph-immersive', /ph-immersive/.test(st.phoneClass || ''), st.phoneClass);
  check('装修台：顶栏脱离文档流（absolute）', st.barPosition === 'absolute', '实际 ' + st.barPosition);
  check('装修台：顶栏不占高度 —— 内容顶到手机最上面（整屏铺满）', st.screenTopInPhone === 0, '正文区偏移 ' + st.screenTopInPhone + 'px（应 0）');
  check('装修台：初始态标题隐藏', st.titleOpacity === '0', 'opacity=' + st.titleOpacity);
  await shot(opt.out + '-top.png');

  /*
   * 滚过阈值 → **不应**浮现。装修台刻意不做这件事（`.phone` 的 overflow:hidden 让 sticky 失效），
   * 这条断言就是防止有人再把它「补」回来却看不到效果。
   */
  await evalJs('document.querySelector(".phone-stage").scrollTop = 400');
  await sleep(900);
  st = JSON.parse(await evalJs(PROBE) || '{}');
  console.log('  滚动后:', JSON.stringify(st));
  check('装修台：不做「上划浮现」——滚过阈值后不应出现 nav-reveal（该效果只在 /preview 看）',
    !/nav-reveal/.test(st.phoneClass || ''), st.phoneClass);

  /* ---- ④ 标准页面不受影响（只在测 p481 时跑：--key home 时首页本身就是沉浸式，没有标准页可对照） ---- */
  if (opt.key !== 'p481') {
    const bad0 = results.filter((r) => !r.ok);
    console.log('\n汇总（--key ' + opt.key + '，跳过 p288 对照组）：' +
      (results.length - bad0.length) + ' 通过 / ' + bad0.length + ' 失败');
    ws.close(); child.kill();
    process.exit(bad0.length ? 1 : 0);
  }
  console.log('\n[标准] p288 了解莱克（对照组）');
  await openEditor('p288');
  st = JSON.parse(await evalJs(PROBE) || '{}');
  console.log('  初始态:', JSON.stringify(st));
  check('装修台：标准页面**不带** ph-immersive（不能误伤）', !/ph-immersive/.test(st.phoneClass || ''), st.phoneClass);
  check('装修台：标准页面顶栏照旧占位（正文区在顶栏之下）', st.screenTopInPhone > 0, '正文区偏移 ' + st.screenTopInPhone + 'px（应 > 0）');
  check('装修台：标准页面标题常驻可见', st.titleOpacity === '1', 'opacity=' + st.titleOpacity);

  const bad = results.filter((r) => !r.ok);
  console.log('\n汇总：' + (results.length - bad.length) + ' 通过 / ' + bad.length + ' 失败');
  ws.close(); child.kill();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error('失败：' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
