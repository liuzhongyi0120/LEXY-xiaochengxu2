#!/usr/bin/env node
/**
 * 把「页面正在用的素材」导入素材库，并按页面名建文件夹
 *
 *   node server/tools/import-page-assets.mjs           # 真跑
 *   node server/tools/import-page-assets.mjs --dry-run  # 只看会导入哪些，不下载不落盘
 *
 * 背景（2026-10-09 实测）：小程序页面里的图片**全部是外部外链**
 * （有赞 CDN `img.yzcdn.cn` / `mps-trans.yzcdn.cn`），素材库里一张都没被引用。
 * 这个脚本把它们下载到本地素材库、按来源页面归入同名文件夹，
 * 让「装修选图」时能按页面直接找到现成素材。
 *
 * 它只做三件事，并且**幂等**（重复跑不会产生重复素材）：
 *   1. 解析 miniprogram/config/replica.js，按顶层结构判定每张图属于哪个页面
 *   2. 下载外链图片（带 referer），按**文件头魔数**校验真实类型（不信 content-type）
 *   3. 落盘 server/data/uploads/<yyyyMM>/ 并写入索引，归属到「页面名」文件夹
 *
 * ⚠️ 它**不修改 replica.js** —— 页面上仍然是外链。
 *    「要不要把页面引用换成本地副本」是另一个决定（涉及装修台草稿与发布链路），
 *    需要单独确认，不在本脚本职责内。
 *
 * ⚠️ 运行期间请勿在后台点素材库（两边都会写同一个 index.json）。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const media = require('../lib/media.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPLICA = path.join(HERE, '..', '..', 'miniprogram', 'config', 'replica.js');

const DRY = process.argv.includes('--dry-run');
const CONCURRENCY = 6;      // 下载并发（入库是串行的，索引只有一个写者）
const REFERER = 'https://www.youzan.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** replica.js 顶层变量 → 小程序页面名（文件夹名） */
const TOPLEVEL_TO_PAGE = {
  SHOP: '店铺设置',
  HOME_BLOCKS: '首页',
  LEXY_SERIES: '莱克',
  NEWS: '资讯',
  PRODUCT_NAV_LOGO: '产品',
  PRODUCT_BRANDS: '产品',
  TABBAR: '店铺导航'
};
/** 明确不含图片的顶层键，避免被归到「其他」 */
const IGNORE_KEYS = ['PAGE_META'];

const log = (...a) => console.log(...a);
const c = {
  ok: (s) => '\x1b[32m' + s + '\x1b[0m',
  warn: (s) => '\x1b[33m' + s + '\x1b[0m',
  err: (s) => '\x1b[31m' + s + '\x1b[0m',
  dim: (s) => '\x1b[90m' + s + '\x1b[0m',
  b: (s) => '\x1b[1m' + s + '\x1b[0m'
};

/* ------------------------------ 1. 解析 replica.js ------------------------------ */

/** 按顶层 `const XXX = ` 把源码切成块，返回 [{key, text}] */
function splitTopLevel(src) {
  const lines = src.split('\n');
  const marks = [];
  lines.forEach((ln, i) => {
    const m = /^const ([A-Z0-9_]+)\s*=/.exec(ln);
    if (m) marks.push({ key: m[1], line: i });
  });
  return marks.map((mk, idx) => ({
    key: mk.key,
    text: lines.slice(mk.line, idx + 1 < marks.length ? marks[idx + 1].line : lines.length).join('\n')
  }));
}

/** 抽出一段文本里的所有 http(s) 图片链接（去重、保序） */
function pickImageUrls(text) {
  const out = [];
  const re = /["'`](https?:\/\/[^"'`\s]+)["'`]/g;
  let m;
  while ((m = re.exec(text))) {
    const u = m[1];
    if (/\.(png|jpe?g|webp|gif)([!?][^"'`\s]*)?$/i.test(u) && out.indexOf(u) === -1) out.push(u);
  }
  return out;
}

