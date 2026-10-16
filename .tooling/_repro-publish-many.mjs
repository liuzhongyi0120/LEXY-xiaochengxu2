/**
 * 连续发布压测（可配次数）—— 用于把 `rename → replica.js` 的 EPERM 现场逼出来
 *
 * 为什么需要「很多次」：这个故障是**间歇性**的（实测约 20%），跑 5 次经常一次都不中，
 *   会得出「已修好」的错误结论。默认 25 次，单次失败要耗满 ~12s，所以整轮可能要几分钟。
 *
 * 用法：node .tooling/_repro-publish-many.mjs [次数] [页面key]
 *   令牌取自 .tooling/_tok.txt（12h 过期 → 报 401 就用 /api/admin/login 换一张）
 */
import fs from 'node:fs';

const N = Number(process.argv[2] || 25);
const KEY = process.argv[3] || 'p296';
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };

const post = async (p, b) => {
  const t0 = Date.now();
  const r = await fetch(B + p, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await r.json().catch(() => ({}));
  return { code: j.code, msg: j.msg, ms: Date.now() - t0 };
};

for (let i = 0; i < 25; i++) {
  try { if ((await fetch(B + '/api/health')).ok) break; } catch (_) { /* 还没起来 */ }
  await new Promise((r) => setTimeout(r, 1000));
}

let ok = 0; const fails = [];
for (let i = 1; i <= N; i++) {
  const d = await (await fetch(`${B}/api/decorate/page?key=${KEY}`, { headers: H })).json();
  if (!d.data || !d.data.data) { console.log(`第${i}次  取页面失败，中止：${JSON.stringify(d).slice(0, 160)}`); break; }
  const data = d.data.data;
  const dr = await post('/api/decorate/draft', { key: KEY, data });
  if (dr.code !== 0) { console.log(`第${i}次  存草稿失败 code=${dr.code} ${dr.msg || ''}`); continue; }
  const pb = await post('/api/decorate/publish', { key: KEY, note: '压测 ' + i });
  if (pb.code === 0) { ok++; console.log(`第${i}次  ok  ${pb.ms}ms`); }
  else { fails.push(`${i}(${pb.code})`); console.log(`第${i}次  ⚠ 失败 code=${pb.code}  ${pb.ms}ms  ${pb.msg || ''}`); }
}
console.log(`\n合计 ${N} 次：成功 ${ok}，失败 ${fails.length}${fails.length ? '  失败位置 ' + fails.join(' ') : ''}`);
process.exit(fails.length ? 1 : 0);
