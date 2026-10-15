/**
 * 店铺装修 · 店铺笔记注册表
 *
 * 对标有赞「内容中心 → 店铺笔记」：一个笔记 = 一条内容，有**固定头部**（标题/摘要/标签/封面）
 * ＋ **固定正文**（富文本）＋ **可自由增删排序的自定义组件流**。
 * 装修页模型与有赞一致（取证见 `deploy/有赞店铺笔记装修页-取证.md`）：
 *
 *   手机状态栏（不可编辑，纯装饰）
 *   ├ 店长区（笔记头部：标题 + 发布时间 + 浏览量/点赞/进店按钮的显示开关）
 *   ├ 笔记正文（富文本，固定不可删）
 *   ├ 自定义组件 × N（文本 / 图片广告 / 富文本 / 辅助线 / 辅助空白 / 语音 / 视频，可拖拽排序）
 *   └ 笔记设置区（容器）
 *
 * 存储：server/data/decorate/shopnotes.json（与 custom-pages.json、state.json 分开）
 *   {
 *     seq: 3,                          // 自增序号，用于生成 id
 *     notes: [{
 *       id, title, summary, tags,
 *       coverMode, covers, showGoodsCard, showNoteOnGoods,
 *       header: { showTitle, showPublishTime, … },
 *       body:   { html, bg, fullscreen },
 *       blocks: [],                    // 自定义组件流（区块类型复用 HOME_BLOCK_KINDS）
 *       createdAt, updatedAt,
 *       published: { header, body, blocks, title, summary, tags, covers, … }
 *     }]
 *   }
 *
 * 为什么把笔记接进「页面」体系：
 *   装修台的属性面板 / 区块树 / 手机预览 / 草稿 / 版本 / 发布，全部由 schema 的字段树驱动。
 *   给每条笔记生成一个页面定义（key = `note-<id>`，见 schema.js 的 shopnoteDef），
 *   这六件事就**一行都不用重写**，与自定义页（customPages）走的是同一条路。
 *
 * ⚠️ load() 的兜底只捕获 JSON 解析失败：其它异常（代码 bug、IO 错误）一律向上抛，
 *    绝不能因为一次意外就把运营写好的笔记清空。
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const util = require('../lib/util');
const atomic = require('../lib/atomicFile');
const { BizError, ERR } = require('../lib/http');

const DATA_DIR = nodePath.join(require('../lib/dataDir').ROOT, 'decorate');
const FILE = nodePath.join(DATA_DIR, 'shopnotes.json');

/** 笔记数量上限（内容是持续产出的，给得比自定义页宽） */
const MAX_NOTES = 50;
/** 笔记在装修台里的归属分组 */
const BELONGS = '店铺笔记';
/** 页面 key 前缀：note-3 对应 id=3 的笔记 */
const KEY_PREFIX = 'note-';
/**
 * 小程序端笔记详情页的路径前缀（与 miniprogram/app.json 里的分包页一致）。
 *
 * ⚠️ 只在这里定义一处：schema.js 生成页面定义、装修台列表显示路径、
 *    小程序端跳转都指向同一个字符串。抄第二份就会出现「后台显示一个地址、
 *    真机跳另一个地址」这种最难发现的错位。
 */
const PATH_PREFIX = 'packageNews/note/note?id=';

/* ------------------------- 有赞实测的文案约束 ------------------------- */
/* 取值见 deploy/有赞店铺笔记装修页-取证.md 第四节「店长区」表 */
const TITLE_MIN = 5;      // 「请输入 5-40 字笔记标题」
const TITLE_MAX = 40;
const TAG_MAX = 8;        // 「8 个字以内」
const COVER_MAX = 9;      // 「最多上传 9 张」
const COVER_SIZE_TIP = 350; // 「推荐使用 350x350 像素的图片」

/** 封面模式：多图 / 单图（有赞叫「多图 · 单图」） */
const COVER_MODES = ['multi', 'single'];

/**
 * 「笔记头部」这个对象节点里属于**内容**（而不是显示开关）的键。
 *
 * ⚠️ 为什么要有这个常量：装修台的属性面板是**按 schema 字段树拼路径**的
 *    （server/public/admin/admin.js 的 joinPath / locate）。字段树里「笔记头部」
 *    是 `k:'header'` 的对象节点，所以面板读写的是 `data.header.title`。
 *    如果数据把标题平铺在 `data.title`，面板上那个输入框**永远是空的、
 *    改完什么也不会发生，而且不报任何错** —— 这正是「看起来能用」的那类坑
 *    （由 `.tooling/_probe-note-paths.cjs` 取证实测：21 个叶子字段里 7 个取不到值）。
 *
 * 所以这 7 个键必须与开关一起住在 `header` 里，
 * 对外入口（create / update 的入参、route/api 的 JSON）仍然收平铺写法，
 * 由 hoistHeader() 统一搬进来 —— **只此一处做形状转换**。
 */