/** 自定义页（CUSTOM_PAGES）里按二级 key 再分一次，文件夹名用页面标识 */
function splitCustomPages(text) {
  const out = new Map();
  const re = /^\s{2}([A-Za-z0-9_-]+)\s*:\s*\{/gm; // 二级 key
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ key: m[1], at: m.index });
  marks.forEach((mk, i) => {
    const seg = text.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : text.length);
    const urls = pickImageUrls(seg);
    if (urls.length) out.set('自定义页·' + mk.key, urls);
  });
  return out;
}

/** 得到 Map<页面名, URL[]> */
function buildPlan(src) {
  const plan = new Map();
  const push = (page, urls) => {
    if (!urls.length) return;
    const arr = plan.get(page) || [];
    urls.forEach((u) => { if (arr.indexOf(u) === -1) arr.push(u); });
    plan.set(page, arr);
  };
  const unknown = [];

  splitTopLevel(src).forEach((blk) => {
    if (blk.key === 'CUSTOM_PAGES') {
      splitCustomPages(blk.text).forEach((urls, page) => push(page, urls));
      return;
    }
    const urls = pickImageUrls(blk.text);
    if (!urls.length) return;
    if (TOPLEVEL_TO_PAGE[blk.key]) { push(TOPLEVEL_TO_PAGE[blk.key], urls); return; }
    if (IGNORE_KEYS.indexOf(blk.key) === -1) unknown.push({ key: blk.key, count: urls.length });
  });

  if (unknown.length) {
    log(c.warn('  ⚠ 有未登记的顶层键带图片，已归入「其他」：' +
      unknown.map((x) => x.key + '(' + x.count + ')').join(', ') +
      '（如是新页面，请补进脚本的 TOPLEVEL_TO_PAGE）'));
    unknown.forEach((x) => {
      const blk = splitTopLevel(src).find((b) => b.key === x.key);
      push('其他', pickImageUrls(blk.text));
    });
  }
  return plan;
}

/* ------------------------------ 2. 下载 ------------------------------ */

function baseFromUrl(u) {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(seg).split('!')[0].split('?')[0];
  } catch (e) { return ''; }
}

