#!/usr/bin/env node
/**
 * 开发期数据复位：把用户业务数据（server/data/db.json）收敛成「最小可用集」
 *
 * 为什么需要它
 * ------------
 * 自检（`tools/check-all.mjs`）**每次都用随机 code 登录**（刻意设计：保证自检状态干净），
 * 于是每跑一次就新建一个「联调账号」；下单主链路那笔订单也不取消。跑几十轮之后，
 * 后台「客户管理」里会堆一堆同名账号，`payLogs` 里堆一堆指向已删订单的孤儿日志。
 * 这些不是 bug，是开发期噪音 —— 但手工清容易漏，所以固化成一条命令。
 *
 * 它做什么
 * --------
 *   1. 客户：保留最近活跃的 N 个（默认 1），其余连同其购物车 / 地址 / 券 / 收藏 / 足迹一并删除
 *   2. 评价：保留 N 条（默认 1），并清掉「商品已不存在」的幽灵评价及其商家回复
 *   3. 订单（可选）：显式传 `--keep-orders=N` 才清。库存默认一律不碰 —— 自检收尾自己会把
 *      净消耗补回，两边都补会凭空多出库存；要把库存对齐回商品库初始值请传 `--sync-stock`
 *   4. 孤儿清理：payLogs 里指向已不存在订单的日志、各类表里已删用户的空壳键
 *   5. 全量备份到 `.tooling/_backup/`（带 sha1），失败可原样还原
 *
 * ⚠️ 必须在服务停止后运行
 * ----------------------
 * `lib/store.js` 是「内存态 + 50ms 落盘」，服务运行时改 db.json 会被内存态整个覆盖回去。
 * 所以脚本会先探测 3000 端口，服务还在跑就直接退出（`--force` 可绕过，但强烈不建议）。
 *
 * 用法
 * ----
 *   node server/tools/reset-dev-data.mjs                  # 预演（默认，不写文件）
 *   node server/tools/reset-dev-data.mjs --apply          # 真正执行
 *   node server/tools/reset-dev-data.mjs --apply --keep-users=1 --keep-comments=1
 *   node server/tools/reset-dev-data.mjs --apply --keep-users=0 --keep-comments=0   # 全清
 *   node server/tools/reset-dev-data.mjs --apply --keep-orders=0                     # 连自检留下的订单一起清
 *   node server/tools/reset-dev-data.mjs --apply --sync-stock                        # 库存对齐回商品库初始值
 *   node server/tools/reset-dev-data.mjs --apply --no-seed                           # 不补演示评价
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DB_FILE = join(__dirname, '..', 'data', 'db.json');
const CATALOG_FILE = join(__dirname, '..', 'data', 'catalog.json');
const BACKUP_DIR = join(ROOT, '.tooling', '_backup');

/* ------------------------------- 参数 ------------------------------- */

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const has = (name) => argv.includes(`--${name}`);

const APPLY = has('apply');
const FORCE = has('force');
const NO_SEED = has('no-seed');
const KEEP_USERS = Math.max(0, Number(flag('keep-users', '1')) || 0);
const KEEP_COMMENTS = Math.max(0, Number(flag('keep-comments', '1')) || 0);
/* 订单默认不动；显式传 --keep-orders=N 才清（0 = 全清） */
const KEEP_ORDERS_RAW = flag('keep-orders', '');
const HAS_ORDER_OPT = KEEP_ORDERS_RAW !== '';
const KEEP_ORDERS = HAS_ORDER_OPT ? Math.max(0, Number(KEEP_ORDERS_RAW) || 0) : 0;
/*
 * 库存处理：默认**一律不碰**。
 *
 * 曾经的「删订单就把占用库存补回」是错的：自检（check-all）本身就会在收尾把净消耗补回，
 * 订单却按设计留着 —— 于是「自检补一次 + reset 再补一次」= 库存凭空变多。
 * 需要把库存对齐回商品库里的初始值时，显式传 --sync-stock。
 */
