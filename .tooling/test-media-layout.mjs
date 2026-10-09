/**
 * 素材卡片「真实排版」回归测试（用真 Chrome 量像素，不是 jsdom）
 *
 * 为什么非要有这么一条：
 *   jsdom 不做布局，getBoundingClientRect() 全是 0 —— 所以 test-media-ui.mjs 里
 *   78 条断言全绿，也照样漏掉了「缩略图被 42px 的 .thumb 通用样式命中、
 *   整片网格缩成一枚枚小图」这种**只有真实排版才看得见**的事故。
 *   凡是「尺寸 / 位置 / 溢出」类的结论，必须到真浏览器里量。
 *
 * 前提：本机后端在跑（默认 http://127.0.0.1:3000），素材库里至少有 1 张图。
 *
 * 报告 08 之后控制台要求管理员身份：脚本自己换一个会话并通过 --token 注入，
 * 否则截到的只是登录遮罩，量出来的「排版」全是登录框的排版。
 *
 * 用法：node .tooling/test-media-layout.mjs [baseUrl] [--w 1440] [--h 1200]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN_HELPER = await import('./_admin.mjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const SHOT = join(HERE, 'ui-shot.mjs');

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const BASE = positional[0] || 'http://127.0.0.1:3000';
const optW = argv.includes('--w') ? argv[argv.indexOf('--w') + 1] : '1440';
const optH = argv.includes('--h') ? argv[argv.indexOf('--h') + 1] : '1200';

let pass = 0;
let fail = 0;
const ok = (cond, title, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + title); }
  else { fail++; console.log('  ✗ ' + title + (extra ? '\n      → ' + extra : '')); }
};

/* 在页面里跑的探针：只返回 JSON，断言放在 Node 侧（页面里 throw 只会得到一句
 * 难读的 EVALERR，看不出是哪条不达标）。 */
const PROBE = `
/* 取「第一张图片卡」而不是「第一张卡」：素材库按时间倒序，
 * 而自检/测试上传的夹具视频常常排在最前面，取第一张会拿到 <video> 卡（没有 <img>），
 * 于是「缩略图加载出来了」类断言会莫名其妙变红 —— 量版式不该被素材内容左右。 */
const card = document.querySelector('.media-grid .media-it[data-kind="image"]');
/* 不登录就会停在登录遮罩上 —— 这时「找不到卡片」不是素材库空了，而是量错了页面。
 * 分开报出来，避免排查时被误导。 */
const loginShown = !!document.querySelector('.login-mask');
if (!card) return JSON.stringify({
  error: loginShown ? '页面停在管理员登录层上（管理员令牌没注入成功）' : '页面上没有 .media-it 卡片（素材库是空的？）',
  loginShown
});
const R = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
const mt = card.querySelector('.mt');
const img = card.querySelector('.mt img');
const inf = card.querySelector('.inf');
const nm = card.querySelector('.nm');
const meta = card.querySelector('.meta');
const ft = card.querySelector('.ft');
const btns = [...ft.querySelectorAll('button')];
const grid = document.querySelector('.media-grid');
const allCards = [...grid.querySelectorAll('.media-it')];
return JSON.stringify({
  base: location.href,
  cards: allCards.length,
  grid: R(grid),
  gridCols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
  card: R(card),
  mt: mt ? R(mt) : null,
  img: img ? { ...R(img), nat: img.naturalWidth + 'x' + img.naturalHeight, loaded: img.complete && img.naturalWidth > 0 } : null,
  inf: inf ? R(inf) : null,
  nm: nm ? R(nm) : null,
  meta: meta ? { ...R(meta), text: meta.textContent } : null,
  ft: ft ? R(ft) : null,
  ops: btns.map((b) => ({ act: b.getAttribute('data-copy') ? 'copy' : b.getAttribute('data-down') ? 'down' : 'del',
                          hasSvg: !!b.querySelector('svg'), text: b.textContent.trim(), ...R(b) })),
  /* 每张卡片的缩略图宽度：用来抓「个别图没加载 → 塌掉」 */
  widths: allCards.map((c) => { const m = c.querySelector('.mt'); const i = c.querySelector('.mt img'); return { card: +c.getBoundingClientRect().width.toFixed(1), mt: m ? +m.getBoundingClientRect().width.toFixed(1) : 0, img: i ? +i.getBoundingClientRect().width.toFixed(1) : 0 }; }),
  /* 相邻卡片是否重叠（网格塌陷时会出现） */
  overlap: (() => { for (let i = 1; i < allCards.length; i++) { const a = allCards[i - 1].getBoundingClientRect(); const b = allCards[i].getBoundingClientRect(); if (Math.abs(a.y - b.y) < 2 && b.x < a.right - 1) return true; } return false; })()
});
`;

