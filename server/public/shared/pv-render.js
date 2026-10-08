/* =========================================================================
 * 页面预览渲染核心 —— 「页面数据 → HTML」的唯一实现
 *
 * 为什么要单独抽一份：
 *   同一份装修数据有两个消费场景 ——
 *     ① 装修台（/admin）编辑器里的手机预览：需要选中态、悬浮操作条、区块类型角标、跳转角标；
 *     ② 前端预览页（/preview）：发布后看线上效果，必须是**干净的真机观感**，不能有任何编辑装饰。
 *   两者若各写一套渲染，改一处漏一处，预览就会和真机逐渐走样（本项目已经因为
 *   「同一份数据两处消费」踩过高度单位二次换算的坑）。所以这里做成一份，
 *   用 `edit` 开关区分两种形态 —— 编辑态严格保持装修台原有输出不变。
 *
 * 两种形态的差异仅三处（其余全部共用）：
 *   edit=true   → 选中态 active 类、区块类型角标 .pv-tag、悬浮操作条 .pv-ops、跳转角标 .pv-link
 *   edit=false  → 以上全无（真机不会有这些），纯粹展示
 *
 * 单位口径（必须与小程序端一致，否则预览与真机不同，见 miniprogram/utils/units.js）：
 *   - height（轮播 / 视频 / 辅助分割 / 热区）= rpx（750 宽基准），预览里 ÷2；
 *   - pageMargin / paddingY / iconSize / gap / imageGap 等 = 375 基准 px，预览原样用，小程序端 ×2。
 * ========================================================================= */
