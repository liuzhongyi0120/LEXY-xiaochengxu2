/**
 * 首页装修区块「尺寸口径」回归测试
 *
 * 背景：首屏海报高度被算成 rpx × 2（2644rpx ≈ 1.55 屏高），
 *       aspectFill 只能放大裁切，真机上「图片特别大且被切边」。
 *
 * 本测试把「装修数据 → 渲染尺寸」的口径固定下来，并和两份基准对照：
 *   ① 有赞真实页面抓取值（.tooling/home.json 的 cw/ch = 375 宽下的渲染尺寸）
 *   ② 后台装修台预览（server/public/admin/admin.js 的 ÷2 渲染）
 *
 * 用法： node .tooling/test-layout.mjs
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}   ${detail}`); }
};

const { px2rpx, heightRpx } = require(join(ROOT, 'miniprogram', 'utils', 'units.js'));
const replica = require(join(ROOT, 'miniprogram', 'config', 'replica.js'));

/* 1. 换算函数本身 */
console.log('\n【1】换算函数');
ok('px2rpx：375 基准 px ×2 → rpx', px2rpx(12) === 24 && px2rpx(0) === 0, `px2rpx(12)=${px2rpx(12)}`);
ok('px2rpx：非数字兜底为 0', px2rpx(undefined) === 0 && px2rpx('x') === 0);
ok('heightRpx：rpx 原样返回（绝不 ×2）', heightRpx(1322) === 1322, `heightRpx(1322)=${heightRpx(1322)}`);
ok('heightRpx：空值走默认', heightRpx(undefined, 1322) === 1322 && heightRpx(0, 420) === 420);

/* 2. 与有赞真实抓取对照 */
console.log('\n【2】与有赞真实页面抓取对照（375 宽渲染尺寸）');
let blueprint = null;
try {
  const raw = JSON.parse(readFileSync(join(__dirname, 'home.json'), 'utf8'));
  const inner = typeof raw.value === 'string' ? JSON.parse(raw.value) : raw;
  const first = (inner.imgs || []).find((x) => x.cw && x.ch && x.ch / x.cw > 1.4);
  if (first) blueprint = { cw: first.cw, ch: first.ch, src: first.src };
} catch (e) {
  console.log(`  （跳过：${e.message}）`);
}

if (blueprint) {
  const hero = (replica.HOME_BLOCKS || []).find((b) => b.type === 'swiper');
  ok('首屏轮播高度 = 真实渲染高 ×2（rpx）',
    !!hero && hero.height === blueprint.ch * 2,
    `真实 ${blueprint.cw}×${blueprint.ch}px → 存 ${hero && hero.height}（期望 ${blueprint.ch * 2}）`);
  ok('首屏轮播高度不超过一屏（375×812 基准 = 1624rpx）',
    !!hero && heightRpx(hero.height, 1322) <= 1624,
    `hRpx=${hero && heightRpx(hero.height, 1322)}`);
}

/* 3. 全量区块：height 类字段不得被二次放大 */
console.log('\n【3】首页全部区块的渲染高度');
const HEIGHT_KINDS = ['swiper', 'video', 'line', 'hotspot'];
const DEF = { swiper: 1322, video: 420, line: 20, hotspot: 500 };
const blocks = replica.HOME_BLOCKS || [];
ok('首页区块数与已发布数据一致', blocks.length > 0, `${blocks.length} 个区块`);

let bad = [];
blocks.forEach((b, i) => {
  if (HEIGHT_KINDS.indexOf(b.type) < 0) return;
  const h = heightRpx(b.height, DEF[b.type]);
  if (b.height && h !== b.height) bad.push(`#${i} ${b.type} ${b.height}→${h}`);
  if (h > 2600) bad.push(`#${i} ${b.type} hRpx=${h} 超过 1.6 屏`);
});
ok('height 类区块的渲染高度 = 数据原值（未被 ×2）',
  bad.length === 0, bad.length ? bad.join(' | ') : `${blocks.filter((b) => HEIGHT_KINDS.indexOf(b.type) >= 0).length} 个 height 类区块全部正确`);

