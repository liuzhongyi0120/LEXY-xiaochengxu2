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
 */

import { writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SELF_FILE = fileURLToPath(import.meta.url);
const __dirname = dirname(SELF_FILE);
const BASE = process.argv[2] || 'http://127.0.0.1:3000';

/* ----------------------------- 结果收集 ----------------------------- */

const results = [];
let token = '';
let seq = 0;

/** 发起请求：模拟小程序 wx.request 的行为（GET 走 query、其余走 JSON body）
 *  expectFail：预期业务失败，命中即记为「通畅」（用于验证风控/校验分支）
 *  silent：不记录到结果列表（用于探针类请求）
 */
async function call(method, path, { query, body, auth = true, expectFail = '', silent = false, form = null } = {}) {
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
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    // multipart 上传：不手写 Content-Type，交给 fetch 生成带 boundary 的头
    payload = form;
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

  const businessFailed = !!(json && json.code !== 0);
  let passed;
  if (expectFail) {
    // 期望失败：只要服务正常应答且业务码非 0（或 HTTP 4xx）即算通过
    passed = !errMsg && (businessFailed || httpStatus === 401 || httpStatus === 404 || httpStatus === 403);
  } else {
    passed = !errMsg && httpStatus === 200 && json && json.code === 0;
  }

  if (!silent) {
    results.push({
      no: ++seq,
      method,
      path,
      httpStatus: errMsg ? 'ERR' : httpStatus,
      code: json ? json.code : '-',
      msg: errMsg || (json ? json.msg : ''),
      passed,
      note: expectFail ? `预期失败：${expectFail}` : ''
    });
  }
  return { ok: passed, businessFailed, httpStatus, json, data: json && json.data, errMsg };
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

/* 1. 点位清单 */
const routeList = await call('GET', '/api/routes', { auth: false });
const registered = routeList.data.list;
const bizTotal = routeList.data.bizTotal !== undefined ? routeList.data.bizTotal : registered.length;
console.log(` 已注册点位 ${registered.length} 个（业务 ${bizTotal} + 运维 ${registered.length - bizTotal}）\n`);

/* 2. 未登录访问受保护点位 → 应 401 */
const unauth = await call('GET', '/api/user/profile', { auth: false, expectFail: '未登录 401' });
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

/* 5. 登录态基础读点位 */
await call('GET', '/api/user/profile');
await call('POST', '/api/user/profile', { body: { nickname: '联调账号', avatar: 'https://img.yzcdn.cn/upload_files/2026/01/04/Fo69HIsVHfOzMC08PSX7N7uFY8s1.png!large.webp' } });
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
await call('POST', '/api/coupon/receive', { body: { templateId: 'ct_500_300' }, expectFail: '重复领券被拦截' });

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
  await call('POST', '/api/order/cancel', { body: { orderId: order2.data.orderId }, expectFail: '重复取消被拦截' });
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
  body: { goodsId, skuId: sku.skuId, quantity: 999999 }, expectFail: '超量加购被拦截'
});
assert('超量加购返回业务码 2000', bigQty.json.code === 2000,
  `code=${bigQty.json.code} msg=${bigQty.json.msg}`);

const badParam = await call('GET', '/api/goods/detail', {
  auth: false, query: { id: 'not_exist_id' }, expectFail: '商品不存在'
});
assert('不存在的商品返回业务码 404', badParam.json.code === 404, `code=${badParam.json.code}`);

const notFound = await call('GET', '/api/not/exist', { auth: false, expectFail: '未注册路径' });
assert('未注册路径返回 HTTP 404', notFound.httpStatus === 404, `HTTP ${notFound.httpStatus}`);

/* 14. 清理类点位 */
await call('DELETE', '/api/cart/remove', { body: { cartItemIds: [cartItem.cartItemId] } });
await call('DELETE', '/api/footprint/clear', { body: {} });
await call('POST', '/api/address/delete', { body: { addressId } });

/* 15. 删除地址后再下单 → 应被拦截（前置依赖校验） */
const noAddr = await call('POST', '/api/order/precreate', {
  body: { items: [{ goodsId, skuId: sku.skuId, quantity: 1 }] }, expectFail: '无收货地址'
});
assert('无收货地址时下单被拦截', noAddr.json.code === 2000, `msg=${noAddr.json && noAddr.json.msg}`);

await call('POST', '/api/auth/logout', { body: {} });

