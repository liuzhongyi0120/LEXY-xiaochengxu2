/**
 * 全局常量
 *
 * ENV 说明：
 *   mock  —— 无后端时的离线演示模式，仅覆盖「页面演示所需」的点位（商品/购物车等）
 *   local —— 连本机自建后端（http://127.0.0.1:3000），联调全量点位
 *   dev   —— 连开发环境接口
 *   prod  —— 连生产环境接口（必须为已备案域名的 HTTPS）
 *
 * 联调前置（用 local 时必做）：
 *   1) 先启动后端：  node server/index.js
 *   2) 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」
 *      （原因：小程序正式环境只允许 HTTPS，本机调试走 http 必须临时关闭校验）
 *   3) 真机调试时把 local 的地址换成本机局域网 IP（如 http://192.168.0.10:3000），
 *      手机与电脑需在同一网段
 */
const ENV = 'local';

const BASE_URL_MAP = {
  mock: '',
  local: 'http://127.0.0.1:3000',         // 本机自建后端（开发联调）
  dev: 'https://dev-api.example.com',     // TODO 替换为开发环境域名
  prod: 'https://api.example.com'         // TODO 替换为生产域名（须已备案 + HTTPS）
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
