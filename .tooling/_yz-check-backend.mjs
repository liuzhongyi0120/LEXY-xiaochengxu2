/* 只读：另开一个标签页确认有赞「后台笔记列表」是否已登录（不点任何写入按钮） */
const PORT = 9223;
const URL = 'https://store.youzan.com/v4/deco/content-center/shopnote#/';

const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' });
const t = await r.json();
console.log('opened:', t.id, t.url || '');
const wsUrl = t.webSocketDebuggerUrl;

const ws = new WebSocket(wsUrl);
let id = 0;
const send = (method, params) => { ws.send(JSON.stringify({ id: ++id, method, params })); };
const waitOpen = new Promise((res) => (ws.onopen = res));
await waitOpen;

function ev(expr, ms = 25000) {
  return new Promise((resolve, reject) => {
    const my = ++id;
    const to = setTimeout(() => reject(new Error('eval timeout')), ms);
    const on = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === my) { ws.removeEventListener('message', on); clearTimeout(to); resolve(m.result); }
    };
    ws.addEventListener('message', on);
    send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  });
}

await new Promise((r) => setTimeout(r, 6000));
const out = await ev(`JSON.stringify({
  href: location.href,
  title: document.title,
  bodyLen: (document.body && document.body.innerText || '').length,
  hasPwd: !!document.querySelector('input[type=password]'),
  rows: document.querySelectorAll('table tbody tr, .zn-table__row, [class*=note]').length,
  head: (document.body && document.body.innerText || '').slice(0, 400)
})`);
console.log('BACKEND:', (out && out.result && out.result.value || JSON.stringify(out)).slice(0, 900));

await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`);
ws.close();
