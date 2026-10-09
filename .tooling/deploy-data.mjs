#!/usr/bin/env node
/**
 * 把本机业务数据同步到线上服务器（一键）
 *
 * ── 为什么需要这个脚本 ──────────────────────────────────────────────
 * 小程序端 `utils/constants.js` 的 `ENV = 'server'`，读的是**云服务器**的数据：
 *   https://14.103.50.137/mall-api  → nginx → 127.0.0.1:3000
 *
 * 所以「本机改了商品 / 素材 / 装修」**不等于线上生效**。第 29 批的真实事故：
 * 导入 49 个有赞商品后，本机商品库 49 个、服务器上仍是 1 个 ——
 * 产品页 51 个型号里只有 S10 系列（服务器上恰好有那个旧商品）能点开，
 * 其余 50 个一律进「该商品已下架或不存在」。查了半天代码，根因是数据没上线。
 *
 * 两件必须成对做的事，少一件都会得到「改了没反应」的假象：
 *   ① 传数据（catalog.json + uploads/ + decorate/）
 *   ② **重启服务** —— `server/lib/catalogStore.js` 有进程内内存缓存（`let cache`），
 *      只覆盖文件不重启，下一次任何写操作都会把旧数据原样盖回来。
 *      （`uploads/` 与 `media.js` 无缓存，但 catalog 有。）
 *
 * ── 用法 ───────────────────────────────────────────────────────────
 *   node .tooling/deploy-data.mjs            全流程：打包 → 传 → 解包 → 重启 → 验证
 *   node .tooling/deploy-data.mjs --dry      只算体量、打印将要做的事，不连服务器
 *   node .tooling/deploy-data.mjs --verify   只跑线上验证（不传任何东西，秒级）
 *   node .tooling/deploy-data.mjs --code     连同 server/ 与 miniprogram/ 代码一起传
 *                                            （默认也传代码，见 CODE_SYNC）
 *
 * ── 有意不传的东西 ─────────────────────────────────────────────────
 *   server/data/db.json     用户 / 购物车 / 订单 / 库存 —— 生产环境全新自举，
 *                           避免把本机的联调用户与测试订单带上线（见 server/README.md）
 *   project.private.config.json / .tooling / .workbuddy  —— 开发机专有，上线无意义
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------------- 目标机器（与 server/README.md「八、已部署实例」保持一致） ---------------- */
const SSH_KEY = process.env.LEXYSYNC_KEY || path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519');
const HOST = process.env.LEXYSYNC_HOST || 'root@14.103.50.137';
const APP_DIR = '/opt/lexy-mall';
const BASE = process.env.LEXYSYNC_BASE || 'https://14.103.50.137/mall-api';
const TARBALL = path.join(ROOT, 'deploy', '.build', 'sync.tar');
const REMOTE_TARBALL = '/root/sync.tar';

const MODE_DRY = process.argv.includes('--dry');
const MODE_VERIFY = process.argv.includes('--verify');

/* ---------------- 小工具 ---------------- */
const C = { d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' };
const step = (s) => console.log(`\n${C.b}▸ ${s}${C.x}`);
const info = (s) => console.log(`  ${s}`);
const okMsg = (s) => console.log(`  ${C.g}✓${C.x} ${s}`);
const badMsg = (s) => console.log(`  ${C.r}✗${C.x} ${s}`);
const warn = (s) => console.log(`  ${C.y}!${C.x} ${s}`);

function sh(cmd, args, opt = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: opt.quiet ? 'pipe' : 'inherit', maxBuffer: 64 * 1024 * 1024, ...opt });
}
/** 跑远程命令（ssh）。stdin 给 /dev/null，避免远程交互式命令把后续脚本吃掉（README 里记过的坑）。 */
function ssh(remote, opt = {}) {
  return sh('ssh', ['-i', SSH_KEY, '-o', 'ConnectTimeout=15', HOST, remote], opt);
}

