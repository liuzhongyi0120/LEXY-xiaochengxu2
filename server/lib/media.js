/**
 * 素材库（图片本地上传）
 *
 * 设计要点：
 *   - 零第三方依赖：multipart/form-data 自己解析（无需 multer），base64 JSON 也支持
 *   - 落盘位置 server/data/uploads/<yyyyMM>/<yyyymmdd>-<rand>.<ext>，
 *     以 `/uploads/...` 相对路径对外暴露（见 index.js 的静态服务）。
 *   - 存相对路径而非绝对 URL 是刻意的：上线换域名时小程序端只改
 *     utils/constants.js 一处，历史数据里的图片地址全部自动跟着换。
 *   - 安全：按文件头魔数校验真实类型（不信 content-type）；仅放行
 *     png / jpg / webp / gif 四种位图，**拒收 SVG**（同源 HTML 里 SVG 可执行脚本 → 存储型 XSS）
 *   - 索引 server/data/uploads/index.json 记录原始文件名 / 尺寸 / 上传时间 / **归属文件夹**，便于素材库检索
 *   - **文件夹是逻辑分类，不是物理目录**：素材仍按 <yyyyMM>/ 落盘，
 *     归类只写索引里的 folder 字段。原因是图片 URL（`/uploads/202610/xxx.png`）已经写进了
 *     replica.js / catalog.json，**挪动物理文件就会让线上图全裂**；逻辑分类才能随便改。
 *     这一点是本模块最重要的约束，改代码前先记住。
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const atomic = require('./atomicFile');
const { BizError, ERR } = require('./http');

/** 素材根目录（与数据同处 server/data，运维时一个目录备份即可） */
const ROOT = nodePath.join(__dirname, '..', 'data', 'uploads');
const INDEX_FILE = nodePath.join(ROOT, 'index.json');

/** 对外访问前缀（与 index.js 的静态服务一致） */
const URL_PREFIX = '/uploads';

/** 单张图片上限 */
const MAX_BYTES = 5 * 1024 * 1024;
/** 请求体上限：多图批量上传时留余量 */
const MAX_BODY = 32 * 1024 * 1024;

/* ----------------------------- 文件夹（逻辑分类） ----------------------------- */

/**
 * 文件夹用**哨兵值**而不是空字符串来表示「未分组」，原因：
 * query 里 `folder=` 与「不传 folder」在有些解析路径下会变成同一个空值，
 * 分不清「筛选未分组」和「不筛选」，于是会出现「点了未分组却显示全部」这种静默错误。
 */
const FOLDER_NONE = '__none__';
/** 文件夹名长度上限（按字符数，中文一个字算一个） */
const FOLDER_MAX = 30;
/** 内置分组名，不允许用作真实文件夹名，避免与界面上的「全部 / 未分组」撞车 */
const RESERVED_FOLDERS = ['全部', '未分组', FOLDER_NONE];

/** 归一并校验文件夹名；空值返回 ''（= 未分组） */
function normFolderName(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (s.length > FOLDER_MAX) throw new BizError('文件夹名太长（最多 ' + FOLDER_MAX + ' 个字，当前 ' + s.length + '）', ERR.PARAM);
  if (s.includes('/') || s.includes('\\') || s.includes('..')) {
    throw new BizError('文件夹名不能包含斜杠或 ..（文件夹是逻辑分类，不产生真实目录）', ERR.PARAM);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) throw new BizError('文件夹名含非法控制字符', ERR.PARAM);
  if (RESERVED_FOLDERS.includes(s)) throw new BizError('「' + s + '」是内置分组名，请换一个', ERR.PARAM);
  return s;
}

/**
 * 放行的图片类型白名单
 *   sniff 用于二次校验：拿文件头魔数比对，防止把 .exe 改名成 .png 传上来
 */
