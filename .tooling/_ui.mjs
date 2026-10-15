/* 无头 CDP 代理（.tooling/_cdp-headless.mjs，3456）专用小工具
 * 用法： node .tooling/_ui.mjs shot <target> <out.png>
 *        node .tooling/_ui.mjs eval <target> <js文件>
 *        node .tooling/_ui.mjs nav  <target> <url>
 *        node .tooling/_ui.mjs new  <url>
 */
const P = 'http://127.0.0.1:3456';
const [cmd, a, b] = process.argv.slice(2);
const fs = await import('node:fs');

if (cmd === 'new') {
  const r = await fetch(P + '/new', { method: 'POST', body: a });
  console.log(await r.text());
} else if (cmd === 'nav') {
  const r = await fetch(P + '/nav?target=' + a, { method: 'POST', body: b });
  console.log(await r.text());
} else if (cmd === 'shot') {
  const r = await fetch(P + '/shot?target=' + a, { method: 'POST', body: b });
  console.log(await r.text());
} else if (cmd === 'eval') {
  const js = fs.readFileSync(b, 'utf8');
  const r = await fetch(P + '/eval?target=' + a, { method: 'POST', body: js });
  const t = await r.text();
  try { console.log(JSON.stringify(JSON.parse(t), null, 1).slice(0, 8000)); } catch { console.log(t.slice(0, 4000)); }
} else console.log('usage: shot|eval|nav|new');
