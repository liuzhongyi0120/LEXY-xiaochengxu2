/**
 * 「卡片链接」判据的判别力验证（改坏 → 必须红 → 还原 → 必须绿）
 *
 * 改坏两处，各自对应一条不同的判据：
 *   ① 第 1 张卡片的 link 指向一个**不存在的笔记 id** → 断链（check-all 那条 + 本页那条都该红）
 *   ② 第 2 张卡片的 link 清空 → 「点了没反应」（只有 check-cards-link 那条管得到）
 * 还原走**接口**（不是直接改文件）：store.js 是内存态 + 50ms 落盘，
 * 运行中直接写文件会被内存覆盖（铁律 16），所以只能靠 publish 还原。
 *
 * 用法：node .tooling/_mut-cardlink.mjs break | restore
 */
import fs from 'node:fs';

const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8');
const B = 'http://127.0.0.1:3000';
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOK };
const BAK = '.tooling/_bak-p296.json';
const post = async (p, body) => (await (await fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(body) }))).json();
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();

const mode = process.argv[2] || 'break';

if (mode === 'break') {
  const cur = await get('/api/decorate/page?key=p296');
  const data = JSON.parse(JSON.stringify(cur.data.published || {}));
  fs.writeFileSync(BAK, JSON.stringify(data, null, 1), 'utf8');

  let n = 0;
  (data.blocks || []).forEach((b) => {
    if (b.type !== 'tab_cate') return;
    const items = (b.tabs || [])[0] && (b.tabs || [])[0].items;
    if (!items || !items.length) return;
    items[0].link = 'packageNews/note/note?id=99999';   // ① 指向不存在的笔记
    n++;
    if (items[1]) { items[1].link = ''; n++; }          // ② 空链接（点了没反应）
    /* ③ 指向一个 tabBar 页：openLink 会改走 switchTab，?id= 被丢掉 ——
       这条专门验「真机层的跳转方式」，后台数据层看不出来 */
    if (items[2]) { items[2].link = '/pages/news/news'; n++; }
  });
  if (!n) { console.log('没找到可改坏的卡片'); process.exit(1); }
  await post('/api/decorate/draft', { key: 'p296', data });
  const pb = await post('/api/decorate/publish', { key: 'p296', note: 'MUTATION 改坏实验' });
  console.log('改坏 ' + n + ' 处并发布：' + (pb.code === 0 ? 'ok' : JSON.stringify(pb).slice(0, 160)));
  console.log('备份在 ' + BAK);
} else {
  const data = JSON.parse(fs.readFileSync(BAK, 'utf8'));
  await post('/api/decorate/draft', { key: 'p296', data });
  const pb = await post('/api/decorate/publish', { key: 'p296', note: '还原' });
  console.log('还原并发布：' + (pb.code === 0 ? 'ok' : JSON.stringify(pb).slice(0, 160)));
}
