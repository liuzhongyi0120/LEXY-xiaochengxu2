/**
 * 只读探针 3：找正文真身 —— 页面级 JS 状态 / 空 iframe / 接口数据
 * 用法： node .tooling/_yz-note-probe3.mjs
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

const js = `JSON.stringify({
  href: location.href,
  winKeys: Object.keys(window).filter(function(k){ return /^(__|_|window\\.)/.test(k) || /STATE|DATA|INITIAL|NUXT|VUE/i.test(k); }).slice(0, 20),
  stateProbe: (function(){
    var out = {};
    ['__INITIAL_STATE__','__NUXT__','__DATA__','__VUE__','_global','__WAP__','__shopnote__'].forEach(function(k){
      if (window[k]) { try { var s = JSON.stringify(window[k]); out[k] = { len: s.length, head: s.slice(0, 300) }; } catch(e) { out[k] = 'stringify err'; } }
    });
    return out;
  })(),
  iframeInfo: Array.from(document.querySelectorAll('iframe')).map(function(f){
    var d = null, len = -1, txt = '';
    try { d = f.contentDocument; if (d) { len = d.documentElement.outerHTML.length; txt = (d.body && d.body.innerText || '').trim().slice(0, 300); } } catch(e) { txt = 'cross-origin: ' + e.name; }
    return { src: (f.src||'(empty)'), id: f.id, cls: (f.className||'').slice(0,40), docLen: len, text: txt };
  }),
  scriptsWithNote: Array.from(document.querySelectorAll('script')).filter(function(s){ return (s.textContent||'').indexOf('noteContent') >= 0 || (s.textContent||'').indexOf('"content"') >= 0; }).length,
  bodyTail: document.body.innerHTML.slice(-1200)
})`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(v.result.value);
ws.close();
