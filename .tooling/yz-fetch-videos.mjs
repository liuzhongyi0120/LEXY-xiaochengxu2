/**
 * 视频源回源抓取：把「签名已过期」的有赞视频抓到本地
 *
 * 有赞的视频地址是 `mps-trans.yzcdn.cn/.../xxx_HD.mp4?sign=<hash>&t=<hash>`，
 * **签名动态生成、会过期**。装修/资讯数据里存的是抓取那一刻的签名，
 * 过一段时间直连一律 403 —— 不只是我们下不到，真机上同样播不了。
 * 唯一可靠的取法：打开对应的有赞 H5 页面，读出它**当前渲染**出的签名地址，
 * 趁有效立刻下载入库。
 *
 * 之所以做成「页面 → 目标」的通用表：签名过期是**周期性**问题，
 * 以后真机视频再播不出，跑一次本脚本即可刷新，不用重新排查。
 *
 * 用法：
 *   node .tooling/yz-fetch-videos.mjs --probe    # 只打印当前地址与体积
 *   node .tooling/yz-fetch-videos.mjs            # 下载并入库
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const media = require('../server/lib/media.js');
const REPLICA = require('../miniprogram/config/replica.js');
const NEWS = require('../miniprogram/packageNews/data.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '_yz');
const API = 'http://localhost:3456';
const PROBE = process.argv.includes('--probe');
const REFERER = 'https://shop46010558.m.youzan.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 路径主体（去域名、去查询串、去有赞缩放后缀）：把「数据里的旧签名地址」与「页面上的新签名地址」对上 */
const keyOf = (u) => String(u).split('?')[0].split('!')[0];

/* ---------------- 采集：从数据源里找出所有 mps-trans 地址 ---------------- */
function collect(node, out, seen = new Set()) {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') { if (/mps-trans/.test(node)) out.add(node); return out; }
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  Object.keys(node).forEach((k) => collect(node[k], out, seen));
  return out;
}

const homeTargets = new Set();
(REPLICA.HOME_BLOCKS || []).forEach((b) => {
  if (b.src && /mps-trans/.test(b.src)) homeTargets.add(b.src);
  if (b.poster && /mps-trans/.test(b.poster)) homeTargets.add(b.poster);
});

const newsTargets = collect(NEWS.PAGES, new Set());

/**
 * 来源页配置。
 * aliasOrUrl 用有赞 H5 页面地址；资讯页要用 `wscshop/feature/<id>` 这一支，
 * 直接拿微页面 alias 拼 `v2/feature/` 会 302 到别的域名再报错（踩过）。
 */
const SOURCES = [
  {
    name: '首页',
    folder: '首页',
    url: 'https://shop46010558.m.youzan.com/v2/showcase/homepage?alias=0XCPznpG6m&shopAutoEnter=1&kdt_id=45818390',
    targets: [...homeTargets]
  },
  {
    name: '资讯·创业语录',
    folder: '资讯·创业语录',
    url: 'https://shop46010558.m.youzan.com/wscshop/feature/pWuQ9DAXB8?sub_kdt_id=45818390',
    targets: [...newsTargets]
  }
];

/* ---------------- 取页面当前地址 ---------------- */
async function evalJs(target, code, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + '/eval?target=' + target, { method: 'POST', body: code });
    const t = await r.text();
    if (!/attach 失败|No target/.test(t)) return t;
    await sleep(2000);
  }
  return null;
}

const EXTRACT = `(()=>{
  const urls = new Set();
  [...document.querySelectorAll('video')].forEach(v => {
    [v.getAttribute('src'), v.currentSrc, v.getAttribute('poster')].forEach(x => { if (x) urls.add(x); });
    [...v.querySelectorAll('source')].forEach(s => { const x = s.getAttribute('src'); if (x) urls.add(x); });
  });
  const html = document.documentElement.innerHTML.replace(/&amp;/g, '&');
  (html.match(/https:\\/\\/mps-trans\\.yzcdn\\.cn\\/[^"'\\\\ )<>]+/g) || []).forEach(u => urls.add(u));
  return JSON.stringify({ url: location.href, list: [...urls] });
})()`;

async function grabFromPage(url) {
  let target = null;
  try {
    const r = await fetch(API + '/new', { method: 'POST', body: url });
    const j = JSON.parse((await r.text()).trim());
    target = j.targetId || j;
  } catch (e) { console.log('  开标签失败：' + String(e).slice(0, 70)); return []; }
  await sleep(11000);
  const raw = await evalJs(target, EXTRACT);
  try { await fetch(API + '/close?target=' + target, { method: 'POST' }); } catch (_) {}
  try { return JSON.parse(JSON.parse(raw).value).list || []; } catch (e) { return []; }
}

