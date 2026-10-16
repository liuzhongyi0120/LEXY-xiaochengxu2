/**
 * 只读探针 4：看页面自带的初始化数据里有没有笔记正文（不落盘任何个人信息）
 * 只打印「键名 + 长度」，不 dump 含手机号/昵称的片段。
 * 用法： node .tooling/_yz-note-probe4.mjs
 */
const PORT = 9223;

const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = j.find((t) => t.type === 'page' && t.url && t.url.indexOf('shopnote/detail') >= 0 && t.webSocketDebuggerUrl)
  || j.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);

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

const js = `(function(){
  var g = window._global || {};
  var top = Object.keys(g);
  var hits = [];
  function walk(o, path, depth){
    if (depth > 3 || o == null || typeof o !== 'object') return;
    for (var k in o) {
      var v = o[k];
      if (typeof v === 'string' && v.length > 200 && /<[a-z]+[ >]|\\\\u003c/i.test(v)) {
        hits.push({ path: path + '.' + k, len: v.length, head: v.slice(0, 120) });
      } else if (typeof v === 'object') {
        walk(v, path + '.' + k, depth + 1);
      }
    }
  }
  walk(g, '_global', 0);
  return JSON.stringify({ href: location.href, topKeys: top, bigHtmlStrings: hits.slice(0, 10) });
})()`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(v.result.value);
ws.close();
