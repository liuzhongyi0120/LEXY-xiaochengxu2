/**
 * 修复「用户头像指向有赞」的记录
 *
 * 为什么不能像别的文件那样直接改 db.json：
 *   `lib/store.js` 是**内存态 + 延迟落盘**（写操作 50ms 合并写文件）。
 *   直接改文件，服务内存里那份没变，下一次任何写操作都会把旧值原样盖回来 ——
 *   表现为「改了没生效」。
 *
 * 正确做法：调 `POST /api/user/profile` 让服务自己改内存 + 落盘。
 *   该接口要**用户令牌**而不是管理员令牌；令牌是 HMAC-SHA256 签的，
 *   直接用 lib/auth.js 的 sign() 按 userId 签一个即可（同一进程同一密钥）。
 *
 * 说明：db.json 是运行时数据、不进版本库，但「页面/用户数据不留外部外链」这条口径还是要守住。
 *
 * 用法：node .tooling/fix-user-avatars.mjs
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

const norm = (u) => String(u).split('!')[0].split('?')[0];

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/uploads/index.json'), 'utf8'));
const localOf = new Map();
(idx.items || []).forEach((it) => { if (it.source) localOf.set(norm(it.source), it.url); });

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/db.json'), 'utf8'));
const bad = (db.users || []).filter((u) => u.avatar && /yzcdn\.cn|youzan\.com/.test(u.avatar));
console.log('指向有赞的用户：' + bad.length + ' 个');
if (!bad.length) { console.log('无需处理 ✓'); process.exit(0); }

let ok = 0;
let skipped = 0;
for (const u of bad) {
  const local = localOf.get(norm(u.avatar));
  if (!local) { console.log('  ！素材库无对应文件，跳过：' + u.userId + ' → ' + u.avatar.slice(0, 70)); skipped++; continue; }
  const token = auth.sign({ userId: u.userId });
  const r = await fetch(BASE + '/api/user/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ avatar: local })
  });
  const j = await r.json().catch(() => null);
  if (j && j.code === 0) {
    console.log('  ✓ ' + u.userId + '（' + u.nickname + '）→ ' + local);
    ok++;
  } else {
    console.log('  ✗ ' + u.userId + ' 失败：' + JSON.stringify(j).slice(0, 120));
  }
}

// 复查：等落盘后重新读文件
await new Promise((r) => setTimeout(r, 400));
const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/db.json'), 'utf8'));
const left = (after.users || []).filter((u) => u.avatar && /yzcdn\.cn|youzan\.com/.test(u.avatar));
console.log('\n已修复 ' + ok + ' 个 | 跳过 ' + skipped + ' | 复查仍指向有赞：' + left.length);
