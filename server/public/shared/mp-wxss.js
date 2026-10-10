/* =========================================================================
 * WXSS → CSS 转译器（预览页专用）
 *
 * 目的：预览页不再「另写一套 HTML 近似」，而是直接把真机的 WXSS 拿来用。
 *       所以这里只做**单位换算与作用域隔离**，不改任何视觉取值。
 *
 * 三件事：
 *   1. rpx → px            真机 750rpx = 屏宽；预览手机壳固定 375 宽，故 1rpx = 0.5px
 *   2. vh / vw → px        MP 里 100vh 是「页面可视区高度」（不含导航栏与 tabBar）。
 *                          浏览器的 vh 是窗口高度，直接用会完全不同 ——
 *                          实测后果就是 product.wxss 的 `.page{height:100vh}` 把整页撑成浏览器高度，
 *                          左栏和右栏不再各自滚动。这里按手机壳可视区高度换算掉。
 *   3. page 选择器 + 作用域   `page{...}` 是小程序的根节点（设计令牌定义在这里），
 *                          映射为手机屏根节点 `.mp-root`，并给所有选择器加前缀，
 *                          避免小程序样式污染预览页自身的工具栏、左栏列表。
 *
 * 刻意不做的事：不解析复合选择器语义、不处理嵌套（WXSS 不支持嵌套）、不压缩。
 * ========================================================================= */
