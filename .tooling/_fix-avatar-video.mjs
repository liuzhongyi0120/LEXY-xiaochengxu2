/**
 * 一次性修复：把「头像指向视频 / 指向已不存在的素材」的记录清空。
 *
 * 背景（2026-10-13 实测发现）：
 *   `check-all.mjs` 第 5 节的「头像探针」此前取的是 `media/list` 的**首件**，
 *   而首件 = 最近一次上传 —— 自检自己刚上传过视频夹具时它就是 `.mp4`。
 *   于是「联调账号」的头像被写成了 `/uploads/202610/xxx.mp4`；
 *   夹具一被清理，`db.json` 里就留下一条悬空引用，`check-localized` 第 2 项当场报红。
 *   代码侧已修（kind=image + 收尾还原），本脚本负责把**已经写脏的历史值**收回来。
 *
 * ⚠️ 必须走接口改，不能直接改 db.json：
 *   `lib/store.js` 是内存态 + 延迟落盘，直接改文件会被内存里那份原样盖回来
 *   （与 `.tooling/fix-user-avatars.mjs` 同一个理由）。
 *
 * 用法：node .tooling/_fix-avatar-video.mjs           只列清单（默认）
 *       node .tooling/_fix-avatar-video.mjs --apply   执行修复
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const auth = require('../server/lib/auth.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = process.env.MP_BASE || 'http://127.0.0.1:3000';
const APPLY = process.argv.includes('--apply');

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/db.json'), 'utf8'));
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/uploads/index.json'), 'utf8'));
const known = new Set((idx.items || []).map((it) => it.url));

/* 两种脏法：① 头像压根儿不是图片（被写成了 mp4）；② 头像指向的素材已经不在库/盘上 */
const bad = (db.users || []).filter((u) => {
  const a = String(u.avatar || '');
  if (!a) return false;
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(a)) return true;
  if (known.has(a.split('?')[0])) return false;
  return !fs.existsSync(path.join(ROOT, 'server/data', a.replace(/^\//, '')));
});

console.log('头像有问题的用户：' + bad.length + ' 个');
bad.forEach((u) => console.log(`  · ${u.userId}（${u.nickname}）→ ${String(u.avatar).slice(0, 80)}`));
if (!bad.length) { console.log('无需处理 ✓'); process.exit(0); }
if (!APPLY) { console.log('\n试跑模式：未改动任何数据。加 --apply 执行。'); process.exit(0); }

let ok = 0;
for (const u of bad) {
  const token = auth.sign({ userId: u.userId });
  const r = await fetch(BASE + '/api/user/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ avatar: '' })
  });
  const j = await r.json().catch(() => null);
  if (j && j.code === 0) { console.log('  ✓ ' + u.userId + ' 头像已清空'); ok++; }
  else console.log('  ✗ ' + u.userId + ' 失败：' + JSON.stringify(j).slice(0, 120));
}

await new Promise((r) => setTimeout(r, 400));
const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/db.json'), 'utf8'));
const left = (after.users || []).filter((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(u.avatar || '')));
console.log(`\n已修复 ${ok} 个 | 复查仍指向视频：${left.length}（应为 0）`);
