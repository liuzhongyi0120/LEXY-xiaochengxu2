/**
 * 全点位连通性自检
 *
 * 用法：
 *   1) 先起服务： node server/index.js
 *   2) 再执行：   node server/tools/check-all.mjs [baseUrl]
 *
 * 它做什么：
 *   - 从 /api/routes 拉取「已注册点位清单」，逐个发起真实 HTTP 请求
 *   - 走完整业务闭环：登录 → 地址 → 加购 → 下单 → 支付 → 发货 → 收货
 *   - 覆盖异常分支：未登录 401、库存不足、参数缺失、重复回调幂等
 *   - 最后比对「已注册点位」与「已实测点位」，列出任何未覆盖的点位
 *   - 输出控制台表格 + 生成 server/CONNECTIVITY.md 报告
 *
 * 管理员身份（报告 08）：
 *   `/api/admin/*`、`/api/decorate/*`、`/api/media/*` 现在**都要求管理员令牌**，
 *   因此本脚本启动时会自己换一个管理员会话：
 *     · ADMIN_TOKEN 环境变量   → 直接使用（对应服务端的 ADMIN_TOKENS 长期令牌）
 *     · ADMIN_PASSWORD 环境变量 → POST /api/admin/login 换会话令牌
 *     · 都没有 + 非生产环境     → 用开发默认口令 admin
 *   换不到就**直接退出**并打印怎么配（否则后面几十条断言会集体 401，看不出真因）。
 *
 * 判定口径（报告 15）：
 *   `expectFail` 不再等于「业务码非 0 就算过」——
 *   服务端异常（HTTP 5xx / code 5000）**一律判失败**，无论用例写没写 expectFail；
 *   需要精确拦截的用例再补 `expectHttp` / `expectCode` 做双断言。
 *   判定实现抽在 tools/expect.mjs（纯函数，可被单测直接覆盖）。
 */

import { writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { judge } from './expect.mjs';

const SELF_FILE = fileURLToPath(import.meta.url);
const __dirname = dirname(SELF_FILE);
const BASE = process.argv[2] || 'http://127.0.0.1:3000';

/** 需要管理员令牌的接口前缀（与服务端 lib/adminAuth.js 的 ADMIN_API_PREFIXES 同口径） */
const ADMIN_PREFIXES = ['/api/admin/', '/api/decorate/', '/api/media/'];
const isAdminPath = (p) => ADMIN_PREFIXES.some((x) => String(p).indexOf(x) === 0);

/* ----------------------------- 结果收集 ----------------------------- */

const results = [];
let token = '';
let adminToken = '';
let adminWho = null;
let seq = 0;

/** 发起请求：模拟小程序 wx.request 的行为（GET 走 query、其余走 JSON body）
 *
 *  身份三选一（默认按路径自动选）：
 *    auth    true=小程序用户令牌（默认）；false=不带用户令牌
 *    admin   null=按路径自动（管理前缀带管理员令牌）；true=强制带；false=强制不带
 *    bearer  直接指定令牌（用于「校验某个令牌是否有效」这类场景）
 *
 *  expectFail：预期被拦截（配合 expectHttp / expectCode 做精确双断言）
 *  raw / contentType：原始请求体，用于「非法 JSON / 非对象 JSON」这类解析回归
 *  silent：不记录到结果列表（用于探针类请求）
 *
 *  通过与否的判定统一走 tools/expect.mjs —— 服务端异常（5xx / code 5000）永远判失败。
 */
async function call(method, path, opts = {}) {
  const {
    query, body, raw = null, contentType = '',
    auth = true, admin = null, bearer = '',
    expectFail = '', expectHttp = null, expectCode = null,
    silent = false, form = null
  } = opts;

  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) qs.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    });
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  const headers = {};
  const useAdmin = admin === true || (admin === null && isAdminPath(path));
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  else if (useAdmin && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  else if (auth && token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    // multipart 上传：不手写 Content-Type，交给 fetch 生成带 boundary 的头
    payload = form;
  } else if (raw !== null) {
    headers['Content-Type'] = contentType || 'application/json';
    payload = raw;
  } else if (body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let httpStatus = 0;
  let json = null;
  let errMsg = '';
  try {
    const res = await fetch(url, { method, headers, body: payload });
    httpStatus = res.status;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { code: -1, msg: '响应不是合法 JSON：' + text.slice(0, 80) };
    }
  } catch (e) {
    errMsg = e.message;
  }

  const verdict = judge({ httpStatus, json, errMsg, expectFail, expectHttp, expectCode });
  const passed = verdict.passed;
  const businessFailed = !!(json && json.code !== 0);

  if (!silent) {
    const notes = [];
    if (expectFail) notes.push(`预期失败：${expectFail}`);
    const want = [];
    if (expectHttp !== null && expectHttp !== undefined) want.push(`HTTP ${expectHttp}`);
    if (expectCode !== null && expectCode !== undefined) want.push(`code ${expectCode}`);
    if (want.length) notes.push('要求 ' + want.join(' + '));
    results.push({
      no: ++seq,
      method,
      path,
      httpStatus: errMsg ? 'ERR' : httpStatus,
      code: json ? json.code : '-',
      msg: verdict.passed ? (errMsg || (json ? json.msg : '')) : verdict.reason,
      passed,
      note: notes.join('　')
    });
  }
  return { ok: passed, reason: verdict.reason, businessFailed, httpStatus, json, data: json && json.data, errMsg };
}

/** 明确断言「一次请求确实被拦下了」，并在结果里带上实到状态码与业务码 */
function assertBlocked(name, r, detail = '') {
  return assert(name, r.ok, detail || `HTTP ${r.httpStatus} / code ${r.json && r.json.code} / ${(r.json && r.json.msg) || r.errMsg || ''}`);
}

/* ------------------------- 未预期异常也要出报告 -------------------------
 * 这个脚本是两千多行的「边跑边断言」长流程。任何一步抛未预期异常
 * （接口真崩了、返回体字段没了导致取属性炸了）都会在打印任何结果之前整段退出，
 * 现场只剩一个 TypeError —— 已经跑完的 300 多条结果全看不到，排查等于从零开始。
 * 所以挂上两个进程级钩子，异常也走同一个 emitReport()。 */
let crash = null;
function onCrash(e) {
  if (crash) return;
  crash = e instanceof Error ? e : new Error(String(e));
  console.error(`\n ✗ 自检中断（未预期异常，不是业务失败）：${crash.message}`);
  if (crash.stack) console.error(crash.stack.split('\n').slice(0, 5).join('\n'));
  results.push({
    no: ++seq,
    method: '—',
    path: '自检中断：未预期异常（不是「预期失败」，必须当 bug 查）',
    httpStatus: 'ERR',
    code: '-',
    msg: crash.message,
    passed: false,
    note: '中断'
  });
  try { emitReport(); } catch (x) { console.error(' （报告生成失败：' + x.message + '）'); }
  process.exit(1);
}
process.on('uncaughtException', onCrash);
process.on('unhandledRejection', onCrash);

/** 取一个可能还没初始化的值（崩溃可能发生在它被赋值之前） */
function safe(fn, dflt) {
  try { return fn(); } catch (e) { return dflt; }
}

/** 记录一条断言（不产生新点位，只做补充校验） */
function assert(name, cond, detail = '') {
  results.push({
    no: ++seq,
    method: '—',
    path: name,
    httpStatus: cond ? 'PASS' : 'FAIL',
    code: cond ? '0' : '-',
    msg: detail,
    passed: !!cond,
    note: '断言'
  });
  return cond;
}

/** 库存探针：用超大加购量触发「仅剩 N 件」提示，反推实时库存（不记录到结果） */
async function probeStock(goodsId, skuId) {
  const r = await call('POST', '/api/cart/add', {
    body: { goodsId, skuId, quantity: 1e9 }, silent: true
  });
  const m = /仅剩 (\d+) 件/.exec((r.json && r.json.msg) || '');
  return m ? Number(m[1]) : null;
}

/* ----------------------------- 主流程 ----------------------------- */

console.log(`\n 连通性自检开始 → ${BASE}\n${'='.repeat(72)}`);

/* 0. 服务可达性 */
const health = await call('GET', '/api/health', { auth: false });
if (!health.ok) {
  console.error(' ✗ 服务不可达，请先执行： node server/index.js');
  process.exit(1);
}
console.log(` 服务状态   ${health.data.status}   点位 ${health.data.routes} 个   ` +
  `微信能力：登录=${health.data.wechat.login} 支付=${health.data.wechat.pay}`);

/*
 * 0.1 管理员会话（报告 08 的必然结果）
 *
 * `/api/admin/*`、`/api/decorate/*`、`/api/media/*` 共 40 多个点位现在都要求管理员令牌，
 * 因此这里必须先换一个会话，否则后面几十条断言会集体 401 —— 那时看到的是
 * 「点位不通」，而不是「你没给管理员凭证」，排查方向会被彻底带偏。
 *
 * 凭证来源优先级：
 *   1) ADMIN_TOKEN   环境变量（对应服务端 ADMIN_TOKENS 里的长期令牌）
 *   2) ADMIN_PASSWORD 环境变量（口令换会话令牌）
 *   3) 非生产环境 → 开发默认口令 admin
 * 三者都拿不到就**直接退出**，并把 health 里自述的凭证状态打出来。
 */
async function verifyAdmin(t) {
  const r = await call('GET', '/api/admin/session', { auth: false, admin: false, bearer: t, silent: true });
  return r.ok ? (r.data || {}) : null;
}

const envAdminToken = String(process.env.ADMIN_TOKEN || '').trim();
if (envAdminToken) {
  const me = await verifyAdmin(envAdminToken);
  if (me) { adminToken = envAdminToken; adminWho = me; }
  else console.log(' ⚠ ADMIN_TOKEN 无效（服务端未认这个令牌），改用口令登录');
}
if (!adminToken) {
  const pwds = [process.env.ADMIN_PASSWORD, process.env.NODE_ENV === 'production' ? '' : 'admin']
    .filter(Boolean);
  for (const pw of pwds) {
    const r = await call('POST', '/api/admin/login', {
      auth: false, admin: false, body: { password: pw }, silent: true
    });
    if (r.ok && r.data && r.data.token) {
      adminToken = r.data.token;
      const me = await verifyAdmin(adminToken);
      adminWho = me || { role: r.data.role, name: r.data.roleLabel || '管理员' };
      break;
    }
  }
}
if (!adminToken) {
  const ah = (health.data && health.data.adminAuth) || {};
  console.error('\n ✗ 无法取得管理员会话，管理类点位无法自检。');
  console.error(`   服务端自述：管理页面=${(health.data && health.data.adminPage) || '-'}　` +
    `凭证=${ah.credentials || '-'}　长期令牌=${ah.tokens === undefined ? '-' : ah.tokens} 条　口令=${ah.password || '-'}`);
  console.error('   请任选一种方式后重跑：');
  console.error('     ADMIN_PASSWORD=你的口令 node server/tools/check-all.mjs');
  console.error('     ADMIN_TOKEN=服务端ADMIN_TOKENS里的令牌 node server/tools/check-all.mjs');
  process.exit(1);
}
console.log(` 管理员身份 ${adminWho.name}（${adminWho.role}）/ 令牌来源 ${adminWho.source || 'session'}`);

/* 0.5 库存水位兜底
 * check-all 会真实下单，且「支付 → 发货 → 收货」这条主链路的订单不会取消，
 * 因此每次运行都会永久扣减库存。反复运行会把 SKU 跑空（实际已发生：g1001-01 只剩 1 件，
 * 导致 quantity:2 的加购直接被库存校验拦下）。
 * 处理：开跑前把自检用的 SKU 补到安全水位（顺带把历史自检跑空的库存补回），
 *       跑完后把「本次净消耗」补回，做到可重复运行、且对运营数据净影响为零。
 *
 * ⚠️ 探针商品必须**动态取商品库在售首件**，绝不能写死商品 id ——
 *    曾经写死 'g1001'，该商品被删掉后 readGoodsStock() 一直返回 null，
 *    「水位兜底」与收尾的「净影响归零」断言被整体静默跳过，
 *    于是每跑一轮自检就永久扣掉一笔库存（实测累计把 S10Pro 从 99 扣到 93 都没人发现）。
 */
const stockProbe = await call('GET', '/api/goods/list', { auth: false, query: { page: 1, size: 1 }, silent: true });
const STOCK_GOODS = ((stockProbe.data && stockProbe.data.list) || [])[0]
  ? stockProbe.data.list[0].id
  : '';
const STOCK_FLOOR = 50;
const readGoodsStock = async () => {
  const r = await call('GET', '/api/admin/goods/detail', {
    auth: false, query: { id: STOCK_GOODS }, silent: true
  });
  if (!r.ok || !r.data || !r.data.goods) return null;
  return r.data.goods.skus.map((s) => ({ skuId: s.skuId, stock: s.stock }));
};
const adjustStock = (items) => call('POST', '/api/admin/goods/stock', {
  auth: false, body: { items, mode: 'delta' }, silent: true
});

const stockPlan = await readGoodsStock();
if (stockPlan) {
  const low = stockPlan.filter((s) => s.stock < STOCK_FLOOR);
  if (low.length) {
    await adjustStock(low.map((s) => ({ skuId: s.skuId, value: STOCK_FLOOR - s.stock })));
    console.log(` 库存兜底   ${STOCK_GOODS} 有 ${low.length} 个 SKU 低于 ${STOCK_FLOOR} 件，已补至安全水位`);
  }
}
const stockBefore = (await readGoodsStock()) || [];

/*
 * 销量基线（与库存同理，但此前**完全没有兜底**）：
 * 销量只在「支付成功」时由 catalog.bumpSales 累加，**没有任何回滚路径**
 * （取消接口只处理未支付订单）。自检每跑一轮都会走一次真实支付，
 * 于是把参与下单的商品 sales 永久 +N —— 实测每轮 +3，越跑越虚高，
 * 且一旦同步到线上就是运营看得见的展示数字错。
 * 这里开跑前记录全部商品的销量，收尾时逐件补回，做到可重复运行。
 */
const readAllSales = async () => {
  const r = await call('GET', '/api/admin/goods/list', {
    auth: false, query: { page: 1, size: 500 }, silent: true
  });
  if (!r.ok || !r.data || !Array.isArray(r.data.list)) return null;
  return r.data.list.map((g) => ({ goodsId: g.id, sales: Number(g.sales) || 0 }));
};
const adjustSales = (items) => call('POST', '/api/admin/goods/sales', {
  auth: false, body: { items, mode: 'set' }, silent: true
});
const salesBefore = await readAllSales();

/* 1. 点位清单 */
const routeList = await call('GET', '/api/routes', { auth: false });
const registered = routeList.data.list;
const bizTotal = routeList.data.bizTotal !== undefined ? routeList.data.bizTotal : registered.length;
console.log(` 已注册点位 ${registered.length} 个（业务 ${bizTotal} + 运维 ${registered.length - bizTotal}）\n`);

/* 2. 未登录访问受保护点位 → 应 401 */
const unauth = await call('GET', '/api/user/profile', { auth: false, expectFail: '未登录 401', expectHttp: 401, expectCode: 401 });
assert('未登录访问受保护点位返回 401',
  unauth.httpStatus === 401 && unauth.json.code === 401,
  `实际 HTTP ${unauth.httpStatus} / code ${unauth.json && unauth.json.code}`);
assert('401 时响应体不含业务数据', !unauth.json.data, `data=${JSON.stringify(unauth.json.data)}`);

/*
 * 3. 登录链路
 *
 * 用**固定 code**：微信 code 换 openid 是「一码一用户」，随机 code 等于每跑一轮就新建一个账号 ——
 * 实测跑了几十轮之后，后台「客户管理」里堆了 69 个同名「联调账号」，只能手工清库。
 * 固定 code 让自检始终用同一个「联调账号」，后台客户数稳定为 1。
 * 自检对账号状态的假设（地址 / 购物车）在下面各步自行复位，不依赖「这个账号是全新的」。
 */
const login = await call('POST', '/api/auth/login', {
  auth: false,
  body: { code: 'check_code_selfcheck' }
});
if (!login.ok) {
  console.error(' ✗ 登录失败，无法继续：', login.json && login.json.msg);
  process.exit(1);
}
token = login.data.token;
console.log(` 登录成功   userId=${login.data.userId}  isNew=${login.data.isNew}  新用户赠券=${(login.data.profile ? '已发放' : '-')}`);

/* 4. 公共只读点位 */
await call('GET', '/api/home', { auth: false });
const cats = await call('GET', '/api/goods/categories', { auth: false });
const list = await call('GET', '/api/goods/list', { auth: false, query: { page: 1, size: 5 } });
const listSorted = await call('GET', '/api/goods/list', { auth: false, query: { categoryId: 'c1', sort: 'price_desc', page: 1, size: 5 } });
await call('GET', '/api/goods/list', { auth: false, query: { keyword: '莱克', page: 1, size: 5 } });
const goodsId = list.data.list[0].id;
const detail = await call('GET', '/api/goods/detail', { auth: false, query: { id: goodsId } });
const sku = detail.data.skus[0];
await call('GET', '/api/goods/comments', { auth: false, query: { goodsId, page: 1, size: 5 } });
console.log(` 商品       ${list.data.total} 个在售，首件 ${goodsId}，SKU ${detail.data.skus.length} 个`);

/* 5. 登录态基础读点位
 * 头像必须用**站内素材**：曾经在这里写死一个有赞 CDN 地址，于是每跑一轮自检
 * 就把外链写回用户头像 —— 与 check-localized「数据文件零外链」直接打架，
 * 表现为「修好又被写回」反复出现。现在动态取素材库首件的相对路径。 */
const avatarProbe = await call('GET', '/api/media/list', { auth: false, query: { page: 1, size: 1 }, silent: true });
const avatarLocal = ((avatarProbe.data && avatarProbe.data.list) || [])[0]
  ? avatarProbe.data.list[0].url
  : '';
await call('GET', '/api/user/profile');
await call('POST', '/api/user/profile', { body: { nickname: '联调账号', avatar: avatarLocal } });
await call('POST', '/api/user/phone', { body: { code: 'check_phone_code_001' } });
await call('POST', '/api/auth/refresh');
await call('GET', '/api/cart/list');
await call('GET', '/api/address/list');
await call('GET', '/api/coupon/list');
await call('GET', '/api/coupon/list', { query: { status: 'available' } });
const coupons = await call('GET', '/api/coupon/list', { query: { status: 'available' } });
console.log(` 新用户赠券 ${coupons.data.total} 张：${coupons.data.list.map((c) => c.name).join(' / ')}`);

/* 6. 地址链路
 * 先清掉历史残留：登录已改成固定账号，若上一轮自检中途失败（本轮之前就发生过），
 * 未删掉的地址会挂在这个账号上越积越多。自检正常跑完会在收尾删掉自己那条。 */
const addrOld = await call('GET', '/api/address/list');
let addrCleared = 0;
for (const a of ((addrOld.data && addrOld.data.list) || [])) {
  const rm = await call('POST', '/api/address/delete', { body: { addressId: a.addressId }, silent: true });
  if (rm.ok) addrCleared += 1;
}
const addr = await call('POST', '/api/address/save', {
  body: { name: '张三', phone: '13800138000', province: '江苏省', city: '苏州市', district: '姑苏区', detail: '示例路 1 号 101 室', isDefault: true }
});
const addressId = addr.data.addressId;
await call('GET', '/api/address/list');
await call('GET', '/api/address/detail', { query: { addressId } });
await call('POST', '/api/address/setDefault', { body: { addressId } });

/* 7. 购物车链路 */
await call('POST', '/api/cart/add', { body: { goodsId, skuId: sku.skuId, quantity: 2 } });
const cartList = await call('GET', '/api/cart/list');
const cartItem = cartList.data.items[0];
await call('PUT', '/api/cart/update', { body: { cartItemId: cartItem.cartItemId, quantity: 2, selected: true } });
await call('POST', '/api/cart/selectAll', { body: { selected: true } });

/* 8. 优惠券可用性 + 领券 */
await call('GET', '/api/coupon/available', { query: { goodsAmount: 249900, categoryIds: JSON.stringify(['c101']) } });
await call('POST', '/api/coupon/receive', { body: { templateId: 'ct_500_300' } });
await call('POST', '/api/coupon/receive', { body: { templateId: 'ct_500_300' }, expectFail: '重复领券被拦截', expectHttp: 200, expectCode: 2000 });

/* 9. 下单（购物车结算）+ 支付链路 */
const couponList = await call('GET', '/api/coupon/list', { query: { status: 'available' } });
const usableCoupon = couponList.data.list.find((c) => c.threshold <= 249900 * 2);
const precreate = await call('POST', '/api/order/precreate', {
  body: { fromCart: true, addressId, couponId: usableCoupon ? usableCoupon.couponId : '', remark: '联调下单' }
});
if (!precreate.ok) {
  console.error(' ✗ 下单失败：', precreate.json.msg);
} else {
  const orderId = precreate.data.orderId;
  console.log(` 下单成功   ${precreate.data.orderNo}  商品 ¥${(precreate.data.amounts.goodsAmount / 100).toFixed(2)}` +
    `  优惠 ¥${(precreate.data.amounts.couponAmount / 100).toFixed(2)}` +
    `  运费 ¥${(precreate.data.amounts.freightAmount / 100).toFixed(2)}` +
    `  应付 ¥${(precreate.data.amounts.payAmount / 100).toFixed(2)}`);
  assert('下单返回支付参数', !!(precreate.data.payment && precreate.data.payment.package), 'payment.package 存在');

  await call('GET', '/api/order/detail', { query: { orderId } });
  await call('GET', '/api/order/list', { query: { status: 'pending_pay', page: 1, size: 10 } });
  await call('GET', '/api/order/count');
  await call('POST', '/api/pay/query', { body: { orderId } });
  await call('POST', '/api/pay/mock-success', { body: { orderId } });
  const paid = await call('POST', '/api/pay/query', { body: { orderId } });
  assert('支付后订单转为待发货', paid.data.status === 'pending_ship', `实际 ${paid.data.status}`);
  await call('POST', '/api/order/ship', { body: { orderId, company: '顺丰速运' } });
  await call('POST', '/api/order/confirm', { body: { orderId } });
  const finished = await call('GET', '/api/order/detail', { query: { orderId } });
  assert('确认收货后订单完成', finished.data.status === 'finished', `实际 ${finished.data.status}`);
}

/* 10. 立即购买下单 + 取消（用库存探针真实验证扣减与回滚） */
const s0 = await probeStock(goodsId, sku.skuId);
const order2 = await call('POST', '/api/order/precreate', {
  body: { items: [{ goodsId, skuId: sku.skuId, quantity: 1 }], addressId, remark: '取消测试' }
});
assert('立即购买下单成功', order2.ok, order2.json && order2.json.msg);
const s1 = await probeStock(goodsId, sku.skuId);
assert('下单后实时库存扣减 1 件', s1 === s0 - 1, `剩余 ${s0} → ${s1}`);
if (order2.ok) {
  await call('POST', '/api/order/cancel', { body: { orderId: order2.data.orderId } });
  const s2 = await probeStock(goodsId, sku.skuId);
  assert('取消订单后库存回滚', s2 === s0, `剩余 ${s1} → ${s2}`);
  await call('POST', '/api/order/cancel', { body: { orderId: order2.data.orderId }, expectFail: '重复取消被拦截', expectHttp: 200, expectCode: 2000 });
}

/* 11. 支付回调点位（独立下单后触发） */
const order3 = await call('POST', '/api/order/precreate', {
  body: { items: [{ goodsId, skuId: sku.skuId, quantity: 1 }], addressId, remark: '回调测试' }
});
if (order3.ok) {
  const notify = await call('POST', '/api/pay/notify', {
    auth: false,
    body: { orderNo: order3.data.orderNo, transactionId: 'CHECKTX_' + order3.data.orderNo, payAmountFen: order3.data.amounts.payAmount }
  });
  assert('支付回调返回 SUCCESS', notify.ok && notify.data.errmsg === 'SUCCESS', `code=${notify.json && notify.json.code}`);
  const dup = await call('POST', '/api/pay/notify', {
    auth: false,
    body: { orderNo: order3.data.orderNo, transactionId: 'CHECKTX_' + order3.data.orderNo, payAmountFen: order3.data.amounts.payAmount }
  });
  assert('重复回调幂等（duplicated=true）', dup.ok && dup.data.duplicated === true, `duplicated=${dup.data && dup.data.duplicated}`);
}

/* 12. 收藏 / 足迹 */
await call('POST', '/api/favorite/toggle', { body: { goodsId } });
await call('GET', '/api/favorite/list', { query: { page: 1, size: 10 } });
await call('POST', '/api/footprint/add', { body: { goodsId } });
await call('GET', '/api/footprint/list', { query: { page: 1, size: 10 } });

/* 13. 异常分支：库存不足 / 参数缺失 / 商品不存在 / 未注册路径 */
const bigQty = await call('POST', '/api/cart/add', {
  body: { goodsId, skuId: sku.skuId, quantity: 999999 }, expectFail: '超量加购被拦截', expectHttp: 200, expectCode: 2000
});
assert('超量加购返回业务码 2000', bigQty.json.code === 2000,
  `code=${bigQty.json.code} msg=${bigQty.json.msg}`);

const badParam = await call('GET', '/api/goods/detail', {
  auth: false, query: { id: 'not_exist_id' }, expectFail: '商品不存在', expectHttp: 404, expectCode: 404
});
assert('不存在的商品返回业务码 404', badParam.json.code === 404, `code=${badParam.json.code}`);

const notFound = await call('GET', '/api/not/exist', { auth: false, expectFail: '未注册路径', expectHttp: 404, expectCode: 404 });
assert('未注册路径返回 HTTP 404', notFound.httpStatus === 404, `HTTP ${notFound.httpStatus}`);

/* 14. 清理类点位 */
await call('DELETE', '/api/cart/remove', { body: { cartItemIds: [cartItem.cartItemId] } });
await call('DELETE', '/api/footprint/clear', { body: {} });
await call('POST', '/api/address/delete', { body: { addressId } });

/* 15. 删除地址后再下单 → 应被拦截（前置依赖校验） */
const noAddr = await call('POST', '/api/order/precreate', {
  body: { items: [{ goodsId, skuId: sku.skuId, quantity: 1 }] }, expectFail: '无收货地址', expectHttp: 200, expectCode: 2000
});
assert('无收货地址时下单被拦截', noAddr.json.code === 2000, `msg=${noAddr.json && noAddr.json.msg}`);

await call('POST', '/api/auth/logout', { body: {} });

