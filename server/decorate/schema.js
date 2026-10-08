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
  anchor: I('<path d="M5 6h14M5 12h14M5 18h9"/>')
};

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
        k: 'images', label: '图片', type: 'list', item: { type: 'image' }, max: 10,
        title: (v, i) => '第 ' + (i + 1) + ' 张',
        hint: '建议图片尺寸宽度 750，高度不限制；最多 10 张'
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
    desc: '整宽图片，按宽度自适应高度',
    fields: [
      { k: 'height', label: '占位高度', type: 'slider', min: 40, max: 6000, step: 2, unit: 'px', def: 400, hint: '仅供后台预览占位；真机按 widthFix 以图片原比例自适应，此值不生效' },
      { k: 'src', label: '图片', type: 'image' },
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
      { k: 'link', label: '跳转路径', type: 'text', hint: '小程序页面路径，如 /pages/lexy/lexy；留空则不跳转' },
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
          { k: 'link', label: '跳转路径', type: 'text' },
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
            { k: 'link', label: '跳转路径', type: 'text' }
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
        item: { type: 'object', title: (v, i) => '格子 ' + (i + 1), fields: [{ k: 'image', label: '图片', type: 'image' }, { k: 'link', label: '跳转路径', type: 'text' }] }
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
            { k: 'link', label: '跳转路径', type: 'text' }
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
  }
};

/* ============================ 组件库（对标有赞左侧组件库） ============================ */

/**
 * 有赞基础组件全量清单（53 个）。
 *   ok: 1 → 本后台已接入（可添加到页面，小程序端有对应渲染）
 *   kind   → 对应的区块类型
 */
const YZ_BASIC = [
  { n: '标题文本', ok: 1, kind: 'title' },
  { n: '富文本', ok: 0 },
  { n: '辅助分割', ok: 1, kind: 'line' },
  { n: '图片广告', ok: 1, kind: 'swiper' },
  { n: '热区切图', ok: 1, kind: 'hotspot' },
  { n: '魔方', ok: 1, kind: 'cube' },
  { n: '商品搜索', ok: 0 },
  { n: '图文导航', ok: 1, kind: 'nav' },
  { n: '电梯导航', ok: 0 },
  { n: '视频', ok: 1, kind: 'video' },
  { n: '店铺信息', ok: 1, kind: 'shop' },
  { n: '进入店铺', ok: 1, kind: 'shop' },
  { n: '公告', ok: 1, kind: 'notice' },
  { n: '语音', ok: 0 },
  { n: '自定义模块', ok: 0 },
  { n: '涨粉', ok: 0 },
  { n: '内容卡片', ok: 1, kind: 'goods' },
  { n: '在线客服', ok: 0 },
  { n: '商品', ok: 1, kind: 'goods' },
  { n: '商品分组', ok: 0 },
  { n: '购买按钮', ok: 0 },
  { n: '点单卡片', ok: 0 },
  { n: '客户资产', ok: 0 },
  { n: '附近门店', ok: 0 },
  { n: '好友拼单', ok: 0 },
  { n: '在途订单', ok: 0 },
  { n: '优惠券', ok: 0 },
  { n: '限时折扣', ok: 0 },
  { n: '秒杀', ok: 0 },
  { n: '砍价', ok: 0 },
  { n: '新人专区', ok: 0 },
  { n: '拼团', ok: 0 },
  { n: '集点卡', ok: 0 },
  { n: '会员专享价', ok: 0 },
  { n: '会员储值', ok: 0 },
  { n: '办会员', ok: 0 },
  { n: '积分资产', ok: 0 },
  { n: '小程序直播', ok: 0 },
  { n: '视频号直播', ok: 0 },
  { n: '个性化推荐', ok: 1, kind: 'goods' },
  { n: '人群运营', ok: 0 },
  { n: '人群图片', ok: 0 },
  { n: '店铺热搜', ok: 0 },
  { n: '店铺榜单', ok: 0 },
  { n: '课程', ok: 0 },
  { n: '知识专栏', ok: 0 },
  { n: '知识内容', ok: 0 },
  { n: '知识直播', ok: 0 },
  { n: '知识付费会员', ok: 0 },
  { n: '群打卡', ok: 0 },
  { n: '积分兑换商品', ok: 0 },
  { n: '会员卡片', ok: 0 },
  { n: '店招信息', ok: 0 }
];

