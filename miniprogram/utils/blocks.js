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

/** 店铺主题色（按钮「跟随店铺风格」时使用；与 tabBar selectedColor 保持一致） */
const BRAND = '#C8102E';

/**
 * 富文本净化：小程序 rich-text 本身不执行脚本，但历史脏数据里可能带 <script>/on* 属性，
 * 这里统一剥掉，避免「编辑器里粘了网页源码」把脏东西带上线。
 */
function sanitizeRich(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
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
    o.marginRpx = px2rpx(o.pageMargin);
    const ccols = Number(o.cols) || 2;
    o.cellW = Math.floor(100 / ccols * 100) / 100;
    o.cardClass = o.style === 'white' ? 'white' : (o.style === 'plain' ? 'plain' : 'shadow');
    o.round = o.radius !== 'square';
    // 图片容器用 padding-top 撑出固定比例：padding-top 的百分比按「宽度」算，
    // 所以 4:3 要写 133.33%（= 100 ÷ 0.75），不是 1.33%。保留两位小数。
    const ratio = Number(o.ratio) || 0.75;
    o.padTopPct = Math.round(10000 / ratio) / 100;
    o.items = (o.items || []).filter((x) => x && (x.image || x.title));
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
    const gy = px2rpx(nv(o.itemGapY, 5));
    o.itemGapXRpx = gx;
    o.itemHalfGapRpx = Math.round(gx / 2);
    o.itemGapYRpx = gy;
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

module.exports = { normalizeBlock, normalizeBlocks, loadGoodsData, applyShopAvatar, sanitizeRich, SIZE_CLASS };
