/* 逐项抠出有赞的 {type: {icon, colorIcon, text}} 映射 */
import fs from 'node:fs';

const F = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/decorate-usercenter.js';
const t = fs.readFileSync(F, 'utf8');

const out = {};
const anchors = [];
let i = -1;
while ((i = t.indexOf('colorIcon', i + 1)) !== -1) anchors.push(i);

for (const a of anchors) {
  /* 1) 小项起点：从 colorIcon 往前，左扫 depth 首次 -1 */
  let s1 = -1, d = 0;
  for (let k = a; k >= 0; k--) {
    if (t[k] === '}') d++;
    else if (t[k] === '{') { d--; if (d === -1) { s1 = k; break; } }
  }
  if (s1 < 0) continue;
  /* 2) 小项终点：配平 */
  let dd = 0, e1 = -1;
  for (let k = s1; k < t.length; k++) {
    if (t[k] === '{') dd++;
    else if (t[k] === '}') { dd--; if (dd === 0) { e1 = k; break; } }
  }
  if (e1 < 0) continue;
  /* 3) key 名：s1 前面最近的一段 `xxx:` */
  const before = t.slice(Math.max(0, s1 - 80), s1);
  const km = before.match(/([\w$"'\-]+)\s*:\s*$/);
  const key = km ? km[1].replace(/["']/g, '') : '(?)';
  /* 4) 解析小项 */
  let item = null;
  try { item = new Function('return ' + t.slice(s1, e1 + 1))(); } catch (e) { continue; }
  if (!item || !item.colorIcon) continue;
  if (!out[key]) out[key] = { icon: item.icon, colorIcon: item.colorIcon, text: item.text || '' };
}

const keys = Object.keys(out);
console.log('抠出 %d 项映射\n', keys.length);
const font = keys.filter((k) => typeof out[k].icon === 'string' && !/^https?:/.test(out[k].icon));
const imgs = keys.filter((k) => typeof out[k].icon === 'string' && /^https?:/.test(out[k].icon));
console.log('字体图标项 %d 个 / 图片图标项 %d 个\n', font.length, imgs.length);

console.log('--- 字体图标项（type -> 线性 / 实色 / 中文）---');
for (const k of font) {
  console.log('  %-26s %-24s %-22s %s', k, out[k].icon, out[k].colorIcon, out[k].text);
}
console.log('\n--- 图片图标项（有赞用的是 PNG，不是字体）---');
for (const k of imgs) {
  console.log('  %-26s %s', k, out[k].icon.slice(0, 90));
}

fs.writeFileSync(
  'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/yz-icon-map.json',
  JSON.stringify(out, null, 1)
);
console.log('\n-> .tooling/_yzmc/yz-icon-map.json');
