/**
 * 有赞「基础组件 / 高级组件」属性面板规格（1:1 复刻）。
 *
 * 数据来源（全部实测，不是推测）：
 *   · `.tooling/_yz-panels.json`   —— 2026-10-08 逐个点击组件抓的**面板字段序列**（含单选的全部选项）
 *   · `.tooling/_yz-panels2.json`  —— 2026-10-10 再抓一遍的**结构化控件事实**（单选/多选/取色器/输入框/占位提示）
 *   · `.tooling/_yz-lib-basic.json`—— 组件库卡片清单（55 个 + 每个的「已用 / 上限」）
 *
 * 复刻口径（重要，别改）：
 *   1. 字段的**顺序、名称、控件类型、默认值、占位提示**一律以实测为准；
 *   2. 有赞用**缩略图选择器**（DOM 里没有文字、只有背景图）的字段，只登记**核对到的选项**，
 *      并在 `hint` 里写明「有赞为缩略图选择器」——宁可少列，也**不能编造选项**；
 *   3. 每个组件带 `dep`（依赖说明）：小程序端能真跑的留空，缺业务底座的写清依赖什么，
 *      渲染时在区块底部原样显示，避免「看着能配、真机没反应」。
 *
 * 消费方：`schema.js` 把它合并进 `HOME_BLOCK_KINDS`（→ 属性面板字段）
 * 与组件库清单（→ 每个组件的 kind / 依赖说明）。
 */

/* ------------------------------ 共用控件常量 ------------------------------ */
/* 有赞在十几个组件里重复使用同一组选项卡，抽成常量，避免各处抄写出入。 */

const CARD_STYLE = [['white', '无边白底'], ['shadow', '卡片投影'], ['stroke', '描边白底'], ['plain', '无边透明底']];
const CORNER2 = [['square', '直角'], ['round', '圆角']];
const CORNER3 = [['square', '直角'], ['small', '小圆角'], ['round', '圆角']];
const CORNER4 = [['square', '直角'], ['small', '小圆角'], ['round', '圆角'], ['large', '大圆角']];
const IMG_RATIO = [['1:1', '1:1'], ['3:2', '3:2'], ['4:3', '4:3'], ['16:9', '16:9']];
const IMG_FILL = [['fill', '填充'], ['blank', '周边留白']];
const TEXT_WEIGHT = [['normal', '常规体'], ['bold', '加粗体']];
const TEXT_SIZE = [['large', '大号'], ['middle', '中号'], ['small', '小号']];
const TEXT_ALIGN = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']];
const SHOW_HIDE = [['show', '显示'], ['hide', '不显示']];
const GOODS_STYLE = [['white', '无边白底'], ['shadow', '卡片投影'], ['stroke', '描边白底'], ['plain', '无边透明底'], ['promo', '促销'], ['waterfall', '瀑布流']];
const LIST_STYLE = [['one', '一行一个'], ['two', '一行两个'], ['three', '一行三个'], ['big', '大图模式'], ['scroll', '横向滑动'], ['oneBigTwo', '一大两小']];

/* ------------------------------ 字段构造器 ------------------------------ */
const pairs = (arr) => arr.map(([value, label]) => ({ value: value, label: label || value }));
const H = (hint) => (hint ? { hint: hint } : null);
const T = (k, label, def, hint) => Object.assign({ k: k, label: label, type: 'text', def: def || '' }, H(hint));
const NUM = (k, label, def, hint) => Object.assign({ k: k, label: label, type: 'number', def: def == null ? 0 : def }, H(hint));
const C = (k, label, def) => ({ k: k, label: label, type: 'color', def: def || '' });
const R = (k, label, opts, def, hint) => Object.assign({ k: k, label: label, type: 'radiobutton', def: def, options: pairs(opts) }, H(hint));
const SW = (k, label, def, hint) => Object.assign({ k: k, label: label, type: 'switch', def: !!def }, H(hint));
const IMG = (k, label, hint) => Object.assign({ k: k, label: label, type: 'image' }, H(hint));
const LIST = (k, label, max, fields, hint) => Object.assign({
  k: k, label: label, type: 'list', max: max,
  item: { type: 'object', title: (v, i) => '第 ' + (i + 1) + ' 项', fields: fields }
}, H(hint));
const LINK = (label) => ({
  k: 'link', label: label || '跳转链接', type: 'link',
  hint: '留空则不跳转。点「选择链接」从页面 / 商品 / 资讯里挑，也可以手填路径或外链'
});
const SEC = (label, fields) => ({ type: 'group', label: label, fields: fields });

/* 「有赞为缩略图选择器」的统一说明（别到处换措辞） */
const THUMB = '有赞此处是缩略图选择器（界面只有示意图、没有文字），本项目只登记已核对到的形态';
const THUMB_M = '有赞此处是缩略图选择器，本项目只登记已核对到的形态；如需更多形态请告知';

/* ============================== 面板规格 ============================== */
/* 键 = 区块 kind（与 schema.HOME_BLOCK_KINDS 的键一致） */

