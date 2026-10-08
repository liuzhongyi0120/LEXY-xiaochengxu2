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

const { resolveAssets } = require('./asset');
const { px2rpx, heightRpx } = require('./units');
const goodsSvc = require('../services/goods');

const SIZE_CLASS = { sm: 's-sm', md: 's-md', lg: 's-lg' };

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
  }

  o.__index = index;
  return o;
}

/** 批量转换（首页与自定义页共用） */
function normalizeBlocks(list) {
  return (list || []).map(normalizeBlock);
}

/**
 * 「商品」区块需要实时数据（装修时存的是快照，价格库存会过期），统一拉一次后分发。
 *
 * @param {Array} blocks 已 normalize 的区块数组
 * @returns {Promise<object|null>} 供 setData 的补丁，如 { 'blocks[0].goods': [...] }；没有商品区块时返回 null
 */
function loadGoodsData(blocks) {
  const idxs = [];
  (blocks || []).forEach((b, i) => { if (b.type === 'goods') idxs.push(i); });
  if (!idxs.length) return Promise.resolve(null);

  const jobs = idxs.map((i) => {
    const b = blocks[i];
    const p = { page: 1, size: b.limit };
    if (b.mode === 'ids' && b.ids) {
      // 指定商品：逐个取详情（商品量少，这里串行合并）
      const ids = String(b.ids).split(/[,，\s]+/).filter(Boolean).slice(0, b.limit);
      return Promise.all(ids.map((id) => goodsSvc.fetchDetail(id).catch(() => null)))
        .then((list) => (list || []).filter(Boolean))
        .then((list) => ({ i, list }));
    }
    return goodsSvc.fetchList(p).then((d) => ({ i, list: (d && d.list) || [] })).catch(() => ({ i, list: [] }));
  });

  return Promise.all(jobs).then((results) => {
    const next = {};
    results.forEach((r) => {
      next['blocks[' + r.i + '].goods'] = (r.list || []).map((g) => ({
        goodsId: g.goodsId,
        name: g.name,
        image: g.image || (g.images && g.images[0]) || '',
        priceText: g.priceText || ((g.price || 0) / 100).toFixed(2)
      }));
    });
    return next;
  });
}

module.exports = { normalizeBlock, normalizeBlocks, loadGoodsData, SIZE_CLASS };
