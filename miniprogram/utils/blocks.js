/**
 * 装修区块 → 渲染数据
 *
 * 首页（pages/index）与自定义页（pages/custom，装修台「新建页面」建的页）用的是
 * 同一套装修区块，所以派生值计算、单位换算、商品区块的实时数据拉取都收敛在这里
 * 一份实现里，避免两边各写一遍后逐渐走样。
 *
 * ⚠️ 单位口径（必须与装修台属性面板、后台预览保持一致）：
 *   - height 字段本身即 rpx（750 宽基准），直接拿去设高，不要再 ×2；
 *   - pageMargin / paddingY / iconSize / gap / imageGap 是 375 基准设计稿 px，需 ×2 转 rpx。
 *   历史坑：height 曾被当成 375 基准 px 再 ×2，导致首屏图被放大一倍后裁切。
 */

const { resolveAssets, assetUrl } = require('./asset');
const { px2rpx, heightRpx } = require('./units');
const goodsSvc = require('../services/goods');

const SIZE_CLASS = { sm: 's-sm', md: 's-md', lg: 's-lg' };

/** 店铺主题色（按钮「跟随店铺风格」时使用；与 tabBar selectedColor 保持一致） */
const BRAND = '#C8102E';

/**
 * 富文本净化：小程序 rich-text 本身不执行脚本，但历史脏数据里可能带 <script>/on* 属性，
 * 这里统一剥掉，避免「编辑器里粘了网页源码」把脏东西带上线。
 */
function sanitizeRich(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}


/**
 * 把装修数据转成渲染需要的派生值，让 wxml 保持干净（不在模板里做算术）。
 *
 * resolveAssets 会把后台上传的 /uploads/… 相对地址补成完整地址，外链原样保留。
 */
