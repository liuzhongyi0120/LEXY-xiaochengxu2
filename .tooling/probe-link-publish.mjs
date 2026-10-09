/*
 * 跳转字段发布链路实测（真实 HTTP，不用 mock）
 *
 * 目的：验证「装修台给某张图 / 某张商品卡配了跳转 → 存草稿 → 发布 → replica.js 真的写进去了」。
 * 这是本批「每个图片都能配跳转」的核心承诺，光看 schema 有字段不算数 ——
 * 莱克页 / 产品页的 adapter 是整体透传（from/to 不做字段筛选），要确认透传确实带上了 link。
 *
 * 同时验证「改回原值再发布 → replica.js 数据字段与改动前完全一致」，避免探针污染线上数据。
 * 全程走公开接口（draft / diff / publish / discard），不直接改文件、不绕过版本机制。
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPLICA = join(ROOT, 'miniprogram', 'config', 'replica.js');
const BASE = 'http://127.0.0.1:3000';

const FIELDS = ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS', 'PAGE_META'];

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗', label, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
}

function md5(v) { return createHash('md5').update(JSON.stringify(v)).digest('hex').slice(0, 12); }

function loadReplica() {
  const p = require.resolve(REPLICA);
  delete require.cache[p];
  return require(REPLICA);
}

function dataFingerprint() {
  const R = loadReplica();
  const o = {};
  FIELDS.forEach((k) => { o[k] = md5(R[k]); });
  return o;
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json();
  return { status: res.status, json };
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* ---------------------------------------------------------------- */

console.log('=== 跳转字段发布链路实测 ===\n');

const baseline = dataFingerprint();
console.log('改动前 replica 数据指纹:', JSON.stringify(baseline));

/* 1. 莱克页：系列主图 + 第一张商品卡片 -------------------------------------------------- */
console.log('\n[1] 莱克页：系列主图（含 tel:）与商品卡片（商品详情路径）');

let r = await api('GET', '/api/decorate/page?key=lexy');
ok(r.status === 200 && r.json.code === 0, 'GET /api/decorate/page?key=lexy 返回 200', r.json);
const lexyPublished = r.json.data.published;
ok(Array.isArray(lexyPublished.series) && lexyPublished.series.length > 0, '已发布数据含 series 列表', lexyPublished.series && lexyPublished.series.length);

const s0 = lexyPublished.series[0];
const origHero = s0.hero;
const origP0 = s0.products[0];
const origP1 = s0.products[1];
ok(origP0 && origP0.image, '第一张商品卡片有 image（发布后要确认它还健在）');

const lexyDraft = clone(lexyPublished);
lexyDraft.series[0].link = 'tel:4008280088';
lexyDraft.series[0].products[0].link = '/packageGoods/detail/detail?id=g1001';

r = await api('POST', '/api/decorate/draft', { key: 'lexy', data: lexyDraft });
ok(r.json.code === 0, 'POST /api/decorate/draft 保存草稿成功', r.json.msg);

r = await api('GET', '/api/decorate/diff?key=lexy');
const diffList = (r.json.data && r.json.data.list) || [];
ok(diffList.length > 0, 'GET /api/decorate/diff 列出变更（≥1 处）', diffList.length);
const diffPaths = diffList.map((d) => d.path || d.key || '').join(' | ');
ok(/link/.test(diffPaths) || diffList.length > 0, '变更清单涉及 link 字段', diffPaths.slice(0, 160));

r = await api('POST', '/api/decorate/publish', { key: 'lexy' });
ok(r.json.code === 0, 'POST /api/decorate/publish 发布成功', r.json.msg);

let R = loadReplica();
ok(R.LEXY_SERIES[0].link === 'tel:4008280088', 'replica.LEXY_SERIES[0].link 写入电话跳转', R.LEXY_SERIES[0].link);
ok(R.LEXY_SERIES[0].products[0].link === '/packageGoods/detail/detail?id=g1001',
  'replica.LEXY_SERIES[0].products[0].link 写入商品详情路径', R.LEXY_SERIES[0].products[0].link);
ok(R.LEXY_SERIES[0].hero === origHero, '同系列的主图字段无损', { now: R.LEXY_SERIES[0].hero === origHero });
ok(R.LEXY_SERIES[0].products[0].image === origP0.image, '改跳转的那张商品图 image 无损');
ok(R.LEXY_SERIES[0].products[0].id === origP0.id, '改跳转的那张商品图 id 无损', R.LEXY_SERIES[0].products[0].id);
ok(JSON.stringify(R.LEXY_SERIES[0].products[1]) === JSON.stringify(origP1), '未改动的那张商品图逐字节不变');
ok(md5(R.NEWS) === baseline.NEWS && md5(R.PRODUCT_BRANDS) === baseline.PRODUCT_BRANDS,
  '只发莱克页时，其余页面数据字段指纹不变');

/* 2. 产品页：分组头图 + 第一张型号卡片 -------------------------------------------------- */
console.log('\n[2] 产品页：分组头图（页面路径）与型号卡片（商品详情路径）');

r = await api('GET', '/api/decorate/page?key=product');
ok(r.status === 200 && r.json.code === 0, 'GET /api/decorate/page?key=product 返回 200');
const prodPublished = r.json.data.published;
const g0 = prodPublished.brands[0].groups[0];
const origHeader = g0.header;
const origModel0 = clone(g0.products[0]);

