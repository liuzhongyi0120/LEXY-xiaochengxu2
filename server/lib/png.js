/**
 * 极简 PNG 编解码（只用 Node 内置 zlib，零三方依赖）
 *
 * ── 为什么服务端要会读图 ────────────────────────────────────────────
 * 底部导航的内置图标（miniprogram/images/tabbar/*.png）颜色是**画死在像素里**的，
 * 而装修台允许运营改「导航图标色」（对标有赞「更多设置 > 导航图标色」）。
 * 一开始的实现是给 <image> 挂 CSS `filter` 做色彩矩阵逼近 —— 在浏览器里逐像素验过
 * （Δmax=2），但**微信小程序的渲染层对 <image> 的 filter 支持不可靠**：
 * 实测开发者工具里选中项图标变成了一个实心 `#080808` 方块
 * ——颜色对了、**alpha 被丢掉**（业界对小程序 filter 的共识也是「不可用」）。
 *
 * 所以染色改到服务端做**像素级处理**：读源图 → 把 RGB 换成目标色、alpha 原样保留 → 输出标准 PNG。
 * 好处是真机 / 装修台预览 / /preview **共用同一份实现**（不必再维护两套等价的求解器），
 * 而且结果可以在本机逐像素断言，不依赖任何渲染引擎的行为。
 *
 * ── 支持范围（够用即止，不追求完整 PNG 规范） ────────────────────────
 *   位深 8、非隔行、颜色类型 0(灰度) / 2(RGB) / 4(灰度+alpha) / 6(RGBA)。
 *   其余情况**明确报错**，不静默给出错图 —— 包内图标是自家生成脚本产出的，
 *   一旦某天产出别的格式，宁可 500 也不要悄悄渲染成花屏。
 */

const zlib = require('node:zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

/** PNG 每个 chunk 都带 CRC32（多项式 0xedb88320，初值/终值取反） */
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 组装一个标准 chunk：长度 + 类型 + 数据 + CRC(类型+数据) */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** 颜色类型 → 每像素字节数（只覆盖 8 位深） */
function channelsOf(colorType) {
  if (colorType === 0) return 1; // 灰度
  if (colorType === 2) return 3; // RGB
  if (colorType === 4) return 2; // 灰度 + alpha
  if (colorType === 6) return 4; // RGBA
  return 0;
}

/** PNG 的 Paeth 预测器 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 解掉逐行过滤器（0 None / 1 Sub / 2 Up / 3 Average / 4 Paeth）。
 * PNG 的每一行都是「过滤器字节 + 一行像素」，x 是**残差**，要按过滤器规则还原。
 */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const o = y * stride;
    const up = o - stride;
    for (let i = 0; i < stride; i++) {
      const x = row[i];
      const a = i >= bpp ? out[o + i - bpp] : 0;
      const b = y > 0 ? out[up + i] : 0;
      const c = (y > 0 && i >= bpp) ? out[up + i - bpp] : 0;
      let v;
      if (ft === 0) v = x;
      else if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) v = x + paeth(a, b, c);
      else throw new Error('不支持的 PNG 行过滤器：' + ft);
      out[o + i] = v & 0xff;
    }
  }
  return out;
}

/**
 * 解码为 8 位 RGBA。
 * @returns {{width:number, height:number, data:Buffer}} data 长度 = width*height*4
 */
function decode(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) {
    throw new Error('不是 PNG 文件');
  }
  let pos = 8;
  let ihdr = null;
  const idats = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    pos += 4;
    const type = buf.toString('ascii', pos, pos + 4);
    pos += 4;
    const data = buf.subarray(pos, pos + len);
    pos += len + 4; // 跳过 CRC（不校验：源图是我们自己的包内资源）
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
  }
  if (!ihdr || ihdr.length < 13) throw new Error('PNG 缺少 IHDR');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (bitDepth !== 8) throw new Error('只支持 8 位深的 PNG，实际 ' + bitDepth);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  const ch = channelsOf(colorType);
  if (!ch) throw new Error('不支持的 PNG 颜色类型：' + colorType);
  if (!idats.length) throw new Error('PNG 没有 IDAT');

  const raw = zlib.inflateSync(Buffer.concat(idats));
  const px = unfilter(raw, width, height, ch);

  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * ch;
    const d = i * 4;
    if (colorType === 6) {
      out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
    } else if (colorType === 2) {
      out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = 255;
    } else if (colorType === 4) {
      out[d] = px[s]; out[d + 1] = px[s]; out[d + 2] = px[s]; out[d + 3] = px[s + 1];
    } else {
      out[d] = px[s]; out[d + 1] = px[s]; out[d + 2] = px[s]; out[d + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/**
 * 编码 8 位 RGBA → PNG。
 * 行过滤器一律用 0（None）：这些图只有 66×66，压缩率够用，
 * 少一层「编码器的预测器写错了但解出来还像是对的」的风险。
 */
function encode(img) {
  const width = img.width;
  const height = img.height;
  const data = img.data;
  if (!width || !height || !data || data.length !== width * height * 4) {
    throw new Error('PNG 编码入参不合法（需要 width*height*4 的 RGBA 数据）');
  }
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 位深
  ihdr[9] = 6;  // 颜色类型：真彩 + alpha
  ihdr[10] = 0; // 压缩方法（只有 0）
  ihdr[11] = 0; // 过滤方法（只有 0）
  ihdr[12] = 0; // 非隔行
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

module.exports = { decode, encode, crc32 };
