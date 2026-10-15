/**
 * 自定义页面全流程冒烟（lib 层，不经过 HTTP）
 *
 * 覆盖：新建 → 列表可见 → 打开编辑器 → 存草稿 → 发布（replica 出现 CUSTOM_PAGES）
 *       → 回滚 → 改名（key 迁移）→ 删除（replica 里清干净）→ 恢复原文件
 *
 * ── 2026-10-15 改成**完全隔离**运行 ─────────────────────────────────────────
 * 原来跑在真实数据上（真 `server/data/decorate/state.json` + 真 `replica.js`），
 * 收尾再写回原字节 —— 那是「靠善后换来的安全」：中途抛异常或被中断，真实文件
 * 就留在被改过的状态上。
 *
 * 更要命的是它**假设基线 replica.js 里没有 CUSTOM_PAGES**（三条断言直接查
 * `indexOf('CUSTOM_PAGES') < 0`）。真实数据里一旦发布过自定义页，这三条就
 * 永久假红（实测 37/40）—— 而它们想表达的其实是「没发布过就不该出现」，
 * 是**探针自己的前提过期**，不是被测代码坏了。假红比不检查更糟。
 *
 * 现在：`MALL_DATA_DIR` + `MALL_REPLICA_FILE` 全指向临时目录；基线 replica 用
 * **真 emit 器**从真实 replica 对象重新生成一份、并删掉自定义页 / 店铺笔记相关段，
 * 所以基线确定性地「干净」，那三条断言恢复有效且表达的是真事实。
 * 全程不碰 `server/data` 与 `miniprogram/config/replica.js` 任何一个字节（末节自断言）。
 *
 * 用法：node .tooling/probe-custom.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const nodePath = require('node:path');

const ROOT = nodePath.join(__dirname, '..');

/* ⚠️ 必须在 require 任何存储模块**之前**设好：它们在模块加载期就把目录定死了 */
const TMP = nodePath.join(os.tmpdir(), 'mall-probe-custom-' + process.pid);
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.MALL_DATA_DIR = TMP;
process.env.MALL_REPLICA_FILE = nodePath.join(TMP, 'replica.out.js');

const REAL_REPLICA = nodePath.join(ROOT, 'miniprogram', 'config', 'replica.js');
const REAL_STATE = nodePath.join(ROOT, 'server/data/decorate/state.json');
const REAL_DATA_DIR = nodePath.join(ROOT, 'server/data');

/*
 * 硬护栏：隔离没生效就**当场拒跑**，别指望「收尾还原」兜住。
 * 这条是被一次改坏实验逼出来的 —— 把 MALL_REPLICA_FILE 指回真实文件后，
 * 探针照跑不误，收尾还把「改过的基线」当成原文件写了回去，
 * 真实 replica.js 从 101KB 被写成 34KB（CUSTOM_PAGES / SHOPNOTES 整段没了），
 * 只能 git checkout 救回。**隔离断言自己也靠不住时，就得在入口硬拦。**
 */
if (nodePath.resolve(process.env.MALL_REPLICA_FILE) === REAL_REPLICA) {
  throw new Error('隔离失效：MALL_REPLICA_FILE 指向真实 replica.js，拒绝运行');
}
if (nodePath.resolve(process.env.MALL_DATA_DIR) === REAL_DATA_DIR) {
  throw new Error('隔离失效：MALL_DATA_DIR 指向真实 server/data，拒绝运行');
}

/** 真实文件的「跑之前」快照 —— 必须在 seedBaselineReplica **之前**取，
 *  否则「隔离失效把真实文件改干净了」会被自己的快照掩盖过去（改坏实验实测过）。 */
const realReplicaSnapshot = fs.readFileSync(REAL_REPLICA, 'utf8');
const realStateSnapshot = fs.existsSync(REAL_STATE) ? fs.readFileSync(REAL_STATE, 'utf8') : null;