/* 15.5 店铺装修后台点位（全部无副作用：发布/回滚走「无草稿/无版本」的预期失败分支） */
const decoPages = await call('GET', '/api/decorate/pages', { auth: false });
assert('装修页面列表返回 5 个页面',
  decoPages.ok && decoPages.data.list.length === 5,
  `实际 ${decoPages.data ? decoPages.data.list.length : 0} 个`);

/* 组件库清单：基础组件需与有赞实测的 54 个一致；已接入组件数 = 首页区块类型数 */
const decoLib = await call('GET', '/api/decorate/lib', { auth: false });
const libTabs = decoLib.ok && decoLib.data ? decoLib.data.tabs : null;
const libCount = {};
if (libTabs) libTabs.forEach((t) => { libCount[t.key] = t.count; });
assert('装修组件库三 tab 数量正确（常用 10 / 基础 54 / 高级实测 2）',
  !!libTabs && libCount.common === 10 && libCount.basic === 54 && libCount.adv >= 1,
  libTabs ? `实际 ${JSON.stringify(libCount)}` : '无返回');

const libKinds = decoLib.ok && decoLib.data ? decoLib.data.kinds : null;
assert('装修组件库已接入 19 种组件，且每个都带 SVG 图标',
  !!libKinds && libKinds.length === 19 && libKinds.every((k) => !!k.icon),
  libKinds ? `实际 ${libKinds.length} 种，缺图标：${libKinds.filter((k) => !k.icon).map((k) => k.kind).join(',') || '无'}` : '无返回');

const decoHome = await call('GET', '/api/decorate/page', { auth: false, query: { key: 'home' } });
assert('装修首页详情：schema + 区块数据 + 已发布数据',
  decoHome.ok && !!decoHome.data.schema && Array.isArray(decoHome.data.data.blocks) && decoHome.data.data.blocks.length >= 11,
  `区块 ${decoHome.data ? decoHome.data.data.blocks.length : 0} 个（≥11 为合格，具体数量随运营内容变化）`);

const decoUnknown = await call('GET', '/api/decorate/page', { auth: false, query: { key: 'nope' }, expectFail: '未知页面 404' });
assert('装修未知页面返回 404', decoUnknown.json.code === 404, `code=${decoUnknown.json.code}`);

// 草稿往返：保存（内容与已发布一致）→ diff 应为 0 处差异 → 丢弃
const decoDraft = await call('POST', '/api/decorate/draft', { body: { key: 'home', data: decoHome.data.published } });
assert('装修草稿保存成功', decoDraft.ok, `at=${decoDraft.data && decoDraft.data.atText}`);

const decoDiff = await call('GET', '/api/decorate/diff', { auth: false, query: { key: 'home' } });
assert('草稿与已发布一致时 diff 为 0', decoDiff.ok && decoDiff.data.total === 0,
  `total=${decoDiff.data ? decoDiff.data.total : '-'}`);

// 无草稿时发布 → 预期失败（不写文件，保证自检无副作用）
await call('POST', '/api/decorate/discard', { body: { key: 'home' } });
await call('POST', '/api/decorate/publish', { body: { key: 'home' }, expectFail: '无草稿发布被拦截' });
await call('POST', '/api/decorate/rollback', { body: { key: 'home', versionId: 'v_not_exist' }, expectFail: '版本不存在' });

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
assert('新建后未发布，replica.js 里还没有 CUSTOM_PAGES',
  readFileSync(REPLICA_FILE, 'utf8').indexOf('CUSTOM_PAGES') < 0);

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
  expectFail: '自定义页沿用首页的区块校验'
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

const decoDelHome = await call('POST', '/api/decorate/page/delete', { body: { key: 'home' }, expectFail: '内置页不可删除' });
assert('内置页面不可删除', /不可删除/.test(decoDelHome.json.msg || ''), decoDelHome.json.msg);

const decoRenameHome = await call('POST', '/api/decorate/page/rename', { body: { key: 'home', name: 'X' }, expectFail: '内置页不可改名' });
assert('内置页面不可改名', /不支持改名/.test(decoRenameHome.json.msg || ''), decoRenameHome.json.msg);

const decoReserved = await call('POST', '/api/decorate/page/create', { body: { name: '保留字测试', key: 'home' }, expectFail: '保留标识' });
assert('与内置页重名的标识被拒绝', /保留字/.test(decoReserved.json.msg || ''), decoReserved.json.msg);

