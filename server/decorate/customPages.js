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
 *     aliases: { oldKey: newKey },    // 改过标识的页面：旧标识 → 新标识（旧分享链接仍可访问）
 *     pages: [{
 *       key, name, note, belongs, path, template, createdAt, updatedAt,
 *       published: { blocks: [], meta: {} }   // 「已发布」数据，相当于内置页的 replica 字段
 *     }]
 *   }
 *
 * 为什么需要 aliases：
 *   页面标识就是访问地址（`pages/custom/index?key=标识`），而地址会被**分享到聊天/朋友圈、
 *   印在二维码里、被其他页面的跳转链接引用**。改了标识而不管这些引用，就会出现
 *   「运营改了名字，用户点旧链接打不开」——而运营自己是发现不了的。
 *   所以改名时登记别名，并由发布链路写进 replica.CUSTOM_PAGE_ALIASES，
 *   小程序端查到别名后自动转到新标识。
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
const atomic = require('../lib/atomicFile');
const { BizError, ERR } = require('../lib/http');

const DATA_DIR = nodePath.join(require('../lib/dataDir').ROOT, 'decorate');
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
  return { seq: 0, aliases: {}, pages: [] };
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
      try { atomic.renameSync(FILE, broken); } catch (_) { /* ignore */ }
      console.error(`[customPages] custom-pages.json 无法使用，已备份为 ${broken}：${parseErr.message}`);
      cache = empty();
    }
    const base = empty();
    Object.keys(base).forEach((k) => { if (cache[k] === undefined) cache[k] = base[k]; });
    if (!Array.isArray(cache.pages)) cache.pages = [];
    if (!Number.isFinite(cache.seq)) cache.seq = 0;
    // aliases 也要验形态：被手工改成数组/字符串时，下面 aliases[key] 会读出诡异结果
    if (!util.isPlainObject(cache.aliases)) { cache.aliases = {}; needFlush = true; }
    // 别名键值都必须是合法标识，且不能指向自己（非法项直接剔掉，别让它污染「标识是否可用」的判断）
    Object.keys(cache.aliases).forEach((k) => {
      const v = cache.aliases[k];
      if (typeof v !== 'string' || v === k || !KEY_RE.test(k) || !KEY_RE.test(v)) {
        delete cache.aliases[k];
        needFlush = true;
      }
    });
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
  atomic.writeFileAtomic(FILE, JSON.stringify(data, null, 2));
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

/** 旧标识 → 新标识 的别名表（深拷贝） */
function aliases() {
  return clone(load().aliases || {});
}

/** 生成一个未被占用的默认标识（p1 / p2 …）—— 也要避开历史别名，否则新页会顶掉旧分享链接 */
function nextKey() {
  const data = load();
  let n = (data.seq || 0) + 1;
  // 避免与历史 key（含被删过又重建的）撞车
  while (RESERVED.has('p' + n) || keysOf().indexOf('p' + n) >= 0 || (data.aliases || {})['p' + n]) n++;
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
  // 历史别名同样占用着地址：已被分享出去的旧链接还指望它跳到新页面，
  // 让一个新页面顶上去，等于把旧链接指向了完全无关的内容。
  const al = load().aliases || {};
  if (key !== ignoreKey && al[key] && al[key] !== key) {
    return `页面标识「${key}」曾被用作其他页面的旧标识（现指向「${al[key]}」），` +
      '为避免旧分享链接跳到错误的页面，请换一个标识';
  }
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
  return {
    count: data.pages.length,
    max: MAX_PAGES,
    bytes: size,
    // 改过标识的页面数：旧分享链接还在靠它们跳转，后台要能看见
    aliasCount: Object.keys(data.aliases || {}).length
  };
}

/* ----------------------------- 对外：写 ----------------------------- */

