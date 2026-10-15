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
const shopnotes = require('./shopnotes');
const atomic = require('../lib/atomicFile');
const util = require('../lib/util');
const { BizError, ERR } = require('../lib/http');

const ROOT = nodePath.join(__dirname, '..', '..');
/**
 * 发布产物（replica.js）的落点。
 *
 * 默认就是小程序源码里那份；`MALL_REPLICA_FILE` 可指向别处 ——
 * 非交易回归测试要跑「草稿 → 发布」的全链路，但绝不能真的改写
 * miniprogram/config/replica.js（那是线上前端唯一数据源）。
 */
const REPLICA_FILE = process.env.MALL_REPLICA_FILE
  ? nodePath.resolve(process.env.MALL_REPLICA_FILE)
  : nodePath.join(ROOT, 'miniprogram', 'config', 'replica.js');
const DATA_DIR = nodePath.join(require('../lib/dataDir').ROOT, 'decorate');
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
    out[p.key] = p.shopnote ? shopnotePublished(p.key)
      : p.custom ? customPublished(p.key)
      : schema.clone(p.from(R));
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

/**
 * 单条笔记的已发布数据（注意分支判据是 `p.shopnote`，**不是** `p.custom`）。
 *
 * 笔记与自定义页都带 `custom: true`（都走「注册表 + 草稿」这条路），
 * 但内容形态完全不同：自定义页是 { blocks, meta }，笔记是 { header, body, blocks, … }。
 * 若这里也用 customPublished()，笔记会被硬塞成 { blocks:[], meta:{} }，
 * 打开编辑器时标题、封面、正文全部消失（只剩组件流）。
 */
function shopnotePublished(key) {
  const id = shopnotes.idOfKey(key);
  if (!id) return schema.clone(shopnotes.normalizeContent({}));
  return schema.clone(shopnotes.publishedContent(id));
}

function publishedOf(key) {
  const p = schema.get(key);
  if (!p) return null;
  if (p.shopnote) return shopnotePublished(key);
  return p.custom ? customPublished(key) : schema.clone(p.from(readReplica()));
}

/**
 * 把各页面数据组装成 replica 的 6（+PAGE_META）个字段
 *
 * @param {object} pageDataMap
 * @param {{dropAliasOf?:string}} [opt] 生成别名表时要**排除**的页面标识。
 *   删除页面走的是「先写 replica、再删注册表」的顺序（写失败时页面数据才不会丢），
 *   于是生成文件的那一刻注册表里那一页还在、指向它的别名也还在 ——
 *   必须在这里就滤掉，否则 replica.js 会永久留着一条指向已删页面的别名。
 */
