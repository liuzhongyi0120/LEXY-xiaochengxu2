/**
 * 有赞商品 → 本店商品库 + 素材库（按产品名建文件夹）
 *
 * 输入：.tooling/_yz/details.json（由 yz-scrape.mjs 抓取）
 * 产物：
 *   1. 素材库：每个产品一个文件夹，存放该商品的主图 + 详情长图
 *   2. 商品库：catalog.json 里的商品条目（**必须经 HTTP 接口写**，理由见下）
 *   3. 状态：.tooling/_yz/import-state.json（alias → goodsId，便于重复执行时更新而非新建）
 *
 * ⚠️ 为什么必须走 HTTP 而不直接改 catalog.json：
 *    `lib/catalogStore.js` 里有一层**进程内内存缓存**（`let cache`），
 *    服务在跑时直接改文件，会被服务进程的缓存原样覆盖回去 —— 看起来像「改了没生效」。
 *    素材库（lib/media.js）没有缓存，每次读写都落文件，所以那部分可以直接调库函数。
 *
 * 幂等：同一张源图（按 source 字段比对）不会重复入库；商品按 yz-<skuId> 反查已存在则更新。
 *
 * 用法：
 *   node .tooling/yz-import-products.mjs --dry     # 只打印计划，不下载不写
 *   node .tooling/yz-import-products.mjs           # 真跑
 *   node .tooling/yz-import-products.mjs --only 35y0chueb2pnaxa
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { adminToken, authHeaders } from './_admin.mjs';

const require = createRequire(import.meta.url);
const media = require('../server/lib/media.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '_yz');
const BASE = process.env.MP_BASE || 'http://127.0.0.1:3000';
const DRY = process.argv.includes('--dry');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > -1 ? process.argv[onlyArg + 1].split(',') : null;

const REFERER = 'https://www.youzan.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/** 详情长图统一走 CDN 压缩：原图动辄 5MB（超过单文件上限），压到宽 900 的 jpg 约 0.5MB */
const DETAIL_CDN = 'imageView2/2/w/900/q/88/format/jpg';