/* ---------------- 已入库索引 ---------------- */
/*
 * ⚠️ 去重键必须用**路径主体**（keyOf）而不是完整 source：
 *    有赞视频的 source 带动态签名，同一支视频每次抓到的 URL 都不同 ——
 *    按完整 URL 去重等于每次跑都重新下载一遍，素材库里会堆出一堆同名视频。
 */
const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/data/uploads/index.json'), 'utf8'));
const have = new Map();
(idx.items || []).forEach((it) => {
  if (it.source && /mps-trans/.test(it.source)) have.set(keyOf(it.source) + '|' + (it.folder || ''), it.url);
});

const map = {};
let downloaded = 0;
let failed = 0;

for (const src of SOURCES) {
  if (!src.targets.length) { console.log('\n===== ' + src.name + '：无待抓地址，跳过 ====='); continue; }
  console.log('\n===== ' + src.name + '（' + src.targets.length + ' 个地址）=====');
  src.targets.forEach((t) => console.log('   目标 ' + t.split('/').pop().split('?')[0].slice(0, 56)));

  const found = await grabFromPage(src.url);
  const fresh = new Map();
  found.forEach((u) => { if (!fresh.has(keyOf(u))) fresh.set(keyOf(u), u); });
  console.log('   页面暴露 ' + found.length + ' 条 mps-trans 地址');

  const items = [];
  const slots = [];
  for (const t of src.targets) {
    const now = fresh.get(keyOf(t));
    if (!now) { console.log('   ✗ 页面未暴露，跳过：' + t.split('/').pop().split('?')[0].slice(0, 50)); failed++; continue; }

    const had = have.get(keyOf(t) + '|' + src.folder);
    if (had) { map[t] = had; console.log('   · 已入库，跳过'); continue; }

    let buf;
    try {
      const r = await fetch(now, { headers: { Referer: REFERER, 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) { console.log('   ✗ 下载失败：' + String(e).slice(0, 60)); failed++; continue; }

    const isVideo = /\.mp4/i.test(now);
    const cap = isVideo ? media.MAX_VIDEO_BYTES : media.MAX_BYTES;
    if (buf.length > cap) { console.log('   ✗ 超过上限 ' + (buf.length / 1048576).toFixed(1) + 'MB'); failed++; continue; }

    items.push({ data: buf, orig: now.split('/').pop().split('?')[0], source: now });
    slots.push({ t, isVideo, size: buf.length });
    console.log('   ↓ 下载 ' + (buf.length / 1048576).toFixed(2) + ' MB  ' + (isVideo ? '视频' : '图片'));
  }

  if (items.length) {
    const r = media.upload(items, src.folder);
    (r.failedList || []).forEach((f) => console.log('   ✗ 入库失败：' + f.name + ' → ' + f.reason));
    let k = 0;
    items.forEach((it, i) => {
      const up = (r.list || [])[k++];
      if (!up) return;
      map[slots[i].t] = up.url;
      downloaded++;
      console.log('   ✓ 入库 → ' + up.url);
    });
  }

  if (PROBE) {
    console.log('   --- 体积探测 ---');
    for (const t of src.targets) {
      const now = fresh.get(keyOf(t));
      if (!now) continue;
      try {
        const r = await fetch(now, { headers: { Referer: REFERER, 'User-Agent': UA, Range: 'bytes=0-0' } });
        const cr = r.headers.get('content-range') || '';
        const size = cr ? Number(cr.split('/')[1]) : null;
        console.log('     ' + (size ? (size / 1048576).toFixed(2) + ' MB' : '未知') + '  HTTP ' + r.status + '  ' + t.split('/').pop().split('?')[0].slice(0, 46));
      } catch (e) { console.log('     探测失败'); }
    }
  }
}

if (PROBE) { console.log('\n（--probe 模式，未下载）'); process.exit(0); }

fs.writeFileSync(path.join(DIR, 'video-map.json'), JSON.stringify(map, null, 2));
console.log('\n=== 汇总 ===');
console.log('成功入库 ' + downloaded + ' | 失败 ' + failed + ' | 映射 ' + Object.keys(map).length + ' 条');
console.log('映射表已写 .tooling/_yz/video-map.json');
