/* =========================================================================
 * WXML → HTML 编译器（预览页专用）
 *
 * 为什么要有它：预览页原先是一套「手写的 HTML 近似」，跟真机 WXML/WXSS 会慢慢走样
 * （实测走样：型号网格写成 3 列而真机是 2 列、左栏选中态写成红字白底而真机是黑底白字）。
 * 预览一旦跟真机不一样就失去意义，所以改成**直接编译真机的 WXML**。
 *
 * 支持范围（本项目实际用到的语法，够用且可验证）：
 *   - 插值 {{ expr }}：文本、属性值、三元 / 逻辑 / 成员访问 / 数组下标
 *   - wx:for / wx:for-item / wx:for-index / wx:key
 *   - wx:if / wx:elif / wx:else（含同级链）
 *   - <include src="…" />（首页与自定义页共用 templates/blocks.wxml 就是靠它）
 *   - 自定义组件（本项目只用到 empty-state，由调用方提供模板与属性默认值）
 *   - 内置标签 → HTML：view/text/image/scroll-view/swiper/swiper-item/block…
 *   - 内置组件的默认行为（mode、scroll-x/y、indicator-dots）用 data-* 标记，
 *     由 mp-wxss.js 的 runtimeCss() 还原成真机观感
 *
 * 刻意不做：事件绑定、数据双向绑定、wxs、template+import。
 * 预览页只负责「看」，不负责「点」。
 * ========================================================================= */
