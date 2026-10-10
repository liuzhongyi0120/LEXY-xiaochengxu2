/**
 * 装修后台 · 页面与字段 Schema
 *
 * 设计思路（对标有赞「店铺页面」装修后台，参照 /v4/deco/decorate#/edit/<id> 编辑页）：
 *   前台 5 个页面全部由 miniprogram/config/replica.js 驱动，所以后台只要管理这份数据，
 *   就能「逐个页面」修改前端。为避免每加一个字段都要改后台代码，这里用**声明式 schema**
 *   描述每个页面的结构，后台表单、预览、字段校验全部由 schema 自动推导。
 *
 * ── 字段类型（对标有赞属性面板的控件体系）──
 *   text / textarea / number / image / select / readonly      叶子字段
 *   switch        iOS 风格开关（自动播放、显示价格…）
 *   slider        滑块 + 数值（页面边距、图片间距、切换速度…）
 *   color         色值输入 + 取色器 + 重置（卡片颜色、背景颜色…）
 *   radiobutton   描边按钮组（方角/圆角、居左/居中…）
 *   template      模板形态选择器，带缩略图（一行一个/轮播海报/双层轮播/横向滑动）
 *   object        固定结构的分组
 *   list          数组，item 为 image（字符串数组）或 object（对象数组）
 *   union         数组，item 结构随 kindField（首页区块的 type）变化
 *
 * ── 字段上的修饰属性 ──
 *   group        归入某个可折叠分组（如「更多设置」），数据上仍平铺，只是渲染时归组
 *   collapsed    该分组默认折叠
 *   required     必填标记 *
 *   max          列表项数上限（如轮播图最多 10 张）
 *   hint         说明文字（灰色小字）
 *   tip          提示条（浅蓝底 + 💡，用于功能公告/使用建议）
 *   doc          查看教程链接（外链有赞帮助中心风格）
 *
 * adapter：
 *   from(replica) → 页面数据（后台展示用）
 *   to(data, out) → 把页面数据写回 replica 的各字段（发布时使用）
 */

const customPages = require('./customPages');
const {
  UC_KINDS, UC_LIB_GROUPS, UC_MAX, UC_TOOL_ITEMS, UC_DEFAULT_BLOCKS
} = require('./yzUserCenter');

/* ============================ 组件库图标（内联 SVG） ============================ */

const I = (d) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';

const ICONS = {
  title: I('<path d="M5 6h14M8 6v12M16 6v12"/>'),
  line: I('<path d="M3 12h18"/><path d="M7 7v10M12 7v10M17 7v10" stroke-opacity=".35"/>'),
  image_ad: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/><circle cx="8.5" cy="8.5" r="1.5"/>'),
  video: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10.5 9.5l5 2.5-5 2.5z"/>'),
  fans: I('<circle cx="12" cy="9" r="3"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/><circle cx="18.5" cy="7.5" r="2" stroke-opacity=".5"/>'),
  goods: I('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
  coupon: I('<path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2.2 2.2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2.2 2.2 0 000-4z"/><path d="M12 7v10" stroke-dasharray="2 2"/>'),
  discount: I('<circle cx="12" cy="12" r="8"/><path d="M9 9.5h.01M15 14.5h.01M9.5 15l5-6"/>'),
  groupbuy: I('<circle cx="9" cy="8" r="2.5"/><circle cx="16" cy="9" r="2"/><path d="M4 18c0-2.5 2.2-4 5-4s5 1.5 5 4M14 18c0-1.8 1.4-3 3-3s3 1.2 3 3" stroke-opacity=".7"/>'),
  recommend: I('<path d="M12 4l2.3 4.7 5.2.8-3.8 3.6.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 9.5l5.2-.8z"/>'),
  content_card: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M6 19h12M8 8h6M8 11h4"/>'),
  notice: I('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 010 6"/>'),
  nav: I('<rect x="3" y="5" width="5" height="5" rx="1.5"/><rect x="10" y="5" width="5" height="5" rx="1.5"/><rect x="17" y="5" width="4" height="5" rx="1.5"/><path d="M5.5 15h2M11.5 15h2M18 15h1" stroke-opacity=".7"/>'),
  cube: I('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
  hotspot: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h5v5" stroke-dasharray="2 2"/>'),
  shop: I('<path d="M4 9l1.5-4h13L20 9"/><path d="M4 9v10h16V9"/><path d="M9 19v-5h6v5"/>'),
  anchor: I('<path d="M5 6h14M5 12h14M5 18h9"/>'),
  rich_text: I('<path d="M4 6h16"/><path d="M4 11h10M4 15h13M4 19h7"/><path d="M16 9l4 4-4 4" stroke-opacity=".4"/>'),
  search: I('<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>'),
  elevator: I('<rect x="4" y="3" width="12" height="18" rx="2"/><path d="M6 7h8M6 11h8M6 15h5"/><path d="M19 7v10M17 9l2-2 2 2M17 15l2 2 2-2" stroke-opacity=".5"/>'),
  audio: I('<path d="M9 15V6l7-2v9"/><circle cx="6.5" cy="16" r="2.5"/><circle cx="16" cy="14" r="2.5"/>'),
  service: I('<path d="M5 12a7 7 0 0114 0"/><rect x="3" y="12" width="4" height="7" rx="1.6"/><rect x="17" y="12" width="4" height="7" rx="1.6"/><path d="M17 19c0 1.3-1.4 2-3.2 2" stroke-opacity=".6"/>'),
  content_card: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M6 19h12M8 8h6M8 11h4"/>'),
  buy_bar: I('<rect x="3" y="16" width="18" height="5" rx="2.5"/><path d="M7 8.5h10M7 12h6" stroke-opacity=".5"/>'),
  brand_category: I('<rect x="3" y="4" width="6" height="16" rx="1.5"/><rect x="12" y="4" width="9" height="7" rx="1.5"/><rect x="12" y="13" width="9" height="7" rx="1.5"/>'),
  /* ---- 个人中心专属区块（2026-10-10 新增，见 yzUserCenter.js） ---- */
  page_head: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 6.5h.01M11 6.5h-1"/>'),
  profile: I('<circle cx="12" cy="8.5" r="3.2"/><path d="M5.5 19.5c0-3.1 2.9-5 6.5-5s6.5 1.9 6.5 5"/>'),
  assets: I('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/><circle cx="17" cy="14.5" r="1.3"/>'),
  order: I('<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>'),
  tools: I('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><path d="M17 14v6M14 17h6"/>'),
  text: I('<path d="M4 7h16"/><path d="M4 12h11"/><path d="M4 17h7"/>'),
  link: I('<path d="M10 13.5a3.5 3.5 0 015 0l2.5-2.5a3.5 3.5 0 00-5-5L11 7.5"/><path d="M14 10.5a3.5 3.5 0 01-5 0L6.5 13a3.5 3.5 0 005 5L13 16.5" stroke-opacity=".85"/>'),
  blank: I('<rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="16" width="18" height="4" rx="1.5"/><path d="M12 10v4M10 12h4" stroke-opacity=".5"/>'),
  follow: I('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="12" cy="11" r="3.2"/><path d="M9 19.5l3-2.5 3 2.5" stroke-opacity=".6"/>')
};

/* ============================ 跳转链接（对标有赞「选择链接」） ============================ */

/**
 * 跳转目标类型。
 *
 * 数据上「跳转」只存一个字符串（小程序页面路径 / 商品详情路径 / 外链 / 电话），
 * 这样 replica.js 的结构不变、小程序端只按普通路径跳转；
 * 后台负责把这个字符串「翻译」成人看得懂的名字（见 admin.js 的 linkLabel）。
 *
 *   page   小程序页面（内置 5 页 + 自定义页），如 /pages/lexy/lexy
 *   goods  商品详情，如 /packageGoods/detail/detail?id=g1001
 *   news   资讯内容页，如 /packageNews/detail/detail?key=about
 *   web    网页链接（小程序内打不开，点击复制）
 *   tel    电话号码（点击拨号）
 */
const LINK_KINDS = ['page', 'goods', 'news', 'web', 'tel'];

const LINK_HINT = '留空则不跳转。点「选择链接」从页面 / 商品 / 资讯里挑，也可以手填路径或外链';

/** 生成一个跳转字段（各处复用，保证 label / hint / type 完全一致） */
function linkField(label) {
  return { k: 'link', label: label || '跳转链接', type: 'link', hint: LINK_HINT };
}

/**
 * 字重可选项。取值来自有赞「品牌分类E」实测：
 * 默认粗细 300、选中粗细 450、小组标题 700、分类标题 400 —— 都在这一组里，别再各写一套。
 */
const WEIGHT_OPTIONS = [
  { value: '300', label: '较细' }, { value: '400', label: '常规' },
  { value: '450', label: '适中' }, { value: '700', label: '加粗' }
];

/**
 * 区块数据的结构升级（幂等：新老数据跑一遍结果一致）。
 *
 * 历史沿革：图片广告的 images 原本是「图片地址字符串数组」，
 * 加入「每张图单独设跳转」后升级为 [{ image, link }]。
 * 升级只改结构、不动图片地址，且必须让新老数据得到同一结果 ——
 * 否则「发布前后逐字段哈希一致」的无损校验会失败。
 */
function upgradeBlock(b) {
  if (!b || typeof b !== 'object') return b;
  if (b.type === 'swiper' && Array.isArray(b.images)) {
    b.images = b.images
      .map((x) => {
        if (typeof x === 'string') return x ? { image: x, link: '' } : null;
        if (x && typeof x === 'object') return { image: x.image || '', link: x.link || '' };
        return null;
      })
      .filter(Boolean);
  }
  return b;
}

/**
 * 页面数据升级。目前只有「首页 / 自定义页」是区块流（根上有 blocks），
 * 其余页面的跳转字段都是新增的可选字段，缺省即空，不需要迁移。
 */
function upgradePageData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.blocks)) data.blocks = data.blocks.map(upgradeBlock);
  return data;
}

/* ============================ 首页区块类型（可添加到页面的组件） ============================ */

