/**
 * 清理正文里拿不到的外部图片引用
 *
 * 判据：外部资源先试着下载 —— 能拿到就入库替换；拿不到（404/占位图）就把那个
 *       `<img>` 标签整段删掉。**留着不动 = 真机上一张破图**，比删掉更糟。
 *       注意别被「HTTP 200 但只有 2KB 的占位 JPEG」骗了：微信 CDN 对失效图
 *       就是回一张占位图，判空不能只看状态码。
 *
 * 用法：node .tooling/_yz-ext-fix.mjs [--apply]
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
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

const list = await get('/api/decorate/pages');
const notes = (list.data && (list.data.pages || list.data.list) || []).filter((p) => String(p.key || '').startsWith('note-'));

for (const n of notes) {
  const d = await get('/api/decorate/page?key=' + n.key);
  const data = (d.data && d.data.data) || {};
  const html = String((data.body && data.body.html) || '');
  const re = /(?:src|data-src)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  const urls = [];
  let m;
  while ((m = re.exec(html))) if (urls.indexOf(m[1]) < 0) urls.push(m[1]);
  if (!urls.length) continue;

  let out = html;
  let changed = false;
  for (const u of urls) {
    let buf = null;
    try {
      const r = await fetch(u, { headers: { referer: 'https://shop46010558.youzan.com/', 'user-agent': UA } });
      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    } catch (_) { /* 拿不到就当失效 */ }
    // 占位图判据：小于 8KB 一律当失效图（实测失效时回 2KB 的 JPEG 占位）
    if (buf && buf.length > 8192 && buf.length <= 5 * 1024 * 1024) {
      const fd = new FormData();
      fd.append('file', new Blob([buf]), 'ext-' + (u.split('/').pop() || 'img').slice(0, 40));
      const up = await fetch(B + '/api/media/upload?folder=' + encodeURIComponent('有赞笔记正文'), { method: 'POST', headers: H, body: fd }).then((x) => x.json());
      const got = (up.data && up.data.list && up.data.list[0] && up.data.list[0].url) || '';
      if (got) { out = out.split(u).join(got); changed = true; console.log('  ✓ ' + n.key + ' 入库替换 ' + u.slice(0, 60)); continue; }
    }
    // 拿不到 → 删掉整个 img 标签
    const tagRe = new RegExp('<img[^>]*' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^>]*>\\s*', 'gi');
    const before = out;
    out = out.replace(tagRe, '');
    if (out !== before) { changed = true; console.log('  · ' + n.key + ' 拿不到这张图（' + (buf ? buf.length + 'B 占位' : '请求失败') + '）→ 已删掉该 img 标签：' + u.slice(0, 60)); }
  }
  if (!changed) continue;
  if (!APPLY) { console.log('  （计划）' + n.key + ' 有改动'); continue; }
  data.body = Object.assign({}, data.body, { html: out });
  const dr = await postJson('/api/decorate/draft', { key: n.key, data });
  if (dr.code !== 0) { console.log('  ✗ draft ' + n.key); continue; }
  const pb = await postJson('/api/decorate/publish', { key: n.key, note: '清掉取不到的外部图片' });
  console.log('  ' + (pb.code === 0 ? '✓' : '✗') + ' ' + n.key + ' 已发布');
}
console.log(APPLY ? '\n完成' : '\n（计划，加 --apply 真写）');
