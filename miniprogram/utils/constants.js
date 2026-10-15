/**
 * 全局常量
 *
 * ENV 说明：
 *   mock   —— 无后端时的离线演示模式，仅覆盖「页面演示所需」的点位（商品/购物车等）
 *   local  —— 连本机自建后端（http://127.0.0.1:3000）——
 *             **开发者工具的模拟器默认自动走这一档**
 *   server —— 连云服务器（mall.lexy.cn，腾讯云 CVM），走 nginx 的 /mall-api 反代：
 *             443 → catch-all → 80 → location /mall-api/ → 127.0.0.1:3000
 *             **真机与线上构建走这一档**（HTTPS，不用改 IP、不用同 WiFi）；
 *             ⚠️ 公司内网的电脑访问不了这个域名（出口按 SNI 拦）→ 见下方「档位怎么选」
 *   dev    —— 连开发环境接口（域名）
 *   prod   —— 连生产环境接口（必须为已备案域名的 HTTPS）
 *
 * 档位怎么选（默认全自动，见下方 ENV_OVERRIDE）：
 *   开发者工具模拟器 → local（本机 3000）   真机 / 线上构建 → server（线上域名）
 *   要临时钉死某一档，填 ENV_OVERRIDE（如 'server'）即可。
 *
 * 联调前置：
 *   1) 模拟器（自动走 local）：**本机必须先起后端** node server/index.js
 *      —— 没起的话模拟器就是一片空白、且不会有明显报错，
 *         这是「素材/内容都显示不出来」里最常见的一种成因。
 *      真机 / 线上构建（自动走 server）：服务器上 lexy-mall.service 需在跑
 *   2) 微信开发者工具 → 详情 → 本地设置 → 勾选
 *      「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」
 *      （模拟器走 http://127.0.0.1:3000，既非 HTTPS、也非备案域名，**这一项必须勾**；
 *       已由 project.config.json 的 setting.urlCheck=false 落盘。
 *       真机 / 正式版**不需要**它 —— BASE_URL 主机已在 mp 后台
 *       「开发设置 → 服务器域名」配好 request 合法域名）
 *
 * ⚠️ 图片地址由 utils/asset.js 的 resolveAssets() 拼接成 BASE_URL + '/uploads/xxx'，
 *    所以 BASE_URL 必须包含 /mall-api 这一段（服务器端 nginx 会把该前缀剥掉再转发）。
 */
/**
 * 运行档位
 *
 * ENV_OVERRIDE —— 手动钉死档位；**留空 = 按运行环境自动选**（推荐，默认）。
 *   临时想强制连线上（比如专门验证域名链路）：填 'server' 即可。
 *
 * 自动选档的唯一判据 = 「**是不是开发者工具的模拟器**」：
 *   platform === 'devtools'  → local   （连本机 http://127.0.0.1:3000）
 *   其它一切（ios / android / windows / mac …）→ server（连线上域名）
 *
 * ⚠️ 为什么不能用 `envVersion === 'develop'` 代替 platform：
 *   真机「开发版」（扫码预览）的 envVersion **同样是 'develop'**，
 *   用它判会把**手机**也指到 127.0.0.1 —— 那台手机上 127.0.0.1 是手机自己，
 *   必然全空。platform 才是精确判据（合法值见官方文档 getSystemInfoSync.platform）。
 *
 * ⚠️ 为什么开发者工具的模拟器**必须**绕开域名：
 *   `lexy.cn` 在公司内网有自建权威 DNS，且**出口按 SNI 做过滤**。实测（2026-10-15）：
 *     裸 IP 的 TCP 443 连得上（20ms）；
 *     一带 hostname 做 TLS 握手就被 ECONNRESET（43ms）。
 *   而首页那 11 个区块**全是图片/视频、一个文字区块都没有** ——
 *   素材一挂，整页就是一片空白，看起来像「小程序坏了」，实际是网络层被拦。
 *   真机走公网 DNS + 公网出口，完全不受影响，所以只有模拟器需要绕开。
 *
 * ⚠️ Node 侧（check-all 自检 / preflight-wechat / deploy-data）**没有 wx** →
 *   一律落到下面的兜底 'server'，**所有命令行工具的行为逐字不变**；
 *   preflight-wechat 的「BASE_URL 必须 HTTPS」那道闸也照旧通过。
 */
const ENV_OVERRIDE = '';

/**
 * 取某个平台接口的 platform。
 * 接口不存在 / 抛异常 / 返回体里没这个字段 → 一律返回空串，调用方只管比字符串。
 * （不在调用点写 try，是因为「新接口抛错」不该连累「旧接口本来能答」。）
 */
function platformOf(call) {
  try {
    const r = call();
    return (r && r.platform) || '';
  } catch (e) {
    return '';
  }
}

