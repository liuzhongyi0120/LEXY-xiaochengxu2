const { get, post, put, del } = require('../utils/request');

/** 购物车列表 */
function fetchCart() {
  return get('/api/cart/list');
}

/**
 * 加入购物车
 * @param {object} payload { goodsId, skuId, quantity }
 */
function addToCart(payload) {
  return post('/api/cart/add', payload);
}

/**
 * 修改购物车项（数量 / 勾选）
 * @param {object} payload { cartItemId, quantity?, selected? }
 */
function updateCartItem(payload) {
  return put('/api/cart/update', payload);
}

/**
 * 批量移除购物车项
 * @param {string[]} cartItemIds
 */
function removeCartItems(cartItemIds) {
  return del('/api/cart/remove', { cartItemIds });
}

/**
 * 全选 / 全不选
 * @param {boolean} selected
 */
function selectAll(selected) {
  return post('/api/cart/selectAll', { selected });
}

module.exports = { fetchCart, addToCart, updateCartItem, removeCartItems, selectAll };