(function (root) {
  'use strict';

  /* ------------------------------ 标签映射 ------------------------------ */

  /** WXML 内置标签 → HTML 标签（`block` 是虚拟节点，不产出元素） */
  var TAG_MAP = {
    view: 'div',
    text: 'span',
    image: 'img',
    'scroll-view': 'div',
    swiper: 'div',
    'swiper-item': 'div',
    'movable-area': 'div',
    'movable-view': 'div',
    'cover-view': 'div',
    'cover-image': 'img',
    'rich-text': 'div',
    navigator: 'a',
    button: 'button',
    label: 'label',
    form: 'form',
    input: 'input',
    textarea: 'textarea',
    picker: 'select',
    'picker-view': 'div',
    'video': 'video',
    'audio': 'div',
    'canvas': 'canvas',
    'progress': 'progress',
    'checkbox': 'input',
    'radio': 'input',
    'switch': 'input',
    'slider': 'input',
    'icon': 'i',
    'web-view': 'iframe'
  };

  /** 这些属性只服务于小程序运行时，编译时丢弃 */
  var DROP_ATTR = /^(bind|catch|capture-bind|capture-catch|mut-bind)/;
  var DROP_EXACT = {
    'wx:key': 1, 'wx:for': 1, 'wx:for-item': 1, 'wx:for-index': 1,
    'wx:if': 1, 'wx:elif': 1, 'wx:else': 1, 'wx:else-if': 1,
    'hover-class': 1, 'hover-stop-propagation': 1, 'hover-start-time': 1, 'hover-stay-time': 1,
    'lazy-load': 1, 'autoplay': 1, circular: 1, vertical: 1, duration: 1, interval: 1,
    enhanced: 1, 'scroll-top': 1, 'scroll-left': 1, 'scroll-into-view': 1,
    'scroll-with-animation': 1, 'enable-flex': 1, 'easing-function': 1, 'adjust-position': 1,
    'show-confirm-bar': 1, 'hold-keyboard': 1, 'cursor-spacing': 1, 'confirm-type': 1,
    'selection-start': 1, 'selection-end': 1, 'previous-margin': 1, 'next-margin': 1,
    'snap-to-edge': 1, 'indicator-color': 1, 'indicator-active-color': 1, 'bounces': 1,
    'fast-deceleration': 1, 'refresher-enabled': 1, 'show-scrollbar': 1
  };

  /* ------------------------------ 解析 ------------------------------ */

  /**
   * 把 WXML 解析成节点树
   *
   * 自己写扫描器而不是用 DOMParser：WXML 的 `wx:if="{{a && b}}"` 里含裸 `&&`，
   * 按 XML 解析会直接报错；而按 HTML 解析时 `<image>` 会被浏览器当成 `<img>` 的历史别名
   * 改掉标签名、`<block>` 之类的未知标签行为也不可控。自己扫最稳。
   */
  function parse(src) {
    var i = 0;
    var n = src.length;
    var rootNodes = [];
    var stack = [{ tag: '#root', children: rootNodes }];

    function push(node) {
      stack[stack.length - 1].children.push(node);
    }

    while (i < n) {
      var lt = src.indexOf('<', i);
      if (lt === -1) {
        addText(src.slice(i));
        break;
      }
      if (lt > i) addText(src.slice(i, lt));

      // 注释
      if (src.substr(lt, 4) === '<!--') {
        var endC = src.indexOf('-->', lt + 4);
        i = endC === -1 ? n : endC + 3;
        continue;
      }
      // 闭标签
      if (src[lt + 1] === '/') {
        var gt0 = src.indexOf('>', lt);
        var name0 = src.slice(lt + 2, gt0).trim();
        closeTag(name0);
        i = gt0 + 1;
        continue;
      }

      // 开标签：扫描到「不在引号内的 >」
      var j = lt + 1;
      var quote = null;
      while (j < n) {
        var ch = src[j];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          break;
        }
        j += 1;
      }
      var raw = src.slice(lt + 1, j);
      i = j + 1;

      var selfClose = /\/$/.test(raw);
      if (selfClose) raw = raw.slice(0, -1);
      var parsed = parseTag(raw);
      if (!parsed.name) continue;

      var node = { type: 'element', tag: parsed.name, attrs: parsed.attrs, children: [] };
      push(node);
      if (!selfClose) stack.push(node);
      continue;
    }

    function addText(t) {
      if (!t || !t.trim()) return;
      push({ type: 'text', text: t });
    }

    function closeTag(name) {
      for (var k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k].tag === name) {
          stack.length = k;
          return;
        }
      }
      // 容错：多余的闭标签直接忽略
    }

    return rootNodes;
  }

  /** 解析 `<view class="a" wx:if="{{x}}">` 里的标签名与属性 */
  function parseTag(raw) {
    var m = /^([^\s/>]+)/.exec(raw.trim());
    if (!m) return { name: '', attrs: {} };
    var name = m[1];
    var attrs = {};
    var rest = raw.trim().slice(name.length);
    var re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    var a;
    while ((a = re.exec(rest))) {
      var key = a[1];
      if (!key || key === '/') continue;
      var val = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : '');
      attrs[key] = val;
    }
    return { name: name, attrs: attrs };
  }

  /* ------------------------------ 表达式求值 ------------------------------ */

  var EVAL_CACHE = {};

  function evalCache(expr) {
    if (!EVAL_CACHE[expr]) {
      /* eslint-disable no-new-func */
      // with + Proxy：作用域里没有的变量解析为 undefined，而不是抛 ReferenceError
      EVAL_CACHE[expr] = new Function('$s', 'with($s){return (' + expr + ');}');
    }
    return EVAL_CACHE[expr];
  }

  function makeScope(obj) {
    var target = obj || {};
    return new Proxy(target, {
      has: function (t, k) {
        if (Object.prototype.hasOwnProperty.call(t, k)) return true;
        // 未声明的标识符交给外层（globalThis），这样 Math / JSON 之类仍可用
        return !(k in globalThis);
      },
      get: function (t, k) { return t[k]; }
    });
  }

  function evalExpr(expr, scope) {
    try {
      return evalCache(expr)(scope);
    } catch (e) {
      // 表达式跑不动时不要整页崩：返回空串，并记进统计（预览页会把计数显示出来）
      note('exprFail', '{{' + expr + '}} ' + (e && e.message));
      return '';
    }
  }

  var MUSTACHE = /\{\{([\s\S]*?)\}\}/g;

  /**
   * 编译期统计
   *
   * 「表达式求值失败 / 遇到没支持的自定义组件 / include 没解析」这三类问题
   * 都会让预览**静默少一块内容**，光看截图不一定发现得了。
   * 统一计数，由预览页显示出来、自检读取断言 —— 宁可显眼地报出来，也不要悄悄少一块。
   */
  var STATS = { exprFail: 0, unsupportedTag: 0, missingInclude: 0, samples: [] };

  function note(kind, detail) {
    STATS[kind] = (STATS[kind] || 0) + 1;
    if (STATS.samples.length < 8) STATS.samples.push(kind + ': ' + detail);
  }

  function resetStats() {
    STATS.exprFail = 0;
    STATS.unsupportedTag = 0;
    STATS.missingInclude = 0;
    STATS.samples = [];
  }

  /** 求值一段可能含 {{}} 的字符串 */
  function interpolate(str, scope) {
    if (str == null) return '';
    if (str.indexOf('{{') === -1) return str;
    return String(str).replace(MUSTACHE, function (m, expr) {
      var v = evalExpr(expr, scope);
      return v == null ? '' : String(v);
    });
  }

  /** 判断属性值是不是「整段就是一个 {{}}」（用于取原始值，比如数组、布尔） */
  function wholeExpr(str) {
    var m = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(str);
    return m ? m[1] : null;
  }

  /** 属性求值：整段插值时保留原始类型，否则按字符串拼接 */
  function attrValue(raw, scope) {
    var e = wholeExpr(raw);
    if (e !== null) return evalExpr(e, scope);
    return interpolate(raw, scope);
  }

  /* ------------------------------ 渲染 ------------------------------ */

  /** 需要保留并转成 data-* 的内置组件属性 */
  function builtinAttrs(tag, attrs, scope) {
    var out = [];
    if (tag === 'image') {
      var mode = attrs.mode ? String(attrValue(attrs.mode, scope) || 'scaleToFill') : 'scaleToFill';
      out.push(['data-mode', mode]);
    }
    if (tag === 'scroll-view') {
      if (truthy(attrs['scroll-y'], scope)) out.push(['data-scroll-y', '1']);
      if (truthy(attrs['scroll-x'], scope)) out.push(['data-scroll-x', '1']);
      // show-scrollbar="{{false}}" 要真的求值：字面量比对会把 {{false}} 当成 true，
      // 于是真机不显示滚动条、预览里却挂着一根灰条。
      if (attrs['show-scrollbar'] !== undefined && !truthy(attrs['show-scrollbar'], scope)) {
        out.push(['data-scroll-hidden', '1']);
      }
    }
    if (tag === 'swiper') {
      out.push(['data-swiper', '1']);
      if (truthy(attrs['indicator-dots'], scope)) {
        out.push(['data-indicator-dots', '1']);
        if (attrs['indicator-active-color']) {
          out.push(['data-indicator-active', String(attrValue(attrs['indicator-active-color'], scope))]);
        }
      }
    }
    if (tag === 'swiper-item') out.push(['data-swiper-item', '1']);
    return out;
  }

  /**
   * 求一个属性的真假值
   *
   * 整段是 {{...}} 时必须**真的求值**（`{{false}}` → false、`{{!x}}` → 取反），
   * 不能只看「属性存在」。曾经就是这么错的：`show-scrollbar="{{false}}"`
   * 被当成 true，真机不显示的滚动条在预览里一直挂着。
   */
  function truthy(raw, scope) {
    if (raw === undefined) return false;
    var e = wholeExpr(String(raw));
    if (e !== null) return !!evalExpr(e, scope);
    var s = String(raw).trim();
    if (s === '') return true;
    return s !== 'false' && s !== '0';
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * 渲染节点数组
   * @param {Array}  nodes
   * @param {object} scope
   * @param {object} opts   { components, include, swiperIndex, runtime }
   */
  function renderNodes(nodes, scope, opts) {
    var out = '';
    var chainTaken = false; // 同级 wx:if / wx:elif / wx:else 链是否已被前面的分支命中

    for (var k = 0; k < nodes.length; k += 1) {
      var node = nodes[k];

      if (node.type === 'text') {
        out += escText(interpolate(node.text, scope));
        continue;
      }

      var attrs = node.attrs || {};

      /* ---- wx:for：先展开，再处理 wx:if ---- */
      if (attrs['wx:for'] !== undefined) {
        var list = attrValue(attrs['wx:for'], scope);
        var itemName = attrs['wx:for-item'] || 'item';
        var indexName = attrs['wx:for-index'] || 'index';
        var iterable = Array.isArray(list) ? list : (list && typeof list === 'object' ? Object.keys(list) : []);
        var htmlFor = '';
        for (var idx = 0; idx < iterable.length; idx += 1) {
          var child = Object.assign({}, scope);
          child[itemName] = Array.isArray(list) ? list[idx] : list[iterable[idx]];
          child[indexName] = Array.isArray(list) ? idx : iterable[idx];
          // 同一个节点再去掉 wx:for，避免递归展开
          var stripped = { type: 'element', tag: node.tag, attrs: stripFor(attrs), children: node.children };
          htmlFor += renderNodes([stripped], makeScope(child), opts);
        }
        out += htmlFor;
        continue;
      }

      /* ---- wx:if / wx:elif / wx:else ---- */
      var hasIf = attrs['wx:if'] !== undefined;
      var hasElif = attrs['wx:elif'] !== undefined || attrs['wx:else-if'] !== undefined;
      var hasElse = attrs['wx:else'] !== undefined;

      if (hasIf || hasElif || hasElse) {
        if (hasElse) {
          if (chainTaken) { chainTaken = false; continue; }
          chainTaken = false;
        } else {
          var cond = condValue(hasIf ? attrs['wx:if'] : (attrs['wx:elif'] || attrs['wx:else-if']), scope);
          if (!cond) { chainTaken = true; continue; }
          chainTaken = false;
        }
        var kept = stripConditional(attrs);
        out += renderNodes([{ type: 'element', tag: node.tag, attrs: kept, children: node.children }], scope, opts);
        continue;
      }
      chainTaken = false;

      out += renderElement(node, attrs, scope, opts);
    }
    return out;
  }

  function condValue(raw, scope) {
    var e = wholeExpr(String(raw));
    if (e !== null) return !!evalExpr(e, scope);
    var s = String(raw).trim();
    if (s === '') return true;
    return s !== 'false' && s !== '0';
  }

  function stripFor(attrs) {
    var o = Object.assign({}, attrs);
    delete o['wx:for']; delete o['wx:for-item']; delete o['wx:for-index']; delete o['wx:key'];
    return o;
  }

  function stripConditional(attrs) {
    var o = Object.assign({}, attrs);
    delete o['wx:if']; delete o['wx:elif']; delete o['wx:else-if']; delete o['wx:else'];
    return o;
  }

  function renderElement(node, attrs, scope, opts) {
    var tag = node.tag;

    /* ---- include：把目标文件的内容就地展开（首页与自定义页共用 blocks.wxml 靠它） ---- */
    if (tag === 'include') {
      var src = attrValue(attrs.src || '', scope);
      var nodes = opts.include ? opts.include(src) : null;
      if (!nodes) {
        note('missingInclude', src);
        return '<!-- include 未解析：' + escAttr(src) + ' -->';
      }
      return renderNodes(nodes, scope, opts);
    }

    /* ---- block：虚拟节点，只渲染子节点 ---- */
    if (tag === 'block') {
      return renderNodes(node.children, scope, opts);
    }

    /* ---- 自定义组件 ---- */
    if (!TAG_MAP[tag]) {
      var comp = opts.components && opts.components[tag];
      if (!comp) {
        note('unsupportedTag', tag);
        return '<!-- 未支持的自定义组件：' + escAttr(tag) + ' -->';
      }
      var cs = Object.assign({}, comp.props || {});
      Object.keys(attrs).forEach(function (a) {
        if (/^wx:/.test(a) || DROP_ATTR.test(a) || DROP_EXACT[a]) return;
        cs[a] = attrValue(attrs[a], scope);
      });
      // 组件内 <slot> 暂不支持（本项目未用到）
      return '<div class="mp-comp mp-comp-' + escAttr(tag) + '">' +
        renderNodes(comp.nodes, makeScope(cs), opts) + '</div>';
    }

    var html = TAG_MAP[tag];
    var buf = '<' + html;
    var styleParts = [];

    var pairs = builtinAttrs(tag, attrs, scope);
    pairs.forEach(function (p) { buf += ' ' + p[0] + '="' + escAttr(p[1]) + '"'; });

    Object.keys(attrs).forEach(function (a) {
      if (/^wx:/.test(a) || DROP_ATTR.test(a) || DROP_EXACT[a]) return;
      if (/^data-/.test(a)) return;
      if (a === 'mode' || a === 'scroll-y' || a === 'scroll-x' || a === 'indicator-dots') return;
      if (a === 'show-scrollbar' || a === 'indicator-active-color') return;

      var v = attrValue(attrs[a], scope);

      if (a === 'class') { buf += ' class="' + escAttr(v) + '"'; return; }
      if (a === 'style') {
        // 内联样式里的 rpx 是「设计稿单位」，同样要换算，否则高度会差 2 倍
        var st = String(v == null ? '' : v);
        if (root.MpWxss && root.MpWxss.rpx2px) st = root.MpWxss.rpx2px(st);
        styleParts.push(st);
        return;
      }
      if (a === 'src') { buf += ' src="' + escAttr(v) + '"'; return; }
      if (a === 'hidden') { return; }
      if (v === false || v === undefined || v === null || v === '') return;
      buf += ' ' + a + '="' + escAttr(v === true ? '' : v) + '"';
    });

    if (styleParts.length) buf += ' style="' + escAttr(styleParts.join(';')) + '"';

    /* ---- swiper 只显示当前页，并补上真机的原生指示点 ---- */
    if (tag === 'swiper') {
      var items = collectSwiperItems(node.children, scope, opts);
      if (items.length) {
        var cur = opts.swiperIndex || 0;
        if (cur < 0 || cur >= items.length) cur = 0;
        var inner = items.map(function (h, ii) {
          return h.replace(/^<([a-z]+)([^>]*)data-swiper-item="1"/, function (m, t, rest) {
            return '<' + t + rest + 'data-swiper-item="1"' + (ii === cur ? ' data-on="1"' : '');
          });
        }).join('');
        var dots = attrs['indicator-dots'] !== undefined && condValue(attrs['indicator-dots'], scope)
          ? '<div class="mp-dots">' + items.map(function (h, ii) {
            return '<i class="' + (ii === cur ? 'on' : '') + '"></i>';
          }).join('') + '</div>'
          : '';
        return buf + '>' + inner + dots + '</div>';
      }
    }

    if (html === 'img' || html === 'input') return buf + '>';

    return buf + '>' + renderNodes(node.children, scope, opts) + '</' + html + '>';
  }

  /**
   * swiper 的每一项单独渲染
   *
   * 单独渲染而不是先整体渲染再切分，是因为每一项内部可能有自己的 wx:for / wx:if；
   * 先渲染再切分会把这些已经展开的内容当成字符串处理，容易误伤。
   */
  function collectSwiperItems(children, scope, opts) {
    var html = renderNodes(children, scope, opts);
    // 顶层每一项都是一个 swiper-item 元素，按标签边界切开
    var out = [];
    var re = /<(div|img|span|a|button)\b[^>]*data-swiper-item="1"[^>]*>/g;
    var idx = [];
    var m;
    while ((m = re.exec(html))) idx.push(m.index);
    if (!idx.length) return out;
    for (var i = 0; i < idx.length; i += 1) {
      var start = idx[i];
      var end = i + 1 < idx.length ? idx[i + 1] : html.length;
      out.push(html.slice(start, end).trim());
    }
    return out;
  }

  /** 编译入口：WXML 源码 → { nodes, warns } */
  function compile(src) {
    return parse(String(src || ''));
  }

  root.MpWxml = {
    parse: parse,
    compile: compile,
    render: renderNodes,
    interpolate: interpolate,
    attrValue: attrValue,
    makeScope: makeScope,
    resetStats: resetStats,
    stats: STATS,
    TAG_MAP: TAG_MAP
  };
})(typeof window !== 'undefined' ? window : this);