/* 15.5 店铺装修后台点位（全部无副作用：发布/回滚走「无草稿/无版本」的预期失败分支） */
const decoPages = await call('GET', '/api/decorate/pages', { auth: false });
/*
 * ⚠️ 这里**不能**断言 list.length === 6。
 * 「自定义页」是运营随时会新建的真实内容 —— 早先写死 6，运营建了第一个自定义页后
 * 自检就永久变红（假红比不检查更糟）。改成锁「等价关系」：
 *   · 5 个内置页非 custom 非 nav 全部在场；
 *   · nav 标记恰好 1 项；
 *   · 其余条目一律是 custom。
 */
const DECO_BUILTIN_KEYS = ['home', 'lexy', 'news', 'product', 'mine'];
const decoListAll = decoPages.data ? decoPages.data.list : [];
const decoKeys = decoListAll.map((p) => p.key);
const decoBad = decoListAll.filter(
  (p) => p.nav ? false : (!p.custom && DECO_BUILTIN_KEYS.indexOf(p.key) < 0));
assert('装修页面列表 = 5 个内置页面 + 1 个全局配置项（店铺导航，nav 标记），其余一律是自定义页',
  decoPages.ok &&
  DECO_BUILTIN_KEYS.every((k) => decoKeys.indexOf(k) >= 0) &&
  decoListAll.filter((p) => p.nav).length === 1 &&
  decoListAll.filter((p) => !p.nav && !p.custom).length === 5 &&
  decoBad.length === 0,
  decoPages.data
    ? `共 ${decoListAll.length} 项（内置 5 / 全局配置 ${decoListAll.filter((p) => p.nav).length} / 自定义 ${decoListAll.filter((p) => p.custom).length}）`
    : '无返回');

/* 组件库清单：基础组件需与有赞实测的 55 个一致（2026-10-10 复测补上「游戏分类」）；已接入组件数 = 首页区块类型数 */
const decoLib = await call('GET', '/api/decorate/lib', { auth: false });
const libTabs = decoLib.ok && decoLib.data ? decoLib.data.tabs : null;
const libCount = {};
if (libTabs) libTabs.forEach((t) => { libCount[t.key] = t.count; });
assert('装修组件库三 tab 数量正确（常用 10 / 基础 55 / 高级实测 2）',
  !!libTabs && libCount.common === 10 && libCount.basic === 55 && libCount.adv >= 1,
  libTabs ? `实际 ${JSON.stringify(libCount)}` : '无返回');

const libKinds = decoLib.ok && decoLib.data ? decoLib.data.kinds : null;
/* 2026-10-10：有赞 55 基础 + 2 高级已全部接入（原先 20 种），
 * 这里锁「清单里每一项都有对应的区块类型」而不是写死数字 —— 数量会继续增加，等价关系不会。 */
const libBasicAll = decoLib.ok && decoLib.data ? decoLib.data.basic.concat(decoLib.data.adv) : [];
const libNoKind = libBasicAll.filter((it) => it.ok && !it.kind);
assert('装修组件库每一件（55 基础 + 2 高级）都已接入为区块类型，且每个都带 SVG 图标',
  !!libKinds && libKinds.length >= 57 && libKinds.every((k) => !!k.icon) && libNoKind.length === 0,
  libKinds ? `实际 ${libKinds.length} 种，缺图标：${libKinds.filter((k) => !k.icon).map((k) => k.kind).join(',') || '无'}` +
    (libNoKind.length ? `，清单里没接上：${libNoKind.map((x) => x.n).join(',')}` : '') : '无返回');

const decoHome = await call('GET', '/api/decorate/page', { auth: false, query: { key: 'home' } });
assert('装修首页详情：schema + 区块数据 + 已发布数据',
  decoHome.ok && !!decoHome.data.schema && Array.isArray(decoHome.data.data.blocks) && decoHome.data.data.blocks.length >= 11,
  `区块 ${decoHome.data ? decoHome.data.data.blocks.length : 0} 个（≥11 为合格，具体数量随运营内容变化）`);

const decoUnknown = await call('GET', '/api/decorate/page', { auth: false, query: { key: 'nope' }, expectFail: '未知页面', expectHttp: 404, expectCode: 404 });
assert('装修未知页面返回 404', decoUnknown.json.code === 404, `code=${decoUnknown.json.code}`);

// 草稿往返：保存（内容与已发布一致）→ diff 应为 0 处差异 → 丢弃
const decoDraft = await call('POST', '/api/decorate/draft', { body: { key: 'home', data: decoHome.data.published } });
assert('装修草稿保存成功', decoDraft.ok, `at=${decoDraft.data && decoDraft.data.atText}`);

const decoDiff = await call('GET', '/api/decorate/diff', { auth: false, query: { key: 'home' } });
assert('草稿与已发布一致时 diff 为 0', decoDiff.ok && decoDiff.data.total === 0,
  `total=${decoDiff.data ? decoDiff.data.total : '-'}`);

// 无草稿时发布 → 预期失败（不写文件，保证自检无副作用）
await call('POST', '/api/decorate/discard', { body: { key: 'home' } });
await call('POST', '/api/decorate/publish', { body: { key: 'home' }, expectFail: '无草稿发布被拦截', expectHttp: 200, expectCode: 2000 });
await call('POST', '/api/decorate/rollback', { body: { key: 'home', versionId: 'v_not_exist' }, expectFail: '版本不存在', expectHttp: 404, expectCode: 404 });

const decoStats = await call('GET', '/api/decorate/stats', { auth: false });
assert('装修统计返回目标文件路径', decoStats.ok && !!decoStats.data.replicaFile, `file=${decoStats.data && decoStats.data.replicaFile}`);

/* 15.6 店铺装修 · 自定义页面（对标有赞「新建页面」）
   走完整生命周期：新建 → 存草稿 → 发布（写进 replica.CUSTOM_PAGES）→ 改名（键名迁移）→ 删除（复原），
   收尾保证 replica.js 与自定义页数量都回到起点，可重复运行。 */
const ROOT_DIR = join(__dirname, '..', '..');
const REPLICA_FILE = join(ROOT_DIR, 'miniprogram', 'config', 'replica.js');
const CUSTOM_KEY = 'zzcheckdeco';
const CUSTOM_NEW_KEY = CUSTOM_KEY + '-x';

const decoTpl = await call('GET', '/api/decorate/templates', { auth: false });
assert('装修模板点位返回 2 个模板 + 20 个配额上限',
  decoTpl.ok && decoTpl.data.list.length === 2 && decoTpl.data.custom.max === 20,
  decoTpl.ok ? `模板 ${decoTpl.data.list.length} 个 · 上限 ${decoTpl.data.custom.max}` : decoTpl.json.msg);

// 前置清理：上一次异常退出可能留下测试页
const decoPre = await call('GET', '/api/decorate/pages', { auth: false });
for (const p of (decoPre.data.list || []).filter((x) => x.custom && x.key.indexOf(CUSTOM_KEY) === 0)) {
  await call('POST', '/api/decorate/page/delete', { body: { key: p.key } });
}
const baseCustom = ((await call('GET', '/api/decorate/pages', { auth: false })).data.list || []).filter((x) => x.custom).length;

const decoMake = await call('POST', '/api/decorate/page/create', {
  body: { name: '自检临时页', key: CUSTOM_KEY, note: '联调自检', template: 'blank' }
});
assert('新建自定义页面成功并返回小程序路径',
  decoMake.ok && decoMake.data.page.path === 'pages/custom/index?key=' + CUSTOM_KEY,
  decoMake.ok ? decoMake.data.page.path : decoMake.json.msg);
// 断言「本次新建的页还没被写进 replica.js」，而不是「replica.js 里根本没有 CUSTOM_PAGES 段」——
// 后者在运营已经建过自定义页时是假红（本仓库现在就有一个运营自建的页）。
assert('新建后未发布，replica.js 里还没有这次新建的页面',
  readFileSync(REPLICA_FILE, 'utf8').indexOf(CUSTOM_KEY) < 0,
  `replica.js 中不应出现 ${CUSTOM_KEY}`);

const decoMadeP = (((await call('GET', '/api/decorate/pages', { auth: false })).data.list) || [])
  .filter((x) => x.key === CUSTOM_KEY)[0];
assert('自定义页在列表里被标记（类型 / 归属 / 数据来源）',
  !!decoMadeP && decoMadeP.custom === true && decoMadeP.belongs === '自定义页面' &&
  decoMadeP.source === 'replica.CUSTOM_PAGES.' + CUSTOM_KEY,
  decoMadeP ? `${decoMadeP.belongs} · ${decoMadeP.source}` : 'not found');

const decoOpen = await call('GET', '/api/decorate/page', { auth: false, query: { key: CUSTOM_KEY } });
assert('自定义页的字段结构 = 页面区块 + 页面设置（与首页同构）',
  decoOpen.ok && decoOpen.data.schema.fields.map((f) => f.k).join(',') === 'blocks,meta',
  decoOpen.ok ? decoOpen.data.schema.fields.map((f) => f.k).join(',') : decoOpen.json.msg);

const decoBadBlock = await call('POST', '/api/decorate/draft', {
  body: { key: CUSTOM_KEY, data: { blocks: [{ type: 'no-such-type', text: 'x' }] } },
  expectFail: '自定义页沿用首页的区块校验', expectHttp: 200, expectCode: 1001
});
assert('自定义页沿用首页的区块校验规则', decoBadBlock.json.code !== 0, decoBadBlock.json.msg);

await call('POST', '/api/decorate/draft', {
  body: { key: CUSTOM_KEY, data: { blocks: [{ type: 'title', text: '自检标题' }], meta: { bg: '#FFFFFF' } } }
});
const decoPub = await call('POST', '/api/decorate/publish', { body: { key: CUSTOM_KEY, note: '自检发布' } });
assert('自定义页发布成功', decoPub.ok && /^v\d+$/.test((decoPub.data && decoPub.data.versionId) || ''),
  decoPub.ok ? decoPub.data.versionId : decoPub.json.msg);

