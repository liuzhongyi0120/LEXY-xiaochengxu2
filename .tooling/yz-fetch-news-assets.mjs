/**
 * 资讯页图片素材本地化：把 packageNews/data.js 里的有赞图下载进素材库并按页面归类
 *
 * 为什么必须做：资讯页是 5 个 tab 之一，`packageNews/detail/detail.js` 直接 require 这份数据，
 * 245 张内容图全挂在 img01.yzcdn.cn 上 —— 有赞一改策略就是 23 个内容页大面积白图。
 *
 * 归类口径：按资讯页面标题建文件夹「资讯·<标题>」。
 *   23 个内容页（8 个主栏目 + 15 个深层页）→ 23 个文件夹，
 *   运营在素材库里能直接按「关于莱克 / 新闻大事 / 新年特刊」找到对应内容图。
 *
 * 不处理的：`h5.youzan.com` 那 42 处是**跳转链接**（资讯卡片点进去的目标），
 *   不是图片资源，本地化没有意义。
 *
 * 幂等：按 (source, folder) 去重；映射结果写 .tooling/_yz/news-asset-map.json，
 *   供 localize-assets.mjs 合并使用。
 *
 * 用法：
 *   node .tooling/yz-fetch-news-assets.mjs --dry
 *   node .tooling/yz-fetch-news-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const media = require('../server/lib/media.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '_yz');
const DRY = process.argv.includes('--dry');

const REFERER = 'https://www.youzan.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FOLDER_PREFIX = '资讯·';

const DATA = require('../miniprogram/packageNews/data.js');

/* ---------------- 1. 收集「URL → 归属页面」 ---------------- */
const jobs = new Map(); // url → Set(folder)

function addUrl(u, folder) {
  if (!u || typeof u !== 'string' || !/^https?:\/\//.test(u)) return;
  if (!/yzcdn\.cn/.test(u)) return; // h5.youzan.com 等跳转链接跳过
  if (!jobs.has(u)) jobs.set(u, new Set());
  jobs.get(u).add(folder);
}

function walk(node, folder, seen) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') return addUrl(node, folder);
  if (typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) return node.forEach((v) => walk(v, folder, seen));
  Object.keys(node).forEach((k) => walk(node[k], folder, seen));
}

const secNameByAlias = new Map(DATA.SECTIONS.map((s) => [s.alias, s.name]));
Object.keys(DATA.PAGES).forEach((alias) => {
  const p = DATA.PAGES[alias];
  const title = p.title || secNameByAlias.get(alias) || alias;
  walk(p, FOLDER_PREFIX + title, new Set());
});

// 栏目封面归到同名内容页
DATA.SECTIONS.forEach((s) => {
  const p = DATA.PAGES[s.alias];
  const title = (p && p.title) || s.name;
  addUrl(s.cover, FOLDER_PREFIX + title);
});

const all = [...jobs.entries()].map(([url, set]) => ({ url, folders: [...set] }));
console.log(`资讯图外链：${all.length} 个唯一 URL`);
const byFolder = new Map();
all.forEach((j) => j.folders.forEach((f) => byFolder.set(f, (byFolder.get(f) || 0) + 1)));
console.log(`涉及文件夹 ${byFolder.size} 个：`);
[...byFolder.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log('   ' + String(n).padStart(3) + '  ' + f));

if (DRY) { console.log('\n（试跑，未下载）'); process.exit(0); }

/* ---------------- 2. 已入库索引（source|folder → 本地名） ---------------- */
const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/data/uploads/index.json'), 'utf8'));
const have = new Map();
(idx.items || []).forEach((it) => { if (it.source) have.set(it.source + '|' + (it.folder || ''), it.name); });

/* ---------------- 3. 下载 + 入库 ---------------- */
async function download(url) {
  const r = await fetch(url, { headers: { Referer: REFERER, 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) || 1 }, async () => {
    while (next < arr.length) { const i = next++; out[i] = await fn(arr[i], i); }
  }));
  return out;
}

const map = {};   // 源 URL → /uploads/...
const misses = [];
let skipped = 0;
let saved = 0;

// 按文件夹分组下载，folder 相同的图一次 upload
const folderToUrls = new Map();
all.forEach((j) => j.folders.forEach((f) => {
  if (!folderToUrls.has(f)) folderToUrls.set(f, []);
  folderToUrls.get(f).push(j.url);
}));

for (const [folder, urls] of folderToUrls) {
  const todo = [];
  urls.forEach((u) => {
    const had = have.get(u + '|' + folder);
    if (had) { map[u] = map[u] || '/uploads/' + had; skipped++; return; }
    todo.push(u);
  });
  if (!todo.length) continue;

  const got = await mapLimit(todo, 6, async (u) => {
    try {
      const buf = await download(u);
      if (buf.length > media.MAX_BYTES) { misses.push({ u, why: '超过单文件上限 ' + (buf.length / 1048576).toFixed(1) + 'MB' }); return null; }
      return { u, buf };
    } catch (e) {
      misses.push({ u, why: e.message });
      return null;
    }
  });

  const items = got.filter(Boolean).map((g) => ({ data: g.buf, orig: g.u.split('/').pop(), source: g.u }));
  if (!items.length) continue;
  const r = media.upload(items, folder);
  (r.failedList || []).forEach((f) => misses.push({ u: f.name, why: f.reason }));
  let k = 0;
  got.forEach((g) => {
    if (!g) return;
    const up = (r.list || [])[k++];
    if (!up) return;
    if (!map[g.u]) map[g.u] = up.url;
    have.set(g.u + '|' + folder, up.name);
    saved++;
  });
  console.log(`  ${folder}：新增 ${items.length} 张（累计 ${saved}）`);
}

/* ---------------- 4. 落盘映射 ---------------- */
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'news-asset-map.json'), JSON.stringify(map, null, 2));

console.log('\n=== 汇总 ===');
console.log(`唯一 URL ${all.length} | 新入库 ${saved} | 已存在跳过 ${skipped} | 映射表 ${Object.keys(map).length} | 失败 ${misses.length}`);
if (misses.length) {
  const uniq = [...new Map(misses.map((m) => [m.u, m])).values()];
  console.log('失败明细（去重 ' + uniq.length + '）：');
  uniq.slice(0, 10).forEach((m) => console.log('   ✗', m.why, '|', m.u.slice(0, 100)));
}
console.log('\n映射表已写 .tooling/_yz/news-asset-map.json');
