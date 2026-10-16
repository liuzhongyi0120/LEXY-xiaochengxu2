/**
 * 只读探针 6：对「html 抓到 0」的笔记，dump 组件结构 + 全 _global 里的大字符串
 * 用法： node .tooling/_yz-note-probe6.mjs <alias>
 */
const PORT = 9223;
const alias = process.argv[2] || '0TMh0Czs9L';

const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = j.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
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

await send('Page.navigate', { url: `https://shop44567186.youzan.com/wscshop/shopnote/detail?noteAlias=${alias}` });
await new Promise((r) => setTimeout(r, 9000));

const js = `(function(){
  var g = window._global || {};
  var comps = g.featureComponents || [];
  var nd = g.noteData || {};
  function keys(o){ return o && typeof o === 'object' ? Object.keys(o) : []; }
  var big = [];
  (function walk(o, p, d){
    if (d > 4 || !o || typeof o !== 'object') return;
    for (var k in o) {
      var v = o[k];
      if (typeof v === 'string' && v.length > 80) big.push({ p: p + '.' + k, len: v.length, head: v.slice(0, 100) });
      else if (typeof v === 'object') walk(v, p + '.' + k, d + 1);
    }
  })(g, '_global', 0);
  return JSON.stringify({
    href: location.href,
    docTitle: document.title,
    noteType: nd.type, noteType2: nd.noteType, templateId: nd.templateId,
    compCount: comps.length,
    comp0Keys: keys(comps[0]),
    comp0: JSON.stringify(comps[0] || {}).slice(0, 900),
    briefInfo: JSON.stringify(nd.noteItemsBriefInfo || {}).slice(0, 300),
    bigStrings: big.slice(0, 12)
  });
})()`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(v.result.value);
ws.close();
