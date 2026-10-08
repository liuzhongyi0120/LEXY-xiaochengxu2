/**
 * mock 服务：在没有后端的情况下驱动全部页面
 *
 * 接口路径、入参、返回结构与《技术方案》第六章的接口契约完全一致，
 * 接入真实后端时只需把 utils/constants.js 的 ENV 改为 dev / prod，
 * 页面代码无需任何改动。
 */
const { CATEGORIES, BANNERS, GOODS, DETAIL_BLOCKS } = require('./data');
const { STORAGE } = require('../utils/constants');

/** 模拟网络延迟（毫秒），让 loading 态可见 */
const DELAY = 260;

function ok(data, delay = DELAY) {
  return new Promise((resolve) => setTimeout(() => resolve(data), delay));
}

function fail(msg) {
  return new Promise((resolve, reject) => setTimeout(() => reject(new Error(msg)), DELAY));
}

/* ------------------------- 购物车本地存储 ------------------------- */

function readCart() {
  return wx.getStorageSync(STORAGE.LOCAL_CART) || [];
}

function writeCart(items) {
  wx.setStorageSync(STORAGE.LOCAL_CART, items);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const app = getApp();
  if (app && typeof app.updateCartBadge === 'function') {
    app.updateCartBadge(count);
  }
  return count;
}

/* ------------------------- 工具函数 ------------------------- */

function paginate(list, page, size) {
  const current = Number(page) || 1;
  const pageSize = Number(size) || 10;
  const start = (current - 1) * pageSize;
  return {
    total: list.length,
    list: list.slice(start, start + pageSize),
    hasMore: start + pageSize < list.length,
    page: current
  };
}

/** 列表场景只返回摘要字段，详情接口才返回 SKU 全量，减少传输体积 */
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

/** 收集某个分类（含其所有二级分类）的 ID 集合 */
function expandCategoryIds(categoryId) {
  const top = CATEGORIES.find((c) => c.id === categoryId);
  if (top) {
    return [top.id].concat(top.children.map((child) => child.id));
  }
  return [categoryId];
}

function filterGoods(params) {
  const { categoryId, keyword, sort } = params || {};
  let list = GOODS.filter((g) => g.status === 'on_sale');

  if (categoryId) {
    const ids = expandCategoryIds(categoryId);
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

/* ------------------------- 路由分发 ------------------------- */

function handle(url, method, data) {
  const m = (method || 'GET').toUpperCase();
  const path = url.split('?')[0];
  const params = data || {};

  /* ---------- 鉴权 ---------- */
  if (path === '/api/auth/login' && m === 'POST') {
    if (!params.code) return fail('缺少登录凭证 code');
    return ok({
      token: 'mock_token_' + Date.now(),
      userId: 'u_10086',
      isNew: false
    });
  }

  if (path === '/api/user/profile' && m === 'GET') {
    return ok({ userId: 'u_10086', nickname: '微信用户', phone: '', avatar: '' });
  }

  /* ---------- 首页 ---------- */
  if (path === '/api/home' && m === 'GET') {
    return ok({
      banners: BANNERS,
      categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
      recommends: GOODS.filter((g) => g.tags.length > 0).slice(0, 6).map(toListItem)
    });
  }

  /* ---------- 商品 ---------- */
  if (path === '/api/goods/categories' && m === 'GET') {
    return ok(CATEGORIES);
  }

  if (path === '/api/goods/list' && m === 'GET') {
    const result = paginate(filterGoods(params), params.page, params.size);
    return ok(Object.assign({}, result, { list: result.list.map(toListItem) }));
  }

  if (path === '/api/goods/detail' && m === 'GET') {
    const goods = GOODS.find((g) => g.id === params.id);
    if (!goods) return fail('商品不存在或已下架');
    return ok(
      Object.assign({}, goods, {
        detailBlocks: DETAIL_BLOCKS,
        recommends: GOODS.filter((g) => g.id !== goods.id && g.categoryId === goods.categoryId)
          .concat(GOODS.filter((g) => g.categoryId !== goods.categoryId))
          .slice(0, 4)
          .map(toListItem)
      })
    );
  }

  /* ---------- 购物车 ---------- */
  if (path === '/api/cart/list' && m === 'GET') {
    const items = readCart();
    return ok({
      items,
      totalCount: items.reduce((sum, item) => sum + item.quantity, 0)
    });
  }

  if (path === '/api/cart/add' && m === 'POST') {
    const { goodsId, skuId, quantity = 1 } = params;
    const goods = GOODS.find((g) => g.id === goodsId);
    if (!goods) return fail('商品不存在');
    const sku = goods.skus.find((s) => s.skuId === skuId);
    if (!sku) return fail('请选择商品规格');
    if (sku.stock < quantity) return fail('库存不足');

    const items = readCart();
    const exist = items.find((item) => item.skuId === skuId);
    if (exist) {
      exist.quantity = Math.min(exist.quantity + quantity, sku.stock);
    } else {
      items.push({
        cartItemId: `${skuId}_${Date.now()}`,
        goodsId: goods.id,
        skuId: sku.skuId,
        name: goods.name,
        specText: sku.specs.join(' / '),
        image: goods.cover,
        price: sku.price,
        quantity,
        stock: sku.stock,
        selected: true
      });
    }
    const count = writeCart(items);
    return ok({ totalCount: count });
  }

  if (path === '/api/cart/update' && m === 'PUT') {
    const { cartItemId, quantity, selected } = params;
    const items = readCart();
    const item = items.find((i) => i.cartItemId === cartItemId);
    if (!item) return fail('购物车项不存在');

    if (typeof quantity === 'number') {
      item.quantity = Math.max(1, Math.min(quantity, item.stock));
    }
    if (typeof selected === 'boolean') {
      item.selected = selected;
    }
    const count = writeCart(items);
    return ok({ totalCount: count });
  }

  if (path === '/api/cart/remove' && m === 'DELETE') {
    const ids = params.cartItemIds || [];
    const items = readCart().filter((item) => ids.indexOf(item.cartItemId) === -1);
    const count = writeCart(items);
    return ok({ totalCount: count });
  }

  return fail(`mock 未实现的接口：${m} ${path}`);
}

module.exports = { handle };
