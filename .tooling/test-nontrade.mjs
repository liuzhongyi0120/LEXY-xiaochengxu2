/**
 * 非交易功能回归测试（对应《小程序商城非交易功能整改报告》01 ~ 15 的非交易部分）
 *
 * 覆盖：01/07 商品字段契约与素材地址 · 02 SKU 唯一 · 03 删父分类查子分类商品 ·
 *      04 下架商品不可查 · 05 旧响应不覆盖新响应 · 06 空品牌不白屏 ·
 *      10 店铺名称/Logo 单一数据源 · 11 改标识别名与站内引用 ·
 *      14 请求体解析 · 15 自检判定函数
 *
 * 为什么要单独一个入口：
 *   - `check-all.mjs` 走的是真实 HTTP + 真实数据文件，且包含交易链路，
 *     不适合当「改商品/删分类」这类破坏性逻辑的验证器；
 *   - 本文件**使用临时数据目录**（MALL_DATA_DIR）跑真实业务函数，
 *     不启动服务、不碰 server/data、不改装修草稿，可以随时重复执行。
 *
 * 运行：node .tooling/test-nontrade.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import nodePath from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ *
 * 隔离环境：必须在 require 任何存储模块之前设置
 * ------------------------------------------------------------------ */

const TMP = nodePath.join(os.tmpdir(), 'mall-nontrade-' + process.pid);
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.MALL_DATA_DIR = TMP;
// 发布产物也要改道：非交易测试会跑「草稿 → 发布」，绝不能改写真的 replica.js
process.env.MALL_REPLICA_FILE = nodePath.join(TMP, 'replica.out.js');

const REAL_DATA = nodePath.join(ROOT, 'server', 'data');
const REAL_REPLICA = nodePath.join(ROOT, 'miniprogram', 'config', 'replica.js');
const realDataSnapshot = fs.existsSync(REAL_DATA)
  ? fs.readdirSync(REAL_DATA).sort().join('|')
  : '(不存在)';
const realReplicaHash = fs.existsSync(REAL_REPLICA)
  ? fs.statSync(REAL_REPLICA).size + ':' + fs.statSync(REAL_REPLICA).mtimeMs
  : '';

/* ------------------------------------------------------------------ *
 * 断言
 * ------------------------------------------------------------------ */

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); } else {
    fail++;
    fails.push(name);
    console.log('  ✗ ' + name + (detail ? '  —— ' + detail : ''));
  }
}
function section(t) { console.log('\n' + t); }

/* ------------------------------------------------------------------ *
 * 后端：真实业务函数（隔离目录）
 * ------------------------------------------------------------------ */

const catalog = require(nodePath.join(ROOT, 'server/lib/catalog.js'));
const catalogStore = require(nodePath.join(ROOT, 'server/lib/catalogStore.js'));
const dbStore = require(nodePath.join(ROOT, 'server/lib/store.js'));
const { BizError } = require(nodePath.join(ROOT, 'server/lib/http.js'));

