/**
 * 装修区块 → 渲染数据
 *
 * 首页（pages/index）与自定义页（pages/custom，装修台「新建页面」建的页）用的是
 * 同一套装修区块，所以派生值计算、单位换算、商品区块的实时数据拉取都收敛在这里
 * 一份实现里，避免两边各写一遍后逐渐走样。
 *
 * ⚠️ 单位口径（必须与装修台属性面板、后台预览保持一致）：
 *   - height 字段本身即 rpx（750 宽基准），直接拿去设高，不要再 ×2；
 *   - pageMargin / paddingY / iconSize / gap / imageGap 是 375 基准设计稿 px，需 ×2 转 rpx。
 *   历史坑：height 曾被当成 375 基准 px 再 ×2，导致首屏图被放大一倍后裁切。
 */

const { resolveAssets, assetUrl } = require('./asset');
const { px2rpx, heightRpx } = require('./units');
const goodsSvc = require('../services/goods');

const SIZE_CLASS = { sm: 's-sm', md: 's-md', lg: 's-lg' };

/**
 * 「有赞基础/高级组件余下 37 项」的渲染族。
 *
 * 键 = 区块类型（与装修台 `schema.js` 的区块 kind 一一对应），值 = 渲染族：
 *   card —— 单卡片（标题 / 主图 / 描述 / 按钮）
 *   list —— 列表型（同上，但语义上是「一组」）
 *   这两种当前共用同一段 WXML；分族是为了以后要分开渲染时不用改数据结构。
 *
 * ⚠️ 新增依赖型组件要同时改三处：这里 → `templates/blocks.wxml` 的 `block.fam` 分支 →
 *    `pages/index/index.wxss` 的 `.c-yz` 系列样式（装修台预览另有 `shared/pv-render.js`）。
 */