const SYNC_STOCK = has('sync-stock');

/**
 * 演示评价（仅在「清完之后一条都不剩」时用来补足，保证后台评价页不是空的）
 *
 * 文案沿用项目原本的演示评价第 1 条，不另编；`commentId` 与原格式一致。
 */
const DEMO_COMMENT = {
  author: '莱**',
  score: 5,
  content: '收到货就用了，做工扎实，噪音比想象中小，家里人都满意。'
};

/* ----------------------------- 前置检查 ----------------------------- */

/** 服务在跑吗（在跑就不能改文件：内存态会覆盖回去） */
function serverAlive() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 3000, path: '/api/health', timeout: 1200 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function sha1(buf) {
  return createHash('sha1').update(buf).digest('hex').slice(0, 12);
}

/** 最近活跃优先：lastLoginAt 缺失时回落到 createdAt */
const userClock = (u) => Number(u.lastLoginAt || u.createdAt || 0);
/** 评价按时间倒序，最新的优先保留 */
const commentClock = (c) => Number(c.createdAt || 0);

/* ------------------------------- 主流程 ------------------------------- */

const alive = await serverAlive();
if (alive && !FORCE) {
  console.error('✗ 检测到 http://127.0.0.1:3000 仍在监听。');
  console.error('  store.js 是「内存态 + 定时落盘」，运行中改 db.json 会被内存态整个覆盖。');
  console.error('  请先停掉后端（只杀占用 3000 端口的那个 node 进程），再重跑本脚本。');
  console.error('  确实要跳过检查请加 --force（不建议）。');
  process.exit(1);
}

if (!existsSync(DB_FILE)) {
  console.error('✗ 找不到 ' + DB_FILE);
  process.exit(1);
}

const db = JSON.parse(readFileSync(DB_FILE, 'utf8'));
const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
const goodsIds = new Set((catalog.goods || []).map((g) => g.id));

const report = [];
const line = (s) => { report.push(s); console.log(s); };

/* --- 0. 先剔除「指向已不存在商品」的幽灵数据（无论保留几个都要清） --- */
const ghosts = (db.comments || []).filter((c) => !goodsIds.has(c.goodsId));
line(`幽灵评价（商品已不在商品库）：${ghosts.length} 条`);
ghosts.slice(0, 8).forEach((c) => line(`   · ${c.commentId} → ${c.goodsId}`));
if (ghosts.length > 8) line(`   · …其余 ${ghosts.length - 8} 条`);

const keptCommentIds = new Set(
  (db.comments || [])
    .filter((c) => goodsIds.has(c.goodsId))
    .sort((a, b) => commentClock(b) - commentClock(a))
    .slice(0, KEEP_COMMENTS)
    .map((c) => c.commentId)
);

/* --- 1. 客户：保留最近活跃的 N 个 --- */
const users = (db.users || []).slice().sort((a, b) => userClock(b) - userClock(a));
const keepUsers = users.slice(0, KEEP_USERS);
const dropUsers = users.slice(KEEP_USERS);
const keepIds = new Set(keepUsers.map((u) => u.userId));

line('');
line(`客户：${users.length} → ${keepUsers.length}（保留最近活跃的 ${KEEP_USERS} 个）`);
keepUsers.forEach((u) => line(`   保留 ${u.userId}  ${u.nickname || '(无昵称)'}  最近活跃 ${new Date(userClock(u)).toISOString().slice(0, 19)}`));
if (dropUsers.length) line(`   删除 ${dropUsers.length} 个（同名「联调账号」多为自检每轮新建）`);

/* --- 2. 统计各附属表的孤儿 --- */
const userKeyed = ['carts', 'addresses', 'coupons', 'favorites', 'footprints'];
const orphanCount = {};
userKeyed.forEach((k) => {
  const o = db[k] || {};
  const bad = Object.keys(o).filter((uid) => !keepIds.has(uid));
  // 空壳（有键但无内容）也算噪音
  const empty = Object.keys(o).filter((uid) => keepIds.has(uid) && !size(o[uid]));
  orphanCount[k] = bad.length + empty.length;
});

