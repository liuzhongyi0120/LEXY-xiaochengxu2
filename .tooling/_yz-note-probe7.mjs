/**
 * 只读探针 7：视频笔记能不能拿到真实 mp4 地址（决定要不要一并回填视频）
 * 用法： node .tooling/_yz-note-probe7.mjs <alias>
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
await new Promise((r) => setTimeout(r, 14000));

const js = `(function(){
  var vids = Array.from(document.querySelectorAll('video')).map(function(v){
    return { src: (v.src||'').slice(0,200), cur: (v.currentSrc||'').slice(0,200), poster: (v.poster||'').slice(0,160),
             kids: Array.from(v.querySelectorAll('source')).map(function(s){ return (s.src||'').slice(0,200); }) };
  });
  var g = window._global || {};
  var c0 = (g.featureComponents || [])[0] || {};
  return JSON.stringify({
    href: location.href,
    videoEls: vids,
    compVideo: JSON.stringify(c0.video || {}).slice(0, 600),
    compType: c0.type,
    netHint: (performance.getEntriesByType('resource') || []).filter(function(e){ return /\\.mp4|video|m3u8/i.test(e.name); }).map(function(e){ return e.name.slice(0, 160); }).slice(0, 6)
  });
})()`;
const v = await send('Runtime.evaluate', { expression: js, returnByValue: true });
console.log(v.result.value);
ws.close();
