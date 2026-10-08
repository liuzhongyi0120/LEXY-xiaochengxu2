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
  shortNumber,
  formatTime
};