function throws(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

/** 造一件商品（不显式给 SKU 标识 —— 正是历史缺陷的触发条件） */
function mkGoods(name, price, stock, categoryId) {
  return {
    name,
    categoryId: categoryId || 'c101',
    cover: '/uploads/202610/x.png',
    images: ['/uploads/202610/x.png'],
    skus: [{ specs: [], price, originalPrice: price, stock }]
  };
}

section('02 · 新建商品的 SKU 标识必须全局唯一，且不串写库存');
{
  const a = catalog.saveGoods(mkGoods('测试商品A', 10000, 10));
  const b = catalog.saveGoods(mkGoods('测试商品B', 20000, 20));
  const skuA = a.goods.skus[0].skuId;
  const skuB = b.goods.skus[0].skuId;

  ok('两件新商品得到不同的商品 ID', a.id !== b.id, a.id + ' / ' + b.id);
  ok('两件新商品的默认 SKU 标识不同（旧实现都是 g-01）', skuA !== skuB, skuA + ' / ' + skuB);
  ok('SKU 标识带上了各自商品 ID 前缀', skuA.indexOf(a.id) === 0 && skuB.indexOf(b.id) === 0, skuA + ' / ' + skuB);

  catalog.setStock({ items: [{ skuId: skuA, value: 5 }], mode: 'set' });
  const a2 = catalog.adminGoodsDetail(a.id);
  const b2 = catalog.adminGoodsDetail(b.id);
  ok('改 A 的库存后 A 变为 5', a2.stock === 5, 'stock=' + a2.stock);
  ok('改 A 的库存不影响 B（旧实现 B 会变成 5）', b2.stock === 20, 'stock=' + b2.stock);

  ok('连续新建后无跨商品重复 SKU', catalog.auditSkuConflicts().length === 0,
    JSON.stringify(catalog.auditSkuConflicts()));

  // 跨商品复用标识必须被拒
  const reuse = throws(() => catalog.saveGoods(Object.assign(mkGoods('测试商品C', 5000, 1), {
    skus: [{ skuId: skuA, specs: [], price: 5000, stock: 1 }]
  })));
  ok('复用其它商品的 SKU 标识被拒绝', !!reuse && /已被商品|占用/.test(reuse.message), reuse && reuse.message);

  // 同商品内重复也必须被拒
  const dup = throws(() => catalog.saveGoods({
    name: '测试商品D', categoryId: 'c101',
    skus: [{ skuId: 'dup-01', specs: [], price: 100, stock: 1 },
      { skuId: 'dup-01', specs: [], price: 100, stock: 1 }]
  }));
  ok('同一商品内 SKU 标识重复被拒绝', !!dup && /重复/.test(dup.message), dup && dup.message);

  // 编辑：保留自己的标识；换成别人的标识被拒
  const editOk = catalog.saveGoods({
    id: a.id, name: '测试商品A改', categoryId: 'c101',
    skus: [{ skuId: skuA, specs: ['红'], price: 12300, stock: 7 }]
  });
  ok('编辑商品可保留自己的 SKU 标识', editOk.goods.skus[0].skuId === skuA, editOk.goods.skus[0].skuId);

  const editBad = throws(() => catalog.saveGoods({
    id: a.id, name: '测试商品A改', categoryId: 'c101',
    skus: [{ skuId: skuB, specs: [], price: 100, stock: 1 }]
  }));
  ok('编辑时改成别的商品的 SKU 标识被拒绝', !!editBad, editBad && editBad.message);

  // 删除规格后库存键不留残留
  // 刻意换一个**不同**的标识：若沿用原标识，删掉再生成会得到同一个 ID，
  // 那样测不出「旧键是否被清掉」。
  const before = Object.keys(dbStore.get().stocks).length;
  const otherId = b.id + '-99';
  catalog.saveGoods({
    id: b.id, name: '测试商品B改', categoryId: 'c101',
    skus: [{ skuId: otherId, specs: [], price: 20000, stock: 3 }]
  });
  const after = Object.keys(dbStore.get().stocks).length;
  ok('换掉 SKU 标识后 db.stocks 不留幽灵键', after === before && !(skuB in dbStore.get().stocks),
    'before=' + before + ' after=' + after + ' 旧键仍在=' + (skuB in dbStore.get().stocks));
  ok('换标识后新标识成为库存真源', dbStore.get().stocks[otherId] === 3,
    String(dbStore.get().stocks[otherId]));
}

section('03 · 删除父分类必须检查子分类下的商品');
{
  /*
   * 刻意自建一棵分类树，而不是用种子分类：
   * 种子里 c1/c101~c103 本来就挂着演示商品，直接拿它测会分不清
   * 「拒绝是因为我的测试商品」还是「因为种子商品」，断言会变得又脆又难读。
   */
  const parent = catalog.saveCategory({ name: '测试一级分类' });
  const child = catalog.saveCategory({ name: '测试二级分类', parentId: parent.id });
  const g = catalog.saveGoods(mkGoods('子分类下的商品', 9900, 5, child.id));

  const findCat = (id) => catalog.categories().find((c) => c.id === id);

  const blocked = throws(() => catalog.deleteCategory(parent.id));
  ok('父分类自身无商品、子分类有商品时拒绝删除', !!blocked, blocked && blocked.message);
  ok('拒绝时提示里说明了关联商品数量与所在子分类',
    !!blocked && /还有 1 个商品/.test(blocked.message) && /测试二级分类/.test(blocked.message),
    blocked && blocked.message);
  ok('拒绝后分类树未变', !!findCat(parent.id) && (findCat(parent.id).children || []).length === 1);
  ok('拒绝后商品归属未变', catalog.adminGoodsDetail(g.id).categoryId === child.id);

  // 子分类自身有商品时，直接删子分类也要拒绝
  const blocked2 = throws(() => catalog.deleteCategory(child.id));
  ok('直接删除有商品的二级分类同样被拒绝', !!blocked2, blocked2 && blocked2.message);

  // 移走商品后应能删除，且子分类一并消失
  catalog.deleteGoods(g.id);
  const r = throws(() => catalog.deleteCategory(parent.id));
  ok('子分类商品移走后父分类可删除', r === null, r && r.message);
  ok('删除父分类后分类树里不再有该一级分类', !findCat(parent.id));
  const childLeft = catalog.categories().some((c) => (c.children || []).some((x) => x.id === child.id));
  ok('子分类一并删除（不会留下幽灵分类）', !childLeft);
}

section('04 · 公开商品列表不得查询下架商品');
{
  const on = catalog.saveGoods(mkGoods('在售商品', 1000, 1, 'c201'));
  const off = catalog.saveGoods(Object.assign(mkGoods('下架商品', 1000, 1, 'c201'), { status: 'off_sale' }));

  const ids = (params) => catalog.listGoods(params).list.map((x) => x.id);
  ok('默认只返回在售商品', ids({}).indexOf(off.id) < 0 && ids({}).indexOf(on.id) > -1);
  ok('传 status=off_sale 也拿不到下架商品（旧实现会返回）', ids({ status: 'off_sale' }).indexOf(off.id) < 0);
  ok('传未知 status 也拿不到下架商品', ids({ status: 'whatever' }).indexOf(off.id) < 0);
  ok('匿名可见性口径与详情一致（下架商品详情 404）', !!throws(() => catalog.detail(off.id)));

  catalog.deleteGoods(on.id);
  catalog.deleteGoods(off.id);
}

/* ------------------------------------------------------------------ *
 * 前端：最小运行时桩（wx / Page），跑真实服务层与页面逻辑
 * ------------------------------------------------------------------ */

const pending = [];
/** 记录最近一次前端请求的原始参数 */
function resetRequests() { pending.length = 0; }

global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  showModal: () => {},
  stopPullDownRefresh: () => {},
  setNavigationBarTitle: () => {},
  navigateTo: () => {},
  redirectTo: () => {},
  navigateBack: () => {},
  previewImage: () => {},
  getAccountInfoSync: () => ({ miniProgram: { version: 'test' } }),
  request: (opt) => { pending.push(opt); }
};
global.Page = (cfg) => { global.__page = cfg; };
global.Component = () => {};
global.getApp = () => ({ updateCartBadge() {} });

