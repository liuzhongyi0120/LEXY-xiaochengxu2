import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const CSS = 'server/public/console/console.css';
const core = readFileSync('server/public/console/console.core.js', 'utf8');
const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/(^|\})\s*([^{}]*?)\{/g)].map((m) => m[2].trim());
const bare = rules.filter((s) => /\.lb(?![-\w])/.test(s));
const illegal = bare.filter((s) => s !== '.bars .lb');
const subs = rules.filter((s) => /\.lb-/.test(s));
const unscoped = subs.filter((s) => !/^\.lbx\b/.test(s));
const r = [
  ['无裸 .lb（仅允许 .bars .lb）', illegal.length === 0, illegal.join(' | ')],
  ['根规则 #layer > .lbx', /#layer\s*>\s*\.lbx\s*\{/.test(css), ''],
  ['子规则全部 .lbx 前缀', subs.length >= 10 && unscoped.length === 0, subs.length + ' 条 / 未加作用域 ' + unscoped.length + (unscoped.length ? ' → ' + unscoped.join(' | ') : '')],
  ['JS className=lbx', /el\.className\s*=\s*'lbx'/.test(core) && !/el\.className\s*=\s*'lb'/.test(core), ''],
  ['.bars .lb 仍存在', /\.bars\s+\.lb\s*\{/.test(css), ''],
  ['哨兵脚本存在', existsSync('.tooling/test-page-occlusion.mjs'), '']
];
let bad = 0;
for (const [n, ok, d] of r) { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d ? '  — ' + d : '')); }
console.log('\n' + (bad ? bad + ' 条未通过' : '6/6 全部通过'));