/* --- 3. payLogs：订单已不在的日志（孤儿） --- */
let orderNos = new Set((db.orders || []).map((o) => o.orderNo));
const deadPayLogs = (db.payLogs || []).filter((p) => !orderNos.has(p.orderNo));

line('');
line('孤儿数据：');
userKeyed.forEach((k) => line(`   ${k}：${Object.keys(db[k] || {}).length} 键 → 待清理 ${orphanCount[k]} 个孤儿/空壳键`));
line(`   payLogs：${(db.payLogs || []).length} 条 → 待清理 ${deadPayLogs.length} 条（订单已删除）`);
line(`   commentReplies：${Object.keys(db.commentReplies || {}).length} 条 → 会同步清掉指向已删评价的回复`);
line(`   评价：${(db.comments || []).length} 条 → 清理后保留 ${keptCommentIds.size} 条`);
line(HAS_ORDER_OPT
  ? `   订单：${(db.orders || []).length} 笔 → 保留 ${Math.min(KEEP_ORDERS, (db.orders || []).length)} 笔（--keep-orders=${KEEP_ORDERS}）`
  : `   订单：${(db.orders || []).length} 笔 → 不动（要清请显式传 --keep-orders=N）`);
line(SYNC_STOCK
  ? `   库存：将按商品库初始值重置 → ${JSON.stringify((catalog.goods || []).reduce((o, g) => { (g.skus || []).forEach((s) => { o[s.skuId] = s.stock; }); return o; }, {}))}`
  : `   库存：${JSON.stringify(db.stocks || {})} → 不动（库存由自检自行保证净影响归零；要重置传 --sync-stock）`);

/* --- 4. 预演：清完是否要补演示评价 --- */
const onSaleGoods = (catalog.goods || []).find((g) => g.status === 'on_sale');
const willSeed = (!NO_SEED && KEEP_COMMENTS > 0) ? Math.max(0, KEEP_COMMENTS - keptCommentIds.size) : 0;
if (willSeed) {
  line(`   ↳ 保留数不足目标 ${KEEP_COMMENTS} 条，将补足 ${willSeed} 条演示评价${onSaleGoods ? ` → ${onSaleGoods.id}（${onSaleGoods.name}）` : '（⚠ 无在售商品，跳过）'}`);
}

/* ------------------------------ 执行 ------------------------------ */

if (!APPLY) {
  line('');
  line('（预演模式，未写入任何文件；确认无误后加 --apply 执行）');
  process.exit(0);
}

