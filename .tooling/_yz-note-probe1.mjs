/**
 * 只读探针：看看 shop44567186 的笔记详情页到底出不出正文（决定要不要登录）
 * 用法： node .tooling/_yz-note-probe1.mjs [alias] [等几秒]
 */
const PORT = 9223;
const alias = process.argv[2] || 'lKZXZvDWzL';
const waitSec = Number(process.argv[3] || 6);

async function list() {
  return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
}

let page = null;
for (let i = 0; i < 30; i++) {
  try {
    const j = await list();
    page = j.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) break;
  } catch (_) { /* 还没起来 */ }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!page) { console.log('9223 上没有可用页面 target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const my = ++id;
  pend.set(my, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id: my, method, params }));
});
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
await send('Runtime.enable');

const url = `https://shop44567186.youzan.com/wscshop/shopnote/detail?noteAlias=${alias}`;
if ((page.url || '') !== url) await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, waitSec * 1000));

const js = `JSON.stringify({
  href: location.href,
  title: document.title,
  bodyLen: (document.body && document.body.innerText || '').trim().length,
  imgs: Array.from(document.querySelectorAll('img')).map(function(im){ return (im.currentSrc||im.src||'').slice(0,120); }).slice(0, 8),
  imgCount: document.querySelectorAll('img').length,
  head: (document.body && document.body.innerText || '').trim().slice(0, 800)
})`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log('ALIAS:', alias);
console.log('PAGE :', v.result.value);
ws.close();
