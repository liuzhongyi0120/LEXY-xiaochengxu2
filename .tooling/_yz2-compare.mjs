/**
 * 「了解莱克」页复刻对照验收：把有赞原页与我们的真机渲染**逐像素对账**并并排拍下来。
 *
 * 为什么必须用真浏览器 + 逐项量盒：
 *   /preview 是**直接编译真机 WXML + WXSS** 的，只有真 Chrome 才会做布局；
 *   jsdom 的 getBoundingClientRect 全是 0 —— 卡片摊成一条线也照样「全绿」。
 *   而且**并排图看不出所有问题**：本轮就有一处「名称坐标两边完全相同、只有容器盒子不同」
 *   的外边距折叠差异（见 PITFALLS.md Q2），肉眼与截图都发现不了。
 *
 * 用法：node .tooling/_yz2-compare.mjs [--key=p288] [--base http://127.0.0.1:3000]
 * 产出：.tooling/_cmp/yz2-youzan.png（原页）/ yz2-ours.png（我们）/ yz2-side.png（并排）
 *      ＋ stdout 上的「几何对账 / 样式对账」两张表
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import adminToken from './_admin.mjs';

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', key: 'p288' };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') opt.base = argv[++i];
  else if (argv[i] === '--key') opt.key = argv[++i];
}
const BASE = opt.base.replace(/\/$/, '');
const YOUZAN = 'https://shop46010558.m.youzan.com/wscshop/feature/uxp04RKnBb';

/* ---------------------------------------------------------------- 量测口径
 * 两份选择器表严格一一对应（有赞 DOM ↔ 我们的 .mg-*），对账表因此可以直接相减。
 * 对应关系：
 *   有赞 ._yzs_1_hpitemsa             ↔ 我们 .c-mg（模块外框）
 *   有赞 ._yzs_1_panel-title          ↔ 我们 .mg-head（标题区）
 *   有赞 ._yzs_1_sub-title            ↔ 我们 .mg-sub
 *   有赞 ._yzs_1_item_con             ↔ 我们 .mg-grid（卡片区）
 *   有赞 ._yzs_1_item_arr             ↔ 我们**没有这一层**（行由 flex-wrap 自然形成）
 *   有赞 ._yzs_1_product ._yzs_1_iner ↔ 我们 .mg-card
 *   有赞 ._yzs_1_item_img_wrap        ↔ 我们 .mg-pic
 *   有赞 ._yzs_1_item_info            ↔ 我们 .mg-body
 *   有赞 ._yzs_1_item_title           ↔ 我们 .mg-t
 * ------------------------------------------------------------------------ */
const YZ_BOXES = {
  module: '._yzs_1_hpitemsa', panelTitle: '._yzs_1_panel-title', sub: '._yzs_1_sub-title',
  itemCon: '._yzs_1_item_con', card1: '._yzs_1_product ._yzs_1_iner',
  imgWrap1: '._yzs_1_item_img_wrap', info1: '._yzs_1_item_info', title1: '._yzs_1_item_title'
};
const OUR_BOXES = {
  module: '.c-mg', panelTitle: '.mg-head', sub: '.mg-sub',
  itemCon: '.mg-grid', card1: '.mg-card',
  imgWrap1: '.mg-pic', info1: '.mg-body', title1: '.mg-t'
};
const YZ_STYLES = {
  styleModule: ['._yzs_1_hpitemsa', ['height', 'display', 'backgroundColor', 'paddingTop', 'paddingBottom']],
  styleTitle: ['._yzs_1_panel-title', ['marginTop', 'marginBottom', 'paddingTop', 'paddingLeft', 'display', 'textAlign']],
  styleSub: ['._yzs_1_sub-title', ['fontSize', 'fontWeight', 'color', 'lineHeight', 'marginBottom']],
  styleCard: ['._yzs_1_product ._yzs_1_iner', ['margin', 'borderRadius', 'backgroundColor', 'boxShadow', 'border', 'width']],
  styleImgWrap: ['._yzs_1_item_img_wrap', ['borderRadius', 'paddingTop', 'height', 'width', 'overflow', 'position']],
  styleInfo: ['._yzs_1_item_info', ['margin', 'padding', 'display', 'justifyContent', 'textAlign']],
  styleName: ['._yzs_1_item_title', ['fontSize', 'fontWeight', 'color', 'textAlign', 'marginTop', 'lineHeight']]
};
const OUR_STYLES = {
  styleModule: ['.c-mg', ['backgroundColor', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'boxSizing', 'display']],
  styleTitle: ['.mg-head', ['marginTop', 'marginBottom', 'paddingTop', 'paddingLeft', 'display', 'textAlign']],
  styleSub: ['.mg-sub', ['fontSize', 'fontWeight', 'color', 'lineHeight', 'marginBottom']],
  styleCard: ['.mg-card', ['margin', 'borderRadius', 'backgroundColor', 'boxShadow', 'border', 'width']],
  styleImgWrap: ['.mg-pic', ['borderRadius', 'paddingTop', 'height', 'width', 'overflow', 'position']],
  styleInfo: ['.mg-body', ['margin', 'padding', 'display', 'justifyContent', 'textAlign']],
  styleName: ['.mg-t', ['fontSize', 'fontWeight', 'color', 'textAlign', 'marginTop', 'lineHeight']]
};

