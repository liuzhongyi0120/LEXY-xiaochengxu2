/* =========================================================================
 * 自定义导航栏尺寸测算
 *
 * 为什么需要：装修台「页面设置 → 风格选择」里的**沉浸式**要求「没有顶部的标题栏，
 * 内容整屏铺满」。微信没有「本次不显示导航栏」这种按数据切换的开关 ——
 * `navigationStyle: custom` 只能写在页面的 .json 里（编译期固定），一旦写上，
 * 原生标题栏就**整页消失**，必须自己画一条回来。
 *
 * 于是首页与自定义页统一走：
 *   页面 .json 写 `navigationStyle: custom` → 由 components/nav-bar 自绘标题栏
 *   · 标准   —— 标题栏常驻（白底黑字），页面内容从标题栏下方开始
 *   · 沉浸式 —— 标题栏透明且不可见，内容从屏幕最顶端铺满；上划超过阈值才浮现
 *
 * 自绘的三个高度必须**实测**，不能写死：
 *   · 状态栏高（statusBarHeight）各机型不同（iPhone 刘海机 44 / 非刘海 20 / 安卓各异）
 *   · 胶囊按钮（右上角 ···⊙）由微信绘制，尺寸与位置也只有 getMenuButtonBoundingClientRect 拿得到
 *   写死 64px 的后果很典型：刘海机上标题被状态栏压住一半，安卓机上标题栏高出一截。
 *
 * 口径来源：微信官方 `wx.getMenuButtonBoundingClientRect()`，
 * 标题栏高 = (胶囊顶 - 状态栏高) × 2 + 胶囊高（胶囊在标题栏里垂直居中）。
 * ========================================================================= */

/** 取不到系统信息时的兜底值：iPhone 6/7/8 那一档，保证不塌成 0 */
var FALLBACK = {
  status: 20,
  bar: 44,
  capsule: { width: 87, height: 32, top: 26, right: 10 }
};

var CACHE = null;

/**
 * 系统信息：优先 wx.getWindowInfo（基础库 2.20.1+），旧库回退 wx.getSystemInfoSync。
 * 与 app.js 的 collectSystemInfo 同口径 —— 不另起一套判断，避免两边算出的高度不一样。
 */
function systemInfo() {
  try {
    if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo() || {};
    if (typeof wx.getSystemInfoSync === 'function') return wx.getSystemInfoSync() || {};
  } catch (err) {
    /* 拿不到就走兜底，不能因为测不到尺寸就让整页没标题栏 */
  }
  return {};
}

/**
 * 导航栏尺寸（整页生命周期内只算一次，结果缓存）
 *
 * @returns {{status:number, bar:number, total:number, capsule:{width:number,height:number,right:number}, windowWidth:number}}
 *          status / bar / total 单位 px（小程序里就是 px，CSS 直接用）
 */
function navMetrics() {
  if (CACHE) return CACHE;

  var sys = systemInfo();
  var status = Number(sys.statusBarHeight);
  if (!status || status < 0) status = FALLBACK.status;

  var winW = Number(sys.windowWidth) || 375;
  var bar = FALLBACK.bar;
  var capsule = FALLBACK.capsule;

  var menu = null;
  try {
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      menu = wx.getMenuButtonBoundingClientRect();
    }
  } catch (err) {
    menu = null;
  }

  if (menu && menu.height) {
    // gap 取 4 兜底：个别机型胶囊顶与状态栏底重合，减出来是 0 会让标题栏贴着状态栏
    var gap = Math.max(Number(menu.top) - status, 4);
    bar = gap * 2 + Number(menu.height);
    capsule = {
      width: Number(menu.width) || FALLBACK.capsule.width,
      height: Number(menu.height) || FALLBACK.capsule.height,
      top: Number(menu.top) || 0,
      // 右侧留白 = 屏宽 - 胶囊右边缘，标题区要避开这块，否则标题会被胶囊压住
      right: Math.max(winW - Number(menu.right), 0)
    };
  }

  CACHE = {
    status: status,
    bar: Math.round(bar),
    total: Math.round(status) + Math.round(bar),
    capsule: capsule,
    windowWidth: winW
  };
  return CACHE;
}

/**
 * meta.style → 是否为沉浸式。
 *
 * 只认字面值 `immersive`，其他一切情况（含老数据里没这个键）都按标准处理 ——
 * 老页面发布时 meta 里没有 style，不能因为缺键就把别人的首页变成沉浸式。
 */
function isImmersive(style) {
  return String(style || '') === 'immersive';
}

/**
 * 页面要不要自绘返回箭头。
 *
 * 真机里：首页是 tab 页（栈里永远只有自己），自定义页多是 navigateTo 进来的（有返回）。
 * 预览运行时 getCurrentPages() 返回空数组 → 一律不画箭头，与「首页不画」一致。
 */
function hasBackArrow() {
  try {
    var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    return pages.length > 1;
  } catch (err) {
    return false;
  }
}

/**
 * 装配页面 data 里的导航栏参数。
 *
 * 集中在这里而不是两个页面各写一份：只要标题栏口径有一处改了（比如沉浸式改成黑字），
 * 首页和自定义页就会立刻不一样 —— 那正是本项目踩过的坑。
 *
 * @param {object} meta    页面 meta（replica.PAGE_META.home 或 CUSTOM_PAGES[key].meta）
 * @param {string} title   标题栏文字
 * @returns {object} 直接 setData 用的导航参数
 */
function navState(meta, title) {
  var m = navMetrics();
  var immersive = isImmersive(meta && meta.style);
  return {
    mode: immersive ? 'immersive' : 'standard',
    title: String(title || ''),
    bg: '#FFFFFF',
    color: '#000000',
    showBack: hasBackArrow(),
    // 沉浸式初始不显示；上划过阈值由 onPageScroll 置 true
    solid: !immersive,
    status: m.status,
    bar: m.bar,
    /*
     * 整条标题栏高度。目录里现在只有一个用处：沉浸式的**上划阈值**
     * （划过一整条再浮现，避免刚动一点标题栏就跳出来挡内容）。
     *
     * ⚠️ 页面**不要**拿它去补 padding-top。nav-bar 标准模式是 sticky（参与文档流、
     *    自己占掉那条高度），再补一次就等于把标题栏算两遍 ——
     *    真机上两条都生效会凭空多空一条，预览里还会和手机壳的 .phone-bar 叠加。
     *    见 components/nav-bar/nav-bar.wxss 顶部注释。
     */
    total: m.total
  };
}

module.exports = {
  navMetrics: navMetrics,
  isImmersive: isImmersive,
  hasBackArrow: hasBackArrow,
  navState: navState
};
