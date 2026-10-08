/**
 * 路由汇总：把各域路由拼成一张表，并提供匹配能力
 *
 * 点位清单可直接用 GET /api/routes 查看（联调期便于核对「每个点位是否通畅」）
 */

const authRoutes = require('./auth');
const goodsRoutes = require('./goods');
const cartRoutes = require('./cart');
const orderRoutes = require('./order');
const payRoutes = require('./pay');
const assetRoutes = require('./asset');
const decorateRoutes = require('./decorate');
const mediaRoutes = require('./media');
const adminRoutes = require('./admin');
const SAMPLES = require('./samples');

const all = [].concat(
  authRoutes,
  goodsRoutes,
  cartRoutes,
  orderRoutes,
  payRoutes,
  assetRoutes,
  decorateRoutes,
  mediaRoutes,
  adminRoutes
);

/** 路由表：按 method + path 归一化索引 */
const table = new Map();
all.forEach((r) => {
  const key = `${r.method.toUpperCase()} ${r.path}`;
  if (table.has(key)) {
    throw new Error(`路由重复注册：${key}`);
  }
  table.set(key, r);
});

/** 匹配路由（不做路径参数解析，契约内全部为固定路径 + query/body） */
function match(method, path) {
  return table.get(`${method.toUpperCase()} ${path}`) || null;
}

/**
 * 给单个点位补上 samples.js 里的示例参数与说明
 * 抽成独立函数，是为了让 index.js 里两个运维点位（health / routes）
 * 也能同源拿到示例 —— 否则它们会永远「缺示例」，调试台填不出参数。
 */
function withSample(r) {
  const s = SAMPLES[`${r.method.toUpperCase()} ${r.path}`] || {};
  return {
    method: r.method,
    path: r.path,
    auth: !!r.auth,
    dev: !!r.dev,
    raw: !!r.raw, // 按原始流读取（文件上传类点位，调试台不套 JSON 头）
    desc: r.desc || '',
    note: s.note || '',
    sample: { query: s.query || null, body: s.body || null }
  };
}

/**
 * 供联调自检与调试台使用的点位描述
 * 带上 samples.js 里的示例参数，调试台据此一键填参（点位与示例同源，不会脱节）
 */
function describe() {
  return all.map(withSample);
}

module.exports = { match, describe, withSample, routes: all };