/** 回放一个请求：body 为业务 data（未包 {code,msg}） */
function respond(i, body) {
  const opt = pending[i];
  if (!opt) return;
  opt.success({ statusCode: 200, data: { code: 0, msg: 'ok', data: body } });
  if (opt.complete) opt.complete();
}
/** 等待微任务队列排空（让 mapLimit 把请求都发出来） */
const tick = () => new Promise((r) => setTimeout(r, 0));

const goodsSvc = require(nodePath.join(ROOT, 'miniprogram/services/goods.js'));
const blocksUtil = require(nodePath.join(ROOT, 'miniprogram/utils/blocks.js'));
const { BASE_URL } = require(nodePath.join(ROOT, 'miniprogram/utils/constants.js'));

section('01/07 · 商品接口字段契约与素材地址统一转换');
{
  resetRequests();
  const p = goodsSvc.fetchList({ page: 1, size: 10 });
  respond(0, {
    total: 1, hasMore: false, page: 1, size: 10,
    list: [{ id: 'g1', name: '吸尘器', cover: '/uploads/202610/a.png', price: 199900, images: [] }]
  });
  const res = await p;
  const it = res.list[0];
  ok('列表项补出 goodsId（旧实现为空 → 卡片点不动）', it.goodsId === 'g1', String(it.goodsId));
  ok('列表项补出 image（旧实现为空 → 卡片没图）', it.image === BASE_URL + '/uploads/202610/a.png', it.image);
  ok('列表项的 id 原样保留（服务端契约不变）', it.id === 'g1', String(it.id));
  ok('cover 属于图片字段，同样补成完整地址', it.cover === BASE_URL + '/uploads/202610/a.png', it.cover);
  ok('列表 total 透传（列表页「共 N 件」用接口值而不是已加载条数）', res.total === 1);

  resetRequests();
  const pd = goodsSvc.fetchDetail('g1');
  respond(0, {
    id: 'g1', name: '吸尘器', cover: '/uploads/202610/a.png',
    images: ['/uploads/202610/a.png', 'https://img.yzcdn.cn/x.jpg'],
    skus: [{ skuId: 's1', price: 1, image: '/uploads/202610/sku.png' }],
    detailBlocks: [{ type: 'image', content: '/uploads/202610/d.png' }],
    recommends: [{ id: 'g2', name: '滤芯', cover: '/uploads/202610/b.png' }]
  });
  const d = await pd;
  ok('详情图集里的 /uploads 补成完整地址', d.images[0] === BASE_URL + '/uploads/202610/a.png', d.images[0]);
  ok('外链原样保留（不重复拼域名）', d.images[1] === 'https://img.yzcdn.cn/x.jpg', d.images[1]);
  ok('SKU 图也补域名', d.skus[0].image === BASE_URL + '/uploads/202610/sku.png', d.skus[0].image);
  ok('图文详情块里的图片也补域名', d.detailBlocks[0].content === BASE_URL + '/uploads/202610/d.png', d.detailBlocks[0].content);
  ok('推荐商品也走同一层转换', d.recommends[0].image === BASE_URL + '/uploads/202610/b.png', d.recommends[0].image);
}

