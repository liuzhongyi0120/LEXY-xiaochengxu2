/**
 * 把「有赞首页复刻（p481）」搬进内置首页 home，并把底部导航「首页」改回指向真首页。
 *
 * 背景：运营在「店铺导航」里把首页 tab 的 path 改成了 /pages/custom/index?key=p481 ——
 * 但这只改了「点 tab 跳哪儿」，改不动两件更要紧的事：
 *   ① 小程序冷启动进的是 app.json 的 pages[0] = pages/index/index（老首页）
 *   ② 装修台 / 预览默认打开的也是内置首页 home
 * 于是「编辑器里看到的还是老首页」。真正的做法是让内置首页 home 自己变成新内容。
 *
 * 三步（每步都走装修台 API，不手改 replica.js —— 手改会被下次「生成代码」冲掉）：
 *   1. 老首页内容另存成一个自定义页备份（可回滚）
 *   2. home 草稿 ← p481 的 blocks + meta（bg / style 一起搬，保留首页原有的 shop）
 *   3. 底部导航 items[0].path 改回 /pages/index/index
 *
 * 用法：
 *   node .tooling/_swap-home.mjs          试跑（只打印将要做什么）
 *   node .tooling/_swap-home.mjs --apply  真正执行
 */

import adminToken from './_admin.mjs';

const BASE = 'http://127.0.0.1:3000';
const APPLY = process.argv.indexOf('--apply') >= 0;
const BACKUP_KEY = 'homebak';
const BACKUP_NAME = '原首页（换版前备份）';

const t = await adminToken(BASE);
const H = {
  Authorization: 'Bearer ' + t,
  'Content-Type': 'application/json'
};

async function call(method, path, params) {
  const res = await fetch(BASE + path, {
    method: method,
    headers: H,
    body: params === undefined ? undefined : JSON.stringify(params)
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(path + ' → ' + (j.msg || j.code));
  return j.data;
}

const getPage = (k) => call('GET', '/api/decorate/page?key=' + k);
const saveDraft = (k, data) => call('POST', '/api/decorate/draft', { key: k, data: data });
const publish = (k, note) => call('POST', '/api/decorate/publish', { key: k, note: note });
const createPage = (o) => call('POST', '/api/decorate/page/create', o);

const home = (await getPage('home')).data;
const p481 = (await getPage('p481')).data;
const nav = (await getPage('nav')).data;

console.log('== 现状 ==');
console.log('  home : blocks=' + home.blocks.length + ' meta=' + JSON.stringify(home.meta));
console.log('  p481 : blocks=' + p481.blocks.length + ' meta=' + JSON.stringify(p481.meta));
console.log('  nav  : ' + nav.items.map((i) => i.text + '→' + i.path).join(' | '));

const types = [...new Set(p481.blocks.map((b) => b.type))];
console.log('  p481 区块类型: ' + types.join(', '));

if (!APPLY) {
  console.log('\n（试跑模式，加 --apply 才真正执行）');
  console.log('将执行：');
  console.log('  1. 新建备份页 ' + BACKUP_KEY + '「' + BACKUP_NAME + '」，内容 = 老首页 ' + home.blocks.length + ' 区块');
  console.log('  2. home ← p481 的 ' + p481.blocks.length + ' 区块 + meta（bg/style 一起搬），保留 home.shop');
  console.log('  3. nav items[0].path ← /pages/index/index');
  process.exit(0);
}

/* ---------- 1. 备份老首页 ---------- */
console.log('\n== 1. 备份老首页 ==');
let created;
try {
  created = await createPage({ key: BACKUP_KEY, name: BACKUP_NAME, note: '换首页前的原内容，可回滚', template: 'blank' });
  console.log('  已建页:', created.key, created.name);
} catch (e) {
  console.log('  建页失败（可能已存在）：', e.message);
}
await saveDraft(BACKUP_KEY, { blocks: home.blocks, meta: home.meta });
await publish(BACKUP_KEY, '换首页前的原内容备份');
console.log('  已写入备份页并生成代码');

/* ---------- 2. home ← p481 ---------- */
console.log('\n== 2. 搬迁 p481 → home ==');
await saveDraft('home', {
  shop: home.shop,
  blocks: p481.blocks,
  meta: Object.assign({}, p481.meta, { desc: '有赞首页复刻' })
});
await publish('home', '首页换成「有赞首页复刻」（原内容已备份为 ' + BACKUP_KEY + '）');
console.log('  已发布');

/* ---------- 3. 底部导航首页 → 真首页 ---------- */
console.log('\n== 3. 底部导航「首页」指回 /pages/index/index ==');
const items = nav.items.map((it, i) => (i === 0 ? Object.assign({}, it, { path: '/pages/index/index' }) : it));
await saveDraft('nav', Object.assign({}, nav, { items: items }));
await publish('nav', '首页 tab 指回内置首页（此前指向自定义页 p481，导致启动页底部导航全不高亮）');
console.log('  已发布:', items.map((i) => i.text + '→' + i.path).join(' | '));

/* ---------- 4. 回读校验 ---------- */
console.log('\n== 4. 回读校验 ==');
const h2 = (await getPage('home')).data;
const n2 = (await getPage('nav')).data;
const b2 = (await getPage(BACKUP_KEY)).data;
console.log('  home : blocks=' + h2.blocks.length + ' meta=' + JSON.stringify(h2.meta));
console.log('  nav  : ' + n2.items.map((i) => i.text + '→' + i.path).join(' | '));
console.log('  ' + BACKUP_KEY + ' : blocks=' + b2.blocks.length + ' meta=' + JSON.stringify(b2.meta));

const ok = h2.blocks.length === p481.blocks.length &&
  n2.items[0].path === '/pages/index/index' &&
  b2.blocks.length === home.blocks.length;
console.log(ok ? '\n✅ 搬迁完成' : '\n❌ 回读不一致，请检查');
process.exit(ok ? 0 : 1);