function assemble(pageDataMap, opt) {
  const out = {};
  /*
   * ★ 笔记的「生成代码」门（2026-10-15 修）。
   *
   * 问题（实测取证）：建 A、建 B 两篇笔记 → 只给 **B** 点一次「生成代码」→
   *   replica.js 里同时出现了 A；`/api/decorate/pages` 随即把 A 判成「代码已生成」。
   *   删除任意一篇笔记同样会把 A 扫进去。也就是说：运营在编、还没打算发布的笔记，
   *   会被任何一次「写 replica.js」悄悄下发到小程序。
   *
   * 根因：publishedAll() 为了让编辑器一打开就有内容，会把**每一篇已注册笔记**
   *   （shopnotes.publishedContent(id) —— 建号时的初始内容 / 上次发布的内容）都返回；
   *   而这里又**整份**拿它去组装 replica ——「注册表里有」被当成了「已经下发」。
   *
   * 判据（只会少写、不会多写）—— 一篇笔记要写进产物，必须满足其一：
   *   ① 它就是本次正在发布的那一篇（opt.keepKey，publish() 传进来）；
   *   ② 它**当前已经在 replica.js 里**（上一次「生成代码」留下的）。
   * ② 是防回归的关键：写别的页面时，已经下发的笔记绝不能被顺手抹掉 ——
   *   那会让线上正在用的笔记凭空消失，比原来的 bug 更严重。
   *
   * ⚠️ id 类型：replica 里 SHOPNOTES 的键是**字符串**（Object.keys），
   *    这里统一 String() 归一，别拿 Number 去 has()（那会一条都命不中，
   *    表现成「已经下发的笔记被悄悄删掉」——正好是 ② 要防的那件事）。
   *
   * ★ 自定义页是**同一个坑**（实测：建一个自定义页 → 删一篇无关笔记触发整份重建 →
   *   那个从没发布过的页面就出现在 CUSTOM_PAGES 里，接口同时判它「代码已生成」）。
   *   它自己的文档也写着「只建注册表条目，先不写 replica.js…否则手滑建一个空页面
   *   就会把线上数据覆盖掉」——所以用同一条规则。两边写在同一个循环里，免得将来只改一边。
   */
  const R0 = readReplica();
  const generatedNoteIds = new Set(Object.keys(R0.SHOPNOTES || {}).map(String));
  const liveCustomKeys = new Set(Object.keys(R0.CUSTOM_PAGES || {}));
  const keepKey = (opt && opt.keepKey) || '';
  schema.allPages().forEach((p) => {
    const d = pageDataMap[p.key];
    if (d === undefined || d === null) return;
    if (p.shopnote) {
      if (p.key !== keepKey && !generatedNoteIds.has(String(shopnotes.idOfKey(p.key)))) return;
    } else if (p.custom) {
      if (p.key !== keepKey && !liveCustomKeys.has(p.key)) return;
    }
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

  /*
   * 自定义页「旧标识 → 新标识」别名表。
   *
   * 它不属于任何单个页面（一个别名可能对应一个已被改名两次的页面），
   * 所以在这里统一挂上去，而不是塞进某个页面的 adapter。
   * 没有别名时保持 undefined —— emit 端会整段省略，老 replica.js 不受影响。
   */
  const al = customPages.aliases();
  const drop = (opt && opt.dropAliasOf) || '';
  if (drop) {
    delete al[drop];
    Object.keys(al).forEach((old) => { if (al[old] === drop) delete al[old]; });
  }
  if (Object.keys(al).length) out.CUSTOM_PAGE_ALIASES = al;

  return out;
}

/* ----------------------------- 站内引用扫描 ----------------------------- */

/** 匹配自定义页地址：`/pages/custom/index?key=xxx`（也容忍不带前导斜杠、带其它参数） */
const CUSTOM_URL_RE = /(?:^|\/)pages\/custom\/index\?([^"'#\s]*)/;

/** 从一个地址里取出它指向的自定义页标识（不是自定义页地址则返回空串） */
function customKeyOfUrl(url) {
  const s = String(url === undefined || url === null ? '' : url);
  const m = CUSTOM_URL_RE.exec(s);
  if (!m) return '';
  const km = /(?:^|&)key=([^&]*)/.exec(m[1]);
  if (!km) return '';
  try { return decodeURIComponent(km[1]); } catch (e) { return km[1]; }
}

/** 深度遍历任意数据，收集所有指向 target 的字符串（记录 JSON 路径） */
function walkRefs(node, path, target, out) {
  if (typeof node === 'string') {
    if (customKeyOfUrl(node) === target) out.push({ path: path, value: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkRefs(v, path + '.' + i, target, out));
    return;
  }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach((k) => walkRefs(node[k], path ? path + '.' + k : k, target, out));
  }
}

/** 字段名 → 中文说明，让引用清单能直接读（「首页 › 轮播 · 520px › 跳转链接」） */
const FIELD_TEXT = {
  link: '跳转链接', image: '图片', images: '轮播图', src: '图片 / 视频地址',
  video: '视频', avatar: '头像', logo: 'Logo', bg: '背景图', url: '地址'
};

/**
 * 扫描「站内引用」：哪些页面的哪个字段指向了这个自定义页标识。
 *
 * 为什么要扫：
 *   页面标识就是访问地址。运营改名/删除时，如果别的页面还用旧地址跳它，
 *   用户点过去就是空白页 —— 而后台不会提示任何异常。
 *
 * 扫描口径：**草稿优先**（草稿就是「生成代码」将要写出去的内容），
 * 没草稿才用已发布数据；外加底部导航（它不是页面区块，单独一份）。
 *
 * @returns {Array<{pageKey, pageName, path, field, label, value}>}
 */
function referencesOf(key) {
  const target = String(key || '');
  const out = [];
  if (!target) return out;

  const state = loadState();
  const drafts = state.drafts || {};
  const published = publishedAll();

  schema.allPages().forEach((p) => {
    const d = drafts[p.key] ? drafts[p.key].data : published[p.key];
    if (d === undefined || d === null) return;
    const hits = [];
    walkRefs(d, p.key, target, hits);
    if (!hits.length) return;
    const titles = {};
    try { collectTitles(p.key, p.root, '', d, titles); } catch (e) { /* 标题只是锦上添花 */ }
    hits.forEach((h) => out.push(decorateRef(p, h, titles, drafts[p.key] ? '草稿' : '已发布')));
  });

  // 底部导航：编辑态在 drafts.nav，否则取已发布 replica.TABBAR
  const nav = drafts.nav ? drafts.nav.data : readReplica().TABBAR;
  if (nav) {
    const hits = [];
    walkRefs(nav, 'TABBAR', target, hits);
    hits.forEach((h) => out.push({
      pageKey: 'nav',
      pageName: '店铺导航（底部导航）',
      path: h.path,
      field: h.path.split('.').pop(),
      label: '店铺导航 › ' + (FIELD_TEXT[h.path.split('.').pop()] || h.path),
      state: drafts.nav ? '草稿' : '已发布',
      value: h.value
    }));
  }

  return out;
}

/** 把一条命中整理成可展示的引用记录 */
function decorateRef(page, hit, titles, stateText) {
  const field = hit.path.split('.').pop();
  // blocks.3.link → titles['blocks'][3] 是「轮播 · 520px」这类区块标题
  const m = /^([A-Za-z_][A-Za-z_0-9]*)\.(\d+)\./.exec(hit.path);
  let where = '';
  if (m && Array.isArray(titles[m[1]]) && titles[m[1]][Number(m[2])]) {
    where = String(titles[m[1]][Number(m[2])]);
  }
  return {
    pageKey: page.key,
    pageName: page.name + (stateText === '草稿' ? '（草稿）' : ''),
    path: hit.path,
    field: field,
    label: page.name + ' › ' + (where ? where + ' › ' : '') + (FIELD_TEXT[field] || field),
    state: stateText,
    value: hit.value
  };
}

/* ----------------------------- 结构校验 ----------------------------- */

/**
 * 区块数组结构校验（首页 / 自定义页 / 店铺笔记共用一份规则）。
 * 校验的是「能不能渲染」：区块类型必须已接入，且各类区块的必填字段不能为空。
 *
 * ⚠️ `kinds` 由调用方按**页面**给出（见 schema.pageBlockKinds），默认才是首页那 59 种。
 *    原来这里写死 `schema.HOME_BLOCK_KINDS`，于是笔记组件面板里摆着的
 *    「文本」「辅助空白」（它们住在 UC_KINDS）一存草稿就被判「类型不支持」——
 *    装修台给得出来、后端收不下去。**「能加什么」与「收不收」必须是同一份清单。**
 */
function checkBlocks(d, kinds) {
  if (!d || typeof d !== 'object') return '页面数据必须是对象';
  if (!Array.isArray(d.blocks)) return '缺少 blocks 数组';
  const table = kinds || schema.HOME_BLOCK_KINDS;
  for (let i = 0; i < d.blocks.length; i++) {
    const b = d.blocks[i];
    if (!b || !b.type) return `第 ${i + 1} 个区块缺少 type`;
    if (!table[b.type]) return `第 ${i + 1} 个区块类型不支持：${b.type}`;
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
  mine: (d) => (d && d.shop && typeof d.shop === 'object' ? '' : '我的页缺少 shop 对象'),
  nav: (d) => {
    if (!d || typeof d !== 'object') return '导航配置必须是对象';
    if (!Array.isArray(d.items)) return '导航配置缺少 items 数组';
    const items = d.items.filter((x) => x && x.path);
    if (items.length < schema.TABBAR_MIN) return `底部导航至少需要 ${schema.TABBAR_MIN} 项（微信限制）`;
    if (items.length > schema.TABBAR_MAX) return `底部导航最多 ${schema.TABBAR_MAX} 项（微信限制）`;
    for (let i = 0; i < items.length; i++) {
      /*
       * 跳转目标有两类：小程序内置 tab 页（app.json 的 tabBar.list）
       * 和装修台新建的自定义页。判定统一走 schema.isTabbarPath —— 只有一处口径。
       *
       * ⚠️ 这里早先硬写着「必须在 TABBAR_PAGES 里」。结果是：装修台的下拉里
       *    明明能选到自定义页，一点「存至草稿」就被这条校验拦下，报的还是一句
       *    听起来像平台限制的「微信限制」——运营和开发都很难意识到是代码漏改。
       *    凡是「候选集合」这类判断，一律复用 schema 里的那个函数，不要就地再写一遍。
       */
      if (!schema.isTabbarPath(items[i].path)) {
        return `第 ${i + 1} 个导航项的跳转页面不能作为底部导航目标：${items[i].path}` +
          '（可选小程序内置的 5 个 tab 页，或装修台新建的自定义页）';
      }
      /*
       * 同一个页面只能出现一次。
       * 归一化里虽然有「重复只保留第一次」的兜底，但那是给历史数据/手改文件用的 ——
       * 运营在装修台里配重复时**必须当场报错**：否则他配了 5 项、真机只有 4 项，
       * 而且底部两项都点去同一个页面，属于「静默少一项」，比报错难查得多。
       */
      const dup = items.slice(0, i).findIndex((x) => x.path === items[i].path);
      if (dup > -1) {
        return `第 ${i + 1} 个导航项与第 ${dup + 1} 项跳转到同一个页面：${items[i].path}` +
          '（同一个页面只能出现一次，否则底部会有两处同时高亮）';
      }
    }
    return '';
  }
};

function validate(key, data) {
  const page = schema.get(key);
  if (!page) return '未知页面：' + key;
  /*
   * 放行清单按**页面**取（笔记 7 个 / 自定义页与内置页 = 首页那 59 种），
   * 与装修台左栏能拖进来的那份严格同源 —— 见 schema.pageBlockKinds 的注释。
   */
  const kinds = schema.pageBlockKinds(page);
  /*
   * 店铺笔记：先校验「标题」，再走区块流校验。
   *
   * ⚠️ 这一条必须落在 validate() 里，**不能只在 setPublished() 里拦**：
   *    publish() 的顺序是「先 writeReplica、后回写注册表」，
   *    若把标题校验放到回写那一步，运营清空标题点「生成代码」时，
   *    replica.js 已经写出去了才报错 —— 文件与注册表当场不一致（最难修的一种）。
   *    validate() 在 writeReplica 之前被调用，拦在这里等于「什么都没发生」。
   */
  if (page.shopnote) {
    // 标题真源是 data.header.title（与 schema 的字段树一致，见 shopnotes.HEADER_KEYS）；
    // 兼容读取上一轮存下的平铺草稿（data.title）—— 与 normalizeContent 同一口径。
    const h = (data && util.isPlainObject(data.header)) ? data.header : {};
    const raw = h.title !== undefined ? h.title : (data && data.title);
    const t = shopnotes.checkTitle(String(raw === undefined || raw === null ? '' : raw).trim());
    if (t) return t;
    return checkBlocks(data, kinds);
  }
  // 自定义页面统一是「区块流」结构，与首页共用同一套校验规则
  if (page.custom) return checkBlocks(data, kinds);
  const fn = REQUIRED[key];
  if (!fn) return '未知页面：' + key;
  return fn(data) || '';
}

/* ----------------------------- 对外：页面状态 ----------------------------- */

function listPages() {
  const state = loadState();
  const published = publishedAll();
  const R = readReplica();
  const inReplica = R.CUSTOM_PAGES || {};
  // 别名反查：哪些旧标识仍然指向这个页面（改过标识的页面，旧分享链接靠它继续可用）
  const aliasFromOf = {};
  const al = customPages.aliases();
  Object.keys(al).forEach((old) => {
    const to = al[old];
    if (!aliasFromOf[to]) aliasFromOf[to] = [];
    aliasFromOf[to].push(old);
  });

  return schema.list().map((meta) => {
    const draft = state.drafts[meta.key];
    const pub = published[meta.key];
    /*
     * 「已发布」对自定义页 / 店铺笔记是个容易被误读的说法：
     * 注册表里的条目刚建好就有 published 字段（那是初始内容），但它**还没写进 replica.js**，
     * 小程序端其实打不开。所以用 generated 明确区分「已写进代码包」与「只在后台」。
     *
     * 两者写进 replica 的落点不同：自定义页在 CUSTOM_PAGES[key]，笔记在 SHOPNOTES[<id>]。
     * 笔记若照自定义页那样去查 CUSTOM_PAGES，会永远显示「未生成代码」。
     */
    const generated = meta.shopnote
      ? !!(R.SHOPNOTES && R.SHOPNOTES[String(meta.key).slice(shopnotes.KEY_PREFIX.length)])
      : meta.custom ? !!inReplica[meta.key] : true;
    return Object.assign({}, meta, {
      status: meta.custom ? (generated ? '代码已生成' : '未生成代码') : '已发布',
      generated: generated,
      aliasFrom: aliasFromOf[meta.key] || [],
      hasDraft: !!(draft && draft.data),
      draftAt: draft ? draft.at : null,
      draftAtText: draft ? stampOf(draft.at) : '',
      publishedAt: draft && draft.baseAt ? draft.baseAt : null,
      blockCount: countBlocks(meta.key, pub),
      /*
       * 草稿里的区块数（无草稿 = null）。
       *
       * 为什么要多一个字段，而不是让 blockCount 直接读草稿：
       *   blockCount 的口径是「**已生成代码里**有几个区块」，它与状态列
       *   「已生成 / 未生成代码」是同一条事实的两个面，两个消费方（装修台列表、
       *   控制台笔记列表）都靠它。把它的数据源换成草稿，会顺手改掉装修台的既有口径。
       *
       * 但笔记只出现在控制台，而运营最常处的状态恰恰是「改了草稿、还没生成代码」——
       * 这时只报「0 个组件」（草稿里的 5 个看不见）等于没回答问题。
       * 所以：**加字段**，由展示层决定显示哪一个（见 console.modules.js 的 noteRow）。
       */
      draftBlockCount: (draft && draft.data) ? countBlocks(meta.key, draft.data) : null,
      fields: countFields(pub),
      lastVersion: (state.versions.filter((v) => v.pageKey === meta.key)[0] || null)
    });
  });
}

/** 首页与自定义页统计区块数、其他页面统计顶层条目数 */
function countBlocks(key, data) {
  if (!data) return 0;
  const page = schema.get(key);
  if (key === 'nav') return (data.items || []).length;
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
  let data = draft && draft.data ? schema.clone(draft.data) : schema.clone(published);
  // 盘上可能存着结构升级前的老草稿（轮播 images 还是字符串数组），打开时先升级
  schema.upgradePageData(data);
  /*
   * 笔记的草稿再做一次「形状归位」：把顶层的内容键（title / tags / covers …）
   * 搬进 header，与字段树一致。
   *
   * ⚠️ 必须放在**读**这一侧：盘上已经存着的草稿是按旧形状写的（当时内容平铺在顶层），
   *    不归位的话运营打开编辑器会看到标题那一格是空的 —— 而标题其实还在，
   *    只是躺在 data.title 上；他要是随手填一个再发布，旧标题就真没了。
   *    saveDraft() 里也做了同样的搬运（保证新草稿就是规范形状），
   *    两处都留着是因为「历史数据」与「新写入」各有各的入口。
   */
  if (page.shopnote) data = shopnotes.hoistHeader(data);

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
  if (!page) throw new BizError('未知页面：' + key, ERR.NOT_FOUND, 404);
  const err = validate(key, data);
  if (err) throw new BizError('数据校验未通过：' + err, ERR.PARAM);

  const state = loadState();
  /*
   * 笔记草稿存**规范形状**（内容键在 header 下，与字段树一致）。
   * 不搬的话，用平铺写法存进来的草稿再打开时，面板上标题/摘要/标签那几格是空的
   * （数据还在，只是躺在顶层键上）—— 与 getPage() 的读侧归位配套。
   */
  const stored = page.shopnote ? shopnotes.hoistHeader(data) : schema.clone(data);
  state.drafts[key] = { data: stored, at: now() };
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
 * @param {{dropAliasOf?:string, keepKey?:string}} [opt]
 *        dropAliasOf：删除页面时要把指向它的别名一并滤掉；
 *        keepKey：本次正在发布的页面标识 —— 见 assemble() 里笔记的「生成代码」门。
 * @returns {{ code, bytes, backup, ts }}
 */
function writeReplica(pageData, validateKey, opt) {
  /* 1) 组装 + 生成源码 + 语法校验 */
  const assembled = assemble(pageData, opt);
  const original = emit.readOriginal(REPLICA_FILE);
  const code = emit.emitReplica(assembled, { originalSrc: original, publishedAt: now() });
  try {
    new vm.Script(code, { filename: 'replica.js' });
  } catch (e) {
    throw new BizError('生成的 replica.js 语法不合法，已中止发布：' + e.message, ERR.SERVER, 500);
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
    throw new BizError('写回后无法加载 replica.js，已自动回滚：' + e.message, ERR.SERVER, 500);
  }
  const page = validateKey ? schema.get(validateKey) : null;
  const check = page ? validate(validateKey, page.from(reread)) : '';
  if (check) {
    if (original) atomic.writeFileAtomic(REPLICA_FILE, original);
    readReplica();
    throw new BizError('回读校验失败，已自动回滚：' + check, ERR.SERVER, 500);
  }

  /*
   * 别名表单独回读确认。
   * 它不属于任何页面，上面的 validate 覆盖不到；而一旦写丢，现象是
   * 「用户点旧分享链接打不开」——运营自己在后台完全看不出来。
   * 所以宁可在生成阶段就失败并回滚。
   *
   * 期望值取自 assembled（而不是 registry）：删除页面时 registry 还没清，
   * 拿它比对会把「本该滤掉的那条别名」算成必须存在。
   */
  const wantAlias = Object.keys(assembled.CUSTOM_PAGE_ALIASES || {}).length;
  const gotAlias = Object.keys((reread && reread.CUSTOM_PAGE_ALIASES) || {}).length;
  if (wantAlias !== gotAlias) {
    if (original) atomic.writeFileAtomic(REPLICA_FILE, original);
    readReplica();
    throw new BizError(
      `回读校验失败，已自动回滚：旧标识别名应写入 ${wantAlias} 条，实际 ${gotAlias} 条`, ERR.SERVER, 500);
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
  if (!page) throw new BizError('未知页面：' + key, ERR.NOT_FOUND, 404);

  const state = loadState();
  const draft = state.drafts[key];
  if (!draft || !draft.data) throw new BizError('当前页面没有草稿，无需发布', ERR.BIZ);

  const err = validate(key, draft.data);
  if (err) throw new BizError('数据校验未通过：' + err, ERR.PARAM);

  /* 组装全量数据：该页面用草稿，其余页面用各自的已发布数据 */
  const pageData = publishedAll();
  pageData[key] = schema.clone(draft.data);
  /*
   * 店铺笔记的「发布时间」= 这一次生成代码的时刻，必须**在写 replica 之前**填进内容里。
   * 原因：真机的笔记详情页要显示发布时间，而 replica.SHOPNOTES[id] 只带内容本身 ——
   * 注册表的时间戳不下发到小程序。写文件那一刻才填的值，才是真机能看到的那个。
   * （放在 writeReplica 之后填就晚了：文件里已经是 0。）
   */
  if (page.shopnote) pageData[key].publishedAt = now();

  /* keepKey：告诉 assemble()「这一篇是本次正在发布的」，别被「生成代码」门挡掉 */
  const res = writeReplica(pageData, key, { keepKey: key });
  const version = recordVersion(state, key, res.ts, note || '发布', pageData);
  delete state.drafts[key];
  saveState(state);

  /*
   * 自定义页 / 店铺笔记：把「已发布数据」回写注册表。
   * 注册表才是这一类页面的数据真源（草稿清掉后全靠它），漏了这一步，
   * 下次发布别的页面时这一页就会被还原成空白页。
   *
   * ⚠️ 笔记必须先于自定义页判断：两者都带 `custom: true`，
   *    先判 custom 会把 note-1 喂给 customPages.setPublished()，
   *    而它只认自定义页的 key，直接抛「页面不存在：note-1」——发布当场失败。
   */
  if (page.shopnote) {
    const id = shopnotes.idOfKey(key);
    if (id) shopnotes.setPublished(id, pageData[key]);
  } else if (page.custom) {
    customPages.setPublished(key, pageData[key]);
  }

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
  if (!v) throw new BizError('版本不存在：' + versionId, ERR.NOT_FOUND, 404);
  const data = schema.clone(v.snapshot[pageKey]);
  if (!data) throw new BizError('该版本快照里没有 ' + pageKey + ' 的数据', ERR.BIZ);

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
 * 标识变了要连带搬家：草稿、版本快照、replica.js 里的 CUSTOM_PAGES 键名，
 * **并把旧标识登记为别名**（写进 replica.CUSTOM_PAGE_ALIASES），
 * 否则已经分享出去的旧链接会直接失效。
 * 少搬一处就会出现「页面还在但内容空了」或「旧 key 的幽灵页还留在小程序里」。
 */
function updateCustomPage(key, patch) {
  // 先判内置页：否则「内置页」会先撞上注册表查不到，报出误导性的「页面不存在」
  const page = schema.get(key);
  if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
  if (!page.custom) throw new BizError('内置页面不支持改名，请直接改代码', ERR.BIZ);

  const res = customPages.update(key, patch || {});
  const newKey = res.page.key;
  const renamed = newKey !== key;

  // 改名前后都扫一遍站内引用：改名前给运营看清单，改名后如实回报还有多少处仍指向旧标识
  // （这些引用并不会失效 —— 别名会让它们跳到新标识，但运营仍应知道它们存在、便于改成新地址）
  const refsBefore = renamed ? referencesOf(key) : [];

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

    /*
     * 重新生成 replica，让 CUSTOM_PAGES / CUSTOM_PAGE_ALIASES 的键名同步
     * （新键的数据从注册表读，不会丢；别名表已在上一步登记）。
     *
     * ⚠️ keepKey 必须传 newKey —— 而且**只在这一页本来就在 replica 里**时才传：
     *    改名之后，新键在 replica.js 里还不存在（文件里仍是旧键），
     *    assemble() 的「已经下发的才写」判据会把它当成「从没发布过的页面」跳过，
     *    结果就是「改个名 = 线上页面凭空消失」。反过来，本来就没发布过的页面改名，
     *    也不能因为这一笔把它塞进产物（那正是 2026-10-15 修掉的那个漏发）。
     */
    const wasLive = !!((readReplica().CUSTOM_PAGES || {})[key]);
    writeReplica(publishedAll(), newKey, { keepKey: wasLive ? newKey : '' });
  }

  return {
    page: customPages.get(newKey),
    renamedFrom: renamed ? key : '',
    // 旧标识已登记为别名，旧链接继续可用；这里把引用清单如实带回给后台
    aliasFrom: renamed ? key : '',
    refs: refsBefore,
    refCount: refsBefore.length,
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
function removeCustomPage(key, opt) {
  // 先判内置页：否则「内置页」会先撞上注册表查不到，报出误导性的「页面不存在」
  const page = schema.get(key);
  if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
  if (!page.custom) throw new BizError('内置页面不可删除', ERR.BIZ);

  /*
   * 删除前必须展示引用清单（报告 11 的验收要求）。
   * 页面被别的页面/底部导航用链接指着时，直接删掉会让那些入口变成空白页，
   * 所以这里先算出来、报给调用方，只有显式 force 才继续。
   */
  const refs = referencesOf(key);
  if (refs.length && !(opt && opt.force)) {
    const e = new BizError(
      `该页面被 ${refs.length} 处引用，删除后这些入口会打不开：\n` +
      refs.map((r) => '· ' + r.label).join('\n') +
      '\n确认要删除请带上 force=1',
      ERR.BIZ
    );
    e.refs = refs;
    e.hasRefs = true;
    throw e;
  }

  const pageData = publishedAll();
  delete pageData[key];
  // 生成文件时就把指向这一页的别名滤掉：注册表要等写成功之后才删（写失败时页面数据不能丢），
  // 不在这里滤的话，replica.js 会永久留下一条指向已删页面的别名。
  const res = writeReplica(pageData, '', { dropAliasOf: key });

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
    removedVersions: before - state.versions.length,
    refs: refs
  };
}

/* ---------------- 店铺笔记（装修台「内容管理 → 店铺笔记」） ---------------- */

/**
 * 新建店铺笔记。
 *
 * 与 createCustomPage 同一套路：**只建后台条目，先不写 replica.js**，
 * 装修完点「生成代码」才下发到小程序（这一步不是上线，见 README）。
 */
function createNote(input) {
  const def = shopnotes.create(input || {});
  const key = shopnotes.pageKeyOf(def.id);
  const page = schema.get(key);
  return {
    /*
     * page 用**页面元信息**而不是注册表记录本身：
     * 注册表记录里没有 custom / shopnote / desc / source 这几个「页面级」标记，
     * 直接回传的话调用方（后台弹层、自检、外部集成）就分不出这是一篇笔记还是普通自定义页。
     * 走 schema.metaOf 与列表页拿到的是同一个投影，不会两处各长一样。
     */
    page: schema.metaOf(page),
    key: key,
    schema: schema.serialize(page),
    published: publishedOf(key)
  };
}

/** 笔记列表（装修台「店铺笔记」模块用；新的排前面） */
function listNotes() {
  return shopnotes.summaries().sort((a, b) => b.id - a.id);
}

/**
 * 笔记配额与体积（后台提示用）。
 *
 * 顺手把几个「会显示给运营看」的长度口径一起带出去（标题 5~40 / 标签 8 / 封面 9）——
 * 后台弹层里要是自己硬编码一遍，改了下限就会出现「前端说 5~40、后端按 3~40 判」的分叉。
 * 真源只有 server/decorate/shopnotes.js 顶上那几个常量。
 */
function noteStats() {
  return Object.assign({}, shopnotes.stats(), {
    belongs: shopnotes.BELONGS,
    titleMin: shopnotes.TITLE_MIN,
    titleMax: shopnotes.TITLE_MAX,
    tagMax: shopnotes.TAG_MAX,
    coverMax: shopnotes.COVER_MAX,
    coverSizeTip: shopnotes.COVER_SIZE_TIP
  });
}

/**
 * 删除笔记。
 *
 * ⚠️ 入参是**页面标识**（`note-<id>`）而不是注册表内部的数字 id ——
 *    与 removeCustomPage(key) 保持同一个口径。装修台手里只有 key（页面列表的每一行都由它索引），
 *    数字 id 是 shopnotes 的内部实现细节，暴露出去就等于把注册表结构写进了接口契约。
 *
 * 顺序与 removeCustomPage 一致，且同样是硬要求：
 * **先让 replica.js 去掉这一条，再删注册表** —— 反过来的话一旦写 replica 失败，
 * 笔记数据就永久找不回来了（注册表已删、草稿与版本快照也没了）。
 * 同时 replica 必须重建，否则已删笔记的数据会留在 SHOPNOTES 里，
 * 小程序端按旧 id 还能打开一个「幽灵笔记」。
 */
function removeNote(key) {
  const id = shopnotes.idOfKey(key);
  if (!id || !shopnotes.has(id)) throw new BizError('笔记不存在：' + key, ERR.NOT_FOUND, 404);

  const pageData = publishedAll();
  delete pageData[key];
  const res = writeReplica(pageData, '');

  const gone = shopnotes.remove(id);

  const state = loadState();
  delete state.drafts[key];
  const before = state.versions.length;
  state.versions = state.versions.filter((v) => v.pageKey !== key);
  saveState(state);

  return {
    key: key,
    id: gone.id,
    title: gone.title,
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
  referencesOf,
  customKeyOfUrl,
  templates,
  customStats,
  createCustomPage,
  updateCustomPage,
  removeCustomPage,
  createNote,
  listNotes,
  noteStats,
  removeNote
};
