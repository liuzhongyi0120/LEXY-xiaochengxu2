const { get, post } = require('../utils/request');

/** 地址列表 */
function fetchList() {
  return get('/api/address/list');
}

/** 地址详情 */
function fetchDetail(addressId) {
  return get('/api/address/detail', { addressId });
}

/**
 * 新增 / 编辑地址（带 addressId 为编辑）
 * @param {object} payload { addressId?, name, phone, province, city, district, detail, isDefault? }
 */
function save(payload) {
  return post('/api/address/save', payload);
}

/** 删除地址 */
function remove(addressId) {
  return post('/api/address/delete', { addressId });
}

/** 设为默认地址 */
function setDefault(addressId) {
  return post('/api/address/setDefault', { addressId });
}

module.exports = { fetchList, fetchDetail, save, remove, setDefault };
