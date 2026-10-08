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
 *   - 索引 server/data/uploads/index.json 记录原始文件名 / 尺寸 / 上传时间，便于素材库检索
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

function readIndex() {
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    const json = JSON.parse(raw);
    return Array.isArray(json.items) ? json : { items: [] };
  } catch (e) {
    return { items: [] }; // 首次运行 / 索引损坏都从空开始，磁盘上的文件仍可被 list 兜底扫到
  }
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

/** 保存单张图片（含魔数校验） */
function saveOne(item) {
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
  const absDir = nodePath.join(ROOT, dir);
  ensureDir(absDir);
  fs.writeFileSync(nodePath.join(absDir, base), item.data);

  const rel = dir + '/' + base;
  return {
    name: rel,
    url: URL_PREFIX + '/' + rel,
    orig: String(item.orig || base).slice(0, 120),
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
 */
function upload(items) {
  const done = [];
  const failed = [];
  items.forEach((it) => {
    try {
      done.push(saveOne(it));
    } catch (e) {
      failed.push({ name: it.orig || '未命名', reason: e.message });
    }
  });

  if (done.length) {
    const idx = readIndex();
    idx.items = done.concat(idx.items);
    writeIndex(idx);
  }
  if (!done.length) {
    throw new BizError(failed.length ? failed[0].reason : '上传失败', ERR.PARAM);
  }
  done.forEach((d) => { d.sizeText = humanSize(d.size); });
  return { list: done, success: done.length, failed: failed.length, failedList: failed, total: readIndex().items.length };
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

  return {
    list: slice,
    total: rows.length,
    all: alive.length,
    page: page,
    size: size,
    pages: Math.max(1, Math.ceil(rows.length / size)),
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

module.exports = {
  ROOT,
  URL_PREFIX,
  MAX_BYTES,
  MAX_BODY,
  TYPES,
  EXT_TO_MIME,
  ensureDir,
  probe,
  humanSize,
  collect,
  upload,
  list,
  find,
  refs,
  remove
};
