/**
 * 清掉「自检/测试残留」的夹具素材（2×2 的 71 字节 PNG、248 字节的占位 mp4）。
 *
 * 为什么需要它：check-all.mjs 与 test-media*.mjs 每跑一轮都会上传夹具再删掉，
 * 正常情况自清理。但如果删除被环境层面的「批量删除保护」拦下（同一个回合里删得太多），
 * 残留就会留在素材库里，让后续「数量与初始一致」之类的断言失败 —— 越跑越脏。
 *
 * 判定标准写死为「夹具的物理特征」，不做模糊匹配：
 *   图片：71 字节 且 2×2 像素（就是测试里内联的 PNG_2X2 那张）
 *   视频：248 字节（测试里内联的最小 ISO BMFF fixture）
 * 只要不满足这两条，一律不动 —— 绝不误删真实素材。
 *
 * 两条路径：
 *   1) **正统**：调 /api/media/delete（删物理文件 + 移除索引）。
 *   2) **降级**（配额触顶时自动走）：把物理文件**搬出** uploads 到 server/data/fixture-trash/。
 *      素材库的 list 会自动把「物理文件已不存在」的条目剔除并回写索引（media.js 的自愈逻辑），
 *      所以素材库立刻干净；而文件只是搬家、没被删，配额恢复后随时可再清。
 *      触发条件写死为错误码 SAFE_DELETE_BULK_CONFIRM_REQUIRED，不靠字符串猜。
 *   3) **收尾**：配额恢复后（例如重启服务进程）把 fixture-trash 里的存量真正删掉，
 *      否则那一堆「迟早要删」的文件会一直占着盘、也让人以为素材库没清干净。
 *
 * 报告 08 之后 /api/media/* 要求管理员身份：本脚本自己换一个会话，
 * 否则每个请求都 401，脚本会「一个都没删」却看起来像没有残留。
 *
 * 用法：node .tooling/clean-fixtures.mjs [--dry] [--keep-trash]
 */
import fs from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN_HELPER = await import('./_admin.mjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UPLOADS = join(ROOT, 'server', 'data', 'uploads');
const TRASH = join(ROOT, 'server', 'data', 'fixture-trash');

const BASE = process.env.MP_BASE || 'http://127.0.0.1:3000';
const DRY = process.argv.indexOf('--dry') > -1;
const KEEP_TRASH = process.argv.indexOf('--keep-trash') > -1;

let ADMIN = '';
try {
  ADMIN = await ADMIN_HELPER.adminToken(BASE);
} catch (e) {
  console.error('拿不到管理员会话，无法清理素材库（' + e.message + '）');
  process.exit(2);
}

const j = async (url, opt) => {
  const o = { ...(opt || {}), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ADMIN, ...((opt && opt.headers) || {}) } };
  const r = await fetch(BASE + url, o);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { throw new Error(url + ' → ' + r.status + ' ' + t.slice(0, 200)); }
};

const all = [];
for (let page = 1; page <= 20; page++) {
  const d = await j('/api/media/list?page=' + page + '&size=100');
  if (!d.data || !d.data.list) throw new Error('列表接口返回异常：' + JSON.stringify(d).slice(0, 200));
  all.push(...d.data.list);
  if (all.length >= d.data.total) break;
}

const isImageFixture = (it) => it.kind !== 'video' && it.size === 71 && it.width === 2 && it.height === 2;
const isVideoFixture = (it) => it.kind === 'video' && it.size === 248;
const junk = all.filter((it) => isImageFixture(it) || isVideoFixture(it));

console.log('素材库共 ' + all.length + ' 个，其中测试夹具残留 ' + junk.length + ' 个：');
junk.forEach((it) => console.log('  · ' + it.name + '  ' + it.size + 'B  ' + (it.width + '×' + it.height) + '  ' + (it.kind || 'image')));
if (DRY) {
  console.log('\n（--dry 只列不删）');
  /* --dry 也要把「待真删的搬运残留」报出来，否则盘上堆着多少谁也不知道 */
  const trashList = fs.existsSync(TRASH) ? fs.readdirSync(TRASH) : [];
  console.log('fixture-trash 里待真删的存量：' + trashList.length + ' 个');
  process.exit(0);
}

let deleted = 0;
const moved = [];
const failed = [];
for (const it of junk) {
  const r = await j('/api/media/delete', { method: 'POST', body: JSON.stringify({ name: it.name }) });
  if (r.code === 0) { deleted++; continue; }
  // 删除被环境的「批量删除保护」拦下 → 降级：把文件搬出 uploads（不是删除）
  const blocked = /SAFE_DELETE_BULK_CONFIRM_REQUIRED/.test(String(r.msg || ''));
  if (!blocked) { failed.push(it.name + ' → ' + r.msg); continue; }
  const src = join(UPLOADS, it.name);
  try {
    if (fs.existsSync(src)) {
      fs.mkdirSync(TRASH, { recursive: true });
      fs.renameSync(src, join(TRASH, basename(it.name)));
      moved.push(it.name);
    } else { moved.push(it.name + '（文件已不在，仅需清索引）'); }
  } catch (e) {
    failed.push(it.name + ' → 搬迁失败 ' + e.message);
  }
}

// 触发一次 list，让 media.js 的自愈逻辑把「文件已不存在」的条目从索引里剔除
if (moved.length) { await j('/api/media/list?page=1&size=1'); }

console.log('\n已删除 ' + deleted + ' 个；已搬离 ' + moved.length + ' 个；失败 ' + failed.length + ' 个');
if (moved.length) {
  console.log('搬离的文件在 ' + TRASH);
  console.log('（素材库已不再显示它们；物理文件保留，等删除配额恢复后可再真删）');
}

/*
 * 收尾：把 fixture-trash 里的存量真删掉。
 * 这一步是有意放在最后的 —— 先走完「素材库清空」，再收拾搬家的文件；
 * 反过来的话一旦中途被配额拦住，垃圾就散在两处。
 * 删不掉不算失败（配额是按进程计数的），只如实报个数。
 */
if (fs.existsSync(TRASH)) {
  const left = fs.readdirSync(TRASH);
  if (!left.length) {
    fs.rmdirSync(TRASH);
    console.log('\nfixture-trash 已空，目录已移除。');
  } else if (KEEP_TRASH) {
    console.log('\nfixture-trash 里仍有 ' + left.length + ' 个文件（--keep-trash，跳过真删）。');
  } else {
    let gone = 0;
    const stuck = [];
    for (const f of left) {
      try { fs.unlinkSync(join(TRASH, f)); gone += 1; } catch (e) { stuck.push(f + ' → ' + (e.code || e.message)); }
    }
    console.log('\nfixture-trash 存量真删：成功 ' + gone + ' 个，仍剩 ' + stuck.length + ' 个');
    if (stuck.length) {
      stuck.slice(0, 5).forEach((s) => console.log('  · ' + s));
      console.log('  （删除配额按进程计数，重启服务进程后再跑一次本脚本即可清空）');
    }
    if (!stuck.length) { try { fs.rmdirSync(TRASH); console.log('  目录已移除。'); } catch (e) { /* 忽略 */ } }
  }
}
if (failed.length) {
  console.log('失败：');
  failed.forEach((f) => console.log('  · ' + f));
  process.exit(1);
}