const HOME_BLOCK_KINDS = {
  /* ---------- 图片广告（对标有赞「图片广告」组件的 4 种形态） ---------- */
  swiper: {
    label: '图片广告',
    lib: 'image_ad',
    group: 'basic',
    desc: '多张图片轮播 / 横向滑动，建议所有图比例一致',
    tip: '轮播海报支持调整切换速度与轮播提示样式；横向滑动适合展示多张等宽图。',
    fields: [
      {
        k: 'mode', label: '展示形态', type: 'template', def: 'poster',
        options: [
          { value: 'poster', label: '轮播海报' },
          { value: 'single', label: '一行一个' },
          { value: 'scroll', label: '横向滑动' },
          { value: 'double', label: '双层轮播' }
        ]
      },
      { k: 'height', label: '高度', type: 'slider', min: 200, max: 3000, step: 2, unit: 'rpx', def: 1322, hint: 'rpx（750 宽基准），建议与该图在 750 宽下的实际高度一致，否则会被裁切。首屏海报实测 1322' },
      { k: 'radius', label: '边角样式', type: 'radiobutton', def: 'square', options: [{ value: 'square', label: '方角' }, { value: 'round', label: '圆角' }] },
      {
        k: 'images', label: '图片', type: 'list', max: 10, imageList: true,
        item: {
          type: 'object',
          title: (v, i) => '第 ' + (i + 1) + ' 张',
          fields: [{ k: 'image', label: '图片', type: 'image' }, linkField()]
        },
        hint: '建议图片尺寸宽度 750，高度不限制；最多 10 张。每张图可单独设置跳转目标'
      },
      {
        type: 'group', label: '更多设置',
        fields: [
          { k: 'interval', label: '切换速度', type: 'slider', min: 2000, max: 10000, step: 500, unit: 'ms', def: 4500 },
          { k: 'indicator', label: '轮播提示', type: 'select', def: 'dots', options: [{ value: 'dots', label: '圆点' }, { value: 'number', label: '数字' }, { value: 'none', label: '不显示' }] },
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 },
          { k: 'imageGap', label: '图片间距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 }
        ]
      }
    ]
  },

  /* ---------- 单图 ---------- */
  image: {
    label: '单张图片',
    lib: 'image_ad',
    group: 'basic',
    desc: '整宽图片，按宽度自适应高度，可设置跳转',
    fields: [
      { k: 'height', label: '占位高度', type: 'slider', min: 40, max: 6000, step: 2, unit: 'px', def: 400, hint: '仅供后台预览占位；真机按 widthFix 以图片原比例自适应，此值不生效' },
      { k: 'src', label: '图片', type: 'image' },
      linkField(),
      { k: 'radius', label: '边角样式', type: 'radiobutton', def: 'square', options: [{ value: 'square', label: '方角' }, { value: 'round', label: '圆角' }] },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 }]
      }
    ]
  },

  /* ---------- 视频 ---------- */
  video: {
    label: '视频',
    lib: 'video',
    group: 'basic',
    desc: '带封面的视频块',
    tip: '建议上传清晰度在 720P 以上的视频；封面图宽高比与视频一致，避免拉伸。',
    fields: [
      { k: 'height', label: '高度', type: 'slider', min: 200, max: 1600, step: 2, unit: 'rpx', def: 420, hint: 'rpx（750 宽基准），建议与封面图在 750 宽下的实际高度一致' },
      { k: 'src', label: '视频地址', type: 'text', hint: '有赞 CDN 的视频地址带签名，有时效性；正式上线建议转存自有视频服务' },
      { k: 'poster', label: '视频封面', type: 'image' },
      {
        type: 'group', label: '播放设置',
        fields: [
          { k: 'autoplay', label: '自动播放', type: 'switch', def: false },
          { k: 'muted', label: '静音播放', type: 'switch', def: true, hint: '小程序自动播放必须静音' },
          { k: 'controls', label: '显示进度条', type: 'switch', def: true },
          { k: 'loop', label: '循环播放', type: 'switch', def: false }
        ]
      },
      {
        type: 'group', label: '更多设置',
        fields: [
          { k: 'radius', label: '视频倒角', type: 'radiobutton', def: 'square', options: [{ value: 'square', label: '直角' }, { value: 'round', label: '圆角' }] },
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 }
        ]
      }
    ]
  },

  /* ---------- 标题文本 ---------- */
  title: {
    label: '标题文本',
    lib: 'title',
    group: 'basic',
    desc: '一行标题，可设置字号、对齐与颜色',
    fields: [
      { k: 'text', label: '标题文字', type: 'text', required: true },
      { k: 'sub', label: '副标题', type: 'text' },
      { k: 'size', label: '字号', type: 'radiobutton', def: 'md', options: [{ value: 'sm', label: '小' }, { value: 'md', label: '中' }, { value: 'lg', label: '大' }] },
      { k: 'align', label: '对齐', type: 'radiobutton', def: 'left', options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }] },
      { k: 'bold', label: '加粗', type: 'switch', def: true },
      { k: 'color', label: '文字颜色', type: 'color', def: '#222222' },
      { k: 'bg', label: '背景颜色', type: 'color', def: '' },
      linkField('整块跳转'),
      {
        type: 'group', label: '更多设置',
        fields: [
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 },
          { k: 'paddingY', label: '上下留白', type: 'slider', min: 0, max: 60, step: 2, unit: 'px', def: 16 }
        ]
      }
    ]
  },

  /* ---------- 辅助分割 ---------- */
  line: {
    label: '辅助分割',
    lib: 'line',
    group: 'basic',
    desc: '分隔线或空白间隔，用于区块之间的距离控制',
    fields: [
      { k: 'style', label: '样式', type: 'radiobutton', def: 'blank', options: [{ value: 'blank', label: '空白' }, { value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }] },
      { k: 'height', label: '高度 / 线粗', type: 'slider', min: 2, max: 240, step: 2, unit: 'rpx', def: 20 },
      { k: 'color', label: '线条颜色', type: 'color', def: '#EEEEEE' },
      { k: 'bg', label: '背景颜色', type: 'color', def: '' },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }]
      }
    ]
  },

  /* ---------- 公告 ---------- */
  notice: {
    label: '公告',
    lib: 'notice',
    group: 'basic',
    desc: '一行通知文字，支持小喇叭图标与滚动',
    fields: [
      { k: 'text', label: '公告内容', type: 'text', required: true },
      { k: 'icon', label: '显示小喇叭', type: 'switch', def: true },
      { k: 'scroll', label: '文字滚动', type: 'switch', def: false },
      { k: 'color', label: '文字颜色', type: 'color', def: '#8A5A2B' },
      { k: 'bg', label: '背景颜色', type: 'color', def: '#FFF7E6' },
      {
        type: 'group', label: '更多设置',
        fields: [
          linkField('整块跳转'),
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }
        ]
      }
    ]
  },

  /* ---------- 图文导航 ---------- */
  nav: {
    label: '图文导航',
    lib: 'nav',
    group: 'basic',
    desc: '一行 N 个图标 + 文字入口，可分别设置跳转',
    fields: [
      { k: 'cols', label: '每行个数', type: 'radiobutton', def: '4', options: [{ value: '3', label: '3 个' }, { value: '4', label: '4 个' }, { value: '5', label: '5 个' }] },
      {
        k: 'items', label: '导航项', type: 'list', max: 10, sortable: true,
        item: {
          type: 'object',
          title: (v) => v.text || '未命名',
          fields: [
            { k: 'image', label: '图标', type: 'image' },
            { k: 'text', label: '文字', type: 'text' },
            linkField()
          ]
        }
      },
      { k: 'iconSize', label: '图标大小', type: 'slider', min: 40, max: 140, step: 4, unit: 'px', def: 88 },
      { k: 'bg', label: '背景颜色', type: 'color', def: '#FFFFFF' },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 }]
      }
    ]
  },

  /* ---------- 魔方 ---------- */
  cube: {
    label: '魔方',
    lib: 'cube',
    group: 'basic',
    desc: 'N 宫格图片组合，等分排布',
    fields: [
      { k: 'cols', label: '每行个数', type: 'radiobutton', def: '2', options: [{ value: '2', label: '2 列' }, { value: '3', label: '3 列' }, { value: '4', label: '4 列' }] },
      { k: 'gap', label: '格子间距', type: 'slider', min: 0, max: 30, step: 1, unit: 'px', def: 6 },
      {
        k: 'items', label: '格子', type: 'list', max: 12, sortable: true,
        item: { type: 'object', title: (v, i) => '格子 ' + (i + 1), fields: [{ k: 'image', label: '图片', type: 'image' }, linkField()] }
      },
      {
        type: 'group', label: '更多设置',
        fields: [
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 },
          { k: 'bg', label: '背景颜色', type: 'color', def: '#FFFFFF' }
        ]
      }
    ]
  },

  /* ---------- 热区切图 ---------- */
  hotspot: {
    label: '热区切图',
    lib: 'hotspot',
    group: 'basic',
    desc: '一张大图 + 多个可点区域（百分比定位）',
    tip: '热区坐标按图片宽高的百分比填写，左上角为 0%，右下角为 100%。',
    fields: [
      { k: 'src', label: '图片', type: 'image' },
      { k: 'height', label: '高度', type: 'slider', min: 100, max: 3000, step: 2, unit: 'rpx', def: 500, hint: 'rpx（750 宽基准），建议与该图在 750 宽下的实际高度一致' },
      {
        k: 'areas', label: '热区', type: 'list', max: 8, sortable: true,
        item: {
          type: 'object',
          title: (v, i) => '热区 ' + (i + 1),
          fields: [
            { k: 'x', label: '左边距 %', type: 'slider', min: 0, max: 100, step: 1, unit: '%', def: 10 },
            { k: 'y', label: '上边距 %', type: 'slider', min: 0, max: 100, step: 1, unit: '%', def: 10 },
            { k: 'w', label: '宽度 %', type: 'slider', min: 1, max: 100, step: 1, unit: '%', def: 40 },
            { k: 'h', label: '高度 %', type: 'slider', min: 1, max: 100, step: 1, unit: '%', def: 20 },
            linkField()
          ]
        }
      },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 }]
      }
    ]
  },

  /* ---------- 店铺信息 ---------- */
  shop: {
    label: '店铺信息',
    lib: 'shop',
    group: 'basic',
    desc: '展示店铺头像 / 名称 / 标语，可跳转店铺主页',
    fields: [
      { k: 'style', label: '展示样式', type: 'radiobutton', def: 'avatar', options: [{ value: 'avatar', label: '头像 + 名称' }, { value: 'text', label: '仅名称' }] },
      { k: 'name', label: '店铺名称', type: 'text', def: 'LEXY莱克官方旗舰店' },
      { k: 'slogan', label: '店铺标语', type: 'text', def: '让世界更干净' },
      { k: 'avatar', label: '店铺头像', type: 'image' },
      { k: 'bg', label: '背景颜色', type: 'color', def: '#FFFFFF' },
      {
        type: 'group', label: '更多设置',
        fields: [
          linkField('整块跳转'),
          { k: 'align', label: '对齐', type: 'radiobutton', def: 'center', options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }] },
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }
        ]
      }
    ]
  },

  /* ---------- 商品 ---------- */
  goods: {
    label: '商品',
    lib: 'goods',
    group: 'basic',
    desc: '商品卡片列表，可按 ID 指定或自动推荐',
    tip: '商品数据实时来自后端商品库（/api/goods/list）；留空商品 ID 时按「个性化推荐」展示。',
    fields: [
      { k: 'title', label: '模块标题', type: 'text', def: '热销单品' },
      { k: 'mode', label: '取数方式', type: 'radiobutton', def: 'auto', options: [{ value: 'auto', label: '自动推荐' }, { value: 'ids', label: '指定商品' }] },
      { k: 'ids', label: '商品 ID', type: 'textarea', hint: '多个商品 ID 用英文逗号分隔，如 g_1001,g_1002；取数方式选「指定商品」时生效' },
      { k: 'cols', label: '每行个数', type: 'radiobutton', def: '2', options: [{ value: '1', label: '大图' }, { value: '2', label: '两列' }, { value: '3', label: '三列' }] },
      { k: 'limit', label: '展示数量', type: 'slider', min: 2, max: 20, step: 1, unit: '个', def: 4 },
      {
        type: 'group', label: '显示设置',
        fields: [
          { k: 'showTitle', label: '显示名称', type: 'switch', def: true },
          { k: 'showPrice', label: '显示价格', type: 'switch', def: true },
          { k: 'showBuy', label: '显示购买按钮', type: 'switch', def: false },
          { k: 'cardBg', label: '卡片底色', type: 'color', def: '#FFFFFF' }
        ]
      },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }]
      }
    ]
  },

  /* ---------- 富文本（对标有赞「富文本」） ---------- */
  rich_text: {
    label: '富文本',
    lib: 'rich_text',
    group: 'basic',
    desc: 'HTML 图文混排内容，小程序端用 rich-text 渲染',
    tip: '字号 / 颜色以真机实际效果为准，左侧预览仅供参考（与有赞同款提示）。',
    fields: [
      {
        k: 'html', label: '内容', type: 'textarea', rows: 8, required: true,
        hint: '支持 HTML 片段：<p>文字</p> / <b>加粗</b> / <img src="…" /> / <br/>；<script> 会被过滤'
      },
      { k: 'bg', label: '背景颜色', type: 'color', def: '' },
      { k: 'full', label: '全屏显示', type: 'radiobutton', def: '1', options: [{ value: '1', label: '显示' }, { value: '0', label: '隐藏' }], hint: '「显示」= 内容占满整宽（忽略页面边距）' },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }]
      }
    ]
  },

  /* ---------- 商品搜索（对标有赞「商品搜索」） ---------- */
  search: {
    label: '商品搜索',
    lib: 'search',
    group: 'basic',
    desc: '搜索框 + 可选扫一扫，点击进入商品列表搜索页',
    tip: '点击后跳到商品列表页并带上关键词；「扫一扫」仅支持扫含条码的商品。',
    fields: [
      { k: 'placeholder', label: '占位文字', type: 'text', def: '搜索店内商品' },
      { k: 'mode', label: '搜索方式', type: 'radiobutton', def: 'input', options: [{ value: 'input', label: '输入搜索' }, { value: 'link', label: '整块跳转' }], hint: '「整块跳转」时点击搜索框直接跳「跳转链接」，不再进搜索页' },
      { k: 'sticky', label: '显示位置', type: 'radiobutton', def: 'normal', options: [{ value: 'normal', label: '正常模式' }, { value: 'sticky', label: '吸顶' }] },
      { k: 'shape', label: '框体样式', type: 'radiobutton', def: 'square', options: [{ value: 'square', label: '方形' }, { value: 'round', label: '圆角' }] },
      { k: 'textAlign', label: '文本位置', type: 'radiobutton', def: 'left', options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }] },
      { k: 'boxHeight', label: '框体高度', type: 'slider', min: 24, max: 60, step: 2, unit: 'px', def: 36 },
      { k: 'scan', label: '扫一扫', type: 'switch', def: false, hint: '开启后框内右侧出现扫码入口' },
      { k: 'bg', label: '背景颜色', type: 'color', def: '#FFFFFF' },
      { k: 'boxBg', label: '框体颜色', type: 'color', def: '#F5F6F8' },
      { k: 'color', label: '文本颜色', type: 'color', def: '#999999' },
      {
        type: 'group', label: '更多设置',
        fields: [linkField('整块跳转'), { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }]
      }
    ]
  },

  /* ---------- 电梯导航（对标有赞「电梯导航」） ---------- */
  elevator: {
    label: '电梯导航',
    lib: 'elevator',
    group: 'basic',
    desc: '标签导航条，点击滚动定位到页面下方指定区块',
    tip: '与有赞一致：只能定位到「本组件下方」的区块，所以「定位到区块」填的是区块序号（从 1 开始，含本组件自身）。',
    fields: [
      { k: 'mode', label: '展示方式', type: 'radiobutton', def: 'scroll', options: [{ value: 'scroll', label: '横向滚动' }, { value: 'dropdown', label: '下拉展示' }] },
      { k: 'styleType', label: '标签样式', type: 'radiobutton', def: 'theme', options: [{ value: 'theme', label: '全店风格' }, { value: 'custom', label: '自定义' }] },
      { k: 'tagStyle', label: '标签风格', type: 'radiobutton', def: 'bg', options: [{ value: 'bg', label: '背景模式' }, { value: 'round', label: '圆框' }, { value: 'square', label: '方框' }, { value: 'underline', label: '下划线' }] },
      {
        k: 'items', label: '标签', type: 'list', max: 20, sortable: true, addable: true,
        item: {
          type: 'object', title: (v, i) => v.text || ('标签 ' + (i + 1)),
          fields: [
            { k: 'text', label: '标签文字', type: 'text' },
            { k: 'target', label: '定位到区块', type: 'number', hint: '填下方区块的序号（1 开始，含本组件自身）' }
          ]
        },
        hint: '最多 20 个标签；小程序端点击标签会滚动到对应区块'
      },
      { k: 'color', label: '文字颜色', type: 'color', def: '#323233' },
      { k: 'activeColor', label: '选中颜色', type: 'color', def: '#C8102E' },
      { k: 'bg', label: '背景颜色', type: 'color', def: '#FFFFFF' },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 0 }]
      }
    ]
  },

  /* ---------- 进入店铺（对标有赞「进入店铺」） ---------- */
  enter_shop: {
    label: '进入店铺',
    lib: 'shop',
    group: 'basic',
    desc: '一个「进入店铺」按钮，点击可跳转到店铺主页',
    fields: [
      { k: 'text', label: '文案', type: 'text', def: '进入店铺' },
      { k: 'align', label: '对齐', type: 'radiobutton', def: 'center', options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }] },
      { k: 'color', label: '文字颜色', type: 'color', def: '#323233' },
      { k: 'bg', label: '按钮背景', type: 'color', def: '#FFFFFF' },
      { k: 'radius', label: '边角样式', type: 'radiobutton', def: 'round', options: [{ value: 'square', label: '方角' }, { value: 'round', label: '圆角' }] },
      linkField('点击跳转'),
      {
        type: 'group', label: '更多设置',
        fields: [
          { k: 'bgOut', label: '区块背景', type: 'color', def: '' },
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }
        ]
      }
    ]
  },

  /* ---------- 语音（对标有赞「语音」） ---------- */
  audio: {
    label: '语音',
    lib: 'audio',
    group: 'basic',
    desc: '微信对话框样式的一条语音，点击播放',
    tip: '小程序端用 InnerAudioContext 播放；音频受小程序 downloadFile 域名白名单约束，建议用自有 CDN。',
    fields: [
      { k: 'src', label: '音频地址', type: 'text', required: true },
      { k: 'duration', label: '时长（秒）', type: 'slider', min: 1, max: 60, step: 1, unit: '秒', def: 6, hint: '仅影响气泡宽度与角标显示，不会截断音频' },
      { k: 'text', label: '气泡内文字', type: 'text', def: '' },
      { k: 'avatar', label: '头像', type: 'image', hint: '建议 80×80 像素' },
      { k: 'useShopLogo', label: '使用店铺 logo', type: 'switch', def: true, hint: '开启且未设置头像时，使用店铺头像' },
      { k: 'side', label: '气泡位置', type: 'radiobutton', def: 'left', options: [{ value: 'left', label: '居左' }, { value: 'right', label: '居右' }] },
      { k: 'resume', label: '播放方式', type: 'radiobutton', def: 'restart', options: [{ value: 'restart', label: '暂停后从头开始' }, { value: 'resume', label: '暂停后从暂停位置开始' }] },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 16 }]
      }
    ]
  },

  /* ---------- 在线客服（对标有赞「在线客服」） ---------- */
  service: {
    label: '在线客服',
    lib: 'service',
    group: 'basic',
    desc: '唤起微信客服会话的按钮（open-type=contact）',
    tip: '小程序端用 <button open-type="contact">，需要店铺已开通微信客服；未开通时点击无反应。',
    fields: [
      { k: 'text', label: '文案', type: 'text', def: '在线咨询', hint: '建议 4 个字' },
      { k: 'align', label: '对齐', type: 'radiobutton', def: 'center', options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }] },
      { k: 'color', label: '文字颜色', type: 'color', def: '#FFFFFF' },
      { k: 'bg', label: '按钮背景', type: 'color', def: '#07C160' },
      { k: 'radius', label: '边角样式', type: 'radiobutton', def: 'round', options: [{ value: 'square', label: '方角' }, { value: 'round', label: '圆角' }] },
      {
        type: 'group', label: '更多设置',
        fields: [
          { k: 'bgOut', label: '区块背景', type: 'color', def: '' },
          { k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }
        ]
      }
    ]
  },

  /* ---------- 内容卡片（对标有赞「内容卡片」） ---------- */
  content_card: {
    label: '内容卡片',
    lib: 'content_card',
    group: 'basic',
    desc: '专题图文卡片列表（一行一个 / 两列）',
    fields: [
      { k: 'title', label: '专题名称', type: 'text', hint: '建议不超过 8 个字' },
      { k: 'cols', label: '列表样式', type: 'radiobutton', def: '2', options: [{ value: '1', label: '一行一个' }, { value: '2', label: '两列' }] },
      { k: 'ratio', label: '图片比例', type: 'radiobutton', def: '0.75', options: [{ value: '1', label: '1:1' }, { value: '0.75', label: '4:3' }, { value: '0.5625', label: '16:9' }] },
      {
        k: 'items', label: '卡片', type: 'list', max: 50, sortable: true, addable: true,
        item: {
          type: 'object', title: (v, i) => v.title || ('卡片 ' + (i + 1)),
          fields: [
            { k: 'image', label: '封面图', type: 'image' },
            { k: 'title', label: '标题', type: 'text' },
            { k: 'desc', label: '描述', type: 'text' },
            linkField()
          ]
        }
      },
      {
        type: 'group', label: '显示设置',
        fields: [
          { k: 'style', label: '卡片样式', type: 'radiobutton', def: 'shadow', options: [{ value: 'shadow', label: '卡片投影' }, { value: 'white', label: '无边白底' }, { value: 'plain', label: '无边透明底' }] },
          { k: 'radius', label: '卡片倒角', type: 'radiobutton', def: 'round', options: [{ value: 'square', label: '直角' }, { value: 'round', label: '圆角' }] },
          { k: 'showTag', label: '笔记标签', type: 'switch', def: true },
          { k: 'showRead', label: '阅读数', type: 'switch', def: false },
          { k: 'showLike', label: '点赞数', type: 'switch', def: false },
          { k: 'more', label: '查看更多', type: 'switch', def: false },
          { k: 'moreText', label: '查看更多文案', type: 'text', def: '查看更多' },
          linkField('查看更多跳转')
        ]
      },
      {
        type: 'group', label: '更多设置',
        fields: [{ k: 'pageMargin', label: '页面边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 12 }]
      }
    ]
  },

  /* ---------- 购买按钮（对标有赞「购买按钮」，吸底） ---------- */
  buy_bar: {
    label: '购买按钮',
    lib: 'buy_bar',
    group: 'basic',
    desc: '固定吸底的下单按钮，一个页面建议只加一个',
    tip: '与有赞一致：固定吸底，一个页面只支持一个。文案建议不超过 10 个字。',
    fields: [
      { k: 'goodsId', label: '商品', type: 'text', required: true, hint: '填商品 ID（如 g1001），点击后进入该商品详情页下单' },
      { k: 'text', label: '按钮文案', type: 'text', def: '立即下单' },
      { k: 'fontSize', label: '文案字号', type: 'slider', min: 12, max: 24, step: 1, unit: 'px', def: 16 },
      { k: 'align', label: '对齐', type: 'radiobutton', def: 'center', options: [{ value: 'center', label: '居中对齐' }, { value: 'right', label: '右对齐' }] },
      { k: 'theme', label: '按钮配色', type: 'radiobutton', def: 'theme', options: [{ value: 'theme', label: '跟随店铺风格' }, { value: 'custom', label: '自定义' }] },
      { k: 'btnBg', label: '按钮颜色', type: 'color', def: '#C8102E', hint: '仅「自定义」配色时生效' },
      {
        type: 'group', label: '尺寸设置',
        fields: [
          { k: 'padX', label: '左右边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 16 },
          { k: 'padB', label: '底边距', type: 'slider', min: 0, max: 40, step: 2, unit: 'px', def: 14 },
          { k: 'btnH', label: '按钮高度', type: 'slider', min: 36, max: 72, step: 2, unit: 'px', def: 48 },
          { k: 'btnR', label: '按钮角度', type: 'slider', min: 0, max: 36, step: 2, unit: 'px', def: 4 }
        ]
      },
      {
        type: 'group', label: '背景设置',
        fields: [
          { k: 'bgOn', label: '背景', type: 'switch', def: true },
          { k: 'bg', label: '背景颜色', type: 'color', def: '#FFFFFF' },
          { k: 'bgH', label: '背景高度', type: 'slider', min: 60, max: 140, step: 2, unit: 'px', def: 76 }
        ]
      }
    ]
  },

  /* ---------- 品牌分类（对标有赞三方扩展「品牌分类E」 category-4-1） ---------- */
  /**
   * 有赞侧是开放平台三方扩展组件（`extension-cnzoom-category-4-1`），
   * 本后台按原组件「全部功能」自建实现，字段口径逐项对齐（见 .tooling/_yz-value-full.json 抓取快照）。
   *
   * 数据层级三层：左侧导航（品牌）→ 右侧内容（小组）→ 条目。
   *   - 「+ 关联商品分组」= 从商品库多选商品，自动写入「图片 / 名称 / 详情跳转」三类字段；
   *   - 「+ 自定义图文分组」= 手工加一个空条目自己填。
   *   两者产出的条目结构完全一致（有赞也是同一份数据结构）。
   */
  brand_category: {
    label: '品牌分类',
    lib: 'brand_category',
    group: 'adv',
    desc: '左侧品牌导航 + 右侧图文内容，点品牌切换内容',
    tip: '对标有赞「高级组件 · 品牌分类E」。左栏默认占 26%（375 宽下约 98px），右侧内容按 1/2/3/4 列或导航模式排布；图片按原图比例撑高，不裁不拉伸。',
    fields: [
      /* ============ 内容设置 ============ */
      {
        k: 'brands', label: '左侧导航', type: 'list', max: 11, min: 1, sortable: true, addable: true,
        item: {
          type: 'object',
          title: (v, i) => v.title || ('品牌 ' + (i + 1)),
          fields: [
            { k: 'title', label: '分组标题', type: 'text', required: true, hint: '显示在左侧导航栏的名字（有赞同口径就叫「分组标题」），例如：莱克' },
            {
              k: 'panels', label: '右侧内容', type: 'list', sortable: true, addable: true, max: 30,
              item: {
                type: 'object',
                title: (v, i) => (v.title || '第 ' + (i + 1) + ' 小组') + (v.items ? '（' + v.items.length + ' 项）' : ''),
                fields: [
                  { k: 'title', label: '小组标题', type: 'text', hint: '可不填。例如：热门推荐' },
                  linkField('标题链接'),
                  {
                    k: 'layout', label: '单图布局', type: 'radiobutton', def: '2',
                    options: [
                      { value: '1', label: '1 列' }, { value: '2', label: '2 列' },
                      { value: '3', label: '3 列' }, { value: '4', label: '4 列' },
                      { value: 'nav', label: '导航' }
                    ],
                    hint: '「导航」= 小图 + 文字横向排列，适合做型号入口'
                  },
                  {
                    k: 'items', label: '条目', type: 'list', sortable: true, addable: true, quickAdd: 'goods', max: 60,
                    item: {
                      type: 'object',
                      title: (v, i) => v.title || ('条目 ' + (i + 1)),
                      fields: [
                        { k: 'image', label: '图片', type: 'image' },
                        { k: 'title', label: '标题', type: 'text' },
                        { k: 'desc', label: '副标题', type: 'text', hint: '可不填，显示在标题下方' },
                        {
                          k: 'linkMode', label: '跳转方式', type: 'radiobutton', def: 'whole',
                          options: [{ value: 'whole', label: '整体跳转' }, { value: 'hot', label: '热区跳转' }],
                          hint: '「热区跳转」= 图片上再单独挂一层可点区域'
                        },
                        linkField()
                      ]
                    },
                    hint: '每个条目 = 图片 + 标题 + 跳转；图片按原图比例撑高（建议同组比例一致）'
                  }
                ]
              }
            }
          ]
        },
        hint: '左侧的品牌 / 分类入口，可拖拽排序（有赞上限 11 项）。每个品牌点开后编辑它右侧的内容'
      },
      { k: 'bgImage', label: '内容背景图', type: 'image', hint: '宽 750、高不限；铺在右侧内容区底部，盖在模块背景色之上' },
      { k: 'bgTopLink', label: '背景顶部链接', type: 'link', hint: '点内容区顶部的那层透明热区会跳到这里，留空则不跳' },
      { k: 'bgTopGap', label: '背景顶部间距', type: 'slider', min: 0, max: 100, step: 1, unit: 'px', def: 0 },

      /* ============ 样式设置 ============ */
      {
        type: 'group', label: '样式设置 · 布局', collapsed: true,
        fields: [
          {
            k: 'switchMode', label: '菜单切换效果', type: 'radiobutton', def: 'page',
            options: [{ value: 'page', label: '分页切换' }, { value: 'slide', label: '滑屏切换' }],
            hint: '「分页切换」= 点左侧导航直接替换右侧内容；「滑屏切换」= 左右滑动过渡'
          },
          { k: 'navWidth', label: '左侧标题宽度', type: 'slider', min: 15, max: 60, step: 1, unit: '%', def: 26, hint: '占组件总宽度的百分比。实测有赞线上为 26%（375 宽下 98px）' },
          { k: 'contentPadX', label: '内容区左右内距', type: 'slider', min: 0, max: 40, step: 1, unit: 'px', def: 0 }
        ]
      },
      {
        type: 'group', label: '样式设置 · 左侧导航', collapsed: true,
        fields: [
          {
            k: 'navStyle', label: '标题风格', type: 'radiobutton', def: 'C',
            options: [
              { value: 'A', label: '风格A' }, { value: 'B', label: '风格B' }, { value: 'C', label: '风格C' },
              { value: 'D', label: '风格D' }, { value: 'E', label: '风格E' }
            ],
            hint: '实测：A 每项都有底色块（未选浅灰 / 选中主色），比其余风格高出一截；B 只有选中项才有底色；' +
              'C = B + 跟随选中项的左侧竖条指示器；D = B + 每项底部分隔线；E = 圆角胶囊（上下各留 5px）'
          },
          { k: 'navBg', label: '左侧背景色', type: 'color', def: '#F1F1F1' },
          { k: 'navColor', label: '标题色', type: 'color', def: '#050505' },
          { k: 'navColorActive', label: '标题选中色', type: 'color', def: '#FFFFFF' },
          { k: 'navBgActive', label: '选中背景色', type: 'color', def: '#000000' },
          { k: 'navBgIdle', label: '未选背景色', type: 'color', def: '#F9F9F9', hint: '仅「风格 A」「风格 E」生效（每项都有底色块）' },
          { k: 'navBorderColor', label: '选中边框色', type: 'color', def: '', hint: '留空则不画边框（有赞线上即为空）' },
          { k: 'navBorderLine', label: '分隔线颜色', type: 'color', def: '#DDDDDD', hint: '仅「风格 D」生效' },
          { k: 'navHeight', label: '标题高度', type: 'slider', min: 28, max: 90, step: 1, unit: 'px', def: 45 },
          { k: 'navMargin', label: '标题间距', type: 'slider', min: 0, max: 30, step: 1, unit: 'px', def: 1, hint: '每一项外层的上下留白（有赞字段 title_margin，默认 1）' },
          { k: 'navBorderH', label: '选中边框高度', type: 'slider', min: 0, max: 40, step: 1, unit: 'px', def: 10, hint: '仅「标题风格 C」「标题风格 A」的指示器 / 色块高度生效' },
          { k: 'navBorderW', label: '选中边框宽度', type: 'slider', min: 1, max: 12, step: 1, unit: 'px', def: 1 },
          { k: 'navFontSize', label: '标题字号', type: 'slider', min: 10, max: 24, step: 1, unit: 'px', def: 15 },
          {
            k: 'navWeight', label: '默认粗细', type: 'select', def: '300',
            options: WEIGHT_OPTIONS
          },
          {
            k: 'navWeightActive', label: '选中粗细', type: 'select', def: '450',
            options: WEIGHT_OPTIONS
          },
          {
            k: 'navAlign', label: '对齐方式', type: 'radiobutton', def: 'center',
            options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }, { value: 'right', label: '居右' }]
          }
        ]
      },
      {
        type: 'group', label: '样式设置 · 右侧内容', collapsed: true,
        fields: [
          {
            k: 'itemShadow', label: '分类图投影', type: 'select', def: 'none',
            options: [{ value: 'normal', label: '常规' }, { value: 'none', label: '无' }]
          },
          { k: 'itemBorderColor', label: '导航模式下边框色', type: 'color', def: '', hint: '仅「单图布局 = 导航」时生效，留空不画' },
          { k: 'itemTitleColor', label: '分类标题色', type: 'color', def: '#323233', hint: '默认 #323233。置空会退化成继承父级色，预览与真机都算「未设置」' },
          { k: 'itemGapX', label: '分类图左右间距', type: 'slider', min: 0, max: 20, step: 1, unit: 'px', def: 0 },
          { k: 'itemGapY', label: '分类图下间距', type: 'slider', min: 0, max: 20, step: 1, unit: 'px', def: 5 },
          { k: 'itemRadius', label: '分类图圆角', type: 'slider', min: 0, max: 30, step: 1, unit: 'px', def: 0 },
          { k: 'itemTitleSize', label: '分类标题大小', type: 'slider', min: 10, max: 24, step: 1, unit: 'px', def: 14 },
          {
            k: 'itemTitleWeight', label: '分类标题粗细', type: 'select', def: '400',
            options: WEIGHT_OPTIONS
          },
          {
            k: 'itemTitleAlign', label: '标题对齐方式', type: 'radiobutton', def: 'center',
            options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }, { value: 'right', label: '居右' }]
          },
          { k: 'panelTitleColor', label: '小组标题色', type: 'color', def: '#323233', hint: '默认 #323233，口径同「分类标题色」' },
          { k: 'panelTitleSize', label: '小组标题大小', type: 'slider', min: 12, max: 28, step: 1, unit: 'px', def: 16 },
          {
            k: 'panelTitleWeight', label: '小组标题粗细', type: 'select', def: '700',
            options: WEIGHT_OPTIONS
          },
          {
            k: 'panelTitleAlign', label: '小组标题对齐方式', type: 'radiobutton', def: 'left',
            options: [{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }, { value: 'right', label: '居右' }]
          },
          { k: 'panelTitleGapX', label: '小组标题侧间距', type: 'slider', min: 0, max: 30, step: 1, unit: 'px', def: 0 },
          { k: 'panelTitleGapY', label: '小组标题下间距', type: 'slider', min: 0, max: 30, step: 1, unit: 'px', def: 0 },
          { k: 'panelGap', label: '分类小组下间距', type: 'slider', min: 0, max: 40, step: 1, unit: 'px', def: 13 },
          { k: 'contentPadBottom', label: '内容区底部内距', type: 'slider', min: 0, max: 80, step: 1, unit: 'px', def: 0 },
          {
            k: 'effect', label: '分类图缓动效果', type: 'radiobutton', def: 'none',
            options: [
              { value: 'right', label: '右入' }, { value: 'up', label: '上滑' },
              { value: 'zoom', label: '放大' }, { value: 'fade', label: '淡入' },
              { value: 'none', label: '关闭' }
            ]
          },
          { k: 'effectSpeed', label: '缓动效果速度', type: 'slider', min: 0.2, max: 3, step: 0.1, unit: 's', def: 1 },
          { k: 'effectDelay', label: '缓动间隔时长', type: 'slider', min: 0, max: 1, step: 0.05, unit: 's', def: 0.2, hint: '每个条目依次出场的间隔' }
        ]
      },

      /* ============ 扩展设置 ============ */
      {
        type: 'group', label: '扩展设置', collapsed: true,
        fields: [
          { k: 'navLogo', label: '左侧导航顶部 Logo', type: 'image' },
          linkField('Logo 跳转'),
          {
            k: 'searchMode', label: '搜索框设置', type: 'radiobutton', def: 'hide',
            options: [{ value: 'hide', label: '不显示' }, { value: 'show', label: '显示' }],
            hint: '显示时在左栏 Logo 下方进入商品搜索页'
          },
          { k: 'bg', label: '模块背景色', type: 'color', def: '#FFFFFF' },
          { k: 'moduleBgImage', label: '模块背景图片', type: 'image', hint: '宽 750、高不限' },
          {
            k: 'moduleBgFill', label: '模块背景图片填充', type: 'radiobutton', def: 'cover',
            options: [{ value: 'cover', label: '填充' }, { value: 'contain', label: '适应' }, { value: 'repeat', label: '平铺' }]
          },
          { k: 'reserveTabbar', label: '预留底部导航位置', type: 'switch', def: false, hint: '开启后底部留出 tabBar 高度的空白' },
          {
            k: 'navSticky', label: '左侧栏目定位', type: 'radiobutton', def: 'off',
            options: [{ value: 'off', label: '关闭' }, { value: 'top', label: '吸顶' }]
          }
        ]
      }
    ]
  }
};