/* 备份 */
mkdirSync(BACKUP_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
[['db', DB_FILE], ['catalog', CATALOG_FILE]].forEach(([name, file]) => {
  const buf = readFileSync(file);
  const dst = join(BACKUP_DIR, `${name}.pre-reset-${ts}.json`);
  writeFileSync(dst, buf);
  line(`备份 → ${dst.replace(ROOT, '.')}  sha1=${sha1(buf)}`);
});

/* 客户 + 附属表 */
db.users = keepUsers;
userKeyed.forEach((k) => {
  const kept = {};
  Object.keys(db[k] || {}).forEach((uid) => {
    if (!keepIds.has(uid)) return;
    if (!size(db[k][uid])) return; // 空壳一并丢掉
    kept[uid] = db[k][uid];
  });
  db[k] = kept;
});

/* 评价 + 回复 */
db.comments = (db.comments || []).filter(
  (c) => goodsIds.has(c.goodsId) && keptCommentIds.has(c.commentId)
);
const aliveCommentIds = new Set(db.comments.map((c) => c.commentId));
const replies = {};
Object.keys(db.commentReplies || {}).forEach((cid) => {
  if (aliveCommentIds.has(cid)) replies[cid] = db.commentReplies[cid];
});
db.commentReplies = replies;

/* 清完之后一条不剩时补足演示评价（否则后台评价页会全空，功能没法验） */
let seeded = 0;
let seededGoods = null;
if (!NO_SEED && KEEP_COMMENTS > 0 && db.comments.length < KEEP_COMMENTS) {
  const target = (catalog.goods || []).find((g) => g.status === 'on_sale');
  if (!target) {
    line('⚠ 商品库里没有在售商品，跳过演示评价补足');
  } else {
    seededGoods = target;
    const need = KEEP_COMMENTS - db.comments.length;
    for (let i = 0; i < need; i += 1) {
      const firstSku = (target.skus || [])[0] || {};
      db.comments.push({
        commentId: `cm_${target.id}_${i + 1}`,
        goodsId: target.id,
        author: DEMO_COMMENT.author,
        avatar: '',
        score: DEMO_COMMENT.score,
        content: DEMO_COMMENT.content,
        images: [],
        specText: (firstSku.specs || []).join(' / '),
        createdAt: Date.now() - (i + 1) * 3 * 86400000
      });
      seeded += 1;
    }
    // 商品上的「评价数」跟评价表保持一致，否则小程序详情页会显示 0 条而后台有 1 条
    target.commentCount = db.comments.filter((c) => c.goodsId === target.id).length;
  }
}
if (seeded) {
  line('');
  line(`补足演示评价 ${seeded} 条 → 商品 ${seededGoods.id}（${seededGoods.name}）`);
  line(`   同步该商品 commentCount = ${seededGoods.commentCount}（catalog.json）`);
}

/* 订单（可选）：显式传 --keep-orders=N 才动。**不碰库存**（理由见参数区注释） */
if (HAS_ORDER_OPT) {
  const before = (db.orders || []).length;
  const sortedOrders = (db.orders || []).slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  db.orders = sortedOrders.slice(0, KEEP_ORDERS);
  orderNos = new Set(db.orders.map((o) => o.orderNo));
  line('');
  line(`订单：${before} → ${db.orders.length}`);
}

/* 库存（可选）：按商品库初始值重置 */
if (SYNC_STOCK) {
  const initial = {};
  (catalog.goods || []).forEach((g) => (g.skus || []).forEach((s) => { initial[s.skuId] = s.stock; }));
  const changed = [];
  Object.keys(initial).forEach((sku) => {
    const cur = db.stocks && db.stocks[sku];
    if (cur !== initial[sku]) {
      changed.push(`${sku}:${cur}→${initial[sku]}`);
      if (!db.stocks) db.stocks = {};
      db.stocks[sku] = initial[sku];
    }
  });
  line('');
  line(changed.length ? `库存重置：${changed.join(' · ')}` : '库存已与商品库初始值一致，无需重置');
}

/* 支付日志 */
db.payLogs = (db.payLogs || []).filter((p) => orderNos.has(p.orderNo));

/* 写入（保证 UTF-8 + 两空格缩进，与 store.js / catalogStore 的落盘格式一致） */
writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
if (seeded) writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));

line('');
line('✔ 已写入 ' + (seeded ? 'db.json + catalog.json' : 'db.json'));
line(`   users    ${users.length} → ${db.users.length}`);
line(`   comments ${(db.comments || []).length} 条${seeded ? `（含补足演示评价 ${seeded} 条）` : ''}`);
line(`   orders   ${(db.orders || []).length} 笔`);
line(`   payLogs  ${(db.payLogs || []).length} 条`);
line(`   stocks   ${JSON.stringify(db.stocks)}`);

/** 一个值是否有内容（用于识别空壳键） */
function size(v) {
  if (v === null || v === undefined) return 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'object') {
    if (Array.isArray(v.items)) return v.items.length;
    return Object.keys(v).length;
  }
  return v ? 1 : 0;
}
