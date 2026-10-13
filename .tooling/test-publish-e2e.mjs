/**
 * 端到端：改草稿 → 查看变更 → 生成代码 → 核对 replica.js → 回滚还原
 * 用页面背景色做载体（可逆、不影响区块结构）
 *
 * ⚠️ 装修点位（/api/decorate/*）在报告 08 之后全部要求管理员令牌：
 *    脚本启动时先换一个会话，所有请求都带上 Authorization。
 *    拿不到管理员会话就**直接停下并说清怎么配** ——
 *    否则第一条请求就 401，看起来像「装修接口坏了」。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { adminToken, authHeaders } from './_admin.mjs';
const require = createRequire(import.meta.url);

const BASE = 'http://127.0.0.1:3000';
const REPLICA = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/miniprogram/config/replica.js';

let ADMIN = '';

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); } };

async function api(path, body) {
  const headers = authHeaders(ADMIN);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, body === undefined ? { headers } : {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const j = await r.json();
  /* 业务失败时**把整个信封交出去**，不要只取 `data`：
     服务端的失败响应是 `{code, msg, data: null}`，只取 data 会拿到 `null`，
     调用方再写 `x.published` 就以 `TypeError: Cannot read properties of null` 的形式炸掉 ——
     真正的原因（比如「缺少版本号 versionId」）反而被吞掉，
     顺便还会让「还原测试数据」这步**半途中断**（2026-10-12 踩过，见第 [8] 步注释）。 */
  if (j && j.code !== 0) return j;
  return j.data !== undefined ? j.data : j;
}

function readReplica() {
  delete require.cache[require.resolve(REPLICA)];
  return require(REPLICA);
}

const ORIG = '#F5F6F8';
const TEST = '#FFEEDD';