const TYPES = {
  'image/png': { ext: 'png', sniff: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', sniff: (b) => b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  'image/gif': { ext: 'gif', sniff: (b) => b.length > 6 && (b.slice(0, 6).toString('ascii') === 'GIF87a' || b.slice(0, 6).toString('ascii') === 'GIF89a') }
};
const EXT_TO_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/* ----------------------------- 目录与索引 ----------------------------- */

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 读索引，返回 { items, folders }
 *   - 兼容三种历史形态：`{items, folders}` / `{items}`（无 folder 概念时代）/ 裸数组
 *   - **自愈**：素材里出现、但 folders 列表里没有的归属，自动补进列表。
 *     手工改过索引、或从别处拷来素材时，不至于出现「有个文件夹里有图，但左侧列表里看不到」。
 */
function readIndex() {
  let items = [];
  let folders = [];
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      items = json; // 更早的格式：整个文件就是一个数组
    } else if (Array.isArray(json.items)) {
      items = json.items;
      folders = Array.isArray(json.folders) ? json.folders.filter((x) => typeof x === 'string' && x.trim()) : [];
    }
  } catch (e) {
    // 首次运行 / 索引损坏都从空开始，磁盘上的文件仍可被 list 兜底扫到
  }

  const seen = new Set(folders);
  items = items.filter((it) => it && typeof it === 'object' && it.name);
  items.forEach((it) => {
    it.folder = typeof it.folder === 'string' ? it.folder : '';
    if (it.folder && !seen.has(it.folder)) { seen.add(it.folder); folders.push(it.folder); }
  });
  return { items, folders };
}

function writeIndex(idx) {
  ensureDir(ROOT);
  atomic.writeFileAtomic(INDEX_FILE, JSON.stringify(idx, null, 2));
}

/* ----------------------------- 图片探测 ----------------------------- */

/**
 * 从文件头读出真实类型与像素尺寸
 * 支持 PNG / JPEG / GIF / WebP(VP8 / VP8L / VP8X)，读不出尺寸时返回 0（不阻断上传）
 */
function probe(buf) {
  let mime = '';
  for (const k of Object.keys(TYPES)) {
    if (TYPES[k].sniff(buf)) { mime = k; break; }
  }
  if (!mime) return null;

  let w = 0;
  let h = 0;

  if (mime === 'image/png' && buf.length > 24) {
    w = buf.readUInt32BE(16);
    h = buf.readUInt32BE(20);
  } else if (mime === 'image/gif' && buf.length > 10) {
    w = buf.readUInt16LE(6);
    h = buf.readUInt16LE(8);
  } else if (mime === 'image/jpeg') {
    // 遍历段，找 SOFn（0xFFC0-0xFFCF 里除 C4/C8/CC 之外的标记）
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        h = buf.readUInt16BE(i + 5);
        w = buf.readUInt16BE(i + 7);
        break;
      }
      if (marker === 0xda) break; // 进入压缩数据，后面不会再有 SOF
      i += 2 + len;
    }
  } else if (mime === 'image/webp' && buf.length > 30) {
    const fourCC = buf.slice(12, 16).toString('ascii');
    if (fourCC === 'VP8X') {
      w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    } else if (fourCC === 'VP8 ') {
      // 关键帧起始码 9D 01 2A，其后 14 位为宽高
      const off = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
      if (off !== -1 && off + 7 <= buf.length) {
        w = buf.readUInt16LE(off + 3) & 0x3fff;
        h = buf.readUInt16LE(off + 5) & 0x3fff;
      }
    } else if (fourCC === 'VP8L') {
      // 无损：28 位宽高打包在 4 字节里
      const b = buf.slice(21, 25);
      const bits = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
      w = (bits & 0x3fff) + 1;
      h = ((bits >> 14) & 0x3fff) + 1;
    }
  }

  return { mime: mime, ext: TYPES[mime].ext, width: w, height: h };
}

/** 人类可读体积，后台直接展示 */
function humanSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / 1024 / 1024).toFixed(2) + ' MB';
}

/* ----------------------------- 请求体解析 ----------------------------- */

/** 读原始请求体（带大小上限，超限即断流并抛错） */
function readRaw(req, maxBytes) {
  const limit = maxBytes || MAX_BODY;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        req.destroy();
        reject(new BizError('文件过大：单次上传上限 ' + humanSize(limit), ERR.PARAM));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) resolve(Buffer.concat(chunks)); });
    req.on('error', () => { if (!done) { done = true; reject(new BizError('读取上传数据失败', ERR.PARAM)); } });
  });
}