/* ---------------- ① 校验本机待传数据 ---------------- */
function inspectLocal() {
  step('检查本机待同步数据');

  const catalogPath = path.join(ROOT, 'server/data/catalog.json');
  const idxPath = path.join(ROOT, 'server/data/uploads/index.json');
  if (!fs.existsSync(catalogPath)) throw new Error('缺少 server/data/catalog.json');

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const goods = (catalog.goods || []).length;
  const items = fs.existsSync(idxPath) ? (JSON.parse(fs.readFileSync(idxPath, 'utf8')).items || []).length : 0;

  /** 递归统计上传目录体量（只用 Node，避免依赖 du） */
  const upDir = path.join(ROOT, 'server/data/uploads');
  let files = 0, bytes = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== 'index.json') { files++; bytes += fs.statSync(p).size; }
    }
  })(upDir);

  info(`商品 ${goods} 个  |  分类（含二级）${(catalog.categories || []).length} 个一级`);
  info(`素材索引 ${items} 条  |  素材文件 ${files} 个  ${C.d}(${(bytes / 1048576).toFixed(1)} MB)${C.x}`);

  // 型号链接必须都能在本机商品库里找到，否则传上去照样是空白页
  const reg = require_(path.join(ROOT, 'miniprogram/config/replica.js'));
  const have = new Set((catalog.goods || []).map((g) => g.id));
  const models = [];
  (reg.PRODUCT_BRANDS || []).forEach((b) => (b.groups || []).forEach((g) => (g.products || []).forEach((p) => {
    const id = (String(p.link || '').match(/id=([^&]+)/) || [])[1];
    models.push({ brand: b.brand || b.name, model: p.model, id });
  })));
  const broken = models.filter((m) => m.id && !have.has(m.id));
  const noLink = models.filter((m) => !m.id);
  info(`产品页型号 ${models.length} 个（已挂链接 ${models.length - noLink.length}，未挂 ${noLink.length}）`);
  if (broken.length) {
    warn(`有 ${broken.length} 个型号指向本机商品库里不存在的商品：${broken.slice(0, 5).map((b) => `${b.brand}/${b.model}→${b.id}`).join('，')}`);
  } else {
    okMsg('型号链接与本机商品库对得上，零悬空');
  }
  return { goods, items, models, bytes };
}