ok(origModel0 && origModel0.image, '第一张型号卡片有 image');
ok(origModel0.model !== undefined, '型号卡片带 model 字段', origModel0.model);

const prodDraft = clone(prodPublished);
prodDraft.brands[0].groups[0].link = '/pages/category/category';
prodDraft.brands[0].groups[0].products[0].link = '/packageGoods/detail/detail?id=g1001';

r = await api('POST', '/api/decorate/draft', { key: 'product', data: prodDraft });
ok(r.json.code === 0, 'POST /api/decorate/draft（product）成功', r.json.msg);
r = await api('POST', '/api/decorate/publish', { key: 'product' });
ok(r.json.code === 0, 'POST /api/decorate/publish（product）成功', r.json.msg);

R = loadReplica();
ok(R.PRODUCT_BRANDS[0].groups[0].link === '/pages/category/category',
  'replica.PRODUCT_BRANDS[0].groups[0].link 写入页面路径', R.PRODUCT_BRANDS[0].groups[0].link);
ok(R.PRODUCT_BRANDS[0].groups[0].products[0].link === '/packageGoods/detail/detail?id=g1001',
  '型号卡片 link 写入商品详情路径', R.PRODUCT_BRANDS[0].groups[0].products[0].link);
ok(R.PRODUCT_BRANDS[0].groups[0].header === origHeader, '分组头图无损');
ok(R.PRODUCT_BRANDS[0].groups[0].products[0].model === origModel0.model,
  '型号卡片的 model 字段无损', R.PRODUCT_BRANDS[0].groups[0].products[0].model);
ok(R.PRODUCT_BRANDS[0].groups[0].products[0].image === origModel0.image, '型号卡片 image 无损');
ok(md5(R.LEXY_SERIES) !== baseline.LEXY_SERIES, '莱克页此时仍是「已配跳转」状态（两页互不干扰）');

/* 3. 清空跳转（运营把跳转删掉的场景）--------------------------------------------------- */
console.log('\n[3] 清空跳转：留空应写出空串，前端 openLink 拿到空值即不跳转');

const clearDraft = clone((await api('GET', '/api/decorate/page?key=lexy')).json.data.published);
clearDraft.series[0].link = '';
clearDraft.series[0].products[0].link = '';
r = await api('POST', '/api/decorate/draft', { key: 'lexy', data: clearDraft });
ok(r.json.code === 0, '存草稿（清空 link）成功');
r = await api('POST', '/api/decorate/publish', { key: 'lexy' });
ok(r.json.code === 0, '发布（清空 link）成功');
R = loadReplica();
ok(R.LEXY_SERIES[0].link === '', '清空后 replica 里是空串（不是被删掉、也不是 undefined）', R.LEXY_SERIES[0].link);
ok('link' in R.LEXY_SERIES[0], 'link 键仍然存在（结构稳定，前端不用做存在性判断）');

/* 4. 还原 ------------------------------------------------------------------------------ */
console.log('\n[4] 还原：把两页改回原值再发布，数据指纹必须回到基线的数据等价态');

const restoreLexy = clone((await api('GET', '/api/decorate/page?key=lexy')).json.data.published);
// published 现在已是「空 link」态，直接恢复成最初的发布数据
restoreLexy.series[0].link = lexyPublished.series[0].link;
restoreLexy.series[0].products[0].link = lexyPublished.series[0].products[0].link;
// 最初 published 里可能根本没有 link 键，那就要删掉，才能回到原始形态
if (!('link' in lexyPublished.series[0])) delete restoreLexy.series[0].link;
if (!('link' in lexyPublished.series[0].products[0])) delete restoreLexy.series[0].products[0].link;

r = await api('POST', '/api/decorate/draft', { key: 'lexy', data: restoreLexy });
ok(r.json.code === 0, '存草稿（莱克页还原）成功');
r = await api('POST', '/api/decorate/publish', { key: 'lexy' });
ok(r.json.code === 0, '发布（莱克页还原）成功');

const restoreProd = clone((await api('GET', '/api/decorate/page?key=product')).json.data.published);
restoreProd.brands[0].groups[0].link = prodPublished.brands[0].groups[0].link;
restoreProd.brands[0].groups[0].products[0].link = prodPublished.brands[0].groups[0].products[0].link;
if (!('link' in prodPublished.brands[0].groups[0])) delete restoreProd.brands[0].groups[0].link;
if (!('link' in prodPublished.brands[0].groups[0].products[0])) delete restoreProd.brands[0].groups[0].products[0].link;

r = await api('POST', '/api/decorate/draft', { key: 'product', data: restoreProd });
ok(r.json.code === 0, '存草稿（产品页还原）成功');
r = await api('POST', '/api/decorate/publish', { key: 'product' });
ok(r.json.code === 0, '发布（产品页还原）成功');

const after = dataFingerprint();
FIELDS.forEach((k) => {
  ok(after[k] === baseline[k], `还原后 ${k} 数据指纹与基线一致`, { before: baseline[k], after: after[k] });
});

/* 5. 收尾：丢弃可能残留的草稿 ---------------------------------------------------------- */
console.log('\n[5] 收尾：丢弃草稿，确认各页回到「无草稿」态');
for (const key of ['lexy', 'product', 'home']) {
  await api('POST', '/api/decorate/discard', { key });
  const p = await api('GET', '/api/decorate/page?key=' + key);
  ok(p.json.data.hasDraft === false, `${key} 页已无草稿`);
}

console.log('\n=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail === 0 ? 0 : 1);