function normalizeBlock(b, index) {
  const o = resolveAssets(b);
  const kind = o.type;

  if (kind === 'swiper') {
    o.mode = o.mode || 'poster';
    o.hRpx = heightRpx(o.height, 1322);
    o.marginRpx = px2rpx(o.pageMargin);
    o.gapRpx = px2rpx(o.imageGap);
    o.halfGapRpx = Math.round(o.gapRpx / 2);
    o.round = o.radius === 'round';
    o.interval = o.interval || 4500;
    o.indicator = o.indicator || 'dots';
    // 每张图带自己的跳转，所以统一成 { image, link }；
    // 兼容老数据：images 曾是「地址字符串数组」，发布一次后会被升级成新结构。
    o.images = (o.images || [])
      .map((x) => (typeof x === 'string' ? { image: x, link: '' } : { image: (x && x.image) || '', link: (x && x.link) || '' }))
      .filter((x) => x.image);
    o.dCur = 0;
  } else if (kind === 'image') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.round = o.radius === 'round';
  } else if (kind === 'video') {
    o.hRpx = heightRpx(o.height, 420);
    o.marginRpx = px2rpx(o.pageMargin);
    o.round = o.radius === 'round';
  } else if (kind === 'title') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.padYRpx = px2rpx(o.paddingY);
    o.sizeClass = SIZE_CLASS[o.size] || 's-md';
    o.align = o.align === 'center' ? 'center' : 'left';
  } else if (kind === 'line') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.hRpx = heightRpx(o.height, 20);
    o.style = o.style || 'blank';
  } else if (kind === 'notice') {
    o.marginRpx = px2rpx(o.pageMargin);
  } else if (kind === 'nav') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.iconRpx = px2rpx(o.iconSize || 88);
    const cols = Number(o.cols) || 4;
    o.colW = Math.floor(100 / cols * 100) / 100;
    o.items = (o.items || []).filter((x) => x && (x.text || x.image));
  } else if (kind === 'cube') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.gapRpx = px2rpx(o.gap);
    const cols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / cols * 100) / 100;
    o.items = (o.items || []).filter((x) => x && x.image);
  } else if (kind === 'hotspot') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.hRpx = heightRpx(o.height, 500);
    o.areas = (o.areas || []).filter((a) => a && a.link);
  } else if (kind === 'shop') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.align = o.align === 'left' ? 'left' : 'center';
    o.style = o.style || 'avatar';
  } else if (kind === 'goods') {
    o.marginRpx = px2rpx(o.pageMargin);
    const cols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / cols * 100) / 100;
    o.limit = Number(o.limit) || 4;
    o.goods = [];
    // 「没有商品」与「接口失败」是两件事，模板要能分开说，不能一律显示「暂无商品」
    o.goodsFailed = false;
  } else if (kind === 'rich_text') {
    // 「全屏显示」= 内容占满整宽，此时忽略页面边距（与有赞一致）
    o.marginRpx = o.full === '0' ? px2rpx(o.pageMargin) : 0;
    o.nodes = sanitizeRich(o.html);
  } else if (kind === 'search') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.hRpx = px2rpx(o.boxHeight || 36);
    o.round = o.shape === 'round';
    o.align = o.textAlign === 'center' ? 'center' : 'flex-start';
    o.placeholder = o.placeholder || '搜索店内商品';
  } else if (kind === 'elevator') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.dropdown = o.mode === 'dropdown';
    o.tagStyle = o.tagStyle || 'bg';
    o.activeIndex = o.activeIndex || 0;
    o.items = (o.items || [])
      .map((x) => ({ text: (x && x.text) || '', target: Number((x && x.target) || 0) || 0 }))
      .filter((x) => x.text);
  } else if (kind === 'enter_shop') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.justify = o.align === 'right' ? 'flex-end' : (o.align === 'left' ? 'flex-start' : 'center');
    o.round = o.radius !== 'square';
    o.text = o.text || '进入店铺';
  } else if (kind === 'audio') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.right = o.side === 'right';
    o.duration = Number(o.duration) || 6;
    // 气泡宽度随时长增长（与微信语音气泡一致的手感），上下限兜住极端值
    o.widthRpx = Math.max(220, Math.min(520, 160 + o.duration * 24));
  } else if (kind === 'service') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.justify = o.align === 'right' ? 'flex-end' : (o.align === 'left' ? 'flex-start' : 'center');
    o.round = o.radius !== 'square';
    o.text = o.text || '在线咨询';
  } else if (kind === 'content_card') {
    o.marginRpx = px2rpx(o.pageMargin);
    const ccols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / ccols * 100) / 100;
    o.cardClass = o.style === 'white' ? 'white' : (o.style === 'plain' ? 'plain' : 'shadow');
    o.round = o.radius !== 'square';
    // 图片容器用 padding-top 撑出固定比例：padding-top 的百分比按「宽度」算，
    // 所以 4:3 要写 133.33%（= 100 ÷ 0.75），不是 1.33%。保留两位小数。
    const ratio = Number(o.ratio) || 0.75;
    o.padTopPct = Math.round(10000 / ratio) / 100;
    o.items = (o.items || []).filter((x) => x && (x.image || x.title));
  } else if (kind === 'buy_bar') {
    o.padXRpx = px2rpx(o.padX);
    o.padBRpx = px2rpx(o.padB);
    o.btnHRpx = px2rpx(o.btnH);
    o.btnRRpx = px2rpx(o.btnR);
    o.fontRpx = px2rpx(o.fontSize || 16);
    o.bgHRpx = px2rpx(o.bgH || 76);
    o.alignRight = o.align === 'right';
    o.bgOn = o.bgOn !== false;
    o.btnBgFinal = o.theme === 'custom' ? (o.btnBg || BRAND) : BRAND;
    o.text = o.text || '立即下单';
  }

  o.__index = index;
  return o;
}

/** 批量转换（首页与自定义页共用） */
function normalizeBlocks(list) {
  return (list || []).map(normalizeBlock);
}

/**
 * 「语音」区块未单独设头像且开了「使用店铺 logo」时，回落到店铺头像。
 *
 * 店铺信息不在区块数据里（它是页面级字段），所以只能由页面 JS 在装配 data 时补，
 * 这里做成一个纯函数，首页与自定义页共用同一份规则。
 *
 * @param {Array} blocks 已 normalize 的区块数组
 * @param {string} shopAvatar 店铺头像地址（已过 resolveAssets）
 */
function applyShopAvatar(blocks, shopAvatar) {
  (blocks || []).forEach((b) => {
    if (b && b.type === 'audio' && !b.avatar && b.useShopLogo !== false) b.avatar = shopAvatar || '';
  });
  return blocks;
}

/** 商品卡片渲染字段（区块模板只认这四个键；goodsId 为空会导致点击无效） */
function toCard(g) {
  if (!g) return null;
  return {
    goodsId: g.goodsId || g.id || '',
    name: g.name || '',
    image: assetUrl(g.image || g.cover || (g.images && g.images[0]) || ''),
    priceText: g.priceText || ((Number(g.price) || 0) / 100).toFixed(2)
  };
}