/* 造干净基线：真 emit 器 + 真 replica 对象，去掉自定义页 / 笔记那两段 */
(function seedBaselineReplica() {
  const emit = require(nodePath.join(ROOT, 'server/decorate/emit'));
  const real = require(REAL_REPLICA);
  const base = Object.assign({}, real);
  delete base.CUSTOM_PAGES;
  delete base.CUSTOM_PAGE_ALIASES;
  delete base.SHOPNOTES;
  fs.writeFileSync(process.env.MALL_REPLICA_FILE, emit.emitReplica(base, {
    originalSrc: emit.readOriginal(REAL_REPLICA),
    publishedAt: '2026-01-01 00:00:00'
  }), 'utf8');
})();

const store = require(nodePath.join(ROOT, 'server/decorate/store'));
const schema = require(nodePath.join(ROOT, 'server/decorate/schema'));
const customPages = require(nodePath.join(ROOT, 'server/decorate/customPages'));

const TEST_KEY = 'zzselftest';
const TEST_NAME = '自检临时页';
const REPLICA = store.REPLICA_FILE;
const STATE = nodePath.join(TMP, 'decorate', 'state.json');

const results = [];
function ok(label, pass, extra) {
  results.push({ label, pass: !!pass, extra: extra === undefined ? '' : String(extra) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra === undefined ? '' : '  → ' + extra}`);
}

const originalReplica = fs.readFileSync(REPLICA, 'utf8');
const originalState = fs.existsSync(STATE) ? fs.readFileSync(STATE, 'utf8') : null;

/** 收尾：删掉自检页面（隔离目录里）、刷盘，并清掉临时目录 */
function cleanup() {
  try {
    customPages.list().filter((p) => p.key.indexOf('zzselftest') === 0).forEach((p) => {
      try { store.removeCustomPage(p.key); } catch (e) { try { customPages.remove(p.key); } catch (_) { /* ignore */ } }
    });
  } catch (e) { /* ignore */ }
  // 注册表是 50ms 合并落盘，进程退出前必须强制写一次，否则自检页会残留在文件里
  try { customPages.flushNow(); } catch (e) { /* ignore */ }
  fs.writeFileSync(REPLICA, originalReplica, 'utf8');
  if (originalState !== null) fs.writeFileSync(STATE, originalState, 'utf8');
  /* 隔离目录整体删掉 —— 里面只有本次运行产生的临时文件 */
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

try {
  if (customPages.has(TEST_KEY)) store.removeCustomPage(TEST_KEY);

  const baseCount = customPages.count();
  /* 店铺导航（key=nav，nav:true）是全局配置项，不是页面，统计内置页时要排除 */
  const baseBuiltin = schema.list().filter((p) => !p.custom && !p.nav).map((p) => p.key);

  /* 1. 新建 */
  const made = store.createCustomPage({ name: TEST_NAME, key: TEST_KEY, note: '自检', template: 'blank' });
  ok('新建页面返回定义', made.page && made.page.key === TEST_KEY, made.page && made.page.key);
  ok('新建页面带上小程序路径', made.page.path === 'pages/custom/index?key=' + TEST_KEY, made.page.path);
  ok('空白模板初始区块为空', Array.isArray(made.published.blocks) && made.published.blocks.length === 0,
    'blocks=' + made.published.blocks.length);

  /* 2. 列表与 schema */
  const listed = store.listPages().filter((p) => p.key === TEST_KEY)[0];
  ok('页面列表可见且标记为自定义页', !!listed && listed.custom === true,
    listed ? `belongs=${listed.belongs} source=${listed.source}` : 'not found');
  ok('新建后未发布，replica 里还没有它', fs.readFileSync(REPLICA, 'utf8').indexOf('CUSTOM_PAGES') < 0);

  const def = schema.get(TEST_KEY);
  ok('schema 能取到自定义页定义', !!def && def.custom === true);
  ok('自定义页字段 = 页面区块 + 页面设置',
    !!def && def.root.fields.map((f) => f.k).join(',') === 'blocks,meta',
    def && def.root.fields.map((f) => f.k).join(','));

  const page = store.getPage(TEST_KEY);
  ok('打开编辑器能拿到（空）区块数据', !!page && Array.isArray(page.data.blocks) && page.data.blocks.length === 0);
  ok('内置页仍是 5 个', baseBuiltin.length === 5, baseBuiltin.join(','));

  /* 3. 复制首页模板 */
  const made2 = store.createCustomPage({ name: '自检复制首页', key: 'zzselftest-home', template: 'home' });
  ok('复制首页模板带过来首页区块', made2.published.blocks.length > 5,
    'blocks=' + made2.published.blocks.length);
  ok('复制首页模板不共享引用（改副本不影响首页）',
    made2.published.blocks !== store.readReplica().HOME_BLOCKS);

  /* 4. 存草稿 */
  store.saveDraft(TEST_KEY, {
    blocks: [{ type: 'title', text: '装修自检标题', size: 'lg' }],
    meta: { desc: '自检页', bg: '#FFFFFF' }
  });
  const p2 = store.getPage(TEST_KEY);
  ok('存草稿后编辑器读到草稿', p2.hasDraft && p2.data.blocks.length === 1, 'hasDraft=' + p2.hasDraft);

  let rejected = '';
  try {
    store.saveDraft(TEST_KEY, { blocks: [{ type: '不存在的区块', text: 'x' }] });
  } catch (e) { rejected = e.message; }
  ok('未知区块类型被拒绝', /不支持/.test(rejected), rejected);

  /* 5. 发布 */
  const pub = store.publish(TEST_KEY, '自检发布');
  ok('发布成功并生成版本号', pub.ok && /^v\d+$/.test(pub.versionId), pub.versionId);

  const afterPublish = fs.readFileSync(REPLICA, 'utf8');
  ok('replica.js 出现 CUSTOM_PAGES 常量', /const CUSTOM_PAGES = \{/.test(afterPublish));
  ok('replica.js 导出了 CUSTOM_PAGES', /^\s*CUSTOM_PAGES,?$/m.test(afterPublish));
  ok('replica.js 写入了该页面数据',
    afterPublish.indexOf(TEST_KEY) >= 0 && afterPublish.indexOf('装修自检标题') >= 0);

  const reread = store.readReplica();
  ok('回读 replica 能取到该页面',
    !!(reread.CUSTOM_PAGES && reread.CUSTOM_PAGES[TEST_KEY] &&
      reread.CUSTOM_PAGES[TEST_KEY].blocks.length === 1));
  ok('replica 里仍保留 6 个内置字段 + PAGE_META',
    !!(reread.HOME_BLOCKS && reread.LEXY_SERIES && reread.NEWS && reread.PAGE_META));

  const p3 = store.getPage(TEST_KEY);
  ok('发布后草稿清空', !p3.hasDraft);
  ok('注册表保存了已发布数据', customPages.get(TEST_KEY).published.blocks.length === 1);

  /* 6. 再次读取不丢内容 */
  const fresh = store.getPage(TEST_KEY);
  ok('再次读取内容不丢',
    fresh.published.blocks.length === 1 && fresh.data.blocks[0].text === '装修自检标题');

  /* 7. 回滚 */
  store.saveDraft(TEST_KEY, { blocks: [{ type: 'notice', text: '改坏的草稿' }], meta: {} });
  const rb = store.rollback(TEST_KEY, pub.versionId, 'draft');
  const p4 = store.getPage(TEST_KEY);
  ok('回滚后草稿恢复为版本快照',
    rb.mode === 'draft' && p4.data.blocks[0].text === '装修自检标题',
    p4.data.blocks[0] && p4.data.blocks[0].text);

  /* 8. 改名（key 迁移） */
  const renamedKey = TEST_KEY + '-b';
  const rn = store.updateCustomPage(TEST_KEY, { name: TEST_NAME + '改名', key: renamedKey });
  ok('改标识后返回新 key', rn.page.key === renamedKey && rn.renamedFrom === TEST_KEY,
    `${rn.renamedFrom} → ${rn.page.key}`);
  ok('改名后旧 key 查不到', !schema.get(TEST_KEY));
  const p5 = store.getPage(renamedKey);
  ok('改名后已发布数据不丢',
    !!p5 && p5.published.blocks.length === 1 && p5.published.blocks[0].text === '装修自检标题',
    (p5 ? p5.published.blocks.length : 0) + ' blocks');
  const afterRename = fs.readFileSync(REPLICA, 'utf8');
  ok('replica 里的键名已同步',
    afterRename.indexOf(renamedKey) >= 0 && afterRename.indexOf('"' + TEST_KEY + '"') < 0);

  /* 9. 内置页保护 */
  let guard1 = '';
  try { store.removeCustomPage('home'); } catch (e) { guard1 = e.message; }
  ok('内置页面不可删除', /不可删除/.test(guard1), guard1);
  let guard2 = '';
  try { store.updateCustomPage('home', { name: 'X' }); } catch (e) { guard2 = e.message; }
  ok('内置页面不可改名', /不支持改名/.test(guard2), guard2);

  /* 10. 参数校验 */
  const bads = [
    [{ name: '保留字测试', key: 'home' }, /保留字/],
    [{ name: '数字开头测试', key: '1abc' }, /小写字母/]
  ];
  bads.forEach(([input, re], i) => {
    let msg = '';
    try { store.createCustomPage(input); } catch (e) { msg = e.message; }
    ok(`非法标识 #${i + 1} 被拒绝`, re.test(msg), msg);
  });
  let dupMsg = '';
  try { store.createCustomPage({ name: TEST_NAME + '改名' }); } catch (e) { dupMsg = e.message; }
  ok('页面名称重复被拒绝', /已存在/.test(dupMsg), dupMsg);

  /* 11. 删除 */
  const del = store.removeCustomPage(renamedKey);
  ok('删除返回被删页面名', del.name === TEST_NAME + '改名', del.name);
  const afterDel = fs.readFileSync(REPLICA, 'utf8');
  ok('replica 里 CUSTOM_PAGES 整段消失（只剩另一个自检页）', afterDel.indexOf(renamedKey) < 0);
  ok('replica 里不再有该页内容', afterDel.indexOf('装修自检标题') < 0);

  /* 12. 清掉第二个自检页后，CUSTOM_PAGES 应彻底消失 */
  store.removeCustomPage('zzselftest-home');
  const afterDel2 = fs.readFileSync(REPLICA, 'utf8');
  ok('无自定义页时 CUSTOM_PAGES 整段不输出', afterDel2.indexOf('CUSTOM_PAGES') < 0);
  ok('页面数量回到起点', customPages.count() === baseCount, `${baseCount} → ${customPages.count()}`);
  ok('内置 6 个字段完好',
    ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS']
      .every((k) => afterDel2.indexOf('const ' + k + ' =') > 0));

  /* 13. （隔离运行下已无需恢复真实文件，这里只验临时基线本身没问题） */
  fs.writeFileSync(REPLICA, originalReplica, 'utf8');
  delete require.cache[require.resolve(REPLICA)];
  const back = require(REPLICA);
  ok('恢复基线后仍可正常 require', !!(back.HOME_BLOCKS && back.HOME_BLOCKS.length));
  ok('基线里本就没有 CUSTOM_PAGES（探针三条前提成立）', originalReplica.indexOf('CUSTOM_PAGES') < 0);

  /* 14. ★ 隔离性：跑完一轮，真实文件一个字节都没动 */
  const dataDirRoot = require(nodePath.join(ROOT, 'server/lib/dataDir')).ROOT;
  ok('★ 隔离性：发布产物与数据目录都在临时目录下（不是靠收尾还原）',
    REPLICA.indexOf(TMP) === 0 && dataDirRoot.indexOf(TMP) === 0, REPLICA + ' ｜ ' + dataDirRoot);
  ok('★ 隔离性：真实 miniprogram/config/replica.js 逐字节未变',
    fs.readFileSync(REAL_REPLICA, 'utf8') === realReplicaSnapshot);
  ok('★ 隔离性：真实 server/data/decorate/state.json 未被本次运行改动',
    (fs.existsSync(REAL_STATE) ? fs.readFileSync(REAL_STATE, 'utf8') : null) === realStateSnapshot);
} catch (e) {
  console.error('EXCEPTION:', (e && e.stack) || e);
  results.push({ label: '未捕获异常', pass: false, extra: String(e && e.message) });
} finally {
  cleanup();
}

const failed = results.filter((r) => !r.pass);
console.log('\n──────────────────────────────');
console.log(`${results.length - failed.length}/${results.length} 通过` + (failed.length ? `，失败 ${failed.length}` : ''));
failed.forEach((f) => console.log('  FAIL ' + f.label + '  ' + f.extra));
process.exit(failed.length ? 1 : 0);
