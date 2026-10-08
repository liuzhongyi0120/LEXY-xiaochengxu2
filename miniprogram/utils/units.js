/**
 * 尺寸换算（小程序端唯一口径，务必与后台预览保持一致）
 *
 * 装修数据里有两种单位，混用会导致「图片特别大 / 被裁切」这类问题：
 *
 *   1) height 字段（轮播 swiper / 视频 video / 辅助分割 line / 热区 hotspot）
 *      = **rpx**（750 宽基准），直接用，**不能再 ×2**。
 *      这些高度来自真实页面量到的「图片渲染高度」，设计稿基准是 750 宽。
 *      例：首屏海报在 375 宽下渲染高 661px → 存 1322（= 661 × 2 = rpx）。
 *
 *   2) 其余尺寸字段（pageMargin / paddingY / iconSize / gap / imageGap）
 *      = **375 基准 px**，用 px2rpx 换算（rpx = px × 2）。
 *
 * 后台装修台的预览画布是 375 宽（≈ 手机 CSS px），对应关系：
 *     预览数值 = rpx ÷ 2（height）   ／   预览数值 = px（其余字段，原样使用）
 */

/** 375 基准设计稿 px → rpx */
function px2rpx(v) {
  const n = Number(v);
  return Math.round((isNaN(n) ? 0 : n) * 2);
}

/** height 字段 → rpx（本身即 rpx，仅做兜底与取整） */
function heightRpx(v, def) {
  const n = Number(v);
  return Math.round(isNaN(n) || n <= 0 ? def : n);
}

module.exports = { px2rpx, heightRpx };