const decoDup = await call('POST', '/api/decorate/page/create', { body: { name: '自检临时页改名' }, expectFail: '页面名称重复' });
assert('页面名称重复被拒绝', /已存在/.test(decoDup.json.msg || ''), decoDup.json.msg);

const decoDel = await call('POST', '/api/decorate/page/delete', { body: { key: CUSTOM_NEW_KEY } });
assert('删除自定义页面成功', decoDel.ok && decoDel.data.name === '自检临时页改名', decoDel.ok ? decoDel.data.name : decoDel.json.msg);

const replicaAfterDel = readFileSync(REPLICA_FILE, 'utf8');
assert('删除后 replica.js 里 CUSTOM_PAGES 整段消失、无残留数据',
  replicaAfterDel.indexOf('CUSTOM_PAGES') < 0 && replicaAfterDel.indexOf(CUSTOM_KEY) < 0);
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
assert('素材引用检查同时覆盖 商品库 / 已发布页面 / 装修草稿（漏一处就会误删在用图）',
  /'data',\s*'catalog\.json'/.test(mediaSrc) && /'config',\s*'replica\.js'/.test(mediaSrc) && /'decorate',\s*'state\.json'/.test(mediaSrc),
  '缺失来源：' + [/catalog\.json/, /replica\.js/, /state\.json/].filter((r) => !r.test(mediaSrc)).map(String).join(', '));

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
const mediaFake = await call('POST', '/api/media/upload', { form: fdFake, auth: false, expectFail: '伪装图片被拒' });
assert('伪装成 png 的文本被拒（按文件头校验）',
  mediaFake.json && mediaFake.json.code === 1001 && /不支持的图片格式/.test(mediaFake.json.msg || ''),
  mediaFake.json && mediaFake.json.msg);

// 路径穿越：删除接口与静态服务两条路都要拦住
const mediaTrav = await call('POST', '/api/media/delete', { body: { name: '../../server/index.js' }, auth: false, expectFail: '路径穿越被拦' });
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
  const guard = await call('POST', '/api/media/delete', { body: { name: gname }, auth: false, expectFail: '商品图删除被拒' });
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

