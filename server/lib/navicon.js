/**
 * 底部导航图标 · 服务端染色
 *
 * 读包内图标（miniprogram/images/tabbar/*.png）→ 把像素 RGB 换成目标色、
 * **alpha 原样保留** → 输出一张标准 PNG。装修台「导航图标色」改完，真机上的图标就跟着变。
 *
 * ── 为什么是「换 RGB、留 alpha」这么简单 ─────────────────────────────
 * 这 10 张图是**单色描边图标**：不透明像素的 RGB 精确等于源色，
 * 半透明（抗锯齿）像素的 RGB 也是同一个源色、只是 alpha 低（实测 ±2 量化误差）。
 * 所以直接把 RGB 换成目标色就能得到边缘依然平滑的染色图 ——
 * 不需要任何色彩矩阵逼近，也就没有「逼近出偏差」这回事。
 *
 * ── 为什么不做「默认色也走一遍」 ─────────────────────────────────────
 * 目标色 == 源色时调用方**根本不会请求这里**（见 miniprogram/utils/navcolor.js）：
 * 默认配色下真机读的仍是包内那 10 张，零网络请求、零变化。
 * 只有运营真的改了色，图标才变成一条网络请求（和自传图标的待遇一致）。
 *
 * ── 缓存 ───────────────────────────────────────────────────────────
 *   · 源图：按文件名缓存在内存（进程启动时 10 张，几十 KB）
 *   · 结果：key = 文件名 + 目标色，带**源文件 mtime/size 指纹**
 *     —— 开发期换了源图能立刻看到新结果，不会拿到上一次的缓存图。
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const png = require('./png');

/** 源图目录（与 /images 只读路由读的是同一份文件，也就是小程序包内那一份） */
const ICON_DIR = nodePath.join(__dirname, '..', '..', 'miniprogram', 'images', 'tabbar');

/** 文件名白名单：小写字母/数字/连字符 + .png。既挡目录穿越，也挡读取任意文件 */
const NAME_RE = /^[a-z0-9][a-z0-9-]*\.png$/;
/** 目标色只认 6 位十六进制（不带 #），与装修台 color 字段同口径 */
const HEX_RE = /^[0-9a-f]{6}$/;

/** 结果缓存的容量上限（66×66 的 PNG 约 2~4 KB，128 条 ≪ 1 MB） */
const CACHE_MAX = 128;

const srcCache = new Map();   // name → { img, stamp }
const outCache = new Map();   // `${name}@${hex}` → { buf, stamp }

function statOf(file) {
  const st = fs.statSync(file);
  return st.size + ':' + Math.round(st.mtimeMs);
}

/** 读并解码一张源图（带 mtime 指纹，源图变了自动重读） */
function loadSource(name) {
  if (!NAME_RE.test(name)) throw new Error('图标名不合法：' + name);
  const file = nodePath.join(ICON_DIR, name);
  const stamp = statOf(file);
  const hit = srcCache.get(name);
  if (hit && hit.stamp === stamp) return hit.img;
  const img = png.decode(fs.readFileSync(file));
  srcCache.set(name, { img, stamp });
  return img;
}

/**
 * 染色：RGB 全部换成目标色，alpha 逐个保留。
 * 完全透明的像素也一并写上目标色 —— 无所谓（alpha=0），
 * 但写一致能让「输出的 RGB 通道只有一种值」成为一条好断言的判据。
 */
function recolor(img, rgb) {
  const src = img.data;
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = rgb[0];
    out[i + 1] = rgb[1];
    out[i + 2] = rgb[2];
    out[i + 3] = src[i + 3];
  }
  return { width: img.width, height: img.height, data: out };
}

/** '#RRGGBB' / 'RRGGBB' → [r, g, b]；不合法返回 null */
function parseHex(hex) {
  const h = String(hex == null ? '' : hex).trim().replace(/^#/, '').toLowerCase();
  if (!HEX_RE.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * 取一张染色后的图标。
 * @param {string} name 源图文件名，如 'home.png' / 'news-active.png'
 * @param {string} hex  目标色，'RRGGBB'（可带 #）
 * @returns {{buf:Buffer, etag:string}}
 * @throws 源图不存在 / 名字或颜色不合法时抛错（由调用方转成 4xx，不要静默给空图）
 */
function tinted(name, hex) {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error('颜色不合法：' + hex);
  const color = String(hex).trim().replace(/^#/, '').toLowerCase();
  const img = loadSource(name);
  const stamp = srcCache.get(name).stamp;
  const key = name + '@' + color;
  const hit = outCache.get(key);
  if (hit && hit.stamp === stamp) return { buf: hit.buf, etag: hit.etag };

  const buf = png.encode(recolor(img, rgb));
  const etag = '"' + name + '-' + color + '-' + png.crc32(Buffer.from(stamp)).toString(16) + '"';
  if (outCache.size >= CACHE_MAX) outCache.delete(outCache.keys().next().value);
  outCache.set(key, { buf, stamp, etag });
  return { buf, etag };
}

/** 目录里真实存在的图标名（自检/文档用；也说明「白名单 = 包内真的有的那些」） */
function available() {
  return fs.readdirSync(ICON_DIR).filter((f) => NAME_RE.test(f)).sort();
}

module.exports = { tinted, parseHex, available, ICON_DIR, NAME_RE, HEX_RE };
