/**
 * 把抓回来的有赞笔记正文回填进本地笔记（等用户登录有赞、抓完正文之后跑）。
 *
 * 输入：
 *   .tooling/_yz-notes-content.json  （`_yz-note-fetch.mjs` 产出：alias → 正文文本 / 图片）
 *   .tooling/_yz-note-ids.json       （`_yz-notes-build.mjs` 产出：mergeKey → 本地笔记 id）
 *
 * 为什么图片要**下载重传**而不是直接引有赞的外链：
 *   项目铁律 29「数据文件零外链」—— 有赞的图片地址随时可能失效/防盗链，
 *   真机上就会变成一片破图；必须落到本机 /uploads 再引用。
 *
 * 用法：node .tooling/_yz-note-backfill.mjs          # 只打计划
 *      node .tooling/_yz-note-backfill.mjs --apply   # 真写
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8');
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
const post = async (p, body) => (await (await fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(body) }))).json();
const postJson = async (p, body) => (await (await fetch(B + p, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}))).json();
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();

const CONTENT = '.tooling/_yz-notes-content.json';
const IDS = '.tooling/_yz-note-ids.json';
const TMP = '.tooling/_yz-imgs';

if (!fs.existsSync(CONTENT)) { console.log('还没有 ' + CONTENT + '，先跑 _yz-note-fetch.mjs'); process.exit(1); }
if (!fs.existsSync(IDS)) { console.log('还没有 ' + IDS + '，先跑 _yz-notes-build.mjs'); process.exit(1); }

const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8')).notes || {};
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));

/** 把抓到的纯文本转成富文本 HTML（每段一个 <p>） */
function toHtml(text) {
  return String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
    .map((s) => '<p>' + s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>')
    .join('');
}

/** 下载一张图并上传到本机素材库，返回 /uploads/... 路径 */
async function uploadImage(url, name) {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, name);
  if (!fs.existsSync(file)) {
    const r = await fetch(url, { headers: { Referer: 'https://shop44567186.youzan.com/' } });
    if (!r.ok) return '';
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const buf = fs.readFileSync(file);
  const ext = (path.extname(name) || '.jpg').slice(1);
  const b64 = buf.toString('base64');
  const up = await postJson('/api/media/upload', { name, ext, base64: b64 });
  return (up.data && up.data.url) || '';
}

const plan = [];
for (const [mergeKey, rec] of Object.entries(ids)) {
  if (!mergeKey.startsWith('alias:')) continue;             // 品牌期刊等没有有赞正文
  const alias = mergeKey.slice(6);
  const c = content[alias];
  if (!c || c.error || !c.text) continue;
  plan.push({ id: rec.id, title: rec.title, alias, text: c.text, imgs: c.imgs || [] });
}

console.log('有正文可回填：' + plan.length + ' 篇');
const noContent = Object.values(ids).filter((r) => !plan.some((p) => p.id === r.id));
console.log('没有有赞正文（需人工补）：' + noContent.length + ' 篇');
noContent.forEach((r) => console.log('   - note-' + r.id + ' [' + r.tags + '] ' + r.title));

if (!APPLY) {
  plan.slice(0, 5).forEach((p) => console.log('  例 note-' + p.id + ' 正文 ' + p.text.length + ' 字 / 图 ' + p.imgs.length + ' 张  ' + p.title));
  console.log('\n（计划，加 --apply 才真写）');
  process.exit(0);
}

for (let i = 0; i < plan.length; i++) {
  const p = plan[i];
  const key = 'note-' + p.id;
  const cur = await get('/api/decorate/page?key=' + key);
  const data = JSON.parse(JSON.stringify(cur.data.data || {}));

  let html = toHtml(p.text);
  for (let k = 0; k < p.imgs.length; k++) {
    const url = await uploadImage(p.imgs[k], 'yz-' + p.alias + '-' + (k + 1) + '.jpg');
    if (url) html += '<p><img src="' + url + '" /></p>';
  }
  data.body = Object.assign({}, data.body, { html, bg: '#ffffff', full: '0' });

  const d = await postJson('/api/decorate/draft', { key, data });
  if (d.code !== 0) { console.log('  ✗ draft note-' + p.id + ' → ' + JSON.stringify(d).slice(0, 140)); continue; }
  const pb = await postJson('/api/decorate/publish', { key, note: '回填有赞正文' });
  console.log('  ' + (pb.code === 0 ? '✓' : '✗') + ' #' + (i + 1) + ' note-' + p.id +
    '  正文 ' + html.length + ' 字符（图 ' + p.imgs.length + ' 张）  ' + p.title);
}
console.log('\n回填完成');
