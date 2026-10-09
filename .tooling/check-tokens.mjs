/**
 * 设计令牌引用完整性校验
 *
 * 检查三件事：
 *   1) 所有 var(--token) 引用的令牌都在 styles/variables.wxss 里定义过（防拼错 → 颜色丢失）
 *   2) 列出「定义了但没人用」的冗余令牌
 *   3) 列出仍存在的硬编码颜色（并按文件/上下文分类，便于判断是有意保留还是漏改）
 *
 * 用法：node .tooling/check-tokens.mjs [--verbose]
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MP = path.resolve(__dirname, '..', 'miniprogram');
const verbose = process.argv.includes('--verbose');

function walk(d, out = []) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (f) => path.relative(MP, f).split(path.sep).join('/');

const varsSrc = fs.readFileSync(path.join(MP, 'styles', 'variables.wxss'), 'utf8');
const defined = new Set([...varsSrc.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const wxss = walk(MP).filter((f) => f.endsWith('.wxss'));
const used = new Map();
const literals = [];
let varRefs = 0;

for (const f of wxss) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\((--[a-z0-9-]+)/g)) {
      varRefs++;
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1]).add(rel(f));
    }
    if (rel(f) === 'styles/variables.wxss') return;
    // var(--x, #fallback) 里的兜底色值是**故意**写死的（组件隔离时变量可能取不到），
    // 从字面量清单里剔除，否则永远清不完。
    const stripped = line.replace(/var\(--[a-z0-9-]+,\s*#[0-9A-Fa-f]{3,8}\)/g, '');
    for (const m of stripped.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
      literals.push({ file: rel(f), line: i + 1, hex: m[0], text: line.trim() });
    }
  });
}

const missing = [...used.keys()].filter((k) => !defined.has(k));
const unused = [...defined].filter((k) => !used.has(k));

console.log('令牌定义：' + defined.size + ' 个；引用：' + varRefs + ' 处（' + wxss.length + ' 个 wxss）');

if (missing.length) {
  console.log('\n❌ 被引用但未定义（渲染时会掉色）：');
  for (const k of missing) console.log('  ' + k + '  ← ' + [...used.get(k)].join(', '));
} else {
  console.log('✅ 所有 var(--token) 引用都有定义');
}

if (unused.length) console.log('\nℹ️ 已定义但当前无人引用：' + unused.sort().join('  '));

if (literals.length) {
  console.log('\nℹ️ 仍为字面量的颜色 ' + literals.length + ' 处（渐变 / 刻意保留的页面色）：');
  for (const l of literals) {
    console.log('  ' + l.file + ':' + l.line + '  ' + l.hex + '   ' + (verbose ? l.text : ''));
  }
} else {
  console.log('✅ 无硬编码颜色残留');
}

process.exit(missing.length ? 1 : 0);
