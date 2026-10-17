/**
 * F17 历史版本保护 —— 隔离数据目录下的场景自检
 *
 * 必须在 MALL_DATA_DIR 指向的临时目录里跑（由 test-media-f17.mjs 拉起）：
 * 这里要造一个「已发布 v1 用了这张图、v2 把它换掉」的历史版本，
 * 在真实数据目录上造这种假版本会污染回滚链。
 *
 * 覆盖审查的验收标准：
 *   1. 发布 v1 后用 v2 换图 → v1 保留期内，v1 的素材不能被普通删除 / 清理删掉；
 *   2. 回滚后图片仍可访问（进回收站可原样恢复，URL 不变）；
 *   3. 清理任务能解释每个删除候选的依据（purged / kept 都带 reason）。
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import nodePath from 'node:path';

const media = (await import('file:///' + nodePath.resolve('server/lib/media.js').replace(/\\/g, '/'))).default;

const DATA = process.env.MALL_DATA_DIR;
if (!DATA) { console.error(' ✗ 必须通过 MALL_DATA_DIR 指定临时数据目录'); process.exit(1); }

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

/* v1：首页大图用的是这张（写进一个历史版本快照，模拟「已发布过、现在已换掉」） */
const up = media.upload([{ data: PNG, orig: 'f17-v1.png' }], 'F17自检');
const name = up.list[0].name;

const backupDir = nodePath.join(DATA, 'decorate', 'backup');
mkdirSync(backupDir, { recursive: true });
const ts = Date.now();
writeFileSync(
  nodePath.join(backupDir, `replica.${ts}.js`),
  'const HOME_BLOCKS = [\n  { type: "image", src: "/uploads/' + name + '" }\n];\n',
  'utf8'
);

/* 1. 当前数据里已经没有它（v2 换掉了），但保留期版本还在用 */
const r = media.refs(name);
ok('换图后：当前引用为 0、历史版本引用 > 0（不再被误判成「未引用」）',
  r.current === 0 && r.history === 1 && r.protected === true,
  `current=${r.current} history=${r.history} detail=${r.detail.map((d) => d.where + '×' + d.count).join('、')}`);

/* 2. 普通删除被拒，且点名「历史版本」 */
let blocked = '';
try { media.remove(name); } catch (e) { blocked = e.message; }
ok('保留期内：普通删除被拒且点名「历史版本」（旧客户端与回滚仍在用）',
  /历史版本/.test(blocked), blocked.slice(0, 180));

/* 3. 强制删除 → 进回收站（不是立刻从盘上抹掉） */
const del = media.remove(name, true);
ok('force 删除也只是进回收站，并非物理删除', del.deleted === true && del.trashed === true,
  `refsDetail=${(del.refsDetail || []).map((d) => d.where + '×' + d.count).join('、')}`);

/* 4. 清理任务：刚进回收站的不会被清掉，且必须说出依据（未到期 / 仍被引用都算依据） */
const sweep1 = media.sweepTrash({});
const kept1 = sweep1.kept.find((x) => x.name === name);
ok('清理任务不会顺手清掉刚进回收站的素材，且逐条说明依据',
  !!kept1 && /(引用|保留期)/.test(kept1.reason), kept1 ? kept1.reason : '未保留（被误清）');

/* 5. 回滚场景：从回收站恢复后 URL 不变、文件回到原处 */
const back = media.restore(name);
ok('回滚可原样恢复（URL 与删除前一致）', back.restored === true && back.url === '/uploads/' + name, back.url);

/* 6. 保留期过后 + 历史版本也过期 → 才允许清理，且仍逐条说明理由 */
media.remove(name, true);
const trashFile = nodePath.join(DATA, 'uploads_trash', 'trash.json');
const t = JSON.parse(readFileSync(trashFile, 'utf8'));
t.items = t.items.map((x) => (x.name === name ? Object.assign(x, { deletedAt: Date.now() - 31 * 86400000 }) : x));
writeFileSync(trashFile, JSON.stringify(t, null, 2));
const sweep2 = media.sweepTrash({});
ok('保留期过了、但历史版本仍在用 → 仍然保留（附依据）',
  sweep2.kept.some((x) => x.name === name && /引用/.test(x.reason)),
  (sweep2.kept.find((x) => x.name === name) || {}).reason || '被清掉了');

const sweep3 = media.sweepTrash({ force: 1 });
ok('force 清理才真正清除，并说明依据', sweep3.purged.some((x) => x.name === name && /保留期已过/.test(x.reason)),
  (sweep3.purged.find((x) => x.name === name) || {}).reason || '未清除');

console.log(`\n 通过 ${pass} 条，失败 ${fail} 条`);
process.exit(fail ? 1 : 0);
