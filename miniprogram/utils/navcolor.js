/**
 * 底部导航 · 图标染色（客户端侧）
 *
 * ── 一句话 ─────────────────────────────────────────────────────────
 * 内置图标是**包内 PNG**，颜色画死在像素里；改「导航图标色」时文字会变、图标不变。
 * 本模块负责判断「这个图标在这个颜色下要不要染」，并给出**染色图的地址**。
 * 真正的染色在服务端做（server/lib/navicon.js：换 RGB、留 alpha，输出标准 PNG）——
 * 客户端一行 CSS filter 都不用写。
 *
 * ── 为什么不用 CSS filter（曾经的实现） ─────────────────────────────
 * 最初是给 <image> 挂 `brightness(0) saturate(100%) invert… sepia… hue-rotate…`
 * 这条六原语链做色彩矩阵逼近，在浏览器里逐像素验过（Δmax=2）。
 * 但**微信小程序的渲染层对 <image> 的 filter 支持不可靠**：实测开发者工具里
 * 选中项图标渲染成了一个 22×22 的实心 `#080808` 方块 —— 颜色对了、**alpha 被丢掉**。
 * 也就是说「装修台预览（浏览器）好看、真机是色块」，正是最坑的那种走样。
 * 换成服务端像素处理后，两端拿到的是同一张 PNG，物理上不可能再走样。
 *
 * ── 三条边界（与有赞「导航图标色」对齐） ───────────────────────────
 *   ① 只染**内置图标**（`/images/tabbar/` 开头）；运营自传 / 素材库的图（`/uploads/…`）
 *      保持原色 —— 那可能是彩图，整体染色只会毁掉设计。
 *   ② 目标色 == 源色时**不染**：默认配色下真机读的仍是包内那 10 张，
 *      零网络请求、零变化，运营对改造前后完全无感。
 *   ③ 色值非法（不是 #RRGGBB）时**不染**：宁可保持原色，也不要拼出一个必然 404 的地址。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NavColor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  /** 内置图标所在目录（与 package 内路径一致） */
  var BUILTIN_PREFIX = '/images/tabbar/';
  /** 内置图标的「源色」：未选中一套灰、选中一套红，与生成脚本 .tooling/make-tabbar-icons.py 一致 */
  var SRC_OFF = '#8A8A8A';
  var SRC_ON = '#C8102E';
  /** 服务端染色路由前缀（server/index.js 的 tryNavIcon） */
  var TINT_PREFIX = '/navicon/';

  /** '#RGB' / '#RRGGBB' / 'RRGGBB' → [r,g,b]，不合法返回 null */
  function hexToRgb(hex) {
    var h = String(hex == null ? '' : hex).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /** 归一成 '#rrggbb'（小写），不合法返回 '' */
  function normHex(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return '';
    return '#' + rgb.map(function (v) {
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  /** 源图主色：只对内置图标成立，别的返回 ''（= 不参与染色） */
  function sourceColor(src) {
    var s = typeof src === 'string' ? src : '';
    if (s.indexOf(BUILTIN_PREFIX) !== 0) return '';
    return /-active\.png$/i.test(s) ? SRC_ON : SRC_OFF;
  }

  /**
   * 图标名（去掉目录与 .png 后缀）：'/images/tabbar/news-active.png' → 'news-active'。
   * 服务端就是拿这个名字去白名单里找源图，两边的口径必须一致。
   */
  function iconName(src) {
    var s = typeof src === 'string' ? src : '';
    if (s.indexOf(BUILTIN_PREFIX) !== 0) return '';
    return s.slice(BUILTIN_PREFIX.length).replace(/\.png$/i, '');
  }

  /**
   * 该图标在该颜色下的**染色图路径**（相对本站，如 '/navicon/news@2b6cb0.png'）。
   * 返回 '' 表示「不用染，直接用原图」。
   */
  function iconPath(src, color) {
    var ref = sourceColor(src);
    if (!ref) return '';
    var name = iconName(src);
    if (!name) return '';
    var c = normHex(color);
    if (!c) return '';
    if (c.toUpperCase() === ref) return '';   // 默认配色：零变化、零请求
    return TINT_PREFIX + name + '@' + c.slice(1) + '.png';
  }

  /**
   * 最终交给 <image src> 的地址。
   * @param {string} src   数据里的图标（可能是内置路径、/uploads 自传图、或外链）
   * @param {string} color 目标色
   * @param {string} base  本站前缀（真机 = BASE_URL，如 https://…/mall-api）
   */
  function iconSrc(src, color, base) {
    var p = iconPath(src, color);
    return p ? String(base == null ? '' : base) + p : src;
  }

  return {
    tinted: function (src, color, base) { return iconSrc(src, color, base); },
    iconPath: iconPath,
    iconSrc: iconSrc,
    sourceColor: sourceColor,
    iconName: iconName,
    hexToRgb: hexToRgb,
    normHex: normHex,
    BUILTIN_PREFIX: BUILTIN_PREFIX,
    TINT_PREFIX: TINT_PREFIX,
    SRC_OFF: SRC_OFF,
    SRC_ON: SRC_ON
  };
});
