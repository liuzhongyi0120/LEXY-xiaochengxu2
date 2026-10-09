/**
 * 补图：把 HTML 快照里「素材库还没有」的有赞图下载入库
 *
 * 场景：`小程序预览.html` 是 07 号生成的静态快照，里面的图有一部分不在素材库里
 * （属于更早版本的页面）。它们不影响小程序运行，但做成「半截本地化」很别扭 ——
 * 打开快照仍然在拉外链。
 *
 * 归类：统一放「预览快照」文件夹。
 *
 * 用法：
 *   node .tooling/yz-fetch-html-assets.mjs --dry
 *   node .tooling/yz-fetch-html-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const media = require('../server/lib/media.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const FOLDER = '预览快照';
const REFERER = 'https://www.youzan.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TARGETS = ['小程序预览.html'];
const norm = (u) => String(u).split('!')[0].split('?')[0];

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/uploads/index.json'), 'utf8'));
const have = new Map();
(idx.items || []).forEach((it) => { if (it.source) have.set(norm(it.source), it.url); });

const jobs = [];
TARGETS.forEach((rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const src = fs.readFileSync(abs, 'utf8');
  const urls = [...new Set(src.match(/https?:\/\/[^\s"'`,)\]}<]+/g) || [])];
  urls.forEach((u) => {
    if (!/yzcdn\.cn/.test(u)) return;          // h5.youzan.com 等跳转链接跳过
    if (have.has(norm(u))) return;             // 已在库
    if (jobs.some((j) => j.u === u)) return;
    jobs.push({ u, file: rel });
  });
});
console.log('待补图：' + jobs.length + ' 个');
jobs.slice(0, 8).forEach((j) => console.log('   ' + j.u.slice(0, 105)));

if (DRY) { console.log('\n（试跑，未下载）'); process.exit(0); }

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

const got = await mapLimit(jobs, 6, async (j) => {
  try {
    const buf = await download(j.u);
    if (buf.length > media.MAX_BYTES) { console.log('   ！超限 ' + (buf.length / 1048576).toFixed(2) + 'MB：' + j.u.slice(-40)); return null; }
    return { j, buf };
  } catch (e) { console.log('   ！失败 ' + e.message + '：' + j.u.slice(-46)); return null; }
});

const items = got.filter(Boolean).map((g) => ({ data: g.buf, orig: g.j.u.split('/').pop(), source: g.j.u }));
if (items.length) {
  const r = media.upload(items, FOLDER);
  (r.failedList || []).forEach((f) => console.log('   ！入库失败：' + f.name + ' → ' + f.reason));
  console.log('已入库 ' + (r.list || []).length + ' 张 → 文件夹「' + FOLDER + '」');
}
