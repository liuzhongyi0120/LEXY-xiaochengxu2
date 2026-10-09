/**
 * 商品域逻辑：分类树、列表筛选排序、详情、评价、后台商品管理
 *
 * 数据来源：`catalogStore`（server/data/catalog.json，运营可写）
 * 库存真源：`store.db.stocks[skuId]`（下单扣减 / 取消回滚都在那），
 *          本模块对外返回的 stock 一律用实时库存覆盖，避免「后台改了库存但前台没变」。
 */

const catalogStore = require('./catalogStore');
const db$ = require('./store');
const { BANNERS, DETAIL_BLOCKS } = require('./seed');
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

/** 把库存写入真源，并同步商品上的展示值
 *
 *  ownerId：只同步「属于这个商品」的 SKU 展示值。
 *  历史上这里是无条件全局同步 —— 一旦两个商品撞了同一个 skuId（见 saveGoods 的
 *  默认 SKU 生成逻辑），改 A 的库存会把 B 的展示值也改掉，而两者共用同一个库存键，
 *  等于两个商品的库存从此绑死。现在先按 owner 收窄，再由 saveGoods 保证标识唯一。
 */
function writeStock(skuId, stock, ownerId) {
  const database = db();
  database.stocks[skuId] = Math.max(0, toInt(stock));
  GOODS().forEach((g) => {
    if (ownerId && g.id !== ownerId) return;
    (g.skus || []).forEach((s) => { if (s.skuId === skuId) s.stock = database.stocks[skuId]; });
  });
  db$.commit();
  catalogStore.commit();
}

/* ------------------------- SKU 标识唯一性 ------------------------- */

/**
 * 跨商品扫描重复的 SKU 标识。
 *
 * 库存真源是 `db.stocks[skuId]`（全局键），所以一旦两个商品用了同一个 skuId，
 * 它们的库存就被绑成一份 —— 这是**静默的数据破坏**，用户不会看到任何报错。
 * 后台新建商品时若未显式给 SKU 标识，早前会用 `g-01` / `g-02` 兜底，
 * 而那时商品 ID 还没生成，于是第二件商品必然撞上第一件的标识。
 *
 * 返回 [{ skuId, goods: [{ goodsId, goodsName }] }]，供迁移前人工核对。
 */
function auditSkuConflicts() {
  const map = {};
  GOODS().forEach((g) => (g.skus || []).forEach((s) => {
    if (!s || !s.skuId) return;
    (map[s.skuId] = map[s.skuId] || []).push({ goodsId: g.id, goodsName: g.name });
  }));
  return Object.keys(map)
    .filter((k) => map[k].length > 1)
    .map((k) => ({ skuId: k, goods: map[k] }));
}

/** 生成不与现有商品冲突的商品 ID */
function nextGoodsId() {
  const list = GOODS();
  let id = genId('g');
  let guard = 0;
  while (list.some((g) => g.id === id) && guard++ < 1000) id = genId('g');
  return id;
}

/**
 * 规格标识的校验与生成。
 *
 * 规则（缺一不可）：
 *   1. 商品 ID 必须先确定，再据此生成 SKU 标识 —— 否则默认标识必然跨商品撞车；
 *   2. 同一商品内不得重复；
 *   3. 不得复用**其它商品**已有的 SKU 标识（否则两者共享同一份库存）。
 * 编辑商品时允许保留自己原有的 SKU 标识（改价格、改库存不能丢失身份）。
 */
