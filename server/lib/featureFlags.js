/**
 * 功能开关解析
 *
 * 抽成纯函数的意义：开关的「判定矩阵」可以直接被自检单测覆盖，
 * 不需要真的去起一个服务进程——起进程测开关既慢又可能干扰主服务的数据。
 *
 * ⚠️ 这里的原则：**安全开关失败必须往安全侧倒**。
 *    `DEBUG_PAGE` 关的是管理后台与 44 个运营管理点位，
 *    所以只有当取值被明确规定为「开」时才开，其余一律视为关。
 *    历史上这里只写了 `!== '0'`，导致按文档设置的 `DEBUG_PAGE=off` 实际是「开放」。
 */

/** 明确表示「开启」的取值 */
const TRUTHY = ['1', 'on', 'true', 'yes'];
/** 明确表示「关闭」的取值 */
const FALSY = ['0', 'off', 'false', 'no'];

/** 归一化：容忍大小写与首尾空格，如 ' OFF ' → 'off' */
function normalize(raw) {
  return raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase();
}

/** 该取值是否被识别（未设置也算识别，走环境默认） */
function isKnownDebugPageValue(raw) {
  const v = normalize(raw);
  return v === '' || TRUTHY.indexOf(v) > -1 || FALSY.indexOf(v) > -1;
}

/**
 * 是否开放管理页面与运营管理接口
 *
 * @param {string|undefined} raw     DEBUG_PAGE 环境变量原始值
 * @param {string|undefined} nodeEnv NODE_ENV
 * @returns {boolean}
 *
 * 规则：
 *   - 未设置          → 跟随环境：非 production 开放，production 关闭
 *   - 1/on/true/yes   → 开放
 *   - 0/off/false/no  → 关闭
 *   - 其它（拼错的值）→ 关闭（安全侧），调用方应打警告日志
 */
function resolveDebugPage(raw, nodeEnv) {
  const v = normalize(raw);
  if (v === '') return normalize(nodeEnv) !== 'production';
  if (TRUTHY.indexOf(v) > -1) return true;
  if (FALSY.indexOf(v) > -1) return false;
  return false;
}

module.exports = { resolveDebugPage, isKnownDebugPageValue, TRUTHY, FALSY, normalize };