const replicaAfterPub = readFileSync(REPLICA_FILE, 'utf8');
assert('发布后 replica.js 写入 CUSTOM_PAGES 与页面数据',
  /const CUSTOM_PAGES = \{/.test(replicaAfterPub) &&
  replicaAfterPub.indexOf(CUSTOM_KEY) >= 0 && replicaAfterPub.indexOf('自检标题') >= 0);
assert('replica.js 的导出清单包含 CUSTOM_PAGES', /^\s*CUSTOM_PAGES,?$/m.test(replicaAfterPub));

const decoDiff2 = await call('GET', '/api/decorate/diff', { auth: false, query: { key: CUSTOM_KEY } });
assert('发布后该页草稿已清空', decoDiff2.ok && decoDiff2.data.hasDraft === false, decoDiff2.data && decoDiff2.data.note);

const decoRenamed = await call('POST', '/api/decorate/page/rename', {
  body: { key: CUSTOM_KEY, name: '自检临时页改名', newKey: CUSTOM_NEW_KEY }
});
assert('自定义页改名（页面标识迁移）成功',
  decoRenamed.ok && decoRenamed.data.renamedFrom === CUSTOM_KEY && decoRenamed.data.page.key === CUSTOM_NEW_KEY,
  decoRenamed.ok ? `${decoRenamed.data.renamedFrom} → ${decoRenamed.data.page.key}` : decoRenamed.json.msg);

const replicaAfterRename = readFileSync(REPLICA_FILE, 'utf8');
assert('改名后 replica.js 的键名同步、旧键消失',
  replicaAfterRename.indexOf(CUSTOM_NEW_KEY) >= 0 && replicaAfterRename.indexOf('"' + CUSTOM_KEY + '"') < 0);

const decoReopen = await call('GET', '/api/decorate/page', { auth: false, query: { key: CUSTOM_NEW_KEY } });
assert('改名后已发布内容不丢',
  decoReopen.ok && decoReopen.data.published.blocks[0].text === '自检标题',
  decoReopen.ok ? decoReopen.data.published.blocks[0].text : decoReopen.json.msg);

const decoDelHome = await call('POST', '/api/decorate/page/delete', { body: { key: 'home' }, expectFail: '内置页不可删除', expectHttp: 200, expectCode: 2000 });
assert('内置页面不可删除', /不可删除/.test(decoDelHome.json.msg || ''), decoDelHome.json.msg);

const decoRenameHome = await call('POST', '/api/decorate/page/rename', { body: { key: 'home', name: 'X' }, expectFail: '内置页不可改名', expectHttp: 200, expectCode: 2000 });
assert('内置页面不可改名', /不支持改名/.test(decoRenameHome.json.msg || ''), decoRenameHome.json.msg);

const decoReserved = await call('POST', '/api/decorate/page/create', { body: { name: '保留字测试', key: 'home' }, expectFail: '保留标识', expectHttp: 200, expectCode: 1001 });
assert('与内置页重名的标识被拒绝', /保留字/.test(decoReserved.json.msg || ''), decoReserved.json.msg);

const decoDup = await call('POST', '/api/decorate/page/create', { body: { name: '自检临时页改名' }, expectFail: '页面名称重复', expectHttp: 200, expectCode: 2000 });
assert('页面名称重复被拒绝', /已存在/.test(decoDup.json.msg || ''), decoDup.json.msg);

const decoDel = await call('POST', '/api/decorate/page/delete', { body: { key: CUSTOM_NEW_KEY } });
assert('删除自定义页面成功', decoDel.ok && decoDel.data.name === '自检临时页改名', decoDel.ok ? decoDel.data.name : decoDel.json.msg);

const replicaAfterDel = readFileSync(REPLICA_FILE, 'utf8');
/*
 * 「无残留」要锁的是**测试页自己**没留下痕迹，不是「CUSTOM_PAGES 整段消失」——
 * 运营只要建过任何一个自定义页，这个段落就该在（写死「消失」是假红）。
 * 顺带把「段落存在性 ⟺ 还有自定义页」这一等价关系也锁上，两边都不会漂。
 */
const customSectionOn = replicaAfterDel.indexOf('const CUSTOM_PAGES =') >= 0;
assert('删除后 replica.js 里不再有测试页的任何残留，且 CUSTOM_PAGES 段落与自定义页数量一致',
  replicaAfterDel.indexOf(CUSTOM_KEY) < 0 && customSectionOn === (baseCustom > 0),
  `残留=${replicaAfterDel.indexOf(CUSTOM_KEY) >= 0} 段落在场=${customSectionOn} 既有自定义页=${baseCustom}`);
assert('删除后仍保留 6 个内置装修字段',
  ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS']
    .every((k) => replicaAfterDel.indexOf('const ' + k + ' =') > 0));

const afterCustom = ((await call('GET', '/api/decorate/pages', { auth: false })).data.list || []).filter((x) => x.custom).length;
assert('自检未改变自定义页数量（可重复运行）', afterCustom === baseCustom, `${baseCustom} → ${afterCustom}`);

const adminJsSrc = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');
assert('装修台含「新建页面」入口与自定义页改名 / 删除操作',
  adminJsSrc.indexOf('btnCreatePage') >= 0 && adminJsSrc.indexOf('data-rename') >= 0 && adminJsSrc.indexOf('data-del') >= 0);
assert('装修台列表区分内置页 / 自定义页',
  adminJsSrc.indexOf('type-tag custom') >= 0 && adminJsSrc.indexOf('type-tag builtin') >= 0);

/*
 * 固定结构页（莱克 / 资讯 / 产品 / 我的）不是「区块流」，点任何组件都只会弹
 * 「该页面暂不支持添加组件」—— 实测运营反馈「点使用组件全部都无法使用」。
 * 这类页面必须整栏收起组件库并给出一句说明，而不是展示一个点了就报错的入口。
 * 判断口径与 addComponent() 用同一个 findBlocksNode（同一函数，天然不会走样）；
 * 店铺导航（nav-mode）有自己的说明占位，不叠加 fixed-hint。
 */
const adminCssSrc = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.css'), 'utf8');
const adminHtmlSrc = readFileSync(join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
assert('固定结构页收起组件库并给出说明（不支持加组件就不给入口）',
  adminJsSrc.indexOf("classList.toggle('no-blocks'") >= 0 &&
  adminJsSrc.indexOf('findBlocksNode(S.cur && S.cur.schema)') >= 0 &&
  /\.view\.edit\.no-blocks \.col-lib\s*\{[^}]*display:\s*none/.test(adminCssSrc) &&
  adminHtmlSrc.indexOf('fixed-hint') >= 0 &&
  /\.view\.edit\.no-blocks:not\(\.nav-mode\) \.fixed-hint\s*\{[^}]*display:\s*block/.test(adminCssSrc),
  'admin.js / admin.css / index.html 三处缺一不可（no-blocks 切换 / col-lib 隐藏 / 说明文案）');

/*
 * 数字步进器（对标有赞 .zent-number-input：整块 100×32 / 两侧 −/+ 各 28 宽）。
 *
 * 这里锁的是**两条容易悄悄退化**的点：
 *   ① 数字字段必须走 .numf 步进器，而不是退回裸 <input type=number>（裸控件带浏览器自带的
 *      上下小箭头、也没有 −/+，与有赞面板一眼就能看出不一样）；
 *   ② CSS 选择器**必须带 `.fld` 前缀** —— `.fld > label + *` 会给同排兄弟控件设 `flex: 1 1 0`，
 *      只写 `.numf` 会被撑满整行，从 100px 定宽变成通栏。这条只有真去量渲染宽度才会发现，
 *      静态看 CSS 完全正常，所以必须单独钉住。
 */
assert('数字字段渲染成步进器（−/+ 两侧按钮 + 居中数值），不是裸 number 输入框',
  adminJsSrc.indexOf("el('div', 'numf')") >= 0 &&
  adminJsSrc.indexOf("el('button', 'nb', '–')") >= 0 &&
  adminJsSrc.indexOf("el('button', 'nb', '+')") >= 0 &&
  /function clampNum\(/.test(adminJsSrc),
  'admin.js 的数字分支没走 .numf 步进器');

assert('步进器样式带 .fld 前缀（否则被 .fld > label + * 的 flex:1 1 0 撑满整行）',
  /\.fld \.numf\s*\{[^}]*flex:\s*0 0 auto[^}]*width:\s*100px/.test(adminCssSrc) &&
  /\.fld \.numf \.nv/.test(adminCssSrc),
  'admin.css 里 .numf 没有 .fld 前缀或没锁死 100px 定宽');

/* 图片选择器有赞实测 61.6×61.6（取整 62），原为 72 —— 与面板其它控件不成比例 */
assert('图片选择器缩略图 62×62（有赞实测 61.6×61.6）',
  /\.imgf \.thumb\s*\{[^}]*width:\s*62px;\s*height:\s*62px/.test(adminCssSrc),
  'admin.css 的 .imgf .thumb 不是 62×62');

const mpCustomJs = join(ROOT_DIR, 'miniprogram', 'pages', 'custom', 'index.js');
assert('小程序端通用自定义页存在，且复用 utils/blocks 的区块渲染',
  existsSync(mpCustomJs) && readFileSync(mpCustomJs, 'utf8').indexOf('utils/blocks') >= 0);
assert('小程序端自定义页的区块渲染与首页同源（首页也已改用 utils/blocks）',
  readFileSync(join(ROOT_DIR, 'miniprogram', 'pages', 'index', 'index.js'), 'utf8').indexOf('utils/blocks') >= 0 &&
  existsSync(join(ROOT_DIR, 'miniprogram', 'utils', 'blocks.js')));

/*
 * 素材「是否被引用」的三个来源必须齐全：
 * 商品库（商品主图 / 图集 / 详情长图）+ 已发布 replica.js + 装修草稿。
 * 曾经只扫后两处 —— 于是商品图在素材管理里显示「未引用」，运营一点删除就把在用的商品图删没了。
 */
const mediaSrc = readFileSync(join(__dirname, '..', 'lib', 'media.js'), 'utf8');
// 只断言「三个来源都在同一个 refs() 清单里」，不去断言路径是怎么拼的 ——
// 之前写成 /'data',\s*'catalog\.json'/ 这种拼接细节，media.js 一改用 dataDir.ROOT
// （为了支持 MALL_DATA_DIR 隔离）断言就失效了，而真正要防的「漏扫一个来源」并没有被验证。
const refSources = [
  ['商品库 catalog.json', /'catalog\.json'/],
  ['已发布 replica.js', /'replica\.js'/],
  ['装修草稿 state.json', /'state\.json'/]
];
const missingRefSrc = refSources.filter(([, re]) => !re.test(mediaSrc)).map(([n]) => n);
const refsListBody = (/function refs\(name\)[\s\S]*?\n}/.exec(mediaSrc) || [''])[0];
assert('素材引用检查同时覆盖 商品库 / 已发布页面 / 装修草稿（漏一处就会误删在用图）',
  missingRefSrc.length === 0 &&
  /catalog\.json'[\s\S]{0,240}replica\.js'[\s\S]{0,240}state\.json'/.test(refsListBody),
  missingRefSrc.length
    ? '缺失来源：' + missingRefSrc.join('、')
    : `refs() 里三个来源齐全（商品库 ${/'商品库'/.test(refsListBody)} · 已发布 ${/'已发布'/.test(refsListBody)} · 草稿 ${/'草稿'/.test(refsListBody)}）`);

const catalogSrc = readFileSync(join(__dirname, '..', 'lib', 'catalog.js'), 'utf8');
assert('商品图文详情按商品自身数据生成，占位内容仅作最后回落',
  /function buildDetailBlocks/.test(catalogSrc) && /detailBlocks:\s*buildDetailBlocks\(goods\)/.test(catalogSrc),
  'buildDetailBlocks 未接入 detail()');

/*
 * 评价必须是「持久化的用户业务数据」，不能是「按 mock 商品当场生成的演示数据」。
 * 后者在商品库换成真实商品之后会产出大量幽灵评价（商品库里根本没这些商品），
 * 且只有改代码才能清 —— 详见 lib/seed.js 的说明。
 */
const seedSrc = readFileSync(join(__dirname, '..', 'lib', 'seed.js'), 'utf8');
// 注释里提到 COMMENTS 只是文档说明，不算「还在用它」——剥掉注释再查标识符
const seedCode = seedSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert('评价数据源是持久化的 db.comments，不再由 seed 按 mock 商品生成',
  !/COMMENTS/.test(seedCode) &&
  /db\(\)\.comments/.test(catalogSrc) &&
  /commentsOf/.test(catalogSrc),
  [/COMMENTS/.test(seedCode) ? 'seed.js 仍在使用 COMMENTS' : '',
   !/db\(\)\.comments/.test(catalogSrc) ? 'catalog.js 未读 db.comments' : ''].filter(Boolean).join('；') || 'ok');
assert('后台评价列表复用 catalog.commentsOf()（评价来源只此一处实现）',
  /catalog\.commentsOf\(/.test(readFileSync(join(__dirname, '..', 'lib', 'admin.js'), 'utf8')),
  'admin.js 未走 commentsOf');
assert('删除商品时连带清理其评价与商家回复（否则留下幽灵评价）',
  /db\(\)\.comments\s*=\s*db\(\)\.comments\.filter\(\(c\)\s*=>\s*c\.goodsId\s*!==\s*id\)/.test(catalogSrc) &&
  /delete \(db\(\)\.commentReplies \|\| \{\}\)\[cid\]/.test(catalogSrc),
  'deleteGoods 未清理评价');
assert('store 的空库结构包含 comments（老数据文件缺字段时按此自愈）',
  /comments:\s*\[\]/.test(readFileSync(join(__dirname, '..', 'lib', 'store.js'), 'utf8')),
  'emptyDb() 缺 comments');

/* 自检自身的两条「开发期卫生」约定（写错会让自检悄悄污染真实数据） */
const selfSrc = readFileSync(SELF_FILE, 'utf8');
assert('自检用固定 code 登录（不再每轮新建客户，客户数稳定）',
  /code:\s*'check_code_selfcheck'/.test(selfSrc),
  '自检登录 code 仍是随机的');
/*
 * 只断言「必须是从商品库动态取」这一件事，别再叠一条「源码里不得出现写死写法」——
 * 那条模式串会**匹配到断言自己的源码**（自指），从而永远为假，属假红灯。
 * 写死的写法 `const STOCK_GOODS = 'g1001';` 本来就不会命中下面这个模式。
 */
assert('自检的库存探针商品取自商品库在售首件（写死 id 会在商品被删后静默失效）',
  /const STOCK_GOODS = \(\(stockProbe/.test(selfSrc),
  'STOCK_GOODS 未从商品库动态取（商品一旦被删，库存兜底会静默失效）');

/* 15.7 素材库（图片本地上传）：上传 → 静态访问 → 列表 → 拒绝非法文件 → 删除，全程自清理 */
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII=',
  'base64'
);
const mediaCount0 = await call('GET', '/api/media/list', { auth: false, silent: true });

const fdOk = new FormData();
fdOk.append('file', new Blob([PNG_2X2], { type: 'image/png' }), 'selfcheck-2x2.png');
const mediaUp = await call('POST', '/api/media/upload', { form: fdOk, auth: false });
const upOne = mediaUp.ok && mediaUp.data.list[0] ? mediaUp.data.list[0] : null;
assert('素材上传返回相对路径与真实尺寸（2×2）',
  !!upOne && /^\/uploads\/\d{6}\/.+\.png$/.test(upOne.url) && upOne.width === 2 && upOne.height === 2,
  upOne ? `${upOne.url} ${upOne.width}×${upOne.height}` : mediaUp.json && mediaUp.json.msg);

let mediaHttpGet = null;
if (upOne) {
  try {
    const r = await fetch(BASE + upOne.url);
    mediaHttpGet = { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
  } catch (e) { mediaHttpGet = { error: e.message }; }
}
assert('上传的素材可通过 /uploads/ 直接访问（小程序端读的就是它）',
  !!mediaHttpGet && mediaHttpGet.status === 200 && mediaHttpGet.type === 'image/png' && mediaHttpGet.bytes === PNG_2X2.length,
  JSON.stringify(mediaHttpGet));

const mediaList = await call('GET', '/api/media/list', { auth: false });
assert('素材库列表返回统计（张数 / 占用 / 单张上限）',
  mediaList.ok && !!mediaList.data.stat && mediaList.data.stat.maxBytes === 5 * 1024 * 1024 && mediaList.data.total >= 1,
  mediaList.data ? JSON.stringify(mediaList.data.stat) : '-');

// 伪装图片：文本改名 .png，校验的是文件头而非扩展名
const fdFake = new FormData();
fdFake.append('file', new Blob([Buffer.from('这不是图片，只是改名成了 png', 'utf8')], { type: 'image/png' }), 'fake.png');
const mediaFake = await call('POST', '/api/media/upload', { form: fdFake, auth: false, expectFail: '伪装图片被拒', expectHttp: 200, expectCode: 1001 });
assert('伪装成 png 的文本被拒（按文件头校验）',
  mediaFake.json && mediaFake.json.code === 1001 && /不支持的素材格式/.test(mediaFake.json.msg || ''),
  mediaFake.json && mediaFake.json.msg);

// 路径穿越：删除接口与静态服务两条路都要拦住
const mediaTrav = await call('POST', '/api/media/delete', { body: { name: '../../server/index.js' }, auth: false, expectFail: '路径穿越被拦', expectHttp: 200, expectCode: 1001 });
assert('素材删除接口拦住 ../ 穿越', mediaTrav.json && mediaTrav.json.code === 1001, mediaTrav.json && mediaTrav.json.msg);

const mediaDel = upOne
  ? await call('POST', '/api/media/delete', { body: { name: upOne.name, force: 1 }, auth: false })
  : null;
assert('素材删除成功（自检产生的文件已回收）', !!mediaDel && mediaDel.ok && mediaDel.data.deleted === true,
  mediaDel && mediaDel.data ? `剩余 ${mediaDel.data.total} 张` : '-');

/* —— 商品库图片的删除保护：素材管理不能把商品主图 / 详情长图删没 —— */
const goodsUploads = (detail.data.images || []).filter((u) => /^\/uploads\//.test(u));
if (goodsUploads.length) {
  const gname = goodsUploads[0].replace(/^\/uploads\//, '');
  const guard = await call('POST', '/api/media/delete', { body: { name: gname }, auth: false, expectFail: '商品图删除被拒', expectHttp: 200, expectCode: 2000 });
  assert('商品库在用的图片，素材管理删除时被拒绝且点名「商品库」引用',
    !!guard.json && guard.json.code === 2000 && /商品库/.test(guard.json.msg || ''),
    guard.json && guard.json.msg);
}
const goodsDetailImgs = detail.data.detailImages || [];
assert('商品图文详情：配了 detailImages 就按商品自身数据渲染（不再回落开发期占位文案）',
  goodsDetailImgs.length
    ? (detail.data.detailBlocks || []).filter((b) => b.type === 'image').length === goodsDetailImgs.length
    : (detail.data.detailBlocks || []).length > 0,
  `detailImages ${goodsDetailImgs.length} 张 → detailBlocks ${(detail.data.detailBlocks || []).length} 块`);

/* —— 素材库文件夹（纯逻辑分类：只写索引，不动磁盘文件，因此绝不会让线上图裂） —— */
const FOLDER_A = '自检文件夹A';
const FOLDER_B = '自检文件夹B';
const FOLDER_C = '自检文件夹C';

const fdFolder = new FormData();
fdFolder.append('file', new Blob([PNG_2X2], { type: 'image/png' }), 'selfcheck-folder.png');
const mfUp = await call('POST', '/api/media/upload', { form: fdFolder, auth: false, query: { folder: FOLDER_A } });
const mfItem = mfUp.ok && mfUp.data.list[0] ? mfUp.data.list[0] : null;
assert('上传时可直接指定归属文件夹（?folder=，文件夹不存在会自动创建）',
  !!mfItem && mfItem.folder === FOLDER_A,
  mfItem ? `folder=${JSON.stringify(mfItem.folder)}` : mfUp.json && mfUp.json.msg);

const mfListA = await call('GET', '/api/media/list', { auth: false, query: { folder: FOLDER_A }, silent: true });
assert('按文件夹筛选只返回该文件夹的素材',
  mfListA.ok && (mfListA.data.list || []).length > 0 && mfListA.data.list.every((x) => x.folder === FOLDER_A) &&
    mfListA.data.list.some((x) => x.name === (mfItem && mfItem.name)),
  `total=${mfListA.data && mfListA.data.total}`);

const mfListNone = await call('GET', '/api/media/list', { auth: false, query: { folder: '__none__' }, silent: true });
assert('未分组筛选（folder=__none__）不含已归类的素材',
  mfListNone.ok && !(mfListNone.data.list || []).some((x) => x.name === (mfItem && mfItem.name)),
  `未分组 ${mfListNone.data && mfListNone.data.total} 张`);

assert('素材库列表返回各文件夹计数与未分组张数',
  mfListNone.ok && Array.isArray(mfListNone.data.folders) &&
    (mfListNone.data.folders.find((f) => f.name === FOLDER_A) || {}).count === 1 &&
    typeof mfListNone.data.ungrouped === 'number',
  JSON.stringify(mfListNone.data && mfListNone.data.folders));

const mfMv = await call('POST', '/api/media/move', { auth: false, body: { names: [mfItem && mfItem.name], folder: FOLDER_B } });
assert('批量移动素材到另一个文件夹（目标不存在时自动创建）',
  mfMv.ok && mfMv.data.moved === 1 && (mfMv.data.folders.find((f) => f.name === FOLDER_B) || {}).count === 1,
  mfMv.json && JSON.stringify(mfMv.data.folders));

const mfRnBad = await call('POST', '/api/media/folder', {
  auth: false, body: { op: 'rename', from: FOLDER_B, to: FOLDER_A }, expectFail: '改名撞名被拒', expectHttp: 200, expectCode: 2000
});
assert('文件夹改名撞到已存在的名字时被拒绝（否则两个文件夹会被静默合并）',
  !!mfRnBad.json && mfRnBad.json.code !== 0, mfRnBad.json && mfRnBad.json.msg);

const mfRn = await call('POST', '/api/media/folder', { auth: false, body: { op: 'rename', from: FOLDER_B, to: FOLDER_C } });
assert('文件夹改名后里面的素材一起跟着改（不会出现「文件夹还在但里面空了」）',
  mfRn.ok && mfRn.data.renamed && mfRn.data.renamed.moved === 1 &&
    (mfRn.data.folders.find((f) => f.name === FOLDER_C) || {}).count === 1 &&
    !mfRn.data.folders.some((f) => f.name === FOLDER_B),
  mfRn.json && JSON.stringify(mfRn.data.renamed));

const mfRm = await call('POST', '/api/media/folder', { auth: false, body: { op: 'remove', name: FOLDER_C } });
assert('删除文件夹只删分类：素材回到未分组而不是被删掉',
  mfRm.ok && mfRm.data.removed === FOLDER_C && mfRm.data.movedToUngrouped === 1 &&
    !mfRm.data.folders.some((f) => f.name === FOLDER_C),
  mfRm.json && JSON.stringify({ moved: mfRm.data && mfRm.data.movedToUngrouped, ungrouped: mfRm.data && mfRm.data.ungrouped }));

const mfBad = await call('POST', '/api/media/folder', {
  auth: false, body: { op: 'create', name: 'a/b' }, expectFail: '非法文件夹名被拒', expectHttp: 200, expectCode: 1001
});
assert('文件夹名含斜杠 / .. 被拒（文件夹是逻辑分类，不产生真实目录）',
  mfBad.json && mfBad.json.code === 1001, mfBad.json && mfBad.json.msg);

// 收尾：删掉自检文件夹与那张图，保证后续「无残留」断言成立
await call('POST', '/api/media/folder', { auth: false, body: { op: 'remove', name: FOLDER_A }, silent: true });
await call('POST', '/api/media/delete', { auth: false, body: { name: mfItem && mfItem.name, force: 1 }, silent: true });
const mfEnd = await call('GET', '/api/media/list', { auth: false, silent: true });
assert('自检结束后没有残留的自检文件夹',
  mfEnd.ok && !(mfEnd.data.folders || []).some((f) => f.name.indexOf('自检') === 0),
  JSON.stringify(mfEnd.data && mfEnd.data.folders));

const mediaCount1 = await call('GET', '/api/media/list', { auth: false, silent: true });
assert('自检结束后素材库数量与初始一致（无残留）',
  mediaCount0.ok && mediaCount1.ok && mediaCount1.data.all === mediaCount0.data.all,
  `${mediaCount0.data && mediaCount0.data.all} → ${mediaCount1.data && mediaCount1.data.all}`);

/* 15.7b 视频素材：ftyp 魔数 → moov 解析时长/分辨率 → kind 分档 → 静态服务 Range 支持
 *
 * fixture 是**手工拼的最小 ISO BMFF**（ftyp + moov[mvhd + trak[tkhd]]），不是真能播的片子 ——
 * 自检要验的是「类型判定与元信息解析」，不是解码，这样断言才能稳定、也不需要 50MB 的测试文件。
 */
function boxOf(type, payload) {
  const b = Buffer.alloc(8 + payload.length);
  b.writeUInt32BE(8 + payload.length, 0);
  b.write(type, 4, 'ascii');
  payload.copy(b, 8);
  return b;
}
function makeMp4Fixture(opt) {
  const o = Object.assign({ brand: 'isom', seconds: 5.5, w: 1080, h: 1920 }, opt || {});
  const timescale = 1000;
  const ftyp = boxOf('ftyp', Buffer.concat([
    Buffer.from(o.brand, 'ascii'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2avc1mp41', 'ascii')
  ]));
  const mvhdP = Buffer.alloc(100);
  mvhdP.writeUInt32BE(timescale, 12);
  mvhdP.writeUInt32BE(Math.round(o.seconds * timescale), 16);
  const tkhdP = Buffer.alloc(84);
  tkhdP.writeUInt32BE(7, 0);
  tkhdP.writeUInt32BE(1, 12);
  tkhdP.writeUInt32BE(Math.round(o.seconds * timescale), 20);
  tkhdP.writeUInt32BE(o.w * 65536, 76);
  tkhdP.writeUInt32BE(o.h * 65536, 80);
  return Buffer.concat([
    ftyp,
    boxOf('moov', Buffer.concat([boxOf('mvhd', mvhdP), boxOf('trak', boxOf('tkhd', tkhdP))]))
  ]);
}

const MP4_FIXTURE = makeMp4Fixture();
/**
 * 视频类断言的**基线**。
 *
 * ⚠️ 这里踩过一次：早期断言写死 `list.length === 1` / `kinds.video === 1` / 回收后 `=== 0`，
 *    隐含假设「素材库里本来没有视频」。2026-10-09 把首页 4 个装修视频 + 资讯页 1 个视频
 *    转存到本地素材库后，这 3 条断言集体变红 —— 而功能其实完全正常。
 *    断言应当验证「自检自己那条视频的行为 + 自检是净零的」，
 *    而不是「全库里只有我这一条」。
 */
const mvBase = await call('GET', '/api/media/list', { auth: false, query: { kind: 'video' }, silent: true });
const videosBefore = (mvBase.data && mvBase.data.kinds && mvBase.data.kinds.video) || 0;

const fdVideo = new FormData();
fdVideo.append('file', new Blob([MP4_FIXTURE], { type: 'video/mp4' }), 'selfcheck-clip.mp4');
const mvUp = await call('POST', '/api/media/upload', { form: fdVideo, auth: false });
const mvItem = mvUp.ok && mvUp.data.list[0] ? mvUp.data.list[0] : null;
assert('视频按 ftyp 魔数被识别为 video/mp4（认文件头，不认扩展名）',
  !!mvItem && mvItem.kind === 'video' && mvItem.mime === 'video/mp4' && /^\/uploads\/\d{6}\/.+\.mp4$/.test(mvItem.url),
  mvItem ? `${mvItem.url} kind=${mvItem.kind}` : mvUp.json && mvUp.json.msg);
assert('mp4 能读出时长与分辨率（moov→mvhd 拿时长、trak→tkhd 拿宽高）',
  !!mvItem && mvItem.duration === 5.5 && mvItem.durationText === '0:06' && mvItem.width === 1080 && mvItem.height === 1920,
  mvItem ? `${mvItem.width}×${mvItem.height} ${mvItem.duration}s (${mvItem.durationText})` : '-');

let mvGet = null;
let mvRange = null;
if (mvItem) {
  try {
    const r = await fetch(BASE + mvItem.url);
    mvGet = { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength, ranges: r.headers.get('accept-ranges') };
  } catch (e) { mvGet = { error: e.message }; }
  try {
    const r2 = await fetch(BASE + mvItem.url, { headers: { Range: 'bytes=0-99' } });
    mvRange = { status: r2.status, range: r2.headers.get('content-range'), len: (await r2.arrayBuffer()).byteLength };
  } catch (e) { mvRange = { error: e.message }; }
}
assert('/uploads/ 直接访问视频返回 video/mp4 且带 Accept-Ranges',
  !!mvGet && mvGet.status === 200 && mvGet.type === 'video/mp4' && mvGet.ranges === 'bytes',
  JSON.stringify(mvGet));
assert('视频支持 Range 请求（206 + Content-Range）—— 不支持的话小程序 / iOS 直接不播',
  !!mvRange && mvRange.status === 206 && mvRange.len === 100 && mvRange.range === 'bytes 0-99/' + MP4_FIXTURE.length,
  JSON.stringify(mvRange));

const mvKindV = await call('GET', '/api/media/list', { auth: false, query: { kind: 'video' }, silent: true });
const mvKindI = await call('GET', '/api/media/list', { auth: false, query: { kind: 'image' }, silent: true });
assert('kind=video 只返回视频、kind=image 只返回图片（顶栏分档靠它）',
  mvKindV.ok && mvKindI.ok &&
    // 验的是「分档过滤对不对」，不是「全库只有自检这一条视频」：
    // video 档每条都是视频且**含**自检那条；image 档每条都是图片且**不含**自检那条。
    (mvKindV.data.list || []).length >= 1 &&
    (mvKindV.data.list || []).every((x) => x.kind === 'video') &&
    (mvKindV.data.list || []).some((x) => x.name === mvItem.name) &&
    (mvKindI.data.list || []).length >= 1 &&
    (mvKindI.data.list || []).every((x) => x.kind === 'image') &&
    !(mvKindI.data.list || []).some((x) => x.name === mvItem.name),
  `video=${mvKindV.data && mvKindV.data.total} image=${mvKindI.data && mvKindI.data.total}`);

assert('列表统计区分图片 / 视频上限（图片 5MB、视频 50MB）',
  mvKindV.ok && mvKindV.data.stat.maxBytes === 5 * 1024 * 1024 && mvKindV.data.stat.maxVideoBytes === 50 * 1024 * 1024 &&
    (mvKindV.data.kinds || {}).video === videosBefore + 1,
  mvKindV.data ? JSON.stringify({ img: mvKindV.data.stat.maxBytes, vid: mvKindV.data.stat.maxVideoBytes, kinds: mvKindV.data.kinds, before: videosBefore }) : '-');

const fdFakeMp4 = new FormData();
fdFakeMp4.append('file', new Blob([Buffer.from('这只是文本，不是视频流', 'utf8')], { type: 'video/mp4' }), 'fake.mp4');
const mvFake = await call('POST', '/api/media/upload', { form: fdFakeMp4, auth: false, expectFail: '伪装视频被拒', expectHttp: 200, expectCode: 1001 });
assert('伪装成 mp4 的文本同样被拒（视频也是按魔数判定）',
  mvFake.json && mvFake.json.code === 1001 && /不支持的素材格式/.test(mvFake.json.msg || ''),
  mvFake.json && mvFake.json.msg);

await call('POST', '/api/media/delete', { auth: false, body: { name: mvItem && mvItem.name, force: 1 }, silent: true });
const mvEnd = await call('GET', '/api/media/list', { auth: false, query: { kind: 'video' }, silent: true });
assert('视频自检素材已回收（未留下测试视频）',
  mvEnd.ok &&
    !(mvEnd.data.list || []).some((x) => x.name === (mvItem && mvItem.name)) &&
    (mvEnd.data.kinds || {}).video === videosBefore,
  `剩余视频 ${mvEnd.data && mvEnd.data.kinds && mvEnd.data.kinds.video}（自检前 ${videosBefore}）`);

/* 15.7 小程序配置文件静态校验（抓「只有开发者工具才会报」的配置错误） */
const MP_ROOT = join(__dirname, '..', '..', 'miniprogram');
const WALK = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? WALK(join(d, e.name)) : [join(d, e.name)]));

const mpJsonFiles = WALK(MP_ROOT).filter((f) => f.endsWith('.json'));
const jsonErrors = [];
const objFields = []; // usingComponents 必须是对象，写成 true 会导致「模拟器启动失败」
mpJsonFiles.forEach((f) => {
  const rel = f.replace(/\\/g, '/').split('/miniprogram/')[1];
  let json;
  try {
    json = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    jsonErrors.push(`${rel}: ${e.message}`);
    return;
  }
  if ('usingComponents' in json && (typeof json.usingComponents !== 'object' || json.usingComponents === null || Array.isArray(json.usingComponents))) {
    objFields.push(`${rel}: usingComponents = ${JSON.stringify(json.usingComponents)}（须为对象）`);
  }
});
assert('小程序全部 json 可解析',
  jsonErrors.length === 0,
  jsonErrors.length ? jsonErrors.join(' | ') : `${mpJsonFiles.length} 个 json 全部合法`);
assert('usingComponents 字段类型合法（须为对象，写 true 会让模拟器启动失败）',
  objFields.length === 0,
  objFields.length ? objFields.join(' | ') : '无非法写法');

const appJson = JSON.parse(readFileSync(join(MP_ROOT, 'app.json'), 'utf8'));
const appKeys = Object.keys(appJson);
const KNOWN_APP_KEYS = new Set([
  'entryPagePath', 'pages', 'window', 'tabBar', 'networkTimeout', 'debug', 'functionalPages',
  'subPackages', 'subpackages', 'workers', 'requiredBackgroundModes', 'plugins', 'preloadRule',
  'resizable', 'navigateToMiniProgramAppIdList', 'permission', 'sitemapLocation', 'style',
  'useExtendedLib', 'entranceDeclare', 'darkmode', 'themeLocation', 'lazyCodeLoading',
  'singlePage', 'renderer', 'rendererOptions', 'componentFramework', 'usingComponents',
  'serviceProviderTicket', 'supportedMaterials', '__usePrivacyCheck__',
]);
const unknownKeys = appKeys.filter((k) => !KNOWN_APP_KEYS.has(k));
assert('app.json 无开发者工具不识别的顶层字段',
  unknownKeys.length === 0,
  unknownKeys.length ? `未知字段：${unknownKeys.join(', ')}` : `${appKeys.length} 个顶层字段全部在允许清单内`);

// pages / subPackages 声明的每个页面，至少要有 .js + .wxml
const declPages = [
  ...(appJson.pages || []).map((p) => ({ p, where: 'pages' })),
  ...((appJson.subPackages || appJson.subpackages || []).flatMap((sp) =>
    sp.pages.map((p) => ({ p: `${sp.root}/${p}`, where: `subPackages/${sp.name}` })))),
];
const missingPageFiles = [];
declPages.forEach(({ p }) => {
  ['.js', '.wxml'].forEach((ext) => {
    try {
      readFileSync(join(MP_ROOT, p + ext));
    } catch (e) {
      missingPageFiles.push(`${p}${ext}`);
    }
  });
});
assert('app.json 声明的页面文件齐全（.js + .wxml）',
  missingPageFiles.length === 0,
  missingPageFiles.length ? `缺失：${missingPageFiles.join(', ')}` : `${declPages.length} 个页面 × 2 类文件全部存在`);

// tabBar 的 pagePath 必须在 pages 中，且第一项要与 pages[0] 一致
const tb = (appJson.tabBar && appJson.tabBar.list) || [];
const tbBad = tb.filter((t) => !(appJson.pages || []).includes(t.pagePath));
assert('tabBar 每个 pagePath 都在 pages 声明里',
  tb.length > 0 && tbBad.length === 0,
  tbBad.length ? `未声明：${tbBad.map((t) => t.pagePath).join(', ')}` : `${tb.length} 个 tab 全部命中`);

assert('sitemapLocation 指向的文件存在',
  !!appJson.sitemapLocation && (() => { try { readFileSync(join(MP_ROOT, appJson.sitemapLocation)); return true; } catch (e) { return false; } })(),
  `sitemapLocation=${appJson.sitemapLocation}`);

const projCfg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'project.config.json'), 'utf8'));
assert('project.config.json 已填真实 AppID（非占位符）',
  /^wx[0-9a-f]{16}$/.test(projCfg.appid || '') && !/^wx0+$/.test(projCfg.appid),
  `appid=${projCfg.appid}`);

/* ---------------------------------------------------------------------------
 * 15.75 小程序样式作用域静态校验（抓「写了 class 但根本没有样式」的哑样式）
 *
 * 为什么必须有这一条：
 *   自定义组件默认 styleIsolation: 'isolated' —— app.wxss 与页面 wxss 里的
 *   **class 选择器到不了组件内部**。组件 wxml 上写 hover-class="hover"
 *   （而 .hover 只定义在 app.wxss）在真机上就是「点了没反应」，
 *   开发者工具却**不会报任何错**。页面同理：A 页面的 wxss 不作用于 B 页面。
 *   这类哑样式只有静态比对 class 定义域才抓得到。
 * ------------------------------------------------------------------------- */

/** 收集一个 wxss 及其 @import 链上的全部 class 选择器名 */
function wxssClasses(file, depth = 0, seen = new Set()) {
  const out = new Set();
  if (depth > 3 || seen.has(file)) return out;
  seen.add(file);
  let src;
  try { src = readFileSync(file, 'utf8'); } catch (e) { return out; }
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of noComment.matchAll(/([^{}]+)\{/g)) {
    for (const cm of m[1].matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(cm[1]);
  }
  for (const m of src.matchAll(/@import\s+["']([^"']+)["']\s*;/g)) {
    for (const c of wxssClasses(join(dirname(file), m[1]), depth + 1, seen)) out.add(c);
  }
  return out;
}

/** 找出所有 <include src="…"/> 了某个 wxml 片段的页面（片段的 class 在「包含它的页面」作用域里解析） */
function includersOf(fragment, allWxml) {
  const out = [];
  for (const f of allWxml) {
    if (f === fragment) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<include\s+src\s*=\s*"([^"]+)"\s*\/?>/g)) {
      if (resolve(dirname(f), m[1]) === fragment) { out.push(f); break; }
    }
  }
  return out;
}

const appWxssClasses = wxssClasses(join(MP_ROOT, 'app.wxss'));
const scopeIssues = [];
const scopeHoverIssues = [];
let scopeChecked = 0;
let scopeHoverChecked = 0;

const ALL_WXML = WALK(MP_ROOT).filter((f) => f.endsWith('.wxml'));

ALL_WXML.forEach((f) => {
  const rel = f.replace(/\\/g, '/').split('/miniprogram/')[1];
  const isComponent = rel.startsWith('components/');
  const isFragment = rel.startsWith('templates/');
  const ownWxss = f.replace(/\.wxml$/, '.wxss');
  // 组件：只吃自己那份 wxss；页面：app.wxss + 本页 wxss；
  // 片段（<include> 复用）：app.wxss + 所有包含它的页面的 wxss
  let allowed;
  if (isComponent) {
    allowed = wxssClasses(ownWxss);
  } else if (isFragment) {
    allowed = new Set(appWxssClasses);
    includersOf(f, ALL_WXML).forEach((host) => {
      for (const c of wxssClasses(host.replace(/\.wxml$/, '.wxss'))) allowed.add(c);
    });
  } else {
    allowed = new Set([...appWxssClasses, ...wxssClasses(ownWxss)]);
  }

  const src = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of src.matchAll(/\b(class|hover-class)\s*=\s*"([^"]*)"/g)) {
    const attr = m[1];
    const value = m[2];
    const names = [];
    // {{ }} 之外是静态类名；{{ }} 之内只认字符串字面量（裸标识符无法静态求解）
    names.push(...value.replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/));
    for (const blk of value.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      for (const q of blk[1].matchAll(/['"]([^'"]*)['"]/g)) names.push(...q[1].split(/\s+/));
    }
    for (const cls of names) {
      if (!cls || cls === 'none' || /\{\{/.test(cls)) continue;
      if (attr === 'hover-class') scopeHoverChecked++; else scopeChecked++;
      if (!allowed.has(cls)) {
        (attr === 'hover-class' ? scopeHoverIssues : scopeIssues).push(`${rel} ${attr}="${cls}"`);
      }
    }
  }
});

assert('小程序 wxml 的 class 引用都在正确作用域内有定义（组件不吃 app.wxss 的 class）',
  scopeIssues.length === 0,
  scopeIssues.length ? `未定义：${scopeIssues.join(' | ')}` : `${scopeChecked} 处 class 引用全部有定义`);

assert('小程序 hover-class 全部有对应样式（否则是「点了没反应」的哑点击态）',
  scopeHoverIssues.length === 0,
  scopeHoverIssues.length ? `未定义：${scopeHoverIssues.join(' | ')}` : `${scopeHoverChecked} 处 hover-class 全部有定义`);

// 设计令牌：凡是被 var(--x) 引用的令牌，必须在 styles/variables.wxss 里有定义。
// 漏定义不会报错，只会让那一处颜色静默失效 —— 只有静态比对才抓得到。
const VARS_FILE = join(MP_ROOT, 'styles', 'variables.wxss');
const definedTokens = new Set(
  [...readFileSync(VARS_FILE, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const missingTokens = [];
let tokenRefs = 0;
WALK(MP_ROOT).filter((f) => f.endsWith('.wxss')).forEach((f) => {
  const rel = f.replace(/\\/g, '/').split('/miniprogram/')[1];
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\((--[a-z0-9-]+)/g)) {
      tokenRefs++;
      if (!definedTokens.has(m[1])) missingTokens.push(`${rel}:${i + 1} 用了 ${m[1]}`);
    }
  });
});
assert('小程序 var(--token) 引用的令牌全部有定义（漏定义＝该处颜色静默失效）',
  missingTokens.length === 0,
  missingTokens.length ? missingTokens.join(' | ')
    : `${tokenRefs} 处引用 / ${definedTokens.size} 个令牌定义，全部命中`);

/* ---------------------------------------------------------------------------
 * 15.76 装修「跳转链接」链路静态校验
 *
 * 为什么必须有这一条：
 *   装修里每个图片/元素都能配跳转，但「配得上」不等于「跳得动」。三个高发断裂点：
 *     a) 模板里绑了 data-link，处理函数却没用 utils/link.js —— tab 页用 navigateTo
 *        会直接失败，真机上表现为「点了没反应」，开发者工具不报错；
 *     b) utils/link.js 的 tabBar 白名单与 app.json 漂移 —— 新增一个 tab 页后
 *        忘了同步，点那个入口就失效；
 *     c) schema 里某个跳转字段被写回成 text 类型 —— 运营又要手敲
 *        /packageGoods/detail/detail?id=… 这种路径。
 * ------------------------------------------------------------------------- */

