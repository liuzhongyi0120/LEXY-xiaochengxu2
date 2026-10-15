/**
 * 「新闻大事 p296 / 用户分享 p299」两页卡片 → 店铺笔记 的链接验收。
 *
 * 与 check-all 里那条「装修链接完整性」的分工：
 *   - check-all 那条扫的是**全站已生成代码**（replica.js），只管「有没有断链」；
 *   - 本脚本按**页面逐个点名**，管的是「这两页复刻页的每一张卡片是不是都接上了」——
 *     空 link 在 check-all 里是合法的（有些图片位本来就不跳转），
 *     但在这两页的卡片上就是「点了没反应」的缺陷，必须判失败。
 *
 * 判据全部**从接口现查**，不写死 61 / 24 / 37 这种数字：
 *   卡片数变了、分类增删了都不会假红，只有「某张卡片没接上」才会红。
 *
 * 用法：node .tooling/check-cards-link.mjs   （需要 3000 端口的本机服务）
 */
import fs from 'node:fs';

const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8');
const B = 'http://127.0.0.1:3000';
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOK };
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  — ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('--- 新闻大事 / 用户分享 卡片链接验收 ---\n');

/** 页面 key → 展示名 */
const PAGES = { p296: '新闻大事', p299: '用户分享' };

let grandTotal = 0, grandLinked = 0;

for (const [key, label] of Object.entries(PAGES)) {
  console.log('【' + label + ' / ' + key + '】');
  const page = await get('/api/decorate/page?key=' + key);
  const blocks = (page.data && page.data.published && page.data.published.blocks) || [];
  const tabs = blocks.filter((b) => b.type === 'tab_cate');

  ok(label + '：页面里有 tab_cate 分类区块', tabs.length > 0, 'tab_cate ' + tabs.length + ' 个');

  const cards = [];
  tabs.forEach((b) => (b.tabs || []).forEach((tb, ti) => {
    (tb.items || []).forEach((it, ii) => cards.push({ tab: tb.name, ti, ii, item: it }));
  }));
  ok(label + '：确实有卡片（防「一条都没扫到还显示绿」的空表恒真）', cards.length > 0, cards.length + ' 张');

  const empty = cards.filter((c) => !String(c.item.link || '').trim());
  ok(label + '：每张卡片都配了跳转链接（空 link = 点了没反应，且不报错）',
    empty.length === 0,
    empty.length ? empty.length + ' 张为空，例：[' + empty[0].tab + '] ' + JSON.stringify(empty[0].item.title)
      : cards.length + ' 张全部有 link');

  /* 链接目标逐个真的打开一次：光看字符串长得像没用，笔记被删了字符串还是对的 */
  const badTarget = [];
  const seen = new Map();
  for (const c of cards) {
    const link = String(c.item.link || '').trim();
    const m = /^packageNews\/note\/note\?id=(\d+)$/.exec(link);
    if (!m) { badTarget.push('[' + c.tab + '] ' + JSON.stringify(c.item.title) + ' → ' + JSON.stringify(link) + '（不是笔记地址）'); continue; }
    const id = m[1];
    if (!seen.has(id)) {
      const r = await get('/api/decorate/page?key=note-' + id);
      seen.set(id, !!(r && r.ok !== false && r.data && r.data.meta));
    }
    if (!seen.get(id)) badTarget.push('[' + c.tab + '] ' + JSON.stringify(c.item.title) + ' → note-' + id + '（笔记不存在）');
  }
  ok(label + '：每张卡片指向的笔记都真实存在（逐个打开过，不是只看字符串）',
    badTarget.length === 0,
    badTarget.length ? badTarget.slice(0, 4).join('；') : '去重后 ' + seen.size + ' 篇笔记全部可打开');

  const tabNames = [...new Set(cards.map((c) => c.tab))];
  console.log('    分类：' + tabNames.join(' / ') + '　共 ' + cards.length + ' 张 → ' + seen.size + ' 篇笔记');
  grandTotal += cards.length;
  grandLinked += cards.length - empty.length;
  console.log('');
}

ok('两页合计：卡片 ' + grandTotal + ' 张，已接链接 ' + grandLinked + ' 张', grandTotal > 0 && grandLinked === grandTotal,
  grandLinked + '/' + grandTotal);

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