const SHELL_FAMILY = {
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

/* ================= 个人中心（「我的」页）区块的渲染元信息 =================
 *
 * ⚠️ 这些表是 `server/decorate/yzUserCenter.js` 里对应清单的**真机侧最小子集**：
 *    - `TOOL_META` ⇄ `UC_TOOL_ITEMS`（键集与 real / icon **取值**都必须逐项一致）
 *    - `UC_STAT_DEFS` ⇄ `UC_KINDS.uc_stats` 的 7 个开关
 *    - `UC_ORDER_DEFS` ⇄ `UC_KINDS.uc_order` 的 6 个开关
 *
 * `real: false` = 自建商城没有这套业务底座。这类入口**照样渲染**（与有赞同版式），
 * 但点下去落到 `packageUser/coming` 把「缺哪套数据」讲清楚 —— 以前是弹一句
 * 「该功能开发中」，用户既不知道是谁的问题也不知道该去哪儿，比没入口还糟。
 * `real: true` 的必须**真有落点**：要么在 `utils/blockPage.js` 的 `TOOL_ROUTE` 里
 * 有真实页面，要么在 `TOOL_NON_NAV` 里声明用哪种非跳转方式落地（客服 / 拨号）。
 * 标 true 却点不动，比标 false 更糟 —— 那是一次「页面暂未开放」的失败跳转。
 */

/** 必备工具：图标 + 是否真的能跳（键集与 UC_TOOL_ITEMS 一致，自检会对账） */
const TOOL_META = {
  memberCode: { icon: '码', real: true },
  taskCenter: { icon: '任', real: false },
  cart: { icon: '车', real: true },
  gifts: { icon: '赠', real: false },
  customerServiceChat: { icon: '服', real: true },
  deliveryAddress: { icon: '址', real: true },
  merchantsCall: { icon: '电', real: true },
  cashBack: { icon: '返', real: false },
  fxCenter: { icon: '销', real: false },
  offlineStore: { icon: '店', real: false },
  purchaseColumnAndContent: { icon: '课', real: false },
  paidContentCertificate: { icon: '证', real: false },
  paidContentExamination: { icon: '考', real: false },
  exchangeGiftCard: { icon: '兑', real: false },
  paidContentExerciseBook: { icon: '业', real: false },
  blankLine: { icon: '白', real: false },
  exhibitionReserve: { icon: '订', real: false },
  accountSettings: { icon: '号', real: true },
  restaurantReserve: { icon: '座', real: false },
  referralRewards: { icon: '邀', real: false },
  about: { icon: '关', real: true },
  favorite: { icon: '藏', real: true },
  footprint: { icon: '迹', real: true }
};

/**
 * 个人资产 7 项（与有赞面板的 7 个复选项一一对应）。
 *
 * `route` = 这一项在本商城的真实落点（有就真跳）；没写 `route` 的项自建商城没有对应
 * 业务底座，点击统一落「功能未开放」页，并把 `dep`（缺的是哪套数据）写在页面上。
 * ⚠️ 本表是**唯一一份**：route 只在这里定义，`utils/blockPage.js` 直接 require 本表来跳转
 *    （那张 `TOOL_ROUTE` 是「必备工具」的，两套条目不是同一批，别混）。
 */
const UC_STAT_DEFS = [
  { k: 'showBalance', key: 'balance', label: '余额', unit: '元', dep: '会员余额账户' },
  { k: 'showPoints', key: 'points', label: '积分', unit: '', dep: '积分体系' },
  { k: 'showCard', key: 'card', label: '权益卡', unit: '张', dep: '付费权益卡' },
  { k: 'showCoupon', key: 'coupon', label: '优惠券', unit: '张', route: '/packageUser/coupon/coupon' },
  { k: 'showWallet', key: 'wallet', label: '钱包', unit: '元', dep: '钱包账户' },
  { k: 'showGiftCard', key: 'giftCard', label: '礼品卡', unit: '张', dep: '礼品卡' },
  { k: 'showPickupCard', key: 'pickupCard', label: '提货卡', unit: '张', dep: '提货卡' }
];

/**
 * 个人资产项的静态定义（供页面级跳转 / 说明使用）。
 * @returns {{key:string,label:string,unit:string,route:string,dep:string}|null}
 */
function statDef(key) {
  const d = UC_STAT_DEFS.filter((x) => x.key === key)[0];
  if (!d) return null;
  return { key: d.key, label: d.label, unit: d.unit, route: d.route || '', dep: d.dep || '' };
}

/** 我的订单 6 个入口（与有赞面板的 6 个开关一一对应） */
const UC_ORDER_DEFS = [
  { k: 'showPendingPay', key: 'PENDING_PAY', label: '待付款', icon: '付' },
  { k: 'showPendingShip', key: 'PENDING_SHIP', label: '待发货', icon: '发' },
  { k: 'showShipped', key: 'SHIPPED', label: '待收货', icon: '收' },
  { k: 'showReview', key: 'FINISHED', label: '待评价', icon: '评' },
  { k: 'showRefund', key: 'REFUND', label: '退款/售后', icon: '退' }
];

/** 个人中心相关的 9 个区块类型（供自检与页面判断复用） */
const UC_KIND_LIST = ['uc_navbar', 'uc_profile', 'uc_stats', 'uc_order', 'uc_tools', 'text', 'link', 'blank', 'follow_oa'];

/** 店铺主题色（按钮「跟随店铺风格」时使用；与 tabBar selectedColor 保持一致） */
const BRAND = '#C8102E';

/**
 * 富文本块级标签的**上下外边距重置**。
 *
 * 为什么必须做：有赞的富文本容器带一层 `p { margin: 0 }` 重置，
 * 而编辑器导出的 HTML 往往**只写 margin-bottom**（如 `<p style="margin-bottom:5px">`）。
 * 于是同一个 HTML：有赞那边 p 的 margin-top 是 0，我们这边是浏览器默认的 `1em = 16px`
 * ——「加入我们」页整块因此高了 27px，页签条、标题、卡片全部跟着下移。
 *
 * 为什么只能在 HTML 上做、不能用 wxss 兜：小程序的 `<rich-text>` **不接受外部样式选择器**
 * （wxss 里的 `.c-rich p { margin: 0 }` 打不进 nodes 内部），
 * 所以这条重置必须写进 nodes 自己的 style 里。
 * ⚠️ 三处口径必须一致：这里 / 装修台的 pvRich / 预览链路的 richSafe。
 *    节点自己写了 margin 的一律不动（inline 优先，与有赞同一语义）。
 */
function richResetMarginTop(html) {
  return String(html || '').replace(
    /<(p|div|h[1-6]|ul|ol|li|blockquote|figure|pre|table)\b([^>]*)>/gi,
    function (whole, tag, rest) {
      if (/\bmargin(-top)?\s*:/i.test(rest)) return whole;   // 自己写了 margin：尊重它
      var m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(rest);
      if (m) {
        var val = m[2] !== undefined ? m[2] : m[3];
        return whole.replace(m[0], 'style="margin-top:0;' + val + '"');
      }
      return '<' + tag + rest + ' style="margin-top:0">';
    }
  );
}

/**
 * 富文本净化：小程序 rich-text 本身不执行脚本，但历史脏数据里可能带 <script>/on* 属性，
 * 这里统一剥掉，避免「编辑器里粘了网页源码」把脏东西带上线。
 */
function sanitizeRich(html) {
  return richResetMarginTop(
    String(html || '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '')
  );
}


/**
 * 色值 + 透明度 → rgba()。
 *
 * 有赞的「商品背景色」本身就是 rgba（#F8F8F8 的 33%），而装修台的取色器只认 #RRGGBB，
 * 所以后台把它拆成「底色 + 透明度」两个字段，由真机与预览**各自合成一次**。
 * ⚠️ 两处的合成口径必须一致（同为 `Math.round(a)/100`），否则会出现
 *   「装修台看是浅灰、真机是纯白」这种只差一点的走样。
 */
function hexToRgba(hex, alphaPct, defHex) {
  const h = String(hex == null || String(hex).trim() === '' ? (defHex || '#F8F8F8') : hex).trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(h.charAt(0) === '#' ? h : '#' + h);
  const rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [248, 248, 248];
  const n = Number(alphaPct);
  const a = isNaN(n) ? 33 : Math.min(100, Math.max(0, n));
  return 'rgba(' + rgb.join(',') + ',' + (Math.round(a) / 100) + ')';
}

/**
 * 把装修数据转成渲染需要的派生值，让 wxml 保持干净（不在模板里做算术）。
 *
 * resolveAssets 会把后台上传的 /uploads/… 相对地址补成完整地址，外链原样保留。
 */
function normalizeBlock(b, index) {
  const o = resolveAssets(b);
  const kind = o.type;

  if (kind === 'swiper') {
    o.mode = o.mode || 'poster';
    o.hRpx = heightRpx(o.height, 1322);
    o.marginRpx = px2rpx(o.pageMargin);
    o.gapRpx = px2rpx(o.imageGap);
    o.halfGapRpx = Math.round(o.gapRpx / 2);
    o.round = o.radius === 'round';
    o.interval = o.interval || 4500;
    o.indicator = o.indicator || 'dots';
    // 每张图带自己的跳转，所以统一成 { image, link }；
    // 兼容老数据：images 曾是「地址字符串数组」，发布一次后会被升级成新结构。
    o.images = (o.images || [])
      .map((x) => (typeof x === 'string' ? { image: x, link: '' } : { image: (x && x.image) || '', link: (x && x.link) || '' }))
      .filter((x) => x.image);
    o.dCur = 0;
  } else if (kind === 'image') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.round = o.radius === 'round';
  } else if (kind === 'video') {
    o.hRpx = heightRpx(o.height, 420);
    o.marginRpx = px2rpx(o.pageMargin);
    o.round = o.radius === 'round';
  } else if (kind === 'title') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.padYRpx = px2rpx(o.paddingY);
    o.sizeClass = SIZE_CLASS[o.size] || 's-md';
    o.align = o.align === 'center' ? 'center' : 'left';
  } else if (kind === 'line') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.hRpx = heightRpx(o.height, 20);
    o.style = o.style || 'blank';
    /*
     * 上下留白：线 / 空白块**自身以外**的垂直间距（375 基准 px）。
     * 有赞的实线模式渲染的是 `hr { margin: 10px 0 }`（线本身 1px），「高度」字段在那条链路上
     * 不决定占位 —— 2026-10-12 复刻 6 个资讯页实测：整块占位 = 10 + 1 + 10 = 21px。
     * 默认 0 = 补字段之前的行为，老数据渲染结果不变。
     */
    o.gapYRpx = px2rpx(o.gapY);
  } else if (kind === 'notice') {
    o.marginRpx = px2rpx(o.pageMargin);
  } else if (kind === 'nav') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.iconRpx = px2rpx(o.iconSize || 88);
    const cols = Number(o.cols) || 4;
    o.colW = Math.floor(100 / cols * 100) / 100;
    o.items = (o.items || []).filter((x) => x && (x.text || x.image));
  } else if (kind === 'cube') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.gapRpx = px2rpx(o.gap);
    const cols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / cols * 100) / 100;
    o.items = (o.items || []).filter((x) => x && x.image);
  } else if (kind === 'hotspot') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.hRpx = heightRpx(o.height, 500);
    o.areas = (o.areas || []).filter((a) => a && a.link);
  } else if (kind === 'shop') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.align = o.align === 'left' ? 'left' : 'center';
    o.style = o.style || 'avatar';
  } else if (kind === 'goods') {
    o.marginRpx = px2rpx(o.pageMargin);
    const cols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / cols * 100) / 100;
    o.limit = Number(o.limit) || 4;
    o.goods = [];
    // 「没有商品」与「接口失败」是两件事，模板要能分开说，不能一律显示「暂无商品」
    o.goodsFailed = false;
  } else if (kind === 'shop_rank') {
    /* 店铺榜单：复用「商品」那套卡片样式，数据按销量降序（在 loadGoodsData 里排）。 */
    o.marginRpx = px2rpx(o.pageMargin);
    o.cellW = 50;
    o.limit = Number(o.limit) || 6;
    o.cols = '2';
    o.cardBg = o.cardBg || '#FFFFFF';
    o.showTitle = o.showTitle !== false;
    o.showPrice = o.showPrice !== false;
    o.showBuy = false;
    o.title = o.title || '店铺榜单';
    o.goods = [];
    o.goodsFailed = false;
  } else if (kind === 'goods_group') {
    /*
     * 商品分组：菜单 + 当前分组的商品。
     * 分组内容由 `loadGoodsData` 一次性填进 `o.groupTabs`（每项 { name, goods }），
     * 这里只算「当前展示哪个分组」，切分组是页面 setData，不再打接口。
     */
    o.marginRpx = px2rpx(o.pageMargin);
    o.menuTop = o.menuStyle !== 'left';
    o.stickyOn = o.sticky === '1';
    o.groupTabs = [];
    o.active = 0;
    o.goods = [];
    o.goodsFailed = false;
    o.cellW = o.listStyle === 'three' ? 33.33 : (o.listStyle === 'one' ? 100 : 50);
    o.cardBg = o.cardBg || '#FFFFFF';
    o.showTitle = true;
    o.showPrice = true;
    o.showBuy = o.btnStyle !== 'plain';
  } else if (kind === 'hot_words') {
    /* 店铺热搜：词表就在面板里配，真机直接用（不需要后端）。 */
    o.marginRpx = px2rpx(o.pageMargin);
    o.singleLine = o.mode === 'single';
    o.badgeOn = o.badge !== false;
    o.colorOn = o.colorMode === 'custom';
    o.fg = o.colorOn && o.color ? o.color : BRAND;
    o.words = (o.words || [])
      .map((w) => (typeof w === 'string' ? w : (w && w.word) || ''))
      .map((w) => String(w).trim())
      .filter(Boolean)
      .slice(0, 10);
  } else if (kind === 'rich_text') {
    // 「全屏显示」= 内容占满整宽，此时忽略页面边距（与有赞一致）
    o.marginRpx = o.full === '0' ? px2rpx(o.pageMargin) : 0;
    o.nodes = sanitizeRich(o.html);
  } else if (kind === 'search') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.hRpx = px2rpx(o.boxHeight || 36);
    o.round = o.shape === 'round';
    o.align = o.textAlign === 'center' ? 'center' : 'flex-start';
    o.placeholder = o.placeholder || '搜索店内商品';
  } else if (kind === 'elevator') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.dropdown = o.mode === 'dropdown';
    o.tagStyle = o.tagStyle || 'bg';
    /*
     * 「全店风格」= 纯文字均分的页签条（**有赞默认形态**），不是四选一的那种标签块。
     * 2026-10-12 在「售后服务」页实测：44px 白底条、每项 flex:1 均分（3 项 = 119.67px）、
     * 文字 14px、选中加粗并换成选中色、下方一条 40×3 的指示线（选中色 = 白 → 视觉上不可见）。
     * 只有「自定义」才走 tagStyle 的四选一（背景 / 圆框 / 方框 / 下划线）。
     * ⚠️ 老数据（styleType 缺省 = theme）此前渲染的是四选一里的「背景模式」，
     *    与有赞不符；本项目入库数据里从未用过 elevator（replica.js 无该类型），故这次直接纠正。
     */
    o.plain = o.styleType !== 'custom';
    o.plainHRpx = px2rpx(44);          // 有赞固定 44px，面板无高度项
    o.plainFsRpx = px2rpx(14);         // 有赞实测 14px
    o.activeIndex = o.activeIndex || 0;
    o.items = (o.items || [])
      .map((x) => ({ text: (x && x.text) || '', target: Number((x && x.target) || 0) || 0 }))
      .filter((x) => x.text);
  } else if (kind === 'enter_shop') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.justify = o.align === 'right' ? 'flex-end' : (o.align === 'left' ? 'flex-start' : 'center');
    o.round = o.radius !== 'square';
    o.text = o.text || '进入店铺';
  } else if (kind === 'audio') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.right = o.side === 'right';
    o.duration = Number(o.duration) || 6;
    // 气泡宽度随时长增长（与微信语音气泡一致的手感），上下限兜住极端值
    o.widthRpx = Math.max(220, Math.min(520, 160 + o.duration * 24));
  } else if (kind === 'service') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.justify = o.align === 'right' ? 'flex-end' : (o.align === 'left' ? 'flex-start' : 'center');
    o.round = o.radius !== 'square';
    o.text = o.text || '在线咨询';
  } else if (kind === 'content_card') {
    /*
     * 内容卡片（对标有赞「内容卡片」= note_card）。
     * 2026-10-12 复刻「创业故事」页时按真机实测补了一批细粒度字段 ——
     * 它们的**默认值等于补字段之前写死在 index.wxss 里的那套值**，所以老数据渲染结果不变。
     */
    const ccNum = (v, d) => { const n = Number(v); return (v === '' || v === null || v === undefined || isNaN(n)) ? d : n; };
    o.marginRpx = px2rpx(o.pageMargin);
    const ccols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / ccols * 100) / 100;
    o.cardClass = o.style === 'white' ? 'white' : (o.style === 'plain' ? 'plain' : 'shadow');
    o.round = o.radius !== 'square';
    o.padYRpx = px2rpx(ccNum(o.padY, 6));
    o.gapXRpx = px2rpx(ccNum(o.gapX, 4));
    o.gapYRpx = px2rpx(ccNum(o.gapY, 4));
    o.imgHRpx = px2rpx(ccNum(o.imgHeight, 0));
    o.fixedImgH = o.imgHRpx > 0;
    o.titleSizeRpx = px2rpx(ccNum(o.titleSize, 14));
    o.titleWeightCss = o.titleWeight === 'bold' ? '700' : '400';
    o.titleLhRpx = px2rpx(ccNum(o.titleLineHeight, 21));
    o.titleAlignCss = o.titleAlign === 'center' ? 'center' : 'left';
    o.titleColorCss = o.titleColor || '#323233';
    o.titlePadXRpx = px2rpx(ccNum(o.titlePadX, 8));
    o.titlePadYRpx = px2rpx(ccNum(o.titlePadY, 8));
    /*
     * 图片高度三种口径：
     *   - 「图片固定高度」> 0：写死高度 + aspectFill 裁切（有赞 shopnote 大图模式就是这一种）；
     *   - 「图片比例 · 自适应」：不撑比例盒，模板走 mode="widthFix" 按原图比例铺满整宽；
     *   - 指定比例：padding-top 撑高（百分比按宽度算），4:3 → 133.33%。
     */
    const cRatio = String(o.ratio == null ? '0.75' : o.ratio).trim();
    o.imgAuto = cRatio === 'auto';
    o.padTopPct = (o.fixedImgH || o.imgAuto) ? 0 : (Math.round(10000 / (Number(cRatio) || 0.75)) / 100);
    o.items = (o.items || []).filter((x) => x && (x.image || x.title));
  } else if (kind === 'mixed_grid') {
    /*
     * 混合排列（对标有赞三方扩展「混合排列A」extension-masswx-hpitemsa）。
     *
     * 单位：本组件的字段与有赞面板同口径，都是 375 基准 px —— 含 4.5px / 7.5px 这类半像素值，
     *      统一 ×2 转 rpx。4.5px 正好是 9rpx、7.5px 是 15rpx，换算无损（px2rpx 取整不会丢精度）。
     * 行：布局样式只决定「每张卡片占几列」，行由 flex-wrap 自然形成 ——
     *      有赞也是给每张卡打 w50 / w33 的宽度类，结果与半行留白行为完全一致，
     *      所以不额外造一层行数据（少一层数据就少一处要同步的地方）。
     * 动画：有赞是入场时「淡入 + 上浮」，同一排内依次延迟 0 / 0.16 / 0.32 秒 —— 这里按同样的
     *      规则算出每张卡的 delay，距离固定 20px（40rpx），见 index.wxss 的 @keyframes mg-in。
     */
    const mgNum = (v, d) => { const n = Number(v); return (v === '' || v === null || v === undefined || isNaN(n)) ? d : n; };
    const mgStr = (v, d) => (v === null || v === undefined || String(v).trim() === '' ? d : String(v).trim());
    const layout = ['3', '2', '1-3'].indexOf(o.layout) >= 0 ? o.layout : '2-3';
    const colsOf = (i) => (layout === '2' ? 2 : layout === '3' ? 3 : layout === '1-3' ? (i === 0 ? 1 : 3) : (i < 2 ? 2 : 3));

    const raw = (o.items || []).filter((x) => x && (x.image || x.title));
    const items = [];
    for (let i = 0, k = 0, cols = 0; i < raw.length; i++) {
      const c = colsOf(i);
      if (c !== cols) { cols = c; k = 0; }   // 换行 → 排内序号归零（动画延迟随之从头开始）
      items.push({
        image: raw[i].image || '',
        title: raw[i].title || '',
        link: raw[i].link || '',
        // 占宽百分比：2 列 = 50、3 列 = 33.33（截到两位，避免 100/3 的长小数撑破一行）
        cellW: Math.floor(100 / c * 100) / 100,
        delay: Math.round(k * 16) / 100     // 0 / 0.16 / 0.32 秒
      });
      k++;
    }
    o.items = items;

    o.padXRpx = px2rpx(mgNum(o.paddingX, 7.5));
    o.padYRpx = px2rpx(mgNum(o.paddingY, 0));
    o.gapRpx = px2rpx(mgNum(o.gap, 4.5));
    o.innerRpx = px2rpx(mgNum(o.paddingInner, 8));
    o.bgCss = mgStr(o.bg, '#DFDEDE');

    o.titleGapTopRpx = px2rpx(mgNum(o.titleGapTop, 45));
    o.titleGapBottomRpx = px2rpx(mgNum(o.titleGapBottom, 0));
    o.titleSizeRpx = px2rpx(mgNum(o.titleSize, 20));
    o.subSizeRpx = px2rpx(mgNum(o.subSize, 16));
    o.titleWeightCss = o.titleWeight === 'normal' ? '400' : '700';
    o.subWeightCss = o.subWeight === 'bold' ? '700' : '400';
    o.titleColorCss = mgStr(o.titleColor, '#444444');
    o.subColorCss = mgStr(o.subColor, '#2E2B2B');
    o.titleAlignCss = (o.titleAlign === 'center' || o.titleAlign === 'right') ? o.titleAlign : 'left';
    o.subTitle = o.subTitle || '';
    o.title = o.title || '';
    o.hasTitle = !!(String(o.subTitle).trim() || String(o.title).trim());

    o.cardClass = ['shadow', 'outline', 'plain'].indexOf(o.cardStyle) >= 0 ? o.cardStyle : 'white';
    o.cardRadiusRpx = o.radius === 'square' ? 0 : px2rpx(mgNum(o.cardRadius, 8));
    o.cardBgCss = hexToRgba(o.cardBg, o.cardBgAlpha, '#F8F8F8');
    // 图片容器用 padding-top 撑比例（百分比按宽度算）：3:4 = 100 ÷ 0.75 = 133.33 → 133.33%
    o.padTopPct = Math.round(10000 / mgNum(o.imgRatio, 0.75)) / 100;
    o.itemTitleColorCss = mgStr(o.itemTitleColor, '#444444');
    o.itemTitleSizeRpx = px2rpx(mgNum(o.itemTitleSize, 14));
    o.itemTitleWeightCss = o.itemTitleWeight === 'normal' ? '400' : '700';
    o.itemTitleAlignCss = o.itemTitleAlign === 'left' ? 'left' : 'center';
    o.clampTwo = mgNum(o.itemTitleLines, 1) === 2;
    o.animOn = o.anim !== false;
  } else if (kind === 'tab_cate') {
    /*
     * 选项卡分类（对标有赞店铺侧三方扩展「选项卡Z4」extension-massdesign-tabcatez4）。
     *
     * 单位：与有赞面板同口径 —— 尺寸字段都是 375 基准 px，统一 ×2 转 rpx；颜色 / 比例原样用。
     *
     * 布局沿用有赞的「负外边距」写法（**不要改成卡片只留内边距**）：
     *   内容区左右内缩 = 模块左右边距；卡片行左右各 -图文外间距；每张卡片再各 +图文外间距。
     *   → 卡片左右内缩 = 模块左右边距（负外边距正好抵消），相邻卡片间距 = **2 ×** 图文外间距。
     *   实测有赞 375 宽（01 页）：模块左右 10 + 外间距 6 → 卡片左边缘 10.1、卡宽 355；
     *   双列（02 页）：内容区 355、卡片行 367、单卡 = 367÷2 − 12 = 171.5 —— 与实测逐像素一致。
     *
     * 选项卡条：整条高 76rpx（= 有赞 38px），每项 flex:1 均分（5 项 → 75px，8 项 → 93.75px，
     *   与实测一致）；文字块高 68rpx、行高 68rpx、下留 8rpx（= 有赞 .nav_text 的
     *   height/line-height 34px + margin-bottom 4px）；选中项加粗（有赞 .nav_text.curent 的
     *   font-weight:bold），并在**文字正下方**压一条 40×2 的短横线 —— 实测那条线宽固定 40px、
     *   水平居中于文字、贴选项卡条底边（所以这里用「绝对定位 + left:50% + 负一半宽度」还原）。
     *   注意：有赞另一条 `.van-tabs__line`（通用下划线）在这个扩展里被 `display:none` 关掉了，
     *   实线是每项自带的 `text_line` —— 别把两条搞混。
     *
     * 卡片图片两种模式：
     *   - 图片比例「自适应」：按原图比例铺满整宽（有赞 `.item_img_wrap img { width:100%; height:auto }`）
     *     → 模板走 mode="widthFix"，**不撑比例盒**；
     *   - 指定比例：用 padding-top 撑出固定高度（百分比按宽度算），图片绝对定位铺满，
     *     objectFit 由「图片模式」决定（有赞 `.aspect-fit` = contain / `.aspect-fill` = cover）。
     *
     * 条目 / 选项卡归一化：既无图无视频又无标题的条目、以及既无名又无内容的选项卡直接丢掉 ——
     * 否则顶部会多出一个点不动的空白页签、或留下一片空白。
     */
    const tcNum = (v, d) => { const n = Number(v); return (v === '' || v === null || v === undefined || isNaN(n)) ? d : n; };
    const tcStr = (v, d) => (v === null || v === undefined || String(v).trim() === '' ? d : String(v).trim());

    const tcLayout = ['1', '2', '3'].indexOf(String(o.layout)) >= 0 ? String(o.layout) : '1';
    o.cellW = Math.floor(100 / Number(tcLayout) * 100) / 100;

    const tcTabs = [];
    (Array.isArray(o.tabs) ? o.tabs : []).slice(0, 10).forEach((t) => {
      if (!t || typeof t !== 'object') return;
      const name = String(t.name == null ? '' : t.name).trim();
      const items = (Array.isArray(t.items) ? t.items : [])
        .filter((x) => x && typeof x === 'object' && (x.image || x.video || String(x.title || '').trim()))
        .slice(0, 60)
        .map((x) => ({
          image: x.image || '',
          video: x.video || '',
          title: String(x.title || '').trim(),
          link: x.link || ''
        }));
      if (!name && !items.length) return;
      tcTabs.push({ name, items });
    });
    o.tabs = tcTabs;
    o.hasTabs = tcTabs.length > 0;
    o.tabCount = tcTabs.length;

    // 模块外壳
    o.padTopRpx = px2rpx(tcNum(o.paddingTop, 5));
    o.padBottomRpx = px2rpx(tcNum(o.paddingBottom, 11));
    o.padXRpx = px2rpx(tcNum(o.paddingX, 11));
    o.padInnerRpx = px2rpx(tcNum(o.paddingInner, 0));
    /*
     * 页签条与首行卡片之间的固定间距 = 10px（有赞 `.van-tab__pane-wrapper` 内部那一层
     * 写死的 padding-top，与「模块内边距」「图文内间距」都无关）—— 6 个页面实测全是 10，
     * 所以不做成字段，直接写死。少了它每页整体会往上偏 10px。
     */
    o.paneTopRpx = px2rpx(10);
    o.bgCss = tcStr(o.bg, 'transparent');
    o.innerBgCss = tcStr(o.innerBg, 'transparent');
    o.bgImgStyle = o.bgImage
      ? ('background-image: url(' + o.bgImage + '); background-size: cover; background-position: top center; background-repeat: no-repeat;')
      : '';

    // 选项卡条
    o.tabHRpx = 76;                                   // 有赞固定 38px，面板无高度项
    o.tabFsRpx = px2rpx(tcNum(o.tabFontSize, 15));
    o.tabBgCss = tcStr(o.tabBg, 'transparent');
    o.tabFg = tcStr(o.tabColor, '#444444');
    o.tabFgOn = tcStr(o.tabActiveColor, '#444444');

    // 卡片
    o.gapRpx = px2rpx(tcNum(o.gapOuter, 6));
    o.gapNegRpx = -o.gapRpx;
    o.cardClass = ['white', 'shadow', 'outline', 'plain'].indexOf(o.cardStyle) >= 0 ? o.cardStyle : 'shadow';
    o.cardBgCss = o.cardClass === 'plain' ? 'transparent' : tcStr(o.cardBg, '#FFFFFF');
    o.cardRadiusRpx = o.radius === 'square' ? 0 : 16;   // 有赞 .circle → 固定 8px（面板无圆角数值项）
    o.imgRadiusCss = o.cardRadiusRpx === 0
      ? '0'
      : (o.halfRound === false
        ? (o.cardRadiusRpx + 'rpx ' + o.cardRadiusRpx + 'rpx 0 0')
        : (o.cardRadiusRpx + 'rpx'));
    o.imgFit = o.fit === 'cover' ? 'aspectFill' : 'aspectFit';
    const tcRatio = String(o.imgRatio == null ? 'auto' : o.imgRatio).trim();
    o.imgAuto = tcRatio === '' || tcRatio === 'auto';
    o.padTopPct = o.imgAuto ? 0 : (Math.round(10000 / tcNum(tcRatio, 1)) / 100);

    // 标题
    o.showTitle = o.showTitle !== false;
    o.titleClamp = tcNum(o.titleLines, 2) === 2 ? 2 : 1;
    o.titleFsRpx = px2rpx(tcNum(o.titleSize, 14));
    o.titleGapYRpx = px2rpx(tcNum(o.titleGapY, 12));
    o.titleGapXRpx = px2rpx(tcNum(o.titleGapX, 9));
    o.titleWeightCss = o.titleBold === 'normal' ? '400' : '700';
    o.titleAlignCss = o.titleAlign === 'center' ? 'center' : 'left';
    o.titleColorCss = tcStr(o.titleColor, '#444444');

    /*
     * 浏览态字段：选中的是第几个选项卡。
     * 只改本页 data（onTabCateTap），**不动装修数据** —— 与「品牌分类」的 activeBrand 同口径：
     * 打开时停在哪个页签属于浏览态，不该被发布出去。
     */
    o.activeTab = 0;
  } else if (kind === 'buy_bar') {
    o.padXRpx = px2rpx(o.padX);
    o.padBRpx = px2rpx(o.padB);
    o.btnHRpx = px2rpx(o.btnH);
    o.btnRRpx = px2rpx(o.btnR);
    o.fontRpx = px2rpx(o.fontSize || 16);
    o.bgHRpx = px2rpx(o.bgH || 76);
    o.alignRight = o.align === 'right';
    o.bgOn = o.bgOn !== false;
    o.btnBgFinal = o.theme === 'custom' ? (o.btnBg || BRAND) : BRAND;
    o.text = o.text || '立即下单';
  } else if (kind === 'brand_category') {
    /*
     * 品牌分类（对标有赞「高级组件 · 品牌分类E」）。
     *
     * 单位：本组件的尺寸字段都是 375 基准 px，统一 ×2 转 rpx；
     *       navWidth 是百分比，原样传给 style 的 width 用。
     * 5 种标题风格只在「每项是否有底色块 / 圆角 / 竖条 / 分隔线」上有差别，
     * 这里把它们摊平成几个布尔量与数值，WXML 里不再出现任何条件算术。
     */
    const nv = (v, d) => {
      const n = Number(v);
      return (v === '' || v === null || v === undefined || isNaN(n)) ? d : n;
    };
    const col = (v, d) => (v === null || v === undefined || String(v).trim() === '' ? d : String(v).trim());

    o.navStyle = ['A', 'B', 'C', 'D', 'E'].indexOf(o.navStyle) >= 0 ? o.navStyle : 'C';
    o.navWidthPct = Math.min(60, Math.max(15, Math.round(nv(o.navWidth, 26))));
    o.navBand = o.navStyle === 'A' || o.navStyle === 'E';        // 每项都带底色块
    o.navIsE = o.navStyle === 'E';                              // 胶囊
    o.navIsC = o.navStyle === 'C';                              // 左侧竖条指示器
    o.navIsD = o.navStyle === 'D';                              // 每项底部分隔线

    o.navHRpx = px2rpx(nv(o.navHeight, 45));
    o.navIndHRpx = px2rpx(nv(o.navBorderH, 10));
    o.navIndWRpx = px2rpx(Math.max(1, nv(o.navBorderW, 1)));
    o.navGapRpx = px2rpx(nv(o.navMargin, 1));
    o.navPadYRpx = o.navIsE ? 10 : (o.navStyle === 'A' ? Math.round(o.navGapRpx / 2) : 0);
    // 实测：风格 A 的色块比其余风格恰好高「选中边框高度」；风格 E 上下各留 5px（=10rpx）
    o.navInnerHRpx = o.navStyle === 'A'
      ? (o.navHRpx + o.navIndHRpx)
      : (o.navIsE ? Math.max(24, o.navHRpx - 20) : o.navHRpx);
    o.navRadiusRpx = o.navIsE ? Math.round(o.navInnerHRpx / 2) : 0;
    o.navFsRpx = px2rpx(nv(o.navFontSize, 15));
    o.navJustify = o.navAlign === 'left' ? 'flex-start' : (o.navAlign === 'right' ? 'flex-end' : 'center');
    o.navFgOff = col(o.navColor, '#050505');
    o.navFgOn = col(o.navColorActive, '#FFFFFF');
    o.navBgOn = col(o.navBgActive, '#000000');
    o.navBgOff = o.navBand ? col(o.navBgIdle, '#F9F9F9') : 'transparent';
    o.navBgBase = col(o.navBg, '#F1F1F1');
    o.navWeightOff = String(nv(o.navWeight, 300));
    o.navWeightOn = String(nv(o.navWeightActive, 450));
    o.navBorderColor = col(o.navBorderColor, '');
    o.navBarColor = o.navBorderColor || o.navBgOn;              // 风格 C 的竖条颜色
    o.navLineColor = col(o.navBorderLine, '#DDDDDD');           // 风格 D 的分隔线

    const gx = px2rpx(nv(o.itemGapX, 0));
    const gy = px2rpx(nv(o.itemGapY, 10));   // 实测有赞：图与标题之间 10px
    o.itemGapXRpx = gx;
    o.itemHalfGapRpx = Math.round(gx / 2);
    o.itemGapYRpx = gy;
    /* 网格**行间距** = 5px：有赞实测「第 2 行起的条目额外有 `margin-top:5px`」，
       所以下面按「条目所在行号」逐条算，挂在条目自身的 margin-top 上。
    ⚠️ 不要改成「格子 padding-bottom + 容器负 margin-bottom」这种写法：
       容器的负 margin-bottom 会**穿透折叠**到小组容器的 13px 下边距上，
       两者按「正负相加」= 13 + (-5) = 8px → 后面每一块都整体上移 5px，
       量出来是「整页越往下越偏」。flex 条目自身的 margin-top 不参与折叠，才是对的。 */
    o.gapRowRpx = px2rpx(5);
    o.itemRadiusRpx = px2rpx(nv(o.itemRadius, 0));
    o.itemFsRpx = px2rpx(nv(o.itemTitleSize, 14));
    o.itemWeight = String(nv(o.itemTitleWeight, 400));
    o.itemAlign = ['left', 'center', 'right'].indexOf(o.itemTitleAlign) >= 0 ? o.itemTitleAlign : 'center';
    // 文字色留空 = 用默认文字色（#323233），**不能**留成空串：
    // `color: var(--bc-ifg)` 里变量被置空是「无效值」，会整条声明作废并退化成继承，
    // 与装修台预览（见 shared/pv-render.js 的 pvColor 兜底）不是同一口径。
    o.itemFg = col(o.itemTitleColor, '#323233');
    o.itemBorderColor = col(o.itemBorderColor, '');
    o.itemShadow = o.itemShadow === 'normal';

    o.panelTitleFsRpx = px2rpx(nv(o.panelTitleSize, 16));
    o.panelTitleWeight = String(nv(o.panelTitleWeight, 700));
    o.panelTitleAlign = ['left', 'center', 'right'].indexOf(o.panelTitleAlign) >= 0 ? o.panelTitleAlign : 'left';
    o.panelTitleFg = col(o.panelTitleColor, '#323233');
    o.panelTitleGapXRpx = px2rpx(nv(o.panelTitleGapX, 0));
    o.panelTitleGapYRpx = px2rpx(nv(o.panelTitleGapY, 0));
    o.panelGapRpx = px2rpx(nv(o.panelGap, 13));

    o.bgTopGapRpx = px2rpx(nv(o.bgTopGap, 0));
    o.padXRpx = px2rpx(nv(o.contentPadX, 0));
    o.padBRpx = px2rpx(nv(o.contentPadBottom, 0));
    o.bgFinal = col(o.bg, '#FFFFFF');
    o.searchOn = o.searchMode === 'show';
    o.stickyNav = o.navSticky === 'top';
    // 模块背景图：填充 / 适应 / 平铺 三种口径直接映射到 background-size / repeat
    o.modBgStyle = o.moduleBgImage
      ? ('background-image: url(' + o.moduleBgImage + ');' +
        'background-size: ' + (o.moduleBgFill === 'contain' ? 'contain' : (o.moduleBgFill === 'repeat' ? 'auto' : 'cover')) + ';' +
        'background-repeat: ' + (o.moduleBgFill === 'repeat' ? 'repeat' : 'no-repeat') + ';' +
        'background-position: top center;')
      : '';

    // 缓动：每种效果一条 class，速度/间隔走 inline style（小程序 WXSS 支持 var 与 animation-delay）
    const EFFECTS = ['right', 'up', 'zoom', 'fade'];
    o.effect = EFFECTS.indexOf(o.effect) >= 0 ? o.effect : 'none';
    // 类名在 JS 里拼好：模板里不做字符串拼接，静态自检才能查到「class 是否有定义」
    o.effectClass = o.effect === 'none' ? '' : ('anim-' + o.effect);
    o.effectDurMs = Math.round(Math.min(3, Math.max(0.2, nv(o.effectSpeed, 1))) * 1000);
    o.effectDelayMs = Math.round(Math.min(1, Math.max(0, nv(o.effectDelay, 0.2))) * 1000);

    // 左上角 Logo 的跳转：字段在 schema 里由 linkField('Logo 跳转') 生成，键名就是 link
    o.navLogoLink = o.link || '';
    /*
     * 高度模式：有赞「品牌分类E」在页面里是**整屏橱窗** —— 组件占满一屏，
     * 左右两栏各自内部滚动（模板用 scroll-view，只有 screen 模式才开 scroll-y）。
     * 高度本身写在 WXSS 的 `.bc-navcol.screen / .bc-main.screen` 里，
     * **不能**走模板 inline style：inline 的 100vh 不经过 mp-wxss 的 vh→px 换算。
     */
    o.screenMode = o.heightMode === 'screen';

    o.activeBrand = 0;
    // 只保留有内容的品牌，并给每个条目补上动画延迟（模板里不做乘法）
    o.brands = (o.brands || [])
      .filter((br) => br && typeof br === 'object' && String(br.title || '').trim())
      .slice(0, 11)
      .map((br) => {
        const panels = (br.panels || [])
          .filter((pn) => pn && typeof pn === 'object')
          .slice(0, 30)
          .map((pn) => {
            const layout = String(pn.layout || '2');
            const isNav = layout === 'nav';
            const cols = isNav ? 1 : Math.max(1, Math.min(4, Math.round(nv(layout, 2))));
            const items = (pn.items || [])
              .filter((it) => it && (it.image || it.title))
              .slice(0, 60)
              .map((it, ii) => ({
                image: it.image || '',
                title: it.title || '',
                desc: it.desc || '',
                link: it.link || '',
                hot: it.linkMode === 'hot',
                /* 网格第 2 行起的条目要往下让 5px（有赞实测的行间距）。
                   导航模式是「一行一条 + margin-bottom」，不吃这个值。 */
                gapTopRpx: (!isNav && ii >= cols) ? o.gapRowRpx : 0,
                delayMs: ii * o.effectDelayMs
              }));
            return {
              title: pn.title || '',
              link: pn.link || '',
              isNav,
              cellW: Math.floor(100 / cols * 100) / 100,
              items
            };
          });
        return { title: String(br.title || '').trim(), panels };
      });
    o.navs = o.brands.map((br) => br.title);
  } else if (kind === 'uc_navbar') {
    /* 标题栏（个人中心页顶栏）：有赞里「沉浸式」= 标题栏与个人信息区同色融为一体 */
    o.title = o.title || '个人中心';
    o.desc = o.desc || '';
    o.bgFinal = o.bgMode === 'custom' ? (o.bgColor || '#FFFFFF') : '#FFFFFF';
    o.immersive = o.mode !== 'normal';
    o.hasBgImage = !!o.bgImage;
  } else if (kind === 'uc_profile') {
    /*
     * 个人信息：头像 / 昵称 / 会员码 / 等级。
     * 昵称头像属于「人」，由页面 JS 在装配 data 时回填到 `block.user`（见 pages/mine/mine.js），
     * 不在装修数据里 —— 装修台配的只有外观。
     */
    o.gradientClass = o.gradient === 'white' ? 'gd-white' : (o.gradient === 'black' ? 'gd-black' : '');
    o.justify = o.align === 'left' ? 'flex-start' : (o.align === 'right' ? 'flex-end' : 'center');
    o.nameFg = o.nameColor || '#333333';
    o.codeFg = o.codeColor || '#FFFFFF';
    o.levelOn = o.showLevel !== 'hide';
    o.bar = ['s1', 's2', 's3'].indexOf(o.barStyle) >= 0 ? o.barStyle : 's1';
    o.user = { logged: false, nickname: '', avatar: '' };
  } else if (kind === 'uc_stats') {
    /*
     * 个人资产：7 个开关只决定「展示哪几项」。
     *   · 有底座的项（优惠券）先给 '—'，页面装配 data 时用 applyStatValues 回填真实数值；
     *   · 没底座的项保持 '—'，点了落「功能未开放」页并说明缺哪套数据（dep 一起带到页面）。
     * 每项都是可点的 —— 「点了没反应」比「点了告诉你为什么没有」糟得多。
     */
    o.items = UC_STAT_DEFS.filter((d) => o[d.k] !== false).map((d) => ({
      key: d.key, label: d.label, unit: d.unit, value: '—',
      route: d.route || '',
      dep: d.dep || ''
    }));
    const statMiss = o.items.filter((it) => !it.route).map((it) => it.dep).filter(Boolean);
    o.dep = String(o.dep || statMiss.join(' / '));
  } else if (kind === 'uc_order') {
    o.title = o.title || '我的订单';
    o.showAllOn = o.showAll !== false;
    o.items = UC_ORDER_DEFS.filter((d) => o[d.k] !== false);
    o.cols = o.items.length || 1;
  } else if (kind === 'uc_tools') {
    /*
     * 必备工具：条目来自装修数据（有赞侧是固定插件清单，只能改名 / 开关 / 可见范围）。
     * `enabled === false`（如「邀请有礼」）与 `show === false` 都不渲染。
     */
    o.mode = o.mode === 'cube' ? 'cube' : 'grid';
    o.iconMode = o.iconMode === 'line' ? 'line' : 'fill';
    const tCols = o.mode === 'cube' ? 3 : 4;
    o.cols = tCols;
    o.cellW = Math.floor(100 / tCols * 100) / 100;
    o.items = (o.plugins || [])
      .filter((p) => p && p.show !== false && p.enabled !== false)
      .map((p) => {
        /* icon / real 优先取区块数据里的值（装修数据里已烘入，是唯一真源）；
           TOOL_META 只作为「本次改动之前发布过的老数据」的兜底。 */
        const meta = TOOL_META[p.type] || { icon: '', real: false };
        return {
          key: p.type,
          label: String(p.title || '').trim() || p.type,
          icon: p.icon || meta.icon,
          real: p.real === undefined ? !!meta.real : !!p.real,
          scope: p.scope === 'fx' ? 'fx' : 'all'
        };
      })
      .filter((x) => x.label);
    o.dep = String(o.dep || '部分工具依赖会员、门店、分销等业务数据');
  } else if (kind === 'text') {
    /* 文本（对标有赞「文本」组件） */
    o.marginRpx = px2rpx(o.pageMargin);
    o.text = String(o.text || '');
    o.sizeClass = SIZE_CLASS[o.size] || 's-md';
    o.fg = o.color || '#000000';
    o.bg = o.bg || '#FFFFFF';
    o.justify = o.align === 'center' ? 'center' : (o.align === 'right' ? 'flex-end' : 'flex-start');
    o.textAlign = o.align === 'center' ? 'center' : (o.align === 'right' ? 'right' : 'left');
    o.splitLine = o.showSplitLine === true;
  } else if (kind === 'link') {
    /* 关联链接：一串「文字 → 跳转」，文字为空的那条不显示 */
    o.marginRpx = px2rpx(o.pageMargin);
    o.items = (o.items || [])
      .filter((x) => x && String(x.label || '').trim())
      .map((x) => ({ label: String(x.label).trim(), link: x.link || '' }));
  } else if (kind === 'blank') {
    /* 辅助空白：高度是 375 基准 px，×2 转 rpx */
    o.hRpx = px2rpx(o.height || 30);
  } else if (kind === 'follow_oa') {
    o.marginRpx = px2rpx(o.pageMargin);
    o.dep = String(o.dep || '公众号能力（需在微信小程序后台「设置 · 接口设置」开通）');
  } else if (SHELL_FAMILY[kind]) {
    /*
     * 有赞基础/高级组件余下的 37 项（依赖型 + 展示型）。
     *
     * 这些组件在有赞里各自依赖一套业务底座（会员 / 营销中台 / 门店 / 直播 / 教育…），
     * 自建商城没有对应数据源。按约定「全量复刻，真机标注」：
     *   · 装修台里可以像有赞一样添加、属性面板 1:1 配置；
     *   · 真机按配置忠实渲染标题 / 主图 / 描述 / 按钮；
     *   · 区块底部原样标注「依赖 XX · 仅占位展示」，不假装可用。
     * 字段到展示位的映射只此一份：`cardTitle` / `cardDesc` / `cardImage` / `btnText`。
     * 能真跑的同类组件（商品分组 / 店铺热搜 / 店铺榜单）不在这里，另有专属分支。
     */
    o.fam = SHELL_FAMILY[kind];
    o.cardTitle = firstOf(o, ['title', 'name', 'text', 'notice']);
    o.cardDesc = firstOf(o, ['desc', 'subTitle', 'slogan', 'note']);
    o.cardImage = firstOf(o, ['image', 'cover', 'photo', 'icon', 'qr']) || firstImageOf(o.images);
    o.btnText = firstOf(o, ['btnText']);
    o.marginRpx = px2rpx(o.pageMargin);
    o.round = o.corner === 'round';
    o.dep = String(o.dep || '');
  }

  o.__index = index;
  return o;
}

