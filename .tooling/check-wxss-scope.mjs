/**
 * WXSS 作用域静态校验
 *
 * 解决什么问题：
 *   自定义组件默认 styleIsolation: 'isolated' —— app.wxss 与页面 wxss 里的
 *   **class 选择器**不会作用到组件内部。因此组件 wxml 上写的 class / hover-class
 *   如果只定义在 app.wxss 里，运行时就是一个「点了没反应」的哑样式。
 *   页面同理：A 页面的 wxss 不会作用到 B 页面，跨页复用的 hover 类必须各写一份
 *   或放进 app.wxss。
 *
 * 校验规则：
 *   1) 组件（components/**）：其 wxml 用到的 class 必须在本组件 wxss 中定义
 *      （@import 进来的也要算，按需展开一层）。
 *   2) 页面（pages/**、packageXxx/**）：可行类 = app.wxss + 本页面 wxss（含 @import 展开）。
 *   3) hover-class 的值（含 {{ cond ? 'a' : 'b' }} 里的字面量）与 class 同等对待，
 *      但 'none' / '' 是微信约定的「无点击态」，跳过。
 *   4) 动态拼接（class="a-{{x}}"）无法静态求解，整条跳过并计入 skipped，不算失败。
 *
 * 用法：node .tooling/check-wxss-scope.mjs [--verbose]
 * 退出码：0 = 全部通过；1 = 存在未定义 class
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MP = path.resolve(__dirname, '..', 'miniprogram');
const verbose = process.argv.includes('--verbose');

/* ---------------- 工具 ---------------- */

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 抽出 wxss 里的 class 选择器名（含 .a.b 这种复合写法的每一段） */
function classNamesOf(wxss) {
  const set = new Set();
  const noComment = wxss.replace(/\/\*[\s\S]*?\*\//g, '');
  // 只取规则块的选择器部分（{ 之前），避免把声明里的值当选择器
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(noComment))) {
    const sel = m[1];
    for (const cm of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) set.add(cm[1]);
  }
  return set;
}

/** 展开 @import（相对路径，最多 3 层） */
function collectWxss(file, depth = 0, seen = new Set()) {
  if (depth > 3 || seen.has(file) || !fs.existsSync(file)) return new Set();
  seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  const set = classNamesOf(src);
  for (const m of src.matchAll(/@import\s+["']([^"']+)["']\s*;/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    for (const c of collectWxss(target, depth + 1, seen)) set.add(c);
  }
  return set;
}

/** 从 wxml 的属性值里抽出所有 class 名 */
function classesInAttr(value) {
  const v = String(value);
  const out = [];
  // 1) {{ }} 之外的静态部分就是类名列表
  out.push(...v.replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/));
  // 2) {{ }} 之内只认字符串字面量（'a b' / "c"），三元里的裸标识符无法静态求解
  for (const blk of v.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    for (const q of blk[1].matchAll(/['"]([^'"]*)['"]/g)) out.push(...q[1].split(/\s+/));
  }
  return out.filter(Boolean);
}

function attrsOf(wxmlSource) {
  const res = [];
  const noComment = String(wxmlSource).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of noComment.matchAll(/\b(class|hover-class)\s*=\s*"([^"]*)"/g)) {
    res.push({ attr: m[1], value: m[2] });
  }
  return res;
}

/**
 * 找出所有 <include src="…"/> 了某个 wxml 片段的页面。
 *
 * 为什么需要：templates/ 下的片段没有自己的 wxss，它的 class 是在
 * **include 它的那个页面**的作用域里解析的。所以校验时必须按「谁 include 了我」
 * 去取可用类集合，而不是当成一个独立页面去找同名 wxss。
 */
function includersOf(fragment, allWxml) {
  const out = [];
  for (const f of allWxml) {
    if (f === fragment) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<include\s+src\s*=\s*"([^"]+)"\s*\/?>/g)) {
      // src 是相对于「包含它的那个文件」解析的
      if (path.resolve(path.dirname(f), m[1]) === fragment) { out.push(f); break; }
    }
  }
  return out;
}

/* ---------------- 主流程 ---------------- */

const APP_WXSS = path.join(MP, 'app.wxss');
const appClasses = collectWxss(APP_WXSS);

const issues = [];
const skipped = [];
let checked = 0;

const wxmls = walk(MP).filter((f) => f.endsWith('.wxml'));

for (const wxml of wxmls) {
  const rel = path.relative(MP, wxml).replace(/\\/g, '/');
  const isComponent = rel.startsWith('components/');
  const own = wxml.replace(/\.wxml$/, '.wxss');

  let allowed;
  let scopeDesc;
  if (isComponent) {
    allowed = collectWxss(own);
    scopeDesc = rel.split('/').slice(0, 2).join('/') + '.wxss';
  } else if (rel.startsWith('templates/')) {
    // 被 include 的片段：可用类 = app.wxss + 所有 include 它的页面的 wxss
    const includers = includersOf(wxml, wxmls);
    allowed = new Set(appClasses);
    includers.forEach((f) => {
      for (const c of collectWxss(f.replace(/\.wxml$/, '.wxss'))) allowed.add(c);
    });
    scopeDesc = includers.length
      ? 'app.wxss + ' + includers.map((f) => path.relative(MP, f).replace(/\\/g, '/').replace(/\.wxml$/, '.wxss')).join(' + ')
      : '（没有任何页面 include 这个片段）';
    if (!includers.length) {
      skipped.push(rel + '  （无人 include 的孤立片段，作用域无法确定）');
    }
  } else {
    allowed = new Set([...appClasses, ...collectWxss(own)]);
    scopeDesc = 'app.wxss + ' + rel.replace(/\.wxml$/, '.wxss');
  }

  for (const { attr, value } of attrsOf(fs.readFileSync(wxml, 'utf8'))) {
    if (value.includes('{{') && !/['"]/.test(value)) {
      skipped.push(rel + '  ' + attr + '="' + value + '"');
      continue;
    }
    for (const cls of classesInAttr(value)) {
      if (cls === 'none') continue;
      if (/\{\{/.test(cls)) {
        skipped.push(rel + '  ' + attr + ' 动态拼接 ' + cls);
        continue;
      }
      checked++;
      if (!allowed.has(cls)) {
        issues.push({ rel, attr, cls, scopeDesc });
      }
    }
  }
}

/* ---------------- 输出 ---------------- */

if (verbose) {
  console.log('app.wxss 定义类数：' + appClasses.size);
  console.log('扫描 wxml：' + wxmls.length + ' 个，静态判定 class 引用 ' + checked + ' 处');
}

if (issues.length) {
  console.log('\n❌ 存在未在正确作用域内定义的 class（' + issues.length + ' 处）：');
  for (const it of issues) {
    console.log('  ' + it.rel + '  →  ' + it.attr + '="' + it.cls + '"');
    console.log('      期望定义处：' + it.scopeDesc);
  }
} else {
  console.log('✅ WXSS 作用域校验通过：' + checked + ' 处 class 引用全部有定义');
}

if (skipped.length && verbose) {
  console.log('\n（动态拼接跳过 ' + skipped.length + ' 处）');
  for (const s of skipped) console.log('  ' + s);
}

process.exit(issues.length ? 1 : 0);
