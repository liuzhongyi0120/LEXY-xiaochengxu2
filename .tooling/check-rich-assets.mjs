/**
 * 富文本正文图片地址补全 —— **真机侧**判别力验证
 *
 * 用法：node .tooling/check-rich-assets.mjs
 *
 * ⚠️ 为什么这个 bug 必须单独有一个脚本守着：
 *   它**在预览链路里不可能被发现** —— `/preview`（shared/mp-wxml.js 的 richSafe）与装修台
 *   （shared/pv-render.js 的 pvRich）都跑在**网页**里，`/uploads/x` 会基于网页 origin 自然解析、
 *   天然可显示；而真机的 `<rich-text>` 把 `/` 开头的路径当**包内路径** → 图片根本不发请求，直接破图。
 *   ⇒ 判据只能落在「小程序侧 sanitizeRich 的**输出字符串**」上；落在预览/网关上都是假绿。
 *     （2026-10-16 实测：34 篇笔记 / 421 张图 100% 是裸 `/uploads/…`，真机全军覆没，
 *      而后台预览里一切正常 —— 典型的「验证的层不对」。）
 *
 * 本脚本不用 wx：`detectEnv()` 在 Node 下落到哨兵 'server'，
 * 所以 BASE 会是 `https://mall.lexy.cn/mall-api`（真机同档），断言与它比即可。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const replica = require('../miniprogram/config/replica.js');
const blocksMod = require('../miniprogram/utils/blocks.js');
const constants = require('../miniprogram/utils/constants.js');

const BASE = constants.baseUrlNow();
/** 裸相对路径判据：`<img>` 的 src 直接以 /uploads/ 开头（= 真机必然破图的形态） */
const NAKED = /<img\b[^>]*?\ssrc\s*=\s*["']?(\/uploads\/)/i;

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; bad.push(name); console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/* ── 0. 检测器自身的判别力（恒真的断言等于没有断言）────────────────────────
 * 先证明 NAKED 真的认得出「裸相对路径」，否则后面所有「没抓到」的结论都是假绿。 */
console.log('\n[0] 检测器自检（防止「抓不到」其实是正则写坏）');
ok('NAKED 能认出裸相对路径', NAKED.test('<img src="/uploads/a.png">'));
ok('NAKED 不误报已补全的地址', !NAKED.test('<img src="' + BASE + '/uploads/a.png">'));

/* ── 1. 合成用例：引号形态 / 外链 / 非 uploads 路径 ─────────────────────── */
console.log('\n[1] 合成用例');
const cases = [
  ['双引号',        '<img src="/uploads/a.png">',                      BASE + '/uploads/a.png'],
  ['单引号',        "<img src='/uploads/b.png'>",                      BASE + '/uploads/b.png'],
  ['无引号',        '<img src=/uploads/c.png>',                        BASE + '/uploads/c.png'],
  ['带其它属性',    '<img class="x" src="/uploads/d.jpg" alt="图">',   BASE + '/uploads/d.jpg'],
  ['http 外链不动', '<img src="https://other.com/e.png">',             'https://other.com/e.png'],
  ['站内路径不动',  '<img src="/pages/index/index">',                  '/pages/index/index']
];
for (const [name, input, expect] of cases) {
  const out = blocksMod.sanitizeRich(input);
  ok(name, out.indexOf('"' + expect + '"') >= 0 || out.indexOf(expect) >= 0, out.slice(0, 90));
}

/* ── 1b. 图片尺寸约束（与装修台 .pv-rich img 同口径）────────────────────
 * 小程序 rich-text 不接受外部样式选择器，`.cr-body img` 这类 wxss 打不进 nodes 内部，
 * 所以 max-width/display 必须写进 img 自己的 style —— 否则 1080px 宽的大图溢出、且挤成一行。 */
console.log('\n[1b] 图片尺寸约束');
const fit1 = blocksMod.sanitizeRich('<img src="/uploads/a.png">');
ok('无 style 的 img 补上 max-width:100%', /max-width\s*:\s*100%/i.test(fit1), fit1.slice(0, 100));
ok('无 style 的 img 补上 display:block', /display\s*:\s*block/i.test(fit1), fit1.slice(0, 100));
const fit2 = blocksMod.sanitizeRich('<img src="/uploads/a.png" style="max-width:60%">');
ok('节点自己写的 max-width 被尊重（不被覆盖、不重复）',
  /max-width:60%/.test(fit2) && (fit2.match(/max-width/gi) || []).length === 1, fit2.slice(0, 120));
ok('补尺寸时不动原有 style 的其它声明',
  /border:1px solid red/.test(blocksMod.sanitizeRich('<img src="/uploads/a.png" style="border:1px solid red">')));

/* ── 2. 真实数据全量：笔记正文 + 所有页面的富文本区块 ────────────────────── */
console.log('\n[2] 真实数据全量（笔记正文 + 装修区块）');

/** 递归收集 { html, where } —— 富文本可能藏在任意页面的任意区块里 */
function collect(node, where, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((x, i) => collect(x, where + '[' + i + ']', out)); return; }
  if (typeof node.html === 'string' && /<img\b/i.test(node.html)) out.push({ html: node.html, where });
  for (const k of Object.keys(node)) {
    if (k === 'html') continue;
    collect(node[k], where + '.' + k, out);
  }
}

