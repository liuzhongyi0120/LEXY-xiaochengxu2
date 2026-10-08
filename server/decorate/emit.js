/**
 * 装修后台 · replica.js 生成器
 *
 * 把「装修数据」还原成 miniprogram/config/replica.js 源码。
 * 原则：
 *   1. 保留原文件头部注释块（人工维护的说明不被抹掉），仅追加一行生成标记
 *   2. 输出格式与现有文件一致（2 空格缩进、对象键不带引号）
 *   3. 生成后由调用方做语法校验（vm.Script）+ 数据回读校验，双重兜底
 */

const fs = require('node:fs');

/** 取出原文件的头部注释块（文件开头的第一段 block comment） */
function headerOf(src) {
  if (!src) return '/* 店铺装修数据 */';
  const s = String(src).replace(/^\uFEFF/, '').replace(/^\s+/, '');
  const m = /^\/\*\*[\s\S]*?\*\//.exec(s);
  return m ? m[0] : '/* 店铺装修数据 */';
}

/**
 * JS 字面量美化：JSON.stringify 输出后把对象键的引号去掉
 * （只在行首的键位置上处理，字符串值内部的引号不受影响）
 */
function jsExpr(value) {
  const raw = JSON.stringify(value === undefined ? null : value, null, 2);
  return raw.replace(/^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm, '$1$2:');
}

/**
 * 生成 replica.js 全文
 * @param {object} data { SHOP, HOME_BLOCKS, LEXY_SERIES, NEWS, PRODUCT_NAV_LOGO, PRODUCT_BRANDS,
 *                        PAGE_META?, CUSTOM_PAGES?, TABBAR? }
 * @param {object} opt  { originalSrc, publishedAt, by }
 */
function emitReplica(data, opt = {}) {
  const header = headerOf(opt.originalSrc);
  const stamp = opt.publishedAt ? new Date(opt.publishedAt) : new Date();
  const p = (v) => String(v).padStart(2, '0');
  const timeText = `${stamp.getFullYear()}-${p(stamp.getMonth() + 1)}-${p(stamp.getDate())} ${p(stamp.getHours())}:${p(stamp.getMinutes())}:${p(stamp.getSeconds())}`;

  const need = ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS'];
  const missing = need.filter((k) => data[k] === undefined);
  if (missing.length) {
    throw new Error('装修数据缺少字段，拒绝生成：' + missing.join(', '));
  }

  const L = [];
  L.push(header);
  L.push('');
  L.push(`/* 本文件由「店铺装修后台」生成 · 最后发布 ${timeText}（来源：/admin） */`);
  L.push('');
  L.push('/** 店铺信息（首页与我的页共用） */');
  L.push('const SHOP = ' + jsExpr(data.SHOP) + ';');
  L.push('');
  L.push('/** ---------------- 首页 ---------------- */');
  L.push('/** h 为设计稿像素高（375 宽基准），wxml 中按 rpx = px * 2 换算 */');
  L.push('const HOME_BLOCKS = ' + jsExpr(data.HOME_BLOCKS) + ';');
  L.push('');
  L.push('/** ---------------- 莱克（产品系列） ---------------- */');
  L.push('const LEXY_SERIES = ' + jsExpr(data.LEXY_SERIES) + ';');
  L.push('');
  L.push('/** ---------------- 资讯（了解莱克，8 个栏目 → 内容页） ---------------- */');
  L.push('const NEWS = ' + jsExpr(data.NEWS) + ';');
  L.push('');
  L.push('/** ---------------- 产品（左栏品牌导航 + 右侧分组与型号） ---------------- */');
  L.push('const PRODUCT_NAV_LOGO = ' + jsExpr(data.PRODUCT_NAV_LOGO) + ';');
  L.push('');
  L.push('const PRODUCT_BRANDS = ' + jsExpr(data.PRODUCT_BRANDS) + ';');
  L.push('');

  /*
   * 自定义页面（装修台「新建页面」创建）：按页面 key 索引的 { name, blocks }。
   * 没有任何自定义页时整段省略，replica.js 与加功能之前完全一致（向后兼容）。
   */
  const hasCustom = !!(data.CUSTOM_PAGES && Object.keys(data.CUSTOM_PAGES).length);
  if (hasCustom) {
    L.push('/** ---------------- 自定义页面（key → { name, blocks }，由装修台「新建页面」创建） ---------------- */');
    L.push('const CUSTOM_PAGES = ' + jsExpr(data.CUSTOM_PAGES) + ';');
    L.push('');
  }

  if (data.PAGE_META !== undefined) {
    L.push('/** ---------------- 页面级设置（装修后台「页面设置」面板，key = 页面 key） ---------------- */');
    L.push('const PAGE_META = ' + jsExpr(data.PAGE_META) + ';');
    L.push('');
  }

  /*
   * 店铺导航（底部 tabBar 外观）。
   * 生成器这一层是「可选字段」：data.TABBAR === undefined 时整段省略，
   * 导出清单也不会多出 TABBAR 这个键（老数据 / 直接调用生成器的场景走这条分支）。
   *
   * ⚠️ 但走正常发布链路时它不是可选的 —— schema 里 nav 页的 from() 会把
   *   「replica 里没有 TABBAR」也归一成默认值（这样运营第一次打开「店铺导航」
   *   面板看到的是当前生效的默认外观，而不是一片空白）。于是 assemble() 永远
   *   会产出 TABBAR，**下一次发布任意页面时 replica.js 就会显式写上这份默认导航**。
   *   这是有意为之的结果，不是 bug：默认值本来就在生效，写出来只是把
   *   「唯一真源」显式化。custom-tab-bar 组件里仍保留一份兜底，
   *   用于「代码已更新但还没重新发布过」的中间状态。
   */
  if (data.TABBAR !== undefined) {
    L.push('/** ---------------- 店铺导航（底部 tabBar 外观，装修后台「店铺导航」面板） ---------------- */');
    L.push('const TABBAR = ' + jsExpr(data.TABBAR) + ';');
    L.push('');
  }

  /* 导出清单按实际写出的字段动态生成，杜绝「导出了不存在的变量」这种低级错误 */
  const fields = ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS'];
  if (hasCustom) fields.push('CUSTOM_PAGES');
  if (data.PAGE_META !== undefined) fields.push('PAGE_META');
  if (data.TABBAR !== undefined) fields.push('TABBAR');

  L.push('module.exports = {');
  fields.forEach((f, i) => { L.push('  ' + f + (i < fields.length - 1 ? ',' : '')); });
  L.push('};');
  L.push('');
  return L.join('\n');
}

/** 读取现有 replica.js 源码（用于保留头部注释），文件不存在时返回空串 */
function readOriginal(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

module.exports = { emitReplica, readOriginal, headerOf, jsExpr };
