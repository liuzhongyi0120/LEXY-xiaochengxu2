/* 直连 CDP，进入跨域 iframe 的 execution context 执行 JS
 *
 * 用途：装修台手机预览是跨域 iframe（h5.youzan.com），代理的 /eval 只在主 frame 跑，
 *      拿不到预览里的真实 DOM。本例用 Page.createIsolatedWorld 进入子 frame。
 *
 * 用法： node .tooling/_cdp-frame.mjs <frameUrlMatch> <jsFile> [pageUrlMatch]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , frameMatch, jsFile, pageMatchArg] = process.argv;
if (!frameMatch || !jsFile) {
  console.error('用法: node .tooling/_cdp-frame.mjs <frameUrlMatch> <jsFile> [pageUrlMatch]');
  process.exit(1);
}
const pageMatch = pageMatchArg || 'store.youzan.com/v4/deco/decorate';

/* Chrome 的 /json/* HTTP 端点在本机被禁用（404），只能读 DevToolsActivePort
 * 拿端口 + wsPath，然后直接连 browser 级 WebSocket。 */
function readDevTools() {
  const la = process.env.LOCALAPPDATA || '';
  const home = process.env.HOME || os.homedir();
  const cands = [
    path.join(la, 'Google/Chrome/User Data/DevToolsActivePort'),
    path.join(la, 'Microsoft/Edge/User Data/DevToolsActivePort'),
    path.join(la, 'Chromium/User Data/DevToolsActivePort'),
    path.join(home, '.config/google-chrome/DevToolsActivePort')
  ];
  for (const p of cands) {
    try {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      const port = parseInt(lines[0], 10);
      if (port > 0) return { port, wsPath: (lines[1] || '').trim(), file: p };
    } catch { /* 继续找下一个 */ }
  }
  return null;
}

const dt = readDevTools();
if (!dt) { console.error('未找到 DevToolsActivePort，浏览器可能没开远程调试'); process.exit(4); }
const ws = new WebSocket(`ws://127.0.0.1:${dt.port}${dt.wsPath}`);
let cmdId = 0;
const pending = new Map();

ws.addEventListener('message', (ev) => {
  let m;
  try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
  if (m.id && pending.has(m.id)) {
    const { resolve, timer } = pending.get(m.id);
    clearTimeout(timer);
    pending.delete(m.id);
    resolve(m);
  }
});

function send(method, params = {}, sessionId = null) {
  return new Promise((resolve, reject) => {
    const id = ++cmdId;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP 超时: ' + method)); }, 30000);
    pending.set(id, { resolve, timer });
    ws.send(JSON.stringify(msg));
  });
}

await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', (e) => rej(new Error('WS 连接失败')), { once: true });
});

const t = await send('Target.getTargets');
const page = (t.result.targetInfos || []).find((x) => x.type === 'page' && x.url.indexOf(pageMatch) >= 0);
if (!page) {
  console.error('未找到页面 target，候选：');
  (t.result.targetInfos || []).filter((x) => x.type === 'page').forEach((x) => console.error('  ', x.url.slice(0, 90)));
  process.exit(2);
}

const att = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
const sid = att.result.sessionId;

const tree = await send('Page.getFrameTree', {}, sid);
const frames = [];
(function walk(f) { frames.push({ id: f.frame.id, url: f.frame.url }); (f.childFrames || []).forEach(walk); })(tree.result.frameTree);

const hit = frames.find((f) => f.url.indexOf(frameMatch) >= 0);
if (!hit) {
  console.error('未找到匹配 frame，全部 frame：');
  frames.forEach((f) => console.error('  ', f.url.slice(0, 110)));
  process.exit(3);
}

const world = await send('Page.createIsolatedWorld', { frameId: hit.id, worldName: 'yzprobe', grantUniveralAccess: true }, sid);
const ctxId = world.result.executionContextId;

const expr = fs.readFileSync(jsFile, 'utf8');
const evalResp = await send('Runtime.evaluate', {
  expression: expr,
  contextId: ctxId,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true
}, sid);

if (evalResp.result && evalResp.result.exceptionDetails) {
  console.error('执行异常:', JSON.stringify(evalResp.result.exceptionDetails).slice(0, 800));
}
process.stdout.write(JSON.stringify({
  frameUrl: hit.url,
  result: evalResp.result ? (evalResp.result.value !== undefined ? evalResp.result.value : evalResp.result) : null
}, null, 1));

ws.close();