const sources = [];
const notes = replica.SHOPNOTES || {};
for (const k of Object.keys(notes)) {
  const h = notes[k] && notes[k].body && notes[k].body.html;
  if (typeof h === 'string' && h) sources.push({ html: h, where: 'SHOPNOTES[' + k + '].body' });
}
/* 除笔记外的整份 replica（首页 / 各内置页 / 自定义页的 rich_text 区块） */
for (const k of Object.keys(replica)) {
  if (k === 'SHOPNOTES') continue;
  collect(replica[k], k, sources);
}

let imgTotal = 0, nakedAfter = [], unfit = [];
for (const s of sources) {
  const before = (s.html.match(/<img\b[^>]*>/gi) || []).length;
  imgTotal += before;
  const out = blocksMod.sanitizeRich(s.html);
  if (out.match(NAKED)) nakedAfter.push(s.where);
  /* 每张图都得有尺寸约束（否则溢出 / 挤成一行） */
  const tags = out.match(/<img\b[^>]*>/gi) || [];
  if (tags.some((t) => !/max-width\s*:/i.test(t) || !/display\s*:\s*block/i.test(t))) unfit.push(s.where);
}
console.log('  扫描富文本块 ' + sources.length + ' 处、共 ' + imgTotal + ' 个 <img>');
ok('渲染后**零**裸 /uploads/ 相对路径', nakedAfter.length === 0,
  nakedAfter.length ? nakedAfter.slice(0, 5).join(' , ') + (nakedAfter.length > 5 ? ' …(+' + (nakedAfter.length - 5) + ')' : '') : '');
ok('渲染后**每张**图都有 max-width + display:block', unfit.length === 0,
  unfit.length ? unfit.slice(0, 5).join(' , ') + (unfit.length > 5 ? ' …(+' + (unfit.length - 5) + ')' : '') : '');

/* 反向：确认这批数据**确实**有 /uploads/，否则「零裸路径」可能是因为压根没图（恒真） */
const hasUploads = sources.filter((s) => /\/uploads\//.test(s.html)).length;
ok('数据里确实有 /uploads/ 引用（防空表恒真）', hasUploads > 0, '含引用块数=' + hasUploads);

console.log('\n' + (fail === 0 ? '✅ 全绿' : '❌ 有失败') + '：' + pass + ' 通过 / ' + fail + ' 失败' +
  '（BASE=' + BASE + '）');
process.exit(fail === 0 ? 0 : 1);