section('01 · 装修「商品」区块能拿到标识与图片，且同一商品不重复请求');
{
  const blocks = blocksUtil.normalizeBlocks([
    { type: 'goods', mode: 'ids', ids: 'g1,g2', limit: 4, cols: 2 },
    { type: 'goods', mode: 'ids', ids: 'g1', limit: 4, cols: 2 }
  ]);
  resetRequests();
  const p = blocksUtil.loadGoodsData(blocks);
  await tick();
  ok('两个区块共用的商品只请求一次（去重生效）', pending.length === 2,
    '实际请求 ' + pending.length + ' 次：' + pending.map((o) => o.data.id).join(','));
  pending.forEach((o) => {
    o.success({
      statusCode: 200,
      data: {
        code: 0, msg: 'ok',
        data: {
          id: o.data.id, goodsId: o.data.id, name: '商品' + o.data.id,
          cover: '/uploads/202610/' + o.data.id + '.png', price: 10000
        }
      }
    });
    if (o.complete) o.complete();
  });
  const next = await p;
  const b0 = next['blocks[0].goods'];
  ok('区块拿到 goodsId（模板 data-goods 用它跳详情）', b0[0].goodsId === 'g1' && b0[1].goodsId === 'g2',
    JSON.stringify(b0.map((x) => x.goodsId)));
  ok('区块拿到补全域名的图片地址', b0[0].image === BASE_URL + '/uploads/202610/g1.png', b0[0].image);
  ok('价格以元为单位展示', b0[0].priceText === '100.00', b0[0].priceText);
  ok('区块 1 也拿到自己的商品', next['blocks[1].goods'].length === 1);
  ok('成功时不标记失败', next['blocks[0].goodsFailed'] === false);

  // 失败：不能被静默吞成「暂无商品」
  resetRequests();
  const p2 = blocksUtil.loadGoodsData(blocksUtil.normalizeBlocks([
    { type: 'goods', mode: 'ids', ids: 'g9', limit: 4, cols: 2 }
  ]));
  await tick();
  pending.forEach((o) => {
    o.success({ statusCode: 500, data: { code: 5000, msg: '服务开小差了' } });
    if (o.complete) o.complete();
  });
  const next2 = await p2;
  ok('接口失败时标记 goodsFailed（与「确实没商品」区分）', next2['blocks[0].goodsFailed'] === true);
  ok('失败时该区块商品为空数组（模板据此显示重试占位）', next2['blocks[0].goods'].length === 0);
}

section('06 · 产品页在空配置下不白屏');
{
  const replicaPath = require.resolve(nodePath.join(ROOT, 'miniprogram/config/replica.js'));
  const pagePath = nodePath.join(ROOT, 'miniprogram/pages/product/product.js');

  const loadProduct = (brands) => {
    require.cache[replicaPath] = {
      id: replicaPath, filename: replicaPath, loaded: true,
      exports: { PRODUCT_BRANDS: brands, PRODUCT_NAV_LOGO: '', PAGE_META: { product: { bg: '#fff' } }, SHOP: {} }
    };
    delete require.cache[pagePath];
    global.__page = null;
    require(pagePath);
    return global.__page;
  };

  const emptyCfg = throws(() => loadProduct([]));
  ok('PRODUCT_BRANDS=[] 时页面初始化不抛异常（旧实现抛 reading groups）', emptyCfg === null,
    emptyCfg && emptyCfg.message);
  const cfg = loadProduct([]);
  ok('空品牌时 groups 是空数组而不是 undefined', Array.isArray(cfg.data.groups) && cfg.data.groups.length === 0);
  ok('空品牌时置了 noBrands 标记（模板显示空状态）', cfg.data.noBrands === true);

  const noGroups = loadProduct([{ id: 'b1', name: '莱克', groups: undefined }]).data;
  ok('品牌存在但没有 groups 时同样安全', Array.isArray(noGroups.groups) && noGroups.groups.length === 0);
  ok('品牌存在时不显示整页空状态', noGroups.noBrands === false);

  const normal = loadProduct([{ id: 'b1', name: '莱克', groups: [{ header: '', products: [] }] }]).data;
  ok('正常配置仍能取到分组', normal.groups.length === 1);
}

