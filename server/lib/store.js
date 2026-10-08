/**
 * 存储层：JSON 文件持久化（原子写）
 *
 * 设计意图：把「存储」收敛到本文件，业务层只调用 db.xxx。
 * 上线切换到 MySQL / Redis 时，只需替换本文件的实现，路由代码零改动。
 *
 * 说明：
 *   - 进程内维护一份内存副本，读操作零 IO
 *   - 写操作「即时落盘 + 50ms 合并」，避免高频写放大
 *   - 落盘采用「临时文件 + rename」保证原子性，防止断电写坏
 */

const fs = require('node:fs');
const path = require('node:path');
const util = require('./util');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TMP_FILE = DB_FILE + '.tmp';

/** 用户产生的数据（商品等只读数据不放这里，见 seed.js） */
function emptyDb() {
  return {
    meta: {
      createdAt: Date.now(),
      version: 1,
      note: '用户业务数据；商品/分类/券模板/店铺设置见 data/catalog.json'
    },
    users: [],           // { userId, openid, nickname, avatar, phone, tags, createdAt, lastLoginAt }
    carts: {},           // userId -> [cartItem]
    orders: [],          // [order]
    addresses: {},       // userId -> [address]
    coupons: {},         // userId -> [userCoupon]
    favorites: {},       // userId -> [goodsId]
    footprints: {},      // userId -> [{ goodsId, at }]
    stocks: {},          // skuId -> 剩余库存（下单扣减 / 取消回滚，重启不丢）
    payLogs: [],         // 支付回调幂等日志
    commentReplies: {}   // commentId -> { text, at }（商家回复评价）
  };
}

/** 用商品库的 SKU 初始化 stocks（仅在缺失时执行，避免覆盖运行期扣减结果） */
function initStocks(db) {
  const { goods: GOODS } = require('./catalogStore').get();
  const stocks = {};
  GOODS.forEach((g) => {
    (g.skus || []).forEach((s) => { stocks[s.skuId] = s.stock; });
  });
  if (!Object.keys(stocks).length) return false;
  // 只补新增的 SKU，不覆盖已有库存
  const cur = db.stocks || {};
  let added = false;
  Object.keys(stocks).forEach((k) => {
    if (cur[k] === undefined) { cur[k] = stocks[k]; added = true; }
  });
  const wasEmpty = !Object.keys(cur).length;
  db.stocks = cur;
  return wasEmpty || added;
}

let db = null;
let writeTimer = null;

function load() {
  if (db) return db;
  let needFlush = false;

  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    try {
      db = JSON.parse(raw);
      // ⚠️ 解析成功 ≠ 数据合法：文件里可能是 null / 123 / "abc" / [] 这类
      //    合法 JSON 但不是对象的内容，直接往下走会在 db[k] 处抛 TypeError，
      //    且此后每次调用都崩。与解析失败同属「文件损坏」，走同一条备份 + 重建路径。
      if (!util.isPlainObject(db)) {
        throw new Error(`内容不是 JSON 对象（实际为 ${util.describeJson(db)}）`);
      }
    } catch (parseErr) {
      // ⚠️ 只有「文件损坏」才算：备份原文件后重建。
      //    其它异常（代码 bug、IO 错误）一律向上抛，绝不清空用户数据。
      const broken = DB_FILE + '.broken.' + Date.now();
      fs.renameSync(DB_FILE, broken);
      console.error(`[store] db.json 无法使用，已备份为 ${broken}：${parseErr.message}`);
      db = emptyDb();
    }
    // 兼容旧版本文件缺字段（只补缺，不覆盖既有数据）
    const base = emptyDb();
    Object.keys(base).forEach((k) => {
      if (db[k] === undefined) db[k] = base[k];
    });
    needFlush = initStocks(db) || needFlush;
  } else {
    db = emptyDb();
    needFlush = true;
  }

  if (needFlush) {
    initStocks(db);
    flush(true);
  }
  return db;
}

/** 原子落盘 */
function flush(sync = false) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = JSON.stringify(db, null, 2);
  fs.writeFileSync(TMP_FILE, payload, 'utf8');
  fs.renameSync(TMP_FILE, DB_FILE); // rename 在多数文件系统上是原子操作
  if (sync) return;
}

/** 标记有变更，合并 50ms 内落盘 */
function markDirty() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      flush();
    } catch (e) {
      console.error('[store] 落盘失败：', e.message);
    }
  }, 50);
}

const db$ = {
  /** 取数据库句柄（自动初始化） */
  get() {
    return load();
  },
  /** 显式提交（写操作后调用） */
  commit() {
    markDirty();
  },
  /** 立即同步落盘（退出前调用） */
  flushNow() {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    if (db) flush(true);
  },
  /** 重置（仅自检脚本使用） */
  reset() {
    db = emptyDb();
    flush(true);
    return db;
  },
  DB_FILE,
  DATA_DIR
};

module.exports = db$;