/**
 * 「商品」区块需要实时数据（装修时存的是快照，价格库存会过期），统一拉一次后分发。
 *
 * 两个优化，都是为了「同一个商品被多处引用」时不重复打接口：
 *   - 指定商品模式：先把所有区块要的 ID **去重**，再按固定并发（SIMPLE_CONCURRENCY）
 *     逐个取详情，最后分发回各区块 —— 同一商品被两个区块引用只请求一次；
 *   - 默认列表模式：按 `limit` 分组，同一 limit 只请求一次。
 *
 * 失败**不再静默吞掉成空列表**：记一条日志（真机上翻 console 就能看出是「接口挂了」
 * 还是「确实没商品」），同时该区块的 goods 留空由模板显示占位文案。
 *
 * @param {Array} blocks 已 normalize 的区块数组
 * @returns {Promise<object|null>} 供 setData 的补丁，如 { 'blocks[0].goods': [...] }；没有商品区块时返回 null
 */
const GOODS_CONCURRENCY = 4;

/** 限并发执行（保持结果顺序） */
function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(() => (async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  })());
  return Promise.all(workers).then(() => out);
}

function loadGoodsData(blocks) {
  const idxs = [];
  (blocks || []).forEach((b, i) => { if (b.type === 'goods') idxs.push(i); });
  if (!idxs.length) return Promise.resolve(null);

  const idBlocks = [];
  const listGroups = {}; // limit → [区块下标]
  idxs.forEach((i) => {
    const b = blocks[i];
    if (b.mode === 'ids' && b.ids) {
      const ids = String(b.ids).split(/[,，\s]+/).filter(Boolean).slice(0, b.limit);
      idBlocks.push({ i, ids });
    } else {
      const key = String(b.limit);
      (listGroups[key] = listGroups[key] || []).push(i);
    }
  });

  // 所有区块要的指定商品 ID 去重
  const allIds = [];
  idBlocks.forEach((b) => b.ids.forEach((id) => { if (allIds.indexOf(id) < 0) allIds.push(id); }));

  const idJob = allIds.length
    ? mapLimit(allIds, GOODS_CONCURRENCY, (id) => goodsSvc.fetchDetail(id).catch((err) => {
      console.warn('[blocks] 指定商品加载失败 id=' + id, err && err.message);
      return null;
    })).then((list) => {
      const byId = {};
      let okCount = 0;
      list.forEach((g) => { if (g) { byId[g.goodsId || g.id] = g; okCount++; } });
      return { byId, okCount };
    })
    : Promise.resolve({ byId: {}, okCount: 0 });

  const listJob = mapLimit(Object.keys(listGroups), GOODS_CONCURRENCY, (limit) =>
    goodsSvc.fetchList({ page: 1, size: Number(limit) || 4 })
      .then((d) => ({ limit, list: (d && d.list) || [], failed: false }))
      .catch((err) => {
        console.warn('[blocks] 商品列表加载失败 limit=' + limit, err && err.message);
        return { limit, list: [], failed: true };
      })).then((rows) => {
    const byLimit = {};
    rows.forEach((r) => { byLimit[r.limit] = r; });
    return byLimit;
  });

  return Promise.all([idJob, listJob]).then(([idRes, byLimit]) => {
    const next = {};
    idBlocks.forEach((b) => {
      next['blocks[' + b.i + '].goods'] = b.ids.map((id) => toCard(idRes.byId[id])).filter(Boolean);
      // 一个都没取到才判为失败：部分商品被删除/下架属于正常，不该报「加载失败」
      next['blocks[' + b.i + '].goodsFailed'] = b.ids.length > 0 && idRes.okCount === 0;
    });
    idxs.forEach((i) => {
      if (idBlocks.some((b) => b.i === i)) return;
      const r = byLimit[String(blocks[i].limit)];
      next['blocks[' + i + '].goods'] = r ? r.list.map(toCard).filter(Boolean) : [];
      next['blocks[' + i + '].goodsFailed'] = !!(r && r.failed);
    });
    return next;
  });
}

module.exports = { normalizeBlock, normalizeBlocks, loadGoodsData, applyShopAvatar, sanitizeRich, SIZE_CLASS };