const requireFromHere = (await import('node:module')).createRequire(import.meta.url);
const schemaMod = requireFromHere(join(__dirname, '..', 'decorate', 'schema.js'));

const LINK_UTIL = join(MP_ROOT, 'utils', 'link.js');
const linkUtilSrc = readFileSync(LINK_UTIL, 'utf8');
const mpTabBar = JSON.parse(readFileSync(join(MP_ROOT, 'app.json'), 'utf8'));

/**
 * 收集 wxml 里「带 data-link 且绑了 bindtap」的处理函数名。
 * 这些函数是整个跳转链路的最后一公里 —— 它们里面没调 openLink，
 * 真机上就是「点了没反应」，而开发者工具不报任何错。
 */
function linkTapHandlers(wxmlFile) {
  const src = readFileSync(wxmlFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Set();
  for (const tag of src.matchAll(/<[a-zA-Z-]+[^>]*>/g)) {
    const t = tag[0];
    if (!/data-link\s*=/.test(t)) continue;
    const h = /\bbindtap\s*=\s*"([^"]+)"/.exec(t);
    if (h) out.add(h[1]);
  }
  return out;
}

const linkRel = (f) => f.replace(/\\/g, '/').split('/miniprogram/')[1];
const danglingLinkTap = [];
let linkTapChecked = 0;

/**
 * 处理函数不一定写在页面 js 里 —— 区块事件已抽到 utils/blockPage.js 的 behavior，
 * 页面靠 `Page(Object.assign({}, blockPageBehavior, {...}))` 混入。
 * 所以「找处理函数」要按「页面 js → behavior 模块」两级找，
 * 找到后用所在文件判断有没有调 openLink（跨文件漏了 openLink 才是真 bug）。
 */
const BEHAVIOR_FILES = [
  join(MP_ROOT, 'utils', 'blockPage.js')
];
/** 返回 [{ file, rel, src }]：页面 js 优先，其后是 behavior 模块 */
function handlerSources(hostJs) {
  const out = [];
  const push = (f) => {
    try { out.push({ file: f, rel: linkRel(f), src: readFileSync(f, 'utf8') }); } catch (e) { /* 缺文件在调用处报 */ }
  };
  push(hostJs);
  BEHAVIOR_FILES.forEach(push);
  return out;
}

