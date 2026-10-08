/**
 * 店铺装修 · 自定义页面注册表
 *
 * 装修台内置 5 个页面（首页 / 莱克 / 资讯 / 产品 / 我的），它们的数据来自
 * replica.js 的固定字段，schema 里写死了 adapter。本模块承载「新建页面」——
 * 运营自己建的页面，数据模型统一为 { blocks, meta }（区块类型复用首页那套）。
 *
 * 存储：server/data/decorate/custom-pages.json（与 drafts/versions 的 state.json 分开）
 *   {
 *     seq: 1,                         // 自增序号，用于生成默认 key（p1 / p2 …）
 *     pages: [{
 *       key, name, note, belongs, path, template, createdAt, updatedAt,
 *       published: { blocks: [], meta: {} }   // 「已发布」数据，相当于内置页的 replica 字段
 *     }]
 *   }
 *
 * 自定义页面的草稿仍走 state.json 的 drafts[key]，与内置页完全一致，
 * 因此「存草稿 → 查看变更 → 发布 → 回滚」四个环节对两类页面是同一套代码。
 *
 * ⚠️ load() 的兜底只捕获 JSON 解析失败：其它异常（代码 bug、IO 错误）一律向上抛，
 *    绝不能因为一次意外就把运营建好的页面清空。
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const util = require('../lib/util');

const DATA_DIR = nodePath.join(__dirname, '..', 'data', 'decorate');
const FILE = nodePath.join(DATA_DIR, 'custom-pages.json');

/** 自定义页面上限（有赞免费版也是 10~20 个量级） */
const MAX_PAGES = 20;
/** 页面标识规则：2~24 位，字母开头，只允许小写字母 / 数字 / 连字符 */
const KEY_RE = /^[a-z][a-z0-9-]{1,23}$/;
/** 保留标识：内置页 key、小程序已有页面路径段、容易被误会成系统的词 */
const RESERVED = new Set([
  'home', 'lexy', 'news', 'product', 'mine', 'cart', 'category', 'index', 'list', 'detail',
  'custom', 'page', 'pages', 'custom-pages', 'decorate', 'admin', 'console', 'debug', 'api',
  'media', 'uploads', 'assets', 'static', 'config', 'utils', 'services', 'components',
  'packagegoods', 'packagenews', 'tabbar', 'setting', 'settings', 'root', 'system', 'null'
]);

/** 新建页面的默认页面级设置 */
const BLANK_META = { desc: '', bg: '#F5F6F8' };

/** 自定义页在装修台里的归属分组 */
const BELONGS = '自定义页面';

let cache = null;
let needFlush = false;
let flushTimer = null;

/* ----------------------------- 存取 ----------------------------- */

function empty() {
  return { seq: 0, pages: [] };
}

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) { /* ignore */ }
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(FILE)) {
    const raw = fs.readFileSync(FILE, 'utf8');
    try {
      cache = JSON.parse(raw);
      // 解析成功也可能是 null / 123 / "abc" / [] —— 那样下面 cache[k] 会抛 TypeError，
      // 且此后每次调用都崩。与解析失败同属「文件损坏」，走同一条备份 + 重建路径。
      if (!util.isPlainObject(cache)) {
        throw new Error(`内容不是 JSON 对象（实际为 ${util.describeJson(cache)}）`);
      }
    } catch (parseErr) {
      const broken = FILE + '.broken.' + Date.now();
      try { fs.renameSync(FILE, broken); } catch (_) { /* ignore */ }
      console.error(`[customPages] custom-pages.json 无法使用，已备份为 ${broken}：${parseErr.message}`);
      cache = empty();
    }
    const base = empty();
    Object.keys(base).forEach((k) => { if (cache[k] === undefined) cache[k] = base[k]; });
    if (!Array.isArray(cache.pages)) cache.pages = [];
    if (!Number.isFinite(cache.seq)) cache.seq = 0;
    // 数组里混进非对象（手工编辑 / 历史遗留）：剔掉并留日志，不让一条脏数据拖垮整个装修台
    const dirty = cache.pages.filter((p) => !util.isPlainObject(p));
    if (dirty.length) {
      console.error(`[customPages] 忽略 ${dirty.length} 条非对象页面记录`);
      needFlush = true;
    }
    cache.pages = cache.pages.filter((p) => util.isPlainObject(p));
  } else {
    cache = empty();
    needFlush = true;
  }
  return cache;
}

function flushNow() {
  if (!needFlush) return;
  ensureDir();
  const data = load();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
  needFlush = false;
}

function commit() {
  needFlush = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try { flushNow(); } catch (e) { console.error('[customPages] 落盘失败：', e.message); }
  }, 50);
  if (flushTimer.unref) flushTimer.unref();
}

/** 仅供自检 / 重置使用（清空全部自定义页面） */
function reset() {
  cache = empty();
  needFlush = true;
  flushNow();
}

/* ----------------------------- 工具 ----------------------------- */

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const stamp = () => Date.now();

function normName(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).trim();
  return s.slice(0, 30);
}

/** 把用户输入的标识清洗成合法 key（小写化、非法字符换连字符、掐掉首尾连字符） */
function slug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function findByKey(key) {
  return load().pages.filter((p) => p.key === key)[0] || null;
}

function keysOf() {
  return load().pages.map((p) => p.key);
}

/** 生成一个未被占用的默认标识（p1 / p2 …） */
function nextKey() {
  const data = load();
  let n = (data.seq || 0) + 1;
  // 避免与历史 key（含被删过又重建的）撞车
  while (RESERVED.has('p' + n) || keysOf().indexOf('p' + n) >= 0) n++;
  return 'p' + n;
}

