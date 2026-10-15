/**
 * 批量建「新闻大事 p296 / 用户分享 p299」两页卡片对应的店铺笔记，并把卡片 link 接上。
 *
 * 数据来源：`.tooling/_yz-note-map.json`（本地卡片 ↔ 有赞笔记 alias 的映射，
 *          由 `_yz-map-build.mjs` 按「标题逐字相等」匹配，对不上的留空不猜）。
 *
 * 归并口径（决定总共建几篇）：
 *   - 有赞那边**同一篇笔记可以被两个微页面复用**，且每张卡片可以自定义标题与封面
 *     （实测：`kndesNCPUH` 在新闻大事里叫「2025 莱克 | 碧云泉 | 咖博士新品体验发布会现场回顾」、
 *      在用户分享里叫「智净未来，健康生活」）。所以按 **alias 归并**：一个 alias 一篇笔记，
 *      两页的卡片都链到同一篇，绝不为了凑数建两份内容一样的笔记。
 *   - 有赞侧没有对应笔记的卡片（财务报告那张 2022 年报、品牌期刊 6 张）
 *     按**封面图文件名**各建一篇，标题用卡片标题 / 封面图上印的标题。
 *
 * 正文暂留空（有赞笔记正文要买家登录才能抓，抓到后由 `_yz-note-backfill.mjs` 回填）。
 *
 * 用法：node .tooling/_yz-notes-build.mjs          # 只打计划，不写
 *      node .tooling/_yz-notes-build.mjs --apply   # 真建真接
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8');
const B = 'http://127.0.0.1:3000';
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOK };
const UPLOADS = path.join(process.cwd(), 'server/data/uploads');

const post = async (p, body) => (await (await fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(body) }))).json();
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();

/**
 * 「品牌期刊」6 张在本地只有图没标题 —— 标题就印在封面上，逐张读出来的。
 * ⚠️ 这是从图上认读的事实，不是猜的；有赞那一页这个分类在 DOM 里确实没有文字。
 */
const BRAND_TITLES = {
  '20261012-fbdpu2.jpg': '品牌期刊 NO.27 · 新年特刊（2025.01）',
  '20261012-rhi52h.jpg': '品牌期刊 NO.26 · 秋冬合刊（2024.11）',
  '20261012-n3nxod.jpg': '品牌期刊 NO.25 · 九月期刊（2024.09）',
  '20261012-eitl82.jpg': '品牌期刊 NO.24 · 八月期刊（2024.08）',
  '20261012-lgznz2.jpg': '品牌期刊 NO.23 · 七月期刊（2024.07）',
  '20261012-hwco61.jpg': '品牌期刊 NO.22 · 六月期刊（2024.06）'
};

const map = JSON.parse(fs.readFileSync('.tooling/_yz-note-map.json', 'utf8'));

/* ---------- 1. 归并出「要建哪几篇」 ---------- */
const toCreate = [];      // { title, tags, cover, mergeKey }
const noteIdByMerge = new Map();  // mergeKey → 列表下标（先在 toCreate 里占位，apply 后换成 id）
const cardPlan = [];      // { page, tabIndex, itemIndex, mergeKey, title }

for (const page of ['p296', 'p299']) {
  (map[page] || []).forEach((c) => {
    const imgBase = String(c.image || '').split('/').pop();
    // 归并键：有 alias 就用 alias（同 alias = 有赞同一篇）；没有就用封面图文件名（各建各的）
    const mergeKey = c.alias ? 'alias:' + c.alias : 'img:' + imgBase;
    let title = String(c.title || '');
    if (!title) {
      title = BRAND_TITLES[imgBase] || '';
      if (!title) {
        console.log('  ⚠️ 无标题且封面不在品牌期刊表内，跳过：' + imgBase);
        return;
      }
    }
    cardPlan.push({ page, tabIndex: c.tabIndex, itemIndex: c.itemIndex, mergeKey, title, cover: c.image, tab: c.tab });
    if (noteIdByMerge.has(mergeKey)) return;   // 已有同一篇，复用
    noteIdByMerge.set(mergeKey, toCreate.length);
    toCreate.push({ title, tags: c.tab, cover: c.image, mergeKey });
  });
}

