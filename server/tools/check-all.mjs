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

import { writeFileSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
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
 *    extraHeaders  额外请求头（用于支付回调的 Wechatpay-* 验签头这类场景）
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
    silent = false, form = null, extraHeaders = null
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
  // 额外头最后合并 —— 允许用例覆盖 Content-Type 之外的任意头（如 Wechatpay-*）
  if (extraHeaders) Object.assign(headers, extraHeaders);

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
 * 表现为「修好又被写回」反复出现。所以动态取素材库首件的相对路径。
 *
 * ⚠️ 这一条还必须**收尾还原**，两条原因（2026-10-13 实测踩到）：
 *   ① `media/list` 的首件是「最近一次上传」—— 自检自己刚上传过视频夹具时它就是个
 *      `.mp4`，写进「头像」这种本该是图片的字段；
 *   ② 夹具会被收尾清掉，于是 `db.json` 里留下一条指向**已不存在文件**的
 *      `/uploads/…mp4` → 与 `check-localized` 第 2 项「本地引用全部落地」打架。
 *   两条合起来的表现是「跑完自检，本地化自检反而报红」，且只看头像两个字根本查不出来。
 *   处置：`kind=image` 只挑图片 + 收尾把**原头像**放回去（昵称保持「联调账号」不动，
 *   它是自检账号的身份标识，见上面 342 行的说明）。 */
const avatarProbe = await call('GET', '/api/media/list', { auth: false, query: { page: 1, size: 1, kind: 'image' }, silent: true });
const avatarLocal = ((avatarProbe.data && avatarProbe.data.list) || [])[0]
  ? avatarProbe.data.list[0].url
  : '';
const profileProbe = await call('GET', '/api/user/profile');
const avatarRestore = (profileProbe.data && profileProbe.data.avatar) || '';
/* 「显式空串 = 清空」必须是接口能表达的语义 —— 否则头像写脏了就没有收口路径，
 * 本文件的收尾还原在「原值为空」时也会变成一条永远修不回来的假红。
 * （接口原来写的是 `if (avatar)`：传空串返回 code 0 但值不变。） */
const avatarClear = await call('POST', '/api/user/profile', { body: { avatar: '' } });
assert('用户资料：显式传空头像能清空（「没传」与「要清空」在接口层分得开）',
  avatarClear.ok && avatarClear.data && avatarClear.data.avatar === '',
  avatarClear.ok ? `清空后 avatar=${JSON.stringify(avatarClear.data && avatarClear.data.avatar)}` : '接口报错');
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

/* 7.5 运营参数（小程序端公开只读：「关于我们」「拨打商家电话」要用客服电话。
   以前它只挂在 /api/admin/settings 上（要管理员令牌），小程序去调只会 403。） */
const shopSet = await call('GET', '/api/shop/settings', { auth: false });
assert('运营参数接口公开可读，且**不下发店铺名称与 Logo**（那两个的真源是装修台 replica.SHOP，两处下发必然对不上）',
  shopSet.ok && shopSet.data && typeof shopSet.data.servicePhone === 'string' &&
  shopSet.data.shopName === undefined && shopSet.data.logo === undefined,
  shopSet.ok ? `客服电话 ${shopSet.data.servicePhone}｜字段 ${Object.keys(shopSet.data).join(', ')} ｜无 shopName/logo`
    : '接口不可用：' + (shopSet.json && shopSet.json.msg));

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
  assert('下单响应下发 sandbox 标记（前端据此如实告知「联调环境无法拉起真实支付」，而不是让用户对着必败的支付面板反复点）',
    precreate.data.sandbox === true, `sandbox=${precreate.data.sandbox}`);

  /*
   * 「继续支付」：订单列表点「去付款」走的是 prepay，**不新建订单**，只补发支付参数。
   * 必须有这一条：没有它，待付款订单只有一个永远失败的下单入口。
   */
  const prepay = await call('POST', '/api/order/prepay', { body: { orderId } });
  assert('prepay 给待付款订单补发支付参数，且不新建订单（orderNo 与下单时一致）',
    prepay.ok && prepay.data.orderId === orderId && prepay.data.orderNo === precreate.data.orderNo &&
    !!(prepay.data.payment && prepay.data.payment.package) && prepay.data.sandbox === true,
    prepay.ok ? `${prepay.data.orderNo}｜sandbox=${prepay.data.sandbox}` : 'prepay 失败：' + (prepay.json && prepay.json.msg));

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

/* 11. 支付回调点位（独立下单后触发）
 *
 * ⚠️ 这条路径**只能锁「拒绝」，不能锁「成功」**，理由是它同时踩了两个坑：
 *   1) `auth: false` —— 微信服务器不带用户令牌调用，所以它**公网开放**；
 *   2) 旧实现 `verifyNotifySignature()` 是 `return !HAS_WX_PAY` —— 没配商户号就**直接放行**，
 *      于是任何人 POST 一个订单号就能把订单标成已支付（已修）。
 * 现在：沙箱模式一律拒绝；真实模式严格验签（时间戳 ±5 分钟防重放 + RSA-SHA256 验签）。
 * 真实回调的**成功分支**由 `.tooling/test-wxpay.mjs` 在单元层覆盖（自造 RSA 密钥对扮演微信，
 * 含 AES-GCM 解密往返 + 篡改一字节必拒）。这里验的是**安全属性**：
 * 伪造通知进不来、且即便进过也改不动订单。
 * 入账与幂等改走 `/api/pay/mock-success`（与真实回调**同一条** `orderLib.markPaid` 路径）。
 */
const order3 = await call('POST', '/api/order/precreate', {
  body: { items: [{ goodsId, skuId: sku.skuId, quantity: 1 }], addressId, remark: '回调测试' }
});
if (order3.ok) {
  const forgeBody = {
    orderNo: order3.data.orderNo,
    transactionId: 'CHECKTX_' + order3.data.orderNo,
    payAmountFen: order3.data.amounts.payAmount
  };
  const salesOf = (list) => {
    const hit = (list || []).find((g) => g.goodsId === goodsId);
    return hit ? hit.sales : null;
  };
  /* 伪造通知**之前**的销量基线：用来证明「被拒的回调一点副作用都没留下」 */
  const salesBeforeForge = await readAllSales();

  /* 11a 连验签头都没有的伪造通知 —— 必须被拒（这条就是上面第 2 个坑的回归锁） */
  const forged = await call('POST', '/api/pay/notify', {
    auth: false, body: forgeBody,
    expectFail: '未验签的支付回调被拒', expectHttp: 403
  });
  assert('伪造的支付回调被拒（HTTP 403 + FAIL，沙箱下绝不放行）',
    forged.httpStatus === 403 && !!forged.json && forged.json.code === 'FAIL' && !!forged.json.message,
    `HTTP ${forged.httpStatus} / ${JSON.stringify(forged.json)}`);

  /* 11b 验签头四件套齐备但签名是编的 —— 不能写成「只看头在不在」 */
  const forged2 = await call('POST', '/api/pay/notify', {
    auth: false, body: forgeBody,
    extraHeaders: {
      'Wechatpay-Serial': 'PUB_KEY_ID_FORGED',
      'Wechatpay-Timestamp': String(Math.floor(Date.now() / 1000)),
      'Wechatpay-Nonce': 'forgednonce',
      'Wechatpay-Signature': 'Zm9yZ2Vk'
    },
    expectFail: '验签头齐全但签名是编的，同样被拒', expectHttp: 403
  });
  assert('凑齐四个验签头但签名伪造 → 仍被拒（不是「有头就放行」）',
    forged2.httpStatus === 403 && !!forged2.json && forged2.json.code === 'FAIL',
    `HTTP ${forged2.httpStatus} / ${JSON.stringify(forged2.json)}`);

  /* 11c 真正的安全属性：被拒之后订单不得被标成已支付、也不得留下任何入账副作用。
   * 这两条是 11a/11b 的「后果断言」—— 只断言「返回了 403」挡不住
   * 「返回 403 但订单已经悄悄入账」这种实现。 */
  const untouched = await call('POST', '/api/pay/query', { body: { orderId: order3.data.orderId } });
  const salesAfterForge = await readAllSales();
  assert('被拒的回调没有改变订单支付状态（仍为待付款）',
    untouched.ok && untouched.data.status === 'pending_pay',
    `实际 ${untouched.data && untouched.data.status}`);
  assert('被拒的回调没有留下入账副作用（销量未被累加）',
    salesBeforeForge !== null && salesAfterForge !== null &&
    salesOf(salesAfterForge) === salesOf(salesBeforeForge),
    `销量 ${salesOf(salesBeforeForge)} → ${salesOf(salesAfterForge)}` +
    `（基线取不到时为 null，同样判失败）`);

  /* 11d 入账 + 幂等：走联调入口连发两次（与真实回调同一条 markPaid 路径）。
   * 说明白它的边界，免得后人以为是「强断言」：markPaid 对重复通知有**两道早退**
   * （① 同 transactionId 已在 payLogs；② 订单状态已不是待付款），所以「第二次不重复入账」
   * 在当前实现下不是靠这条断言发现的。这条锁的是「重复调用不得报错 + 三个可见值不变」，
   * 作为「有人把早退删掉 / 让重复调用抛错」时的回归锁 —— 真正的入账副作用由 11c 那条兜。 */
  const payOnce = await call('POST', '/api/pay/mock-success', { body: { orderId: order3.data.orderId } });
  const afterFirst = await call('GET', '/api/order/detail', { query: { orderId: order3.data.orderId } });
  const salesFirst = await readAllSales();
  const again = await call('POST', '/api/pay/mock-success', { body: { orderId: order3.data.orderId } });
  const afterAgain = await call('GET', '/api/order/detail', { query: { orderId: order3.data.orderId } });
  const salesAgain = await readAllSales();
  assert('支付成功入账后订单转为待发货',
    payOnce.ok && afterFirst.data.status === 'pending_ship',
    `实际 ${afterFirst.data && afterFirst.data.status}`);
  assert('重复的支付成功通知幂等：状态/支付时间/销量三者都不变（重复调用不报错、不重复入账）',
    again.ok && afterAgain.data.status === 'pending_ship' &&
    !!afterAgain.data.paidAt && afterAgain.data.paidAt === afterFirst.data.paidAt &&
    salesAgain !== null && salesOf(salesAgain) === salesOf(salesFirst),
    `状态 ${afterAgain.data && afterAgain.data.status}` +
    `｜paidAt ${afterFirst.data && afterFirst.data.paidAt} → ${afterAgain.data && afterAgain.data.paidAt}` +
    `｜sales ${salesOf(salesFirst)} → ${salesOf(salesAgain)}`);
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

/*
 * ★ 「注册表里有」≠「已经下发」：**再触发一次整份重建**，没发布过的自定义页仍不许出现在产物里。
 *
 * 原 bug：组装 replica 时把 publishedAll() 整份写出去，于是任何一次「写 replica.js」
 * （删任意页面 / 删任意笔记 / 发布任意页面）都会把没发布过的页面一起塞进产物，
 * 接口同时把它的状态谎报成「代码已生成」。
 * 上面那条「新建后还没有它」只验了「建的那一刻没写文件」——那一刻本来就不写文件，
 * 所以**它原样绿着，bug 却照样存在**（这正是本节点要补的一刀）。
 *
 * 触发方式用「建一篇笔记再删掉」：更贴近运营的真实动作，且不碰内置页的数据。
 */
const gateTriggerA = await call('POST', '/api/decorate/note/create', { body: { title: '自检笔记-触发重建甲' } });
await call('POST', '/api/decorate/note/delete', { body: { key: gateTriggerA.ok ? gateTriggerA.data.key : '' } });
const replicaAfterRebuild = readFileSync(REPLICA_FILE, 'utf8');
assert('★ 自定义页「发布」门：没点过「发布」的自定义页，不会被别的操作（整份重建 replica）顺带下发',
  replicaAfterRebuild.indexOf(CUSTOM_KEY) < 0,
  `replica.js 含 ${CUSTOM_KEY} = ${replicaAfterRebuild.indexOf(CUSTOM_KEY) >= 0}（期望 false）`);

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

/* 反向：已经发布过的自定义页，不能被「写别人」顺手抹掉（修过头会让线上页面凭空消失） */
const gateTriggerB = await call('POST', '/api/decorate/note/create', { body: { title: '自检笔记-触发重建乙' } });
await call('POST', '/api/decorate/note/delete', { body: { key: gateTriggerB.ok ? gateTriggerB.data.key : '' } });
const replicaKept = readFileSync(REPLICA_FILE, 'utf8');
assert('★ 自定义页「发布」门：已发布的自定义页在整份重建后仍在产物里（防「一律跳过」式修过头）',
  replicaKept.indexOf(CUSTOM_KEY) >= 0 && replicaKept.indexOf('自检标题') >= 0,
  `含 ${CUSTOM_KEY} = ${replicaKept.indexOf(CUSTOM_KEY) >= 0}　含页面内容 = ${replicaKept.indexOf('自检标题') >= 0}`);

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

/*
 * 再单独锁一次「新标识真的成了 CUSTOM_PAGES 的**键**」。
 *
 * 上面那条用的是整份文件的 indexOf，而**别名表里也会出现新标识**
 * （CUSTOM_PAGE_ALIASES = { 旧: "新" }）—— 于是「CUSTOM_PAGES 里已经没有这一页了、
 * 只剩一条指向它的别名」这种情况照样能骗过它（实测：把改名时的 keepKey 去掉，
 * 那一页会从 CUSTOM_PAGES 里消失，上面那条却仍然绿）。
 *
 * 判据写成「键 + 冒号」：emit 只会给**合法标识符**去掉引号（见 emit.js 的 jsExpr），
 * 而本用例的新标识带连字符，所以它一定是 `"xxx":` 这种带引号的键形态 ——
 * 别名表里它只是**值**（后面跟逗号或换行，不跟冒号），不会误命中。
 */
assert('自定义页改名：新标识真的成了 CUSTOM_PAGES 的键（不是只剩一条指向它的别名）',
  new RegExp('"' + CUSTOM_NEW_KEY + '"\\s*:').test(replicaAfterRename),
  `replica.js 里有 "${CUSTOM_NEW_KEY}": = ${new RegExp('"' + CUSTOM_NEW_KEY + '"\\s*:').test(replicaAfterRename)}`);

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

/* ---------------- 店铺笔记（营销与内容 → 店铺笔记） ----------------
 *
 * 为什么这一节要紧跟自定义页：笔记**是接进页面体系做的**（custom: true + 注册表 + 草稿/版本/发布
 * 全部复用），它的三个点位（列表 / 新建 / 删除）如果不在这里走一遍真实 HTTP，
 * 「已注册点位」里就会永远挂着 3 个未覆盖项，而且新建时漏写 key / path 这类错
 * 只有走到接口那一层才看得见（数据层自检直接调函数，绕过了路由的参数拼装）。
 *
 * 清理口径与自定义页一致：**认标题前缀**（自检笔记），不按 id 猜 ——
 * 运营自己建的笔记不能被自检删掉。
 */
const NOTE_TITLE = '自检笔记 · 联调';
const notesPre = await call('GET', '/api/decorate/notes', { auth: false });
assert('店铺笔记列表点位返回列表 + 配额（已用 / 上限）',
  notesPre.ok && Array.isArray(notesPre.data.list) && notesPre.data.stats.count === notesPre.data.list.length
  && notesPre.data.stats.max > 0,
  notesPre.ok ? `${notesPre.data.list.length} 篇 / 上限 ${notesPre.data.stats.max}`
    : notesPre.json.msg);

for (const n of (notesPre.data.list || []).filter((x) => x.title === NOTE_TITLE || /^自检笔记/.test(x.title || ''))) {
  await call('POST', '/api/decorate/note/delete', { body: { key: n.key } });
}
const baseNotes = ((await call('GET', '/api/decorate/notes', { auth: false })).data.list || []).length;

const noteMake = await call('POST', '/api/decorate/note/create', {
  body: { title: NOTE_TITLE, summary: '一句话卖点', tags: '洗地机,吸尘器' }
});
/*
 * 断言里必须同时锁住 key 与 path：
 *   两者都是**从 id 派生**的（note-<id> / packageNews/note/note?id=<id>），
 *   任一处漏补，装修台拿到 create 响应就会 openPage(undefined) 跳到 /admin?edit=undefined，
 *   或者真机跳到一个不存在的地址。这类「派生字段漏填」只有走 HTTP 才暴露。
 *
 * ⚠️ id 从 key 里解出来，而不是读 create 响应的顶层 id —— createNote 的返回体只有
 *    page / key / schema / published（对外契约里 id 不单独暴露，key 就是它的载体）；
 *    第一版这里写了 `noteMake.data.id`（undefined → 0），断言必然红，是自检自己写错。
 */
const noteKey = noteMake.ok ? noteMake.data.key : '';
const noteId = /^note-(\d+)$/.test(noteKey) ? Number(noteKey.slice('note-'.length)) : 0;
assert('新建店铺笔记成功，并带出派生地址（key=note-<id> / 真机 path）',
  noteMake.ok && noteId > 0 && noteMake.data.page.path === 'packageNews/note/note?id=' + noteId
  && noteMake.data.page.key === noteKey && noteMake.data.page.belongs === '店铺笔记',
  noteMake.ok ? `${noteKey}（id=${noteId}）→ ${noteMake.data.page.path}` : (noteMake.json.msg || 'create 失败'));
assert('笔记内容落位：标题住在 published.header.title（面板按 header.title 读写）',
  noteMake.ok && noteMake.data.published.header.title === NOTE_TITLE
  && noteMake.data.published.title === undefined
  && noteMake.data.published.header.tags === '洗地机,吸尘器',
  noteMake.ok ? `header.title=${noteMake.data.published.header.title}` : 'create 失败');
/* 「只建后台条目、先不写 replica.js」是产品口径（装修完点生成代码才下发），必须在接口层锁住 */
assert('新建笔记后 replica.js 里还没有这篇（装修完「生成代码」才下发）',
  readFileSync(REPLICA_FILE, 'utf8').indexOf(noteKey) < 0,
  `replica.js 中不应出现 ${noteKey}`);

/*
 * 「内容量」列的两个口径（2026-10-15 补）。
 *
 * 起因：控制台截图里，一篇刚编了 5 个组件、但还没点「生成代码」的笔记显示「0 个组件」——
 * 数字没错（blockCount 的口径就是「已生成代码里几个区块」），但它回答不了运营的问题：
 * 运营要看的是「我这版内容有几个组件」。
 * 于是加了一个 draftBlockCount，由展示层决定报哪一个。
 *
 * 为什么「没有草稿」必须是 null 而不是 0：
 *   0 会被展示层读成「草稿里有 0 个组件」（= 空草稿，即将发布一个空页面），
 *   而真实含义是「根本没有草稿」。这两种状态要能分开 —— 与 PITFALLS 里
 *   「判空 if (x) 会把『没传』与『要清空』混成一件事」是同一族坑。
 */
const notePagesNoDraft = await call('GET', '/api/decorate/pages');
const noteRowNoDraft = (notePagesNoDraft.data.list || []).filter((p) => p.key === noteKey)[0] || {};
assert('笔记列表口径：没有草稿时 draftBlockCount 是 null、blockCount 是 0（缺省值缺的是「没有」而不是「0 个」）',
  notePagesNoDraft.ok && noteRowNoDraft.hasDraft === false &&
  noteRowNoDraft.draftBlockCount === null && noteRowNoDraft.blockCount === 0,
  `hasDraft=${noteRowNoDraft.hasDraft}　blockCount=${noteRowNoDraft.blockCount}　` +
  `draftBlockCount=${JSON.stringify(noteRowNoDraft.draftBlockCount)}`);

const noteBlankTitle = await call('POST', '/api/decorate/note/create', {
  body: { title: '' }, expectFail: '空标题', expectHttp: 200, expectCode: 1001
});
assert('笔记标题必填（空标题被拒，不会生成一篇叫「笔记 #N」的空笔记）',
  /必填/.test(noteBlankTitle.json.msg || ''), noteBlankTitle.json.msg);

const noteLongTitle = await call('POST', '/api/decorate/note/create', {
  body: { title: 'x'.repeat(41) }, expectFail: '超长标题', expectHttp: 200, expectCode: 1001
});
assert('笔记标题超过 40 字被拒（有赞那个「5-40 字」里 40 是硬上限）',
  /40/.test(noteLongTitle.json.msg || ''), noteLongTitle.json.msg);

/*
 * ★ 笔记组件面板放行的 kind 必须**真的存得进去**（2026-10-15 真 bug 的行为判据）。
 *
 * 起因：面板里摆着「文本」「辅助空白」（住在 UC_KINDS，不在 HOME_BLOCK_KINDS），
 * 而草稿校验当时写死了 HOME_BLOCK_KINDS → 一点「存至草稿」就 1001。
 * 装修台只改内存草稿，所以「加得进去」验不出它；**只有真发一次存草稿请求才算数**。
 * 这里取一条已建的笔记，把面板那 7 个 kind 各存一遍；反例是首页专属的 elevator（必须仍被拒）。
 */
const notePage0 = await call('GET', '/api/decorate/page', { query: { key: noteKey } });
const noteDraftBase = notePage0.ok ? notePage0.data.data : null;
const NOTE_KIND_SAMPLE = {
  text: { text: '一段文本' },
  swiper: { images: [{ image: '/uploads/202610/20261009-eqst4d.jpg', link: '' }], mode: 'single', height: 750 },
  rich_text: { html: '<p>富文本</p>' },
  line: { style: 'solid', height: 2 },
  blank: { height: 30 },
  audio: { src: '/uploads/202610/demo.mp3' },
  video: { src: '/uploads/202610/demo.mp4', poster: '/uploads/202610/20261009-eqst4d.jpg' }
};
const noteKindReject = [];
/*
 * ⚠️ 这里必须**就地 require 一份**，不能用别处声明的 `schemaMod` / `requireFromHere`：
 *    它们都是 `const` 且声明在 1600 行之后（TDZ）—— 在本节引用会抛
 *    「Cannot access 'xxx' before initialization」，被最外层的「自检中断」兜住，
 *    于是后面所有断言静默消失（铁律 51：自检也会说谎）。
 *    这个写法与文件里 fragSchema / pvRequire 一路（就地 createRequire）。
 */
const noteSchema = (await import('node:module')).createRequire(import.meta.url)(
  join(__dirname, '..', 'decorate', 'schema.js'));
for (const k of (notePage0.ok ? noteSchema.SHOPNOTE_LIB_KINDS : [])) {
  const one = JSON.parse(JSON.stringify(noteDraftBase));
  one.blocks = [Object.assign({ id: 'k' + k, type: k }, NOTE_KIND_SAMPLE[k] || {})];
  const rr = await call('POST', '/api/decorate/draft', { body: { key: noteKey, data: one } });
  if (!rr.ok) noteKindReject.push(k + '→' + rr.json.code + ' ' + rr.json.msg);
}
assert('★ 笔记组件面板放行的 7 个 kind 都能存进草稿（「能加」与「收得下」同一份清单）',
  notePage0.ok && noteKindReject.length === 0,
  noteKindReject.length ? '收不下去的：' + noteKindReject.join(' | ') : '7 个 kind 全部通过');

const noteOutOfLib = JSON.parse(JSON.stringify(noteDraftBase || {}));
noteOutOfLib.blocks = [{ id: 'x1', type: 'elevator', title: '电梯导航' }];
const noteOutOfLibRes = await call('POST', '/api/decorate/draft', {
  body: { key: noteKey, data: noteOutOfLib }, expectFail: '越界区块类型', expectHttp: 200, expectCode: 1001
});
assert('笔记里塞首页专属 kind（elevator）仍被拒 1001（不是把校验关掉了）',
  /不支持/.test(noteOutOfLibRes.json.msg || ''), noteOutOfLibRes.json.msg);

/*
 * 存一份**确定是 3 个区块**的草稿，再读列表 —— 两个口径必须各说各的：
 *   blockCount 仍是 0（代码包里确实还没有这篇），draftBlockCount 是 3。
 * 这条同时是「不许把 blockCount 的数据源换成草稿」的守卫：真换了，blockCount 会变 3，
 * 装修台列表的既有口径被顺手改掉，而装修台没有任何一条断言会因此变红。
 */
const noteThree = JSON.parse(JSON.stringify(noteDraftBase));
noteThree.blocks = [
  Object.assign({ id: 'c1', type: 'text' }, NOTE_KIND_SAMPLE.text),
  Object.assign({ id: 'c2', type: 'blank' }, NOTE_KIND_SAMPLE.blank),
  Object.assign({ id: 'c3', type: 'line' }, NOTE_KIND_SAMPLE.line)
];
const noteThreeSave = await call('POST', '/api/decorate/draft', { body: { key: noteKey, data: noteThree } });
const notePagesDraft = await call('GET', '/api/decorate/pages');
const noteRowDraft = (notePagesDraft.data.list || []).filter((p) => p.key === noteKey)[0] || {};
assert('笔记列表口径：草稿的区块数单独上报（blockCount 仍读已生成代码那一份，没被草稿覆盖）',
  noteThreeSave.ok && noteRowDraft.hasDraft === true &&
  noteRowDraft.draftBlockCount === 3 && noteRowDraft.blockCount === 0,
  `存草稿 code=${noteThreeSave.json.code}　hasDraft=${noteRowDraft.hasDraft}　` +
  `draftBlockCount=${JSON.stringify(noteRowDraft.draftBlockCount)}（期望 3）　` +
  `blockCount=${noteRowDraft.blockCount}（期望 0）`);

/* 收尾：丢弃这一轮存的草稿，别把「有未保存草稿」留给后面的用例 */
await call('POST', '/api/decorate/discard', { body: { key: noteKey } });

const noteDelMiss = await call('POST', '/api/decorate/note/delete', {
  body: { key: 'note-999999' }, expectFail: '笔记不存在', expectHttp: 404, expectCode: 404
});
assert('删除不存在的笔记报 404（而不是静默成功）',
  /不存在/.test(noteDelMiss.json.msg || ''), noteDelMiss.json.msg);

const noteDel = await call('POST', '/api/decorate/note/delete', { body: { key: noteKey } });
assert('删除店铺笔记成功（按页面标识 note-<id>，不是内部数字 id）',
  noteDel.ok && noteDel.data.id === noteId && noteDel.data.title === NOTE_TITLE,
  noteDel.ok ? `${noteDel.data.key} / ${noteDel.data.title}` : noteDel.json.msg);

/* ---------------------------------------------------------------------------
 * ★ 笔记的「生成代码」门（2026-10-15 修的真 bug，行为判据）
 *
 * 症状（实测取证）：建 A、建 B 两篇笔记 → 只给 **B** 点一次「生成代码」→
 *   replica.js 里**同时**出现了 A，`/api/decorate/pages` 随即把 A 判成「代码已生成」。
 *   也就是说：运营在编、还没打算发布的笔记，会被任何一次「写 replica.js」悄悄下发到小程序
 *   （删除任意页面同样会触发）。控制台新加的「状态」列因此会与事实相反。
 *
 * 根因：组装 replica 用的是 publishedAll()，而它对**每一篇已注册笔记**都返回
 *   「注册表里的已发布内容」——「注册表里有」被当成了「已经下发」。
 *   修法：assemble() 只写「本次正在发布的那一篇」或「当前已经在 replica.js 里」的笔记。
 *
 * 两个方向都要锁（只锁一个会留下更严重的反例）：
 *   ① 没点过「生成代码」的笔记不许被顺带下发；
 *   ② 已经下发的笔记不许被顺手抹掉 —— 修法若写成「一律跳过所有笔记」，
 *      线上正在用的笔记会在发布/删除别的页面时凭空消失，比原 bug 更严重。
 * ------------------------------------------------------------------------- */
const gateIdOf = (key) => String(key).replace(/^note-/, '');
/*
 * 只在 SHOPNOTES 那一段里找 id，不在整份文件里找：
 * 整份找的话，某篇笔记的 id 恰好是自定义页 key 或别处的数字（如 "95"）就会假阳性。
 * SHOPNOTES 是 emit 里最后一段，从它的位置切到文件末尾即可。
 */
const noteInReplica = (key) => {
  if (!key) return false;
  const src = readFileSync(REPLICA_FILE, 'utf8');
  const i = src.indexOf('const SHOPNOTES');
  if (i < 0) return false;
  return src.slice(i).indexOf('"' + gateIdOf(key) + '":') >= 0;
};

const GATE_A = '自检笔记-门A';
const GATE_B = '自检笔记-门B';
const gateA = await call('POST', '/api/decorate/note/create', { body: { title: GATE_A } });
const gateB = await call('POST', '/api/decorate/note/create', { body: { title: GATE_B } });
const gateAKey = gateA.ok ? gateA.data.key : '';
const gateBKey = gateB.ok ? gateB.data.key : '';

assert('笔记「生成代码」门：两篇新笔记都还没进 replica.js（建条目 ≠ 下发；两篇都建成功才有意义）',
  !!gateAKey && !!gateBKey && !noteInReplica(gateAKey) && !noteInReplica(gateBKey),
  `A=${gateAKey || '(建失败)'} 在产物里=${noteInReplica(gateAKey)}　B=${gateBKey || '(建失败)'} 在产物里=${noteInReplica(gateBKey)}`);

if (gateAKey && gateBKey) {
  await call('POST', '/api/decorate/draft', {
    body: {
      key: gateBKey,
      data: {
        header: { title: GATE_B, summary: '', tags: '' },
        body: { html: '<p>门的正例</p>', bg: '#ffffff', full: '1' },
        blocks: [Object.assign({ id: 'g1', type: 'text' }, NOTE_KIND_SAMPLE.text)]
      }
    }
  });
  const gatePub = await call('POST', '/api/decorate/publish', { body: { key: gateBKey, note: '自检：生成代码' } });
  assert('笔记「生成代码」门：点过「生成代码」的那一篇确实进了 replica.js（门不是把所有人都挡在外面）',
    gatePub.ok && noteInReplica(gateBKey),
    `发布 code=${gatePub.json.code}　B 在产物里=${noteInReplica(gateBKey)}`);

  assert('★ 笔记「生成代码」门：给 B 生成代码，不会把没点过「生成代码」的 A 一起下发（运营在编的内容不许被顺带上线）',
    !noteInReplica(gateAKey),
    `A 在产物里=${noteInReplica(gateAKey)}（期望 false）　B 在产物里=${noteInReplica(gateBKey)}`);

  /* 删 A（会整份重建 replica）—— 这是「② 已下发的 B 不能被顺手抹掉」的关键一步 */
  const gateDelA = await call('POST', '/api/decorate/note/delete', { body: { key: gateAKey } });
  assert('★ 笔记「生成代码」门：删除另一篇笔记时，已下发的 B 不许被顺手抹掉（防「一律跳过所有笔记」这种修过头）',
    gateDelA.ok && noteInReplica(gateBKey) && !noteInReplica(gateAKey),
    `删 A code=${gateDelA.json.code}　B 仍在产物里=${noteInReplica(gateBKey)}（期望 true）　` +
    `A 在产物里=${noteInReplica(gateAKey)}（期望 false）`);

  const gatePages = await call('GET', '/api/decorate/pages');
  const gateRowB = (gatePages.data.list || []).filter((p) => p.key === gateBKey)[0] || {};
  assert('笔记「生成代码」门：状态列与产物一致（B 判「代码已生成」，不是只改了文件没改状态）',
    gateRowB.generated === true && gateRowB.status === '代码已生成',
    `B: generated=${gateRowB.generated} status=${gateRowB.status}`);

  const gateDelB = await call('POST', '/api/decorate/note/delete', { body: { key: gateBKey } });
  assert('笔记「生成代码」门：删掉已下发的 B 后产物里不留幽灵笔记（真机能按旧 id 打开的那种）',
    gateDelB.ok && !noteInReplica(gateBKey),
    `删 B code=${gateDelB.json.code}　B 在产物里=${noteInReplica(gateBKey)}（期望 false）`);
} else {
  assert('笔记「生成代码」门：A / B 都建成功（建不出来就没法验门，宁可红也别静默跳过）', false,
    'note/create 失败：' + (gateA.json && gateA.json.msg) + ' / ' + (gateB.json && gateB.json.msg));
}

const notesAfter = await call('GET', '/api/decorate/notes', { auth: false });
assert('自检未改变笔记数量（可重复运行），且 replica.js 里没有测试笔记残留',
  notesAfter.ok && notesAfter.data.list.length === baseNotes
  && readFileSync(REPLICA_FILE, 'utf8').indexOf(noteKey) < 0,
  `${baseNotes} → ${notesAfter.ok ? notesAfter.data.list.length : '?'}｜残留=${readFileSync(REPLICA_FILE, 'utf8').indexOf(noteKey) >= 0}`);

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

/** 抽出一个 wxml 片段里用到的全部 class / hover-class（{{ }} 内只认字符串字面量） */
function classRefsOf(src) {
  const out = new Map(); // cls -> attr（hover-class 的失败要单独归到另一条断言）
  const clean = String(src).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of clean.matchAll(/\b(class|hover-class)\s*=\s*"([^"]*)"/g)) {
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
      if (!out.has(cls)) out.set(cls, attr);
    }
  }
  return out;
}

/**
 * 扫一个 wxml 文件里用到的 class / hover-class，逐个对照 allowed 集合。
 *
 * `label` 是写进失败信息里的位置描述 —— 片段要带上「被哪个页面引用」，
 * 否则只看文件名根本不知道是哪一个作用域缺样式。
 */
function scanClassRefs(file, label, allowed, refsIn) {
  const refs = refsIn instanceof Map ? refsIn : classRefsOf(readFileSync(file, 'utf8'));
  for (const [cls, attr] of refs) {
    if (attr === 'hover-class') scopeHoverChecked++; else scopeChecked++;
    if (!allowed.has(cls)) {
      (attr === 'hover-class' ? scopeHoverIssues : scopeIssues).push(`${label} ${attr}="${cls}"`);
    }
  }
}

/*
 * 片段（templates/*.wxml）的 class 该跟谁对账？
 *
 * templates/blocks.wxml 是**全站区块 markup 的并集**：首页（.c-* 系列）、「我的」（.cu-* 系列）、
 * 店铺笔记（7 个组件）四类页面 <include> 同一份。每个页面只会渲染自己组件面板里允许的区块类型，
 * 所以「每一页都必须定义片段里全部 class」是**事实错误** —— 实测会一口气报出 52~169 条假红
 * （假红比不检查更糟，见 PITFALLS A）。
 *
 * 但只按「所有包含页的并集」查又是真漏洞：那样只要**任意一个**页面定义了某个 class，
 * 别的页面压根没这份样式也照样绿 —— 实测漏掉过 templates/blocks.wxml 里的「文本」区块
 * （.cu-text 系列）：店铺笔记的组件面板里有「文本」，note.wxss 却没有那份样式，
 * 真机是文字挤在一起、没内边距没底色，而自检 100% 绿。
 *
 * 正确判据是**按区块类型对账**：把片段按顶层 wx:if / wx:elif 切成段、标出每段服务哪些
 * block.type，页面允许哪些 kind 就只对账那些段 —— 既不会假红，也不会漏。
 */
function fragmentSegmentsByKind(file) {
  const raw = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  /* 先把「跨行的标签」折成一行：标签内的换行对解析无意义，而 wx:elif 折行的写法
     （`<view` / `  wx:elif="{{block.type === 'image' …}}"`）会让「按行找段首」直接漏掉 5 处。
     {{ }} 里的 `>` / `<` 不是标签边界，所以要先记住当前是否在 {{ }} 里。 */
  let flat = '';
  let inTag = false;
  let inTpl = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '{' && raw[i + 1] === '{') inTpl++;
    else if (c === '}' && raw[i + 1] === '}') inTpl = Math.max(0, inTpl - 1);
    if (!inTpl) {
      if (c === '<') inTag = true;
      else if (c === '>') inTag = false;
      else if (c === '\n' && inTag) { flat += ' '; continue; }
    }
    flat += c;
  }
  const segs = [];
  let cur = { kinds: new Set(), lines: [] };
  segs.push(cur);
  flat.split(/\r?\n/).forEach((L) => {
    // 顶层子节点缩进恰好 2 空格；嵌套的 wx:if（如轮播提示样式）缩进更深，不算段首
    if (/^  <[a-z-]+\b[^>]*\bwx:(if|elif)="/.test(L)) {
      const kinds = new Set();
      for (const m of L.matchAll(/block\.type\s*===\s*'([^']+)'/g)) kinds.add(m[1]);
      cur = { kinds, lines: [L] };
      segs.push(cur);
      return;
    }
    cur.lines.push(L); // 含 WXML 内置的 wx:else 分支：跟随上一段的类型
  });
  return segs.map((s) => ({ kinds: s.kinds, refs: classRefsOf(s.lines.join('\n')) }))
    .filter((s) => s.refs.size);
}