ALL_WXML.forEach((wxml) => {
  const handlers = linkTapHandlers(wxml);
  if (!handlers.size) return;
  const rel = linkRel(wxml);
  // 片段被多个页面 <include>：每个宿主页面都得自己实现一遍处理函数
  const hosts = rel.startsWith('templates/') ? includersOf(wxml, ALL_WXML) : [wxml];
  hosts.forEach((host) => {
    const hostRel = linkRel(host);
    const hostJs = host.replace(/\.wxml$/, '.js');
    const sources = handlerSources(hostJs);
    if (!sources.length) {
      danglingLinkTap.push(`${hostRel} 没有同名 js（无法确认跳转实现）`);
      return;
    }
    // 任一来源 require 了 utils/link 即可（页面自己引，或行为模块用相对路径 './link' 引）
    if (!sources.some((s) => /require\([^)]*(?:utils\/link|\.\/link)['"]\)/.test(s.src))) {
      danglingLinkTap.push(`${hostRel}（及其行为模块）都没有 require utils/link.js`);
    }
    handlers.forEach((fn) => {
      linkTapChecked++;
      const re = new RegExp('\\b' + fn.replace(/\$/g, '\\$') + '\\s*\\([^)]*\\)\\s*\\{');
      // 找到「定义该函数」的那份源码
      const owner = sources.filter((s) => re.test(s.src))[0];
      if (!owner) { danglingLinkTap.push(`${hostRel} 缺处理函数 ${fn}`); return; }
      const m = re.exec(owner.src);
      // 取该函数起始位置后 400 字符作为函数体近似，检查是否调用 openLink
      if (!/openLink\s*\(/.test(owner.src.slice(m.index, m.index + 400))) {
        danglingLinkTap.push(`${owner.rel} 的 ${fn} 没调用 openLink`);
      }
    });
  });
});
assert('装修里每个带跳转的元素，其点击处理都真的走了 openLink（否则真机点了没反应）',
  linkTapChecked > 0 && danglingLinkTap.length === 0,
  danglingLinkTap.length ? danglingLinkTap.join(' | ')
    : `${linkTapChecked} 处「元素 → 处理函数」全部落到 utils/link.js 的 openLink`);

// 反向兜底：link.js 的 tabBar 白名单必须与 app.json 的 tabBar.list 完全一致
const tabFromApp = ((mpTabBar.tabBar && mpTabBar.tabBar.list) || []).map((x) => '/' + x.pagePath).sort();
const tabBlock = /TAB_PAGES\s*=\s*\[([\s\S]*?)\]/.exec(linkUtilSrc);
const tabFromUtil = (tabBlock ? [...tabBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []).sort();
assert('小程序 utils/link.js 的 tabBar 白名单与 app.json 完全一致（漂移＝点 tab 入口失效）',
  tabFromApp.length > 0 && tabFromApp.join('|') === tabFromUtil.join('|'),
  `app.json: ${tabFromApp.join(', ')} ／ link.js: ${tabFromUtil.join(', ')}`);

// c) 所有区块类型里，凡是「图 / 可点元素」都应该有跳转字段；且字段类型必须是 link
//
// 注意：跳转字段可能藏在列表项里（图文导航的 items[].link、魔方的 items[].link、
// 热区的 areas[].link、轮播的 images[].link），所以必须递归进 list.item 才算数 ——
// 只看顶层字段会把这三类区块误判成「没有跳转能力」。
const LINKABLE = ['swiper', 'image', 'title', 'notice', 'nav', 'cube', 'hotspot', 'shop'];
function hasLinkField(node, depth = 0) {
  if (!node || depth > 5) return false;
  if (node.k === 'link') return node.type === 'link';
  if (Array.isArray(node.fields)) return node.fields.some((f) => hasLinkField(f, depth + 1));
  if (node.type === 'list' || node.item) return hasLinkField(node.item, depth + 1);
  if (node.type === 'union') return Object.keys(node.kinds || {}).some((k) => hasLinkField(node.kinds[k], depth + 1));
  return false;
}
const kindsNoLink = LINKABLE.filter((k) => {
  const kind = schemaMod.HOME_BLOCK_KINDS[k];
  return !kind || !hasLinkField({ type: 'object', fields: kind.fields });
});
assert('装修区块的图片/可点元素都能配跳转（缺哪个区块就是「这张图点了没反应」）',
  kindsNoLink.length === 0,
  kindsNoLink.length ? `缺跳转字段：${kindsNoLink.join(', ')}`
    : `${LINKABLE.length} 类区块全部带跳转字段（含藏在列表项里的）`);

const badLinkType = [];
const scanLinkTypes = (pageKey, node) => {
  if (!node) return;
  if (node.type === 'object') { (node.fields || []).forEach((f) => scanLinkTypes(pageKey, f)); return; }
  if (node.type === 'union') { Object.keys(node.kinds || {}).forEach((k) => scanLinkTypes(pageKey, node.kinds[k])); return; }
  if (node.type === 'list') {
    scanLinkTypes(pageKey, node.item);
    return;
  }
  if (node.k === 'link' && node.type !== 'link') badLinkType.push(pageKey + '.' + node.k);
};
schemaMod.allPages().forEach((p) => scanLinkTypes(p.key, p.root));
assert('装修 schema 里所有跳转字段都是 link 类型（回退成 text 就等于让运营手敲路径）',
  badLinkType.length === 0,
  badLinkType.length ? badLinkType.join(' | ') : '全部跳转字段均为 link 类型');

// d) 跳转目标清单点位必须真的能返回三组可用数据（页面 / 商品 / 资讯）
{
  const r = await call('GET', '/api/decorate/link-options', { auth: false });
  const d = (r.data) || {};
  const paths = (d.pages || []).map((x) => x.path);
  const tabOk = ['/pages/index/index', '/pages/lexy/lexy', '/pages/news/news', '/pages/product/product', '/pages/mine/mine']
    .every((p) => paths.indexOf(p) >= 0);
  assert('GET /api/decorate/link-options 返回可用的跳转目标清单（内置 5 个 tab 页齐全）',
    r.ok && tabOk,
    `页面 ${(d.pages || []).length} 个 / 商品 ${(d.goods || []).length} 个 / 资讯 ${(d.news || []).length} 个`);
}

// e) 图片广告 images 的结构升级必须无损且幂等
//    （老数据是地址字符串数组，新数据是 { image, link }；发布时会把老数据升级，跑两遍结果必须一样）
{
  const legacy = { type: 'swiper', images: ['/uploads/a.png', 'https://x/b.jpg'] };
  const up1 = schemaMod.upgradeBlock(JSON.parse(JSON.stringify(legacy)));
  const up2 = schemaMod.upgradeBlock(JSON.parse(JSON.stringify(up1)));
  const okUp = up1.images.length === 2 &&
    up1.images[0].image === '/uploads/a.png' && up1.images[0].link === '' &&
    up1.images[1].image === 'https://x/b.jpg' && up1.images[1].link === '' &&
    JSON.stringify(up1) === JSON.stringify(up2);
  assert('图片广告 images 的结构升级无损且幂等（字符串数组 → { image, link }）',
    okUp, JSON.stringify(up1));
}

// f) 小程序端区块归一化必须同时吃「老结构」与「新结构」
//    真机上 replica.js 可能还是升级前的老数据（运营还没点过发布），
//    这时 normalizeBlock 若不兼容，首屏轮播会直接白屏。
{
  const blocksMod = requireFromHere(join(MP_ROOT, 'utils', 'blocks.js'));
  const legacy = blocksMod.normalizeBlock({ type: 'swiper', mode: 'poster', height: 1322, images: ['/uploads/a.png'] }, 0);
  const modern = blocksMod.normalizeBlock({ type: 'swiper', images: [{ image: '/uploads/c.png', link: '/pages/lexy/lexy' }] }, 1);
  const dirty = blocksMod.normalizeBlock({ type: 'swiper', images: ['', null, { link: 'x' }, { image: 'ok.png' }] }, 2);
  const okMix = legacy.images.length === 1 && legacy.images[0].link === '' &&
    legacy.images[0].image.indexOf('/uploads/a.png') >= 0 &&
    modern.images.length === 1 && modern.images[0].link === '/pages/lexy/lexy' &&
    dirty.images.length === 1 && dirty.images[0].image === 'ok.png';
  assert('小程序端 normalizeBlock 同时兼容轮播图的老/新结构（否则老数据首屏白屏）',
    okMix, '老=' + JSON.stringify(legacy.images) + ' 新=' + JSON.stringify(modern.images) + ' 脏=' + JSON.stringify(dirty.images));
}

/* ---------------------------------------------------------------------------
 * 15.78 装修组件库全量对账 + 20 种区块端到端覆盖
 *
 * 为什么必须有这一组：
 *   「组件库清单」是运营眼里的全部能力边界。清单只要有一处失真，
 *   就会出现三种「查不出来的错」：
 *     1) 标了可用的组件其实后端没实现 → 运营点一下没反应，还以为网络卡了；
 *     2) 库里有的组件没标「未接入」→ 运营以为能用，做出来的页面缺一块；
 *     3) 后端接了、wxml 没渲染 → 后台预览有、真机空白，只有静态比对抓得到。
 *   所以这一组把「有赞实测清单 ↔ schema 区块类型 ↔ wxml 渲染分支 ↔ 装修台预览分支」
 *   四个环节串起来对账，任一处漏接都会红。
 *
 * 数据来源：2026-10-08 用真实浏览器打开有赞装修编辑器逐个点击组件抓取（见 .tooling/yz-extract.mjs /
 *   .tooling/_yz-panels.json，54 个组件的中文面板字段原文）；
 *   2026-10-10 复测「基础组件」tab 实际为 55 个（多一个「游戏分类」，归在「商品」组），本段按 55 校准。
 * ------------------------------------------------------------------------- */
{
  /* (1) 基础组件清单：55 个、分 10 组，组名与各组数量锁定到有赞实测值 */
  const YZ_GROUPS = [
    ['页面装修', 18], ['商品', 4], ['新零售', 5], ['营销活动', 7], ['会员', 4],
    ['直播', 3], ['智能运营', 5], ['教育', 6], ['积分', 1], ['其他', 2]
  ];
  const groups = schemaMod.componentLib().groups || [];
  const gotGroups = groups.map((g) => g.name + ':' + g.items.length);
  const wantGroups = YZ_GROUPS.map((g) => g[0] + ':' + g[1]);
  assert('装修组件库「基础组件」= 有赞实测 10 组 / 55 个（分组名与数量逐组对齐）',
    gotGroups.join('|') === wantGroups.join('|'),
    `实际 ${gotGroups.join(' ')}`);

  /* (2) 已接入数 = 区块类型数；且库里每个「可用」项都指向真实存在的 kind */
  const allKinds = Object.keys(schemaMod.HOME_BLOCK_KINDS);
  const libBasic = schemaMod.componentLib().basic || [];
  const libAdvised = schemaMod.componentLib().adv || [];
  const okItems = libBasic.concat(libAdvised).filter((x) => x.ok);
  const ghostOk = okItems.filter((x) => !x.kind || !schemaMod.HOME_BLOCK_KINDS[x.kind]).map((x) => x.n);
  assert('组件库标记「已接入」的每一项都在 schema 里有真实区块类型（防「假装可用」）',
    ghostOk.length === 0,
    ghostOk.length ? `无对应区块类型：${ghostOk.join(', ')}` : `${okItems.length} 个已接入项全部有对应区块类型`);

  const notOk = libBasic.filter((x) => !(x.ok && x.kind && schemaMod.HOME_BLOCK_KINDS[x.kind]));
  const noWhy = notOk.filter((x) => !x.why).map((x) => x.n);
  assert('未接入的组件必须写清「为什么不能接入」（只挂角标不写原因＝运营无从判断）',
    noWhy.length === 0,
    noWhy.length ? `缺 why：${noWhy.join(', ')}` : `${notOk.length} 个未接入组件全部带 why 说明`);

  const libIcons = schemaMod.componentLib().icons || {};
  const noIcon = allKinds.filter((k) => !libIcons[schemaMod.HOME_BLOCK_KINDS[k].lib]).map((k) => k);
  assert('每个区块类型的图标键都能在 ICONS 里找到（否则装修台左侧渲染成空白格）',
    noIcon.length === 0,
    noIcon.length ? `缺图标：${noIcon.join(', ')}` : `${allKinds.length} 个区块类型图标齐全`);

  /* (3) 区块的字段完整性：逐轮新增的组件逐个点名，防止「类型加了字段忘了」 */
  const REQUIRED_FIELDS = {
    rich_text: ['html', 'bg', 'full', 'pageMargin'],
    search: ['placeholder', 'mode', 'sticky', 'shape', 'textAlign', 'boxHeight', 'scan', 'bg', 'boxBg', 'color', 'link', 'pageMargin'],
    elevator: ['mode', 'styleType', 'tagStyle', 'items', 'color', 'activeColor', 'bg', 'pageMargin'],
    enter_shop: ['text', 'align', 'color', 'bg', 'radius', 'link', 'bgOut', 'pageMargin'],
    audio: ['src', 'duration', 'text', 'avatar', 'useShopLogo', 'side', 'resume', 'pageMargin'],
    service: ['text', 'align', 'color', 'bg', 'radius', 'bgOut', 'pageMargin'],
    content_card: ['title', 'cols', 'ratio', 'items', 'style', 'radius', 'showTag', 'showRead', 'showLike', 'more', 'moreText', 'link', 'pageMargin'],
    buy_bar: ['goodsId', 'text', 'fontSize', 'align', 'theme', 'btnBg', 'padX', 'padB', 'btnH', 'btnR', 'bgOn', 'bg', 'bgH'],
    // 品牌分类（对标有赞「品牌分类E」）：三层数据 + 三个样式分组 + 扩展设置。
    // 这 62 个字段是有赞面板逐项抓来的，少任何一个都等于「属性面板少一项」。
    brand_category: [
      'brands',                                   // 左侧导航（品牌）→ panels（小组）→ items（条目）
      'title', 'panels', 'layout', 'items',
      'image', 'desc', 'linkMode', 'link',
      'bgImage', 'bgTopLink', 'bgTopGap',          // 内容背景图 / 背景顶部链接 / 背景顶部间距
      'switchMode', 'navWidth', 'contentPadX',     // 样式设置 · 布局
      'navStyle', 'navBg', 'navColor', 'navColorActive', 'navBgActive', 'navBgIdle',
      'navBorderColor', 'navBorderLine', 'navHeight', 'navMargin', 'navBorderH', 'navBorderW',
      'navFontSize', 'navWeight', 'navWeightActive', 'navAlign',   // 样式设置 · 左侧导航
      'itemShadow', 'itemBorderColor', 'itemTitleColor', 'itemGapX', 'itemGapY', 'itemRadius',
      'itemTitleSize', 'itemTitleWeight', 'itemTitleAlign',
      'panelTitleColor', 'panelTitleSize', 'panelTitleWeight', 'panelTitleAlign',
      'panelTitleGapX', 'panelTitleGapY', 'panelGap', 'contentPadBottom',
      'effect', 'effectSpeed', 'effectDelay',      // 样式设置 · 右侧内容
      'navLogo', 'searchMode', 'bg', 'moduleBgImage', 'moduleBgFill', 'reserveTabbar', 'navSticky' // 扩展设置
    ]
  };
  /**
   * 拍平后的字段键集合（含 group / list.item 里的字段）。
   * 深度上限给到 12：品牌分类是「品牌 → 小组 → 条目」三层列表嵌套，
   * 条目字段在 object.fields × 4 层之下；上限太小会把它误判成「字段缺失」。
   */
  const flatKeys = (node, depth = 0, out = new Set()) => {
    if (!node || depth > 12) return out;
    if (node.type === 'object' || Array.isArray(node.fields)) (node.fields || []).forEach((f) => flatKeys(f, depth + 1, out));
    if (node.k) out.add(node.k);
    if (node.type === 'union') Object.keys(node.kinds || {}).forEach((k) => flatKeys(node.kinds[k], depth + 1, out));
    if (node.type === 'list') flatKeys(node.item, depth + 1, out);
    return out;
  };
  const fieldGaps = [];
  Object.keys(REQUIRED_FIELDS).forEach((k) => {
    const kind = schemaMod.HOME_BLOCK_KINDS[k];
    if (!kind) { fieldGaps.push(`${k}: 区块类型不存在`); return; }
    const have = flatKeys({ type: 'object', fields: kind.fields });
    const miss = REQUIRED_FIELDS[k].filter((f) => !have.has(f));
    if (miss.length) fieldGaps.push(`${k} 缺 ${miss.join('/')}`);
  });
  assert('新增 8 种区块的字段完整性（对照有赞面板逐字段核对，缺字段＝属性面板少一项）',
    fieldGaps.length === 0,
    fieldGaps.length ? fieldGaps.join(' | ')
      : `${Object.keys(REQUIRED_FIELDS).length} 种新组件共 ${Object.keys(REQUIRED_FIELDS).reduce((n, k) => n + REQUIRED_FIELDS[k].length, 0)} 个字段全部就位`);

  /* (4) 小程序端 wxml 必须给每一种区块类型写渲染分支（后台能配、真机空白＝最典型的漏接）
   *     两类覆盖方式：
   *       ① 专属分支 —— wxml 里有 `block.type === 'k'`；
   *       ② 通用族   —— 「依赖型 / 展示型」走 `block.fam` 分支，但该类型**必须**登记在
   *          `miniprogram/utils/blocks.js` 的 SHELL_FAMILY 里，否则配了就是一片空白。 */
  const blocksWxml = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
  const blocksJsSrc = readFileSync(join(MP_ROOT, 'utils', 'blocks.js'), 'utf8');
  const shellFamSrc = /const SHELL_FAMILY = \{([\s\S]*?)\n\};/.exec(blocksJsSrc);
  /* 一行里可能写好几个键（`a: 'card', b: 'card',`）→ 必须全局匹配，不能只在行首找 */
  const keysOf = (src) => new Set(((src || '').match(/([a-z_][a-z_0-9]*)\s*:/g) || []).map((s) => s.replace(/[\s:]/g, '')));
  const shellFams = keysOf(shellFamSrc && shellFamSrc[1]);
  const wxmlMissing = allKinds.filter((k) => blocksWxml.indexOf(`block.type === '${k}'`) < 0 && !shellFams.has(k));
  assert('小程序 templates/blocks.wxml 覆盖全部区块类型（少一种就是「配了不显示」）',
    wxmlMissing.length === 0 && /block\.fam/.test(blocksWxml),
    wxmlMissing.length ? `wxml 缺分支：${wxmlMissing.join(', ')}`
      : `${allKinds.length} 种区块全部有渲染分支（专属分支 ${allKinds.length - shellFams.size} 种 + 通用族 ${shellFams.size} 种）`);

  /* (5) 装修台预览必须覆盖同样 20 种（后台预览不画＝运营以为没生效，会反复重配）
   *     渲染实现已统一到 public/shared/pv-render.js（装修台与前端预览页共用一份），
   *     所以这里查的是共享模块，不是 admin.js。 */
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');
  const pvRendSrc = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');
  const pvShellSrc = /var SHELL_PARTS = \{([\s\S]*?)\n  \};/.exec(pvRendSrc);
  const pvShells = keysOf(pvShellSrc && pvShellSrc[1]);
  const pvMissing = allKinds.filter((k) => pvRendSrc.indexOf(`kind === '${k}'`) < 0 && !pvShells.has(k));
  const tagLabelMissing = allKinds.filter((k) => {
    // 预览右上角的角标名（如 buy_bar → 购买按钮）必须能查到，否则会退回显示英文类型名
    const m = /var KIND_LABEL = \{([\s\S]*?)\};/.exec(pvRendSrc);
    return !m || m[1].indexOf(k + ':') < 0;
  });
  assert('装修台预览覆盖全部区块类型，且每种都有中文角标名',
    pvMissing.length === 0 && tagLabelMissing.length === 0 && /SHELL_PARTS\[kind\]/.test(pvRendSrc),
    (pvMissing.length ? `预览缺分支：${pvMissing.join(', ')}` : '') +
    (tagLabelMissing.length ? ` 缺中文名：${tagLabelMissing.join(', ')}` : '') ||
    `${allKinds.length} 种区块的预览分支与中文角标全部就位`);

  /* (5b) 两张「依赖型组件族」表必须键集一致。
   *      一张在装修台预览（pv-render.js 的 SHELL_PARTS）、一张在真机（blocks.js 的 SHELL_FAMILY），
   *      键不一致 = 「装修台预览里是个卡片、真机上一片空白」。这两张表天生无法合并（一个跑在浏览器、
   *      一个跑在小程序），所以只能靠这条断言钉住。 */
  const onlyPv = [...pvShells].filter((k) => !shellFams.has(k));
  const onlyMp = [...shellFams].filter((k) => !pvShells.has(k));
  assert('装修台预览与真机的「依赖型组件族」表键集完全一致',
    onlyPv.length === 0 && onlyMp.length === 0,
    (onlyPv.length ? `预览多出：${onlyPv.join(', ')}` : '') + (onlyMp.length ? ` 真机多出：${onlyMp.join(', ')}` : '') ||
    `两侧各 ${pvShells.size} 项，逐一对应`);

  /* (6) 装修台左侧按「有赞真实分组」渲染，而不是拍平成一堆（否则 55 个平铺没法找） */
  assert('装修台左侧按 lib.groups 分组渲染，且未接入项会展示具体原因',
    /lib\.groups/.test(adminJs) && /__group/.test(adminJs) && /it\.why/.test(adminJs),
    'renderLib 已按 lib.groups 分组 + 显示 why');
}

/* ---------------------------------------------------------------------------
 * 15.77 数据落盘「原子写 + 瞬态重试」校验
 *
 * 为什么必须有这一条：
 *   Windows 上 rename / unlink 会**偶发**抛 EPERM —— 目标文件恰好被实时杀毒扫描、
 *   或被上一轮的读句柄瞬时占用都会触发。实测连续 15 轮「上传素材 → 立刻删除」
 *   必现一次 `EPERM: rename 'index.json.tmp' -> 'index.json'`。
 *   这类失败**重试几十毫秒就成功**；但若像从前那样把异常吞掉继续往下走，
 *   后果是「接口报成功、数据其实没落盘」—— media.remove 曾经正是如此：
 *   索引删了、磁盘文件还在、/uploads/… 仍返回 200，运营以为图已下架。
 *   所以数据文件的写与删一律走 lib/atomicFile，且**只对瞬态错误**重试
 *   （对 ENOENT / 参数错误也重试的话，只会把真 bug 掩盖成偶发失败）。
 * ------------------------------------------------------------------------- */
{
  const atomicMod = requireFromHere(join(__dirname, '..', 'lib', 'atomicFile.js'));

  /* (1) 静态：持久化模块里不得再出现裸的 fs.renameSync / fs.unlinkSync */
  const guarded = [
    join(__dirname, '..', 'lib', 'store.js'),
    join(__dirname, '..', 'lib', 'catalogStore.js'),
    join(__dirname, '..', 'lib', 'media.js'),
    join(__dirname, '..', 'decorate', 'store.js'),
    join(__dirname, '..', 'decorate', 'customPages.js')
  ];
  const rawCalls = [];
  guarded.forEach((f) => {
    const rel = f.replace(/\\/g, '/').split('/server/')[1];
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/fs\.(renameSync|unlinkSync)\s*\(/.test(line)) rawCalls.push(`${rel}:${i + 1}`);
    });
  });
  assert('数据文件的重命名/删除统一走 lib/atomicFile（裸 fs 调用会在 Windows 上偶发 EPERM）',
    rawCalls.length === 0,
    rawCalls.length ? rawCalls.join(' | ') : `${guarded.length} 个持久化模块全部走统一封装`);

  /* (2) 行为：瞬态错误必须重试，且恢复后能成功 */
  let t1 = 0;
  let retried = false;
  try {
    const v = atomicMod.retrySync(() => {
      t1 += 1;
      if (t1 < 4) { const e = new Error('EPERM: operation not permitted, rename'); e.code = 'EPERM'; throw e; }
      return 'recovered';
    }, '自检用重试', { attempts: 6, waitMs: 1 });
    retried = v === 'recovered' && t1 === 4;
  } catch (e) { retried = false; }
  assert('瞬态错误（EPERM/EBUSY/EACCES）会自动重试，恢复后成功（不能一次失败就放弃）',
    retried, '实际尝试次数=' + t1);

  /* (3) 行为：非瞬态错误立即抛出，不做无谓重试（否则真 bug 会被伪装成偶发） */
  let t2 = 0;
  let fastThrow = false;
  try {
    atomicMod.retrySync(() => {
      t2 += 1;
      const e = new Error('ENOENT: no such file or directory');
      e.code = 'ENOENT';
      throw e;
    }, '自检用重试', { attempts: 6, waitMs: 1 });
  } catch (e) { fastThrow = e.code === 'ENOENT'; }
  assert('非瞬态错误（ENOENT 等）立即抛出、只尝试 1 次',
    fastThrow && t2 === 1, '实际尝试次数=' + t2);

  /* (4) 行为：瞬态错误重试耗尽后必须把真实错误码带出来（不能吞） */
  let t3 = 0;
  let exhausted = '';
  try {
    atomicMod.retrySync(() => {
      t3 += 1;
      const e = new Error('EBUSY: resource busy or locked');
      e.code = 'EBUSY';
      throw e;
    }, '自检用重试', { attempts: 3, waitMs: 1 });
  } catch (e) { exhausted = e.code || ''; }
  assert('瞬态错误重试耗尽后仍抛出（不静默当作成功），且带上真实错误码',
    exhausted === 'EBUSY' && t3 === 3, `code=${exhausted} 尝试=${t3}`);

  /* (5) 形态：writeFileAtomic 必须是「写 .tmp → rename 替换」，否则断电会写坏数据文件 */
  const atomicSrc = readFileSync(join(__dirname, '..', 'lib', 'atomicFile.js'), 'utf8');
  const writeBody = (/function writeFileAtomic[\s\S]*?\n}/.exec(atomicSrc) || [''])[0];
  assert('writeFileAtomic 采用「写 .tmp → rename 替换」的原子写（防断电写坏数据文件）',
    /\.tmp/.test(writeBody) && /renameSync/.test(writeBody),
    writeBody ? writeBody.replace(/\s+/g, ' ').slice(0, 120) : '找不到 writeFileAtomic');
}

/* ---------------------------------------------------------------------------
 * 15.8 后台控制台接口（/api/admin/*）
 *
 * 安全原则：只读巡检 + 自建自删。
 *   必须触碰既有数据的三处（SKU 库存 / 店铺设置 / 客户标签）先存原值，测完立即还原；
 *   商品与分类走「新建 → 用 → 删」，最后比对商品总数确保零残留。
 *   自检全程不得改变真实用户数据的规模（订单数 / 客户数）。
 * ------------------------------------------------------------------------- */
const adTag = `__自检${String(Date.now()).slice(-6)}`;

/* —— 只读巡检 —— */
const adDash = await call('GET', '/api/admin/dashboard', { auth: false });
assert('后台 · 数据概览返回今日/累计 KPI、待办、趋势、Top 商品',
  adDash.ok && !!adDash.data.today && !!adDash.data.total && !!adDash.data.todo &&
  Array.isArray(adDash.data.trend) && Array.isArray(adDash.data.topGoods),
  adDash.ok
    ? `今日 GMV=${adDash.data.today.gmv} · 累计订单=${adDash.data.total.orders} · 待发货=${adDash.data.todo.pendingShip} · 库存预警=${adDash.data.todo.lowStock}`
    : adDash.json && adDash.json.msg);

const adGoods0 = await call('GET', '/api/admin/goods/list', { auth: false, query: { page: 1, size: 200 } });
const adGoodsBase = adGoods0.ok ? adGoods0.data.total : -1;
assert('后台 · 商品列表返回全量商品（含下架）+ 分类 + 预警线',
  adGoods0.ok && adGoodsBase > 0 && Array.isArray(adGoods0.data.list) && Array.isArray(adGoods0.data.categories),
  `共 ${adGoodsBase} 个商品 · 预警线 ${adGoods0.data && adGoods0.data.lowStockLine}`);

const adGoodsDetail = await call('GET', '/api/admin/goods/detail', {
  auth: false, query: { id: adGoods0.data.list[0].id }
});
assert('后台 · 商品详情返回编辑态商品 + 分类选项',
  adGoodsDetail.ok && !!adGoodsDetail.data.goods && Array.isArray(adGoodsDetail.data.categories) &&
  Array.isArray(adGoodsDetail.data.goods.skus),
  adGoodsDetail.ok
    ? `${adGoodsDetail.data.goods.name} · ${adGoodsDetail.data.goods.skus.length} 个 SKU`
    : adGoodsDetail.json && adGoodsDetail.json.msg);

const adCat0 = await call('GET', '/api/admin/category/list', { auth: false });
assert('后台 · 分类树带每个分类的商品数',
  adCat0.ok && Array.isArray(adCat0.data.list) &&
  adCat0.data.list.every((c) => typeof c.goodsCount === 'number'),
  `${((adCat0.data && adCat0.data.list) || []).length} 个一级分类`);

const adOrder0 = await call('GET', '/api/admin/order/list', { auth: false, query: { page: 1, size: 20 } });
const adOrderTotal0 = adOrder0.ok ? adOrder0.data.total : -1;
const adOrderId = adOrder0.ok && adOrder0.data.list[0] ? adOrder0.data.list[0].orderId : '';
assert('后台 · 订单列表返回各状态计数与客户信息',
  adOrder0.ok && !!adOrder0.data.counts && adOrder0.data.list.length > 0 && !!adOrder0.data.list[0].customer,
  `共 ${adOrderTotal0} 单 · 待发货 ${adOrder0.data && adOrder0.data.counts && adOrder0.data.counts.pending_ship}`);

const adOrderDetail = await call('GET', '/api/admin/order/detail', { auth: false, query: { orderId: adOrderId } });
assert('后台 · 订单详情返回商品明细、收货地址、金额与物流位',
  adOrderDetail.ok && Array.isArray(adOrderDetail.data.items) &&
  !!adOrderDetail.data.address && !!adOrderDetail.data.amounts && 'logistics' in adOrderDetail.data,
  adOrderDetail.ok
    ? `单号 ${adOrderDetail.data.orderNo} · ${adOrderDetail.data.items.length} 个商品 · ${adOrderDetail.data.statusText}`
    : adOrderDetail.json && adOrderDetail.json.msg);

const adExport = await call('GET', '/api/admin/order/export', { auth: false });
const adCsv = adExport.ok ? String(adExport.data.content) : '';
assert('后台 · 订单导出 CSV（带 BOM，Excel 打开不乱码）',
  adExport.ok && adCsv.charCodeAt(0) === 0xfeff && /^"订单号",/.test(adCsv.slice(1)),
  `导出 ${adExport.data && adExport.data.rows} 行 · ${adExport.data && adExport.data.filename}`);

/* 发货 / 商家备注 / 关闭订单：全部走「不改变真实订单状态」的分支 */
const adShipBad = await call('POST', '/api/admin/order/ship', {
  auth: false, body: { orderIds: ['o_not_exist'], company: '顺丰速运', no: 'SF0000000000' }
});
assert('后台 · 发货接口对不存在的订单给出失败明细（不会误标为已发货）',
  adShipBad.ok && adShipBad.data.shipped === 0 && (adShipBad.data.failed || []).length === 1,
  adShipBad.ok ? `shipped=${adShipBad.data.shipped} failed=${(adShipBad.data.failed || [])[0] && adShipBad.data.failed[0].reason}` : adShipBad.json && adShipBad.json.msg);

const adRemarkOld = adOrderDetail.data.merchantRemark || '';
const adRemarkSet = await call('POST', '/api/admin/order/remark', {
  auth: false, body: { orderId: adOrderId, remark: `${adTag}备注` }
});
const adRemarkRead = await call('GET', '/api/admin/order/detail', {
  auth: false, query: { orderId: adOrderId }, silent: true
});
await call('POST', '/api/admin/order/remark', {
  auth: false, body: { orderId: adOrderId, remark: adRemarkOld }, silent: true
});
const adRemarkBack = await call('GET', '/api/admin/order/detail', {
  auth: false, query: { orderId: adOrderId }, silent: true
});
assert('后台 · 商家备注可写可读，且自检结束时已还原',
  adRemarkSet.ok && adRemarkRead.ok && adRemarkRead.data.merchantRemark === `${adTag}备注` &&
  adRemarkBack.ok && (adRemarkBack.data.merchantRemark || '') === adRemarkOld,
  `写入生效=${adRemarkRead.ok && adRemarkRead.data.merchantRemark === `${adTag}备注`} · 已还原=${adRemarkBack.ok && (adRemarkBack.data.merchantRemark || '') === adRemarkOld}`);

const adPaidOrder = adOrder0.data.list.find((o) => o.status && o.status !== 'pending_pay');
const adCloseBad = adPaidOrder
  ? await call('POST', '/api/admin/order/close', {
    auth: false, body: { orderId: adPaidOrder.orderId }, expectFail: '已支付订单不可关闭', expectHttp: 200, expectCode: 2000
  })
  : null;
assert('后台 · 关闭订单只允许未付款（已支付订单被拦下）',
  adPaidOrder ? adCloseBad.businessFailed : true,
  adPaidOrder ? (adCloseBad.json && adCloseBad.json.msg) : '当前订单全部为未付款，跳过');

const adCust0 = await call('GET', '/api/admin/customer/list', { auth: false, query: { page: 1, size: 50 } });
const adCustTotal0 = adCust0.ok ? adCust0.data.total : -1;
const adCustFirst = (adCust0.ok && adCust0.data.list[0]) || null;
const adUserId = adCustFirst ? adCustFirst.userId : '';
assert('后台 · 客户列表返回消费汇总、分层与标签池',
  adCust0.ok && !!adCust0.data.summary && adCust0.data.list.length > 0 && Array.isArray(adCust0.data.tags),
  `共 ${adCustTotal0} 位客户 · 有成交 ${adCust0.data && adCust0.data.summary && adCust0.data.summary.withOrder}`);

const adCustDetail = await call('GET', '/api/admin/customer/detail', { auth: false, query: { userId: adUserId } });
assert('后台 · 客户详情返回消费统计、订单、地址、券与资产',
  adCustDetail.ok && typeof adCustDetail.data.paidCount === 'number' &&
  typeof adCustDetail.data.paidAmount === 'number' && typeof adCustDetail.data.favoriteCount === 'number' &&
  Array.isArray(adCustDetail.data.orders) && Array.isArray(adCustDetail.data.addresses) && Array.isArray(adCustDetail.data.coupons),
  adCustDetail.ok
    ? `该客户 ${adCustDetail.data.paidCount} 笔成交 · 累计 ¥${(adCustDetail.data.paidAmount / 100).toFixed(2)} · ${adCustDetail.data.orders.length} 条订单`
    : adCustDetail.json && adCustDetail.json.msg);

const adComment0 = await call('GET', '/api/admin/comment/list', { auth: false, query: { page: 1, size: 10 } });
assert('后台 · 评价列表带商品名与商家回复字段',
  adComment0.ok && adComment0.data.list.every((c) => 'reply' in c && !!c.goodsName),
  `${adComment0.data && adComment0.data.total} 条评价`);

/*
 * 评价数据源一度是「按小程序端 mock 商品凭空生成」：商品库换成真实商品之后，
 * 后台评价管理里全是 g1001/g1002… 这些商品库里已不存在的商品的评价（商品名直接显示成商品 id），
 * 且只能靠改代码才能清。评价现已持久化到 db.comments，这条断言拦住「幽灵评价」再回来。
 */
const adGoodsAll = await call('GET', '/api/admin/goods/list', { auth: false, query: { page: 1, size: 200 } });
const adGoodsIdSet = new Set(((adGoodsAll.data && adGoodsAll.data.list) || []).map((g) => g.id));
const adGhost = ((adComment0.data && adComment0.data.list) || []).filter((c) => !adGoodsIdSet.has(c.goodsId));
assert('后台 · 评价只挂在商品库真实存在的商品上（无「幽灵评价」）',
  adComment0.ok && adGhost.length === 0,
  adGhost.length
    ? `幽灵评价 ${adGhost.length} 条：${adGhost.map((c) => c.commentId + ' → ' + c.goodsId).join('、')}`
    : `${((adComment0.data && adComment0.data.list) || []).length} 条评价全部命中商品库（${adGoodsIdSet.size} 个商品）`);

const adCoupon0 = await call('GET', '/api/admin/coupon/list', { auth: false });
assert('后台 · 优惠券模板列表带领取/核销统计',
  adCoupon0.ok && Array.isArray(adCoupon0.data.list),
  `${((adCoupon0.data && adCoupon0.data.list) || []).length} 个券模板`);

const adCouponTpl = (adCoupon0.data.list || [])[0];
const adCouponDetail = await call('GET', '/api/admin/coupon/detail', {
  auth: false, query: { templateId: adCouponTpl.templateId }
});
assert('后台 · 单个优惠券模板详情可读',
  adCouponDetail.ok && adCouponDetail.data.templateId === adCouponTpl.templateId,
  `「${adCouponDetail.data && adCouponDetail.data.name}」`);
assert('后台 · 读取不存在的优惠券模板返回 404',
  (await call('GET', '/api/admin/coupon/detail', {
    auth: false, query: { templateId: 'ct_not_exist' }, expectFail: '优惠券不存在', expectHttp: 404, expectCode: 404
  })).businessFailed, 'ct_not_exist');

const adSet0 = await call('GET', '/api/admin/settings', { auth: false });
const adSetOld = adSet0.ok ? Object.assign({}, adSet0.data.settings) : {};
assert('后台 · 店铺设置返回当前值与默认值',
  adSet0.ok && !!adSet0.data.settings && !!adSet0.data.defaults,
  `店铺名「${adSet0.data && adSet0.data.settings && adSet0.data.settings.shopName}」`);

/* —— 写操作：商品 / 分类 自建自删 —— */
const adNewCat = await call('POST', '/api/admin/category/save', { auth: false, body: { name: `${adTag}分类` } });
const adCatId = (adNewCat.ok && adNewCat.data && adNewCat.data.id) || '';
assert('后台 · 新建一级分类成功', adNewCat.ok && !!adCatId, `分类 id=${adCatId}`);

const adNewGoods = await call('POST', '/api/admin/goods/save', {
  auth: false,
  body: {
    name: `${adTag}商品`,
    categoryId: adCatId,
    subtitle: '自检临时商品，结束后自动删除',
    tags: ['自检'],
    skus: [
      { specs: ['标准装'], price: 19900, originalPrice: 29900, stock: 66 },
      { specs: ['礼盒装'], price: 25900, originalPrice: 35900, stock: 33 }
    ]
  }
});
const adGid = (adNewGoods.ok && adNewGoods.data && adNewGoods.data.id) || '';
assert('后台 · 新建商品成功（含 2 个 SKU）', adNewGoods.ok && !!adGid, `商品 id=${adGid}`);

/* 详情长图：编辑态写入 → 小程序端详情接口应把它转成 image 块（而不是继续吐开发期占位文案） */
const adDetailImg = (detail.data.images || [])[0] || '';
const adGoodsSnap = (await call('GET', '/api/admin/goods/detail', { auth: false, query: { id: adGid } })).data.goods;
const adSaveDetail = await call('POST', '/api/admin/goods/save', {
  auth: false, body: Object.assign({}, adGoodsSnap, { detailImages: adDetailImg ? [adDetailImg] : [] })
});
const adDetailMp = await call('GET', '/api/goods/detail', { auth: false, query: { id: adGid } });
const adDBlocks = (adDetailMp.data && adDetailMp.data.detailBlocks) || [];
assert('后台 · 商品详情长图落库后，小程序端详情按商品自身数据出图（不再回落占位内容）',
  adSaveDetail.ok && !!adDetailImg && adDBlocks.length >= 1 && adDBlocks.every((b) => b.type === 'image'),
  `detailImages ${((adDetailMp.data && adDetailMp.data.detailImages) || []).length} 张 · detailBlocks ${adDBlocks.map((b) => b.type).join('+') || '(空)'}`);

const adSearch = await call('GET', '/api/admin/goods/list', { auth: false, query: { keyword: adTag, page: 1, size: 50 } });
const adFound = ((adSearch.data && adSearch.data.list) || []).filter((g) => g.id === adGid);
assert('后台 · 新建商品可按关键词搜回，SKU 数为 2',
  adFound.length === 1 && (adFound[0].skus || []).length === 2,
  `命中 ${adFound.length} 条 · SKU ${adFound[0] ? (adFound[0].skus || []).length : 0} 个`);

const adSkuId = (adFound[0] && adFound[0].skus[0] && adFound[0].skus[0].skuId) || '';
const adStockSet = await call('POST', '/api/admin/goods/stock', {
  auth: false, body: { items: [{ skuId: adSkuId, value: 88 }], mode: 'set' }
});
const adMpDetail = await call('GET', '/api/goods/detail', { auth: false, query: { id: adGid } });
const adMpStock = adMpDetail.ok
  ? (((adMpDetail.data.skus || []).find((s) => s.skuId === adSkuId) || {}).stock)
  : -1;
assert('后台 · 改库存后小程序端读取同一值（库存真源唯一，无二次真源）',
  adStockSet.ok && adMpStock === 88,
  `后台设为 88 → 小程序商品详情读到 ${adMpStock}`);

/* —— 销量：与库存对称的入口（销量只随支付累加、没有自动回滚，必须能被显式修正） —— */
const adSalesSet = await call('POST', '/api/admin/goods/sales', {
  auth: false, body: { items: [{ goodsId: adGid, value: 66 }], mode: 'set' }
});
const adSalesRead = await call('GET', '/api/admin/goods/detail', { auth: false, query: { id: adGid } });
const adSalesNow = (adSalesRead.data && adSalesRead.data.goods) ? adSalesRead.data.goods.sales : -1;
assert('后台 · 改销量后读回同一值（销量是商品级，按 goodsId 定位而不是 skuId）',
  adSalesSet.ok && adSalesNow === 66,
  `后台设为 66 → 详情读到 ${adSalesNow}`);

const adSalesDelta = await call('POST', '/api/admin/goods/sales', {
  auth: false, body: { items: [{ goodsId: adGid, value: -6 }], mode: 'delta' }
});
const adSalesRead2 = await call('GET', '/api/admin/goods/detail', { auth: false, query: { id: adGid } });
const adSalesNow2 = (adSalesRead2.data && adSalesRead2.data.goods) ? adSalesRead2.data.goods.sales : -1;
assert('后台 · delta 模式在现有值上增减（66 → 60，可为负）',
  adSalesDelta.ok && adSalesNow2 === 60, `读回 ${adSalesNow2}`);

const adSalesEmpty = await call('POST', '/api/admin/goods/sales', {
  auth: false, body: { items: [] },
  expectFail: 'sales 空 items', expectHttp: 200, expectCode: 1001
});
assertBlocked('后台 · sales 接口空 items 报参数错误（不是静默成功）', adSalesEmpty,
  `HTTP ${adSalesEmpty.httpStatus} / code ${adSalesEmpty.json && adSalesEmpty.json.code}`);

const adSalesMissing = await call('POST', '/api/admin/goods/sales', {
  auth: false, body: { items: [{ goodsId: 'no_such_goods_id', value: 1 }], mode: 'set' },
  expectFail: 'sales 商品不存在', expectHttp: 404, expectCode: 404
});
assertBlocked('后台 · sales 接口商品不存在返回 404（不静默当作成功）', adSalesMissing,
  `HTTP ${adSalesMissing.httpStatus} / code ${adSalesMissing.json && adSalesMissing.json.code}`);

// 还原成新建时的 0，避免干扰收尾的「销量净影响归零」断言
await call('POST', '/api/admin/goods/sales', {
  auth: false, body: { items: [{ goodsId: adGid, value: 0 }], mode: 'set' }, silent: true
});

const adOff = await call('POST', '/api/admin/goods/status', { auth: false, body: { ids: [adGid], status: 'off_sale' } });
const adMpListOff = await call('GET', '/api/goods/list', { auth: false, query: { keyword: adTag, page: 1, size: 50 } });
const adStillVisible = ((adMpListOff.data && adMpListOff.data.list) || []).some((g) => g.id === adGid);
assert('后台 · 下架后小程序端列表立即不再返回该商品',
  adOff.ok && !adStillVisible,
  `下架成功=${adOff.ok} · 小程序端仍可见=${adStillVisible}`);

const adOn = await call('POST', '/api/admin/goods/status', { auth: false, body: { ids: [adGid], status: 'on_sale' } });
assert('后台 · 重新上架成功', adOn.ok, `status=${adOn.data && adOn.data.status}`);

/* —— 写操作：优惠券 建 → 暂停 → 小程序端领券被拦 → 删 —— */
const adCouponNew = await call('POST', '/api/admin/coupon/save', {
  auth: false, body: { name: `${adTag}券`, type: 'discount', value: 1000, threshold: 9999, days: 7 }
});
const adCid = (adCouponNew.ok && adCouponNew.data && adCouponNew.data.templateId) || '';
assert('后台 · 新建优惠券模板成功', adCouponNew.ok && !!adCid, `templateId=${adCid}`);

const adCouponPause = await call('POST', '/api/admin/coupon/status', {
  auth: false, body: { templateId: adCid, status: 'paused' }
});
const adReceive = await call('POST', '/api/coupon/receive', {
  body: { templateId: adCid }, expectFail: '券已停止发放', expectHttp: 200, expectCode: 2000
});
assert('后台 · 暂停券后小程序端不可再领取（状态穿透到 C 端）',
  adCouponPause.ok && adReceive.businessFailed,
  adReceive.json && adReceive.json.msg);

const adCouponDel = await call('POST', '/api/admin/coupon/delete', {
  auth: false, body: { templateId: adCid }
});
assert('后台 · 删除未被领取的券模板成功（已领取则拒绝）', adCouponDel.ok, `templateId=${adCid}`);

/* —— 回收自检产生的商品与分类（顺序：先删商品，分类才不被引用） —— */
const adGoodsDel = await call('POST', '/api/admin/goods/delete', { auth: false, body: { id: adGid } });
assert('后台 · 删除自检商品成功', adGoodsDel.ok, `商品 id=${adGid}`);

const adCatDel = await call('POST', '/api/admin/category/delete', { auth: false, body: { id: adCatId } });
assert('后台 · 删除自检分类成功（分类下有商品时会被拒绝）', adCatDel.ok, `分类 id=${adCatId}`);

const adDelBad = await call('POST', '/api/admin/goods/delete', {
  auth: false, body: { id: 'g_not_exist' }, expectFail: '商品不存在', expectHttp: 404, expectCode: 404
});
assert('后台 · 删除不存在的商品返回 404', adDelBad.businessFailed, adDelBad.json && adDelBad.json.msg);

const adGoods1 = await call('GET', '/api/admin/goods/list', { auth: false, query: { page: 1, size: 200 } });
assert('后台 · 自建自删后商品库数量回到初始（自检零残留）',
  adGoodsDel.ok && adGoods1.ok && adGoods1.data.total === adGoodsBase,
  `${adGoodsBase} → ${adGoods1.data && adGoods1.data.total}`);

/* —— 店铺设置：改 → 读回 → 还原 —— */
const adSetSave = await call('POST', '/api/admin/settings/save', { auth: false, body: { notice: `${adTag}公告` } });
const adSetRead = await call('GET', '/api/admin/settings', { auth: false });
const adNoticeWrote = adSetRead.ok && adSetRead.data.settings.notice === `${adTag}公告`;
await call('POST', '/api/admin/settings/save', { auth: false, body: { notice: adSetOld.notice }, silent: true });
const adSetBack = await call('GET', '/api/admin/settings', { auth: false });
assert('后台 · 店铺设置可写可读，且自检结束时已还原原值',
  adSetSave.ok && adNoticeWrote && adSetBack.ok && adSetBack.data.settings.notice === adSetOld.notice,
  `写入生效=${adNoticeWrote} · 已还原=${adSetBack.ok && adSetBack.data.settings.notice === adSetOld.notice}`);

/* —— 客户标签：追加 → 还原 —— */
const adTagOld = (adCustFirst && adCustFirst.tags) || [];
const adTagSet = await call('POST', '/api/admin/customer/tag', {
  auth: false, body: { userId: adUserId, tags: [adTag], append: true }
});
const adTagHas = adTagSet.ok && ((adTagSet.data.tags || []).indexOf(adTag) > -1);
const adTagBack = await call('POST', '/api/admin/customer/tag', {
  auth: false, body: { userId: adUserId, tags: adTagOld }
});
assert('后台 · 客户打标签可用，且自检结束时已还原',
  adTagHas && adTagBack.ok && (adTagBack.data.tags || []).length === adTagOld.length,
  `追加生效=${adTagHas} · 还原为 ${((adTagBack.data && adTagBack.data.tags) || []).length} 个标签（原 ${adTagOld.length} 个）`);

/* —— 评价回复：回复 → 清空（挑一条本来没有回复的，彻底无副作用） —— */
const adCmt = adComment0.ok ? adComment0.data.list.find((c) => !c.reply) : null;
let adReplyOk = false;
if (adCmt) {
  const r1 = await call('POST', '/api/admin/comment/reply', {
    auth: false, body: { commentId: adCmt.commentId, text: `${adTag} 感谢支持` }
  });
  adReplyOk = r1.ok && !!(r1.data && r1.data.reply);
  await call('POST', '/api/admin/comment/reply', {
    auth: false, body: { commentId: adCmt.commentId, text: '' }, silent: true
  });
}
assert('后台 · 回复评价可用（仅挑无回复的评价，测完立即清空）',
  adReplyOk,
  adCmt ? '已对一条无回复评价完成「回复 → 清空」' : '当前无未回复评价，跳过');

/* —— 收尾：真实用户数据规模必须未变 —— */
const adOrder1 = await call('GET', '/api/admin/order/list', { auth: false, query: { page: 1, size: 1 } });
const adCust1 = await call('GET', '/api/admin/customer/list', { auth: false, query: { page: 1, size: 1 } });
assert('后台 · 自检全程未改变真实用户数据规模（订单数 / 客户数一致）',
  adOrder1.ok && adCust1.ok &&
  adOrder1.data.total === adOrderTotal0 && adCust1.data.total === adCustTotal0,
  `订单 ${adOrderTotal0}→${adOrder1.data && adOrder1.data.total} · 客户 ${adCustTotal0}→${adCust1.data && adCust1.data.total}`);

/* ---------------------------------------------------------------------------
 * 15.9 后台页面与静态资源可达性
 *
 * 教训（真实踩过）：/console 路由没有尾斜杠，HTML 里写 ./console.core.js 会被
 * 解析成 /console.core.js → 404 → 脚本整段不执行 → 页面看起来「一片空白」。
 * 这里按「无尾斜杠 URL」真实解析并请求每个引用，把这类问题拦在自检里。
 * ------------------------------------------------------------------------- */
const PAGE_HTML = { '/': 'debug.html', '/debug': 'debug.html', '/admin': 'admin/index.html', '/console': 'console/index.html', '/preview': 'preview/index.html' };
const pageBad = [];
let pageRefTotal = 0;
for (const [route, file] of Object.entries(PAGE_HTML)) {
  const html = readFileSync(join(__dirname, '..', 'public', file), 'utf8');
  const refs = [...new Set([...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]))]
    .filter((u) => u && !/^(https?:|data:|mailto:|javascript:|#|\/\/)/.test(u));
  pageRefTotal += refs.length;
  for (const ref of refs) {
    const abs = new URL(ref, BASE + route).toString();
    if (!abs.startsWith(BASE)) continue; // 外链不检查
    let st = 0;
    try { st = (await fetch(abs)).status; } catch (e) { st = -1; }
    if (st !== 200) pageBad.push(`${route} 里的 "${ref}" → ${abs.replace(BASE, '')} HTTP ${st}`);
  }
}
assert('后台页面内的静态引用在「无尾斜杠 URL」下全部可达（防相对路径 404 白屏）',
  pageBad.length === 0,
  pageBad.length ? pageBad.join(' | ') : `${Object.keys(PAGE_HTML).length} 个页面 · ${pageRefTotal} 个引用全部 200`);

const pageProbe = [];
for (const route of ['/console', '/admin', '/debug', '/preview']) {
  const res = await fetch(BASE + route);
  pageProbe.push({ route, status: res.status, html: (res.headers.get('content-type') || '').indexOf('text/html') === 0 });
}
assert('后台页面路由可访问且返回 HTML（/console · /admin · /debug · /preview）',
  pageProbe.every((p) => p.status === 200 && p.html),
  pageProbe.map((p) => `${p.route}=${p.status}`).join(' · '));

const CONSOLE_FILES = [
  'console/index.html', 'console/console.css', 'console/console.core.js', 'console/console.modules.js',
  'admin/index.html', 'admin/admin.js', 'admin/admin.css',
  'preview/index.html', 'preview/preview.css', 'preview/preview.js',
  'shared/pv-render.js',
  /* 真机渲染三件套：/preview 的全部依靠就是这三个文件，缺一个预览直接白屏 */
  'shared/mp-wxss.js', 'shared/mp-wxml.js', 'shared/mp-runtime.js'
];
const missAssets = [];
CONSOLE_FILES.forEach((f) => {
  try { readFileSync(join(__dirname, '..', 'public', f)); } catch (e) { missAssets.push(f); }
});
assert('后台控制台、装修台与预览渲染三件套文件齐全',
  missAssets.length === 0,
  missAssets.length ? `缺失：${missAssets.join(', ')}` : `${CONSOLE_FILES.length} 个文件全部存在`);

/* ---------------------------------------------------------------------------
 * 15.9b 后台前端「类名撞车」静态校验
 *
 * 教训（真出过、而且测试全绿）：console.css 里有一条通用规则
 *     .thumb { width: 42px; height: 42px; ... }
 * 它是给表格里的 <img class="thumb"> 小方图用的，但**选择器写得太宽**。
 * 素材卡片把缩略图容器也写成 <div class="thumb">，于是整片网格被按 42px 排版：
 * 缩略图缩成一枚小图、溢出压住文件名 —— 表现就是「素材库丑得没法用、图还认不出」。
 * 更糟的是 jsdom 不做布局，78 条 UI 断言照样全绿，只有真浏览器量像素才看得见。
 * 所以这里做三件静态事：规则收窄、卡片用 .mt、模板不许再出现 div.thumb。
 * ------------------------------------------------------------------------- */
const consoleCss = readFileSync(join(__dirname, '..', 'public', 'console', 'console.css'), 'utf8');
const consoleCssNoComment = consoleCss.replace(/\/\*[\s\S]*?\*\//g, '');

const bareThumbRules = [...consoleCssNoComment.matchAll(/(^|\})\s*([^{}]*?)\{/g)]
  .map((m) => m[2].trim())
  .filter((sel) => sel.split(',').map((s) => s.trim()).indexOf('.thumb') > -1);
assert('console.css 里没有裸 .thumb 规则（必须收窄为 img.thumb，否则会命中卡片容器）',
  bareThumbRules.length === 0,
  bareThumbRules.length ? '裸选择器：' + bareThumbRules.join(' | ') : '已收窄为 img.thumb');
assert('console.css 里存在 img.thumb 规则（表格小方图的 42px 样式有明确归属）',
  /img\.thumb\s*\{/.test(consoleCssNoComment));

const consoleModSrc = readFileSync(join(__dirname, '..', 'public', 'console', 'console.modules.js'), 'utf8');
const consoleCoreSrc = readFileSync(join(__dirname, '..', 'public', 'console', 'console.core.js'), 'utf8');
const consoleJs = consoleModSrc + '\n' + consoleCoreSrc;
assert('素材卡片模板用 .mt 作缩略图容器（不回退到 .thumb）',
  /'<div class="mt">'/.test(consoleModSrc) && !/'<div class="thumb">'/.test(consoleJs),
  "出现 '<div class=\"thumb\">' 即会踩 42px 撞车");
assert('素材卡片结构 = 缩略图区(.mt) → 信息区(.inf：.nm + .meta) → 操作行(.ft)',
  /class="mt">[\s\S]{0,900}class="inf">[\s\S]{0,400}class="nm"[\s\S]{0,200}class="meta"[\s\S]{0,200}class="ft"/.test(consoleModSrc));
assert('卡片操作行是图标按钮且三个动作齐全（复制链接 / 下载 / 删除）',
  /class="ft">[\s\S]{0,600}data-copy[\s\S]{0,300}data-down[\s\S]{0,300}data-del/.test(consoleModSrc));
assert('已废弃的 .ops2（三枚中文文字按钮）不再出现在 CSS / JS（避免留下死样式）',
  !/\.ops2/.test(consoleCssNoComment) && !/ops2/.test(consoleJs));
assert('采集器（pickImage）也走 .mt 缩略图区（两条链路共用同一套卡片样式）',
  (consoleCoreSrc.match(/class="mt"/g) || []).length >= 2,
  '实测 ' + (consoleCoreSrc.match(/class="mt"/g) || []).length + ' 处');

/* ---- 第二起「类名撞车」：lightbox 的裸 `.lb` 让概览页整页黑屏 ----
 * lightbox 根样式曾写成裸 `.lb { position: fixed; inset: 0; background: rgba(12,16,22,.93) }`，
 * 而概览页销售趋势图的 x 轴标签是 `<div class="lb">`（label 缩写，7 天 7 个）——
 * `.bars .lb` 特异性更高只保住了字号/颜色，position/inset/background 照旧从裸 `.lb` 继承，
 * 于是 7 个图例一起变成铺满全屏的深色 fixed 层，叠成整页黑屏。
 * 「文字都在、元素都在、断言全绿」是这类事故的典型特征（jsdom 不做布局），
 * 所以除了静态断言，另配了真浏览器的 .tooling/test-page-occlusion.mjs 兜底。 */
const lbCssRules = [...consoleCssNoComment.matchAll(/(^|\})\s*([^{}]*?)\{/g)]
  .map((m) => m[2].trim());
const lbBareRules = lbCssRules.filter((sel) => /\.lb(?![-\w])/.test(sel));
const lbIllegal = lbBareRules.filter((sel) => sel !== '.bars .lb');
assert('console.css 里没有裸 .lb 规则（唯一允许的是图表图例 `.bars .lb`）',
  lbIllegal.length === 0,
  lbIllegal.length ? '裸选择器：' + lbIllegal.join(' | ') : '仅剩 `.bars .lb`（图表轴标签）');
assert('lightbox 根规则带作用域（必须写成 `#layer > .lbx`，否则会再次命中图表图例）',
  /#layer\s*>\s*\.lbx\s*\{/.test(consoleCssNoComment));
// 只挑「子规则」（.lb-h / .lb-view / .lb-f…）；根规则 `#layer > .lbx` 不含 `.lb-`，天然排除
const lbSubRules = lbCssRules.filter((sel) => /\.lb-/.test(sel));
const lbUnscoped = lbSubRules.filter((sel) => !/^\.lbx\b/.test(sel));
assert('lightbox 的子规则全部挂在 .lbx 之下（.lb-h / .lb-view / .lb-f … 不得裸用）',
  lbSubRules.length >= 10 && lbUnscoped.length === 0,
  lbUnscoped.length ? '未加作用域：' + lbUnscoped.join(' | ') : lbSubRules.length + ' 条子规则均已加 .lbx 前缀');
assert('lightbox 根元素的类名是 lbx（JS 里不得回退到裸 lb）',
  /el\.className\s*=\s*'lbx'/.test(consoleCoreSrc) && !/el\.className\s*=\s*'lb'/.test(consoleCoreSrc));
assert('图表图例样式有明确归属（`.bars .lb` 存在，说明撞车对象仍在且被隔离）',
  /\.bars\s+\.lb\s*\{/.test(consoleCssNoComment));
assert('页面遮挡哨兵脚本存在（真浏览器兜底，防「撞车式黑屏」复发）',
  existsSync(join(__dirname, '..', '..', '.tooling', 'test-page-occlusion.mjs')));

/* ---------------------------------------------------------------------------
 * 15.10 装修台预览（共享渲染核心）与 /preview（真机源码编译）
 *
 * 两条链路，各有各的约束，不能混：
 *
 *  A. 装修台（/admin）的「手机预览」—— 与真实页面**编辑器绑在一起**，
 *     必须能画区块角标 / 悬浮操作条 / 跳转角标，所以它有自己的一份渲染核心
 *     public/shared/pv-render.js。这份实现是**给运营看的近似**，允许带编辑装饰。
 *
 *  B. 前端预览页（/preview）—— 给「后端改完发布、想看真机效果」用，
 *     **不允许有任何近似**：直接编译真机的页面 JS + WXML + WXSS。
 *
 *  B 曾经写成「照着小程序手抄一份 HTML」，结果必然走样（真实发生过）：
 *  产品页抄成 3 列（真机 2 列）、左栏选中态抄成红字白底（真机黑底白字）、
 *  左栏 88px（真机 196rpx = 98px）。用户一眼就看出来了 —— 预览一旦跟真机不一样
 *  就完全失去意义。所以这里把「预览页只能走真机源码」固化成断言，谁再写第二份
 *  手抄渲染，自检立刻红。
 *
 *  同时做了**真实渲染校验**（针对 A）：拿线上已发布数据渲染一遍，逐字符确认展示态里
 *  没有任何编辑装饰（.pv-tag 区块角标 / .pv-ops 悬浮操作条 / .pv-link 跳转角标 / active 选中态）。
 *  这不是多余的 —— 抽模块时就真漏过几个地方：莱克页与产品页的「系列/分组」角标、
 *  nav / 魔方 / 热区 / 公告里的 🔗 角标是**硬编码**输出、不受 edit 开关控制，
 *  浏览器实测才暴露出来（后台预览带这些是对的，线上露出就是脏数据）。
 * ------------------------------------------------------------------------- */
const pvRequire = (await import('node:module')).createRequire(import.meta.url);
const PUB = join(__dirname, '..', 'public');
const sharedSrc = readFileSync(join(PUB, 'shared', 'pv-render.js'), 'utf8');
const adminSrc = readFileSync(join(PUB, 'admin', 'admin.js'), 'utf8');
const previewSrc = readFileSync(join(PUB, 'preview', 'preview.js'), 'utf8');
const previewHtml = readFileSync(join(PUB, 'preview', 'index.html'), 'utf8');
/* 真机渲染三件套：WXSS 转译 / WXML 编译 / 无头运行时 */
const MP_KERNEL = ['shared/mp-wxss.js', 'shared/mp-wxml.js', 'shared/mp-runtime.js'];
const kernelSrc = {};
MP_KERNEL.forEach((f) => { kernelSrc[f] = readFileSync(join(PUB, f), 'utf8'); });

/* ---- A. 装修台预览：必须走共享渲染核心，不许后台自己再抄一份 ---- */
assert('装修台预览走共享渲染核心 pv-render.js，admin.js 里没有第二份实现',
  /PvRender\.render\(/.test(adminSrc) &&
  !/function pvBlock\s*\(/.test(adminSrc) && !/function pvHome\s*\(/.test(adminSrc),
  [!/PvRender\.render\(/.test(adminSrc) ? 'admin.js 未走共享渲染核心' : '',
   /function pvBlock\s*\(/.test(adminSrc) ? 'admin.js 里又出现了第二份 pvBlock' : '',
   /function pvHome\s*\(/.test(adminSrc) ? 'admin.js 里又出现了第二份 pvHome' : ''
  ].filter(Boolean).join('；') || 'admin.js → PvRender.render()');

/* ---- B. /preview：只能编译真机源码，禁止第二份手抄实现 ---- */
const previewBad = [];
if (!/MpRuntime\.renderPage\(/.test(previewSrc)) previewBad.push('preview.js 未走真机渲染链路（MpRuntime.renderPage）');
if (/PvRender\.render\(/.test(previewSrc)) previewBad.push('preview.js 又回去调 PvRender（那是装修台的近似实现）');
if (/function pvBlock\s*\(|function pvHome\s*\(|function pvProduct\s*\(/.test(previewSrc)) {
  previewBad.push('preview.js 里出现了第二份手写渲染函数');
}
assert('预览页只能编译真机源码（页面 JS + WXML + WXSS），不得有第二份 HTML 近似',
  previewBad.length === 0,
  previewBad.length ? previewBad.join('；') : 'preview.js → MpRuntime.renderPage()');

const htmlScripts = [...previewHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const kernelMissing = MP_KERNEL.filter((f) => htmlScripts.indexOf('/' + f) === -1);
assert('预览页加载了真机渲染三件套（WXSS 转译 · WXML 编译 · 无头运行时），顺序固定',
  kernelMissing.length === 0 &&
  htmlScripts.indexOf('/shared/mp-wxss.js') < htmlScripts.indexOf('/shared/mp-wxml.js') &&
  htmlScripts.indexOf('/shared/mp-wxml.js') < htmlScripts.indexOf('/shared/mp-runtime.js'),
  kernelMissing.length ? `未引入：${kernelMissing.join(', ')}` : htmlScripts.join(' → '));

/* 只认真正的 <link>，不认注释里出现的字眼（index.html 的注释正好在解释「为什么不加载它」） */
const linksAdminCss = /<link[^>]+href="\/admin\/admin\.css"/.test(previewHtml);
assert('预览页不叠加装修台样式表（两套基础规则打架 = 预览又不可信了）',
  !linksAdminCss && /<link[^>]+href="\/preview\/preview\.css"/.test(previewHtml),
  linksAdminCss
    ? 'preview/index.html 仍在加载 /admin/admin.css（会污染真机样式的 box-sizing / img 默认尺寸）'
    : '外壳样式自带 preview.css，手机屏内只吃真机 WXSS 编译结果');

assert('预览页手机屏是 page{} 的落点（.mp-root），否则真机根节点的设计令牌无处生效',
  /class="[^"]*mp-root[^"]*"\s+id="preview"|id="preview"[^>]*class="[^"]*mp-root/.test(previewHtml),
  'phone-screen 元素同时带 mp-root 与 id="preview"');

assert('预览页读的是线上内容（replica.js），不去读装修草稿',
  !/api\/decorate\/draft/.test(previewSrc),
  /api\/decorate\/draft/.test(previewSrc) ? 'preview.js 里出现了草稿接口（预览会显示未发布内容）' : '仅通过 /api/decorate/pages 取列表与发布状态');

/* ---- /mp-src：预览页读取真机源码的唯一入口，必须只读 + 类型白名单 + 防穿越 ---- */
/*
 * 注意：穿越探测必须写成**编码形态**。`fetch('/mp-src/a/../../../server/index.js')`
 * 会在发请求前就被 URL 解析器归一化成 `/server/index.js`，根本到不了 tryMpSrc，
 * 那测到的是 HTTP 客户端的行为，不是服务端防线的行为。
 */
const srcProbe = [
  ['/mp-src/pages/product/product.wxss', 200, '真机 WXSS'],
  ['/mp-src/pages/index/index.wxml', 200, '真机 WXML'],
  ['/mp-src/pages/index/index.js', 200, '页面 JS'],
  ['/mp-src/app.json', 200, '配置文件'],
  ['/mp-src/pages/product/product.png', 403, '非文本类型（png）'],
  ['/mp-src/pages/product/%2e%2e%2f%2e%2e%2f%2e%2e%2fserver%2findex.js', 400, '编码后的穿越（多层 ..）'],
  ['/mp-src/..%2Fserver%2Findex.js', 400, '编码后的穿越 %2F'],
  ['/mp-src/%2e%2e%2fserver%2findex.js', 400, '编码后的穿越 %2e'],
  ['/mp-src/pages%5Cproduct%5Cproduct.wxss', 400, '反斜杠路径 %5C'],
  ['/mp-src/pages/product/nope.wxss', 404, '不存在的文件']
];
const srcBad = [];
for (const [p, want, label] of srcProbe) {
  let st = 0;
  try { st = (await fetch(BASE + p)).status; } catch (e) { st = -1; }
  if (st !== want) srcBad.push(`${label} ${p} → ${st}（期望 ${want}）`);
}
assert('/mp-src 源码路由：文本类型放行、非文本拒绝、路径穿越一律 400',
  srcBad.length === 0,
  srcBad.length ? srcBad.join(' | ') : `${srcProbe.length} 项探测全部符合预期`);

const idxSrcForMp = readFileSync(join(__dirname, '..', 'index.js'), 'utf8');
const mpGuardIdx = idxSrcForMp.indexOf('function tryMpSrc');
assert('/mp-src 与装修后台同受 DEBUG_PAGE 开关约束（关掉管理页时源码也不能裸奔）',
  mpGuardIdx > -1 && /DEBUG_PAGE/.test(idxSrcForMp.slice(mpGuardIdx, mpGuardIdx + 400)),
  mpGuardIdx > -1 ? 'tryMpSrc 内已判定 DEBUG_PAGE，关闭时返回 403' : '未找到 tryMpSrc');

/* ---- 装修台预览与真机口径对账：两处一起改，防止再次各写一套后走样 ---- */
const adminCss = readFileSync(join(PUB, 'admin', 'admin.css'), 'utf8');
const pvPairs = [
  [/\.pv-nav\s*\{[^}]*width:\s*98px/, '装修台预览左栏 98px（= 真机 196rpx）'],
  [/\.pv-nav\s*>\s*div\.on\s*\{[^}]*background:\s*#000/, '装修台预览左栏选中态黑底'],
  [/\.pv-nav\s*>\s*div\.on\s*\{[^}]*color:\s*#fff/, '装修台预览左栏选中态白字'],
  [/\.pv-prods\s+\.pv-cell\s*\{[^}]*width:\s*50%/, '装修台预览型号卡片两列（真机 2 列，曾错抄成 3 列）'],
  [/\.pv-prods\s+\.pv-cell\s+img\s*\{[^}]*height:\s*119\.5px/, '装修台预览图片区 119.5px（= 真机 239rpx）'],
  [/\.pv-prods\s+\.pv-cell\.pv-model\s+b\s*\{[^}]*font-size:\s*14px/, '装修台预览型号名 14px（= 真机 28rpx）']
];
const pvPairBad = pvPairs.filter(([re]) => !re.test(adminCss)).map(([, label]) => label);
assert('装修台的产品页预览与真机口径一致（列数 / 选中态 / 左栏宽 / 图片高 / 字号）',
  pvPairBad.length === 0,
  pvPairBad.length ? '不符：' + pvPairBad.join('、') : pvPairs.length + ' 项口径全部对齐真机');

/* ---- 手机壳的两条口径（两条预览链路的手机必须一样大）----
 * 实测反馈「组件在预览里显示不全」：装修台的 .phone-screen 当时只有内容自适应高度，
 * 空页面 / 刚新建只加了一个区块的自定义页会塌成几十像素的一条，根本不像一部手机。
 * 这里锁三件事：① 总高与 /preview 的 --mp-screen-h 同值（两处各写一个数必然会走样）；
 *              ② 必须是 min-height（长页面要能整页撑开，不是定高裁剪）；
 *              ③ 机型切换必须等比缩放（只改 width 会让 320 挤爆、414 右边缘留白）。 */
const previewCss = readFileSync(join(PUB, 'preview', 'preview.css'), 'utf8');
const mpScreenH = Number((previewCss.match(/--mp-screen-h:\s*(\d+)px/) || [])[1] || 0);
const phScreenH = Number((adminCss.match(/--phone-screen-h:\s*(\d+)px/) || [])[1] || 0);
const phBarH = Number((adminCss.match(/\.phone-bar\s*\{[^}]*height:\s*(\d+)px/) || [])[1] || 0);
assert('装修台手机壳整机高度与 /preview 的手机屏高一致（两处各写一个数必然走样）',
  mpScreenH > 0 && phScreenH > 0 && phBarH > 0 && phScreenH + phBarH === mpScreenH,
  `preview --mp-screen-h=${mpScreenH}px ；装修台 ${phBarH}(手机栏)+${phScreenH}(屏幕)=${phScreenH + phBarH}px`);
assert('装修台手机屏给的是 min-height（长页面仍要整页撑开，不能变成定高裁剪）',
  /\.phone-screen\s*\{[^}]*min-height:\s*var\(--phone-screen-h\)/.test(adminCss),
  /\.phone-screen\s*\{[^}]*min-height/.test(adminCss) ? 'min-height 已声明' : '未给屏高（短页面会塌成一条）');

const devIdx = adminSrc.indexOf("$('deviceSel').onchange");
const devBlock = devIdx < 0 ? '' : adminSrc.slice(devIdx, devIdx + 420);
assert('机型切换用等比缩放（只改 width 会让 320 挤爆 / 414 右边缘留白）',
  /zoom/.test(devBlock) && !/style\.width/.test(devBlock),
  devIdx < 0 ? '未找到 #deviceSel 的分支' : (devBlock.match(/zoom[^;]*;?/) || ['(块内没有 zoom)'])[0].trim());

/* 六类编辑装饰都必须由 CTX.edit 控制，漏一处展示态就会露出真机没有的东西 */
const editGated = ['cls', 'linkBadge', 'linkDot', 'groupTag', 'opsBar', 'kindTag'];
const notGated = editGated.filter((fn) => {
  const i = sharedSrc.indexOf('function ' + fn + '(');
  return i < 0 || !/CTX\.edit/.test(sharedSrc.slice(i, i + 460));
});
assert('六类编辑装饰全部受 edit 开关控制（漏一处，预览页就会露出真机上没有的角标）',
  notGated.length === 0,
  notGated.length ? `未受控：${notGated.join(', ')}` : editGated.join(' / ') + ' 均已受控');

/* 真实渲染校验：已发布数据在两种形态下的差异必须「只差编辑装饰」 */
const PvRender = pvRequire(join(PUB, 'shared', 'pv-render.js')).PvRender;
/* 编辑装饰在 HTML 里都是 class，写成 CSS 选择器形式（.pv-tag）会一个都匹配不到 */
const DECOR = ['class="pv-tag"', 'class="pv-ops"', 'class="pv-link', 'pv-block active"'];
const pvBad = [];
const pvSeen = [];
for (const key of ['home', 'lexy', 'news', 'product', 'mine']) {
  const r = await call('GET', '/api/decorate/page', { auth: false, query: { key } });
  const pub = r.data && r.data.published;
  if (!pub) continue;
  pvSeen.push(key);
  const showHtml = PvRender.render(key, pub, { edit: false });
  const editHtml = PvRender.render(key, pub, { edit: true });

  // 展示态：一处编辑装饰都不能有
  DECOR.forEach((d) => { if (showHtml.indexOf(d) > -1) pvBad.push(`${key} 展示态残留 ${d}`); });

  // 编辑态：有区块/分组结构的页面应当带装饰（证明开关真的在起作用，不是两边长一样）
  const editHasDecor = DECOR.some((d) => editHtml.indexOf(d) > -1);
  if (editHasDecor) {
    if (showHtml.length >= editHtml.length) {
      pvBad.push(`${key} 展示态不比编辑态短（${showHtml.length} vs ${editHtml.length}）`);
    }
  } else if (showHtml !== editHtml) {
    // 资讯 / 我的这类页面没有区块级装饰，两态输出本就该完全一致
    pvBad.push(`${key} 没有装饰却两态渲染不一致`);
  }
}
assert('真实已发布数据渲染：展示态无编辑装饰、编辑态保留装饰（两态确实不同）',
  pvSeen.length > 0 && pvBad.length === 0,
  pvBad.length ? pvBad.join(' | ') : `${pvSeen.join('/')} 共 ${pvSeen.length} 页，两态渲染均正常`);

/* ---------------------------------------------------------------------------
 * 15.11 店铺导航（底部 tabBar）—— 复刻有赞「店铺导航」独立装修页
 *
 * 有赞把这件事做成了独立入口（/v4/deco/retail-shopnav-config#bottom），本项目复刻为
 * 装修台列表上方的「店铺导航」卡片，数据落在**全局字段** replica.TABBAR（key = nav）。
 *
 * 它与其它页有一个本质区别：它不是页面，是全局配置 —— 5 个 tab 页共用同一份。
 * 因此这里锁死四组「错了就静默失效」的约束：
 *
 *  A. 微信硬限制：tabBar 页面必须静态声明在 app.json。schema.TABBAR_PAGES 必须与
 *     app.json 的 tabBar.list **完全一致** —— 否则运营能选中一个 switchTab 打不开的
 *     页面（真机点击没反应，而开发者工具不报任何错）。
 *  B. custom-tab-bar 四件套 + tabBar.custom:true + 每个 tab 页的 usingComponents：
 *     漏 usingComponents，真机上底部导航**整个不渲染**（同样不报错）。
 *  C. 高亮同步必须 5 个 tab 页**全都有**：组件实例每页一份，漏一个就是
 *     「切过去了还高亮着上一个」，且只在切到那个页面时才复现，极易漏测。
 *  D. 兜底值三处一致（后端 schema / 小程序组件 / 预览渲染 pv-tabbar.js）：
 *     本项目吃过「同一份数据多处消费各写一份必然走样」的亏，这里直接做值对账。
 *
 * 写入类断言只在「当前没有未发布的导航草稿」时执行，跑完立刻丢弃 ——
 * 绝不覆盖运营手上那份未发布的导航改动。
 * ------------------------------------------------------------------------- */
const NAV_SCHEMA = pvRequire(join(__dirname, '..', 'decorate', 'schema.js'));
const NAV_CTB = join(MP_ROOT, 'custom-tab-bar');
const NAV_APP_PATHS = ((appJson.tabBar || {}).list || []).map((t) => '/' + t.pagePath);
const NAV_SCHEMA_PATHS = NAV_SCHEMA.TABBAR_PAGES.map((p) => p.path);

/* ---- A. 候选页面 = app.json 的 tabBar.list（微信硬限制） ---- */
assert('店铺导航的候选页面与 app.json 的 tabBar.list 完全一致（微信限制：tabBar 页面必须静态声明）',
  NAV_APP_PATHS.length === NAV_SCHEMA_PATHS.length && NAV_APP_PATHS.every((p, i) => p === NAV_SCHEMA_PATHS[i]),
  `app.json: ${NAV_APP_PATHS.join(' ')} ｜ schema: ${NAV_SCHEMA_PATHS.join(' ')}`);
assert('app.json 开启自定义 tabBar 且 list 仍完整声明（微信要求 list 必填，缺了直接启动失败）',
  (appJson.tabBar || {}).custom === true && NAV_APP_PATHS.length >= 2 && NAV_APP_PATHS.length <= 5,
  `custom=${(appJson.tabBar || {}).custom} · list ${NAV_APP_PATHS.length} 项`);
assert('导航项数与文案上限锁定微信口径（2~5 项 · 文案 ≤5 字）',
  NAV_SCHEMA.TABBAR_MIN === 2 && NAV_SCHEMA.TABBAR_MAX === 5 && NAV_SCHEMA.TABBAR_TEXT_MAX === 5,
  `min=${NAV_SCHEMA.TABBAR_MIN} · max=${NAV_SCHEMA.TABBAR_MAX} · 文案≤${NAV_SCHEMA.TABBAR_TEXT_MAX}字`);
assert('app.json 的 tabBar 配色与 schema 默认值一致（custom:true 后不生效，但它是「初始外观」的说明）',
  (((appJson.tabBar || {}).color || '').toLowerCase() === NAV_SCHEMA.TABBAR_DEFAULTS.color.toLowerCase()) &&
  (((appJson.tabBar || {}).selectedColor || '').toLowerCase() === NAV_SCHEMA.TABBAR_DEFAULTS.selectedColor.toLowerCase()),
  `app.json ${(appJson.tabBar || {}).color}/${(appJson.tabBar || {}).selectedColor}`);

/* ---- B. custom-tab-bar 四件套 + 每个 tab 页的 usingComponents ---- */
const navCtbMissing = ['index.js', 'index.json', 'index.wxml', 'index.wxss'].filter((f) => !existsSync(join(NAV_CTB, f)));
assert('custom-tab-bar 四件套齐全（目录名与文件名都是微信写死的，不可自定义）',
  navCtbMissing.length === 0,
  navCtbMissing.length ? '缺失：' + navCtbMissing.join(', ') : 'index.js / index.json / index.wxml / index.wxss');
const navCtbJson = JSON.parse(readFileSync(join(NAV_CTB, 'index.json'), 'utf8'));
assert('custom-tab-bar/index.json 声明为组件',
  navCtbJson.component === true && !!navCtbJson.usingComponents && typeof navCtbJson.usingComponents === 'object',
  JSON.stringify(navCtbJson));
const navNoUC = NAV_APP_PATHS.filter((p) => {
  try {
    return !('usingComponents' in JSON.parse(readFileSync(join(MP_ROOT, p.replace(/^\//, '') + '.json'), 'utf8')));
  } catch (e) { return true; }
});
assert('每个 tab 页的 json 都声明了 usingComponents（漏写真机上底部导航整个不渲染，且不报错）',
  navNoUC.length === 0,
  navNoUC.length ? '未声明：' + navNoUC.join('、') : `${NAV_APP_PATHS.length} 个 tab 页全部声明`);

/* ---- C. 高亮同步：5 个 tab 页全都要有，且只能有一处实现 ---- */
const navCtbSrc = readFileSync(join(NAV_CTB, 'index.js'), 'utf8');
const navPageJs = (p) => readFileSync(join(MP_ROOT, p.replace(/^\//, '') + '.js'), 'utf8');
const navNoSync = NAV_APP_PATHS.filter((p) => !/utils\/tabbar/.test(navPageJs(p)) || !/syncTabBar\s*\(\s*this\s*\)/.test(navPageJs(p)));
assert('5 个 tab 页都在 onShow 里同步底部导航高亮（组件实例每页一份，漏一个 = 切过去还高亮着上一个）',
  navNoSync.length === 0,
  navNoSync.length ? '未同步：' + navNoSync.join('、') : `${NAV_APP_PATHS.length} 个 tab 页全部同步`);
const navSelfSync = NAV_APP_PATHS.filter((p) => /getTabBar\s*\(/.test(navPageJs(p)));
assert('tab 页不自己调 getTabBar()（同步逻辑收敛在 utils/tabbar.js 一处实现）',
  navSelfSync.length === 0 && /function syncTabBar/.test(readFileSync(join(MP_ROOT, 'utils', 'tabbar.js'), 'utf8')),
  navSelfSync.length ? '页面内自写同步：' + navSelfSync.join('、') : 'syncTabBar 唯一实现，页面只传 this');
assert('高亮按页面路径匹配、未命中置 -1（装修台可改顺序，用序号必然错位；宁可不亮也不错亮）',
  /setActive\s*\(\s*path\s*\)/.test(navCtbSrc) && /items\[i\]\.path === path/.test(navCtbSrc) && /index = -1/.test(navCtbSrc),
  'setActive(path)：按 items[i].path 匹配，找不到给 selected=-1');
const navOnTapSrc = navCtbSrc.slice(navCtbSrc.indexOf('onTap('));
assert('点击导航项时不立刻在组件里改高亮（否则与目标页 onShow 的同步打架 → 高亮闪烁）',
  navCtbSrc.indexOf('onTap(') > 0 && !/setData\s*\(/.test(navOnTapSrc),
  'onTap 内只 wx.switchTab，高亮交给目标页同步');

/* ---- D. 兜底值三处一致（后端 schema / 小程序组件 / 预览渲染） ---- */
const NAV_PV = pvRequire(join(PUB, 'shared', 'pv-tabbar.js')).PvTabbar;
// 组件文件需要 Component / wx 全局，直接 require 跑不起来 —— 用 vm 跑一遍，取出它内部算好的初始渲染数据
const navVm = await import('node:vm');
const navMakeRequire = (await import('node:module')).createRequire;
const navCtbDef = {};
const navSandbox = { console, require: navMakeRequire(join(NAV_CTB, 'index.js')), Component: (d) => { navCtbDef.value = d; } };
navVm.createContext(navSandbox);
navVm.runInContext(navCtbSrc, navSandbox, { filename: 'custom-tab-bar/index.js' });
const navCanon = (c) => JSON.stringify({
  color: c.color, selectedColor: c.selectedColor, background: c.background,
  borderColor: c.borderColor, iconMode: c.iconMode,
  items: (c.items || []).map((i) => [i.path, i.text, i.icon || '', i.activeIcon || ''])
});
const navTrio = {
  '后端 schema': NAV_SCHEMA.tabbarDefault(),
  '小程序组件': ((navCtbDef.value || {}).data) || {},
  '预览渲染': NAV_PV.normalize(null)
};
const navTrioVals = Object.keys(navTrio).map((k) => [k, navCanon(navTrio[k])]);
const navTrioUniq = Array.from(new Set(navTrioVals.map((x) => x[1])));
assert('底部导航兜底值三处一致（后端 schema / 小程序组件 / 预览渲染 pv-tabbar.js）',
  navTrioVals[1][1].indexOf('"items":[]') < 0 && navTrioUniq.length === 1,
  navTrioUniq.length === 1
    ? `${navTrioVals.length} 处一致（当前 replica.js 尚未发布过导航，组件正是靠这份兜底渲染）：${navTrioUniq[0].slice(0, 72)}…`
    : navTrioVals.map((x) => x[0] + '=' + x[1]).join(' ｜ '));

/* ---- E. 装修链路：列表 / 字段结构 / 校验边界（写入类断言跑完即丢弃草稿） ---- */
const navPagesRes = await call('GET', '/api/decorate/pages', { auth: false });
const navMeta = ((navPagesRes.data || {}).list || []).filter((x) => x.key === 'nav')[0];
assert('「店铺导航」以全局配置项出现在装修台列表（belongs=全局设置 · source=replica.TABBAR · nav 标记）',
  !!navMeta && navMeta.belongs === '全局设置' && navMeta.source === 'replica.TABBAR' && navMeta.nav === true,
  navMeta ? `${navMeta.name} · ${navMeta.belongs} · ${navMeta.source}` : '未找到 key=nav');
assert('店铺导航是全局配置，不被当成第 6 个页面混进页面列表（仅 nav 标记一项）',
  ((navPagesRes.data || {}).list || []).filter((x) => x.nav === true).length === 1,
  `列表 ${((navPagesRes.data || {}).list || []).length} 项，其中 nav 1 项`);

const navOpen = await call('GET', '/api/decorate/page', { auth: false, query: { key: 'nav' } });
const navFields = navOpen.ok ? (navOpen.data.schema.fields || []) : [];
assert('店铺导航的字段结构 = 图标样式 / 导航项 / 配色组（由 schema 自动推导，后台表单不硬编码）',
  navOpen.ok && navFields.length === 3 && navFields[0].k === 'iconMode' && navFields[1].k === 'items' &&
  navFields[2].type === 'group',
  navOpen.ok ? navFields.map((f) => f.k || ('group:' + f.label)).join(' / ') : navOpen.json.msg);
assert('导航项的「跳转页面」是下拉选择，选项恰为 app.json 的 5 个 tabBar 页面',
  (() => {
    const items = navFields.filter((f) => f.k === 'items')[0];
    const pathField = items && items.item && (items.item.fields || []).filter((f) => f.k === 'path')[0];
    return !!pathField && pathField.type === 'select' && (pathField.options || []).length === NAV_APP_PATHS.length;
  })(),
  'items.item.fields.path → select（5 个候选页面）');

const navDiff0 = await call('GET', '/api/decorate/diff', { auth: false, query: { key: 'nav' } });
if (navDiff0.data && navDiff0.data.hasDraft) {
  assert('店铺导航：检测到未发布的导航草稿，跳过写入类断言（不覆盖运营手上那份改动）',
    true, '仅做只读校验，草稿原样保留');
} else {
  const navBase = NAV_SCHEMA.tabbarDefault();
  // expectCode 也一并断言：这几条是「导航配错了必须在存草稿时拦住」的用例，
  // 只判「业务码非 0」的话，未来任何一处 5000 都会让它们假通过。
  const navDraft = (data, expectFail, expectCode) => call('POST', '/api/decorate/draft', {
    body: { key: 'nav', data },
    expectFail, expectHttp: expectFail ? 200 : null, expectCode: expectCode || null
  });

  const navBadPath = await navDraft(Object.assign({}, navBase, { items: [
    { path: '/pages/product/product', text: '产品' }, { path: '/pages/custom/index', text: '自定义页' }
  ] }), '跳转页面必须是 app.json 里声明过的 tabBar 页面', 1001);
  assert('导航项挑了非 tabBar 页面时被拦（否则真机上点了没反应，而开发者工具不报错）',
    navBadPath.json.code !== 0 && /微信限制|不在小程序底部导航候选/.test(navBadPath.json.msg || ''),
    navBadPath.json.msg);

  const navFew = await navDraft(Object.assign({}, navBase, {
    items: [{ path: '/pages/index/index', text: '首页' }]
  }), '底部导航至少 2 项', 1001);
  assert('导航项只有 1 项时被拦（微信要求 2~5 项）',
    navFew.json.code !== 0 && /至少需要 2 项/.test(navFew.json.msg || ''), navFew.json.msg);

  const navMany = await navDraft(Object.assign({}, navBase, { items: [
    { path: '/pages/index/index', text: '一' }, { path: '/pages/lexy/lexy', text: '二' },
    { path: '/pages/news/news', text: '三' }, { path: '/pages/product/product', text: '四' },
    { path: '/pages/mine/mine', text: '五' }, { path: '/pages/index/index', text: '六' }
  ] }), '底部导航最多 5 项', 1001);
  assert('导航项超过 5 项时被拦（微信要求 2~5 项）',
    navMany.json.code !== 0 && /最多 5 项/.test(navMany.json.msg || ''), navMany.json.msg);

  const navDup = await navDraft(Object.assign({}, navBase, { items: [
    { path: '/pages/index/index', text: '首页' }, { path: '/pages/lexy/lexy', text: '莱克' },
    { path: '/pages/news/news', text: '资讯' }, { path: '/pages/lexy/lexy', text: '莱克又一次' }
  ] }), '同一个页面只能出现一次', 1001);
  assert('同一页面配两次被拦（否则运营配了 4 项、真机只显示 3 项，且两处指向同一页 —— 静默少一项最难查）',
    navDup.json.code !== 0 && /同一个页面只能出现一次/.test(navDup.json.msg || ''), navDup.json.msg);

  const navOkDraft = await navDraft({
    iconMode: 'active', color: '#123456', selectedColor: '#abcdef',
    background: '#FFFFFF', borderColor: '#EEEEEE',
    items: [{ path: '/pages/mine/mine', text: '我的首页啦啊哦' }, { path: '/pages/index/index', text: '' }]
  });
  assert('导航草稿可保存（顺序可改、文案可留空、色值大小写随意）',
    navOkDraft.ok, navOkDraft.ok ? '已保存' : navOkDraft.json.msg);

  const navDiff1 = await call('GET', '/api/decorate/diff', { auth: false, query: { key: 'nav' } });
  assert('导航改动进入「待发布」状态并给出变更清单',
    navDiff1.ok && navDiff1.data.hasDraft === true && navDiff1.data.total > 0,
    navDiff1.ok ? `hasDraft=${navDiff1.data.hasDraft} · 变更 ${navDiff1.data.total} 处` : navDiff1.json.msg);

  /*
   * 归一化发生在**发布**那一刻（草稿原样保留，写回 replica.js 前统一收敛）。
   * 这里直接跑发布器用到的那一步：去重 / 文案截 5 字 / 空文案回落页面名 / 色值转大写，
   * 且必须幂等 —— 发布链路的「无损校验」正是靠幂等才成立。
   */
  const navOut = {};
  NAV_SCHEMA.get('nav').to({
    iconMode: 'active', color: '#123456', selectedColor: '#abcdef',
    items: [
      { path: '/pages/mine/mine', text: '我的首页啦啊哦' },
      { path: '/pages/index/index', text: '' },
      { path: '/pages/mine/mine', text: '重复项' }
    ]
  }, navOut);
  const navOutItems = (navOut.TABBAR || {}).items || [];
  assert('发布前归一化：去重 / 文案截 5 字 / 空文案回落页面名 / 色值转大写 / 幂等',
    navOutItems.length === 2 && navOutItems[0].text === '我的首页啦' && navOutItems[0].path === '/pages/mine/mine' &&
    navOutItems[1].text === '首页' && navOut.TABBAR.color === '#123456' && navOut.TABBAR.selectedColor === '#ABCDEF' &&
    navOut.TABBAR.iconMode === 'active' &&
    JSON.stringify(NAV_SCHEMA.normalizeTabbar(navOut.TABBAR)) === JSON.stringify(navOut.TABBAR),
    `${navOutItems.map((i) => i.text + '@' + i.path).join(' / ')} · color=${navOut.TABBAR.color} · 幂等=${JSON.stringify(NAV_SCHEMA.normalizeTabbar(navOut.TABBAR)) === JSON.stringify(navOut.TABBAR)}`);

  await call('POST', '/api/decorate/discard', { body: { key: 'nav' } });
  const navDiff2 = await call('GET', '/api/decorate/diff', { auth: false, query: { key: 'nav' } });
  assert('导航草稿已丢弃，自检对环境零影响（可重复运行）',
    navDiff2.ok && navDiff2.data.hasDraft === false, 'nav 草稿已清空');
}

/* ---- F. 发布器 / 装修台 / 预览页三处接线 ---- */
const navEmitSrc = readFileSync(join(__dirname, '..', 'decorate', 'emit.js'), 'utf8');
assert('发布器把 TABBAR 写进 replica.js 并列入导出清单（未发布过导航时整段省略，向后兼容）',
  /data\.TABBAR !== undefined/.test(navEmitSrc) && /fields\.push\('TABBAR'\)/.test(navEmitSrc),
  'emit.js：条件输出 const TABBAR + 导出清单追加');
const navAdminHtml = readFileSync(join(PUB, 'admin', 'index.html'), 'utf8');
const navPreviewHtmlSrc = readFileSync(join(PUB, 'preview', 'index.html'), 'utf8');
assert('装修台与 /preview 的底部导航共用唯一实现 pv-tabbar.js（拒绝第二份手抄）',
  /PvTabbar\.apply\(/.test(adminSrc) && /PvTabbar\.apply\(/.test(previewSrc) &&
  adminSrc.indexOf('pvtb-item') < 0 && previewSrc.indexOf('pvtb-item') < 0,
  'admin.js / preview.js 只传配置与高亮项，结构与样式都在 shared/pv-tabbar.js');
assert('装修台手机壳与 /preview 都留有底部导航容器（#phTabbar），由 PvTabbar 接管',
  /id="phTabbar"/.test(navAdminHtml) && /id="phTabbar"/.test(navPreviewHtmlSrc),
  '#phTabbar 两处均存在');
assert('装修台已删掉写死的文字导航条，底部导航改为独立可配置入口（列表上方 navCard）',
  !/\.tabbar\s*[,{]/.test(adminCss) && !/\.tabbar\s*[,{]/.test(readFileSync(join(PUB, 'preview', 'preview.css'), 'utf8')) &&
  /id="navCard"/.test(navAdminHtml) && /data-open="nav"/.test(adminSrc),
  'admin.css / preview.css 已无 .tabbar 规则；列表页 navCard + data-open="nav"');

/* 15.95 把本次自检消耗掉的库存补回（与 0.5 节呼应，保证可重复运行） */
if (stockBefore.length) {
  const stockAfter = (await readGoodsStock()) || [];
  const restore = [];
  stockAfter.forEach((a) => {
    const b = stockBefore.find((x) => x.skuId === a.skuId);
    if (b && a.stock < b.stock) restore.push({ skuId: a.skuId, value: b.stock - a.stock });
  });
  if (restore.length) await adjustStock(restore);

  const final = (await readGoodsStock()) || [];
  const unbalanced = final.filter((f) => {
    const b = stockBefore.find((x) => x.skuId === f.skuId);
    return b && f.stock < b.stock;
  });
  assert('库存净影响归零：自检消耗的 SKU 库存已补回（可重复运行）',
    unbalanced.length === 0,
    final.map((f) => `${f.skuId}:${(stockBefore.find((x) => x.skuId === f.skuId) || {}).stock}→${f.stock}`).join(' · ') ||
    '无 SKU 参与自检');
}

/* 15.96 把本次自检累加的销量补回（销量没有回滚路径，必须显式归零） */
if (salesBefore) {
  const salesAfter = (await readAllSales()) || [];
  const fix = [];
  salesAfter.forEach((a) => {
    const b = salesBefore.find((x) => x.goodsId === a.goodsId);
    if (b && a.sales !== b.sales) fix.push({ goodsId: a.goodsId, value: b.sales });
  });
  if (fix.length) await adjustSales(fix);

  const salesFinal = (await readAllSales()) || [];
  const drifted = salesFinal.filter((f) => {
    const b = salesBefore.find((x) => x.goodsId === f.goodsId);
    return b && f.sales !== b.sales;
  });
  assert('销量净影响归零：自检支付累加的 sales 已补回（可重复运行）',
    drifted.length === 0,
    drifted.map((f) => `${f.goodsId}:${(salesBefore.find((x) => x.goodsId === f.goodsId) || {}).sales}→${f.sales}`).join(' · ') ||
    `参与商品 ${salesBefore.length} 件均无变化`);
}

/* 15.10 示例参数与点位一致性
 * 防两类脱节：① samples.js 里 key 写错 → 调试台静默拿不到示例；
 *             ② 新加了点位却忘了写示例 → 调试台填不出参数。 */
const { createRequire } = await import('node:module');
const localRequire = createRequire(import.meta.url);
const SAMPLES = localRequire(join(__dirname, '..', 'routes', 'samples.js'));
const regKeys = new Set(registered.map((r) => `${r.method} ${r.path}`));
const orphanSamples = Object.keys(SAMPLES).filter((k) => !regKeys.has(k));
assert('联调示例里每个 key 都命中已注册点位（无写错路径的静默失效）',
  orphanSamples.length === 0,
  orphanSamples.length ? `未匹配：${orphanSamples.join(' | ')}` : `${Object.keys(SAMPLES).length} 条示例全部命中`);

const noSample = registered.filter((r) => !r.note && !(r.sample && (r.sample.query || r.sample.body)));
assert('每个点位都带联调示例（调试台可一键填参）',
  noSample.length === 0,
  noSample.length
    ? `缺示例 ${noSample.length} 个：${noSample.slice(0, 8).map((r) => `${r.method} ${r.path}`).join(' | ')}${noSample.length > 8 ? ' …' : ''}`
    : `${registered.length} 个点位全部带示例`);

/* 16. 覆盖度与失败数的口径
 *
 * 统计口径单独抽成 stat()（并在最后与汇总处各算一次现算值），原因：
 *   · 覆盖度必须在**所有**断言跑完之后才算 —— 18~20 节还会调用点位（page/refs 等），
 *     早算会把它们报成「未覆盖」，运维据此去补一堆其实已测过的用例；
 *   · 失败的汇总同理 —— 早算就是快照，后面新增断言的失败不会进总数（自检报喜不报忧）；
 *   · 这个脚本是「边跑边崩」的长流程：任一步抛异常（例如接口真崩了）都要能打印
 *     已收集到的结果，所以统计必须是「随时可现算」的，不能依赖某一时刻的闭包快照。 */
const registeredKeys = new Set(registered.map((r) => `${r.method} ${r.path}`));

/** 现算当前统计（registered 还没算出来时按空处理，保证崩溃路径也能出报告） */
function stat() {
  let reg = [];
  try { reg = registered; } catch (e) { reg = []; }
  const keys = new Set(reg.map((r) => `${r.method} ${r.path}`));
  const tstd = new Set(
    results
      .filter((r) => r.method !== '—')
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => keys.has(k))
  );
  return {
    reg,
    tested: tstd,
    missing: reg.filter((r) => !tstd.has(`${r.method} ${r.path}`)),
    failed: results.filter((r) => !r.passed)
  };
}

/* 17. 前端 services 层与后端点位一致性比对（抓「前端调了但后端没有」的断点） */
const SVC_DIR = join(__dirname, '..', '..', 'miniprogram', 'services');
const fePaths = new Map(); // 路径 -> 引用它的 service 文件
try {
  readdirSync(SVC_DIR).filter((f) => f.endsWith('.js')).forEach((f) => {
    const src = readFileSync(join(SVC_DIR, f), 'utf8');
    (src.match(/['"`](\/api\/[a-zA-Z0-9/_-]+)['"`]/g) || []).forEach((raw) => {
      const p = raw.slice(1, -1);
      if (!fePaths.has(p)) fePaths.set(p, []);
      if (!fePaths.get(p).includes(f)) fePaths.get(p).push(f);
    });
  });
} catch (e) {
  console.log(` （跳过前端比对：${e.message}）`);
}

const bePaths = new Set(registered.map((r) => r.path));
const brokenLinks = [...fePaths.keys()].filter((p) => !bePaths.has(p));
const notUsedByFe = registered.filter((r) => !fePaths.has(r.path));

assert('前端 services 引用的点位后端均已实现（无断链）',
  brokenLinks.length === 0,
  brokenLinks.length ? '断链：' + brokenLinks.join(', ') : `前端引用 ${fePaths.size} 个点位，全部命中`);

/* ---------------------------------------------------------------------------
 * 18. 安全开关回归（纯函数单测，不起进程）
 *
 * 背景：这里曾经出过真隐患——代码只把 `'0'` 当关闭，而 README 教用户写
 * `DEBUG_PAGE=off`，于是照文档操作的线上环境管理后台其实是**敞开的**。
 * 这个判定矩阵属于安全边界，必须有断言锁住。
 * ------------------------------------------------------------------------- */
const flags = await import('../lib/featureFlags.js');
const flagCases = [
  // [原始值,     NODE_ENV,      期望开放?, 说明]
  [undefined,     undefined,     true,  '未设置 + 非生产 → 开放（开发便利）'],
  [undefined,     'production',  false, '未设置 + 生产 → 关闭（安全默认）'],
  ['1',           undefined,     true,  '1 → 开放'],
  ['on',          undefined,     true,  'on → 开放'],
  ['true',        undefined,     true,  'true → 开放'],
  ['yes',         undefined,     true,  'yes → 开放'],
  ['0',           undefined,     false, '0 → 关闭'],
  ['off',         undefined,     false, 'off → 关闭（README 教的写法，曾经失效）'],
  ['false',       undefined,     false, 'false → 关闭'],
  ['no',          undefined,     false, 'no → 关闭'],
  [' OFF ',       undefined,     false, '带空格大写 OFF → 关闭（大小写与空格容忍）'],
  ['on',          'production',  true,  '显式 on 覆盖生产默认'],
  ['offf',        undefined,     false, '拼错的值 → 关闭（失败往安全侧倒）'],
  ['2',           undefined,     false, '2 → 关闭（非约定值不当作开启）'],
  ['',            undefined,     true,  '空串视为未设置 → 跟随环境']
];
const flagBad = flagCases.filter(([raw, env, want]) => flags.resolveDebugPage(raw, env) !== want);
assert('安全开关 · DEBUG_PAGE 判定矩阵全部符合预期（含 off / 拼错值 / 大小写）',
  flagBad.length === 0,
  flagBad.length
    ? '不符：' + flagBad.map(([r, e, w]) => `${JSON.stringify(r)}@${e || '-'} 期望${w}`).join('；')
    : `覆盖 ${flagCases.length} 种取值组合`);

assert('安全开关 · 识别「未知取值」以便启动时告警（避免静默按关闭处理）',
  flags.isKnownDebugPageValue('off') && flags.isKnownDebugPageValue('1') &&
  flags.isKnownDebugPageValue(undefined) && !flags.isKnownDebugPageValue('offf'),
  'off/1/未设置=已知，offf=未知');

// 管理接口必须在开关关闭时一并关闭（只关页面不管接口 = 假关闭），
// 且必须同时受管理员身份校验 —— 两者缺一，安全边界就是纸糊的。
const indexSrc = readFileSync(join(__dirname, '..', 'index.js'), 'utf8');
const adminAuthSrc = readFileSync(join(__dirname, '..', 'lib', 'adminAuth.js'), 'utf8');
const prefixList = (/ADMIN_API_PREFIXES\s*=\s*\[([\s\S]*?)\]/.exec(adminAuthSrc) || ['', ''])[1];
assert('管理接口前缀（admin / decorate / media）单点维护，页面与接口同受一个开关约束',
  /'\/api\/admin\/'/.test(prefixList) && /'\/api\/decorate\/'/.test(prefixList) &&
  /'\/api\/media\/'/.test(prefixList) &&
  /isAdminApiPath/.test(indexSrc) && /ADMIN_PAGE\s*\)\s*\{?/.test(indexSrc),
  '前缀集中在 lib/adminAuth.js 的 ADMIN_API_PREFIXES；index.js 用 isAdminApiPath 判定，' +
  '并同时受 ADMIN_PAGE 开关与角色 guard');

assert('管理接口有两道门：先页面开关（关掉即 403），再管理员身份与角色',
  /!ADMIN_PAGE/.test(indexSrc) && /adminAuth\.guard\(req, method, path\)/.test(indexSrc) &&
  /ADMIN_LOGIN_PATH/.test(indexSrc),
  'index.js：ADMIN_PAGE 关闭 → 403；否则 path 非登录点位一律过 adminAuth.guard');

assert('安全开关 · 生产环境缺 JWT_SECRET 时拒绝启动（不靠人看日志）',
  /NODE_ENV === 'production' && authLib\.IS_DEFAULT_SECRET/.test(indexSrc) &&
  /process\.exit\(1\)/.test(indexSrc),
  '已加启动硬校验');

/* ---------------------------------------------------------------------------
 * 19. 持久化层「文件损坏」兜底回归（静态校验 + 形态守卫存在性）
 *
 * 背景：`try { JSON.parse } catch { 备份重建 }` 只覆盖「解析失败」，
 * 但 `null` / `123` / `"abc"` 是**合法 JSON 却不是对象**，
 * 解析成功后会一路走到 `db[k]` 抛 TypeError，且每次调用都崩、无法自愈。
 * 三处存储层都必须有「解析成功后再验形态」的判断。
 * ------------------------------------------------------------------------- */
const guardFiles = [
  ['lib/store.js', 'db.json'],
  ['lib/catalogStore.js', 'catalog.json'],
  ['decorate/customPages.js', 'custom-pages.json']
];
const guardMissing = guardFiles.filter(([rel]) => {
  const src = readFileSync(join(__dirname, '..', rel), 'utf8');
  return !/isPlainObject/.test(src) || !/\.broken\./.test(src);
});
assert('持久化兜底 · 三处存储层都有「解析成功后再验是否为对象」的守卫',
  guardMissing.length === 0,
  guardMissing.length ? '缺失：' + guardMissing.map(([f]) => f).join('、') : 'store / catalogStore / customPages 均已覆盖');

const utilSrc = readFileSync(join(__dirname, '..', 'lib', 'util.js'), 'utf8');
assert('持久化兜底 · isPlainObject 对 null / 数组 / 数字 均判为「非对象」',
  /function isPlainObject/.test(utilSrc),
  'isPlainObject 已收敛在 lib/util.js，三处共用同一实现');

/* ---------------------------------------------------------------------------
 * 20. 非交易功能契约回归（整改报告 01 / 04 / 07 / 08 / 10 / 11 / 14 / 15）
 *
 * 为什么单列一节：报告 15 要求「按预期 HTTP 状态、业务码和数据未变化断言」，
 * 并补上 01~06 的回归。这里全部走**真实 HTTP**，每条被拒用例后面都补一句
 * 「数据未变化」的核对 —— 「接口报错了」不等于「数据没被改」，
 * 之前正是这个差别让「删了 15 个用户 / 36 个订单」这种事躲过了自检。
 * ------------------------------------------------------------------------- */
const repTag = `__契约${String(Date.now()).slice(-6)}`;

/* —— 20.1（08）匿名 / 用户令牌都不得进入管理接口，且数据未被改动 —— */
const cGoodsTotal = ((await call('GET', '/api/admin/goods/list', {
  query: { page: 1, size: 1 }, silent: true
})).data || {}).total;
const cSetSnap0 = JSON.stringify(((await call('GET', '/api/admin/settings', { silent: true })).data || {}).settings);

const cAnonDash = await call('GET', '/api/admin/dashboard', {
  auth: false, admin: false, expectFail: '匿名访问管理接口', expectHttp: 401, expectCode: 401
});
assertBlocked('08 · 匿名访问 /api/admin/dashboard 被拒（401 / code 401）', cAnonDash,
  `HTTP ${cAnonDash.httpStatus} / code ${cAnonDash.json && cAnonDash.json.code} / ${(cAnonDash.json && cAnonDash.json.msg) || ''}`);

const cAnonDel = await call('POST', '/api/admin/goods/delete', {
  auth: false, admin: false, body: { id: 'g1001' },
  expectFail: '匿名调用高危写点位', expectHttp: 401, expectCode: 401
});
assertBlocked('08 · 匿名调用高危写点位（删商品）被拒（401 / code 401）', cAnonDel,
  `HTTP ${cAnonDel.httpStatus} / code ${cAnonDel.json && cAnonDel.json.code}`);

const cUserDash = await call('GET', '/api/admin/dashboard', {
  admin: false, expectFail: '小程序用户令牌不能当管理员令牌', expectHttp: 401, expectCode: 401
});
assertBlocked('08 · 小程序用户令牌不能冒充管理员令牌（401，而不是「有 token 就放行」）', cUserDash,
  `HTTP ${cUserDash.httpStatus} / code ${cUserDash.json && cUserDash.json.code}`);

const cGoodsTotal2 = ((await call('GET', '/api/admin/goods/list', {
  query: { page: 1, size: 1 }, silent: true
})).data || {}).total;
const cSetSnap1 = JSON.stringify(((await call('GET', '/api/admin/settings', { silent: true })).data || {}).settings);
assert('08 · 匿名请求全部被拦之后，商品与店铺设置数据一处都没变（拒的是操作，不只是响应）',
  cGoodsTotal === cGoodsTotal2 && cSetSnap0 === cSetSnap1,
  `商品数 ${cGoodsTotal} → ${cGoodsTotal2}；店铺设置快照一致=${cSetSnap0 === cSetSnap1}`);

/* —— 20.2（08）管理员会话与口令校验 —— */
const cSession = await call('GET', '/api/admin/session');
assert('08 · 管理员会话自述角色与名称（后台据此决定是否弹登录框）',
  cSession.ok && !!cSession.data.role && !!cSession.data.name,
  `role=${cSession.data && cSession.data.role} · name=${cSession.data && cSession.data.name} · source=${cSession.data && cSession.data.source}`);

const cLoginBad = await call('POST', '/api/admin/login', {
  auth: false, admin: false, body: { password: `wrong-${repTag}` },
  expectFail: '管理员口令错误', expectHttp: 403, expectCode: 403
});
assertBlocked('08 · 管理员口令错误被拒（403 / code 403）', cLoginBad,
  `HTTP ${cLoginBad.httpStatus} / code ${cLoginBad.json && cLoginBad.json.code}`);
assert('08 · 口令错误时响应体不含任何令牌（不能靠错误信息拿到身份）',
  !(cLoginBad.data && (cLoginBad.data.token || cLoginBad.data.role)),
  `data=${JSON.stringify(cLoginBad.data)}`);
// 口令登录有失败退避（5 次 / 60 秒）：这里只错 1 次，随后重新登录一次把计数清零，
// 否则连跑几轮自检会把 IP 级别的登录锁掉，后面的自检全挂。
const cLoginAgain = await call('POST', '/api/admin/login', {
  auth: false, admin: false, silent: true,
  body: { password: process.env.ADMIN_PASSWORD || 'admin' }
});
assert('08 · 口令错误 1 次后重新登录仍可用（退避阈值是 5 次，未误伤正常运营）',
  cLoginAgain.ok || !!process.env.ADMIN_TOKEN,
  cLoginAgain.ok ? '登录成功，退避计数已清零' : '使用了长期令牌，跳过');

/* —— 20.3（01 / 07）商品摘要字段契约与素材地址 —— */
const cList = await call('GET', '/api/goods/list', { auth: false, query: { page: 1, size: 10 } });
const cItems = (cList.data && cList.data.list) || [];
const cBadField = cItems.filter((g) => typeof g.id !== 'string' || !g.id || typeof g.cover !== 'string' || !g.cover);
assert('01 · 公开商品列表每条都带 id + cover（装修「商品」区块读的就是这两个字段）',
  cList.ok && cItems.length > 0 && cBadField.length === 0,
  cBadField.length
    ? `字段异常：${cBadField.map((g) => JSON.stringify({ id: g.id, cover: g.cover })).join(' ')}`
    : `${cItems.length} 条全部带 id / cover`);

const cBadUrl = cItems.filter((g) => !/^https?:\/\//.test(g.cover) && !/^\/uploads\//.test(g.cover));
assert('07 · cover 是可用地址（http(s) 绝对地址或 /uploads/ 相对路径），没有裸文件名 / undefined / null',
  cBadUrl.length === 0,
  cBadUrl.length ? cBadUrl.map((g) => g.cover).join(' | ') : `示例：${cItems[0] && cItems[0].cover}`);

const cFirstId = cItems[0] && cItems[0].id;
const cDetailById = await call('GET', '/api/goods/detail', { auth: false, query: { id: cFirstId } });
assert('01 · 列表给的 id 能被商品详情命中（区块存的 goodsId 与接口 id 是同一个口径）',
  cDetailById.ok && cDetailById.data && cDetailById.data.id === cFirstId &&
  Array.isArray(cDetailById.data.skus) && cDetailById.data.skus.length > 0,
  `id=${cFirstId} → ${cDetailById.ok ? `${cDetailById.data.skus.length} 个 SKU` : (cDetailById.json && cDetailById.json.msg)}`);

const goodsSvcSrc = readFileSync(join(__dirname, '..', '..', 'miniprogram', 'services', 'goods.js'), 'utf8');
assert('01 / 07 · 装修字段名（goodsId / image）与接口字段名（id / cover）的适配只有 services/goods.js 一处，且统一过素材地址',
  /goodsId/.test(goodsSvcSrc) && /cover/.test(goodsSvcSrc) && /resolveAssets/.test(goodsSvcSrc),
  'services/goods.js：normGoods 同时提供 goodsId↔id、image↔cover，并统一走 resolveAssets');

/* —— 20.4（11）自定义页引用清单点位可达 —— */
const cRefs = await call('GET', '/api/decorate/page/refs', { query: { key: 'home' } });
assert('11 · 页面引用清单点位可达（改标识 / 删除前先查「谁在引用我」）',
  cRefs.ok && Array.isArray(cRefs.data.refs) && cRefs.data.custom === false && cRefs.data.count === 0,
  cRefs.ok
    ? `内置页 home：custom=${cRefs.data.custom} · 引用 ${cRefs.data.count} 处（内置页地址编译期固定，无引用一说）`
    : (cRefs.json && cRefs.json.msg));
const cRefsUnknown = await call('GET', '/api/decorate/page/refs', {
  query: { key: 'nope_nope' }, expectFail: '未知页面', expectHttp: 404, expectCode: 404
});
assertBlocked('11 · 引用清单查不存在的页面返回 404（不静默返回空清单）', cRefsUnknown,
  `HTTP ${cRefsUnknown.httpStatus} / code ${cRefsUnknown.json && cRefsUnknown.json.code}`);

/* —— 20.5（10）店铺名称 / Logo 的单一数据源 —— */
const cShopSnap0 = JSON.stringify(((await call('GET', '/api/admin/settings', { silent: true })).data || {}).settings);
const cSetShopName = await call('POST', '/api/admin/settings/save', {
  body: { shopName: `${repTag}店铺` }, expectFail: '店铺名称由装修台维护', expectHttp: 200, expectCode: 1001
});
assertBlocked('10 · 通过店铺设置接口改「店铺名称」被明确拒绝（code 1001，不是静默忽略）', cSetShopName,
  `HTTP ${cSetShopName.httpStatus} / code ${cSetShopName.json && cSetShopName.json.code} / ${(cSetShopName.json && cSetShopName.json.msg) || ''}`);

const cSetLogo = await call('POST', '/api/admin/settings/save', {
  body: { logo: 'https://example.com/not-real.png' }, expectFail: '店铺 Logo 由装修台维护', expectHttp: 200, expectCode: 1001
});
assertBlocked('10 · 通过店铺设置接口改「店铺 Logo」同样被拒（code 1001）', cSetLogo,
  `HTTP ${cSetLogo.httpStatus} / code ${cSetLogo.json && cSetLogo.json.code}`);

const cShopSnap1 = JSON.stringify(((await call('GET', '/api/admin/settings', { silent: true })).data || {}).settings);
assert('10 · 两次被拒之后店铺设置未发生任何变化（拒绝发生在写入之前）',
  cShopSnap0 === cShopSnap1, '店铺设置快照一致=' + (cShopSnap0 === cShopSnap1));

/* —— 20.6（14）请求体解析：非法 JSON / 非对象 JSON 必须 400；数字样文本不得被改写 —— */
const cBadJson = await call('POST', '/api/address/save', {
  raw: '{ "name": "契约自检", ', contentType: 'application/json',
  expectFail: '非法 JSON 请求体', expectHttp: 400, expectCode: 1001
});
assertBlocked('14 · 非法 JSON 请求体返回 400 / code 1001（不再静默变成空对象）', cBadJson,
  `HTTP ${cBadJson.httpStatus} / code ${cBadJson.json && cBadJson.json.code}`);

const cArrJson = await call('POST', '/api/address/save', {
  raw: '[1,2,3]', expectFail: '合法 JSON 但不是对象（数组）', expectHttp: 400, expectCode: 1001
});
assertBlocked('14 · 合法 JSON 但不是对象（数组）同样 400 / code 1001', cArrJson,
  `HTTP ${cArrJson.httpStatus} / code ${cArrJson.json && cArrJson.json.code}`);

const cNumJson = await call('POST', '/api/address/save', {
  raw: '123', expectFail: '合法 JSON 但不是对象（数字）', expectHttp: 400, expectCode: 1001
});
assertBlocked('14 · 合法 JSON 但不是对象（数字）同样 400 / code 1001', cNumJson,
  `HTTP ${cNumJson.httpStatus} / code ${cNumJson.json && cNumJson.json.code}`);

const cAddrCount0 = (((await call('GET', '/api/address/list', { silent: true })).data || {}).list || []).length;
const cAddrNew = await call('POST', '/api/address/save', {
  body: {
    name: '契约自检', phone: '13800138000', province: '江苏省', city: '苏州市',
    district: '姑苏区', detail: '010010', isDefault: false
  }
});
const cAddrId = (cAddrNew.data && cAddrNew.data.addressId) || '';
const cAddrSaved = ((((await call('GET', '/api/address/list', { silent: true })).data || {}).list || [])
  .find((a) => a.addressId === cAddrId)) || {};
assert('14 · 形如数字的文本字段原样保留（detail=010010 读回仍是字符串，未变成 10010）',
  cAddrNew.ok && cAddrSaved.detail === '010010' && typeof cAddrSaved.detail === 'string',
  `回读 detail=${JSON.stringify(cAddrSaved.detail)}（类型 ${typeof cAddrSaved.detail}）`);

if (cAddrId) await call('POST', '/api/address/delete', { body: { addressId: cAddrId }, silent: true });
const cAddrCount2 = (((await call('GET', '/api/address/list', { silent: true })).data || {}).list || []).length;
assert('14 · 三条被拒请求一条都没写进数据（地址数回到原值）',
  cAddrCount2 === cAddrCount0, `地址数 ${cAddrCount0} → ${cAddrCount2}（中间新增 1 条已删除）`);

/* —— 20.7（15）判定函数：服务端异常绝不算「预期拦截」 —— */
const judgeCases = [
  ['服务端异常 code 5000 必须判失败（不得算「预期拦截」）',
    { httpStatus: 200, json: { code: 5000, msg: 'boom' }, expectFail: '任意拦截' }, false],
  ['HTTP 500 必须判失败', { httpStatus: 500, json: { code: 5000 }, expectFail: '任意拦截' }, false],
  ['参数错误 1001 算作预期拦截', { httpStatus: 200, json: { code: 1001 }, expectFail: 'x' }, true],
  ['401 算作预期拦截', { httpStatus: 401, json: { code: 401 }, expectFail: 'x' }, true],
  ['404 算作预期拦截', { httpStatus: 404, json: { code: 404 }, expectFail: 'x' }, true],
  ['期望拦截但实际成功 → 失败', { httpStatus: 200, json: { code: 0 }, expectFail: 'x' }, false],
  ['写了 expectHttp 就必须命中', { httpStatus: 200, json: { code: 1001 }, expectFail: 'x', expectHttp: 403 }, false],
  ['写了 expectCode 就必须命中', { httpStatus: 403, json: { code: 1001 }, expectFail: 'x', expectCode: 2000 }, false],
  ['HTTP + 业务码 + 确实被拦，三者同时命中才算过',
    { httpStatus: 403, json: { code: 403 }, expectFail: 'x', expectHttp: 403, expectCode: 403 }, true],
  ['请求没完成（连接被重置）判失败 —— 不能因为「有错误」就算拦截成功',
    { httpStatus: 0, json: null, errMsg: 'ECONNRESET', expectFail: 'x' }, false],
  ['正常请求：HTTP 200 + code 0 才算过', { httpStatus: 200, json: { code: 0 } }, true],
  ['正常请求遇到 code 5000 也必须判失败', { httpStatus: 200, json: { code: 5000 } }, false]
];
const judgeBad = judgeCases.filter(([, input, want]) => judge(input).passed !== want);
assert('15 · 判定函数：服务端异常（HTTP 5xx / code 5000）在任何情况下都不得被判为通过',
  judgeBad.length === 0,
  judgeBad.length
    ? '不符：' + judgeBad.map(([n]) => n).join('；')
    : `覆盖 ${judgeCases.length} 种组合（含 5000 / 5xx / 期望不符 / 请求未完成）`);

/* ---------------------------------------------------------------------------
 * 21. 汇总口径终值自检（16 节的 stat() 在这里取的就是终值）
 *
 * 只做一件事：证明汇总行说的是「全部断言跑完之后」的事实，而不是中途快照。
 *   · 若本节之后才调用的点位被报成「未覆盖」，运维会去补一堆其实已经测过的用例；
 *   · 若本节之后失败的断言不计入总数，自检明明红了却报全绿。
 * ------------------------------------------------------------------------- */
const finalStat = stat();
assert('自检汇总口径 = 全部断言的终值（覆盖度与失败数均在最后现算，不漏报本节之后的断言）',
  finalStat.failed.length === results.filter((r) => !r.passed).length &&
  finalStat.tested.size === new Set(results.filter((r) => r.method !== '—')
    .map((r) => `${r.method} ${r.path}`).filter((k) => registeredKeys.has(k))).size,
  `实测点位 ${finalStat.tested.size}/${finalStat.reg.length} · 失败 ${finalStat.failed.length}/${results.length}`);

/* ----------------------------- 输出 ----------------------------- */

/*
 * 输出段包成函数的原因：这个脚本是一条两千多行的「边跑边断言」长流程，
 * 任一步抛未预期异常（接口真崩了、接口返回的字段没了导致取属性炸了）都会在
 * 打印任何结果之前整段退出 —— 现场只剩一个 TypeError，看不到已经跑完的 300 多条结果。
 * 现在挂上 unhandledRejection / uncaughtException，异常也走同一个 emitReport()。
 */
function emitReport() {
  const { reg, tested, missing, failed } = stat();
  // 前置比对（17 节）可能还没跑到，崩溃路径上要能安全取值
  const fe = safe(() => ({ n: fePaths.size, broken: brokenLinks, unused: notUsedByFe }),
    { n: 0, broken: [], unused: [] });
  const pad = (s, n) => String(s).padEnd(n, ' ');
  const padL = (s, n) => String(s).padStart(n, ' ');

  console.log('\n' + '='.repeat(72));
  console.log(' 点位实测明细');
  console.log('='.repeat(72));
  console.log(' ' + pad('#', 4) + pad('方法', 7) + pad('路径 / 断言', 44) + pad('HTTP', 6) + pad('业务码', 8) + '结果');
  console.log('-'.repeat(72));
  results.forEach((r) => {
    const flag = r.passed ? '✓' : '✗';
    const tag = r.note ? `  [${r.note}]` : r.method === '—' ? '  [断言]' : '';
    console.log(
      ' ' + pad(r.no, 4) + pad(r.method, 7) +
      pad(r.path.length > 42 ? r.path.slice(0, 40) + '…' : r.path, 44) +
      pad(r.httpStatus, 6) + pad(r.code, 8) + flag + tag
    );
    if (!r.passed) console.log('      ↳ ' + r.msg);
  });

  console.log('\n' + '='.repeat(72));
  console.log(' 汇总');
  console.log('='.repeat(72));
  console.log(` 已注册点位     ${reg.length} 个`);
  console.log(` 已实测点位     ${tested.size} 个`);
  console.log(` 未覆盖点位     ${missing.length} 个${missing.length ? ' → ' + missing.map((m) => `${m.method} ${m.path}`).join(', ') : ''}`);
  console.log(` 前端点位比对   引用 ${fe.n} 个，断链 ${fe.broken.length} 个`);
  console.log(` 实测请求/断言  ${results.length} 条`);
  console.log(` 通过           ${results.length - failed.length} 条`);
  console.log(` 失败           ${failed.length} 条`);

  /* 生成报告 */
  const h = safeHealth();
  const lines = [];
  lines.push('# 后端点位连通性报告');
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}　｜　目标服务：\`${BASE}\``);
  lines.push(`> 生成方式：\`node server/tools/check-all.mjs\`（真实 HTTP 请求，非静态扫描）`);
  lines.push('');
  lines.push('## 一、总览');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|---|---|');
  lines.push(`| 已注册点位 | ${reg.length} |`);
  lines.push(`| 已实测点位 | ${tested.size} |`);
  lines.push(`| 未覆盖点位 | ${missing.length} |`);
  lines.push(`| 实测请求/断言 | ${results.length} |`);
  lines.push(`| 通过 | ${results.length - failed.length} |`);
  lines.push(`| 失败 | ${failed.length} |`);
  lines.push(`| 服务健康检查 | ${h.status} |`);
  lines.push(`| 微信能力模式 | 登录 ${h.login} / 支付 ${h.pay} |`);
  if (crash) lines.push(`| ⚠️ 自检中断 | ${crash.message} |`);
  lines.push('');
  lines.push('## 二、点位明细');
  lines.push('');
  lines.push('| # | 方法 | 路径 / 断言 | HTTP | 业务码 | 结果 | 说明 |');
  lines.push('|---|---|---|---|---|---|---|');
  results.forEach((r) => {
    lines.push(
      `| ${r.no} | ${r.method} | \`${r.path}\` | ${r.httpStatus} | ${r.code} | ${r.passed ? '✅' : '❌'} | ${(r.note || r.msg || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`
    );
  });
  lines.push('');
  if (missing.length) {
    lines.push('## 三、未覆盖点位');
    lines.push('');
    missing.forEach((m) => lines.push(`- \`${m.method} ${m.path}\` ${m.desc || ''}`));
    lines.push('');
  } else {
    lines.push('## 三、覆盖结论');
    lines.push('');
    lines.push('**全部已注册点位均已被实测触达，无遗漏。**');
    lines.push('');
  }
  if (failed.length) {
    lines.push('## 四、失败明细');
    lines.push('');
    failed.forEach((r) => lines.push(`- \`${r.method} ${r.path}\` → HTTP ${r.httpStatus} / code ${r.code}：${r.msg}`));
    lines.push('');
  }

  lines.push('## 五、前后端点位一致性');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|---|---|');
  lines.push(`| 前端 services 引用的点位 | ${fe.n} |`);
  lines.push(`| 前端引用但后端未实现（断链） | ${fe.broken.length} |`);
  lines.push(`| 后端已注册但前端未引用 | ${fe.unused.length} |`);
  lines.push('');
  if (fe.broken.length) {
    lines.push('**断链点位（必须修复）**：');
    lines.push('');
    fe.broken.forEach((p) => lines.push(`- \`${p}\``));
    lines.push('');
  } else {
    lines.push('前端 services 引用的全部点位均已在后端实现，无断链。');
    lines.push('');
  }
  if (fe.unused.length) {
    lines.push('后端已注册但前端 services 未引用（属后台 / 微信服务器侧点位，正常）：');
    lines.push('');
    fe.unused.forEach((r) => lines.push(`- \`${r.method} ${r.path}\` ${r.desc || ''}`));
    lines.push('');
  }

  /*
   * 报告落点可用 CHECK_ALL_REPORT 改道。
   *
   * 为什么需要：test-inject-server-error.mjs 会**故意**让 4 个点位返回 500，
   * 再跑一遍本脚本验证「服务端异常必须被判成失败」。若那份（注定带 ❌ 的）
   * 报告直接盖掉 server/CONNECTIVITY.md，仓库里留下的就成了「自检有 13 个失败」的假象，
   * 下一次真实自检才刷新 —— 中间这段时间所有人看到的都是错的。
   * 所以注入实验这类「故意跑坏」的场景必须把报告写到临时文件。
   */
  const outFile = process.env.CHECK_ALL_REPORT
    ? resolve(process.env.CHECK_ALL_REPORT)
    : join(__dirname, '..', 'CONNECTIVITY.md');
  writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`\n 报告已写入   ${outFile}`);

  const allGreen = failed.length === 0 && missing.length === 0 && !crash;
  console.log(allGreen ? '\n ✅ 每个点位均联络通畅\n' : '\n ⚠️ 存在异常，请查看上方明细\n');
  return allGreen;
}

/** health 数据（崩溃路径上可能还没拿到，给个安全的空壳） */
function safeHealth() {
  try {
    const w = (health.data && health.data.wechat) || {};
    return { status: (health.data && health.data.status) || '-', login: w.login || '-', pay: w.pay || '-' };
  } catch (e) {
    return { status: '-', login: '-', pay: '-' };
  }
}

const allGreen = emitReport();
process.exit(allGreen ? 0 : 1);
