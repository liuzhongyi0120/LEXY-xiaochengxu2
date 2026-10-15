/* 轻量 CDP 客户端（原生 WebSocket 直连 Chrome 调试端口）。
 *
 * 为什么另写一个：web-access 的 cdp-proxy 只暴露固定路由，
 * **没有设备模拟**（Emulation.setDeviceMetricsOverride），
 * 而抓移动端 H5 必须在真移动视口下量尺寸 / 取媒体查询后的计算样式。
 * 另外该 Chrome 的 `/json/*` HTTP 端点被禁（404），
 * 只能走浏览器级 WS：ws://127.0.0.1:<port>/devtools/browser/<id>（见 DevToolsActivePort 文件）。
 *
 * 用法：node .tooling/_cdp2.mjs <cmd> [...]
 *   port                              打印调试端口与浏览器 ws 路径
 *   tabs                              列出所有 target
 *   mob   <targetId> [w=375] [h=812] [dpr=2] [mobile=1]   设置设备模拟
 *   un    <targetId>                  取消模拟
 *   ev    <targetId> <js文件>         在当前（模拟）视口下求值
 *   evraw <targetId> <文件>           求值并返回完整结果对象（含异常详情）
 *   full  <targetId> <out.png> [w] [h] [dpr]              移动视口 + 整页截图
 *   shot  <targetId> <out.png> [w] [h] [dpr]              移动视口 + 仅视口截图
 *   new   <url>                       新开标签（返回 targetId）
 *   close <targetId>                  关闭标签
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , cmd, ...rest] = process.argv;

const PORT_FILE = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/DevToolsActivePort');
const [PORT, WS_PATH] = fs.readFileSync(PORT_FILE, 'utf8').trim().split('\n');
const WS_URL = `ws://127.0.0.1:${PORT}${WS_PATH}`;

let _ws = null;
let _id = 0;
const _pending = new Map();
const _sessions = new Map(); // targetId -> sessionId

function connect() {
  if (_ws && _ws.readyState === 1) return Promise.resolve(_ws);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener('open', () => { _ws = ws; resolve(ws); });
    ws.addEventListener('error', (e) => reject(new Error('WS error: ' + (e.message || 'unknown'))));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && _pending.has(m.id)) {
        const { resolve: rs, reject: rj } = _pending.get(m.id);
        _pending.delete(m.id);
        if (m.error) rj(new Error(m.error.message + ' ' + (m.error.data || '')));
        else rs(m.result);
      }
    });
  });
}

function raw(method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++_id;
    _pending.set(id, { resolve, reject });
    const msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    _ws.send(JSON.stringify(msg));
    setTimeout(() => {
      if (_pending.has(id)) { _pending.delete(id); reject(new Error('timeout: ' + method)); }
    }, 60000);
  });
}

async function session(targetId) {
  if (_sessions.has(targetId)) return _sessions.get(targetId);
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  _sessions.set(targetId, sessionId);
  return sessionId;
}

async function listTargets() {
  const { targetInfos } = await raw('Target.getTargets');
  return targetInfos.filter((t) => t.type === 'page');
}

async function emulate(tid, { w = 375, h = 812, dpr = 2, mobile = true }) {
  const sid = await session(tid);
  await raw('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile,
    screenWidth: w, screenHeight: h,
  }, sid);
  return sid;
}

async function evalIn(tid, expr) {
  const sid = await session(tid);
  const r = await raw('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, sid);
  return r;
}

async function shot(tid, file, { w, h, dpr, mobile, full }) {
  const sid = await emulate(tid, { w, h, dpr, mobile });
  await new Promise((r) => setTimeout(r, 1200));
  let params = { format: 'png', captureBeyondViewport: !!full };
  if (full) {
    const m = await raw('Page.getLayoutMetrics', {}, sid);
    const cs = m.cssContentSize || m.contentSize;
    params.clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
  }
  const { data } = await raw('Page.captureScreenshot', params, sid);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

const show = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 1));

switch (cmd) {
  case 'port':
    show({ port: PORT, wsPath: WS_PATH, ws: WS_URL });
    break;
  case 'tabs': {
    await connect();
    (await listTargets()).forEach((t) => console.log(t.targetId, '|', t.title, '|', t.url));
    break;
  }
  case 'mob': {
    await connect();
    await emulate(rest[0], { w: +(rest[1] || 375), h: +(rest[2] || 812), dpr: +(rest[3] || 2) });
    show('已模拟 ' + rest[0] + ' @ ' + (rest[1] || 375) + 'x' + (rest[2] || 812));
    break;
  }
  case 'un': {
    await connect();
    const sid = await session(rest[0]);
    await raw('Emulation.clearDeviceMetricsOverride', {}, sid);
    show('已取消模拟');
    break;
  }
  case 'ev': {
    await connect();
    const js = fs.readFileSync(rest[1], 'utf8');
    const r = await evalIn(rest[0], js);
    if (r.exceptionDetails) { console.error(JSON.stringify(r.exceptionDetails, null, 1).slice(0, 1500)); process.exit(1); }
    show(r.result?.value);
    break;
  }
  case 'evraw': {
    await connect();
    const js = fs.readFileSync(rest[1], 'utf8');
    show(await evalIn(rest[0], js));
    break;
  }
  /* 先设备模拟、再求值，在同一个会话里完成 ——
     单独用 `mob` 设的覆盖会在脚本退出、会话断开时被 Chrome 清掉。 */
  case 'mobev': {
    await connect();
    await emulate(rest[0], { w: +(rest[2] || 375), h: +(rest[3] || 812), dpr: +(rest[4] || 2) });
    await new Promise((r) => setTimeout(r, 800));
    const js = fs.readFileSync(rest[1], 'utf8');
    const r = await evalIn(rest[0], js);
    if (r.exceptionDetails) { console.error(JSON.stringify(r.exceptionDetails, null, 1).slice(0, 1500)); process.exit(1); }
    show(r.result?.value);
    break;
  }
  /* 在移动视口下 dump 某个选择器的 outerHTML（默认 .content）。用法：html <tid> [选择器] */
  case 'html': {
    await connect();
    await emulate(rest[0], { w: 375, h: 812, dpr: 2 });
    await new Promise((r) => setTimeout(r, 800));
    const sel = rest[1] || '.content';
    const r = await evalIn(rest[0], `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.outerHTML : '(未找到 ' + ${JSON.stringify(sel)} + ')'; })()`);
    if (r.exceptionDetails) { console.error(JSON.stringify(r.exceptionDetails).slice(0, 800)); process.exit(1); }
    console.log(r.result?.value);
    break;
  }
  case 'full':
  case 'shot': {
    await connect();
    const f = await shot(rest[0], rest[1], {
      w: +(rest[2] || 375), h: +(rest[3] || 812), dpr: +(rest[4] || 2), full: cmd === 'full',
      /* rest[5] = mobile 开关：桌面后台（有赞装修台这类）传 0，
         否则默认按手机视口截（H5 预览用） */
      mobile: rest[5] === undefined ? true : rest[5] !== '0',
    });
    show({ saved: f });
    break;
  }
  case 'new': {
    await connect();
    const { targetId } = await raw('Target.createTarget', { url: rest[0] });
    show({ targetId });
    break;
  }
  case 'close': {
    await connect();
    await raw('Target.closeTarget', { targetId: rest[0] });
    show('closed');
    break;
  }
  /* 真实鼠标点击（Input.dispatchMouseEvent，走浏览器输入管线）。
   * Vue / React 的合成点击有时不认 el.click()，这个能过。
   * 用法：clickxy <targetId> <x> <y> [按钮=left] */
  case 'clickxy': {
    await connect();
    const sid = await session(rest[0]);
    const x = +rest[1], y = +rest[2];
    for (const type of ['mousePressed', 'mouseReleased']) {
      await raw('Input.dispatchMouseEvent', {
        type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
      }, sid);
    }
    show('clicked @ ' + x + ',' + y);
    break;
  }
  /* 按文本找元素并真实点击（递归遍历 + Shadow DOM 穿透）
   * 用法：clicktext <targetId> <文本> [标签过滤] */
  case 'clicktext': {
    await connect();
    const sid = await session(rest[0]);
    const txt = rest[1];
    const r = await raw('Runtime.evaluate', {
      expression: `(() => {
        const want = ${JSON.stringify(txt)};
        const all = [...document.querySelectorAll('*')];
        const hits = all.filter((e) => (e.textContent || '').trim() === want || (e.children.length <= 2 && (e.textContent || '').trim().indexOf(want) >= 0 && (e.textContent || '').trim().length < want.length + 10));
        if (!hits.length) return null;
        const e = hits[hits.length - 1];
        const b = e.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, cls: (e.className || '').toString().slice(0, 80), t: (e.textContent || '').trim().slice(0, 40) };
      })()`, returnByValue: true,
    }, sid);
    const v = r.result?.value;
    if (!v) { show('未找到: ' + txt); break; }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await raw('Input.dispatchMouseEvent', { type, x: v.x, y: v.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }, sid);
    }
    show({ clicked: v });
    break;
  }
  default:
    show('未知命令: ' + cmd);
    process.exit(1);
}

process.exit(0);