const PANELS = {

  /* ---------------- 页面装修 ---------------- */

  /* ---------- 自定义模块（有赞：跨页复用的自定义模块） ---------- */
  custom_module: {
    label: '自定义模块',
    desc: '引用「自定义页」的内容，跨页面复用同一段装修',
    dep: '依赖有赞「自定义模块」业务：有赞可在多个页面复用同一模块。本项目用「新建自定义页 + 区块流」实现同一目的，此处仅登记引用入口',
    fields: [
      T('ref', '自定义页面模块', '', '填「自定义页」的标识（如 p149），小程序端按该页的区块流渲染'),
      LINK('模块跳转')
    ]
  },

  /* ---------- 涨粉（有赞：公众号/微信引导） ---------- */
  fans: {
    label: '涨粉',
    desc: '二维码卡片，引导关注公众号 / 加微信群',
    dep: '依赖公众号 / 微信客服等平台能力：小程序内无法直接「关注公众号」，此处忠实渲染二维码卡片并标注依赖',
    fields: [
      R('show', '是否展示二维码', [['1', '展示'], ['0', '不展示']], '1'),
      R('style', '样式', [['1', '样式一'], ['2', '样式二'], ['3', '样式三']], '1'),
      R('qrType', '二维码类型', [['group', '微信群/个人微信号'], ['mp', '公众号'], ['other', '其他（小红书、抖音）']], 'mp',
        '实测：该字段为单选，三项依次是「微信群/个人微信号」「公众号」「其他」'),
      R('qrMode', '添加二维码', [['live', '活码'], ['image', '图片']], 'live'),
      IMG('qr', '二维码图片'),
      T('text', '按钮文字', '公众号', '最多 10 个字'),
      T('desc', '描述', '', '请填写描述'),
      SEC('样式设置', [
        C('cardBg', '卡片颜色', '#FFFFFF'),
        C('bg', '背景颜色', ''),
        C('color', '文字颜色', '#666666'),
        R('cardCorner', '卡片倒角', CORNER2, 'round', THUMB),
        R('btnCorner', '按钮倒角', CORNER4, 'large', THUMB),
        NUM('pageMargin', '页面边距', 16)
      ])
    ]
  },

  /* ---------------- 商品 ---------------- */

  /* ---------- 商品分组（真跑：按商品库分类展示） ---------- */
  goods_group: {
    label: '商品分组',
    desc: '顶部/左侧菜单 + 商品列表，按商品库分类分组',
    fields: [
      R('menuStyle', '菜单样式', [['top', '顶部菜单'], ['left', '左侧菜单']], 'top',
        '实测：该字段为缩略图选择器，已核对到「顶部菜单」「左侧菜单」两种'),
      R('sticky', '菜单吸顶', [['1', '吸顶'], ['0', '不吸顶']], '0'),
      R('showAll', '显示全部分组', SHOW_HIDE, 'hide', '「显示」时第一个分组为「全部」'),
      SEC('样式设置', [
        R('menuSkin', '菜单样式', [['1', '样式一']], '1', THUMB),
        R('listStyle', '列表样式', LIST_STYLE, 'two', '实测：该字段为缩略图选择器，已核对到「一行一个 / 一行两个 / 一行三个 / 大图模式 / 横向滑动 / 一大两小」'),
        R('goodsStyle', '商品样式', GOODS_STYLE, 'white'),
        R('btnStyle', '购买按钮样式', [['cart', '购物车'], ['plain', '纯文字']], 'cart')
      ]),
      SEC('商品管理', [
        LIST('groups', '分组', 15, [
          T('name', '分组名称', '', '填商品库里的分类名（如「清洁电器」或子分类「洗地机」）'),
          NUM('limit', '展示数量', 6)
        ], '最多不超过 15 个分组，拖拽可调整分组顺序；分组顺序就是小程序端的菜单顺序')
      ])
    ]
  },

  /* ---------- 游戏分类（有赞零售：游戏化分类） ---------- */
  game_category: {
    label: '游戏分类',
    desc: '游戏化分类菜单（有赞零售）',
    dep: '依赖有赞营销游戏（抽奖 / 大转盘等）业务，自建商城无对应能力；此处忠实复刻面板，小程序端按分类菜单做占位渲染',
    fields: [
      R('menuStyle', '菜单样式', [['top', '顶部菜单'], ['left', '左侧菜单']], 'top',
        '实测：该字段为缩略图选择器，已核对到「顶部菜单」「左侧菜单」两种'),
      R('sticky', '菜单吸顶', [['1', '吸顶'], ['0', '不吸顶']], '0'),
      R('showAll', '显示全部分组', SHOW_HIDE, 'hide'),
      R('menuSkin', '菜单样式', [['1', '样式一']], '1', THUMB),
      R('listStyle', '列表样式', LIST_STYLE, 'two', THUMB_M),
      R('goodsStyle', '商品样式', GOODS_STYLE, 'white')
    ]
  },

  /* ---------------- 新零售 ---------------- */

  point_order: {
    label: '点单卡片',
    desc: '货架点单卡片（有赞零售）',
    dep: '依赖有赞零售「货架 / 点单」业务，自建商城无此链路；此处忠实渲染卡片并标注依赖',
    fields: [
      R('show', '是否展示', SHOW_HIDE, 'show'),
      R('tpl', '选择模板', [['one', '一行一个']], 'one', THUMB),
      R('style', '卡片风格', [['text', '图文模式'], ['image', '图片模式']], 'text'),
      SEC('卡片内容', [
        LINK('链接'),
        T('title', '标题', '', '最多 6 个字'),
        T('desc', '描述', '', '最多 10 个字'),
        IMG('image', '图片', '建议尺寸 160*160 像素')
      ]),
      SEC('样式设置', [
        R('cardStyle', '卡片样式', CARD_STYLE, 'white'),
        C('bg', '背景颜色', '#ffffff'),
        C('cardBg', '卡片背景', ''),
        R('corner', '卡片倒角', CORNER2, 'round', THUMB),
        R('textAlign', '文本对齐', [['left', '左对齐'], ['right', '右对齐']], 'left'),
        R('imgAlign', '图片对齐', [['left', '左对齐'], ['right', '右对齐']], 'right'),
        NUM('cardMargin', '卡片边距', 10),
        NUM('pageMargin', '页面边距', 16)
      ])
    ]
  },

  shelf_asset: {
    label: '客户资产',
    desc: '会员资产卡片：积分 / 优惠券 / 余额 / 集点卡 / 权益卡',
    dep: '依赖有赞会员资产（积分 / 余额 / 集点卡 / 权益卡）数据，自建商城暂无对应账户体系',
    fields: [
      R('tpl', '模板选择', [['1', '模板一']], '1', THUMB),
      SEC('客户信息', [
        SW('showAvatar', '微信头像', true),
        SW('showMemberCode', '会员码', false)
      ]),
      SEC('资产信息', [
        SW('points', '积分', true),
        SW('coupon', '优惠券', true),
        SW('balance', '余额', true),
        SW('rewardCard', '集点卡', false),
        SW('rightsCard', '权益卡', false)
      ]),
      R('imgLayout', '图片布局', [['free', '热区自由布局']], 'free', THUMB),
      IMG('entryImage', '入口图片'),
      R('linkMode', '链接设置', [['all', '整体跳转'], ['hotspot', '分热区跳转']], 'all'),
      LINK('链接'),
      SEC('样式设置', [
        R('cardStyle', '卡片样式', CARD_STYLE, 'white'),
        C('numColor', '数字颜色', '#000000'),
        C('textColor', '文字颜色', '#333333'),
        C('bg', '背景颜色', '#ffffff'),
        C('cardBg', '卡片背景', ''),
        R('corner', '卡片倒角', CORNER2, 'square', THUMB),
        NUM('pageMargin', '页面边距', 16),
        NUM('cardMargin', '卡片边距', 12)
      ])
    ]
  },

  nearby_store: {
    label: '附近门店',
    desc: '按地理位置展示附近门店',
    dep: '依赖门店档案与地理位置服务（有赞零售），自建商城无门店数据源',
    fields: [
      T('title', '标题', '附近门店', '请输入标题，最多输入 8 个字'),
      T('entry', '列表入口', '查看所有门店', '请输入列表入口，最多输入 10 个字'),
      IMG('photo', '店铺照片'),
      SEC('样式设置', [
        C('bg', '背景颜色', '#ffffff'),
        R('corner', '卡片倒角', CORNER2, 'square', THUMB),
        R('cardStyle', '卡片样式', CARD_STYLE, 'white'),
        NUM('pageMargin', '页面边距', 16)
      ])
    ]
  },

  order_pool: {
    label: '好友拼单',
    desc: '好友拼单入口卡片',
    dep: '依赖有赞「好友拼单」业务链路（拼单池、成团逻辑），自建商城无对应能力',
    fields: [
      T('title', '标题', '好友拼单', '最多 12 个字'),
      T('desc', '描述', '好友拼单更实惠', '最多 12 个字'),
      LINK('链接'),
      IMG('icon', '图标', '建议尺寸：48*48 像素'),
      SEC('样式设置', [
        C('bg', '背景颜色', '#ffffff'),
        C('cardBg', '卡片背景', ''),
        R('corner', '卡片倒角', CORNER3, 'small', THUMB),
        R('btnCorner', '按钮倒角', CORNER4, 'large', THUMB),
        NUM('pageMargin', '页面边距', 16)
      ])
    ]
  },

  on_way_order: {
    label: '在途订单',
    desc: '展示进行中的订单状态',
    dep: '依赖有赞订单中台实时状态，自建商城的订单接口未开放该视图',
    fields: [
      SEC('样式设置', [
        C('textColor', '文字颜色', ''),
        C('cardBg', '卡片背景', ''),
        R('corner', '卡片倒角', CORNER2, 'square', THUMB),
        R('indicator', '轮播提示', [['1', '样式一']], '1', THUMB)
      ])
    ]
  },

  /* ---------------- 营销活动 ---------------- */

  coupon: {
    label: '优惠券',
    desc: '券卡片列表（手动添加或自动获取）',
    dep: '优惠券模板已在商品库（catalog.json）里；小程序端「领取」链路未开发，此处展示券卡片但不可领',
    fields: [
      R('mode', '添加优惠券', [['manual', '手动添加'], ['auto', '自动获取']], 'manual',
        '实测：该字段为单选，两项为「手动添加」「自动获取」'),
      R('listStyle', '排列样式', [['scroll', '横向滑动']], 'scroll', THUMB, ),
      R('cardStyle', '卡片样式', [['3', '样式三']], '3', THUMB),
      R('color', '颜色', [['red', '红色']], 'red', THUMB),
      SW('hideUsed', '隐藏已抢完及失效的券', true, '开启后，当页面无可显示的优惠券时，优惠券区块整体隐藏'),
      SEC('手动添加', [
        LIST('ids', '优惠券', 10, [
          T('id', '券模板 ID', '', '填商品库里的券模板 ID')
        ], '最多添加 10 张优惠券')
      ])
    ]
  },

  limit_discount: {
    label: '限时折扣',
    desc: '限时折扣商品列表',
    dep: '依赖有赞营销中台的折扣活动数据（活动场次、折扣价、库存）',
    fields: [
      LIST('activityIds', '限时折扣活动', 30, [
        T('id', '活动 ID', '', '填营销活动 ID')
      ], '有赞侧为「添加限时折扣活动」，最多 30 个'),
      R('listStyle', '列表样式', [['detail', '详细列表']], 'detail', THUMB),
      SEC('商品样式', [
        R('cardStyle', '商品样式', CARD_STYLE, 'white'),
        R('corner', '商品倒角', CORNER2, 'square', THUMB),
        R('ratio', '图片比例', IMG_RATIO, '1:1'),
        R('imgFill', '图片填充', IMG_FILL, 'fill'),
        R('weight', '文本样式', TEXT_WEIGHT, 'normal'),
        R('size', '文本大小', TEXT_SIZE, 'large'),
        R('align', '文本对齐', TEXT_ALIGN, 'left'),
        NUM('pageMargin', '页面边距', 15),
        NUM('gap', '商品间距', 10)
      ]),
      SEC('显示内容', [
        R('showName', '商品名称', SHOW_HIDE, 'show'),
        SW('showDesc', '商品描述', true, '此处显示商品的「分享描述」内容'),
        SW('showPrice', '商品价格', true),
        R('showSales', '商品销量', SHOW_HIDE, 'hide'),
        SW('showBuy', '购买按钮', true),
        R('btnStyle', '按钮样式', [['1', '样式1'], ['2', '样式2'], ['3', '样式3'], ['4', '样式4'], ['5', '样式5'], ['6', '样式6'], ['7', '样式7'], ['8', '样式8']], '8', THUMB_M),
        T('btnText', '按钮文案', '立即抢购'),
        SW('showOrigin', '商品原价', true),
        R('showStock', '剩余库存', SHOW_HIDE, 'hide'),
        SW('showCountdown', '抢购倒计时', true),
        SW('showProgress', '抢购进度条', true)
      ])
    ]
  },

  seckill: {
    label: '秒杀',
    desc: '秒杀场次商品列表',
    dep: '依赖有赞营销中台的秒杀场次与库存',
    fields: [
      R('listStyle', '列表样式', [['big', '大图模式']], 'big', THUMB),
      SEC('商品样式', [
        R('cardStyle', '商品样式', CARD_STYLE, 'white'),
        R('corner', '商品倒角', CORNER2, 'square', THUMB),
        R('ratio', '图片比例', IMG_RATIO, '3:2'),
        R('imgFill', '图片填充', IMG_FILL, 'blank'),
        R('weight', '文本样式', TEXT_WEIGHT, 'normal'),
        R('size', '文本大小', TEXT_SIZE, 'large'),
        R('align', '文本对齐', TEXT_ALIGN, 'left'),
        NUM('pageMargin', '页面边距', 8),
        NUM('gap', '商品间距', 8)
      ]),
      SEC('显示内容', [
        R('showName', '商品名称', SHOW_HIDE, 'show'),
        SW('showDesc', '商品描述', true, '此处显示商品的「分享描述」内容'),
        SW('showPrice', '商品价格', true),
        SW('showBuy', '购买按钮', true),
        R('btnStyle', '按钮样式', [['1', '样式1'], ['2', '样式2'], ['3', '样式3'], ['4', '样式4'], ['5', '样式5'], ['6', '样式6'], ['7', '样式7'], ['8', '样式8']], '6', THUMB_M),
        SW('showOrigin', '商品原价', true),
        SW('showCountdown', '抢购倒计时', true),
        SW('showStock', '剩余库存', true)
      ]),
      SEC('更多设置', [
        SW('hideSoldOut', '隐藏已售罄商品', true),
        SW('hideEnded', '隐藏活动结束商品', true),
        R('hideAfter', '活动结束后', [['24h', '24小时后隐藏'], ['now', '立即隐藏']], '24h')
      ])
    ]
  },

  bargain: {
    label: '砍价',
    desc: '砍价活动商品列表',
    dep: '依赖有赞砍价活动的社交链路（好友助力、砍价进度）',
    fields: [
      R('addMode', '添加方式', [['manual', '手动添加'], ['auto', '自动获取']], 'manual'),
      LIST('goodsIds', '商品', 30, [
        T('id', '商品 ID', '', '填商品库里的商品 ID')
      ], '最多添加 30 个商品'),
      R('listStyle', '列表样式', [['big', '大图模式']], 'big', THUMB),
      SEC('商品样式', [
        R('cardStyle', '商品样式', CARD_STYLE, 'white'),
        R('corner', '商品倒角', CORNER2, 'square', THUMB),
        R('ratio', '图片比例', IMG_RATIO, '3:2'),
        R('imgFill', '图片填充', IMG_FILL, 'fill'),
        R('weight', '文本样式', TEXT_WEIGHT, 'normal'),
        R('size', '文本大小', TEXT_SIZE, 'large'),
        R('align', '文本对齐', TEXT_ALIGN, 'left'),
        NUM('pageMargin', '页面边距', 8),
        NUM('gap', '商品间距', 8)
      ]),
      SEC('显示内容', [
        SW('showName', '商品名称', true),
        SW('showPrice', '商品现价', true),
        SW('showOrigin', '商品原价', true),
        SW('showBuy', '购买按钮', true),
        R('btnStyle', '按钮样式', [['1', '样式1'], ['2', '样式2'], ['3', '样式3'], ['4', '样式4'], ['5', '样式5'], ['6', '样式6'], ['7', '样式7'], ['8', '样式8']], '6', THUMB_M),
        R('showSales', '商品销量', SHOW_HIDE, 'hide'),
        R('showCountdown', '倒计时', SHOW_HIDE, 'hide'),
        R('showStock', '剩余库存', SHOW_HIDE, 'hide')
      ])
    ]
  },

  new_zone: {
    label: '新人专区',
    desc: '新人专享券专区',
    dep: '依赖有赞新客标签与新人券池',
    fields: [
      SW('showTitle', '标题名称', true),
      R('titleSource', '标题设置', [['default', '默认图'], ['custom', '自定义图片']], 'default'),
      T('title', '标题文案', '新人专享福利'),
      C('bg', '背景颜色', '#E74C2C'),
      SEC('新人专享券设置', [
        R('couponMode', '添加优惠券', [['manual', '手动添加']], 'manual',
          '无有效新人券时，新人专区将隐藏'),
        R('cardStyle', '卡片样式', [['8', '样式八']], '8', THUMB),
        R('color', '颜色', [['red', '红色']], 'red', THUMB),
        SW('applicableOnly', '适用商品', false, '开启后仅展示新人券适用商品，个性化排列')
      ])
    ]
  },

  groupon: {
    label: '拼团',
    desc: '多人拼团商品列表',
    dep: '依赖有赞拼团活动的成团逻辑',
    fields: [
      R('type', '拼团类型', [['normal', '普通拼团'], ['invite', '老带新拼团'], ['ladder', '阶梯拼团'], ['lucky', '抽奖拼团']], 'normal',
        '有赞提示：多人拼团组件升级后，此前创建的多人拼团活动（普通拼团和老带新）默认在「普通拼团」分组下'),
      R('addMode', '添加方式', [['manual', '手动添加'], ['auto', '显示个数']], 'auto'),
      NUM('limit', '最多显示个数', 20),
      SW('showAll', '全部按钮', true),
      R('sortRule', '排序规则', [['sales', '销量越高越靠前']], 'sales', THUMB),
      R('listStyle', '列表样式', [['big', '大图模式']], 'big', THUMB),
      SEC('商品样式', [
        R('cardStyle', '商品样式', CARD_STYLE, 'white'),
        R('corner', '商品倒角', CORNER2, 'square', THUMB),
        R('ratio', '图片比例', IMG_RATIO, '3:2'),
        R('imgFill', '图片填充', IMG_FILL, 'fill'),
        R('weight', '文本样式', TEXT_WEIGHT, 'normal'),
        R('size', '文本大小', TEXT_SIZE, 'large'),
        R('align', '文本对齐', TEXT_ALIGN, 'left'),
        NUM('pageMargin', '页面边距', 15),
        NUM('gap', '商品间距', 10)
      ]),
      SEC('显示内容', [
        R('showName', '商品名称', SHOW_HIDE, 'show'),
        SW('showDesc', '商品描述', true, '此处显示商品的「分享描述」内容'),
        R('showSales', '商品销量', SHOW_HIDE, 'hide'),
        SW('showBuy', '购买按钮', true),
        R('btnStyle', '按钮样式', [['1', '样式1'], ['2', '样式2'], ['3', '样式3'], ['4', '样式4'], ['5', '样式5'], ['6', '样式6'], ['7', '样式7'], ['8', '样式8']], '8', THUMB_M),
        T('btnText', '按钮文案', '去开团'),
        SW('showGroupPrice', '拼团价', true),
        SW('showSinglePrice', '单买价', true),
        SW('showCountdown', '抢购倒计时', true),
        SW('showGrouped', '已团人数', true),
        R('hideSoldOut', '已售罄拼团商品', [['show', '显示'], ['hide', '不隐藏']], 'hide')
      ])
    ]
  },

  reward_points: {
    label: '集点卡',
    desc: '集点卡卡片',
    dep: '依赖有赞集点卡会员权益体系',
    fields: [
      R('tpl', '选择模板', [['1', '样式一'], ['2', '样式二']], '1', THUMB),
      SEC('样式设置', [
        IMG('icon', '图标样式', '有赞侧由「集点卡活动设置」统一控制'),
        C('cardColor', '卡片颜色', '#ffffff'),
        C('bg', '背景颜色', ''),
        R('corner', '卡片倒角', CORNER2, 'square', THUMB),
        NUM('pageMargin', '页面边距', 16)
      ])
    ]
  },

  /* ---------------- 会员 ---------------- */

  member_goods: {
    label: '会员专享价',
    desc: '会员专享价商品列表',
    dep: '依赖有赞会员等级与专享价体系；有赞提示：商品若参加其他优惠活动（如限时折扣）不会在此展示',
    fields: [
      R('addMode', '查看详情', [['manual', '手动添加']], 'manual'),
      R('listStyle', '列表样式', [['big', '大图模式']], 'big', THUMB),
      SEC('商品样式', [
        R('cardStyle', '商品样式', CARD_STYLE, 'white'),
        R('corner', '商品倒角', CORNER2, 'square', THUMB),
        R('ratio', '图片比例', IMG_RATIO, '3:2'),
        R('imgFill', '图片填充', IMG_FILL, 'fill'),
        R('weight', '文本样式', TEXT_WEIGHT, 'normal'),
        R('size', '文本大小', TEXT_SIZE, 'large'),
        R('align', '文本对齐', TEXT_ALIGN, 'left'),
        NUM('pageMargin', '页面边距', 15),
        NUM('gap', '商品间距', 10)
      ]),
      SEC('显示内容', [
        R('showName', '商品名称', SHOW_HIDE, 'show'),
        SW('showOrigin', '商品原价', true)
      ]),
      SEC('会员专享商品', [
        LIST('goodsIds', '商品', 30, [T('id', '商品 ID', '', '填商品库里的商品 ID')], '最多添加 30 个商品')
      ])
    ]
  },

  member_value: {
    label: '会员储值',
    desc: '充值 / 售卡活动卡片',
    dep: '依赖有赞储值 / 礼品卡资金账户体系',
    fields: [
      R('type', '活动类型', [['recharge', '充值活动'], ['card', '售卡活动']], 'recharge'),
      R('tpl', '选择模板', [['1', '模板一'], ['2', '模板二']], '1', THUMB),
      LIST('rules', '充值规则', 5, [
        T('name', '规则名称', ''),
        NUM('amount', '充值金额', 0)
      ], '有赞侧最多添加 5 个充值规则'),
      SEC('样式设置', [
        R('cardStyle', '卡片样式', [['color', '颜色填充'], ['image', '图片填充']], 'color', THUMB),
        C('cardColor', '卡片颜色', '#ffffff'),
        C('bg', '背景颜色', ''),
        C('balanceColor', '余额与充值文字颜色', '#ffffff'),
        R('corner', '卡片倒角', CORNER2, 'square', THUMB),
        R('btnCorner', '按钮倒角', CORNER4, 'large', THUMB),
        NUM('pageMargin', '页面边距', 16)
      ])
    ]
  },

  join_member: {
    label: '办会员',
    desc: '开卡引导卡片',
    dep: '依赖有赞会员卡开卡链路',
    fields: [
      R('type', '引导办理', [['free', '免费会员'], ['paid', '付费会员']], 'free'),
      T('title', '标题内容', '立即入会，享会员特权', '12 个字以内'),
      R('subTitle', '副标题文字', [['auto', '自动匹配'], ['custom', '自定义'], ['hide', '不展示']], 'auto'),
      R('showRights', '权益图标', [['0', '不展示'], ['1', '展示']], '0'),
      R('giftStyle', '礼包样式', [['0', '不展示'], ['1', '展示']], '0'),
      R('bgStyle', '背景样式', [['default', '默认'], ['shop', '全店风格'], ['custom', '自定义']], 'default'),
      C('theme', '主题色', '')
    ]
  },

  point_asset: {
    label: '积分资产',
    desc: '积分余额卡片',
    dep: '依赖有赞积分账户',
    fields: [
      R('bgMode', '背景设置', [['default', '默认背景'], ['color', '自定义颜色'], ['image', '自定义图片']], 'default'),
      C('textColor', '文本颜色', '#111111'),
      R('iconMode', '图标设置', [['default', '默认图标'], ['custom', '自定义']], 'default'),
      R('ruleLink', '积分规则链接', [['default', '默认链接'], ['custom', '自定义']], 'default'),
      SW('showExpiring', '即将过期积分', false)
    ]
  },

  /* ---------------- 直播 ---------------- */

  wx_live: {
    label: '小程序直播',
    desc: '小程序直播间入口',
    dep: '依赖微信小程序直播组件与直播间 ID，自建后端无直播间数据',
    fields: [
      T('roomId', '直播间 ID', '', '填微信小程序直播的 roomId；留空时小程序端显示占位卡片'),
      LINK('跳转链接')
    ]
  },

  wxvideo_live: {
    label: '视频号直播',
    desc: '视频号直播预约 / 直播间入口',
    dep: '依赖视频号预约与直播间绑定（微信侧能力）',
    fields: [
      R('mode', '展示模式', [['book', '预约'], ['live', '直播间']], 'book'),
      SW('showCover', '显示封面', true),
      NUM('radius', '封面倒角', 10)
    ]
  },

  guang_live: {
    label: '爱逛直播',
    desc: '爱逛（第三方直播平台）入口',
    dep: '依赖爱逛（第三方直播平台）账号，本项目无该平台接入',
    fields: [
      T('shopId', '爱逛店铺 ID', ''),
      T('roomId', '直播间 ID', ''),
      LINK('跳转链接')
    ]
  },

  /* ---------------- 智能运营 ---------------- */

  goods_recommend_adv: {
    label: '人群运营',
    desc: '按人群包投放的海报位',
    dep: '依赖有赞人群包定向能力（需在有赞「客户运营 - 人群运营」里先建人群）',
    fields: [
      T('note', '人群来源', '客户运营-人群运营-加购未支付客户',
        '有赞侧此组件只显示入口说明，人群包在有赞后台配置；本项目仅登记入口文案')
    ]
  },

  crowd_image: {
    label: '人群图片',
    desc: '按人群投放不同图片（同一位置轮流展示）',
    dep: '依赖有赞人群包定向能力；本项目按「同一位置轮播」忠实渲染，不做人群区分',
    fields: [
      R('tpl', '选择模板', [['single', '单图模式']], 'single', THUMB),
      LIST('images', '添加图片', 5, [
        IMG('image', '图片'),
        T('crowd', '人群包', '', '有赞侧在这里选人群包；本项目留作备注')
      ], '最多添加 5 个广告。所有图片将针对不同人群在同一位置展示，若同一用户满足多个图片展示条件则展示第一张，可拖动顺序改变优先级'),
      R('imgStyle', '图片样式', [['normal', '常规']], 'normal', THUMB),
      R('corner', '图片倒角', [['square', '直角']], 'square', THUMB),
      NUM('pageMargin', '页面边距', 0)
    ]
  },

  hot_words: {
    label: '店铺热搜',
    desc: '搜索热词入口（真跑：词表在装修台里配）',
    fields: [
      R('mode', '模式选择', [['multi', '多行'], ['single', '单行']], 'multi'),
      T('title', '标题设置', '大家都在搜', '最多输入 6 个字'),
      SW('badge', '热词角标', true),
      R('colorMode', '精选词颜色', [['shop', '全店风格'], ['custom', '自定义']], 'shop'),
      C('color', '自定义颜色', '#C8102E'),
      R('style', '样式选择', [['1', '样式一'], ['2', '样式二']], '1', '实测：样式一 / 样式二'),
      SEC('热词', [
        LIST('words', '热词', 10, [T('word', '关键词', '', '点击后进入商品列表搜索该词')],
          '有赞侧需在「前往设置」里维护热词库；本项目直接在此维护')
      ])
    ]
  },

  shop_rank: {
    label: '店铺榜单',
    desc: '榜单商品（真跑：按销量排名取数）',
    fields: [
      T('title', '模块标题', '店铺榜单'),
      R('corner', '组件倒角', CORNER2, 'square', THUMB),
      NUM('pageMargin', '页边距', 15),
      R('rankBy', '榜单依据', [['sales', '按销量'], ['comment', '按评价数']], 'sales',
        '有赞侧由系统算法自动计算、无需编辑；本项目按商品库里的真实字段排名'),
      NUM('limit', '展示数量', 6)
    ]
  },

  /* ---------------- 积分 ---------------- */

  points_goods: {
    label: '积分兑换商品',
    desc: '积分兑换商品列表',
    dep: '依赖有赞积分账户与兑换链路',
    fields: [
      R('addMode', '添加方式', [['manual', '手动添加'], ['auto', '自动获取']], 'auto'),
      SEC('兑换商品', [
        LIST('goodsIds', '商品', 50, [T('id', '商品 ID', '', '填商品库里的商品 ID')], '有赞上限 50 个')
      ]),
      SEC('显示内容', [
        R('showName', '商品名称', SHOW_HIDE, 'show'),
        SW('showPoints', '所需积分', true)
      ])
    ]
  },

  /* ---------------- 其他 ---------------- */

  member_card: {
    label: '会员卡片',
    desc: '会员等级 / 注册入口卡片',
    dep: '依赖有赞会员体系（等级、开卡）。有赞提示：该组件当前仅支持微信小程序（v3.33.2 及以上），其他渠道不可见',
    fields: [
      R('show', '是否展示', SHOW_HIDE, 'show'),
      T('title', '标题', '注册会员', '最多 12 个字'),
      T('desc', '描述', '', '最多 12 个字'),
      SEC('样式设置', [
        C('cardBg', '卡片背景', ''),
        R('corner', '卡片倒角', CORNER2, 'square', THUMB),
        NUM('cardMargin', '卡片边距', 16)
      ])
    ]
  },

  shop_banner_card: {
    label: '店招信息',
    desc: '店招卡片：公告 + 优惠券入口',
    dep: '含「店铺优惠」券位，依赖有赞领券链路；其余部分按店铺数据忠实渲染。有赞提示：该组件当前仅支持微信小程序（v3.33.2 及以上）',
    fields: [
      R('show', '是否展示', SHOW_HIDE, 'show'),
      R('bannerStyle', '店招样式', [['3', '样式三'], ['4', '样式四']], '3', THUMB_M),
      R('cardStyle', '卡片样式', CARD_STYLE, 'white'),
      R('corner', '卡片倒角', CORNER2, 'round', THUMB),
      R('bgCorner', '背景图片倒角', CORNER2, 'square', THUMB_M),
      LIST('bgs', '背景图片', 4, [IMG('image', '图片')],
        '固定尺寸：750x288 像素，尺寸不匹配时图片将被压缩或拉伸以铺满；最多添加 4 张背景图片，拖动选中的图片可调整顺序'),
      SEC('店铺公告', [
        R('showNotice', '店铺公告', SHOW_HIDE, 'show'),
        T('notice', '公告内容', '公告', '填写内容，如果过长，会在手机上滚动显示')
      ]),
      SEC('店铺优惠', [
        R('showCoupon', '店铺优惠', SHOW_HIDE, 'show'),
        R('couponMode', '优惠券', [['manual', '手动添加'], ['auto', '自动获取']], 'manual'),
        SW('hideUsed', '隐藏已抢完券', false, '开启后，当页面无可显示的优惠券时，优惠券区块整体隐藏'),
        LIST('couponIds', '优惠券', 10, [T('id', '券模板 ID', '', '填商品库里的券模板 ID')], '最多添加 10 张优惠券')
      ])
    ]
  },

  /* ---------------- 教育（有赞教育行业专属） ---------------- */

  course: {
    label: '课程',
    desc: '课程列表（有赞教育）',
    dep: '有赞教育行业专属，莱克商城无此业务；此处忠实复刻面板，小程序端按列表占位渲染',
    fields: [
      SW('showTitle', '标题', true),
      T('title', '标题文案', '课程', '最多按 8 个字显示'),
      R('style', '展示样式', [['card', '卡片'], ['list', '列表']], 'card', THUMB_M),
      SEC('显示内容', [
        SW('showPrice', '课程价格', true),
        SW('showTeacher', '讲师', true),
        NUM('limit', '展示数量', 6)
      ])
    ]
  },

  paid_column: {
    label: '知识专栏',
    desc: '知识专栏列表（有赞教育）',
    dep: '有赞教育行业专属',
    fields: [
      SW('showTitle', '标题', true),
      T('title', '标题文案', '最新专栏', '最多按 8 个字显示'),
      R('style', '展示样式', [['1', '样式一'], ['2', '样式二']], '1', THUMB_M),
      NUM('limit', '展示数量', 6)
    ]
  },

  paid_content: {
    label: '知识内容',
    desc: '知识内容列表（有赞教育）',
    dep: '有赞教育行业专属',
    fields: [
      SW('showTitle', '标题', true),
      T('title', '标题文案', '最新内容', '最多按 8 个字显示'),
      R('style', '展示样式', [['1', '样式一'], ['2', '样式二']], '1', THUMB_M),
      NUM('limit', '展示数量', 6)
    ]
  },

  content_live: {
    label: '知识直播',
    desc: '知识直播列表（有赞教育）',
    dep: '有赞教育行业专属',
    fields: [
      SW('showTitle', '标题', true),
      T('title', '标题文案', '最新直播', '最多按 8 个字显示'),
      R('style', '展示样式', [['1', '样式一'], ['2', '样式二']], '1', THUMB_M),
      NUM('limit', '展示数量', 6)
    ]
  },

  paid_member: {
    label: '知识付费会员',
    desc: '知识付费会员卡片（有赞教育）',
    dep: '有赞教育行业专属',
    fields: [
      SW('showTitle', '标题', true),
      T('title', '标题文案', '知识付费会员', '最多按 8 个字显示'),
      R('style', '展示样式', [['1', '样式一'], ['2', '样式二']], '1', THUMB_M),
      NUM('limit', '展示数量', 6)
    ]
  },

  punch: {
    label: '群打卡',
    desc: '打卡活动列表（有赞教育）',
    dep: '有赞教育行业专属',
    fields: [
      SW('showTitle', '标题', true),
      T('title', '标题文案', '最新打卡', '最多按 8 个字显示'),
      R('style', '展示样式', [['1', '样式一'], ['2', '样式二']], '1', THUMB_M),
      NUM('limit', '展示数量', 6)
    ]
  },

  /* ---------------- 高级组件 ---------------- */

  personal_nav: {
    label: '个性导航',
    desc: '有赞开放平台三方扩展：个性导航',
    dep: '有赞开放平台三方扩展组件，依赖有赞开放平台运行时；本项目底部导航走「全局配置 · 店铺导航」实现',
    fields: [
      T('note', '扩展说明', '有赞开放平台扩展：extension-cnzoom-person-nav',
        '本后台不接入该扩展；底部导航请到「全局配置 · 店铺导航」配置')
    ]
  }
};

module.exports = { PANELS: PANELS, THUMB: THUMB, THUMB_M: THUMB_M };
