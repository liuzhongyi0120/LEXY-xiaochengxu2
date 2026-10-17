#!/usr/bin/env node
/**
 * 增量同步：只把「两端真的不一样」的文件推到线上
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * `deploy-data.mjs` 是「一把梭」全量同步：每次都打包整份 server/ + miniprogram/
 * （≈319 MB、实测上行 1.15 MB/s、约 5 分钟）。但日常改动往往只有一两个文件 ——
 * 改一个商品库存、调一句装修文案，也要付 5 分钟，于是人就倾向于「干脆去服务器上直接改」，
 * 而那恰恰是最危险的做法（服务器上没有版本控制、没有自检、还是台共享生产机）。
 *
 * 这个脚本把「本地改 → 上线」的成本降到与手改服务器相当：**秒级**。
 * 它按内容哈希（md5）比对两端，只传真正变化的文件，然后走同一套
 * 「停服务 → 解包 → 起服务」流程（catalogStore 有进程内内存缓存，不重启等于没改）。
 *
 * ── 用法 ───────────────────────────────────────────────────────────
 *   node .tooling/sync-incremental.mjs            试跑：列出两端差异与待传体量，不改任何东西
 *   node .tooling/sync-incremental.mjs --apply    执行：打包差异 → 传输 → 停服解包 → 起服 → 验证
 *   node .tooling/sync-incremental.mjs --fast     配合 --apply：验证只做健康检查 + 商品数
 *   node .tooling/sync-incremental.mjs --prune    额外删除「服务器有、本机没有」的文件
 *   node .tooling/sync-incremental.mjs --verify   只验证线上，不比对不传输
 *   node .tooling/sync-incremental.mjs --only=server/data/uploads --apply
 *                                                只同步该前缀下的文件（最常用：只推素材）。
 *                                                命中前缀时不重启服务（素材无进程内缓存），
 *                                                验证改为「把刚推的文件逐个 GET 一遍」。
 *
 * ── 什么时候必须用 --only=server/data/uploads ──────────────────────
 *   装修台在**本机**上传的图，物理文件只落在本机 `server/data/uploads/`，
 *   而小程序端 `ENV='server'` 读的是云服务器 —— 不推上去，小程序里就是
 *   「图片加载失败」（线上 404）。这类失败在装修台的手机预览里**看不出来**
 *   （预览页由本机服务直接喂图，同源必然能显示），只有真机 / 开发者工具才暴露。
 *
 * ── 安全约定 ───────────────────────────────────────────────────────
 * ① **默认不删任何东西**。服务器上「本机没有」的文件不一定是垃圾 ——
 *    可能是运营在线上后台上传的素材、或运行时生成的。`--prune` 才会删，
 *    且删除清单会完整打印出来。
 * ② 只处理受管范围（`server/` 与 `miniprogram/`）内的文件，其余一律不碰。
 * ③ 与 `deploy-data.mjs` 排除同一批路径：`server/data/db.json`（线上用户/订单，
 *    生产自举，绝不能被本机的联调数据覆盖）、`*.bak.*`、`project.private.config.json`。
 *    **两处排除规则必须一致**，否则会出现「全量同步传了、增量同步没传」这种幽灵差异。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isFixtureItem } from './fixture-orig.mjs';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------------- 目标机器（与 deploy-data.mjs / server/README.md 保持一致） ---------------- */
const SSH_KEY = process.env.LEXYSYNC_KEY || path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519');
const HOST = process.env.LEXYSYNC_HOST || 'root@14.103.50.137';
const APP_DIR = '/opt/lexy-mall';
const BASE = process.env.LEXYSYNC_BASE || 'https://14.103.50.137/mall-api';

const BUILD_DIR = path.join(ROOT, 'deploy', '.build');
const PATCH_TAR = path.join(BUILD_DIR, 'patch.tar');
const PATCH_LIST = path.join(BUILD_DIR, 'patch-list.txt');
const REMOTE_PATCH = '/root/patch.tar';
const REMOTE_LIST = '/root/patch-list.txt';

