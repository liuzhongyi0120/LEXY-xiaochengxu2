/**
 * 通用工具：ID、时间、分页、金额、分类展开
 * 约定：全站金额统一用「分」为单位的整数，仅渲染时转元。
 */

/** 生成业务 ID，如 g_1712345678901_a3f9 */
function genId(prefix) {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${Date.now()}_${rand}`;
}

/** 生成订单号：LEXY + yyyyMMddHHmmss + 4 位随机 */
function genOrderNo() {
  const d = new Date();
  const p = (v, n = 2) => String(v).padStart(n, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `LEXY${stamp}${p(Math.floor(Math.random() * 10000), 4)}`;
}

function now() {
  return Date.now();
}

/** 统一分页 */
function paginate(list, page, size) {
  const current = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(size) || 10));
  const start = (current - 1) * pageSize;
  return {
    total: list.length,
    list: list.slice(start, start + pageSize),
    hasMore: start + pageSize < list.length,
    page: current,
    size: pageSize
  };
}

/** 收集某分类（含其所有子分类）的 ID 集合 */
function expandCategoryIds(categories, categoryId) {
  const top = categories.find((c) => c.id === categoryId);
  if (top) {
    return [top.id].concat((top.children || []).map((child) => child.id));
  }
  return [categoryId];
}

/** 安全取整（金额、库存等） */
function toInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

/** 深拷贝（仅含可 JSON 序列化的数据） */
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

/**
 * 是否为「普通对象」。
 *
 * ⚠️ JSON.parse 成功 ≠ 数据合法：文件内容可能是 `null` / `123` / `"abc"` / `[]`，
 *    这些都是合法 JSON 但不是对象，直接当配置用会在后续 `.xxx` 取值时抛 TypeError。
 *    持久化层在解析成功后必须再过一道这个判断（详见 lib/store.js 的 load()）。
 */
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 出错信息里用的类型名，避免把整份文件内容写进日志 */
function describeJson(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '数组';
  return typeof v;
}

module.exports = {
  genId,
  genOrderNo,
  now,
  paginate,
  expandCategoryIds,
  toInt,
  clone,
  isPlainObject,
  describeJson
};
