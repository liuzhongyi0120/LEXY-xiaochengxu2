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
  var CTX = { edit: false, sel: '', slide: {}, brand: 0, shop: null };

  /** 跳转目标清单（装修台从 /api/decorate/link-options 加载），仅编辑态的角标文案需要 */
  var LINK_OPTS = null;

  function configure(o) {
    o = o || {};
    CTX.edit = !!o.edit;
    CTX.sel = o.sel || '';
    CTX.slide = o.slide || {};
    CTX.brand = Number(o.brand) || 0;
    CTX.shop = o.shop || null;
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
    return pvRichMarginTop(String(html || '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, ''));
  }

  /**
   * 富文本块级标签的 margin-top 重置 —— 与小程序端 `utils/blocks.js` 的 richResetMarginTop、
   * 预览链路的 `mp-wxml.js` 的 richSafe **同一套规则，三处必须一致**。
   *
   * 有赞的富文本容器带 `p{margin:0}`；编辑器导出的 HTML 又常常只写 margin-bottom，
   * 于是「只写了一半」的 `p` 在我们这边会吃到浏览器默认的 `1em` 上边距（16px 字号下正好 16px），
   * 「加入我们」页整块因此高了 27px。这条重置补的就是这一半。
   */
  function pvRichMarginTop(html) {
    return String(html || '').replace(
      /<(p|div|h[1-6]|ul|ol|li|blockquote|figure|pre|table)\b([^>]*)>/gi,
      function (whole, tag, rest) {
        if (/\bmargin(-top)?\s*:/i.test(rest)) return whole;
        var m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(rest);
        if (m) {
          var val = m[2] !== undefined ? m[2] : m[3];
          return whole.replace(m[0], 'style="margin-top:0;' + val + '"');
        }
        return '<' + tag + rest + ' style="margin-top:0">';
      }
    );
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
    // 2026-10-12：有赞店铺侧三方扩展「混合排列A」（extension-masswx-hpitemsa）
    mixed_grid: '混合排列',
    // 2026-10-12：有赞店铺侧三方扩展「选项卡Z4」（extension-massdesign-tabcatez4）
    tab_cate: '选项卡分类',
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
    content_live: '知识直播', paid_member: '知识付费会员', punch: '群打卡', personal_nav: '个性导航',
    // 2026-10-10：个人中心（「我的」页）专属区块 + 个人中心独有组件
    uc_navbar: '标题栏', uc_profile: '个人信息', uc_stats: '个人资产', uc_order: '我的订单',
    uc_tools: '必备工具', text: '文本', link: '关联链接', blank: '辅助空白', follow_oa: '关注公众号'
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

  /* ==========================================================================
   * 个人中心（「我的」页）专属区块的预览
   *
   * ⚠️ 只服务**装修台手机壳**（`/preview` 走真机源码编译，不经过这里）。
   * 口径必须与真机 `templates/blocks.wxml` 的同名分支一致：同样的信息层次、
   * 同样的「依赖 XX · 仅占位展示」标注、同样的条目筛选规则（show / enabled）。
   * 字段真源是区块数据本身（icon / real / enabled 已烘入插件条目），
   * 这里**不再各写一份工具表** —— 写过一次就会走样。
   * ========================================================================== */

  var UC_PARTS = {
    uc_navbar: 1, uc_profile: 1, uc_stats: 1, uc_order: 1, uc_tools: 1,
    text: 1, link: 1, blank: 1, follow_oa: 1
  };

  /* 与 miniprogram/utils/blocks.js 的 UC_STAT_DEFS / UC_ORDER_DEFS 同源同序
     第 4 个元素 = 该项的缺省数值（页面没拿到真数时显示什么），口径与真机逐项一致：
     余额 / 积分 '0'（新用户的真实状态），其余 '—'（张数未知 ≠ 0 张）。
     第 5 个元素 = 资产图标（有赞 STATS_ICON_MAP 的位图；有赞这项**不是字体**）。 */
  var UC_STAT_DEFS = [
    ['showBalance', '余额', '元', '0', 'stats/balance'], ['showPoints', '积分', '', '0', 'stats/points'],
    ['showCard', '权益卡', '张', '—', 'stats/cards'], ['showCoupon', '优惠券', '张', '—', 'stats/coupons'],
    ['showWallet', '钱包', '元', '—', 'stats/change'], ['showGiftCard', '礼品卡', '张', '—', 'stats/cards'],
    ['showPickupCard', '提货卡', '张', '—', 'stats/cards']
  ];
  /* 第 3 个元素 = 有赞订单入口的图标**全名**（含 order__ 前缀，照抄 getDefaultOrderItems） */
  var UC_ORDER_DEFS = [
    ['showPendingPay', '待付款', 'order__pending-payment'], ['showPendingShip', '待发货', 'order__tosend'],
    ['showShipped', '待收货', 'order__logistics'], ['showReview', '待评价', 'order__smile-comment-o'],
    ['showRefund', '退款/售后', 'order__refund-o']
  ];

  /* 个人中心图标：**包内资源**，与真机同一个 URL（后端 GET /images/… 只读路由读同一份）。
     口径必须与 miniprogram/utils/blocks.js 的 ucIconFile() 一字不差。 */
  var UC_ICON_DIR = '/images/usercenter/';
  function ucIconFile(base, mode) {
    var b = String(base || '').trim();
    if (!b) return '';
    return UC_ICON_DIR + (mode === 'line' ? b + '-o' : b) + '.png';
  }
  /* 图标基名的形状判断 —— 装修数据里可能残留「第 52 批之前存的汉字图标」，
     那种值拼不出文件（会裂图），宁可这一格不画图标。重灌数据后不会再遇到。 */
  function ucIsIconBase(v) { return /^[a-z][a-z0-9_-]*$/.test(String(v || '')); }
  var UC_SIZE = { sm: '12px', md: '14px', lg: '16px' };
  var UC_ALIGN = { left: 'left', center: 'center', right: 'right' };

  function ucDep(t) {
    return t ? '<div style="margin:6px 12px 0;font-size:10px;color:#c8c9cc">依赖 ' + esc(t) + ' · 仅占位展示</div>' : '';
  }

  function pvUserCenter(b, kind) {
    var h = '';
    var margin = b.pageMargin || 12;

    if (kind === 'uc_navbar') {
      var navBg = b.bgMode === 'custom' ? (b.bgColor || '#FFFFFF') : '#FFFFFF';
      h += '<div style="position:relative;padding:14px 16px 12px;background:' + navBg + ';overflow:hidden">' +
        (b.bgImage ? '<img src="' + attr(b.bgImage) + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">' : '') +
        '<div style="position:relative"><div style="font-size:18px;font-weight:600;color:#323233">' + esc(b.title || '个人中心') + '</div>' +
        (b.desc ? '<div style="margin-top:4px;font-size:12px;color:#969799">' + esc(b.desc) + '</div>' : '') +
        '</div></div>';
      return h;
    }

    if (kind === 'uc_profile') {
      var gd = b.gradient === 'white' ? 'background:linear-gradient(to bottom,rgba(255,255,255,0),#fff)'
        : (b.gradient === 'black' ? 'background:linear-gradient(to bottom,rgba(0,0,0,0),#000)' : '');
      var jf = b.align === 'left' ? 'flex-start' : (b.align === 'right' ? 'flex-end' : 'center');
      var nickFg = b.nameColor || '#333333';
      var codeFg = b.codeColor || '#FFFFFF';
      h += '<div style="position:relative;padding:20px 16px 24px;background:' +
        (b.bgImage ? ('url(' + attr(b.bgImage) + ') center/cover no-repeat') : '#FFFFFF') + ';overflow:hidden">' +
        '<div style="position:absolute;inset:0;' + gd + '"></div>' +
        '<div style="position:relative;display:flex;align-items:center;justify-content:' + jf + '">' +
        '<div style="width:60px;height:60px;border-radius:50%;background:rgba(0,0,0,.12);border:1px solid rgba(255,255,255,.6);' +
        'display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;flex:0 0 auto">我</div>' +
        '<div style="margin-left:12px;flex:1;min-width:0">' +
        '<div style="font-size:18px;font-weight:600;color:' + nickFg + '">未登录</div>' +
        '<div style="margin-top:5px;display:flex;align-items:center">' +
        (b.showLevel === 'hide' ? '' : '<span style="padding:1px 7px;font-size:10px;color:#7a5230;background:linear-gradient(90deg,#f6e0b5,#e9c98c);border-radius:10px">普通会员</span>') +
        '<span style="margin-left:8px;padding:1px 8px;font-size:10px;color:' + codeFg + ';border:1px solid currentColor;border-radius:12px">会员码</span>' +
        '</div></div>' +
        '<div style="flex:0 0 auto;padding:0 15px;height:29px;line-height:29px;font-size:13px;color:#C8102E;background:#fff;border-radius:15px">登录</div>' +
        '</div>' +
        '<div style="position:relative;margin-top:14px;height:30px;border-radius:15px;background:' +
        (b.barStyle === 's3' ? 'rgba(0,0,0,.06)' : (b.barStyle === 's2' ? 'transparent' : 'rgba(255,255,255,.5)')) + '"></div>' +
        '</div>';
      return h;
    }

    if (kind === 'uc_stats') {
      var stats = UC_STAT_DEFS.filter(function (d) { return b[d[0]] !== false; });
      /* 单项时才画图标 —— 有赞的资产行多项是「数值 + 名称」（无图标），
         只有单项时才用带图标的 van-cell，本项目照同口径（真机模板同样判 `items.length === 1`）。 */
      var statIc = stats.length === 1 && ucIsIconBase(stats[0][4])
        ? '<img src="' + attr(ucIconFile(stats[0][4])) + '" style="width:18px;height:18px;display:block;margin:0 auto 4px">' : '';
      h += '<div style="margin:10px 0;padding:12px 8px;background:#fff">' +
        '<div style="display:flex;flex-wrap:wrap">' + stats.map(function (d, i) {
          return '<div style="flex:1;min-width:25%;text-align:center;padding:6px 0">' +
            (i === 0 ? statIc : '') +
            '<div style="font-size:17px;font-weight:600;color:#323233">' + d[3] + '<span style="font-size:10px;font-weight:400;color:#969799">' + d[2] + '</span></div>' +
            '<div style="margin-top:5px;font-size:12px;color:#969799">' + d[1] + '</div></div>';
        }).join('') + '</div>' +
        (stats.length ? '' : '<div style="color:#b8bec8;font-size:12px;padding:8px 0;text-align:center">所有资产项都被关掉了</div>') +
        ucDep(b.dep || '会员资产数据（余额 / 积分 / 权益卡 / 钱包 / 礼品卡 / 提货卡）') +
        '</div>';
      return h;
    }

    if (kind === 'uc_order') {
      var items = UC_ORDER_DEFS.filter(function (d) { return b[d[0]] !== false; });
      h += '<div style="margin:10px 0;padding:12px 8px;background:#fff">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 8px 10px">' +
        '<span style="font-size:15px;font-weight:600;color:#323233">' + esc(b.title || '我的订单') + '</span>' +
        (b.showAll === false ? '' : '<span style="font-size:12px;color:#969799">全部订单 ›</span>') + '</div>' +
        '<div style="display:flex;flex-wrap:wrap">' + items.map(function (d) {
          /* 订单图标不随 iconMode 变（有赞这里只给一套字形），照抄全名 */
          var ic = ucIsIconBase(d[2])
            ? '<img src="' + attr(ucIconFile(d[2])) + '" style="width:24px;height:24px;display:block;margin:0 auto">' : '';
          return '<div style="flex:1;min-width:20%;text-align:center;padding:6px 0">' +
            '<div style="width:28px;height:28px;margin:0 auto;display:flex;align-items:center;justify-content:center">' + ic + '</div>' +
            '<div style="margin-top:6px;font-size:12px;color:#323233">' + d[1] + '</div></div>';
        }).join('') + '</div></div>';
      return h;
    }

    if (kind === 'uc_tools') {
      var cols = b.mode === 'cube' ? 3 : 4;
      var cellW = Math.floor(100 / cols * 100) / 100;
      var tools = (b.plugins || []).filter(function (p) { return p && p.show !== false && p.enabled !== false; });
      var cubeBg = b.mode === 'cube' ? 'background:#F2F3F5;border-radius:10px' : '';
      h += '<div style="margin:10px 0;padding:8px 4px;background:#fff">' +
        '<div style="display:flex;flex-wrap:wrap">' + tools.map(function (t) {
          /* 图标风格取哪张图由 iconMode 决定（line → -o 细线 / fill → 实色），
             而不是靠 CSS 描边 —— 与真机 miniprogram/pages/mine/mine.wxss 同口径。 */
          var base = ucIsIconBase(t.icon) ? String(t.icon) : '';
          var ic = base
            ? '<img src="' + attr(ucIconFile(base, b.iconMode)) + '" style="width:24px;height:24px;display:block">'
            : '<span style="color:#d0d0d0;font-size:10px">无图标</span>';
          return '<div style="width:' + cellW + '%;text-align:center;padding:12px 0">' +
            '<div style="width:40px;height:40px;margin:0 auto;display:flex;align-items:center;justify-content:center;' + cubeBg + '">' + ic + '</div>' +
            '<div style="margin-top:7px;font-size:12px;color:#323233">' + esc(String(t.title || '').trim() || t.type) + '</div></div>';
        }).join('') + '</div>' +
        (tools.length ? '' : '<div style="color:#b8bec8;font-size:12px;padding:8px 0;text-align:center">所有工具都被关掉了</div>') +
        ucDep(b.dep || '部分工具依赖会员、门店、分销等业务数据') +
        '</div>';
      return h;
    }

    if (kind === 'text') {
      var fs = UC_SIZE[b.size] || UC_SIZE.md;
      h += '<div style="padding:0 ' + margin + 'px;margin:6px 0">' +
        '<div style="padding:10px 12px;border-radius:8px;font-size:' + fs + ';text-align:' + (UC_ALIGN[b.align] || 'left') + ';' +
        'color:' + (b.color || '#000000') + ';background:' + (b.bg || '#FFFFFF') + '">' +
        (b.text ? esc(b.text) : '<span style="color:#b8bec8">（空文本）</span>') +
        (b.link ? linkBadge(b.link) : '') + '</div>' +
        (b.showSplitLine ? '<div style="height:1px;background:#EBEDF0"></div>' : '') + '</div>';
      return h;
    }

    if (kind === 'link') {
      var links = (b.items || []).filter(function (x) { return x && String(x.label || '').trim(); });
      h += '<div style="padding:0 ' + margin + 'px;margin:6px 0;background:#fff">' +
        (links.length ? links.map(function (x) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 12px;border-bottom:1px solid #EBEDF0">' +
            '<span style="font-size:14px;color:#323233">' + esc(x.label) + '</span>' +
            '<span style="font-size:16px;color:#C8C9CC">›</span>' + (x.link ? linkDot(x.link, '跳转') : '') + '</div>';
        }).join('') : '<div style="color:#b8bec8;font-size:12px;padding:12px">（未添加关联链接）</div>') +
        '</div>';
      return h;
    }

    if (kind === 'blank') {
      var bh = Math.round((b.height || 30) / 2);
      h += '<div style="height:' + bh + 'px"></div>';
      return h;
    }

    if (kind === 'follow_oa') {
      h += '<div style="padding:0 ' + margin + 'px;margin:6px 0">' +
        '<div style="padding:14px 12px;border:1px dashed #EBEDF0;border-radius:6px;text-align:center;font-size:12px;color:#969799">' +
        '关注公众号（微信原生组件，仅扫码进入小程序时展示）</div>' +
        ucDep(b.dep || '公众号能力（需在微信小程序后台「设置 · 接口设置」开通）') +
        '</div>';
      return h;
    }

    return h;
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
   * 底色 + 透明度 → rgba()。**必须与小程序端 `utils/blocks.js` 的 `hexToRgba` 同口径**
   * （都是 `Math.round(alphaPct) / 100`），否则会出现「装修台浅灰底、真机纯白底」——
   * 有赞原值就是 rgba(248,248,248,0.33)，透明度写成 0.33 还是 0.3 肉眼可辨。
   */
  function pvRgba(hex, alphaPct, defHex) {
    var h = pvColor(hex, defHex || '#F8F8F8');
    var m = /^#?([0-9a-f]{6})$/i.exec(h);
    var rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]
                : [248, 248, 248];
    var n = pvNum(alphaPct, 33);
    return 'rgba(' + rgb.join(',') + ',' + (Math.round(Math.min(100, Math.max(0, n))) / 100) + ')';
  }

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
        'color:' + (on ? navFgOn : navFg) + ';padding:0 10px;overflow:hidden">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25">' +
        esc(br.title || '未命名品牌') + '</span></div></div>';
    }).join('');

    var gapX = pvNum(b.itemGapX, 0);
    var gapY = pvNum(b.itemGapY, 10);
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
        /*
         * 图片盒必须与真机**同口径**：真机写的是 `mode="widthFix"`（宽度撑满、
         * 高度按原图比例）→ 这里对应 `<img style="width:100%;display:block">`。
         *
         * 曾经写成 `padding-top:100%` + `position:absolute` + `object-fit:cover`，
         * 结果是「装修台里图是 138.75 高的正方、真机里只有 119.54 高」——
         * 型号图各自比例不同（260×224 → 119.54，417×360 → 119.78），
         * 正方盒还会在下方多留 19px 空档，运营在后台看到的行距与真机完全不是一回事。
         *
         * 图盒也不铺底色：有赞的图盒是透明的（computed `rgba(0,0,0,0)`），
         * 而型号图里有带透明通道的（H5 的 PNG 有 92% 像素 alpha=0），
         * 铺一层 #f5f6f8 会在真机/预览里都透出一块灰底。
         *
         * 行距：网格**第 2 行起**的条目自己在 margin-top 上让 5px
         * （有赞实测：第 2 行起的 `a` 多 `margin-top:5px`），与真机
         * miniprogram/utils/blocks.js 的 `gapTopRpx` 同口径。
         *
         * ⚠️ 不要改成「格子 padding-bottom:5px + 容器 margin-bottom:-5px」——
         *    容器的负 margin-bottom 会**穿透折叠**到小组容器的 13px 下边距上
         *    （正负相加 = 13-5 = 8px），后面每一块都整体上移 5px，
         *    实测差异带反而从 8 段涨到 16 段。flex 条目自身的 margin-top 不折叠，才对。
         */
        body = '<div style="display:flex;flex-wrap:wrap;margin:0 -' + (gapX / 2) + 'px">' + list.map(function (it, ii) {
          var rowTop = ii >= cols ? 5 : 0;
          return '<div style="width:' + (100 / cols) + '%;box-sizing:border-box;padding:0 ' + (gapX / 2) + 'px;margin-top:' + rowTop + 'px">' +
            '<div style="position:relative">' +
            '<div style="position:relative;border-radius:' + itemRadius + 'px;overflow:hidden;' + shadow + '">' +
            (it.image
              ? '<img src="' + attr(it.image) + '" style="width:100%;display:block">'
              : '<div style="position:relative;padding-top:100%">' +
                '<div style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#8a919e;font-size:12px">未设图</div></div>') +
            '</div>' +
            /* 标题行盒 18px：与真机 `.bc-it { line-height: 18px }` 同值
               （有赞实测：字号 14px 时 computed line-height 就是 18px） */
            (it.title ? '<div style="font-size:' + itemFs + 'px;font-weight:' + itemWeight + ';text-align:' + itemAlign +
              ';color:' + itemFg + ';line-height:18px;margin-top:' + gapY + 'px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.title) + '</div>' : '') +
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
      /* 实测有赞的 Logo 就是**整栏宽**的一条（98×60.34，无内边距），
         所以这里不能加 padding —— 加了图会缩到 85.5 宽，与真机差 6px。
         跳转字段是区块级的 `link`（装修台里叫「Logo 跳转」）。 */
      navCol += '<div style="position:relative">' + img(b.navLogo, 'width:100%;display:block') +
        ((b.navLogoLink || b.link) ? linkBadge(b.navLogoLink || b.link) : '') + '</div>';
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
    /*
     * 高度模式 = 占满一屏：两栏取手机屏可视区高、各自内部滚动。
     * 真机写的是 WXSS 里的 `height: 100vh`（见 miniprogram/pages/index/index.wxss），
     * 这里没有 100vh 可用，所以直接取**装修台手机壳的屏高变量** ——
     * 它和 /preview 的 --mp-screen-h（718）刻意同值，见 admin.css 的注释。
     * 早前写成 var(--mp-screen-h,718px) 是错的：装修台这个变量叫 --phone-screen-h。
     */
    var screenMode = b.heightMode === 'screen';
    if (screenMode) tips += '<div style="font-size:10px;color:#8a919e;padding:2px 8px">占满一屏（左右两栏各自滚动）</div>';
    var colH = 'height:var(--phone-screen-h,686px);overflow-y:auto;';
    var navOverflow = screenMode ? colH : 'overflow:hidden;';
    var mainOverflow = screenMode ? colH : '';
    /*
     * data-scroll-y 不是装饰：两栏靠它命中 MpWxss.scrollViewCss
     * （overflow-x:hidden + 滚动条浮层化），与真机 scroll-view 同口径。
     * 非整屏模式仍是普通 div，不打这个标记。
     */
    var scrollAttr = screenMode ? ' data-scroll-y' : '';
    if (effect !== 'none') {
      tips += '<div style="font-size:10px;color:#8a919e;padding:2px 8px">缓动：' +
        ({ right: '右入', up: '上滑', zoom: '放大', fade: '淡入' }[effect] || effect) +
        ' ' + pvNum(b.effectSpeed, 1) + 's，逐条间隔 ' + pvNum(b.effectDelay, 0.2) + 's</div>';
    }

    return '<div style="position:relative;background:' + pvColor(b.bg, '#FFFFFF') + ';' + modBg + '">' + tips +
      '<div style="display:flex;align-items:stretch">' +
      '<div' + scrollAttr + ' style="width:' + navW + '%;flex:0 0 ' + navW + '%;background:' + navBg + ';' + navOverflow + '">' + navCol + navItems + '</div>' +
      '<div' + scrollAttr + ' style="flex:1;min-width:0;position:relative;padding:0 ' + pvNum(b.contentPadX, 0) + 'px ' + pvNum(b.contentPadBottom, 0) + 'px;' + mainOverflow + '">' +
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
        /* 加粗用 700：有赞「标题文本」写的就是 font-weight: bold（与真机 .ct-main.bold 同口径） */
        '<div class="t1 ' + sizeCls + '" style="color:' + (b.color || '#222') + ';font-weight:' + (b.bold ? 700 : 400) + '">' + esc(b.text || '（未填标题）') + '</div>' +
        (b.sub ? '<div class="t2">' + esc(b.sub) + '</div>' : '') + linkBadge(b.link) + '</div>';
    } else if (kind === 'line') {
      var lh = Math.round((b.height || 20) / 2);
      /* 上下留白（375 基准 px）：有赞实线模式渲染的是 hr{margin:10px 0}，线本身 1px，
         所以「高度」不决定占位 —— 见 miniprogram/utils/blocks.js 的同名注释。0 = 老行为。 */
      var lgapY = (b.gapY == null || b.gapY === '') ? 0 : Number(b.gapY) || 0;
      var lpadX = (b.pageMargin == null || b.pageMargin === '') ? 12 : (Number(b.pageMargin) || 0);
      if ((b.style || 'blank') === 'blank') {
        box += '<div class="pv-blank" style="height:' + lh + 'px;margin:' + lgapY + 'px ' + lpadX + 'px"></div>';
      } else {
        box += '<div style="margin:' + lgapY + 'px 0;padding:0 ' + lpadX + 'px">' +
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
      /* padding 10px 顶部 / 0 底部、字号 16px、行高 24px —— 与真机 `.c-rich` / `.cr-body`
         以及有赞 `.cap-richtext` 三处同口径（装修台允许近似，但**允许近似的是画法、不是数值**）。 */
      box += '<div class="pv-rich" style="padding:10px ' + richPad + 'px 0;background:' + (b.bg || 'transparent') + '">' +
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
      var ePad = (b.pageMargin == null || b.pageMargin === '') ? 0 : (Number(b.pageMargin) || 0);
      /*
       * 「全店风格」（styleType ≠ custom）= 纯文字均分的页签条，**有赞默认形态**：
       * 44px 高、每项 flex:1 均分（3 项 = 119.67px）、14px 文字、选中加粗 + 换选中色。
       * 有赞那条指示线是白色，白底上不可见，所以不画（与真机同口径）。
       * 只有「自定义」才走 tagStyle 的四选一 —— 见 miniprogram/utils/blocks.js 的 plain。
       */
      var ePlain = b.styleType !== 'custom' && b.mode !== 'dropdown';
      var ePlainItem = function (it, k) {
        var on = k === eAct;
        /* 项是**整条高**（stretch）、文字在项内居中，与真机 .ce-plainitem 同口径：
           写成「一行高 + 文字居中」看着一样，但可点区域只有一行，运营在装修台点不中上下边缘。 */
        return '<div style="flex:1 1 0%;min-width:0;display:flex;align-items:center;justify-content:center;line-height:20px;' +
          'overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;color:' +
          (on ? (b.activeColor || '#000000') : (b.color || '#969799')) + ';' +
          'font-weight:' + (on ? '500' : '400') + '" title="定位到区块 ' + (Number(it.target) || 0) + '">' + esc(it.text) + '</div>';
      };
      if (ePlain && eItems.length) {
        box += '<div style="background:' + pvColor(b.bg, '#FFFFFF') + ';padding:0 ' + ePad + 'px">' +
          '<div style="display:flex;align-items:stretch;height:44px">' + eItems.map(ePlainItem).join('') + '</div>' +
          '</div>';
        /* 空标签也要给出可选中区域，否则装修台里点不中/挪不动 */
        box += '';
      } else {
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
      }
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
      /*
       * 内容卡片（对标有赞「内容卡片」= note_card）。
       * 2026-10-12：这里原来是一份「大概像」的近似实现（字号 12px、内边距 6px 全是拍脑袋写的），
       * 复刻「创业故事」页时按真机实测口径重写 —— 预览必须与 miniprogram 侧的 .cc-* 同口径，
       * 否则运营对着偏小偏紧的预览去调，只会越调越不像（PITFALLS 的 O5）。
       * 单位：375 基准 px，预览画布就是 375 宽 → 原样使用。
       */
      var cCols = Number(b.cols) || 2;
      var cCellW = Math.floor(100 / cCols * 100) / 100;
      var cPadY = pvNum(b.padY, 6);
      var cGapX = pvNum(b.gapX, 4);
      var cGapY = pvNum(b.gapY, 4);
      var cImgH = pvNum(b.imgHeight, 0);
      var cClass = b.style === 'white' ? 'white' : (b.style === 'plain' ? 'plain' : 'shadow');
      var cRound = (b.radius || 'round') !== 'square';
      var cRatio = String(b.ratio == null ? '0.75' : b.ratio).trim();
      var cAuto = cRatio === 'auto';
      // 与小程序的 padTopPct 同一算法：4:3 → 133.33（不是 1.33），否则预览里卡片会被压成一条线
      var cPad = (cImgH > 0 || cAuto) ? 0 : Math.round(10000 / (Number(cRatio) || 0.75)) / 100;
      var cTitleFs = pvNum(b.titleSize, 14);
      var cTitleWeight = b.titleWeight === 'bold' ? '700' : '400';
      var cTitleLh = pvNum(b.titleLineHeight, 21);
      var cTitleAlign = b.titleAlign === 'center' ? 'center' : 'left';
      var cTitleColor = pvColor(b.titleColor, '#323233');
      var cTitlePadX = pvNum(b.titlePadX, 8);
      var cTitlePadY = pvNum(b.titlePadY, 8);
      var cItems = (b.items || []).filter(function (x) { return x && (x.image || x.title); });
      var cCells = cItems.slice(0, cCols === 1 ? 4 : 6).map(function (it) {
        var pic;
        if (cAuto && it.image) {
          pic = '<img src="' + attr(it.image) + '" style="display:block;width:100%">';
        } else {
          pic = '<div style="position:relative;padding-top:' + cPad + '%;' + (cImgH > 0 ? 'height:' + cImgH + 'px;' : '') + 'overflow:hidden;background:#f5f6f8">' +
            (it.image ? '<img src="' + attr(it.image) + '" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover">' : '') +
            '</div>';
        }
        return '<div style="width:' + cCellW + '%;box-sizing:border-box;padding:' + cGapY + 'px ' + cGapX + 'px">' +
          '<div class="pv-ccard ' + cClass + (cRound ? ' round' : '') + '">' +
          pic +
          '<div style="padding:' + cTitlePadY + 'px ' + cTitlePadX + 'px">' +
          (it.title ? '<div style="font-size:' + cTitleFs + 'px;font-weight:' + cTitleWeight + ';line-height:' + cTitleLh + 'px;text-align:' + cTitleAlign +
            ';color:' + cTitleColor + ';overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2">' + esc(it.title) + '</div>' : '') +
          (it.desc ? '<div style="font-size:11px;color:#8a919e;margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(it.desc) + '</div>' : '') +
          ((b.showTag || b.showRead || b.showLike)
            ? '<div style="margin-top:4px;display:flex;gap:6px;font-size:10px;color:#8a919e">' +
              (b.showTag ? '<span style="background:#f2f3f5;border-radius:3px;padding:0 4px">笔记</span>' : '') +
              (b.showRead ? '<span>👁 0</span>' : '') + (b.showLike ? '<span>♡ 0</span>' : '') + '</div>'
            : '') +
          '</div>' + (it.link ? linkBadge(it.link) : '') + '</div></div>';
      }).join('');
      box += '<div style="padding:' + cPadY + 'px ' + pvNum(b.pageMargin, 12) + 'px">' +
        (b.title ? '<div style="font-size:13px;font-weight:600;margin-bottom:6px">' + esc(b.title) + '</div>' : '') +
        (cItems.length ? '<div style="display:flex;flex-wrap:wrap;margin:0 -' + cGapX + 'px">' + cCells + '</div>'
                       : '<div style="color:#b8bec8;font-size:12px;padding:8px 0">（未添加卡片）</div>') +
        (b.more ? '<div style="text-align:center;font-size:12px;color:#8a919e;padding-top:6px">' +
          esc(b.moreText || '查看更多') + ' ›</div>' : '') +
        '</div>';
    } else if (kind === 'mixed_grid') {
      /*
       * 混合排列（对标有赞店铺侧三方扩展「混合排列A」extension-masswx-hpitemsa）。
       *
       * 口径与真机完全一致（见 miniprogram/utils/blocks.js 的同名分支）：
       *   - 单位全是 375 基准 px，预览画布就是 375 宽 → **原样使用，不换算**；
       *   - 行由 flex-wrap 自然形成，每张卡只决定占宽（2 列 50% / 3 列 33.33%），
       *     所以最后一行不满时自然左对齐留白，与有赞的 w50/w33 打类结果相同；
       *   - 预览层**不做入场动画**（与其它区块一致）：动画只在真机 index.wxss 的 @keyframes mg-in。
       */
      var mgLayout = ['3', '2', '1-3'].indexOf(b.layout) >= 0 ? b.layout : '2-3';
      var mgCols = function (i) { return mgLayout === '2' ? 2 : mgLayout === '3' ? 3 : mgLayout === '1-3' ? (i === 0 ? 1 : 3) : (i < 2 ? 2 : 3); };
      var mgGap = pvNum(b.gap, 4.5);
      var mgInner = pvNum(b.paddingInner, 8);
      var mgPadX = pvNum(b.paddingX, 7.5);
      var mgPadY = pvNum(b.paddingY, 0);
      var mgRadius = (b.radius || 'round') === 'square' ? 0 : pvNum(b.cardRadius, 8);
      var mgClass = ['shadow', 'outline', 'plain'].indexOf(b.cardStyle) >= 0 ? b.cardStyle : 'white';
      var mgCardBg = pvRgba(b.cardBg, b.cardBgAlpha, '#F8F8F8');
      // 图片容器用 padding-top 撑比例：133.33% = 100 ÷ 0.75（与 blocks.js 的 padTopPct 同一算法）
      var mgPadTop = Math.round(10000 / pvNum(b.imgRatio, 0.75)) / 100;
      var mgAlign = b.titleAlign === 'center' || b.titleAlign === 'right' ? b.titleAlign : 'left';
      var mgTitleLines = pvNum(b.itemTitleLines, 1) === 2 ? 2 : 1;
      var mgItems = (b.items || []).filter(function (x) { return x && (x.image || x.title); });
      var mgCells = mgItems.slice(0, 30).map(function (it, i) {
        var w = Math.floor(100 / mgCols(i) * 100) / 100;
        var nameStyle = 'margin-top:5px;line-height:1.5;color:' + pvColor(b.itemTitleColor, '#444444') +
          ';font-size:' + pvNum(b.itemTitleSize, 14) + 'px' +
          ';font-weight:' + (b.itemTitleWeight === 'normal' ? '400' : '700') +
          ';text-align:' + (b.itemTitleAlign === 'left' ? 'left' : 'center') +
          ';overflow:hidden;' + (mgTitleLines === 2
            ? 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2'
            : 'white-space:nowrap;text-overflow:ellipsis');
        return '<div style="width:' + w + '%;box-sizing:border-box">' +
          '<div class="pv-mgcard ' + mgClass + '" style="margin:' + mgGap + 'px;background:' + mgCardBg + ';border-radius:' + mgRadius + 'px">' +
          '<div style="position:relative;width:100%;height:0;padding-top:' + mgPadTop + '%;overflow:hidden;background:#f5f6f8;' +
          'border-radius:' + mgRadius + 'px ' + mgRadius + 'px 0 0">' +
          (it.image ? '<img src="' + attr(it.image) + '" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover">' : '') +
          '</div><div style="display:flex;flex-direction:column;margin:0 ' + mgInner + 'px ' + mgInner + 'px">' +
          (it.title ? '<div style="' + nameStyle + '">' + esc(it.title) + '</div>' : '') +
          '</div></div>' +
          (it.link ? linkBadge(it.link) : '') +
          '</div>';
      }).join('');
      box += '<div style="background:' + pvColor(b.bg, '#DFDEDE') + ';padding:' + mgPadY + 'px ' + mgPadX + 'px;box-sizing:border-box">' +
        ((String(b.subTitle || '').trim() || String(b.title || '').trim())
          ? '<div style="padding-top:' + pvNum(b.titleGapTop, 45) + 'px;margin-bottom:' + pvNum(b.titleGapBottom, 0) + 'px;' +
            'padding-left:15px;text-align:' + mgAlign + ';box-sizing:border-box">' +
            (String(b.subTitle || '').trim()
              ? '<div style="font-size:' + pvNum(b.subSize, 16) + 'px;line-height:1;margin-bottom:6px;color:' + pvColor(b.subColor, '#2E2B2B') +
                ';font-weight:' + (b.subWeight === 'bold' ? '700' : '400') + '">' + esc(b.subTitle) + '</div>' : '') +
            (String(b.title || '').trim()
              ? '<div style="font-size:' + pvNum(b.titleSize, 20) + 'px;line-height:1.4;color:' + pvColor(b.titleColor, '#444444') +
                ';font-weight:' + (b.titleWeight === 'normal' ? '400' : '700') + '">' + esc(b.title) + '</div>' : '') +
            '</div>'
          : '') +
        (mgItems.length ? '<div style="display:flex;flex-wrap:wrap;align-items:flex-start">' + mgCells + '</div>'
                        : '<div style="color:#b8bec8;font-size:12px;padding:8px 0">（未添加卡片）</div>') +
        '</div>';
    } else if (kind === 'tab_cate') {
      /*
       * 选项卡分类（对标有赞店铺侧三方扩展「选项卡Z4」extension-massdesign-tabcatez4）。
       *
       * 口径与真机完全一致（见 miniprogram/utils/blocks.js 的同名分支 + index.wxss 的 .tc-*）：
       *   - 单位全是 375 基准 px，预览画布就是 375 宽 → **原样使用，不换算**；
       *   - 卡片行同款「负外边距」写法：内容区左右 margin = 模块左右边距，
       *     卡片行左右 margin = -图文外间距，卡片自身 margin = +图文外间距 →
       *     卡片左右内缩 = 模块左右边距，相邻卡片间距 = 2 × 图文外间距（与有赞逐像素一致）；
       *   - 内容区 overflow: hidden + 左右 margin（不是 padding）—— 与有赞 `.con` 同构；
       *   - 只渲染**当前**选项卡：预览区是只读的，切换页签属于浏览态，统一显示第 1 个
       *     （与真机首屏、与有赞默认选中项一致）。所以这里不做任何点击切换。
       *   - 选项卡条：整条 38px、每项 flex:1 均分，文字块 34px + 下留 4px，
       *     选中项加粗 + 文字正下方 40×2 的短横线（有赞 `.van-tabs__line` 是 display:none 的，
       *     实线是每项自带的 text_line）。
       */
      var tcLayout = ['1', '2', '3'].indexOf(String(b.layout)) >= 0 ? String(b.layout) : '1';
      var tcCellW = Math.floor(100 / Number(tcLayout) * 100) / 100;
      var tcPadX = pvNum(b.paddingX, 11);
      var tcPadT = pvNum(b.paddingTop, 5);
      var tcPadB = pvNum(b.paddingBottom, 11);
      var tcPadInner = pvNum(b.paddingInner, 0);
      var tcGap = pvNum(b.gapOuter, 6);
      var tcCardClass = ['white', 'shadow', 'outline', 'plain'].indexOf(b.cardStyle) >= 0 ? b.cardStyle : 'shadow';
      var tcCardBg = tcCardClass === 'plain' ? 'transparent' : pvColor(b.cardBg, '#FFFFFF');
      var tcRadius = (b.radius || 'round') === 'square' ? 0 : 8;
      var tcImgRadius = tcRadius === 0 ? '0'
        : (b.halfRound === false ? (tcRadius + 'px ' + tcRadius + 'px 0 0') : (tcRadius + 'px'));
      var tcFit = b.fit === 'cover' ? 'cover' : 'contain';
      var tcRatio = String(b.imgRatio == null ? 'auto' : b.imgRatio).trim();
      var tcAuto = tcRatio === '' || tcRatio === 'auto';
      var tcPadTopPct = tcAuto ? 0 : Math.round(10000 / pvNum(tcRatio, 1)) / 100;
      var tcTitleClamp = pvNum(b.titleLines, 2) === 2 ? 2 : 1;
      var tcTitleGapY = pvNum(b.titleGapY, 12);
      var tcTitleGapX = pvNum(b.titleGapX, 9);
      var tcTitleFs = pvNum(b.titleSize, 14);
      var tcTitleColor = pvColor(b.titleColor, '#444444');
      var tcTitleWeight = b.titleBold === 'normal' ? '400' : '700';
      var tcTitleAlign = b.titleAlign === 'center' ? 'center' : 'left';
      var tcShowTitle = b.showTitle !== false;
      var tcTabFs = pvNum(b.tabFontSize, 15);
      var tcTabFg = pvColor(b.tabColor, '#444444');
      var tcTabFgOn = pvColor(b.tabActiveColor, '#444444');
      var tcTabs = (b.tabs || []).filter(function (t) { return t && typeof t === 'object'; });
      // 与真机同口径：空 tab / 空条目在渲染前先丢掉，否则预览里会多一个点不动的空白页签
      tcTabs = tcTabs.map(function (t) {
        return {
          name: String(t.name == null ? '' : t.name).trim(),
          items: (t.items || []).filter(function (x) {
            return x && (x.image || x.video || String(x.title || '').trim());
          })
        };
      }).filter(function (t) { return t.name || t.items.length; });
      /*
       * 空态**不提前 return**：提前 return 会漏掉末尾的 kindTag 与 opsBar，
       * 区块在装修台里就选不中、挪不动。统一走「空 tabs → 空 tab 条 + 空态文案」。
       */
      var tcCur = tcTabs[0] || { name: '', items: [] };
      var tcEmptyText = tcTabs.length ? '（本选项卡还没有内容）' : '（未添加选项卡）';
      var tcTabHtml = tcTabs.map(function (t, k) {
        var on = k === 0;
        return '<div style="position:relative;flex:1 1 0%;display:flex;align-items:center;justify-content:center;box-sizing:border-box">' +
          '<span style="width:100%;height:34px;line-height:34px;margin-bottom:4px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' +
          'font-size:' + tcTabFs + 'px;color:' + (on ? tcTabFgOn : tcTabFg) + ';font-weight:' + (on ? '700' : '400') + '">' + esc(t.name) + '</span>' +
          (on ? '<span style="position:absolute;left:50%;bottom:0;width:40px;height:2px;margin-left:-20px;background:' + tcTabFgOn + '"></span>' : '') +
          '</div>';
      }).join('');
      var tcCells = tcCur.items.slice(0, 60).map(function (it) {
        var pic;
        if (it.video) {
          pic = '<div style="position:relative;width:100%;height:0;padding-top:56.25%;overflow:hidden;border-radius:' + tcImgRadius + '">' +
            '<div style="position:absolute;left:0;top:0;width:100%;height:100%;background:#20242c;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center">▶ 视频</div>' +
            (it.image ? '<img src="' + attr(it.image) + '" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;opacity:.5">' : '') +
            '</div>';
        } else if (tcAuto) {
          pic = it.image
            ? '<img src="' + attr(it.image) + '" style="display:block;width:100%;border-radius:' + tcImgRadius + '">'
            : '';
        } else {
          pic = '<div style="position:relative;width:100%;height:0;padding-top:' + tcPadTopPct + '%;overflow:hidden;border-radius:' + tcImgRadius + '">' +
            (it.image ? '<img src="' + attr(it.image) + '" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:' + tcFit + '">' : '') +
            '</div>';
        }
        var title = (tcShowTitle && String(it.title || '').trim())
          ? '<div style="margin:' + tcTitleGapY + 'px ' + tcTitleGapX + 'px;color:' + tcTitleColor + ';font-size:' + tcTitleFs + 'px;' +
            'font-weight:' + tcTitleWeight + ';text-align:' + tcTitleAlign + ';word-break:break-all;overflow:hidden;' +
            /* 行高 1.5 —— 有赞 `.item_title` 的实测值（14px→21px、11px→16.5px、14px→21px，三页一致）。
               不写的话浏览器按 `normal` 算（≈1.36），两行标题就矮 3~4px，卡片高度跟着错。 */
            'line-height:1.5;' +
            (tcTitleClamp === 2
              ? 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2'
              : 'white-space:nowrap;text-overflow:ellipsis') + '">' + esc(it.title) + '</div>'
          : '';
        return '<div style="width:' + tcCellW + '%;flex-shrink:0;box-sizing:border-box">' +
          '<div class="pv-tccard ' + tcCardClass + '" style="margin:' + tcGap + 'px;background:' + tcCardBg + ';border-radius:' + tcRadius + 'px">' +
          pic + title + '</div>' +
          (it.link ? linkBadge(it.link) : '') +
          '</div>';
      }).join('');
      box += '<div style="background:' + pvColor(b.bg, 'transparent') + ';padding:' + tcPadT + 'px 0 ' + tcPadB + 'px;box-sizing:border-box' +
        (b.bgImage ? ';background-image:url(' + attr(b.bgImage) + ');background-size:cover;background-position:top center;background-repeat:no-repeat' : '') + '">' +
        '<div style="display:flex;align-items:flex-start;background:' + pvColor(b.tabBg, 'transparent') + ';height:38px;box-sizing:border-box">' +
        tcTabHtml + '</div>' +
        /* 页签条与首行卡片之间的固定 10px：有赞 `.van-tab__pane-wrapper` 内层写死的
           padding-top（与「模块内边距」「图文内间距」无关），6 个页面实测全是 10 —— 见
           miniprogram/utils/blocks.js 的 paneTopRpx。 */
        '<div style="background:' + pvColor(b.innerBg, 'transparent') + ';padding-top:10px">' +
        '<div style="overflow:hidden;box-sizing:border-box;margin:0 ' + tcPadX + 'px;padding:' + tcPadInner + 'px">' +
        '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;margin:0 -' + tcGap + 'px">' +
        (tcCells || '<div style="width:100%;color:#b8bec8;font-size:12px;padding:8px 0">' + tcEmptyText + '</div>') +
        '</div></div></div></div>';
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
    } else if (UC_PARTS[kind]) {
      // 个人中心（「我的」页）专属区块：预览口径见 pvUserCenter
      box += pvUserCenter(b, kind);
    } else if (SHELL_PARTS[kind]) {
      box += pvShell(b, kind);
    }

    box += kindTag(kind, i);
    box += opsBar(p, listPath, i);
    box += '</div>';
    return box;
  }

  /* --------------------------- 各页面渲染 --------------------------- */

  /**
   * 页面底色包装 —— 内置页与自定义页的真机 WXML 根节点**是同一行**：
   *   `pages/index/index.wxml`  → `<view class="page" style="background: {{meta.bg || '#F5F6F8'}};">`
   *   `pages/custom/index.wxml` → 同上（逐字一致）
   * 所以这一层必须两边都用，且 `PAGE_BG_DEF` 要与这两处 WXML 以及
   * `schema.js` 的 `CUSTOM_META_DEFAULT.bg` **三处逐字相同**。
   *
   * ⚠️ 为什么不能靠装修台手机壳自己的底色（`.phone-screen { background: #fff }`）凑：
   * 复刻 03「创业故事」时实测两边**根本不是同一个颜色** —— 运营在装修台照着白底/灰底调，
   * 真机却是另一个（03 页正好反过来），改完还以为是没生效。底色只能由这里画出来。
   * 首页（`pvHome`）此前同样漏了这层，是同一类缺陷，一并补上。
   *
   * 外层 `min-height:100%` 只为让空页在手机壳里也铺满（对应真机 `.page { min-height: 100vh }`）。
   * 加包装层前确认过 `admin.js` 对 `#preview` 只有 `innerHTML =` 与 `querySelector('[data-path]')`
   * 两处用法，都不依赖直系子元素；区块自身的 `data-path` / 选中态 / 悬浮操作条全在包装层内部。
   */
  var PAGE_BG_DEF = '#F5F6F8';
  function pvPageBg(d, inner) {
    var bg = (d && d.meta && d.meta.bg) || PAGE_BG_DEF;
    return '<div class="pv-page" style="min-height:100%;background:' + bg + '">' + inner + '</div>';
  }

  function pvHome(d) {
    var h = '';
    (d.blocks || []).forEach(function (b, i) { h += pvBlock(b, i); });
    h += '<div class="pv-shop pv-block' + (CTX.edit && CTX.sel === 'shop' ? ' active' : '') + '" data-path="__shop__" style="position:relative">' +
      img(d.shop && d.shop.avatar, 'width:56px;height:56px;border-radius:50%;margin:0 auto 8px') +
      '<b>' + esc((d.shop && d.shop.name) || '') + '</b><br><span>' + esc((d.shop && d.shop.slogan) || '') + '</span></div>';
    return pvPageBg(d, h);
  }

  /** 自定义页面预览：只有区块流（不含首页底部的店招卡片）。 */
  function pvCustom(d) {
    var blocks = (d && d.blocks) || [];
    var inner;
    if (!blocks.length) {
      inner = '<div class="insp-empty" style="padding:56px 16px;line-height:2">' +
        '这个页面还是空的<br><span style="color:#b8bec8">从左侧「组件库」点一个组件开始装修</span></div>';
    } else {
      inner = '';
      blocks.forEach(function (b, i) { inner += pvBlock(b, i); });
    }
    return pvPageBg(d, inner);
  }

  /**
   * 店铺笔记预览：店长区（店名 / 头像 / 进店按钮 / 标题 / 发布时间 / 标签）+ 笔记正文 + 组件流。
   *
   * 三段与真机 `miniprogram/packageNews/note/note.wxml` **逐段对应** ——
   * 装修台看到的顺序与内容与真机一致（这里按装修台手机壳的口径近似样式，
   * 真机那一份由 /preview 直接编译 note.wxml 得到，两条链路各有分工）。
   *
   * ⚠️ 与自定义页（pvCustom）的区别：自定义页整页只有一个组件流；
   *    笔记有**固定头部 + 固定正文**，只有第三段能自由增删排序。
   *    这也是笔记不复用 pages/custom 的原因。
   *
   * ⚠️ 「浏览量 / 点赞数 / 推荐商品」三个开关**这里与真机都不渲染**：
   *    本店没有笔记计数器和推荐引擎。面板里保留它们只是为了与有赞的面板一致，
   *    绝不在预览或真机上编一个「0 浏览 / 0 赞」出来。
   *
   * `shop` 由调用方传入（真源 replica.SHOP，装修台经 /api/admin/settings 取一次）。
   */
  function pvNote(d, shop) {
    var h = (d && d.header) || {};
    var body = (d && d.body) || {};
    var full = String(body.full === undefined ? '1' : body.full) === '1';
    var name = (shop && shop.name) || '';
    var avatar = (shop && shop.avatar) || '';

    var head = '<div class="pv-block' + cls('header') + '" data-path="header" style="position:relative;background:#fff;padding:12px 16px 10px;border-bottom:1px solid #eef0f3">' +
      '<div style="display:flex;align-items:center">' +
        (avatar
          ? img(avatar, 'width:32px;height:32px;border-radius:50%;flex:none')
          : '<span style="width:32px;height:32px;border-radius:50%;background:#f0f2f5;color:#8a919e;display:flex;align-items:center;justify-content:center;flex:none;font-size:12px">店</span>') +
        '<b style="margin-left:8px;flex:1;min-width:0;font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(name) + '</b>' +
        (h.showEnterShop === false ? ''
          : '<span style="flex:none;margin-left:8px;padding:2px 10px;border:1px solid #C8102E;border-radius:999px;color:#C8102E;font-size:11px">进店逛逛</span>') +
      '</div>' +
      (h.showTitle === false ? ''
        : '<div style="margin-top:10px;font-size:19px;font-weight:600;line-height:1.4;word-break:break-all">' + esc(h.title || '（未填标题）') + '</div>') +
      (h.showPublishTime === false || !d.publishedAt ? ''
        : '<div style="margin-top:5px;font-size:12px;color:#9aa1ad">发布于 ' + esc(dateText(d.publishedAt)) + '</div>') +
      (String(h.tags || '').trim() ? '<div style="margin-top:8px">' + tagsRow(h.tags) + '</div>' : '') +
    '</div>';

    var html = String(body.html || '');
    var bodyHtml = html
      ? '<div class="pv-block' + cls('body') + '" data-path="body" style="position:relative;padding:10px ' + (full ? 0 : 12) + 'px 0;background:' + attr(body.bg || '#ffffff') + '">' +
          pvRich(html) +
        '</div>'
      : '';

    var blocksHtml = '';
    ((d && d.blocks) || []).forEach(function (b, i) { blocksHtml += pvBlock(b, i); });

    if (!bodyHtml && !blocksHtml) {
      blocksHtml = '<div class="insp-empty" style="padding:40px 16px;line-height:2">' +
        '正文还没写，也还没有加组件<br><span style="color:#b8bec8">在右侧「笔记正文」里写正文，或从左侧「组件库」加组件</span></div>';
    }
    // 笔记没有 meta（页面设置），底色走 pvPageBg 的默认档 —— 与真机 note.wxss 的 .note-page 同值
    return pvPageBg(d, head + bodyHtml + blocksHtml);
  }

  /** 标签串（「洗地机,吸尘器」）→ 一排小标签；空串给空 */
  function tagsRow(tags) {
    var list = String(tags || '').split(/[,，\s]+/).filter(Boolean);
    if (!list.length) return '';
    return list.map(function (t) {
      return '<span style="display:inline-block;margin:0 6px 4px 0;padding:1px 8px;border-radius:4px;background:#FDECEE;color:#C8102E;font-size:11px">' + esc(t) + '</span>';
    }).join('');
  }

  /** 发布时间（毫秒）→ YYYY-MM-DD，与真机 utils/format.js 的 formatTime(...).slice(0,10) 同口径 */
  function dateText(ts) {
    var d2 = new Date(Number(ts));
    if (isNaN(d2.getTime())) return '';
    var p = function (v) { return String(v).padStart(2, '0'); };
    return d2.getFullYear() + '-' + p(d2.getMonth() + 1) + '-' + p(d2.getDate());
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

  /**
   * 「我的」（个人中心）预览。
   *
   * 2026-10-10 起「我的」与首页 / 自定义页一样是**区块流页面**（replica.MINE_BLOCKS），
   * 所以这里改成渲染区块 —— 旧版是硬编码的「店铺卡片 + 四宫格」，
   * 装修台里明明列着「我的」却什么也加不进去，就是这个原因。
   * 店铺信息块放在最后（真机也一样：它是页面级字段，不属于区块列表）。
   */
  function pvMine(d) {
    var blocks = d.blocks || [];
    var s = d.shop || {};
    var h = '';
    if (!blocks.length) {
      h += '<div class="insp-empty" style="padding:40px 16px;line-height:2">' +
        '这个页面还是空的<br><span style="color:#b8bec8">从左侧「组件库」点一个组件开始装修</span></div>';
    } else {
      blocks.forEach(function (b, i) { h += pvBlock(b, i); });
    }
    h += '<div class="pv-shop pv-block' + cls('shop') + '" data-path="__shop__" style="position:relative">' +
      img(s.avatar, 'width:48px;height:48px;border-radius:50%;margin:0 auto 8px') +
      '<b>' + esc(s.name || '') + '</b><br><span>' + esc(s.slogan || '') + '</span></div>';
    return h;
  }

  var PAGE_RENDERERS = { home: pvHome, lexy: pvLexy, news: pvNews, product: pvProduct, mine: pvMine };

  /**
   * 手机壳内「占满一屏」的两栏要模拟内置 scroll-view 的滚动条口径：**浮层、不占布局宽**。
   *
   * 浏览器里 `overflow-y:auto` 默认会实打实吃掉 8px 布局宽 —— 装修台实测右栏内容
   * 277.5 被压成 269.5，比真机（/preview）与有赞都窄 8px；运营照着偏窄的样板去调，
   * 只会越调越不像。规则本身**只有一份定义**：/shared/mp-wxss.js 的 MpWxss.scrollViewCss
   * （预览页把 WXML 的 scroll-view 编成 HTML 时用的就是同一条）。
   * 两处必须同口径 —— 即 .workbuddy/memory/PITFALLS.md 的 O5「预览端与真机必须逐项同口径」。
   */
  var SCROLL_CSS_FLAG = 'data-pv-scrollcss';
  function ensureScrollCss(doc) {
    if (!doc || !doc.documentElement || doc.documentElement.hasAttribute(SCROLL_CSS_FLAG)) return;
    var css = (root.MpWxss && root.MpWxss.scrollViewCss) ? root.MpWxss.scrollViewCss('.phone-screen') : '';
    if (!css) {
      // 宁可吵一声，也不要静默地少 8px：少这条装修台预览就会比真机窄
      if (root.console && root.console.warn) {
        root.console.warn('[pv-render] 未加载 /shared/mp-wxss.js：手机壳内的滚动条会占掉 8px，预览比真机窄');
      }
      return;
    }
    var style = doc.createElement('style');
    style.setAttribute(SCROLL_CSS_FLAG, '');
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
    doc.documentElement.setAttribute(SCROLL_CSS_FLAG, '');
  }

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
    // 每次渲染都调，靠 flag 保证只注入一次（装修台切页面会反复进这里）
    ensureScrollCss(typeof document !== 'undefined' ? document : null);
    data = data || {};
    var fn = PAGE_RENDERERS[key];
    /*
     * 非内置页的分派顺序**必须先看 shopnote 再看 custom**：
     *   笔记与自定义页都带 `custom: true`（两者复用同一条装修链路），
     *   先判 custom 会把笔记当成「整页一个组件流」渲染 —— 店长区与正文整体消失。
     * 预览页（/preview）只知道 key，所以还留一层兜底：有 blocks 数组就按区块流渲染，
     * 不然自定义页会白屏。
     */
    if (!fn && opts && opts.shopnote) fn = pvNote;
    if (!fn && ((opts && opts.custom) || Array.isArray(data.blocks))) fn = pvCustom;
    if (!fn) return '<div class="insp-empty">该页面暂不支持预览</div>';
    return fn(data, CTX.shop);
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
