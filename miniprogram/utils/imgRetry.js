/**
 * 图片加载失败后的「换地址重试一次」
 *
 * 真机（尤其 iOS）上常见两种失败：
 *   1. `image` 组件把**这个 URL** 标记成加载失败后，同一页面内再用同一地址不会重新请求，
 *      页面就一直空着（重进页面才好）—— 微信图片缓存的已知行为；
 *   2. 弱网 / 多图并发时请求被中断（服务端日志表现为 200 但 body 只有一部分或 0 字节），
 *      组件直接判失败。
 *
 * 处理方式很朴素：失败时给地址加一个一次性参数（`_r=1`）再试一次 ——
 * 对缓存来说是一个全新地址，一定会重新走网络；仍然失败才落到占位。
 *
 * 为什么参数固定是 `_r=1` 而不是时间戳：**只重试一次**。用时间戳会让每次失败都换地址，
 * 弱网下会变成无限重试，反而更慢；固定值也保证同一张图在两次渲染之间是同一个地址（缓存有效）。
 *
 * 用法（各页的 binderror 里）：
 *   const next = retryUrl(cur);
 *   if (next) this.setData({ [key]: next }); else this.setData({ [key + 'Failed']: true });
 */

/**
 * @param {string} url 当前地址
 * @returns {string} 加了重试参数的地址；已经重试过 / 地址为空 → 空串（调用方落占位）
 */
function retryUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.indexOf('_r=') >= 0) return '';
  return url + (url.indexOf('?') < 0 ? '?' : '&') + '_r=1';
}

module.exports = { retryUrl };