/* schema 在这里还不能用 requireFromHere（它 1486 行才定义，踩 TDZ），自己建一个即可 */
const fragSchema = (await import('node:module')).createRequire(import.meta.url)(
  join(__dirname, '..', 'decorate', 'schema.js'));
/** 页面 → 它组件面板里允许的区块类型（真源就是 schema 里那几张 kind 表，不在这里抄第二份） */
const FRAG_HOST_KINDS = {
  'pages/index/index.wxml': () => Object.keys(fragSchema.HOME_BLOCK_KINDS),
  'pages/custom/index.wxml': () => Object.keys(fragSchema.HOME_BLOCK_KINDS),
  'pages/mine/mine.wxml': () => fragSchema.MINE_LIB_KINDS.slice(),
  'packageNews/note/note.wxml': () => fragSchema.SHOPNOTE_LIB_KINDS.slice()
};

const ALL_WXML = WALK(MP_ROOT).filter((f) => f.endsWith('.wxml'));

ALL_WXML.forEach((f) => {
  const rel = f.replace(/\\/g, '/').split('/miniprogram/')[1];
  const isComponent = rel.startsWith('components/');
  const isFragment = rel.startsWith('templates/');
  const ownWxss = f.replace(/\.wxml$/, '.wxss');

  if (isFragment) {
    /*
     * 见上方 fragmentSegmentsByKind 的说明：逐页查，但**只查这一页真的会渲染的区块类型**。
     * 兜底段（段首没有任何 block.type 条件，例如外层 `<view class="blk">`）里的 class
     * 是所有包含页共用的，每一页都必须能解析。
     */
    const segs = fragmentSegmentsByKind(f);
    const commonRefs = new Map();
    segs.filter((s) => !s.kinds.size).forEach((s) => s.refs.forEach((a, c) => commonRefs.set(c, a)));
    const kindsRefs = new Map(); // kind -> Map(cls, attr)
    segs.filter((s) => s.kinds.size).forEach((s) => {
      s.kinds.forEach((k) => {
        if (!kindsRefs.has(k)) kindsRefs.set(k, new Map());
        s.refs.forEach((a, c) => kindsRefs.get(k).set(c, a));
      });
    });
    includersOf(f, ALL_WXML).forEach((host) => {
      const hostRel = host.replace(/\\/g, '/').split('/miniprogram/')[1];
      const allowed = new Set([...appWxssClasses, ...wxssClasses(host.replace(/\.wxml$/, '.wxss'))]);
      const pageKinds = FRAG_HOST_KINDS[hostRel] ? FRAG_HOST_KINDS[hostRel]() : null;
      const refs = new Map(commonRefs);
      // pageKinds === null（将来新加的页面没登记）：保守起见查全片段，宁可多问一句也别漏样式
      const useKinds = pageKinds || [...kindsRefs.keys()];
      useKinds.forEach((k) => {
        const m = kindsRefs.get(k);
        if (m) m.forEach((a, c) => { if (!refs.has(c)) refs.set(c, a); });
      });
      scanClassRefs(f, `${rel}（被 ${hostRel} 引用）`, allowed, refs);
    });
    return;
  }

  // 组件：只吃自己那份 wxss；页面：app.wxss + 本页 wxss
  const allowed = isComponent
    ? wxssClasses(ownWxss)
    : new Set([...appWxssClasses, ...wxssClasses(ownWxss)]);
  scanClassRefs(f, rel, allowed);
});

assert('小程序 wxml 的 class 引用都在正确作用域内有定义（组件不吃 app.wxss 的 class）',
  scopeIssues.length === 0,
  scopeIssues.length ? `未定义：${scopeIssues.join(' | ')}` : `${scopeChecked} 处 class 引用全部有定义`);

assert('小程序 hover-class 全部有对应样式（否则是「点了没反应」的哑点击态）',
  scopeHoverIssues.length === 0,
  scopeHoverIssues.length ? `未定义：${scopeHoverIssues.join(' | ')}` : `${scopeHoverChecked} 处 hover-class 全部有定义`);

/*
 * 片段包含页必须在 FRAG_HOST_KINDS 里登记过。
 * 漏登记不会漏样式（兜底是「查全片段」，更严），但会一次性报出上百条假红 ——
 * 与其让下一个人对着一屏假红猜，不如在这里指名道姓地说「XX 页没登记区块类型表」。
 */
const fragHostRel = new Set();
ALL_WXML.filter((f) => f.replace(/\\/g, '/').indexOf('/templates/') >= 0)
  .forEach((f) => includersOf(f, ALL_WXML).forEach((h) => fragHostRel.add(h.replace(/\\/g, '/').split('/miniprogram/')[1])));
const unregisteredHosts = [...fragHostRel].filter((h) => !FRAG_HOST_KINDS[h]);
assert('片段（templates/*.wxml）的包含页都登记了「自己能渲染哪些区块类型」',
  unregisteredHosts.length === 0,
  unregisteredHosts.length ? '未登记：' + unregisteredHosts.join(', ')
    : `${fragHostRel.size} 个包含页已登记：${[...fragHostRel].join(', ')}`);

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
    // 2026-10-13 清理：删掉 'resume'（播放方式）—— 渲染端从不读它（暂停行为写死在 audio 上下文），
    // 面板能选但真机不变 ⇒ 属零消费字段。见 yzPanels.js 对应注释。
    audio: ['src', 'duration', 'text', 'avatar', 'useShopLogo', 'side', 'pageMargin'],
    service: ['text', 'align', 'color', 'bg', 'radius', 'bgOut', 'pageMargin'],
    content_card: ['title', 'cols', 'ratio', 'imgHeight', 'items', 'style', 'radius', 'showTag', 'showRead', 'showLike', 'more', 'moreText', 'link', 'pageMargin',
      // 2026-10-12 复刻「创业故事」页时按真机实测补的细粒度字段（默认值 = 原来写死在 WXSS 里的值）
      'padY', 'gapX', 'gapY', 'titleSize', 'titleWeight', 'titleLineHeight', 'titleAlign', 'titleColor', 'titlePadX', 'titlePadY'],
    buy_bar: ['goodsId', 'text', 'fontSize', 'align', 'theme', 'btnBg', 'padX', 'padB', 'btnH', 'btnR', 'bgOn', 'bg', 'bgH'],
    // 品牌分类（对标有赞「品牌分类E」）：三层数据 + 三个样式分组 + 扩展设置。
    // 这 62 个字段是有赞面板逐项抓来的，少任何一个都等于「属性面板少一项」。
    brand_category: [
      'brands',                                   // 左侧导航（品牌）→ panels（小组）→ items（条目）
      'title', 'panels', 'layout', 'items',
      'image', 'desc', 'linkMode', 'link',
      'bgImage', 'bgTopLink', 'bgTopGap',          // 内容背景图 / 背景顶部链接 / 背景顶部间距
      // 2026-10-13 清理：删掉 'switchMode'（菜单切换效果）—— 渲染端只有「分页切换」一种行为
      'navWidth', 'contentPadX',                   // 样式设置 · 布局
      'navStyle', 'navBg', 'navColor', 'navColorActive', 'navBgActive', 'navBgIdle',
      'navBorderColor', 'navBorderLine', 'navHeight', 'navMargin', 'navBorderH', 'navBorderW',
      'navFontSize', 'navWeight', 'navWeightActive', 'navAlign',   // 样式设置 · 左侧导航
      'itemShadow', 'itemBorderColor', 'itemTitleColor', 'itemGapX', 'itemGapY', 'itemRadius',
      'itemTitleSize', 'itemTitleWeight', 'itemTitleAlign',
      'panelTitleColor', 'panelTitleSize', 'panelTitleWeight', 'panelTitleAlign',
      'panelTitleGapX', 'panelTitleGapY', 'panelGap', 'contentPadBottom',
      'effect', 'effectSpeed', 'effectDelay',      // 样式设置 · 右侧内容
      'navLogo', 'searchMode', 'bg', 'moduleBgImage', 'moduleBgFill', 'reserveTabbar', 'navSticky' // 扩展设置
    ],
    // 混合排列（对标有赞店铺侧三方扩展「混合排列A」extension-masswx-hpitemsa）。
    // 这 33 个字段是按有赞三页签（基本设置 / 标题设置 / 扩展设置）逐项抄下来的，
    // 少一个 = 属性面板少一项、运营就复刻不出这个组件。
    mixed_grid: [
      'subTitle', 'title',                        // 标题设置 · 文案
      'titleAlign', 'titleSize', 'subSize', 'titleWeight', 'subWeight',
      'titleColor', 'subColor', 'titleGapTop', 'titleGapBottom',   // 标题设置 · 样式
      'layout', 'items',                          // 基本设置 · 布局与卡片
      'image', 'title', 'link',                   // 卡片条目
      'cardStyle', 'cardBg', 'cardBgAlpha',       // 样式设置 · 卡片外观
      'radius', 'cardRadius', 'imgRatio',
      'gap', 'paddingInner', 'paddingX', 'paddingY',
      'itemTitleColor', 'itemTitleSize', 'itemTitleWeight', 'itemTitleAlign', 'itemTitleLines',
      'bg', 'anim'                                // 扩展设置
    ],
    // 选项卡分类（对标有赞店铺侧三方扩展「选项卡Z4」extension-massdesign-tabcatez4）。
    // 这 35 个字段是按有赞两页签（图文设置 / 扩展设置）逐项抄下来的，
    // 少一个 = 属性面板少一项、运营就复刻不出这个组件。
    tab_cate: [
      'layout', 'tabs',                          // 列表布局 + 选项卡（→ 图文内容 → 条目）
      'name', 'items',
      'image', 'video', 'title', 'link',         // 条目字段
      'cardStyle', 'cardBg',                     // 样式设置 · 卡片外观
      // 2026-10-13 清理：删掉 'gapInner'（图文内间距）—— 渲染端只读外间距 gapOuter，
      // 内间距是「有赞面板有、我们没实现」的零消费字段
      'fit', 'gapOuter', 'radius', 'halfRound', 'imgRatio',
      'showTitle', 'titleLines', 'titleSize', 'titleGapY', 'titleGapX', 'titleBold', 'titleAlign',
      'titleColor', 'tabColor', 'tabActiveColor', 'tabBg', 'tabFontSize',   // 扩展设置 · 选项卡
      'paddingInner', 'paddingX', 'paddingTop', 'paddingBottom',
      'bg', 'innerBg', 'bgImage'
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
  /* (6) 装修台左侧按「有赞真实分组」渲染，而不是拍平成一堆（否则 55 个平铺没法找）。
   *     2026-10-13 起再加一条：**能跑的常态展示、跑不起来的收进默认折叠的分组**。
   *     ⚠️ 这是文本级断言（只证明源码里有这段逻辑）；「默认真的只看到 22 张」这件事
   *        必须由真浏览器哨兵 `.tooling/test-admin-lib.mjs` 量（折叠时那些卡片压根不渲染）。
   *        两条一起用：这条防「逻辑被整段删掉」，哨兵防「逻辑在、但没生效」。 */
  {
    const libChecks = [
      ['lib.groups 分组', /lib\.groups/],
      ['__group 分组头', /__group/],
      ['it.why 未接入原因', /it\.why/],
      ['lib-rest-head 折叠头', /lib-rest-head/],
      ['libRestOpen 展开状态', /libRestOpen/],
      ['x.on && !x.dep 分桶判据', /x\.on && !x\.dep/]
    ];
    const libMissing = libChecks.filter((c) => !c[1].test(adminJs)).map((c) => c[0]);
    assert('装修台左侧按 lib.groups 分组渲染，且未支持 / 依赖占位收进默认折叠的分组',
      libMissing.length === 0,
      libMissing.length ? '缺少：' + libMissing.join(' / ')
        : 'renderLib 按有赞分组渲染 + 未接入项显示 why + 依赖占位收进 lib-rest-head 折叠组（默认收起）');
  }

  /* (7) 真能跑的组件里，不允许「面板能填、渲染端一次都不读」的字段。
   *     判据用**项目自己的契约**（schema 的 dep 字段），不做文本猜测：
   *       · dep 非空 = 依赖占位组件（照抄有赞面板留档，铁律 8）→ 字段零消费是**预期**的，跳过；
   *       · dep 为空 = 真能跑 → 此时零消费字段就是缺陷：运营改了没反应，只会反复重配。
   *     扫描按**词边界**（避免 bg 命中 bgColor），偏保守：只会少报、不会把活字段报成死的。
   *     对应人工复核脚本 .tooling/audit-block-fields.mjs，这条断言是它的常驻守卫。
   *     2026-10-13 本批据此清掉 6 个零消费字段（audio.resume / tab_cate.gapInner /
   *     brand_category.switchMode / goods_group.menuSkin+goodsStyle / shop_rank.rankBy）。 */
  {
    const deadSites = [
      join(MP_ROOT, 'templates', 'blocks.wxml'),
      join(MP_ROOT, 'utils', 'blocks.js'),
      join(__dirname, '..', 'public', 'shared', 'pv-render.js'),
      join(__dirname, '..', 'decorate', 'emit.js'),
      join(__dirname, '..', 'public', 'admin', 'admin.js')
    ].map((p) => readFileSync(p, 'utf8'));
    const NON_DATA = new Set(['k', 'label', 'type', 'def', 'group', 'fields', 'item', 'options', 'hint', 'tip',
      'desc', 'value', 'min', 'max', 'step', 'unit', 'collapsed', 'open', 'title', 'imageList', 'lib',
      'template', 'required', 'placeholder', 'when', 'show', 'showWhen', 'visible']);
    const collectK = (fields, out) => {
      for (const f of fields || []) {
        if (f && f.k && !NON_DATA.has(f.k)) out.add(f.k);
        if (f && f.fields) collectK(f.fields, out);
        if (f && f.item && f.item.fields) collectK(f.item.fields, out);
      }
    };
    const deadFields = [];
    let checkedKinds = 0;
    for (const [type, def] of Object.entries(schemaMod.HOME_BLOCK_KINDS)) {
      if (def.dep) continue;                 // 依赖占位组件：零消费属预期
      checkedKinds++;
      const keys = new Set();
      collectK(def.fields, keys);
      for (const k of keys) {
        const re = new RegExp('(^|[^A-Za-z0-9_$])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_$]|$)');
        if (!deadSites.some((t) => re.test(t))) deadFields.push(type + '.' + k);
      }
    }
    assert('真能跑的组件（dep 空）里没有「面板能填、渲染端不读」的零消费字段',
      deadFields.length === 0,
      deadFields.length ? `零消费字段（面板改了真机不变）：${deadFields.join(', ')}`
        : `${checkedKinds} 个真能跑的组件，全部字段都能落到真机 / 预览`);
  }

  /* (8) 后台顶栏的身份文案必须去重。
   *     现象：「超级管理员 · 超级管理员」—— 口令登录拿到的就是 owner，
   *     服务端 `issue('owner', '超级管理员')` 让 name 与 roleLabel 都是「超级管理员」，
   *     前端再硬塞一个同名 name，裸拼 `name · roleLabel` 就显示两遍。
   *     装修台（admin.js）与后台控制台（console.core.js）各有一份顶栏，**两份都要守**。
   *     断言写成「不许出现裸拼 + 必须用去重函数」，而不是比对某个字符串 ——
   *     后者只是把当前文案抄一遍，改了标点就假红、也拦不住回归。 */
  {
    const whoFiles = [
      ['装修台 admin.js', readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8')],
      ['后台控制台 console.core.js', readFileSync(join(__dirname, '..', 'public', 'console', 'console.core.js'), 'utf8')]
    ];
    const whoBad = [];
    for (const [n, src] of whoFiles) {
      if (!/whoText/.test(src)) whoBad.push(n + '：没有 whoText 去重函数');
      if (/name\s*\|\|\s*'管理员'\)\s*\+\s*' · '/.test(src)) whoBad.push(n + '：仍在裸拼 name · roleLabel');
      if (/name:\s*'超级管理员'/.test(src)) whoBad.push(n + "：仍硬塞 name: '超级管理员'（与 roleLabel 重复）");
    }
    assert('后台顶栏身份文案去重（不出现「超级管理员 · 超级管理员」）',
      whoBad.length === 0,
      whoBad.length ? whoBad.join(' | ') : '两处顶栏都走 whoText：名字与角色标签相同时只显示一次');
  }
}

/* ---------------------------------------------------------------------------
 * 15.79 个人中心（「我的」页）装修能力
 *
 * 为什么必须有这一组：
 *   「我的」原来是个**硬编码页面**，装修台里列着它却加不了任何组件 ——
 *   运营点「使用组件」全都弹「该页面暂不支持添加组件」。这次把它升级成区块流页
 *   （对标有赞 usercenter-decorate），等于给一条新链路的每个环节都埋了坑：
 *     · schema 加了 9 种区块 → wxml / blocks.js / pv-render 少一处就是「真机空白」；
 *     · 新增 replica.MINE_BLOCKS 字段 → emit 三处不同步，发布任意页面都会 5000；
 *     · 组件库限定 25 个 → 若与 union 的 kinds 不一致，就出现「能加但库里找不到」；
 *     · 必备工具 21 项 → 图标/是否可跳只存在于服务端，两侧各写一份必然走样。
 *   所以这一组把「区块类型 ↔ 五处渲染 ↔ 字段落盘 ↔ 组件库范围 ↔ 页面交互」串起来对账。
 *
 * 数据来源：2026-10-10 用真实浏览器抓有赞「个人中心装修」页面
 *   （模板二的 7 个区块、添加组件 20 个分 3 组、必备工具 20 个插件的默认勾选、
 *     window['__design-value__'] 的逐字段默认值），见 server/decorate/yzUserCenter.js 的文件头。
 * ------------------------------------------------------------------------- */
{
  const UC_KINDS = ['uc_navbar', 'uc_profile', 'uc_stats', 'uc_order', 'uc_tools', 'text', 'link', 'blank', 'follow_oa'];
  const mineKinds = schemaMod.MINE_BLOCK_KINDS || {};
  const homeKinds = schemaMod.HOME_BLOCK_KINDS || {};
  /* 这几个在 15.78 里是**块级 const**（出了那个块就没了），这里按需重新读一次 */
  const blocksWxml = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
  const pvRendSrc = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');

  /* (1) 「我的」= 首页区块 + 9 种个人中心专属区块；且首页那份**不被污染**
   *     （污染了首页组件库就会冒出「个人信息 / 必备工具」这些只属于个人中心的组件） */
  const leaked = UC_KINDS.filter((k) => homeKinds[k]);
  const missingKinds = UC_KINDS.filter((k) => !mineKinds[k]);
  assert('「我的」页区块类型 = 首页 57 种 + 个人中心专属 9 种，且首页区块表未被污染',
    leaked.length === 0 && missingKinds.length === 0 && Object.keys(mineKinds).length === Object.keys(homeKinds).length + 9,
    (leaked.length ? `首页多出：${leaked.join(', ')}` : '') +
    (missingKinds.length ? ` 我的缺：${missingKinds.join(', ')}` : '') ||
    `首页 ${Object.keys(homeKinds).length} 种 + 专属 9 种 = ${Object.keys(mineKinds).length} 种`);

  /* (2) 9 种新区块的「五处齐备」：wxml 分支 / blocks.js 派生值 / pv-render 分支 / 中文角标
   *
   * ⚠️ 预览那一条必须查 **UC_PARTS 的成员**而不是「源码里出现过 `kind === 'text'`」：
   *    pvUserCenter 内部本来就是一串 `if (kind === 'x')`，只查这一条的话，
   *    就算把某个类型从 UC_PARTS 摘掉（= 预览里渲染成空白块），断言照样是绿的。
   *    这一条**用故意摘掉 UC_PARTS 里的 text 验过能报红**，别再放宽。 */
  const ucBlocksJs = readFileSync(join(MP_ROOT, 'utils', 'blocks.js'), 'utf8');
  const noWxml = UC_KINDS.filter((k) => blocksWxml.indexOf(`block.type === '${k}'`) < 0);
  const noNormalize = UC_KINDS.filter((k) => ucBlocksJs.indexOf(`kind === '${k}'`) < 0);
  const ucPartsSrc = /var UC_PARTS = \{([\s\S]*?)\};/.exec(pvRendSrc)[1];
  const noPv = UC_KINDS.filter((k) => ucPartsSrc.indexOf(k + ':') < 0);
  const noLabel = UC_KINDS.filter((k) => !/var KIND_LABEL = \{([\s\S]*?)\};/.exec(pvRendSrc)[1].includes(k + ':'));
  assert('个人中心 9 种新区块的渲染分支五处齐备（schema / wxml / blocks.js / pv-render / 中文角标）',
    noWxml.length + noNormalize.length + noPv.length + noLabel.length === 0 &&
    /UC_PARTS\[kind\]/.test(pvRendSrc) && /pvUserCenter\(b, kind\)/.test(pvRendSrc),
    (noWxml.length ? `wxml 缺：${noWxml.join(', ')}` : '') +
    (noNormalize.length ? ` blocks.js 缺：${noNormalize.join(', ')}` : '') +
    (noPv.length ? ` 预览未登记：${noPv.join(', ')}` : '') +
    (noLabel.length ? ` 角标缺：${noLabel.join(', ')}` : '') ||
    `${UC_KINDS.length} 种新区块四处渲染 + 中文角标全部就位`);

  /* (3) 「我的」页必须是区块流页（has blocks 节点）——
   *     不是区块流时装修台会整栏收起组件库，等于「这个页还是不能装修」。 */
  const mineDef = (schemaMod.allPages() || []).filter((p) => p.key === 'mine')[0];
  assert('「我的」页已升级为区块流页（装修台会展示组件库，而不是整栏收起）',
    !!mineDef && !!schemaMod.MINE_BLOCKS_NODE && mineDef.root.fields.some((f) => f.k === 'blocks'),
    mineDef ? `source = ${mineDef.source}` : '找不到 mine 页定义');

  /* (4) 组件库：照有赞「添加组件」= 4 组 25 项（基础 7 / 营销 2 / 其他 11 / 专属 5），
   *     且**每一项都指向真实存在的 kind**（否则卡片上会挂「未接入」角标）。 */
  const ucLib = schemaMod.mineComponentLib();
  const gotUcGroups = (ucLib.groups || []).map((g) => g.name + ':' + g.items.length);
  const ghostUc = (ucLib.kinds || []).filter((x) => !mineKinds[x.kind]).map((x) => x.label);
  assert('个人中心组件库 = 有赞实测 4 组 25 项（基础 7 / 营销 2 / 其他 11 / 专属区块 5），且每项都有真实区块类型',
    gotUcGroups.join('|') === '基础组件:7|营销组件:2|其他:11|专属区块:5' && ghostUc.length === 0 && ucLib.total === 25,
    ghostUc.length ? `无对应区块类型：${ghostUc.join(', ')}` : `实际 ${gotUcGroups.join(' ')}，共 ${ucLib.total} 项`);

  /* (5) 「页面区块」联合类型的 kinds 必须与组件库严格同集：
   *     放宽到 66 种 → 区块树里能加出组件库里找不到的组件；收窄 → 默认区块的属性面板打不开。 */
  const unionKinds = Object.keys(schemaMod.MINE_UNION_KINDS || {});
  const libKinds = (ucLib.kinds || []).map((x) => x.kind);
  const onlyUnion = unionKinds.filter((k) => libKinds.indexOf(k) < 0);
  const onlyLib = libKinds.filter((k) => unionKinds.indexOf(k) < 0);
  assert('「我的」页区块联合类型与组件库放行清单严格同集（25 种）',
    onlyUnion.length === 0 && onlyLib.length === 0 && unionKinds.length === 25,
    (onlyUnion.length ? `联合类型多出：${onlyUnion.join(', ')}` : '') +
    (onlyLib.length ? ` 组件库多出：${onlyLib.join(', ')}` : '') ||
    `${unionKinds.length} 种一一对应`);

  /* (6) 默认区块（照有赞模板二）必须全部落在放行清单内，否则一进编辑器就有区块打不开属性面板 */
  const defBlocks = schemaMod.UC_DEFAULT_BLOCKS || [];
  const defOut = defBlocks.filter((b) => !mineKinds[b.type]).map((b) => b.type);
  assert('个人中心默认区块（照有赞模板二 7 个）全部落在放行清单内',
    defOut.length === 0 && defBlocks.length === 7,
    defOut.length ? `越界：${defOut.join(', ')}` : `${defBlocks.length} 个默认区块：${defBlocks.map((b) => b.type).join(' → ')}`);

  /* (7) 发布链路：replica.MINE_BLOCKS 必须真的存在、且写回端三处同步
   *     （emit 的 need / 输出段 / fields 任一漏掉，发布任意页面都会因缺字段抛 5000）。 */
  const replica = requireFromHere(join(MP_ROOT, 'config', 'replica.js'));
  const emitSrc = readFileSync(join(__dirname, '..', 'decorate', 'emit.js'), 'utf8');
  const emitNeed = /const need = \[([^\]]*)\]/.exec(emitSrc)[1];
  const emitFields = /const fields = \[([^\]]*)\]/.exec(emitSrc)[1];
  const testEmitSrc = readFileSync(join(__dirname, '..', '..', '.tooling', 'test-emit.mjs'), 'utf8');
  assert('replica.MINE_BLOCKS 已落盘，且发布器三处（need / 输出 / fields）与往返测试都已同步',
    Array.isArray(replica.MINE_BLOCKS) && replica.MINE_BLOCKS.length > 0 &&
    emitNeed.includes("'MINE_BLOCKS'") && emitSrc.indexOf('const MINE_BLOCKS = ') > 0 &&
    emitFields.includes("'MINE_BLOCKS'") && testEmitSrc.includes("'MINE_BLOCKS'"),
    `replica.MINE_BLOCKS = ${Array.isArray(replica.MINE_BLOCKS) ? replica.MINE_BLOCKS.length + ' 个区块' : '缺失'}`);

  /* (8) 必备工具：真机图标表(TOOL_META) 与 服务端清单(UC_TOOL_ITEMS) 键集必须一致。
   *     差一条 = 真机上那一项显示成空白圆点（或反之：服务端有的真机不认识）。 */
  const blocksLib = requireFromHere(join(MP_ROOT, 'utils', 'blocks.js'));
  const toolMeta = Object.keys(blocksLib.TOOL_META || {});
  const ucToolTypes = (schemaMod.UC_TOOL_ITEMS || []).map((t) => t.type);
  const toolOnlyMeta = toolMeta.filter((k) => ucToolTypes.indexOf(k) < 0);
  const toolOnlySrv = ucToolTypes.filter((k) => toolMeta.indexOf(k) < 0);
  assert('必备工具的真机图标表与服务端清单键集一致（差一条＝真机上出现空白项）',
    toolOnlyMeta.length === 0 && toolOnlySrv.length === 0,
    (toolOnlyMeta.length ? `真机多出：${toolOnlyMeta.join(', ')}` : '') +
    (toolOnlySrv.length ? ` 服务端多出：${toolOnlySrv.join(', ')}` : '') ||
    `两侧各 ${toolMeta.length} 项，逐一对应`);

  /* (8b) 插件条目要把 icon / real / enabled 烘进区块数据 ——
   *      装修台预览与真机都读数据本身，各写一份表必然出现「预览 21 项、真机 20 项」。 */
  const plugins = (((replica.MINE_BLOCKS || []).filter((b) => b.type === 'uc_tools')[0] || {}).plugins) || [];
  const lackMeta = plugins.filter((p) => p.icon === undefined || p.real === undefined || p.enabled === undefined).map((p) => p.type);
  assert('必备工具条目把 icon / real / enabled 烘进区块数据（装修台与真机共用同一份真源）',
    plugins.length === ucToolTypes.length && lackMeta.length === 0,
    lackMeta.length ? `缺字段：${lackMeta.join(', ')}` : `${plugins.length} 个条目字段齐全`);

  /*
   * (8c) 键集一致还不够 —— **值也必须一致**。
   *
   * 真机上 `TOOL_META` 是「本次改动之前发布过的老数据」的兜底表，`UC_TOOL_ITEMS` 是装修台的展示口径。
   * 曾经这两处的 `real` 就打过架：TOOL_META 说 `accountSettings` 是真的（页面里确实有实现），
   * 服务端清单却标 `real:false`（后台把它显示成「未接入」）。键集断言查不出这类问题。
   */
  const valMismatch = (schemaMod.UC_TOOL_ITEMS || [])
    .filter((t) => {
      const m = blocksLib.TOOL_META[t.type];
      if (!m) return false;
      return !!m.real !== !!t.real || (m.icon || '') !== (t.icon || '');
    })
    .map((t) => {
      const m = blocksLib.TOOL_META[t.type];
      return `${t.type}(真机 real=${!!m.real}/icon=${m.icon}，服务端 real=${!!t.real}/icon=${t.icon})`;
    });
  assert('必备工具的 real / icon 两处取值一致（键集一致但值打架＝真机说能用、后台标未接入）',
    valMismatch.length === 0, valMismatch.join('；') || '逐项取值一致');

  /*
   * (8d) 「客服聊天」默认必须是开启的 —— 这是**功能性回归锁**，不是格式检查。
   *
   * 有赞默认 `show:false`（客服不在必备工具里）。但改造前本项目的「我的」页有一个
   * `<button open-type="contact">联系客服</button>`（见 git 历史），是真入口。
   * 照搬有赞默认值会静默丢掉这个入口 —— 页面上什么都不会报错，只是客服没了。
   */
  const csItem = (schemaMod.UC_TOOL_ITEMS || []).filter((t) => t.type === 'customerServiceChat')[0];
  assert('「客服聊天」在默认数据里是开启的（改造前的 open-type="contact" 入口不能丢）',
    !!csItem && csItem.show === true && csItem.enabled !== false && csItem.real === true,
    csItem ? `show=${csItem.show} real=${csItem.real}` : '清单里没有客服项');
  const csInData = plugins.filter((p) => p.type === 'customerServiceChat')[0];
  assert('已发布的 MINE_BLOCKS 里客服项同样是开启的（默认值改了要重灌 replica，否则装修台读到的还是老值）',
    !!csInData && csInData.show === true && csInData.enabled === true,
    csInData ? `show=${csInData.show}` : '落盘数据里没有客服项');

  /* (9) 「我的」页的真实交互不能被装修吃掉：
   *     页面必须走 blockPageBehavior（事件唯一实现），并保留「人」的装配与订单入口。
   *     ⚠️ 2026-10-13 起三处实现搬了家，断言跟着改成锁「能力」而不是锁「方法名」：
   *        · 「关于我们」「账号与安全」→ packageUser 分包里的真实页面（TOOL_ROUTE 统一跳转）；
   *        · 登录 / 退出登录 → utils/blockPage.js 的共用行为（blocks.wxml 是三个页面共用的，
   *          处理器只放「我的」页会让别的页面上出现绑了没实现的死绑定）；
   *        · 「我的」页只保留 syncUser / loadProfile 两个钩子（装修数据与运行态的缝合点）。 */
  const mineJs = readFileSync(join(MP_ROOT, 'pages', 'mine', 'mine.js'), 'utf8');
  const mineWxml = readFileSync(join(MP_ROOT, 'pages', 'mine', 'mine.wxml'), 'utf8');
  const mineJson = readFileSync(join(MP_ROOT, 'pages', 'mine', 'mine.json'), 'utf8');
  const bpForLogin = readFileSync(join(MP_ROOT, 'utils', 'blockPage.js'), 'utf8');
  const keepHandlers = ['onTapOrderStatus', 'syncUser', 'loadProfile'];
  const lostHandlers = keepHandlers.filter((h) => mineJs.indexOf(h) < 0);
  assert('「我的」页改用区块流渲染，同时保留登录 / 退出 / 客服 / 订单入口等真实交互',
    /blockPageBehavior/.test(mineJs) && /normalizeBlocks\(RAW_BLOCKS\)/.test(mineJs) &&
    mineWxml.indexOf('templates/blocks.wxml') > 0 && lostHandlers.length === 0 &&
    /onTapUcLogin/.test(bpForLogin) && /onTapUcLogout/.test(bpForLogin) &&
    JSON.parse(mineJson).usingComponents && !!JSON.parse(mineJson).usingComponents['empty-state'],
    lostHandlers.length ? `丢失交互：${lostHandlers.join(', ')}` : '真实交互全部保留（登录/退出在共用行为里）');

  /* (10) 组件库按页面下发：装修台必须能按页面切库（否则「我的」页显示的仍是首页那 57 种） */
  const decorateRoute = readFileSync(join(__dirname, '..', 'routes', 'decorate.js'), 'utf8');
  /*
   * ⚠️ 这里原来判的是 `Object.keys(pageLibs()).join(',') === 'mine'`。
   *    笔记（2026-10-15）也带页面级组件库之后，这个「只等于 mine」就不再成立了
   *    （有笔记时 pageLibs() 还会带上 note-<id>）。判据改成判**它该有的性质**：
   *    每个声明了 lib 的页面都得在表里出现，且「我的」页必须在。
   */
  const libKeys = Object.keys(schemaMod.pageLibs());
  assert('装修台组件库按页面下发（pageLibs）并支持分组渲染开关（tabs[].grouped）',
    /pageLibs/.test(decorateRoute) && /schema\.pageLibs\(\)/.test(decorateRoute) &&
    /usePageLib/.test(adminJs) && /meta\.grouped/.test(adminJs) &&
    libKeys.indexOf('mine') >= 0,
    'pageLibs 下发 + usePageLib 切库 + grouped 分组渲染均已就位；当前带独立库的页面：' + libKeys.join(','));

  /* (11) ★「面板能加什么」与「后端收不收」必须是同一份清单
   *
   * 2026-10-15 的真 bug：笔记组件面板里摆着「文本」「辅助空白」（它们在 UC_KINDS），
   * 而草稿校验 checkBlocks() 写死了 HOME_BLOCK_KINDS → 运营加一个「文本」，
   * 一点「存至草稿」就报 1001「第 1 个区块类型不支持：text」。
   * 装修台只改内存草稿（标记「有未保存改动」），所以只验到「加得进去」的脚本永远抓不到它。
   *
   * 这一组对**每个页面**对账：面板放行的 kind 必须全部在 schema.pageBlockKinds(该页) 里。
   * 新增一个页面级组件库（或往库里加一项）时，只要没同步放行清单，这里立刻红。 */
  const libMismatch = [];
  schemaMod.allPages().forEach((pg) => {
    if (!pg || !pg.lib || !Array.isArray(pg.lib.kinds)) return;
    const allowed = schemaMod.pageBlockKinds(pg);
    pg.lib.kinds.forEach((k) => {
      const kind = (k && k.kind) || k;
      if (!allowed[kind]) libMismatch.push(pg.key + ':' + kind);
    });
  });
  assert('每个页面「组件面板放行的区块类型」都能通过该页的数据校验（不留「能加但存不下去」的组件）',
    libMismatch.length === 0,
    libMismatch.length ? '收不下去的：' + libMismatch.join(', ') : '面板放行清单与校验放行清单逐页一致');

  /* 放行清单必须**按页面**取，不能顺手放宽到「一张全量表」：
   *   无组件库的页面（自定义页 / 内置页）= 首页那 59 种（**同一份对象**，不是等长的另一份）；
   *   笔记 = 面板那 7 个，一个不多一个不少。 */
  const noteAllowed = schemaMod.pageBlockKinds(schemaMod.shopnoteDef({ id: 999999, published: {} }));
  assert('放行清单按页面取：无库页面 = 首页那 59 种（同一份）；笔记 = 面板那 7 个（一个不多一个不少）',
    schemaMod.pageBlockKinds(schemaMod.get('home')) === schemaMod.HOME_BLOCK_KINDS &&
    schemaMod.pageBlockKinds(schemaMod.get('lexy')) === schemaMod.HOME_BLOCK_KINDS &&
    String(Object.keys(noteAllowed).sort()) === String(schemaMod.SHOPNOTE_LIB_KINDS.slice().sort()),
    'home=' + Object.keys(schemaMod.pageBlockKinds(schemaMod.get('home'))).length +
    ' note=' + Object.keys(noteAllowed).sort().join(','));
}