function parsePartHeader(text) {
  const out = { name: '', filename: '' };
  const dispo = /content-disposition:([^\r\n]*)/i.exec(text);
  if (dispo) {
    const n = /name="([^"]*)"/i.exec(dispo[1]);
    const f = /filename="([^"]*)"/i.exec(dispo[1]);
    if (n) out.name = n[1];
    if (f) out.filename = f[1];
  }
  const ct = /content-type:\s*([^\r\n]+)/i.exec(text);
  out.contentType = ct ? ct[1].trim() : '';
  return out;
}

/**
 * 解析 multipart/form-data
 * 用 `\r\n--boundary` 作分隔符，比只用 `--boundary` 更不容易被二进制内容误命中
 */
function parseMultipart(buf, boundary) {
  const head = Buffer.from('--' + boundary + '\r\n');
  if (buf.length < head.length || buf.slice(0, head.length).compare(head) !== 0) return [];

  const delim = Buffer.from('\r\n--' + boundary);
  const parts = [];
  let pos = head.length;

  while (pos < buf.length) {
    const next = buf.indexOf(delim, pos);
    if (next === -1) break;
    const chunk = buf.slice(pos, next);
    const he = chunk.indexOf('\r\n\r\n');
    if (he !== -1) {
      const meta = parsePartHeader(chunk.slice(0, he).toString('utf8'));
      meta.data = chunk.slice(he + 4);
      parts.push(meta);
    }
    const after = next + delim.length;
    if (buf.slice(after, after + 2).toString() === '--') break; // 收尾边界
    pos = after + 2; // 跳过 CRLF
  }
  return parts;
}

/**
 * 从请求里取出待落盘的图片列表
 *   multipart/form-data  → 取所有带 filename 的 part（支持一次选多张）
 *   其他（JSON）        → 取 body.data，支持 dataURL 或裸 base64，单张
 */
async function collect(req) {
  const type = String(req.headers['content-type'] || '');

  if (type.includes('multipart/form-data')) {
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
    const boundary = m ? (m[1] || m[2]).trim() : '';
    if (!boundary) throw new BizError('multipart 缺少 boundary', ERR.PARAM);
    const buf = await readRaw(req);
    const parts = parseMultipart(buf, boundary).filter((p) => p.filename && p.data && p.data.length);
    if (!parts.length) throw new BizError('没有收到文件，请选择图片后再上传', ERR.PARAM);
    return parts.map((p) => ({ data: p.data, orig: p.filename }));
  }

  const buf = await readRaw(req, MAX_BYTES + 1024 * 1024);
  let json;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new BizError('请求体不是合法 JSON，也没有用 multipart 上传', ERR.PARAM);
  }
  let data = String(json.data || json.base64 || '');
  if (!data) throw new BizError('缺少图片数据 data（base64 或 dataURL）', ERR.PARAM);
  const dm = /^data:([^;]+);base64,(.*)$/s.exec(data);
  if (dm) data = dm[2];
  return [{ data: Buffer.from(data, 'base64'), orig: String(json.name || json.filename || '') }];
}

/* ----------------------------- 落盘 / 查询 / 删除 ----------------------------- */

/** 生成不重名的相对名：<yyyyMM>/<yyyymmdd>-<rand>.<ext> */
function makeName(ext) {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return { dir: `${d.getFullYear()}${p(d.getMonth() + 1)}`, base: `${day}-${rand}.${ext}` };
}

/**
 * 保存单张图片（含魔数校验）
 * @param item   {data, orig, rel?, source?}  rel = 指定相对路径（导入工具用，保留可辨识的原文件名）
 * @param folder 归属文件夹（'' = 未分组）
 */
