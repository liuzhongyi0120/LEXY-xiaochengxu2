/**
 * 字段审计：装修台 schema 里声明的「组件属性」，有多少在渲染/数据侧根本没被读过？
 *
 * 用法：node .tooling/audit-block-fields.mjs [--verbose]
 *       --strict  有候选死字段时以退出码 2 结束（便于脚本化；默认也设 2）
 *
 * 判据分两档，**用项目自己的契约（schema 的 dep 字段）分类，不用文本猜测**：
 *   ① dep 为空 = 真能跑的组件 → 它的字段「零消费」就是**缺陷**（面板能填、真机不变），报告出来；
 *   ② dep 非空 = 依赖占位组件（铁律 8「不假装可用」）→ 字段零消费是**预期**的
 *      （照抄有赞面板留档），一律不报。
 *
 * 「零消费」= 字段键在下面四个消费方里**一次都没出现**：
 *   ① miniprogram/templates/blocks.wxml   真机 markup
 *   ② miniprogram/utils/blocks.js         真机数据归一化 / 事件
 *   ③ server/public/shared/pv-render.js   装修台预览 + /preview 渲染
 *   ④ server/decorate/emit.js             发布时写进 replica 的部分
 *   ⑤ server/public/admin/admin.js        装修台属性面板自身（兜底：面板控件的通用渲染）
 *
 * ⚠️ 局限：这是**文本级**判据（键名是否以独立词出现）。字段若只被动态拼键访问会误报成「死的」，
 *    所以结论必须人工复核后再动手删 —— 删完再跑一次，直到归零。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const schema = require(path.join(ROOT, 'server/decorate/schema.js'));

const SITES = [
  ['wxml', 'miniprogram/templates/blocks.wxml'],
  ['blocks.js', 'miniprogram/utils/blocks.js'],
  ['pv-render', 'server/public/shared/pv-render.js'],
  ['emit', 'server/decorate/emit.js'],
  ['admin.js', 'server/public/admin/admin.js']
].map(([name, rel]) => {
  const p = path.join(ROOT, rel);
  return { name, text: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '' };
});

/** 结构键：不是业务数据，别统计 */
const STRUCT = new Set(['k', 'label', 'type', 'def', 'group', 'fields', 'item', 'options', 'hint', 'tip', 'desc',
  'value', 'min', 'max', 'step', 'unit', 'collapsed', 'open', 'title', 'imageList', 'lib', 'template',
  'required', 'placeholder', 'when', 'show', 'showWhen', 'visible']);

/** 递归收集一个块的全部字段键（含 group / list item 内部） */
function collectFields(fields, out) {
  for (const f of fields || []) {
    if (f && f.k && !STRUCT.has(f.k)) out.add(f.k);
    if (f && f.fields) collectFields(f.fields, out);
    if (f && f.item && f.item.fields) collectFields(f.item.fields, out);
  }
}

/** 键名是否在任一消费方出现（按词边界，避免 'bg' 命中 'bgColor' 这类误判成「有人用」） */
function usedAnywhere(key) {
  const re = new RegExp('(^|[^A-Za-z0-9_$])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_$]|$)');
  return SITES.filter((s) => re.test(s.text)).map((s) => s.name);
}

const kinds = schema.HOME_BLOCK_KINDS || {};

const rows = [];
const placeholder = [];
for (const [type, def] of Object.entries(kinds)) {
  const keys = new Set();
  collectFields(def.fields, keys);
  /* dep 非空 = 依赖占位组件（照抄有赞面板留档），字段零消费属预期 */
  if (def.dep) { placeholder.push({ type, label: def.label || '', n: keys.size }); continue; }
  for (const k of keys) {
    const used = usedAnywhere(k);
    if (!used.length) rows.push({ type, label: def.label || '', k });
  }
}

const verbose = process.argv.includes('--verbose');
const byType = {};
for (const r of rows) (byType[r.type] = byType[r.type] || []).push(r.k);
const implCount = Object.keys(kinds).length - placeholder.length;

console.log('装修台组件字段审计（键名级，零消费 = 候选死字段）');
console.log('组件总数：' + Object.keys(kinds).length +
  '｜真能跑（dep 空）：' + implCount +
  '｜依赖占位（dep 非空，字段零消费属预期）：' + placeholder.length);
console.log('扫描消费方：' + SITES.map((s) => s.name).join(' / '));
console.log('真能跑组件里的候选死字段：' + rows.length + ' 个，分布在 ' + Object.keys(byType).length + ' 个组件\n');
if (!rows.length) {
  console.log('（没有零消费字段 —— 面板上的每一项都能落到真机/预览）');
} else {
  console.log('组件'.padEnd(22) + 'label'.padEnd(14) + '候选死字段');
  for (const r of rows) {
    console.log('  ' + String(r.type).padEnd(20) + String(r.label).padEnd(14) + r.k);
  }
}

if (verbose) {
  console.log('\n依赖占位组件（dep 非空，"字段零消费"属预期，本轮不碰）：');
  for (const u of placeholder) console.log('  ' + String(u.type).padEnd(20) + String(u.label).padEnd(14) + u.n + ' 个字段');
}

/* 顺带：后端「店铺设置」里的历史遗留键（已清理，须保持为「无」） */
const store = fs.readFileSync(path.join(ROOT, 'server/lib/catalogStore.js'), 'utf8');
const legacy = ['shopName', 'logo'].filter((k) => new RegExp('^\\s*' + k + ':', 'm').test(store));
console.log('\n店铺设置里的历史遗留键（catalogStore DEFAULT_SETTINGS）：' + (legacy.length ? legacy.join(', ') : '无'));

if (rows.length || legacy.length) process.exitCode = 2; // 有候选 → 退出码 2，便于脚本化调用
