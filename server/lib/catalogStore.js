/**
 * 商品域存储：JSON 文件持久化（原子写）
 *
 * 与 `store.js`（用户业务数据：订单/购物车/地址…）分开存放，原因是二者生命周期不同：
 *   - db.json       —— 运行期产生，可清空重建
 *   - catalog.json  —— 运营在后台维护的「商品 / 分类 / 券模板 / 店铺设置」，是资产，不能丢
 *
 * 首次启动时从 `seed.js`（= `miniprogram/mock/data.js`）迁移一份初始数据，
 * 之后以本文件为准：后台改商品即改这里，小程序端立刻能读到。
 *
 * ⚠️ 库存真源是 `db.stocks[skuId]`（下单扣减、取消回滚都在那里），
 *    本文件里的 `stock` 字段仅作展示与初始值，读取时由 catalog.js 用 db.stocks 覆盖。
 */

const fs = require('node:fs');
const path = require('node:path');
const util = require('./util');
const atomic = require('./atomicFile');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'catalog.json');

/** 店铺默认设置（后台「店铺设置」读写） */
const DEFAULT_SETTINGS = {
  shopName: 'LEXY莱克官方旗舰店',
  logo: '',
  servicePhone: '400-800-0000',
  serviceHours: '9:00 - 21:00',
  notice: '正品保障 · 全国联保 · 7 天无理由退换',
  freightFree: 0,        // 全场满额包邮的门槛（分），0 = 不限
  defaultFreight: 0,     // 默认运费（分）
  autoConfirmDays: 10,   // 发货后自动确认收货天数
  payExpireMinutes: 30   // 未付款自动关闭（分钟）
};

let cache = null;

function emptyCatalog() {
  const { CATEGORIES, GOODS, COUPON_TEMPLATES } = require('./seed');
  return {
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      note: '运营侧商品资产；首次由 seed.js 迁移，之后以后台编辑为准'
    },
    categories: JSON.parse(JSON.stringify(CATEGORIES)),
    goods: JSON.parse(JSON.stringify(GOODS)),
    couponTemplates: JSON.parse(JSON.stringify(COUPON_TEMPLATES)),
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  };
}

function migrate(db) {
  let changed = false;
  const base = emptyCatalog();
  Object.keys(base).forEach((k) => {
    if (db[k] === undefined) { db[k] = base[k]; changed = true; }
  });
  // 顶层是对象、但个别键形态不对（被手工改坏 / 历史遗留）：就地纠正，而不是崩掉
  ['categories', 'goods', 'couponTemplates'].forEach((k) => {
    if (!Array.isArray(db[k])) { db[k] = base[k]; changed = true; }
  });
  if (!util.isPlainObject(db.settings)) { db.settings = base.settings; changed = true; }
  // settings 缺键补齐（后续新增设置项时老文件能平滑升级）
  Object.keys(DEFAULT_SETTINGS).forEach((k) => {
    if (db.settings[k] === undefined) { db.settings[k] = DEFAULT_SETTINGS[k]; changed = true; }
  });
  // 商品缺字段补齐（如 status / images）
  db.goods.forEach((g) => {
    if (!util.isPlainObject(g)) return;
    if (!g.status) { g.status = 'on_sale'; changed = true; }
    if (!Array.isArray(g.images)) { g.images = []; changed = true; }
    if (!Array.isArray(g.tags)) { g.tags = []; changed = true; }
    if (!Array.isArray(g.skus)) { g.skus = []; changed = true; }
  });
  return changed;
}

function load() {
  if (cache) return cache;
  let needFlush = false;

  if (fs.existsSync(FILE)) {
    const raw = fs.readFileSync(FILE, 'utf8');
    try {
      cache = JSON.parse(raw);
      // 同 store.js：解析成功也可能是 null / 数字 / 字符串 / 数组，
      // 那样 migrate() 会在 db.settings[k] 处崩掉，且无法自愈。
      if (!util.isPlainObject(cache)) {
        throw new Error(`内容不是 JSON 对象（实际为 ${util.describeJson(cache)}）`);
      }
    } catch (parseErr) {
      // 只有「文件损坏」才视为可重建，其它异常向上抛，绝不清空商品库
      const broken = FILE + '.broken.' + Date.now();
      atomic.renameSync(FILE, broken);
      console.error(`[catalog] catalog.json 无法使用，已备份为 ${broken}：${parseErr.message}`);
      cache = emptyCatalog();
    }
    needFlush = migrate(cache);
  } else {
    cache = emptyCatalog();
    needFlush = true;
  }

  if (needFlush) flush(true);
  return cache;
}

function flush(sync = false) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (cache) cache.meta.updatedAt = Date.now();
  atomic.writeFileAtomic(FILE, JSON.stringify(cache, null, 2));
  if (sync) return;
}

let timer = null;
function markDirty() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { flush(); } catch (e) { console.error('[catalog] 落盘失败：', e.message); }
  }, 50);
}

module.exports = {
  get: () => load(),
  commit: () => { load(); markDirty(); },
  flushNow: () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (cache) flush(true);
  },
  /** 重置为种子数据（仅自检脚本使用） */
  reset() {
    cache = emptyCatalog();
    flush(true);
    return cache;
  },
  DEFAULT_SETTINGS,
  FILE
};
