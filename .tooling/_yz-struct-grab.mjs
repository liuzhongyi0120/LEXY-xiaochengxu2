/* node _yz-struct-grab.mjs <target> <out.json> [jsFile] */
const P = 'http://127.0.0.1:3456';
const [tid, out, jsFile] = process.argv.slice(2);
const fs = await import('node:fs');
const js = fs.readFileSync(jsFile || '.tooling/_yz-note-struct.js', 'utf8');
const r = await fetch(P + '/eval?target=' + tid, { method: 'POST', body: js });
const t = await r.text();
let v;
try { v = JSON.parse(t).value; } catch { v = { raw: t.slice(0, 3000) }; }
fs.writeFileSync(out, JSON.stringify(v, null, 1), 'utf8');
console.log('wrote', out, 'notes', (v.notes || []).length, 'tabs', (v.tabs || []).length, 'banner', (v.banner || []).length);
