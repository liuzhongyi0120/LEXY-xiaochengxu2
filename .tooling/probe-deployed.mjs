/**
 * 已部署服务器的端到端冒烟（走 nginx /mall-api 反代，与小程序真实路径一致）
 *
 *   node .tooling/probe-deployed.mjs [BASE_URL]
 *   默认 BASE_URL = https://14.103.50.137/mall-api
 *
 * 它模拟小程序真实的调用序列：登录 → 首页 → 商品 → 加购 → 下单 → 取消。
 * ⚠️ 会在服务器上真实产生 1 个联调用户 + 1 笔订单；**跑完自动取消订单以回滚库存**，
 *    并在结尾核对库存水位是否回到初始值。之所以要真的下单，是因为下单链路
 *    （库存扣减 / 订单号 / 金额计算）是纯读接口覆盖不到的部分。
 *
 * 关于登录（2026-10-09 服务器切真实微信登录后新增）：
 *   服务器有两种模式，脚本必须自己分辨，否则每次上线都报假红灯。
 *     ① 未配 WX_APPID/WX_SECRET → mock 登录：任何 code 都能换 token，脚本可直接自证；
 *     ② 已配（线上现状）→ 真实 code2Session：**code 只能由小程序端 wx.login 产生**，
 *        命令行拿不到 → 登录与下单链路无法自证，标为「跳过」而不是「失败」。
 *   想在这种模式下跑全链路，用环境变量注入：
 *     TOKEN=<在小程序端登录后从 Storage 取的 token>   # 直接复用登录态
 *     WX_CODE=<真实 wx.login 的 code>                 # 或者喂一个真实 code
 */
const BASE = (process.argv[2] || 'https://14.103.50.137/mall-api').replace(/\/$/, '');

/**
 * 期望点位数：从**本机代码**实时算出（线上部署的就是这份代码），不写死数字。
 *
 * 这里曾经写死 `=== 88`，第 28 批新增 /mp-src 等路由后变成 91 —— 每次加路由都会假红一次，
 * 而「假红」比「不检查」更糟：它会训练人忽略红灯。与 PITFALLS 里
 * 「素材库只有我这一条视频」是同一类脆弱断言 —— **断言要锁等价性，不要锁当时的值**。
 *
 * 期望值取自 server/index.js 同一处口径：router.describe().length + 2（加 health / routes 两个运维点位）。
 */
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const EXPECT_ROUTES = require_('../server/routes/index.js').describe().length + 2;

let pass = 0, fail = 0, skip = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name); console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
/** 「本环境无法验证」的项：既不算通过也不算失败，但必须打印原因 —— 绝不静默略过，
 *  否则「跳过了 8 项」会被误读成「这 8 项是好的」。 */
function skipped(name, why) {
  skip++;
  console.log('  ⊘ ' + name + (why ? '  → ' + why : ''));
}

