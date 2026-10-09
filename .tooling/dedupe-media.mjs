/**
 * 素材去重清理：同一支有赞视频被重复入库时，只保留一份
 *
 * 背景：`mps-trans` 地址带动态签名，早期版本的抓取脚本按完整 URL 去重，
 * 于是同一支视频每跑一次就多存一份（source 不同、内容相同）。
 * 本脚本按 **路径主体（去域名/去签名/去缩放后缀）** 分组，
 * 每组保留最新入库的一份，其余**走 media.remove() 删除**（带引用检查，
 * 若已被页面引用则拒绝删除并报出引用处）。
 *
 * 用法：
 *   node .tooling/dedupe-media.mjs          # 试跑，只报告
 *   node .tooling/dedupe-media.mjs --apply  # 真删
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const media = require('../server/lib/media.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const keyOf = (u) => String(u).split('?')[0].split('!')[0];

const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/data/uploads/index.json'), 'utf8'));
const items = (idx.items || []).filter((it) => it.source && /mps-trans/.test(it.source));
console.log('mps-trans 素材共 ' + items.length + ' 条');

const groups = new Map();
items.forEach((it) => {
  const k = keyOf(it.source) + '|' + (it.folder || '');
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(it);
});

const dupes = [...groups.entries()].filter(([, v]) => v.length > 1);
console.log('重复分组：' + dupes.length);
let toDelete = [];
dupes.forEach(([k, v]) => {
  const sorted = v.slice().sort((a, b) => (b.at || 0) - (a.at || 0)); // 新的在前
  const keep = sorted[0];
  console.log('\n  ' + k.split('|')[0].split('/').pop().slice(0, 52) + '  ×' + v.length);
  console.log('    保留: ' + keep.name + '  (' + (keep.sizeText || keep.size) + ', ' + new Date(keep.at).toISOString().slice(0, 19) + ')');
  sorted.slice(1).forEach((d) => {
    console.log('    删除: ' + d.name + '  (' + (d.sizeText || d.size) + ', ' + new Date(d.at).toISOString().slice(0, 19) + ')');
    toDelete.push(d);
  });
});

if (!toDelete.length) { console.log('\n没有需要清理的重复素材 ✓'); process.exit(0); }

console.log('\n共待删 ' + toDelete.length + ' 个：' + toDelete.map((d) => d.name).join(', '));

if (!APPLY) { console.log('\n（试跑模式，未删除。加 --apply 落盘）'); process.exit(0); }

let ok = 0;
const blocked = [];
for (const d of toDelete) {
  try {
    const r = media.remove(d.name, false);
    if (r && r.ok === false) { blocked.push({ name: d.name, why: r.reason || '被引用' }); continue; }
    ok++;
  } catch (e) {
    blocked.push({ name: d.name, why: String(e.message || e).slice(0, 80) });
  }
}
console.log('\n已删除 ' + ok + ' 个');
if (blocked.length) {
  console.log('被拒绝 ' + blocked.length + ' 个：');
  blocked.forEach((b) => console.log('   ✗ ' + b.name + ' → ' + b.why));
}