/* ---------------- ② 打包 ---------------- */
function pack() {
  step('打包 server/ 与 miniprogram/（排除 db.json 与开发机专有文件）');
  fs.mkdirSync(path.dirname(TARBALL), { recursive: true });
  if (fs.existsSync(TARBALL)) fs.unlinkSync(TARBALL);

  const t0 = Date.now();
  sh('tar', [
    '-cf', TARBALL,
    '--exclude=server/data/db.json',
    '--exclude=server/data/db.json.broken.*',
    '--exclude=miniprogram/project.private.config.json',
    'server', 'miniprogram'
  ]);

  const mb = (fs.statSync(TARBALL).size / 1048576).toFixed(1);
  okMsg(`打包完成 ${mb} MB，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return Number(mb);
}

/* ---------------- ③ 传输 + ④ 解包重启 ---------------- */
function push(mb) {
  step(`传输到 ${HOST}（按 1.15 MB/s 估算约 ${Math.round(mb / 1.15 / 60)} 分钟）`);
  const t0 = Date.now();
  // -C 开压缩：图片压不动，但 JSON / 代码能省一点，且不影响单个大文件
  sh('scp', ['-i', SSH_KEY, '-o', 'ConnectTimeout=15', '-C', TARBALL, `${HOST}:${REMOTE_TARBALL}`]);
  okMsg(`传输完成，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  step('停服务 → 解包 → 起服务（停服务是必须的：catalogStore 有内存缓存）');
  const out = ssh(`set -e
cp -a ${APP_DIR}/server/data/catalog.json ${APP_DIR}/server/data/catalog.json.bak.$(date +%Y%m%d-%H%M%S)
systemctl stop lexy-mall
tar -xf ${REMOTE_TARBALL} -C ${APP_DIR}
systemctl start lexy-mall
sleep 3
echo "SVC=$(systemctl is-active lexy-mall)"
node -e "const c=require('${APP_DIR}/server/data/catalog.json');console.log('GOODS='+(c.goods||[]).length)"
node -e "const i=require('${APP_DIR}/server/data/uploads/index.json');console.log('ITEMS='+(i.items||[]).length)"
rm -f ${REMOTE_TARBALL}
df -h /opt | tail -1`, { quiet: true });

  out.split('\n').forEach((l) => {
    const s = l.trim();
    if (s.startsWith('SVC=')) okMsg(`服务状态 ${s.slice(4)}`);
    else if (s.startsWith('GOODS=')) info(`线上商品 ${s.slice(6)} 个`);
    else if (s.startsWith('ITEMS=')) info(`线上素材索引 ${s.slice(6)} 条`);
    else if (s.includes('%')) info(`磁盘 ${s}`);
  });
  return out;
}

/* ---------------- ⑤ 验证（最关键：逐个型号真的打开一次） ---------------- */
async function verify(local) {
  step('线上验证（与小程序同一路径）');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!health || health.code !== 0) { badMsg('健康检查不通'); return false; }
  okMsg(`服务在跑，点位 ${health.data.routes} 个，DEBUG_PAGE=${health.data.debugPage}`);

  const list = await fetch(BASE + '/api/goods/list?page=1&size=100').then((r) => r.json()).catch(() => null);
  const total = (list && list.data && list.data.total) || 0;
  if (local && total === local.goods) okMsg(`商品数与本机一致（${total} 个）`);
  else if (local) badMsg(`商品数不一致：线上 ${total} / 本机 ${local.goods}`);
  else info(`线上商品 ${total} 个`);

  // 逐个型号打详情接口 —— 这是「产品页能不能点开」的直接判据
  const models = (local && local.models) || [];
  let open = 0;
  const dead = [];
  const CONC = 6;
  for (let i = 0; i < models.length; i += CONC) {
    const chunk = models.slice(i, i + CONC);
    await Promise.all(chunk.map(async (m) => {
      if (!m.id) { dead.push(`${m.brand}/${m.model}（未挂链接）`); return; }
      try {
        const j = await fetch(`${BASE}/api/goods/detail?id=${encodeURIComponent(m.id)}`).then((r) => r.json());
        if (j.code === 0 && j.data) open++;
        else dead.push(`${m.brand}/${m.model} → ${m.id} ⇒ ${j.code} ${j.msg}`);
      } catch (e) { dead.push(`${m.brand}/${m.model} → ${m.id} ⇒ ${e.message}`); }
    }));
  }

  if (!models.length) { info('（跳过型号逐个验证：本机 replica.js 读不到型号）'); return true; }
  if (dead.length === 0) {
    okMsg(`产品页 ${open}/${models.length} 个型号全部可以点开商品详情`);
  } else {
    badMsg(`${open}/${models.length} 可打开，${dead.length} 个打不开：`);
    dead.slice(0, 12).forEach((d) => info(`  ${d}`));
  }

  // 商品图必须真的能访问（否则详情页图裂，看着像「空白」）
  // ⚠️ 用 Range 而不是 HEAD：本项目的静态服务**只实现 GET/OPTIONS，不处理 HEAD** ——
  //    对 HEAD 一律回 404，会报出「0/6 可访问」这种与事实相反的结论。
  //    带 `Range: bytes=0-0` 只回 206 + 1 字节，既省流量，又顺带验证了
  //    视频拖动进度条所依赖的 Range 支持（实现在 server/index.js 的静态文件分支）。
  const sample = await fetch(`${BASE}/api/goods/list?page=1&size=12`).then((r) => r.json()).catch(() => null);
  const covers = ((sample && sample.data && sample.data.list) || []).map((g) => g.cover).filter(Boolean).slice(0, 6);
  let imgOk = 0;
  for (const u of covers) {
    try {
      const r = await fetch(BASE + u, { headers: { Range: 'bytes=0-0' } });
      if (r.ok) { imgOk++; await r.arrayBuffer(); } // 读掉 body，避免连接挂着不释放
    } catch (e) { /* ignore */ }
  }
  if (covers.length) {
    if (imgOk === covers.length) okMsg(`抽查 ${covers.length} 张商品主图全部可访问（HTTP 200）`);
    else badMsg(`商品主图有裂图：${imgOk}/${covers.length} 可访问`);
  }

  return dead.length === 0;
}

/* ---------------- 主流程 ---------------- */
(async () => {
  console.log(`${C.b}莱克商城 · 数据同步到线上${C.x}  ${C.d}${HOST} → ${APP_DIR}${C.x}`);

  const local = inspectLocal();

  if (MODE_DRY) {
    step('试跑模式：到此为止，未连服务器');
    info('去掉 --dry 即执行：打包 → 传输 → 解包重启 → 验证');
    return;
  }

  if (!MODE_VERIFY) {
    // SSH 通不通先确认，避免白打包 319MB
    step('确认 SSH 可达');
    try {
      ssh('echo SSH_OK', { quiet: true });
      okMsg('SSH 可达');
    } catch (e) {
      badMsg('SSH 连不上，已中止（密钥 ' + SSH_KEY + '）');
      process.exit(1);
    }
    const mb = pack();
    push(mb);
  } else {
    step('仅验证模式：不传任何东西');
  }

  const passed = await verify(local);

  console.log('');
  if (passed) console.log(`${C.g}${C.b}同步完成：线上数据已与本机一致，产品页型号全部可打开。${C.x}`);
  else console.log(`${C.r}${C.b}同步存在问题，请按上面的 ✗ 逐条排查。${C.x}`);
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.error(`\n${C.r}失败：${e.message}${C.x}`); process.exit(1); });