/* ---------------------------------------------------------------------------
 * 15.80 个人中心「点得动」链路（页面存在性 / 跳转表 / real 标记三方对账）
 *
 * 为什么必须有这一组：
 *   2026-10-13 之前的真实故障是 —— **后端 90 个点位全都存在，前端页面一个都没有**。
 *   `constants.js` 里 `ROUTES.ORDER_LIST`、`ADDRESS_LIST` 早就声明好了，`TOOL_META`
 *   也标着 `real: true`，但 `packageOrder` / `packageUser` 两个分包从没注册进 app.json、
 *   页面文件从没建过。于是「我的」页每个入口点下去都落到 `blockPage.js` 的兜底分支，
 *   弹一句「该功能开发中」—— 用户的原话是「每个点进去都点不了」。
 *
 *   这一组的价值就是把「声明」和「事实」焊死：
 *     · ROUTES 里每个路径都必须在 app.json 注册过（反过来也要成立）；
 *     · 每个注册过的页面四件套（js/wxml/wxss/json）必须真的在；
 *     · wxml 里绑定的每个事件处理函数必须在页面 js（或其行为对象）里真的有 —— 
 *       「绑了但没实现」就是「点了没反应」，编译期还不报错；
 *     · `real: true` 的工具必须有真实落点（TOOL_ROUTE 或声明过的非跳转方式）；
 *     · 依赖型入口必须都写了「为什么没有」（NOT_READY）。
 * ------------------------------------------------------------------------- */
{
  const appJson = JSON.parse(readFileSync(join(MP_ROOT, 'app.json'), 'utf8'));
  const routes = requireFromHere(join(MP_ROOT, 'utils', 'constants.js')).ROUTES;
  const bpMod = requireFromHere(join(MP_ROOT, 'utils', 'blockPage.js'));
  const blocksLib = requireFromHere(join(MP_ROOT, 'utils', 'blocks.js'));

  /* (0) 运行档位必须「按环境自动选」，且 **真机恒为 server**。
   *
   *     2026-10-15 的真实故障：开发者工具里首页一片空白、连素材都看不到。根因不在小程序，
   *     在网络层 —— `lexy.cn` 在公司内网有自建权威 DNS，且**出口按 SNI 过滤**：
   *     裸 IP 的 TCP 443 连得上（20ms），一带 hostname 做 TLS 握手就被 ECONNRESET（43ms）。
   *     而 `ENV` 自 2026-10-14 切域名那次起被钉死成 'server'，于是模拟器拉不到任何素材；
   *     首页那 11 个区块又**全是图片/视频、一个文字区块都没有** → 素材一挂整页空白。
   *
   *     判据只能用 `platform === 'devtools'`，**不能用 `envVersion === 'develop'`**：
   *     真机「开发版」（扫码预览）的 envVersion 同样是 'develop'，用它判会把**手机**
   *     也指到 127.0.0.1（手机上那是手机自己）→ 全空且无任何报错。
   *     所以下面逐个环境试，**真机那两条才是主判据**，devtools 只是顺带。 */
  const ENV_CONST_FILE = join(MP_ROOT, 'utils', 'constants.js');
  const envWith = (wxStub) => {
    const key = requireFromHere.resolve(ENV_CONST_FILE);
    delete requireFromHere.cache[key];
    const hadWx = Object.prototype.hasOwnProperty.call(globalThis, 'wx');
    const prevWx = globalThis.wx;
    if (wxStub === undefined) delete globalThis.wx; else globalThis.wx = wxStub;
    try {
      return requireFromHere(ENV_CONST_FILE).ENV;
    } finally {
      if (hadWx) globalThis.wx = prevWx; else delete globalThis.wx;
      delete requireFromHere.cache[key];
    }
  };
  const ENV_CASES = [
    ['真机 Android（**开发版也走这条**）', { getSystemInfoSync: () => ({ platform: 'android' }) }, 'server'],
    ['真机 iOS', { getSystemInfoSync: () => ({ platform: 'ios' }) }, 'server'],
    ['真机 Windows 微信', { getSystemInfoSync: () => ({ platform: 'windows' }) }, 'server'],
    ['开发者工具模拟器（旧接口）', { getSystemInfoSync: () => ({ platform: 'devtools' }) }, 'local'],
    ['开发者工具模拟器（新接口 getDeviceInfo）', { getDeviceInfo: () => ({ platform: 'devtools' }) }, 'local'],
    ['模拟器：新接口不返回 platform，旧接口兜住',
      { getDeviceInfo: () => ({}), getSystemInfoSync: () => ({ platform: 'devtools' }) }, 'local'],
    ['模拟器：新接口抛错，旧接口兜住',
      { getDeviceInfo: () => { throw new Error('boom'); }, getSystemInfoSync: () => ({ platform: 'devtools' }) }, 'local'],
    ['Node / 命令行工具（无 wx）', undefined, 'server'],
    ['接口抛异常', { getSystemInfoSync: () => { throw new Error('boom'); } }, 'server'],
    ['接口返回空对象', { getSystemInfoSync: () => ({}) }, 'server']
  ];
  const envWrong = ENV_CASES.filter(([, stub, want]) => envWith(stub) !== want)
    .map(([name, , want]) => `${name}（期望 ${want}）`);
  assert('utils/constants.js 的运行档位按环境自动选，且**真机恒为 server**（选错＝手机上全空且不报错）',
    envWrong.length === 0,
    envWrong.length ? `选错：${envWrong.join('；')}` : `${ENV_CASES.length} 个环境全部选对`);

  /* (0b) 「拼地址」必须走惰性复查（baseUrlNow），**不能**直接用加载期的 BASE_URL。
   *
   *     上面那条只验了「加载期那一判」。但 ENV 是**加载期**算的，而真正拼地址
   *     （resolveAssets / wx.request / 导航图标）全在**渲染期** —— 两个不同时刻。
   *     加载期若 wx 还没就绪，ENV 会停在 'server'，模拟器就会去连内网访问不了的域名
   *     → 素材全挂 → 整页空白、零报错（正是 2026-10-15 那次故障的形态）。
   *     所以这里专门验那条兜底路径：**加载期 server + 渲染期 devtools → 必须改判 local**。
   *     ⚠️ 真机那几条仍必须**保持 server** —— 纠正只能是单向的，不可能把真机改坏。 */
  const envPin = (/const\s+ENV_OVERRIDE\s*=\s*'([^']*)'/.exec(readFileSync(ENV_CONST_FILE, 'utf8')) || [])[1] || '';
  const LOCAL_URL = 'http://127.0.0.1:3000';
  const urlWith = (loadStub, callStub) => {
    const key = requireFromHere.resolve(ENV_CONST_FILE);
    delete requireFromHere.cache[key];
    const hadWx = Object.prototype.hasOwnProperty.call(globalThis, 'wx');
    const prevWx = globalThis.wx;
    const setWx = (s) => { if (s === undefined) delete globalThis.wx; else globalThis.wx = s; };
    setWx(loadStub);
    try {
      const mod = requireFromHere(ENV_CONST_FILE);
      const loadedEnv = mod.ENV;
      const loadedBase = mod.BASE_URL;
      setWx(callStub);   /* 加载完成后换桩 = 模拟「渲染期 wx 已就绪」 */
      return { loadedEnv, loadedBase, tier: mod.envNow(), url: mod.baseUrlNow() };
    } finally {
      if (hadWx) globalThis.wx = prevWx; else delete globalThis.wx;
      delete requireFromHere.cache[key];
    }
  };
  const DT = { getSystemInfoSync: () => ({ platform: 'devtools' }) };
  const AND = { getSystemInfoSync: () => ({ platform: 'android' }) };
  /* [说明, 加载期桩, 渲染期桩, 期望档（未钉死时）] */
  const LAZY_CASES = [
    ['加载期没有 wx（兜底 server）→ 渲染期发现是模拟器', undefined, DT, 'local'],
    ['加载期没有 wx → 渲染期仍是真机', undefined, AND, 'server'],
    ['加载期就是真机 → 渲染期真机', AND, AND, 'server'],
    ['加载期就是模拟器（旧接口）→ 渲染期模拟器', DT, DT, 'local'],
    ['加载期就是模拟器（新接口 getDeviceInfo）→ 渲染期模拟器',
      { getDeviceInfo: () => ({ platform: 'devtools' }) },
      { getDeviceInfo: () => ({ platform: 'devtools' }) }, 'local'],
    ['加载期真机 → 渲染期变成模拟器（中途才就绪）', AND, DT, 'local'],
    ['渲染期：新接口不返回 platform，旧接口兜住',
      undefined, { getDeviceInfo: () => ({}), getSystemInfoSync: () => ({ platform: 'devtools' }) }, 'local'],
    ['渲染期：新接口抛错，旧接口兜住',
      undefined, { getDeviceInfo: () => { throw new Error('boom'); }, getSystemInfoSync: () => ({ platform: 'devtools' }) }, 'local']
  ];
  const lazyWrong = [];
  LAZY_CASES.forEach(([name, loadStub, callStub, wantAuto]) => {
    const r = urlWith(loadStub, callStub);
    /* 手动钉死时惰性纠正按设计关闭 —— 期望值就是那一档，不算错 */
    const want = envPin || wantAuto;
    const wantUrl = want === 'local' ? LOCAL_URL : r.loadedBase;
    if (r.tier !== want || r.url !== wantUrl) {
      lazyWrong.push(`${name}（档 ${r.tier}／地址 ${r.url}，期望 ${want}／${wantUrl}）`);
    }
  });
  /* 关键区分性检查：真要出现「加载期 server、渲染期 devtools」时，
     地址必须**真的换掉**，不能与加载期快照相同（否则等于没兜住）。 */
  const lazyKey = urlWith(undefined, DT);
  const lazyKeyOk = envPin ? lazyKey.url === lazyKey.loadedBase : lazyKey.url === LOCAL_URL && lazyKey.loadedBase !== LOCAL_URL;
  assert('拼地址走 baseUrlNow() 惰性复查：**加载期拿不到 platform 时，模拟器仍能落到本机**'
    + (envPin ? `（当前被手动钉死为 '${envPin}'，纠正按设计关闭）` : ''),
    lazyWrong.length === 0 && lazyKeyOk,
    (lazyWrong.length ? `选错：${lazyWrong.join('；')}` : `${LAZY_CASES.length} 个时刻组合全部选对`)
      + `｜加载期快照 ${lazyKey.loadedBase} → 渲染期 ${lazyKey.url}`);

  /* app.json 里所有注册过的页面路径（主包 + 分包） */
  const allPages = [];
  (appJson.pages || []).forEach((p) => allPages.push('/' + p));
  (appJson.subPackages || []).forEach((sp) => {
    (sp.pages || []).forEach((p) => allPages.push('/' + sp.root + '/' + p));
  });

  /* (1) ROUTES ⇄ app.json 双向一致。
   *     曾经 `ROUTES.ORDER_CONFIRM = '/packageOrder/confirm/confirm'` 挂着一个**不存在**的页面：
   *     常量表里有路径 ≠ 真有页面 —— 这正是本次要修的坑，所以直接把「单向声明」也禁掉。 */
  const routeNotRegistered = Object.keys(routes).filter((k) => allPages.indexOf(routes[k]) < 0)
    .map((k) => `${k}=${routes[k]}`);
  assert('utils/constants.js 的 ROUTES 每个路径都已在 app.json 注册（不允许再出现「只声明没页面」的常量）',
    routeNotRegistered.length === 0,
    routeNotRegistered.length ? `未注册：${routeNotRegistered.join('；')}` : `${Object.keys(routes).length} 个路径全部已注册`);

  /* (2) 反过来：app.json 注册的每个页面，四件套必须真的在。
   *     「注册了但文件不在」在小程序里是编译期报错，但在本仓库里是很容易出现的半成品状态。 */
  const missingFiles = [];
  allPages.forEach((p) => {
    ['js', 'wxml', 'wxss', 'json'].forEach((ext) => {
      const f = join(MP_ROOT, p.replace(/^\//, '') + '.' + ext);
      if (!existsSync(f)) missingFiles.push(p + '.' + ext);
    });
  });
  assert('app.json 注册的每个页面四件套（js / wxml / wxss / json）都真实存在',
    missingFiles.length === 0,
    missingFiles.length ? `缺文件：${missingFiles.join('；')}` : `${allPages.length} 个页面 × 4 = ${allPages.length * 4} 个文件齐全`);

  /* (3) 分包注册：本次交付的两个分包必须出现在 app.json，且 preloadRule 里有「我的」页预下载
   *     （否则点订单/地址要等分包下载，弱网下就是「点了没反应」）。 */
  const subRoots = (appJson.subPackages || []).map((s) => s.root);
  const mineRule = (appJson.preloadRule || {})['pages/mine/mine'] || { packages: [] };
  assert('packageOrder / packageUser 两个分包已注册，「我的」页配了预下载（弱网下点入口不再等分包）',
    subRoots.indexOf('packageOrder') >= 0 && subRoots.indexOf('packageUser') >= 0 &&
    mineRule.packages.indexOf('packageOrder') >= 0 && mineRule.packages.indexOf('packageUser') >= 0,
    `分包：[${subRoots.join(', ')}]；我的页预下载：[${(mineRule.packages || []).join(', ')}]`);

  /* (4) wxml 绑定的事件处理函数必须在页面 js（含其行为对象）里真有 ——
   *     「绑了但没实现」在小程序里是**静默无效**：不报错，就是点了没反应。
   *     做法是「真的 require 每个页面模块 + 捕获 Page 对象」，方法名以 Page 对象为准
   *     （静态正则数不准；而且这一手法顺手抓到了地址列表页 `require('../../services/address')`
   *      少一级目录的真实故障 —— 页面一加载就 Cannot find module，整个页面打不开）。 */
  if (!globalThis.wx) {
    // 页面模块在 Node 里加载需要一个 wx 兜底；只用于「取方法名」，不执行任何业务逻辑
    globalThis.wx = new Proxy({}, { get: () => () => ({}) });
    globalThis.Component = () => {};
    globalThis.getApp = () => ({ globalData: {} });
    globalThis.getCurrentPages = () => [];
  }
  const pageMethods = (rel) => {
    const saved = globalThis.Page;
    let captured = null;
    globalThis.Page = (o) => { captured = o; };
    try {
      requireFromHere(join(MP_ROOT, rel + '.js'));
    } catch (e) {
      globalThis.Page = saved;
      return { err: e.message, keys: [] };
    }
    globalThis.Page = saved;
    return { err: '', keys: captured ? Object.keys(captured) : [] };
  };
  const bindRe = /\b(?:capture-bind:|capture-catch:|bind:|catch:|bind|catch)([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
  const collectBinds = (src) => {
    const out = [];
    let m;
    bindRe.lastIndex = 0;
    while ((m = bindRe.exec(src))) out.push(m[2].trim());
    return out;
  };
  const unbound = [];
  const checkedPages = [];
  allPages.forEach((p) => {
    const rel = p.replace(/^\//, '');
    const wxmlPath = join(MP_ROOT, rel + '.wxml');
    if (!existsSync(wxmlPath)) return;
    const info = pageMethods(rel);
    if (info.err) { unbound.push(`${rel}.js 加载失败：${info.err}`); return; }
    checkedPages.push(rel);
    let src = readFileSync(wxmlPath, 'utf8');
    // 「我的」页是区块流页：真正的交互在 include 进来的 templates/blocks.wxml 里。
    // 这里的语义是「模板里的绑定必须在**引入它的这个页面**上解析得到」——
    // 所以对「我的」页来说，它必须拥有 blocks.wxml 用到的全部事件方法。
    if (src.indexOf('templates/blocks.wxml') > 0) {
      src += readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
    }
    // 先剥 HTML 注释再扫：注释里写着的事件名会被当成真绑定（本仓库踩过这个坑）
    const binds = collectBinds(src.replace(/<!--[\s\S]*?-->/g, ''));
    binds.forEach((fn) => {
      if (info.keys.indexOf(fn) < 0) unbound.push(`${rel}.wxml → ${fn}（js 里没有这个方法）`);
    });
  });
  assert('每个页面 wxml 里绑定的事件处理函数在页面 js 里都真实存在（绑了没实现＝点了没反应，且不报错）',
    unbound.length === 0,
    unbound.length ? unbound.join('；') : `${checkedPages.length} 个页面的绑定逐一命中`);

  /* (5) 「real: true」必须有真实落点。
   *     两条合法路径：TOOL_ROUTE 里有真实页面（且路径已注册），或 TOOL_NON_NAV 里
   *     声明了非跳转的落地方式（客服 open-type / 拨号）。
   *     标 true 却点不动比标 false 更糟 —— 那是一次「页面暂未开放」的失败跳转。 */
  const realNoRoute = (schemaMod.UC_TOOL_ITEMS || [])
    .filter((t) => t.real === true && !bpMod.TOOL_ROUTE[t.type] && !bpMod.TOOL_NON_NAV[t.type])
    .map((t) => t.type);
  const routeNotPage = Object.keys(bpMod.TOOL_ROUTE)
    .filter((k) => allPages.indexOf(bpMod.TOOL_ROUTE[k]) < 0)
    .map((k) => `${k}→${bpMod.TOOL_ROUTE[k]}`);
  assert('必备工具里 real:true 的每一项都有真实落点（TOOL_ROUTE 里的真实页面，或声明过的非跳转方式）',
    realNoRoute.length === 0 && routeNotPage.length === 0,
    (realNoRoute.length ? `标了能用却没落点：${realNoRoute.join(', ')}` : '') +
    (routeNotPage.length ? ` 跳转目标不是已注册页面：${routeNotPage.join(', ')}` : '') ||
    `real:true 共 ${(schemaMod.UC_TOOL_ITEMS || []).filter((t) => t.real).length} 项，落点齐全`);

  /* (6) 依赖型入口必须都写了「为什么没有」——
   *     否则点下去只会看到兜底文案，用户还是不知道缺什么（等于换个说法的「开发中」）。 */
  const noReason = (schemaMod.UC_TOOL_ITEMS || [])
    .filter((t) => t.real !== true && !bpMod.NOT_READY[t.type])
    .map((t) => t.type);
  assert('「必备工具」里 real:false 的每一项都在 NOT_READY 表里写了具体依赖（不留空白说明）',
    noReason.length === 0,
    noReason.length ? `缺说明：${noReason.join(', ')}` : `${Object.keys(bpMod.NOT_READY).length} 条说明覆盖全部依赖型入口`);

  /* (7) 个人资产：写了 route 的项必须真的有页面（与工具同一口径）。 */
  const statNotPage = (blocksLib.UC_STAT_DEFS || [])
    .filter((d) => d.route && allPages.indexOf(d.route) < 0)
    .map((d) => `${d.key}→${d.route}`);
  assert('个人资产里有真实落点的项（优惠券）指向的是已注册页面',
    statNotPage.length === 0,
    statNotPage.length ? statNotPage.join('；') : `有落点的资产项：${(blocksLib.UC_STAT_DEFS || []).filter((d) => d.route).map((d) => d.key).join(', ')}`);

  /* (7b) 个人资产「缺省数值」口径（2026-10-13 店主要求：余额 / 积分缺省 0，不是 `—`）。
   *      这个值有**三处**会显示给用户：真机归一化（`blocks.js` 的 `UC_STAT_DEFS[].def`）、
   *      装修台预览（`pv-render.js` 里同源同序的镜像表）、页面复位（`defaultStatValues()`）。
   *      三处任意一处走样，运营就会看到「预览是 0、真机是 —」这种「改了却没生效」的现象，
   *      所以这里逐个对账 —— 预览镜像表尤其容易被人只改一边。 */
  const statDefs = blocksLib.UC_STAT_DEFS || [];
  const zeroKeys = ['balance', 'points'];
  const badDef = statDefs
    .filter((d) => (d.def || '—') !== (zeroKeys.indexOf(d.key) >= 0 ? '0' : '—'))
    .map((d) => `${d.key}=${d.def || '—'}`);
  assert('个人资产的缺省数值：余额 / 积分显示 0，张数类（权益卡 / 券 / 钱包 / 礼品卡 / 提货卡）显示 —',
    badDef.length === 0,
    badDef.length
      ? `口径不对：${badDef.join(', ')}`
      : statDefs.map((d) => `${d.label}=${d.def || '—'}`).join(' · '));

  const resetVals = typeof blocksLib.defaultStatValues === 'function' ? blocksLib.defaultStatValues() : null;
  const badReset = statDefs.filter((d) => !resetVals || resetVals[d.key] !== (d.def || '—')).map((d) => d.key);
  assert('defaultStatValues() 与 UC_STAT_DEFS 逐项一致（复位值只有一处定义，页面不许自己拼）',
    !!resetVals && badReset.length === 0,
    !resetVals ? 'blocks.js 没有导出 defaultStatValues()' : (badReset.length ? `不一致：${badReset.join(', ')}` : `${Object.keys(resetVals).length} 项一致`));

  const pvSrc = readFileSync(join(ROOT_DIR, 'server', 'public', 'shared', 'pv-render.js'), 'utf8');
  const pvStatBlock = (pvSrc.match(/var UC_STAT_DEFS = \[([\s\S]*?)\n  \];/) || [])[1] || '';
  const pvStats = [];
  /* 每项最多 5 个元素：键 / 名称 / 单位 / 缺省值 / 图标基名（第 52 批加的图标）。
     ⚠️ 这个正则**必须跟着真机表长出来** —— 只认 4 个元素的版本在加了图标之后整项失配，
     断言会红但报的是「不一致」，看不出真正原因是解析没跟上。 */
  pvStatBlock.replace(/\['([^']+)',\s*'([^']*)',\s*'([^']*)'(?:,\s*'([^']*)')?(?:,\s*'([^']*)')?\]/g,
    (m, k, label, unit, def, icon) => {
      pvStats.push({ k, label, unit, def: def === undefined ? '—' : def, icon: icon || '' });
      return m;
    });
  const pvBadDef = statDefs.filter((d, i) => {
    const p = pvStats[i];
    return !p || p.k !== d.k || p.label !== d.label || p.unit !== d.unit
      || p.def !== (d.def || '—') || p.icon !== (d.icon || '');
  }).map((d) => d.key);
  assert('装修台预览里的资产缺省值与图标同真机逐项一致（同源同序，预览不许显示另一个值）',
    pvStats.length === statDefs.length && pvBadDef.length === 0,
    `预览 ${pvStats.length} 项 / 真机 ${statDefs.length} 项`
      + (pvBadDef.length ? `；不一致：${pvBadDef.join(', ')}` : '，键 / 名称 / 单位 / 缺省值逐项一致'));

  /* (8) 个人中心链路上不许再有「点了没反应」式敷衍文案。
   *     ⚠️ 必须先剥注释再查：「注释里写着要禁用的字面量」会被当成代码（本仓库踩过）。
   *     这两个文件里的注释**确实**在讲以前那句「该功能开发中」，所以剥注释是必需的，不是修饰。 */
  const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const bpSrc = stripJs(readFileSync(join(MP_ROOT, 'utils', 'blockPage.js'), 'utf8'));
  const mineSrc = stripJs(readFileSync(join(MP_ROOT, 'pages', 'mine', 'mine.js'), 'utf8'));
  const leftover = [];
  ['该功能开发中', '订单中心开发中'].forEach((t) => {
    if (bpSrc.indexOf(t) >= 0) leftover.push(`blockPage.js: ${t}`);
    if (mineSrc.indexOf(t) >= 0) leftover.push(`mine.js: ${t}`);
  });
  assert('个人中心链路不再有「开发中」式敷衍提示（依赖型入口一律落到讲清楚原因的页面）',
    leftover.length === 0,
    leftover.length ? leftover.join('；') : 'blockPage.js / mine.js 已无占位提示');

  /* (9) 缺省值只许有一处定义：页面别自己拼缺省值。
   *     本轮的真实教训 —— `mine.js` 的 `loadStatValues` 原来写的是
   *     `this.syncStatValues({ coupon: '—' })`，于是「余额 / 积分缺省改成 0」这件事
   *     要改两个文件（blocks.js + mine.js），漏一处就是「退出登录后余额还留着上一个账号的数」。
   *     现在复位统一走 `defaultStatValues()`。
   *     ⚠️ 断言**不能**写成「页面里不许出现 `syncStatValues({`」—— 服务端拿到真数后回填
   *     本来就是 `syncStatValues({ coupon: 3 })`，那是对的（第一版这么写，当场误伤报红）。
   *     缺省值的特征就是那个 `—` 字面量，所以只盯它。 */
  const dashHard = mineSrc.indexOf("'—'") >= 0 || mineSrc.indexOf('"—"') >= 0;
  const resetOk = mineSrc.indexOf('syncStatValues(defaultStatValues())') >= 0 && !dashHard;
  assert('资产数值复位走 defaultStatValues()，页面里不出现 `—` 字面量（缺省值只定义一处）',
    resetOk,
    resetOk ? '复位值来自 utils/blocks.js 的 UC_STAT_DEFS[].def'
      : (dashHard ? 'mine.js 里又出现 `—` 字面量 —— 「余额 / 积分缺省 0」这类口径会分家'
        : 'mine.js 里没走 defaultStatValues() 复位'));

  /* -------------------------------------------------------------------------
   * (10) 第 52 批：个人中心图标（复刻有赞个人中心图标字体 usercenter-icon）
   *
   * 背景：以前三个区块的图标是**汉字**（'车' '任' '付' …），画在一个圆角底色块里。
   * 第 52 批换成有赞的真图标 —— 从有赞图标字体 `usercenter-icon` 复刻的 95 个字形，
   * 由 `.tooling/make-usercenter-icons.py` 渲染成 66×66 PNG 放包内
   * （`miniprogram/images/usercenter/`，另有 `stats/` 5 张资产位图 —— 有赞那 7 项资产
   * 用的本来就是 PNG 不是字体）。
   *
   * 为什么每条都要断：图标拼错一个字符**不会报错**，真机上就是一块空白（静默裂图），
   * 而且装修台预览走 `/images/…` 只读路由读同一份文件 —— 路径错了预览与真机一起白。
   * ----------------------------------------------------------------------- */
  const UC_ICON_ROOT = join(ROOT_DIR, 'miniprogram', 'images', 'usercenter');
  const iconExists = (rel) => {
    try { return statSync(join(UC_ICON_ROOT, rel)).isFile(); } catch (e) { return false; }
  };

  /* (10a) 工具图标：**两种风格都要有文件** —— 预览与真机按 iconMode 取 -o（线性）/ 无后缀（实色） */
  const metaMap = blocksLib.TOOL_META || {};
  const toolIconMissing = [];
  Object.keys(metaMap).forEach((k) => {
    const base = String(metaMap[k].icon || '');
    if (!base) { toolIconMissing.push(k + '→(空基名)'); return; }
    if (!iconExists(base + '.png')) toolIconMissing.push(k + '→' + base + '.png');
    if (!iconExists(base + '-o.png')) toolIconMissing.push(k + '→' + base + '-o.png');
  });
  assert('必备工具的图标是真实存在的包内文件（线性 -o 与实色两套都要有：iconMode 决定取哪张）',
    toolIconMissing.length === 0,
    toolIconMissing.length ? '缺文件：' + toolIconMissing.join('；')
      : `${Object.keys(metaMap).length} 项 × 2 套 = ${Object.keys(metaMap).length * 2} 个文件齐全`);

  /* (10b) 订单图标：不随 iconMode 变，照抄有赞 getDefaultOrderItems 的全名 */
  const orderIconMissing = (blocksLib.UC_ORDER_DEFS || [])
    .filter((d) => !iconExists(String(d.icon || '') + '.png')).map((d) => `${d.key}→${d.icon}.png`);
  assert('我的订单 5 个入口的图标文件都存在（全名照抄有赞 order__ 前缀，不按风格拼后缀）',
    orderIconMissing.length === 0,
    orderIconMissing.length ? '缺文件：' + orderIconMissing.join('；')
      : (blocksLib.UC_ORDER_DEFS || []).map((d) => d.label + '=' + d.icon).join(' · '));

  /* (10c) 资产图标：有赞 STATS_ICON_MAP 的位图（cards / giftCard / deliveryCard 有赞共用一张） */
  const statIconMissing = (blocksLib.UC_STAT_DEFS || [])
    .filter((d) => !iconExists(String(d.icon || '') + '.png')).map((d) => `${d.key}→${d.icon}.png`);
  assert('个人资产 7 项的图标文件都存在（有赞这 7 项用的是位图不是字体）',
    statIconMissing.length === 0,
    statIconMissing.length ? '缺文件：' + statIconMissing.join('；')
      : (blocksLib.UC_STAT_DEFS || []).map((d) => d.label + '=' + d.icon).join(' · '));

  /* (10d) 拼路径只有一处：ucIconFile() 必须真的按模式给对后缀 */
  const iconFnOk = typeof blocksLib.ucIconFile === 'function'
    && blocksLib.ucIconFile('cart', 'line') === '/images/usercenter/cart-o.png'
    && blocksLib.ucIconFile('cart', 'fill') === '/images/usercenter/cart.png'
    && blocksLib.ucIconFile('') === '';
  assert('ucIconFile() 是图标路径的唯一出口（line→-o / fill→无后缀 / 空基名→空串）',
    iconFnOk,
    iconFnOk ? '口径与有赞 ICON_MODE_MAP={1:colorIcon,2:icon} 同义' : 'ucIconFile 不存在或后缀口径不对');

  /* (10e) 「老数据回落到 TOOL_META」这条兜底必须真的在 —— 否则第 52 批之前发布的汉字会一直显示 */
  const legacyBlock = blocksLib.normalizeBlock({
    type: 'uc_tools', iconMode: 'line',
    plugins: [{ type: 'cart', title: '购物车', icon: '车', show: true, enabled: true }]
  });
  const legacyOk = legacyBlock.items.length === 1 && legacyBlock.items[0].icon === 'cart'
    && legacyBlock.items[0].iconFile === '/images/usercenter/cart-o.png';
  assert('装修数据里残留的「汉字图标」（本批之前发布的）会回落到 TOOL_META 的基名，不会画成裂图',
    legacyOk,
    legacyOk ? '老值 "车" → "cart"' : `回落失败：${JSON.stringify(legacyBlock.items)}`);

  /* (10f) 图标库规模：包内至少 95 个字形 + 5 张资产图（写 >= 而不是 ==，将来补图标不该红） */
  let iconCount = 0, statCount = 0;
  try {
    iconCount = readdirSync(UC_ICON_ROOT).filter((f) => f.endsWith('.png')).length;
    statCount = readdirSync(join(UC_ICON_ROOT, 'stats')).filter((f) => f.endsWith('.png')).length;
  } catch (e) { /* 目录不存在 → count 保持 0，下面报红 */ }
  assert('个人中心图标库齐备（有赞图标字体复刻的 95 个字形 + 5 张资产位图）',
    iconCount >= 95 && statCount >= 5,
    `字体图标 ${iconCount} 个 / 资产位图 ${statCount} 个`);

  /* (10g) 模板不许再把图标当**文字**画出来。
   *      `{{tl.icon}}` 这种写法在换成基名之后会直接显示成「cart」这串英文 —— 不报错、只是丑。
   *      ⚠️ 先剥 HTML 注释（注释里正写着要禁用的字面量，这是 §V 踩过的老坑）。 */
  const tplRaw = readFileSync(join(ROOT_DIR, 'miniprogram', 'templates', 'blocks.wxml'), 'utf8');
  const tplSrc = tplRaw.replace(/<!--[\s\S]*?-->/g, '');
  /* ⚠️ 诊断行必须**逐条列真实原因**，不能「没问题就打印一句『都对』」——
   * 第一版就是这么写的，注入验红时失败了却打印「uc_order / uc_tools 均用 <image>」，
   * 骗人（PITFALLS §V 的「诊断行复用同一条」）。
   * ⚠️ `<text>` 的正则也要带 `[^>]*`：真实写法是 `<text class="cu-ic">{{tl.icon}}</text>`，
   * 写死 `<text>` 会漏判（第一版注入的正是带 class 的那种）。 */
  const tplProblems = [
    /<text[^>]*>\{\{tl\.icon\}\}<\/text>/.test(tplSrc) ? 'uc_tools 仍把 icon 当文本渲染' : '',
    /<text[^>]*>\{\{item\.icon\}\}<\/text>/.test(tplSrc) ? 'uc_order 仍把 icon 当文本渲染' : '',
    /<image[^>]*src="\{\{item\.iconFile\}\}"/.test(tplSrc) ? '' : 'uc_order 没有 <image src="{{item.iconFile}}">',
    /<image[^>]*src="\{\{tl\.iconFile\}\}"/.test(tplSrc) ? '' : 'uc_tools 没有 <image src="{{tl.iconFile}}">'
  ].filter(Boolean);
  assert('模板里三个区块的图标都走 <image src="{{…iconFile}}">（不再把基名当文字画出来）',
    tplProblems.length === 0,
    tplProblems.length ? tplProblems.join('；') : 'uc_order / uc_tools 均用 <image>，且都绑 iconFile');

  /* (10h) 装修台预览与真机同口径：预览侧也必须走 ucIconFile（不能自己拼路径或显示汉字） */
  const pvIconOk = /function ucIconFile\(/.test(pvSrc)
    && /var UC_ICON_DIR = '\/images\/usercenter\/'/.test(pvSrc)
    && /ucIconFile\(d\[2\]\)/.test(pvSrc)          /* 订单 */
    && /ucIconFile\(base, b\.iconMode\)/.test(pvSrc); /* 工具：按风格取 */
  assert('装修台预览的图标口径与真机一致（同一个 ucIconFile + 同一个 /images/usercenter/ 目录）',
    pvIconOk,
    pvIconOk ? '预览侧订单 / 工具都走 ucIconFile' : 'pv-render.js 的图标路径口径与真机分家了');

  /* (10i) 已发布的装修数据里 icon 必须已经是**基名** —— 改了代码不重灌 replica 就是「预览白、真机有」。
   *      这是「默认值改了要重灌」那条老规矩在图标上的同一形态。
   *      ⚠️ 真源必须在本块内**自己取**：15.80 是独立的 `{ }` 块，上面那段 15.7x 里的
   *      `plugins` 是另一个块的局部变量，跨块引用只会得到 `plugins is not defined`
   *      —— 而这个异常会被「自检中断」那条兜住，表现为「断言总数莫名腰斩」，
   *      非常难查（本轮实测 566 → 294）。 */
  const pubReplica = requireFromHere(join(MP_ROOT, 'config', 'replica.js'));
  const pubPlugins = (((pubReplica.MINE_BLOCKS || []).filter((b) => b.type === 'uc_tools')[0] || {}).plugins) || [];
  const pubTools = pubPlugins.filter((p) => p && p.type);
  const pubBadIcon = pubPlugins
    .filter((p) => p && p.icon !== undefined && !blocksLib.isIconBase(p.icon))
    .map((p) => `${p.type}=${JSON.stringify(p.icon)}`);
  assert('已发布的必备工具数据里 icon 已是图标基名（改图标必须重灌 replica，否则装修台预览与真机走样）',
    pubBadIcon.length === 0,
    pubBadIcon.length ? '仍是旧值（汉字）：' + pubBadIcon.slice(0, 6).join('；')
      : `${pubTools.length} 项均为基名`);
}

/* ---------------------------------------------------------------------------
 * 15.81 店铺笔记（对标有赞「内容管理 → 店铺笔记」）
 *
 * 为什么单开一节：笔记是**接进「页面」体系**做的（custom: true + 注册表 + 草稿/版本/发布
 * 全部复用），所以它踩的坑和别的页面不是一类：
 *   · 它有自己的真机页面（packageNews/note/note），地址口径必须与 app.json 的分包注册对得上；
 *   · 它的内容住在 `data.header` 里（字段树写的是 header.title），一旦数据平铺回顶层，
 *     装修台面板上那 7 个字段会**显示为空、改完静默丢弃、且不报任何错**（实测发生过）；
 *   · 它跟自定义页都带 `custom: true`，任何「先判 custom 再判 shopnote」的地方都会把它认错
 *     （store.publishedAll / preview.js 的角标 / pv-render 的分派都各是一处）。
 * 这些都不是「业务流程跑不通」，而是「看起来是好的」，只能靠静态对账与形状断言抓。
 * ------------------------------------------------------------------------- */
{
  const snReq = requireFromHere(join(__dirname, '..', 'decorate', 'shopnotes.js'));
  const schReq = requireFromHere(join(__dirname, '..', 'decorate', 'schema.js'));
  const mpNoteDir = join(MP_ROOT, 'packageNews', 'note');
  /*
   * ⚠️ 这三个源码必须在本块内**自己读**。
   *    15.10 那段里的 `pvSrc` / `previewSrc` / `adminSrc` 是模块级 const，
   *    但声明位置在**本块之后**（15.10 在第 3000 多行）—— 直接引用会踩 TDZ，
   *    抛 ReferenceError 被「自检中断」兜住，表现为「断言总数莫名腰斩」，极难查
   *    （15.80 的注释里记过同一坑：566 → 294）。
   */
  const PUBDIR = join(__dirname, '..', 'public');
  const pvRenderSrc = readFileSync(join(PUBDIR, 'shared', 'pv-render.js'), 'utf8');
  const pvPageSrc = readFileSync(join(PUBDIR, 'preview', 'preview.js'), 'utf8');
  const adminJsSrc = readFileSync(join(PUBDIR, 'admin', 'admin.js'), 'utf8');

  /* (a) 真机地址：PATH_PREFIX 与 app.json 的分包页必须对得上（地址只定义一处，这里是交叉验证） */
  const appJson = JSON.parse(readFileSync(join(MP_ROOT, 'app.json'), 'utf8'));
  const pkgNews = (appJson.subPackages || []).filter((p) => p.name === 'packageNews')[0] || { pages: [] };
  const noteRel = 'note/note';
  const addrPrefix = String(snReq.PATH_PREFIX);
  const pathOk = addrPrefix.indexOf(pkgNews.root + '/' + noteRel) === 0;
  assert('笔记真机地址口径一致：PATH_PREFIX 指向 app.json 里已注册的分包页',
    pathOk && pkgNews.pages.indexOf(noteRel) >= 0 && /^packageNews\/note\/note\?id=$/.test(addrPrefix),
    pathOk && pkgNews.pages.indexOf(noteRel) >= 0
      ? `PATH_PREFIX="${addrPrefix}"，packageNews.pages 含 "${noteRel}"`
      : `PATH_PREFIX="${addrPrefix}" / packageNews.pages=[${pkgNews.pages.join(',')}]（分包页没注册 → 真机跳转必失败）`);

  /* (b) 小程序端四件套齐（缺任一个，开发者工具只在打开那一页时才报错） */
  const missingFiles = ['note.js', 'note.wxml', 'note.wxss', 'note.json']
    .filter((f) => !existsSync(join(mpNoteDir, f)));
  assert('笔记详情页四件套齐全（js / wxml / wxss / json）',
    missingFiles.length === 0,
    missingFiles.length ? '缺：' + missingFiles.join(', ') : 'note.js / note.wxml / note.wxss / note.json 均在');

  /* (c) 「笔记头部」的形状：字段树的 header 节点与数据必须逐键对齐。
   *     判据取「字段树叶子在数据里取不到值」的条数 —— 这正是那次面板空白的成因。 */
  const walkLeaves = (node, base, out) => {
    if (!node) return out;
    if (node.type === 'object') {
      (node.fields || []).forEach((f) => {
        if (f.type === 'group') { walkLeaves({ type: 'object', fields: f.fields }, base, out); return; }
        const p = base ? base + '.' + f.k : f.k;
        out.push(p);
        walkLeaves(f, p, out);
      });
    }
    return out;
  };
  const getPathOf = (o, p) => String(p).split('.').reduce((acc, s) => (acc == null ? undefined : acc[s]), o);
  const pubReplicaForNote = requireFromHere(join(MP_ROOT, 'config', 'replica.js'));
  const deadFields = [];
  let leafTotal = 0;
  schReq.allPages().forEach((p) => {
    let d;
    try { d = p.from(pubReplicaForNote); } catch (e) { deadFields.push(`${p.key} from() 抛异常`); return; }
    const leaves = walkLeaves(p.root, '', []);
    leafTotal += leaves.length;
    leaves.forEach((lp) => { if (getPathOf(d, lp) === undefined) deadFields.push(`${p.key} 的 ${lp}`); });
  });
  assert('所有页面的字段树叶子在数据里都取得到值（面板不会出现「看着是空的、改了不生效」）',
    deadFields.length === 0,
    deadFields.length ? '取不到：' + deadFields.slice(0, 8).join('；')
      : `${schReq.allPages().length} 个页面 / ${leafTotal} 个叶子字段全部命中`);

  /* (d) 笔记数据顶层**不许**再平铺 title / tags / covers —— 那样是「两处数据、只认一处」 */
  const noteDefShape = schReq.SHOPNOTE_HEADER_NODE.fields.map((f) => f.k);
  /* 归一化的输出里**顶层**只允许 publishedAt —— 用空入参探一次就够，不必逐键构造 */
  const normTopKeys = Object.keys(snReq.normalizeContent({}));
  const flatLeaked = normTopKeys.filter((k) => k !== 'publishedAt' && k !== 'header' && k !== 'body' && k !== 'blocks');
  assert('笔记内容一律住在 data.header 下（顶层不再平铺那 7 个内容键）',
    flatLeaked.length === 0 && String(snReq.HEADER_KEYS.join(',')) ===
      'title,summary,tags,coverMode,covers,showGoodsCard,showNoteOnGoods' &&
    noteDefShape.join(',').indexOf('title,summary,tags') === 0,
    flatLeaked.length ? '顶层仍出现：' + flatLeaked.join(', ')
      : `HEADER_KEYS=${snReq.HEADER_KEYS.length} 项，字段树 header 首三项 = ${noteDefShape.slice(0, 3).join(',')}`);

  /* (e) 标题必填是硬约束（空标题曾被静默接受，列表里多出一篇叫「笔记 #3」的空笔记） */
  const titleChecks = [
    snReq.checkTitle('') !== '',
    snReq.checkTitle('x'.repeat(snReq.TITLE_MAX + 1)) !== '',
    snReq.checkTitle('莱克洗地机实测') === ''
  ];
  assert('笔记标题：必填 + 不超过 40 字（早先那个「可以关掉必填」的开关已彻底删掉）',
    titleChecks.every(Boolean),
    '空=' + snReq.checkTitle('') + ' / 超长=' + snReq.checkTitle('x'.repeat(41)));

  /* (f) 笔记页底色必须与装修台预览的默认页底逐字一致（两处不同向＝运营照着一种灰调、真机另一种） */
  const noteWxssSrc = readFileSync(join(mpNoteDir, 'note.wxss'), 'utf8');
  const bgInWxss = (noteWxssSrc.match(/\.note-page\s*\{[^}]*background:\s*([^;]+);/) || [])[1] || '';
  const pvBgDef = (pvRenderSrc.match(/var PAGE_BG_DEF = '([^']+)'/) || [])[1] || '';
  assert('笔记页底色与装修台预览默认页底逐字一致（否则装修台与真机不是一个底色）',
    !!bgInWxss && bgInWxss.trim() === pvBgDef,
    `note.wxss 的 .note-page background=${JSON.stringify(bgInWxss.trim())}，pv-render 的 PAGE_BG_DEF=${JSON.stringify(pvBgDef)}`);

  /* (g) 预览链路：笔记必须走 pvNote（不是 pvCustom），且分派顺序是「先 shopnote 后 custom」 */
  const pvNoteOk = /function pvNote\(/.test(pvRenderSrc)
    && /if \(!fn && opts && opts\.shopnote\) fn = pvNote;/.test(pvRenderSrc)
    && pvRenderSrc.indexOf('fn = pvNote') < pvRenderSrc.indexOf('fn = pvCustom');
  assert('装修台预览：笔记走 pvNote（店长区 + 正文 + 组件流），分派先判 shopnote 再判 custom',
    pvNoteOk,
    pvNoteOk ? 'pvNote 已就位且分派顺序正确' : 'pv-render.js 里笔记会被当成自定义页渲染（店长区与正文整体消失）');
  const pvNoteBodyOk = /data-path="header"/.test(pvRenderSrc) && /data-path="body"/.test(pvRenderSrc);
  assert('预览里的「笔记头部 / 笔记正文」带 data-path（点得中、能选中）',
    pvNoteBodyOk, pvNoteBodyOk ? 'header / body 均有 data-path' : '缺 data-path，面板里点不中这两段');

  /* (h) 预览页（/preview）：非内置页地址取后端元信息，不在这里拼第二份。
   *     判据**必须剥注释再判字面**：这个文件的注释里为了讲清「不要拼地址」，
   *     逐字写着 `'/packageNews/note/note?id='`。不剥注释就会把「说明文字」当成违规
   *     （本案第一次跑就正是这样假红）。要抓的是**字符串字面量**，不是这几个汉字。 */
  const stripJs = (s) => String(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  const pvPageCode = stripJs(pvPageSrc);
  const hardCodedPath = (pvPageCode.match(/['"]\/?packageNews[^'"]*['"]/g) || []);
  const pvTargetOk = /var PAGE_PATH = \{\}/.test(pvPageCode)
    && /PAGE_PATH\[p\.key\] = p\.path/.test(pvPageCode)
    && hardCodedPath.length === 0;
  assert('/preview 的非内置页地址取自后端元信息（没有在前端拼第二份 packageNews/… 地址）',
    pvTargetOk,
    pvTargetOk
      ? `剥注释后：PAGE_PATH 元信息表在，硬编码地址 0 处（注释里的反例已忽略）`
      : (hardCodedPath.length ? '代码里硬编码了地址：' + hardCodedPath.join(', ')
        : 'preview.js 没找到 PAGE_PATH 元信息表'));

  /* (i) 装修台：认得出笔记，且「改名」不给（改了会与「标题在编辑器里改」两处打架） */
  const adminNoteOk = /meta\.shopnote/.test(adminJsSrc)
    && /shopnote: !!\(S\.cur\.meta && S\.cur\.meta\.shopnote\)/.test(adminJsSrc);
  assert('装修台把 shopnote 标记传给了预览分派（笔记与自定义页都带 custom，必须另看这个标记）',
    adminNoteOk, adminNoteOk ? 'admin.js 已透传 shopnote' : 'admin.js 没透传 shopnote → 笔记预览会走成自定义页');

  /* (j) 路由点位：三个笔记端点都在（新加的端点漏注册＝后台按钮点了 404） */
  const routeList = registered.map((r) => r.path);
  const need = ['/api/decorate/notes', '/api/decorate/note/create', '/api/decorate/note/delete'];
  const missingRoutes = need.filter((p) => routeList.indexOf(p) < 0);
  assert('店铺笔记三个点位都已注册（列表 / 新建 / 删除）',
    missingRoutes.length === 0,
    missingRoutes.length ? '未注册：' + missingRoutes.join(', ') : need.join(' / '));

  /* (k) 装修台「组件面板」是笔记专属那一份（7 个组件），不是首页那 58 个 */
  const lib = schReq.shopnoteComponentLib();
  const libKinds = (lib.groups || []).reduce((n, g) => n + (g.items || []).length, 0);
  assert('笔记的组件面板 = 有赞实测的 7 个（基础 3 / 其他 4），不是首页那 58 个',
    lib.total === 7 && libKinds === 7,
    `total=${lib.total} groups=${libKinds}`);
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

/* —— 收尾：把第 5 节的「头像探针」写回原值 ——
 * 不放回去的话，自检每跑一轮就把头像重新绑到素材库首件上；那个素材一旦被运营删掉，
 * `db.json` 就留下悬空的 /uploads 引用（第 5 节注释里记了完整因果）。 */
const avatarBack = await call('POST', '/api/user/profile', { body: { nickname: '联调账号', avatar: avatarRestore }, silent: true });
assert('自检收尾把头像探针写回原值（不把素材库首件长期绑在用户头像上）',
  avatarBack.ok && avatarBack.data && (avatarBack.data.avatar || '') === (avatarRestore || ''),
  `头像 ${JSON.stringify(avatarRestore)} ← 探针曾用 ${JSON.stringify(avatarLocal)}`);

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

/* ---- 装修入口：点「装修」必须在**新窗口**打开编辑器（2026-10-10 用户确认口径）----
 *
 * ⚠️ 这条口径被改过两次，务必按当前版本理解，别照着旧注释改回去：
 *   · 最初：/admin 的「装修」是同页切 #viewList / #viewEdit，控制台里的装修台是 iframe 内嵌；
 *   · 中间一版（错的）：按「不要新窗口」把控制台的新窗口入口也一起去掉了；
 *   · 现在（用户确认）：**点「装修」= 在新窗口打开编辑器**。装修是「对着真机效果反复调」的活，
 *     运营要同时开着控制台 / 商品页做对照；挤在同一个标签页里切来切去，一按返回还会把
 *     编辑器里的未保存状态一起丢掉。
 *
 * 两条硬要求，任一条被改回去都会让运营多绕一圈：
 *   ① 入口必须是真 <a target="_blank">（不是 window.open，也不是同页按钮）——
 *      真链接才支持中键 / 右键「在新标签页打开」，也不会被浏览器当弹窗拦掉；
 *   ② 新窗口加载的 /admin?edit=<key> 必须**直达**那个页面的编辑器，
 *      否则运营每开一个页面都要在新窗口里再点一次「装修」，比同页切换还费事。
 */
const decoJs = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');
const decoCss = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.css'), 'utf8');
/* 断言前必须剥注释：下面说明里会原样引用旧写法（<button data-open> / App.go('decorate')），
 * 不剥的话「自己写的注释」会把断言判红 —— 这类假红比不检查更浪费时间。 */
const decoJsNoComment = decoJs
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const decoCssNoComment = decoCss.replace(/\/\*[\s\S]*?\*\//g, '');
/* 上面那段说明文字里本身就引用了旧代码，同样要剥掉再断言 */
const consoleJsNoComment = consoleJs
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/* ---- 装修台（/admin）侧：三个「进入编辑器」的入口都必须是新窗口真链接 ---- */
assert('装修台的「装修」按钮是在新窗口打开的真链接（<a target="_blank"> + /admin?edit=<key>）',
  /<a class="btn sm" href="\/admin\?edit='\s*\+\s*attr\(encodeURIComponent\(p\.key\)\)[\s\S]{0,130}?target="_blank"/.test(decoJsNoComment),
  '退回 <button data-open> 就又是「在当前页切换」');
assert('装修台的页面名也是新窗口链接（与「装修」按钮同一个入口，不能一个同页一个新窗口）',
  /<a class="pname" href="\/admin\?edit='\s*\+\s*attr\(encodeURIComponent\(p\.key\)\)[\s\S]{0,130}?target="_blank"/.test(decoJsNoComment));
assert('「设置底部导航」同样在新窗口打开（/admin?edit=nav）',
  /href="\/admin\?edit=nav"[\s\S]{0,60}?target="_blank"/.test(decoJsNoComment));
assert('列表点击委托里不再处理进入编辑器（data-open 已摘掉，免得分页切换与新窗口各来一份）',
  !/data-open/.test(decoJsNoComment));
assert('装修台支持 URL 直达编辑器（读 ?edit= → 列表加载后直接开那个页面；新窗口才不用再点一次「装修」）',
  /function editKeyFromUrl/.test(decoJsNoComment) &&
  /URLSearchParams\(location\.search\)\.get\('edit'\)/.test(decoJsNoComment) &&
  /loadPagesThenMaybeOpenEdit/.test(decoJsNoComment) &&
  /history\.replaceState\(null, '', key \? \('\/admin\?edit='/.test(decoJsNoComment));
assert('编辑器把当前页面同步进地址栏（新窗口被刷新 / 收藏后仍回到同一个页面）',
  /function syncUrl/.test(decoJsNoComment) && /syncUrl\(key\);/.test(decoJsNoComment));
assert('「装修」类链接有样式兜底（a.btn 去下划线 + 对齐盒模型 · a.pname 去下划线）',
  /a\.btn\s*\{/.test(decoCssNoComment) && /a\.pname\s*\{/.test(decoCssNoComment),
  '缺了会出现「同一行按钮高矮不齐 / 装修二字带下划线」');

/* ---- 控制台侧：至少要留一条「新窗口打开装修台」的路 ----
 * ⚠️ 判据只锁「有一个 .btn 形态的 <a> 指向 /admin 且 target="_blank"」，**不锁具体配色类**。
 *    原来写死 `class="btn primary"`，于是把这个按钮从「品牌红实底」降级成普通按钮
 *    （它只是「去别处开工」的跳转，不是本页主操作）就会假红 —— 断言的意图是
 *    「别把入口删了」，跟按钮什么颜色无关。 */
assert('控制台有指向装修台（/admin）的新窗口入口',
  /<a class="btn[^"]*" href="\/admin" target="_blank"/.test(consoleJsNoComment),
  '一个都没有的话，运营只能靠手输地址');
assert('「店铺设置」的「去装修台修改」是新窗口链接（不再在当前页切视图，也不再绑 App.go）',
  /href="\/admin" target="_blank"[\s\S]{0,90}?去装修台修改/.test(consoleJsNoComment) &&
  !/data-goto-decorate/.test(consoleJsNoComment));
assert('控制台侧栏的「装修台 /admin」也是新窗口入口（点它不该把控制台从当前标签页挤走）',
  /<a href="\/admin" target="_blank"/.test(readFileSync(join(__dirname, '..', 'public', 'console', 'index.html'), 'utf8')));
/* ⚠️ iframe 允许带 ?embed=1：那个参数让装修台藏起自己的顶栏（否则本页会出现
 *    两份「店铺装修台 / 超级管理员 / 退出」）。判据的意图是「这里内嵌了装修台」，
 *    不是「src 必须一字不差地是 /admin」。 */
assert('「店铺装修」视图仍内嵌装修台（一眼看到页面列表 / 草稿状态）且保留「刷新」按钮',
  /class="frame-wrap"><iframe src="\/admin(\?embed=1)?"/.test(consoleModSrc) && /data-frame-reload/.test(consoleModSrc));
assert('「店铺装修」视图的入口文案写明是「新窗口」打开（口径要写在运营看得到的地方）',
  /在新窗口<\/b>打开编辑器|在新窗口打开装修台/.test(consoleModSrc));
/* 高度写错=装修台底部的「生成代码」被顶出屏幕（运营点不到发布按钮），所以连数值一起锁 */
assert('内嵌装修台的 iframe 高度按整页占位计算（52 顶栏 + 56 body 内边距 + 45 卡片头 + 2 边框 = 155）',
  /\.frame-wrap\s*\{\s*height:\s*calc\(100vh\s*-\s*155px\)/.test(consoleCssNoComment),
  '写成 52+32（漏掉卡片标题栏）会让 iframe 比可视区高');

/* ---- 装修台列表「操作」列：按钮绝不能被压成竖排文字 ----
 *
 * 用户反馈（2026-10-10）：「下面两个自定义页，后面的字变成竖排了」。
 * 根因不是「列太窄」这么笼统 —— 是**零余量**：当时自定义页 6 个按钮（装修 / 查看变更 / 版本 /
 * 丢弃草稿 / 改名 / 删除）在 1440 视口下内联需求正好 364px，而操作列内容区也正好 364px。
 * CSS px 是整数、字体度量却随系统字体 / 浏览器缩放浮动，多出 1~2px 时 flex（默认 flex-shrink:1）
 * 先把按钮压窄，字随即折行；内置页只有 4 个按钮、余量足，
 * 所以现象只在自定义页那两行出现（用户截图正是如此）。
 *
 * 同日稍后用户又要求「把查看变更和版本去掉」—— 两个入口下架，操作列宽度随之 424 → 320px，
 * 余量从「零」变成 ~56px。但**防御重点从来不是那点余量**（列宽 / 字体 / 系统缩放都会变），
 * 而是下面第 ① 条。三处同时在位，缺一处这种「零余量折行」就会回来：
 *   ① 按钮 flex:0 0 auto + white-space:nowrap（主要防线，字体再宽也不折字）；
 *   ② 操作列宽度留余量（≥300px），且表格 min-width 要容得下「各定宽列之和 + 名称列下限」；
 *   ③ 文案不带多余的 ↗ 箭头（省 ~15px，也是用户明确要求）。
 * 真实几何（按钮总宽 vs 可用宽）由 .tooling/probe-admin-list.mjs 在真浏览器里量，这里只锁写法。
 */
const decoHtml = readFileSync(join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
/* 断言前先剥掉 HTML 注释：下面的说明性注释里会**原样引用**被删掉的入口名，
   不剥就会拿「自己写的注释」判红（这类假红比不检查更浪费时间）。 */
const decoHtmlNoComment = decoHtml.replace(/<!--[\s\S]*?-->/g, '');
assert('操作列的按钮组带 ops-row 类（列宽富余与不压缩的规则都挂在它上面）',
  /class="ops ops-row"/.test(decoJsNoComment),
  '缺了就只剩通用 .ops 的 nowrap —— flex 仍会把按钮压窄并折字');
assert('操作列按钮不被压缩、不折字（flex:0 0 auto + white-space:nowrap）',
  /\.ops-row\s*\{[^}]*flex-wrap:\s*wrap/.test(decoCssNoComment) &&
  /\.ops-row\s+\.btn\s*\{[^}]*flex:\s*0\s+0\s+auto[^}]*\}/.test(decoCssNoComment) &&
  /\.ops-row\s+\.btn\s*\{[^}]*white-space:\s*nowrap/.test(decoCssNoComment),
  '少了 flex:0 0 auto，列一紧张 flex 就把「丢弃草稿」压成两行竖排');
{
  /* 表头各定宽列 + 名称列下限 与 table min-width 的**关系**（不写死数值，运营改列宽时会自动跟着算） */
  const thW = [...decoHtml.matchAll(/<th style="width:(\d+)px"/g)].map((m) => Number(m[1]));
  const sum = thW.reduce((a, b) => a + b, 0);
  const tableMin = Number((/table\.grid\s*\{[^}]*min-width:\s*(\d+)px/.exec(decoCssNoComment) || [])[1]);
  const opsW = thW[thW.length - 1];
  assert('装修台列表：操作列 ≥300px（撤掉「查看变更/版本」后剩 4 个按钮，需求约 236px + 内边距 28 = 264px）',
    opsW >= 300,
    `操作列 width=${opsW}px`);
  assert('装修台列表：表格 min-width 容得下「各定宽列之和 + 名称列 ≥150px」',
    tableMin >= sum + 150,
    `min-width=${tableMin}px ｜ 定宽列之和=${sum}px（${thW.join('+')}）→ 名称列只剩 ${tableMin - sum}px`);
}
/* 「查看变更 / 版本」两个入口下架（用户 2026-10-10：「把查看变更和版本去掉」）。
 * 三处入口（编辑器顶栏 / 列表操作列 / 店铺导航卡片）都要撤干净：
 * 只删一两处会留下「点得到、但流程半截」的按钮，比全留还难查。
 * 同时断言前端**不再保留** showDiff / showVersions / rollback 三个函数 ——
 * 入口删了函数还留着，就是「按不到了但还在跑」的死代码，日后极易被误判成功能仍然可用。
 * 后端 /api/decorate/diff、/api/decorate/rollback 刻意保留（发布链路的备份/回滚能力），
 * 所以这里只查前端。 */
assert('装修台不再有「查看变更 / 版本」入口（顶栏、列表操作列、店铺导航卡片都不许挂）',
  !/btnDiff|btnVersions|data-diff=|data-vers=/.test(decoJsNoComment + '\n' + decoHtmlNoComment),
  '两个入口已按用户要求下线；加回来之前先看 admin.js 里那段「入口下线」的说明');
assert('「查看变更 / 版本历史」的前端实现已随入口删除（不留按不到的死函数）',
  !/function showDiff|function showVersions|function rollback/.test(decoJsNoComment),
  '留着这三个函数 = 死代码，日后会被当成功能仍然可用');
assert('装修台的按钮文案不带 ↗ 箭头（用户 2026-10-10：「装修后面不需要有箭头显示」）',
  !/↗/.test(decoJsNoComment),
  '「新窗口打开」的提示已放在 title 里（悬停可见），箭头只是噪音，还白占 ~15px 列宽');

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

/* ---- 手机必须**水平居中**，而且得是「安全居中」 ----
 * 实测反馈「装修预览要居中」：原 `.phone { align-self: flex-start }` 会**覆盖**容器的
 * `align-items: center`，手机一直贴在预览列左边。
 * 但修的时候不能只把它改成 center —— `.phone-stage` 是**可横向滚动**的容器，列宽 < 手机宽
 * （窄窗口，或 414 机型没跟着缩）时，靠 align-items / justify-content 居中会把手机左半边
 * 顶出容器且**滚不回去**。所以锁三件事：① 手机用 `margin: 0 auto`（Flexbox 里剩余空间为负
 * 时 auto margin 记 0 → 空间够居中、不够自动左对齐且能完整横滚）；② 不许再有
 * `align-self: flex-start`；③ `.phone-stage` 必须仍是横向可滚动的容器（否则第①条的安全
 * 回退就没意义了）。
 */
/* 注释里必然会提到被替换掉的旧写法（`align-self: flex-start`），不剔掉会自我误判 */
const stripCssComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '');
const phRule = stripCssComments((adminCss.match(/\.phone\s*\{[^}]*\}/) || [''])[0]);
const stageRule = stripCssComments((adminCss.match(/\.phone-stage\s*\{[^}]*\}/) || [''])[0]);
assert('装修台预览的手机在列内水平居中（auto margin 安全居中，窄窗口仍能完整横滚）',
  /margin:\s*0\s+auto/.test(phRule) && !/align-self:\s*flex-start/.test(phRule) && /overflow-x:\s*auto/.test(stageRule),
  !phRule ? '未找到 .phone 规则'
    : !/margin:\s*0\s+auto/.test(phRule) ? '.phone 缺 margin: 0 auto（手机贴左）'
    : /align-self:\s*flex-start/.test(phRule) ? '.phone 仍有 align-self: flex-start（覆盖容器居中）'
    : '.phone-stage 不是横向可滚动容器（安全回退失效）');
/* 垂直滚动条只占右侧时，内容盒中心比「肉眼看到的列中心」左移 4px（手机看着偏左），
 * 而且会随内容长短时有时无地左右跳。两侧对称预留即可重合 —— 实测 13/13 那条「手机相对
 * 肉眼看到的列也居中」在钉的就是它。 */
assert('装修台预览列两侧对称预留滚动条宽度（否则内容盒中心与视觉中心差 4px、还会随内容长短左右跳）',
  /scrollbar-gutter:\s*stable\s+both-edges/.test(stageRule),
  /scrollbar-gutter/.test(stageRule) ? 'scrollbar-gutter 已声明' : '.phone-stage 缺 scrollbar-gutter: stable both-edges');

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

/* ---- D. 兜底值三处一致（后端 schema / 小程序组件 / 预览渲染） ----
 *
 * 「兜底」是个明确口径：replica.js 里**还没有** TABBAR（一次都没发布过导航）时，
 * 三处必须给出同一份默认值，否则就会出现「装修台一个样、真机另一个样」。
 *
 * ⚠️ 量组件时必须把 replica.TABBAR 剥掉，不能直接透传 replica：
 * 组件的 readConfig() 优先用 replica.TABBAR（运营在装修台发布过的真实配置），
 * 直接透传量到的是「线上配了什么」而不是「兜底值是什么」——
 * 只要运营没改过导航就一直是绿的，运营一改文案就误报「三处不一致」。
 * 2026-10-10 实测踩到：运营把底部导航的「我的」改成「个人」并生成代码，这条断言立刻变红，
 * 而真机 / 装修台 / 预览三处表现完全正常 —— 是断言问错了问题（假红）。
 */
const NAV_PV = pvRequire(join(PUB, 'shared', 'pv-tabbar.js')).PvTabbar;
// 组件文件需要 Component / wx 全局，直接 require 跑不起来 —— 用 vm 跑一遍，取出它内部算好的初始渲染数据
const navVm = await import('node:vm');
const navMakeRequire = (await import('node:module')).createRequire;
const navCtbRequire = navMakeRequire(join(NAV_CTB, 'index.js'));
/** 在 vm 里跑一遍 custom-tab-bar；dropTabbar=true 时把 replica.TABBAR 剥掉，量到的就是兜底值 */
function navRunComponent(dropTabbar) {
  const def = {};
  const sandbox = {
    console,
    require: (id) => {
      const m = navCtbRequire(id);
      if (!dropTabbar) return m;
      if (/(^|\/)config\/replica(\.js)?$/.test(String(id))) {
        const clone = Object.assign({}, m);
        delete clone.TABBAR;
        return clone;
      }
      return m;
    },
    Component: (d) => { def.value = d; }
  };
  navVm.createContext(sandbox);
  navVm.runInContext(navCtbSrc, sandbox, { filename: 'custom-tab-bar/index.js' });
  return ((def.value || {}).data) || {};
}
const navCanon = (c) => JSON.stringify({
  color: c.color, selectedColor: c.selectedColor, background: c.background,
  borderColor: c.borderColor, iconMode: c.iconMode,
  items: (c.items || []).map((i) => [i.path, i.text, i.icon || '', i.activeIcon || ''])
});
const navTrio = {
  '后端 schema': NAV_SCHEMA.tabbarDefault(),
  '小程序组件': navRunComponent(true),
  '预览渲染': NAV_PV.normalize(null)
};
const navTrioVals = Object.keys(navTrio).map((k) => [k, navCanon(navTrio[k])]);
const navTrioUniq = Array.from(new Set(navTrioVals.map((x) => x[1])));
assert('底部导航兜底值三处一致（后端 schema / 小程序组件 / 预览渲染 pv-tabbar.js）',
  navTrioVals[1][1].indexOf('"items":[]') < 0 && navTrioUniq.length === 1,
  navTrioUniq.length === 1
    ? `${navTrioVals.length} 处一致（已剥掉 replica.TABBAR 的兜底口径）：${navTrioUniq[0].slice(0, 72)}…`
    : navTrioVals.map((x) => x[0] + '=' + x[1]).join(' ｜ '));

/*
 * ---- B. 反向三条：replica.js 里**有** TABBAR 时，组件必须用运营发布的那份 ----
 * （「运营改了导航文案，真机纹丝不动」是这类配置最典型的故障，所以必须反向锁一条。）
 *
 * ⚠️ 前两条一律喂**合成配置**，不要拿 replica.js 里运营当前的值去逐字符比：
 *   组件会做归一化（截 5 字 / 同页面去重 / 空文案回落页面名），而 replica 原文是
 *   「运营写什么就是什么」；直接和原文比，运营只要把文案写成 6 个字或带个前导空格，
 *   断言就会红，而真机完全正常。
 *   2026-10-10 实测踩到：同一条断言、同一份代码，第一遍跑红、第二遍跑绿 ——
 *   数据驱动的断言一旦不稳定，比不检查更糟（会把真问题淹没）。
 *   合成输入只测「有没有采用配置 / 归一化口径对不对」这两件事，与运营数据无关，永远稳定。
 */
function navRunWithTabbar(tabbar) {
  const def = {};
  const sandbox = {
    console,
    require: (id) => (/(^|\/)config\/replica(\.js)?$/.test(String(id))
      ? { TABBAR: tabbar }
      : navCtbRequire(id)),
    Component: (d) => { def.value = d; }
  };
  navVm.createContext(sandbox);
  navVm.runInContext(navCtbSrc, sandbox, { filename: 'custom-tab-bar/index.js' });
  return ((def.value || {}).data) || {};
}
const navPairsOf = (items) => (items || []).map((i) => i.path + '|' + i.text).join(',');
const navStyleOf = (c) => [c.color, c.selectedColor, c.background, c.borderColor, c.iconMode].join(',');

const navSynth = navRunWithTabbar({
  color: '#111111', selectedColor: '#222222', background: '#333333', borderColor: '#444444',
  iconMode: 'never',
  items: [
    { path: '/pages/news/news', text: '资讯栏' },
    { path: '/pages/index/index', text: '首页面' }
  ]
});
assert('有导航配置时组件原样采用（顺序 / 文案 / 四色 / 图标模式全听装修台的，不走兜底）',
  navSynth.iconMode === 'never' && navStyleOf(navSynth) === '#111111,#222222,#333333,#444444,never' &&
    navPairsOf(navSynth.items) === '/pages/news/news|资讯栏,/pages/index/index|首页面',
  `${navStyleOf(navSynth)} ｜ ${navPairsOf(navSynth.items)}`);

const navSynth2 = navRunWithTabbar({
  items: [
    { path: '/pages/news/news', text: '资讯' },
    { path: '/pages/news/news', text: '同一页面配两次' },
    { path: '/pages/mine/mine', text: '   我的个人中心页  ' },
    { path: '/pages/lexy/lexy', text: '' },
    { path: '/pages/product/product', text: '产品' },
    { path: '/pages/index/index', text: '第六项' },
    /* 最后两项只能被「项数收敛到 5」截掉 —— 去重后正好 5 个内置页，
       不补两项的话这条断言其实测不到上限（第一版就是这么写的，跑出 5 项才发现）。 */
    { path: '/pages/a/a', text: '第七项' },
    { path: '/pages/b/b', text: '第八项' }
  ]
});
assert('组件归一化与后端 / 预览同口径（同页面去重 · 先 trim 再截 5 字 · 空文案回落页面名 · 项数收敛到 5）',
  navPairsOf(navSynth2.items) ===
    '/pages/news/news|资讯,/pages/mine/mine|我的个人中,/pages/lexy/lexy|莱克,/pages/product/product|产品,/pages/index/index|第六项',
  navPairsOf(navSynth2.items));

/*
 * 第三条跑**运营当前那份真实配置**，但比的是「组件渲染结果 vs 预览渲染结果」，
 * 而不是「组件 vs replica 原文」—— 两侧都过各自的归一化再对账，才是「口径一致」这个真问题。
 * （和 replica 原文比会把归一化本身误判成不一致，见上面的教训。）
 * 只比 path / 文案 / 四色 / 图标模式，**不比图标 URL**：组件侧会过 utils/asset.js 的
 * resolveAssets 补 BASE_URL（真机要绝对地址），预览侧是浏览器同源相对路径 —— 有意不同，不是缺陷。
 * replica 里没有 TABBAR 时两侧各自回落默认值，这条同样成立（预览的 DEFAULT = 组件的 FALLBACK）。
 */
const navReplicaTabbar = navCtbRequire('../config/replica').TABBAR;
const navLive = navRunComponent(false);
const navPvLive = NAV_PV.normalize(navReplicaTabbar);
assert('运营当前那份导航，组件渲染与预览渲染同口径（装修台看到的就是真机上的）',
  navPairsOf(navLive.items) === navPairsOf(navPvLive.items) && navStyleOf(navLive) === navStyleOf(navPvLive),
  `组件=${navStyleOf(navLive)} ｜${navPairsOf(navLive.items)} ｜ 预览=${navStyleOf(navPvLive)} ｜${navPairsOf(navPvLive.items)}`);

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
assert('店铺导航的字段结构 = 图标样式 / 导航项 / 导航图标色组 / 导航背景色组（由 schema 自动推导，后台表单不硬编码）',
  navOpen.ok && navFields.length === 4 && navFields[0].k === 'iconMode' && navFields[1].k === 'items' &&
  navFields[2].type === 'group' && navFields[2].label === '导航图标色' &&
  navFields[3].type === 'group' && navFields[3].label === '导航背景色',
  navOpen.ok ? navFields.map((f) => f.k || ('group:' + f.label)).join(' / ') : navOpen.json.msg);
/*
 * 配色两组必须**默认展开**（`open: true`）。
 * 起因：原来是一个折叠的「配色」组，运营在导航面板里只看得到最上面几项，
 * 折叠标题也不提「图标」——「图标颜色怎么改」这件事在面板里根本没有入口。
 * 这条断言同时锁三件事：schema 声明了 open、admin.js 支持 open、两组确实都带了。
 */
const navOpenGroups = navFields.filter((f) => f.type === 'group');
const navAdminJs = readFileSync(join(PUB, 'admin', 'admin.js'), 'utf8');
/*
 * 同时锁**源码文件**与**服务返回值**：
 *   只锁服务返回值的话，把 `open: true` 从 schema.js 里删掉、不重启服务，断言照样绿
 *   —— 本轮实测踩到（改文件→跑自检→该红没红，原因是老进程还在用旧 schema）。
 *   只锁源码文本的话，又测不到「服务确实把 open 透出来了」（后端某处漏传就发现不了）。
 *   两头都锁才是完整的一句「配色两组默认展开」。
 */
const navSchemaSrc = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');
const navSchemaOpen = /type: 'group', label: '导航图标色', open: true/.test(navSchemaSrc) &&
  /type: 'group', label: '导航背景色', open: true/.test(navSchemaSrc);
assert('店铺导航的配色两组默认展开（schema 源码声明 open:true ＋ 服务透出 ＋ 装修台支持 open）',
  navSchemaOpen && navOpenGroups.length === 2 && navOpenGroups.every((g) => g.open === true) &&
  /'grp' \+ \(open \? ' open' : ''\)/.test(navAdminJs) && /open: !!f\.open/.test(navAdminJs),
  `schema 源码=${navSchemaOpen} ｜ 服务返回 ${navOpenGroups.map((g) => g.label + ':' + g.open).join(' ')} ｜ admin.js 支持=${/'grp' \+ \(open/.test(navAdminJs) && /open: !!f\.open/.test(navAdminJs)}`);

/*
 * ---- F. 导航图标染色（复刻有赞「导航图标色」）----
 *
 * 背景：内置 icon 是 PNG 位图（颜色画死在图里），有赞用的是图标字体（字形跟着 color 走）。
 * 我们等效地让**服务端**把位图染成目标色再发出去：
 *   GET /navicon/<图标名>@<rrggbb>.png
 *   （server/lib/png.js 解码 → server/lib/navicon.js 换 RGB / 原样留 alpha → 编码）
 *
 * 2026-10-13 改版：**不再用 CSS filter**。微信渲染层对 <image> 的 filter 支持不可靠 ——
 * 实测开发者工具里选中项图标渲染成一个 22×22 的实心色块（颜色对了、**alpha 被丢掉**），
 * 而浏览器（装修台预览）里同样的 filter 逐像素正确 →「预览好看、真机是色块」，
 * 属于最难查的一种走样。现在两端拿到的是**同一张 PNG**，物理上不可能再走样。
 *
 * 规则仍在**两处**各存一份（但都只剩「拼地址」，不再有数值求解）：
 *   miniprogram/utils/navcolor.js    —— 真机（custom-tab-bar 在 readConfig 里用）
 *   server/public/shared/pv-tabbar.js —— 装修台手机壳与 /preview
 * 喂同一批 (图标, 色值) 给两边、比输出路径 —— 唯一允许的差异是 navcolor 多一个
 * BASE_URL 前缀（真机要绝对地址）。比函数体文本更硬，也不会因为加注释就假红。
 */
const NAV_NC = pvRequire(join(MP_ROOT, 'utils', 'navcolor.js'));
const NAV_CONST = pvRequire(join(MP_ROOT, 'utils', 'constants.js'));
const navTintIcons = [
  '/images/tabbar/home.png', '/images/tabbar/home-active.png',
  '/images/tabbar/news.png', '/images/tabbar/news-active.png'
];
const navTintColors = [
  '#8A8A8A', '#C8102E', '#000000', '#FFFFFF', '#1A1A1A', '#2B6CB0', '#0F9D58',
  '#F5A623', '#7B3FE4', '#FF0080', '#00A0A0', '#666666', '#C0C0C0', '#334155',
  '#E11D48', '#5B8FF9', '#F6BD16', '#7262FD', '#78D3F8', '#9661BC'
];
const navTintPairs = [];
navTintIcons.forEach((s) => navTintColors.forEach((h) => navTintPairs.push([s, h])));
const navTintMismatch = navTintPairs.filter(([s, h]) => {
  const a = NAV_NC.iconPath(s, h);
  const b = NAV_PV.tintPath(s, h);
  return !(a === b || (b !== '' && a === NAV_CONST.BASE_URL + b));
});
assert('导航图标染色：两处口径等价（真机 utils/navcolor.js ↔ 预览 pv-tabbar.js，逐个比输出路径）',
  navTintMismatch.length === 0 &&
  NAV_NC.iconPath('/images/tabbar/home.png', '#2B6CB0') === '/navicon/home@2b6cb0.png',
  navTintMismatch.length === 0
    ? `${navTintPairs.length} 组（${navTintIcons.length} 图标 × ${navTintColors.length} 色值）全部一致`
    : `不一致：${navTintMismatch.map((p) => p.join(' ')).slice(0, 3).join(' ｜ ')}`);

const navTintIcon = [
  /* [图标地址, 颜色, 期望「要染色」, 说明] */
  ['/images/tabbar/home.png', '#8A8A8A', false, '内置未选中图标 + 默认未选中色 → 零变化'],
  ['/images/tabbar/home-active.png', '#C8102E', false, '内置选中图标 + 默认选中色 → 零变化'],
  ['/images/tabbar/home.png', '#2B6CB0', true, '内置未选中图标 + 改色 → 染色'],
  ['/images/tabbar/home-active.png', '#0F9D58', true, '内置选中图标 + 改色 → 染色'],
  ['/uploads/202610/a.png', '#2B6CB0', false, '本地上传 / 素材库图 → 不染（与有赞一致）'],
  ['https://x.com/a.png', '#2B6CB0', false, '外链图 → 不染'],
  ['/images/tabbar/home.png', 'not-a-color', false, '色值非法 → 不染（宁可不染，也不拼一个必然 404 的地址）']
];
const navTintIconBad = navTintIcon.filter(([src, hex, want]) => {
  const a = !!NAV_NC.iconPath(src, hex);
  const b = !!NAV_PV.tintPath(src, hex);
  return a !== want || b !== want;
});
assert('图标染色的适用边界：只染内置图标；默认色与非法色不染；自传 / 外链图保持原色',
  navTintIconBad.length === 0,
  navTintIconBad.length === 0
    ? navTintIcon.map((x) => (x[2] ? '染' : '不染')).join('/')
    : navTintIconBad.map((x) => x[3]).join('；'));
assert('染色地址形状对（小写归一 / 不带 # / .png 结尾 —— 便于长缓存与两端逐字符比对）',
  /^\/navicon\/home@[0-9a-f]{6}\.png$/.test(NAV_NC.iconPath('/images/tabbar/home.png', '#2B6CB0')) &&
  NAV_NC.iconPath('/images/tabbar/home.png', '#2b6cb0') ===
    NAV_NC.iconPath('/images/tabbar/home.png', '#2B6CB0'),
  NAV_NC.iconPath('/images/tabbar/home.png', '#2B6CB0'));

/*
 * 染色路由的**像素级**断言 —— 这套实现唯一的正确性依据，不依赖任何渲染引擎，
 * 直接看服务端吐出来的 PNG 字节。判据两条：
 *   ① RGB 全部等于目标色（包括抗锯齿像素）；
 *   ② alpha 与源图**逐字节相同** —— 这条最关键：当初 CSS filter 就是丢了 alpha，
 *      把描边图标变成一个实心色块，而「颜色对了」会让人误以为染色成功了。
 */
const NAV_PNG = pvRequire(join(__dirname, '..', 'lib', 'png.js'));
async function navFetchTint(name, hex) {
  const r = await fetch(BASE + '/navicon/' + name + '@' + hex + '.png');
  const buf = Buffer.from(await r.arrayBuffer());
  let img = null;
  try { img = NAV_PNG.decode(buf); } catch (e) { img = null; }
  return { status: r.status, type: r.headers.get('content-type'), img };
}
const navPixelOk = (res, rgb, srcImg) => {
  if (!res.img || !srcImg) return false;
  if (res.img.width !== srcImg.width || res.img.height !== srcImg.height) return false;
  const d = res.img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] !== rgb[0] || d[i + 1] !== rgb[1] || d[i + 2] !== rgb[2]) return false;
    if (d[i + 3] !== srcImg.data[i + 3]) return false;
  }
  return true;
};
{
  const srcHome = NAV_PNG.decode(readFileSync(join(MP_ROOT, 'images', 'tabbar', 'home.png')));
  const srcNewsOn = NAV_PNG.decode(readFileSync(join(MP_ROOT, 'images', 'tabbar', 'news-active.png')));
  const r1 = await navFetchTint('home', '2b6cb0');
  const r2 = await navFetchTint('news-active', '080808');
  const ok1 = navPixelOk(r1, [0x2b, 0x6c, 0xb0], srcHome);
  const ok2 = navPixelOk(r2, [0x08, 0x08, 0x08], srcNewsOn);
  assert('染色路由真的出图且**像素正确**：RGB 全等目标色、alpha 与源图逐字节相同（抗锯齿不能丢）',
    r1.status === 200 && r1.type === 'image/png' && ok1 && r2.status === 200 && ok2,
    `home@2b6cb0 → ${r1.status}/${r1.type}/像素=${ok1} ｜ news-active@080808 → ${r2.status}/像素=${ok2}`);
}

/* 安全边界：这条路由**不跟随 DEBUG_PAGE**（线上真机要用），必须自己把门 */
const navBadReqs = [
  ['/navicon/nope@c8102e.png', 404, '源图不存在'],
  ['/navicon/home@zzzzzz.png', 400, '色值非法'],
  ['/navicon/home.png@c8102e.png', 400, '名字带了 .png 后缀'],
  ['/navicon/HOME@c8102e.png', 400, '名字非小写（白名单口径）'],
  ['/navicon/..%2f..%2fserver%2findex.js@c8102e.png', 400, '编码过的目录穿越'],
  ['/navicon/../../server/index.js@c8102e.png', 404, '未编码穿越（被 URL 归一化后落到总路由）']
];
{
  const got = [];
  for (const [p, want, why] of navBadReqs) {
    let st = -1;
    try { st = (await fetch(BASE + p)).status; } catch (e) { st = -1; }
    got.push([p, want, st, why]);
  }
  assert('染色路由的安全边界：源图不存在 404、色值非法 / 带后缀 / 穿越一律 400 或 404',
    got.every(([, want, st]) => st === want),
    got.map(([, want, st, why]) => `${why}:${st}${st === want ? '' : '≠' + want}`).join(' ｜ '));
}

/* 真机组件：readConfig 必须把两态的**图标地址**一起算好（wxml 里不拼字符串） */
const navCtbWxml = readFileSync(join(NAV_CTB, 'index.wxml'), 'utf8');
const navCtbWxmlNoComment = navCtbWxml.replace(/<!--[\s\S]*?-->/g, '');
assert('真机 custom-tab-bar：图标地址由组件算好（srcOff / srcOn），wxml 只原样输出并带加载失败回落',
  /selected === index \? item\.srcOn : item\.srcOff/.test(navCtbWxmlNoComment) &&
  /binderror="onIconError"/.test(navCtbWxmlNoComment) &&
  /srcOff: srcOff,/.test(navCtbSrc) && /srcOn: srcOn,/.test(navCtbSrc) &&
  /onIconError\(e\) \{/.test(navCtbSrc),
  `wxml 用 srcOn/srcOff=${/selected === index \? item\.srcOn/.test(navCtbWxmlNoComment)}` +
  ` ｜ 有回落=${/binderror="onIconError"/.test(navCtbWxmlNoComment)}`);
const navCtbTint = navRunWithTabbar({
  color: '#2B6CB0', selectedColor: '#0F9D58', background: '#FFFFFF', borderColor: '#EEEEEE', iconMode: 'active',
  items: NAV_SCHEMA.TABBAR_DEFAULT_ITEMS
});
const navCtbT0 = (navCtbTint.items || [])[0] || {};
assert('真机组件按配色算出图标地址（两态各按自己的色；「仅选中显示图标」的未选中态保留 visibility 占位）',
  navCtbT0.srcOff === NAV_CONST.BASE_URL + '/navicon/home@2b6cb0.png' &&
  navCtbT0.srcOn === NAV_CONST.BASE_URL + '/navicon/home-active@0f9d58.png' &&
  navCtbT0.styleOff === 'visibility:hidden',
  `off=${navCtbT0.srcOff} ｜ on=${navCtbT0.srcOn} ｜ styleOff=${JSON.stringify(navCtbT0.styleOff)}`);
const navCtbDefault = navRunComponent(true);
assert('真机组件：默认配色下图标仍是**包内原图**（零网络请求、改造前后零变化）',
  (navCtbDefault.items || []).every((i) =>
    i.srcOff === i.rawOff && i.srcOn === i.rawOn &&
    String(i.srcOff || '').indexOf('/navicon/') === -1 &&
    String(i.srcOn || '').indexOf('/navicon/') === -1) &&
  (navCtbDefault.items || []).every((i) => !i.styleOff || i.styleOff === 'visibility:hidden'),
  (navCtbDefault.items || []).map((i) => i.srcOff).slice(0, 3).join(' | '));

/*
 * ---- G. 「页面布局」浮层底部那个入口按页面类型分流（2026-10-13）----
 *
 * 起因（运营实测）：「导航装修的时候点这个页面设置没反应，点击应该是导航的整体属性设置」。
 * 根因：导航页的 schema 是 TABBAR_NODE、**没有 meta 字段**（导航是全局配置，不是页面），
 *      而入口无条件 `locate('meta')` → 在导航页上必然落空，只弹一句红字
 *      「该页面没有页面级设置」、属性面板一动不动（取证前后 `#inspectorPath` 都是「页面设置」）。
 * 修法：导航下改成「回整体属性」（`select('__root__')`）＋一句普通提示；入口文案与属性面板的
 *      根视图标签都随页面类型切换。
 *
 * 行为级验收在 `.tooling/_nav-pagesetting-probe.mjs`（真浏览器 11 条，带「首页」对照组）。
 * 这里锁的是**静态骨架**：分流存在、判断在 `locate('meta')` **之前**（放后面就永远不执行）、
 * 文案真随页面类型切、静态兜底文案还在；并顺手锁住「导航没有 meta」这个**分流的前提** ——
 * 将来谁给 nav 加了 meta，这条会红，提醒他回来重新审视这个分流。
 */
const navPsIndexHtml = readFileSync(join(PUB, 'admin', 'index.html'), 'utf8');
/*
 * 「导航没有 meta」这条同时锁**源码**与**服务返回值**：
 * 只锁服务的话，改了 schema.js 不重启服务照样绿（同一节「配色两组默认展开」踩过这个坑，
 * 见 .workbuddy/memory/PITFALLS.md —— 「改后端必须重启」的断言侧镜像）。
 */
const navTabbarNodeSeg = (navSchemaSrc.match(/const TABBAR_NODE = \{[\s\S]*?\n\};/) || [''])[0];
/*
 * 「分流在 locate('meta') 之前」用**逐行**判定，而不是 `indexOf` 比字符位置：
 * 上面那段注释里就写着 `locate('meta')` 这个字面量，indexOf 会把它当成代码、
 * 把顺序判反（「源码文本断言必须先剥注释」，PITFALLS 有记；这里用「整行就是那条语句」
 * 来天然避开注释行 —— 注释行以 * / // / 中文开头，匹配不上 `^\s*var loc = ...`）。
 */
const navAdminLines = navAdminJs.split(/\r?\n/);
const navPsLineDivert = navAdminLines.findIndex((L) => /^\s*if \(isNav\) \{\s*$/.test(L));
const navPsLineMeta = navAdminLines.findIndex((L) => /^\s*var loc = locate\('meta'\);\s*$/.test(L));
const navPsDivert = navPsLineDivert >= 0 && /select\('__root__'\)/.test(navAdminLines[navPsLineDivert + 1] || '');
const navPsDivertBeforeMeta = navPsLineDivert >= 0 && navPsLineMeta > navPsLineDivert;
assert('店铺导航：schema 里没有「页面设置」（meta）—— 这正是入口必须分流的前提（同时锁源码与服务返回值）',
  navTabbarNodeSeg.length > 0 && !/k: 'meta'/.test(navTabbarNodeSeg) && navFields.every((f) => f.k !== 'meta'),
  `源码 TABBAR_NODE 段 ${navTabbarNodeSeg.length} 字符 ｜ 服务返回 ${navFields.map((f) => f.k || ('group:' + f.label)).join(' / ')}`);
assert('「页面设置」入口在导航页上分流到「导航整体属性」，且判断在 locate(\'meta\') 之前（放后面就永远不执行）',
  navPsDivert && navPsDivertBeforeMeta,
  `分流存在=${navPsDivert} ｜ 在 locate('meta') 之前=${navPsDivertBeforeMeta}`);
assert('入口文案与属性面板根视图标签都随页面类型切换（导航 → 「导航整体属性」；其它页仍是「页面设置」）',
  /btnPageSetting'\)\.innerHTML[\s\S]{0,80}?isNav \? '导航整体属性' : '页面设置'/.test(navAdminJs) &&
  /S\.sel === '__root__'[\s\S]{0,140}?S\.cur\.meta\.nav[\s\S]{0,60}?'导航整体属性' : '页面设置'/.test(navAdminJs),
  'btnPageSetting 文案随 isNav 切 ＋ inspectorPath 根视图标签随 isNav 切');
assert('「页面设置」的静态兜底文案仍在（JS 没跑起来 / 其它页面看到的仍是「页面设置」）',
  /<div class="layout-foot" id="btnPageSetting">[\s\S]{0,120}?页面设置\s*<\/div>/.test(navPsIndexHtml),
  'index.html 的 #btnPageSetting 静态文案 = 页面设置');

const navPathField = (() => {
  const items = navFields.filter((f) => f.k === 'items')[0];
  return items && items.item && (items.item.fields || []).filter((f) => f.k === 'path')[0];
})();
assert('导航项的「跳转页面」用专用控件 tabbarPage（不是普通 select），静态候选恰为 app.json 的 5 个内置页',
  !!navPathField && navPathField.type === 'tabbarPage' && (navPathField.options || []).length === NAV_APP_PATHS.length,
  `items.item.fields.path → ${navPathField && navPathField.type}（${(navPathField && navPathField.options || []).length} 个内置候选；自定义页由装修台从 link-options 实时并入）`);

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

  /*
   * 反面用例必须挑一个**永远不可能**当导航目标的路径：
   *   /pages/cart/cart   —— 既不在 tabBar.list 里，也不是自定义页容器（switchTab 打不开、也没地方自渲染导航）
   * ⚠️ 不能再用 `/pages/custom/index`（无 key）当反例的原型来写「必须是 5 个 tabBar 页」——
   *    自定义页现在**合法**了，那句话已经不是现行口径（第 41 批改的就是它）。
   */
  const navBadPath = await navDraft(Object.assign({}, navBase, { items: [
    { path: '/pages/index/index', text: '首页' }, { path: '/pages/cart/cart', text: '购物车' }
  ] }), '跳转页面不能作为底部导航目标', 1001);
  assert('导航项挑了「既不是内置 tab 页、也不是自定义页」的路径时被拦（否则真机上点了没反应，而开发者工具不报错）',
    navBadPath.json.code !== 0 && /不能作为底部导航目标/.test(navBadPath.json.msg || ''), navBadPath.json.msg);

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
  /id="navCard"/.test(navAdminHtml) && /href="\/admin\?edit=nav"/.test(adminSrc),
  'admin.css / preview.css 已无 .tabbar 规则；列表页 navCard + 新窗口入口 /admin?edit=nav');

/* ---- G. 自定义页也能当底部导航目标（对标有赞「微页面被选为导航跳转页时也会展示底部导航」，第 41 批） ----
 *
 * 为什么需要它：微信的 tabBar 页面**必须静态声明在 app.json**（编译期固定），
 * 而且 `wx.switchTab` **不能带参数**；自定义页共用 pages/custom/index（靠 `?key=` 区分），
 * 两条路都走不通。有赞的解法就是「指定微页面被选为底部导航跳转页时，也会展示底部导航」——
 * 本项目等价的做法：目标是自定义页时小程序端改走 `navigateTo`，由目标页自己再渲染一份底部导航。
 *
 * 这一组锁四件事（都是「错了会静默失效」的类型）：
 *   ① 自定义页地址字面**四处同源**（后端 schema / 小程序组件 / 预览渲染 / 自定义页 pagePath）；
 *   ② 判定只有**一份实现**，且 store.js 复用 schema.isTabbarPath（候选集合就地再写一遍 = 第 41 批的真实故障）；
 *   ③ 点下去**真的走对分支**（源码文本断言锁不住这种东西，必须把组件跑起来点一下）；
 *   ④ 「空文案 → 页面名」三处消费方对同一份输入给出**同一个名字**（自定义页也要认得）。
 */
const NAV_REPLICA = requireFromHere(REPLICA_FILE);
const NAV_CP = NAV_SCHEMA.CUSTOM_PAGE_PREFIX;
const NAV_CUSTOM_PAGE_SRC = readFileSync(join(MP_ROOT, 'pages', 'custom', 'index.js'), 'utf8');
const NAV_PV_SRC = readFileSync(join(PUB, 'shared', 'pv-tabbar.js'), 'utf8');
const NAV_CTB_PREFIX = /CUSTOM_PAGE_PREFIX = '([^']+)'/.exec(navCtbSrc);
const NAV_PV_PREFIX = /CUSTOM_PAGE_PREFIX = '([^']+)'/.exec(NAV_PV_SRC);
const NAV_PAGEPATH = /function pagePath\(key\)[\s\S]*?return '([^']+)' \+ key;/.exec(NAV_CUSTOM_PAGE_SRC);

assert('自定义页地址字面四处同源（后端 schema / 小程序组件 / 预览渲染 / 自定义页 pagePath）',
  NAV_CP === '/pages/custom/index?key=' &&
  !!NAV_CTB_PREFIX && NAV_CTB_PREFIX[1] === NAV_CP &&
  !!NAV_PV_PREFIX && NAV_PV_PREFIX[1] === NAV_CP &&
  !!NAV_PAGEPATH && NAV_PAGEPATH[1] === NAV_CP,
  [NAV_CP, NAV_CTB_PREFIX && NAV_CTB_PREFIX[1], NAV_PV_PREFIX && NAV_PV_PREFIX[1], NAV_PAGEPATH && NAV_PAGEPATH[1]].join(' ｜ '));

assert('底部导航目标判定：内置 tab 页 ∪ 装修台自定义页；分类 / 购物车 / 商品详情 / 无 key 的容器路径一律不行',
  [
    ['/pages/index/index', true], ['/pages/product/product', true], [NAV_CP + 'pX', true],
    ['/pages/cart/cart', false], ['/pages/custom/index', false], [NAV_CP, false],
    ['/pages/goods/detail?id=g1', false], ['', false], [null, false]
  ].every((p) => NAV_SCHEMA.isTabbarPath(p[0]) === p[1]),
  '内置 5 页与 /pages/custom/index?key=xxx 放行，其余拒绝（含缺 key 的容器路径本身）');

assert('自定义页 key 抽取：只有带 key 的容器地址才算自定义页（/pages/custom/index 本身不算）',
  NAV_SCHEMA.customKeyOf(NAV_CP + 'p236') === 'p236' && NAV_SCHEMA.customKeyOf('/pages/custom/index') === '' &&
  NAV_SCHEMA.customKeyOf('/pages/index/index') === '' && NAV_SCHEMA.customKeyOf(null) === '',
  `customKeyOf('${NAV_CP}p236')='p236' ｜ customKeyOf('/pages/custom/index')=''`);

const NAV_SAMPLE_KEY = Object.keys(NAV_REPLICA.CUSTOM_PAGES || {})[0] || '';
const NAV_SAMPLE_NAME = NAV_SAMPLE_KEY ? (NAV_REPLICA.CUSTOM_PAGES[NAV_SAMPLE_KEY].name || '') : '';
assert('导航项显示名：自定义页译成页面名；页面已被删时如实说「已不存在」（不静默显示成别的页面）',
  NAV_SCHEMA.tabbarPageName('/pages/index/index') === '首页' &&
  (!NAV_SAMPLE_KEY || (!!NAV_SAMPLE_NAME && NAV_SCHEMA.tabbarPageName(NAV_CP + NAV_SAMPLE_KEY) === NAV_SAMPLE_NAME)) &&
  /已不存在/.test(NAV_SCHEMA.tabbarPageName(NAV_CP + '__no_such_page__')),
  (NAV_SAMPLE_KEY ? `${NAV_CP}${NAV_SAMPLE_KEY} → ${NAV_SAMPLE_NAME}` : '（当前无自定义页，只校验删除后的兜底）') +
  ' ｜ 已删除的页面 → ' + NAV_SCHEMA.tabbarPageName(NAV_CP + '__no_such_page__'));

const NAV_MIX_KEY = NAV_CP + (NAV_SAMPLE_KEY || 'pX');
const NAV_NORM_MIX = NAV_SCHEMA.normalizeTabbar({ items: [
  { path: NAV_MIX_KEY, text: '全系' }, { path: '/pages/cart/cart', text: '购物车' }, { path: '/pages/news/news', text: '资讯' }
] });
assert('归一化输出必定落在「可作为导航目标」的集合内（非法路径回落内置页，绝不原样写进 replica.js），且幂等',
  NAV_NORM_MIX.items.every((i) => NAV_SCHEMA.isTabbarPath(i.path)) &&
  !NAV_NORM_MIX.items.some((i) => i.path === '/pages/cart/cart') &&
  NAV_NORM_MIX.items.filter((i) => i.path === NAV_MIX_KEY).length === 1 &&
  JSON.stringify(NAV_SCHEMA.normalizeTabbar(NAV_NORM_MIX)) === JSON.stringify(NAV_NORM_MIX),
  NAV_NORM_MIX.items.map((i) => i.text + '@' + i.path).join(' / '));

const NAV_STORE_SRC = readFileSync(join(__dirname, '..', 'decorate', 'store.js'), 'utf8');
const NAV_SCHEMA_SRC = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');
assert('导航目标校验只有一处口径：schema 归一化与 store.js 的保存校验都走 isTabbarPath，不许就地再写一份候选集合',
  /isTabbarPath\(o\.path\)/.test(NAV_SCHEMA_SRC) &&
  /schema\.isTabbarPath\(/.test(NAV_STORE_SRC) &&
  !/schema\.TABBAR_PAGES/.test(NAV_STORE_SRC),
  'schema.tabbarItem 与 store.js 的 nav 校验都调 isTabbarPath（第 41 批的 502 故障就是 store.js 自己硬写了一份候选集合）');

/* 行为级：把组件真跑起来点一下，看它走哪条跳转分支 —— 只读源码文本是会骗人的 */
function navRunOnTap(items, selected, route) {
  const def = {};
  const calls = [];
  const sandbox = {
    console,
    require: navCtbRequire,
    Component: (d) => { def.value = d; },
    wx: {
      switchTab: (o) => calls.push('switchTab ' + o.url),
      navigateTo: (o) => calls.push('navigateTo ' + o.url),
      redirectTo: (o) => calls.push('redirectTo ' + o.url),
      showToast: () => calls.push('toast')
    },
    getCurrentPages: () => (route ? [{ route }] : [])
  };
  navVm.createContext(sandbox);
  navVm.runInContext(navCtbSrc, sandbox, { filename: 'custom-tab-bar/index.js' });
  const inst = Object.create(def.value);
  inst.data = { items, selected };
  def.value.methods.onTap.call(inst, { currentTarget: { dataset: { index: 1 } } });
  return calls.join(' ｜ ');
}
const NAV_TAP_BUILTIN = [
  { path: '/pages/index/index', text: '首页' }, { path: '/pages/product/product', text: '产品' }
];
const NAV_TAP_CUSTOM = [
  { path: '/pages/index/index', text: '首页' }, { path: NAV_CP + 'pX', text: '全系' }
];
const navTapBuiltin = navRunOnTap(NAV_TAP_BUILTIN, 0, 'pages/index/index');
const navTapCustom = navRunOnTap(NAV_TAP_CUSTOM, 0, 'pages/index/index');
const navTapCustomAgain = navRunOnTap(NAV_TAP_CUSTOM, 0, 'pages/custom/index');
assert('点导航项：内置页走 switchTab；自定义页走 navigateTo（switchTab 打不开带参数的地址）',
  navTapBuiltin === 'switchTab /pages/product/product' && navTapCustom === 'navigateTo ' + NAV_CP + 'pX',
  `内置页 → ${navTapBuiltin} ｜ 自定义页 → ${navTapCustom}`);
assert('已经在自定义页容器里再点另一个自定义页时改用 redirectTo（否则页面栈越堆越深，微信上限 10 层）',
  navTapCustomAgain === 'redirectTo ' + NAV_CP + 'pX', `当前页 pages/custom/index → ${navTapCustomAgain}`);

const NAV_CUSTOM_WXML = readFileSync(join(MP_ROOT, 'pages', 'custom', 'index.wxml'), 'utf8');
const NAV_CUSTOM_JSON = JSON.parse(readFileSync(join(MP_ROOT, 'pages', 'custom', 'index.json'), 'utf8'));
assert('被选为导航目标的那个自定义页自己再渲染一份底部导航（挂的是同一份组件，不是抄一遍）',
  /<tab-bar[^>]*\/>/.test(NAV_CUSTOM_WXML) && /wx:if="\{\{showTabbar\}\}"/.test(NAV_CUSTOM_WXML) &&
  (NAV_CUSTOM_JSON.usingComponents || {})['tab-bar'] === '/custom-tab-bar/index' &&
  /tabbarShowsFor/.test(NAV_CUSTOM_PAGE_SRC) && /items\[i\]\.path === want/.test(NAV_CUSTOM_PAGE_SRC) &&
  /pagePath\(key\)/.test(NAV_CUSTOM_PAGE_SRC),
  'showTabbar → <tab-bar>（json 指 /custom-tab-bar/index）；命中判定按带 ?key= 的**完整路径**');
assert('没被导航引用的自定义页底部保持干净（默认不显示，只有被选为导航目标的那一页才挂）',
  /showTabbar:\s*false/.test(NAV_CUSTOM_PAGE_SRC) && /showTabbar:\s*tabbarShowsFor\(asked\)/.test(NAV_CUSTOM_PAGE_SRC),
  'data 默认 false，onLoad 里由 tabbarShowsFor(asked) 决定');

assert('装修台「跳转页面」下拉：先填内置 5 页（立即可用），link-options 回来后并入「自定义页」分组（与跳转链接选择器同源）',
  /fillTabbarPages\(input, f\.options, null, /.test(adminSrc) &&
  /fillTabbarPages\(sel, fallback, opts, cur\)/.test(adminSrc) &&
  /group\('自定义页'\)/.test(adminSrc) && /loadLinkOptions\(\)/.test(adminSrc) &&
  /PvTabbar\.setCustomPages\(LINK_OPTS\.pages\)/.test(adminSrc),
  'admin.js：tabbarPage 控件 = 静态兜底 + link-options 补分组；并把自定义页名表注入预览渲染');

/* 预览渲染端（pvtb）也要认得自定义页 —— 值级，不看文本 */
NAV_PV.setCustomPages(NAV_SAMPLE_KEY
  ? [{ path: NAV_CP + NAV_SAMPLE_KEY, name: NAV_SAMPLE_NAME }]
  : []);
const navPvNorm = NAV_PV.normalize({ items: [{ path: NAV_MIX_KEY, text: '全系' }, { path: '/pages/cart/cart', text: '购物车' }] });
assert('预览渲染认得自定义页：isPage 放行、normalize 不把自定义页回落成首页（装修台预览与真机才不会长得不一样）',
  NAV_PV.isPage(NAV_CP + 'pX') === true && NAV_PV.isPage(NAV_CP) === false &&
  NAV_PV.isPage('/pages/cart/cart') === false && NAV_PV.isPage('/pages/index/index') === true &&
  navPvNorm.items.length === 2 && navPvNorm.items[0].path === NAV_MIX_KEY,
  navPvNorm.items.map((i) => i.text + '@' + i.path).join(' / '));

/* 空文案回落页面名：三处消费方必须给出同一个名字 —— 自定义页那一条曾经只有后端/预览认得 */
const NAV_BLANK_CFG = { items: [{ path: NAV_MIX_KEY, text: '' }, { path: '/pages/index/index', text: '' }] };
function navRunConfig(cfg) {
  const def = {};
  const sandbox = {
    console,
    require: (id) => {
      const m = navCtbRequire(id);
      if (/(^|\/)config\/replica(\.js)?$/.test(String(id))) {
        return Object.assign({}, m, { TABBAR: cfg, CUSTOM_PAGES: NAV_REPLICA.CUSTOM_PAGES || {} });
      }
      return m;
    },
    Component: (d) => { def.value = d; }
  };
  navVm.createContext(sandbox);
  navVm.runInContext(navCtbSrc, sandbox, { filename: 'custom-tab-bar/index.js' });
  return (def.value && def.value.data) || {};
}
NAV_PV.setCustomPages(NAV_SAMPLE_KEY
  ? [{ path: NAV_CP + NAV_SAMPLE_KEY, name: NAV_SAMPLE_NAME }]
  : []);
const navBlankTexts = {
  '后端 schema': NAV_SCHEMA.normalizeTabbar(NAV_BLANK_CFG).items.map((i) => i.text),
  '小程序组件': (navRunConfig(NAV_BLANK_CFG).items || []).map((i) => i.text),
  '预览渲染': NAV_PV.normalize(NAV_BLANK_CFG).items.map((i) => i.text)
};
const navBlankVals = Object.keys(navBlankTexts).map((k) => [k, JSON.stringify(navBlankTexts[k])]);
assert('空文案回落页面名：后端 / 小程序组件 / 预览渲染对同一份输入给出同一个名字（自定义页也要认得）',
  navBlankVals[0][1] === navBlankVals[1][1] && navBlankVals[1][1] === navBlankVals[2][1] &&
  navBlankTexts['小程序组件'][0] !== '',
  navBlankVals.map((x) => x[0] + '=' + x[1]).join(' ｜ '));

/* ---- H. 内置导航图标：包内资源 + /images/ 只读路由（第 43 批复刻有赞「店铺导航」图标） ----
 *
 * 为什么图标必须放**代码包内**（miniprogram/images/tabbar/）而不是素材库：
 *   ① 微信原生 tabBar 的 iconPath 只认包内路径，网络地址不认 —— 底部导航图标天然属于包内资源；
 *   ② 底部导航是每个页面都要立刻显示的界面骨架，不能依赖「素材已同步到线上」
 *      （第 42 批的整页图片加载失败就是素材没推线上造成的）；
 *   ③ 后端没起、离线打开时导航仍完整。
 *   素材复刻自有赞「店铺导航」配置页的图标字体 yz-tabbar-icon-v2（未选中 / 选中是同一字形、
 *   两种颜色），逐字形导出成 PNG，脚本 .tooling/make-tabbar-icons.py。
 *
 * 浏览器那两处（装修台手机壳 / /preview）取的是**同一张图**：后端加了 /images/ 只读路由，
 * 与应用内的路径**同一约定** —— 所以装修台预览与真机不会各拿一份。
 *
 * 这一组锁三件事：
 *   A. 10 张图标真的在包里，且是**真 PNG**（按魔数，不看扩展名）、3 倍图尺寸正确；
 *   B. 三处默认值（schema / 组件 / pv-tabbar）里的图标路径都指向这些真文件，且两态成对；
 *   C. /images/ 只读路由的行为与安全边界（200 + no-store / 非位图 403 / 穿越拦截 /
 *      与装修后台同受 DEBUG_PAGE）。
 */
const NAV_ICON_DIR = join(MP_ROOT, 'images', 'tabbar');
const NAV_ICON_NAMES = ['home', 'lexy', 'news', 'product', 'mine'];
const NAV_ICON_FILES = [];
NAV_ICON_NAMES.forEach((n) => { NAV_ICON_FILES.push(n + '.png'); NAV_ICON_FILES.push(n + '-active.png'); });
const NAV_ICON_MISSING = NAV_ICON_FILES.filter((f) => !existsSync(join(NAV_ICON_DIR, f)));
assert('内置导航图标 10 张全部在代码包里（微信 iconPath 只认包内路径；少了真机底部图标直接空白）',
  NAV_ICON_MISSING.length === 0,
  NAV_ICON_MISSING.length ? '缺失：' + NAV_ICON_MISSING.join(', ') : NAV_ICON_FILES.join(' '));

/** 读 PNG 头部：魔数 + IHDR 宽高/位深/颜色类型（不信任扩展名） */
function navPngInfo(buf) {
  const isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (!isPng) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), depth: buf[24], color: buf[25] };
}
const NAV_ICON_BAD = [];
const navIconBufs = {};
NAV_ICON_FILES.forEach((f) => {
  const p = join(NAV_ICON_DIR, f);
  if (!existsSync(p)) { NAV_ICON_BAD.push(f + ': 文件不存在'); return; }
  const buf = readFileSync(p);
  navIconBufs[f] = buf;
  const info = navPngInfo(buf);
  if (!info) { NAV_ICON_BAD.push(f + ': 不是 PNG'); return; }
  /* 3 倍图：真机显示 22px（与 custom-tab-bar/index.wxss 的图标区同口径）→ 66×66。
     尺寸写错不会报错，只会让图标在大屏上发虚或被拉伸。 */
  if (info.w !== 66 || info.h !== 66) NAV_ICON_BAD.push(`${f}: ${info.w}×${info.h}（应为 66×66 = 22px 的 3 倍图）`);
  if (info.depth !== 8 || info.color !== 6) NAV_ICON_BAD.push(`${f}: bitDepth=${info.depth} colorType=${info.color}（应为 8 / 6 = 8bit RGBA，图标要带透明通道）`);
});
assert('10 张图标都是 8bit RGBA 的 66×66 PNG（3 倍图 · 带透明通道 —— 错了不报错，只是真机上发虚或被拉伸）',
  NAV_ICON_BAD.length === 0,
  NAV_ICON_BAD.length ? NAV_ICON_BAD.join(' | ') : '66×66 · bitDepth=8 · colorType=6');

/* 值级：三处默认值里的图标必须落在 /images/tabbar/ 下且**两态文件都存在**
   ⚠️ 键必须逐字照抄 navTrio 的键（'后端 schema' / '小程序组件' / '预览渲染'）——
      写错键会拿到 undefined 并在 `.items` 上抛异常，把整轮自检直接打断。 */
const NAV_TRIO_ICON_BAD = [];
Object.keys(navTrio).forEach((k) => {
  const items = (navTrio[k] || {}).items || [];
  if (!items.length) NAV_TRIO_ICON_BAD.push(`${k}: 默认项为空`);
  items.forEach((it) => {
    [['icon', it.icon], ['activeIcon', it.activeIcon]].forEach((pair) => {
      const u = pair[1];
      if (typeof u !== 'string' || u.indexOf(NAV_SCHEMA.TABBAR_ICON_DIR) !== 0 || !existsSync(join(MP_ROOT, u.slice(1)))) {
        NAV_TRIO_ICON_BAD.push(`${k}.${pair[0]}=${JSON.stringify(u)}`);
      }
    });
    if (it.activeIcon !== it.icon.replace(/\.png$/, '-active.png')) {
      NAV_TRIO_ICON_BAD.push(`${k} 两态不成对：${it.icon} → ${it.activeIcon}`);
    }
  });
});
assert('三处默认值的图标路径都指向包内真实文件，且每项两态成对（缺哪一处，真机与装修台预览就会长得不一样）',
  NAV_TRIO_ICON_BAD.length === 0,
  NAV_TRIO_ICON_BAD.length ? NAV_TRIO_ICON_BAD.join(' | ')
    : `${Object.keys(navTrio).length} 处 × 5 项 × 2 态路径全部命中真文件`);

const NAV_ICON_MAP = NAV_SCHEMA.TABBAR_ICON_FILES || {};
const NAV_ICON_MAP_VALS = Object.keys(NAV_ICON_MAP).map((k) => NAV_ICON_MAP[k]);
assert('图标名映射表与内置页面表一一对应、无重名（多 / 少 / 两项同图都会让默认值静默缺图标）',
  NAV_ICON_MAP_VALS.length === NAV_SCHEMA_PATHS.length &&
  new Set(NAV_ICON_MAP_VALS).size === NAV_ICON_MAP_VALS.length &&
  NAV_SCHEMA_PATHS.every((p) => NAV_ICON_MAP[p] && NAV_ICON_NAMES.indexOf(NAV_ICON_MAP[p]) >= 0),
  Object.keys(NAV_ICON_MAP).map((k) => k + '=' + NAV_ICON_MAP[k]).join(' '));

/* 装修台的「内置图标」快捷按钮：取值必须是上面那 10 张，否则一点按钮就换成线上还没同步的图 */
const NAV_PRESET_VALS = (NAV_SCHEMA.TABBAR_PRESET_OFF || []).concat(NAV_SCHEMA.TABBAR_PRESET_ON || []);
assert('装修台「内置图标」快捷按钮的取值全部指向包内真文件，且就是默认项自身（不会各写一份后走样）',
  NAV_PRESET_VALS.length === NAV_ICON_FILES.length &&
  NAV_PRESET_VALS.every((p) => existsSync(join(MP_ROOT, String(p.value).slice(1)))) &&
  (NAV_SCHEMA.TABBAR_PRESET_OFF || []).every((p, i) => p.value === NAV_SCHEMA.tabbarDefault().items[i].icon) &&
  (NAV_SCHEMA.TABBAR_PRESET_ON || []).every((p, i) => p.value === NAV_SCHEMA.tabbarDefault().items[i].activeIcon),
  NAV_PRESET_VALS.map((p) => p.label + '=' + p.value).join(' '));

/* 静态源断言（与 /mp-src 那条同一口径）：/images/ 必须与装修后台同进同退 */
const NAV_IMG_GUARD_IDX = idxSrcForMp.indexOf('function tryMpImg(');
assert('/images/ 只读路由与装修后台同受 DEBUG_PAGE 约束（关掉管理页时包内图标也不该裸奔）',
  NAV_IMG_GUARD_IDX > -1 && /DEBUG_PAGE/.test(idxSrcForMp.slice(NAV_IMG_GUARD_IDX, NAV_IMG_GUARD_IDX + 500)),
  NAV_IMG_GUARD_IDX > -1 ? 'tryMpImg 内已判定 DEBUG_PAGE，关闭时返回 403' : '未找到 tryMpImg');

let navImgGet = null;
try {
  const r = await fetch(BASE + NAV_SCHEMA.TABBAR_ICON_DIR + 'home.png');
  const buf = Buffer.from(await r.arrayBuffer());
  navImgGet = {
    status: r.status, type: r.headers.get('content-type'), cc: r.headers.get('cache-control'),
    same: buf.length > 0 && buf.equals(navIconBufs['home.png'] || Buffer.alloc(0))
  };
} catch (e) { navImgGet = { error: e.message }; }
assert('/images/ 只读路由能取到包内图标，且与包内文件**字节一致**（装修台预览 / /preview / 真机拿到的是同一张图）',
  !!navImgGet && navImgGet.status === 200 && navImgGet.type === 'image/png' && navImgGet.same === true,
  JSON.stringify(navImgGet));
assert('/images/ 图标响应带 no-store（换图后装修台与预览页立刻看到新的，不吃浏览器缓存）',
  !!navImgGet && navImgGet.cc === 'no-store', navImgGet && navImgGet.cc);

const navImgProbe = [];
for (const [p, why] of [
  ['/images/tabbar/__no_such__.png', '不存在的图'],
  ['/images/tabbar/index.wxml', '非位图扩展名'],
  ['/images/tabbar/home.js', '脚本文件'],
  ['/images/../app.js', '路径穿越'],
  ['/images/', '目录本身']
]) {
  let st = 0;
  try { st = (await fetch(BASE + p)).status; } catch (e) { st = -1; }
  navImgProbe.push({ p, why, st, ok: st === 403 || st === 404 || st === 400 });
}
assert('/images/ 路径安全边界：不存在的图 / 非位图 / 脚本 / 穿越 / 目录本身，一律拿不到内容',
  navImgProbe.every((x) => x.ok),
  navImgProbe.map((x) => `${x.p}(${x.why})=${x.st}`).join(' '));

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
 * 17.5 后台左侧导航三栏 + 成员管理（2026-10-15）
 *
 * 本批把三样东西放进 `/console` 的左侧导航：**店铺笔记**（从装修台列表工具栏里搬出来）、
 * **成员管理**（新增：后台账号，谁能登录、各是什么角色）、**登录**（新增独立登录页，
 * 未登录时整个后台强制落在这里）。
 *
 * 为什么「接口全绿」还不够，必须再对一遍源码结构：
 *   控制台的左侧导航是**三处同步**的结构 —— `NAV` 表（栏目文案）/ `ICONS` 表（图标）/
 *   `App.views` 注册表（视图实现）。改一处漏两处，得到的都是半截状态：
 *     · 只加 NAV 不加 App.views → 「点得进去、页面空白」（还带一个难看的运行时报错）；
 *     · 只加 App.views 不加 NAV → 「页面已经做好了，但没人找得到入口」；
 *     · 只加 NAV 不加 ICONS   → 图标位置空一块。**这一条不报错**，最容易被放过。
 *   三条都不会让任何接口断言变红，只有结构对账才抓得住。
 *   浏览器侧的真渲染 / 真跳转实测在 `.tooling/check-shopnotes-ui.mjs`（CDP 驱动的 58 条验收）。
 *
 * ⚠️ 断言前**先剥注释**：本批在源码里留了大量说明注释，其中正写着「btnCreateNote」
 *    「店铺笔记」这些词。不剥就是恒红（本项目踩过这个坑，见 PITFALLS 假红族）。
 * ------------------------------------------------------------------------- */
const CONSOLE_DIR = join(__dirname, '..', 'public', 'console');
const coreSrc = readFileSync(join(CONSOLE_DIR, 'console.core.js'), 'utf8');
const modSrc = readFileSync(join(CONSOLE_DIR, 'console.modules.js'), 'utf8');
/** 剥掉块注释 + 整行行注释（只用于「某标识符是否还存在」这类断言） */
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const consoleSrcNoC = stripJsComments(coreSrc + '\n' + modSrc);

/** NAV 表：把 `const NAV = [...]` 那段里的 { key, text, ico } 全抓出来 */
const navBlock = (/const NAV = \[([\s\S]*?)\n\];/.exec(coreSrc) || ['', ''])[1];
const navItems = [...navBlock.matchAll(
  /\{\s*key:\s*'([A-Za-z0-9_]+)'\s*,\s*text:\s*'([^']+)'\s*,\s*ico:\s*'([A-Za-z0-9_]+)'\s*\}/g
)].map((m) => ({ key: m[1], text: m[2], ico: m[3] }));
const navKeys = navItems.map((n) => n.key);

