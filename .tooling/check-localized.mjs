/**
 * 外链本地化自检
 *
 * 三件事，缺一不可：
 *   1. 残留：指定文件里还有没有指向外部 CDN 的**资源**外链
 *      （h5.youzan.com 这类**跳转链接**不算 —— 它们不是图片/视频资源）
 *   2. 落地：每个 /uploads/... 引用在磁盘上**是否真的存在**
 *      （替换脚本映射错了、素材被删了，都会在这里露出来；只查残留是查不出的）
 *   3. 可解析：replica.js / packageNews-data.js 能正常加载并导出预期字段
 *
 * 用法：node .tooling/check-localized.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const FILES = [
  { file: 'miniprogram/config/replica.js', type: 'js', label: '装修数据 replica.js' },
  { file: 'miniprogram/packageNews/data.js', type: 'js', label: '资讯数据 packageNews/data.js' },
  { file: 'server/data/decorate/state.json', type: 'json', label: '装修状态 state.json' },
  { file: 'server/data/db.json', type: 'json', label: '业务数据 db.json' },
  { file: '小程序预览.html', type: 'html', label: '静态预览快照' }
];

/**
 * 资源外链：指向 CDN 的图片/视频。
 * 跳转链接（h5.youzan.com / shop*.youzan.com）**故意不算** —— 它们是内容出处，
 * 本地化没有意义，硬换会把链接改坏。
 */
/**
 * 资源外链：指向 CDN 的图片/视频。
 * 跳转链接（h5.youzan.com / shop*.youzan.com）**故意不算** —— 它们是内容出处，
 * 本地化没有意义，硬换会把链接改坏。
 */
const RESOURCE_HOSTS = /(^|\.)(yzcdn\.cn|youzan\.com\/upload_files)$/i;

/**
 * 本地引用：必须以**真实扩展名**结尾。
 * 不能只匹配 `/uploads/` 前缀 —— 注释里写「（/uploads/...）—— 本文件不再有外链」
 * 这种说明文字也会被当成引用，报出「引用不存在」的假警。
 */
const LOCAL_RE = /\/uploads\/[A-Za-z0-9_\-./]+\.(?:jpg|jpeg|png|gif|webp|mp4|mov|webm)\b/gi;

let fail = 0;
const allLocalRefs = new Set();

console.log('===== 1. 外链残留 =====');
for (const f of FILES) {
  const abs = path.join(ROOT, f.file);
  if (!fs.existsSync(abs)) { console.log('  · ' + f.label + '：不存在，跳过'); continue; }
  const src = fs.readFileSync(abs, 'utf8');
  const urls = src.match(/https?:\/\/[^\s"'`,)\]}<]+/g) || [];
  const resources = urls.filter((u) => {
    try { return RESOURCE_HOSTS.test(new URL(u).host); } catch { return false; }
  });
  const links = urls.filter((u) => /youzan\.com/.test(u) && !resources.includes(u));
  const localCount = (src.match(/\/uploads\//g) || []).length;
  (src.match(LOCAL_RE) || []).forEach((u) => allLocalRefs.add(u));

  const okMark = resources.length === 0 ? '✓' : '✗';
  console.log('  ' + okMark + ' ' + f.label);
  console.log('      本地引用 ' + localCount + ' 处 | 资源外链 ' + resources.length + ' | 跳转链接 ' + links.length);
  if (resources.length) {
    fail++;
    [...new Set(resources)].slice(0, 6).forEach((u) => console.log('        ✗ ' + u.slice(0, 110)));
  }
}

console.log('\n===== 2. /uploads 落地（引用是否真实存在）=====');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/uploads/index.json'), 'utf8'));
const known = new Set((idx.items || []).map((it) => it.url));
const missing = [...allLocalRefs].filter((u) => {
  const clean = u.split('?')[0];
  if (known.has(clean)) return false;
  return !fs.existsSync(path.join(ROOT, 'server/data', clean.replace(/^\//, '')));
});
console.log('  去重后的本地引用：' + allLocalRefs.size + ' 个');
console.log('  索引中有、磁盘上找不到的：' + missing.length);
if (missing.length) {
  fail++;
  missing.slice(0, 10).forEach((u) => console.log('    ✗ ' + u));
} else {
  console.log('  全部命中素材库 ✓');
}

console.log('\n===== 3. 数据可解析 =====');
const runCjs = (code) => { const m = { exports: {} }; vm.runInNewContext(code, { module: m, exports: m.exports, console }); return m.exports; };
for (const f of FILES.filter((x) => x.type === 'js')) {
  const src = fs.readFileSync(path.join(ROOT, f.file), 'utf8');
  try {
    const mod = runCjs(src);
    const keys = Object.keys(mod);
    console.log('  ✓ ' + f.label + '  导出：' + keys.slice(0, 8).join(', '));
  } catch (e) {
    fail++;
    console.log('  ✗ ' + f.label + ' 加载失败：' + e.message);
  }
}

// replica 的关键字段
const R = runCjs(fs.readFileSync(path.join(ROOT, 'miniprogram/config/replica.js'), 'utf8'));
const blockCount = (R.HOME_BLOCKS || []).length;
const modelCount = (R.PRODUCT_BRANDS || []).reduce((a, b) => a + (b.groups || []).reduce((x, g) => x + (g.products || []).length, 0), 0);
console.log('  首页区块 ' + blockCount + ' | 产品页型号 ' + modelCount);
if (!blockCount || !modelCount) { fail++; console.log('  ✗ 关键字段为空'); }

console.log('\n===== 结论 =====');
console.log(fail === 0 ? '全部通过 ✓（资源外链 0、本地引用全部落地、数据可解析）' : '✗ 有 ' + fail + ' 项未通过');
process.exit(fail === 0 ? 0 : 1);
