/**
 * 把底部导航「首页」tab 指回内置首页 /pages/index/index。
 *
 * 背景（也是这个脚本存在的理由）：
 *   运营在装修台「店铺导航」里把「首页」指向了 /pages/custom/index?key=p481。
 *   这个配置会让**启动页的底部导航整条不高亮** —— 启动页是 pages/index/index，
 *   它的 onShow → syncTabBar(this) → setActive('/pages/index/index')，
 *   而导航 items 里已经没有这一项了，匹配不到 → index = -1 → 5 个 tab 全灭。
 *
 *   注意这不是「指向哪个页面更好看」的问题：p481 与内置首页内容完全一致
 *   （14 区块、同样沉浸式），画面上没有区别，区别只在导航高亮与页面栈。
 *
 * 用法：
 *   node .tooling/_fix-nav-home.mjs            # 试跑，只打印将要改什么
 *   node .tooling/_fix-nav-home.mjs --apply    # 真正保存草稿 + 发布
 *
 * 走装修台 API，不手改 replica.js —— 手改的会被下一次「生成代码」整体重写冲掉。
 */
import adminToken from './_admin.mjs';

const BASE = 'http://127.0.0.1:3000';
const HOME_PATH = '/pages/index/index';
const argv = process.argv.slice(2);
const APPLY = argv.indexOf('--apply') >= 0;

const t = await adminToken(BASE);
const H = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };

async function getPage(key) {
  const r = await fetch(BASE + '/api/decorate/page?key=' + key, { headers: H });
  return (await r.json()).data || {};
}
async function saveDraft(key, data) {
  const r = await fetch(BASE + '/api/decorate/draft', {
    method: 'POST', headers: H, body: JSON.stringify({ key, data })
  });
  return r.json();
}
async function publish(key, note) {
  const r = await fetch(BASE + '/api/decorate/publish', {
    method: 'POST', headers: H, body: JSON.stringify({ key, note })
  });
  return r.json();
}

const nav = (await getPage('nav')).data || {};
const items = JSON.parse(JSON.stringify(nav.items || []));

console.log('当前底部导航:');
items.forEach((it, i) => console.log('  ' + i + '. ' + (it.text || '') + ' → ' + it.path));

const idx = items.findIndex((it) => (it.text || '').trim() === '首页');
if (idx < 0) {
  console.log('\n❌ 导航里找不到文案为「首页」的项，未改动。');
  process.exit(1);
}
if (items[idx].path === HOME_PATH) {
  console.log('\n✅ 首页 tab 已经是 ' + HOME_PATH + '，无需改动。');
  process.exit(0);
}

console.log('\n将把第 ' + idx + ' 项「' + items[idx].text + '」的路径:');
console.log('   ' + items[idx].path + '  →  ' + HOME_PATH);

if (!APPLY) {
  console.log('\n（试跑，未写入。加 --apply 执行）');
  process.exit(0);
}

items[idx].path = HOME_PATH;
const d = await saveDraft('nav', Object.assign({}, nav, { items }));
console.log('草稿:', d.code, d.msg || '');
const p = await publish('nav', '首页 tab 指回内置首页（指向自定义页 p481 会导致启动页底部导航全不高亮）');
console.log('发布:', p.code, p.msg || '');

/* 回读校验 */

const after = (await getPage('nav')).data || {};
const a = (after.items || [])[idx] || {};
console.log('\n回读: 第 ' + idx + ' 项 = ' + a.text + ' → ' + a.path);
console.log(a.path === HOME_PATH ? '✅ 已生效' : '❌ 未生效');
process.exit(a.path === HOME_PATH ? 0 : 1);