section('05 · 商品列表：慢网下旧响应不得覆盖新响应');
{
  const listPath = nodePath.join(ROOT, 'miniprogram/packageGoods/list/list.js');
  require.cache[require.resolve(nodePath.join(ROOT, 'miniprogram/config/replica.js'))] = {
    id: 'replica-stub', filename: 'replica-stub', loaded: true, exports: { PAGE_META: {} }
  };
  delete require.cache[listPath];
  global.__page = null;
  require(listPath);
  const cfg = global.__page;

  const page = Object.assign({}, cfg);
  page.data = JSON.parse(JSON.stringify(cfg.data));
  page.setData = function (patch, cb) {
    Object.keys(patch).forEach((k) => { page.data[k] = patch[k]; });
    if (cb) cb();
  };

  resetRequests();
  page.setData({ keyword: 'old' });
  page.loadList(1);
  page.setData({ keyword: 'new' });
  page.loadList(1);
  await tick();
  ok('两次搜索各发出一次请求', pending.length === 2, '实际 ' + pending.length);
  ok('请求参数分别带上了各自的搜索词',
    pending[0].data.keyword === 'old' && pending[1].data.keyword === 'new',
    pending.map((o) => o.data.keyword).join(','));

  // 新响应先回，旧响应后回 —— 旧实现最终会显示 old
  respond(1, { total: 1, hasMore: false, list: [{ id: 'new1', name: '新结果' }] });
  await tick();
  respond(0, { total: 1, hasMore: false, list: [{ id: 'old1', name: '旧结果' }] });
  await tick();
  ok('最终展示的是最后一次搜索的结果', page.data.list.length === 1 && page.data.list[0].id === 'new1',
    JSON.stringify(page.data.list.map((x) => x.id)));
  ok('total 与最后一次搜索一致', page.data.total === 1);

  // 分页请求绑定版本：条件变更后在飞的旧「下一页」必须被丢弃
  resetRequests();
  page.setData({ loadingMore: false, hasMore: true, page: 1 });
  page.loadList(2);              // 旧条件的第二页
  page.setData({ keyword: 'third' });
  page.loadList(1);              // 新条件首屏
  await tick();
  const reqs = pending.slice(-2);
  respond(pending.length - 1, { total: 1, hasMore: false, list: [{ id: 'third1', name: '第三词' }] });
  await tick();
  respond(pending.length - 2, { total: 5, hasMore: true, list: [{ id: 'stale2', name: '旧第二页' }] });
  await tick();
  ok('旧条件的分页结果不会追加进新列表',
    page.data.list.length === 1 && page.data.list[0].id === 'third1',
    JSON.stringify(page.data.list.map((x) => x.id)));

  // 首屏失败要与「没有找到相关商品」区分
  resetRequests();
  page.loadList(1);
  await tick();
  pending.forEach((o) => {
    o.success({ statusCode: 500, data: { code: 5000, msg: '服务开小差了' } });
    if (o.complete) o.complete();
  });
  await tick();
  ok('首屏加载失败置 loadFailed（模板据此显示重试而不是「没有找到相关商品」）',
    page.data.loadFailed === true && page.data.list.length === 0);
  resetRequests();
  page.loadList(1);
  await tick();
  respond(pending.length - 1, { total: 0, hasMore: false, list: [] });
  await tick();
  ok('成功但结果为空时不置 loadFailed（真正的空结果）', page.data.loadFailed === false);
}

/* ------------------------------------------------------------------ *
 * 11 · 自定义页改标识：旧链接不能失效 + 删除前要有引用清单
 * ------------------------------------------------------------------ */

const decorate = require(nodePath.join(ROOT, 'server/decorate/store.js'));
const customPages = require(nodePath.join(ROOT, 'server/decorate/customPages.js'));

