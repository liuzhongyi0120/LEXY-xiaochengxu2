/**
 * 个人中心页（「我的」页）装修规格 —— 对标有赞「个人中心装修」
 * store.youzan.com/v4/deco/usercenter-decorate#weapp
 *
 * 数据来源（2026-10-10 用真实浏览器实测，脚本与产物见 .tooling/）：
 *   - 有赞页面结构：顶栏 56px +「店铺类型」三按钮（移动店铺 / 微信小程序 / 其他小程序）
 *     +「模板一 / 模板二」两个模板 + 手机画布（375 宽）+ 底部「添加组件」区。
 *   - 模板二默认 7 个区块，type 依次为
 *       config / uc_user_info / uc_stats / uc_image_ad / uc_order / uc_widgets / official_account
 *     本文件里的 5 个专属区块就按这 5 个 uc_* 类型 1:1 复刻（广告位复用已有 swiper）。
 *   - 「添加组件」库实测 20 个，分 3 组：
 *       基础组件 7：富文本 / 图片广告 / 魔方 / 图文导航 / 文本 / 关联链接 / 标题
 *       营销组件 2：优惠券 / 集点卡
 *       其他  11：店铺信息 / 进入店铺 / 商品搜索 / 公告 / 语音 / 视频 / 线下门店 /
 *                 在线客服 / 辅助线 / 辅助空白 / 关注公众号
 *     其中只有 4 个本后台原先没有（文本 / 关联链接 / 辅助空白 / 关注公众号），
 *     其余 16 个直接复用 HOME_BLOCK_KINDS 里已有的区块类型 —— 同一份字段定义，
 *     不另抄一套，避免「首页能配、个人中心配不了」这类走样。
 *
 * 复刻口径（与 yzPanels.js 一致）：
 *   · 字段顺序 / 名称 / 控件 / 默认值一律以实测为准；
 *   · 实测拿不到选项文案的，宁可不列也不编造；
 *   · 每个专属区块带 `dep` 说明真机依赖，小程序端会原样标注，不假装可用。
 */

/* ============================ 共用控件常量 ============================ */

/** 显示位置（有赞三处组件都是「居左 / 居中 / 居右」） */
const ALIGN3 = [
  { value: 'left', label: '居左' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '居右' }
];

/** 展示 / 隐藏 */
const SHOW_HIDE = [{ value: 'show', label: '展示' }, { value: 'hide', label: '隐藏' }];

/** 简写构造器（抽出来避免几十处抄写出入） */
const T = (k, label, def, hint) => ({ k, label, type: 'text', def, hint });
const NUM = (k, label, def, o) => Object.assign({ k, label, type: 'number', def }, o || {});
const C = (k, label, def, hint) => ({ k, label, type: 'color', def, hint });
const R = (k, label, def, options, hint) => ({ k, label, type: 'radiobutton', def, options, hint });
const SW = (k, label, def, hint) => ({ k, label, type: 'switch', def, hint });
const IMG = (k, label, hint) => ({ k, label, type: 'image', hint });
const LIST = (k, label, item, o) => Object.assign({ k, label, type: 'list', item }, o || {});
const LINK = (k, label) => ({ k, label, type: 'link', hint: '留空则不跳转。点「选择链接」从页面 / 商品 / 资讯里挑，也可以手填路径或外链' });
const SEC = (label, hint) => ({ type: 'group', label, hint });
const AREA = (k, label) => ({ k, label, type: 'textarea' });

/** 颜色「重置」说明：有赞每个取色器旁都有一个「重置」按钮，回到组件默认色 */
const COLOR_RESET = '带「重置」的取色器与有赞一致：重置即回到组件默认色';

/* ============================ 必备工具（uc_tools）的插件清单 ============================ */

/**
 * 有赞「必备工具」实测 20 个插件（.tooling/_yz-uc.json 的 uc_widgets.plugins）。
 *   type    有赞侧插件标识（跨平台对账用，原样保留）
 *   title   名称（与有赞面板一致）
 *   show    默认是否勾选（有赞默认值）
 *   scope   all = 所有用户可见；fx = 仅分销员可见（有赞该项可切换）
 *   enabled 有赞侧当前是否可用（「邀请有礼」实测为 false）
 *   real    本小程序是否真有落地能力；false = 点击只提示「功能开发中」，不假装能跳
 *   icon    真机图标用的字（本后台没有图标字体，用名称首字替代，与「我的」页原有做法一致）
 */
