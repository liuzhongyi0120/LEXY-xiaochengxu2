/**
 * 回归测试：PAGE_META 不得因某页 meta 缺失而丢键
 *
 * 背景（真实缺陷）：历史版本的版本快照里某页没有 meta 字段时，
 * 原实现 Object.assign({}, out.PAGE_META, { home: undefined })
 * 会把已写好的 home 覆盖成 undefined，JSON 序列化时该键消失，
 * 导致回滚后 replica.js 的 PAGE_META 少一个页面。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const schema = require('../server/decorate/schema');
const store = require('../server/decorate/store');

let pass = 0;
let fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/*
 * PAGE_META 的期望键集 = **注册表里除「店铺导航」之外的全部页面**
 * （内置 5 页 + 自定义页）。
 *
 * ⚠️ 这里不能写死 `=== 5`：2026-10-08 起支持新建自定义页，自定义页的 meta 也进
 *    PAGE_META，运营每建一个页面这个数字就变一次 —— 写死只会得到一个
 *    「环境里恰好有几个页面才绿」的假红（本机存着两个测试页，就一直是红的）。
 *    锁「与 schema.allPages() 完全一致」才是这条断言真正要保证的等价关系。
 */
const expectMetaKeys = () => schema.allPages().filter((p) => !p.nav).map((p) => p.key).sort().join(',');
const metaKeysOf = (asm) => Object.keys(asm.PAGE_META || {}).sort().join(',');

console.log('[1] 正常：全部内置页 meta 齐全');
{
  const pd = store.publishedAll();
  const asm = store.assemble(pd);
  const keys = Object.keys(asm.PAGE_META || {});
  ok(metaKeysOf(asm) === expectMetaKeys(), 'PAGE_META 键集 = 全部页面（内置 5 + 自定义，不含店铺导航）', keys.join(','));
  ok(keys.includes('home'), 'PAGE_META.home 存在');
  ok(asm.PAGE_META.home && asm.PAGE_META.home.bg === '#F5F6F8', 'PAGE_META.home.bg = #F5F6F8', asm.PAGE_META.home && asm.PAGE_META.home.bg);
}

console.log('[2] 回归：home 的 meta 为 undefined（模拟旧快照）');
{
  const pd = store.publishedAll();
  pd.home = Object.assign({}, pd.home, { meta: undefined });
  const asm = store.assemble(pd);
  const keys = Object.keys(asm.PAGE_META || {});
  ok(keys.includes('home'), 'PAGE_META.home 未被 undefined 覆盖掉', keys.join(','));
  ok(metaKeysOf(asm) === expectMetaKeys(), 'PAGE_META 键集未被 undefined 破坏', keys.join(','));
  const json = JSON.parse(JSON.stringify(asm));
  ok(Object.keys(json.PAGE_META).includes('home'), 'JSON 序列化后 home 仍在（这是原缺陷的表现形式）');
}

console.log('[3] 不变式：任何一页被组装，PAGE_META 必含全部内置 5 页（缺则回落默认值）');
{
  const pd = store.publishedAll();
  ['home', 'lexy', 'news', 'product', 'mine'].forEach((k) => { pd[k] = Object.assign({}, pd[k], { meta: undefined }); });
  const asm = store.assemble(pd);
  const keys = Object.keys(asm.PAGE_META || {});
  ok(metaKeysOf(asm) === expectMetaKeys(), 'PAGE_META 补齐为全部页面', keys.join(','));
  ok(asm.PAGE_META.home && asm.PAGE_META.home.bg === '#F5F6F8', 'home 回落默认值 #F5F6F8', asm.PAGE_META.home && asm.PAGE_META.home.bg);
  ok(asm.PAGE_META.mine && asm.PAGE_META.mine.bg === '#FFFFFF', 'mine 回落默认值 #FFFFFF');
}

console.log('[4] emit 端到端：生成的 replica.js 携带 PAGE_META 与全部页面');
{
  const emit = require('../server/decorate/emit');
  const vm = require('node:vm');
  const pd = store.publishedAll();
  pd.home = Object.assign({}, pd.home, { meta: undefined }); // 模拟旧快照缺 meta
  const asm = store.assemble(pd);
  const code = emit.emitReplica(asm, { originalSrc: '', publishedAt: Date.now() });
  ok(code.includes('const PAGE_META'), '输出 const PAGE_META');
  ok(/module\.exports\s*=\s*\{[\s\S]*PAGE_META[\s\S]*\}/.test(code), 'module.exports 包含 PAGE_META');

  const mod = { exports: {} };
  new vm.Script('(function(module){' + code.replace(/module\.exports =/, 'module.exports =') + '})(module);').runInNewContext({ module: mod });
  const R = mod.exports;
  const kk = Object.keys(R.PAGE_META || {});
  ok(Object.keys(R.PAGE_META || {}).sort().join(',') === expectMetaKeys(), '生成文件里 PAGE_META 与全部页面一致', kk.join(','));
  // 区块数量由运营内容决定，不写死数字：与「已发布数据」里的条数对齐即可
  const wantBlocks = (store.publishedAll().home.blocks || []).length;
  ok(R.HOME_BLOCKS.length === wantBlocks, `HOME_BLOCKS 区块数与已发布数据一致（${wantBlocks}）`, String(R.HOME_BLOCKS.length));
}

console.log('');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