section('11 · 自定义页改标识与站内引用清单');
{
  // 用真实 replica.js 的**副本**作为这份隔离环境里「已发布」的起点
  // （只读真文件、写副本；发布链路随后会把改动写进副本，真实 replica.js 不受影响）
  fs.copyFileSync(REAL_REPLICA, process.env.MALL_REPLICA_FILE);

  const created = decorate.createCustomPage({ name: '春季活动页', key: 'activity' });
  ok('新建自定义页成功', created.page.key === 'activity');
  ok('新建时还没有任何别名', Object.keys(customPages.aliases()).length === 0);

  // 造一处站内引用：首页加一个标题区块，跳转到这个活动页
  const homeData = decorate.getPage('home');
  const draft = JSON.parse(JSON.stringify(homeData.published));
  draft.blocks = (draft.blocks || []).concat([
    { type: 'title', text: '活动入口', link: '/pages/custom/index?key=activity' }
  ]);
  decorate.saveDraft('home', draft);

  const refs = decorate.referencesOf('activity');
  ok('能扫出站内引用（首页区块的跳转链接）', refs.length === 1, JSON.stringify(refs));
  ok('引用清单能定位到页面与字段',
    refs.length === 1 && refs[0].pageKey === 'home' && /跳转链接/.test(refs[0].label),
    refs.length ? refs[0].label : '(空)');

  const delErr = throws(() => decorate.removeCustomPage('activity'));
  // 拒绝必须是规范业务错误（BizError + 业务码 2000 + hasRefs 标记），不能再抛普通 Error ——
  // 普通 Error 到入口会变成 HTTP 500 / code 5000「服务开小差了」，
  // 运营在装修台看不到引用清单，自检的「预期失败」也会因为 5000 而假通过。
  ok('被站内引用时直接删除被拒绝（BizError + 2000 + hasRefs）',
    !!delErr && delErr.name === 'BizError' && delErr.code === 2000 && delErr.hasRefs === true,
    delErr && `name=${delErr.name} code=${delErr.code} hasRefs=${delErr.hasRefs}`);
  ok('拒绝信息里带上了引用清单', !!delErr && /春季活动页|首页/.test(delErr.message));

  // 改标识：登记别名 + 迁移草稿/版本/replica 键名
  const ren = decorate.updateCustomPage('activity', { key: 'activity-2026' });
  ok('改标识返回旧标识与引用条数', ren.renamedFrom === 'activity' && ren.refCount === 1,
    `from=${ren.renamedFrom} refs=${ren.refCount}`);
  ok('别名表登记 activity → activity-2026', customPages.aliases().activity === 'activity-2026',
    JSON.stringify(customPages.aliases()));

  const R = decorate.readReplica();
  ok('replica 里出现了新标识的页面数据', !!(R.CUSTOM_PAGES || {})['activity-2026']);
  ok('replica 里旧标识已移除（不留幽灵页）', !(R.CUSTOM_PAGES || {}).activity);
  ok('replica 里写入了旧标识别名表',
    ((R.CUSTOM_PAGE_ALIASES || {}).activity) === 'activity-2026',
    JSON.stringify(R.CUSTOM_PAGE_ALIASES));

  // 连改两次：别名要收敛到最终标识，不能停在中间那个不存在的标识上
  decorate.updateCustomPage('activity-2026', { key: 'activity-final' });
  const al2 = customPages.aliases();
  ok('连改两次后，最早的旧标识也指向最终标识',
    al2.activity === 'activity-final' && al2['activity-2026'] === 'activity-final',
    JSON.stringify(al2));

  const keyErr = customPages.checkKey('activity');
  ok('旧标识被保留：新页面不能占用它（否则旧链接会跳到无关页面）',
    typeof keyErr === 'string' && /旧标识/.test(keyErr), String(keyErr));

  /* 小程序端：拿旧标识打开，必须跳到新标识（而不是显示「页面不存在」） */
  const replicaPath = require.resolve(nodePath.join(ROOT, 'miniprogram/config/replica.js'));
  const customPagePath = nodePath.join(ROOT, 'miniprogram/pages/custom/index.js');
  const loadCustomPage = (rep) => {
    require.cache[replicaPath] = {
      id: replicaPath, filename: replicaPath, loaded: true, exports: rep
    };
    delete require.cache[customPagePath];
    global.__page = null;
    require(customPagePath);
    return global.__page;
  };
  const realReplicaData = decorate.readReplica();
  let redirectedTo = '';
  const oldRedirect = global.wx.redirectTo;
  global.wx.redirectTo = (opt) => { redirectedTo = opt && opt.url; };
  const aliasPage = loadCustomPage(realReplicaData);
  aliasPage.data = JSON.parse(JSON.stringify(aliasPage.data));
  aliasPage.setData = function (d) { Object.assign(this.data, d); };
  aliasPage.onLoad({ key: 'activity' });
  ok('小程序端用旧标识打开 → 重定向到新标识',
    redirectedTo === '/pages/custom/index?key=activity-final&_r=1', redirectedTo || '(没有跳转)');
  redirectedTo = '';
  aliasPage.onLoad({ key: 'activity-final' });
  ok('用新标识打开 → 直接渲染，不再跳转', redirectedTo === '' && aliasPage.data.missing === false);
  ok('渲染出的页名来自新标识的数据', aliasPage.data.title === '春季活动页', aliasPage.data.title);
  global.wx.redirectTo = oldRedirect;

  // 强制删除：别名必须一并清掉（否则旧链接会跳到一个不存在的标识）
  const del2 = decorate.removeCustomPage('activity-final', { force: 1 });
  ok('force=1 时删除成功', del2.key === 'activity-final');
  ok('删除后别名表已清理干净', Object.keys(customPages.aliases()).length === 0,
    JSON.stringify(customPages.aliases()));
  const R3 = decorate.readReplica();
  ok('删除后 replica 里不再有该页与相关别名',
    !(R3.CUSTOM_PAGES || {})['activity-final'] && !(R3.CUSTOM_PAGE_ALIASES || {}).activity);
}

