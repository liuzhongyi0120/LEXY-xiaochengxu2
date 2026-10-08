/**
 * 商品域逻辑：分类树、列表筛选排序、详情、评价、后台商品管理
 *
 * 数据来源：`catalogStore`（server/data/catalog.json，运营可写）
 * 库存真源：`store.db.stocks[skuId]`（下单扣减 / 取消回滚都在那），
 *          本模块对外返回的 stock 一律用实时库存覆盖，避免「后台改了库存但前台没变」。
 */

const catalogStore = require('./catalogStore');
const db$ = require('./store');
const { BANNERS, DETAIL_BLOCKS, COMMENTS } = require('./seed');
const { paginate, expandCategoryIds, toInt, clone, genId, now } = require('./util');
const { BizError, ERR } = require('./http');

const LOW_STOCK = 10; // 库存预警阈值（≤ 该值在前端标红）

const db = () => db$.get();
const cat = () => catalogStore.get();
const CATEGORIES = () => cat().categories;
const GOODS = () => cat().goods;

/** 列表场景只返回摘要字段，减少传输体积 */
function toListItem(goods) {
  return {
    id: goods.id,
    name: goods.name,
    subtitle: goods.subtitle,
    cover: goods.cover,
    price: goods.price,
    priceMax: goods.priceMax,
    originalPrice: goods.originalPrice,
    sales: goods.sales,
    tags: goods.tags,
    stock: goods.stock
  };
}

/* ------------------------------- 库存 ------------------------------- */

/** 某 SKU 的实时库存（db.stocks 为准，缺失时回落商品自带值） */
function skuStock(sku) {
  const v = db().stocks[sku.skuId];
  return v === undefined ? toInt(sku.stock) : toInt(v);
}

/** 用实时库存覆盖商品与 SKU 的 stock（读取路径统一调用） */
function withLiveStock(goods) {
  if (!goods) return goods;
  const skus = (goods.skus || []).map((s) => Object.assign({}, s, { stock: skuStock(s) }));
  const stock = skus.reduce((sum, s) => sum + s.stock, 0);
  return Object.assign({}, goods, { skus, stock, lowStock: stock <= LOW_STOCK });
}

/** 把库存写入真源，并同步商品上的展示值 */
function writeStock(skuId, stock) {
  const database = db();
  database.stocks[skuId] = Math.max(0, toInt(stock));
  GOODS().forEach((g) => {
    (g.skus || []).forEach((s) => { if (s.skuId === skuId) s.stock = database.stocks[skuId]; });
  });
  db$.commit();
  catalogStore.commit();
}

/* ------------------------------ 分类 ------------------------------ */

function categories() {
  return CATEGORIES();
}

function categoriesBrief() {
  return CATEGORIES().map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
}

/** 找商品，未上架视为不存在（小程序端） */
function findGoods(id) {
  const goods = GOODS().find((g) => g.id === id);
  if (!goods || goods.status !== 'on_sale') {
    throw new BizError('商品不存在或已下架', ERR.NOT_FOUND, 404);
  }
  return goods;
}

/** 后台侧查找：无视上架状态 */
function findAny(id) {
  const goods = GOODS().find((g) => g.id === id);
  if (!goods) throw new BizError('商品不存在', ERR.NOT_FOUND, 404);
  return goods;
}

function findSku(goods, skuId) {
  const sku = (goods.skus || []).find((s) => s.skuId === skuId);
  if (!sku) throw new BizError('请选择商品规格', ERR.PARAM);
  return sku;
}

/* ------------------------------ 列表 ------------------------------ */

/** 列表筛选 + 排序（小程序侧：仅上架） */
function filterGoods({ categoryId, keyword, sort, status }) {
  let list = GOODS().filter((g) => (status ? g.status === status : g.status === 'on_sale'));

  if (categoryId) {
    const ids = expandCategoryIds(CATEGORIES(), categoryId);
    list = list.filter((g) => ids.indexOf(g.categoryId) > -1);
  }

  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter(
      (g) =>
        g.name.toLowerCase().indexOf(kw) > -1 ||
        String(g.subtitle || '').toLowerCase().indexOf(kw) > -1
    );
  }
  return list;
}

