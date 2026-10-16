/**
 * 只读探针 2：① 列出 9223 全部标签 ② 对指定页面深挖「正文到底藏在哪」
 * 用法： node .tooling/_yz-note-probe2.mjs
 */
const PORT = 9223;

const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
console.log('=== targets ===');
for (const t of j) console.log(' ', t.type, '|', t.id.slice(0, 8), '|', t.title.slice(0, 40), '|', (t.url || '').slice(0, 100));

const page = j.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) { console.log('no page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res, rej) => {
  const my = ++id;
  pend.set(my, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id: my, method, params }));
});
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');

const js = `JSON.stringify({
  href: location.href,
  htmlLen: document.documentElement.outerHTML.length,
  iframes: Array.from(document.querySelectorAll('iframe')).map(function(f){ return (f.src||'').slice(0,120); }),
  appLen: (function(){ var a = document.querySelector('#app,.app,[id*=app]'); return a ? a.innerHTML.length : -1; })(),
  richCandidates: Array.from(document.querySelectorAll('[class*=content],[class*=rich],[class*=detail],[class*=article],[class*=note]'))
      .map(function(e){ return { cls: (e.className||'').toString().slice(0,60), len: (e.innerText||'').trim().length, imgs: e.querySelectorAll('img').length }; })
      .filter(function(x){ return x.len > 40; }).slice(0, 12),
  hasLogin: !!document.querySelector('input[type=password]'),
  cookieHint: document.cookie.slice(0, 160),
  lsKeys: Object.keys(localStorage).slice(0, 12)
})`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log('=== 结构 ===');
console.log(v.result.value);
ws.close();
