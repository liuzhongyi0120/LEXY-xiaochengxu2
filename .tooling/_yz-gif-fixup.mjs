/**
 * 把压缩后的 GIF 入库，并回写正文里残留的外链
 *
 * 为什么需要这一步：正文回填时，超过 5MB 的动图上传被拒 → 正文里留下的是有赞外链
 *   （违反「数据文件零外链」，真机上也是破图）。这里补上压缩版的本地地址。
 *
 * 输入：.tooling/_yz-shrink/map.json（_yz-shrink-gif.py 产出：原 URL → 本地文件）
 * 用法：node .tooling/_yz-gif-fixup.mjs [--apply]
 */
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();
const postJson = async (p, body) => (await (await fetch(B + p, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}))).json();

const MAP = '.tooling/_yz-shrink/map.json';
const CACHE = '.tooling/_yz-img-cache.json';
const CONTENT = '.tooling/_yz-notes-content.json';
const IDS = '.tooling/_yz-note-ids.json';

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8')).notes || {};
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));

const urls = Object.keys(map);
console.log('待入库压缩图：' + urls.length + ' 张');

/* ---- 找出哪些笔记的正文里还留着这些外链 ---- */
const hit = new Map(); // noteId → Set(url)
for (const [mk, rec] of Object.entries(ids)) {
  if (!mk.startsWith('alias:')) continue;
  const c = content[mk.slice(6)];
  if (!c || !c.html) continue;
  for (const u of urls) {
    if (c.html.indexOf(u) >= 0) {
      if (!hit.has(rec.id)) hit.set(rec.id, new Set());
      hit.get(rec.id).add(u);
    }
  }
}
console.log('受影响笔记：' + hit.size + ' 篇');

if (!APPLY) { console.log('\n（计划，加 --apply 真写）'); process.exit(0); }

/* ---- 入库 ---- */
let up = 0;
for (const u of urls) {
  const file = map[u];
  const buf = fs.readFileSync(file);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'image/gif' }), 'yz-gif-' + file.split(/[\\/]/).pop());
  const r = await fetch(B + '/api/media/upload?folder=' + encodeURIComponent('有赞笔记正文'),
    { method: 'POST', headers: H, body: fd }).then((x) => x.json());
  const got = (r.data && r.data.list && r.data.list[0] && r.data.list[0].url) || '';
  if (got) { cache[u] = got; up++; } else { console.log('  ✗ 入库失败 ' + file + ' → ' + JSON.stringify(r).slice(0, 120)); }
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1), 'utf8');
console.log('入库成功 ' + up + '/' + urls.length);

/* ---- 回写 ---- */
let ok = 0, fail = 0, noop = 0;
for (const [id, set] of hit) {
  const key = 'note-' + id;
  const cur = await get('/api/decorate/page?key=' + key);
  if (cur.code !== 0) { console.log('  ✗ 读不到 ' + key); fail++; continue; }
  const data = JSON.parse(JSON.stringify(cur.data.data || {}));
  let html = String((data.body && data.body.html) || '');
  let n = 0;
  for (const u of set) {
    const local = cache[u];
    if (!local) continue;
    const before = html;
    html = html.split(u).join(local);
    if (html !== before) n++;
  }
  if (!n) { console.log('  · ' + key + ' 无需改动'); noop++; continue; }
  data.body = Object.assign({}, data.body, { html });
  const d = await postJson('/api/decorate/draft', { key, data });
  if (d.code !== 0) { console.log('  ✗ draft ' + key + ' → ' + JSON.stringify(d).slice(0, 140)); fail++; continue; }
  const pb = await postJson('/api/decorate/publish', { key, note: '补齐超限动图（压缩后入库）' });
  if (pb.code !== 0) { console.log('  ✗ publish ' + key + ' → ' + JSON.stringify(pb).slice(0, 140)); fail++; continue; }
  console.log('  ✓ ' + key + '  替换外链 ' + n + ' 处' + (/yzcdn\.cn/i.test(html) ? '  ⚠ 仍有残留外链' : ''));
  ok++;
}
console.log('\n完成：回写 ' + ok + ' / 无需改动 ' + noop + ' / 失败 ' + fail);
