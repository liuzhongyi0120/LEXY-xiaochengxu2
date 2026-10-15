/**
 * 最小复现：笔记的「生成代码」门是不是真的能被**无关操作**绕过去。
 *
 * 已知线索（.tooling/_watch-shopnotes.mjs 实测）：
 *   删掉笔记 B 时重建 replica.js，结果把**从没点过「生成代码」**的笔记 A 也写进了 SHOPNOTES。
 *
 * 机理（读 store.js）：
 *   publish() / remove() / create() 都用 `publishedAll()` 组装全量数据再整份写 replica.js，
 *   而 publishedAll() 对每篇**已注册**笔记都返回 shopnotes.publishedContent(id) ——
 *   注册表里的 published 是「建号时的初始内容」，并不是「已下发」。
 *
 * 本脚本验三种触发方式，看哪一种会把未生成的笔记泄漏进 replica.js：
 *   ① 发布首页（运营每天都会做的动作）
 *   ② 删掉另一篇笔记
 * 跑完逐字节还原 replica.js。
 *   node .tooling/_probe-note-leak.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE = 'http://127.0.0.1:3000';
const PW = process.env.ADMIN_PASSWORD || 'admin';
const REPLICA = join(dirname(fileURLToPath(import.meta.url)), '..', 'miniprogram/config/replica.js');
const BEFORE = readFileSync(REPLICA);
const TA = '探针-泄漏A-可删';
const TB = '探针-泄漏B-可删';

let T = '';
async function api(m, p, b) {
  const o = { method: m, headers: { Authorization: 'Bearer ' + T } };
  if (b !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); }
  const r = await fetch(SITE + p, o);
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const inReplica = (key) => readFileSync(REPLICA, 'utf8').indexOf('"' + key.replace(/^note-/, '') + '":') >= 0;
const hasShopNotes = () => /SHOPNOTES/.test(readFileSync(REPLICA, 'utf8'));

const lg = await api('POST', '/api/admin/login', { password: PW });
T = lg.data && lg.data.token;
if (!T) { console.log('✗ 登录失败'); process.exit(1); }

/* 清残留 */
const pre = await api('GET', '/api/decorate/notes');
for (const n of ((pre.data && pre.data.list) || [])) {
  if (n.title === TA || n.title === TB) await api('POST', '/api/decorate/note/delete', { key: n.key });
}

const a = await api('POST', '/api/decorate/note/create', { title: TA, summary: '', tags: '' });
const keyA = a.data && a.data.key;
const b = await api('POST', '/api/decorate/note/create', { title: TB, summary: '', tags: '' });
const keyB = b.data && b.data.key;
console.log('建了两篇：A=' + keyA + ' B=' + keyB);
console.log('  建完 replica.js 有 SHOPNOTES 段吗 = ' + hasShopNotes() + '；A 在里面吗 = ' + inReplica(keyA));

/* ① 给 **B** 点一次「生成代码」（最现实的场景：运营发布其中一篇） */
const blocks = [{
  id: 'pk1', type: 'text', text: '探针内容', size: 'md',
  color: '#333333', bg: '#FFFFFF', align: 'left', link: '', showSplitLine: false
}];
const dRes = await api('POST', '/api/decorate/draft', {
  key: keyB, data: { header: { title: TB, summary: '', tags: '' }, body: { html: '<p>x</p>', bg: '#ffffff', full: '1' }, blocks }
});
const pubB = await api('POST', '/api/decorate/publish', { key: keyB, note: '探针（脚本）' });
console.log('\n① 给 B 点「生成代码」 存草稿 code=' + dRes.code + '　发布 code=' + pubB.code + ' ' + (pubB.msg || ''));
console.log('   B 在 replica.js 里吗 = ' + inReplica(keyB) + '　（期望 true）');
console.log('   A 在 replica.js 里吗 = ' + inReplica(keyA) + '　（期望 false：A 没点过「生成代码」）');

/* ② 删掉 B */
const delB = await api('POST', '/api/decorate/note/delete', { key: keyB });
console.log('\n② 删掉 B code=' + delB.code);
console.log('   A 在 replica.js 里吗 = ' + inReplica(keyA) + '　（期望 false）');

/* ③ 直接问接口：A 现在被判成「已生成代码」了吗 */
const pages = await api('GET', '/api/decorate/pages');
const rowA = ((pages.data && pages.data.list) || []).filter((p) => p.key === keyA)[0] || {};
console.log('\n③ 接口对 A 的判定：generated=' + rowA.generated + ' status=' + rowA.status +
  '　（期望 generated=false / 未生成代码）');

/* 收尾 */
await api('POST', '/api/decorate/note/delete', { key: keyA });
writeFileSync(REPLICA, BEFORE);
console.log('\n收尾：删 A、replica.js 逐字节还原 → ' +
  (Buffer.compare(BEFORE, readFileSync(REPLICA)) === 0 ? '一致 ✓' : '不一致 ✗'));