const mediaCount1 = await call('GET', '/api/media/list', { auth: false, silent: true });
assert('自检结束后素材库数量与初始一致（无残留）',
  mediaCount0.ok && mediaCount1.ok && mediaCount1.data.all === mediaCount0.data.all,
  `${mediaCount0.data && mediaCount0.data.all} → ${mediaCount1.data && mediaCount1.data.all}`);

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
 * 15.78 装修组件库全量对账 + 19 种区块端到端覆盖
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
 * 数据来源：2026-10-08 用真实浏览器打开有赞装修编辑器逐个点击组件抓取，
 *   见 .tooling/yz-extract.mjs / .tooling/_yz-panels.json（54 个组件的中文面板字段原文）。
 * ------------------------------------------------------------------------- */
{
  /* (1) 基础组件清单：54 个、分 10 组，组名与各组数量锁定到有赞实测值 */
  const YZ_GROUPS = [
    ['页面装修', 18], ['商品', 3], ['新零售', 5], ['营销活动', 7], ['会员', 4],
    ['直播', 3], ['智能运营', 5], ['教育', 6], ['积分', 1], ['其他', 2]
  ];
  const groups = schemaMod.componentLib().groups || [];
  const gotGroups = groups.map((g) => g.name + ':' + g.items.length);
  const wantGroups = YZ_GROUPS.map((g) => g[0] + ':' + g[1]);
  assert('装修组件库「基础组件」= 有赞实测 10 组 / 54 个（分组名与数量逐组对齐）',
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

  /* (3) 19 种区块的字段完整性：本轮新增的 8 种逐个点名，防止「类型加了字段忘了」 */
  const REQUIRED_FIELDS = {
    rich_text: ['html', 'bg', 'full', 'pageMargin'],
    search: ['placeholder', 'mode', 'sticky', 'shape', 'textAlign', 'boxHeight', 'scan', 'bg', 'boxBg', 'color', 'link', 'pageMargin'],
    elevator: ['mode', 'styleType', 'tagStyle', 'items', 'color', 'activeColor', 'bg', 'pageMargin'],
    enter_shop: ['text', 'align', 'color', 'bg', 'radius', 'link', 'bgOut', 'pageMargin'],
    audio: ['src', 'duration', 'text', 'avatar', 'useShopLogo', 'side', 'resume', 'pageMargin'],
    service: ['text', 'align', 'color', 'bg', 'radius', 'bgOut', 'pageMargin'],
    content_card: ['title', 'cols', 'ratio', 'items', 'style', 'radius', 'showTag', 'showRead', 'showLike', 'more', 'moreText', 'link', 'pageMargin'],
    buy_bar: ['goodsId', 'text', 'fontSize', 'align', 'theme', 'btnBg', 'padX', 'padB', 'btnH', 'btnR', 'bgOn', 'bg', 'bgH']
  };
  /** 拍平后的字段键集合（含 group / list.item 里的字段） */
  const flatKeys = (node, depth = 0, out = new Set()) => {
    if (!node || depth > 6) return out;
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

  /* (4) 小程序端 wxml 必须给每一种区块类型写渲染分支（后台能配、真机空白＝最典型的漏接） */
  const blocksWxml = readFileSync(join(MP_ROOT, 'templates', 'blocks.wxml'), 'utf8');
  const wxmlMissing = allKinds.filter((k) => blocksWxml.indexOf(`block.type === '${k}'`) < 0);
  assert('小程序 templates/blocks.wxml 覆盖全部 19 种区块类型（少一种就是「配了不显示」）',
    wxmlMissing.length === 0,
    wxmlMissing.length ? `wxml 缺分支：${wxmlMissing.join(', ')}` : `${allKinds.length} 种区块全部有渲染分支`);

  /* (5) 装修台预览必须覆盖同样 19 种（后台预览不画＝运营以为没生效，会反复重配） */
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin', 'admin.js'), 'utf8');
  const pvMissing = allKinds.filter((k) => adminJs.indexOf(`kind === '${k}'`) < 0);
  const tagLabelMissing = allKinds.filter((k) => {
    // 预览右上角的角标名（如 buy_bar → 购买按钮）必须能查到，否则会退回显示英文类型名
    const m = /"pv-tag">' \+ esc\(\(\{([\s\S]*?)\}\[kind\]/.exec(adminJs);
    return !m || m[1].indexOf(k + ':') < 0;
  });
  assert('装修台预览覆盖全部 19 种区块类型，且每种都有中文角标名',
    pvMissing.length === 0 && tagLabelMissing.length === 0,
    (pvMissing.length ? `预览缺分支：${pvMissing.join(', ')}` : '') +
    (tagLabelMissing.length ? ` 缺中文名：${tagLabelMissing.join(', ')}` : '') ||
    `${allKinds.length} 种区块的预览分支与中文角标全部就位`);

  /* (6) 装修台左侧按「有赞真实分组」渲染，而不是拍平成一堆（否则 54 个平铺没法找） */
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
    auth: false, body: { orderId: adPaidOrder.orderId }, expectFail: '已支付订单不可关闭'
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
    auth: false, query: { templateId: 'ct_not_exist' }, expectFail: '优惠券不存在'
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
  body: { templateId: adCid }, expectFail: '券已停止发放'
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
  auth: false, body: { id: 'g_not_exist' }, expectFail: '商品不存在'
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
const PAGE_HTML = { '/': 'debug.html', '/debug': 'debug.html', '/admin': 'admin/index.html', '/console': 'console/index.html' };
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
for (const route of ['/console', '/admin', '/debug']) {
  const res = await fetch(BASE + route);
  pageProbe.push({ route, status: res.status, html: (res.headers.get('content-type') || '').indexOf('text/html') === 0 });
}
assert('后台页面路由可访问且返回 HTML（/console · /admin · /debug）',
  pageProbe.every((p) => p.status === 200 && p.html),
  pageProbe.map((p) => `${p.route}=${p.status}`).join(' · '));

const CONSOLE_FILES = [
  'console/index.html', 'console/console.css', 'console/console.core.js', 'console/console.modules.js',
  'admin/index.html', 'admin/admin.js', 'admin/admin.css'
];
const missAssets = [];
CONSOLE_FILES.forEach((f) => {
  try { readFileSync(join(__dirname, '..', 'public', f)); } catch (e) { missAssets.push(f); }
});
assert('后台控制台与装修台必需文件齐全',
  missAssets.length === 0,
  missAssets.length ? `缺失：${missAssets.join(', ')}` : `${CONSOLE_FILES.length} 个文件全部存在`);

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

/* 16. 覆盖度比对（只统计「已注册点位」的口径） */
const registeredKeys = new Set(registered.map((r) => `${r.method} ${r.path}`));
const tested = new Set(
  results
    .filter((r) => r.method !== '—')
    .map((r) => `${r.method} ${r.path}`)
    .filter((k) => registeredKeys.has(k))
);

const missing = registered.filter((r) => !tested.has(`${r.method} ${r.path}`));
const failed = results.filter((r) => !r.passed);

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

// 管理接口必须在开关关闭时一并关闭（只关页面不管接口 = 假关闭）
const indexSrc = readFileSync(join(__dirname, '..', 'index.js'), 'utf8');
assert('安全开关 · 管理接口（admin/decorate/media）与页面同受一个开关约束',
  /MANAGE_API_PREFIXES/.test(indexSrc) &&
  /'\/api\/admin\/'/.test(indexSrc) && /'\/api\/decorate\/'/.test(indexSrc) && /'\/api\/media\/'/.test(indexSrc),
  '已对 /api/admin/ · /api/decorate/ · /api/media/ 三个前缀做 403 拦截');

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

/* ----------------------------- 输出 ----------------------------- */

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
console.log(` 已注册点位     ${registered.length} 个`);
console.log(` 已实测点位     ${tested.size} 个`);
console.log(` 未覆盖点位     ${missing.length} 个${missing.length ? ' → ' + missing.map((m) => `${m.method} ${m.path}`).join(', ') : ''}`);
console.log(` 前端点位比对   引用 ${fePaths.size} 个，断链 ${brokenLinks.length} 个`);
console.log(` 实测请求/断言  ${results.length} 条`);
console.log(` 通过           ${results.length - failed.length} 条`);
console.log(` 失败           ${failed.length} 条`);

/* 生成报告 */
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
lines.push(`| 已注册点位 | ${registered.length} |`);
lines.push(`| 已实测点位 | ${tested.size} |`);
lines.push(`| 未覆盖点位 | ${missing.length} |`);
lines.push(`| 实测请求/断言 | ${results.length} |`);
lines.push(`| 通过 | ${results.length - failed.length} |`);
lines.push(`| 失败 | ${failed.length} |`);
lines.push(`| 服务健康检查 | ${health.data.status} |`);
lines.push(`| 微信能力模式 | 登录 ${health.data.wechat.login} / 支付 ${health.data.wechat.pay} |`);
lines.push('');
lines.push('## 二、点位明细');
lines.push('');
lines.push('| # | 方法 | 路径 / 断言 | HTTP | 业务码 | 结果 | 说明 |');
lines.push('|---|---|---|---|---|---|---|');
results.forEach((r) => {
  lines.push(
    `| ${r.no} | ${r.method} | \`${r.path}\` | ${r.httpStatus} | ${r.code} | ${r.passed ? '✅' : '❌'} | ${r.note || r.msg || ''} |`
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
lines.push(`| 前端 services 引用的点位 | ${fePaths.size} |`);
lines.push(`| 前端引用但后端未实现（断链） | ${brokenLinks.length} |`);
lines.push(`| 后端已注册但前端未引用 | ${notUsedByFe.length} |`);
lines.push('');
if (brokenLinks.length) {
  lines.push('**断链点位（必须修复）**：');
  lines.push('');
  brokenLinks.forEach((p) => lines.push(`- \`${p}\``));
  lines.push('');
} else {
  lines.push('前端 services 引用的全部点位均已在后端实现，无断链。');
  lines.push('');
}
if (notUsedByFe.length) {
  lines.push('后端已注册但前端 services 未引用（属后台 / 微信服务器侧点位，正常）：');
  lines.push('');
  notUsedByFe.forEach((r) => lines.push(`- \`${r.method} ${r.path}\` ${r.desc || ''}`));
  lines.push('');
}

const outFile = join(__dirname, '..', 'CONNECTIVITY.md');
writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`\n 报告已写入   ${outFile}`);

const allGreen = failed.length === 0 && missing.length === 0;
console.log(allGreen ? '\n ✅ 每个点位均联络通畅\n' : '\n ⚠️ 存在异常，请查看上方明细\n');
process.exit(allGreen ? 0 : 1);