/*
 * ⚠️ 这里的校验失败**必须抛 BizError**，不能抛普通 Error。
 *    普通 Error 会被入口当成「未预期异常」→ HTTP 500 / code 5000 / 对外文案
 *    「服务开小差了，请稍后重试」，于是：
 *      · 运营在装修台只看到一句没有信息量的提示，不知道是标识重复还是标识保留；
 *      · 日志里正常校验失败与真实代码 bug 混在一起，无法告警；
 *      · 自检的「预期失败」用例会因为拿到 5000 而假通过（整改报告 15 点名的正是这条）。
 */

/**
 * 新建页面
 * @param {object} input { name, key?, note?, template? }
 * @param {object} initialData 已发布的初始数据（store.js 依 template 组装好传进来）
 * @returns {{ key, name, path }} 新建后的页面概要
 */
function create(input, initialData) {
  const opt = input || {};
  if (load().pages.length >= MAX_PAGES) {
    throw new BizError(`自定义页面最多 ${MAX_PAGES} 个，已达上限`, ERR.BIZ);
  }

  const name = normName(opt.name) || '未命名页面';
  const nameErr = checkName(name);
  if (nameErr) throw new BizError(nameErr, ERR.PARAM);
  if (load().pages.some((p) => p.name === name)) {
    throw new BizError(`页面名称「${name}」已存在，请换一个`, ERR.BIZ);
  }

  // 用户填了标识就用他的（先清洗再校验），没填自动生成
  const raw = slug(opt.key);
  const key = raw || nextKey();
  const keyErr = checkKey(key);
  if (keyErr) throw new BizError(keyErr, ERR.PARAM);

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
  if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
  const opt = patch || {};

  if (opt.name !== undefined) {
    const name = normName(opt.name);
    const err = checkName(name);
    if (err) throw new BizError(err, ERR.PARAM);
    if (load().pages.some((p) => p.key !== key && p.name === name)) {
      throw new BizError(`页面名称「${name}」已存在，请换一个`, ERR.BIZ);
    }
    page.name = name;
  }
  if (opt.note !== undefined) page.note = normName(opt.note).slice(0, 40);

  let newKey = '';
  if (opt.key !== undefined) {
    const k = slug(opt.key);
    if (k !== key) {
      const err = checkKey(k, key);
      if (err) throw new BizError(err, ERR.PARAM);
      const data = load();
      if (!util.isPlainObject(data.aliases)) data.aliases = {};
      page.key = k;
      page.path = 'pages/custom/index?key=' + k;
      newKey = k;

      /*
       * 登记别名，并做两件收尾：
       *   1）删掉指向新标识的别名（k 现在是真页面了，不该再被当别名）；
       *   2）把「原本指向旧标识」的别名改指向新标识 —— 否则 a→b 之后再 b→c，
       *      a 会停在 b 这个不存在的标识上，多改几次就断了。
       */
      delete data.aliases[k];
      Object.keys(data.aliases).forEach((old) => {
        if (data.aliases[old] === key) data.aliases[old] = k;
      });
      data.aliases[key] = k;
    }
  }
  page.updatedAt = stamp();
  commit();
  return { page: clone(page), renamedFrom: newKey ? key : '' };
}

/**
 * 删除页面（只删注册表条目；草稿、版本、replica.js 的清理由 store.js 编排）
 *
 * 连带清理别名：页面没了，指向它的别名就成了悬空指针
 * （留着只会让旧链接跳到一个不存在的标识，不如直接失效，报「页面不存在」更诚实）。
 */
function remove(key) {
  const data = load();
  const i = data.pages.findIndex((p) => p.key === key);
  if (i < 0) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
  const [gone] = data.pages.splice(i, 1);
  if (util.isPlainObject(data.aliases)) {
    delete data.aliases[key];
    Object.keys(data.aliases).forEach((old) => {
      if (data.aliases[old] === key) delete data.aliases[old];
    });
  }
  commit();
  return clone(gone);
}

/** 发布成功后回写「已发布数据」 */
function setPublished(key, data) {
  const page = findByKey(key);
  if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
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
  aliases,
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