function detectEnv() {
  if (typeof wx === 'undefined') return 'server';
  /* 两个接口**都试**，只要有一个说是 devtools 就认：
   *   getSystemInfoSync 自基础库 2.20.1 起停止维护（工具里至今仍返回 'devtools'）；
   *   getDeviceInfo 是接替它的新接口。
   * ⚠️ 不能写成「优先新接口、取不到就拉到」—— 新接口一旦不返回 platform（或抛错），
   *    模拟器就会又去连内网访问不了的域名，整页空白，而且**完全没有报错**，
   *    排查成本极高（本次故障就是这种「静默空白」形态）。 */
  const p = platformOf(() => wx.getDeviceInfo()) || platformOf(() => wx.getSystemInfoSync());
  return p === 'devtools' ? 'local' : 'server';
}

const ENV = ENV_OVERRIDE || detectEnv();

const BASE_URL_MAP = {
  mock: '',
  local: 'http://127.0.0.1:3000',           // 本机自建后端（仅模拟器可用）
  server: 'https://mall.lexy.cn/mall-api', // 腾讯云 CVM（nginx 反代 → 本机 3000）
  dev: 'https://dev-api.example.com',       // TODO 替换为开发环境域名
  prod: 'https://api.example.com'           // TODO 替换为生产域名（须已备案 + HTTPS）
};

const BASE_URL = BASE_URL_MAP[ENV];
const IS_MOCK = ENV === 'mock';

/** 业务响应码，与服务端约定保持一致（见 server/lib/http.js 的 ERR） */
const CODE = {
  OK: 0,
  PARAM: 1001,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BIZ: 2000,
  SERVER: 5000
};

/** 订单状态（与服务端 server/lib/order.js 的 STATUS 一一对应） */
const ORDER_STATUS = {
  PENDING_PAY: 'pending_pay',
  PENDING_SHIP: 'pending_ship',
  SHIPPED: 'shipped',
  FINISHED: 'finished',
  CANCELLED: 'cancelled'
};

/** 订单状态中文文案，order 接口也会下发 statusText，此处用于本地兜底 */
const ORDER_STATUS_TEXT = {
  pending_pay: '待付款',
  pending_ship: '待发货',
  shipped: '待收货',
  finished: '已完成',
  cancelled: '已取消'
};

/** 本地缓存 key */
const STORAGE = {
  TOKEN: 'token',
  USER_ID: 'userId',
  LOCAL_CART: 'local_cart',
  SEARCH_HISTORY: 'search_history'
};

/** 页面路径常量，避免各处硬编码 */
const ROUTES = {
  INDEX: '/pages/index/index',
  CATEGORY: '/pages/category/category',
  CART: '/pages/cart/cart',
  MINE: '/pages/mine/mine',
  GOODS_LIST: '/packageGoods/list/list',
  GOODS_DETAIL: '/packageGoods/detail/detail',
  ORDER_LIST: '/packageOrder/list/list',
  ORDER_DETAIL: '/packageOrder/detail/detail',
  ORDER_PAY_RESULT: '/packageOrder/pay-result/pay-result',
  /*
   * ⚠️ 「确认订单 / 结算」页（原 ORDER_CONFIRM）**已从本表移除**：它从来没被建出来过，
   *    只在常量表里挂着一个不存在的路径 —— 而「常量表里的路径 ≠ 真有页面」正是这一批
   *    要修的坑（购物车「结算」与商品详情「立即购买」目前都还是「结算功能开发中」）。
   *    等下单链路落地时，连同 app.json 的分包注册一起加回来。
   *    自检里有一条断言：本表**每个**路径都必须在 app.json 里注册过。
   */
  ADDRESS_LIST: '/packageUser/address/list/list',
  ADDRESS_EDIT: '/packageUser/address/edit/edit',
  COUPON: '/packageUser/coupon/coupon',
  FAVORITE: '/packageUser/favorite/favorite',
  FOOTPRINT: '/packageUser/footprint/footprint',
  MEMBER_CODE: '/packageUser/member-code/member-code',
  ACCOUNT: '/packageUser/account/account',
  ABOUT: '/packageUser/about/about',
  /**
   * 「功能未开放」兜底页（`?name=&desc=`）。
   * 依赖型入口（任务中心 / 赠品 / 分销员中心 / 线下门店 / 退款售后 …）统一落到它，
   * 把「点了没反应」变成「点了告诉你为什么没有」。
   */
  COMING: '/packageUser/coming/coming'
};

module.exports = {
  ENV,
  BASE_URL,
  IS_MOCK,
  CODE,
  ORDER_STATUS,
  ORDER_STATUS_TEXT,
  STORAGE,
  ROUTES
};
