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
ok(Object.keys(R.PAGE_META).length === 5, 'PAGE_META 仍为 5 个页面', Object.keys(R.PAGE_META).join(','));
ok(R.HOME_BLOCKS.length === beforeBlocks, 'HOME_BLOCKS 区块数与发布前一致（' + beforeBlocks + '）', String(R.HOME_BLOCKS.length));
/*
 * 导出字段：6 个内置字段 + PAGE_META + TABBAR（店铺导航）。
 * TABBAR 总是存在 —— nav 页的 from() 会把「replica 里还没有」也归一成默认值，
 * 所以任何一次发布都会把它显式写进 replica.js（详见 decorate/emit.js 的说明）。
 * 这里断言「不多不少」，防止发布链路凭空多出/丢掉字段。
 */
ok(Object.keys(R).length === 8 &&
  ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS', 'PAGE_META', 'TABBAR']
    .every((k) => Object.keys(R).indexOf(k) > -1),
  'module.exports 恰为 8 个字段（6 内置 + PAGE_META + TABBAR）', Object.keys(R).join(','));
ok(R.TABBAR && R.TABBAR.items.length >= 2 && R.TABBAR.items.length <= 5,
  'TABBAR 结构合法（2~5 项）', R.TABBAR ? String(R.TABBAR.items.length) : 'undefined');

console.log('[7] 草稿应已清空');
const pageAfter = await api('/api/decorate/page?key=home');
ok(pageAfter.hasDraft === false, '发布后草稿已清空');

console.log('[8] 回滚到 ' + beforeVersion + ' 并发布，还原测试数据');
const rb = await api('/api/decorate/rollback', { key: 'home', versionId: beforeVersion, mode: 'publish' });
ok(rb.published && rb.published.ok, '回滚并发布成功 → ' + (rb.published && rb.published.versionId), JSON.stringify(rb.published));

console.log('[9] 核对已还原');
R = readReplica();
ok(R.PAGE_META.home.bg === ORIG, 'PAGE_META.home.bg 已还原为 ' + ORIG, R.PAGE_META.home.bg);
ok(Object.keys(R.PAGE_META).length === 5, 'PAGE_META 仍为 5 个页面（回滚不丢键）', Object.keys(R.PAGE_META).join(','));
ok(R.HOME_BLOCKS.length === beforeBlocks, 'HOME_BLOCKS 区块数回滚后仍一致（' + beforeBlocks + '）', String(R.HOME_BLOCKS.length));

const st = JSON.parse(fs.readFileSync('C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/server/data/decorate/state.json', 'utf8'));
ok(Object.keys(st.drafts).length === 0, '草稿区为空', Object.keys(st.drafts).join(','));
ok(Array.isArray(st.versions) && st.versions.every((v, i, a) => i === 0 || a[i - 1].at >= v.at), '版本历史按时间倒序且非空（共 ' + st.versions.length + ' 条）');

console.log('');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