const UC_TOOL_ITEMS = [
  { type: 'memberCode', title: '会员码', show: false, scope: 'all', enabled: true, real: false, icon: '码' },
  { type: 'taskCenter', title: '任务中心', show: true, scope: 'all', enabled: true, real: false, icon: '任' },
  { type: 'cart', title: '购物车', show: true, scope: 'all', enabled: true, real: true, icon: '车' },
  { type: 'gifts', title: '赠品', show: true, scope: 'all', enabled: true, real: false, icon: '赠' },
  /*
   * 有赞默认把「客服聊天」关着（show: false）。本项目**有意偏离**：改造前的「我的」页
   * 就有一个 `<button open-type="contact">联系客服</button>`，是真实可用的入口。
   * 照搬有赞默认值会把这个入口弄丢（运营在装修台里也不会主动去开），所以改成默认开。
   */
  { type: 'customerServiceChat', title: '客服聊天', show: true, scope: 'all', enabled: true, real: true, icon: '服' },
  { type: 'deliveryAddress', title: '收货地址', show: true, scope: 'all', enabled: true, real: false, icon: '址' },
  { type: 'merchantsCall', title: '拨打商家电话', show: false, scope: 'all', enabled: true, real: false, icon: '电' },
  { type: 'cashBack', title: '返现', show: false, scope: 'all', enabled: true, real: false, icon: '返' },
  { type: 'fxCenter', title: '分销员中心', show: true, scope: 'fx', enabled: true, real: false, icon: '销' },
  { type: 'offlineStore', title: '线下门店', show: true, scope: 'all', enabled: true, real: false, icon: '店' },
  { type: 'purchaseColumnAndContent', title: '课程', show: false, scope: 'all', enabled: true, real: false, icon: '课' },
  { type: 'paidContentCertificate', title: '证书', show: false, scope: 'all', enabled: true, real: false, icon: '证' },
  { type: 'paidContentExamination', title: '考试', show: false, scope: 'all', enabled: true, real: false, icon: '考' },
  { type: 'exchangeGiftCard', title: '兑换礼品卡', show: false, scope: 'all', enabled: true, real: false, icon: '兑' },
  { type: 'paidContentExerciseBook', title: '作业本', show: false, scope: 'all', enabled: true, real: false, icon: '业' },
  { type: 'blankLine', title: '留白', show: false, scope: 'all', enabled: true, real: false, icon: '白' },
  { type: 'exhibitionReserve', title: '活动预订', show: false, scope: 'all', enabled: true, real: false, icon: '订' },
  { type: 'accountSettings', title: '账号与安全', show: true, scope: 'all', enabled: true, real: true, icon: '号' },
  { type: 'restaurantReserve', title: '预约订座', show: false, scope: 'all', enabled: true, real: false, icon: '座' },
  { type: 'referralRewards', title: '邀请有礼', show: false, scope: 'all', enabled: false, real: false, icon: '邀' },
  /*
   * 第 21 项是本项目补的：原「我的」页有一个「关于我们」入口（弹出版本号 / 店铺信息），
   * 换成有赞模板后如果没有这一项，这个入口就没了。补成同一个「必备工具」里的一个插件，
   * 保持原有功能不丢。这是**有意偏离**，记录在案。
   */
  { type: 'about', title: '关于我们', show: true, scope: 'all', enabled: true, real: true, icon: '关', own: true }
];

/* ============================ 个人中心专属区块 + 补缺组件 ============================ */

