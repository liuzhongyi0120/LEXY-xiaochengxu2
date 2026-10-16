/**
 * 取证截图：新建的「有赞首页复刻」自定义页（key=p481）在 /preview 里的真实形态。
 *
 * 三张图，各验一件事：
 *   ① -top   沉浸式初始态：内容从屏幕最顶端铺满、**看不到标题栏**
 *   ② -rev   上划过阈值后：标题栏浮现（白底 + 标题可见）
 *   ③ -full  整页 14 个区块：与有赞原页逐块对账
 *
 * 用法：node .tooling/_shot-p481.mjs [--out .tooling/_shots/p481]
 *
 * ⚠️ 判据必须是「图片真的解码成功」而不是「DOM 里有 img」：
 *    素材链路不通时 img 元素照样在 DOM 里，只是 naturalWidth === 0（破图）。
 *    只数 DOM 会得出「一切正常」的假绿 —— 本项目此前踩过这个坑。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ADMIN_HELPER = await import('./_admin.mjs');

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', out: '.tooling/_shots/p481', w: 460, h: 1000 };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') opt.base = argv[++i];
  else if (argv[i] === '--out') opt.out = argv[++i];
}
const base = opt.base.replace(/\/$/, '');

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'shotp481-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=' + opt.w + ',' + opt.h, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
async function evalJs(expression, awaitPromise) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: !!awaitPromise });
  if (r.exceptionDetails) throw new Error('页面内异常: ' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
  return r.result ? r.result.value : undefined;
}

/* 图片解码状态 + 顶栏形态，一次取全 */
const PROBE = `(() => {
  const imgs = [...document.querySelectorAll('img')];
  const bar = document.querySelector('.phone-bar');
  const phone = document.getElementById('phone');
  const t = document.getElementById('phTitle');
  return JSON.stringify({
    imgTotal: imgs.length,
    imgOk: imgs.filter((im) => im.complete && im.naturalWidth > 0).length,
    broken: imgs.filter((im) => im.complete && im.naturalWidth === 0).map((im) => im.currentSrc || im.src).slice(0, 8),
    loading: imgs.filter((im) => !im.complete).map((im) => im.src).slice(0, 8),
    phoneClass: phone.className,
    barBg: bar ? getComputedStyle(bar).backgroundColor : null,
    titleOp: t ? getComputedStyle(t).opacity : null,
    titleText: t ? t.textContent : null,
    videos: document.querySelectorAll('video').length,
    scrollH: document.getElementById('preview').scrollHeight
  });
})()`;

/** 等所有 <img> 解码完成（有破图就立刻抛） */
async function waitImages(label) {
  let st = null;
  for (let i = 0; i < 50; i++) {
    await sleep(400);
    st = JSON.parse((await evalJs(PROBE)) || '{}');
    if ((st.broken || []).length) throw new Error(label + ' 出现破图: ' + st.broken.join(' , '));
    if (st.imgTotal > 0 && !(st.loading || []).length) return st;
  }
  return st;
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const buf = Buffer.from(r.data, 'base64');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log('  已截图 →', file, '(' + Math.round(buf.length / 1024) + ' KB)');
}

(async () => {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('WS 失败'))); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: opt.w, height: opt.h, deviceScaleFactor: 1, mobile: false });

  /* /preview 取页面数据要管理员令牌 → 先塞进 localStorage（与 shot-console.mjs 同法） */
  const ADMIN = await ADMIN_HELPER.adminToken(base);
  await send('Page.navigate', { url: base + '/console' });
  await sleep(1200);
  await evalJs('localStorage.setItem("lexy_admin_token", ' + JSON.stringify(ADMIN) + ')');
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);

  await send('Page.navigate', { url: base + '/preview' });
  await sleep(1500);

  /* 等左栏页面列表渲染出来 → 点 p481（列表是异步拉的，读早了点击会落空） */
  let clicked = false;
  for (let i = 0; i < 40; i++) {
    const r = await evalJs('!!document.querySelector(\'.pv-item[data-key="p481"]\')');
    if (r) {
      await evalJs('document.querySelector(\'.pv-item[data-key="p481"]\').click()');
      clicked = true;
      break;
    }
    await sleep(400);
  }
  if (!clicked) throw new Error('左栏列表里等不到 p481 —— 页面数据没下发');
  console.log('已切到 p481');

  /* 等首屏图片解码完 */
  let st = await waitImages('顶部');
  console.log('探测结果:', JSON.stringify(st));

  if (!st || !st.imgTotal) throw new Error('页面上一个 img 都没有 —— 渲染链路没跑起来');
  if ((st.broken || []).length) throw new Error('存在破图: ' + st.broken.join(' , '));

  await sleep(500);
  await shot(opt.out + '-top.png');

  /* 上划过阈值（阈值 = 整条标题栏高 64px）→ 标题栏应浮现 */
  await evalJs('document.getElementById("preview").scrollTop = 400');
  await sleep(800);
  const st2 = JSON.parse((await evalJs(PROBE)) || '{}');
  console.log('滚动后:', JSON.stringify(st2));
  await shot(opt.out + '-rev.png');

  /*
   * 整页：把手机屏的高度限制与裁剪放开，再把**视口本身**拉高到整页高度。
   *
   * ⚠️ 只改 DOM 高度是不够的：captureBeyondViewport 截的是「文档」，
   *    而 .phone-screen 是个定高 + 裁剪的滚动容器，放开后文档仍被视口（1000px）卡住 ——
   *    实测截出来还是首屏那 718px，看着「什么都没变」。
   *    必须同时抬高视口，文档才有地方长高。
   */
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

  ws.close();
  child.kill();
  process.exit(0);
})().catch((e) => {
  console.error('失败：' + e.message);
  try { child.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