async function download(url) {
  const res = await fetch(url, { headers: { referer: REFERER, 'user-agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('响应为空');
  const probed = media.probe(buf); // 按文件头判断真实类型，webp/png/jpg/gif 之外一律拒收
  if (!probed) throw new Error('不是可识别的图片（' + media.humanSize(buf.length) + '）');
  if (buf.length > media.MAX_BYTES) throw new Error('超过单张上限 ' + media.humanSize(media.MAX_BYTES) + '（实际 ' + media.humanSize(buf.length) + '）');
  return { buf, probed };
}

/** 受限并发 */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cur = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cur < items.length) {
      const i = cur++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

function makeRel(url, probed) {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  const ym = `${d.getFullYear()}${p(d.getMonth() + 1)}`;
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 6);
  const stem = (baseFromUrl(url) || 'img').replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'img';
  return `${ym}/${day}-${hash}-${stem}.${probed.ext}`;
}

/* ------------------------------ 3. 主流程 ------------------------------ */

(async () => {
  if (!fs.existsSync(REPLICA)) throw new Error('找不到 replica.js：' + REPLICA);
  const src = fs.readFileSync(REPLICA, 'utf8');
  const plan = buildPlan(src);

  const totalUrls = [...plan.values()].reduce((s, a) => s + a.length, 0);
  log('\n' + c.b('页面素材 → 素材库') + c.dim(`（源：miniprogram/config/replica.js）`));
  log(c.dim('─'.repeat(66)));
  [...plan.entries()].forEach(([page, urls]) => {
    log('  ' + page.padEnd(12, '　') + c.dim(String(urls.length).padStart(3) + ' 张'));
  });
  log(c.dim('─'.repeat(66)));
  log('  合计 ' + c.b(String(totalUrls) + ' 个图片链接') + '，分 ' + plan.size + ' 个文件夹\n');

  if (DRY) { log(c.warn('--dry-run：只解析不下载。')); return; }

  // 幂等：已经导入过的 source 直接跳过（同一条外链只入库一次）
  const idx = media.list({ size: 1 }); // 顺带让索引自愈（剔除「文件已丢」的条目）
  let idxRaw = { items: [] };
  try { idxRaw = JSON.parse(fs.readFileSync(path.join(media.ROOT, 'index.json'), 'utf8')); } catch (e) { /* 首次运行 */ }
  const existed = new Set();
  (idxRaw.items || []).forEach((it) => { if (it.source) existed.add(it.source); });
  log(c.dim('  素材库现有 ' + idx.all + ' 张，其中 ' + existed.size + ' 张是已导入过的外链（将跳过）\n'));

  const report = { okTotal: 0, skipTotal: 0, failTotal: 0 };
  const urlOwner = new Map(); // url -> 已归入的页面（用于跨页共用检测 + 避免重复入库）

  for (const [page, urls] of plan) {
    const todo = [];
    let skipped = 0;
    urls.forEach((u) => {
      if (existed.has(u)) { skipped += 1; return; }
      if (urlOwner.has(u)) { return; } // 同一张图已在别的页面入库，这里不再重复
      urlOwner.set(u, page);
      todo.push(u);
    });

    const line = { page, total: urls.length, skipped, ok: 0, fail: [] };

    if (todo.length) {
      const results = await pool(todo, CONCURRENCY, async (u) => {
        try {
          const r = await download(u);
          return { url: u, buf: r.buf, probed: r.probed };
        } catch (e) {
          return { url: u, error: e.message };
        }
      });

      const good = results.filter((r) => r.buf);
      const bad = results.filter((r) => r.error);
      if (good.length) {
        // 入库串行：索引只有一个写者，并发写会互相覆盖
        const up = media.upload(
          good.map((r) => ({
            data: r.buf,
            orig: baseFromUrl(r.url) || 'image',
            rel: makeRel(r.url, r.probed),
            source: r.url
          })),
          page
        );
        line.ok = up.success;
        report.okTotal += up.success;
        if (up.failed) up.failedList.forEach((f) => line.fail.push({ url: f.name, why: f.reason }));
      }
      bad.forEach((r) => line.fail.push({ url: r.url, why: r.error }));
    }

    line.skipped += skipped;
    report.skipTotal += skipped;
    report.failTotal += line.fail.length;

    log('  ' + (line.fail.length ? c.warn('●') : c.ok('●')) + ' ' + page.padEnd(12, '　') +
      c.ok('导入 ' + String(line.ok).padStart(3)) +
      (line.skipped ? c.dim('  跳过 ' + line.skipped) : '') +
      (line.fail.length ? c.err('  失败 ' + line.fail.length) : ''));
    line.fail.forEach((f) => log('      ' + c.err('✗') + ' ' + f.why + '  ' + c.dim(f.url.slice(0, 78))));
  }

  /* 跨页共用：同一张图出现在多个页面（只归了第一个页面） */
  const urlPages = new Map();
  [...plan.entries()].forEach(([page, urls]) => urls.forEach((u) => {
    if (!urlPages.has(u)) urlPages.set(u, []);
    urlPages.get(u).push(page);
  }));
  const shared = [...urlPages.entries()].filter(([, ps]) => new Set(ps).size > 1);

  log('\n' + c.dim('─'.repeat(66)));
  log('  ' + c.b('完成') + `：导入 ${report.okTotal} 张 · 跳过 ${report.skipTotal} 张（已存在/跨页重复） · 失败 ${report.failTotal} 张`);
  if (shared.length) {
    log('  ' + c.dim('跨页共用 ' + shared.length + ' 张（已归入首个引用的页面）：'));
    shared.slice(0, 8).forEach(([u, ps]) => log(c.dim('    ' + [...new Set(ps)].join(' / ') + '  ' + u.slice(0, 66))));
    if (shared.length > 8) log(c.dim('    …'));
  }
  const after = media.folders();
  log('\n  素材库现状：共 ' + after.total + ' 张，' + after.folders.length + ' 个文件夹');
  after.folders.forEach((f) => log('    ' + f.name.padEnd(14, '　') + f.count + ' 张'));
  log('    未分组'.padEnd(16, '　') + after.ungrouped + ' 张');
  log(c.dim('\n  提示：页面上用的仍是外链地址，本脚本不改 replica.js。'));
})().catch((e) => {
  console.error('\n' + c.err('导入失败：' + e.message));
  process.exit(1);
});
