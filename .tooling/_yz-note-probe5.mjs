/**
 * 只读探针 5：导航一篇笔记，看清「请求 alias → 实际落到哪一篇」
 * 用法： node .tooling/_yz-note-probe5.mjs <alias> [shop]
 */
const PORT = 9223;
const alias = process.argv[2] || 'lKZXZvDWzL';
const shop = process.argv[3] || '44567186';

const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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

const url = `https://shop${shop}.youzan.com/wscshop/shopnote/detail?noteAlias=${alias}`;
console.log('NAV →', url);
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 9000));

const js = `(function(){
  var g = window._global || {};
  var nd = g.noteData || {};
  var comps = g.featureComponents || [];
  var html = comps.map(function(c){ return c.content || ''; }).join('');
  return JSON.stringify({
    href: location.href,
    docTitle: document.title,
    noteAlias: g.noteAlias || '',
    kdtId: g.kdt_id || '',
    noteDataTitle: nd.title || '',
    noteDataKeys: Object.keys(nd).slice(0, 24),
    compCount: comps.length,
    htmlLen: html.length,
    htmlHead: html.slice(0, 200),
    bodyText: (document.body && document.body.innerText || '').trim().slice(0, 200)
  });
})()`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log('RESULT:', v.result.value);
ws.close();