/* ==================== 有赞其余组件：面板字段合并进区块类型 ==================== */

/**
 * 2026-10-10：把有赞「基础组件 55 + 高级组件 2」里尚未接入的 **37 个**按实测面板补齐
 * （字段定义在 `./yzPanels.js`，来源与口径见该文件头注释）。
 *
 * 至此组件库的 **57 项每一项都有对应区块类型**——点一下就能加到页面、能改属性、能在预览里看到，
 * 与有赞「全部组件都可配置」保持一致。
 * 小程序端能真跑的用真数据（商品分组 / 店铺热搜 / 店铺榜单 等），
 * 缺业务底座的按 `dep` 忠实占位渲染并在真机上标注依赖，不做「假装可用」。
 */
const { PANELS: YZ_PANELS } = require('./yzPanels');

/** 新区块类型用哪个图标（不在表里的回落 cube） */
const KIND_LIB = {
  custom_module: 'cube', fans: 'fans', goods_group: 'goods', game_category: 'cube',
  point_order: 'service', shelf_asset: 'shop', nearby_store: 'shop', order_pool: 'groupbuy',
  on_way_order: 'shop', coupon: 'coupon', limit_discount: 'discount', seckill: 'discount',
  bargain: 'discount', new_zone: 'coupon', groupon: 'groupbuy', reward_points: 'coupon',
  member_goods: 'goods', member_value: 'coupon', join_member: 'shop', point_asset: 'coupon',
  wx_live: 'video', wxvideo_live: 'video', guang_live: 'video',
  goods_recommend_adv: 'recommend', crowd_image: 'image_ad', hot_words: 'search',
  shop_rank: 'anchor', points_goods: 'goods', member_card: 'shop', shop_banner_card: 'shop',
  course: 'content_card', paid_column: 'content_card', paid_content: 'content_card',
  content_live: 'content_card', paid_member: 'content_card', punch: 'content_card',
  personal_nav: 'nav'
};

