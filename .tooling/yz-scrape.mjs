/**
 * 有赞店铺「产品」页 → 逐个商品详情页抓取全量信息
 *
 * 依赖：CDP 代理在 3456 上跑（web-access skill），且已抓好 .tooling/_yz/cards.json
 * 产物：.tooling/_yz/details.json —— { [alias]: { title, priceMin, ..., images[], detailImages[] } }
 *
 * 为什么这样做：详情页的商品数据在 window.globalData.goodsData 里（有赞 H5 的初始状态），
 * 结构化字段（title / pictures / skuInfo）比解析 DOM 稳得多；详情长图才走 DOM（.goods-detail-block）。
 *
 * 断点续跑：已抓过的 alias 会跳过（除非 --force）。
 * 用法：node .tooling/yz-scrape.mjs [--force] [--only alias1,alias2]
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '_yz');
const API = 'http://localhost:3456';
const FORCE = process.argv.includes('--force');
/** 只重抓详情长图（主体字段保留），用于「修好了详情图提取逻辑、补抓历史数据」 */
const DETAIL_ONLY = process.argv.includes('--detail-only');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > -1 ? process.argv[onlyArg + 1].split(',') : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * 卡片来源优先用 cards-all.json（**4 个品牌 52 张卡片**，由 yz-cards.mjs 抓）；
 * 没有时回落到 cards.json（只有默认显示的「莱克」品牌）。
 * 按 alias 去重 —— 同名卡片指向同一商品（如洗地机 U 系列）只抓一次，
 * 但保留一个有名字的作为 cardName。
 */
const allCardsFile = join(DIR, 'cards-all.json');
const rawCards = fs.existsSync(allCardsFile)
  ? JSON.parse(JSON.parse(fs.readFileSync(allCardsFile, 'utf8')).value)
  : JSON.parse(JSON.parse(fs.readFileSync(join(DIR, 'cards.json'), 'utf8')).value).uniqList;
const byAlias = new Map();
for (const c of rawCards) {
  if (!c.alias) continue;
  const prev = byAlias.get(c.alias);
  if (!prev) byAlias.set(c.alias, Object.assign({}, c));
  else if (!prev.name && c.name) byAlias.set(c.alias, Object.assign({}, prev, { name: c.name, brand: c.brand }));
}
const list = [...byAlias.values()].map((c) => Object.assign({}, c, {
  href: c.href || ('https://shop46010558.m.youzan.com/wscgoods/detail/' + c.alias + '?fromStore=true')
}));

const outFile = join(DIR, 'details.json');
const store = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};

async function openTab(url) {
  const r = await fetch(API + '/new', { method: 'POST', body: url });
  const j = await r.json();
  if (!j.targetId) throw new Error('打开标签页失败：' + JSON.stringify(j));
  return j.targetId;
}
async function evalJs(target, code) {
  const r = await fetch(API + '/eval?target=' + target, { method: 'POST', body: code });
  const j = await r.json();
  if (j.error) throw new Error('eval 失败：' + j.error);
  return j.value;
}
async function closeTab(target) {
  try { await fetch(API + '/close?target=' + target); } catch (e) { /* ignore */ }
}
async function scrollBottom(target) {
  try { await fetch(API + '/scroll?target=' + target + '&direction=bottom'); } catch (e) { /* ignore */ }
}

/** 页面内提取：商品主体（结构化字段） */
const EXTRACT_MAIN = `(()=>{
  const gd = (window.globalData || {}).goodsData || {};
  const g = gd.goods || {}, sk = gd.skuInfo || {};
  if (!g.title) return JSON.stringify({ __empty: true });
  const prices = (sk.skuPrices || []).map(x => x.price).filter(n => typeof n === 'number');
  const stocks = (sk.skuStocks || []).map(x => x.stockNum).filter(n => typeof n === 'number');
  const props = (sk.props || []).map(p => ({ k: p.k, vs: (p.v || []).map(v => ({ id: v.id, name: v.name, img: v.imgUrl || '' })) }));
  const skus = (sk.skus || []).map(s => {
    const price = ((sk.skuPrices || []).find(x => x.skuId === s.skuId) || {}).price;
    const stock = ((sk.skuStocks || []).find(x => x.skuId === s.skuId) || {}).stockNum;
    return { skuId: s.skuId, s1: String(s.s1 || ''), price, stock };
  });
  return JSON.stringify({
    alias: g.alias, itemId: g.id, title: g.title, subTitle: g.subTitle || '',
    soldNum: g.soldNum || 0,
    images: (g.pictures || []).map(p => ({ url: p.url, w: p.width, h: p.height })),
    priceMin: prices.length ? Math.min(...prices) : ((sk.spuPrice || {}).price || 0),
    priceMax: prices.length ? Math.max(...prices) : ((sk.spuPrice || {}).price || 0),
    stockTotal: stocks.length ? stocks.reduce((a, b) => a + b, 0) : ((sk.spuStock || {}).stockNum || 0),
    props, skus,
    shopName: (gd.shop || {}).shopName || ''
  });
})()`;