const details = JSON.parse(fs.readFileSync(path.join(DIR, 'details.json'), 'utf8'));
const stateFile = path.join(DIR, 'import-state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { goods: {}, at: '' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/**
 * 下载 + 入库一组图片，返回按**原始顺序**排列的 /uploads/... 地址。
 * 顺序有意义：第一张主图就是商品封面（cover）。
 */
async function importImages(urls, folder, useCdn, tag) {
  const slots = new Array(urls.length).fill(null);
  const todo = [];
  urls.forEach((u, i) => {
    const had = srcToName.get(u + '|' + folder);
    if (had) { slots[i] = '/uploads/' + had; skippedImgs++; return; }
    todo.push({ u, i });
  });

  const got = await mapLimit(todo, 6, async (t) => {
    try {
      const buf = await download(useCdn ? withCdn(t.u) : t.u);
      if (buf.length > media.MAX_BYTES) {
        log('  ！' + tag + '超过单文件上限，跳过：' + t.u.slice(-46));
        return null;
      }
      return { t, buf };
    } catch (e) {
      log('  ！' + tag + '下载失败，跳过：' + t.u.slice(-46));
      return null;
    }
  });

  const items = got.filter(Boolean).map((g) => ({ data: g.buf, orig: g.t.u.split('/').pop(), source: g.t.u }));
  if (items.length) {
    const r = media.upload(items, folder);
    (r.failedList || []).forEach((f) => log('  ！' + tag + '上传失败：' + f.name + ' → ' + f.reason));
    let k = 0;
    got.forEach((g) => {
      if (!g) return;
      const up = r.list[k++];
      if (!up) return;
      slots[g.t.i] = up.url;
      srcToName.set(g.t.u + '|' + folder, up.name);
      doneImgs++;
    });
  }
  return slots.filter(Boolean);
}

/* ------------------------------------------------------------------ 命名与分类 */

/** 产品页卡片上的名字就是「产品名」；唯一一个卡片名为空的（U 系列聚合页）用标题里的系列名 */
const NAME_OVERRIDE = { '1yaatujlfrwomum': '天王星' };
function productName(d) {
  return NAME_OVERRIDE[d.alias] || d.cardName || String(d.title || '').split(/[\s　]/)[0].slice(0, 20) || d.alias;
}

/**
 * 分类归属。值写**分类名**（不是 id）：脚本会在分类树里按名字查，查不到才新建。
 * 括号里是新建位置的父级。
 */
const CAT_OF = {
  // 清洁电器 › 吸尘器（都是「能洗地 / 擦地」的多功能无线吸尘器，主类仍是吸尘器）
  '35y0chueb2pnaxa': '吸尘器', '2oe54t9wriqjqah': '吸尘器', '3npcxabk2u3zaxj': '吸尘器',
  '1y7tschyv4mcmzv': '吸尘器', '1yaatujlfrwomum': '吸尘器', '3nvhrwex6ltaegb': '吸尘器',
  '276ki4fm3ko2un5': '吸尘器', '2flkhpukjiyae76': '吸尘器', '2fmtd0hkillditm': '吸尘器',
  '2g0cmc0u5p7vac9': '吸尘器', '3nlmuhxzp61c647': '吸尘器', '2oo0r7i1gm77a4l': '吸尘器',
  // 环境电器 › 空气净化器 / 加湿器（已存在）
  '2fp90b5eqvybqla': '空气净化器', '2xj1eajjazpeezo': '空气净化器',
  '1y6lsfdfxgfzqci': '空气净化器', '3nrswwqbhdmrqik': '空气净化器',
  '3647gdeeixxcmlc': '加湿器', '2xlhe5qd0w12u': '加湿器', '36acb4s5z2v5i': '加湿器',
  // 环境电器 › 空气调节扇 / 除湿机（新建）
  '3epcncg0n3b0m13': '空气调节扇', '2fxvf26rje8hi1f': '空气调节扇',
  '2xgl1uupfs9aeqy': '空气调节扇', '3eo4b4f5qiw5yl0': '空气调节扇',
  '1y7ub3q71cnzq': '除湿机', '2xlilvs4t5n4m': '除湿机',
  '3nj7didd0fsee': '除湿机', '3f0f873ufjq3q': '除湿机',
  // 个护电器 › 吹风机（新建）
  '2x96thdtxt1c6': '吹风机', '36ctiksl11k7a40': '吹风机'
};

/** 需要时才创建的分类：name → 父分类名（'' = 一级分类） */
const NEW_CATS = [
  { name: '空气调节扇', parent: '环境电器' },
  { name: '除湿机', parent: '环境电器' },
  { name: '个护电器', parent: '' },
  { name: '吹风机', parent: '个护电器' }
];

/**
 * 按商品标题推断分类（CAT_OF 没写死时用）。
 * 顺序即优先级：「能洗地的多功能**吸尘器**」要落「吸尘器」而不是「洗地机」，
 * 所以含「吸尘」的规则必须排在「洗地」前面。
 */
const CAT_RULES = [
  [/净水|净饮|饮水|纯水|滤芯|滤材/, '净饮机'],
  [/咖啡/, '咖啡机'],
  [/破壁|料理机/, '破壁机'],
  [/除湿/, '除湿机'],
  [/加湿/, '加湿器'],
  [/净化器|空气净化|甲醛/, '空气净化器'],
  [/风扇|空气调节扇|循环扇|塔扇/, '空气调节扇'],
  [/吹风/, '吹风机'],
  [/除螨/, '除螨仪'],
  [/吸尘|擦地|清洁/, '吸尘器'],
  [/洗地/, '洗地机']
];

function catNameOf(alias, d) {
  if (CAT_OF[alias]) return CAT_OF[alias];
  const t = String(d.title || '') + ' ' + (d.cardName || '');
  for (const [re, name] of CAT_RULES) if (re.test(t)) return name;
  return '吸尘器';
}

/* ------------------------------------------------------------------ HTTP */

const api = async (p, params, method) => {
  const r = await fetch(BASE + p, {
    method: method || 'POST',
    headers: authHeaders(TOKEN, { 'Content-Type': 'application/json' }),
    body: params === undefined ? undefined : JSON.stringify(params)
  });
  const j = await r.json().catch(() => null);
  if (!j || j.code !== 0) throw new Error(p + ' → HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 220));
  return j.data;
};

async function download(url) {
  const r = await fetch(url, { headers: { Referer: REFERER, 'User-Agent': UA } });
  if (!r.ok) throw new Error('下载失败 HTTP ' + r.status + ' ' + url.slice(0, 90));
  return Buffer.from(await r.arrayBuffer());
}

/** 详情长图走 CDN 压缩参数；主图用原图（一般 800×800，几十 KB） */
function withCdn(url) {
  return url + (url.includes('?') ? '&' : '?') + DETAIL_CDN;
}

/** 保持输出顺序的并发 map（下载是网络等待，串行跑 551 张太慢） */
async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) || 1 }, async () => {
    while (next < arr.length) {
      const i = next++;
      out[i] = await fn(arr[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/* ------------------------------------------------------------------ 主流程 */

log('\n=== 有赞商品导入 ===' + (DRY ? '（--dry 只预演）' : ''));
const aliases = Object.keys(details).filter((a) => !ONLY || ONLY.includes(a));
log('商品数：' + aliases.length + '\n');

if (DRY) {
  aliases.forEach((a, i) => {
    const d = details[a];
    log(String(i + 1).padStart(2) + '. [' + productName(d) + '] → 分类 ' + catNameOf(a, d)
      + ' | 主图 ' + (d.images || []).length + ' | 详情图 ' + (d.detailImages || []).length
      + ' | ¥' + d.priceMin / 100 + '~' + d.priceMax / 100 + ' | 库存 ' + d.stockTotal);
  });
  process.exit(0);
}

const TOKEN = await adminToken(BASE);
log('管理员会话已就绪\n');

/* --- 1. 分类：补齐缺的 --- */
let catList = (await api('/api/admin/category/list', undefined, 'GET')).list;
const findCat = (name) => {
  for (const c of catList) {
    if (c.name === name) return c;
    for (const x of c.children || []) if (x.name === name) return x;
  }
  return null;
};
for (const nc of NEW_CATS) {
  if (findCat(nc.name)) continue;
  const parent = nc.parent ? findCat(nc.parent) : null;
  if (nc.parent && !parent) throw new Error('父分类不存在：' + nc.parent);
  const r = await api('/api/admin/category/save', { name: nc.name, parentId: parent ? parent.id : '' });
  log('＋ 新建分类：' + (nc.parent ? nc.parent + ' › ' : '') + nc.name + '（' + r.id + '）');
  // 立刻刷新：后面的分类可能就是挂在刚建的父级下（如「吹风机」挂「个护电器」）
  catList = (await api('/api/admin/category/list', undefined, 'GET')).list;
}

/* --- 2. 已有商品：yz-<skuId> → goodsId，用于「已导入则更新」 --- */
const goodsListAll = await api('/api/admin/goods/list?page=1&size=999', undefined, 'GET');
const allGoods = goodsListAll.list || [];
const skuToGoods = new Map();
allGoods.forEach((g) => (g.skus || []).forEach((s) => { if (s.skuId) skuToGoods.set(s.skuId, g.id); }));
log('商品库现有 ' + allGoods.length + ' 个商品，已建 yz-sku 索引 ' + skuToGoods.size + ' 条\n');

/* --- 3. 素材库现状：source → name，用于幂等 --- */
/*
 * 去重键 = 源图地址 + 归属文件夹。
 *
 * ⚠️ 不能只按源图去重：同系列商品（如 N7 Pro / N7 / N5 Pro / N5）在店里**共用同一批图片**，
 *    只按源图去重会让先导入的那个把图「占住」，后几个的文件夹几乎为空 ——
 *    违背「按产品名归类」的初衷，运营在 N5 Pro 文件夹里找不到 N5 Pro 的主图。
 *    代价是同一张图在不同产品文件夹里各存一份，换来每个文件夹都自洽。
 */
const idxRaw = JSON.parse(fs.readFileSync(path.join(media.ROOT, 'index.json'), 'utf8'));
const srcToName = new Map();
idxRaw.items.forEach((it) => { if (it.source) srcToName.set(it.source + '|' + (it.folder || ''), it.name); });

let doneGoods = 0, doneImgs = 0, skippedImgs = 0;
const report = [];

for (const alias of aliases) {
  const d = details[alias];
  const pname = productName(d);
  const catName = catNameOf(alias, d);
  const cat = findCat(catName);
  if (!cat) throw new Error('分类不存在：' + catName + '（' + alias + '）');

  /* 3.1 图片：主图原图 + 详情图 CDN 压缩版；已入库过的按 source 复用（幂等） */
  const mainUrls = await importImages((d.images || []).map((x) => x.url), pname, false, '主图');
  const detailImgs = await importImages(d.detailImages || [], pname, true, '详情图');

  /* 3.2 商品字段 */
  const prop0 = (d.props || [])[0];
  const specs = prop0 ? [{ name: prop0.k || '款式', values: prop0.vs.map((v) => v.name) }] : [];
  const cover = mainUrls[0] || '';
  let skus;
  if (prop0 && (d.skus || []).length) {
    skus = d.skus.map((s) => {
      const v = (prop0.vs || []).find((x) => String(x.id) === String(s.s1));
      const price = typeof s.price === 'number' && s.price > 0 ? s.price : d.priceMin;
      return {
        skuId: 'yz-' + s.skuId,
        specs: [v ? v.name : '默认'],
        price, originalPrice: price,
        stock: typeof s.stock === 'number' ? s.stock : 0,
        image: cover
      };
    });
  } else {
    skus = [{
      skuId: 'yz-' + (d.itemId || d.alias),
      specs: [],
      price: d.priceMin, originalPrice: d.priceMin,
      stock: d.stockTotal || 0,
      image: cover
    }];
  }

  const payload = {
    name: String(d.title || '').replace(/\s+/g, ' ').trim(),
    subtitle: '',
    categoryId: cat.id,
    tags: [],
    sales: d.soldNum || 0,
    commentCount: 0,
    cover,
    images: mainUrls.slice(0, 12),
    detailImages: detailImgs.slice(0, 20),
    description: '',
    specs,
    skus,
    status: 'on_sale'
  };

  const existId = (d.skus || []).map((s) => skuToGoods.get('yz-' + s.skuId)).filter(Boolean)[0] || state.goods[alias];
  if (existId) payload.id = existId;

  const saved = await api('/api/admin/goods/save', payload);
  state.goods[alias] = saved.id;
  state.at = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 1), 'utf8');

  doneGoods++;
  log('✅ ' + pname + ' → 商品 ' + saved.id + (existId ? '（更新）' : '（新建）')
    + ' | ' + catName + ' | 主图 ' + mainUrls.length + ' 详情图 ' + detailImgs.length);
  report.push({ alias, pname, goodsId: saved.id, catName });
  await sleep(60);
}

/* --- 4. 收尾统计 --- */
const after = media.folders();
log('\n=== 完成 ===');
log('商品 ' + doneGoods + ' 个已入库；新上传图片 ' + doneImgs + ' 张，复用已有 ' + skippedImgs + ' 张');
log('素材库：共 ' + after.total + ' 个素材，' + after.folders.length + ' 个文件夹');
log('本次涉及的产品文件夹：');
report.forEach((r) => {
  const f = after.folders.find((x) => x.name === r.pname);
  log('  · ' + r.pname.padEnd(12, '　') + (f ? f.count + ' 张' : '（空）') + '  → 商品 ' + r.goodsId);
});
log('\n状态文件：' + stateFile);
