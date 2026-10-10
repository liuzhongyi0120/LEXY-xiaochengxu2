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
  /* 每个区块类型的中文角标名；新增区块类型必须在这里补一行（自检会逐个核对，漏了会红）。 */
  var KIND_LABEL = {
    swiper: '图片广告', image: '图片', video: '视频', title: '标题文本', line: '辅助分割',
    notice: '公告', nav: '图文导航', cube: '魔方', hotspot: '热区切图', shop: '店铺信息',
    goods: '商品', rich_text: '富文本', search: '商品搜索', elevator: '电梯导航',
    enter_shop: '进入店铺', audio: '语音', service: '在线客服', content_card: '内容卡片',
    buy_bar: '购买按钮', brand_category: '品牌分类',
    // 2026-10-10：有赞基础/高级组件余下 37 项
    custom_module: '自定义模块', fans: '涨粉', goods_group: '商品分组', game_category: '游戏分类',
    point_order: '点单卡片', shelf_asset: '客户资产', nearby_store: '附近门店', order_pool: '好友拼单',
    on_way_order: '在途订单', coupon: '优惠券', limit_discount: '限时折扣', seckill: '秒杀',
    bargain: '砍价', new_zone: '新人专区', groupon: '拼团', reward_points: '集点卡',
    member_goods: '会员专享价', member_value: '会员储值', join_member: '办会员', point_asset: '积分资产',
    wx_live: '小程序直播', wxvideo_live: '视频号直播', guang_live: '爱逛直播',
    goods_recommend_adv: '人群运营', crowd_image: '人群图片', hot_words: '店铺热搜',
    shop_rank: '店铺榜单', points_goods: '积分兑换商品', member_card: '会员卡片',
    shop_banner_card: '店招信息', course: '课程', paid_column: '知识专栏', paid_content: '知识内容',
    content_live: '知识直播', paid_member: '知识付费会员', punch: '群打卡', personal_nav: '个性导航'
  };

  /**
   * 「依赖型 / 展示型」区块的渲染族。
   *
   * ⚠️ 键必须与 `miniprogram/utils/blocks.js` 的 `SHELL_FAMILY` **完全一致**：
   *   两份表一个管装修台预览、一个管真机，键不一致就会出现「预览里是个卡片、真机一片空白」。
   *   自检（check-all 15.8x）会逐个比对两张表的键集，漏一个就红。
   */
  var SHELL_PARTS = {
    custom_module: 'card', fans: 'card', game_category: 'list',
    point_order: 'card', shelf_asset: 'card', nearby_store: 'card', order_pool: 'card', on_way_order: 'card',
    coupon: 'list', limit_discount: 'list', seckill: 'list', bargain: 'list', new_zone: 'card',
    groupon: 'list', reward_points: 'card', member_goods: 'list', member_value: 'card',
    join_member: 'card', point_asset: 'card', wx_live: 'card', wxvideo_live: 'card', guang_live: 'card',
    goods_recommend_adv: 'card', crowd_image: 'list', points_goods: 'list',
    member_card: 'card', shop_banner_card: 'card',
    course: 'list', paid_column: 'list', paid_content: 'list', content_live: 'list', paid_member: 'card', punch: 'list',
    personal_nav: 'card'
  };

  /** 展示位取值：按优先级取第一个非空字符串（与真机 blocks.js 的 firstOf 同规则） */
  function pvFirst(b, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = b[keys[i]];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }
  function pvFirstImage(list) {
    if (!list || !list.length) return '';
    var x = list[0];
    return typeof x === 'string' ? x : ((x && (x.image || x.src)) || '');
  }

  /**
   * 依赖型 / 展示型区块的预览。
   * 与真机 `templates/blocks.wxml` 的 `block.fam` 分支一一对应：
   * 标题 / 主图 / 描述 / 按钮 + 底部「依赖 XX · 仅占位展示」。
   */
  function pvShell(b, kind) {
    var margin = b.pageMargin || 12;
    var t = pvFirst(b, ['title', 'name', 'text', 'notice']);
    var d = pvFirst(b, ['desc', 'subTitle', 'slogan', 'note']);
    var im = pvFirst(b, ['image', 'cover', 'photo', 'icon', 'qr']) || pvFirstImage(b.images);
    var btn = pvFirst(b, ['btnText']);
    var h = '<div style="padding:12px ' + margin + 'px">';
    if (t) h += '<div style="font-size:15px;font-weight:600;color:#323233;padding-bottom:6px">' + esc(t) + '</div>';
    if (im) h += img(im, 'width:100%;display:block;border-radius:' + (b.corner === 'round' ? '8px' : '0'));
    if (d) h += '<div style="font-size:12px;color:#646566;padding-top:6px;line-height:1.6">' + esc(d) + '</div>';
    if (btn) h += '<div style="display:inline-block;margin-top:8px;padding:0 16px;height:30px;line-height:30px;font-size:13px;color:#fff;background:#C8102E;border-radius:15px">' + esc(btn) + '</div>';
    if (!t && !im && !d && !btn) h += '<div style="color:#b8bec8;font-size:12px;line-height:2">该组件还没有可展示的内容<br>在右侧属性面板里试试填「标题 / 图片 / 描述」</div>';
    if (b.dep) h += '<div style="margin-top:8px;padding:5px 8px;font-size:11px;color:#FF976A;background:#F7F8FA;border:1px solid #EBEDF0;border-radius:2px">依赖 ' + esc(b.dep) + ' · 仅占位展示</div>';
    h += '</div>';
    return h;
  }

  /** 店铺榜单预览（真机复用「商品」卡片并按销量降序，预览不拉真实商品，只描述口径） */
  function pvShopRank(b) {
    var margin = b.pageMargin || 15;
    return '<div style="padding:0 ' + margin + 'px">' +
      '<div style="font-size:15px;font-weight:600;color:#323233;padding:8px 0 6px">' + esc(b.title || '店铺榜单') + '</div>' +
      '<div style="display:flex;gap:8px">' +
      [0, 1].map(function () {
        return '<div style="flex:1;border:1px solid #EBEDF0;border-radius:2px;overflow:hidden">' +
          '<div style="height:56px;background:#F7F8FA"></div>' +
          '<div style="height:12px;margin:6px;background:#EBEDF0;border-radius:2px"></div></div>';
      }).join('') + '</div>' +
      '<div style="font-size:11px;color:#969799;padding:6px 0">真机按商品库真实销量降序取 ' + (b.limit || 6) + ' 件（预览不拉真实商品）</div></div>';
  }

  /** 商品分组预览：分类菜单 + 商品占位（真机按分组名向商品库取数） */
  function pvGoodsGroup(b) {
    var margin = b.pageMargin || 12;
    var names = (b.groups || []).map(function (g) { return g && g.name; }).filter(Boolean);
    var h = '<div style="padding:0 ' + margin + 'px">';
    if (!names.length) {
      return h + '<div style="color:#b8bec8;font-size:12px;padding:12px 0;line-height:2">还没有配置分组<br>在右侧「商品管理」里加上商品库的分类名</div></div>';
    }
    h += '<div style="display:flex;overflow:hidden;border-bottom:1px solid #EBEDF0">' +
      names.slice(0, 6).map(function (nm, k) {
        return '<span style="padding:6px 10px;font-size:13px;white-space:nowrap;' +
          (k === 0 ? 'color:#155BD4;font-weight:600;border-bottom:2px solid #155BD4' : 'color:#646566') + '">' + esc(nm) + '</span>';
      }).join('') + '</div>';
    h += '<div style="display:flex;flex-wrap:wrap;margin-top:4px">' +
      [0, 1].map(function () {
        return '<div style="width:50%;padding:4px"><div style="border:1px solid #EBEDF0;border-radius:2px;overflow:hidden">' +
          '<div style="height:48px;background:#F7F8FA"></div>' +
          '<div style="height:10px;margin:6px;background:#EBEDF0;border-radius:2px"></div></div></div>';
      }).join('') + '</div>';
    h += '<div style="font-size:11px;color:#969799;padding:4px 0">真机按分组名（商品库分类，含子分类）取商品，切换分组不再请求接口</div></div>';
    return h;
  }

  /** 店铺热搜预览：词表就在面板里配，预览即真机效果 */
  function pvHotWords(b) {
    var words = (b.words || []).map(function (w) { return typeof w === 'string' ? w : (w && w.word) || ''; })
      .map(function (w) { return String(w).trim(); }).filter(Boolean).slice(0, 10);
    var fg = (b.colorMode === 'custom' && b.color) ? b.color : '#C8102E';
    var h = '<div style="padding:12px 12px 6px">' +
      '<div style="display:flex;align-items:center">' +
      (b.badge !== false ? '<span style="margin-right:4px;padding:0 4px;font-size:11px;line-height:16px;color:#fff;background:#C8102E;border-radius:2px">热</span>' : '') +
      '<span style="font-size:14px;font-weight:600;color:#323233">' + esc(b.title || '大家都在搜') + '</span></div>';
    if (!words.length) {
      return h + '<div style="color:#b8bec8;font-size:12px;padding:8px 0">还没有配置热词</div></div>';
    }
    h += '<div style="display:flex;flex-wrap:wrap;margin-top:6px">' +
      words.map(function (w) {
        return '<span style="margin:0 8px 6px 0;padding:3px 10px;font-size:12px;color:' + fg + ';background:#F7F8FA;border-radius:12px">' + esc(w) + '</span>';
      }).join('') + '</div></div>';
    return h;
  }
  function kindTag(kind, i) {
    if (!CTX.edit) return '';
    return '<span class="pv-tag">' + esc(KIND_LABEL[kind] || kind) + ' ' + (i + 1) + '</span>';
  }

  /* ------------------------- 品牌分类（对标有赞「品牌分类E」） ------------------------- */

  /** 取数值：空值 / 非数字回落默认（装修草稿里的空字符串不能被当成 0） */
  function pvNum(v, d) {
    if (v === '' || v === null || v === undefined) return d;
    var n = Number(v);
    return isNaN(n) ? d : n;
  }
  function pvColor(v, d) { return String(v === null || v === undefined ? '' : v).trim() || d; }

  /**
   * 品牌分类：左栏品牌导航 + 右栏图文内容。
   *
   * 5 种标题风格按有赞实测的 DOM 尺寸还原：
   *   A 每项都带底色块（比其它风格高「选中边框高度」）  B 只有选中项才有底色
   *   C = B + 跟随选中项的左侧竖条                     D = B + 每项底部分隔线
   *   E 圆角胶囊（上下各 5px 内距，圆角 = 内高一半）
   *
   * 单位：本组件的 px 值都是 375 基准，预览里原样使用，小程序端 ×2（见 utils/units.js）。
   * 图片：预览按 1:1 占位；真机用 <image mode="widthFix"> 按原图比例撑高（与有赞一致）。
   */
  function pvBrandCategory(b) {
    var brands = (b.brands || []).filter(function (x) { return x && typeof x === 'object'; });
    var act = Math.min(Math.max(0, Number(CTX.brand) || 0), Math.max(0, brands.length - 1));

    var navW = pvNum(b.navWidth, 26);
    var navH = pvNum(b.navHeight, 45);
    var navGap = pvNum(b.navMargin, 1);
    var style = b.navStyle || 'C';
    var fs = pvNum(b.navFontSize, 15);
    var indH = pvNum(b.navBorderH, 10);
    var indW = Math.max(1, pvNum(b.navBorderW, 1));
    var navBg = pvColor(b.navBg, '#F1F1F1');
    var navFg = pvColor(b.navColor, '#050505');
    var navFgOn = pvColor(b.navColorActive, '#FFFFFF');
    var navBgOn = pvColor(b.navBgActive, '#000000');
    var navBgIdle = pvColor(b.navBgIdle, '#F9F9F9');
    var navBorder = pvColor(b.navBorderColor, '');
    var navLine = pvColor(b.navBorderLine, '#DDDDDD');
    var align = b.navAlign || 'center';
    var just = align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center');

    var navItems = brands.map(function (br, i) {
      var on = i === act;
      var padY = 0, innerH = navH, radius = 0, bg = 'transparent', border = '';
      if (style === 'A') {
        padY = navGap / 2;
        innerH = navH + indH;              // 实测：风格 A 的色块比其它风格恰好高「选中边框高度」
        bg = on ? navBgOn : navBgIdle;
        if (navBorder) border = 'border:' + indW + 'px solid ' + navBorder + ';';
      } else if (style === 'E') {
        padY = 5;
        innerH = Math.max(12, navH - 10);
        radius = Math.round(innerH / 2);
        bg = on ? navBgOn : navBgIdle;
        if (navBorder) border = 'border:' + indW + 'px solid ' + navBorder + ';';
      } else {
        bg = on ? navBgOn : 'transparent';
        if (on && navBorder) border = 'border:' + indW + 'px solid ' + navBorder + ';';
      }
      var bar = (style === 'C' && on)
        ? '<i style="position:absolute;left:0;top:50%;margin-top:-' + Math.round(indH / 2) + 'px;width:' + indW +
          'px;height:' + indH + 'px;background:' + pvColor(b.navBorderColor, navBgOn) + '"></i>'
        : '';
      var line = style === 'D' ? ('border-bottom:1px solid ' + navLine + ';') : '';
      return '<div data-path="brand:' + i + '" title="' + attr(br.title || '') + '" style="position:relative;box-sizing:border-box;' +
        'padding:' + padY + 'px 0;cursor:pointer;background:' + bg + ';' + border + line + '">' + bar +
        '<div style="height:' + innerH + 'px;border-radius:' + radius + 'px;display:flex;align-items:center;justify-content:' + just + ';' +
        'font-size:' + fs + 'px;font-weight:' + (on ? (b.navWeightActive || '450') : (b.navWeight || '300')) + ';' +
        'color:' + (on ? navFgOn : navFg) + ';padding:0 6px;overflow:hidden">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25">' +
        esc(br.title || '未命名品牌') + '</span></div></div>';
    }).join('');

    var gapX = pvNum(b.itemGapX, 0);
    var gapY = pvNum(b.itemGapY, 5);
    var itemRadius = pvNum(b.itemRadius, 0);
    var itemFs = pvNum(b.itemTitleSize, 14);
    var itemWeight = b.itemTitleWeight || '400';
    var itemAlign = b.itemTitleAlign || 'center';
    // ⚠️ 文字色必须给**真实**兜底色：留空时若原样拼出 `color:;` 是无效声明，
    //    浏览器会整条丢弃 → 退化成继承，与真机（WXSS 令牌兜底）不是同一口径。
    //    留空 = 用默认文字色，与 miniprogram/utils/blocks.js 的取值逐字对齐。
    var itemFg = pvColor(b.itemTitleColor, '#323233');
    var itemBorder = pvColor(b.itemBorderColor, '');
    var shadow = (b.itemShadow || 'none') === 'normal' ? 'box-shadow:0 2px 8px rgba(0,0,0,.16);' : '';

    var pTitleFs = pvNum(b.panelTitleSize, 16);
    var pTitleAlign = b.panelTitleAlign || 'left';
    var pTitleFg = pvColor(b.panelTitleColor, '#323233');
    var pTitleGapX = pvNum(b.panelTitleGapX, 0);
    var pTitleGapY = pvNum(b.panelTitleGapY, 0);
    var pGap = pvNum(b.panelGap, 13);
    var effect = b.effect || 'none';

    function panelHead(pn) {
      if (!pn.title) return '';
      return '<div style="font-size:' + pTitleFs + 'px;font-weight:' + (b.panelTitleWeight || '700') + ';text-align:' + pTitleAlign + ';' +
        'color:' + pTitleFg + ';padding:0 ' + pTitleGapX + 'px;margin-bottom:' + pTitleGapY + 'px">' + esc(pn.title) +
        (pn.link ? linkBadge(pn.link) : '') + '</div>';
    }

    var brand = brands[act] || {};
    var panels = (brand.panels || []).filter(function (x) { return x && typeof x === 'object'; });

    var rightHtml = panels.map(function (pn) {
      var layout = String(pn.layout || '2');
      var list = (pn.items || []).filter(function (x) { return x && (x.image || x.title); });
      if (!list.length) {
        return '<div style="margin-bottom:' + pGap + 'px">' + panelHead(pn) +
          '<div style="color:#b8bec8;font-size:12px;padding:8px 0">（本小组还没有条目，用「+ 关联商品分组」添加）</div></div>';
      }
      var body;
      if (layout === 'nav') {
        // 导航模式：小图 + 文字横向排（适合做型号入口）
        body = '<div>' + list.map(function (it) {
          return '<div style="display:flex;align-items:center;gap:8px;position:relative;box-sizing:border-box;' +
            'padding:0 ' + (gapX / 2) + 'px;margin-bottom:' + gapY + 'px">' +
            '<div style="width:48px;height:48px;flex:0 0 auto;border-radius:' + (itemRadius || 4) + 'px;overflow:hidden;background:#f5f6f8;' +
            (itemBorder ? 'border:1px solid ' + itemBorder + ';' : '') + shadow + '">' +
            (it.image ? '<img src="' + attr(it.image) + '" style="width:100%;height:100%;object-fit:cover">' : '') + '</div>' +
            '<div style="min-width:0;flex:1">' +
            (it.title ? '<div style="font-size:' + itemFs + 'px;font-weight:' + itemWeight + ';color:' + itemFg +
              ';overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.title) + '</div>' : '') +
            (it.desc ? '<div style="font-size:11px;color:#8a919e;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' +
              esc(it.desc) + '</div>' : '') +
            '</div>' + (it.link ? linkBadge(it.link) : '') +
            (it.link && it.linkMode === 'hot' ? linkDot(it.link, '热区跳转', false) : '') + '</div>';
        }).join('') + '</div>';
      } else {
        var cols = Math.max(1, Math.round(pvNum(layout, 2)));
        body = '<div style="display:flex;flex-wrap:wrap;margin:0 -' + (gapX / 2) + 'px">' + list.map(function (it) {
          return '<div style="width:' + (100 / cols) + '%;box-sizing:border-box;padding:0 ' + (gapX / 2) + 'px;margin-bottom:' + gapY + 'px">' +
            '<div style="position:relative">' +
            '<div style="position:relative;padding-top:100%;border-radius:' + itemRadius + 'px;overflow:hidden;background:#f5f6f8;' + shadow + '">' +
            (it.image
              ? '<img src="' + attr(it.image) + '" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover">'
              : '<div style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#8a919e;font-size:12px">未设图</div>') +
            '</div>' +
            (it.title ? '<div style="font-size:' + itemFs + 'px;font-weight:' + itemWeight + ';text-align:' + itemAlign +
              ';color:' + itemFg + ';margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.title) + '</div>' : '') +
            (it.desc ? '<div style="font-size:11px;color:#8a919e;text-align:' + itemAlign +
              ';overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.desc) + '</div>' : '') +
            (it.link && it.linkMode !== 'hot' ? linkBadge(it.link) : '') +
            (it.link && it.linkMode === 'hot' ? linkDot(it.link, '热区跳转', false) : '') +
            '</div></div>';
        }).join('') + '</div>';
      }
      return '<div style="margin-bottom:' + pGap + 'px">' + panelHead(pn) + body + '</div>';
    }).join('');

    var navCol = '';
    if (b.navLogo) {
      navCol += '<div style="padding:6px;position:relative">' + img(b.navLogo, 'width:100%;display:block') +
        (b.navLogoLink ? linkBadge(b.navLogoLink) : '') + '</div>';
    }
    if ((b.searchMode || 'hide') === 'show') {
      navCol += '<div style="margin:6px;height:28px;border-radius:14px;background:rgba(0,0,0,.06);display:flex;' +
        'align-items:center;justify-content:center;font-size:11px;color:#8a919e">🔍 搜索</div>';
    }

    var bgImage = b.bgImage
      ? '<div style="position:absolute;left:0;right:0;bottom:0;top:' + pvNum(b.bgTopGap, 0) + 'px;' +
        'background-image:url(' + attr(b.bgImage) + ');background-size:cover;background-position:top center"></div>' +
        (b.bgTopLink ? '<div style="position:absolute;left:0;right:0;top:' + pvNum(b.bgTopGap, 0) + 'px;height:28px">' +
          linkDot(b.bgTopLink, '背景顶部跳转', false) + '</div>' : '')
      : '';

    var modBg = b.moduleBgImage
      ? 'background-image:url(' + attr(b.moduleBgImage) + ');' +
        'background-size:' + (b.moduleBgFill === 'contain' ? 'contain' : (b.moduleBgFill === 'repeat' ? 'auto' : 'cover')) + ';' +
        'background-repeat:' + (b.moduleBgFill === 'repeat' ? 'repeat' : 'no-repeat') + ';background-position:top center;'
      : '';

    var tips = '';
    if (b.navSticky === 'top') tips += '<div style="font-size:10px;color:#8a919e;padding:2px 8px">左侧栏目吸顶</div>';
    if (effect !== 'none') {
      tips += '<div style="font-size:10px;color:#8a919e;padding:2px 8px">缓动：' +
        ({ right: '右入', up: '上滑', zoom: '放大', fade: '淡入' }[effect] || effect) +
        ' ' + pvNum(b.effectSpeed, 1) + 's，逐条间隔 ' + pvNum(b.effectDelay, 0.2) + 's</div>';
    }

    return '<div style="position:relative;background:' + pvColor(b.bg, '#FFFFFF') + ';' + modBg + '">' + tips +
      '<div style="display:flex;align-items:stretch">' +
      '<div style="width:' + navW + '%;flex:0 0 ' + navW + '%;background:' + navBg + ';overflow:hidden">' + navCol + navItems + '</div>' +
      '<div style="flex:1;min-width:0;position:relative;padding:0 ' + pvNum(b.contentPadX, 0) + 'px ' + pvNum(b.contentPadBottom, 0) + 'px">' +
      bgImage + '<div style="position:relative">' +
      (rightHtml || '<div style="color:#b8bec8;font-size:12px;padding:12px 0">（该品牌还没有内容，在左栏选中它后用「+ 新增」加一个小组）</div>') +
      '</div></div></div>' +
      (b.reserveTabbar ? '<div style="height:50px"></div>' : '') +
      '</div>';
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
    } else if (kind === 'brand_category') {
      box += pvBrandCategory(b);
    } else if (kind === 'shop_rank') {
      box += pvShopRank(b);
    } else if (kind === 'goods_group') {
      box += pvGoodsGroup(b);
    } else if (kind === 'hot_words') {
      box += pvHotWords(b);
    } else if (SHELL_PARTS[kind]) {
      box += pvShell(b, kind);
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
    h += '<div class="pv-nav">' + img(d.navLogo, 'width:100%;display:block') + brands.map(function (b, i) {
      return '<div data-path="brand:' + i + '" class="' + (i === bi ? 'on' : '') + '">' + esc(b.name) + '</div>';
    }).join('') + '</div>';
    h += '<div class="right">';
    (brand.groups || []).forEach(function (g, gi) {
      var gp = 'brands.' + bi + '.groups.' + gi;
      h += '<div class="pv-block' + cls(gp) + '" data-path="' + gp + '" style="margin-bottom:4px;position:relative">' +
        '<div class="pv-grouphd" style="position:relative">' + img(g.header) +
        linkDot(g.link, '头图跳转') + '</div>' +
        /* 型号网格：真机是**两列**（.prod{width:50%}），曾经写成三列，真机一对照就露馅 */
        '<div class="pv-prods">' + (g.products || []).map(function (m, mi) {
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