const APPLY = process.argv.includes('--apply');
const PRUNE = process.argv.includes('--prune');
const FAST = process.argv.includes('--fast');
const MODE_VERIFY = process.argv.includes('--verify');
/** --only=<相对路径前缀>：只同步该前缀下的文件（例：--only=server/data/uploads） */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);
const ONLY_UPLOADS = ONLY.startsWith('server/data/uploads');
const inScope = (rel) => !ONLY || rel.startsWith(ONLY);

/* ---------------- 受管范围与排除规则 ---------------- */
const ROOTS = ['server', 'miniprogram'];

/**
 * 这些路径不参与同步。**必须与 deploy-data.mjs 的 tar --exclude 逐条对应**：
 * 全量同步用 tar 排除、增量同步靠这里排除，漏一条就会出现
 * 「deploy-data 不传、sync-incremental 却传了」的偏差。
 */
const EXCLUDE = [
  /^server\/data\/db\.json$/,                    // 线上用户/订单，生产自举
  /^server\/data\/db\.json\.broken\./,           // 落盘损坏的现场快照
  /^server\/data\/.*\.bak\./,                    // 各脚本留下的带时间戳备份
  /^server\/data\/uploads_trash\//,              // 本机素材回收站（2026-10-17 加）：两端各自独立，
                                                 // 同步会把本机的删除记录带上，线上 trash.json
                                                 // 会列一堆线上压根没有的条目
  /^miniprogram\/project\.private\.config\.json$/, // 开发机专有
  /(^|\/)node_modules\//,
  /(^|\/)\.DS_Store$/,
];
const isExcluded = (rel) => EXCLUDE.some((re) => re.test(rel));

/* ---------------- 输出小工具 ---------------- */
const C = { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' };
const step = (s) => console.log(`\n${C.b}▸ ${s}${C.x}`);
const info = (s) => console.log(`  ${s}`);
const okMsg = (s) => console.log(`  ${C.g}✓${C.x} ${s}`);
const badMsg = (s) => console.log(`  ${C.r}✗${C.x} ${s}`);
const warn = (s) => console.log(`  ${C.y}!${C.x} ${s}`);
const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function sh(cmd, args, opt = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: opt.quiet ? 'pipe' : 'inherit', maxBuffer: 256 * 1024 * 1024, ...opt });
}
/**
 * 跑远程命令（ssh）。
 *
 * ⚠️ 不能用 `{ stdin: 'ignore' }` —— 它和 `stdio` 是**互斥选项**，
 *    Windows 上同时给出会 `spawnSync ssh EBUSY`（踩过一次）。
 *    要「stdin 给 /dev/null」就用 stdio 数组：`['ignore', 'pipe', 'inherit']`
 *    （忽略 stdin / 捕获 stdout / stderr 直接透出）。
 */
function ssh(remote, opt = {}) {
  const args = ['-i', SSH_KEY, '-o', 'ConnectTimeout=15', HOST, remote];
  return execFileSync('ssh', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opt.quiet ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/* ---------------- ① 本机清单（相对路径 → md5） ---------------- */
function scanLocal() {
  const out = new Map();
  const rec = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { rec(p); continue; }
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (isExcluded(rel)) continue;
      if (!inScope(rel)) continue;
      const buf = fs.readFileSync(p); // 单文件最大 46MB（资讯视频），逐个读并即刻释放
      out.set(rel, { size: buf.length, hash: crypto.createHash('md5').update(buf).digest('hex') });
    }
  };
  for (const r of ROOTS) rec(path.join(ROOT, r));
  return out;
}