function saveOne(item, folder) {
  const probed = probe(item.data);
  if (!probed) {
    throw new BizError(
      '不支持的图片格式：' + (item.orig || '未命名') +
      '（仅支持 PNG / JPG / WebP / GIF，SVG 因存在安全风险不予接收）',
      ERR.PARAM
    );
  }
  if (item.data.length > MAX_BYTES) {
    throw new BizError('图片过大：' + (item.orig || '未命名') + ' ' + humanSize(item.data.length) + '，上限 ' + humanSize(MAX_BYTES), ERR.PARAM);
  }

  const { dir, base } = makeName(probed.ext);

  // 允许调用方指定相对路径（导入工具需要保留可辨识的原文件名）；
  // 逐段过滤掉 . 与 ..，保证拼出来的绝对路径一定还在 ROOT 之内。
  let rel = dir + '/' + base;
  if (item.rel) {
    const clean = String(item.rel)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .split('/')
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/');
    if (!clean) throw new BizError('指定的素材路径不合法', ERR.PARAM);
    rel = clean;
  }

  const abs = nodePath.join(ROOT, rel);
  ensureDir(nodePath.dirname(abs));
  fs.writeFileSync(abs, item.data);

  return {
    name: rel,
    url: URL_PREFIX + '/' + rel,
    orig: String(item.orig || base).slice(0, 120),
    // source 只在「从外部导入」时写入（原始外链地址），便于日后重新抓取或核对
    source: item.source ? String(item.source).slice(0, 500) : undefined,
    folder: folder || '',
    size: item.data.length,
    sizeText: humanSize(item.data.length),
    width: probed.width,
    height: probed.height,
    mime: probed.mime,
    at: Date.now()
  };
}

/**
 * 上传入口：一次可传多张，返回成功列表与逐条失败原因
 * 单张失败不影响其它（前端可提示「3 张成功、1 张失败：原因」）
 * @param folder 归属文件夹，会按需自动创建
 */
function upload(items, folder) {
  const target = normFolderName(folder);
  const done = [];
  const failed = [];
  items.forEach((it) => {
    try {
      done.push(saveOne(it, target));
    } catch (e) {
      failed.push({ name: it.orig || '未命名', reason: e.message });
    }
  });

  if (done.length) {
    const idx = readIndex();
    idx.items = done.concat(idx.items);
    if (target && idx.folders.indexOf(target) === -1) idx.folders.push(target);
    writeIndex(idx);
  }
  if (!done.length) {
    throw new BizError(failed.length ? failed[0].reason : '上传失败', ERR.PARAM);
  }
  done.forEach((d) => { d.sizeText = humanSize(d.size); });
  return {
    list: done,
    success: done.length,
    failed: failed.length,
    failedList: failed,
    folder: target,
    total: readIndex().items.length
  };
}

/** 读一条索引（找不到返回 null） */
function find(name) {
  return readIndex().items.find((x) => x.name === name) || null;
}

/**
 * 素材库列表
 *   - 索引里有但文件已丢的条目自动剔除（保持索引自愈）
 *   - q 同时匹配原始文件名与相对路径；sort 支持 new（默认）/ old / big / small
 */
