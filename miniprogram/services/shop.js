const { get } = require('../utils/request');

/**
 * 运营参数（客服电话 / 服务时间 / 公告 / 运费规则 / 自动确认天数）
 *
 * ⚠️ **不含店铺名称与 Logo**：那两个字段的唯一数据源是装修台的「店铺信息」
 * （写回 `config/replica.js` 的 `SHOP`，真机读它）。
 * 页面要展示店铺名请读 `replica.SHOP`，不要读这里 ——
 * 否则会出现「装修台改了、页面还是旧值」的两套数据源问题。
 */
function fetchSettings() {
  return get('/api/shop/settings', {}, { auth: false });
}

module.exports = { fetchSettings };