const UC_KINDS = {
  /* ---------------------------- 标题栏（有赞 config） ---------------------------- */
  uc_navbar: {
    label: '标题栏',
    lib: 'page_head',
    group: 'uc',
    desc: '个人中心页顶部导航：页面名称 / 描述 / 背景 / 沉浸式效果',
    fields: [
      T('title', '页面名称', '个人中心'),
      T('desc', '页面描述', '', '显示在导航栏下方的一行说明，可留空'),
      SEC('背景'),
      R('bgMode', '背景颜色', 'default', [
        { value: 'default', label: '默认背景色' },
        { value: 'custom', label: '自定义背景色' }
      ]),
      C('bgColor', '自定义背景色', '#FFFFFF', '仅当上面选了「自定义背景色」时生效；' + COLOR_RESET),
      IMG('bgImage', '背景图', '设置后覆盖背景色'),
      SEC('效果'),
      R('mode', '效果', 'immersive', [
        { value: 'immersive', label: '沉浸式' },
        { value: 'normal', label: '普通' }
      ], '沉浸式＝内容顶到导航栏下方（有赞默认）')
    ]
  },

  /* ---------------------------- 个人信息（有赞 uc_user_info） ---------------------------- */
  uc_profile: {
    label: '个人信息',
    lib: 'profile',
    group: 'uc',
    desc: '头像 / 昵称 / 登录入口 / 会员码栏，样式与位置可调',
    fields: [
      IMG('bgImage', '背景图', '建议尺寸 960 × 440 像素（有赞实测建议值）'),
      R('gradient', '背景渐变', 'none', [
        { value: 'none', label: '无渐变' },
        { value: 'white', label: '白色渐变' },
        { value: 'black', label: '黑色渐变' }
      ], '背景图上方叠一层渐变，让白色文字更清楚'),
      R('align', '个人头像位置', 'center', [
        { value: 'left', label: '居左' },
        { value: 'center', label: '居中' },
        { value: 'right', label: '居右' }
      ]),
      C('nameColor', '个人昵称颜色', '#333333', COLOR_RESET),
      C('codeColor', '签到 / 会员码颜色', '#FFFFFF', COLOR_RESET),
      R('showLevel', '会员等级', 'show', SHOW_HIDE),
      R('barStyle', '会员栏样式', 's1', [
        { value: 's1', label: '样式一' },
        { value: 's2', label: '样式二' },
        { value: 's3', label: '样式三' }
      ])
    ]
  },

  /* ---------------------------- 个人资产（有赞 uc_stats） ---------------------------- */
  uc_stats: {
    label: '个人资产',
    lib: 'assets',
    group: 'uc',
    desc: '余额 / 积分 / 权益卡 / 优惠券 / 钱包等资产入口',
    dep: '会员资产数据（余额 / 积分 / 权益卡 / 钱包 / 礼品卡）',
    fields: [
      SEC('展示设置', '有赞面板这一栏是 7 个复选项；本后台按同口径拆成 7 个开关，勾选逻辑完全一致'),
      SW('showBalance', '余额', true),
      SW('showPoints', '积分', true),
      SW('showCard', '权益卡', true),
      SW('showCoupon', '优惠券 / 码', true),
      SW('showWallet', '钱包', true),
      SW('showGiftCard', '礼品卡', false),
      SW('showPickupCard', '提货卡', false)
    ]
  },

  /* ---------------------------- 我的订单（有赞 uc_order） ---------------------------- */
  uc_order: {
    label: '我的订单',
    lib: 'order',
    group: 'uc',
    desc: '订单状态入口：待付款 / 待发货 / 待收货 / 待评价 / 退款售后',
    fields: [
      {
        k: 'title', label: '标题', type: 'text', def: '我的订单'
      },
      SEC('入口显示', '有赞该组件**没有**任何配置项（实测点它不开面板）；本后台补了标题与入口开关，' +
        '一是让运营能把「我的订单」改成别的叫法，二是订单列表页交付前可以先把不满意的入口关掉再上线。'),
      SW('showAll', '显示「查看全部订单」', true),
      SW('showPendingPay', '待付款', true),
      SW('showPendingShip', '待发货', true),
      SW('showShipped', '待收货', true),
      SW('showReview', '待评价', true),
      SW('showRefund', '退款 / 售后', true)
    ]
  },

  /* ---------------------------- 必备工具（有赞 uc_widgets） ---------------------------- */
  uc_tools: {
    label: '必备工具',
    lib: 'tools',
    group: 'uc',
    desc: '九宫格工具入口：购物车 / 收货地址 / 客服 / 线下门店等',
    dep: '部分工具依赖会员、门店、分销等业务数据',
    fields: [
      R('mode', '页面风格', 'grid', [
        { value: 'grid', label: '经典版' },
        { value: 'cube', label: '九宫格版' }
      ]),
      R('iconMode', '图标风格', 'fill', [
        { value: 'fill', label: '填色版' },
        { value: 'line', label: '线框版' }
      ]),
      LIST('plugins', '工具项', {
        type: 'object',
        title: (v) => (v && v.title) || '工具',
        fields: [
          { k: 'title', label: '名称', type: 'text' },
          SW('show', '显示', true),
          R('scope', '可见范围', 'all', [
            { value: 'all', label: '所有用户可见' },
            { value: 'fx', label: '仅分销员可见' }
          ])
        ]
      }, {
        /* 有赞这一栏是固定的插件清单（不能自己加条目），所以关掉「+ 新增」 */
        noAdd: true, sortable: true,
        hint: '有赞侧是固定插件清单，本后台同样不允许新增条目，只能改名 / 开关 / 调可见范围'
      })
    ]
  },

  /* ---------------------------- 补缺组件①：文本（有赞 text） ---------------------------- */
  text: {
    label: '文本',
    lib: 'text',
    group: 'uc',
    desc: '一行 / 一段纯文字，可设字号、颜色、背景与跳转',
    fields: [
      AREA('text', '文本'),
      R('size', '字体大小', 'md', [
        { value: 'lg', label: '大' }, { value: 'md', label: '中' }, { value: 'sm', label: '小' }
      ]),
      C('color', '文本颜色', '#000000', COLOR_RESET),
      C('bg', '背景颜色', '#FFFFFF', COLOR_RESET),
      R('align', '显示位置', 'left', ALIGN3),
      LINK('link', '链接'),
      SEC('更多设置'),
      SW('showSplitLine', '显示底部分割线', false)
    ]
  },

  /* ---------------------------- 补缺组件②：关联链接（有赞 link） ---------------------------- */
  link: {
    label: '关联链接',
    lib: 'link',
    group: 'uc',
    desc: '一组文字链接，点哪条跳哪页',
    fields: [
      LIST('items', '关联链接', {
        type: 'object',
        title: (v, i) => (v && v.label) || ('链接 ' + (i + 1)),
        fields: [
          { k: 'label', label: '文字', type: 'text' },
          LINK('link', '跳转')
        ]
      }, { addable: true, sortable: true, hint: '至少配一条；文字留空的那条不会显示' })
    ]
  },

  /* ---------------------------- 补缺组件③：辅助空白（有赞 white） ---------------------------- */
  blank: {
    label: '辅助空白',
    lib: 'blank',
    group: 'uc',
    desc: '撑出一段空白，用于拉开区块间距',
    fields: [
      NUM('height', '空白高度', 30, { min: 1, max: 200, step: 1, unit: 'px', hint: '有赞实测默认 30 像素' })
    ]
  },

  /* ---------------------------- 补缺组件④：关注公众号（有赞 official_account） ---------------------------- */
  follow_oa: {
    label: '关注公众号',
    lib: 'follow',
    group: 'uc',
    desc: '扫码访问时展示的「关注公众号」入口',
    dep: '公众号能力（需在微信小程序后台「设置 · 接口设置」开通）',
    fields: [
      {
        type: 'group', label: '说明',
        hint: '与有赞一致：该组件**不支持样式配置**。仅当用户扫码访问小程序时展示；' +
          '用户点击后跳转公众号文章获取二维码，长按识别关注。' +
          '本后台尚未开通该项能力，真机会忠实渲染并标注依赖，不会假装可用。'
      }
    ]
  }
};