console.log('# 素材卡片真实排版回归（真 Chrome 量像素）');
console.log('  base: ' + BASE + '  视口: ' + optW + 'x' + optH + '\n');

if (!existsSync(SHOT)) {
  console.error('找不到 ' + SHOT);
  process.exit(2);
}

const out = join(HERE, 'shots', 'media-layout.png');

/* 先换管理员会话（报告 08：控制台点位都要管理员身份）。换不到就停 —— 
 * 否则下面会「顺利」量到登录框的版式并给出误导性的结论。 */
let ADMIN = '';
try {
  ADMIN = await ADMIN_HELPER.adminToken(BASE);
} catch (e) {
  console.error('拿不到管理员会话，无法量素材库排版（' + e.message + '）');
  process.exit(2);
}

const args = [SHOT, BASE + '/console#media', out, '--w', String(optW), '--h', String(optH), '--wait', '1800', '--token', ADMIN, '--evalstr', PROBE];
const child = spawn(NODE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
child.stdout.on('data', (d) => { stdout += d; });
child.stderr.on('data', (d) => { stderr += d; });
const code = await new Promise((r) => child.on('close', r));

const m = stdout.match(/^EVAL: (.*)$/m);
if (!m) {
  console.error('探针没有返回数据（退出码 ' + code + '）');
  console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  process.exit(1);
}
let d;
try { d = JSON.parse(JSON.parse(m[1])); } catch (e) { console.error('探针返回值解析失败: ' + m[1]); process.exit(1); }
if (d.error) { console.error('✗ ' + d.error); console.error('（先启动本机后端 node server/index.js，并确保素材库里有图片）'); process.exit(1); }

console.log('  实测：卡片 ' + d.cards + ' 张 · 栅格 ' + d.gridCols + ' 列 · 卡片 ' + d.card.w + '×' + d.card.h +
  ' · 缩略图区 ' + (d.mt ? d.mt.w + '×' + d.mt.h : '—') + ' · img ' + (d.img ? d.img.w + '×' + d.img.h + '（原图 ' + d.img.nat + '）' : '—') + '\n');

/* 1. 缩略图区必须是「卡片宽度级的正方形」—— 这是 42px 那次事故的直接指标 */
ok(!!d.mt, '卡片里有缩略图区 .mt');
ok(d.mt && d.mt.w > 120, '缩略图区宽度 > 120px（不能被 42px 的表格小方图样式命中）', '实测 ' + (d.mt && d.mt.w));
ok(d.mt && Math.abs(d.mt.w - d.mt.h) < 3, '缩略图区是正方形（图/视频同形状，网格才齐）', d.mt ? d.mt.w + '×' + d.mt.h : '—');
ok(d.mt && d.mt.w <= d.card.w + 1 && d.mt.w >= d.card.w - 2, '缩略图区铺满卡片宽度（没有缩在一角）',
  d.mt ? '缩略图 ' + d.mt.w + ' vs 卡片 ' + d.card.w : '—');

/* 2. 图片本体：真加载了、按 contain 填满、不溢出 */
ok(!!d.img && d.img.loaded, '缩略图真的加载出来了（naturalWidth > 0）', d.img ? d.img.nat : '—');
ok(d.img && d.img.w > 120 && d.img.w <= d.mt.w + 0.5, '图片渲染宽度填满缩略图区（不是一枚小图）',
  d.img ? d.img.w + ' / ' + d.mt.w : '—');
/* 允许 2px 误差：.mt 有 1px 下边框，绝对定位子元素的 inset:0 是贴着**padding box**，
 * 高度天然比 .mt 少 1px。 */
ok(d.img && Math.abs(d.img.w - d.mt.w) < 2 && Math.abs(d.img.h - d.mt.h) < 2, 'img 盒子 = 缩略图区（contain 的留白由盒子承担）',
  d.img ? d.img.w + '×' + d.img.h + ' vs ' + d.mt.w + '×' + d.mt.h : '—');

/* 3. 图在上、信息在下：不能有重叠 —— 42px 事故的表现就是 img 溢出压住文件名 */
ok(!!d.inf && d.inf.y >= d.mt.bottom - 1, '信息区在缩略图**下方**（不重叠）',
  d.inf && d.mt ? '缩略图底 ' + d.mt.bottom + ' / 信息区顶 ' + d.inf.y : '—');
ok(!!d.nm && d.nm.y >= d.mt.bottom - 1, '文件名在缩略图下方（不被图片压住）',
  d.nm && d.mt ? '缩略图底 ' + d.mt.bottom + ' / 文件名顶 ' + d.nm.y : '—');
ok(d.nm && d.nm.h <= 40, '文件名最多两行（不会把卡片撑成一条长条）', d.nm ? '高 ' + d.nm.h + 'px' : '—');
ok(d.meta && d.meta.y >= d.nm.bottom - 1, '元信息在文件名下面', d.meta ? '元信息顶 ' + d.meta.y : '—');
ok(d.meta && /×/.test(d.meta.text), '元信息里有尺寸', d.meta ? d.meta.text : '—');

/* 4. 操作行：常驻、图标化、三个动作齐全 */
ok(d.ops.length === 3, '操作行有 3 个按钮', '实测 ' + d.ops.length);
ok(d.ops.every((b) => b.hasSvg), '三个按钮都是图标（不使用中文文字按钮，避免整片网格被字糊住）');
ok(d.ops.every((b) => b.text === ''), '图标按钮没有残留文字', JSON.stringify(d.ops.map((b) => b.text)));
ok(d.ops.every((b) => b.w >= 20 && b.w <= 34 && b.h >= 20 && b.h <= 34), '图标按钮尺寸收敛在 20~34px',
  JSON.stringify(d.ops.map((b) => b.w + '×' + b.h)));
ok(d.ops.every((b) => b.y >= d.inf.bottom - 1), '操作行在信息区下方', d.ft ? '操作行顶 ' + d.ft.y : '—');
ok(!!d.ft && d.ft.bottom <= d.card.bottom + 0.5, '操作行没有溢出卡片', d.ft ? d.ft.bottom + ' / ' + d.card.bottom : '—');

/* 5. 整片网格：不重叠、每张卡片缩略图都撑满（个别图加载失败会露出来） */
ok(d.widths.every((w) => w.mt > 120), '网格里每张卡片的缩略图区都 > 120px（没有个别塌掉）',
  JSON.stringify(d.widths.filter((w) => w.mt <= 120).slice(0, 5)));
ok(!d.overlap, '相邻卡片不重叠');
ok(d.grid.w > 700, '网格铺满主区（不是挤在左边一条）', '实测 ' + d.grid.w);

console.log('\n' + (fail === 0 ? '全部通过' : '有失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + ' 条）');
console.log('截图：' + out);
process.exit(fail === 0 ? 0 : 1);
