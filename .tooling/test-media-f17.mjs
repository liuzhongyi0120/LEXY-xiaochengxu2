/**
 * F17 素材生命周期自检（回收站 + 历史版本保护）
 *
 * 只用独立上传的一张 2×2 PNG 做「删 → 回收 → 恢复 → 彻底清除」闭环，
 * 不动任何真实素材；历史版本那段是纯读。
 *
 * 用法：node .tooling/test-media-f17.mjs
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import nodePath from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
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

/* ---------------- 1. 上传 → 删除 → 进回收站 ---------------- */
const up = media.upload([{ data: PNG, orig: 'f17-test.png' }], 'F17自检');
const name = up.list[0].name;
const abs = nodePath.join(media.ROOT, name);
ok('上传成功并落盘', up.success === 1 && existsSync(abs), name);

const res = await fetch(BASE + '/uploads/' + name, { method: 'GET' });
ok('上传后可经 /uploads 访问', res.status === 200, 'HTTP ' + res.status);

const del = media.remove(name);
ok('删除成功（不是物理删除，是进回收站）', del.deleted === true && del.trashed === true, JSON.stringify({ trashed: del.trashed, refs: del.refs }));
ok('删除后 uploads 里已无此文件（下架当场生效）', !existsSync(abs));

const res2 = await fetch(BASE + '/uploads/' + name, { method: 'GET' });
ok('删除后 /uploads 返回 404', res2.status === 404, 'HTTP ' + res2.status);

const trash1 = media.trashList();
const inTrash = trash1.items.find((x) => x.name === name);
ok('回收站里能查到这条，并带「还剩几天可恢复」', !!inTrash && inTrash.daysLeft === media.TRASH_KEEP_DAYS,
  inTrash ? `daysLeft=${inTrash.daysLeft} deletedAt=${inTrash.deletedAtText}` : '未找到');
ok('回收站文件仍在盘上（恢复才有意义）', !!inTrash && existsSync(nodePath.join(media.ROOT, '..', 'uploads_trash', inTrash.trashRel)));

/* ---------------- 2. 保留期内不允许彻底清除 ---------------- */
let purgeBlocked = '';
try { media.purge(name); } catch (e) { purgeBlocked = e.message; }
ok('保留期内 purge 被拒（不是「删了还能一键清空」）', /保留期/.test(purgeBlocked), purgeBlocked);

/* ---------------- 3. 恢复（URL 不变） ---------------- */
const rest = media.restore(name);
ok('恢复成功', rest.restored === true);
ok('恢复后文件回到原路径（URL 与删除前一致）', existsSync(abs));
const res3 = await fetch(BASE + '/uploads/' + name, { method: 'GET' });
ok('恢复后 /uploads 重新可访问', res3.status === 200, 'HTTP ' + res3.status);
ok('恢复后从回收站移除', !media.trashList().items.some((x) => x.name === name));

/* ---------------- 4. force 彻底清除 ---------------- */
media.remove(name, true);
let purgeForceMsg = '';
let purged = null;
try { purged = media.purge(name, true); } catch (e) { purgeForceMsg = e.message; }
ok('force=1 可彻底清除', !!purged && purged.purged === true, purgeForceMsg || JSON.stringify(purged));
ok('彻底清除后回收站里没有残留', !media.trashList().items.some((x) => x.name === name));

/* ---------------- 5. 引用检查能定位到「哪一页 / 哪一段」 ---------------- */
const replicaText = readFileSync(nodePath.resolve('miniprogram/config/replica.js'), 'utf8');
/* 只取真素材路径（`\d{6}/文件名`）：文件头注释里也写着 `/uploads/...`，
   那只是说明文字，拿它当样本会测出「定位不到页面」的假失败 */
const nowUrls = Array.from(new Set(replicaText.match(/\/uploads\/\d{4,6}\/[A-Za-z0-9._\-/]+/g) || []));
const sample = nowUrls[0];
if (!sample) {
  ok('已发布引用能定位到具体页面/区块', false, 'replica.js 里没找到素材路径');
} else {
  const r = media.refs(sample.replace(/^\/uploads\//, ''));
  const hasPage = r.detail.some((d) => d.where.indexOf('·') > -1);
  ok('已发布引用能定位到具体页面/区块（不是只有一个总数）', r.current > 0 && hasPage,
    `${sample} → ` + r.detail.slice(0, 4).map((d) => d.where + '×' + d.count).join('、'));
  ok('引用检查把保留期内的历史版本也算进来', r.history > 0 && r.protected === true,
    `history=${r.history}，共扫 ${r.versionsKept}/${r.versionsScanned} 个版本在保留期内`);
}

/* ---------------- 6. 历史版本保护（隔离数据目录） ----------------
 * 真实数据里未必存在「v1 用过、v2 已换掉」的素材（近期没换图就造不出来），
 * 所以用 MALL_DATA_DIR 指向临时目录，在子进程里造一版假的已发布快照来验证。 */
const tmp = nodePath.resolve('.tooling/_tmp-f17-' + Date.now());
mkdirSync(tmp, { recursive: true });
const child = spawnSync(process.execPath, [nodePath.resolve('.tooling/test-media-f17-versions.mjs')], {
  env: Object.assign({}, process.env, { MALL_DATA_DIR: tmp }),
  encoding: 'utf8'
});
console.log('\n 历史版本保护（隔离目录 ' + nodePath.basename(tmp) + '）');
console.log(String(child.stdout || '').split('\n').map((l) => '   ' + l).join('\n'));
if (child.status !== 0) { fail++; console.log('   ✗ 子进程返回 ' + child.status + (child.stderr ? '\n' + child.stderr : '')); }
else pass++;

console.log(`\n 通过 ${pass} 条，失败 ${fail} 条`);
process.exit(fail ? 1 : 0);
