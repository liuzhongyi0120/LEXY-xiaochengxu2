/**
 * 价格与文本格式化工具
 * 约定：全项目金额统一以「分」为单位的整数存储与传输，仅在渲染时转元。
 */

/**
 * 分转元，返回固定两位小数字符串
 * @param {number} fen 金额（分）
 * @returns {string} 如 "2499.00"
 */
function money(fen) {
  const n = Number(fen);
  if (!isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

/**
 * 拆分价格，便于做「大号整数 + 小号小数」的排版
 * @param {number} fen 金额（分）
 * @returns {{int: string, dec: string}} 如 { int: '2499', dec: '.00' }
 */
function splitPrice(fen) {
  const parts = money(fen).split('.');
  return { int: parts[0], dec: `.${parts[1]}` };
}

/**
 * 划线价文案（原价），返回空串表示「不该显示」
 *
 * 为什么必须有这个判空：后台的「划线价」可以留空，也可以填得比售价还低。
 * 后端 `catalog.js` 的派生规则是 `originalPrice = max(各 SKU 划线价) || price`，
 * 也就是**没填时它会等于售价** —— 直接渲染就成了「¥599 ¥599」的假折扣。
 * 所以这里把「只在原价严格大于现价时才显示」定为唯一口径，调用方一律 `wx:if` 判空。
 *
 * @param {number} original 原价（分）
 * @param {number} price    现价（分）
 * @returns {string} 如 "¥11,999"；不满足条件返回 ''
 */
function strikePrice(original, price) {
  const o = Number(original) || 0;
  const p = Number(price) || 0;
  if (!(o > p)) return '';
  const parts = money(o).split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = parts[1] === '00' ? '' : `.${parts[1]}`;
  return `¥${int}${dec}`;
}

/**
 * 销量/评价数简化展示
 * @param {number} n
 * @returns {string} 1000 → "1000+"，10000 → "1万+"
 */
function shortNumber(n) {
  const num = Number(n) || 0;
  if (num < 1000) return String(num);
  if (num < 10000) return `${Math.floor(num / 1000)}000+`;
  return `${(num / 10000).toFixed(1).replace(/\.0$/, '')}万+`;
}

/**
 * 时间戳格式化为 YYYY-MM-DD HH:mm
 * @param {number|string|Date} ts
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  money,
  splitPrice,
  strikePrice,
  shortNumber,
  formatTime
};
