/* 只读：确认 9223 上带界面 Chrome 是否已登录有赞（不点任何写入按钮） */
const PORT = 9223;

async function list() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

async function evalOn(wsUrl, expr) {
  const ws = new WebSocket(wsUrl);
  const send = (id, method, params) => ws.send(JSON.stringify({ id, method, params }));
  return await new Promise((resolve, reject) => {
    const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('eval timeout')); }, 25000);
    ws.onopen = () => send(1, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) { clearTimeout(t); try { ws.close(); } catch {} resolve(m.result); }
    };
    ws.onerror = (e) => { clearTimeout(t); reject(new Error('ws error')); };
  });
}

const targets = await list();
for (const t of targets) {
  if (t.type !== 'page') continue;
  console.log('URL :', t.url);
  console.log('TTL :', t.title);
  if (!t.webSocketDebuggerUrl) { console.log('  (no ws)'); continue; }
  const res = await evalOn(t.webSocketDebuggerUrl, `JSON.stringify({
    href: location.href,
    hasLoginForm: !!document.querySelector('input[type=password]'),
    bodyLen: (document.body && document.body.innerText || '').length,
    head: (document.body && document.body.innerText || '').slice(0, 300)
  })`);
  if (res && res.result && res.result.value) console.log('PAGE:', res.result.value.slice(0, 700));
  else console.log('EVAL ERR:', JSON.stringify(res).slice(0, 300));
}
