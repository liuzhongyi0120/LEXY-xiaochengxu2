/**
 * 一次性：给存量素材补内容哈希 → 拉出重复分组清单（**只统计，不合并**）。
 *
 * 用的是 server/lib/media.js 的 scanHashes / duplicates，与控制台里那两个按钮同一套实现。
 * 跑在**本机真实数据**上（会往 server/data/uploads/index.json 写 hash 字段，只增字段、不动别的内容）。
 * 合并（merge）不在本脚本里做 —— 要人工看过分组再决定。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const media = require('../server/lib/media.js');

const t0 = Date.now();
let round = 0;
let scanned = 0;
let missing = 0;
let last = null;

for (;;) {
  round += 1;
  const r = media.scanHashes(400);
  scanned += r.scanned;
  missing += r.missing;
  last = r;
  console.log(
    `第 ${round} 批：本批 ${r.scanned} 条 / 读不到 ${r.missing} 条 / 还剩 ${r.remain} 条（共 ${r.total}）`
  );
  if (r.done) break;
  if (r.scanned === 0) {
    console.log('本批没有可算的（剩下的可能文件缺失），停止');
    break;
  }
}

console.log(`\n补哈希完成：扫描 ${scanned} 条，文件缺失 ${missing} 条，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const d = media.duplicates();
const groups = d.groups || [];
console.log(`\n重复分组：${groups.length} 组`);
console.log(`副本文件：${groups.reduce((s, g) => s + g.dupes.length, 0)} 个`);
console.log(`可回收：${d.wasteText || d.wasteBytes + ' 字节'}（${d.wasteBytes} 字节）`);
console.log('\n浪费最多的 15 组：');
groups.slice(0, 15).forEach((g, i) => {
  console.log(
    `  ${i + 1}. 保留 ${g.keep.name}（${g.keep.sizeText}）← 副本 ${g.dupes.length} 个，浪费 ${g.wasteText}`
  );
  g.dupes.slice(0, 4).forEach((x) => console.log(`       · ${x.name}（${x.sizeText}${x.folder ? ' / ' + x.folder : ''}）`));
});