(function (root) {
  'use strict';

  /** 预览手机壳的可视区（与 preview.css 的 --mp-screen-h 保持一致） */
  var VIEWPORT = { width: 375, height: 718, ready: false };

  /** 由页面调用方设置真机口径 */
  function setViewport(v) {
    if (!v) return;
    if (v.width) VIEWPORT.width = Number(v.width) || 375;
    if (v.height) VIEWPORT.height = Number(v.height) || 718;
    VIEWPORT.ready = true;
  }

  function round(v) {
    return Math.round(v * 1000) / 1000;
  }

  /** rpx → px（750 设计稿基准，预览按 375 宽渲染） */
  function rpx2px(src) {
    var ratio = VIEWPORT.width / 750;
    return src.replace(/(-?\d*\.?\d+)rpx\b/g, function (m, n) {
      return round(parseFloat(n) * ratio) + 'px';
    });
  }

  /**
   * vh / vw → px
   *
   * ⚠️ 这两个单位必须换算：浏览器的 vh 是**浏览器窗口**高度，
   *    而小程序的 100vh 是**页面可视区**高度。不换算的话，
   *    `.page{height:100vh}` 会让左栏与右栏不再各自独立滚动（真机是各自滚的）。
   */
  function vp2px(src) {
    return src
      .replace(/(-?\d*\.?\d+)vh\b/g, function (m, n) {
        return round(parseFloat(n) * VIEWPORT.height / 100) + 'px';
      })
      .replace(/(-?\d*\.?\d+)vw\b/g, function (m, n) {
        return round(parseFloat(n) * VIEWPORT.width / 100) + 'px';
      });
  }

  /** 取出一条 WXSS 里所有 @import 的目标（由调用方负责加载后再合并） */
  function parseImports(src) {
    var out = [];
    src.replace(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?\s*;/g, function (m, p) {
      out.push(p);
      return m;
    });
    return out;
  }

  function stripImports(src) {
    return src.replace(/@import\s+(?:url\()?\s*['"][^'"]+\s*['"]\)?\s*;/g, '');
  }

  /** 去掉注释（注释里的 `{` `}` 会打乱按大括号切块） */
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /**
   * 把选择器里的**小程序标签名**换成等价的 HTML 标签名
   *
   * 为什么必须换：WXML 编译后 `image` 变成 `<img>`、`view` 变成 `<div>`
   * （`<image>` 走 innerHTML 时会被 HTML 解析器按规范直接当成 `<img>`），
   * 而 reset.wxss 正是用裸标签选择器写的基础样式：
   *   `image { display:block; background: var(--color-bg-muted) }`
   * 不换的话这条就不生效 —— 图片占位底色、box-sizing 全都丢，页面对不上。
   *
   * 只替换「选择器位置上的完整标签名」：
   *   - 靠前后边界保证不会把 `.empty-text` 里的 `text` 误伤成 `span`
   *   - 数组值、属性值等声明部分不参与替换（scopeRules 已把选择器与声明分开）
   */
  var MP_TAGS = [
    'scroll-view', 'swiper-item', 'movable-area', 'movable-view', 'picker-view',
    'cover-view', 'cover-image', 'rich-text', 'web-view', 'textarea',
    'navigator', 'progress', 'checkbox', 'slider', 'switch', 'canvas',
    'button', 'input', 'label', 'form', 'video', 'audio',
    'image', 'text', 'view', 'icon', 'block', 'swiper'
  ];
  var TAG_HTML = {
    view: 'div', text: 'span', image: 'img', 'scroll-view': 'div', swiper: 'div',
    'swiper-item': 'div', navigator: 'a', 'cover-image': 'img', 'rich-text': 'div'
  };
  var MP_TAG_RE = new RegExp(
    '(^|[\\s>+~])(' + MP_TAGS.join('|') + ')(?=[\\s>+~.,:[#]|$)',
    'g'
  );

  function mapTags(sel) {
    return sel.replace(MP_TAG_RE, function (m, lead, tag) {
      return lead + (TAG_HTML[tag] || tag);
    });
  }

  /**
   * 给一条选择器的每一段加作用域前缀
   *   `page`            → `.mp-root`（根节点本身）
   *   `page .foo`       → `.mp-root .foo`
   *   `.a, .b`          → `.mp-root .a, .mp-root .b`
   *   `view`            → `.mp-root div`（标签名同时做 HTML 等价替换）
   */
  function scopeSelector(sel, prefix) {
    return sel
      .split(',')
      .map(function (s) {
        s = mapTags(s.trim());
        if (!s) return '';
        if (!/^page\b/.test(s)) return prefix + ' ' + s;
        // page 本身 → 根节点；page 后还有后代选择器时保留
        return (prefix + s.slice(4)).trim();
      })
      .filter(Boolean)
      .join(', ');
  }

  /**
   * 按大括号递归处理规则块
   *   - `@media` / `@supports`：进入内部继续加前缀
   *   - `@keyframes` / `@font-face`：内部原样保留（关键帧里的百分比不是选择器）
   */
  function scopeRules(src, prefix) {
    var out = '';
    var i = 0;
    while (i < src.length) {
      var brace = src.indexOf('{', i);
      if (brace === -1) {
        out += src.slice(i);
        break;
      }
      var sel = src.slice(i, brace).trim();
      var depth = 1;
      var j = brace + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') depth -= 1;
        j += 1;
      }
      var body = src.slice(brace + 1, j - 1);
      if (sel.charAt(0) === '@') {
        if (/^@(media|supports|container|layer)\b/i.test(sel)) {
          out += sel + '{' + scopeRules(body, prefix) + '}';
        } else {
          out += sel + '{' + body + '}';
        }
      } else {
        out += scopeSelector(sel, prefix) + '{' + body + '}';
      }
      i = j;
    }
    return out;
  }

  /**
   * 编译一份 WXSS
   * @param {string} src        WXSS 原文（可含 @import，调用方需先合并）
   * @param {string} prefix     作用域根选择器，默认 `.mp-root`
   * @returns {string} CSS
   */
  function compile(src, prefix) {
    prefix = prefix || '.mp-root';
    var css = stripComments(stripImports(String(src || '')));
    css = rpx2px(css);
    css = vp2px(css);
    return scopeRules(css, prefix);
  }

  /**
   * 内置 scroll-view 的滚动条口径：**浮层，不占布局宽**。
   *
   * 真机上滚动条是「滚动时才浮出的临时指示条」（截图里根本看不到），**绝不挤压内容宽度**；
   * 浏览器里 `overflow-y:auto` 默认却会实打实吃掉 8px 布局宽，所以预览必须显式抹掉。
   *
   * 之所以抽成独立函数而不是塞在 runtimeCss 里：这条口径有**两处消费**，且必须同口径 ——
   *   ① 预览页 /preview：WXML 的 `scroll-view` 被编成 HTML，由 runtimeCss 带上（见下）；
   *   ② 装修台手机壳 /admin：「占满一屏」的左右两栏是 pv-render 手写的 div（不经过 WXML 编译），
   *      由 pv-render 的 ensureScrollCss 注入 —— 两边都用这一份，不许各写一份。
   * 装修台漏掉它的实测后果：右栏内容 277.5 被压成 269.5（白吃 8px），
   * 运营照着偏窄的样板去调，只会越调越不像真机。
   */
  function scrollViewCss(prefix) {
    prefix = prefix || '.mp-root';
    return [
      prefix + ' [data-scroll-y]{overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none}',
      prefix + ' [data-scroll-x]{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none}',
      prefix + ' [data-scroll-y]::-webkit-scrollbar{display:none;width:0;height:0}',
      prefix + ' [data-scroll-x]::-webkit-scrollbar{display:none;width:0;height:0}'
    ].join('\n');
  }

  /**
   * 小程序内置组件的默认外观补丁
   *
   * WXML 编译成 HTML 之后，`image` / `scroll-view` / `swiper` 变成了普通标签，
   * 而真机上这几个是**内置组件**（有自己的默认行为，不写在 WXSS 里）。
   * 这里把那些默认行为补回来 —— 每条都对应真机文档里的默认值，不是我们自己发挥。
   */
  function runtimeCss(prefix) {
    prefix = prefix || '.mp-root';
    return [
      /* image：默认 320×240、scaleToFill；mode 决定 object-fit */
      prefix + ' img{display:block;background:transparent}',
      prefix + ' img[data-mode="scaleToFill"]{object-fit:fill}',
      prefix + ' img[data-mode="aspectFit"]{object-fit:contain}',
      prefix + ' img[data-mode="aspectFill"]{object-fit:cover}',
      prefix + ' img[data-mode="widthFix"]{height:auto}',

      /* scroll-view：scroll-y 纵向滚、scroll-x 横向滚；滚动条一律不常驻
         （真机是滚动时才浮出的临时滚动条，截图里看不到；常态挂一根灰条就不像真机了）
         → 规则本身定义在 scrollViewCss，装修台手机壳也复用它，只此一份。 */
      scrollViewCss(prefix),

      /* swiper：默认高度 150px，只显示当前页 */
      prefix + ' [data-swiper]{position:relative;overflow:hidden;display:block}',
      prefix + ' [data-swiper-item]{position:absolute;top:0;left:0;width:100%;height:100%;display:none}',
      prefix + ' [data-swiper-item][data-on]{display:block}',

      /* indicator-dots：真机是原生指示点，这里按同样观感补出来 */
      prefix + ' .mp-dots{position:absolute;left:0;right:0;bottom:4px;display:flex;justify-content:center;gap:4px;pointer-events:none}',
      prefix + ' .mp-dots i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.45)}',
      prefix + ' .mp-dots i.on{background:#fff}'
    ].join('\n');
  }

  root.MpWxss = {
    compile: compile,
    runtimeCss: runtimeCss,
    scrollViewCss: scrollViewCss,
    parseImports: parseImports,
    stripImports: stripImports,
    rpx2px: rpx2px,
    setViewport: setViewport
  };
})(typeof window !== 'undefined' ? window : this);