function resolveSkus(goodsId, skusIn, list) {
  const seen = {};
  return skusIn.map((s, i) => {
    const price = toInt(s.price);
    if (price <= 0) throw new BizError(`第 ${i + 1} 个规格的价格必须大于 0`, ERR.PARAM);

    const given = s.skuId ? String(s.skuId).trim() : '';
    let skuId = given;

    if (skuId) {
      if (seen[skuId]) {
        throw new BizError(`第 ${i + 1} 个规格的标识与同商品内其他规格重复：${skuId}`, ERR.PARAM);
      }
      const owner = list.find((g) => g.id !== goodsId && (g.skus || []).some((x) => x.skuId === skuId));
      if (owner) {
        throw new BizError(
          `规格标识 ${skuId} 已被商品「${owner.name}」占用，不能复用（否则两个商品会共享同一份库存）`,
          ERR.PARAM
        );
      }
    } else {
      // 未指定 → 由服务端按「商品 ID + 序号」生成稳定唯一标识
      let n = i + 1;
      do {
        skuId = `${goodsId}-${String(n).padStart(2, '0')}`;
        n += 1;
      } while (seen[skuId] || list.some((g) => g.id !== goodsId && (g.skus || []).some((x) => x.skuId === skuId)));
    }

    seen[skuId] = true;
    return {
      skuId,
      specs: Array.isArray(s.specs) ? s.specs.map((x) => String(x)) : [],
      price,
      originalPrice: toInt(s.originalPrice) || price,
      stock: toInt(s.stock),
      image: s.image || ''
    };
  });
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

/**
 * 列表筛选（**只返回在售商品**）。
 *
 * ⚠️ 这里刻意不接受 status 参数。
 *    早前的写法是 `status ? g.status === status : g.status === 'on_sale'`，
 *    而 `/api/goods/list` 是**匿名接口**且把请求参数原样透传，
 *    于是任何人加一个 `?status=off_sale` 就能把下架商品全部拉出来 ——
 *    前端没有筛选按钮完全不算保护，参数是调用方直接构造的。
 *    下架商品的浏览需求属于后台，走 adminListGoods（有管理权限校验）。
 */
function filterGoods({ categoryId, keyword }) {
  let list = GOODS().filter((g) => g.status === 'on_sale');

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
  const p = params || {};
  // 只取筛选需要的字段：status 之类的参数在这里被**丢弃**，不是「忘了传」
  const filtered = filterGoods({ categoryId: p.categoryId, keyword: p.keyword });
  const result = paginate(sortGoods(filtered, p.sort), p.page, p.size);
  return Object.assign({}, result, {
    list: result.list.map((g) => toListItem(withLiveStock(g)))
  });
}

/**
 * 商品的图文详情块
 *
 * 优先用**商品自己的**数据（description 文字 + detailImages 图片），
 * 只有两者都没有时才回落到开发期占位内容 —— 否则运营从有赞搬来的真实商品，
 * 详情区会一直显示「本页为开发阶段演示内容」。
 */
function buildDetailBlocks(goods) {
  const blocks = [];
  const desc = String(goods.description || '').trim();
  if (desc) blocks.push({ type: 'text', content: desc });
  (goods.detailImages || []).forEach((url) => {
    if (url) blocks.push({ type: 'image', content: url });
  });
  return blocks.length ? blocks : DETAIL_BLOCKS;
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
    detailBlocks: buildDetailBlocks(goods),
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

/**
 * 评价数据源：`db.comments`（用户产生的业务数据，与商品库分库、持久化）
 *
 * 曾经这里读的是 `seed.js` 按**小程序端 mock 商品**凭空生成的演示评价。商品库接入真实商品后，
 * 后台评价管理里全是 `g1001`/`g1002`… 这些**商品库里早已不存在的商品**的评价（列表里商品名直接
 * 显示成商品 id，因为查不到）。评价是 UGC，必须和订单一样是持久化数据 —— 能清、能随商品一起删。
 */
function commentsOf(goodsId) {
  return (db().comments || []).filter((c) => !goodsId || c.goodsId === goodsId);
}

function commentList(goodsId, page, size) {
  const list = commentsOf(goodsId).slice().sort((a, b) => b.createdAt - a.createdAt);
  return paginate(list, page, size);
}

function comments(goodsId, page, size) {
  findGoods(goodsId); // 校验商品存在
  const list = commentsOf(goodsId).slice().sort((a, b) => b.createdAt - a.createdAt);
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

  const list = GOODS();

  /*
   * ⚠️ 顺序不能反：**先确定商品 ID，再据此生成 SKU 标识**。
   *    早前是先造 skus（用 `p.id || 'g'` 兜底 → 每件新商品的默认标识都是 g-01），
   *    之后才生成商品 ID —— 于是第二件商品必然复用第一件的 g-01，
   *    而库存又是以 skuId 为全局键，改一件商品的库存就把另一件也改了。
   *    resolveSkus 同时会拦住「同商品内重复」和「跨商品复用」。
   */
  const goodsId = isNew ? nextGoodsId() : String(p.id);

  const skusIn = Array.isArray(p.skus) && p.skus.length ? p.skus : [{
    specs: [], price: toInt(p.basePrice), originalPrice: toInt(p.basePrice), stock: 0
  }];
  const skus = resolveSkus(goodsId, skusIn, list);

  let goods;
  if (isNew) {
    goods = {
      id: goodsId,
      name,
      subtitle: String(p.subtitle || ''),
      categoryId: p.categoryId,
      tags: (p.tags || []).map((t) => String(t)).filter(Boolean).slice(0, 6),
      sales: toInt(p.sales),
      commentCount: toInt(p.commentCount),
      cover: p.cover || (p.images || [])[0] || '',
      images: (p.images || []).slice(0, 12),
      detailImages: (p.detailImages || []).slice(0, 20),
      description: String(p.description || ''),
      specs: (p.specs || []).slice(0, 4),
      skus,
      status: p.status === 'off_sale' ? 'off_sale' : 'on_sale',
      createdAt: now(),
      updatedAt: now()
    };
    list.unshift(goods);
  } else {
    goods = findAny(goodsId);
    // 编辑时被删掉的规格，其库存键要一并清掉，避免 db.stocks 里长期堆积幽灵键
    const kept = {};
    skus.forEach((s) => { kept[s.skuId] = true; });
    (goods.skus || []).forEach((s) => { if (!kept[s.skuId]) delete db().stocks[s.skuId]; });

    Object.assign(goods, {
      name,
      subtitle: String(p.subtitle || ''),
      categoryId: p.categoryId,
      tags: (p.tags || []).map((t) => String(t)).filter(Boolean).slice(0, 6),
      cover: p.cover || goods.cover,
      images: (p.images || []).slice(0, 12),
      detailImages: (p.detailImages || []).slice(0, 20),
      description: String(p.description || ''),
      specs: (p.specs || []).slice(0, 4),
      skus,
      status: p.status === 'off_sale' ? 'off_sale' : 'on_sale',
      updatedAt: now()
    });
  }

  skus.forEach((s) => writeStock(s.skuId, s.stock, goods.id));
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

/**
 * 批量改销量（value 或 delta 二选一）—— 与 setStock 对称。
 *
 * 为什么需要它：销量只在「支付成功」时由 bumpSales 累加，**没有任何回滚路径**。
 * 自检每跑一轮都会走一次真实支付，把在售首件的 sales 永久 +N；
 * 库存有「净影响归零」兜底、销量却没有 → 每跑一次就悄悄污染一次数据。
 * 有了这个入口，自检可在收尾把销量补回，运营也能修正被刷高的展示数字。
 * 注意销量是**商品级**（不是 SKU 级），所以按 goodsId 定位。
 */
function setSales({ items, mode }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) throw new BizError('请提供要修改的销量', ERR.PARAM);
  const result = [];
  list.forEach((it) => {
    const g = findAny(it.goodsId);
    if (!g) return;
    const next = mode === 'delta' ? toInt(g.sales) + toInt(it.value) : toInt(it.value);
    g.sales = Math.max(0, next);
    g.updatedAt = now();
    result.push({ goodsId: g.id, sales: g.sales });
  });
  catalogStore.commit();
  if (!result.length) throw new BizError('商品不存在', ERR.NOT_FOUND, 404);
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
  // 顺带清理购物车 / 收藏 / 浏览记录 / 评价中的残留引用（否则会留下「幽灵评价」）
  Object.keys(db().carts).forEach((uid) => {
    db().carts[uid] = (db().carts[uid] || []).filter((it) => it.goodsId !== id);
  });
  Object.keys(db().favorites).forEach((uid) => {
    db().favorites[uid] = (db().favorites[uid] || []).filter((gid) => gid !== id);
  });
  Object.keys(db().footprints).forEach((uid) => {
    db().footprints[uid] = (db().footprints[uid] || []).filter((it) => it.goodsId !== id);
  });
  const gone = (db().comments || []).filter((c) => c.goodsId === id).map((c) => c.commentId);
  if (gone.length) {
    db().comments = db().comments.filter((c) => c.goodsId !== id);
    gone.forEach((cid) => { delete (db().commentReplies || {})[cid]; });
  }
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

/**
 * 删除分类。
 *
 * ⚠️ 删除父分类会**连它的全部子分类一起去掉**（下面那个 splice），
 *    所以关联检查必须覆盖整个范围。
 *    早前只检查 `g.categoryId === id`（即父分类自身），子分类下的商品完全没查 ——
 *    实测：父分类下 2 个子分类各挂 1 件商品时，删除照样成功，
 *    结果是分类树空了、商品却还引用着已经不存在的子分类（幽灵分类）。
 */
function deleteCategory(id) {
  const list = CATEGORIES();

  const parent = list.find((c) => c.id === id);
  let node = parent;
  let parentOf = null;
  if (!node) {
    list.some((c) => (c.children || []).some((x) => {
      if (x.id !== id) return false;
      node = x;
      parentOf = c;
      return true;
    }));
  }
  if (!node) throw new BizError('分类不存在', ERR.NOT_FOUND, 404);

  // 删除范围 = 该分类自身 + 其全部子分类
  const children = node.children || [];
  const scope = [node.id].concat(children.map((c) => c.id));

  const used = GOODS().filter((g) => scope.indexOf(g.categoryId) > -1);
  if (used.length) {
    const hitChildren = children.filter((c) => used.some((g) => g.categoryId === c.id));
    const where = hitChildren.length
      ? `（其中 ${hitChildren.length} 个在子分类：${hitChildren.map((c) => c.name).join('、')}）`
      : '';
    throw new BizError(
      `不能删除：该分类及其子分类下还有 ${used.length} 个商品${where}，请先移出或删除商品`,
      ERR.BIZ
    );
  }

  if (parentOf) {
    parentOf.children = (parentOf.children || []).filter((x) => x.id !== id);
  } else {
    list.splice(list.indexOf(node), 1);
  }
  catalogStore.commit();
  return { deleted: true, id, removedChildren: children.length };
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

/**
 * 由装修台（replica.SHOP）维护、**不接受**「店铺设置」覆盖的字段。
 *
 * 背景：控制台原本把店铺名称 / Logo 存进 catalog.settings，并在界面上写「用于『我的』页与分享卡片」，
 * 但相关页面读的是 replica.SHOP.name / replica.SHOP.avatar —— 两个数据源，后台提示成功、
 * 前端永远是旧值。这类「假成功」比报错更难查，所以直接拒绝而不是静默忽略。
 */
const SETTINGS_OWNED_BY_DECORATE = ['shopName', 'logo'];
const SETTINGS_LABEL = { shopName: '店铺名称', logo: '店铺 Logo' };

function settings() {
  return clone(cat().settings);
}

function saveSettings(patch) {
  const p = clone(patch || {});

  const taken = SETTINGS_OWNED_BY_DECORATE.filter((k) => p[k] !== undefined);
  if (taken.length) {
    throw new BizError(
      `${taken.map((k) => '「' + (SETTINGS_LABEL[k] || k) + '」').join('')}` +
      '由装修台的「店铺信息」维护（唯一数据源是 replica.SHOP），本页不接受修改。' +
      '请到装修台「店铺信息」修改并「生成代码」后，再上传发布小程序新版本。',
      ERR.PARAM
    );
  }

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
  commentsOf,
  comments,
  commentList,
  home,
  bumpSales,
  // —— 后台管理 ——
  withLiveStock,
  skuStock,
  auditSkuConflicts,
  adminListGoods,
  adminGoodsDetail,
  saveGoods,
  setGoodsStatus,
  setStock,
  setSales,
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