function list(opt) {
  opt = opt || {};
  const idx = readIndex();
  const alive = [];
  let dropped = 0;

  idx.items.forEach((it) => {
    const abs = nodePath.join(ROOT, it.name);
    let st = null;
    try { st = fs.statSync(abs); } catch (e) { st = null; }
    if (!st) { dropped += 1; return; }
    alive.push(Object.assign({}, it, { size: st.size, sizeText: humanSize(st.size), mtime: st.mtimeMs }));
  });
  if (dropped) writeIndex(Object.assign({}, idx, { items: alive }));

  let rows = alive;
  const q = String(opt.q || '').trim().toLowerCase();
  if (q) rows = rows.filter((x) => (x.orig || '').toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
  if (opt.type) rows = rows.filter((x) => (x.mime || '') === opt.type);
  // folder 三态：不传 = 全部；FOLDER_NONE = 未分组；其它 = 该文件夹
  if (opt.folder === FOLDER_NONE) rows = rows.filter((x) => !x.folder);
  else if (opt.folder) rows = rows.filter((x) => x.folder === opt.folder);

  const sort = opt.sort || 'new';
  rows = rows.slice().sort((a, b) => {
    if (sort === 'old') return a.at - b.at;
    if (sort === 'big') return b.size - a.size;
    if (sort === 'small') return a.size - b.size;
    return b.at - a.at;
  });

  const page = Math.max(1, Number(opt.page) || 1);
  const size = Math.min(200, Math.max(1, Number(opt.size) || 48));
  const start = (page - 1) * size;
  const slice = rows.slice(start, start + size);

  // 各文件夹计数按「全部素材」统计（不是按当前筛选结果），否则左侧列表会越点越少
  const counts = new Map();
  alive.forEach((x) => { const f = x.folder || ''; counts.set(f, (counts.get(f) || 0) + 1); });
  const folderRows = idx.folders.map((name) => ({ name: name, count: counts.get(name) || 0 }));
  const ungrouped = counts.get('') || 0;

  return {
    list: slice,
    total: rows.length,
    all: alive.length,
    page: page,
    size: size,
    pages: Math.max(1, Math.ceil(rows.length / size)),
    folders: folderRows,
    ungrouped: ungrouped,
    stat: {
      count: alive.length,
      bytes: alive.reduce((s, x) => s + (x.size || 0), 0),
      sizeText: humanSize(alive.reduce((s, x) => s + (x.size || 0), 0)),
      maxBytes: MAX_BYTES,
      maxText: humanSize(MAX_BYTES),
      types: Array.from(new Set(alive.map((x) => x.mime))).filter(Boolean)
    }
  };
}

/**
 * 素材被哪些数据引用
 *
 * 三个引用源缺一不可：
 *   - 已发布 replica.js / 草稿 state.json → 装修页面的图片
 *   - **商品库 catalog.json** → 商品主图、图集、详情长图
 * 曾漏掉商品库：商品图在素材管理里显示「未引用」，运营一点删除就把商品图删没了。
 */
function refs(name) {
  const url = URL_PREFIX + '/' + name;
  const files = [
    { label: '商品库', file: nodePath.join(__dirname, '..', 'data', 'catalog.json') },
    { label: '已发布', file: nodePath.join(__dirname, '..', '..', 'miniprogram', 'config', 'replica.js') },
    { label: '草稿', file: nodePath.join(__dirname, '..', 'data', 'decorate', 'state.json') }
  ];
  const out = [];
  files.forEach((f) => {
    let text = '';
    try { text = fs.readFileSync(f.file, 'utf8'); } catch (e) { return; }
    const n = text.split(url).length - 1;
    if (n) out.push({ where: f.label, count: n });
  });
  return { url: url, total: out.reduce((s, x) => s + x.count, 0), detail: out };
}

/**
 * 删除素材
 *   - 默认先做引用检查：被页面用到时拒绝，除非显式 force
 *   - 只允许删索引内的条目，拦住 '../../server/index.js' 这类路径穿越
 */
function remove(name, force) {
  const n = String(name || '').replace(/^\/?uploads\//, '');
  if (!n || n.includes('..') || n.startsWith('/')) throw new BizError('素材名不合法', ERR.PARAM);

  const idx = readIndex();
  const i = idx.items.findIndex((x) => x.name === n);
  if (i === -1) throw new BizError('素材不存在：' + n, ERR.NOT_FOUND, 404);

  const r = refs(n);
  if (r.total && !force) {
    throw new BizError(
      '该素材正被 ' + r.total + ' 处页面内容引用（' + r.detail.map((d) => d.where + ' ' + d.count + ' 处').join('、') +
      '），删除后前台会显示空白。确认要删可传 force:1',
      ERR.BIZ
    );
  }

  const abs = nodePath.join(ROOT, n);
  let missing = false;
  try {
    /*
     * 走带重试的删除：Windows 上文件会被实时扫描 / 残留句柄瞬时占用（EPERM / EBUSY），
     * 重试几十毫秒即可成功。
     * 曾经这里把任何异常都静默吞掉、照旧返回 deleted:true 并删掉索引 ——
     * 结果是「索引里没了、磁盘上还在」，运营以为图已下架，而 /uploads/... 仍返回 200。
     * 内容下架失效比删除失败严重得多，所以失败必须整体失败、让调用方看到真实原因。
     */
    if (!atomic.unlinkSync(abs)) missing = true;
  } catch (e) {
    throw new BizError('删除文件失败（' + (e.code || e.message) + '）：' + n + '，文件可能正被占用，请稍后重试', ERR.BIZ);
  }
  idx.items.splice(i, 1);
  writeIndex(idx);

  return { name: n, url: URL_PREFIX + '/' + n, deleted: true, fileMissing: missing, refs: r.total, total: idx.items.length };
}

/* ----------------------------- 文件夹操作 ----------------------------- */

/** 文件夹清单：每个文件夹的素材数 + 未分组数量 + 总数 */
function folders() {
  const idx = readIndex();
  const counts = new Map();
  idx.items.forEach((it) => {
    const f = it.folder || '';
    counts.set(f, (counts.get(f) || 0) + 1);
  });
  return {
    folders: idx.folders.map((name) => ({ name: name, count: counts.get(name) || 0 })),
    ungrouped: counts.get('') || 0,
    total: idx.items.length
  };
}

/** 新建文件夹（空文件夹也要能建，所以文件夹是显式列表而非从素材汇总） */
function folderCreate(name) {
  const n = normFolderName(name);
  if (!n) throw new BizError('缺少文件夹名', ERR.PARAM);
  const idx = readIndex();
  if (idx.folders.indexOf(n) > -1) throw new BizError('文件夹已存在：' + n, ERR.BIZ);
  idx.folders.push(n);
  writeIndex(idx);
  const out = folders();
  out.created = n;
  return out;
}

/**
 * 重命名文件夹（连带搬运素材）
 * 改名必须同时改 idx.folders 与每条素材的 folder —— 少改一处就会出现
 * 「文件夹还在、里面空了」或「素材指向一个列表里不存在的文件夹」。
 */
function folderRename(from, to) {
  const f = normFolderName(from);
  const t = normFolderName(to);
  if (!f) throw new BizError('缺少原文件夹名 from', ERR.PARAM);
  if (!t) throw new BizError('缺少新文件夹名 to', ERR.PARAM);
  if (f === t) throw new BizError('新旧文件夹名相同，无需重命名', ERR.PARAM);

  const idx = readIndex();
  const i = idx.folders.indexOf(f);
  if (i === -1) throw new BizError('文件夹不存在：' + from, ERR.NOT_FOUND, 404);
  if (idx.folders.indexOf(t) > -1) throw new BizError('目标文件夹已存在：' + t, ERR.BIZ);

  idx.folders[i] = t;
  let moved = 0;
  idx.items.forEach((it) => { if (it.folder === f) { it.folder = t; moved += 1; } });
  writeIndex(idx);

  const out = folders();
  out.renamed = { from: f, to: t, moved: moved };
  return out;
}

/**
 * 删除文件夹 —— **只删分类，不删素材**：里面的素材回到「未分组」。
 * 素材可能正被页面/商品引用，删掉会直接图裂，所以这里连 force 都不提供。
 */
function folderRemove(name) {
  const f = normFolderName(name);
  if (!f) throw new BizError('缺少文件夹名', ERR.PARAM);

  const idx = readIndex();
  const i = idx.folders.indexOf(f);
  if (i === -1) throw new BizError('文件夹不存在：' + name, ERR.NOT_FOUND, 404);

  idx.folders.splice(i, 1);
  let moved = 0;
  idx.items.forEach((it) => { if (it.folder === f) { it.folder = ''; moved += 1; } });
  writeIndex(idx);

  const out = folders();
  out.removed = f;
  out.movedToUngrouped = moved;
  return out;
}

/**
 * 批量移动素材到文件夹（folder 传空 = 移回未分组；目标不存在则自动创建）
 * 用于「按页面归类」「批量整理」这类操作，比逐张改快，也不会产生中间态。
 */
function move(names, folder) {
  const list = (Array.isArray(names) ? names : [names]).map((x) => String(x || '')).filter(Boolean);
  if (!list.length) throw new BizError('缺少要移动的素材 names', ERR.PARAM);

  const target = normFolderName(folder);
  const idx = readIndex();
  if (target && idx.folders.indexOf(target) === -1) idx.folders.push(target);

  const hit = [];
  const miss = [];
  list.forEach((raw) => {
    const n = raw.replace(/^\/?uploads\//, '');
    const it = idx.items.find((x) => x.name === n);
    if (!it) { miss.push(n); return; }
    it.folder = target;
    hit.push(n);
  });
  writeIndex(idx);

  const out = folders();
  out.moved = hit.length;
  out.missing = miss;
  out.folder = target;
  return out;
}

module.exports = {
  ROOT,
  URL_PREFIX,
  MAX_BYTES,
  MAX_BODY,
  FOLDER_NONE,
  FOLDER_MAX,
  TYPES,
  EXT_TO_MIME,
  ensureDir,
  probe,
  humanSize,
  normFolderName,
  collect,
  upload,
  list,
  find,
  refs,
  remove,
  folders,
  folderCreate,
  folderRename,
  folderRemove,
  move
};