/* ---------------- ② 线上清单 ---------------- */
function scanRemote() {
  // 一次 ssh 跑完整棵树的 md5；排除规则仍在本地过滤（保持单一判据来源）
  const out = ssh(`cd ${APP_DIR} && find ${ROOTS.join(' ')} -type f -exec md5sum {} +`, { quiet: true });
  const map = new Map();
  out.split('\n').forEach((line) => {
    const m = line.match(/^([0-9a-f]{32})\s+(.+?)\s*$/);
    if (!m) return;
    const rel = m[2].replace(/^\.\//, '');
    if (isExcluded(rel)) return;
    if (!inScope(rel)) return;
    map.set(rel, { hash: m[1] });
  });
  return map;
}

/* ---------------- ③ 比对 ---------------- */
function diff(local, remote) {
  const toSend = [];
  for (const [rel, l] of local) {
    const r = remote.get(rel);
    if (!r) toSend.push({ rel, size: l.size, reason: '线上没有' });
    else if (r.hash !== l.hash) toSend.push({ rel, size: l.size, reason: '内容不同' });
  }
  const toDelete = [];
  for (const rel of remote.keys()) if (!local.has(rel)) toDelete.push(rel);
  toSend.sort((a, b) => b.size - a.size);
  return { toSend, toDelete };
}

/* ---------------- ④ 推送 ---------------- */
function push(toSend) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(PATCH_LIST, toSend.map((f) => f.rel).join('\n') + '\n', 'utf8');

  const t0 = Date.now();
  if (fs.existsSync(PATCH_TAR)) fs.unlinkSync(PATCH_TAR);
  /*
   * ⚠️ 传给 tar / scp 的路径**必须用相对路径**（cwd 已经是项目根）。
   *    Windows 绝对路径 `C:\...` 里的 `C:` 会被 GNU tar 当成「远程主机:路径」解析，
   *    直接报 `tar: Cannot connect to C: resolve failed`（踩过一次）。
   *    相对路径没有冒号，两种工具都不会误判。
   */
  const REL_TAR = 'deploy/.build/patch.tar';
  const REL_LIST = 'deploy/.build/patch-list.txt';
  sh('tar', ['-cf', REL_TAR, '-C', '.', '-T', REL_LIST]);
  const mb = fs.statSync(PATCH_TAR).size / 1048576;
  okMsg(`打包完成 ${human(fs.statSync(PATCH_TAR).size)}（${toSend.length} 个文件，${((Date.now() - t0) / 1000).toFixed(1)}s）`);

  step(`传输补丁包（按 1.15 MB/s 估算约 ${mb < 0.05 ? '<1' : Math.ceil(mb / 1.15 / 60)} 分钟）`);
  const t1 = Date.now();
  sh('scp', ['-i', SSH_KEY, '-o', 'ConnectTimeout=15', '-C', REL_TAR, `${HOST}:${REMOTE_PATCH}`]);
  okMsg(`传输完成，用时 ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  /*
   * 只推素材时不重启服务：`media.js` 与 `/uploads` 静态服务都不带进程内缓存，
   * 文件落地即刻生效；而 `systemctl restart` 会白白打断线上一小会儿。
   * 其余情况（碰了 catalog.json / 代码）**必须**停服解包 ——
   * `catalogStore.js` 有进程内内存缓存，只覆盖文件不重启，下一次任何写操作
   * 都会把旧数据原样盖回来（第 29 批「导入 49 个商品线上还是 1 个」的根因）。
   */
  const needRestart = !ONLY;
  const lines = ['set -e'];
  if (needRestart) {
    lines.push(`cp -a ${APP_DIR}/server/data/catalog.json ${APP_DIR}/server/data/catalog.json.bak.$(date +%Y%m%d-%H%M%S)`);
    lines.push('systemctl stop lexy-mall');
  }
  lines.push(`tar -xf ${REMOTE_PATCH} -C ${APP_DIR}`);
  if (needRestart) {
    lines.push('systemctl start lexy-mall', 'sleep 3', 'echo "SVC=$(systemctl is-active lexy-mall)"');
  } else {
    lines.push('echo "SVC=$(systemctl is-active lexy-mall)（--only 未重启）"');
  }
  lines.push(
    `node -e "const c=require('${APP_DIR}/server/data/catalog.json');console.log('GOODS='+(c.goods||[]).length)"`,
    `node -e "const i=require('${APP_DIR}/server/data/uploads/index.json');console.log('ITEMS='+(i.items||[]).length)"`,
    `rm -f ${REMOTE_PATCH}`,
    'df -h /opt | tail -1',
  );

  step(needRestart ? '停服务 → 解包 → 起服务（停服务是必须的：catalogStore 有内存缓存）' : `解包到 ${APP_DIR}（--only：不重启服务）`);
  const out = ssh(lines.join('\n'), { quiet: true });

  out.split('\n').forEach((l) => {
    const s = l.trim();
    if (s.startsWith('SVC=')) okMsg(`服务状态 ${s.slice(4)}`);
    else if (s.startsWith('GOODS=')) info(`线上商品 ${s.slice(6)} 个`);
    else if (s.startsWith('ITEMS=')) info(`线上素材索引 ${s.slice(6)} 条`);
    else if (s.includes('%')) info(`磁盘 ${s}`);
  });
}

/**
 * 删除「线上有、本机没有」的文件。
 *
 * ⚠️ 必须独立于 push()：只在 push() 里做 prune 会导致
 *    「只删不传」（本机没改动，只想清线上残留）时根本不执行 —— 踩过。
 * 删除清单通过 scp 传上去再 while-read 逐行删，避免把上千个文件名塞进命令行。
 */
function pruneRemote(toDelete) {
  const REL_DEL = 'deploy/.build/patch-delete.txt';
  fs.writeFileSync(path.join(BUILD_DIR, 'patch-delete.txt'), toDelete.join('\n') + '\n', 'utf8');
  sh('scp', ['-i', SSH_KEY, '-o', 'ConnectTimeout=15', REL_DEL, `${HOST}:${REMOTE_LIST}`]);

  step(`删除线上多余文件 ${toDelete.length} 个`);
  const out = ssh(`set -e
cd ${APP_DIR}
while IFS= read -r f; do [ -n "$f" ] && rm -f "$f"; done < ${REMOTE_LIST}
echo "PRUNE_DONE=$(wc -l < ${REMOTE_LIST})"
rm -f ${REMOTE_LIST}`, { quiet: true });
  out.split('\n').forEach((l) => {
    const s = l.trim();
    if (s.startsWith('PRUNE_DONE=')) okMsg(`已删除 ${s.slice(11)} 个文件`);
  });
}

/* ---------------- ⑤ 验证（与小程序同路径） ---------------- */
/**
 * 素材专项验证：把刚推上去的文件**按小程序端的真实 URL 逐个 GET**。
 *
 * 为什么不复用 verify()：verify() 判的是「商品数一致 / 型号能点开」，
 * 素材推不上去它照样全绿 —— 而「图片加载失败」恰恰是素材缺失的典型症状
 * （小程序端 ENV='server'，图走 https://<host>/mall-api/uploads/…）。
 * 判据必须落在**真的能取到字节**上，且长度与本机文件一致。
 */
async function verifyUploads(list) {
  step('素材验证（线上逐张 GET，比对本机字节数）');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  /*
   * ⚠️ `/uploads` 静态路由**只放行图片与视频扩展名**（见 server/routes/media.js：
   *    其它类型一律 403「不支持的素材类型」）—— `uploads/index.json` 是素材索引，
   *    本来就不该也不能通过 HTTP 取。所以它只能走 SSH 比哈希，不能进 GET 清单，
   *    否则每次都会报一个假的 403 失败（真踩过）。
   */
  const MEDIA = /\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i;
  const media = list.filter((f) => MEDIA.test(f.rel));
  const others = list.filter((f) => !MEDIA.test(f.rel));

  let bad = 0;
  const CONC = 8;
  for (let i = 0; i < media.length; i += CONC) {
    await Promise.all(media.slice(i, i + CONC).map(async (f) => {
      const url = BASE + '/' + f.rel.replace(/^server\/data\//, '');  // server/data/uploads/x → /uploads/x
      try {
        const r = await fetch(url);
        const len = (await r.arrayBuffer()).byteLength;
        if (r.status !== 200 || (f.size && len !== f.size)) {
          bad++;
          badMsg(`${r.status} ${url}（线上 ${len}B / 本机 ${f.size}B）`);
        }
      } catch (e) { bad++; badMsg(`${url} ⇒ ${e.message}`); }
    }));
  }
  if (media.length && !bad) okMsg(`${media.length} 个图片/视频全部可取（字节数与本机一致）`);

  if (others.length) {
    // 非媒体文件（index.json 等）：SSH 比 md5，判据同样是「内容一致」而非「文件在」
    const localMd5 = new Map(others.map((f) => [f.rel, crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f.rel))).digest('hex')]));
    const out = ssh(`cd ${APP_DIR} && md5sum ${others.map((f) => `'${f.rel}'`).join(' ')}`, { quiet: true });
    const remoteMd5 = new Map();
    out.split('\n').forEach((l) => { const m = l.match(/^([0-9a-f]{32})\s+(.+?)\s*$/); if (m) remoteMd5.set(m[2], m[1]); });
    const diffFiles = others.filter((f) => remoteMd5.get(f.rel) !== localMd5.get(f.rel));
    if (diffFiles.length) { bad += diffFiles.length; diffFiles.slice(0, 5).forEach((f) => badMsg(`${f.rel} 线上内容与本机不一致`)); }
    else okMsg(`${others.length} 个非媒体文件（素材索引等）内容一致（SSH 比 md5）`);
  }
  return bad === 0;
}

/**
 * 收集「小程序端真的会去取」的素材地址。
 *
 * 三个来源缺一不可（与「删除素材先查引用」同一份口径，见 .workbuddy/memory/PITFALLS.md）：
 *   ① `miniprogram/config/replica.js` —— 已发布的页面内容（首页区块、自定义页、店铺头像、导航图标）
 *   ② `server/data/catalog.json`       —— 商品主图 / 图集 / 图文详情长图
 *   ③ `server/data/decorate/state.json`—— 还没发布、但运营马上要发布的草稿
 * 只扫 replica 会漏掉商品图；只扫 catalog 会漏掉页面区块图。
 */
function collectUploadRefs() {
  const files = [
    'miniprogram/config/replica.js',
    'server/data/catalog.json',
    'server/data/decorate/state.json',
  ];
  const set = new Set();
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    for (const m of txt.match(/\/uploads\/[0-9A-Za-z_/.\-]+\.(?:png|jpe?g|webp|gif|mp4|mov|webm)/g) || []) set.add(m);
  }
  return [...set];
}

/**
 * 逐个 GET 校验素材线上可取。
 *
 * 为什么必须是「线上逐张取」而不是「检查本机有没有这个文件」：
 *   小程序端 `ENV='server'`，图一律走 `https://<host>/mall-api/uploads/…`。
 *   素材物理文件只落在**本机** `server/data/uploads/`（装修台在本机跑），
 *   没推上线时本机一切正常 —— 装修台的手机预览由本机服务同源喂图，必然显示得出来，
 *   `/preview` 同理。**只有开发者工具 / 真机才暴露「图片加载失败」**。
 *   所以判据只能落在「这个 URL 现在能不能取到字节」。
 */
async function verifyUploadRefs() {
  /*
   * 全量扫一遍是把这 1000 多张图**真的下载一次**（约 270 MB、几分钟），
   * 所以 `--fast` 只等距抽 40 张 —— 语义仍是「线上取得到吗」，只是把
   * 「少了一张图」的检出概率从 100% 降到「按比例抽样」。默认（不带 --fast）全查。
   */
  const refs = collectUploadRefs();
  step(`素材可达性（${FAST ? `等距抽样 ${Math.min(40, refs.length)} / ` : ''}${refs.length} 个引用逐个 GET）`);
  if (!refs.length) { info('（没有引用到任何 /uploads 素材）'); return true; }
  const list = FAST && refs.length > 40
    ? Array.from({ length: 40 }, (_, i) => refs[Math.floor((i * refs.length) / 40)])
    : refs;
  const miss = [];
  const CONC = 16;
  for (let i = 0; i < list.length; i += CONC) {
    await Promise.all(list.slice(i, i + CONC).map(async (p) => {
      try { const r = await fetch(BASE + p); if (r.status !== 200) miss.push(`${r.status} ${p}`); }
      catch (e) { miss.push(`${e.message} ${p}`); }
    }));
  }
  if (!miss.length) { okMsg(`${list.length} 个素材线上全部可取（实下载校验）`); return true; }
  badMsg(`${miss.length}/${list.length} 个素材线上取不到 —— 小程序端会显示「图片加载失败」：`);
  miss.slice(0, 10).forEach((m) => info(`  ${m}`));
  if (miss.length > 10) info(`  …另外 ${miss.length - 10} 个`);
  info('  修法：node .tooling/sync-incremental.mjs --only=server/data/uploads --apply');
  return false;
}

/**
 * 素材库里的「自检夹具残留」（`orig` 为 `selfcheck-*` / `ui-test-<6位hex>.*` / `from-json.*`，
 * **判据只定义在 `.tooling/fixture-orig.mjs`**，与 `sweep-selfcheck.mjs` 同源）。
 *
 * 为什么会在体检里出现这一条：
 *   `server/tools/check-all.mjs` 为了验上传/删除链路，会**真的**造 2×2 png /
 *   248 B mp4 这类夹具上传。设计上测完即删，但环境层的批量删除护栏
 *   （`[SAFE_DELETE_BULK_CONFIRM_REQUIRED]`，同一窗口删除动作超阈值即拦）
 *   会把收尾删除挡掉，夹具于是**登记进素材索引留了下来**。
 *   实测累积 190 条（`selfcheck-folder.png` / `selfcheck-clip.mp4` / `selfcheck-2x2.png`），
 *   而且索引会被同步上线 —— 直接出现在运营的素材管理列表里，名字还很扎眼。
 *
 * 为什么只告警、不算失败：
 *   残留是「跑过自检」的副作用（跑完立刻体检必然命中），把它算失败会让体检
 *   永远红。所以这里只报数 + 给一行修法，不影响退出码。
 */
function checkFixtureResidue() {
  const p = path.join(ROOT, 'server/data/uploads/index.json');
  if (!fs.existsSync(p)) return;
  let items = [];
  try { items = JSON.parse(fs.readFileSync(p, 'utf8')).items || []; } catch (e) { return; }
  const fx = items.filter(isFixtureItem);
  if (!fx.length) { okMsg('素材库没有被自检夹具污染'); return; }
  warn(`素材索引里有 ${fx.length} 条自检夹具残留（运营在素材管理列表里看得到）：`);
  fx.slice(0, 3).forEach((x) => info(`  ${x.name}  (orig=${x.orig})`));
  if (fx.length > 3) info(`  …另外 ${fx.length - 3} 条`);
  info('  修法：node .tooling/sweep-selfcheck.mjs --apply（移出素材目录并清索引，不删文件）');
}

async function verify() {
  step('线上验证');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!health || health.code !== 0) { badMsg('健康检查不通'); return false; }
  okMsg(`服务在跑，点位 ${health.data.routes} 个，DEBUG_PAGE=${health.data.debugPage}`);

  /*
   * 素材可达性放在最前面：它是「小程序里图片加载失败」的唯一直接判据，
   * 而本机（装修台预览 / /preview）永远看不出来 —— 先报这一条，
   * 省得看到「商品数一致」就以为没事。
   */
  const mediaOk = await verifyUploadRefs();
  checkFixtureResidue();

  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/catalog.json'), 'utf8'));
  const localGoods = (catalog.goods || []).length;
  const list = await fetch(BASE + '/api/goods/list?page=1&size=100').then((r) => r.json()).catch(() => null);
  const total = (list && list.data && list.data.total) || 0;
  if (total === localGoods) okMsg(`商品数与本机一致（${total} 个）`);
  else badMsg(`商品数不一致：线上 ${total} / 本机 ${localGoods}`);

  if (FAST) { info('（--fast：跳过逐个型号验证）'); return mediaOk && total === localGoods; }

  // 产品页型号必须真的能点开 —— 这是「详情页空白」事故的直接判据
  const reg = require_(path.join(ROOT, 'miniprogram/config/replica.js'));
  const have = new Set((catalog.goods || []).map((g) => g.id));
  const models = [];
  (reg.PRODUCT_BRANDS || []).forEach((b) => (b.groups || []).forEach((g) => (g.products || []).forEach((p) => {
    const id = (String(p.link || '').match(/id=([^&]+)/) || [])[1];
    models.push({ brand: b.brand || b.name, model: p.model, id, exists: id ? have.has(id) : false });
  })));

  let open = 0;
  const dead = [];
  const CONC = 6;
  for (let i = 0; i < models.length; i += CONC) {
    await Promise.all(models.slice(i, i + CONC).map(async (m) => {
      if (!m.id) { dead.push(`${m.brand}/${m.model}（未挂链接）`); return; }
      try {
        const j = await fetch(`${BASE}/api/goods/detail?id=${encodeURIComponent(m.id)}`).then((r) => r.json());
        if (j.code === 0 && j.data) open++;
        else dead.push(`${m.brand}/${m.model} → ${m.id} ⇒ ${j.code} ${j.msg}`);
      } catch (e) { dead.push(`${m.brand}/${m.model} → ${m.id} ⇒ ${e.message}`); }
    }));
  }
  if (!models.length) { info('（跳过型号验证：本机 replica.js 读不到型号）'); return true; }
  if (dead.length === 0) okMsg(`产品页 ${open}/${models.length} 个型号全部可以点开商品详情`);
  else {
    badMsg(`${open}/${models.length} 可打开，${dead.length} 个打不开：`);
    dead.slice(0, 10).forEach((d) => info(`  ${d}`));
  }
  return mediaOk && dead.length === 0 && total === localGoods;
}

/* ---------------- 主流程 ---------------- */
(async () => {
  console.log(`${C.b}莱克商城 · 增量同步${C.x}  ${C.d}${HOST} → ${APP_DIR}${C.x}`);

  if (MODE_VERIFY) {
    const passed = await verify();
    process.exit(passed ? 0 : 1);
  }

  step('比对两端（内容哈希，不只是时间戳）');
  const t0 = Date.now();
  const local = scanLocal();
  const remote = scanRemote();
  okMsg(`本机 ${local.size} 个文件 ／ 线上 ${remote.size} 个文件  ${C.d}(用时 ${((Date.now() - t0) / 1000).toFixed(1)}s)${C.x}`);

  const { toSend, toDelete } = diff(local, remote);
  const bytes = toSend.reduce((a, f) => a + f.size, 0);

  step('差异');
  if (!toSend.length) okMsg('本机与线上完全一致，无需同步');
  else {
    const byTop = new Map();
    toSend.forEach((f) => { const k = f.rel.startsWith('server/data/uploads/') ? 'server/data/uploads/（素材）' : f.rel; byTop.set(k, (byTop.get(k) || 0) + 1); });
    info(`待传 ${toSend.length} 个文件，共 ${human(bytes)}`);
    [...byTop.entries()].slice(0, 20).forEach(([k, n]) => info(`  ${n} × ${k}`));
    if (byTop.size > 20) info(`  …另外 ${byTop.size - 20} 个文件`);
  }
  if (toDelete.length) {
    warn(`线上多出 ${toDelete.length} 个本机没有的文件（默认不删，加 --prune 才会删）：`);
    toDelete.slice(0, 10).forEach((f) => info(`  ${f}`));
    if (toDelete.length > 10) info(`  …另外 ${toDelete.length - 10} 个`);
  }

  if (!APPLY) {
    console.log('');
    info(`试跑模式：未做任何改动。加 --apply 即执行（本次约需传输 ${human(bytes)}）。`);
    if (toDelete.length && !PRUNE) info('如需同时清理线上多余文件，再加 --prune。');
    return;
  }

  if (!toSend.length && !(PRUNE && toDelete.length)) {
    console.log(`\n${C.g}${C.b}两端已一致，无需同步。${C.x}`);
    return;
  }

  step('确认 SSH 可达');
  try { ssh('echo SSH_OK', { quiet: true }); okMsg('SSH 可达'); }
  catch (e) { badMsg(`SSH 连不上（密钥 ${SSH_KEY}），已中止`); process.exit(1); }

  if (toSend.length) push(toSend);
  if (PRUNE && toDelete.length) pruneRemote(toDelete);

  const passed = ONLY_UPLOADS && toSend.length ? await verifyUploads(toSend) : await verify();
  console.log('');
  if (passed) console.log(`${C.g}${C.b}增量同步完成。${C.x}`);
  else console.log(`${C.r}${C.b}同步存在问题，请按上面的 ✗ 排查。${C.x}`);
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.error(`\n${C.r}失败：${e.message}${C.x}`); process.exit(1); });