/** 有赞高级组件（行业 / 营销模板，19 个） */
const YZ_ADV = [
  { n: '视频图片A', ok: 0 }, { n: '分类推荐C', ok: 0 }, { n: '单图广告A', ok: 1, kind: 'image' },
  { n: '分类推荐A', ok: 0 }, { n: '通用标题A', ok: 1, kind: 'title' }, { n: '商品轮播B', ok: 0 },
  { n: '商品轮播A', ok: 1, kind: 'goods' }, { n: '新品发售A1', ok: 0 }, { n: '换一换A', ok: 0 },
  { n: '商品分组G', ok: 0 }, { n: '热点商品A', ok: 0 }, { n: '分类推荐B', ok: 0 },
  { n: '商品分组A', ok: 0 }, { n: '图文轮播A', ok: 1, kind: 'swiper' }, { n: '混合排列A', ok: 0 },
  { n: '叠卡轮播A', ok: 0 }, { n: '跑马灯A', ok: 1, kind: 'notice' }, { n: '品牌故事A', ok: 0 },
  { n: '尾部模块D', ok: 0 }
];

/** 默认常用组件（对标有赞「常用组件」tab，用户可自行增删，存 localStorage） */
const YZ_COMMON = ['title', 'line', 'swiper', 'video', 'notice', 'nav', 'cube', 'hotspot', 'goods', 'shop'];

/** 组件库全景（随 /api/decorate/pages 一起下发给前端） */
function componentLib() {
  return {
    tabs: [
      { key: 'common', name: '常用组件', count: YZ_COMMON.length, desc: '默认展示的组件，可点「添加常用组件」自行增减' },
      { key: 'basic', name: '基础组件', count: YZ_BASIC.length, desc: '对标有赞基础组件清单（53 个）' },
      { key: 'adv', name: '高级组件', count: YZ_ADV.length, desc: '行业 / 营销模板组件（19 个）' }
    ],
    /** 已接入、真正可用的组件（点一下就能加到页面） */
    kinds: Object.keys(HOME_BLOCK_KINDS).map((k) => ({
      kind: k,
      label: HOME_BLOCK_KINDS[k].label,
      lib: HOME_BLOCK_KINDS[k].lib,
      icon: ICONS[HOME_BLOCK_KINDS[k].lib] || ICONS.image_ad,
      desc: HOME_BLOCK_KINDS[k].desc,
      group: HOME_BLOCK_KINDS[k].group || 'basic'
    })),
    icons: ICONS,
    common: YZ_COMMON,
    basic: YZ_BASIC,
    adv: YZ_ADV
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
        blocks: R.HOME_BLOCKS,
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
              {
                k: 'products', label: '商品卡片', type: 'list',
                item: { type: 'object', title: (v, i) => '卡片 ' + (i + 1), fields: [{ k: 'image', label: '商品图', type: 'image' }] },
                title: (v, i) => '商品 ' + (i + 1), sortable: true, addable: true
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
                    {
                      k: 'products', label: '型号卡片', type: 'list',
                      item: {
                        type: 'object', title: (v, i) => v.model || '型号 ' + (i + 1),
                        fields: [
                          { k: 'model', label: '型号名', type: 'text' },
                          { k: 'image', label: '型号图', type: 'image' }
                        ]
                      },
                      sortable: true, addable: true
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

  /* ---------------------------- 我的 ---------------------------- */
  {
    key: 'mine',
    name: '我的',
    note: '个人中心',
    belongs: '微信小程序主页',
    path: 'pages/mine',
    desc: '个人中心顶部店铺信息区',
    source: 'replica.SHOP + replica.PAGE_META',
    from(R) { return { meta: (R.PAGE_META && R.PAGE_META.mine) || pageMetaDefault('mine'), shop: R.SHOP }; },
    to(data, out) {
      out.SHOP = data.shop;
      setPageMeta(out, 'mine', data.meta);
    },
    root: {
      type: 'object',
      fields: [
        { k: 'meta', label: '页面设置', type: 'object', fields: PAGE_META_FIELDS },
        SHOP_NODE
      ]
    }
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
        blocks: Array.isArray(d.blocks) ? d.blocks : [],
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
    custom: !!p.custom
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

module.exports = { PAGES, allPages, findPage, customPageDef, CUSTOM_META_DEFAULT, list, get, serialize, itemTitle, clone, HOME_BLOCK_KINDS, componentLib, ICONS, PAGE_META_FIELDS, PAGE_META_DEFS, pageMetaDefault };
