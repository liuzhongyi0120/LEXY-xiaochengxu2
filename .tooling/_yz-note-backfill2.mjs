/**
 * 把抓回来的有赞笔记正文回填进本地笔记 v2
 *
 * 与 v1（`_yz-note-backfill.mjs`）的区别 —— v1 是错的，别再用：
 *   v1 用「纯文本 + 尾部追加图片」拼正文。实测抓回来的正文 **text 只有 0~100 字**，
 *   绝大部分内容是 `featureComponents[].content` 里的富文本 HTML（图文混排），
 *   按文本拼会把排版和图文顺序全丢掉。v2 直接用 HTML，只把里面的图片地址换成本机的。
 *
 * 为什么图片要下载重传：铁律 29「数据文件零外链」—— 有赞图片随时可能失效/防盗链，
 *   直引外链在真机上就是一片破图。
 *
 * 输入：
 *   .tooling/_yz-notes-content.json   （_yz-note-fetch2.mjs 产出）
 *   .tooling/_yz-note-ids.json        （_yz-notes-build.mjs 产出）
 *   .tooling/_tok.txt                 （管理员令牌，不落 Git）
 *
 * 用法：
 *   node .tooling/_yz-note-backfill2.mjs                 # 只打计划
 *   node .tooling/_yz-note-backfill2.mjs --apply          # 真写
 *   node .tooling/_yz-note-backfill2.mjs --apply --only=<alias>[,<alias>]
 */
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const ONLY = onlyArg ? onlyArg.split(',').filter(Boolean) : null;

const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();
const postJson = async (p, body) => (await (await fetch(B + p, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}))).json();

const CONTENT = '.tooling/_yz-notes-content.json';
const IDS = '.tooling/_yz-note-ids.json';
const CACHE = '.tooling/_yz-img-cache.json';

for (const f of [CONTENT, IDS]) {
  if (!fs.existsSync(f)) { console.log('缺少 ' + f + '（先跑 _yz-note-fetch2.mjs / _yz-notes-build.mjs）'); process.exit(1); }
}

const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8')).notes || {};
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1), 'utf8');

/* ---------------- 清洗：正文 HTML 里不许带脚本 ---------------- */
function sanitize(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')   // on* 事件
    .replace(/javascript:/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (m) => m);        // style 保留（rich-text 支持）
}

/** HTML 里的图片地址（去重保序） */
function imgUrls(html) {
  const out = [];
  const re = /(?:src|data-src)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (/^https?:\/\//i.test(u) && /\.(png|jpe?g|webp|gif)([!?][^"']*)?$/i.test(u) && out.indexOf(u) < 0) out.push(u);
  }
  return out;
}

/** 下载一张图 → multipart 上传素材库 → 返回 /uploads/... */
async function uploadImage(url) {
  if (cache[url]) return cache[url];
  try {
    const r = await fetch(url, { headers: { referer: 'https://shop44567186.youzan.com/', 'user-agent': UA } });
    if (!r.ok) { cache[url] = ''; saveCache(); return ''; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 5 * 1024 * 1024) { cache[url] = ''; saveCache(); return ''; }
    const fd = new FormData();
    fd.append('file', new Blob([buf]), 'yz-' + (url.split('/').pop() || 'img').split(/[!?]/)[0]);
    const up = await fetch(B + '/api/media/upload?folder=' + encodeURIComponent('有赞笔记正文'), { method: 'POST', headers: H, body: fd }).then((r) => r.json());
    // ⚠ 返回结构是 data.list[]（实测），不是 data.url / data.items —— 读错形状会一路拿到空字符串
    const got = (up.data && up.data.list && up.data.list[0] && up.data.list[0].url) || '';
    cache[url] = got; saveCache();
    return got;
  } catch (e) {
    cache[url] = ''; saveCache();
    return '';
  }
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

/* ---------------- 计划 ---------------- */
const plan = [];
const videoNotes = [];
for (const [mergeKey, rec] of Object.entries(ids)) {
  if (!mergeKey.startsWith('alias:')) continue;
  const alias = mergeKey.slice(6);
  if (ONLY && ONLY.indexOf(alias) < 0) continue;
  const c = content[alias];
  if (!c) { videoNotes.push({ id: rec.id, title: rec.title, why: '没抓到' }); continue; }
  if (!c.htmlLen) { videoNotes.push({ id: rec.id, title: rec.title, why: (c.compTypes || []).indexOf('video') >= 0 ? '视频笔记' : '正文为空' }); continue; }
  plan.push({ id: rec.id, title: rec.title, alias, html: c.html, matched: c.titleMatched });
}

console.log('图文正文可回填：' + plan.length + ' 篇');
console.log('无图文正文（另议）：' + videoNotes.length + ' 篇');
videoNotes.forEach((v) => console.log('   - note-' + v.id + '  [' + v.why + ']  ' + v.title));

const urls = new Set();
plan.forEach((p) => imgUrls(p.html).forEach((u) => urls.add(u)));
console.log('涉及图片：' + urls.size + ' 张（已缓存 ' + Object.keys(cache).length + '）');

if (!APPLY) {
  plan.slice(0, 5).forEach((p) => console.log('  例 note-' + p.id + '  html ' + p.html.length + ' 字符 / 图 ' + imgUrls(p.html).length + ' 张  ' + p.title));
  console.log('\n（计划，加 --apply 才真写）');
  process.exit(0);
}

/* ---------------- 回填 ---------------- */
let ok = 0, fail = 0, skipped = 0;
for (let i = 0; i < plan.length; i++) {
  const p = plan[i];
  const key = 'note-' + p.id;
  const cur = await get('/api/decorate/page?key=' + key);
  if (cur.code !== 0) { console.log('  ✗ 读不到 ' + key); fail++; continue; }
  const data = JSON.parse(JSON.stringify(cur.data.data || {}));
  // 「已回填过」的判据不是「正文非空」——第一次跑时图片上传读错返回结构，正文里留的是
  // 有赞外链，按长度判就会把它当已完成跳过。这里按**有没有外链**判，带外链的一律重来。
  const has = String((data.body && data.body.html) || '');
  if (has.length > 200 && !/yzcdn\.cn/i.test(has)) {
    console.log('  · #' + (i + 1) + ' note-' + p.id + ' 已回填且无外链，跳过');
    skipped++; continue;
  }

  let html = sanitize(p.html);
  const list = imgUrls(html);
  let done = 0, miss = 0;
  for (const u of list) {
    const local = await uploadImage(u);
    if (local) { html = html.split(u).join(local); done++; } else { miss++; }
  }
  data.body = Object.assign({}, data.body, { html, bg: '#ffffff', full: '0' });

  const d = await postJson('/api/decorate/draft', { key, data });
  if (d.code !== 0) { console.log('  ✗ draft note-' + p.id + ' → ' + JSON.stringify(d).slice(0, 160)); fail++; continue; }
  const pb = await postJson('/api/decorate/publish', { key, note: '回填有赞笔记正文' });
  if (pb.code !== 0) { console.log('  ✗ publish note-' + p.id + ' → ' + JSON.stringify(pb).slice(0, 160)); fail++; continue; }
  console.log('  ✓ #' + (i + 1) + ' note-' + p.id + '  正文 ' + html.length + ' 字符（图 ' + done + '/' + list.length + (miss ? '，失败 ' + miss : '') + '）  ' + p.title);
  ok++;
}
console.log('\n回填完成：成功 ' + ok + ' / 跳过 ' + skipped + ' / 失败 ' + fail);