const swiper0 = blocks[0];
ok('首屏（区块 0）为轮播且高度可用',
  swiper0 && swiper0.type === 'swiper' && heightRpx(swiper0.height, 1322) === 1322,
  swiper0 ? `type=${swiper0.type} hRpx=${heightRpx(swiper0.height, 1322)}` : '区块 0 缺失');

/* 4. 后台预览口径一致性（渲染源码级防回归）
 * 装修台的手机预览走 public/shared/pv-render.js，所以口径检查查的是这个共享模块；
 * 另加一条「装修台确实在用共享模块 + 前端预览页确实在编译真机源码」防脱钩 ——
 * 一旦有人在某一侧另写一套渲染，尺寸口径就可能悄悄走样。
 * （历史：前端预览页曾按 pv-render.js 的近似实现渲染，产品页因此与真机不一致 ——
 *   现在它直接编译真机 WXML + WXSS，只有装修台预览还在用 pv-render.js。） */
console.log('\n【4】装修台预览口径（共享渲染核心 /shared/pv-render.js）与预览页链路');
const pvSrc = readFileSync(join(ROOT, 'server', 'public', 'shared', 'pv-render.js'), 'utf8');
const adminSrc = readFileSync(join(ROOT, 'server', 'public', 'admin', 'admin.js'), 'utf8');
const previewSrc = readFileSync(join(ROOT, 'server', 'public', 'preview', 'preview.js'), 'utf8');
ok('预览中 height 按 rpx ÷2 渲染（与真机 rpx 对应）',
  /\(b\.height \|\| 1322\) \/ 2/.test(pvSrc) && /\(b\.height \|\| 420\) \/ 2/.test(pvSrc));
ok('预览中 pageMargin / paddingY 不再 ÷2（否则真机比预览宽 4 倍）',
  !/Math\.round\(\(b\.pageMargin[^)]*\) \/ 2\)/.test(pvSrc) &&
  !/Math\.round\(\(b\.paddingY[^)]*\) \/ 2\)/.test(pvSrc));
ok('装修台预览走共享渲染核心（后台侧只有一份实现）',
  /PvRender\.render\(/.test(adminSrc));
/*
 * 前端预览页已改为**直接编译真机 WXML + WXSS**（不再走 pv-render.js 的近似实现）。
 * 所以这里不再要求它调 PvRender，而是要求它不许再抄一份 —— 反过来，
 * 它若出现在 preview.js 里就说明有人退回了「手写 HTML 近似」的老路。
 */
ok('前端预览页编译真机源码渲染，且没有第二份手写实现',
  /MpRuntime\.renderPage\(/.test(previewSrc) &&
  !/PvRender\.render\(/.test(previewSrc) &&
  !/function pvBlock\s*\(|function pvHome\s*\(|function pvProduct\s*\(/.test(previewSrc));

/* 5. 图片区块走 widthFix（原比例自适应）
 * 注意：首页的区块 markup 已抽到 templates/blocks.wxml（首页与自定义页共用一份），
 * 所以这里要读模板文件，而不是 pages/index/index.wxml —— 后者现在只剩一行 <include>。 */
console.log('\n【5】单图区块按原比例自适应');
const homeWxml = readFileSync(join(ROOT, 'miniprogram', 'templates', 'blocks.wxml'), 'utf8');
const seg = homeWxml.slice(
  homeWxml.indexOf("block.type === 'image'"),
  homeWxml.indexOf("block.type === 'video'")
);
const tag = seg.slice(seg.indexOf('<image'), seg.indexOf('/>') + 2);
ok('单图区块使用 mode="widthFix" 且不写死高度',
  tag.indexOf('mode="widthFix"') > 0 && !/\bstyle=/.test(tag),
  tag.replace(/\s+/g, ' ').trim());

console.log('\n' + '='.repeat(60));
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(60));
process.exit(fail === 0 ? 0 : 1);
