// 生成器无损性验证：把当前 replica.js 的数据走一遍「提取 → 生成 → 回读」，
// 结果必须与原始数据完全一致，否则发布就有丢失字段的风险。
import { createRequire } from 'node:module';
import { writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const store = require('../server/decorate/store.js');
const schema = require('../server/decorate/schema.js');
const emit = require('../server/decorate/emit.js');

const orig = store.readReplica();
const pageData = store.publishedAll();
/*
 * 用 store.assemble 而不是自己 forEach PAGES：
 * assemble 就是 writeReplica 真正调用的那一步，自建一份等于「测的是另一条链路」。
 * 它也顺带覆盖自定义页（CUSTOM_PAGES）与旧标识别名表（CUSTOM_PAGE_ALIASES）。
 */
const assembled = store.assemble(pageData);

/** 生成 → 落临时文件 → require 回来（用完即删）
 *  ⚠️ 每次都要用**不同的文件名**：require 有缓存，同名文件第二次拿到的是上一次的模块，
 *     会让「别名表往返」这种用例永远比对到旧结果（本次就踩到了）。
 */
let rtSeq = 0;
function roundTrip(data) {
  const code = emit.emitReplica(data, { originalSrc: emit.readOriginal(store.REPLICA_FILE) });
  rtSeq += 1;
  const tmp = new URL('./_gen-test-' + rtSeq + '.cjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  writeFileSync(tmp, code, 'utf8');
  try {
    return { code, gen: require(tmp) };
  } finally {
    try { delete require.cache[require.resolve(tmp)]; } catch (e) { /* ignore */ }
    try { unlinkSync(tmp); } catch (e) { /* ignore */ }
  }
}

const { code, gen } = roundTrip(assembled);

/*
 * HOME_BLOCKS 在本版做了一次结构升级：图片广告的 images 从「地址字符串数组」
 * 升级为 [{ image, link }] 对象数组（为了支持每张图单独设跳转，见 schema.upgradeBlock）。
 *
 * 升级是幂等的，所以对「原文件」也跑一遍同一个升级函数，两边再比哈希 ——
 * 这样校验的仍然是「发布不会丢字段」，只是把已声明的结构升级算进基准。
 */
const expect = Object.assign({}, orig, {
  HOME_BLOCKS: (orig.HOME_BLOCKS || []).map(schema.upgradeBlock)
});

/* TABBAR（店铺导航）也纳入逐字段哈希：它同样由发布器写回 replica.js，
   漏检的话「改个导航配色把别的字段写坏」这种事故不会被发现。
   注意 nav 页的 from() 会把「replica 里没有 TABBAR」归一成默认值，
   所以原文件没有 TABBAR 时，基准要补上同一份默认值。 */
const keys = ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS', 'PAGE_META', 'TABBAR'];
if (orig.TABBAR === undefined) expect.TABBAR = schema.normalizeTabbar(undefined);

/* 自定义页与别名表：只在「生成侧或原文件侧出现过」时才比 ——
   没有任何自定义页时，emit 应当整段省略这两个字段（向后兼容），
   此时两侧都是 undefined，哈希相同，同样算通过。 */
['CUSTOM_PAGES', 'CUSTOM_PAGE_ALIASES'].forEach((k) => {
  if (gen[k] !== undefined || expect[k] !== undefined) keys.push(k);
});

let ok = true;
console.log('字段                原文件哈希        生成文件哈希      一致');
keys.forEach((k) => {
  const a = createHash('md5').update(JSON.stringify(expect[k])).digest('hex').slice(0, 12);
  const b = createHash('md5').update(JSON.stringify(gen[k])).digest('hex').slice(0, 12);
  const same = a === b;
  if (!same) ok = false;
  console.log(k.padEnd(20), a, '  ', b, '  ', same ? '✓' : '✗');
});

/*
 * 旧标识别名表（自定义页改标识后旧分享链接的兜底）单独做一次往返。
 *
 * 为什么不能只靠上面那段：当前注册表里可能一条别名都没有，
 * 那样这个字段根本不会被写出来，「生成器能不能正确输出它」就完全没被验证过。
 */
console.log('');
let aliasOk = true;
const FAKE = { 'old-spring': 'spring2026', 'spring2026-v1': 'spring2026' };
const hasCustom = !!(assembled.CUSTOM_PAGES && Object.keys(assembled.CUSTOM_PAGES).length);
const withAlias = Object.assign({}, assembled, { CUSTOM_PAGE_ALIASES: FAKE });
const rt2 = roundTrip(withAlias);
if (JSON.stringify(rt2.gen.CUSTOM_PAGE_ALIASES) !== JSON.stringify(FAKE)) {
  aliasOk = false;
  console.log('✗ CUSTOM_PAGE_ALIASES 往返不一致:', JSON.stringify(rt2.gen.CUSTOM_PAGE_ALIASES));
} else {
  console.log('✓ CUSTOM_PAGE_ALIASES 往返一致（' + Object.keys(FAKE).length + ' 条别名原样写回并导出）');
}
if (!hasCustom) {
  // 没有自定义页时别名表也不该单独出现（否则就是半截数据：别名指向一个不存在的页面）
  const leaked = rt2.gen.CUSTOM_PAGES !== undefined && Object.keys(rt2.gen.CUSTOM_PAGES).length === 0;
  if (leaked) { aliasOk = false; console.log('✗ 空 CUSTOM_PAGES 被导出'); }
  else console.log('✓ 无自定义页时不会导出空的 CUSTOM_PAGES');
}
// 当前数据没有别名 → 生成文件里不该出现这个标识符（向后兼容：老 replica.js 内容不变）
if (!Object.keys(assembled.CUSTOM_PAGE_ALIASES || {}).length) {
  if (code.indexOf('CUSTOM_PAGE_ALIASES') > -1) {
    aliasOk = false;
    console.log('✗ 没有别名时生成文件里仍出现了 CUSTOM_PAGE_ALIASES');
  } else {
    console.log('✓ 没有别名时整段省略，生成文件与加功能之前一致');
  }
}
if (!aliasOk) ok = false;

console.log('\n生成文件大小:', code.length, '字节 | 原文件:', emit.readOriginal(store.REPLICA_FILE).length, '字节');
console.log('语法校验: ', (() => { try { new (require('node:vm').Script)(code); return '通过'; } catch (e) { return '失败 ' + e.message; } })());
console.log('\n结论:', ok ? '✅ 生成器无损，发布等价于把数据原样写回' : '❌ 存在差异，不能用于发布');

// 页面清单概览
console.log('\n页面数:', schema.list().length);
schema.list().forEach((p) => console.log(' -', p.key, p.name, '←', p.source));

if (!ok) process.exit(1);
