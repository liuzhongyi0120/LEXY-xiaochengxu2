/**
 * 素材地址解析
 *
 * 背景：
 *   装修后台「本地上传」的图片统一以**相对路径**入库 —— /uploads/202610/20261007-ab12cd.png。
 *   存相对路径而不是写死域名，是为了上线换服务器 / 换域名时历史数据完全不用动，
 *   只改 utils/constants.js 里的 BASE_URL 即可。
 *
 * 用法：
 *   页面从 replica 取到数据后，整体过一遍 resolveAssets()，
 *   里面所有 /uploads/… 开头的图片地址都会被补成完整可访问地址。
 *   已经是 http(s) 的外链（如历史数据里的有赞 CDN 图）、
 *   以及 /pages/xx 这类站内跳转路径，一律原样返回，不受影响。
 *
 *   const { resolveAssets } = require('../../utils/asset');
 *   Page({ data: { series: resolveAssets(replica.LEXY_SERIES) } })
 */

const { baseUrlNow } = require('./constants');

/**
 * 单个地址归一
 *   http(s)://… 或 //…  → 原样（外链）
 *   /uploads/…           → 拼接后端域名（本地上传的素材）
 *   其它（含站内路径）    → 原样
 *
 * ⚠️ 用 baseUrlNow() 而**不是** `const { BASE_URL }`：本模块在**加载期**被 require，
 *   那一刻若 wx 还没就绪，档位会停在 server（连内网访问不了的域名）→ 图片全挂、
 *   整页空白且不报错。这里在「真的要拼地址」时取，那时 wx 必已就绪。
 */
function assetUrl(p) {
  if (!p || typeof p !== 'string') return p || '';
  if (/^(https?:)?\/\//.test(p)) return p;
  if (p.indexOf('/uploads/') === 0) return baseUrlNow() + p;
  return p;
}

/** 递归处理整个数据对象（数组 / 对象 / 字符串），返回深拷贝 */
function resolveAssets(v) {
  if (Array.isArray(v)) return v.map(resolveAssets);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = resolveAssets(v[k]); });
    return o;
  }
  return typeof v === 'string' ? assetUrl(v) : v;
}

module.exports = { assetUrl, resolveAssets };
