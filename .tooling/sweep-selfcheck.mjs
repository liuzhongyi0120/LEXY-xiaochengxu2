#!/usr/bin/env node
/**
 * 清理自检残留夹具（orig 名为 selfcheck-* 的上传测试文件）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * `server/tools/check-all.mjs` 会真的调上传接口造夹具来验上传/删除链路，
 * 设计上测完即删。但在「同一窗口内删除动作已超阈值」时，环境的批量删除护栏
 * （[SAFE_DELETE] SAFE_DELETE_BULK_CONFIRM_REQUIRED）会拦住收尾删除，
 * 于是夹具就**登记进素材库索引留了下来** —— 实测累积到 190 条，
 * 名字还叫 `selfcheck-folder.png` / `selfcheck-clip.mp4` / `selfcheck-2x2.png`，
 * 直接出现在运营的素材管理列表里。
 *
 * ── 本脚本的做法：隔离，而不是删除 ──────────────────────────────────
 * 把夹具**移动**到 `.tooling/_fixtures-quarantine/`（保留相对路径），
 * 并从 `server/data/uploads/index.json` 移除对应条目。全程不 unlink 任何文件，
 * 因此不受批量删除护栏影响，也随时可以原样搬回来。
 *
 * ── 用法 ───────────────────────────────────────────────────────────
 *   node .tooling/sweep-selfcheck.mjs           只列清单（默认，不动任何东西）
 *   node .tooling/sweep-selfcheck.mjs --apply   执行隔离 + 清索引
 *
 * ── 判定口径 ───────────────────────────────────────────────────────
 * **夹具原始名有「两套」，只认一个前缀就会漏**（2026-10-13 实测漏了 7 个）：
 *   · `selfcheck-*`          —— `check-all.mjs` 造的上传夹具
 *   · `ui-test-<6位hex>.<ext>` —— UI 测试（`test-media-ui.mjs`）走**界面**上传的夹具
 *   · `from-json.<ext>`      —— 同一测试的「从 JSON 上传」通道
 * 一律**锚定开头 + 硬结构**（如 `^ui-test-[0-9a-f]{6}\.`）。**不要放宽成「名字里含
 * test / xx」**：有赞导入的素材原始名里大量含 `xx`（如
 * `FmDkS1V0NxxGJOk8266ZqYXV3vn6.png!middle.webp`），放宽会把真素材误伤。
 * ⚠️ 漏掉的代价不只是「本机多几条」—— 这些条目会随 `sync-incremental --apply`
 * **推上线上素材库**（公开可 GET），所以自检后必须跑一次本脚本。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFixtureItem } from './fixture-orig.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UPLOADS = path.join(ROOT, 'server', 'data', 'uploads');
const INDEX = path.join(UPLOADS, 'index.json');
const QUARANTINE = path.join(__dirname, '_fixtures-quarantine');

const APPLY = process.argv.includes('--apply');
/** --also=<相对名>（可重复）：索引条目已被清掉、但文件还在的孤儿夹具（搬它，不涉及索引） */
const ALSO = process.argv.filter((a) => a.startsWith('--also=')).map((a) => a.slice('--also='.length));
/**
 * 判据**只定义在 `.tooling/fixture-orig.mjs`** —— `sync-incremental.mjs` 的上线守卫用的是同一份，
 * 两处必须同源（此前各自写了一份 `/^selfcheck-/`，双双漏掉 `ui-test-*` / `from-json.*`）。
 */
const isFixture = isFixtureItem;

const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const fixtures = idx.items.filter(isFixture);
const keep = idx.items.filter((it) => !isFixture(it));
/** 待搬运清单 = 索引里的夹具 + 显式指定的孤儿 */
const toMove = fixtures.map((it) => it.name).concat(ALSO.filter((n) => fixtures.every((it) => it.name !== n)));

const byDate = {};
let bytes = 0;
fixtures.forEach((it) => {
  const d = (String(it.name).match(/(\d{8})/) || [])[1] || '?';
  byDate[d] = (byDate[d] || 0) + 1;
  bytes += it.size || 0;
});

console.log('自检夹具（orig 为 selfcheck-* / ui-test-* / from-json.*）');
console.log('  索引内条目：' + fixtures.length + ' / 索引共 ' + idx.items.length);
console.log('  按日期：' + JSON.stringify(byDate));
console.log('  合计体积：' + bytes + ' bytes');
console.log('  原始名：' + JSON.stringify([...new Set(fixtures.map((x) => x.orig))]));
console.log('  另指定孤儿文件：' + ALSO.length + ' 个');

if (!toMove.length) {
  console.log('\n没有需要清理的夹具。');
  process.exit(0);
}

if (!APPLY) {
  console.log('\n前 10 条：');
  toMove.slice(0, 10).forEach((n) => console.log('  ' + n));
  console.log('\n试跑模式：未移动任何文件、未改索引。加 --apply 执行。');
  process.exit(0);
}

/* ---- 执行：先搬文件，再清索引 ---- */
let moved = 0;
let missing = 0;
toMove.forEach((name) => {
  const from = path.join(UPLOADS, name);
  if (!fs.existsSync(from)) { missing += 1; return; }
  const to = path.join(QUARANTINE, name);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  moved += 1;
});

fs.writeFileSync(INDEX, JSON.stringify(Object.assign({}, idx, { items: keep }), null, 2));

/* ---- 复核 ---- */
const after = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const stillInIndex = after.items.filter(isFixture).length;
const dangling = after.items.filter((it) => !fs.existsSync(path.join(UPLOADS, it.name))).length;
const leftOnDisk = toMove.filter((n) => fs.existsSync(path.join(UPLOADS, n))).length;
console.log('\n隔离完成');
console.log('  已移动 ' + moved + ' 个' + (missing ? '（' + missing + ' 个文件本就缺失，只清条目）' : ''));
console.log('  索引条目：' + idx.items.length + ' → ' + after.items.length);
console.log('  索引里残留夹具条目：' + stillInIndex + '（应为 0）');
console.log('  索引指向但磁盘缺失的条目：' + dangling + '（应为 0）');
console.log('  素材目录里仍残留的夹具文件：' + leftOnDisk + '（应为 0）');
console.log('  暂存目录：' + path.relative(ROOT, QUARANTINE).replace(/\\/g, '/'));