/**
 * 生成「在页面里量一组盒子 + 读一组计算样式」的求值表达式。
 * 之所以不写成两个独立的 .js 探针文件：`.gitignore` 只放行 `.tooling/*.mjs`，
 * 被依赖的 .js 不会入库 —— 别人 clone 下来脚本就跑不起来。
 */
const measureExpr = (boxes, styles) => `(() => {
  const B = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const S = (sel, props) => { const e = document.querySelector(sel); if (!e) return null;
    const s = getComputedStyle(e); const o = {}; props.forEach((p) => { o[p] = s[p]; }); return o; };
  const out = { vw: innerWidth, vh: innerHeight };
  const BX = ${JSON.stringify(boxes)}, ST = ${JSON.stringify(styles)};
  for (const k in BX) out[k] = B(BX[k]);
  for (const k in ST) out[k] = S(ST[k][0], ST[k][1]);
  return out;
})()`;

/* ------------------------------------------------------------------ 浏览器 */
const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const OUT = resolve('.tooling/_cmp');
mkdirSync(OUT, { recursive: true });

const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'yz2-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=900,1400', 'about:blank'
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
    /* 一定要把 m.error.data 带出来：否则只剩一句「Invalid parameters」，
       根本不知道是哪个参数不合法（曾因 clip 漏了 scale 白查半天）。 */
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
const newTab = async (url) => (await raw('Target.createTarget', { url })).targetId;
const attach = async (tid) => (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
const ev = async (sid, expression) => {
  const r = await raw('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sid);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
};

/** 在**同一个会话**里设视口 → 量盒 → 截图：单独设的覆盖会在会话断开时被 Chrome 清掉 */
async function capture(sid, file, { w = 375, h = 812, dpr = 2, mobile = false, clipOf }) {
  await raw('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile, screenWidth: w, screenHeight: h,
  }, sid);
  await sleep(1600);
  let clip;
  if (clipOf) {
    const box = await ev(sid, `(() => { const e = document.querySelector(${JSON.stringify(clipOf)});
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width),
               height: Math.ceil(Math.max(e.scrollHeight, r.height)) }; })()`);
    console.log('    量到 ' + clipOf + ' 的盒子：', JSON.stringify(box));
    /* clip 的 scale 是必填项 —— 漏了会直接抛 Invalid parameters（不带 scale 的五个字段都齐也没用） */
    clip = { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 };
  } else {
    const m = await raw('Page.getLayoutMetrics', {}, sid);
    const cs = m.cssContentSize || m.contentSize;
    clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
  }
  const { data } = await raw('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }, sid);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return { file, w: clip.width, h: clip.height };
}

/* ---------------- ① 有赞原页 ---------------- */
console.log('① 拍有赞原页 …');
const yzTab = await newTab(YOUZAN);
let YZ = null;
{
  const sid = await attach(yzTab);
  await sleep(6500);
  const r = await capture(sid, join(OUT, 'yz2-youzan.png'), { mobile: true });
  console.log('   ', r.file, r.w + 'x' + r.h);
  YZ = await ev(sid, measureExpr(YZ_BOXES, YZ_STYLES));
}

/* ---------------- ② 我们的 /preview 真机渲染 ---------------- */
console.log('② 拍我们（/preview 直接编译真机 WXML+WXSS）…');
const TOKEN = await adminToken(BASE);
const pvTab = await newTab(BASE + '/preview');
let OUR = null;
{
  // mobile:false —— 预览页没有 viewport meta，开 mobile 模拟会退化成 980 布局视口；
  // 页面宽度由下面注入的样式锁死 375，与真机一致。
  const sid = await attach(pvTab);
  await raw('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: false, screenWidth: 375, screenHeight: 812,
  }, sid);
  await sleep(1200);
  await ev(sid, `localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); location.reload(); true`);
  await sleep(4000);
  const picked = await ev(sid, `(() => {
    const b = document.querySelector('.pv-item[data-key=${JSON.stringify(opt.key)}]');
    if (!b) return '未找到页面 ' + ${JSON.stringify(opt.key)};
    b.click(); return 'ok';
  })()`);
  console.log('    选择页面：', picked);
  if (picked !== 'ok') throw new Error('预览页里没有 ' + opt.key + '，先确认页面已发布');
  await sleep(4500);

  // 拆掉预览外壳：侧栏 / 顶栏 / 状态行 / 手机壳 / 导航栏都是浏览器侧的装饰，不属于页面内容。
  // ⚠️ 必须用 CSSOM（el.style.xxx）逐元素赋值 —— 动态创建的 <style> 元素在本页里会被丢弃
  //    （元素查得到、getComputedStyle 读得到、但布局不生效），会量出「手机壳里那一份盒子」。
  const shell = await ev(sid, `(() => {
    const set = (sel, css) => { const e = document.querySelector(sel); if (e) Object.assign(e.style, css); };
    set('.pv-top', { display: 'none' });
    set('.pv-side', { display: 'none' });
    set('.pv-status', { display: 'none' });
    set('.pv-note', { display: 'none' });
    set('.pv-main', { display: 'block', padding: '0' });
    set('.pv-stage', { padding: '0', display: 'block' });
    set('#phone', { width: '375px', border: '0', borderRadius: '0', boxShadow: 'none', margin: '0' });
    set('.phone-bar', { display: 'none' });
    set('#preview', { height: 'auto', maxHeight: 'none', minHeight: '0', overflow: 'visible' });
    set('body', { background: '#fff', margin: '0' });
    return { screenHeightInline: document.getElementById('preview').style.height };
  })()`);
  console.log('    拆壳：', JSON.stringify(shell));
  await sleep(600);
  OUR = await ev(sid, measureExpr(OUR_BOXES, OUR_STYLES));
  const r = await capture(sid, join(OUT, 'yz2-ours.png'), { clipOf: '#preview' });
  console.log('   ', r.file, r.w + 'x' + r.h);
}

/* ---------------- ③ 逐项对账 ---------------- */
{
  const pairs = [
    ['模块外框', 'module'], ['标题区', 'panelTitle'], ['副标题', 'sub'], ['卡片区', 'itemCon'],
    ['首张卡片', 'card1'], ['图片容器', 'imgWrap1'], ['文字区', 'info1'], ['商品名称', 'title1']
  ];
  const baseY = (m) => (m && m.module ? m.module.y : 0);
  console.log('\n── 几何对账（有赞真机 vs 本店 /preview，单位 CSS px @375 宽）──');
  console.log('  （「相对」= 该元素到模块顶部的距离 —— 不随页面里上方有没有别的东西变化）');
  let full = 0;
  for (const [label, k] of pairs) {
    const a = YZ && YZ[k];
    const b = OUR && OUR[k];
    if (!a || !b) { console.log('  ' + label.padEnd(6) + ' 有赞=' + JSON.stringify(a) + ' 我们=' + JSON.stringify(b)); continue; }
    const ok = (p) => Math.abs(a[p] - b[p]) < 1;
    const ry = Math.abs((a.y - baseY(YZ)) - (b.y - baseY(OUR))) < 1;
    if (ok('x') && ok('w') && ok('h') && ry) full++;
    console.log('  ' + label.padEnd(6) +
      ' 有赞 ' + [a.x, a.y - baseY(YZ), a.w, a.h].join('/') + '   我们 ' + [b.x, b.y - baseY(OUR), b.w, b.h].join('/') +
      `   Δx${ok('x') ? '✓' : '✗'} Δw${ok('w') ? '✓' : '✗'} Δh${ok('h') ? '✓' : '✗'} Δ相对y${ry ? '✓' : '✗'}`);
  }
  console.log(`  → ${pairs.length} 项里 ${full} 项 x/y/w/h 四项全等`);

  console.log('\n── 样式对账 ──');
  for (const k of Object.keys(YZ_STYLES)) {
    console.log('  ' + k);
    console.log('    有赞 ' + JSON.stringify(YZ && YZ[k]));
    console.log('    我们 ' + JSON.stringify(OUR && OUR[k]));
  }
}

/* ---------------- ④ 并排拼图 ---------------- */
const a64 = readFileSync(join(OUT, 'yz2-youzan.png')).toString('base64');
const b64 = readFileSync(join(OUT, 'yz2-ours.png')).toString('base64');
writeFileSync(join(OUT, 'yz2-side.html'), `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;background:#f2f3f5;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;display:flex;gap:16px;padding:16px;align-items:flex-start}
 figure{margin:0;background:#fff;border:1px solid #e2e4e8;border-radius:8px;overflow:hidden}
 figcaption{padding:8px 12px;font-weight:600;border-bottom:1px solid #eef0f3}
 img{display:block;width:375px}
</style>
<figure><figcaption>有赞原页「莱克资讯」（真机 375 宽）</figcaption><img src="data:image/png;base64,${a64}"></figure>
<figure><figcaption>本店复刻（/preview 编译真机源码）</figcaption><img src="data:image/png;base64,${b64}"></figure>`);
const cmpTab = await newTab('file:///' + join(OUT, 'yz2-side.html').replace(/\\/g, '/'));
{
  const sid = await attach(cmpTab);
  await sleep(1800);
  const m = await raw('Page.getLayoutMetrics', {}, sid);
  const cs = m.cssContentSize || m.contentSize;
  const { data } = await raw('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 },
  }, sid);
  writeFileSync(join(OUT, 'yz2-side.png'), Buffer.from(data, 'base64'));
}
console.log('\n④ 并排图：.tooling/_cmp/yz2-side.png');

for (const t of [yzTab, pvTab, cmpTab]) await raw('Target.closeTarget', { targetId: t }).catch(() => {});
child.kill();
process.exit(0);
