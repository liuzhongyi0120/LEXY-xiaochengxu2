/* node _yz-tabs-grab.mjs <target> <out.json> <tab1,tab2,...> */
const P = 'http://127.0.0.1:3456';
const [tid, out, tabsStr] = process.argv.slice(2);
const fs = await import('node:fs');
let js = fs.readFileSync('.tooling/_yz-note-tabs.js', 'utf8');
js = 'window.__TABS__ = ' + JSON.stringify(tabsStr.split(',')) + ';\n' + js;
const r = await fetch(P + '/eval?target=' + tid, { method: 'POST', body: js });
const t = await r.text();
let v;
try { v = JSON.parse(t).value; } catch { v = { raw: t.slice(0, 3000) }; }
fs.writeFileSync(out, JSON.stringify(v, null, 1), 'utf8');
if (v.tabs) v.tabs.forEach((x) => console.log(x.name, x.error || (x.aliases || []).length));
console.log('wrote', out);
