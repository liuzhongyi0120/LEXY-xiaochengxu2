/**
 * 验收「把有赞首页复刻搬进内置首页 home」之后的真实形态。
 *
 * 与 _shot-p481.mjs 的差别：这里**不点任何页面** —— /preview 打开时默认选中的就是
 * 内置首页（列表第一项），正好用来验「编辑器里默认看到的首页是不是新的」。
 *
 * 必验四件事（前三条正是这次换首页要解决的）：
 *   ① 默认打开的首页 = 新的 14 区块（不再是老的 11 区块）
 *   ② 底部导航「首页」有高亮（此前指向 p481，启动页匹配不上 → 整条不高亮）
 *   ③ 沉浸式：首个内容 top=0、底色 #F2EDE7、初始无标题栏
 *   ④ 整页截图能一次看全 14 区块
 *
 * 用法：node .tooling/_shot-home-new.mjs [--out .tooling/_shots/home-new]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import adminToken from './_admin.mjs';

const opt = { base: 'http://127.0.0.1:3000', out: '.tooling/_shots/home-new', w: 460, h: 1000 };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--out') opt.out = process.argv[i + 1];
}

const chrome = 'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
if (!existsSync(chrome)) { console.error('找不到无头 Chrome'); process.exit(2); }

const ADMIN = await adminToken(opt.base);
const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'homenew-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pend = new Map();
const send = (method, params) => new Promise((res, rej) => {
  const i = ++id; pend.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method: method, params: params || {} }));
});

for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.filter((t) => t.type === 'page')[0];
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch (e) { /* 还没起来 */ }
  await sleep(120);
}
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
});
ws.addEventListener('message', (e) => {
  let m; try { m = JSON.parse(e.data); } catch (x) { return; }
  if (m.id && pend.has(m.id)) {
    const p = pend.get(m.id); pend.delete(m.id);
    if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
  }
});

const evalJs = async (expr, awaitPromise) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
  if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
};
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { captureBeyondViewport: true });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  截图 →', file);
};

const PROBE = `(() => {
  const screen = document.getElementById('preview');
  const phone = document.getElementById('phone');
  const first = document.querySelector('.phone-screen > *');
  const tb = document.getElementById('phTabbar');
  const onItems = tb ? [...tb.querySelectorAll('.pvtb-item.on')] : [];
  const pvTitle = document.getElementById('phTitle');
  /* 只数区块，别带上 .page 外层容器：.phone-screen 的直接子元素只有 1 个 .page，
     两个选择器一起用会把容器也算成一块，14 块数成 15 */
  const blocks = document.querySelectorAll('.phone-screen [class*="blk"]');
  return JSON.stringify({
    curKey: (window.CUR && window.CUR.key) || (document.querySelector('.pv-item.sel') || {}).dataset?.key || '',
    phoneClass: phone ? phone.className : '',
    pageBg: first ? getComputedStyle(first).backgroundColor : '',
    firstTop: first ? Math.round(first.getBoundingClientRect().top - phone.getBoundingClientRect().top) : null,
    tabbarHidden: tb ? tb.hidden : null,
    tabbarOn: onItems.map((e) => (e.querySelector('.pvtb-text') || {}).textContent || ''),
    tabbarTexts: tb ? [...tb.querySelectorAll('.pvtb-text')].map((e) => e.textContent) : [],
    titleOpacity: pvTitle ? getComputedStyle(pvTitle).opacity : null,
    blockCount: blocks ? blocks.length : 0,
    scrollH: screen ? screen.scrollHeight : 0
  });
})()`;

(async () => {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: opt.base + '/console' });
  await sleep(1200);
  await evalJs('localStorage.setItem("lexy_admin_token", ' + JSON.stringify(ADMIN) + ')');
  await send('Page.navigate', { url: opt.base + '/preview' });
  await sleep(4000);

  /* 等图片解码：区块多，慢一点 */
  let st = null;
  for (let i = 0; i < 30; i++) {
    st = JSON.parse((await evalJs(PROBE)) || '{}');
    if (st.blockCount) break;
    await sleep(500);
  }
  console.log('默认页探测:', JSON.stringify(st));

  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log((ok ? '  ✅ ' : '  ❌ ') + name + (detail ? '  —— ' + detail : ''));
  };

  check('默认打开的首页是新的（14 区块，非老的 11）', st.blockCount === 14, '实际 ' + st.blockCount + ' 块');
  check('底色 = rgb(242,237,231)（#F2EDE7）', st.pageBg === 'rgb(242, 237, 231)', '实际 ' + st.pageBg);
  check('沉浸式生效（ph-immersive）', /ph-immersive/.test(st.phoneClass || ''), st.phoneClass);
  check('沉浸式初始态：内容顶到最上面（top=0）', st.firstTop === 0, '实际 ' + st.firstTop);
  check('底部导航可见', st.tabbarHidden === false, 'hidden=' + st.tabbarHidden);
  check('底部导航「首页」有高亮（此前会整条不高亮）', (st.tabbarOn || []).indexOf('首页') >= 0,
    '高亮项=' + JSON.stringify(st.tabbarOn) + ' 全部=' + JSON.stringify(st.tabbarTexts));

  await sleep(600);
  await shot(opt.out + '-top.png');

  /* 上划过阈值 → 标题栏浮现 */
  await evalJs('document.getElementById("preview").scrollTop = 400');
  await sleep(900);
  const st2 = JSON.parse((await evalJs(PROBE)) || '{}');
  console.log('滚动后:', JSON.stringify(st2));
  check('上划后标题栏浮现（opacity=1）', st2.titleOpacity === '1', 'opacity=' + st2.titleOpacity);
  await shot(opt.out + '-rev.png');

  /* 整页：放开手机屏高度 + 抬高视口，否则截出来还是首屏 */
  const full = await evalJs(`(() => {
    const s = document.getElementById('preview');
    const p = document.getElementById('phone');
    s.style.height = 'auto'; s.style.overflow = 'visible'; s.scrollTop = 0;
    p.style.height = 'auto';
    return s.scrollHeight;
  })()`);
  console.log('整页高度:', full);
  await send('Emulation.setDeviceMetricsOverride', {
    width: opt.w, height: Math.max(1000, Math.round(full) + 120), deviceScaleFactor: 1, mobile: false
  });
  await sleep(1500);
  await shot(opt.out + '-full.png');

  const bad = checks.filter((c) => !c.ok);
  console.log('\n' + (checks.length - bad.length) + '/' + checks.length + ' 通过');
  ws.close(); child.kill();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error('失败：' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