/* ------------------------------------------------------------------ *
 * 10 · 店铺设置：名称 / Logo 只认装修台这一个数据源
 * ------------------------------------------------------------------ */

section('10 · 店铺名称与 Logo 的单一数据源');
{
  const err = throws(() => catalog.saveSettings({ shopName: '另一个名字' }));
  ok('通过店铺设置接口改店铺名称被明确拒绝（不再假成功）',
    !!err && /装修台/.test(err.message), err && err.message);
  const err2 = throws(() => catalog.saveSettings({ logo: '/uploads/x.png' }));
  ok('通过店铺设置接口改 Logo 同样被拒绝', !!err2, err2 && err2.message);

  const s = catalog.settings();
  ok('拒绝之后数据未被改动', s.shopName !== '另一个名字');

  // 运营参数仍然可以正常保存（它们不属于前端展示字段，走 catalog.json 这份真源）
  const saved = catalog.saveSettings({ servicePhone: '400-000-1234' });
  ok('客服电话等运营参数仍可保存', saved.servicePhone === '400-000-1234', saved.servicePhone);
  catalog.saveSettings({ servicePhone: s.servicePhone });
}

/* ------------------------------------------------------------------ *
 * 14 · 请求体解析：非法 JSON / 非对象 JSON 必须报错；数字样文本不得被改写
 *
 * 历史缺陷：`JSON.parse` 成功就当成「参数拿到了」——
 *   · 解析失败时 catch 里 `resolve({})`，把「客户端发坏了」伪装成「没传参数」；
 *   · 递归把**所有**形如数字的字符串转成 Number，于是邮编 010010 变成 10010、
 *     编号 00123 变成 123，而且这类字段（名称 / 编码 / 备注）本来就要原样保留。
 * 这里直接喂请求流给 parseBody，不依赖 HTTP 服务。
 * ------------------------------------------------------------------ */

section('14 · 请求体解析：非法 / 非对象 JSON 报错，数字样文本保持字符串');
{
  const { parseBody } = require(nodePath.join(ROOT, 'server/lib/http.js'));
  const { Readable } = require('node:stream');

  /** 造一个最小的请求对象（只用到事件流 + content-type 头） */
  const fakeReq = (raw, type) => {
    const r = new Readable({ read() {} });
    r.headers = { 'content-type': type || 'application/json' };
    process.nextTick(() => { r.push(Buffer.from(raw, 'utf8')); r.push(null); });
    return r;
  };
  const parse = (raw, type) => parseBody(fakeReq(raw, type)).then(
    (v) => ({ ok: true, v }), (e) => ({ ok: false, e }));

  const badJson = await parse('{ "name": "x", ');
  ok('非法 JSON → 报错（不是静默变成空对象）', !badJson.ok, badJson.ok ? JSON.stringify(badJson.v) : '');
  ok('非法 JSON 的错误码与 HTTP 状态正确（1001 / 400）',
    !badJson.ok && badJson.e.code === 1001 && badJson.e.httpStatus === 400,
    badJson.ok ? '' : `code=${badJson.e.code} status=${badJson.e.httpStatus}`);

  const shapes = [['null', 'null'], ['123', '数字'], ['"abc"', '字符串'], ['[1,2]', '数组']];
  const badShapes = [];
  for (const [raw, label] of shapes) {
    const r = await parse(raw);
    if (r.ok || r.e.code !== 1001 || r.e.httpStatus !== 400) badShapes.push(label);
  }
  ok('合法 JSON 但不是对象（null / 数字 / 字符串 / 数组）一律 1001 + 400', badShapes.length === 0,
    badShapes.length ? '未拦住：' + badShapes.join('、') : '4 种形态全部拦住');

  const numText = await parse(JSON.stringify({ detail: '010010', code: '00123', name: '联调001' }));
  ok('形如数字的文本字段原样保留（detail / code / name 未被转成数字）',
    numText.ok && numText.v.detail === '010010' && numText.v.code === '00123' && numText.v.name === '联调001',
    numText.ok ? JSON.stringify(numText.v) : '');

  // JSON 请求体：类型由客户端给出，一律不转换（连白名单键也不动）——
  // 「已经是 JSON 还去猜类型」正是当初把 010010 变成 10010 的写法。
  const numKeys = await parse(JSON.stringify({ page: '2', quantity: '3', name: '001' }));
  ok('JSON 请求体不做任何类型猜测（连 page / quantity 也原样保留）',
    numKeys.ok && numKeys.v.page === '2' && numKeys.v.quantity === '3' && numKeys.v.name === '001',
    numKeys.ok ? JSON.stringify(numKeys.v) : '');

  // 表单编码全是字符串，必须只对白名单键做数字归一
  const form = await parse('detail=010010&page=2&quantity=3', 'application/x-www-form-urlencoded');
  ok('表单编码：白名单键（page / quantity）转数字，其余键保持字符串',
    form.ok && form.v.detail === '010010' && form.v.page === 2 && form.v.quantity === 3,
    form.ok ? JSON.stringify(form.v) : '');

  const empty = await parse('');
  ok('空请求体 → 空对象（这是唯一允许「当成没传参」的情况）',
    empty.ok && JSON.stringify(empty.v) === '{}', empty.ok ? JSON.stringify(empty.v) : '');
}

