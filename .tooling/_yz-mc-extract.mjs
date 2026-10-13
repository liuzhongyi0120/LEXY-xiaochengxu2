/* 从有赞装修台 JS 里提取图标映射表（type -> {icon, colorIcon, text}） */
import fs from 'node:fs';

const F = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/decorate-usercenter.js';
const t = fs.readFileSync(F, 'utf8');

/* 1) 数一数 colorIcon 出现次数 */
console.log('colorIcon 出现 %d 次\n', (t.match(/colorIcon/g) || []).length);

/* 2) 每个 colorIcon 往前找它所在对象的 `{`，向后配平 `}` 取整个映射表 */
const starts = [];
let idx = -1;
while ((idx = t.indexOf('colorIcon', idx + 1)) !== -1) {
  let i = idx, depth = 0, begin = -1;
  /* 往前：找到所在对象起点。对象形如 `{a:{icon:"x",colorIcon:"y",text:"z"},...}` */
  for (let k = idx; k >= 0; k--) {
    if (t[k] === '}') depth++;
    else if (t[k] === '{') {
      if (depth === 0) { begin = k; break; }
      depth--;
    }
  }
  if (begin < 0) continue;
  /* 从 begin 往后配平（外面还有一层包裹对象，往前再退一层直到遇到 key: 前缀） */
  let d = 0, end = -1;
  for (let k = begin; k < t.length; k++) {
    if (t[k] === '{') d++;
    else if (t[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  if (end > begin) starts.push([begin, end]);
}

/* 3) 合并重叠区间，得到「最大的一整张表」 */
starts.sort((a, b) => a[0] - b[0]);
const merged = [];
for (const [a, b] of starts) {
  const last = merged[merged.length - 1];
  if (last && a <= last[1]) last[1] = Math.max(last[1], b);
  else merged.push([a, b]);
}

merged.forEach(([a, b], n) => {
  const seg = t.slice(a, b + 1);
  const nIcon = (seg.match(/colorIcon/g) || []).length;
  /* 往上找这对象所属的变量名 / 属性名 */
  const before = t.slice(Math.max(0, a - 120), a);
  const key = (before.match(/([\w$]+)\s*[:=]\s*$/) || [])[1] || '(匿名)';
  console.log('=== 表 %d：属性名 %s，%d 项，长度 %d ===', n + 1, key, nIcon, seg.length);
  if (nIcon >= 3) {
    fs.writeFileSync(
      `C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/iconmap-${n + 1}.js`,
      'module.exports = ' + seg + ';'
    );
  }
  console.log(seg.slice(0, 700).replace(/\},/g, '},\n  '));
  console.log('');
});
