/* 解析有赞个人中心的图标字体 CSS：抽出「class → 码点」全集 */
import fs from 'node:fs';
const F = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/decorate-usercenter.css';
const s = fs.readFileSync(F, 'utf8');

/* 所有 `:before { content: "…" }` 规则（content 里可能是 CSS 转义 \e6dd 或真实 PUA 字面字符） */
const rules = [];
const re = /\.([A-Za-z][\w-]*(?::?:[a-z-]+)?)\s*:\s*before\s*\{\s*content\s*:\s*"((?:[^"\\]|\\.)*)"/g;
let m;
while ((m = re.exec(s))) {
  const cls = m[1];
  const raw = m[2];
  /* 解码：CSS 转义 \XXXX / \XX，或直接字面字符 */
  let cps = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '\\') {
      const hex = /^[0-9a-fA-F]{1,6}/.exec(raw.slice(i + 1));
      if (hex) { cps.push(parseInt(hex[0], 16)); i += 1 + hex[0].length; continue; }
      i += 2; continue;
    }
    const cp = raw.codePointAt(i);
    cps.push(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  rules.push({
    cls,
    cps,
    hex: cps.map((c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')),
    isPUA: cps.every((c) => c >= 0xe000 && c <= 0xf8ff),
  });
}
console.log('全部 :before 规则 %d 条', rules.length);

/* 只看 PUA（图标）且类名带 if 前缀的 */
const ifRules = rules.filter((r) => /^if(_|$)/.test(r.cls) && r.isPUA);
console.log('if_* 图标规则 %d 条\n', ifRules.length);
ifRules.forEach((r) => console.log('  %s  %s', r.cls.padEnd(34), r.hex.join(' ')));

/* 其它前缀（font-family 可能是别的） */
const others = rules.filter((r) => r.isPUA && !/^if(_|$)/.test(r.cls));
console.log('\n其它 PUA 图标规则 %d 条', others.length);
others.slice(0, 60).forEach((r) => console.log('  %s  %s', r.cls.padEnd(40), r.hex.join(' ')));

/* font-family 声明处 */
const fam = [...s.matchAll(/\.([\w-]+)\s*\{[^}]*font-family\s*:\s*([\w-]+)\s*!important/g)].map((x) => x[1] + ' -> ' + x[2]);
console.log('\nfont-family 绑定 %d 处：', fam.length);
console.log('  ' + [...new Set(fam)].slice(0, 20).join('\n  '));