/** 「组件名 → 区块 kind」：由它把有赞清单里的 ok:0 一次性转成可用 */
const KIND_OF_NAME = {
  自定义模块: 'custom_module', 涨粉: 'fans', 商品分组: 'goods_group', 游戏分类: 'game_category',
  点单卡片: 'point_order', 客户资产: 'shelf_asset', 附近门店: 'nearby_store', 好友拼单: 'order_pool',
  在途订单: 'on_way_order', 优惠券: 'coupon', 限时折扣: 'limit_discount', 秒杀: 'seckill',
  砍价: 'bargain', 新人专区: 'new_zone', 拼团: 'groupon', 集点卡: 'reward_points',
  会员专享价: 'member_goods', 会员储值: 'member_value', 办会员: 'join_member', 积分资产: 'point_asset',
  小程序直播: 'wx_live', 视频号直播: 'wxvideo_live', 爱逛直播: 'guang_live',
  人群运营: 'goods_recommend_adv', 人群图片: 'crowd_image', 店铺热搜: 'hot_words',
  店铺榜单: 'shop_rank', 积分兑换商品: 'points_goods', 会员卡片: 'member_card',
  店招信息: 'shop_banner_card', 课程: 'course', 知识专栏: 'paid_column', 知识内容: 'paid_content',
  知识直播: 'content_live', 知识付费会员: 'paid_member', 群打卡: 'punch', 个性导航: 'personal_nav'
};

/**
 * 依赖说明取一个「短语」，供区块数据携带、真机原样显示。
 * 完整说明（可能两三百字）留在属性面板的提示里，避免真机上出现一整段小字。
 */
