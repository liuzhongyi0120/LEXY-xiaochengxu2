/* 抓一个 target 的骨架 JSON 落盘：node _yz-note-grab.mjs <target> <out.json> */
const P = 'http://127.0.0.1:3456';
const [tid, out] = process.argv.slice(2);
const fs = await import('node:fs');
const js = fs.readFileSync(new URL('./_yz-note-dump.js', import.meta.url), 'utf8');
const r = await fetch(P + '/eval?target=' + tid, { method: 'POST', body: js });
const t = await r.text();
let v;
try { v = JSON.parse(t).value; } catch { v = { raw: t }; }
fs.writeFileSync(out, JSON.stringify(v, null, 1), 'utf8');
console.log('wrote', out, 'textLen', (v.text || '').length, 'imgs', (v.imgs || []).length, 'links', (v.links || []).length);
