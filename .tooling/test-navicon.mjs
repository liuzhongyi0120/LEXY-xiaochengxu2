/**
 * 服务端图标染色（/navicon/）· 本机回归入口
 *
 * ── 为什么必须有这个脚本 ────────────────────────────────────────────
 * 染色从「客户端 CSS filter 逼近」改成「服务端像素级处理」之后，
 * `server/lib/png.js`（自己写的 PNG 编解码器）成了**唯一能被信任的产图路径**。
 * 自己写的解码器最怕两件事：① 解出来的像素与真库不一致（过滤器/颜色类型猜错）；
 * ② 编码回去的图别人认不出。这两件事自检覆盖不到 —— `check-all` 只抽查 2 组
 * 「图标 × 色值」，不验 **10 张全量**，也不验 **encode→decode 往回走一遍**。
 *
 * ── 它验什么 ───────────────────────────────────────────────────────
 *   ① **解码正确性**：10 张包内图标全部解码，导出 `decoded.json` 供 PIL 独立比对
 *      （本机 + 第三方库两条独立证据 → 才敢说解码器没错）。
 *   ② **编码 round-trip**：`decode(encode(img))` 与原图**逐字节相同**
 *      （行过滤器丢失 / CRC 写错 / 通道顺序搞反都会在这里暴露）。
 *   ③ **染色保真度**：10 图标 × 5 色 = 50 张，逐像素自证
 *      **RGB 全等目标色 && alpha 与源图逐字节相同**；
 *      并打印 alpha 取值种类（远多于 {0,255} 才说明**抗锯齿被保留**，没被二值化）。
 *
 * 可重复运行（会重写 .tooling/_cmp/navicon/ 并打印结论）；失败时退出码非 0。
 * 姊妹入口：`check-all.mjs` 第 15.11 节 F 组（走**真服务**，含安全边界）、
 * `.tooling/test-tabbar.mjs` [8] 组（**客户端地址口径**）。
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const png = require(path.join(ROOT, 'server', 'lib', 'png.js'));
const navicon = require(path.join(ROOT, 'server', 'lib', 'navicon.js'));

const OUT = path.join(ROOT, '.tooling', '_cmp', 'navicon');
fs.mkdirSync(OUT, { recursive: true });

const names = navicon.available();
const colors = ['c8102e', '2b6cb0', '0f9d58', '080808', 'f5c518'];

/* ① 解码（导出 RGBA 摘要给 Python 逐像素比）+ ② 编码 round-trip */
const dump = {};
for (const n of names) {
  const file = path.join(ROOT, 'miniprogram', 'images', 'tabbar', n);
  const img = png.decode(fs.readFileSync(file));
  const sum = { w: img.width, h: img.height, a: [], rgb: [] };
  for (let i = 0; i < img.data.length; i += 4) {
    sum.a.push(img.data[i + 3]);
    sum.rgb.push(img.data[i], img.data[i + 1], img.data[i + 2]);
  }
  dump[n] = sum;
  /* ③ 编码 round-trip：再解一次，逐字节必须一模一样 */
  const rt = png.decode(png.encode(img));
  const same = rt.width === img.width && rt.height === img.height &&
    Buffer.compare(rt.data, img.data) === 0;
  console.log(`${n.padEnd(20)} ${img.width}x${img.height}  round-trip=${same ? 'OK' : 'FAIL'}`);
  if (!same) process.exitCode = 1;
}
fs.writeFileSync(path.join(OUT, 'decoded.json'), JSON.stringify(dump));

/* ③ 染色图落盘 + 保真度自证 */
let bad = 0;
for (const n of names) {
  const src = png.decode(fs.readFileSync(path.join(ROOT, 'miniprogram', 'images', 'tabbar', n)));
  for (const c of colors) {
    const { buf } = navicon.tinted(n, c);
    const file = path.join(OUT, `${n.replace('.png', '')}@${c}.png`);
    fs.writeFileSync(file, buf);

    const got = png.decode(buf);
    const want = [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    let colorOk = true; let alphaOk = true; let alphaDistinct = new Set();
    for (let i = 0; i < got.data.length; i += 4) {
      if (got.data[i] !== want[0] || got.data[i + 1] !== want[1] || got.data[i + 2] !== want[2]) colorOk = false;
      if (got.data[i + 3] !== src.data[i + 3]) alphaOk = false;
      alphaDistinct.add(src.data[i + 3]);
    }
    if (!colorOk || !alphaOk) {
      bad++;
      console.log(`FAIL ${n}@${c} color=${colorOk} alpha=${alphaOk}`);
    }
    if (c === colors[0]) {
      console.log(`  ${n.padEnd(20)} alpha 取值种类=${alphaDistinct.size}（说明抗锯齿被保留，不是非 0 即 255）`);
    }
  }
}
console.log(`\n染色自证：${names.length * colors.length} 张，失败 ${bad}`);
if (bad) process.exitCode = 1;
console.log('输出目录：', path.relative(ROOT, OUT));
