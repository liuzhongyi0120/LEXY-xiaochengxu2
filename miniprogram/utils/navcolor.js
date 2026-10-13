/**
 * 底部导航「图标染色」—— 把**包内内置图标**按装修台配的色值染成任意颜色。
 *
 * 为什么需要它（复刻有赞「店铺导航 > 更多设置 > 导航图标色」）：
 *   内置的 10 张图标是 PNG 位图（`miniprogram/images/tabbar/*.png`），
 *   颜色是**画死在图里**的（未选中 #8A8A8A / 选中 #C8102E）。
 *   运营在装修台把「未选中颜色」改成蓝色后，**文字会变、图标纹丝不动** ——
 *   因为 PNG 的像素不会读 CSS 的 color。有赞那边能跟着变，是因为它的内置图标
 *   是**图标字体**（`yz-tabbar-icon-v2`），字形用 color 染色。
 *   我们没有字体，就用 CSS `filter` 把位图染成目标色，等效地对齐了那个能力。
 *
 * 算法口径（保证三处一致 + 可复算）：
 *   1. 前缀 `brightness(0) saturate(100%)` 把任何源图压成「黑色 + 原 alpha」——
 *      于是染色结果**与源图本身是什么颜色无关**，同一套参数对 10 张图都成立；
 *      抗锯齿边缘的 alpha 不受影响，所以边缘仍然平滑。
 *   2. 再用 `invert → sepia → saturate → hue-rotate → brightness → contrast`
 *      这 6 个原语的色彩矩阵去逼近目标色，参数由**确定性**坐标下降求解
 *      （多起点 + 逐维扫描 + 量化后微调，无随机数 → 同一输入必得同一输出）。
 *   3. **不支持的回落**：若运行环境不认 filter（旧内核），图标就是原色
 *      （灰 / 红）—— 不裂图、不白屏，与「没配过色」完全一样。
 *      这也是选 filter 而不是 `-webkit-mask` 的原因：mask 不被支持时
 *      会露出一整块纯色方块，那才是真事故。
 *
 * ⚠️ 只在**内置图标**上加滤镜：
 *   运营从素材库选 / 自己上传的图（`/uploads/…`）**保持原色**——
 *   一是与有赞一致（自传图不会被重新着色），
 *   二是彩色的自传图被强行整体染色只会更糟。
 *
 * ⚠️ 这份实现与 `server/public/shared/pv-tabbar.js` 里的同名字段是**同一算法**，
 *    自检（`server/tools/check-all.mjs`）会喂同一批色值给两边、逐字符比结果。
 *    改这里必须同步改那边，否则「装修台预览一个色、真机另一个色」。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NavColor = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /** 内置图标所在目录 —— 只有这个前缀下的图才参与染色 */
  var BUILTIN_PREFIX = '/images/tabbar/';

  /**
   * 源图的主色（`-active.png` 是另一个色）。
   * 生成脚本 `.tooling/make-tabbar-icons.py` 复刻有赞图标字体时，
   * 未选中取 #8A8A8A、选中取 #C8102E —— 正好等于装修台的默认配色。
   * 用途：**目标色 == 源色时直接不加滤镜**（默认态零变化，像素与之前逐点相同）。
   */
  var SRC_OFF = '#8A8A8A';
  var SRC_ON = '#C8102E';

  var HEX_RE = /^[0-9a-fA-F]{6}$/;

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  function hexToRgb(hex) {
    var s = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
    if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    if (!HEX_RE.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }

  /* ---------------- CSS Filter Effects Level 1 的色彩矩阵 ----------------
   * 统一表示成 3×4：`[m00,m01,m02,o0, m10,m11,m12,o1, m20,m21,m22,o2]`
   * （矩阵作用在**非预乘**的 sRGB 上，与浏览器实现一致；alpha 不受影响）
   */
  function apply(m, v) {
    return [
      clamp01(m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3]),
      clamp01(m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7]),
      clamp01(m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11])
    ];
  }

  function fInvert(p) {
    // c' = p·(1−c) + (1−p)·c = p + (1−2p)·c
    var a = 1 - 2 * p;
    return [a, 0, 0, p, 0, a, 0, p, 0, 0, a, p];
  }

  var SEPIA9 = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];

  /** 与单位阵插值：sepia(0) 恒等、sepia(1) 满量 */
  function mixIdentity(m9, t) {
    var o = [];
    for (var i = 0; i < 9; i++) {
      var id = (i === 0 || i === 4 || i === 8) ? 1 : 0;
      o[i] = id * (1 - t) + m9[i] * t;
    }
    return [o[0], o[1], o[2], 0, o[3], o[4], o[5], 0, o[6], o[7], o[8], 0];
  }

  function fSepia(p) { return mixIdentity(SEPIA9, p); }

  function fSaturate(s) {
    return [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0
    ];
  }

  function fHueRotate(deg) {
    var c = Math.cos(deg * Math.PI / 180);
    var s = Math.sin(deg * Math.PI / 180);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0
    ];
  }

  function fBrightness(b) { return [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0]; }

  function fContrast(k) {
    var o = 0.5 - 0.5 * k;
    return [k, 0, 0, o, 0, k, 0, o, 0, 0, k, o];
  }

  /* 参数量纲：[invert, sepia, saturate, hueRotate(deg), brightness, contrast] */
  var RANGE = [[0, 1], [0, 1], [0, 30], [-180, 180], [0, 2], [0.5, 2]];
  /** 输出时的最小刻度（决定 filter 字符串的写法，也是量化微调的步长） */
  var STEP = [0.01, 0.01, 0.01, 1, 0.01, 0.01];

  /** 起点：覆盖「纯灰 / 高饱和 / 低亮 / 深色」几种常见形态，避免落进局部极小 */
  var SEEDS = [
    [0.5, 1, 1, 0, 1, 1],
    [0.5, 0, 1, 0, 1, 1],
    [0.2, 1, 8, 0, 1, 1],
    [0.8, 1, 8, 0, 1, 1],
    [0.5, 1, 12, 120, 1, 1],
    [0.5, 1, 12, -120, 1, 1]
  ];

  /** 把一组参数按目标色算一遍，返回「实际渲染出来的色」与误差平方和 */
  function evaluate(p, target) {
    var v = [0, 0, 0]; // brightness(0) saturate(100%) 之后恒为黑
    v = apply(fInvert(p[0]), v);
    v = apply(fSepia(p[1]), v);
    v = apply(fSaturate(p[2]), v);
    v = apply(fHueRotate(p[3]), v);
    v = apply(fBrightness(p[4]), v);
    v = apply(fContrast(p[5]), v);
    var dr = v[0] - target[0], dg = v[1] - target[1], db = v[2] - target[2];
    return { v: v, e: dr * dr + dg * dg + db * db };
  }

  function clampParam(k, x) {
    var lo = RANGE[k][0], hi = RANGE[k][1];
    return x < lo ? lo : (x > hi ? hi : x);
  }

  function snap(k, x) { return clampParam(k, Math.round(x / STEP[k]) * STEP[k]); }

  /**
   * 解出一组参数。**确定性**：无随机数、无时间、无外部状态，
   * 同样的目标色在任何一端跑出来的 filter 字符串逐字符相同。
   */
  function solve(target) {
    var best = null;
    for (var si = 0; si < SEEDS.length; si++) {
      var p = SEEDS[si].slice();
      var span = [0.5, 0.5, 15, 180, 0.5, 0.5];
      var cur = evaluate(p, target);
      for (var round = 0; round < 24; round++) {
        for (var k = 0; k < 6; k++) {
          var c0 = clampParam(k, p[k] - span[k]);
          var c1 = clampParam(k, p[k] + span[k]);
          if (c1 <= c0) continue;
          var N = 8;
          for (var j = 0; j <= N; j++) {
            var cand = p.slice();
            cand[k] = c0 + (c1 - c0) * j / N;
            var ce = evaluate(cand, target);
            if (ce.e < cur.e) { cur = ce; p = cand; }
          }
        }
        for (var q = 0; q < 6; q++) span[q] *= 0.6;
      }
      if (!best || cur.e < best.e) best = { e: cur.e, p: p };
    }

    /* 量化到输出刻度上再逐维微调 —— 否则「解出来的参数」和「真正写进 filter 的参数」
       不是同一个，误差会白白放大（尤其 saturate 用整数百分比表示时）。 */
    var bestQ = null;
    for (var pk = 0; pk < 6; pk++) best.p[pk] = snap(pk, best.p[pk]);
    bestQ = { e: evaluate(best.p, target).e, p: best.p.slice() };
    for (var pass = 0; pass < 8; pass++) {
      var improved = false;
      for (var kk = 0; kk < 6; kk++) {
        for (var dir = -1; dir <= 1; dir += 2) {
          var c2 = bestQ.p.slice();
          c2[kk] = snap(kk, c2[kk] + dir * STEP[kk]);
          var e2 = evaluate(c2, target).e;
          if (e2 < bestQ.e) { bestQ = { e: e2, p: c2 }; improved = true; }
        }
      }
      if (!improved) break;
    }
    return bestQ;
  }

  /** 参数 → filter 字符串。六个原语**恒定输出**，不做「恒等就省略」的优化：
   *  少一种分支就少一处三端走样的可能，且便于自检直接比字符串。 */
  function toFilter(p) {
    return 'brightness(0) saturate(100%)' +
      ' invert(' + Math.round(p[0] * 100) + '%)' +
      ' sepia(' + Math.round(p[1] * 100) + '%)' +
      ' saturate(' + Math.round(p[2] * 100) + '%)' +
      ' hue-rotate(' + Math.round(p[3]) + 'deg)' +
      ' brightness(' + Math.round(p[4] * 100) + '%)' +
      ' contrast(' + Math.round(p[5] * 100) + '%)';
  }

  /* 同一个色值只会被问一次（一次渲染最多两个色：未选中 / 选中），缓存掉重复求解 */
  var cache = {};

  /** 目标色 → filter 字符串；色值非法时返回 ''（不加滤镜，回落原色） */
  function tintFilter(hex) {
    var t = hexToRgb(hex);
    if (!t) return '';
    var key = String(hex).trim().toUpperCase();
    if (cache[key] === undefined) cache[key] = toFilter(solve(t).p);
    return cache[key];
  }

  /** 源图路径 → 它的主色（用来判断「目标色与源色相同 → 不用染」） */
  function sourceColor(src) {
    var s = typeof src === 'string' ? src : '';
    if (s.indexOf(BUILTIN_PREFIX) !== 0) return '';
    return /-active\.png$/i.test(s) ? SRC_ON : SRC_OFF;
  }

  /**
   * 取某个图标在某个颜色下该用的 filter（'' = 不加）。
   * @param {string} src   图标地址（真机是包内路径，预览是 /images/… 同一条只读路由）
   * @param {string} color 该状态要用的颜色（未选中用 color、选中用 selectedColor）
   */
  function iconFilter(src, color) {
    var ref = sourceColor(src);
    if (!ref) return '';                 // 非内置图标（自传 / 素材库）→ 不动它
    if (String(color || '').trim().toUpperCase() === ref) return ''; // 目标色 == 源色 → 零变化
    return tintFilter(color);
  }

  return {
    tintFilter: tintFilter,
    iconFilter: iconFilter,
    sourceColor: sourceColor,
    hexToRgb: hexToRgb,
    /** 仅供自检 / 调试：把某个色的求解结果（含实际逼近色与误差）摊开 */
    inspect: function (hex) {
      var t = hexToRgb(hex);
      if (!t) return null;
      var r = solve(t);
      var ev = evaluate(r.p, t);
      return { filter: toFilter(r.p), params: r.p, got: ev.v, err: ev.e };
    },
    BUILTIN_PREFIX: BUILTIN_PREFIX,
    SRC_OFF: SRC_OFF,
    SRC_ON: SRC_ON
  };
});
