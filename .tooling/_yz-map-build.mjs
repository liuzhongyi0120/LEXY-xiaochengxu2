/**
 * 建立「本地卡片 ↔ 有赞笔记 alias」映射。
 *
 * 匹配依据：**卡片标题逐字相等**。
 * 有赞两个聚合页抓下来的笔记顺序与本地 tab_cate 的卡片顺序一致，
 * 所以先按顺序对齐、再用标题核对；对不上就记为 unmatched，绝不猜。
 *
 * 输出 .tooling/_yz-note-map.json
 */
import fs from 'node:fs';

const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8');
const BASE = 'http://127.0.0.1:3000';

/** 有赞侧：去重后按文档顺序 */
function yzList(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = new Map();
  j.notes.forEach((n) => {
    if (!n.alias) return;
    const cur = map.get(n.alias) || { alias: n.alias, title: '', img: '' };
    if (n.title && !cur.title) cur.title = n.title;
    if (n.img && !cur.img) cur.img = n.img;
    map.set(n.alias, cur);
  });
  return [...map.values()];
}

const YZ = {
  p296: yzList('.tooling/_yz-news-struct.json'),
  p299: yzList('.tooling/_yz-share-struct.json')
};

async function localCards(key) {
  const r = await fetch(BASE + '/api/decorate/page?key=' + key, { headers: { Authorization: 'Bearer ' + TOK } });
  const j = await r.json();
  const out = [];
  ((j.data.published && j.data.published.blocks) || []).forEach((b) => {
    if (b.type !== 'tab_cate') return;
    (b.tabs || []).forEach((tb, ti) => {
      (tb.items || []).forEach((it, ii) => {
        out.push({ tabIndex: ti, tab: tb.name, itemIndex: ii, title: it.title || '', image: it.image || '' });
      });
    });
  });
  return out;
}

const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[""]/g, '"').replace(/['']/g, "'");

for (const key of ['p296', 'p299']) {
  const cards = await localCards(key);
  const yz = YZ[key];
  // 贪心顺序对齐：本地卡片按顺序在有赞列表里找还没被占用的同名项；找不到就试「下一项」
  const used = new Set();
  const mapped = [];
  let yzPtr = 0;
  for (const c of cards) {
    let hit = null;
    // 1) 从当前指针起找标题相同的
    for (let i = yzPtr; i < yz.length; i++) {
      if (used.has(i)) continue;
      if (norm(yz[i].title) === norm(c.title) && norm(c.title)) { hit = i; break; }
    }
    // 2) 标题为空（如品牌期刊）或没匹配上 → 不猜，留空
    if (hit === null) {
      mapped.push({ ...c, alias: '', yzTitle: '', matched: false, reason: norm(c.title) ? '有赞侧无同名标题' : '本地标题为空' });
      continue;
    }
    used.add(hit);
    yzPtr = hit + 1;
    mapped.push({ ...c, alias: yz[hit].alias, yzTitle: yz[hit].title, yzImg: yz[hit].img, matched: true });
  }
  YZ[key].mapped = mapped;
}

const out = {};
for (const k of ['p296', 'p299']) {
  const m = YZ[k].mapped;
  out[k] = m;
  console.log('===== ' + k + '  共 ' + m.length + ' 张，匹配上 ' + m.filter((x) => x.matched).length + ' =====');
  m.forEach((x, i) => {
    console.log(
      String(i + 1).padStart(2) + '. ' +
      (x.matched ? '✓' : '✗') + ' [' + x.tab + '] ' +
      (x.alias || '—').padEnd(11) + ' ' + JSON.stringify(x.title).slice(0, 46) +
      (x.matched ? '' : '  ← ' + x.reason)
    );
  });
}
fs.writeFileSync('.tooling/_yz-note-map.json', JSON.stringify(out, null, 1), 'utf8');
console.log('\nwrote .tooling/_yz-note-map.json');
