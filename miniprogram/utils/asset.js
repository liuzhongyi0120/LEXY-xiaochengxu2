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
 * 是否为素材路径挑一份「iOS 一定解得了」的版本。
 *
 * 起因：从有赞抓来的素材大量是 .webp（530 张 / 20.7 MB）。微信 image 组件的
 * `webp` 解析开关在 iOS 上并不可靠 —— 真机**能把图完整下载**（服务端日志 200、
 * 字节数与磁盘完全一致），但解码失败，直接走 binderror 落成占位色块。
 *
 * 更难缠的是缓存：素材响应头写着 `Cache-Control: max-age=604800`（7 天），
 * 这批"能下载但解不开"的坏结果会被 iOS 缓存住，7 天内不再重新请求。
 * 于是就出现了"代码明明改对了，手机上还是一片白"的假象 —— 新的取值压根没机会跑。
 *
 * 彻底解法是**不让 iOS 去碰 webp**：服务端用 server/tools/webp-to-jpg.py
 * 给每个 .webp 预生成一份同名的 .jpg，前端统一指过去。好处有两个：
 *   ① jpg 是 iOS 原生格式，没有"要不要开解析开关"这回事；
 *   ② 扩展名变了 ⇒ URL 变了 ⇒ 顺带破了那 7 天的坏缓存。
 */
const IMG_WEBP_TO_JPG = true;

/**
 * 只改素材路径的扩展名，**不动外链**。
 * "/uploads/x.webp" → "/uploads/x.jpg"；已是 jpg/png/gif 的原样返回。
 */
function safeImgPath(p) {
  if (!IMG_WEBP_TO_JPG || typeof p !== 'string') return p;
  return p.replace(/(\/uploads\/[^?#]*)\.webp(?=$|[?#])/i, '$1.jpg');
}

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
  if (p.indexOf('/uploads/') === 0) return baseUrlNow() + safeImgPath(p);
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

module.exports = { assetUrl, resolveAssets, safeImgPath };