/** ICONS 表：只取「行首两空格 + 名字 + 冒号」那种键（值是跨行拼接的字符串，不能整段当键读） */
const iconsBlock = (/const ICONS = \{([\s\S]*?)\n\};/.exec(coreSrc) || ['', ''])[1];
const iconKeys = [...iconsBlock.matchAll(/^ {2}([A-Za-z0-9_]+):\s*'/gm)].map((m) => m[1]);

/** App.views 注册表：core 与 modules 两个文件加起来（视图可以注册在任一处） */
const consoleViewKeys = [...new Set(
  [...consoleSrcNoC.matchAll(/App\.views\.([A-Za-z0-9_]+)\s*=\s*\{/g)].map((m) => m[1])
)];

const navMissing = ['shopnotes', 'members', 'login'].filter((k) => navKeys.indexOf(k) < 0);
assert('后台左侧导航：店铺笔记 / 成员管理 / 登录三栏都在 NAV 表里（改坏：从 NAV 删掉任一栏）',
  navMissing.length === 0 && navItems.length > 0,
  navMissing.length ? '缺栏目：' + navMissing.join('、')
    : `${navItems.length} 栏：${navItems.map((n) => n.text).join(' / ')}`);

const icoMissing = navItems.filter((n) => iconKeys.indexOf(n.ico) < 0).map((n) => `${n.key}→${n.ico}`);
assert('后台左侧导航：每一栏的图标都在 ICONS 表里（漏一处该栏图标位空一块，而且不报错）',
  icoMissing.length === 0,
  icoMissing.length ? '缺图标：' + icoMissing.join('、')
    : `${iconKeys.length} 个图标覆盖 ${navItems.length} 栏`);

const viewMissing = navKeys.filter((k) => consoleViewKeys.indexOf(k) < 0);
assert('后台左侧导航：每一栏都有对应视图（漏一处 = 「点得进去、页面空白」）',
  viewMissing.length === 0,
  viewMissing.length ? '缺视图：' + viewMissing.join('、')
    : `${navItems.length} 栏全部有视图：${consoleViewKeys.join('/')}`);

const orphanViews = consoleViewKeys.filter((k) => navKeys.indexOf(k) < 0);
assert('后台左侧导航：不存在「视图已注册但没有入口」的孤儿页（功能做好了却没人找得到）',
  orphanViews.length === 0,
  orphanViews.length ? '无入口：' + orphanViews.join('、')
    : `${consoleViewKeys.length} 个视图与栏目一一对应（无孤儿）`);

assert('后台未登录强制落在登录页：GATE_VIEW=login，且 gate() 未登录一律返回它、三处入口都过 gate()',
  /const GATE_VIEW = 'login'/.test(consoleSrcNoC) &&
  /if \(!AdminSession\.me\(\)\) return GATE_VIEW;/.test(consoleSrcNoC) &&
  (consoleSrcNoC.match(/App\.gate\(/g) || []).length >= 2,
  `GATE_VIEW=login：${/const GATE_VIEW = 'login'/.test(consoleSrcNoC)}　` +
  `gate 单点判定：${/if \(!AdminSession\.me\(\)\) return GATE_VIEW;/.test(consoleSrcNoC)}　` +
  `App.gate( 调用点：${(consoleSrcNoC.match(/App\.gate\(/g) || []).length} 处`);

assert('后台未登录时除「登录」外一律置灰不可点（只是提示，真正拦截在服务端各管理接口）',
  /const off = locked && n\.key !== GATE_VIEW;/.test(consoleSrcNoC),
  'renderNav 里按 locked 与 GATE_VIEW 算 .locked');

/* ---- 装修台那一半：入口撤掉，但「装修笔记」这条路必须留着 ---- */
const adminHtmlRaw = readFileSync(join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
const adminJsRaw = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');
const adminHtmlNoC = stripJsComments(adminHtmlRaw.replace(/<!--[\s\S]*?-->/g, ''));
const adminJsNoC = stripJsComments(adminJsRaw);

assert('装修台已撤掉「新建笔记」入口：HTML 里既无按钮也无统计卡（改坏：把 btnCreateNote 加回去）',
  !/btnCreateNote/.test(adminHtmlNoC) && !/statNote/.test(adminHtmlNoC),
  `btnCreateNote=${/btnCreateNote/.test(adminHtmlNoC)}　statNote=${/statNote/.test(adminHtmlNoC)}`);

assert('装修台已撤掉「新建 / 删除笔记」实现：JS 里既无 createNoteDialog 也无笔记删除分支',
  !/createNoteDialog/.test(adminJsNoC) && !/btnCreateNote/.test(adminJsNoC) && !/data-note-del/.test(adminJsNoC),
  `createNoteDialog=${/createNoteDialog/.test(adminJsNoC)}　btnCreateNote=${/btnCreateNote/.test(adminJsNoC)}　` +
  `data-note-del=${/data-note-del/.test(adminJsNoC)}`);

/*
 * 笔记**只从列表渲染里滤掉**，S.pages 里那份必须留着 ——
 * 控制台点「装修」走的是 /admin?edit=note-<id>，openPage 还要按 key 找到它。
 * 真把数据一起删掉，得到的是「按钮在、点了打不开编辑器」。
 */
assert('装修台仍认 shopnote：列表渲染里滤掉笔记行，但编辑那一半（顶栏标记 / 按 key 打开）必须留着',
  /if \(p\.shopnote\) return false;/.test(adminJsNoC) &&
  /meta\.shopnote/.test(adminJsNoC) &&
  !/S\.pages\s*=[^;]*\.filter\([^;]*shopnote/.test(adminJsNoC),
  `列表渲染滤掉=${/if \(p\.shopnote\) return false;/.test(adminJsNoC)}　` +
  `顶栏仍认 shopnote=${/meta\.shopnote/.test(adminJsNoC)}　` +
  `没有把数据一起删掉=${!/S\.pages\s*=[^;]*\.filter\([^;]*shopnote/.test(adminJsNoC)}`);

/* ---- 笔记列表「内容量」列：数据源与展示三分支（2026-10-15） ---- */
const storeSrc = readFileSync(join(__dirname, '..', 'decorate', 'store.js'), 'utf8');
const storeNoC = stripJsComments(storeSrc);
const modNoC = stripJsComments(modSrc);

/*
 * 两条都要锁：
 *   ① 新增 draftBlockCount（有草稿才给数字，否则 null）
 *   ② blockCount 的数据源**仍是 pub**（已生成代码那一份）
 * 只锁 ① 不锁 ②，等于允许「把 blockCount 换成读草稿」这种顺手改动溜过去 ——
 * 它不会让任何装修台断言变红，却悄悄改掉了装修台列表的既有口径。
 */
assert('笔记「内容量」：草稿区块数是独立字段（有草稿才给数，无草稿为 null），blockCount 仍读已生成代码那份',
  /draftBlockCount:\s*\(draft && draft\.data\)\s*\?\s*countBlocks\(meta\.key, draft\.data\)\s*:\s*null/.test(storeNoC) &&
  /blockCount:\s*countBlocks\(meta\.key, pub\)/.test(storeNoC),
  `draftBlockCount 由草稿算出=${/draftBlockCount:\s*\(draft && draft\.data\)\s*\?\s*countBlocks\(meta\.key, draft\.data\)\s*:\s*null/.test(storeNoC)}　` +
  `blockCount 仍读 pub=${/blockCount:\s*countBlocks\(meta\.key, pub\)/.test(storeNoC)}`);

assert('笔记「内容量」：展示层三分支齐全（无草稿 / 有草稿且已生成 / 有草稿未生成），且 noteRow 走的是它',
  /function contentText\(p\) \{/.test(modNoC) &&
  /if \(!hasDraftCount\) return \(p\.blockCount \|\| 0\) \+ ' 个组件';/.test(modNoC) &&
  /if \(p\.generated\) \{/.test(modNoC) &&
  /return '草稿 ' \+ p\.draftBlockCount \+ ' 个组件';/.test(modNoC) &&
  /'<td class="sub">' \+ contentText\(p\) \+ '<\/td>'/.test(modNoC),
  `contentText 存在=${/function contentText\(p\) \{/.test(modNoC)}　` +
  `无草稿分支=${/if \(!hasDraftCount\) return \(p\.blockCount \|\| 0\) \+ ' 个组件';/.test(modNoC)}　` +
  `已生成两行=${/if \(p\.generated\) \{/.test(modNoC)}　` +
  `未生成只报草稿=${/return '草稿 ' \+ p\.draftBlockCount \+ ' 个组件';/.test(modNoC)}　` +
  `noteRow 调用=${/'<td class="sub">' \+ contentText\(p\) \+ '<\/td>'/.test(modNoC)}`);

/* ---- 笔记「生成代码」门（2026-10-15 修）：实现锁 ---- */
/*
 * 行为判据在第 10 节（建 A/B → 发布 B → 看 A 有没有被顺带下发）。
 * 这里再锁一次**实现**，好处是改坏时能一眼看出是哪一处松了口，
 * 并且顺带锁住「id 要归一成字符串」这个易错点（拿 Number 去 has() 会一条都命不中，
 * 表现成「已下发的笔记被悄悄删掉」）。
 */
assert('笔记 / 自定义页「生成代码」门：assemble() 只写「本次发布的」或「已经在 replica.js 里的」，id 归一到字符串',
  /if \(p\.key !== keepKey && !generatedNoteIds\.has\(String\(shopnotes\.idOfKey\(p\.key\)\)\)\) return;/.test(storeNoC) &&
  /if \(p\.key !== keepKey && !liveCustomKeys\.has\(p\.key\)\) return;/.test(storeNoC) &&
  /const generatedNoteIds = new Set\(Object\.keys\(R0\.SHOPNOTES \|\| \{\}\)\.map\(String\)\);/.test(storeNoC) &&
  /const liveCustomKeys = new Set\(Object\.keys\(R0\.CUSTOM_PAGES \|\| \{\}\)\);/.test(storeNoC) &&
  /writeReplica\(pageData, key, \{ keepKey: key \}\)/.test(storeNoC) &&
  /writeReplica\(publishedAll\(\), newKey, \{ keepKey: wasLive \? newKey : '' \}\)/.test(storeNoC),
  `笔记过滤=${/if \(p\.key !== keepKey && !generatedNoteIds\.has\(String\(shopnotes\.idOfKey\(p\.key\)\)\)\) return;/.test(storeNoC)}　` +
  `自定义页过滤=${/if \(p\.key !== keepKey && !liveCustomKeys\.has\(p\.key\)\) return;/.test(storeNoC)}　` +
  `笔记 id 归一=${/const generatedNoteIds = new Set\(Object\.keys\(R0\.SHOPNOTES \|\| \{\}\)\.map\(String\)\);/.test(storeNoC)}　` +
  `已下发自定义页集合=${/const liveCustomKeys = new Set\(Object\.keys\(R0\.CUSTOM_PAGES \|\| \{\}\)\);/.test(storeNoC)}　` +
  `publish 传 keepKey=${/writeReplica\(pageData, key, \{ keepKey: key \}\)/.test(storeNoC)}　` +
  `改名传 keepKey（只看旧键是否已下发）=${/writeReplica\(publishedAll\(\), newKey, \{ keepKey: wasLive \? newKey : '' \}\)/.test(storeNoC)}`);

/* ---- 装修卡片「点了有地方去」：链接完整性（2026-10-15 补） ---- */
/*
 * 起因（真事）：新闻大事 / 用户分享两页复刻完，61 张卡片**标题与封面全齐**、
 * 页面渲染完全正常、接口零报错 —— 唯独每张卡片的 `link` 是空字符串，点了没反应。
 * 这类「看起来是好的」的哑故障，只能靠对账抓。
 *
 * 判据落在**真机真正读的那份数据**上（`miniprogram/config/replica.js`），
 * 而不是后台草稿：草稿改了没生成代码，真机上依然是旧的。
 *
 * ⚠️ 两条必须成对：
 *   ① 「断链 0」—— 只锁它一条，遍历逻辑写错时「一条都没扫到」会显示成全绿（空表恒真）；
 *   ② 「确实扫到了 link（>0）」—— 补上它，① 才是真判据。
 * 空 link **不算断链**：有些图片位本来就不跳转。空链接的兜底在
 * `.tooling/check-cards-link.mjs`（那里按页面逐个点名，且允许「某个页面本来就没卡片」）。
 */
{
  const replicaNow = localRequire(REPLICA_FILE);
  const appJsonNow = JSON.parse(readFileSync(join(MP_ROOT, 'app.json'), 'utf8'));
  const builtin = new Set((appJsonNow.pages || []).map((p) => '/' + p));
  ((appJsonNow.subPackages || appJsonNow.subpackages || []).forEach((sp) => {
    (sp.pages || []).forEach((p) => builtin.add('/' + sp.root + '/' + p));
  }));

  const linksFound = [];
  const walkLinks = (v, where) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walkLinks(x, where + '[' + i + ']')); return; }
    if (v && typeof v === 'object') {
      Object.keys(v).forEach((k) => {
        if (k === 'link' && typeof v[k] === 'string') linksFound.push({ where: where + '.' + k, link: v[k] });
        else walkLinks(v[k], where + '.' + k);
      });
    }
  };
  walkLinks(replicaNow.CUSTOM_PAGES || {}, 'CUSTOM_PAGES');
  walkLinks(replicaNow.HOME_BLOCKS || [], 'HOME_BLOCKS');
  walkLinks(replicaNow.MINE_BLOCKS || [], 'MINE_BLOCKS');

  const broken = [];
  let checkedLinks = 0;
  linksFound.forEach((x) => {
    const s = String(x.link).trim();
    if (!s) return;                       // 空 = 这一项不跳转，不是断链
    checkedLinks++;
    const p = s.split('?')[0].replace(/^\//, '');
    let okNow = false;
    if (/^packageNews\/note\/note$/.test(p)) {
      const id = (/[?&]id=(\d+)/.exec(s) || [])[1];
      okNow = !!id && !!((replicaNow.SHOPNOTES || {})[id]);
    } else if (/^pages\/custom\/index$/.test(p)) {
      const key = (/[?&]key=([^&]+)/.exec(s) || [])[1];
      okNow = !!key && !!((replicaNow.CUSTOM_PAGES || {})[key]);
    } else if (/^https?:/i.test(s) || /^tel:/i.test(s)) {
      okNow = true;                        // 网页 / 电话由 utils/link.js 另行处理，不归这条管
    } else {
      okNow = builtin.has('/' + p);
    }
    if (!okNow) broken.push(x.where + ' → ' + s);
  });

  assert('装修链接完整性：已生成代码里每条非空 link 都指向真实存在的笔记 / 页面（点了没反应是零报错的哑故障）',
    broken.length === 0,
    broken.length ? `断链 ${broken.length} 条：` + broken.slice(0, 6).join('；')
      : `扫到 ${checkedLinks} 条 link（另有 ${linksFound.length - checkedLinks} 条空 link 属「不跳转」，不计）`);

  assert('装修链接完整性：确实扫到了 link（防「遍历写错 → 一条都没查还显示绿」的空表恒真）',
    checkedLinks > 0, `扫到非空 link ${checkedLinks} 条`);
}

/* ---- 成员管理的角色门（直接问 lib/adminAuth 的 minRoleFor，不看注释） ---- */
const adminAuthLib = localRequire(join(__dirname, '..', 'lib', 'adminAuth.js'));
const memberOwnerPaths = ['save', 'delete', 'status', 'password']
  .map((p) => `/api/admin/members/${p}`);
const memberLoose = memberOwnerPaths.filter((p) => adminAuthLib.minRoleFor('POST', p) !== 'owner');
assert('成员管理是最高危点位：增 / 删 / 停用 / 重置口令一律要求 owner（能改谁能进后台）',
  memberLoose.length === 0,
  memberLoose.length ? '角色门过松：' + memberLoose.join('、')
    : `${memberOwnerPaths.length} 个写点位全部 owner：${memberOwnerPaths.join(' / ')}`);

assert('成员列表是只读点位：GET 只要求 viewer（只读成员也能看清自己是谁）',
  adminAuthLib.minRoleFor('GET', '/api/admin/members') === 'viewer',
  `minRoleFor(GET,/api/admin/members)=${adminAuthLib.minRoleFor('GET', '/api/admin/members')}`);

/*
 * 「改自己的口令」是 POST，但他**只需要 viewer**：否则只读成员连自己的口令都换不了，
 * 只能让 owner 代改 —— 等于人人共用一个口令，成员分级白做。
 * ⚠️ 这条判定在 minRoleFor 里必须排在 `method === 'GET'` 之前才生效（后面就永远走不到）。
 */
const selfPwPath = adminAuthLib.ADMIN_SELF_PASSWORD_PATH;
/* 单独读一份源码 —— 第 18 节里那个 adminAuthSrc 声明在本节之后，直接用会踩 TDZ */
const adminAuthSrcHere = readFileSync(join(__dirname, '..', 'lib', 'adminAuth.js'), 'utf8');
const selfPwFirst = (() => {
  const body = (/function minRoleFor\(method, path\) \{([\s\S]*?)\n\}/.exec(adminAuthSrcHere) || ['', ''])[1];
  const iSelf = body.indexOf('ADMIN_SELF_PASSWORD_PATH');
  const iGet = body.indexOf("=== 'GET'");
  return iSelf >= 0 && iGet >= 0 && iSelf < iGet;
})();
assert('「改自己的口令」只要求已登录（viewer 起），且在 minRoleFor 里排在 GET 判断之前',
  adminAuthLib.minRoleFor('POST', selfPwPath) === 'viewer' && selfPwFirst,
  `minRoleFor(POST,${selfPwPath})=${adminAuthLib.minRoleFor('POST', selfPwPath)}　排在 GET 之前=${selfPwFirst}`);

/* ---- 成员管理接口的运行时边界（真实 HTTP） ---- */
const memAnon = await call('GET', '/api/admin/members', {
  auth: false, admin: false, expectFail: '匿名读成员列表', expectHttp: 401, expectCode: 401
});
assertBlocked('成员列表：匿名访问被拒（401 / code 401，不是先回一个空列表）', memAnon,
  `HTTP ${memAnon.httpStatus} / code ${memAnon.json && memAnon.json.code}`);

const memUser = await call('GET', '/api/admin/members', {
  admin: false, bearer: token, expectFail: '小程序用户令牌读成员列表', expectHttp: 401, expectCode: 401
});
assertBlocked('成员列表：小程序用户令牌被拒（401 / code 401，用户身份进不了后台）', memUser,
  `HTTP ${memUser.httpStatus} / code ${memUser.json && memUser.json.code}`);

const memList = await call('GET', '/api/admin/members');
const memData = (memList.data) || {};
const memRows = memData.list || [];
assert('成员列表返回：成员 + 角色说明 + 账号规则 + 现有 owner 数 + 凭证来源',
  memList.ok && Array.isArray(memData.list) && Array.isArray(memData.roles) &&
  !!memData.rules && typeof memData.activeOwners === 'number' &&
  typeof memData.envTokens === 'number' && typeof memData.sharedPassword === 'boolean',
  memList.ok ? `成员 ${memRows.length} 个 · 角色 ${(memData.roles || []).length} 种 · ` +
    `启用中 owner ${memData.activeOwners} · 长期令牌 ${memData.envTokens} 条` : (memList.json || {}).msg);

/*
 * 「不能吐哈希」——出接口只走 members.pub()。
 * 手拼字段迟早会漏一次，而漏掉的那次就是把 scrypt 哈希与盐发到浏览器。
 *
 * ⚠️ 这里**不写**「拿着响应体找 pwd/hash/salt」那种运行时判据：
 *    本机与线上成员表通常是空的，`[].every(...)` 恒真 —— 那就是一条永远绿的假断言
 *    （实测过：把 pub() 改成 `return m` 直接吐哈希，空表下这条照样绿）。
 *    运行时判据放在 `.tooling/test-admin-auth.mjs` 的 7.5 节（那里真有成员，
 *    改坏后能打印出泄漏的 salt/hash）；本节点锁**实现**：出参字段表单点维护、
 *    路由不许绕过它去碰 raw()。
 */
const membersSrc = readFileSync(join(__dirname, '..', 'lib', 'members.js'), 'utf8');
const pubBody = stripJsComments((/function pub\(m\) \{([\s\S]*?)\n\}/.exec(membersSrc) || ['', ''])[1]);
const pubKeys = [...pubBody.matchAll(/^\s{4}([A-Za-z0-9_]+):/gm)].map((x) => x[1]);
const pubUnsafe = pubKeys.filter((k) => ['pwd', 'hash', 'salt', 'password'].indexOf(k) >= 0);
/* 只允许**一条** return：`return m;` 那种「直接把原始记录吐出去」也要拦（实测过它会绕过字段表检查） */
const pubReturns = (pubBody.match(/\breturn\b/g) || []).length;
assert('成员出参由 members.pub() 单点产出：白名单字段、不含 pwd/hash/salt、且只有一条 return（不许直接返回原始记录）',
  pubKeys.length >= 8 && pubUnsafe.length === 0 && /pwdSet:/.test(pubBody) &&
  pubReturns === 1 && /^\s{2}return \{/m.test(pubBody),
  `字段 ${pubKeys.length} 个${pubUnsafe.length ? '（危险：' + pubUnsafe.join('、') + '）' : ''}　` +
  `return 条数=${pubReturns}　首句是 return {=${/^\s{2}return \{/m.test(pubBody)}`);

const adminRoutesNoC = stripJsComments(readFileSync(join(__dirname, '..', 'routes', 'admin.js'), 'utf8'));
assert('成员接口只经 members 模块出参：路由用 list() / create() / update() / remove()，不碰内部 raw()',
  /members\.list\(\)/.test(adminRoutesNoC) && !/members\.raw\(/.test(adminRoutesNoC),
  `用 list()=${/members\.list\(\)/.test(adminRoutesNoC)}　没碰 raw()=${!/members\.raw\(/.test(adminRoutesNoC)}`);

/* 运行时的「成员表非空」那一半在 check-all 里做不了（真实数据通常没成员），
 * 所以这一条**不依赖成员数**：接口下发的角色清单必须与 lib/members.js 的 ROLES 同源。 */
const membersLib = localRequire(join(__dirname, '..', 'lib', 'members.js'));
const rolesFromApi = (memData.roles || []).map((r) => r.value).join(',');
assert('成员角色清单与 lib/members.js 的 ROLES 同源（加角色只改一处，下拉与校验不会各说各话）',
  rolesFromApi === membersLib.ROLES.join(','),
  `接口=${rolesFromApi || '（空）'}　模块=${membersLib.ROLES.join(',')}`);

/*
 * 「共享口令是否可用」的口径必须与登录同源。
 * 写 `!!process.env.ADMIN_PASSWORD` 就是错的：**开发环境用的是内置默认口令、环境变量为空**，
 * 那样会显示成「没有共享口令」，而实际能登 —— 两处判据分家，页面就开始骗人。
 * 这里拿 health 自述的 password 字段做等价对账（'unset' ⟺ 共享口令不可用）。
 */
const pwUsableByHealth = health.data.adminAuth.password !== 'unset';
assert('成员列表的「共享口令可用」与 health 自述同口径（拿环境变量判会与内置默认口令打架）',
  memData.sharedPassword === pwUsableByHealth,
  `health.password=${health.data.adminAuth.password} → 期望 ${pwUsableByHealth}，实际 ${memData.sharedPassword}`);

/*
 * 这里**故意不写**「health 自述的成员数 == 成员列表长度」那类等价对账 ——
 * 本机与线上成员表大概率是空的，`0 === 0` 恒真，写在这儿等于没写。
 * 那两条对账（成员数一致 / activeOwners 与逐条统计一致）放在
 * `.tooling/test-admin-auth.mjs` 的 7.5 节 —— 那个脚本会临时建出成员，
 * 判据才真的有边界，改坏得出来。
 */

/*
 * 成员写点位：走**预期失败**分支触达，一个字节都不落盘。
 *
 * 为什么不像自定义页那样「建一个再删掉」：check-all 跑在**真实数据目录**上，
 * 而 members.json 里是运营/同事的真实后台账号 —— 自检往里塞人再删，
 * 即使最后清干净，中途也有「自检的临时账号正拿得到后台权限」的时间窗；
 * 万一半路异常退出，还会在真数据里留下一个没人认领的账号。
 * 所以这里只用「不存在 / 缺参数」这类入口把点位打一遍（也顺带锁住错误分支），
 * 真正会改数据的增删改停在成员表上的端到端验证放在 `.tooling/test-admin-auth.mjs`
 * （那个脚本起独立端口 + 临时数据目录，随便写）。
 */
const memBadSave = await call('POST', '/api/admin/members/save', {
  body: {}, expectFail: '新建成员缺账号', expectHttp: 200, expectCode: 1001
});
assert('成员保存：缺账号被参数校验拦下（不会静默建出一个空账号）',
  memBadSave.json.code === 1001 && /请填写登录账号/.test((memBadSave.json || {}).msg || ''),
  `code ${memBadSave.json.code} ${memBadSave.json.msg}`);

const memBadStatus = await call('POST', '/api/admin/members/status', {
  body: { id: 999999, enabled: false }, expectFail: '停用不存在的成员', expectHttp: 404, expectCode: 404
});
assert('成员停用：不存在的成员 → 404（不会把「找不到」当成「已停用」回报成功）',
  memBadStatus.json.code === 404, `code ${memBadStatus.json.code} ${memBadStatus.json.msg}`);

const memBadPwd = await call('POST', '/api/admin/members/password', {
  body: { id: 999999, password: 'whatever-1234' }, expectFail: '重置不存在的成员口令', expectHttp: 404, expectCode: 404
});
assert('成员重置口令：不存在的成员 → 404', memBadPwd.json.code === 404,
  `code ${memBadPwd.json.code} ${memBadPwd.json.msg}`);

const memBadDel = await call('POST', '/api/admin/members/delete', {
  body: { id: 999999 }, expectFail: '删除不存在的成员', expectHttp: 404, expectCode: 404
});
assert('成员删除：不存在的成员 → 404（顺手确认「最后一位 owner」那类防护没被走到）',
  memBadDel.json.code === 404, `code ${memBadDel.json.code} ${memBadDel.json.msg}`);

/* 本次自检用的若不是成员账号，自助改口令就该被拒 —— 顺带把这条点位也打一遍 */
const selfPwProbe = await call('POST', '/api/admin/me/password', {
  body: { oldPassword: 'x', newPassword: 'self-pw-probe-1' },
  expectFail: '非成员身份改个人口令', expectHttp: 403, expectCode: 403
});
assert('「改自己的口令」对非成员身份（共享口令 / 长期令牌）→ 403（它们没有「个人口令」这回事）',
  selfPwProbe.json.code === 403, `code ${selfPwProbe.json.code} ${selfPwProbe.json.msg}`);

/* 后果断言：上面 5 个失败分支跑完，成员表必须一个字节都没变 */
const memAfterProbe = await call('GET', '/api/admin/members', { silent: true });
assert('成员写点位的失败分支不留痕：成员数量与逐条内容都与刚才一致',
  JSON.stringify((memAfterProbe.data || {}).list) === JSON.stringify(memRows),
  `前 ${memRows.length} 条 → 后 ${(((memAfterProbe.data || {}).list) || []).length} 条`);

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

/* 2026-10-13 清理：`shopName` / `logo` 这两个**历史遗留的重复键**已从
 * catalogStore.DEFAULT_SETTINGS 移除（真源唯一 = 装修台 replica.SHOP）。
 * 这条断言锁「确实删干净了」——否则它们会跟着 GET /api/admin/settings 又冒回后台表单，
 * 运营改一次被拒一次（1001），变成「面板上有个改不动的字段」。
 * 同时锁「老数据文件里若还残留这两个键，加载时会被清掉」（load() 的 REMOVED_SETTINGS 分支）。 */
{
  const storeMod = requireFromHere(join(__dirname, '..', 'lib', 'catalogStore.js'));
  const defs = storeMod.DEFAULT_SETTINGS || {};
  const leftovers = ['shopName', 'logo'].filter((k) => Object.prototype.hasOwnProperty.call(defs, k));
  const viewKeys = Object.keys(((await call('GET', '/api/admin/settings', { silent: true })).data || {}).settings || {});
  const viewLeft = ['shopName', 'logo'].filter((k) => viewKeys.indexOf(k) >= 0);
  assert('10 · 店铺设置里的历史遗留键 shopName / logo 已彻底移除（默认值 + 接口返回两处）',
    leftovers.length === 0 && viewLeft.length === 0,
    (leftovers.length ? `默认值里还有：${leftovers.join(', ')}` : '') +
    (viewLeft.length ? ` 接口返回里还有：${viewLeft.join(', ')}` : '') ||
    `默认设置 ${Object.keys(defs).length} 项、接口返回 ${viewKeys.length} 项，均无 shopName / logo`);
}

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
 * 21. 汇总口径终值自检
 *
 * ⚠️ 这里原来是**同义反复**：`stat().failed.length === results.filter(r => !r.passed).length`
 * —— 两边在同一时刻取值，永远相等，所以它「PASS」却什么也没锁住。实测后果（2026-10-13）：
 * 把 reset.wxss 的图片底色改坏后，行内确实打印了 ✗，汇总却仍写「失败 0 条」并 exit 0 ——
 * 因为尾部断言（富文本 / 字体 / 图片底色那一组，4500 行以后）是在喂给汇总的那份
 * `stat()` 快照（3994 行）**之后**才注册的，快照看不见它们。这就是「验证器自己说谎」。
 *
 * 修法两步：① 喂给汇总的 `stat()` 挪到**全部断言注册完之后**（见下面「输出」段）；
 *           ② 这条断言改成**结构性**检查 —— 直接读本文件源码，要求汇总的
 *              `const { reg, tested, missing, failed } = stat()` 出现在最后一条
 *              `assert(` 之后。位置错了就是真错，不会再恒真。
 * ------------------------------------------------------------------------- */
/*
 * ⚠️ 扫源码前**必须先剥注释** —— 上面这段注释里就逐字写着 `const { reg, tested, missing, failed } = stat()`，
 * 不剥的话 findIndex 会先命中注释那一行（在最后一条 assert 之前）→ **恒红**。
 * 剥的时候把注释换成等长空格、**保留换行**，行号才不乱。
 * （这条自己踩过：第一版没剥注释，改坏业务代码时这条也跟着红了，一看就是假红。）
 */
const selfNoC = readFileSync(SELF_FILE, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const selfNoCLines = selfNoC.split('\n');
const lastAssertLine = selfNoCLines.reduce((acc, l, i) => (/^\s*assert\(/.test(l) ? i : acc), -1);
const statSnapLine = selfNoCLines.findIndex((l) =>
  /const\s*\{\s*reg\s*,\s*tested\s*,\s*missing\s*,\s*failed\s*\}\s*=\s*stat\(\)/.test(l));
assert('自检汇总口径 = 全部断言的终值（喂给汇总的 stat() 必须在最后一条 assert 之后取，不许中途快照）',
  statSnapLine >= 0 && statSnapLine > lastAssertLine,
  `最后一条 assert 在第 ${lastAssertLine + 1} 行 ｜ 汇总 stat() 在第 ${statSnapLine + 1} 行`
    + (statSnapLine < 0 ? '（没找到！改过那行的写法？）' : ''));

/* ----------------------------- 输出 ----------------------------- */

/*
 * 输出段包成函数的原因：这个脚本是一条两千多行的「边跑边断言」长流程，
 * 任一步抛未预期异常（接口真崩了、接口返回的字段没了导致取属性炸了）都会在
 * 打印任何结果之前整段退出 —— 现场只剩一个 TypeError，看不到已经跑完的 300 多条结果。
 * 现在挂上 unhandledRejection / uncaughtException，异常也走同一个 emitReport()。
 */
function emitReport() {
  /* ⚠️ 统计**不在这里取** —— 本文件是「边跑边断言」的长流程，下面还会注册几十条断言
     （富文本 / 字体 / 图片底色…）。在这里取快照 = 那批断言失败也不计入汇总、不影响退出码，
     行内打印 ✗ 而汇总写「失败 0 条」（2026-10-13 实测踩到）。终值统一在「输出」段现算，
     并有第 21 节那条结构性断言锁着位置。 */
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
  /* =====================================================================
   * 品牌分类（对标有赞「高级组件 · 品牌分类E」）：实测口径对账
   *
   * 来源：2026-10-10 用真实浏览器打开有赞移动端店铺页
   *   https://shop46010558.m.youzan.com/v2/feature/NimpMk7rIc?kdt_id=45818390
   *   逐节点读 computedStyle + getBoundingClientRect，底稿 .tooling/_yz-fine.json
   *
   * 该页**就是**用「品牌分类E」搭的（左上整栏宽 Logo + 左栏 26% 品牌导航 + 右栏图文流，
   * 整屏橱窗、两栏各自滚动）。那次复刻逐像素量出 6 处与实现不一致的细节，全部已改，
   * 这里逐条锁死 —— 每一条都是「不改就与真机差 4~6px 或整屏高度错掉」的硬约束。
   * ------------------------------------------------------------------- */
  {
    const yzBcatCss = readFileSync(join(MP_ROOT, 'pages', 'index', 'index.wxss'), 'utf8');
    const yzBcatWxml = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
    const yzBcatJs = readFileSync(join(MP_ROOT, 'utils', 'blocks.js'), 'utf8');
    const yzBcatPv = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');
    const yzBcatSchema = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');

    /* (1) 左栏标题的文字缩进：实测有赞 `padding: 0 10px`（文字从栏内边缘缩进 10px）。
     *     曾经写成 12rpx（6px），差 4px。 */
    const naviPad = (/\.bc-navi\s*\{([\s\S]*?)\}/.exec(yzBcatCss) || [])[1] || '';
    assert('品牌分类：左栏标题容器缩进 = 20rpx（实测有赞 10px）',
      /padding:\s*0\s+20rpx/.test(naviPad),
      naviPad ? 'padding 取自 .bc-navi：' + (/padding:[^;]+/.exec(naviPad) || ['(未写)'])[0] : '未找到 .bc-navi 规则');

    /* (2) 左上 Logo 是**整栏宽的一条**（实测 98 × 60.34，无内边距）。
     *     曾经给 .bc-logo 加了 12rpx 内边距，图缩到 85.5 宽，与真机差 6px。 */
    const logoRule = (/\.bc-logo\s*\{([\s\S]*?)\}/.exec(yzBcatCss) || [])[1] || '';
    assert('品牌分类：左上 Logo 整栏宽（.bc-logo padding: 0）',
      /padding:\s*0\s*;/.test(logoRule),
      logoRule ? 'width 口径见 miniprogram/pages/index/index.wxss 的 .bc-logo' : '未找到 .bc-logo 规则');

    /* (3) 图与标题之间的间距挂在**标题的 margin-top** 上（实测有赞 `p{margin-top:10px}`），
     *     格子自身不留 margin-bottom。挂错位置会让行距变成
     *     「图 + 间距 + 文字 + 间距」，比真机高出一截。 */
    assert('品牌分类：图与标题的间距在标题 margin-top 上，格子自身不留下边距',
      /class="bc-it"[\s\S]{0,200}?margin-top:\s*\{\{block\.itemGapYRpx\}\}rpx/.test(yzBcatWxml) &&
      !/margin-bottom:\s*\{\{block\.itemGapYRpx\}\}rpx/.test(yzBcatWxml),
      /margin-bottom:\s*\{\{block\.itemGapYRpx\}\}rpx/.test(yzBcatWxml)
        ? 'blocks.wxml 里仍然把 itemGapY 挂在格子的 margin-bottom 上'
        : '间距位置正确');

    /* (4) itemGapY 的默认值三处必须同值：装修台表单 / 真机 normalize / 预览渲染。
     *     实测有赞为 10px（曾三处都是 5）。 */
    const yzG1 = (/k:\s*'itemGapY'[^}]*?def:\s*(\d+)/.exec(yzBcatSchema) || [])[1];
    const yzG2 = (/nv\(o\.itemGapY,\s*(\d+)\)/.exec(yzBcatJs) || [])[1];
    const yzG3 = (/pvNum\(b\.itemGapY,\s*(\d+)\)/.exec(yzBcatPv) || [])[1];
    assert('品牌分类：itemGapY 默认值三处一致且为 10（实测有赞 10px）',
      yzG1 === '10' && yzG2 === '10' && yzG3 === '10',
      `schema=${yzG1} ｜ blocks.js=${yzG2} ｜ pv-render=${yzG3}`);

    /* (5) 高度模式：有赞线上是**整屏橱窗**（组件占满一屏、左右两栏各自内部滚动）。
     *     真机用 scroll-view + WXSS 的 100vh；缺任何一处就退化成「整页一起滚」。 */
    assert('品牌分类：整屏模式三处齐备（heightMode 字段 / scroll-view / WXSS 100vh）',
      /k:\s*'heightMode'/.test(yzBcatSchema) &&
      /scroll-y="\{\{block\.screenMode\}\}"/.test(yzBcatWxml) &&
      /\.bc-navcol\.screen,\s*\n\.bc-main\.screen\s*\{\s*height:\s*100vh;/.test(yzBcatCss),
      `字段=${/k:\s*'heightMode'/.test(yzBcatSchema)} scroll-view=${/scroll-y="\{\{block\.screenMode\}\}"/.test(yzBcatWxml)} 100vh=${/height:\s*100vh;/.test(yzBcatCss)}`);

    /* (6) ⚠️ 模板的 inline style 里**不许出现 vh 单位**。
     *
     * mp-wxss 的 vh→px 换算只处理 .wxss 文件，inline 的 `100vh` 会原样进浏览器，
     * 预览页里取到的是**浏览器窗口**高度（实测 935px）而不是手机屏高（718px）——
     * 整个橱窗高出一截、滚动条位置也不对。这条踩过一次，必须锁死。 */
    const yzInlineVh = yzBcatWxml.match(/style="[^"]*\d+(?:\.\d+)?vh[^"]*"/g) || [];
    assert('品牌分类：blocks.wxml 的 inline style 里不出现 vh 单位（inline 的 vh 不经过 mp-wxss 换算）',
      yzInlineVh.length === 0,
      yzInlineVh.length ? '发现 ' + yzInlineVh.length + ' 处：' + yzInlineVh[0].slice(0, 60) : '无');

    /* (7) 左上 Logo 的跳转：字段在 schema 里叫 link（「Logo 跳转」），
     *     真机侧必须派生成 navLogoLink 才点得动 —— 曾经漏掉这一行，Logo 是死的。 */
    assert('品牌分类：Logo 跳转派生 navLogoLink（装修台配了「Logo 跳转」真机要生效）',
      /o\.navLogoLink\s*=\s*o\.link/.test(yzBcatJs),
      /o\.navLogoLink/.test(yzBcatJs) ? '已派生' : 'blocks.js 里没有 navLogoLink');

    /* ---------------------------------------------------------------------
     * 源码文本断言必须先**剥掉注释**。
     *
     * 这一组改动都带详细说明注释，而注释里为了讲清「为什么不能这么写」，
     * 几乎必然会**引用被禁的写法原文**（例如「容器 margin-bottom:-5px」）。
     * 不剥注释，说明文字就会被当成违规 —— 已经因此白红过两次
     * （网格行距、以及预览端那句 margin-bottom 说明），每次都要回头查半天。
     * ------------------------------------------------------------------- */
    /* ⚠️ 先统一换行再匹配：这些源文件是 **CRLF**，正则里写 `\n  }\n` 永远不中，
     *    会得到「函数体为空」的假红（已经踩过一次）。 */
    const yzDecommentJs = (s) => s
      .replace(/\r\n/g, '\n')                     // CRLF → LF
      .replace(/\/\*[\s\S]*?\*\//g, ' ')          // /* … */
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ');   // // …（避开 https:// 里的 //）
    const yzPv = yzDecommentJs(yzBcatPv);
    const yzCss = yzDecommentJs(yzBcatCss);
    const yzWxml = yzDecommentJs(yzBcatWxml.replace(/<!--[\s\S]*?-->/g, ' '));
    /* 只取 pvBrandCategory 的函数体：pv-render.js 里别的区块也用 object-fit 等写法，
     * 整文件扫会把它们误判成「品牌分类的回归」。 */
    const yzPvFn = (/function pvBrandCategory\(b\)\s*\{([\s\S]*?)\n  \}\n/.exec(yzPv) || [])[1] || '';

    /* (8) 预览端与真机同口径：导航文字缩进 10px、**网格模式**的格子无 margin-bottom、
     *     整屏高度取装修台手机壳的屏高变量（叫 --phone-screen-h，不是 --mp-screen-h）。
     *
     * ⚠️ 只查**网格格子的模板本身**，两个都踩过的坑：
     *    ① 导航模式（小图 + 文字的横排）本来就有自己的 margin-bottom →
     *       一开始整文件扫 `margin-bottom: gapY`，把导航模式误判成回归，白红了一次；
     *    ② 收窄成「从 `var cols = …` 到 `var navCol = ''`」还是太大 —— 中间夹着
     *       `return '<div style="margin-bottom:' + pGap + 'px">' …` 那行**小组容器的块间距**
     *       （pGap=13，实测有赞就是 13px，本该存在）→ 又白红一次。
     *    现在直接锚到网格 `.map(...)` 的收尾 `}).join('') + '</div>';`，只覆盖格子模板。 */
    const yzGridSeg = (/var cols = Math\.max\(1, Math\.round\(pvNum\(layout, 2\)\)\);([\s\S]*?)\}\)\.join\(''\) \+ '<\/div>';/.exec(yzPv) || [])[1] || '';
    /* 正反两面都要查，否则「把 margin-bottom 挪到别处」也能骗过纯否定式断言：
     *   反面：格子里不该有 margin-bottom（有 → 行距变成「图+间距+字+间距」，比真机高一截）
     *   正面：间距必须落在标题的 margin-top 上（与真机 .bc-it 的 p{margin-top} 同口径） */
    const yzCellNoMb = yzGridSeg.length > 0 && !/margin-bottom:/.test(yzGridSeg);
    const yzCellMtTop = /margin-top:' \+ gapY \+ 'px/.test(yzGridSeg);
    assert('品牌分类：预览端与真机同口径（缩进 10px / 网格格子无下边距且间距在标题 margin-top / 整屏取 --phone-screen-h）',
      /padding:0 10px;overflow:hidden/.test(yzPv) &&
      yzCellNoMb && yzCellMtTop &&
      /--phone-screen-h/.test(yzPv),
      `缩进10px=${/padding:0 10px;overflow:hidden/.test(yzPv)} 格子段=${yzGridSeg.length}字 格子无下边距=${yzCellNoMb} 间距在标题margin-top=${yzCellMtTop} 屏高变量=${/--phone-screen-h/.test(yzPv)}`);

    /* ---------------------------------------------------------------------
     * (9)~(13) 2026-10-10 第二轮逐像素复刻量出来的差异，逐条锁死。
     *
     * 手法：把有赞页与复刻页各截一张「只含 375 宽真机区」的图，逐像素比。
     *   对账脚本 .tooling/_cmp/compare.py（并排图 + 差异热力图 + 错位带）
     *              .tooling/_cmp/shift2.py（逐行最佳纵向位移，只看高置信行）
     *   量出来的 5 处，其中前 3 处是**肉眼可见或预览/真机不一致**的，必须锁：
     *     · 图盒底色：有赞 computed `rgba(0,0,0,0)`，我们铺了 --color-bg-muted；
     *       而 H5 的 260×224 型号图有 **92.2% 像素 alpha=0** → 真机与预览都透出灰底。
     *     · 网格图片高度：真机 `mode="widthFix"` 按原图比例（260×224 → 119.54 高、
     *       417×360 → 119.78 高，与有赞实测 119.537 / 119.775 **逐位吻合**），
     *       而装修台预览写成 `padding-top:100%` + `object-fit:cover` → 138.75 高的正方。
     *     · 标题行盒：有赞 computed `line-height: 18px`（字号 14px），
     *       我们没写 → `normal`（实测 20px），且 normal 随引擎变化、三端不一致。
     *   另外两处（网格行距 5px、导航模式行距）一并锁，避免以后互相改坏。
     * ------------------------------------------------------------------- */

    /* (9) 图盒底色：网格模式必须透明，兜底底色只留给导航模式的小方图。
     *     ⚠️ 预览端只查**网格那段**（yzGridSeg）：导航模式的小方图仍带 #f5f6f8，
     *        那是刻意保留的 —— 真机 `.bc-pic.square` 同样铺 --color-bg-muted。 */
    const yzPicRule = (/\.bc-pic\s*\{([\s\S]*?)\}/.exec(yzCss) || [])[1] || '';
    const yzPicSq = (/\.bc-pic\.square\s*\{([\s\S]*?)\}/.exec(yzCss) || [])[1] || '';
    assert('品牌分类：网格图盒不铺底色（有赞是透明盒；带透明通道的型号图会透出灰底）',
      yzPicRule.length > 0 && !/background/.test(yzPicRule) &&
      /background:\s*var\(--color-bg-muted\)/.test(yzPicSq) &&
      yzGridSeg.length > 0 && !/background:#f5f6f8/.test(yzGridSeg),
      `真机 .bc-pic 有 background=${/background/.test(yzPicRule)} ｜ .bc-pic.square 有兜底=${/background:\s*var\(--color-bg-muted\)/.test(yzPicSq)} ｜ 预览网格段残留 #f5f6f8=${/background:#f5f6f8/.test(yzGridSeg)}`);

    /* (10) 标题行盒显式 18px，真机与装修台预览同值。 */
    assert('品牌分类：标题行盒显式 18px（有赞实测；不写就是 normal，三端各不相同）',
      /\.bc-it\s*\{[\s\S]*?line-height:\s*18px/.test(yzCss) &&
      /line-height:18px/.test(yzPvFn),
      `真机 .bc-it=${/\.bc-it\s*\{[\s\S]*?line-height:\s*18px/.test(yzCss)} ｜ 预览=${/line-height:18px/.test(yzPvFn)}`);

    /* (11) 网格行距 5px（有赞：第 2 行起的条目多 5px `margin-top`）。
     *      必须挂在**条目自身的 margin-top** 上，且真机/预览同口径。
     *
     * ⚠️ 三条「不许用」都要锁，因为它们各自会以不同方式坏掉：
     *   · 容器负 margin-bottom → 穿透折叠到小组容器的 13px 下边距（13-5=8），
     *     后面每一块整体上移 5px，差异带从 8 段涨到 16 段（实测过）；
     *   · 格子 padding-bottom（不补偿）→ 最后一行的 padding 把下一块往下推 5px；
     *   · flex 的 row-gap → 老 iOS WebKit 静默失效（本项目 WXSS 从未用过 gap）。 */
    const yzGapOk = /o\.gapRowRpx = px2rpx\(5\)/.test(yzBcatJs) &&
      /gapTopRpx: \(!isNav && ii >= cols\) \? o\.gapRowRpx : 0/.test(yzBcatJs) &&
      /margin-top: \{\{it\.gapTopRpx\}\}rpx/.test(yzWxml) &&
      /var rowTop = ii >= cols \? 5 : 0;/.test(yzPvFn) &&
      /margin-top:' \+ rowTop \+ 'px/.test(yzPvFn);
    const yzGapBad = /\.bc-cell:not\(\.nav\)\s*\{[\s\S]*?padding-bottom:/.test(yzCss) ||
      /\.bc-grid\s*\{[\s\S]*?margin-bottom:\s*-/.test(yzCss) ||
      /row-gap/.test(yzCss) ||
      /margin:0 -' \+ \(gapX \/ 2\) \+ 'px -5px/.test(yzPvFn);
    assert('品牌分类：网格行距 5px 挂在条目 margin-top 上（真机/预览同口径；禁用负 margin / padding / row-gap）',
      yzGapOk && !yzGapBad,
      `四处齐备=${yzGapOk} ｜ 未用禁用写法=${!yzGapBad}` + (yzGapBad ? '（发现负margin/padding/row-gap 之一）' : ''));

    /* (12) 导航模式的行距不能被上面那条顺手删掉：图与标题左右并排，
     *      标题的 margin-top 会被 .bc-cell.nav .bc-it 归零，
     *      所以行距只能挂在格子自身的 margin-bottom 上（按模式取 itemGapY / 0）。
     *      —— 这正是一开始「网格行距双倍」那轮改动的漏网之鱼。 */
    assert('品牌分类：导航模式行距仍挂在格子 margin-bottom（网格模式才是 0）',
      /margin-bottom:\s*\{\{pn\.isNav \? block\.itemGapYRpx : 0\}\}rpx/.test(yzWxml) &&
      /\.bc-cell\.nav \.bc-it\s*\{[\s\S]*?margin-top:\s*0/.test(yzCss) &&
      /;margin-bottom:' \+ gapY \+ 'px/.test(yzPvFn),
      `模板分模式=${/margin-bottom:\s*\{\{pn\.isNav \? block\.itemGapYRpx : 0\}\}rpx/.test(yzWxml)} 真机 nav 标题归零=${/\.bc-cell\.nav \.bc-it\s*\{[\s\S]*?margin-top:\s*0/.test(yzCss)} 预览 nav margin=${/;margin-bottom:' \+ gapY \+ 'px/.test(yzPvFn)}`);

    /* (13) 装修台预览的网格图必须按原图比例撑高（对齐真机 widthFix），
     *      不能是正方 + cover。
     *      ⚠️ 只看网格那段（yzGridSeg）：导航模式的小方图**必须**用
     *         `aspectFill`/cover —— 真机那边是 `pn.isNav ? 'aspectFill' : 'widthFix'`。 */
    assert('品牌分类：装修台预览的网格图按原图比例撑高（对齐真机 widthFix，不是正方 cover）',
      /<img src="' \+ attr\(it\.image\) \+ '" style="width:100%;display:block">/.test(yzGridSeg) &&
      !/object-fit:cover/.test(yzGridSeg) &&
      !/padding-top:100%;border-radius:' \+ itemRadius/.test(yzGridSeg),
      `widthFix 写法=${/<img src="' \+ attr\(it\.image\) \+ '" style="width:100%;display:block">/.test(yzGridSeg)} 网格段 cover=${/object-fit:cover/.test(yzGridSeg)} 正方图盒残留=${/padding-top:100%;border-radius:' \+ itemRadius/.test(yzGridSeg)}`);

    /* (14) 「占满一屏」的左右两栏必须带 `data-scroll-y`。
     *      这不是装饰：真机上这两栏是 scroll-view，它的滚动条是**滚动时才浮出的临时条**，
     *      不占布局宽；装修台手机壳里这两栏却是 pv-render 手写的 div，只能靠这个标记
     *      命中 MpWxss.scrollViewCss 的那条规则。漏了它，浏览器默认滚动条会**实打实吃掉 8px** ——
     *      右栏内容 277.5 被压成 269.5，比真机（/preview）和有赞都窄 4px（实测过）。 */
    const yzScrollAttr = /var scrollAttr = screenMode \? ' data-scroll-y' : '';/.test(yzPv);
    const yzScrollAttrUse = (yzPv.match(/<div' \+ scrollAttr \+ /g) || []).length;
    assert('品牌分类：整屏两栏带 data-scroll-y（命中共享的滚动条浮层化规则）',
      yzScrollAttr && yzScrollAttrUse === 2,
      `标记变量=${yzScrollAttr} ｜ 用它的栏数=${yzScrollAttrUse}（应为 2）`);

    /* (15) 滚动条口径**只有一份定义**，装修台复用同一份，pv-render 不许自写第二份。
     *      两份实现必然走样 —— 这次就是 /preview（走 MpWxss.runtimeCss）有、
     *      装修台（走 pv-render）没有，同一个组件在两个入口宽度差 8px。 */
    const yzWxssSrc = readFileSync(join(__dirname, '..', 'public', 'shared', 'mp-wxss.js'), 'utf8');
    const yzScrollDefCount = (yzWxssSrc.match(/\[data-scroll-y\]\{/g) || []).length;
    const yzScrollSingle =
      /function scrollViewCss\(prefix\)/.test(yzWxssSrc) &&      // 定义
      yzWxssSrc.indexOf('scrollViewCss: scrollViewCss') >= 0 &&  // 导出
      /scrollViewCss\(prefix\),/.test(yzWxssSrc) &&             // runtimeCss 复用它
      yzScrollDefCount === 1 &&                                  // 规则字面量只出现一次
      !/::-webkit-scrollbar/.test(yzPv) &&                       // pv-render 不自写第二份
      /MpWxss\.scrollViewCss\('\.phone-screen'\)/.test(yzPv); // 装修台注入的是这一份
    assert('品牌分类：滚动条浮层化只有一份实现（MpWxss.scrollViewCss），装修台复用它',
      yzScrollSingle,
      `定义=${/function scrollViewCss\(prefix\)/.test(yzWxssSrc)} 导出=${yzWxssSrc.indexOf('scrollViewCss: scrollViewCss') >= 0} ` +
      `runtimeCss 复用=${/scrollViewCss\(prefix\),/.test(yzWxssSrc)} 规则份数=${yzScrollDefCount} ` +
      `pv-render 自写=${/::-webkit-scrollbar/.test(yzPv)} 复用前缀=${/MpWxss\.scrollViewCss\('\.phone-screen'\)/.test(yzPv)}`);

    /* (16) 装修台必须**先加载** mp-wxss.js（pv-render 注入时要取它），
     *      且手机壳的实际类名要与注入前缀 `.phone-screen` 对得上。
     *      改名或漏加载都**不会报错** —— 只剩 console 里一句 warn，预览又悄悄窄 8px。 */
    const yzAdHtml = readFileSync(join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');
    const yzAdLoadOk = yzAdHtml.indexOf('/shared/mp-wxss.js') >= 0 &&
      yzAdHtml.indexOf('/shared/mp-wxss.js') < yzAdHtml.indexOf('/shared/pv-render.js');
    const yzShellOk = /class="[^"]*phone-screen[^"]*"[^>]*id="preview"/.test(yzAdHtml);
    assert('品牌分类：装修台先加载 mp-wxss.js 且手机壳类名与注入前缀一致（改名/漏加载都只会静默窄 8px）',
      yzAdLoadOk && yzShellOk,
      `加载顺序=${yzAdLoadOk}（mp-wxss 在 pv-render 之前）手机壳 .phone-screen + #preview=${yzShellOk}`);

  }

  /* ---------------------------------------------------------------------
   * 混合排列（对标有赞店铺侧三方扩展「混合排列A」extension-masswx-hpitemsa）
   *
   * 为什么单独锁一组：这个组件是**用真实浏览器在真移动视口下逐项量出来的**
   * （2026-10-12，375 宽；对账脚本 `.tooling/_yz2-compare.mjs`，并排图 `.tooling/_cmp/yz2-side.png`）。
   * 它的取值里有 4.5px / 7.5px 这种半像素、有 133.33% 这种「百分比撑高」、
   * 还有「同一排内依次延迟 0.16s」这种算法 —— 任何一处被顺手改掉，
   * 肉眼看到的只是「卡片好像高了一点」，但再也对不回有赞。所以逐条锁死。
   * ------------------------------------------------------------------- */
  {
    const mgSchema = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');
    const mgJs = readFileSync(join(MP_ROOT, 'utils', 'blocks.js'), 'utf8');
    const mgWxml = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
    const mgCss = readFileSync(join(MP_ROOT, 'pages', 'index', 'index.wxss'), 'utf8');
    const mgPv = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');
    /* 源码文本断言必须先剥注释：这一组的注释里为了讲清「为什么不能写 margin-top」，正文里就有 margin-top */
    const mgStrip = (s) => s
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ');
    const mgJsC = mgStrip(mgJs);
    const mgWxmlC = mgStrip(mgWxml.replace(/<!--[\s\S]*?-->/g, ' '));
    const mgCssC = mgStrip(mgCss);
    const mgPvC = mgStrip(mgPv);
    /* 只取 pvBlock 里 mixed_grid 的那一段，避免别的区块的同名写法误判 */
    const mgPvSeg = (/kind === 'mixed_grid'\)\s*\{([\s\S]*?)\n    \} else if \(kind === 'buy_bar'\)/.exec(mgPvC) || [])[1] || '';
    const mgJsSeg = (/kind === 'mixed_grid'\)\s*\{([\s\S]*?)\n  \} else if \(kind === 'buy_bar'\)/.exec(mgJsC) || [])[1] || '';
    const mgWxmlSeg = (/block\.type === 'mixed_grid'([\s\S]*?)\n  <\/view>/ .exec(mgWxmlC) || [])[1] || '';

    /* (1) 半像素值必须原样保留：4.5px / 7.5px 是有赞面板的原值，
     *     ×2 转 rpx 后正好是 9rpx / 15rpx（无损）。四舍五入到整数就不是这个组件了。 */
    const mgHalfOk = /k:\s*'gap'[^}]*def:\s*4\.5/.test(mgSchema) &&
      /k:\s*'paddingX'[^}]*def:\s*7\.5/.test(mgSchema) &&
      /o\.gapRpx = px2rpx\(mgNum\(o\.gap, 4\.5\)\)/.test(mgJsC) &&
      /o\.padXRpx = px2rpx\(mgNum\(o\.paddingX, 7\.5\)\)/.test(mgJsC) &&
      /pvNum\(b\.gap, 4\.5\)/.test(mgPvSeg) &&
      /pvNum\(b\.paddingX, 7\.5\)/.test(mgPvSeg);
    assert('混合排列：半像素值 4.5px / 7.5px 三处原样保留（转 rpx 后是 9 / 15，取整不会丢精度）',
      mgHalfOk,
      `schema 默认值=${/k:\s*'gap'[^}]*def:\s*4\.5/.test(mgSchema) && /k:\s*'paddingX'[^}]*def:\s*7\.5/.test(mgSchema)} ` +
      `真机 normalize=${/o\.gapRpx = px2rpx\(mgNum\(o\.gap, 4\.5\)\)/.test(mgJsC)} 预览=${/pvNum\(b\.gap, 4\.5\)/.test(mgPvSeg)}`);

    /* (2) 图片容器用 padding-top 撑比例：3:4 → 133.33%（不是 1333.3、更不是 1.33）。
     *     写成 1.33% 的卡片会被压成一条线，而且只有真浏览器才看得出来（jsdom 不做布局）。 */
    const mgRatioOk = /o\.padTopPct = Math\.round\(10000 \/ mgNum\(o\.imgRatio, 0\.75\)\) \/ 100/.test(mgJsC) &&
      /mgPadTop = Math\.round\(10000 \/ pvNum\(b\.imgRatio, 0\.75\)\) \/ 100/.test(mgPvSeg) &&
      /padding-top: \{\{block\.padTopPct\}\}%/.test(mgWxmlC) &&
      /padding-top:' \+ mgPadTop \+ '%/.test(mgPvSeg);
    assert('混合排列：图片比例算法四处同一份（3:4 → 133.33%，真机/预览/模板都对得上）',
      mgRatioOk,
      `真机=${/o\.padTopPct = Math\.round\(10000 \/ mgNum\(o\.imgRatio, 0\.75\)\) \/ 100/.test(mgJsC)} ` +
      `预览=${/mgPadTop = Math\.round\(10000 \/ pvNum\(b\.imgRatio, 0\.75\)\) \/ 100/.test(mgPvSeg)} ` +
      `wxml=${/padding-top: \{\{block\.padTopPct\}\}%/.test(mgWxmlC)}`);

    /* (3) 「首行 2 张，之后每行 3 张」的列数映射必须真机 / 预览同口径，
     *     且**行由 flex-wrap 自然形成**（模板里不许再出现「行」这一层）。 */
    const mgLayoutOk = /layout === '1-3' \? \(i === 0 \? 1 : 3\) : \(i < 2 \? 2 : 3\)/.test(mgJsC) &&
      /mgLayout === '1-3' \? \(i === 0 \? 1 : 3\) : \(i < 2 \? 2 : 3\)/.test(mgPvSeg) &&
      /flex-wrap: wrap/.test(mgCssC) &&
      /cellW: Math\.floor\(100 \/ c \* 100\) \/ 100/.test(mgJsC);
    assert('混合排列：布局「首行2张」的列数映射真机/预览同口径，行由 flex-wrap 自然形成',
      mgLayoutOk,
      `真机映射=${/\(i < 2 \? 2 : 3\)/.test(mgJsC)} 预览映射=${/\(i < 2 \? 2 : 3\)/.test(mgPvSeg)} flex-wrap=${/flex-wrap: wrap/.test(mgCssC)}`);

    /* (4) ⚠️ 标题上间距**必须用 padding-top，不许用 margin-top**。
     *
     * 有赞那边标题块的父层是 flex 容器，margin-top 45px 老老实实留在内部（模块高 747.9）；
     * 我们是普通 block，`.mg-head` 的 margin-top 会**穿透父元素**（外边距折叠）——
     * 模块顶部灰底少 45px、整块内容上移，并排量出来 Δy 就是 45（已实测过，见 `.tooling/_cmp/yz2-side.png` 的上一版）。
     * 正反两面都查：模板与预览都不许再出现 margin-top，且必须出现 padding-top。 */
    const mgHeadMt = /margin-top: \{\{block\.titleGapTopRpx\}\}/.test(mgWxmlC) ||
      /mgPadTop\b[\s\S]{0,200}?margin-top:'.*?titleGapTop/.test(mgPvSeg) ||
      /margin-top:' \+ pvNum\(b\.titleGapTop/.test(mgPvSeg);
    const mgHeadPt = /padding-top: \{\{block\.titleGapTopRpx\}\}/.test(mgWxmlC) &&
      /padding-top:' \+ pvNum\(b\.titleGapTop/.test(mgPvSeg);
    assert('混合排列：标题上间距用 padding-top（margin-top 会被外边距折叠穿透父元素，模块顶部灰底少 45px）',
      mgHeadPt && !mgHeadMt,
      `模板/预览都用 padding-top=${mgHeadPt} ｜ 仍有 margin-top=${mgHeadMt}`);

    /* (5) 卡片底色的 rgba 口径两处同一份：`Math.round(alpha) / 100`。
     *     写成 0.33 还是 0.3 肉眼可辨（有赞原值就是 rgba(248,248,248,0.33)），
     *     两处不一致就会出现「装修台浅灰底、真机纯白底」。 */
    const mgAlphaOk = /function hexToRgba\(hex, alphaPct, defHex\)/.test(mgJsC) &&
      /Math\.round\(a\) \/ 100/.test(mgJsC) &&
      /function pvRgba\(hex, alphaPct, defHex\)/.test(mgPvC) &&
      /Math\.round\(Math\.min\(100, Math\.max\(0, n\)\)\) \/ 100/.test(mgPvC) &&
      /rgba\(/.test(mgJsC);
    assert('混合排列：卡片底色的 rgba 合成真机/预览同一口径（Math.round(alpha)/100，不是 0.3）',
      mgAlphaOk,
      `真机 hexToRgba=${/function hexToRgba\(hex, alphaPct, defHex\)/.test(mgJsC)} 预览 pvRgba=${/function pvRgba\(hex, alphaPct, defHex\)/.test(mgPvC)}`);

    /* (6) 入场动画：真机有 `@keyframes mg-in` 且延迟按「排内序号 × 0.16s」算好传进模板；
     *     **预览层不做动画**（与其它区块一致，否则装修台里一堆卡片一直在动）。 */
    const mgAnimOk = /@keyframes mg-in/.test(mgCssC) &&
      /animation: mg-in \.8s ease-out both/.test(mgCssC) &&
      /delay: Math\.round\(k \* 16\) \/ 100/.test(mgJsC) &&
      /animation-delay: ' \+ it\.delay/.test(mgWxmlC) &&
      !/mg-in/.test(mgPvSeg) && !/animation:/.test(mgPvSeg);
    assert('混合排列：入场动画只在真机（排内延迟 0/0.16/0.32s），预览层不做动画',
      mgAnimOk,
      `keyframes=${/@keyframes mg-in/.test(mgCssC)} 延迟算法=${/delay: Math\.round\(k \* 16\) \/ 100/.test(mgJsC)} 预览无动画=${!/animation:/.test(mgPvSeg)}`);

    /* (7) `.mg-body` 必须显式声明样式（哑 class 会让「名称的位置」靠外边距折叠撑着，
     *     而且 check-all 的 class 覆盖率断言会直接红）。
     *     用 flex 列而不是 block 是为了与有赞 `.item_info`（display:flex）同口径 ——
     *     block 容器里 `.mg-t` 的 margin-top 会折叠穿透，`.mg-body` 的盒子从 327.5/26 变成 332.5/21。 */
    const mgBodyOk = /\.mg-body\s*\{[\s\S]*?display:\s*flex/.test(mgCssC) &&
      /display:flex;flex-direction:column;margin:0 ' \+ mgInner/.test(mgPvSeg);
    assert('混合排列：.mg-body 显式 flex 列（与有赞 .item_info 同口径，也避免哑 class）',
      mgBodyOk,
      `真机 .mg-body flex=${/\.mg-body\s*\{[\s\S]*?display:\s*flex/.test(mgCssC)} 预览同口径=${/display:flex;flex-direction:column;margin:0 ' \+ mgInner/.test(mgPvSeg)}`);

    /* (8) 组件库清单里的「混合排列A」必须指向真实区块类型（防「假装可用」）。
     *     ⚠️ 高级组件这一栏的数量断言用 `>=`：装没装三方插件是**店铺侧**的事，
     *        写死 `=== 3` 会在别的店铺数据上假红。 */
    assert('混合排列：组件库「混合排列A」标记已接入且 kind 指向真实区块类型',
      /n:\s*'混合排列A'[^}]*ok:\s*1[^}]*kind:\s*'mixed_grid'/.test(mgSchema) &&
      /n:\s*'混合排列A'[^}]*type:\s*'extension-masswx-hpitemsa'/.test(mgSchema) &&
      schemaMod.HOME_BLOCK_KINDS.mixed_grid !== undefined,
      `清单项=${/n:\s*'混合排列A'/.test(mgSchema)} 有区块类型=${schemaMod.HOME_BLOCK_KINDS.mixed_grid !== undefined}`);
  }

  /* ---------------------------------------------------------------------
   * 资讯栏目页复刻（关于莱克 / 新闻大事 / 创业故事 / 我们品牌 / 用户分享 /
   * 业务模式 / 售后服务 / 加入我们，2026-10-12）
   *
   * 这一组锁的是「量出来才知道」的几处口径 —— 它们都**不是**照着截图能看出来的：
   *   1. 辅助分割的「高度」不决定占位：有赞实线模式渲染的是 hr{margin:10px 0}（线本身 1px），
   *      所以补了 gapY（上下留白）。少了它，6 个页面的整块内容都会往上偏 10px。
   *   2. 选项卡分类的页签条与首行卡片之间固定 10px（`.van-tab__pane-wrapper` 内层写死），
   *      与「模块内边距 / 图文内间距」都无关，不做成字段、直接写死 20rpx。
   *   3. 电梯导航「全店风格」是纯文字均分的页签条（有赞默认形态），不是四选一的标签块。
   *   4. 「标题文本」的加粗是 font-weight: bold = 700，真机与预览必须同口径。
   * ------------------------------------------------------------------- */
  {
    const nzSchema = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');
    const nzJs = readFileSync(join(MP_ROOT, 'utils', 'blocks.js'), 'utf8');
    const nzWxml = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
    const nzCss = readFileSync(join(MP_ROOT, 'pages', 'index', 'index.wxss'), 'utf8');
    const nzPv = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');

    const nzGapYOk = /k:\s*'gapY'[^}]*def:\s*0/.test(nzSchema) &&
      /o\.gapYRpx = px2rpx\(o\.gapY\)/.test(nzJs) &&
      /block\.gapYRpx\}\}rpx 0;/.test(nzWxml) &&
      /margin:' \+ lgapY \+ 'px 0/.test(nzPv);
    assert('资讯页：辅助分割的「上下留白」四处齐备（有赞实线是 hr{margin:10px 0}，「高度」不决定占位）',
      nzGapYOk,
      `字段=${/k:\s*'gapY'/.test(nzSchema)} 派生=${/o\.gapYRpx/.test(nzJs)} 真机=${/block\.gapYRpx/.test(nzWxml)} 预览=${/lgapY/.test(nzPv)}`);

    /* 三条判定各自成变量，**诊断行直接复用**（不再各写一条更松的正则）。
       曾经踩过：判定用的正则写成 `\+ ';padding-top:10px'`（要求引号紧跟 10px），
       而源码是 `+ ';padding-top:10px">'` → 断言恒红；诊断行却用了更松的 `/padding-top:10px/`，
       输出「预览=true」，读起来像代码坏了、其实是断言写错。**假红 + 骗人的诊断比不检查更糟**。 */
    const nzPaneJs = /o\.paneTopRpx = px2rpx\(10\)/.test(nzJs);
    const nzPaneWxml = /class="tc-body" style="background: \{\{block\.innerBgCss\}\}; padding-top: \{\{block\.paneTopRpx\}\}rpx;"/.test(nzWxml);
    const nzPanePv = /pvColor\(b\.innerBg, 'transparent'\) \+ ';padding-top:10px">'/.test(nzPv);
    assert('资讯页：选项卡分类的「页签条→首行卡片」固定 10px 三处一致（有赞写在 pane-wrapper 内层）',
      nzPaneJs && nzPaneWxml && nzPanePv,
      `派生=${nzPaneJs} 真机=${nzPaneWxml} 预览=${nzPanePv}`);

    /* 选项卡分类的网格层**不得** overflow:hidden（2026-10-12 逐像素对账时纠正）。
       有赞同层 `.con`（x=10 w=355）是 `overflow: visible`；我们的 `.tc-grid` 盒子完全相同，
       却曾写着 hidden —— 裁剪盒**正好等于卡片盒**，`.tc-card.shadow` 的 `0 4rpx 8rpx`
       被齐着卡片边裁掉，**卡片投影一点都画不出来**（computed style 里 box-shadow 明明一致、
       像素上差 6 级：有赞 241,242,244 / 我们 247,248,250）。
       这类「样式对得上、像素对不上」的偏差只有逐像素取样能发现 → 必须落成断言防回归。
       注：`.tc-card` 自己**要** overflow:hidden（图片圆角靠它裁），别把这条读成通用规则。
       另外：**必须先剥掉 CSS 注释再匹配**（与「HTML 断言要另剥注释」同理）——
       这段规则的注释里就写着「不能 overflow: hidden」几个字，不剥注释会把自己注释里的字
       当成声明读出来，断言恒红。 */
    const nzCssNoCmt = nzCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const nzGridRule = (/\.tc-grid \{([\s\S]*?)\}/.exec(nzCssNoCmt) || [null, ''])[1];
    const nzGridNoClip = !/overflow:\s*hidden/.test(nzGridRule);
    const nzGridBox = /box-sizing:\s*border-box/.test(nzGridRule);
    assert('资讯页：选项卡分类的网格层不得 overflow:hidden（裁剪盒==卡片盒会把卡片投影齐边裁掉）',
      nzGridNoClip && nzGridBox,
      `overflow=${(/overflow:\s*([a-z]+)/.exec(nzGridRule) || [null, '（无，即 visible）'])[1]} box-sizing=${nzGridBox}`);

    const nzElevOk = /o\.plain = o\.styleType !== 'custom'/.test(nzJs) &&
      /o\.plainHRpx = px2rpx\(44\)/.test(nzJs) &&
      /block\.plain && !block\.dropdown/.test(nzWxml) &&
      /class="ce-plainitem"/.test(nzWxml) &&
      /\.ce-plain \{[\s\S]*?align-items: stretch;/.test(nzCss) &&
      /\.ce-plainitem \{[\s\S]*?flex: 1 1 0%/.test(nzCss) &&
      /* 项必须**整条高**（stretch + 项内居中）：写成一行高的话可点区域只有一行，
         真机上点上下边缘点不中 —— 外观一样，手感完全不同，只能靠断言锁。 */
      /\.ce-plainitem \{[\s\S]*?align-items: center;/.test(nzCss) &&
      /\.ce-plainitem \{[\s\S]*?line-height: 20px;/.test(nzCss) &&
      /var ePlain = b\.styleType !== 'custom'/.test(nzPv) &&
      /align-items:stretch;height:44px/.test(nzPv);
    assert('资讯页：电梯导航「全店风格」= 纯文字均分页签条（真机 ce-plain / 预览 ePlain 同口径）',
      nzElevOk,
      `派生=${/o\.plain =/.test(nzJs)} 真机=${/ce-plainitem/.test(nzWxml)} 预览=${/ePlain/.test(nzPv)} 样式=${/\.ce-plainitem/.test(nzCss)} 整条高=${/align-items: stretch/.test(nzCss)}`);

    /* 选项卡标题行高必须是字号的 1.5 倍（有赞 .item_title 实测：14px→21、11px→16.5）——
       不写就按 normal 算，两行标题矮 3~4px，「新闻大事」整页因此矮 30px。 */
    const nzTcLh = /\.tc-title \{[\s\S]*?line-height: 1\.5;/.test(nzCss) &&
      /'line-height:1\.5;' \+/.test(nzPv);
    assert('资讯页：选项卡「图文标题」行高比率 1.5 真机/预览同口径（有赞 .item_title 实测）',
      nzTcLh,
      `真机=${/\.tc-title \{[\s\S]*?line-height: 1\.5;/.test(nzCss)} 预览=${/'line-height:1\.5;'/.test(nzPv)}`);

    const nzBoldOk = /\.ct-main\.bold \{ font-weight: 700; \}/.test(nzCss) &&
      /b\.bold \? 700 : 400/.test(nzPv);
    assert('资讯页：标题文本加粗真机/预览同为 700（有赞写的就是 font-weight: bold）',
      nzBoldOk,
      `真机=${/\.ct-main\.bold \{ font-weight: 700/.test(nzCss)} 预览=${/b\.bold \? 700 : 400/.test(nzPv)}`);
  }

  /* -------------------------------------------------------------------
   * 页面底色：真机 WXML / schema 默认值 / 预览 pv-render **三处同口径**
   * （2026-10-12 复刻资讯 8 页时补）
   *
   * 起因：真机的两个页面根节点都是
   *   `style="background: {{meta.bg || '#F5F6F8'}};"`
   * 而装修台预览原先**不画这一层**，靠手机壳自己的 `.phone-screen { background: #fff }` 顶着 ——
   * 两边根本不是同一个颜色：运营在装修台照着白底调、真机上却是灰的（复刻 03「创业故事」时
   * 正好反过来：有赞白、我们灰）。修法是在 `pv-render.js` 里**把底色画出来**（`pvPageBg`）。
   *
   * 任何一处改了默认色、或预览又漏画这层，就会复现「后台一个样、真机另一个样」——
   * 而这种偏差在装修台里看起来「一切正常」，只有把两边截图叠起来才发现。
   * ------------------------------------------------------------------- */
  {
    const bgWxmlHome = readFileSync(join(MP_ROOT, 'pages', 'index', 'index.wxml'), 'utf8');
    const bgWxmlCustom = readFileSync(join(MP_ROOT, 'pages', 'custom', 'index.wxml'), 'utf8');
    const bgSchema = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');
    const bgPv = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');

    const reWxmlBg = /background:\s*\{\{meta\.bg \|\| '([#0-9A-Fa-f]{3,8})'\}\}/;
    const wHome = (reWxmlBg.exec(bgWxmlHome) || [null, ''])[1];
    const wCustom = (reWxmlBg.exec(bgWxmlCustom) || [null, ''])[1];
    const wSchema = (/CUSTOM_META_DEFAULT = \{[^}]*?\bbg:\s*'([#0-9A-Fa-f]{3,8})'/.exec(bgSchema) || [null, ''])[1];
    const wDef = (/var PAGE_BG_DEF = '([#0-9A-Fa-f]{3,8})'/.exec(bgPv) || [null, ''])[1];
    /* 预览必须**真的把底色画出来**，且**首页与自定义页都走同一条**：
       `var bg = (d && d.meta && d.meta.bg) || PAGE_BG_DEF` + `pvPageBg(d, …)`。 */
    const wDrawBg = /var bg = \(d && d\.meta && d\.meta\.bg\) \|\| PAGE_BG_DEF/.test(bgPv);
    const wHomeUses = /function pvHome\(d\) \{[\s\S]*?return pvPageBg\(d, h\);[\s\S]*?\n  \}/.test(bgPv);
    const wCustomUses = /function pvCustom\(d\) \{[\s\S]*?return pvPageBg\(d, inner\);[\s\S]*?\n  \}/.test(bgPv);
    assert('页面底色：真机两处 WXML / schema 默认值 / 预览 pv-render 四处同口径（且首页与自定义页都画出来）',
      !!wHome && wHome === wCustom && wHome === wSchema && wHome === wDef && wDrawBg && wHomeUses && wCustomUses,
      `首页WXML=${wHome || '（没解析到）'} 自定义WXML=${wCustom || '（没解析到）'} schema=${wSchema || '（没解析到）'} ` +
      `预览默认值=${wDef || '（没解析到）'} 画底色=${wDrawBg} 首页用=${wHomeUses} 自定义页用=${wCustomUses}`);
  }

  /* -------------------------------------------------------------------
   * 富文本区块：预览链路必须真渲染 + 三端同口径（2026-10-12 复刻资讯 8 页时补）
   *
   * 起因是一个「查了三轮才发现」的 bug：WXML→HTML 编译器把 `<rich-text nodes="{{…}}">`
   * 当普通标签翻成 `<div>`，`nodes` 落进 attribute，于是**富文本块在 /preview 里恒为 0 高**
   * （装修台看得到内容、预览页一片空白），页面整体比有赞矮 75px。
   * 真机是好的 —— 只有预览在说谎，这类 bug 不锁就会再犯。
   * ------------------------------------------------------------------- */
  {
    const rxWxml = readFileSync(join(__dirname, '..', 'public', 'shared', 'mp-wxml.js'), 'utf8');
    const rxPv = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');
    const rxJs = readFileSync(join(MP_ROOT, 'utils', 'blocks.js'), 'utf8');
    const rxTpl = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
    const rxCss = readFileSync(join(MP_ROOT, 'pages', 'index', 'index.wxss'), 'utf8');
    const rxAdminCss = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.css'), 'utf8');
    const rxReset = readFileSync(join(MP_ROOT, 'styles', 'reset.wxss'), 'utf8');

    assert('富文本：WXML→HTML 编译器必须单独特判 rich-text 并把 nodes 渲染成子节点',
      /tag === 'rich-text'/.test(rxWxml) && /attrValue\(attrs\['nodes'\]/.test(rxWxml) &&
        /Array\.isArray\(rNodes\)/.test(rxWxml),
      `特判=${/tag === 'rich-text'/.test(rxWxml)} 取 nodes=${/attrs\['nodes'\]/.test(rxWxml)} 数组分支=${/Array\.isArray\(rNodes\)/.test(rxWxml)}`);

    /* 清洗规则三处字面一致 —— 预览页与装修台同源，富文本又是运营可自由填的 HTML，差一条就是一条 XSS 通道 */
    const RICH_RULES = ['script|style|iframe|object|embed|link|meta', '\\son\\w+\\s*=', 'javascript:'];
    const rxClean = (src) => RICH_RULES.every((r) => src.indexOf(r) >= 0);
    assert('富文本：清洗规则真机/预览/装修台三处一致（含 on* 事件与 javascript: 两条）',
      rxClean(rxJs) && rxClean(rxPv) && rxClean(rxWxml),
      `真机=${rxClean(rxJs)} 装修台=${rxClean(rxPv)} 预览=${rxClean(rxWxml)}`);

    /* 模块口径：上内边距 10px 是关键 —— 缺了它首个 <p> 的 margin-top 会穿透容器，整块少 10px（整页矮 5px）；
       行高必须是**比率 1.5**（有赞口径）：写成固定长度就不会随字号缩放，混排大小字时整块偏矮。 */
    const rxPadOk = /padding: 20rpx \{\{block\.marginRpx\}\}rpx 0;/.test(rxTpl) &&
      /padding:10px ' \+ richPad \+ 'px 0;/.test(rxPv) &&
      /\.c-rich \{[\s\S]*?font-size: 32rpx;[\s\S]*?line-height: 1\.5;/.test(rxCss) &&
      /\.c-rich \{[\s\S]*?overflow: hidden;/.test(rxCss) &&
      /\.pv-rich \{ font-size: 16px; line-height: 1\.5;/.test(rxAdminCss) &&
      !/\.cr-body \{[\s\S]{0,200}?font-size: var\(--font-base\)/.test(rxCss);
    assert('富文本：上内边距 10px / 字号 16px / 行高比率 1.5 四处一致（有赞 .cap-richtext 实测）',
      rxPadOk,
      `真机模板=${/padding: 20rpx/.test(rxTpl)} 预览=${/padding:10px /.test(rxPv)} 真机样式=${/line-height: 1\.5;/.test(rxCss)} 装修台=${/\.pv-rich \{ font-size: 16px; line-height: 1\.5;/.test(rxAdminCss)} 内容不越权=${!/\.cr-body \{[\s\S]{0,200}?var\(--font-base\)/.test(rxCss)}`);

    /* <p> 默认 margin-top 是 1em；有赞容器带 p{margin:0}，编辑器又常常只写 margin-bottom，
       于是「只写一半」的段落会多出 16px 上外边距。这条重置三处必须都有。 */
    const rxResetOk = /function richResetMarginTop/.test(rxJs) && /richResetMarginTop\(/.test(rxJs) &&
      /function pvRichMarginTop/.test(rxPv) && /pvRichMarginTop\(/.test(rxPv) &&
      /function richMarginTop/.test(rxWxml) && /richMarginTop\(/.test(rxWxml);
    assert('富文本：块级标签 margin-top 重置三处齐备（有赞容器有 p{margin:0}，编辑器常只写 margin-bottom）',
      rxResetOk,
      `真机=${/richResetMarginTop\(/.test(rxJs)} 装修台=${/pvRichMarginTop\(/.test(rxPv)} 预览=${/richMarginTop\(/.test(rxWxml)}`);

    /* 真机富文本里的图片：必须补 BASE_URL + 尺寸约束。
     *
     * ⚠️ 这条**真的执行一遍 sanitizeRich**，而不是拿正则查源码 —— 因为这个 bug 有两个
     *   「源码正则永远查不出来」的特征：
     *     ① 病灶在**字符串内容**里（`<img src="/uploads/…">` 少了前缀），字符层面完全正常；
     *     ② 它**在预览链路里永远显示正常** —— 网页里 `/uploads/x` 会基于 origin 自然解析，
     *        只有真机 `<rich-text>` 把 `/` 开头的路径当**包内路径**（不发请求、直接破图）。
     *   2026-10-16 用户报「新闻大事/用户分享的笔记点进去图片全挂」：
     *   实测 34 篇 / **421 张图 100% 是裸相对路径**，而后台预览与装修台里一切正常
     *   —— 又一个「验证的层不对」，判据只能落在**渲染产物**上。
     *   尺寸那半条同理：`<img>` 只有 data-origin-width/height、没有 style，
     *   装修台靠 `.pv-rich img{max-width:100%;display:block}` 兜住，而 rich-text 不吃外部样式 → 真机溢出。 */
    const richFixed = requireFromHere(join(MP_ROOT, 'utils', 'blocks.js'))
      .sanitizeRich('<img src="/uploads/_probe_.png">');
    assert('富文本：真机渲染产物里图片须补 BASE_URL 且带尺寸约束（预览链路查不出，须真跑一遍）',
      !/<img[^>]*\ssrc\s*=\s*["']?\/uploads\//.test(richFixed) &&
        /src="[^"]*\/uploads\/_probe_\.png"/.test(richFixed) &&
        /max-width\s*:\s*100%/i.test(richFixed) &&
        /display\s*:\s*block/i.test(richFixed),
      `产物=${String(richFixed).slice(0, 150)}`);

    /* 字体栈：line-height:normal 按字体本身的行高算，桌面 Chrome 上 Arial 与 Segoe UI 差 0.17em（24px 下 4px） */
    assert('字体：页面字体栈含 Helvetica/Arial 档（对齐有赞 H5，消除桌面预览 4px 假差异）',
      /'Helvetica Neue', Helvetica/.test(rxReset) && /Arial/.test(rxReset),
      `reset.wxss=${/'Helvetica Neue', Helvetica/.test(rxReset)}`);

    /* -------------------------------------------------------------------
     * 图片兜底底色：真机裸 `image` 铺底色 vs 预览 `img{background:transparent}`
     *
     * 2026-10-13 用户报「导航的图标后面是灰色的背景」→ 逐像素量到 5 个图标后面
     * 各一个 22×22 的 #F2F3F5 方块（(242,243,245) = --color-bg-muted）。
     * 根因是 reset.wxss 里那条**裸标签选择器** `image { background-color: var(--color-bg-muted) }`
     * —— 它给全站每个 <image> 都铺了不透明底色，**带透明通道的 PNG**（导航图标 / empty-state
     * 插图 / 型号图）从透明区把它透出来。不透明照片看不出，所以这条规则长期没被发现。
     * 而预览侧 runtimeCss 把 img 底色改写成 transparent → 真机与预览不一致，
     * 「装修台预览好看、开发者工具里全是灰块」，我方的浏览器链路验证永远绿。
     *
     * 口径：裸 image 只保留 display:block，不铺底色；兜底底色给确定的实心图盒（容器自己铺，
     * `.bc-pic.square` 那条断言另在别处）。
     * ⚠️ 断言前必须剥 CSS 注释 —— 上面 reset.wxss 的新注释里正写着「曾经铺过 background-color」，
     *    不剥就是**恒红**，而且会带着一句骗人的诊断（本项目踩过这个坑，见 PITFALLS 假红族）。
     * ------------------------------------------------------------------- */
    const rxWxss = readFileSync(join(__dirname, '..', 'public', 'shared', 'mp-wxss.js'), 'utf8');
    const noC = rxReset.replace(/\/\*[\s\S]*?\*\//g, '');
    const wxssRules = (() => {
      const out = [];
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m;
      while ((m = re.exec(noC))) {
        out.push({ sel: m[1].trim().split('\n').pop().trim(), body: m[2] });
      }
      return out;
    })();
    const bareImg = wxssRules.filter((r) => r.sel === 'image');
    const bareImgRule = bareImg.length ? bareImg[bareImg.length - 1].body : '';
    const pvImgClear = /img\{display:block;background:transparent\}/.test(rxWxss);
    assert('图片底色：真机裸 image 不铺兜底底色，与预览侧 img{background:transparent} 口径一致',
      bareImg.length > 0 && !/background/.test(bareImgRule) && pvImgClear,
      `真机裸 image 规则=${JSON.stringify(bareImgRule.replace(/\s+/g, ' ').trim())} ｜ 预览 runtimeCss 透明=${pvImgClear}`);

    /* 导航图标自己也不许带底色 —— 它是 66×66 的**透明背景** PNG，铺底就重现灰块 */
    const navCss = readFileSync(join(MP_ROOT, 'custom-tab-bar', 'index.wxss'), 'utf8');
    const navNoC = navCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const navIconBody = (() => {
      const m = /\.tb-icon\s*\{([^}]*)\}/.exec(navNoC);
      return m ? m[1] : '';
    })();
    assert('图片底色：底部导航图标不铺底色（内置图标是透明背景 PNG）',
      navIconBody !== '' && !/background/.test(navIconBody),
      `.tb-icon{}=${JSON.stringify(navIconBody.replace(/\s+/g, ' ').trim())}`);
  }

  /* -------------------------------------------------------------------
   * 页面「风格选择：标准 / 沉浸式」（2026-10-16 复刻有赞首页时新增）
   *
   * 需求原话：「首页添加功能可以选择沉浸式全屏显示，没有顶部的标题栏」。
   * 微信没有「按数据决定这一页要不要标题栏」的接口 —— 只能页面 .json 写死
   * `navigationStyle: custom`，再自绘一条标题栏回来。于是这条链路天然**跨五处**，
   * 任何一处漏掉都会变成「运营能选、真机不生效」（比没有这个选项更糟）：
   *
   *   ① 后端字段表 schema.js         —— 有没有这个可选项、默认值是什么
   *   ② 页面设置默认值四处           —— PAGE_META_DEFS / CUSTOM_META_DEFAULT / customPages 的 BLANK_META
   *   ③ 真机 .json + nav-bar 组件    —— navigationStyle 与自绘标题栏
   *   ④ 真机页面 JS                  —— 上划浮现（navState + onPageScroll）
   *   ⑤ 预览两处（/preview 与装修台）—— 手机壳必须跟着变形态，否则运营选了没反馈
   *
   * 另外锁两条**踩过的坑**：
   *   · 页面 .json **不能带注释**：mp-runtime 用 JSON.parse 读它，带注释会静默退化成 {}，
   *     结果是「预览里标题栏没了、组件也没了」，而 devtools 照样能跑（两边行为不一致）。
   *   · 页面 WXML **不能给 .page 补 padding-top**：标题栏自己占位（标准模式 sticky 参与文档流），
   *     再补一次就把标题栏高度算了两遍 —— 实测 pageBox.top 198 而首个区块在 262。
   * ------------------------------------------------------------------- */
  {
    const styleSchema = readFileSync(join(__dirname, '..', 'decorate', 'schema.js'), 'utf8');
    const styleCps = readFileSync(join(__dirname, '..', 'decorate', 'customPages.js'), 'utf8');

    /* ① 字段：键名 / 默认值 / 两个选项 / 只挂首页与自定义页 */
    const stField = /const PAGE_META_STYLE_FIELD = \{[\s\S]*?\n\};/.exec(styleSchema);
    const stFieldSrc = stField ? stField[0] : '';
    const stOk = /\bk:\s*'style'/.test(stFieldSrc) &&
      /def:\s*'standard'/.test(stFieldSrc) &&
      /value:\s*'standard'/.test(stFieldSrc) && /value:\s*'immersive'/.test(stFieldSrc);
    const stFullOk = /PAGE_META_FIELDS_FULL = PAGE_META_FIELDS\.concat\(\[PAGE_META_STYLE_FIELD\]\)/.test(styleSchema);
    /* 首页与自定义页用 FULL；莱克 / 资讯 / 产品 / 我的四页只能挂基础两项 ——
       它们的小程序端没实现沉浸式，挂了就是「能选、点了不生效」。 */
    const stFullUses = (styleSchema.match(/fields:\s*PAGE_META_FIELDS_FULL/g) || []).length;
    const stBaseUses = (styleSchema.match(/fields:\s*PAGE_META_FIELDS\b(?!_)/g) || []).length;
    assert('风格选择：schema 字段齐备（style / 默认 standard / 标准+沉浸式两选项），且只挂首页与自定义页',
      stOk && stFullOk && stFullUses === 2 && stBaseUses === 4,
      `字段=${stOk} FULL=${stFullOk} FULL 用了 ${stFullUses} 处（应 2：首页 + CUSTOM_META_NODE）` +
      ` 基础用了 ${stBaseUses} 处（应 4：莱克/资讯/产品/我的）`);

    /* ② 默认值口径：四处必须逐字一致，否则「装修台显示标准、真机按沉浸式渲染」 */
    const defsBlock = /const PAGE_META_DEFS = \{[\s\S]*?\n\};/.exec(styleSchema);
    const defsSrc = defsBlock ? defsBlock[0] : '';
    const defsCount = (defsSrc.match(/style:\s*'standard'/g) || []).length;
    const customDefOk = /CUSTOM_META_DEFAULT = \{ desc: '', bg: '#F5F6F8', style: 'standard' \}/.test(styleSchema);
    const blankOk = /BLANK_META = \{ desc: '', bg: '#F5F6F8', style: 'standard' \}/.test(styleCps);
    assert('风格选择：默认值四处逐字一致（PAGE_META_DEFS 五页 / CUSTOM_META_DEFAULT / BLANK_META）',
      defsCount === 5 && customDefOk && blankOk,
      `PAGE_META_DEFS 命中 ${defsCount}/5 · CUSTOM_META_DEFAULT=${customDefOk} · BLANK_META=${blankOk}`);

    /* ③ 真机 .json：两页都要 navigationStyle: custom + 注册 nav-bar，且必须是**纯 JSON** */
    const stJsonOf = (rel) => {
      const raw = readFileSync(join(MP_ROOT, rel), 'utf8');
      try { return { ok: true, j: JSON.parse(raw) }; } catch (e) { return { ok: false, err: e.message }; }
    };
    const jIndex = stJsonOf('pages/index/index.json');
    const jCustom = stJsonOf('pages/custom/index.json');
    const navRegOk = (r) => r.ok && r.j.navigationStyle === 'custom' &&
      !!(r.j.usingComponents && r.j.usingComponents['nav-bar']);
    assert('风格选择：首页与自定义页 .json 都写了 navigationStyle: custom 且注册了 nav-bar（且是纯 JSON，无注释）',
      navRegOk(jIndex) && navRegOk(jCustom),
      `首页=${jIndex.ok ? JSON.stringify(jIndex.j.navigationStyle) + '/' + !!(jIndex.j.usingComponents || {})['nav-bar'] : 'JSON 解析失败：' + jIndex.err}` +
      ` 自定义页=${jCustom.ok ? JSON.stringify(jCustom.j.navigationStyle) + '/' + !!(jCustom.j.usingComponents || {})['nav-bar'] : 'JSON 解析失败：' + jCustom.err}`);

    /* ④ 真机自绘标题栏：组件四件套齐备 + sticky/fixed 两种形态 + 尺寸实测（不许写死 64px） */
    const navFiles = ['js', 'json', 'wxml', 'wxss'].map((e) => join(MP_ROOT, 'components', 'nav-bar', 'nav-bar.' + e));
    const navAllExist = navFiles.every((f) => existsSync(f));
    const navWxss = navAllExist ? readFileSync(navFiles[3], 'utf8') : '';
    const navJs = navAllExist ? readFileSync(navFiles[0], 'utf8') : '';
    const navWxmlSrc = navAllExist ? readFileSync(navFiles[2], 'utf8') : '';
    const navbarUtil = readFileSync(join(MP_ROOT, 'utils', 'navbar.js'), 'utf8');
    const stSticky = /\.nb\s*\{[\s\S]*?position:\s*sticky;/.test(navWxss);
    const stFixed = /\.nb-immersive\s*\{[\s\S]*?position:\s*fixed;/.test(navWxss);
    const stMeasure = /getMenuButtonBoundingClientRect/.test(navbarUtil) && /statusBarHeight/.test(navbarUtil);
    /* class 属性里只许出现**类名字面量**：静态核对区分不出「类名」与「拿来比较的字面量」，
       写成 {{mode === 'immersive' ? …}} 会把 'immersive' 也当类名报未定义（见 nav-bar.wxml 注释）。 */
    const stNoCompareInClass = !/class="[^"]*\{\{[^}]*['"]immersive['"][^}]*\}\}[^"]*"/.test(navWxmlSrc) ||
      !/class="[^"]*'immersive'/.test(navWxmlSrc);
    assert('风格选择：nav-bar 组件四件套齐备，标准=sticky 占位 / 沉浸式=fixed 脱离文档流，尺寸按胶囊实测',
      navAllExist && stSticky && stFixed && stMeasure && stNoCompareInClass,
      `四件套=${navAllExist} sticky=${stSticky} fixed=${stFixed} 实测胶囊=${stMeasure} class 不含比较字面量=${stNoCompareInClass}`);

    /* ⑤ 真机页面：两页都要渲染 nav-bar、都要接上划浮现，且**都不许再补 padding-top** */
    const stPage = (rel) => {
      const w = readFileSync(join(MP_ROOT, rel.replace(/\.js$/, '.wxml')), 'utf8');
      const j = readFileSync(join(MP_ROOT, rel), 'utf8');
      return {
        renders: /<nav-bar[\s\S]*?\/>/.test(w),
        pads: /padding-top:\s*\{\{\s*nav/.test(w),
        scroll: /onPageScroll\s*\(/.test(j) && /isImmersive\(/.test(j) && /navState\(/.test(j)
      };
    };
    const pIndex = stPage('pages/index/index.js');
    const pCustom = stPage('pages/custom/index.js');
    assert('风格选择：首页与自定义页都渲染 nav-bar + 接上划浮现，且都没有给 .page 补 padding-top（标题栏自己占位，补了就重复算一条）',
      pIndex.renders && pCustom.renders && pIndex.scroll && pCustom.scroll && !pIndex.pads && !pCustom.pads,
      `首页 渲染=${pIndex.renders} 上划=${pIndex.scroll} 补padding=${pIndex.pads} · ` +
      `自定义页 渲染=${pCustom.renders} 上划=${pCustom.scroll} 补padding=${pCustom.pads}`);

    /* ⑥ 预览两处必须跟着变形态：/preview 的 chrome 层与装修台手机壳 ——
       否则运营在装修台选了沉浸式，预览里标题栏照旧压着内容，等于没反馈。 */
    const stRt = readFileSync(join(__dirname, '..', 'public', 'shared', 'mp-runtime.js'), 'utf8');
    const stPvJs = readFileSync(join(__dirname, '..', 'public', 'preview', 'preview.js'), 'utf8');
    const stPvCss = readFileSync(join(__dirname, '..', 'public', 'preview', 'preview.css'), 'utf8');
    const stAdJs = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');
    const stAdCss = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.css'), 'utf8');
    const stChrome = /CHROME_RENDERED = \{[^}]*'nav-bar':\s*true/.test(stRt);
    /*
     * 两个壳体都要呈现「没有标题栏、内容整屏铺满」，但**能表达的东西不同**：
     *
     *   · /preview：滚动容器就是 `.phone-screen` 自己（屏幕不动、内容在屏内滚）
     *               → 顶栏 `absolute` 钉在 `.phone` 顶部即可，屏幕不会跑；
     *                 再按 `scrollTop > nav.total` 切 `.nav-reveal`，**能**如实演出「上划浮现」。
     *   · 装修台  ：`.phone { overflow: hidden }`（裁圆角用）⇒ `sticky` 失效
     *               （实测滚 400px 后顶栏 top = -272，跟着手机滚出可视区），
     *               所以要钉住只能牺牲圆角 —— 不值得。装修台只呈现**初始态**。
     *
     * 这条断言因此锁的是「两处都做到无标题栏 + 整屏铺满」，并且
     * 装修台里**不许**留下 `nav-reveal` / `sticky` 那套做了一半的实现
     * （半成品比不做更糟：看着像生效了，其实那个状态在屏幕上看不到）。
     */
    const stPv = /function applyNavChrome/.test(stPvJs) && /ph-immersive/.test(stPvJs) &&
      /\.ph-immersive\s+\.phone-bar\s*\{[\s\S]*?position:\s*absolute/.test(stPvCss) &&
      /function syncNavReveal/.test(stPvJs);
    const stAd = /function applyNavStyle/.test(stAdJs) && /ph-immersive/.test(stAdJs) &&
      /\.ph-immersive\s+\.phone-bar\s*\{[\s\S]*?position:\s*absolute/.test(stAdCss) &&
      !/nav-reveal/.test(stAdCss) && !/nav-reveal/.test(stAdJs) &&
      !/addEventListener\('wheel'/.test(stAdJs) && !/bindNavReveal/.test(stAdJs);
    assert('风格选择：预览端两处同口径（都做到无标题栏+整屏铺满；nav-bar 交给 chrome 层不重复展开；「上划浮现」只在 /preview 如实演出，装修台不留在效的死代码）',
      stChrome && stPv && stAd,
      `/preview 内核=${stChrome} 预览页=${stPv} 装修台=${stAd}`);

    /*
     * ⑦ /preview 的手机屏**竖向必须可滚**。
     *
     * 起因：复刻有赞首页时这一页有 14 个区块、实测 7396px，而 .phone-screen 写的是
     * `overflow: hidden` + 固定高 718px —— 运营在 /preview 里只能看到第一屏，
     * 后面九成区块**根本看不到**（「复刻得对不对」也就无从核对，而我当时正需要核对尾部 4 个区块）。
     *
     * 一并把「上划浮现」接到**真实滚动**上：原先用滚轮事件模拟，而屏幕既然滚不动，
     * 那个模拟就只是把状态切了一下、屏幕上什么也不会动。
     * 现在按 `screen.scrollTop > nav.total` 判定，与真机 onPageScroll 同一口径。
     */
    const stScrollCss = /\.phone-screen\s*\{[\s\S]*?overflow-y:\s*auto/.test(stPvCss);
    const stScrollJs = /function syncNavReveal/.test(stPvJs) &&
      /\$\('preview'\)[\s\S]{0,200}?addEventListener\('scroll'/.test(stPvJs) &&
      !/addEventListener\('wheel'/.test(stPvJs);
    assert('风格选择：/preview 手机屏竖向可滚（overflow-y:auto），上划浮现接的是真实滚动而非滚轮模拟',
      stScrollCss && stScrollJs,
      `.phone-screen overflow-y:auto=${stScrollCss} 滚动接线=${stScrollJs}（含「不该再有 wheel 监听」）`);
  }

  /* -------------------------------------------------------------------
   * 轮播「一行一个」必须把**所有图**渲染出来（2026-10-16 一并修掉的真缺陷）
   *
   * 起因：复刻有赞首页时，尾部那个组件是「image_ad + 一行一个 + 3 张长图」。
   * 对照真机源码才发现我们的 single 分支只画了 `images[0]` ——
   * 运营在一个组件里放 3 张图，真机只显示第一张，另外两张**静默消失**
   * （不报错、装修台预览同样只画一张，看起来「一切正常」）。
   * 所以这条断言锁的是「真机与预览两处都遍历全部图」，不是某一处的写法。
   * ------------------------------------------------------------------- */
  {
    const lbTpl = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
    const lbSeg = (() => {
      const m = /<block wx:elif="\{\{block\.type === 'swiper' && block\.mode === 'single'\}\}">([\s\S]*?)<\/block>/.exec(lbTpl);
      return m ? m[1] : '';
    })();
    const lbPv = readFileSync(join(__dirname, '..', 'public', 'shared', 'pv-render.js'), 'utf8');
    const lbPvSeg = (() => {
      const m = /if \(mode === 'single'\) \{([\s\S]*?)\} else if \(mode === 'scroll'\)/.exec(lbPv);
      return m ? m[1] : '';
    })();
    assert('轮播「一行一个」：真机与预览都遍历全部图（老实现只画 images[0]，放 3 张会静默丢 2 张）',
      /wx:for="\{\{block\.images\}\}"/.test(lbSeg) && /item\.image/.test(lbSeg) && /item\.link/.test(lbSeg) &&
      /imgs\.map\(/.test(lbPvSeg) && !/curImg/.test(lbPvSeg),
      `真机遍历=${/wx:for="\{\{block\.images\}\}"/.test(lbSeg)} 预览遍历=${/imgs\.map\(/.test(lbPvSeg)} ` +
      `预览残留只画当前张=${/curImg/.test(lbPvSeg)}`);
  }

  /*
   * 统计取**终值**：上面最后一条断言已注册完毕，这里才算「跑了多少点位 / 红了几条」。
   * 挪到前面任意一处都会漏报之后的断言 —— 第 21 节那条结构性断言就是锁这件事的
   * （2026-10-13：这里原本在函数开头取值，尾部断言失败也报「失败 0 条」+ exit 0）。
   */
  const { reg, tested, missing, failed } = stat();

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