const HEADER_KEYS = [
  'title', 'summary', 'tags', 'coverMode', 'covers', 'showGoodsCard', 'showNoteOnGoods'
];

/** 笔记头部的显示开关默认值（对标有赞 cap-shopnote-shopkeeper-header 的属性默认） */
const HEADER_DEFAULT = {
  templateId: 2,        // 头部模板编号（有赞 templateid=2）
  showTitle: true,
  showPublishTime: true,
  showBrowseCount: true,
  showThumbsUpCount: true,
  showEnterShop: true,
  showRecommendItems: true
};

/** 正文默认值（对标有赞 cap-richtext）
 *  ⚠️ 字段名与首页「富文本」区块（schema.js 的 HOME_BLOCK_KINDS.rich_text）**逐字一致**：
 *     html / bg / full（'1' = 全屏）。这样小程序端与预览可以共用同一段渲染逻辑，
 *     不必为「笔记正文」再写一套（写成 fullscreen/boolean 就得两处各判一次）。 */
const BODY_DEFAULT = {
  html: '',
  bg: '#ffffff',
  full: '1'
};

let cache = null;
let needFlush = false;
let flushTimer = null;

/* ----------------------------- 存取 ----------------------------- */

function empty() {
  return { seq: 0, notes: [] };
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
      console.error(`[shopnotes] shopnotes.json 无法使用，已备份为 ${broken}：${parseErr.message}`);
      cache = empty();
    }
    const base = empty();
    Object.keys(base).forEach((k) => { if (cache[k] === undefined) cache[k] = base[k]; });
    if (!Array.isArray(cache.notes)) cache.notes = [];
    if (!Number.isFinite(cache.seq)) cache.seq = 0;
    // 数组里混进非对象（手工编辑 / 历史遗留）：剔掉并留日志，不让一条脏数据拖垮整个装修台
    const dirty = cache.notes.filter((n) => !util.isPlainObject(n));
    if (dirty.length) {
      console.error(`[shopnotes] 忽略 ${dirty.length} 条非对象笔记记录`);
      needFlush = true;
    }
    cache.notes = cache.notes.filter((n) => util.isPlainObject(n));
    // id 必须是正整数，否则 note-<id> 这种 key 会撞车或为空
    cache.notes.forEach((n) => {
      if (!Number.isInteger(n.id) || n.id <= 0) {
        n.id = (cache.seq = (cache.seq || 0) + 1);
        needFlush = true;
      }
    });
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
    try { flushNow(); } catch (e) { console.error('[shopnotes] 落盘失败：', e.message); }
  }, 50);
  if (flushTimer.unref) flushTimer.unref();
}

/** 仅供自检 / 重置使用（清空全部笔记） */
function reset() {
  cache = empty();
  needFlush = true;
  flushNow();
}

/* ----------------------------- 工具 ----------------------------- */

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const stamp = () => Date.now();

function normText(raw, max) {
  const s = String(raw === undefined || raw === null ? '' : raw).trim();
  return max ? s.slice(0, max) : s;
}

/** 页面 key ←→ 笔记 id 的双向换算（两处必须是同一个字面，否则装修台找不到页面） */
function pageKeyOf(id) {
  return KEY_PREFIX + id;
}

/** 小程序端笔记详情页的地址（真机跳转、后台列表、预览共用这一处） */
function pathOf(id) {
  return PATH_PREFIX + id;
}

