/* 抠出 STATS_ICON_MAP（资产项图标 = PNG 图片，不是字体）并下载 */
import fs from 'node:fs';

const F = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc/decorate-usercenter.js';
const t = fs.readFileSync(F, 'utf8');
const OUT = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc';

const i = t.indexOf('STATS_ICON_MAP={');
const s = t.indexOf('{', i);
let d = 0, e = -1;
for (let k = s; k < t.length; k++) {
  if (t[k] === '{') d++;
  else if (t[k] === '}') { d--; if (d === 0) { e = k; break; } }
}
const map = new Function('return ' + t.slice(s, e + 1))();
console.log('STATS_ICON_MAP 共 %d 项：', Object.keys(map).length);
const uniq = {};
for (const [k, v] of Object.entries(map)) {
  console.log('  %-16s %s', k, v);
  uniq[v] = uniq[v] || [];
  uniq[v].push(k);
}
console.log('\n唯一 URL %d 个', Object.keys(uniq).length);
fs.writeFileSync(`${OUT}/yz-stats-icons.json`, JSON.stringify(map, null, 1));

/* 下载 */
fs.mkdirSync(`${OUT}/stats`, { recursive: true });
(async () => {
  for (const u of Object.keys(uniq)) {
    const name = uniq[u].join('_') + '.png';
    try {
      const r = await fetch(u, { headers: { Referer: 'https://store.youzan.com/' } });
      const b = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(`${OUT}/stats/${name}`, b);
      console.log('[%s] %6d B  %s  <- %s', r.status, b.length, name, u.slice(-40));
    } catch (err) {
      console.log('[ERR] %s  %s', name, err.message);
    }
  }
})();
