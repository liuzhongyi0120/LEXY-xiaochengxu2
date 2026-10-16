/**
 * 全仓清理「原子写残留」—— 见 server/lib/atomicFile.js 的 sweepStale
 *
 * 为什么会有残留：进入那种「路径级 rename 覆盖被拒」的状态后，**连 unlink 也会失败**，
 *   而原实现是一次性 `try{unlink}catch{}` → 静默留下 310KB 一份的垃圾。
 *   它们落在 `miniprogram/` 源码树里（会被打包/扫描），`*.tmp` 这条 .gitignore 也兜不住
 *   （名字不以 `.tmp` 结尾），`git add -A` 会把它们提交进去。
 *
 * 清理范围**严格限定**在下面这些「明显是原子写产物」的名字上，绝不做通配删除：
 *   <名>.tmp.<pid>.<ts>.<n>   /  <名>.tmp.probe.<n>   /  <名>.replacing
 *   <名>.newtest / .owtest / .awaytest / .diagmove / .cpytest
 *
 * ⚠ `*.replacing` 单独处理：它的**同名前缀文件若不存在**，说明上次退路被打断、
 *   这份残留其实是唯一的数据 —— 不删，只报告（server 起来时 healAfterCrash 会还原）。
 *
 * 用法：
 *   node .tooling/sweep-stale-tmp.mjs            # 预演（只列不删）
 *   node .tooling/sweep-stale-tmp.mjs --apply    # 真删
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'unpacked', '.workbuddy']);

/** 严格判据：只有这些形状才算残留 */
const STALE = [
  /\.tmp\.\d+\.\d+\.\d+$/,   // writeFileAtomic 的写临时文件
  /\.tmp\.probe\.\d+$/,      // 探针
  /\.(newtest|owtest|awaytest|diagmove|cpytest)$/ // 探针
];

const found = [];
const keep = [];

function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (!e.isFile()) continue;
    if (STALE.some((re) => re.test(e.name))) { found.push(full); continue; }
    if (/\.replacing$/.test(e.name)) {
      const origin = full.slice(0, -'.replacing'.length);
      if (fs.existsSync(origin)) found.push(full);
      else keep.push(full); // 唯一的数据，别删
    }
  }
}
walk(ROOT);

let bytes = 0;
for (const f of found) { try { bytes += fs.statSync(f).size; } catch (_) { /* ignore */ } }

console.log(`扫描根目录 ${ROOT}`);
console.log(`发现残留 ${found.length} 个，合计 ${(bytes / 1048576).toFixed(2)} MB`);
for (const f of found.slice(0, 20)) console.log('  - ' + path.relative(ROOT, f));
if (found.length > 20) console.log(`  … 另有 ${found.length - 20} 个`);
if (keep.length) {
  console.log(`\n⚠ 有 ${keep.length} 个 *.replacing 的**原始文件不存在**，疑似上次替换被打断 —— 不删，留给服务自愈：`);
  for (const f of keep) console.log('  ! ' + path.relative(ROOT, f));
}

if (!APPLY) { console.log('\n（预演模式，未删除；加 --apply 真删）'); process.exit(0); }

let ok = 0; let fail = 0;
for (const f of found) {
  try { fs.unlinkSync(f); ok++; } catch (e) { fail++; console.log(`  删除失败 ${path.relative(ROOT, f)}：${e.code}`); }
}
console.log(`\n已删除 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}`);
process.exit(fail ? 1 : 0);
