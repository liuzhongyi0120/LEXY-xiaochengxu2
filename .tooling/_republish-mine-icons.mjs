/**
 * 把「必备工具」的图标（第 52 批：汉字 → 有赞图标基名）写回「我的」页草稿并走**真实发布器**。
 *
 * 为什么必须重灌：`plugins[].icon` 是**烘进装修数据**的值，真机与装修台预览都读区块数据本身
 *   （`blocks.js` 的 `TOOL_META` 只是老数据的兜底）。只改代码不重灌 → 线上那份还是汉字，
 *   装修台预览会显示「无图标」、而真机靠兜底能显示图标 = **两侧走样**。
 *
 * 为什么不能直接改 replica.js / state.json：
 *   · 直改 replica.js 会被下一次发布整体覆盖，且绕过发布器的语法与回读校验；
 *   · 直改 state.json 更危险：服务在跑（store.js 是内存态 + 50ms 落盘），改了立刻被内存覆盖。
 *   所以走 HTTP：草稿 → 发布，让发布器自己写回 replica.js（哈希 + 备份 + 校验）。
 *
 * ⚠️ 这次是**最小改动**：只把 `icon` 换成 `UC_TOOL_ITEMS` 里的基名，
 *    其余字段（title / show / scope / real / enabled）**原样保留运营的当前值**。
 *    上一轮是整条 plugins 重建（那一轮要新增两项、改 4 项 real），这一轮不该再动别的。
 *
 * 用法： node .tooling/_republish-mine-icons.mjs [--apply]
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const req = createRequire(import.meta.url);
const { UC_TOOL_ITEMS } = req(join(process.cwd(), 'server', 'decorate', 'yzUserCenter.js'));

async function api(method, path, { body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = { code: -1, msg: text.slice(0, 200) }; }
  return { http: res.status, json };
}

const login = await api('POST', '/api/admin/login', { body: { password: process.env.ADMIN_PASSWORD || 'admin' } });
if (!login.json || login.json.code !== 0) {
  console.error('管理员登录失败：', login.http, JSON.stringify(login.json));
  process.exit(1);
}
const token = login.json.data ? login.json.data.token : login.json.token;
console.log('管理员会话已建立');

const page = await api('GET', '/api/decorate/page?key=mine', { token });
if (!page.json || page.json.code !== 0) {
  console.error('读取「我的」页失败：', page.http, JSON.stringify(page.json).slice(0, 300));
  process.exit(1);
}
const data = (page.json.data && (page.json.data.data || page.json.data.published)) || page.json.data;
const blocks = data.blocks || [];
const src = blocks.filter((b) => b && b.type === 'uc_tools')[0];
if (!src) {
  console.error('已发布数据里没有 uc_tools 区块'); process.exit(1);
}
const before = src.plugins || [];
console.log('当前 uc_tools：%d 项', before.length);

const iconOf = {};
UC_TOOL_ITEMS.forEach((it) => { iconOf[it.type] = it.icon || ''; });

const nextPlugins = before.map((p) => {
  const ic = iconOf[p.type];
  return ic === undefined ? p : Object.assign({}, p, { icon: ic });
});
/* 清单里有、数据里没有的项 —— 报出来但不擅自新增（这一轮只改图标） */
const missing = UC_TOOL_ITEMS.filter((it) => !before.some((p) => p.type === it.type)).map((it) => it.type);
if (missing.length) console.log('⚠️ 清单里有但数据里没有的项（本轮不新增）：', missing.join(', '));

const diffs = nextPlugins
  .map((p, i) => ({ type: p.type, from: before[i].icon, to: p.icon }))
  .filter((d) => String(d.from || '') !== String(d.to || ''));
console.log('需要改图标 %d 项：', diffs.length);
diffs.forEach((d) => console.log('   %s : %s → %s', d.type.padEnd(26), JSON.stringify(d.from || ''), JSON.stringify(d.to || '')));

if (!diffs.length) { console.log('\n已是最新，无需重灌'); process.exit(0); }
if (!APPLY) { console.log('\n[干跑] 加 --apply 才真的写草稿并发布'); process.exit(0); }

const next = Object.assign({}, data, {
  blocks: blocks.map((b) => (b && b.type === 'uc_tools' ? Object.assign({}, b, { plugins: nextPlugins }) : b))
});

const draft = await api('POST', '/api/decorate/draft', { token, body: { key: 'mine', data: next } });
console.log('存草稿：', draft.http, JSON.stringify(draft.json).slice(0, 200));
if (!draft.json || draft.json.code !== 0) process.exit(1);

const pub = await api('POST', '/api/decorate/publish', {
  token, body: { key: 'mine', note: '个人中心：必备工具图标换成有赞个人中心图标字体复刻版（第 52 批）' }
});
console.log('发布：', pub.http, JSON.stringify(pub.json).slice(0, 300));
if (!pub.json || pub.json.code !== 0) process.exit(1);
console.log('✅ 已重灌');
