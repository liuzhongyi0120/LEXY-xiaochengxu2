/**
 * 探针 v2：把「rename 覆盖」的失败条件做**对照实验**，锁定变量
 *
 * v1 的结论是「同目录/同体积/同操作，独立进程 90/90 全过」——但它有个致命缺陷：
 *   每次写的**内容完全相同**。而真实 publish 每次内容都不一样（`publishedAt` 每次都变）。
 *   Windows Defender 对**内容变化的 .js** 会走 AMSI 脚本扫描，对相同哈希则直接跳过。
 *
 * 所以这一版只变一个自变量：**内容是否变化**。其余（目录 / 体积 / 扩展名 / 操作序列）全部一致。
 *   ① 1KB     内容不变
 *   ② 1KB     内容每次变
 *   ③ 310KB   内容不变
 *   ④ 310KB   内容每次变   ← 若只有它报红，凶手就是「变化的 .js 内容」
 *
 * 全程不碰 replica.js：目标用同目录、同体积、同扩展名的副本 `_probe-*.js`。
 * 跑法：node .tooling/_probe-rename2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'miniprogram/config';
const SRC = path.join(DIR, 'replica.js');
const base = fs.readFileSync(SRC, 'utf8');
console.log(`基准内容取自 ${SRC} —— ${base.length} 字符`);

/** 造 n 个「等长但内容不同」的 310KB 文本（用自增计数器替换尾部定长片段，长度严格不变） */
function variant(big, i) {
  const mark = `<${String(i).padStart(12, '0')}>`; // 定长 14
  return big.slice(0, big.length - 14) + mark;
}
/** 造 n 个「等长但内容不同」的 1KB 文本 */
function small(baseText, i) {
  const mark = `<${String(i).padStart(12, '0')}>`;
  return baseText.slice(0, baseText.length - 14) + mark;
}

const SMALLB = '// probe\n' + 'x'.repeat(1020);
const files = {
  s1: path.join(DIR, '_probe-s1.js'),
  s2: path.join(DIR, '_probe-s2.js'),
  b1: path.join(DIR, '_probe-b1.js'),
  b2: path.join(DIR, '_probe-b2.js')
};
for (const f of Object.values(files)) fs.writeFileSync(f, 'seed\n', 'utf8');

/**
 * 连做 n 次「写 tmp → rename 覆盖」，返回 {fail, codes, maxMs}
 * @param {boolean} vary 内容是否每次都变
 */
function stress(name, file, maker, n, vary) {
  const codes = [];
  let maxMs = 0;
  for (let i = 0; i < n; i++) {
    const text = vary ? maker(i) : maker(0);
    const tmp = `${file}.tmp.probe.${i}`;
    const t0 = Date.now();
    try {
      fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, file);
    } catch (e) {
      codes.push(`${e.code}/${e.errno}`);
      maxMs = Math.max(maxMs, Date.now() - t0);
      try { fs.unlinkSync(tmp); } catch (_) { /* 清不掉就算了 */ }
    }
  }
  const fail = codes.length;
  console.log(`${name}  ${n - fail}/${n} 成功` + (fail
    ? `  ⚠ 失败 ${fail}  错误码 ${[...new Set(codes)].join(',')}  单次最长 ${maxMs}ms`
    : '  ✓'));
  return fail;
}

const N = 40;
const f1 = stress('①  1KB   内容不变   ', files.s1, () => SMALLB, N, false);
const f2 = stress('②  1KB   内容每次变 ', files.s2, (i) => small(SMALLB, i), N, true);
const f3 = stress('③  310KB 内容不变   ', files.b1, () => base, N, false);
const f4 = stress('④  310KB 内容每次变 ', files.b2, (i) => variant(base, i), N, true);

// 清理
for (const f of Object.values(files)) { try { fs.unlinkSync(f); } catch (_) { /* ignore */ } }
try {
  for (const f of fs.readdirSync(DIR)) if (/^_probe-|\.tmp\.probe\./.test(f)) fs.unlinkSync(path.join(DIR, f));
} catch (_) { /* ignore */ }

console.log('');
if (f4 > 0 && f3 === 0) console.log('✅ 结论：变化的内容 = 触发条件（大文件 + 内容变化才发作）→ 指向杀软对 .js 变更的扫描');
else if (f2 > 0 && f1 === 0) console.log('✅ 结论：变化的内容 = 触发条件（小文件也中）→ 与体积无关');
else if (f1 + f2 + f3 + f4 === 0) console.log('❌ 结论：独立进程复现不出来 → 触发条件在服务进程内部（并发/句柄），需进程内诊断');
else console.log('⚠ 结论：无干净对照，看上面四组数字自己判');
process.exit(f1 + f2 + f3 + f4 > 0 ? 1 : 0);
