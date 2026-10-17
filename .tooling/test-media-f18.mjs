/**
 * F18 重复素材自检（同内容复用 + 存量去重 + 合并引用）
 *
 * 全部跑在 MALL_DATA_DIR 指向的临时目录里：要造「两份一模一样的素材」，
 * 在真实素材库上造会多出垃圾文件。脚本自身会在没设 MALL_DATA_DIR 时
 * 建一个临时目录再拉起子进程，直接 `node .tooling/test-media-f18.mjs` 即可。
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import nodePath from 'node:path';

const DATA = process.env.MALL_DATA_DIR;
if (!DATA) {
  const tmp = nodePath.resolve('.tooling/_tmp-f18-' + Date.now());
  mkdirSync(tmp, { recursive: true });
  const r = spawnSync(process.execPath, [nodePath.resolve('.tooling/test-media-f18.mjs')], {
    env: Object.assign({}, process.env, { MALL_DATA_DIR: tmp }),
    encoding: 'utf8',
    stdio: 'inherit'
  });
  process.exit(r.status || 0);
}

const media = (await import('file:///' + nodePath.resolve('server/lib/media.js').replace(/\\/g, '/'))).default;

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(` ✓ ${name}${extra ? '  —— ' + extra : ''}`); }
  else { fail++; console.log(` ✗ ${name}${extra ? '  —— ' + extra : ''}`); }
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII=',
  'base64'
);
const PNG2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII='.
    replace('iVBORw0', 'iVBORw0'),
  'base64'
);

/* ---------------- 1. 同内容再次上传 → 不再产生第二份物理副本 ---------------- */
const a = media.upload([{ data: PNG, orig: 'same.png' }], 'F18自检');
const nameA = a.list[0].name;
const before = media.list({}).all;

const b = media.upload([{ data: PNG2, orig: 'same-again.png' }], 'F18自检');
const itemB = b.list[0];
ok('同内容第二次上传被识别为重复（不落第二份盘）', itemB.deduped === true && itemB.name === nameA,
  `deduped=${itemB.deduped} reused=${itemB.reused || '-'}`);
ok('素材总数没变（索引里没有多出一条）', media.list({}).all === before, `${before} → ${media.list({}).all}`);
ok('第二次上传沿用了原来的 URL（引用不用改）', itemB.url === '/uploads/' + nameA, itemB.url);

/* ---------------- 2. forceNew 才允许留第二份（存量重复的来源） ---------------- */
const c = media.upload([{ data: PNG, orig: 'same-forcenew.png', forceNew: 1 }], 'F18自检');
const nameC = c.list[0].name;
ok('forceNew=1 会真的再存一份（用于造存量重复）', c.list[0].deduped !== true && nameC !== nameA, nameC);

/* ---------------- 3. 存量去重：补算哈希 → 找出重复 ----------------
 * 新上传的已经自带 hash，所以这里**故意抹掉一条**模拟存量素材（历史上传没有哈希），
 * 再看批量扫描能不能把它补回来 —— 这才是存量 1312MiB 要走的那条路。 */
const idxFile = nodePath.join(media.ROOT, 'index.json');
const idxJson = JSON.parse(readFileSync(idxFile, 'utf8'));
idxJson.items.forEach((x) => { if (x.name === nameC) delete x.hash; });
writeFileSync(idxFile, JSON.stringify(idxJson, null, 2));

const scan = media.scanHashes(200);
const rehashed = !!media.find(nameC).hash;
ok('缺哈希的存量素材被补算（分批扫描）', scan.scanned === 1 && scan.remain === 0 && rehashed,
  `scanned=${scan.scanned} remain=${scan.remain}`);

const dup = media.duplicates();
const g = dup.groups[0];
ok('重复被聚成一组：1 组、1 个副本、白占空间算得出来',
  dup.groupCount === 1 && dup.dupeCount === 1 && g && g.keep.name === nameA && g.dupes[0].name === nameC,
  g ? `keep=${g.keep.name} dupe=${g.dupes[0].name} waste=${g.wasteText}` : JSON.stringify(dup));

/* ---------------- 4. 合并：引用改指到保留的那份，副本进回收站 ---------------- */
const catalogFile = nodePath.join(DATA, 'catalog.json');
writeFileSync(catalogFile, JSON.stringify({ goods: [{ id: 'g1', image: '/uploads/' + nameC }] }), 'utf8');

const mg = media.merge({ keep: nameA, names: [nameC] });
ok('合并把商品库里的引用改指到保留的那份', mg.movedRefs >= 1,
  `movedRefs=${mg.movedRefs} detail=${JSON.stringify(mg.detail)}`);
const after = JSON.parse(readFileSync(catalogFile, 'utf8'));
ok('合并后商品库指向保留素材的 URL', after.goods[0].image === '/uploads/' + nameA, after.goods[0].image);
ok('副本进了回收站（可恢复，不是物理删除）', media.trashList().items.some((x) => x.name === nameC && x.mergeTo === nameA),
  JSON.stringify(media.trashList().items.map((x) => x.name)));
ok('保留的那份仍在素材库里', !!media.find(nameA) && existsSync(nodePath.join(media.ROOT, nameA)));
ok('合并后重复分组归零', media.duplicates().groupCount === 0);

/* ---------------- 5. 回滚：合并错了能从回收站恢复 ---------------- */
const back = media.restore(nameC);
ok('合并错了可以恢复（副本回到素材库，地址不变）', back.restored === true && back.url === '/uploads/' + nameC, back.url);

console.log(`\n 通过 ${pass} 条，失败 ${fail} 条`);
process.exit(fail ? 1 : 0);