console.log('===== 计划 =====');
console.log('卡片总数 ' + cardPlan.length + '，需建笔记 ' + toCreate.length + ' 篇（配额 100）');
let bad = 0;
toCreate.forEach((n, i) => {
  const len = [...n.title].length;
  const okLen = len >= 5 && len <= 40;
  const imgOk = fs.existsSync(path.join(UPLOADS, String(n.cover).replace(/^\/uploads\//, '')));
  if (!okLen || !imgOk) { bad++; console.log('  ✗ #' + (i + 1) + ' ' + len + '字 img=' + imgOk + ' ' + n.title); }
});
console.log('标题长度/封面存在性不合规：' + bad + ' 条');
const dupAlias = cardPlan.filter((c) => c.mergeKey.startsWith('alias:kndesNCPUH'));
if (dupAlias.length > 1) {
  console.log('  ℹ️ 复用同一篇笔记的卡片：' + dupAlias.map((c) => c.page + '·' + c.title).join('  /  '));
}
if (!APPLY) {
  toCreate.slice(0, 8).forEach((n, i) => console.log('  例 ' + (i + 1) + '. [' + n.tags + '] ' + n.title));
  console.log('\n（这是计划，加 --apply 才真写）');
  process.exit(0);
}
if (bad) { console.log('有不合规项，先修再跑'); process.exit(1); }

/* ---------- 2. 建笔记（建 → 存草稿（封面）→ 生成代码） ---------- */
const ids = [];
for (let i = 0; i < toCreate.length; i++) {
  const n = toCreate[i];
  const c = await post('/api/decorate/note/create', { title: n.title, summary: '', tags: n.tags });
  if (c.code !== 0) { console.log('  ✗ create 失败 #' + (i + 1) + ' ' + n.title + ' → ' + JSON.stringify(c).slice(0, 160)); process.exit(1); }
  const key = c.data.key || c.data.page;
  const id = Number(String(key).replace('note-', ''));

  // 用后端给的现成 data 打底（默认值只定义一处，别自己拼）
  const p1 = await get('/api/decorate/page?key=' + key);
  const data = JSON.parse(JSON.stringify(p1.data.data || {}));
  data.header = Object.assign({}, data.header, {
    title: n.title, summary: '', tags: n.tags, coverMode: 'single', covers: [{ image: n.cover }]
  });
  data.body = Object.assign({}, data.body, { html: '', bg: '#ffffff', full: '0' });
  const d = await post('/api/decorate/draft', { key, data });
  if (d.code !== 0) { console.log('  ✗ draft 失败 #' + (i + 1) + ' → ' + JSON.stringify(d).slice(0, 160)); process.exit(1); }
  const pb = await post('/api/decorate/publish', { key, note: '复刻有赞：' + n.tags });
  if (pb.code !== 0) { console.log('  ✗ publish 失败 #' + (i + 1) + ' → ' + JSON.stringify(pb).slice(0, 160)); process.exit(1); }

  ids[i] = id;
  console.log('  ✓ #' + String(i + 1).padStart(2) + ' note-' + id + '  [' + n.tags + '] ' + n.title);
}

/* ---------- 3. 把两页卡片的 link 接上 ---------- */
const linkOf = (mergeKey) => 'packageNews/note/note?id=' + ids[noteIdByMerge.get(mergeKey)];

for (const page of ['p296', 'p299']) {
  const cur = await get('/api/decorate/page?key=' + page);
  const data = JSON.parse(JSON.stringify(cur.data.published || {}));
  let n = 0;
  (data.blocks || []).forEach((b) => {
    if (b.type !== 'tab_cate') return;
    (b.tabs || []).forEach((tb, ti) => {
      (tb.items || []).forEach((it, ii) => {
        const hit = cardPlan.find((c) => c.page === page && c.tabIndex === ti && c.itemIndex === ii);
        if (!hit) return;
        it.link = linkOf(hit.mergeKey);
        n++;
      });
    });
  });
  const d = await post('/api/decorate/draft', { key: page, data });
  if (d.code !== 0) { console.log('  ✗ ' + page + ' draft 失败 → ' + JSON.stringify(d).slice(0, 200)); process.exit(1); }
  const pb = await post('/api/decorate/publish', { key: page, note: '卡片接入店铺笔记' });
  if (pb.code !== 0) { console.log('  ✗ ' + page + ' publish 失败 → ' + JSON.stringify(pb).slice(0, 200)); process.exit(1); }
  console.log('  ✓ ' + page + ' 接上 ' + n + ' 个链接并已生成代码');
}

/* ---------- 4. 落盘「mergeKey → 笔记 id」，供正文回填用 ---------- */
const out = {};
toCreate.forEach((n, i) => { out[n.mergeKey] = { id: ids[i], title: n.title, tags: n.tags, cover: n.cover }; });
fs.writeFileSync('.tooling/_yz-note-ids.json', JSON.stringify(out, null, 1), 'utf8');
console.log('\nwrote .tooling/_yz-note-ids.json  （' + Object.keys(out).length + ' 篇）');