/* ============================ 个人中心组件库（4 个 tab） ============================ */

/**
 * 有赞个人中心「添加组件」实测 3 组 20 个；本项目另加第 4 组「专属区块」。
 *
 * 为什么要多一组：有赞的 5 个系统区块（标题栏 / 个人信息 / 个人资产 / 我的订单 / 必备工具）
 * 只在模板里出现，删掉后在「添加组件」里找不回来。本项目的默认区块同样含这 5 个，
 * 若不给入口，运营误删一个就永远回不来了 —— 所以补一组「专属区块」（各限 1 个）。
 * 这是**有意偏离**，前 3 组仍与有赞逐项一致。
 */
const UC_LIB_GROUPS = [
  {
    name: '基础组件',
    items: [
      { n: '富文本', kind: 'rich_text' },
      { n: '图片广告', kind: 'swiper' },
      { n: '魔方', kind: 'cube' },
      { n: '图文导航', kind: 'nav' },
      { n: '文本', kind: 'text' },
      { n: '关联链接', kind: 'link' },
      { n: '标题', kind: 'title' }
    ]
  },
  {
    name: '营销组件',
    items: [
      { n: '优惠券', kind: 'coupon' },
      { n: '集点卡', kind: 'reward_points' }
    ]
  },
  {
    name: '其他',
    items: [
      { n: '店铺信息', kind: 'shop' },
      { n: '进入店铺', kind: 'enter_shop' },
      { n: '商品搜索', kind: 'search' },
      { n: '公告', kind: 'notice' },
      { n: '语音', kind: 'audio' },
      { n: '视频', kind: 'video' },
      { n: '线下门店', kind: 'nearby_store' },
      { n: '在线客服', kind: 'service' },
      { n: '辅助线', kind: 'line' },
      { n: '辅助空白', kind: 'blank' },
      { n: '关注公众号', kind: 'follow_oa' }
    ]
  },
  {
    name: '专属区块',
    items: [
      { n: '标题栏', kind: 'uc_navbar' },
      { n: '个人信息', kind: 'uc_profile' },
      { n: '个人资产', kind: 'uc_stats' },
      { n: '我的订单', kind: 'uc_order' },
      { n: '必备工具', kind: 'uc_tools' }
    ]
  }
];

