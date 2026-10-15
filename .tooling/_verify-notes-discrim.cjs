/* 判别力验证：**故意改坏**两处关键实现，确认自测确实会红（而不是恒绿）。跑完自动还原。
 *
 * 场景 1：store.js 里「笔记走 shopnotePublished」的分支被合并成自定义页
 *         → 端到端自测（_test-notes-e2e.cjs）必须红
 * 场景 2：shopnotes.js 的 normalizeContent 只认顶层（= 退回到「内容平铺」那个老形状）
 *         → 数据层自测（_test-shopnotes.cjs）与端到端自测都必须红
 *
 * 为什么要场景 2：内容平铺在顶层、而字段树写的是 header.title 时，
 * 装修台面板上那 7 个字段**显示为空、改完被静默丢弃，且不报任何错** ——
 * 这种 bug 只有「写进去再读回来」的断言能抓。本场景就是证明那组断言不是摆设。
 */
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');

const F = path.join(__dirname, '..', 'server', 'decorate', 'store.js');
const SN = path.join(__dirname, '..', 'server', 'decorate', 'shopnotes.js');
const TEST = path.join(__dirname, '_test-notes-e2e.cjs');
const TEST_DATA = path.join(__dirname, '_test-shopnotes.cjs');
const orig = fs.readFileSync(F, 'utf8');
const origSn = fs.readFileSync(SN, 'utf8');

const GOOD = "out[p.key] = p.shopnote ? shopnotePublished(p.key)\n      : p.custom ? customPublished(p.key)";
const BAD = "out[p.key] = p.custom ? customPublished(p.key)";

/* 归一时的取值口径：规范形状（header 优先、兼容顶层） vs 只认顶层的那版 */
const PICK_GOOD = "const pick = (k) => (src[k] !== undefined ? src[k] : n[k]);";
const PICK_BAD = "const pick = (k) => n[k];";

let miss = 0;
if (orig.indexOf(GOOD) < 0) { console.error('✗ 场景 1 未匹配到目标代码，改坏失败 —— 源码已变，本脚本要同步更新'); miss++; }
if (origSn.indexOf(PICK_GOOD) < 0) { console.error('✗ 场景 2 未匹配到目标代码，改坏失败 —— 源码已变，本脚本要同步更新'); miss++; }
if (miss) process.exit(1);

function run(file) {
  try {
    const r = cp.execSync(`"${process.execPath}" "${file}"`, { encoding: 'utf8' });
    return { code: 0, out: r };
  } catch (e) {
    return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}
const brief = (o) => o.split('\n').filter((l) => /通过|✗|失败项/.test(l)).join('\n') || '(无摘要)';

console.log('=== 1) 原样跑一遍（应全绿）===');
const before = run(TEST);
const beforeData = run(TEST_DATA);
console.log('[e2e] ' + brief(before.out));
console.log('[数据层] ' + brief(beforeData.out));
console.log('exit =', before.code, '/', beforeData.code);

console.log('\n=== 2) 改坏：笔记被错认成自定义页 ===');
fs.writeFileSync(F, orig.replace(GOOD, BAD));
let after;
try {
  after = run(TEST);
  console.log(brief(after.out));
  console.log('exit =', after.code);
} finally {
  fs.writeFileSync(F, orig);
}

console.log('\n=== 2b) 改坏：「笔记头部」退回平铺形状（面板会显示空标题的那种 bug）===');
fs.writeFileSync(SN, origSn.replace(PICK_GOOD, PICK_BAD));
let after2, after2Data;
try {
  after2 = run(TEST);
  after2Data = run(TEST_DATA);
  console.log('[e2e] ' + brief(after2.out));
  console.log('[数据层] ' + brief(after2Data.out));
  console.log('exit =', after2.code, '/', after2Data.code);
} finally {
  fs.writeFileSync(SN, origSn);
}

console.log('\n=== 3) 还原后再跑一遍（应恢复全绿）===');
const restored = run(TEST);
const restoredData = run(TEST_DATA);
console.log('[e2e] ' + brief(restored.out));
console.log('[数据层] ' + brief(restoredData.out));
console.log('exit =', restored.code, '/', restoredData.code);

const okBefore = before.code === 0 && beforeData.code === 0;
const okBroken = after.code !== 0;
const okBroken2 = after2.code !== 0 && after2Data.code !== 0;
const okRestored = restored.code === 0 && restoredData.code === 0;
console.log('\n--- 判别力结论 ---');
console.log((okBefore ? '✓' : '✗') + ' 原样全绿');
console.log((okBroken ? '✓' : '✗') + ' 场景 1 改坏后确实变红（笔记分流）');
console.log((okBroken2 ? '✓' : '✗') + ' 场景 2 改坏后确实变红（读侧 + 数据层都拦住）');
console.log((okRestored ? '✓' : '✗') + ' 还原后恢复全绿');
process.exit(okBefore && okBroken && okBroken2 && okRestored ? 0 : 1);