/**
 * 校验页面标识
 * @returns {string} 错误信息，空串表示通过
 */
function checkKey(key, ignoreKey) {
  if (!key) return '页面标识不能为空';
  if (!KEY_RE.test(key)) {
    return '页面标识只能是 2~24 位的「小写字母 / 数字 / 连字符」，且必须以字母开头';
  }
  if (RESERVED.has(key)) return `页面标识「${key}」是系统保留字，请换一个`;
  if (key !== ignoreKey && findByKey(key)) return `页面标识「${key}」已被占用`;
  return '';
}

function checkName(name) {
  if (!name) return '页面名称不能为空';
  if (name.length > 30) return '页面名称最多 30 个字';
  return '';
}

/* ----------------------------- 对外：读 ----------------------------- */

/** 页面列表（深拷贝，调用方可安全改写） */
function list() {
  return clone(load().pages);
}

function get(key) {
  return clone(findByKey(key));
}

function has(key) {
  return !!findByKey(key);
}

function count() {
  return load().pages.length;
}

/** 新建页面时可选的模板 */
function templates() {
  return [
    { key: 'blank', name: '空白页', desc: '从零开始，自己拖组件' },
    { key: 'home', name: '复制首页', desc: '把当前首页的所有区块复制过来再改' }
  ];
}

function stats() {
  const data = load();
  let size = 0;
  try { size = fs.statSync(FILE).size; } catch (_) { /* ignore */ }
  return { count: data.pages.length, max: MAX_PAGES, bytes: size };
}

/* ----------------------------- 对外：写 ----------------------------- */

/**
 * 新建页面
 * @param {object} input { name, key?, note?, template? }
 * @param {object} initialData 已发布的初始数据（store.js 依 template 组装好传进来）
 * @returns {{ key, name, path }} 新建后的页面概要
 */
function create(input, initialData) {
  const opt = input || {};
  if (load().pages.length >= MAX_PAGES) {
    throw new Error(`自定义页面最多 ${MAX_PAGES} 个，已达上限`);
  }

  const name = normName(opt.name) || '未命名页面';
  const nameErr = checkName(name);
  if (nameErr) throw new Error(nameErr);
  if (load().pages.some((p) => p.name === name)) throw new Error(`页面名称「${name}」已存在，请换一个`);

  // 用户填了标识就用他的（先清洗再校验），没填自动生成
  const raw = slug(opt.key);
  const key = raw || nextKey();
  const keyErr = checkKey(key);
  if (keyErr) throw new Error(keyErr);

  const data = load();
  const tpl = ['blank', 'home'].indexOf(opt.template) >= 0 ? opt.template : 'blank';
  const page = {
    key,
    name,
    note: normName(opt.note).slice(0, 40),
    belongs: BELONGS,
    path: 'pages/custom/index?key=' + key,
    template: tpl,
    createdAt: stamp(),
    updatedAt: stamp(),
    published: {
      blocks: clone((initialData && initialData.blocks) || []),
      meta: Object.assign({}, BLANK_META, clone((initialData && initialData.meta) || {}))
    }
  };

  data.pages.push(page);
  // seq 只增不减：key 用用户填的也前进一格，避免以后自动生成时撞车
  data.seq = (data.seq || 0) + 1;
  commit();
  return clone(page);
}

/** 改名称 / 备注 / 标识（标识改动会连带更新 path，数据与草稿、版本记录一并迁移） */
function update(key, patch) {
  const page = findByKey(key);
  if (!page) throw new Error('页面不存在：' + key);
  const opt = patch || {};

  if (opt.name !== undefined) {
    const name = normName(opt.name);
    const err = checkName(name);
    if (err) throw new Error(err);
    if (load().pages.some((p) => p.key !== key && p.name === name)) {
      throw new Error(`页面名称「${name}」已存在，请换一个`);
    }
    page.name = name;
  }
  if (opt.note !== undefined) page.note = normName(opt.note).slice(0, 40);

  let newKey = '';
  if (opt.key !== undefined) {
    const k = slug(opt.key);
    if (k !== key) {
      const err = checkKey(k, key);
      if (err) throw new Error(err);
      page.key = k;
      page.path = 'pages/custom/index?key=' + k;
      newKey = k;
    }
  }
  page.updatedAt = stamp();
  commit();
  return { page: clone(page), renamedFrom: newKey ? key : '' };
}

/**
 * 删除页面（只删注册表条目；草稿、版本、replica.js 的清理由 store.js 编排）
 */
function remove(key) {
  const data = load();
  const i = data.pages.findIndex((p) => p.key === key);
  if (i < 0) throw new Error('页面不存在：' + key);
  const [gone] = data.pages.splice(i, 1);
  commit();
  return clone(gone);
}

/** 发布成功后回写「已发布数据」 */
function setPublished(key, data) {
  const page = findByKey(key);
  if (!page) throw new Error('页面不存在：' + key);
  page.published = {
    blocks: clone((data && data.blocks) || []),
    meta: Object.assign({}, BLANK_META, clone((data && data.meta) || {}))
  };
  page.updatedAt = stamp();
  commit();
  return clone(page);
}

module.exports = {
  FILE,
  MAX_PAGES,
  KEY_RE,
  RESERVED,
  BLANK_META,
  BELONGS,
  list,
  get,
  has,
  count,
  keysOf,
  templates,
  stats,
  create,
  update,
  remove,
  setPublished,
  slug,
  checkKey,
  flushNow,
  reset
};