/** 个人中心的组件上限（有赞侧系统区块各 1 个；其余沿用基础组件上限，缺省 20） */
const UC_MAX = {
  标题栏: 1, 个人信息: 1, 个人资产: 1, 我的订单: 1, 必备工具: 1,
  文本: 50, 关联链接: 10, 辅助空白: 50, 关注公众号: 1,
  富文本: 200, 图片广告: 500, 魔方: 200, 图文导航: 10, 标题: 50,
  优惠券: 50, 集点卡: 1,
  店铺信息: 50, 进入店铺: 1, 商品搜索: 2, 公告: 20, 语音: 50, 视频: 50,
  线下门店: 1, 在线客服: 1, 辅助线: 50
};

/* ============================ 默认区块（照有赞「模板二」） ============================ */

/**
 * 「我的」页的初始区块 = 有赞模板二的 7 个区块，顺序一致。
 *
 * 两处必要的落地调整（都记录在案）：
 *   ① 广告位（swiper）本身留空图 —— 本后台没有可预置的首页级物料，
 *      运营在区块树里能看到「图片广告」，点开加图即可（有赞模板自带了两张运营图）。
 *   ② 「必备工具」沿用有赞的插件与默认勾选，另补了第 21 项「关于我们」
 *      （原「我的」页就有这个入口，不补就丢了）。
 */
const UC_DEFAULT_BLOCKS = [
  {
    type: 'uc_navbar',
    title: '个人中心',
    desc: '',
    bgMode: 'default',
    bgColor: '#FFFFFF',
    bgImage: '',
    mode: 'immersive'
  },
  {
    type: 'uc_profile',
    bgImage: '',
    gradient: 'none',
    align: 'center',
    nameColor: '#333333',
    codeColor: '#FFFFFF',
    showLevel: 'show',
    barStyle: 's1'
  },
  {
    type: 'uc_stats',
    showBalance: true, showPoints: true, showCard: true, showCoupon: true,
    showWallet: true, showGiftCard: false, showPickupCard: false
  },
  {
    type: 'swiper',
    mode: 'poster',
    height: 400,
    radius: 'round',
    images: [],
    interval: 4500,
    indicator: 'dots',
    pageMargin: 12,
    imageGap: 0
  },
  {
    type: 'uc_order',
    title: '我的订单',
    showAll: true, showPendingPay: true, showPendingShip: true, showShipped: true,
    showReview: true, showRefund: true
  },
  {
    type: 'uc_tools',
    mode: 'grid',
    iconMode: 'fill',
    /*
     * 每项把 icon / real / enabled 一并烘进数据里。
     *
     * 这三个值原本只存在于本文件的 UC_TOOL_ITEMS（服务端），而装修台预览与真机
     * 都需要它们 —— 各写一份表就会出现「预览显示了 21 项、真机只有 20 项」
     * 这类只在某一侧复现的错。烘进数据后**只有一份真源**（这里），
     * 装修台预览与真机都读区块数据本身。
     */
    plugins: UC_TOOL_ITEMS.map((it) => ({
      type: it.type, title: it.title, show: it.show, scope: it.scope,
      icon: it.icon || '', real: !!it.real, enabled: it.enabled !== false
    }))
  },
  { type: 'follow_oa' }
];

/* ============================ 对外导出 ============================ */

/** 个人中心专属区块的字段（合并进「我的」页的区块类型表） */
module.exports = {
  UC_KINDS,
  UC_LIB_GROUPS,
  UC_MAX,
  UC_TOOL_ITEMS,
  UC_DEFAULT_BLOCKS
};
