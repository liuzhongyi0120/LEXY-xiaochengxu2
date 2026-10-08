/**
 * 装修后台 · 状态与发布
 *
 * 数据流：
 *   已发布（replica.js）  ──读取──▶  后台编辑（草稿，独立存放）  ──发布──▶  replica.js
 *
 * 为什么草稿独立存放：后台编辑过程绝不能影响正在运行的小程序；
 * 只有点「发布」才写回 replica.js，且写之前自动备份、写之后语法与数据双重校验。
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const vm = require('node:vm');

const schema = require('./schema');
const emit = require('./emit');
const customPages = require('./customPages');
const atomic = require('../lib/atomicFile');

const ROOT = nodePath.join(__dirname, '..', '..');
const REPLICA_FILE = nodePath.join(ROOT, 'miniprogram', 'config', 'replica.js');
const DATA_DIR = nodePath.join(__dirname, '..', 'data', 'decorate');
const STATE_FILE = nodePath.join(DATA_DIR, 'state.json');
const BACKUP_DIR = nodePath.join(DATA_DIR, 'backup');
const MAX_VERSIONS = 20;

/* ----------------------------- 基础读写 ----------------------------- */

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function emptyState() {
  return { drafts: {}, versions: [], seq: 0 };
}

function loadState() {
  ensureDirs();
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    let s;
    try {
      s = JSON.parse(raw);
    } catch (parseErr) {
      // ⚠️ 只有「JSON 解析失败」才算文件损坏：备份后重建，避免后台打不开。
      //    其它异常（代码 bug / IO 错误）一律向上抛，绝不静默丢掉草稿与版本记录。
      try { atomic.renameSync(STATE_FILE, STATE_FILE + '.broken.' + Date.now()); } catch (_) { /* ignore */ }
      console.error(`[decorate] state.json 解析失败，已备份重建：${parseErr.message}`);
      return emptyState();
    }
    const base = emptyState();
    Object.keys(base).forEach((k) => { if (s[k] === undefined) s[k] = base[k]; });
    return s;
  }
  return emptyState();
}

function saveState(state) {
  ensureDirs();
  atomic.writeFileAtomic(STATE_FILE, JSON.stringify(state, null, 2));
}

function now() { return Date.now(); }