function sortGoods(list, sort) {
  const sorted = list.slice();
  switch (sort) {
    case 'sales':
      sorted.sort((a, b) => b.sales - a.sales);
      break;
    case 'price_asc':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'price_desc':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'new':
      sorted.reverse();
      break;
    default:
      // 综合排序：热销标签优先
      sorted.sort((a, b) => (b.tags.length ? 1 : 0) - (a.tags.length ? 1 : 0));
      break;
  }
  return sorted;
}

function listGoods(params) {
  const result = paginate(sortGoods(filterGoods(params), params.sort), params.page, params.size);
  return Object.assign({}, result, {
    list: result.list.map((g) => toListItem(withLiveStock(g)))
  });
}

/** 详情：商品 + SKU 矩阵 + 图文详情 + 同分类推荐 */
function detail(id) {
  const goods = withLiveStock(findGoods(id));
  const all = GOODS();
  const sameCat = all.filter(
    (g) => g.id !== goods.id && g.categoryId === goods.categoryId && g.status === 'on_sale'
  );
  const others = all.filter(
    (g) => g.id !== goods.id && g.categoryId !== goods.categoryId && g.status === 'on_sale'
  );
  return Object.assign({}, goods, {
    detailBlocks: DETAIL_BLOCKS,
    recommends: sameCat.concat(others).slice(0, 4).map((g) => toListItem(withLiveStock(g)))
  });
}

/** 首页聚合 */
function home() {
  return {
    banners: BANNERS,
    categories: categoriesBrief(),
    recommends: GOODS().filter((g) => g.status === 'on_sale' && g.tags.length > 0)
      .slice(0, 6)
      .map((g) => toListItem(withLiveStock(g)))
  };
}

/* ------------------------------ 评价 ------------------------------ */