/**
 * 页面内提取：详情长图（DOM）
 *
 * ⚠️ 详情区**不能只看 <img>**：有赞把很多详情图放在懒加载组件的
 *    `background-image` 上（`.lazy-component__image`），
 *    `querySelectorAll('img')` 一张都拿不到 —— 早期版本因此把 6 个商品的详情图
 *    误判成「该商品没有详情图」。这里两种载体都扫。
 *    归一化：去掉有赞的 `!730x0.jpg` 尺寸后缀与查询串，拿到原图地址。
 */
const EXTRACT_DETAIL = `(()=>{
  const blk = document.querySelector('.goods-detail-block') || document.body;
  const raw = [];
  blk.querySelectorAll('img').forEach(i => {
    const s = i.currentSrc || i.src || i.getAttribute('data-src') || '';
    if (s && s.indexOf('data:') !== 0) raw.push(s);
  });
  blk.querySelectorAll('*').forEach(e => {
    const bg = getComputedStyle(e).backgroundImage;
    if (bg && bg !== 'none') {
      const re = /url\\("?([^")]+)"?\\)/g;
      let m;
      while ((m = re.exec(bg))) {
        const u = m[1];
        if (u && u.indexOf('data:') !== 0) raw.push(u);
      }
    }
  });
  const out = [...new Set(raw.map(u => u.split('!')[0].split('?')[0]))];
  return JSON.stringify(out);
})()`;

console.log('待抓取：' + list.length + ' 个商品（已有 ' + Object.keys(store).length + ' 个）\n');

let ok = 0, fail = 0;
for (const card of list) {
  const alias = card.alias;
  if (ONLY && !ONLY.includes(alias)) continue;
  if (!FORCE && !DETAIL_ONLY && store[alias] && !store[alias].__empty && (store[alias].images || []).length) {
    console.log('· 跳过 ' + alias + '（已抓）');
    ok++;
    continue;
  }
  const name = card.name || alias;
  const prev = store[alias];
  const detailOnly = DETAIL_ONLY && prev && !prev.__empty && (prev.images || []).length;
  let tab = null;
  try {
    tab = await openTab(card.href);
    await sleep(2600);

    let main = detailOnly ? prev : null;
    if (!detailOnly) {
      for (let i = 0; i < 3; i++) {
        const raw = await evalJs(tab, EXTRACT_MAIN);
        main = JSON.parse(raw);
        if (!main.__empty) break;
        await sleep(2000);
      }
      if (!main || main.__empty) throw new Error('页面未拿到 goodsData（可能需要登录或有反爬拦截）');
    }

    // 详情长图：滚动 4 轮触发懒加载，每轮收集
    const detailSet = new Set();
    for (let i = 0; i < 4; i++) {
      await scrollBottom(tab);
      await sleep(1300);
      const raw = await evalJs(tab, EXTRACT_DETAIL);
      JSON.parse(raw).forEach((u) => detailSet.add(u));
    }
    const mainUrls = new Set((main.images || []).map((x) => x.url.split('?')[0]));
    const detailImages = [...detailSet].filter((u) => !mainUrls.has(u) && !/skeleton|logo/i.test(u));

    store[alias] = Object.assign({}, main, {
      cardName: card.name || '',
      cardImg: card.img || '',
      href: card.href,
      detailImages
    });
    fs.writeFileSync(outFile, JSON.stringify(store, null, 1), 'utf8');
    ok++;
    console.log('✅ ' + alias + ' | ' + main.title.slice(0, 26) + ' | 主图 ' + main.images.length + ' | 详情图 ' + detailImages.length + ' | ¥' + (main.priceMin / 100) + '~' + (main.priceMax / 100) + ' | 库存 ' + main.stockTotal);
  } catch (e) {
    fail++;
    console.log('❌ ' + alias + ' | ' + name + ' | ' + String(e.message).slice(0, 120));
  } finally {
    if (tab) await closeTab(tab);
    await sleep(700);
  }
}

console.log('\n完成：成功 ' + ok + ' / 失败 ' + fail + ' → ' + outFile);