/**
 * 展示位取值的统一规则：按优先级取第一个非空字符串。
 * 37 个依赖型组件的字段名各不相同（title / name / text / notice …），
 * 这里收敛成一处，避免在 WXML 里写一长串 `a || b || c`。
 */
function firstOf(o, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = o[keys[i]];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** 从图片列表里取第一张（图片既可能是字符串，也可能是 { image } 对象） */
function firstImageOf(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const x = list[0];
  if (typeof x === 'string') return x;
  return (x && (x.image || x.src)) || '';
}

/** 批量转换（首页与自定义页共用） */
function normalizeBlocks(list) {
  return (list || []).map(normalizeBlock);
}

/**
 * 「语音」区块未单独设头像且开了「使用店铺 logo」时，回落到店铺头像。
 *
 * 店铺信息不在区块数据里（它是页面级字段），所以只能由页面 JS 在装配 data 时补，
 * 这里做成一个纯函数，首页与自定义页共用同一份规则。
 *
 * @param {Array} blocks 已 normalize 的区块数组
 * @param {string} shopAvatar 店铺头像地址（已过 resolveAssets）
 */
function applyShopAvatar(blocks, shopAvatar) {
  (blocks || []).forEach((b) => {
    if (b && b.type === 'audio' && !b.avatar && b.useShopLogo !== false) b.avatar = shopAvatar || '';
  });
  return blocks;
}

/** 商品卡片渲染字段（区块模板只认这几个键；goodsId 为空会导致点击无效） */
function toCard(g) {
  if (!g) return null;
  return {
    goodsId: g.goodsId || g.id || '',
    name: g.name || '',
    image: assetUrl(g.image || g.cover || (g.images && g.images[0]) || ''),
    priceText: g.priceText || ((Number(g.price) || 0) / 100).toFixed(2),
    // 「店铺榜单」要按销量排序，卡片里带上销量（其余区块用不到，多一个键不影响）
    sales: Number(g.sales) || 0
  };
}

/**
 * 「商品」区块需要实时数据（装修时存的是快照，价格库存会过期），统一拉一次后分发。
 *
 * 两个优化，都是为了「同一个商品被多处引用」时不重复打接口：
 *   - 指定商品模式：先把所有区块要的 ID **去重**，再按固定并发（SIMPLE_CONCURRENCY）
 *     逐个取详情，最后分发回各区块 —— 同一商品被两个区块引用只请求一次；
 *   - 默认列表模式：按 `limit` 分组，同一 limit 只请求一次。
 *
 * 失败**不再静默吞掉成空列表**：记一条日志（真机上翻 console 就能看出是「接口挂了」
 * 还是「确实没商品」），同时该区块的 goods 留空由模板显示占位文案。
 *
 * @param {Array} blocks 已 normalize 的区块数组
 * @returns {Promise<object|null>} 供 setData 的补丁，如 { 'blocks[0].goods': [...] }；没有商品区块时返回 null
 */
const GOODS_CONCURRENCY = 4;

/** 限并发执行（保持结果顺序） */
function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(() => (async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  })());
  return Promise.all(workers).then(() => out);
}