(function (root) {
  'use strict';

  /** 渲染上下文：编辑态与展示态的唯一差异来源 */
  var CTX = { edit: false, sel: '', slide: {}, brand: 0 };

  /** 跳转目标清单（装修台从 /api/decorate/link-options 加载），仅编辑态的角标文案需要 */
  var LINK_OPTS = null;

  function configure(o) {
    o = o || {};
    CTX.edit = !!o.edit;
    CTX.sel = o.sel || '';
    CTX.slide = o.slide || {};
    CTX.brand = Number(o.brand) || 0;
  }

  /* ----------------------------- 工具 ----------------------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function attr(s) { return esc(s).replace(/'/g, '&#39;'); }

  /** 编辑态的选中态类名；展示态永远没有选中态 */
  function cls(p) { return (CTX.edit && CTX.sel === p) ? ' active' : ''; }

  function img(u, style, extra) {
    if (!u) return '<div style="background:#f0f2f5;color:#8a919e;display:flex;align-items:center;justify-content:center;' + (style || 'height:120px') + '">未设置图片</div>';
    return '<img src="' + attr(u) + '" style="' + (style || '') + '" ' + (extra || '') + '>';
  }

  /**
   * 轮播图的两种历史结构：老数据是地址字符串，新数据是 { image, link }。
   * 预览统一按新结构处理，老数据也不会画错。
   */
  function normImgs(list) {
    return (list || [])
      .map(function (x) {
        if (typeof x === 'string') return { image: x, link: '' };
        return { image: (x && x.image) || '', link: (x && x.link) || '' };
      })
      .filter(function (x) { return x.image; });
  }

  /**
   * 富文本预览：与小程序端 utils/blocks.js 的 sanitizeRich() 保持同一套过滤规则。
   *
   * 预览会把内容 innerHTML 进 DOM，所以这里的过滤不是为了「好看」，
   * 而是防止运营粘贴进来的 HTML 里带 <script> / onerror= 之类把页面打挂。
   * 小程序端用的是同一份规则（那边过滤后交给 rich-text，本身不执行脚本）。
   */
  function pvRich(html) {
    return String(html || '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }

  /** 把存下来的跳转路径翻译成人看得懂的名字（装修台属性面板与预览角标共用） */
  function linkLabel(link) {
    var s = String(link === undefined || link === null ? '' : link).trim();
    if (!s) return '';
    if (s.indexOf('tel:') === 0) return '拨打电话 ' + s.slice(4);
    if (/^https?:\/\//.test(s)) return '网页链接';
    var all = [];
    if (LINK_OPTS) all = (LINK_OPTS.pages || []).concat(LINK_OPTS.goods || [], LINK_OPTS.news || []);
    for (var i = 0; i < all.length; i++) { if (all[i].path === s) return all[i].name; }
    if (s.indexOf('/packageGoods/detail') === 0) return '商品详情';
    if (s.indexOf('/packageNews/detail') === 0) return '资讯内容页';
    if (s.indexOf('/pages/custom/index') === 0) return '自定义页';
    return '页面';
  }

  /** 跳转角标：**仅编辑态**，给「已设置跳转」的元素一个一眼能认出来的标记（真机不会有） */
  function linkBadge(link) {
    if (!CTX.edit || !link) return '';
    var s = String(link);
    var ico = s.indexOf('tel:') === 0 ? '📞' : (/^https?:\/\//.test(s) ? '🌐' : '🔗');
    return '<span class="pv-link" title="点击后跳转：' + attr(s) + '">' + ico + ' ' + esc(linkLabel(s)) + '</span>';
  }

  /**
   * 「已设跳转」小圆点角标：**仅编辑态**（真机不会有这个 🔗）
   *
   * withPath === false 时只显示标签、不拼路径 —— 双列轮播的缩略图地方太窄，
   * 老实现就一直只写「已设跳转」，这里保持原样（不然装修台预览会有无谓的视觉变化）。
   */
  function linkDot(link, label, withPath) {
    if (!CTX.edit || !link) return '';
    var tip = withPath === false ? (label || '已设跳转') : ((label || '跳转') + '：' + attr(link));
    return '<span class="pv-link dot" title="' + tip + '">🔗</span>';
  }

  /** 分组/系列说明角标（如「莱克 · 分组 1」）：**仅编辑态** */
  function groupTag(text) {
    if (!CTX.edit) return '';
    return '<span class="pv-tag">' + text + '</span>';
  }

  /** 悬浮操作条：**仅编辑态**（对标有赞预览区右侧的圆形按钮） */
  function opsBar(path, listPath, index) {
    if (!CTX.edit || listPath == null) return '';
    return '<div class="pv-ops">' +
      '<button data-op="up" data-path="' + attr(path) + '" data-list="' + attr(listPath) + '" data-index="' + index + '" title="上移">↑</button>' +
      '<button data-op="down" data-path="' + attr(path) + '" data-list="' + attr(listPath) + '" data-index="' + index + '" title="下移">↓</button>' +
      '<button data-op="dup" data-path="' + attr(path) + '" data-list="' + attr(listPath) + '" data-index="' + index + '" title="复制">⧉</button>' +
      '<button class="danger" data-op="del" data-path="' + attr(path) + '" data-list="' + attr(listPath) + '" data-index="' + index + '" title="删除">✕</button>' +
      '</div>';
  }

  /** 区块类型角标：**仅编辑态**（有赞预览里的「图片广告 1」这种标签） */
  var KIND_LABEL = {
    swiper: '图片广告', image: '图片', video: '视频', title: '标题文本', line: '辅助分割',
    notice: '公告', nav: '图文导航', cube: '魔方', hotspot: '热区切图', shop: '店铺信息',
    goods: '商品', rich_text: '富文本', search: '商品搜索', elevator: '电梯导航',
    enter_shop: '进入店铺', audio: '语音', service: '在线客服', content_card: '内容卡片',
    buy_bar: '购买按钮'
  };
  function kindTag(kind, i) {
    if (!CTX.edit) return '';
    return '<span class="pv-tag">' + esc(KIND_LABEL[kind] || kind) + ' ' + (i + 1) + '</span>';
  }

  /* --------------------------- 区块渲染 --------------------------- */

  /**
   * 渲染单个区块到 375 宽（≈ 手机 CSS px）的预览画布。
   * 覆盖装修台已接入的全部区块类型（server/decorate/schema.js 的 HOME_BLOCK_KINDS）。
   */
  function pvBlock(b, i) {
    var p = 'blocks.' + i;
    var listPath = 'blocks';
    var box = '<div class="pv-block' + cls(p) + '" data-path="' + p + '" style="position:relative">';
    var kind = b.type;

    if (kind === 'swiper') {
      var mode = b.mode || 'poster';
      var hh = Math.round((b.height || 1322) / 2);
      var imgs = normImgs(b.images);
      // 预览里的当前页：点指示点/缩略图可翻页，方便确认新加的图在第几张
      var cur = Math.min(Math.max(0, CTX.slide[p] || 0), Math.max(0, imgs.length - 1));
      var curImg = imgs[cur] || {};
      if (mode === 'single') {
        box += '<div style="padding:0 ' + (b.pageMargin || 0) + 'px;position:relative">' +
          img(curImg.image, 'width:100%;display:block;font-size:0') + linkBadge(curImg.link) + '</div>';
      } else if (mode === 'scroll') {
        box += '<div style="display:flex;overflow:hidden;height:' + hh + 'px;padding:0 ' + (b.pageMargin || 0) + 'px">' +
          imgs.slice(0, 3).map(function (x) {
            return '<div style="flex:0 0 62%;margin-right:' + (b.imageGap || 0) + 'px;position:relative">' +
              img(x.image, 'width:100%;height:' + hh + 'px;object-fit:cover') + linkBadge(x.link) + '</div>';
          }).join('') + '</div>';
      } else if (mode === 'double') {
        box += '<div style="padding:0 ' + (b.pageMargin || 0) + 'px">' +
          '<div style="position:relative">' + img(curImg.image, 'width:100%;height:' + hh + 'px;object-fit:cover') + linkBadge(curImg.link) + '</div>' +
          '<div style="display:flex;gap:4px;margin-top:4px">' +
          imgs.slice(0, 5).map(function (x, k) {
            return '<div data-slide="' + k + '" data-path="' + p + '" title="看第 ' + (k + 1) + ' 张" style="flex:1;cursor:pointer;border:' + (k === cur ? '1px solid #155bd4' : '1px solid #eee') + ';border-radius:2px;overflow:hidden;position:relative">' +
              img(x.image, 'width:100%;height:34px;object-fit:cover') + linkDot(x.link, '已设跳转', false) + '</div>';
          }).join('') + '</div></div>';
      } else {
        box += '<div style="height:' + hh + 'px;padding:0 ' + (b.pageMargin || 0) + 'px;position:relative">' +
          img(curImg.image, 'width:100%;height:100%;object-fit:cover;border-radius:' + (b.radius === 'round' ? '8px' : '0')) +
          linkBadge(curImg.link) +
          '<div class="pv-dots">' + imgs.map(function (x, k) {
            return '<i data-slide="' + k + '" data-path="' + p + '" title="看第 ' + (k + 1) + ' 张"' + (k === cur ? ' class="on"' : '') + '></i>';
          }).join('') + '</div></div>';
      }
    } else if (kind === 'image') {
      box += '<div style="padding:0 ' + (b.pageMargin || 0) + 'px;position:relative">' +
        img(b.src, 'width:100%;display:block;border-radius:' + (b.radius === 'round' ? '8px' : '0')) + linkBadge(b.link) + '</div>';
    } else if (kind === 'video') {
      box += '<div style="height:' + Math.round((b.height || 420) / 2) + 'px;padding:0 ' + (b.pageMargin || 0) + 'px;position:relative">' +
        img(b.poster, 'width:100%;height:100%;object-fit:cover') + '<div class="pv-play">▶</div></div>';
    } else if (kind === 'title') {
      var sizeCls = { sm: 'sm', md: '', lg: 'lg' }[b.size || 'md'];
      box += '<div class="pv-title" style="padding:' + (b.paddingY || 16) + 'px ' + (b.pageMargin || 12) + 'px;text-align:' + (b.align || 'left') + ';background:' + (b.bg || 'transparent') + ';position:relative">' +
        '<div class="t1 ' + sizeCls + '" style="color:' + (b.color || '#222') + ';font-weight:' + (b.bold ? 600 : 400) + '">' + esc(b.text || '（未填标题）') + '</div>' +
        (b.sub ? '<div class="t2">' + esc(b.sub) + '</div>' : '') + linkBadge(b.link) + '</div>';
    } else if (kind === 'line') {
      var lh = Math.round((b.height || 20) / 2);
      if ((b.style || 'blank') === 'blank') {
        box += '<div class="pv-blank" style="height:' + lh + 'px;margin:0 ' + (b.pageMargin || 12) + 'px"></div>';
      } else {
        box += '<div style="padding:0 ' + (b.pageMargin || 12) + 'px">' +
          '<div style="border-top:' + Math.max(1, Math.round((b.height || 2) / 2)) + 'px ' + (b.style === 'dashed' ? 'dashed' : 'solid') + ' ' + (b.color || '#eee') + '"></div></div>';
      }
    } else if (kind === 'notice') {
      box += '<div class="pv-notice" style="margin:6px ' + (b.pageMargin || 12) + 'px;color:' + (b.color || '#8A5A2B') + ';background:' + (b.bg || '#FFF7E6') + '">' +
        (b.icon ? '<span>📢</span>' : '') + '<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(b.text || '（未填公告）') + '</span>' +
        linkDot(b.link, '整块跳转') + '</div>';
    } else if (kind === 'nav') {
      var cols = Number(b.cols) || 4;
      box += '<div class="pv-navrow" style="background:' + (b.bg || '#fff') + ';padding:6px 0">' +
        (b.items || []).map(function (it) {
          return '<div class="it" style="width:' + (100 / cols) + '%;position:relative">' +
            (it.image ? '<img src="' + attr(it.image) + '" alt="">' : '<div style="width:34px;height:34px;background:#f0f2f5;border-radius:6px"></div>') +
            '<span>' + esc(it.text || '') + '</span>' +
            linkDot(it.link, '跳转') + '</div>';
        }).join('') + '</div>';
    } else if (kind === 'cube') {
      var c = Number(b.cols) || 2;
      box += '<div class="pv-cube">' + (b.items || []).map(function (it) {
        return '<div class="cc" style="width:' + (100 / c) + '%;position:relative">' + img(it.image, '') +
          linkDot(it.link, '跳转') + '</div>';
      }).join('') + '</div>';
    } else if (kind === 'hotspot') {
      box += '<div class="pv-hot" style="height:' + Math.round((b.height || 500) / 2) + 'px;margin:0 ' + (b.pageMargin || 0) + 'px">' +
        img(b.src, 'width:100%;height:100%;object-fit:cover') +
        (b.areas || []).map(function (a) {
          return '<div class="area" style="left:' + (a.x || 0) + '%;top:' + (a.y || 0) + '%;width:' + (a.w || 20) + '%;height:' + (a.h || 20) + '%">' +
            linkDot(a.link, '跳转') + '</div>';
        }).join('') + '</div>';
    } else if (kind === 'shop') {
      box += '<div style="display:flex;align-items:center;gap:10px;padding:14px;margin:0 ' + (b.pageMargin || 12) + 'px;background:' + (b.bg || '#fff') + ';justify-content:' + (b.align === 'left' ? 'flex-start' : 'center') + ';position:relative">' +
        (b.style !== 'text' && b.avatar ? '<img src="' + attr(b.avatar) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover">' : '') +
        '<div><div style="font-size:14px;font-weight:600">' + esc(b.name || '') + '</div>' +
        '<div style="font-size:11px;color:#8a919e">' + esc(b.slogan || '') + '</div></div>' +
        linkBadge(b.link) + '</div>';
    } else if (kind === 'goods') {
      var gc = Number(b.cols) || 2;
      var n = Math.min(Number(b.limit) || 4, 6);
      var cells = '';
      for (var k = 0; k < n; k++) {
        cells += '<div class="gc" style="width:' + (100 / gc) + '%"><div class="card">' +
          '<div style="height:130px;background:#f0f2f5"></div>' +
          (b.showTitle ? '<div class="nm">商品名称占位</div>' : '') +
          (b.showPrice ? '<div class="pr">¥0.00</div>' : '') +
          '</div></div>';
      }
      box += '<div class="pv-goods">' + (b.title ? '<div class="gt">' + esc(b.title) + '</div>' : '') +
        '<div class="gg">' + cells + '</div>' +
        '<div class="empty">商品数据由后端 /api/goods/list 实时提供，小程序端渲染真实商品</div></div>';
    } else if (kind === 'rich_text') {
      // full='0'（隐藏全屏）= 保留页面边距；full='1' = 内容占满整宽（与小程序端 normalize 同规则）
      var richPad = b.full === '0' ? (b.pageMargin || 12) : 0;
      var richHtml = pvRich(b.html);
      box += '<div class="pv-rich" style="padding:8px ' + richPad + 'px;background:' + (b.bg || 'transparent') + '">' +
        (richHtml ? richHtml : '<div style="color:#b8bec8;font-size:12px;padding:12px 0">（未填内容）支持 HTML，如 &lt;p&gt;文字&lt;/p&gt;</div>') +
        '</div>';
    } else if (kind === 'search') {
      var sH = b.boxHeight || 36;
      var sMargin = b.pageMargin || 12;
      var sRound = (b.shape || 'square') === 'round' ? 999 : 4;
      var sCenter = (b.textAlign || 'left') === 'center';
      var sSticky = (b.sticky || 'normal') === 'sticky';
      box += '<div style="padding:6px ' + sMargin + 'px;background:' + (b.bg || '#FFFFFF') + '">' +
        (sSticky ? '<div style="font-size:10px;color:#8a919e;margin-bottom:2px">吸顶</div>' : '') +
        '<div style="height:' + sH + 'px;background:' + (b.boxBg || '#F5F6F8') + ';border-radius:' + sRound + 'px;' +
        'display:flex;align-items:center;gap:6px;padding:0 10px;' +
        'justify-content:' + (sCenter ? 'center' : 'flex-start') + '">' +
        '<span style="font-size:12px">🔍</span>' +
        '<span style="flex:1;font-size:12px;color:' + (b.color || '#999999') + ';text-align:' + (sCenter ? 'center' : 'left') + ';' +
        'overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(b.placeholder || '搜索店内商品') + '</span>' +
        (b.scan ? '<span style="font-size:12px">⌗</span>' : '') +
        '</div>' +
        ((b.mode || 'input') === 'link' ? (b.link ? linkBadge(b.link) : '<div style="font-size:10px;color:#d46b08;margin-top:2px">整块跳转：未设置跳转链接</div>') : '') +
        '</div>';
    } else if (kind === 'elevator') {
      var eItems = (b.items || []).filter(function (x) { return x && x.text; });
      var eStyle = b.tagStyle || 'bg';
      var eAct = Number(b.activeIndex) || 0;
      var ePad = b.pageMargin || 0;
      var eTag = function (it, k) {
        var on = k === eAct;
        var st = 'color:' + (on ? (b.activeColor || '#C8102E') : (b.color || '#323233')) + ';';
        if (eStyle === 'bg') st += 'background:' + (on ? (b.activeColor || '#C8102E') : '#F5F6F8') + ';color:' + (on ? '#fff' : (b.color || '#323233')) + ';border-radius:4px;padding:4px 8px;';
        else if (eStyle === 'round') st += 'border:1px solid ' + (on ? (b.activeColor || '#C8102E') : '#e5e6eb') + ';border-radius:999px;padding:3px 8px;';
        else if (eStyle === 'square') st += 'border:1px solid ' + (on ? (b.activeColor || '#C8102E') : '#e5e6eb') + ';padding:3px 8px;';
        else st += 'border-bottom:2px solid ' + (on ? (b.activeColor || '#C8102E') : 'transparent') + ';padding:4px 2px;';
        return '<span style="' + st + 'font-size:12px;white-space:nowrap" title="定位到区块 ' + (Number(it.target) || 0) + '">' + esc(it.text) + '</span>';
      };
      box += '<div style="background:' + (b.bg || '#FFFFFF') + ';padding:6px ' + ePad + 'px">' +
        (eItems.length
          ? '<div style="display:flex;gap:6px;overflow:hidden;' + (b.mode === 'dropdown' ? 'flex-direction:column' : 'align-items:center') + '">' +
            eItems.slice(0, 12).map(eTag).join('') + '</div>'
          : '<div style="color:#b8bec8;font-size:12px;padding:8px 0">（未添加标签）</div>') +
        (b.mode === 'dropdown' ? '<div style="font-size:10px;color:#8a919e;margin-top:2px">下拉展示</div>' : '') +
        '</div>';
    } else if (kind === 'enter_shop' || kind === 'service') {
      var isSvc = kind === 'service';
      var bJustify = b.align === 'right' ? 'flex-end' : (b.align === 'left' ? 'flex-start' : 'center');
      var bRound = (b.radius || 'round') !== 'square' ? 999 : 4;
      var bTxt = b.text || (isSvc ? '在线咨询' : '进入店铺');
      var bBg = b.bg || (isSvc ? '#07C160' : '#FFFFFF');
      var bFg = b.color || (isSvc ? '#FFFFFF' : '#323233');
      box += '<div style="padding:10px ' + (b.pageMargin || 12) + 'px;background:' + (b.bgOut || 'transparent') + ';display:flex;justify-content:' + bJustify + '">' +
        '<span style="display:inline-block;padding:7px 18px;font-size:13px;border-radius:' + bRound + 'px;' +
        'background:' + bBg + ';color:' + bFg + ';border:1px solid ' + (isSvc ? 'transparent' : '#e5e6eb') + '">' +
        esc(bTxt) + (isSvc ? ' 💬' : '') + '</span>' +
        (b.link ? linkBadge(b.link) : '') +
        (isSvc ? '<span style="font-size:10px;color:#8a919e;margin-left:6px;align-self:center">唤起微信客服</span>' : '') +
        '</div>';
    } else if (kind === 'audio') {
      var aDur = Number(b.duration) || 6;
      // 与小程序端一致：宽度随时长增长，220~520rpx 之间
      var aW = Math.max(220, Math.min(520, 160 + aDur * 24)) / 2;
      var aRight = b.side === 'right';
      var aAv = b.avatar;
      box += '<div class="pv-audio' + (aRight ? ' right' : '') + '" style="padding:8px ' + (b.pageMargin || 16) + 'px">' +
        (aAv ? '<img src="' + attr(aAv) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex:0 0 auto">'
             : '<div style="width:32px;height:32px;border-radius:50%;background:#f0f2f5;flex:0 0 auto"></div>') +
        '<div style="width:' + aW + 'px;min-height:32px;display:flex;align-items:center;gap:6px;padding:0 10px;border-radius:6px;' +
        'background:' + (aRight ? '#95EC69' : '#fff') + ';border:1px solid #eceef1;' +
        (aRight ? 'order:-1;' : '') + '">' +
        (b.text ? '<span style="font-size:12px;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(b.text) + '</span>' : '') +
        '<span style="font-size:11px;color:#8a919e">' + aDur + '″</span>' +
        '<span style="font-size:11px">▶</span></div>' +
        (b.src ? '' : '<span style="font-size:10px;color:#d46b08;align-self:center">未设置音频地址</span>') +
        '</div>';
    } else if (kind === 'content_card') {
      var cCols = Number(b.cols) || 2;
      var cCellW = 100 / cCols;
      var cRatio = Number(b.ratio) || 0.75;
      // 与小程序的 padTopPct 同一算法：4:3 → 133.33（不是 1.33），否则预览里卡片会被压成一条线
      var cPad = Math.round(10000 / cRatio) / 100;
      var cClass = b.style === 'white' ? 'white' : (b.style === 'plain' ? 'plain' : 'shadow');
      var cRound = (b.radius || 'round') !== 'square';
      var cItems = (b.items || []).filter(function (x) { return x && (x.image || x.title); });
      var cCells = cItems.slice(0, cCols === 1 ? 4 : 6).map(function (it) {
        return '<div style="width:' + cCellW + '%;box-sizing:border-box;padding:0 ' + (cCols === 1 ? 0 : 3) + 'px;margin-bottom:6px">' +
          '<div class="pv-ccard ' + cClass + (cRound ? ' round' : '') + '">' +
          '<div style="position:relative;padding-top:' + cPad + '%;background:#f5f6f8">' +
          (it.image ? '<img src="' + attr(it.image) + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : '') +
          '</div><div style="padding:6px">' +
          (it.title ? '<div style="font-size:12px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.title) + '</div>' : '') +
          (it.desc ? '<div style="font-size:11px;color:#8a919e;margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.desc) + '</div>' : '') +
          ((b.showTag || b.showRead || b.showLike)
            ? '<div style="margin-top:4px;display:flex;gap:6px;font-size:10px;color:#8a919e">' +
              (b.showTag ? '<span style="background:#f2f3f5;border-radius:3px;padding:0 4px">笔记</span>' : '') +
              (b.showRead ? '<span>👁 0</span>' : '') + (b.showLike ? '<span>♡ 0</span>' : '') + '</div>'
            : '') +
          '</div>' + (it.link ? linkBadge(it.link) : '') + '</div></div>';
      }).join('');
      box += '<div style="padding:6px ' + (b.pageMargin || 12) + 'px">' +
        (b.title ? '<div style="font-size:13px;font-weight:600;margin-bottom:6px">' + esc(b.title) + '</div>' : '') +
        (cItems.length ? '<div style="display:flex;flex-wrap:wrap;margin:0 -3px">' + cCells + '</div>'
                       : '<div style="color:#b8bec8;font-size:12px;padding:8px 0">（未添加卡片）</div>') +
        (b.more ? '<div style="text-align:center;font-size:12px;color:#8a919e;padding-top:6px">' +
          esc(b.moreText || '查看更多') + ' ›</div>' : '') +
        '</div>';
    } else if (kind === 'buy_bar') {
      var bbOn = b.bgOn !== false;
      var bbBg = b.theme === 'custom' ? (b.btnBg || '#C8102E') : '#C8102E';
      var bbH = (b.bgH || 76) / 2;
      box += '<div style="position:sticky;bottom:0;z-index:5;height:' + bbH + 'px;background:' + (bbOn ? (b.bg || '#FFFFFF') : 'transparent') + ';' +
        'display:flex;align-items:center;justify-content:' + (b.align === 'right' ? 'flex-end' : 'center') + ';' +
        'padding:0 ' + ((b.padX || 16) / 2) + 'px ' + ((b.padB || 14) / 2) + 'px;box-sizing:border-box">' +
        '<span style="display:inline-flex;align-items:center;justify-content:center;' +
        'min-width:120px;height:' + ((b.btnH || 48) / 2) + 'px;border-radius:' + ((b.btnR || 4) / 2) + 'px;' +
        'font-size:' + ((b.fontSize || 16) / 2) + 'px;background:' + bbBg + ';color:#fff;padding:0 16px">' +
        esc(b.text || '立即下单') + '</span>' +
        (b.goodsId ? '<span style="font-size:10px;color:#8a919e;margin-left:6px">→ ' + esc(b.goodsId) + '</span>'
                   : '<span style="font-size:10px;color:#d46b08;margin-left:6px">未填商品 ID</span>') +
        '<span style="font-size:10px;color:#8a919e;margin-left:6px">固定吸底</span>' +
        '</div>';
    }

    box += kindTag(kind, i);
    box += opsBar(p, listPath, i);
    box += '</div>';
    return box;
  }

  /* --------------------------- 各页面渲染 --------------------------- */

  function pvHome(d) {
    var h = '';
    (d.blocks || []).forEach(function (b, i) { h += pvBlock(b, i); });
    h += '<div class="pv-shop pv-block' + (CTX.edit && CTX.sel === 'shop' ? ' active' : '') + '" data-path="__shop__" style="position:relative">' +
      img(d.shop && d.shop.avatar, 'width:56px;height:56px;border-radius:50%;margin:0 auto 8px') +
      '<b>' + esc((d.shop && d.shop.name) || '') + '</b><br><span>' + esc((d.shop && d.shop.slogan) || '') + '</span></div>';
    return h;
  }

  /** 自定义页面预览：只有区块流（不含首页底部的店招卡片） */
  function pvCustom(d) {
    var blocks = d.blocks || [];
    if (!blocks.length) {
      return '<div class="insp-empty" style="padding:56px 16px;line-height:2">' +
        '这个页面还是空的<br><span style="color:#b8bec8">从左侧「组件库」点一个组件开始装修</span></div>';
    }
    var h = '';
    blocks.forEach(function (b, i) { h += pvBlock(b, i); });
    return h;
  }

  function pvLexy(d) {
    var h = '';
    (d.series || []).forEach(function (s, i) {
      var p = 'series.' + i;
      h += '<div class="pv-series pv-block' + cls(p) + '" data-path="' + p + '" style="margin-bottom:10px;position:relative">' +
        '<div style="position:relative">' + img(s.hero, 'width:100%;display:block') + linkBadge(s.link) + '</div>' +
        '<div class="pv-grid g3">' +
        (s.products || []).map(function (g, j) {
          var pp = p + '.products.' + j;
          return '<div class="pv-cell' + cls(pp) + '" data-path="' + pp + '" style="position:relative">' +
            img(g.image, 'width:100%;border:1px solid #eef1f5;border-radius:6px') +
            linkDot(g.link, '跳转') + '</div>';
        }).join('') + '</div>' +
        groupTag(esc(s.name || '') + ' · ' + esc(s.title || '')) + '</div>';
    });
    return h || '<div class="insp-empty">还没有系列，点左侧「+ 添加」新增</div>';
  }

  function pvNews(d) {
    var h = '<div class="pv-head"><div class="en">' + esc(d.en || '') + '</div><div class="zh">' + esc(d.title || '') + '</div></div>';
    h += '<div class="pv-grid g2">' + (d.big || []).map(function (x, i) {
      var p = 'big.' + i;
      return '<div class="pv-cell lbl' + cls(p) + '" data-path="' + p + '">' + img(x.image) + '<span>' + esc(x.label) + '</span></div>';
    }).join('') + '</div>';
    h += '<div class="pv-grid g3">' + (d.small || []).map(function (x, i) {
      var p = 'small.' + i;
      return '<div class="pv-cell lbl' + cls(p) + '" data-path="' + p + '">' + img(x.image) + '<span>' + esc(x.label) + '</span></div>';
    }).join('') + '</div>';
    return h;
  }

  function pvProduct(d) {
    var brands = d.brands || [];
    if (!brands.length) return '<div class="insp-empty">还没有品牌</div>';
    var bi = Math.min(CTX.brand, brands.length - 1);
    var brand = brands[bi];
    var h = '<div class="pv-prod">';
    h += '<div class="pv-nav">' + img(d.navLogo, 'width:100%;padding:6px') + brands.map(function (b, i) {
      return '<div data-path="brand:' + i + '" class="' + (i === bi ? 'on' : '') + '">' + esc(b.name) + '</div>';
    }).join('') + '</div>';
    h += '<div class="right">';
    (brand.groups || []).forEach(function (g, gi) {
      var gp = 'brands.' + bi + '.groups.' + gi;
      h += '<div class="pv-block' + cls(gp) + '" data-path="' + gp + '" style="margin-bottom:10px;position:relative">' +
        '<div class="pv-grouphd" style="position:relative">' + img(g.header) +
        linkDot(g.link, '头图跳转') + '</div>' +
        '<div class="pv-grid g3">' + (g.products || []).map(function (m, mi) {
          var mp = gp + '.products.' + mi;
          return '<div class="pv-cell pv-model' + cls(mp) + '" data-path="' + mp + '" style="position:relative">' +
            img(m.image) + '<b>' + esc(m.model || '') + '</b>' +
            linkDot(m.link, '跳转') + '</div>';
        }).join('') + '</div>' +
        groupTag(esc(brand.name) + ' · 分组 ' + (gi + 1)) + '</div>';
    });
    h += '</div></div>';
    return h;
  }

  function pvMine(d) {
    var s = d.shop || {};
    return '<div class="pv-block' + cls('shop') + '" data-path="__shop__" style="padding:20px 0;position:relative">' +
      '<div class="pv-shop">' + img(s.avatar, 'width:64px;height:64px;border-radius:50%;margin:0 auto 10px') +
      '<b style="font-size:14px">' + esc(s.name || '') + '</b><br><span>' + esc(s.slogan || '') + '</span></div>' +
      '<div class="pv-grid g4" style="padding:14px">' +
      ['我的订单', '优惠券', '我的收藏', '浏览记录'].map(function (t) { return '<div class="pv-cell"><span>' + t + '</span></div>'; }).join('') +
      '</div></div>';
  }

  var PAGE_RENDERERS = { home: pvHome, lexy: pvLexy, news: pvNews, product: pvProduct, mine: pvMine };

  /**
   * 渲染一个页面
   *
   * @param {string} key   页面标识（home / lexy / news / product / mine / 自定义页标识）
   * @param {object} data  页面数据
   * @param {object} opts  { edit, sel, slide, brand, custom }
   * @returns {string} HTML
   *
   * 不吞异常：渲染失败由调用方决定怎么显示（装修台显示「预览渲染失败」，预览页显示错误条）。
   */
  function render(key, data, opts) {
    configure(opts);
    data = data || {};
    var fn = PAGE_RENDERERS[key];
    // 非内置页：装修台的页面带 meta.custom 标记；预览页只知道 key，
    // 所以再兜一层「有 blocks 数组就当区块流页面渲染」，否则自定义页会白屏。
    if (!fn && ((opts && opts.custom) || Array.isArray(data.blocks))) fn = pvCustom;
    if (!fn) return '<div class="insp-empty">该页面暂不支持预览</div>';
    return fn(data);
  }

  root.PvRender = {
    render: render,
    setLinkOptions: function (v) { LINK_OPTS = v || null; },
    linkLabel: linkLabel,
    pvRich: pvRich,
    normImgs: normImgs,
    KIND_LABEL: KIND_LABEL,
    PAGE_KEYS: Object.keys(PAGE_RENDERERS)
  };
})(typeof window !== 'undefined' ? window : this);
