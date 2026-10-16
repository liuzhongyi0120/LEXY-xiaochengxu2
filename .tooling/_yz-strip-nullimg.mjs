/**
 * 剥掉正文里有赞富文本的懒加载占位 `<img src="null">`
 *
 * 有赞的富文本里带着 `<img src="null">`（前端懒加载时再换成真地址）。我们搬过来之后
 * 没有运行时去替换它 → 真机/预览里就是一张请求 `/null` 的**破图**（实测 note-216 就有一张）。
 * 这种占位必须整段删掉，不能留。
 *
 * 用法：node .tooling/_yz-strip-nullimg.mjs [--apply]
 */
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
/* ⚠ 必须重试：连续发布会同步重写约 310KB 的 replica.js，紧随其后的请求偶发
 *   ECONNRESET（服务端其实已处理）。不重试会白留几篇没发布，还误判成「发布接口坏了」。 */
async function req(p, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(B + p, body === undefined
        ? { headers: H }
        : { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}
const get = (p) => req(p);
const postJson = (p, body) => req(p, body);

const list = await get('/api/decorate/pages');
const notes = (list.data && (list.data.pages || list.data.list) || []).filter((p) => String(p.key || '').startsWith('note-'));

/*
 * ⚠ 别把「引号」和「取值」都写成可选：`["']?(?:null|undefined)?["']?` 能匹配空串，
 *   于是**每一个 img 标签**都被当成占位删掉（实测 note-257 会从 1518 字符被删到 25 字符，
 *   整篇正文没了）。正确做法是先把 src 的**取值**取出来再判断。
 */
const IMG_TAG = /<img\b[^>]*>/gi;
const SRC = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const isPlaceholder = (tag) => {
  const m = SRC.exec(tag);
  const v = (m ? (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : '');
  return !v || /^(null|undefined)$/i.test(v.trim());
};
let changed = 0, total = 0;

for (const n of notes) {
  const d = await get('/api/decorate/page?key=' + n.key);
  const data = (d.data && d.data.data) || {};
  const html = String((data.body && data.body.html) || '');
  if (!html) continue;
  let n1 = 0;
  const clean = html.replace(IMG_TAG, (tag) => (isPlaceholder(tag) ? (n1++, '') : tag));
  if (clean === html) continue;
  total += n1;
  console.log('  · ' + n.key + '  占位 ' + n1 + ' 处（' + html.length + ' → ' + clean.length + ' 字符）');
  if (!APPLY) continue;
  data.body = Object.assign({}, data.body, { html: clean });
  const dr = await postJson('/api/decorate/draft', { key: n.key, data });
  if (dr.code !== 0) { console.log('    ✗ draft ' + n.key); continue; }
  const pb = await postJson('/api/decorate/publish', { key: n.key, note: '剥掉 src=null 的懒加载占位图' });
  if (pb.code === 0) changed++; else console.log('    ✗ publish ' + n.key);
}

console.log('\n共 ' + total + ' 处占位，已处理 ' + changed + ' 篇' + (APPLY ? '' : '（计划，加 --apply 真写）'));