function loadGoodsData(blocks) {
  const idxs = [];
  const rankIdxs = [];   // 「店铺榜单」：同一套取数，取回后按销量排
  const groupIdxs = [];  // 「商品分组」：按分类逐个取
  (blocks || []).forEach((b, i) => {
    if (b.type === 'goods') idxs.push(i);
    else if (b.type === 'shop_rank') rankIdxs.push(i);
    else if (b.type === 'goods_group') groupIdxs.push(i);
  });
  if (!idxs.length && !rankIdxs.length && !groupIdxs.length) return Promise.resolve(null);

  const idBlocks = [];
  const listGroups = {}; // limit → [区块下标]
  idxs.concat(rankIdxs).forEach((i) => {
    const b = blocks[i];
    if (b.type === 'goods' && b.mode === 'ids' && b.ids) {
      const ids = String(b.ids).split(/[,，\s]+/).filter(Boolean).slice(0, b.limit);
      idBlocks.push({ i, ids });
    } else {
      const key = String(b.limit);
      (listGroups[key] = listGroups[key] || []).push(i);
    }
  });

  // 所有区块要的指定商品 ID 去重
  const allIds = [];
  idBlocks.forEach((b) => b.ids.forEach((id) => { if (allIds.indexOf(id) < 0) allIds.push(id); }));

  const idJob = allIds.length
    ? mapLimit(allIds, GOODS_CONCURRENCY, (id) => goodsSvc.fetchDetail(id).catch((err) => {
      console.warn('[blocks] 指定商品加载失败 id=' + id, err && err.message);
      return null;
    })).then((list) => {
      const byId = {};
      let okCount = 0;
      list.forEach((g) => { if (g) { byId[g.goodsId || g.id] = g; okCount++; } });
      return { byId, okCount };
    })
    : Promise.resolve({ byId: {}, okCount: 0 });

  const listJob = mapLimit(Object.keys(listGroups), GOODS_CONCURRENCY, (limit) =>
    goodsSvc.fetchList({ page: 1, size: Number(limit) || 4 })
      .then((d) => ({ limit, list: (d && d.list) || [], failed: false }))
      .catch((err) => {
        console.warn('[blocks] 商品列表加载失败 limit=' + limit, err && err.message);
        return { limit, list: [], failed: true };
      })).then((rows) => {
    const byLimit = {};
    rows.forEach((r) => { byLimit[r.limit] = r; });
    return byLimit;
  });

  /*
   * 「商品分组」：面板里配了几个分组就取几次，按分类名去问商品库。
   * 全部分组**一次取完**（分组数 ≤ 15，实际就几个），这样切换分组是纯前端 setData，
   * 不会每点一次 tab 就打一次接口（列表页横滑分组时最怕这个）。
   */
  const groupJob = mapLimit(groupIdxs, GOODS_CONCURRENCY, (i) => {
    const names = (blocks[i].groups || []).map((g) => String(g.name || '').trim()).filter(Boolean);
    if (!names.length) return Promise.resolve({ i, groups: [], failed: false });
    return mapLimit(names, GOODS_CONCURRENCY, (name, gi) => {
      const limit = Number((blocks[i].groups[gi] || {}).limit) || 6;
      return goodsSvc.fetchList({ page: 1, size: limit, categoryId: name, sort: 'sales' })
        .then((d) => ({ name: name, goods: ((d && d.list) || []).map(toCard).filter(Boolean) }))
        .catch((err) => {
          console.warn('[blocks] 商品分组加载失败 category=' + name, err && err.message);
          return { name: name, goods: [] };
        });
    }).then((groups) => ({ i, groups, failed: groups.every((g) => !g.goods.length) }));
  });

  return Promise.all([idJob, listJob, groupJob]).then(([idRes, byLimit, groupRows]) => {
    const next = {};
    idBlocks.forEach((b) => {
      next['blocks[' + b.i + '].goods'] = b.ids.map((id) => toCard(idRes.byId[id])).filter(Boolean);
      // 一个都没取到才判为失败：部分商品被删除/下架属于正常，不该报「加载失败」
      next['blocks[' + b.i + '].goodsFailed'] = b.ids.length > 0 && idRes.okCount === 0;
    });
    idxs.forEach((i) => {
      if (idBlocks.some((b) => b.i === i)) return;
      const r = byLimit[String(blocks[i].limit)];
      next['blocks[' + i + '].goods'] = r ? r.list.map(toCard).filter(Boolean) : [];
      next['blocks[' + i + '].goodsFailed'] = !!(r && r.failed);
    });
    /* 榜单：取回后按销量降序（有赞那边是系统算法，这里用商品库的真实销量字段） */
    rankIdxs.forEach((i) => {
      const r = byLimit[String(blocks[i].limit)];
      const list = r ? r.list.map(toCard).filter(Boolean) : [];
      list.sort((a, b) => (b.sales || 0) - (a.sales || 0));
      next['blocks[' + i + '].goods'] = list;
      next['blocks[' + i + '].goodsFailed'] = !!(r && r.failed);
    });
    groupRows.forEach((row) => {
      next['blocks[' + row.i + '].groupTabs'] = row.groups;
      next['blocks[' + row.i + '].goodsFailed'] = row.failed;
    });
    return next;
  });
}