/** 'note-3' → 3；不是笔记 key 返回 0 */
function idOfKey(key) {
  const k = String(key || '');
  if (k.indexOf(KEY_PREFIX) !== 0) return 0;
  const n = parseInt(k.slice(KEY_PREFIX.length), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function findById(id) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return load().notes.filter((x) => x.id === n)[0] || null;
}

function has(id) {
  return !!findById(id);
}

/**
 * 把「笔记内容」补齐成完整形态（读写两侧都过这里，避免半截数据）。
 *
 * 内容 = 笔记头部（标题 / 摘要 / 标签 / 封面 / 显示开关）+ 正文 + 组件流，
 * 形状与 schema.js 的字段树**一一对应**（`header` / `body` / `blocks` 三个键）——
 * 字段树怎么写，这里就怎么放，否则面板读写的是另一个地址（见 HEADER_KEYS 的注释）。
 *
 * ⚠️ 这里**不含 id 与时间戳** —— 那些属于注册表元信息（见 record()）。
 */
function normalizeContent(c) {
  const n = c || {};
  const src = util.isPlainObject(n.header) ? n.header : {};
  /*
   * 每个内容键都是「header 里优先，取不到再看顶层」。
   *
   * 顶层那一份是**兼容读取**：`header` 这个层级是这一轮才加上的，
   * 之前存下的草稿（server/data/decorate/state.json 的 drafts['note-<id>']）
   * 和已发布内容里，标题/摘要/标签/封面都在顶层。
   * 不做兼容的话，运营上一轮存过的草稿打开就是一篇「空标题笔记」，
   * 一旦他再点发布，内容就被真的抹掉了 —— 静默丢数据比报错严重得多。
   * 新建/改名路径不依赖它（create/update 会先用 hoistHeader 归一到 header）。
   */
  const pick = (k) => (src[k] !== undefined ? src[k] : n[k]);
  const header = Object.assign({}, HEADER_DEFAULT, src, {
    title: normText(pick('title')),
    summary: normText(pick('summary'), 200),
    tags: normText(pick('tags'), TAG_MAX),
    coverMode: COVER_MODES.indexOf(pick('coverMode')) >= 0 ? pick('coverMode') : 'multi',
    covers: Array.isArray(pick('covers')) ? pick('covers').slice(0, COVER_MAX) : [],
    showGoodsCard: !!pick('showGoodsCard'),
    showNoteOnGoods: !!pick('showNoteOnGoods')
  });
  const body = Object.assign({}, BODY_DEFAULT, util.isPlainObject(n.body) ? n.body : {});
  return {
    header,
    /*
     * 发布时间（毫秒时间戳）。
     *
     * ⚠️ 必须随内容进 replica：真机的笔记详情页要显示「什么时候发的」，
     *    而 replica.SHOPNOTES[id] 里只有内容本身 —— 注册表（shopnotes.json）
     *    的 createdAt / updatedAt **不下发到小程序**。不放进来，真机就无从显示。
     * 口径：= 这一版被「生成代码」的时刻（见 store.publish 与 setPublished），
     *      不是笔记的创建时间。0 表示「还没发布过」。
     */
    publishedAt: Number(n.publishedAt) || 0,
    header,
    body,
    blocks: Array.isArray(n.blocks) ? n.blocks : []
  };
}

/**
 * 注册表记录 → 对外形态。
 *
 * 笔记**内容只存 `published` 这一份**，与 customPages 严格同构：
 *   注册表管的是「有哪几条笔记」＋「已发布的那一版长什么样」，
 *   正在编辑的中间态则由装修台的草稿（state.json 的 drafts['note-<id>']）承载。
 * 这样「存草稿 → 看变更 → 发布 → 回滚」四件事对笔记、自定义页、内置页走的是同一套代码。
 *
 * ⚠️ 必须带上 `key` / `name` / `belongs` / `path` 这几个**地址性派生字段**：
 *    customPages 的记录里本来就存着 key（用户在后台填的标识），所以它的 create() 返回体
 *    天然带 key；笔记的 key 却是从 id 推导出来的（note-<id>）—— 这里不补，
 *    后台拿到 create 响应就会 `openPage(undefined)`，跳到 `/admin?edit=undefined`。
 *    （这是 _test-notes-http.cjs 抓出来的：`created.body.page.key === undefined`。）
 *    它们是派生值，**不落盘、不进 replica** —— 真源仍是 `id` 一个字段。
 *
 * 顶层 `title` / `tags` 同理：取自 published.header，给装修台列表当显示名与副标题。
 * ⚠️ 这两个是**派生出来的展示字段**，不是数据真源 —— 真源只有一个：`published.header`。
 */
function record(rec) {
  const r = rec || {};
  const content = normalizeContent(r.published);
  const h = content.header;
  const id = r.id;
  return {
    id: id,
    key: id ? pageKeyOf(id) : '',
    title: h.title,
    name: h.title || ('笔记 #' + id),
    tags: h.tags,
    belongs: BELONGS,
    path: id ? pathOf(id) : '',
    createdAt: r.createdAt || stamp(),
    updatedAt: r.updatedAt || stamp(),
    published: content
  };
}

/** 取一条笔记的已发布内容（记录缺失时给一份空白内容，保证装修台渲染不炸） */
function publishedContent(id) {
  const n = findById(id);
  return normalizeContent(n && n.published);
}

/* ----------------------------- 校验 ----------------------------- */

/*
 * ⚠️ 这里的校验失败**必须抛 BizError**，不能抛普通 Error。
 *    普通 Error 会被入口当成「未预期异常」→ HTTP 500 / code 5000 / 对外文案
 *    「服务开小差了，请稍后重试」，于是运营在装修台只看到一句没有信息量的提示，
 *    分不清是「标题太短」还是代码挂了；自检的「预期失败」用例也会因为拿到 5000 而假通过。
 */

/** 校验标题（新建时允许为空——先建再填；发布前由装修台按必填拦一次） */
/**
 * 标题校验（三处调用：create / update / store.validate）。
 *
 * 长度口径取自取证（`deploy/有赞店铺笔记装修页-取证.md` 第四节）：
 * 有赞那一步是个 input 的 **placeholder**「请输入 5-40 字 笔记标题」，
 * 也就是说 5 字只是**提示**、不是硬校验，40 字才是真上限。
 * 所以这里只强制两件事：① 必填；② 不超过 TITLE_MAX。
 *
 * ⚠️ 这里**刻意不留 `required` 开关**。原来有这个参数，create/update 传了 false，
 *    于是空标题被静默接受、列表里多出一篇叫「笔记 #3」的空笔记 ——
 *    是 `.tooling/_test-notes-http.cjs` 抓出来的。
 *    一个「可以让调用方关掉必填」的开关，早晚会被关掉；标题对笔记来说是身份（它就是列表里的名字），
 *    没有「可以不填」的合法场景，所以不留口子。
 */
function checkTitle(title) {
  if (!title) return `笔记标题必填（建议 ${TITLE_MIN}~${TITLE_MAX} 字）`;
  if (title.length > TITLE_MAX) return `笔记标题最多 ${TITLE_MAX} 个字`;
  return '';
}

/**
 * 把「顶层内容键」搬进 `header`（见 HEADER_KEYS 注释）。
 *
 * 只此一处做形状转换，调用方两种写法都收：
 *   · 装修台面板提交的是 `{ header: { title: '…' } }`（字段树路径）；
 *   · create / update 的公开入参、route 层的 JSON 一直是平的 `{ title: '…' }`。
 * 两者同时出现时**以 header 里的为准**（它是规范形状），并在同一次调用里只做一次搬运。
 */
function hoistHeader(patch) {
  const out = Object.assign({}, patch || {});
  const moved = [];
  HEADER_KEYS.forEach((k) => { if (out[k] !== undefined) { moved.push(k); } });
  if (!moved.length) return out;
  const header = Object.assign({}, util.isPlainObject(out.header) ? out.header : {});
  moved.forEach((k) => {
    if (header[k] === undefined) header[k] = out[k];
    delete out[k];
  });
  out.header = header;
  return out;
}

/* ----------------------------- 对外：读 ----------------------------- */

/** 笔记列表（深拷贝，调用方可安全改写） */
function list() {
  return clone(load().notes).map(record);
}

function get(id) {
  const n = findById(id);
  return n ? record(clone(n)) : null;
}

function count() {
  return load().notes.length;
}

/** 装修台「店铺笔记」列表要显示的概要（不含 blocks / body —— 那两个加起来能到几百 KB） */
function summary(id) {
  const r = get(id);
  if (!r) return null;
  delete r.published.blocks;
  delete r.published.body;
  return r;
}

function summaries() {
  return list().map((r) => {
    delete r.published.blocks;
    delete r.published.body;
    return r;
  });
}

function stats() {
  const data = load();
  let size = 0;
  try { size = fs.statSync(FILE).size; } catch (_) { /* ignore */ }
  return { count: data.notes.length, max: MAX_NOTES, bytes: size };
}

/* ----------------------------- 对外：写 ----------------------------- */

/**
 * 新建笔记
 * @param {object} input 笔记内容（title / summary / tags / covers / header / body / blocks 全部可选）
 * @returns {object} 新建后的笔记记录
 */
function create(input) {
  const opt = input || {};
  const data = load();
  if (data.notes.length >= MAX_NOTES) {
    throw new BizError(`店铺笔记最多 ${MAX_NOTES} 条，已达上限`, ERR.BIZ);
  }

  // ⚠️ 标题**先校验再赋值**，不能先 normText(…, TITLE_MAX) 截断 ——
  //    截断之后长度必然合法，checkTitle 就永远不报错，运营填 60 字会被静默砍成 40 字
  //    还以为自己填的就是 40 字（改坏验判别力时发现的）。
  const title = normText(opt.title);
  const err = checkTitle(title);
  if (err) throw new BizError(err, ERR.PARAM);

  data.seq = (data.seq || 0) + 1;
  const rec = {
    id: data.seq,
    createdAt: stamp(),
    updatedAt: stamp(),
    published: normalizeContent(hoistHeader(Object.assign({}, opt, { title })))
  };

  data.notes.push(rec);
  commit();
  return record(clone(rec));
}

/**
 * 改笔记内容（只改传入的字段，其余保持原值）。
 *
 * ⚠️ header / body 这类**对象字段做浅合并**而不是整体替换：
 *    装修台的「更多设置」面板每次可能只提交其中一个开关，
 *    若整体替换，其它开关会静默回落到默认值（改一个丢五个）。
 *
 * ⚠️ 入参里的顶层内容键（title / summary / tags / covers …）由 hoistHeader
 *    先搬进 header 再合并 —— 顺序不能反：先合并后搬的话，
 *    `Object.assign({}, cur, opt)` 里 cur.header.title 是旧标题，
 *    而 normalizeContent 又是「header 优先」，新标题就被旧值盖住了。
 */
function update(id, patch) {
  const note = findById(id);
  if (!note) throw new BizError('笔记不存在：' + id, ERR.NOT_FOUND, 404);
  const opt = hoistHeader(patch);

  if (util.isPlainObject(opt.header) && opt.header.title !== undefined) {
    // 同上：先校验再赋值，别让超长标题被静默截断成「看起来合法」
    const title = normText(opt.header.title);
    const err = checkTitle(title);
    if (err) throw new BizError(err, ERR.PARAM);
    opt.header = Object.assign({}, opt.header, { title: title });
  }
  if (util.isPlainObject(opt.header) && opt.header.covers !== undefined) {
    if (!Array.isArray(opt.header.covers)) throw new BizError('封面图必须是数组', ERR.PARAM);
    if (opt.header.covers.length > COVER_MAX) {
      throw new BizError(`封面图最多 ${COVER_MAX} 张`, ERR.PARAM);
    }
  }
  if (opt.blocks !== undefined && !Array.isArray(opt.blocks)) {
    throw new BizError('笔记组件必须是数组', ERR.PARAM);
  }

  const cur = normalizeContent(note.published);
  if (util.isPlainObject(opt.header)) opt.header = Object.assign({}, cur.header, opt.header);
  if (util.isPlainObject(opt.body)) opt.body = Object.assign({}, cur.body, opt.body);

  note.published = normalizeContent(Object.assign({}, cur, opt));
  note.updatedAt = stamp();
  commit();
  return record(clone(note));
}

/** 删除笔记（只删注册表条目；草稿、版本、replica.js 的清理由 store.js 编排） */
function remove(id) {
  const data = load();
  const i = data.notes.findIndex((n) => n.id === parseInt(id, 10));
  if (i < 0) throw new BizError('笔记不存在：' + id, ERR.NOT_FOUND, 404);
  const [gone] = data.notes.splice(i, 1);
  commit();
  return record(clone(gone));
}

/**
 * 发布成功后回写「已发布数据」。
 *
 * 发布链路的第 2 步：`assemble()` 用各页 `to()` 产出 replica 增量写进 replica.js 之后，
 * store.js 会对每个自定义页 / 笔记调用它，把「刚刚发布的那一版」记进注册表。
 * 于是下次打开编辑器，基线就是这一版（而不是更早的那一版）。
 */
function setPublished(id, payload) {
  const note = findById(id);
  if (!note) throw new BizError('笔记不存在：' + id, ERR.NOT_FOUND, 404);
  const content = normalizeContent(payload);
  // 发布时间 = 这一版被「生成代码」的时刻。
  // 调用方（store.publish）在写 replica 前已经填过一次同样的值，这里再填一次是为了
  // 「直接调 setPublished」的场景（比如脚本 / 未来别的入口）也不会留下 0。
  if (!content.publishedAt) content.publishedAt = stamp();
  note.published = content;
  note.updatedAt = stamp();
  commit();
  return record(clone(note));
}

module.exports = {
  FILE,
  MAX_NOTES,
  BELONGS,
  KEY_PREFIX,
  PATH_PREFIX,
  TITLE_MIN,
  TITLE_MAX,
  TAG_MAX,
  COVER_MAX,
  COVER_SIZE_TIP,
  COVER_MODES,
  HEADER_KEYS,
  HEADER_DEFAULT,
  BODY_DEFAULT,
  hoistHeader,
  list,
  get,
  has,
  count,
  summary,
  summaries,
  stats,
  create,
  update,
  remove,
  setPublished,
  pageKeyOf,
  idOfKey,
  pathOf,
  normalizeContent,
  publishedContent,
  record,
  checkTitle,
  flushNow,
  reset
};
