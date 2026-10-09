/**
 * 外链本地化：把项目里所有「有赞 CDN 外链」换成 /uploads/ 本地路径
 *
 * 为什么必须做：小程序的图片/视频若指向有赞 CDN，等于内容与素材都挂在他方域名上 ——
 *   有赞一改目录结构、加防盗链或**签名过期**（视频就是这样），页面就大面积白图/黑屏；
 *   而本地素材库明明已经有对应文件，却没人引用。
 *
 * 覆盖 5 处 —— 少一处就会出现「首页好了、资讯页还是外链」这种半截状态：
 *   1) miniprogram/config/replica.js      装修数据（首页/莱克/资讯/产品/我的 5 页 + 自定义页）
 *   2) server/data/decorate/state.json    装修后台的草稿与**历史版本快照**（回滚后会用到）
 *   3) miniprogram/packageNews/data.js    资讯详情数据（23 个内容页）
 *   4) server/data/db.json                用户头像等运行时数据
 *   5) 小程序预览.html                     静态预览快照
 *
 * 为什么直接改文件而不是走「草稿 → 发布」：
 *   装修后台的「已发布」视图就是 `p.from(replica)` 读出来的，
 *   所以 replica.js 改成什么样、后台看到的就是什么样，之后任何编辑/发布都自动延续本地路径。
 *   反过来走发布链路要先造一份草稿，等于把完整数据再写一遍，多一层出错面。
 *
 * 映射来源（三张表合并）：
 *   - 素材库 index.json 的 source 字段（精确 + 去签名/缩放后缀的宽松匹配）
 *   - .tooling/_yz/video-map.json（视频：签名会过期，必须按路径主体匹配）
 *   - .tooling/_yz/news-asset-map.json（资讯图）
 *
 * 用法：
 *   node .tooling/localize-assets.mjs            # 试跑，只报告
 *   node .tooling/localize-assets.mjs --apply    # 落盘（自动备份）
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const BACKUP = path.join(ROOT, '.tooling/_yz/backup-localize');
const APPLY = process.argv.includes('--apply');

/** 路径主体：去查询串、去有赞缩放后缀 —— 用于「同一文件不同签名/不同尺寸」的宽松匹配 */
const norm = (u) => String(u).split('!')[0].split('?')[0];

const FILES = [
  { file: 'miniprogram/config/replica.js', type: 'js', label: '装修数据 replica.js' },
  { file: 'miniprogram/packageNews/data.js', type: 'js', label: '资讯数据 packageNews/data.js' },
  { file: 'server/data/decorate/state.json', type: 'json', label: '装修状态 state.json' },
  { file: 'server/data/db.json', type: 'json', label: '业务数据 db.json' },
  { file: '小程序预览.html', type: 'html', label: '静态预览快照' }
];

/* ---------------- 1. 合并映射表 ---------------- */
const exact = new Map(); // 完整 URL → /uploads/...
const loose = new Map(); // 路径主体 → /uploads/...

function put(source, url, prefer) {
  if (!source || !url) return;
  if (prefer || !exact.has(source)) exact.set(source, url);
  const k = norm(source);
  if (prefer || !loose.has(k)) loose.set(k, url);
}

// 1a. 素材库索引
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/uploads/index.json'), 'utf8'));
(idx.items || []).forEach((it) => put(it.source, it.url));

// 1b. 视频映射（key = 装修数据里的原始地址，含旧签名）
const vmapFile = path.join(ROOT, '.tooling/_yz/video-map.json');
if (fs.existsSync(vmapFile)) {
  const vm2 = JSON.parse(fs.readFileSync(vmapFile, 'utf8'));
  Object.entries(vm2).forEach(([src, url]) => put(src, url, true));
  console.log('视频映射：' + Object.keys(vm2).length + ' 条');
}