function stampOf(ts) {
  const d = new Date(ts);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ----------------------------- 已发布的 replica ----------------------------- */

/** 读取 replica.js（清 require 缓存，保证拿到最新发布结果） */
function readReplica() {
  delete require.cache[require.resolve(REPLICA_FILE)];
  return require(REPLICA_FILE);
}

/**
 * 各页面的「已发布」数据。
 *
 * 内置 5 个页面的真源是 replica.js（字段固定）；
 * 自定义页面的真源是 custom-pages.json 的 published 字段 —— 因为它可能刚建好、
 * 还没发布过，此时 replica.js 里根本没有它，只有从注册表读才能让运营
 * 一打开编辑器就看到初始内容（空白页 / 复制首页的结果）。
 */
function publishedAll() {
  const R = readReplica();
  const out = {};
  schema.allPages().forEach((p) => {
    out[p.key] = p.custom ? customPublished(p.key) : schema.clone(p.from(R));
  });
  return out;
}

/** 单个自定义页的已发布数据（注册表缺失时给空页面，保证渲染不炸） */
function customPublished(key) {
  const def = customPages.get(key);
  if (!def) return { blocks: [], meta: schema.clone(schema.CUSTOM_META_DEFAULT) };
  return schema.clone({
    // 注册表里的历史数据可能是老结构（轮播 images 为字符串数组），读出来先升级
    blocks: ((def.published && def.published.blocks) || []).map(schema.upgradeBlock),
    meta: Object.assign({}, schema.CUSTOM_META_DEFAULT, (def.published && def.published.meta) || {})
  });
}

function publishedOf(key) {
  const p = schema.get(key);
  if (!p) return null;
  return p.custom ? customPublished(key) : schema.clone(p.from(readReplica()));
}

/** 把各页面数据组装成 replica 的 6（+PAGE_META）个字段 */
function assemble(pageDataMap) {
  const out = {};
  schema.allPages().forEach((p) => {
    const d = pageDataMap[p.key];
    if (d === undefined || d === null) return;
    p.to(d, out);
  });

  /*
   * PAGE_META 是跨页聚合字段（replica.js 里一份承载全部 5 个页面）。
   * 只要有一页写了它，就补齐所有页面的条目：
   * 否则某页 meta 缺失时该页会整体从文件中消失，前端读不到页面底色。
   * 若没有任何页面写入过 PAGE_META，则保持 undefined，emit 端照旧输出 6 字段（向后兼容）。
   */
  if (out.PAGE_META) {
    schema.allPages().forEach((p) => {
      if (out.PAGE_META[p.key] === undefined) {
        const def = schema.pageMetaDefault(p.key);
        if (def !== undefined) out.PAGE_META[p.key] = def;
      }
    });
  }

  return out;
}

/* ----------------------------- 结构校验 ----------------------------- */

/**
 * 区块数组结构校验（首页与自定义页面共用一份规则）。
 * 校验的是「能不能渲染」：区块类型必须已接入，且各类区块的必填字段不能为空。
 */
function checkBlocks(d) {
  if (!d || typeof d !== 'object') return '页面数据必须是对象';
  if (!Array.isArray(d.blocks)) return '缺少 blocks 数组';
  const kinds = schema.HOME_BLOCK_KINDS;
  for (let i = 0; i < d.blocks.length; i++) {
    const b = d.blocks[i];
    if (!b || !b.type) return `第 ${i + 1} 个区块缺少 type`;
    if (!kinds[b.type]) return `第 ${i + 1} 个区块类型不支持：${b.type}`;
    if (b.type === 'swiper' && (!Array.isArray(b.images) || !b.images.length)) return `第 ${i + 1} 个图片广告没有图片`;
    if (b.type === 'image' && !b.src) return `第 ${i + 1} 张图片缺少地址`;
    if (b.type === 'video' && !b.src) return `第 ${i + 1} 个视频缺少地址`;
    if (b.type === 'title' && !b.text) return `第 ${i + 1} 个标题文本没有内容`;
    if (b.type === 'notice' && !b.text) return `第 ${i + 1} 个公告没有内容`;
    if (b.type === 'hotspot' && !b.src) return `第 ${i + 1} 个热区切图缺少图片`;
  }
  return '';
}

const REQUIRED = {
  home: (d) => {
    if (!d || typeof d !== 'object') return '首页数据必须是对象';
    if (!Array.isArray(d.blocks)) return '首页缺少 blocks 数组';
    if (!d.shop || typeof d.shop !== 'object') return '首页缺少 shop 对象';
    return checkBlocks(d);
  },
  lexy: (d) => (d && Array.isArray(d.series) ? '' : '莱克页缺少 series 数组'),
  news: (d) => {
    if (!d || typeof d !== 'object') return '资讯数据必须是对象';
    if (!Array.isArray(d.big) || !Array.isArray(d.small)) return '资讯页缺少 big / small 栏目数组';
    return '';
  },
  product: (d) => {
    if (!d || typeof d !== 'object') return '产品数据必须是对象';
    if (!Array.isArray(d.brands)) return '产品页缺少 brands 数组';
    if (!d.navLogo) return '产品页缺少左栏 Logo';
    return '';
  },
  mine: (d) => (d && d.shop && typeof d.shop === 'object' ? '' : '我的页缺少 shop 对象')
};

function validate(key, data) {
  const page = schema.get(key);
  if (!page) return '未知页面：' + key;
  // 自定义页面统一是「区块流」结构，与首页共用同一套校验规则
  if (page.custom) return checkBlocks(data);
  const fn = REQUIRED[key];
  if (!fn) return '未知页面：' + key;
  return fn(data) || '';
}

/* ----------------------------- 对外：页面状态 ----------------------------- */

function listPages() {
  const state = loadState();
  const published = publishedAll();
  return schema.list().map((meta) => {
    const draft = state.drafts[meta.key];
    const pub = published[meta.key];
    return Object.assign({}, meta, {
      status: '已发布',
      hasDraft: !!(draft && draft.data),
      draftAt: draft ? draft.at : null,
      draftAtText: draft ? stampOf(draft.at) : '',
      publishedAt: draft && draft.baseAt ? draft.baseAt : null,
      blockCount: countBlocks(meta.key, pub),
      fields: countFields(pub),
      lastVersion: (state.versions.filter((v) => v.pageKey === meta.key)[0] || null)
    });
  });
}

/** 首页与自定义页统计区块数、其他页面统计顶层条目数 */
function countBlocks(key, data) {
  if (!data) return 0;
  const page = schema.get(key);
  if (key === 'home' || (page && page.custom)) return (data.blocks || []).length;
  if (key === 'lexy') return (data.series || []).length;
  if (key === 'news') return (data.big || []).length + (data.small || []).length;
  if (key === 'product') return (data.brands || []).length;
  return 1;
}

function countFields(data) {
  let n = 0;
  (function walk(v, d) {
    if (d > 8 || v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; }
    if (typeof v === 'object') { Object.keys(v).forEach((k) => { n++; walk(v[k], d + 1); }); return; }
  })(data, 0);
  return n;
}

/** 单页面详情：schema + 已发布数据 + 草稿数据 */
function getPage(key) {
  const page = schema.get(key);
  if (!page) return null;
  const state = loadState();
  const published = publishedOf(key);
  const draft = state.drafts[key];
  const data = draft && draft.data ? schema.clone(draft.data) : schema.clone(published);
  // 盘上可能存着结构升级前的老草稿（轮播 images 还是字符串数组），打开时先升级
  schema.upgradePageData(data);

  // 列表项标题由服务端算好（连带 path 一起给出，前端不必实现 title 函数）
  const titles = {};
  collectTitles(key, page.root, '', data, titles);

  return {
    meta: schema.list().filter((m) => m.key === key)[0],
    schema: schema.serialize(page),
    published,
    data,
    hasDraft: !!(draft && draft.data),
    draftAt: draft ? draft.at : null,
    draftAtText: draft ? stampOf(draft.at) : '',
    titles,
    versions: state.versions.filter((v) => v.pageKey === key).map((v) => ({
      id: v.id, at: v.at, atText: stampOf(v.at), note: v.note || '', by: v.by || ''
    }))
  };
}

/**
 * 递归生成「列表路径 → 每项标题」映射，供后台列表与结构树展示。
 * 路径不带索引（如 'series'、'series.products'），嵌套列表按带索引的路径递归。
 * 标题函数定义在 schema 上，服务端算好，前端不重复实现。
 */
function collectTitles(key, node, path, data, out) {
  if (!node) return;

  if (node.type === 'object') {
    (node.fields || []).forEach((f) => {
      collectTitles(key, f, path ? path + '.' + f.k : f.k, data ? data[f.k] : undefined, out);
    });
    return;
  }

  if (node.type !== 'list') return;
  const item = node.item;
  if (!item) return;

  if (Array.isArray(data)) {
    if (item.type === 'union') {
      out[path] = data.map((v) => {
        const kind = item.kinds[v[item.kindField]];
        if (!kind) return '未知类型';
        return kind.label + (v.height ? ' · ' + v.height + 'px' : '');
      });
    } else if (typeof item.title === 'function') {
      out[path] = data.map((v, i) => {
        try { return String(item.title(v, i)); } catch (e) { return ''; }
      });
    }

    // 递归子级（列表项内部的列表 / 对象）
    data.forEach((v, i) => {
      const sub = path + '.' + i;
      if (item.type === 'object') {
        (item.fields || []).forEach((f) => {
          collectTitles(key, f, sub + '.' + f.k, v ? v[f.k] : undefined, out);
        });
      } else if (item.type === 'union') {
        const kind = item.kinds[v[item.kindField]];
        if (kind) {
          (kind.fields || []).forEach((f) => {
            collectTitles(key, f, sub + '.' + f.k, v ? v[f.k] : undefined, out);
          });
        }
      }
    });
  }
}

/* ----------------------------- 对外：草稿 ----------------------------- */

function saveDraft(key, data) {
  const page = schema.get(key);
  if (!page) throw new Error('未知页面：' + key);
  const err = validate(key, data);
  if (err) throw new Error('数据校验未通过：' + err);

  const state = loadState();
  state.drafts[key] = { data: schema.clone(data), at: now() };
  saveState(state);
  return { key, at: state.drafts[key].at, atText: stampOf(state.drafts[key].at) };
}

function discardDraft(key) {
  const state = loadState();
  const had = !!(state.drafts[key] && state.drafts[key].data);
  delete state.drafts[key];
  saveState(state);
  return { key, discarded: had };
}

/* ----------------------------- 对外：发布 ----------------------------- */

/**
 * 生成 replica.js 源码 → 备份 → 原子写入 → 回读校验。
 * 任一步失败都自动回滚到原文件，绝不把工程留在「replica.js 是坏的」状态。
 * @param {object} pageData 全量页面数据（含本次要写入的页面）
 * @param {string} validateKey 回读时用哪个页面的规则校验（空串则不校验）
 * @returns {{ code, bytes, backup, ts }}
 */
function writeReplica(pageData, validateKey) {
  /* 1) 组装 + 生成源码 + 语法校验 */
  const assembled = assemble(pageData);
  const original = emit.readOriginal(REPLICA_FILE);
  const code = emit.emitReplica(assembled, { originalSrc: original, publishedAt: now() });
  try {
    new vm.Script(code, { filename: 'replica.js' });
  } catch (e) {
    throw new Error('生成的 replica.js 语法不合法，已中止发布：' + e.message);
  }

  /* 2) 备份当前文件（保留最近 20 份） */
  const ts = now();
  const backupName = `replica.${ts}.js`;
  ensureDirs();
  if (original) atomic.writeFileAtomic(nodePath.join(BACKUP_DIR, backupName), original);
  trimBackups();

  /* 3) 原子写入（Windows 上 rename 偶发 EPERM 时自动重试，避免「报发布成功但文件没换」） */
  atomic.writeFileAtomic(REPLICA_FILE, code);

  /* 4) 回读校验：文件真能 require 且关键字段形状正确 */
  let reread;
  try {
    reread = readReplica();
  } catch (e) {
    // 回滚到备份，避免把工程搞坏
    if (original) atomic.writeFileAtomic(REPLICA_FILE, original);
    throw new Error('写回后无法加载 replica.js，已自动回滚：' + e.message);
  }
  const page = validateKey ? schema.get(validateKey) : null;
  const check = page ? validate(validateKey, page.from(reread)) : '';
  if (check) {
    if (original) atomic.writeFileAtomic(REPLICA_FILE, original);
    readReplica();
    throw new Error('回读校验失败，已自动回滚：' + check);
  }

  return { code, bytes: Buffer.byteLength(code, 'utf8'), backup: backupName, ts };
}

/** 记一个发布版本（只保留最近 MAX_VERSIONS 个） */
function recordVersion(state, key, ts, note, pageData) {
  state.seq = (state.seq || 0) + 1;
  const version = {
    id: 'v' + state.seq,
    pageKey: key,
    at: ts,
    note: note || '发布',
    by: 'admin',
    snapshot: schema.clone(pageData)
  };
  state.versions.unshift(version);
  if (state.versions.length > MAX_VERSIONS) state.versions.length = MAX_VERSIONS;
  return version;
}

/**
 * 发布：把某个页面的草稿写回 replica.js
 * @returns {{ ok, pageKey, versionId, backup, bytes, publishedAt }}
 */
function publish(key, note) {
  const page = schema.get(key);
  if (!page) throw new Error('未知页面：' + key);

  const state = loadState();
  const draft = state.drafts[key];
  if (!draft || !draft.data) throw new Error('当前页面没有草稿，无需发布');

  const err = validate(key, draft.data);
  if (err) throw new Error('数据校验未通过：' + err);

  /* 组装全量数据：该页面用草稿，其余页面用各自的已发布数据 */
  const pageData = publishedAll();
  pageData[key] = schema.clone(draft.data);

  const res = writeReplica(pageData, key);
  const version = recordVersion(state, key, res.ts, note || '发布', pageData);
  delete state.drafts[key];
  saveState(state);

  /*
   * 自定义页：把「已发布数据」回写注册表。
   * 注册表才是自定义页的数据真源（草稿清掉后全靠它），漏了这一步，
   * 下次发布别的页面时这一页就会被还原成空白页。
   */
  if (page.custom) customPages.setPublished(key, pageData[key]);

  return {
    ok: true,
    pageKey: key,
    versionId: version.id,
    backup: res.backup,
    bytes: res.bytes,
    publishedAt: res.ts,
    publishedAtText: stampOf(res.ts)
  };
}

/** 备份只保留最近 20 份 */
function trimBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^replica\.\d+\.js$/.test(f)).sort();
    while (files.length > 20) {
      const f = files.shift();
      try { atomic.unlinkSync(nodePath.join(BACKUP_DIR, f)); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
}

/**
 * 回滚到某个版本：把该版本快照恢复成草稿（不直接发布，由使用者再点发布，避免误操作）
 * mode = 'draft' 仅恢复为草稿；mode = 'publish' 恢复并立即发布
 */
function rollback(pageKey, versionId, mode) {
  const state = loadState();
  const v = state.versions.filter((x) => x.pageKey === pageKey && x.id === versionId)[0];
  if (!v) throw new Error('版本不存在：' + versionId);
  const data = schema.clone(v.snapshot[pageKey]);
  if (!data) throw new Error('该版本快照里没有 ' + pageKey + ' 的数据');

  state.drafts[pageKey] = { data, at: now(), rollbackFrom: versionId };
  saveState(state);

  let published = null;
  if (mode === 'publish') {
    published = publish(pageKey, '回滚到 ' + versionId);
  }
  return { pageKey, versionId: v.id, mode: mode || 'draft', published };
}

/* ----------------------------- 对外：自定义页面管理 ----------------------------- */

/** 新建页面时可选的模板 */
function templates() {
  return customPages.templates();
}

/** 自定义页面概览（供列表页标注「x / 20」） */
function customStats() {
  return customPages.stats();
}

/**
 * 新建自定义页面。
 *
 * 只建注册表条目，**先不写 replica.js** —— 等运营装修完点「发布」才下发到小程序。
 * 否则手滑建一个空页面就会把线上数据覆盖掉。
 */
function createCustomPage(input) {
  const opt = input || {};
  const tpl = ['blank', 'home'].indexOf(opt.template) >= 0 ? opt.template : 'blank';

  let initial = { blocks: [], meta: {} };
  if (tpl === 'home') {
    const R = readReplica();
    initial = {
      blocks: schema.clone(R.HOME_BLOCKS || []),
      meta: schema.clone((R.PAGE_META && R.PAGE_META.home) || {})
    };
  }

  const def = customPages.create(Object.assign({}, opt, { template: tpl }), initial);
  return {
    page: def,
    template: tpl,
    schema: schema.serialize(schema.get(def.key)),
    published: publishedOf(def.key)
  };
}

/**
 * 改名称 / 备注 / 标识。
 *
 * 标识变了要连带搬家：草稿、版本快照、replica.js 里的 CUSTOM_PAGES 键名。
 * 少搬一处就会出现「页面还在但内容空了」或「旧 key 的幽灵页还留在小程序里」。
 */
function updateCustomPage(key, patch) {
  // 先判内置页：否则「内置页」会先撞上注册表查不到，报出误导性的「页面不存在」
  const page = schema.get(key);
  if (!page) throw new Error('页面不存在：' + key);
  if (!page.custom) throw new Error('内置页面不支持改名，请直接改代码');

  const res = customPages.update(key, patch || {});
  const newKey = res.page.key;
  const renamed = newKey !== key;

  if (renamed) {
    const state = loadState();
    if (state.drafts[key]) {
      state.drafts[newKey] = state.drafts[key];
      delete state.drafts[key];
    }
    state.versions.forEach((v) => {
      if (v.pageKey !== key) return;
      v.pageKey = newKey;
      if (v.snapshot && v.snapshot[key] !== undefined) {
        v.snapshot[newKey] = v.snapshot[key];
        delete v.snapshot[key];
      }
    });
    saveState(state);

    // 重新生成 replica，让 CUSTOM_PAGES 的键名同步（新键的数据从注册表读，不会丢）
    writeReplica(publishedAll(), newKey);
  }

  return {
    page: customPages.get(newKey),
    renamedFrom: renamed ? key : '',
    hasDraft: !!loadState().drafts[newKey]
  };
}

/**
 * 删除自定义页面：注册表 → 草稿 → 版本记录 → 重新生成 replica.js。
 *
 * 顺序很关键：**先让 replica.js 去掉这一页，再删注册表**。
 * 反过来的话，一旦写 replica 失败，页面数据就永久找不回来了
 * （注册表已删、草稿与快照也没了）。同时 replica 是必须重建的，
 * 否则被删页面的数据会留在 CUSTOM_PAGES 里，小程序端按旧 key 还能打开一个「幽灵页」。
 */
function removeCustomPage(key) {
  // 先判内置页：否则「内置页」会先撞上注册表查不到，报出误导性的「页面不存在」
  const page = schema.get(key);
  if (!page) throw new Error('页面不存在：' + key);
  if (!page.custom) throw new Error('内置页面不可删除');

  const pageData = publishedAll();
  delete pageData[key];
  const res = writeReplica(pageData, '');

  const gone = customPages.remove(key);

  const state = loadState();
  delete state.drafts[key];
  const before = state.versions.length;
  state.versions = state.versions.filter((v) => v.pageKey !== key);
  saveState(state);

  return {
    key,
    name: gone.name,
    backup: res.backup,
    bytes: res.bytes,
    removedVersions: before - state.versions.length
  };
}

/** 版本快照体积信息（后台提示用） */
function stats() {
  const state = loadState();
  let size = 0;
  try { size = fs.statSync(STATE_FILE).size; } catch (_) { /* ignore */ }
  return {
    drafts: Object.keys(state.drafts).length,
    versions: state.versions.length,
    stateBytes: size,
    replicaFile: nodePath.relative(ROOT, REPLICA_FILE).replace(/\\/g, '/')
  };
}

module.exports = {
  REPLICA_FILE,
  DATA_DIR,
  BACKUP_DIR,
  listPages,
  getPage,
  saveDraft,
  discardDraft,
  publish,
  rollback,
  stats,
  stampOf,
  readReplica,
  publishedAll,
  assemble,
  validate,
  templates,
  customStats,
  createCustomPage,
  updateCustomPage,
  removeCustomPage
};