/* ------------------------------------------------------------------ *
 * 15 · 自检判定函数：服务端异常绝不算「预期拦截」
 *
 * 这直接对应报告的验收句：「故意让接口抛出服务端错误时，权限/参数校验用例必须失败」。
 * 端到端的实证在 .tooling/test-inject-server-error.mjs（注入代理 + 跑真实 check-all），
 * 这里补一层纯函数矩阵，保证判定本身不会退化成「非 0 即通过」。
 * ------------------------------------------------------------------ */

section('15 · 自检判定函数（expectFail 不得把 5000 当「已拦住」）');
{
  const { judge } = await import('../server/tools/expect.mjs');
  const cases = [
    ['code 5000 必须判失败', { httpStatus: 200, json: { code: 5000 }, expectFail: 'x' }, false],
    ['HTTP 500 必须判失败', { httpStatus: 500, json: { code: 5000 }, expectFail: 'x' }, false],
    ['请求未完成（连接重置）判失败', { httpStatus: 0, json: null, errMsg: 'ECONNRESET', expectFail: 'x' }, false],
    ['参数错误 1001 算预期拦截', { httpStatus: 200, json: { code: 1001 }, expectFail: 'x' }, true],
    ['401 算预期拦截', { httpStatus: 401, json: { code: 401 }, expectFail: 'x' }, true],
    ['404 算预期拦截', { httpStatus: 404, json: { code: 404 }, expectFail: 'x' }, true],
    ['期望拦截但实际成功 → 失败', { httpStatus: 200, json: { code: 0 }, expectFail: 'x' }, false],
    ['expectHttp 不符 → 失败', { httpStatus: 200, json: { code: 1001 }, expectFail: 'x', expectHttp: 403 }, false],
    ['expectCode 不符 → 失败', { httpStatus: 403, json: { code: 1001 }, expectFail: 'x', expectCode: 2000 }, false],
    ['三项同时命中才算过', { httpStatus: 403, json: { code: 403 }, expectFail: 'x', expectHttp: 403, expectCode: 403 }, true],
    ['正常请求：200 + code 0 才算过', { httpStatus: 200, json: { code: 0 } }, true],
    ['正常请求遇到 5000 也判失败', { httpStatus: 200, json: { code: 5000 } }, false]
  ];
  const wrong = cases.filter(([, input, want]) => judge(input).passed !== want).map(([n]) => n);
  ok('判定矩阵 12 种组合全部符合预期（含 5000 / 5xx / 期望不符 / 请求未完成）',
    wrong.length === 0, wrong.length ? '不符：' + wrong.join('；') : '');
}

/* ------------------------------------------------------------------ *
 * 收尾：确认没碰真实数据
 * ------------------------------------------------------------------ */

section('隔离性检查');
{
  const after = fs.existsSync(REAL_DATA) ? fs.readdirSync(REAL_DATA).sort().join('|') : '(不存在)';
  ok('server/data 目录内容未被本次测试改动', after === realDataSnapshot,
    'before=' + realDataSnapshot + ' after=' + after);
  const h2 = fs.existsSync(REAL_REPLICA)
    ? fs.statSync(REAL_REPLICA).size + ':' + fs.statSync(REAL_REPLICA).mtimeMs : '';
  ok('miniprogram/config/replica.js 未被改写', h2 === realReplicaHash,
    'before=' + realReplicaHash + ' after=' + h2);
}

catalogStore.flushNow();
dbStore.flushNow();
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + ' 条）');
if (fail) {
  console.log('失败项：\n  - ' + fails.join('\n  - '));
  process.exitCode = 1;
}