function commentList(goodsId, page, size) {
  const list = (COMMENTS[goodsId] || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  return paginate(list, page, size);
}

function comments(goodsId, page, size) {
  findGoods(goodsId); // 校验商品存在
  const list = (COMMENTS[goodsId] || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const result = paginate(list, page, size);
  const scoreAvg = list.length
    ? Number((list.reduce((s, c) => s + c.score, 0) / list.length).toFixed(1))
    : 5;
  return Object.assign({}, result, {
    scoreAvg,
    goodRate: list.length
      ? Math.round((list.filter((c) => c.score >= 4).length / list.length) * 100)
      : 100
  });
}

/* ============================ 后台管理 ============================ */

/** 价格与统计字段派生（与 mock/data.js 的口径保持一致） */
function derive(goods) {
  const prices = (goods.skus || []).map((s) => toInt(s.price));
  const originals = (goods.skus || []).map((s) => toInt(s.originalPrice) || toInt(s.price));
  goods.price = prices.length ? Math.min.apply(null, prices) : toInt(goods.basePrice);
  goods.priceMax = prices.length ? Math.max.apply(null, prices) : goods.price;
  goods.originalPrice = originals.length ? Math.max.apply(null, originals) : goods.price;
  goods.basePrice = goods.price;
  goods.stock = (goods.skus || []).reduce((sum, s) => sum + skuStock(s), 0);
  if (!Array.isArray(goods.tags)) goods.tags = [];
  if (!Array.isArray(goods.images)) goods.images = [];
  if (!goods.cover && goods.images.length) goods.cover = goods.images[0];
  return goods;
}

/** 后台商品列表：含下架商品，支持状态/分类/关键词/库存预警筛选 */
function adminListGoods({ keyword, categoryId, status, sort, lowStock, page, size }) {
  let list = GOODS().slice();

  if (status) list = list.filter((g) => g.status === status);
  if (categoryId) {
    const ids = expandCategoryIds(CATEGORIES(), categoryId);
    list = list.filter((g) => ids.indexOf(g.categoryId) > -1);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((g) =>
      g.name.toLowerCase().indexOf(kw) > -1 ||
      String(g.id).toLowerCase().indexOf(kw) > -1 ||
      String(g.subtitle || '').toLowerCase().indexOf(kw) > -1);
  }
  if (lowStock === '1' || lowStock === true) list = list.filter((g) => g.stock <= LOW_STOCK);

  const sorted = sortGoods(list, sort || 'newest_admin');
  if (sort === 'stock_asc') sorted.sort((a, b) => a.stock - b.stock);
  return paginate(sorted.map(withLiveStock), page, size);
}

function adminGoodsDetail(id) {
  return withLiveStock(clone(findAny(id)));
}

/** 新建 / 编辑商品 */
function saveGoods(payload) {
  const p = clone(payload || {});
  const isNew = !p.id;
  const name = String(p.name || '').trim();
  if (!name) throw new BizError('请填写商品名称', ERR.PARAM);
  if (!p.categoryId) throw new BizError('请选择商品分类', ERR.PARAM);
  const catIds = CATEGORIES().reduce((acc, c) => acc.concat([c.id], (c.children || []).map((x) => x.id)), []);
  if (catIds.indexOf(p.categoryId) < 0) throw new BizError('分类不存在', ERR.PARAM);

  const skusIn = Array.isArray(p.skus) && p.skus.length ? p.skus : [{
    specs: [], price: toInt(p.basePrice), originalPrice: toInt(p.basePrice), stock: 0
  }];

  const skus = skusIn.map((s, i) => {
    const price = toInt(s.price);
    if (price <= 0) throw new BizError(`第 ${i + 1} 个规格的价格必须大于 0`, ERR.PARAM);
    const skuId = s.skuId || `${p.id || 'g'}-${String(i + 1).padStart(2, '0')}`;
    return {
      skuId,
      specs: Array.isArray(s.specs) ? s.specs.map((x) => String(x)) : [],
      price,
      originalPrice: toInt(s.originalPrice) || price,
      stock: toInt(s.stock),
      image: s.image || ''
    };
  });

  const list = GOODS();
  let goods;
  if (isNew) {
    goods = {
      id: 'g' + String(1000 + list.length + 1) + String(now()).slice(-3),
      name,
      subtitle: String(p.subtitle || ''),
      categoryId: p.categoryId,
      tags: (p.tags || []).map((t) => String(t)).filter(Boolean).slice(0, 6),
      sales: toInt(p.sales),
      commentCount: toInt(p.commentCount),
      cover: p.cover || (p.images || [])[0] || '',
      images: (p.images || []).slice(0, 12),
      description: String(p.description || ''),
      specs: (p.specs || []).slice(0, 4),
      skus,
      status: p.status === 'off_sale' ? 'off_sale' : 'on_sale',
      createdAt: now(),
      updatedAt: now()
    };
    list.unshift(goods);
  } else {
    goods = findAny(p.id);
    Object.assign(goods, {
      name,
      subtitle: String(p.subtitle || ''),
      categoryId: p.categoryId,
      tags: (p.tags || []).map((t) => String(t)).filter(Boolean).slice(0, 6),
      cover: p.cover || goods.cover,
      images: (p.images || []).slice(0, 12),
      description: String(p.description || ''),
      specs: (p.specs || []).slice(0, 4),
      skus,
      status: p.status === 'off_sale' ? 'off_sale' : 'on_sale',
      updatedAt: now()
    });
  }

  skus.forEach((s) => writeStock(s.skuId, s.stock));
  derive(goods);
  catalogStore.commit();
  return { id: goods.id, isNew, goods: withLiveStock(clone(goods)) };
}

/** 批量上下架 */
function setGoodsStatus(ids, status) {
  const want = status === 'on_sale' ? 'on_sale' : 'off_sale';
  const arr = Array.isArray(ids) ? ids : [ids];
  if (!arr.length) throw new BizError('请选择商品', ERR.PARAM);
  const changed = [];
  arr.forEach((id) => {
    const g = GOODS().find((x) => x.id === id);
    if (!g) return;
    g.status = want;
    g.updatedAt = now();
    changed.push(id);
  });
  if (!changed.length) throw new BizError('商品不存在', ERR.NOT_FOUND, 404);
  catalogStore.commit();
  return { changed, status: want };
}

/** 批量改库存（value 或 delta 二选一） */
function setStock({ items, mode }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) throw new BizError('请提供要修改的库存', ERR.PARAM);
  const result = [];
  list.forEach((it) => {
    let found = null;
    GOODS().forEach((g) => (g.skus || []).forEach((s) => { if (s.skuId === it.skuId) found = { g, s }; }));
    if (!found) return;
    const cur = skuStock(found.s);
    const next = mode === 'delta' ? cur + toInt(it.value) : toInt(it.value);
    writeStock(it.skuId, next);
    result.push({ skuId: it.skuId, stock: Math.max(0, toInt(next)) });
  });
  GOODS().forEach((g) => derive(g));
  catalogStore.commit();
  if (!result.length) throw new BizError('SKU 不存在', ERR.NOT_FOUND, 404);
  return { changed: result };
}

/** 删除商品（被订单引用则拒绝） */
function deleteGoods(id) {
  const goods = findAny(id);
  const ref = db().orders.filter((o) => (o.items || []).some((it) => it.goodsId === id));
  if (ref.length) {
    throw new BizError(`该商品有 ${ref.length} 笔订单记录，不能删除；如需停售请改为「下架」`, ERR.BIZ);
  }
  const list = GOODS();
  list.splice(list.indexOf(goods), 1);
  (goods.skus || []).forEach((s) => { delete db().stocks[s.skuId]; });
  // 顺带清理购物车 / 收藏 / 浏览记录中的残留引用
  Object.keys(db().carts).forEach((uid) => {
    db().carts[uid] = (db().carts[uid] || []).filter((it) => it.goodsId !== id);
  });
  Object.keys(db().favorites).forEach((uid) => {
    db().favorites[uid] = (db().favorites[uid] || []).filter((gid) => gid !== id);
  });
  Object.keys(db().footprints).forEach((uid) => {
    db().footprints[uid] = (db().footprints[uid] || []).filter((it) => it.goodsId !== id);
  });
  db$.commit();
  catalogStore.commit();
  return { deleted: true, id };
}

/* ---------------------------- 分类管理 ---------------------------- */

function saveCategory(payload) {
  const p = clone(payload || {});
  const name = String(p.name || '').trim();
  if (!name) throw new BizError('请填写分类名称', ERR.PARAM);
  const list = CATEGORIES();
  if (p.id) {
    let target = list.find((c) => c.id === p.id);
    if (!target) list.forEach((c) => (c.children || []).forEach((x) => { if (x.id === p.id) target = x; }));
    if (!target) throw new BizError('分类不存在', ERR.NOT_FOUND, 404);
    target.name = name;
    if (p.icon !== undefined) target.icon = p.icon;
    catalogStore.commit();
    return { id: target.id, isNew: false };
  }
  const parentId = p.parentId || '';
  const id = 'c' + String(now()).slice(-6);
  const node = { id, name, icon: p.icon || '' };
  if (parentId) {
    const parent = list.find((c) => c.id === parentId);
    if (!parent) throw new BizError('上级分类不存在', ERR.PARAM);
    parent.children = parent.children || [];
    parent.children.push(node);
  } else {
    list.push(Object.assign({ children: [] }, node));
  }
  catalogStore.commit();
  return { id, isNew: true };
}

function deleteCategory(id) {
  const list = CATEGORIES();
  const used = GOODS().filter((g) => g.categoryId === id);
  if (used.length) throw new BizError(`该分类下还有 ${used.length} 个商品，请先移出`, ERR.BIZ);
  let removed = false;
  list.forEach((c) => {
    if (c.id === id) removed = true;
    c.children = (c.children || []).filter((x) => {
      if (x.id === id) { removed = true; return false; }
      return true;
    });
  });
  if (!removed) throw new BizError('分类不存在', ERR.NOT_FOUND, 404);
  // 连子分类一起去掉
  const idx = list.findIndex((c) => c.id === id);
  if (idx > -1) list.splice(idx, 1);
  catalogStore.commit();
  return { deleted: true, id };
}

/* ---------------------------- 券模板 ---------------------------- */

function couponTemplates() {
  return cat().couponTemplates;
}

/** 券模板 + 领取/核销统计 */
function adminCouponList() {
  const database = db();
  const stat = {};
  Object.keys(database.coupons).forEach((uid) => {
    (database.coupons[uid] || []).forEach((c) => {
      const s = stat[c.templateId] || (stat[c.templateId] = { received: 0, used: 0 });
      s.received += 1;
      if (c.status === 'used') s.used += 1;
    });
  });
  return couponTemplates().map((t) => Object.assign({}, t, {
    status: t.status || 'active',
    stat: stat[t.templateId] || { received: 0, used: 0 }
  }));
}

function saveCouponTemplate(payload) {
  const p = clone(payload || {});
  const list = cat().couponTemplates;
  const name = String(p.name || '').trim();
  if (!name) throw new BizError('请填写券名称', ERR.PARAM);
  const type = p.type === 'percent' ? 'percent' : 'discount';
  const value = toInt(p.value);
  if (value <= 0) throw new BizError('优惠额度必须大于 0', ERR.PARAM);
  if (type === 'percent' && (value < 50 || value > 99)) throw new BizError('折扣券请填 50~99（如 95 表示 95 折）', ERR.PARAM);
  const fields = {
    name,
    type,
    threshold: toInt(p.threshold),
    value,
    scope: String(p.scope || '全场通用'),
    categoryId: p.categoryId || '',
    days: toInt(p.days) || 30,
    status: p.status === 'paused' ? 'paused' : 'active'
  };
  if (p.templateId) {
    const t = list.find((x) => x.templateId === p.templateId);
    if (!t) throw new BizError('优惠券不存在', ERR.NOT_FOUND, 404);
    Object.assign(t, fields);
    catalogStore.commit();
    return { templateId: t.templateId, isNew: false };
  }
  const templateId = genId('ct');
  list.unshift(Object.assign({ templateId }, fields));
  catalogStore.commit();
  return { templateId, isNew: true };
}

function setCouponTemplateStatus(templateId, status) {
  const t = couponTemplates().find((x) => x.templateId === templateId);
  if (!t) throw new BizError('优惠券不存在', ERR.NOT_FOUND, 404);
  t.status = status === 'paused' ? 'paused' : 'active';
  catalogStore.commit();
  return { templateId, status: t.status };
}

/** 删除券模板（已被用户领取过则拒绝，避免历史券失去定义） */
function deleteCouponTemplate(templateId) {
  const list = couponTemplates();
  const idx = list.findIndex((x) => x.templateId === templateId);
  if (idx < 0) throw new BizError('优惠券不存在', ERR.NOT_FOUND, 404);
  const dbData = db();
  let used = 0;
  Object.keys(dbData.coupons).forEach((uid) => {
    used += (dbData.coupons[uid] || []).filter((c) => c.templateId === templateId).length;
  });
  if (used) {
    throw new BizError(`该券已有 ${used} 张被领取，不能删除；如需停发请改为「暂停」`, ERR.BIZ);
  }
  list.splice(idx, 1);
  catalogStore.commit();
  return { deleted: true, templateId };
}

/** 可领取的券（小程序端领券列表用） */
function activeCouponTemplates() {
  return couponTemplates().filter((t) => (t.status || 'active') === 'active');
}

/* ---------------------------- 店铺设置 ---------------------------- */

function settings() {
  return clone(cat().settings);
}

function saveSettings(patch) {
  const p = clone(patch || {});
  const s = cat().settings;
  Object.keys(catalogStore.DEFAULT_SETTINGS).forEach((k) => {
    if (p[k] === undefined) return;
    s[k] = typeof catalogStore.DEFAULT_SETTINGS[k] === 'number' ? toInt(p[k]) : String(p[k]);
  });
  catalogStore.commit();
  return clone(s);
}

/**
 * 累加销量（支付成功后调用）
 * 注意：销量与库存一样，落在 catalog.json / db.json 里，重启不丢。
 */
function bumpSales(goodsId, qty) {
  const goods = GOODS().find((g) => g.id === goodsId);
  if (goods) {
    goods.sales += toInt(qty);
    catalogStore.commit();
  }
}

module.exports = {
  LOW_STOCK,
  toListItem,
  categories,
  categoriesBrief,
  findGoods,
  findAny,
  findSku,
  listGoods,
  detail,
  comments,
  commentList,
  home,
  bumpSales,
  // —— 后台管理 ——
  withLiveStock,
  skuStock,
  adminListGoods,
  adminGoodsDetail,
  saveGoods,
  setGoodsStatus,
  setStock,
  deleteGoods,
  saveCategory,
  deleteCategory,
  adminCouponList,
  couponTemplates,
  activeCouponTemplates,
  saveCouponTemplate,
  setCouponTemplateStatus,
  deleteCouponTemplate,
  settings,
  saveSettings
};