function depTagOf(dep) {
  var s = String(dep || '').split(/[：:，,（(。；;]/)[0].trim();
  return s.length > 16 ? s.slice(0, 16) : s;
}

Object.keys(YZ_PANELS).forEach(function (k) {
  HOME_BLOCK_KINDS[k] = {
    label: YZ_PANELS[k].label,
    lib: KIND_LIB[k] || 'cube',
    group: 'basic',
    desc: YZ_PANELS[k].desc,
    dep: YZ_PANELS[k].dep || '',
    depTag: depTagOf(YZ_PANELS[k].dep),
    yz: true,
    fields: YZ_PANELS[k].fields
  };
});

/* ============================ 组件库（对标有赞左侧组件库） ============================ */

/**
 * 有赞「基础组件」全量清单。
 *
 * 数据来源：2026-10-08 用真实浏览器打开店铺装修编辑器
 * （store.youzan.com/v4/deco/decorate#/edit/142448593）逐个点击组件后抓取，
 * 见 `.tooling/yz-extract.mjs` 与 `.tooling/_yz-panels.json`：
 *   - 基础组件 tab 实测 54 个，分 10 组（本常量即该分组）
 *   - 每项 `type` 是有赞侧真实的组件类型标识（data-type），用于跨平台对账
 *   - 每项 `ok` 表示本后台是否已接入；未接入的必须带 `why` 说明原因，不能假装可用
 *   - 每项 `kind` 指向 HOME_BLOCK_KINDS 里的区块类型
 */
const YZ_BASIC_GROUPS = [
  {
    name: '页面装修',
    items: [
      { n: '标题文本', type: 'title_text,title,text', ok: 1, kind: 'title' },
      { n: '富文本', type: 'rich_text_weapp,rich_text', ok: 1, kind: 'rich_text' },
      { n: '辅助分割', type: 'white,line,white_line', ok: 1, kind: 'line' },
      { n: '图片广告', type: 'new_image_ad', ok: 1, kind: 'swiper' },
      { n: '热区切图', type: 'image_ad_hot_area', ok: 1, kind: 'hotspot' },
      { n: '魔方', type: 'cube_v3', ok: 1, kind: 'cube' },
      { n: '商品搜索', type: 'search', ok: 1, kind: 'search' },
      { n: '图文导航', type: 'image_text_nav', ok: 1, kind: 'nav' },
      { n: '电梯导航', type: 'elevator_navigation', ok: 1, kind: 'elevator' },
      { n: '视频', type: 'video', ok: 1, kind: 'video' },
      { n: '店铺信息', type: 'shop_banner_weapp,offline_shop_info', ok: 1, kind: 'shop' },
      { n: '进入店铺', type: 'store', ok: 1, kind: 'enter_shop' },
      { n: '公告', type: 'notice_weapp,notice', ok: 1, kind: 'notice' },
      { n: '语音', type: 'audio', ok: 1, kind: 'audio' },
      { n: '自定义模块', type: 'component', ok: 0, why: '有赞侧是「跨页复用的自定义模块」；本后台用「新建自定义页 + 区块流」实现同一目的，不再单列组件' },
      { n: '涨粉', type: 'social_fans,official_account', ok: 0, why: '依赖公众号 / 微信客服等平台能力，自建小程序无对应数据源' },
      { n: '内容卡片', type: 'note_card', ok: 1, kind: 'content_card' },
      { n: '在线客服', type: 'contact_us', ok: 1, kind: 'service' }
    ]
  },
  {
    name: '商品',
    items: [
      { n: '商品', type: 'goods_weapp,goods,goods_new', ok: 1, kind: 'goods' },
      { n: '商品分组', type: 'tag_list_top,tag_list_left,goods_group,goods_group_new', ok: 0, why: '需要「商品分组」这一数据维度，本后台商品库暂无分组字段' },
      // 2026-10-10 有赞实测「基础组件」tab 共 55 个，比首轮抓取（54）多这一个，
      // 位置在「商品分组」之后、「购买按钮」之前；type 一栏未取到真实值，按有赞命名惯例推测，仅作对照注释。
      { n: '游戏分类', type: 'game_category', ok: 0, why: '有赞零售「游戏化分类」组件，依赖有赞营销游戏（抽奖 / 大转盘等）业务，自建商城无对应能力' },
      { n: '购买按钮', type: 'buy_button', ok: 1, kind: 'buy_bar' }
    ]
  },
  {
    name: '新零售',
    items: [
      { n: '点单卡片', type: 'shelf_order', ok: 0, why: '有赞零售「货架」体系组件，自建商城无货架 / 点单业务' },
      { n: '客户资产', type: 'shelf_asset', ok: 0, why: '依赖有赞会员资产（积分 / 余额 / 集点卡）数据' },
      { n: '附近门店', type: 'shelf_nearby_store', ok: 0, why: '依赖门店档案与地理位置服务' },
      { n: '好友拼单', type: 'shelf_order_pool', ok: 0, why: '依赖有赞拼单业务链路' },
      { n: '在途订单', type: 'on_way_order', ok: 0, why: '依赖有赞订单中台实时状态' }
    ]
  },
  {
    name: '营销活动',
    items: [
      { n: '优惠券', type: 'coupon_weapp,coupon', ok: 0, why: '本后台已有券模板（catalog.json），但小程序端领券链路未开发，故暂不接入' },
      { n: '限时折扣', type: 'ump_limitdiscount', ok: 0, why: '依赖有赞营销中台的折扣活动数据' },
      { n: '秒杀', type: 'ump_seckill', ok: 0, why: '依赖有赞营销中台的秒杀场次与库存' },
      { n: '砍价', type: 'bargain', ok: 0, why: '依赖有赞砍价活动的社交链路' },
      { n: '新人专区', type: 'new_zone', ok: 0, why: '依赖有赞新客标签与新人券池' },
      { n: '拼团', type: 'groupon_weapp,groupon', ok: 0, why: '依赖有赞拼团活动的成团逻辑' },
      { n: '集点卡', type: 'reward_points', ok: 0, why: '依赖有赞集点卡会员权益体系' }
    ]
  },
  {
    name: '会员',
    items: [
      { n: '会员专享价', type: 'member_goods', ok: 0, why: '依赖有赞会员等级与专享价体系' },
      { n: '会员储值', type: 'member_value', ok: 0, why: '依赖有赞储值 / 礼品卡资金账户' },
      { n: '办会员', type: 'registration_guide', ok: 0, why: '依赖有赞会员卡开卡链路' },
      { n: '积分资产', type: 'point_asset', ok: 0, why: '依赖有赞积分账户' }
    ]
  },
  {
    name: '直播',
    items: [
      { n: '小程序直播', type: 'weapp_live', ok: 0, why: '依赖微信小程序直播组件与直播间 ID' },
      { n: '视频号直播', type: 'wxvideo_live', ok: 0, why: '依赖视频号预约 / 直播间绑定' },
      { n: '爱逛直播', type: 'guang_live', ok: 0, why: '依赖爱逛（第三方直播平台）账号' }
    ]
  },
  {
    name: '智能运营',
    items: [
      { n: '个性化推荐', type: 'goods_recommend', ok: 1, kind: 'goods' },
      { n: '人群运营', type: 'oriented_poster', ok: 0, why: '依赖有赞人群包定向能力' },
      { n: '人群图片', type: 'crowds_image_ad', ok: 0, why: '依赖有赞人群包定向能力' },
      { n: '店铺热搜', type: 'hot_words_reference', ok: 0, why: '依赖有赞搜索中台的热词数据' },
      { n: '店铺榜单', type: 'shop_ranking_list', ok: 0, why: '依赖有赞榜单计算结果' }
    ]
  },
  {
    name: '教育',
    items: [
      { n: '课程', type: 'knowledge-goods,edu-goods-group', ok: 0, why: '教育行业专属，莱克商城无此业务' },
      { n: '知识专栏', type: 'paid_column', ok: 0, why: '教育行业专属' },
      { n: '知识内容', type: 'paid_content', ok: 0, why: '教育行业专属' },
      { n: '知识直播', type: 'paid_live', ok: 0, why: '教育行业专属' },
      { n: '知识付费会员', type: 'paid_member', ok: 0, why: '教育行业专属' },
      { n: '群打卡', type: 'punch', ok: 0, why: '教育行业专属' }
    ]
  },
  {
    name: '积分',
    items: [{ n: '积分兑换商品', type: 'points_goods', ok: 0, why: '依赖有赞积分账户与兑换链路' }]
  },
  {
    name: '其他',
    items: [
      { n: '会员卡片', type: 'shelf_member', ok: 0, why: '依赖有赞会员体系' },
      { n: '店招信息', type: 'shelf_banner', ok: 0, why: '与「店铺信息」重复，本后台用店铺信息组件承载（含背景图与 Logo 背景色）' }
    ]
  }
];

/** 基础组件扁平清单（供 componentLib().basic 下发，兼容按数组遍历的前端） */
const YZ_BASIC = [].concat(...YZ_BASIC_GROUPS.map((g) => g.items.map((it) => Object.assign({ group: g.name }, it))));

/**
 * 有赞「高级组件」tab。
 *
 * 实测该 tab 是**店铺侧扩展组件**（装了哪些插件就显示哪些），本店铺只有 2 个：
 * 「个性导航」「品牌分类E」。「品牌分类E」已按原组件全部功能自建实现（见 HOME_BLOCK_KINDS.brand_category），
 * 「个性导航」仍依赖有赞开放平台运行时，标为未接入。
 */
const YZ_ADV = [
  { n: '个性导航', type: 'extension-cnzoom-person-nav', ok: 0, why: '有赞开放平台三方扩展组件，依赖有赞开放平台运行时；本后台的底部导航走「全局配置 · 店铺导航」实现' },
  { n: '品牌分类E', type: 'extension-cnzoom-category-4-1', ok: 1, kind: 'brand_category' }
];

/**
 * 2026-10-10：把清单里所有已补齐面板的项一次性转成「已接入」（要放在 YZ_BASIC / YZ_ADV 之后）。
 * 依据是 `KIND_OF_NAME`；先校验它指向的区块类型都真实存在，避免「清单说能用、实际没有类型」。
 */
(function convertUnconnected() {
  Object.keys(KIND_OF_NAME).forEach(function (n) {
    if (!HOME_BLOCK_KINDS[KIND_OF_NAME[n]]) {
      throw new Error('KIND_OF_NAME 指向了不存在的区块类型：' + n + ' → ' + KIND_OF_NAME[n]);
    }
  });
  /*
   * ⚠️ 必须连 YZ_BASIC 一起改：它是 YZ_BASIC_GROUPS 的**浅拷贝副本**
   *   （`Object.assign({}, it)` 复制了属性值），只改原始项的话，
   *   `componentLib().groups` 是新状态、`componentLib().basic` 还是旧状态，
   *   前端两个 tab 会显示不一样的结果 —— 这个坑踩过一次。
   */
  [].concat(...YZ_BASIC_GROUPS.map((g) => g.items)).concat(YZ_ADV).concat(YZ_BASIC).forEach(function (it) {
    var k = KIND_OF_NAME[it.n];
    if (!k) return;
    it.ok = 1;
    it.kind = k;
    it.dep = depTagOf(YZ_PANELS[k] && YZ_PANELS[k].dep);
    delete it.why;
  });
})();

/* ============================ 个人中心页（「我的」）专属区块 ============================ */

/**
 * 「我的」页的区块类型表 = 首页那 57 种 + 个人中心新增 9 种（5 个专属 + 4 个补缺）。
 *
 * 为什么要合成一张新表而不是直接往 HOME_BLOCK_KINDS 里塞：
 *   `HOME_BLOCK_KINDS` 同时是「首页 / 自定义页」的组件清单，
 *   把「标题栏 / 个人信息 / 我的订单」这些个人中心专属区块放进去，
 *   首页的组件库里就会冒出一堆跟首页无关的东西。两张表各自干净。
 *
 * 4 个补缺组件（文本 / 关联链接 / 辅助空白 / 关注公众号）也归到这张表：
 *   它们是有赞「个人中心」组件库独有、首页那 55 个里没有的组件（实测确认）。
 */
const MINE_BLOCK_KINDS = Object.assign({}, HOME_BLOCK_KINDS, UC_KINDS);

/**
 * 个人中心组件库放行的 kind 清单（25 个）。
 * 「我的」页只开放这 25 个 —— **不外泄首页那 57 种**：
 * 有赞个人中心的「添加组件」实测就是另一份独立清单（基础 7 / 营销 2 / 其他 11），
 * 把首页组件混进来会让运营以为「个人中心能放电梯导航 / 品牌分类」。
 */
const MINE_LIB_KINDS = [];
UC_LIB_GROUPS.forEach((g) => {
  g.items.forEach((it) => { if (MINE_LIB_KINDS.indexOf(it.kind) < 0) MINE_LIB_KINDS.push(it.kind); });
});

/** 个人中心组件库的 kind 元信息（与 componentLib().kinds 同构，供装修台卡片/图标使用） */
function mineLibKinds() {
  return MINE_LIB_KINDS.map((k) => {
    const d = MINE_BLOCK_KINDS[k] || {};
    return {
      kind: k, label: d.label, lib: d.lib,
      icon: ICONS[d.lib] || ICONS.image_ad,
      desc: d.desc, dep: d.dep || '', depTag: d.depTag || '',
      group: d.group || 'uc'
    };
  });
}

/**
 * 个人中心组件库（分组结构与有赞「添加组件」一致，另加一组「专属区块」，见 yzUserCenter.js）
 *
 * ⚠️ 有赞个人中心**只有「添加组件」一个入口**（不像首页装修分常用/基础/高级），
 *    那 3 组是列表内的标题而不是 tab —— 所以这里用**一个 tab 承载同一份分组结构**
 *    （tabs 里用 `grouped: true` 声明「本 tab 按 groups 渲染」，装修台据此分流）。
 */
function mineComponentLib() {
  const total = UC_LIB_GROUPS.reduce((n, g) => n + g.items.length, 0);
  return {
    tabs: [{
      key: 'uc', name: '个人中心组件', count: total, grouped: true,
      desc: '对标有赞「个人中心装修 · 添加组件」实测 20 个（基础 7 / 营销 2 / 其他 11）；' +
        '另加一组「专属区块」用于恢复被删的系统区块'
    }],
    groups: UC_LIB_GROUPS.map((g) => ({
      name: g.name,
      count: g.items.length,
      items: g.items.map((it) => ({
        n: it.n, ok: 1, kind: it.kind, group: g.name, max: UC_MAX[it.n] || 0,
        dep: depTagOf((MINE_BLOCK_KINDS[it.kind] || {}).dep || '')
      }))
    })),
    kinds: mineLibKinds(),
    icons: ICONS,
    total
  };
}

/**
 * 页面级组件库：只有「页面自己声明了 lib」的页面才有（目前只有「我的」= 个人中心）。
 * 约定：**一个页面要么用全局组件库、要么用页面自己的，不做合并** ——
 * 合并会让「个人中心里冒出首页专属组件」，正是这次要避免的事。
 */
function pageLibs() {
  const out = {};
  allPages().forEach((p) => { if (p && p.lib) out[p.key] = JSON.parse(JSON.stringify(p.lib)); });
  return out;
}

/**
 * 「我的」页「页面区块」列表只认识这 25 种 —— 与组件库严格一致。
 * （区块树里的「+ 新增」会弹这个清单；若放开成 66 种，就会出现「能加但组件库里找不到」的错乱。）
 */
const MINE_UNION_KINDS = MINE_LIB_KINDS.reduce((m, k) => { m[k] = MINE_BLOCK_KINDS[k]; return m; }, {});

/**
 * 「我的」页的区块字段节点 —— 与首页的同构（list + union），
 * 只是 kinds 换成个人中心放行的那 25 种，所以装修台的属性面板 / 区块树 / 预览全部可直接复用。
 */
const MINE_BLOCKS_NODE = {
  k: 'blocks', label: '页面区块', type: 'list',
  item: { type: 'union', kindField: 'type', kinds: MINE_UNION_KINDS },
  title: (v, i) => {
    const label = MINE_BLOCK_KINDS[v.type] ? MINE_BLOCK_KINDS[v.type].label : '未知区块';
    if (!v.height) return label;
    const unit = ['swiper', 'video', 'line', 'hotspot'].indexOf(v.type) >= 0 ? 'rpx' : 'px';
    return label + ' · ' + v.height + unit;
  },
  sortable: true, addable: true
};

/**
 * 「我的」页的初始区块。
 *
 * replica 里没有 MINE_BLOCKS 时用它（首次发布前 / 回滚到旧快照）。
 * 每次都返回**深拷贝**：调用方（装修台）会就地改这份数据，
 * 直接返回常量会让下一次 from() 拿到被改过的值。
 */
function cloneDefaultMineBlocks(existing) {
  const src = Array.isArray(existing) ? existing : UC_DEFAULT_BLOCKS;
  return JSON.parse(JSON.stringify(src)).map(upgradeBlock);
}

/** 默认常用组件（对标有赞「常用组件」tab，用户可自行增删，存 localStorage） */
const YZ_COMMON = ['title', 'line', 'swiper', 'video', 'notice', 'nav', 'cube', 'hotspot', 'goods', 'shop'];

/** 有赞该店铺「常用组件」实测清单（14 个），仅作对照说明，不参与前端渲染 */
const YZ_COMMON_ACTUAL = ['标题文本', '辅助分割', '图片广告', '视频', '涨粉', '商品', '优惠券', '限时折扣', '拼团', '个性化推荐', '商品搜索', '积分兑换商品', '办会员', '在线客服'];

/**
 * 每个组件在**单个页面**里的数量上限。
 * 2026-10-10 从有赞「基础组件 / 高级组件」卡片第二行「已用 / 上限」逐个实测抄录，
 * 前端据此在卡片上显示同样的计数并在达到上限时拦截，别凭印象改这几个数。
 * 与有赞实测值不一致的地方（有赞 55 个基础组件，本清单同名同值）以实测为准。
 */
const YZ_MAX = {
  标题文本: 50, 富文本: 200, 辅助分割: 50, 图片广告: 500, 热区切图: 300, 魔方: 200,
  商品搜索: 2, 图文导航: 10, 电梯导航: 1, 视频: 50, 店铺信息: 50, 进入店铺: 1,
  公告: 20, 语音: 50, 自定义模块: 5, 涨粉: 20, 内容卡片: 20, 在线客服: 1,
  商品: 100, 商品分组: 100, 游戏分类: 100, 购买按钮: 1,
  点单卡片: 1, 客户资产: 1, 附近门店: 1, 好友拼单: 5, 在途订单: 1,
  优惠券: 50, 限时折扣: 50, 秒杀: 50, 砍价: 50, 新人专区: 3, 拼团: 50, 集点卡: 1,
  会员专享价: 5, 会员储值: 5, 办会员: 1, 积分资产: 1,
  小程序直播: 20, 视频号直播: 5, 爱逛直播: 20,
  个性化推荐: 1, 人群运营: 1, 人群图片: 1, 店铺热搜: 1, 店铺榜单: 1,
  课程: 20, 知识专栏: 20, 知识内容: 20, 知识直播: 20, 知识付费会员: 20, 群打卡: 10,
  积分兑换商品: 50, 会员卡片: 1, 店招信息: 1,
  个性导航: 20, 品牌分类E: 20
};

/** 组件库全景（随 /api/decorate/pages 一起下发给前端） */
function componentLib() {
  return {
    tabs: [
      { key: 'common', name: '常用组件', count: YZ_COMMON.length, desc: '默认展示的组件，可点「添加常用组件」自行增减' },
      { key: 'basic', name: '基础组件', count: YZ_BASIC.length, grouped: true, desc: '对标有赞基础组件全量清单（10 组 / ' + YZ_BASIC.length + ' 个）' },
      { key: 'adv', name: '高级组件', count: YZ_ADV.length, desc: '店铺侧扩展组件（有赞里装了什么就有什么）；已接入的可直接添加' }
    ],
    /** 基础组件的真实分组（装修台左侧按分组显示，与有赞一致） */
    groups: YZ_BASIC_GROUPS.map((g) => ({
      name: g.name,
      count: g.items.length,
      items: g.items.map((it) => Object.assign({}, it, { max: YZ_MAX[it.n] || 0 }))
    })),
    /** 已接入、真正可用的组件（点一下就能加到页面）；`dep` 非空表示真机要标注依赖 */
    kinds: Object.keys(HOME_BLOCK_KINDS).map((k) => ({
      kind: k,
      label: HOME_BLOCK_KINDS[k].label,
      lib: HOME_BLOCK_KINDS[k].lib,
      icon: ICONS[HOME_BLOCK_KINDS[k].lib] || ICONS.image_ad,
      desc: HOME_BLOCK_KINDS[k].desc,
      dep: HOME_BLOCK_KINDS[k].dep || '',
      depTag: HOME_BLOCK_KINDS[k].depTag || '',
      group: HOME_BLOCK_KINDS[k].group || 'basic'
    })),
    icons: ICONS,
    common: YZ_COMMON,
    commonActual: YZ_COMMON_ACTUAL,
    basic: YZ_BASIC.map((it) => Object.assign({}, it, { max: YZ_MAX[it.n] || 0 })),
    adv: YZ_ADV.map((it) => Object.assign({}, it, { max: YZ_MAX[it.n] || 0 }))
  };
}

/* ============================ 店铺信息（首页 / 我的 共用） ============================ */

const SHOP_FIELDS = [
  { k: 'name', label: '店铺名称', type: 'text' },
  { k: 'avatar', label: '店铺头像', type: 'image' },
  { k: 'slogan', label: '店铺标语', type: 'text' }
];

const SHOP_NODE = {
  k: 'shop', label: '店铺信息', type: 'object', shared: true,
  hint: '店铺信息为全局共用：修改后「首页」与「我的」两个页面同时生效',
  fields: SHOP_FIELDS
};

/* ============================ 页面级设置（写回 replica.PAGE_META） ============================ */

const PAGE_META_FIELDS = [
  { k: 'desc', label: '页面描述', type: 'text', hint: '用于列表页展示与备注，不影响前台渲染' },
  { k: 'bg', label: '页面背景颜色', type: 'color', def: '#F5F6F8', hint: '小程序端读取该值作为页面底色' }
];

/**
 * 各页面级设置的默认值。
 *
 * PAGE_META 是「跨页聚合」字段：replica.js 里一份 PAGE_META 承载全部 5 个页面。
 * 因此只要有任何一页被发布，重组时就必须补齐所有页面的条目，
 * 否则某页 meta 缺失（例如回滚到旧快照，而旧快照里还没有该字段）时，
 * 该页面会整体从 replica.js 的 PAGE_META 中消失，前端读不到页面底色。
 */
const PAGE_META_DEFS = {
  home: { desc: '新版首页！！', bg: '#F5F6F8' },
  lexy: { desc: '7 大系列', bg: '#FFFFFF' },
  news: { desc: '了解莱克', bg: '#F0F0F0' },
  product: { desc: '全品牌产品库', bg: '#FFFFFF' },
  mine: { desc: '个人中心', bg: '#FFFFFF' }
};

/** 取某页面级设置的默认值（深拷贝，调用方可安全改写） */
function pageMetaDefault(key) {
  const d = PAGE_META_DEFS[key];
  return d ? JSON.parse(JSON.stringify(d)) : undefined;
}

/**
 * 把某页面的 meta 合并进 out.PAGE_META。
 * 缺值时回落到该页默认值，绝不写入 undefined（写入 undefined 等于删键）。
 */
function setPageMeta(out, key, meta) {
  const v = (meta === undefined || meta === null || typeof meta !== 'object')
    ? pageMetaDefault(key)
    : meta;
  if (v === undefined) return;
  out.PAGE_META = Object.assign({}, out.PAGE_META, { [key]: v });
}

/* ============================ 首页区块字段（首页与自定义页面共用） ============================ */

/**
 * 「页面区块」字段定义。
 *
 * 高度单位随区块类型不同：轮播 / 视频 / 辅助分割 / 热区存 rpx（750 宽基准），
 * 其余（单图占位）存 375 基准 px。见 miniprogram/utils/blocks.js 的 heightRpx 用法。
 *
 * 装修台「新建页面」建出来的自定义页面用的是同一套区块类型，
 * 所以这里抽成常量给两处共用：以后新增区块类型时只需改这里，不会漏。
 */
const HOME_BLOCKS_NODE = {
  k: 'blocks', label: '页面区块', type: 'list',
  item: { type: 'union', kindField: 'type', kinds: HOME_BLOCK_KINDS },
  title: (v, i) => {
    const label = HOME_BLOCK_KINDS[v.type] ? HOME_BLOCK_KINDS[v.type].label : '未知区块';
    if (!v.height) return label;
    const unit = ['swiper', 'video', 'line', 'hotspot'].indexOf(v.type) >= 0 ? 'rpx' : 'px';
    return label + ' · ' + v.height + unit;
  },
  sortable: true, addable: true
};

/* ============================ 店铺导航（底部 tabBar，全局配置） ============================ */

/**
 * 小程序底部导航（tabBar）配置 —— 对标有赞「店铺导航」的底部导航面板。
 *
 * ⚠️ 微信硬限制（决定了这个功能的能力边界，必须写清楚，避免运营以为能随便加页面）：
 *   tabBar 的页面必须**静态写死在 app.json 的 tabBar.list 里**（2~5 项），
 *   运行时只能 wx.switchTab 打开这 5 个页面，且不支持带参数。
 *   因此「店铺导航」能改的是 —— **文案 / 图标 / 顺序 / 显示哪几个 / 配色**，
 *   不能把一个 app.json 没声明的页面（如自定义页）塞进底部导航。
 *   候选页面因此固定为下面这 5 个。
 *
 * 项目实现方式：app.json 的 tabBar 开 `custom: true` + 新增 custom-tab-bar 组件，
 * 组件从 replica.TABBAR 读配置渲染，于是「改导航」不再需要动代码、重新提审。
 */
const TABBAR_PAGES = [
  { path: '/pages/index/index', name: '首页' },
  { path: '/pages/lexy/lexy', name: '莱克' },
  { path: '/pages/news/news', name: '资讯' },
  { path: '/pages/product/product', name: '产品' },
  { path: '/pages/mine/mine', name: '我的' }
];

/** 「跳转页面」下拉选项（value 用页面路径，与 replica 里存的一致） */
const TABBAR_PAGE_OPTIONS = TABBAR_PAGES.map((p) => ({ value: p.path, label: p.name }));

const TABBAR_MIN = 2;      // 微信要求 tabBar 至少 2 项
const TABBAR_MAX = 5;      // 微信要求 tabBar 最多 5 项
const TABBAR_TEXT_MAX = 5; // 导航文字最多 5 个字（与有赞一致）

/** 全局默认配色与图标显示策略 */
const TABBAR_DEFAULTS = {
  color: '#8A8A8A',         // 未选中文字/图标色
  selectedColor: '#C8102E', // 选中色（LEXY 品牌红）
  background: '#FFFFFF',    // 导航栏背景色
  borderColor: '#EEEEEE',   // 顶部分割线
  iconMode: 'always'        // always 图标+文字 / active 仅选中显示图标 / never 纯文字
};

/** 默认 5 个导航项 = 当前 app.json 里的样子（纯文字、按内置顺序） */
const TABBAR_DEFAULT_ITEMS = TABBAR_PAGES.map((p) => ({
  path: p.path, text: p.name, icon: '', activeIcon: ''
}));

const TABBAR_ICON_MODES = ['always', 'active', 'never'];
const TABBAR_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** 默认整份导航配置（深拷贝，调用方可安全改写） */
function tabbarDefault() {
  return Object.assign({}, TABBAR_DEFAULTS, { items: clone(TABBAR_DEFAULT_ITEMS) });
}

/** 页面路径 → 中文名（装修台列表项标题用） */
function tabbarPageName(path) {
  const hit = TABBAR_PAGES.filter((p) => p.path === path)[0];
  return hit ? hit.name : String(path || '未选择');
}

/** 归一化色值：非法值回落默认，绝不把 undefined / 脏值写进 replica.js */
function tabbarColor(v, def) {
  const s = typeof v === 'string' ? v.trim() : '';
  return TABBAR_HEX_RE.test(s) ? s.toUpperCase() : def;
}

/** 归一化一个导航项 */
function tabbarItem(it) {
  const o = (it && typeof it === 'object') ? it : {};
  const path = TABBAR_PAGES.some((p) => p.path === o.path) ? o.path : TABBAR_PAGES[0].path;
  const raw = o.text === undefined || o.text === null ? '' : String(o.text);
  /*
   * 先 trim 再截断 —— 反过来写的话，粘贴进来的前导空格会**吃掉字数配额**
   * （'   首页卡片' 会截成 '首页'）。末尾再 trim 一次是为了幂等：
   * 截断结果可能以空格结尾，不收敛的话第二次归一化结果又会变。
   * 「trim → slice → trim」在 schema / 小程序组件 / pv-tabbar 三处必须字面一致。
   */
  const text = raw.trim().slice(0, TABBAR_TEXT_MAX).trim();
  return {
    path,
    text: text || tabbarPageName(path),
    icon: typeof o.icon === 'string' ? o.icon : '',
    activeIcon: typeof o.activeIcon === 'string' ? o.activeIcon : ''
  };
}

/**
 * 归一化整份导航配置。
 *
 * 幂等 —— 新老数据跑一遍结果一致（发布链路的「无损校验」依赖这一点）。
 * 处理三件事：字段缺省回落默认、导航项去重（同一页面只能出现一次，
 * 否则底部会有两处同时高亮）、项数收敛到微信要求的 2~5。
 */
function normalizeTabbar(v) {
  const src = (v && typeof v === 'object') ? v : {};

  let items = (Array.isArray(src.items) && src.items.length ? src.items : TABBAR_DEFAULT_ITEMS).map(tabbarItem);

  // 去重：同一个页面在导航栏里只保留第一次出现的位置
  const seen = {};
  items = items.filter((it) => {
    if (seen[it.path]) return false;
    seen[it.path] = true;
    return true;
  });

  if (items.length > TABBAR_MAX) items = items.slice(0, TABBAR_MAX);
  while (items.length < TABBAR_MIN) {
    const used = items.map((x) => x.path);
    const free = TABBAR_PAGES.filter((p) => used.indexOf(p.path) < 0)[0] || TABBAR_PAGES[0];
    items.push({ path: free.path, text: free.name, icon: '', activeIcon: '' });
  }

  const mode = TABBAR_ICON_MODES.indexOf(src.iconMode) >= 0 ? src.iconMode : TABBAR_DEFAULTS.iconMode;

  return {
    color: tabbarColor(src.color, TABBAR_DEFAULTS.color),
    selectedColor: tabbarColor(src.selectedColor, TABBAR_DEFAULTS.selectedColor),
    background: tabbarColor(src.background, TABBAR_DEFAULTS.background),
    borderColor: tabbarColor(src.borderColor, TABBAR_DEFAULTS.borderColor),
    iconMode: mode,
    items
  };
}

/** 店铺导航的字段声明（装修台表单由此自动推导） */
const TABBAR_NODE = {
  k: 'tabbar', label: '底部导航', type: 'object',
  fields: [
    {
      k: 'iconMode', label: '图标样式', type: 'radiobutton', def: 'always',
      options: [
        { value: 'always', label: '图标+文字' },
        { value: 'active', label: '仅选中显示图标' },
        { value: 'never', label: '纯文字' }
      ],
      hint: '对标有赞「标准版：仅选中时展示图标」'
    },
    {
      k: 'items', label: '导航项', type: 'list', max: TABBAR_MAX, sortable: true, addable: true,
      item: {
        type: 'object',
        title: (v) => (v.text || '未命名') + ' → ' + tabbarPageName(v.path),
        fields: [
          { k: 'text', label: '导航名称', type: 'text', hint: '最多 ' + TABBAR_TEXT_MAX + ' 个字（超出自动截断）' },
          { k: 'path', label: '跳转页面', type: 'select', options: TABBAR_PAGE_OPTIONS, hint: '只能选小程序底部导航自带的 5 个页面（微信限制）' },
          { k: 'icon', label: '未选中图标', type: 'image', hint: '建议 80×80 透明底 PNG' },
          { k: 'activeIcon', label: '选中图标', type: 'image', hint: '留空则选中态沿用未选中图标（配合选中色显示）' }
        ]
      },
      hint: '最少 2 项、最多 5 项（微信限制）。拖动可排序，顺序即底部导航从左到右的顺序'
    },
    {
      type: 'group', label: '配色',
      fields: [
        { k: 'color', label: '未选中颜色', type: 'color', def: '#8A8A8A' },
        { k: 'selectedColor', label: '选中颜色', type: 'color', def: '#C8102E' },
        { k: 'background', label: '导航背景色', type: 'color', def: '#FFFFFF' },
        { k: 'borderColor', label: '顶部分割线', type: 'color', def: '#EEEEEE' }
      ]
    }
  ]
};

/* ============================ 页面定义 ============================ */

const PAGES = [
  /* ---------------------------- 首页 ---------------------------- */
  {
    key: 'home',
    name: '首页',
    note: '新版首页！！',
    belongs: '微信小程序主页',
    path: 'pages/index',
    desc: '首屏轮播 / 视频 / 长图，区块按顺序纵向排列，可自由增删',
    source: 'replica.HOME_BLOCKS + replica.SHOP + replica.PAGE_META',
    from(R) {
      return {
        shop: R.SHOP,
        blocks: (R.HOME_BLOCKS || []).map(upgradeBlock),
        meta: (R.PAGE_META && R.PAGE_META.home) || pageMetaDefault('home')
      };
    },
    to(data, out) {
      out.SHOP = data.shop;
      out.HOME_BLOCKS = data.blocks;
      setPageMeta(out, 'home', data.meta);
    },
    root: {
      type: 'object',
      fields: [
        HOME_BLOCKS_NODE,
        SHOP_NODE,
        {
          k: 'meta', label: '页面设置', type: 'object',
          hint: '页面级设置（写回 replica.PAGE_META），与页面内的区块无关',
          fields: PAGE_META_FIELDS
        }
      ]
    }
  },

  /* ---------------------------- 莱克 ---------------------------- */
  {
    key: 'lexy',
    name: '莱克',
    note: '7 大系列',
    belongs: '微信小程序主页',
    path: 'pages/lexy',
    desc: '7 个产品系列，每系列一张主图 + 标题 + 若干商品卡片',
    source: 'replica.LEXY_SERIES + replica.PAGE_META',
    from(R) { return { meta: (R.PAGE_META && R.PAGE_META.lexy) || pageMetaDefault('lexy'), series: R.LEXY_SERIES }; },
    to(data, out) {
      out.LEXY_SERIES = data.series;
      setPageMeta(out, 'lexy', data.meta);
    },
    root: {
      type: 'object',
      fields: [
        { k: 'meta', label: '页面设置', type: 'object', fields: PAGE_META_FIELDS },
        {
          k: 'series', label: '产品系列', type: 'list',
          item: {
            type: 'object',
            title: (v, i) => (v.name || '未命名系列') + (v.title ? ' · ' + v.title : ''),
            fields: [
              { k: 'name', label: '系列名称', type: 'text' },
              { k: 'title', label: '主标题', type: 'text' },
              { k: 'subtitle', label: '副标题', type: 'text' },
              { k: 'hero', label: '系列主图', type: 'image' },
              linkField('主图跳转'),
              {
                k: 'products', label: '商品卡片', type: 'list', imageList: true,
                item: {
                  type: 'object', title: (v, i) => '商品 ' + (i + 1),
                  fields: [{ k: 'image', label: '商品图', type: 'image' }, linkField()]
                },
                title: (v, i) => '商品 ' + (i + 1), sortable: true, addable: true,
                hint: '点每张卡片的「跳转」可以挂到具体商品，真机上点它就直接进商品详情页'
              }
            ]
          },
          title: (v, i) => v.name || '未命名系列',
          sortable: true, addable: true
        }
      ]
    }
  },

  /* ---------------------------- 资讯 ---------------------------- */
  {
    key: 'news',
    name: '资讯',
    note: '了解莱克',
    belongs: '微信小程序主页',
    path: 'pages/news',
    desc: '了解莱克：2 个大栏目 + 6 个小栏目，点击进入内容页',
    source: 'replica.NEWS + replica.PAGE_META',
    from(R) { return Object.assign({ meta: (R.PAGE_META && R.PAGE_META.news) || pageMetaDefault('news') }, R.NEWS); },
    to(data, out) {
      var news = Object.assign({}, data);
      delete news.meta;
      out.NEWS = news;
      setPageMeta(out, 'news', data.meta);
    },
    root: {
      type: 'object',
      fields: [
        { k: 'meta', label: '页面设置', type: 'object', fields: PAGE_META_FIELDS },
        { k: 'en', label: '英文标题', type: 'text' },
        { k: 'title', label: '中文标题', type: 'text' },
        {
          k: 'big', label: '大栏目（两列）', type: 'list',
          item: {
            type: 'object',
            title: (v, i) => v.label || '未命名栏目',
            fields: [
              { k: 'label', label: '栏目名称', type: 'text' },
              { k: 'image', label: '栏目图', type: 'image' },
              { k: 'key', label: '内容页标识', type: 'readonly', hint: '对应 packageNews/data.js 的页面键，改动后需同步内容页数据' }
            ]
          },
          sortable: true, addable: true
        },
        {
          k: 'small', label: '小栏目（三列）', type: 'list',
          item: {
            type: 'object', title: (v, i) => v.label || '未命名栏目',
            fields: [
              { k: 'label', label: '栏目名称', type: 'text' },
              { k: 'image', label: '栏目图', type: 'image' },
              { k: 'key', label: '内容页标识', type: 'readonly' }
            ]
          },
          sortable: true, addable: true
        }
      ]
    }
  },

  /* ---------------------------- 产品 ---------------------------- */
  {
    key: 'product',
    name: '产品',
    note: '全品牌产品库',
    belongs: '微信小程序主页',
    path: 'pages/product',
    desc: '左侧品牌导航 + 右侧分组头图与型号卡片',
    source: 'replica.PRODUCT_BRANDS + replica.PRODUCT_NAV_LOGO + replica.PAGE_META',
    from(R) { return { meta: (R.PAGE_META && R.PAGE_META.product) || pageMetaDefault('product'), navLogo: R.PRODUCT_NAV_LOGO, brands: R.PRODUCT_BRANDS }; },
    to(data, out) {
      out.PRODUCT_NAV_LOGO = data.navLogo;
      out.PRODUCT_BRANDS = data.brands;
      setPageMeta(out, 'product', data.meta);
    },
    root: {
      type: 'object',
      fields: [
        { k: 'meta', label: '页面设置', type: 'object', fields: PAGE_META_FIELDS },
        { k: 'navLogo', label: '左栏顶部品牌 Logo', type: 'image' },
        {
          k: 'brands', label: '品牌', type: 'list',
          item: {
            type: 'object',
            title: (v, i) => v.name || '未命名品牌',
            fields: [
              { k: 'name', label: '品牌名称', type: 'text' },
              {
                k: 'groups', label: '分组', type: 'list',
                item: {
                  type: 'object',
                  title: (v, i) => '分组 ' + (i + 1) + (v.products ? '（' + v.products.length + ' 个型号）' : ''),
                  fields: [
                    { k: 'header', label: '分组头图', type: 'image' },
                    linkField('头图跳转'),
                    {
                      k: 'products', label: '型号卡片', type: 'list', imageList: true,
                      item: {
                        type: 'object', title: (v, i) => v.model || '型号 ' + (i + 1),
                        fields: [
                          { k: 'model', label: '型号名', type: 'text' },
                          { k: 'image', label: '型号图', type: 'image' },
                          linkField()
                        ]
                      },
                      sortable: true, addable: true,
                      hint: '点每个型号的「跳转」挂到商品库里的商品，真机上点它就直接进商品详情页'
                    }
                  ]
                },
                sortable: true, addable: true
              }
            ]
          },
          sortable: true, addable: true
        }
      ]
    }
  },

  /* ---------------------------- 我的（个人中心，可装修） ---------------------------- */
  {
    key: 'mine',
    name: '我的',
    note: '个人中心',
    belongs: '微信小程序主页',
    path: 'pages/mine',
    desc: '个人中心：顶部标题栏 / 个人信息 / 个人资产 / 我的订单 / 必备工具等区块可自由增删排序（对标有赞「个人中心装修」）',
    source: 'replica.MINE_BLOCKS + replica.SHOP + replica.PAGE_META',
    /*
     * 个人中心有自己的组件库（有赞实测 3 组 20 个 + 本项目补的「专属区块」组），
     * 与首页那 55 个基础组件不是一套 —— 装修台按 `schema.lib` 存在与否切换，
     * 见 admin.js 的 pageLib()。
     */
    lib: mineComponentLib(),
    from(R) {
      return {
        // replica 里没有 MINE_BLOCKS（老版本代码 / 首次发布前）时回落到默认区块，
        // 让运营一打开编辑器看到的就是「当前生效的那套内容」，而不是一片空白。
        blocks: cloneDefaultMineBlocks(R && R.MINE_BLOCKS),
        shop: R.SHOP,
        meta: (R.PAGE_META && R.PAGE_META.mine) || pageMetaDefault('mine')
      };
    },
    to(data, out) {
      out.MINE_BLOCKS = data.blocks;
      out.SHOP = data.shop;
      setPageMeta(out, 'mine', data.meta);
    },
    root: {
      type: 'object',
      fields: [
        MINE_BLOCKS_NODE,
        {
          k: 'meta', label: '页面设置', type: 'object',
          hint: '页面级设置（写回 replica.PAGE_META），与页面内的区块无关',
          fields: PAGE_META_FIELDS
        },
        SHOP_NODE
      ]
    }
  },

  /* ---------------------------- 店铺导航（全局配置，不是页面） ---------------------------- */
  {
    key: 'nav',
    name: '店铺导航',
    note: '底部导航栏',
    belongs: '全局设置',
    path: '(全局 · 不属于单个页面)',
    desc: '小程序底部导航栏：导航名称 / 图标 / 顺序 / 配色，改完发布即刻生效',
    source: 'replica.TABBAR',
    nav: true,
    from(R) { return normalizeTabbar(R && R.TABBAR); },
    to(data, out) { out.TABBAR = normalizeTabbar(data); },
    root: { type: 'object', fields: TABBAR_NODE.fields }
  }
];

/* ============================ 自定义页面（装修台「新建页面」） ============================ */

/** 自定义页面的页面级设置默认值（内置页在 PAGE_META_DEFS 里各自有一份） */
const CUSTOM_META_DEFAULT = { desc: '', bg: '#F5F6F8' };

/** 自定义页的「页面设置」字段（与内置页共用声明） */
const CUSTOM_META_NODE = {
  k: 'meta', label: '页面设置', type: 'object',
  hint: '页面级设置（写回 replica.PAGE_META），与页面内的区块无关',
  fields: PAGE_META_FIELDS
};

/**
 * 由自定义页面定义（customPages.js 的一条记录）生成页面对象。
 *
 * 结构对齐内置「首页」：blocks 用同一套区块类型（HOME_BLOCK_KINDS），于是
 *   - 装修台的属性面板 / 区块树 / 手机预览全部可直接复用；
 *   - 小程序端 pages/custom/index 用同一份区块渲染逻辑，不必按模板写多套。
 * 数据落在 replica.CUSTOM_PAGES[key]（按 key 索引，所以 key 改名要连带迁移）。
 */
function customPageDef(def) {
  return {
    key: def.key,
    name: def.name,
    note: def.note || '',
    belongs: def.belongs || '自定义页面',
    path: def.path || ('pages/custom/index?key=' + def.key),
    desc: def.template === 'home' ? '自定义页面（由首页复制）' : '自定义页面（空白创建）',
    source: 'replica.CUSTOM_PAGES.' + def.key,
    custom: true,
    from(R) {
      const all = (R && R.CUSTOM_PAGES) || {};
      const d = all[def.key] || {};
      return {
        blocks: (Array.isArray(d.blocks) ? d.blocks : []).map(upgradeBlock),
        meta: Object.assign({}, CUSTOM_META_DEFAULT, d.meta || {})
      };
    },
    to(data, out) {
      if (!out.CUSTOM_PAGES) out.CUSTOM_PAGES = {};
      out.CUSTOM_PAGES[def.key] = {
        name: def.name,
        blocks: data.blocks || [],
        meta: Object.assign({}, CUSTOM_META_DEFAULT, data.meta || {})
      };
      setPageMeta(out, def.key, data.meta);
    },
    root: {
      type: 'object',
      fields: [HOME_BLOCKS_NODE, CUSTOM_META_NODE]
    }
  };
}

/** 全部页面：内置 5 个 + 运营新建的自定义页（每次调用取最新，增删立即可见） */
function allPages() {
  return PAGES.concat(customPages.list().map(customPageDef));
}

/** 按 key 查页面定义（内置优先，其次自定义） */
function findPage(key) {
  const k = String(key === undefined || key === null ? '' : key);
  if (!k) return null;
  const hit = PAGES.filter((p) => p.key === k)[0];
  if (hit) return hit;
  const def = customPages.get(k);
  return def ? customPageDef(def) : null;
}

/* ============================ 跳转目标清单（装修台「选择链接」弹层用） ============================ */

/** 小程序 tabBar 页面：只能 switchTab 打开，不能 navigateTo */
const TAB_PAGES = ['pages/index/index', 'pages/lexy/lexy', 'pages/news/news', 'pages/product/product', 'pages/mine/mine'];

/** 商品详情 / 资讯详情 / 商品列表的路径模板（与小程序端 utils/link.js 必须一致） */
const LINK_ROUTES = {
  goods: '/packageGoods/detail/detail?id=',
  goodsList: '/packageGoods/list/list',
  newsDetail: '/packageNews/detail/detail?key=',
  category: '/pages/category/category',
  cart: '/pages/cart/cart'
};

/**
 * 内置页面的可跳转入口（tabBar 5 页 + 分类 + 购物车）。
 * 自定义页面走动态列表，不在这里写死。
 */
const BUILTIN_LINKS = [
  { kind: 'page', path: '/pages/index/index', name: '首页', tab: true },
  { kind: 'page', path: '/pages/lexy/lexy', name: '莱克（产品系列）', tab: true },
  { kind: 'page', path: '/pages/news/news', name: '资讯（了解莱克）', tab: true },
  { kind: 'page', path: '/pages/product/product', name: '产品（全品牌产品库）', tab: true },
  { kind: 'page', path: '/pages/mine/mine', name: '我的（个人中心）', tab: true },
  { kind: 'page', path: LINK_ROUTES.category, name: '分类（商品分类页）', tab: false },
  { kind: 'page', path: LINK_ROUTES.cart, name: '购物车', tab: false },
  { kind: 'page', path: LINK_ROUTES.goodsList, name: '全部商品（商品列表页）', tab: false }
];

/**
 * 汇总所有可选跳转目标。
 *
 * 数据来自三处真实来源，不编造：
 *   - 页面：内置清单 + customPages.list()（装修台新建的自定义页）
 *   - 商品：catalogStore（后端商品库，与后台控制台同一个库）
 *   - 资讯：replica.NEWS 的 big / small 栏目（key 即内容页标识）
 */
function linkOptions(replica, catalogStore) {
  const pages = BUILTIN_LINKS.slice();

  customPages.list().forEach((c) => {
    pages.push({
      kind: 'page',
      path: '/pages/custom/index?key=' + c.key,
      name: c.name + '（自定义页）',
      tab: false
    });
  });

  const R = replica || {};
  const news = [];
  ['big', 'small'].forEach((group) => {
    const arr = (R.NEWS && R.NEWS[group]) || [];
    arr.forEach((x) => {
      if (!x || !x.key) return;
      news.push({
        kind: 'news',
        path: LINK_ROUTES.newsDetail + x.key,
        name: (x.label || x.key) + (group === 'big' ? '（大栏目）' : '（小栏目）'),
        key: x.key,
        image: x.image || ''
      });
    });
  });

  let goods = [];
  try {
    const g = catalogStore.get();
    goods = ((g && g.goods) || []).map((x) => ({
      kind: 'goods',
      path: LINK_ROUTES.goods + x.id,
      name: x.name || x.id,
      id: x.id,
      image: x.cover || ''
    }));
  } catch (e) {
    goods = [];
  }

  return { pages: pages, goods: goods, news: news, kinds: LINK_KINDS };
}

/* ============================ 对外接口 ============================ */

/** 页面列表元信息（不含 schema 里的函数，避免 JSON 化后丢失） */
function list() {
  return allPages().map((p) => ({
    key: p.key,
    name: p.name,
    note: p.note,
    belongs: p.belongs,
    path: p.path,
    desc: p.desc,
    source: p.source,
    custom: !!p.custom,
    nav: !!p.nav
  }));
}

/** 单个页面的完整 schema（含字段定义；函数字段在 JSON 序列化时会丢失，前端只用其输出） */
function get(key) {
  return findPage(key);
}

/** 返回可安全 JSON 化的 schema（剔除函数） */
function serialize(page) {
  const strip = (node) => {
    if (!node || typeof node !== 'object') return node;
    const out = {};
    Object.keys(node).forEach((k) => {
      const v = node[k];
      if (typeof v === 'function') return;
      if (Array.isArray(v)) { out[k] = v.map(strip); return; }
      if (v && typeof v === 'object') { out[k] = strip(v); return; }
      out[k] = v;
    });
    return out;
  };
  return strip(page.root);
}

/** 生成列表项标题（服务端算好，前端不重复实现） */
function itemTitle(pageKey, path, value, index) {
  const page = findPage(pageKey);
  if (!page) return '';
  let node = page.root;
  const segs = String(path).split('.').filter(Boolean);
  for (const s of segs) {
    if (node.type === 'object') node = (node.fields || []).filter((f) => f.k === s)[0];
    else if (node.type === 'list') node = node.item;
    if (!node) return '';
  }
  const fn = node.item && node.item.title ? node.item.title : node.title;
  if (typeof fn === 'function') {
    try { return String(fn(value, index)); } catch (e) { return ''; }
  }
  return '';
}

/** 深拷贝（后台会频繁改草稿，绝不与已发布数据共享引用） */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

module.exports = { PAGES, allPages, findPage, customPageDef, CUSTOM_META_DEFAULT, list, get, serialize, itemTitle, clone, HOME_BLOCK_KINDS, componentLib, ICONS, PAGE_META_FIELDS, PAGE_META_DEFS, pageMetaDefault, upgradeBlock, upgradePageData, linkOptions, LINK_KINDS, LINK_ROUTES, TAB_PAGES, BUILTIN_LINKS, normalizeTabbar, tabbarDefault, tabbarPageName, TABBAR_PAGES, TABBAR_PAGE_OPTIONS, TABBAR_DEFAULTS, TABBAR_DEFAULT_ITEMS, TABBAR_MIN, TABBAR_MAX, TABBAR_TEXT_MAX,
  /* 个人中心（「我的」页）：区块类型表 / 组件库 / 默认区块 / 字段节点 / 页面级组件库 */
  MINE_BLOCK_KINDS, MINE_BLOCKS_NODE, MINE_UNION_KINDS, MINE_LIB_KINDS, mineComponentLib, cloneDefaultMineBlocks,
  pageLibs, UC_KINDS, UC_LIB_GROUPS, UC_MAX, UC_TOOL_ITEMS, UC_DEFAULT_BLOCKS };
