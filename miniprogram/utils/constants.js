/**
 * 全局常量
 *
 * ENV 说明：
 *   mock   —— 无后端时的离线演示模式，仅覆盖「页面演示所需」的点位（商品/购物车等）
 *   local  —— 连本机自建后端（http://127.0.0.1:3000），只在开发者工具模拟器里可用
 *   server —— 连云服务器（腾讯云 CVM 14.103.50.137），走 nginx 的 /mall-api 反代：
 *             443 → catch-all → 80 → location /mall-api/ → 127.0.0.1:3000
 *             **模拟器与真机通用**（HTTPS，不用改 IP、不用同 WiFi）
 *   dev    —— 连开发环境接口（域名）
 *   prod   —— 连生产环境接口（必须为已备案域名的 HTTPS）
 *
 * 联调前置：
 *   1) server 档：服务器上 lexy-mall.service 需在跑（systemctl status lexy-mall）
 *      local  档：本机需先起后端 node server/index.js
 *   2) 微信开发者工具 → 详情 → 本地设置 → 勾选
 *      「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」
 *      （14.103.50.137 是 IP 不是域名，未在 mp 后台配置 request 合法域名，必须临时关校验；
 *       真机上则用「右上角胶囊 → 开发调试 → 打开」绕过）
 *
 * ⚠️ 图片地址由 utils/asset.js 的 resolveAssets() 拼接成 BASE_URL + '/uploads/xxx'，
 *    所以 BASE_URL 必须包含 /mall-api 这一段（服务器端 nginx 会把该前缀剥掉再转发）。
 */
const ENV = 'server';

const BASE_URL_MAP = {
  mock: '',
  local: 'http://127.0.0.1:3000',           // 本机自建后端（仅模拟器可用）
  server: 'https://14.103.50.137/mall-api', // 腾讯云 CVM（nginx 反代 → 本机 3000）
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
  ORDER_CONFIRM: '/packageOrder/confirm/confirm',
  ORDER_LIST: '/packageOrder/list/list',
  ORDER_DETAIL: '/packageOrder/detail/detail',
  ORDER_PAY_RESULT: '/packageOrder/pay-result/pay-result',
  ADDRESS_LIST: '/packageUser/address/list/list',
  ADDRESS_EDIT: '/packageUser/address/edit/edit'
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
