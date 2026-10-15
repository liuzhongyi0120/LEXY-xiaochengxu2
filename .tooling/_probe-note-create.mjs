/* 笔记「建 → 存草稿(封面+正文) → 读回 → 删」链路验证（临时示例，用完即删） */
import fs from 'node:fs';
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8');
const B = 'http://127.0.0.1:3000';
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOK };
const post = async (p, body) => (await (await fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(body) })).json());
const get = async (p) => (await (await fetch(B + p, { headers: H })).json());

const TITLE = '自检：笔记建-存-读-删链路';
const COVER = '/uploads/202610/20261012-p6a88s.jpg';

console.log('1) create');
const c = await post('/api/decorate/note/create', { title: TITLE, summary: '自检摘要', tags: '自检' });
console.log('  ', JSON.stringify(c).slice(0, 200));
const key = c.data && (c.data.key || c.data.note || c.data.page);
if (!key) { console.log('拿不到 key，退出'); process.exit(1); }

console.log('2) 读默认 data');
const p1 = await get('/api/decorate/page?key=' + key);
console.log('   data keys:', Object.keys(p1.data.data || {}));
console.log('   header   :', JSON.stringify((p1.data.data || {}).header));
console.log('   body     :', JSON.stringify((p1.data.data || {}).body));

console.log('3) 存草稿（填 header.covers + body.html）');
const data = JSON.parse(JSON.stringify(p1.data.data));
data.header = Object.assign({}, data.header, { title: TITLE, summary: '自检摘要', tags: '自检', covers: [{ image: COVER }] });
data.body = Object.assign({}, data.body, { html: '<p>自检正文</p>', bg: '#ffffff', full: '1' });
const d = await post('/api/decorate/draft', { key, data });
console.log('  ', JSON.stringify(d).slice(0, 160));

console.log('4) 读回核对');
const p2 = await get('/api/decorate/page?key=' + key);
const dd = p2.data.data || {};
console.log('   draft.header.covers =', JSON.stringify(dd.header && dd.header.covers));
console.log('   draft.body.html     =', JSON.stringify(dd.body && dd.body.html));
console.log('   hasDraft            =', p2.data.hasDraft);

console.log('5) 删除');
const r = await post('/api/decorate/note/delete', { key });
console.log('  ', JSON.stringify(r).slice(0, 160));