/**
 * 把「人」的信息（登录态 / 昵称 / 头像）回填到个人信息区块。
 *
 * 与 applyShopAvatar 同一模式：装修数据里只有**外观**（背景、渐变、颜色、样式），
 * 「人」的信息属于运行态，只能由页面 JS 在装配 data 时补。
 */
function applyUserProfile(blocks, user) {
  const u = user || {};
  (blocks || []).forEach((b) => {
    if (b && b.type === 'uc_profile') {
      b.user = {
        logged: !!u.logged,
        nickname: u.nickname || '',
        avatar: u.avatar || ''
      };
    }
  });
  return blocks;
}

/**
 * 把**真实数值**回填到个人资产区块（目前只有「优惠券」有数据源）。
 *
 * 与 applyUserProfile 同一模式：装修数据里只有「展示哪些项」，数值是运行态。
 * 只覆盖传进来的 key —— 没传的项保持 `—`（「未知」和「0」是两件事，
 * 未登录时接口要令牌、拿不到数，不能显示成 0 张）。
 *
 * @param {Array} blocks 已 normalize 的区块数组
 * @param {object} values 形如 { coupon: 3 }
 */
function applyStatValues(blocks, values) {
  const v = values || {};
  (blocks || []).forEach((b) => {
    if (!b || b.type !== 'uc_stats') return;
    (b.items || []).forEach((it) => {
      if (Object.prototype.hasOwnProperty.call(v, it.key)) it.value = String(v[it.key]);
    });
  });
  return blocks;
}

module.exports = {
  normalizeBlock, normalizeBlocks, loadGoodsData, applyShopAvatar, applyUserProfile, applyStatValues,
  sanitizeRich, SIZE_CLASS, statDef,
  SHELL_FAMILY, UC_KIND_LIST, TOOL_META, UC_STAT_DEFS, UC_ORDER_DEFS
};
