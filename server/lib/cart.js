/**
 * 购物车域逻辑（服务端购物车，跨设备同步）
 */

const { genId, now } = require('./util');
const { BizError, ERR } = require('./http');
const catalog = require('./catalog');

/** 读取某 sku 的实时库存（优先取 db 中的扣减结果） */
function stockOf(db, sku) {
  const v = db.stocks[sku.skuId];
  return v === undefined ? sku.stock : v;
}

function itemsOf(db, userId) {
  if (!db.carts[userId]) db.carts[userId] = [];
  return db.carts[userId];
}

function totalCount(list) {
  return list.reduce((sum, item) => sum + item.quantity, 0);
}

function list(db, userId) {
  const items = itemsOf(db, userId);
  return { items, totalCount: totalCount(items) };
}

function add(db, userId, { goodsId, skuId, quantity = 1 }) {
  const qty = Math.max(1, Number(quantity) || 1);
  const goods = catalog.findGoods(goodsId);
  const sku = catalog.findSku(goods, skuId);

  const stock = stockOf(db, sku);
  if (stock <= 0) throw new BizError('该规格已售罄', ERR.BIZ);

  const items = itemsOf(db, userId);
  const exist = items.find((item) => item.skuId === skuId);

  if (exist) {
    const next = Math.min(exist.quantity + qty, stock);
    if (next === exist.quantity) throw new BizError(`库存不足，当前仅剩 ${stock} 件`, ERR.BIZ);
    exist.quantity = next;
    exist.stock = stock;
  } else {
    if (qty > stock) throw new BizError(`库存不足，当前仅剩 ${stock} 件`, ERR.BIZ);
    items.push({
      cartItemId: genId('ci'),
      goodsId: goods.id,
      skuId: sku.skuId,
      name: goods.name,
      specText: sku.specs.join(' / '),
      image: goods.cover,
      price: sku.price,
      quantity: qty,
      stock,
      selected: true,
      addedAt: now()
    });
  }

  return { totalCount: totalCount(items), items };
}

function update(db, userId, { cartItemId, quantity, selected }) {
  const items = itemsOf(db, userId);
  const item = items.find((i) => i.cartItemId === cartItemId);
  if (!item) throw new BizError('购物车项不存在', ERR.NOT_FOUND, 404);

  // 库存可能已被他人买走，刷新一次
  const goods = catalog.findGoods(item.goodsId);
  const sku = catalog.findSku(goods, item.skuId);
  const stock = stockOf(db, sku);
  item.stock = stock;

  if (quantity !== undefined && quantity !== null) {
    const q = Math.max(1, Number(quantity) || 1);
    if (q > stock) throw new BizError(`库存不足，当前仅剩 ${stock} 件`, ERR.BIZ);
    item.quantity = q;
  }
  if (typeof selected === 'boolean') item.selected = selected;

  return { totalCount: totalCount(items), items };
}

function remove(db, userId, cartItemIds) {
  const ids = Array.isArray(cartItemIds) ? cartItemIds : [cartItemIds].filter(Boolean);
  if (!ids.length) throw new BizError('请选择要删除的商品', ERR.PARAM);
  db.carts[userId] = itemsOf(db, userId).filter((i) => ids.indexOf(i.cartItemId) === -1);
  const items = db.carts[userId];
  return { totalCount: totalCount(items), items };
}

/** 下单成功后移除已购买的购物车项 */
function removeBySkuIds(db, userId, skuIds) {
  db.carts[userId] = itemsOf(db, userId).filter((i) => skuIds.indexOf(i.skuId) === -1);
}

/** 批量勾选/取消勾选 */
function selectAll(db, userId, selected) {
  const items = itemsOf(db, userId);
  items.forEach((i) => { i.selected = !!selected; });
  return { totalCount: totalCount(items), items };
}

module.exports = { stockOf, itemsOf, totalCount, list, add, update, remove, removeBySkuIds, selectAll };