// 1c. 资讯图映射
const nmapFile = path.join(ROOT, '.tooling/_yz/news-asset-map.json');
if (fs.existsSync(nmapFile)) {
  const nm = JSON.parse(fs.readFileSync(nmapFile, 'utf8'));
  Object.entries(nm).forEach(([src, url]) => put(src, url, true));
  console.log('资讯图映射：' + Object.keys(nm).length + ' 条');
}

console.log('映射表：精确 ' + exact.size + ' 键 | 宽松 ' + loose.size + ' 键');

const lookup = (url) => exact.get(url) || loose.get(norm(url)) || null;

/* ---------------- 2. 三种处理方式 ---------------- */
const URL_RE = /https?:\/\/[^\s"'`,)\]}<]+/g;

function localizeText(src) {
  const stats = { total: 0, hit: 0, miss: [] };
  const out = src.replace(URL_RE, (u) => {
    stats.total++;
    const local = lookup(u);
    if (local) { stats.hit++; return local; }
    stats.miss.push(u);
    return u;
  });
  return { out, stats };
}

function localizeTree(node, stats, seen = new Set()) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'string') {
    if (!/^https?:\/\//.test(node)) return node;
    stats.total++;
    const local = lookup(node);
    if (local) { stats.hit++; return local; }
    stats.miss.push(node);
    return node;
  }
  if (typeof node !== 'object') return node;
  if (seen.has(node)) return node;
  seen.add(node);
  if (Array.isArray(node)) return node.map((v) => localizeTree(v, stats, seen));
  const out = {};
  Object.keys(node).forEach((k) => { out[k] = localizeTree(node[k], stats, seen); });
  return out;
}

/* ---------------- 3. 逐文件处理 ---------------- */
const results = [];
let hasError = false;

for (const f of FILES) {
  const abs = path.join(ROOT, f.file);
  if (!fs.existsSync(abs)) { console.log('\n--- ' + f.label + '：文件不存在，跳过 ---'); continue; }
  const src = fs.readFileSync(abs, 'utf8');

  let out;
  const stats = { total: 0, hit: 0, miss: [] };
  if (f.type === 'json') {
    const obj = JSON.parse(src);
    out = JSON.stringify(localizeTree(obj, stats), null, 2);
  } else {
    const r = localizeText(src);
    out = r.out;
    Object.assign(stats, r.stats);
  }

  console.log('\n--- ' + f.label + ' ---');
  console.log('  外链 ' + stats.total + ' 处 → 换成本地 ' + stats.hit + '，未命中 ' + stats.miss.length);
  const uniq = [...new Set(stats.miss)];
  uniq.slice(0, 8).forEach((u) => console.log('    ✗ ' + u.slice(0, 108)));
  if (uniq.length > 8) console.log('    … 另有 ' + (uniq.length - 8) + ' 个');

  // 校验
  if (f.type === 'js') {
    try { new vm.Script(out, { filename: f.file }); console.log('  语法校验：通过 ✓'); }
    catch (e) { console.log('  语法校验：失败 ✗ ' + e.message); hasError = true; }
  } else if (f.type === 'json') {
    try { JSON.parse(out); console.log('  JSON 校验：通过 ✓'); }
    catch (e) { console.log('  JSON 校验：失败 ✗ ' + e.message); hasError = true; }
  }

  results.push({ ...f, src, out, stats });
}

if (hasError) { console.log('\n✗ 有文件校验失败，已中止，不写盘'); process.exit(1); }

if (!APPLY) { console.log('\n（试跑模式，未写盘。加 --apply 落盘）'); process.exit(0); }

/* ---------------- 4. 落盘（先备份） ---------------- */
fs.mkdirSync(BACKUP, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
results.forEach((r) => {
  const dst = path.join(BACKUP, stamp + '__' + r.file.replace(/[\\/]/g, '__'));
  fs.writeFileSync(dst, r.src);
  fs.writeFileSync(path.join(ROOT, r.file), r.out);
  console.log('已写 ' + r.file);
});
console.log('\n备份目录：' + path.relative(ROOT, BACKUP) + '（' + stamp + '）');
