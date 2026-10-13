/* 从有赞 JS 精确抠 WIDGETS_CONFIG_MAP 与 getDefaultOrderItems */
import fs from 'node:fs';
const F = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/decorate-usercenter.js';
const t = fs.readFileSync(F, 'utf8');

function grabFrom(marker) {
  const i = t.indexOf(marker);
  if (i < 0) return null;
  const s = t.indexOf('{', i);
  if (s < 0) return null;
  let d = 0, e = -1;
  for (let k = s; k < t.length; k++) {
    if (t[k] === '{') d++;
    else if (t[k] === '}') { d--; if (d === 0) { e = k; break; } }
  }
  if (e < 0) return null;
  const text = t.slice(s, e + 1);
  try { return { obj: new Function('return ' + text)(), text }; } catch (err) { return { obj: null, text, err: err.message }; }
}

const w = grabFrom('WIDGETS_CONFIG_MAP=');
console.log('WIDGETS_CONFIG_MAP: %s', w && w.obj ? Object.keys(w.obj).length + ' 项' : '解析失败 ' + (w && w.err));
if (w && w.obj) {
  for (const [k, v] of Object.entries(w.obj)) {
    console.log('  %-30s %-24s %-22s %s', k, v.icon, v.colorIcon, v.text || '');
  }
  fs.writeFileSync('C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/yz-widgets.json', JSON.stringify(w.obj, null, 1));
}

const o = grabFrom('getDefaultOrderItems:function(){return[');
console.log('\ngetDefaultOrderItems: %s', o && o.obj ? 'ok' : '失败');
if (o) {
  const arr = t.slice(t.indexOf('[', t.indexOf('getDefaultOrderItems:function(){return')), t.indexOf(']', t.indexOf('getDefaultOrderItems:function(){return')) + 1);
  console.log(arr);
  fs.writeFileSync('C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/yz-order-items.txt', arr);
}

/* 资产行：找 statsItems 定义 */
const si = t.indexOf('statsItems');
console.log('\n--- statsItems 附近 ---');
console.log(JSON.stringify(t.slice(Math.max(0, si - 200), si + 900)));