try {
  ADMIN = await adminToken(BASE);
  console.log('管理员会话已就绪（报告 08：装修点位均要求管理员身份）');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

console.log('[1] 读取首页当前状态');
const page = await api('/api/decorate/page?key=home');
const beforeBg = page.data.meta.bg;
const beforeBlocks = page.data.blocks.length;

/* PAGE_META 的期望键集 = 内置 5 页 + 当前 replica 里的自定义页（**不含**店铺导航）。
   ⚠️ 不写死「5」：自定义页也进 PAGE_META，运营建一个页面这个数字就变。
      锁「等于内置 + 自定义」才是这条断言要保证的等价关系。 */
const wantMetaKeys = (R) => ['home', 'lexy', 'news', 'product', 'mine']
  .concat(Object.keys(R.CUSTOM_PAGES || {}))
  .sort().join(',');
const metaKeys = (R) => Object.keys(R.PAGE_META || {}).sort().join(',');
const beforeVersion = page.versions[0] && page.versions[0].id;
console.log(`    背景=${beforeBg} 区块=${beforeBlocks} 最新版本=${beforeVersion}`);
ok(beforeBg === ORIG, '初始背景为 ' + ORIG, beforeBg);
ok(beforeBlocks >= 11, '初始区块数不少于 11（实际 ' + beforeBlocks + '，数量随运营内容变化）', String(beforeBlocks));

console.log('[2] 改草稿（背景色 → ' + TEST + '）');
const draft = JSON.parse(JSON.stringify(page.data));
draft.meta.bg = TEST;
const saved = await api('/api/decorate/draft', { key: 'home', data: draft });
ok(!!saved.at, '草稿已保存', saved.atText);

console.log('[3] 查看变更清单');
const d = await api('/api/decorate/diff?key=home');
ok(d.hasDraft === true, '检测到草稿');
ok((d.list || []).some((x) => String(x.path).includes('meta') || String(x.path).includes('bg')), '变更清单包含背景色字段', JSON.stringify((d.list || []).map((x) => x.path)));

console.log('[4] 确认草稿不影响线上文件（发布前）');
let R = readReplica();
ok(R.PAGE_META.home.bg === ORIG, 'replica.js 仍是 ' + ORIG + '（草稿未泄漏到线上）', R.PAGE_META.home.bg);

console.log('[5] 发布');
const pub = await api('/api/decorate/publish', { key: 'home', note: 'e2e 验证' });
ok(pub.ok === true, '发布成功，版本 ' + pub.versionId, pub.versionId);

console.log('[6] 核对 replica.js（发布后）');
R = readReplica();
ok(R.PAGE_META.home.bg === TEST, 'PAGE_META.home.bg 写回为 ' + TEST, R.PAGE_META.home.bg);
ok(metaKeys(R) === wantMetaKeys(R), 'PAGE_META 键集仍为「内置 5 页 + 自定义页」（发布不丢键）', Object.keys(R.PAGE_META).join(','));
ok(R.HOME_BLOCKS.length === beforeBlocks, 'HOME_BLOCKS 区块数与发布前一致（' + beforeBlocks + '）', String(R.HOME_BLOCKS.length));
/*
 * 导出字段：6 个内置字段 + PAGE_META + TABBAR（店铺导航）。
 * TABBAR 总是存在 —— nav 页的 from() 会把「replica 里还没有」也归一成默认值，
 * 所以任何一次发布都会把它显式写进 replica.js（详见 decorate/emit.js 的说明）。
 * 这里断言「不多不少」，防止发布链路凭空多出/丢掉字段。
 */
/*
 * 导出字段：9 个内置字段 + 可选的自定义页字段。
 * MINE_BLOCKS 是 2026-10-10 加的（「我的」页升级为区块流页）—— 它在 emit.js 的 need 列表里，
 * 新增页面时同步改这里，防止发布链路凭空多出/丢掉字段。
 */
{
  const CORE = ['SHOP', 'HOME_BLOCKS', 'MINE_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS', 'PAGE_META', 'TABBAR'];
  const OPTIONAL = ['CUSTOM_PAGES', 'CUSTOM_PAGE_ALIASES'];
  const actual = Object.keys(R);
  const missingCore = CORE.filter((k) => actual.indexOf(k) < 0);
  const unknown = actual.filter((k) => CORE.indexOf(k) < 0 && OPTIONAL.indexOf(k) < 0);
  ok(missingCore.length === 0 && unknown.length === 0,
    'module.exports = 9 个内置字段（含 MINE_BLOCKS）+ 自定义页字段，不多不少',
    (missingCore.length ? '缺 ' + missingCore.join(',') : '') + (unknown.length ? ' 多出 ' + unknown.join(',') : '') || actual.join(','));
}
ok(R.TABBAR && R.TABBAR.items.length >= 2 && R.TABBAR.items.length <= 5,
  'TABBAR 结构合法（2~5 项）', R.TABBAR ? String(R.TABBAR.items.length) : 'undefined');

console.log('[7] 草稿应已清空');
const pageAfter = await api('/api/decorate/page?key=home');
ok(pageAfter.hasDraft === false, '发布后草稿已清空');

console.log('[8] 还原测试数据（**不依赖版本回滚**）');
/*
 * ⚠️ 还原绝对不能挂在「回滚到某个历史版本」上。
 *   版本的保留窗口只有最近 20 条（store.js 的 trimVersions），装修台里**任何一次别页发布**
 *   都会占位 —— 首页一旦不在窗口内，`page.versions` 就是空数组、`beforeVersion` 为 undefined，
 *   回滚请求必然失败，于是「测试色」就**留在了 replica.js 里被当成线上内容**。
 *
 *   2026-10-12 真的发生过：复刻「资讯栏目 8 页」时连续发布了 p295 / p297 / p301，
 *   把 home 挤出窗口；本测试崩在第 [8] 步，`PAGE_META.home.bg` 停在了测试色 #FFEEDD，
 *   而且因为崩在还原步骤之前，「失败」看起来像是回滚接口坏了，很容易被当成环境抖动。
 *
 *   所以还原走「把第 [1] 步读到的**原始 data 原样写回草稿 → 再发布**」：
 *   与版本历史无关、永远可执行，失败会明确报在两条断言上。
 */
const rbDraft = await api('/api/decorate/draft', { key: 'home', data: page.data });
ok(!!(rbDraft && rbDraft.at), '原始数据已回写为草稿', rbDraft && (rbDraft.atText || rbDraft.msg));
const rbPub = await api('/api/decorate/publish', { key: 'home', note: 'e2e 还原' });
ok(!!(rbPub && rbPub.ok), '已重新发布还原（版本 ' + (rbPub && rbPub.versionId) + '）',
  rbPub && (rbPub.msg || rbPub.versionId));

/* 版本回滚**本身**也要测，但它会改状态，所以：
   ① 只在首页确实有历史条目时验（没有就**明说跳过**，不让它悄悄变成永不执行的断言）；
   ② 用 mode:'draft'（只动草稿、不碰 replica.js）；
   ③ 验完立刻 discard 收尾，保证第 [9] 步的「草稿区为空」仍成立。 */
if (beforeVersion) {
  const rb = await api('/api/decorate/rollback', { key: 'home', versionId: beforeVersion, mode: 'draft' });
  ok(!!(rb && rb.mode === 'draft' && rb.pageKey === 'home'),
    '版本回滚可执行（回滚到 ' + beforeVersion + '，mode=draft 不动线上）', JSON.stringify(rb));
  const dis = await api('/api/decorate/discard', { key: 'home' });
  ok(!!(dis && dis.discarded === true), '回滚产生的草稿可被 discard 丢弃（不留残渣）', JSON.stringify(dis));
} else {
  console.log('    · 跳过「版本回滚」子项：首页不在最近 ' + (page.versions || []).length +
    ' 条版本窗口内，回滚无从取值。该子项**不再承担还原职责**，跳过是安全的。');
}

console.log('[9] 核对已还原');
R = readReplica();
ok(R.PAGE_META.home.bg === ORIG, 'PAGE_META.home.bg 已还原为 ' + ORIG, R.PAGE_META.home.bg);
ok(R.PAGE_META.home.bg !== TEST, '测试色 ' + TEST + ' 未残留在线上文件里', R.PAGE_META.home.bg);
ok(metaKeys(R) === wantMetaKeys(R), 'PAGE_META 键集仍为「内置 5 页 + 自定义页」（回滚不丢键）', Object.keys(R.PAGE_META).join(','));
ok(R.HOME_BLOCKS.length === beforeBlocks, 'HOME_BLOCKS 区块数回滚后仍一致（' + beforeBlocks + '）', String(R.HOME_BLOCKS.length));

const st = JSON.parse(fs.readFileSync('C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/server/data/decorate/state.json', 'utf8'));
ok(Object.keys(st.drafts).length === 0, '草稿区为空', Object.keys(st.drafts).join(','));
ok(Array.isArray(st.versions) && st.versions.every((v, i, a) => i === 0 || a[i - 1].at >= v.at), '版本历史按时间倒序且非空（共 ' + st.versions.length + ' 条）');

console.log('');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
