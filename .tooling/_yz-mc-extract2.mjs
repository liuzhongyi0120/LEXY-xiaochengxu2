/* 从有赞装修台 JS 里把「图标映射大表」整张抠出来并解析成对象 */
import fs from 'node:fs';

const F = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/decorate-usercenter.js';
const t = fs.readFileSync(F, 'utf8');

/* 找到所有 colorIcon 位置，再往前扫到大表起点（深度首次为 -1 的位置） */
const anchors = [];
let i = -1;
while ((i = t.indexOf('colorIcon', i + 1)) !== -1) anchors.push(i);

const tableStarts = new Set();
for (const a of anchors) {
  let d = 0;
  for (let k = a; k >= 0; k--) {
    if (t[k] === '}') d++;
    else if (t[k] === '{') { d--; if (d === -1) { tableStarts.add(k); break; } }
  }
}

/* 从每个起点配平取完整对象文本 */
const segs = [];
for (const s of [...tableStarts].sort((x, y) => x - y)) {
  let d = 0, end = -1;
  for (let k = s; k < t.length; k++) {
    if (t[k] === '{') d++;
    else if (t[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  if (end > s) segs.push({ s, e: end, text: t.slice(s, end + 1) });
}

/* 合并重叠（嵌套的大表只保留最外层） */
segs.sort((a, b) => a.s - b.s || b.e - a.e);
const keep = [];
for (const g of segs) if (!keep.some((k) => g.s >= k.s && g.e <= k.e)) keep.push(g);

console.log('取出 %d 张大表\n', keep.length);

const OUT = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc';
let n = 0;
for (const g of keep) {
  n++;
  let obj = null;
  try {
    obj = new Function('return ' + g.text)();
  } catch (e) {
    console.log('表 %d 解析失败：%s', n, e.message.slice(0, 80));
    continue;
  }
  const keys = Object.keys(obj);
  const isMap = keys.every((k) => obj[k] && typeof obj[k] === 'object');
  console.log('=== 表 %d === 顶层键 %d 个：%s', n, keys.length, keys.slice(0, 40).join(', '));
  if (isMap && keys.length > 1) {
    fs.writeFileSync(`${OUT}/iconmap-${n}.json`, JSON.stringify(obj, null, 1));
    console.log('  -> iconmap-%d.json', n);
  }
  console.log('');
}

/* 顺带单独抠 ICON_MODE_MAP */
const im = t.match(/ICON_MODE_MAP\s*[:=]\s*(\{[^}]*\})/);
console.log('ICON_MODE_MAP =', im ? im[1] : '(未找到)');