async function call(method, path, { token, body, query } = {}) {
  let url = BASE + path;
  if (query) {
    const qs = Object.keys(query).map((k) => k + '=' + encodeURIComponent(query[k])).join('&');
    if (qs) url += (url.indexOf('?') > -1 ? '&' : '?') + qs;
  }
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers['authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (e) { /* 非 JSON */ }
  return { status: res.status, json };
}

(async () => {
  console.log('\n目标：' + BASE + '\n');

  console.log('【一】基础连通');
  const health = await call('GET', '/api/health');
  ok(health.status === 200 && health.json && health.json.code === 0, 'GET /api/health 通', health.status + '');
  ok(health.json && health.json.data && health.json.data.routes === EXPECT_ROUTES,
    `点位数与本机代码一致（${EXPECT_ROUTES}）`, health.json && health.json.data && String(health.json.data.routes));
  ok(health.json && health.json.data && health.json.data.debugPage === 'off',
    'DEBUG_PAGE 已关（管理页面不在公网暴露）', health.json && health.json.data && health.json.data.debugPage);

  console.log('\n【二】管理页面确实被关（公网裸奔风险最高的一环）');
  // 两种情况都要测：
  //   ① 代理路径下（BASE + /admin）—— 由后端 DEBUG_PAGE 判定，应返回 403 JSON；
  //   ② 站点根路径（/admin）—— 由 nginx 的 lexy-official-site 兜底返回 410 Gone。
  // 只测 ② 会漏掉「后端其实没关、只是 nginx 顺手挡了」这种假安全。
  for (const p of ['/admin', '/console', '/debug', '/preview']) {
    const r = await call('GET', p);
    ok(r.status === 403 && r.json && r.json.code === 403,
      '后端管理页面 ' + p + ' 返回 403（DEBUG_PAGE=off 生效）', r.status + ' ' + JSON.stringify(r.json).slice(0, 60));
    const root = await fetch(BASE.replace(/\/mall-api$/, '') + p, { redirect: 'manual' });
    ok([403, 404, 410].indexOf(root.status) > -1,
      '站点根路径 ' + p + ' 也不可达（nginx 兜底）', String(root.status));
  }

  console.log('\n【三】登录');
  // 三档：环境变量 TOKEN 注入 > mock 模式自证 > 真实模式降级跳过（见文件头注释）
  let token = (process.env.TOKEN || '').trim();
  if (token) {
    skipped('POST /api/auth/login', '已用环境变量 TOKEN 注入登录态');
    skipped('拿到 token', '同上');
  } else {
    const probeCode = (process.env.WX_CODE || 'smoke-deploy-probe').trim();
    const login = await call('POST', '/api/auth/login', { body: { code: probeCode } });
    const msg = (login.json && login.json.msg) || '';
    const t = login.json && login.json.data && (login.json.data.token || login.json.data.accessToken);
    if (login.json && login.json.code === 0 && t) {
      token = t;
      ok(login.status === 200, 'POST /api/auth/login 成功（mock 模式）', JSON.stringify(login.json).slice(0, 120));
      ok(!!token, '拿到 token', token.slice(0, 12) + '…');
    } else if (/微信登录失败/.test(msg)) {
      // 服务器已切真实登录：返回的是微信官方错误，说明链路本身是通的，只是缺真实 code
      skipped('POST /api/auth/login', '服务器已切真实登录接口：' + msg.slice(0, 70));
      skipped('拿到 token', '真实 code 只能由小程序端 wx.login 产生；可用 TOKEN=… 或 WX_CODE=… 注入');
    } else {
      ok(false, 'POST /api/auth/login', JSON.stringify(login.json).slice(0, 140));
      ok(false, '拿到 token', '未登录成功');
    }
  }

  console.log('\n【四】只读接口（小程序首页/商品/分类）');
  const home = await call('GET', '/api/home');
  ok(home.json && home.json.code === 0, 'GET /api/home', JSON.stringify(home.json).slice(0, 100));

  const list = await call('GET', '/api/goods/list', { query: { page: 1, size: 20 } });
  const goods = (list.json && list.json.data && (list.json.data.list || list.json.data.goods)) || [];
  ok(list.json && list.json.code === 0, 'GET /api/goods/list', JSON.stringify(list.json).slice(0, 100));
  ok(goods.length > 0, '商品库非空（服务器上确实有商品数据）', '数量=' + goods.length);

  const cats = await call('GET', '/api/goods/categories');
  ok(cats.json && cats.json.code === 0, 'GET /api/goods/categories', JSON.stringify(cats.json).slice(0, 100));

  const first = goods[0];
  // 列表接口不下发 SKU（只给聚合价与总库存），SKU 要从详情接口取 —— 下单必须有 skuId。
  let firstSku = null;
  if (first) {
    const gid = first.goodsId || first.id;
    const det = await call('GET', '/api/goods/detail', { query: { id: gid } });
    ok(det.json && det.json.code === 0, 'GET /api/goods/detail（' + gid + '）', JSON.stringify(det.json).slice(0, 100));
    const d = (det.json && det.json.data) || {};
    const skus = d.skus || (d.goods && d.goods.skus) || [];
    firstSku = skus[0] || null;
    if (firstSku) {
      console.log('  · 下单链路用：goodsId=' + gid + ' skuId=' + firstSku.skuId + ' 库存=' + firstSku.stock);
    } else {
      console.log('  · 详情里没有 skus 字段，详情字段：' + Object.keys(d).join(','));
    }
  }

  console.log('\n【五】加购 → 下单 → 取消（会真实写数据，结尾回滚库存）');
  if (first && firstSku && token) {
    const gid = first.goodsId || first.id;
    const add = await call('POST', '/api/cart/add', {
      token,
      body: { goodsId: gid, skuId: firstSku.skuId, count: 1 },
      query: { goodsId: gid, skuId: firstSku.skuId, count: 1 }
    });
    ok(add.json && add.json.code === 0, 'POST /api/cart/add 加购成功', JSON.stringify(add.json).slice(0, 140));

    const cartList = await call('GET', '/api/cart/list', { token });
    const cd = (cartList.json && cartList.json.data) || {};
    const citems = cd.list || cd.items || [];
    ok(cartList.json && cartList.json.code === 0, 'GET /api/cart/list', JSON.stringify(cartList.json).slice(0, 140));
    const cartItemIds = citems.map((x) => x.cartItemId || x.id || x.itemId).filter(Boolean);
    console.log('  · 购物车条目 id：' + JSON.stringify(cartItemIds));

    // 下单要地址；先看有没有，没有就建一个（用假数据，符合项目「示例不写真实个人信息」的约定）
    let addrList = await call('GET', '/api/address/list', { token });
    let addrs = ((addrList.json && addrList.json.data) || {}).list || (addrList.json && addrList.json.data) || [];
    if (!Array.isArray(addrs)) addrs = [];
    if (!addrs.length) {
      await call('POST', '/api/address/save', {
        token,
        body: { name: '张三', phone: '13800000000', province: '江苏省', city: '苏州市', district: '姑苏区', detail: '示例路 1 号 101 室', isDefault: true },
        query: { name: '张三', phone: '13800000000', province: '江苏省', city: '苏州市', district: '姑苏区', detail: '示例路 1 号 101 室', isDefault: 1 }
      });
      addrList = await call('GET', '/api/address/list', { token });
      addrs = ((addrList.json && addrList.json.data) || {}).list || [];
      if (!Array.isArray(addrs)) addrs = [];
    }
    const addressId = addrs.length ? (addrs[0].addressId || addrs[0].id) : '';
    console.log('  · 地址 id：' + addressId + '（共 ' + addrs.length + ' 个）');

    const pre = await call('POST', '/api/order/precreate', {
      token,
      body: {
        // 服务端 precreate 收两种来源：items[{goodsId,skuId,quantity}]（立即购买）
        // 或 fromCart:true（结算购物车中 selected 的条目）。这里走「立即购买」这条，
        // 顺带验证服务端会自己重算金额、校验并锁库存。
        items: [{ goodsId: gid, skuId: firstSku.skuId, quantity: 1 }],
        addressId,
        remark: '部署冒烟测试（跑完即取消）'
      },
      query: { addressId, remark: '部署冒烟测试' }
    });
    console.log('  · precreate → ' + JSON.stringify(pre.json).slice(0, 220));
    ok(pre.json && pre.json.code === 0, 'POST /api/order/precreate 下单成功',
      JSON.stringify(pre.json).slice(0, 160));

    const olist = await call('GET', '/api/order/list', { token });
    const orders = ((olist.json && olist.json.data) || {}).list || ((olist.json && olist.json.data) || {}).orders || [];
    ok(olist.json && olist.json.code === 0, 'GET /api/order/list', JSON.stringify(olist.json).slice(0, 140));

    if (orders.length) {
      const orderId = orders[0].orderId || orders[0].id;
      ok(true, 'precreate 真实生成了订单 ' + orderId + '（金额 ' + (orders[0].payAmount || orders[0].amount || '?') + ' 分）');
      // 库存应已被扣减
      const afterAdd = await call('GET', '/api/goods/detail', { query: { id: gid } });
      const skus2 = (((afterAdd.json || {}).data || {}).skus) || [];
      const s2 = skus2.filter((s) => s.skuId === firstSku.skuId)[0];
      if (s2) {
        ok(s2.stock === firstSku.stock - 1,
          '下单后库存已扣减（' + firstSku.stock + ' → ' + s2.stock + '）', '实际 ' + s2.stock);
      }
      const cxl = await call('POST', '/api/order/cancel', { token, body: { orderId }, query: { orderId } });
      ok(cxl.json && cxl.json.code === 0, 'POST /api/order/cancel 取消成功', JSON.stringify(cxl.json).slice(0, 140));
      const afterCxl = await call('GET', '/api/goods/detail', { query: { id: gid } });
      const skus3 = (((afterCxl.json || {}).data || {}).skus) || [];
      const s3 = skus3.filter((s) => s.skuId === firstSku.skuId)[0];
      if (s3) {
        ok(s3.stock === firstSku.stock,
          '取消后库存已回滚（回到 ' + firstSku.stock + '）', '实际 ' + s3.stock);
      }
    } else {
      console.log('  · 未生成订单；precreate 响应见上（1001 = 参数类业务拦截，属正常提示）');
    }
  } else {
    const why = !token
      ? '没有可用 token（真实登录模式下需小程序端 wx.login 的 code，可用 TOKEN=… 注入）'
      : '缺商品 / SKU 数据';
    [
      'POST /api/cart/add 加购成功',
      'GET /api/cart/list',
      'POST /api/order/precreate 下单成功',
      'GET /api/order/list',
      'precreate 真实生成了订单（含金额）',
      '下单后库存已扣减',
      'POST /api/order/cancel 取消成功',
      '取消后库存已回滚'
    ].forEach((n) => skipped(n, why));
  }

  console.log('\n【六】静态资源（图片走的就是这条）');
  /* 不再写死文件名：曾经写死 20261008-zx70ws.png，那张图后来被清理掉，
   * 于是探针永远报 404 —— 一个与事实相反的假红（假红比不检查更糟，会训练人忽略红灯）。
   * 现在从本机 replica.js 里找一张**真实被引用**的素材：正好验「本机有 → 线上也该有」这条契约。 */
  const pickLocalImage = () => {
    try {
      const R = require_('../miniprogram/config/replica.js');
      let found = '';
      const walk = (v) => {
        if (found || v === null || v === undefined) return;
        if (typeof v === 'string') {
          if (/^\/uploads\/\d{6}\/[0-9]{8}-[A-Za-z0-9_.-]+$/.test(v)) found = v;
          return;
        }
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (typeof v === 'object') { Object.keys(v).forEach((k) => walk(v[k])); }
      };
      walk(R);
      return found;
    } catch (e) { return ''; }
  };
  const imgPath = pickLocalImage();
  if (!imgPath) {
    skipped('GET /uploads/…  正常返回图片', '本机 replica.js 里找不到 /uploads 引用');
  } else {
    const img = await fetch(BASE + imgPath);
    ok(img.status === 200 && (img.headers.get('content-type') || '').indexOf('image/') === 0,
      'GET ' + imgPath + '  正常返回图片', img.status + ' ' + img.headers.get('content-type'));
  }

  console.log('\n【七】管理接口必须全部被拒（NODE_ENV=production + DEBUG_PAGE=off）');
  for (const p of ['/api/admin/overview', '/api/decorate/pages', '/api/media/list']) {
    const r = await call('GET', p);
    ok(r.json && r.json.code !== 0, p + ' 被拒', JSON.stringify(r.json).slice(0, 90));
  }

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败 / ' + skip + ' 跳过');
  if (skip) console.log('（⊘ 是「本环境无法验证」，不是通过；原因见每项后面）');
  if (fail) { console.log('失败项：'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('探针崩溃：' + e.message); process.exit(1); });
