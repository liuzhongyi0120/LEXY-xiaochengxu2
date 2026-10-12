/**
 * 把内置底部导航图标套用到当前导航项上（一次性数据迁移，可复跑）
 *
 * 背景：
 *   图标素材是**代码包内资源**（miniprogram/images/tabbar/，复刻自有赞「店铺导航」的图标字体）。
 *   它在数据层只有一处出处 —— `schema.TABBAR_DEFAULT_ITEMS`，而那是「从没配过导航」
 *   时的兜底。已经发布过导航的站点，replica.TABBAR 里 icon 仍是空串，底部就不会有图标。
 *   所以需要把图标**写进已发布的数据**（replica.TABBAR），这正是本脚本做的事。
 *
 * 为什么不做成「渲染时隐式回落」：
 *   那会让「装修台字段是空的、预览却有图标」——运营改了也不知道改的是什么；
 *   而且 `hasIcon` 会失去意义（每个内置页都恒为 true）。图标是**数据**，就写进数据。
 *
 * 分配规则（三条，按顺序）：
 *   ① 导航项的 path 是内置 5 个 tab 页之一 → 用该页的图标；
 *   ② 否则若**文案**与内置页面名一致（例：第 4 项文案「产品」但指向「全系」微页面）
 *      → 用同名页面的图标。认文案是因为图标与「页面角色」绑定，
 *      而运营把第 4 项改指自定义页时，文案仍然是「产品」；
 *   ③ 都不匹配（真正的自定义页导航项）→ **保持原样**，不硬塞一个不相干的图标。
 *
 * 跑法：node .tooling/apply-tabbar-icons.mjs            # 干跑，只打印将要写入什么
 *       node .tooling/apply-tabbar-icons.mjs --apply    # 存草稿（不发布）
 *       node .tooling/apply-tabbar-icons.mjs --publish  # 存草稿并发布（写回 replica.js）
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const schema = require('../server/decorate/schema');
const REPLICA_FILE = join(process.cwd(), 'miniprogram', 'config', 'replica.js');

const BASE = process.env.MALL_BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const APPLY = process.argv.includes('--apply') || process.argv.includes('--publish');
const PUBLISH = process.argv.includes('--publish');
const KEY = 'nav';

/** 内置页面名 → 该页面的图标（未选中 / 选中） */
const BY_NAME = {};
schema.TABBAR_DEFAULT_ITEMS.forEach((it) => {
  BY_NAME[it.text] = { icon: it.icon, activeIcon: it.activeIcon };
});

function decide(item) {
  const byPath = schema.TABBAR_DEFAULT_ITEMS.filter((d) => d.path === item.path)[0];
  if (byPath) return { icon: byPath.icon, activeIcon: byPath.activeIcon, why: '页面路径命中内置 tab 页' };
  const byText = BY_NAME[item.text];
  if (byText) return { icon: byText.icon, activeIcon: byText.activeIcon, why: '文案命中内置页面名（指向了自定义页）' };
  return { icon: item.icon || '', activeIcon: item.activeIcon || '', why: '自定义页且文案不匹配 → 保持原样' };
}

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  const login = await api('POST', '/api/admin/login', { password: PASSWORD });
  if (login.json.code !== 0) {
    console.log('登录失败：', JSON.stringify(login.json).slice(0, 200));
    process.exit(1);
  }
  const token = login.json.data.token;
  console.log('已登录，角色 =', login.json.data.role);

  const page = await api('GET', '/api/decorate/page?key=' + KEY, null, token);
  if (page.json.code !== 0) {
    console.log('读取页面失败：', JSON.stringify(page.json).slice(0, 200));
    process.exit(1);
  }
  const cur = page.json.data.draft || page.json.data.published;
  if (!cur || !Array.isArray(cur.items)) {
    console.log('导航数据异常：', JSON.stringify(cur).slice(0, 200));
    process.exit(1);
  }
  console.log('来源 =', page.json.data.draft ? '草稿' : '已发布');
  console.log('');

  const next = JSON.parse(JSON.stringify(cur));
  let changed = 0;
  next.items.forEach((it, i) => {
    const d = decide(it);
    const before = { icon: it.icon || '', activeIcon: it.activeIcon || '' };
    if (d.icon !== before.icon || d.activeIcon !== before.activeIcon) changed += 1;
    // ⚠️ 必须真的写回对象 —— 只统计「有几项不同」而不赋值，发布出来会是一个像素都没变
    it.icon = d.icon;
    it.activeIcon = d.activeIcon;
    console.log(`  ${i + 1}. ${it.text} → ${it.path}`);
    console.log(`     ${before.icon || '(空)'}  →  ${it.icon || '(空)'}`);
    console.log(`     ${d.why}${d.icon === before.icon && d.activeIcon === before.activeIcon ? '（无需改动）' : ''}`);
  });

  console.log('');
  console.log('需要改动的项：' + changed + ' / ' + next.items.length);

  if (!changed) {
    console.log('已经是目标状态，无需写入。');
    return;
  }
  if (!APPLY) {
    console.log('干跑模式：未写入任何数据。加 --apply 存草稿，加 --publish 存草稿并发布。');
    return;
  }

  const draft = await api('POST', '/api/decorate/draft', { key: KEY, data: next }, token);
  console.log('存草稿 →', draft.json.code === 0 ? 'OK' : '失败 ' + draft.json.msg);
  if (draft.json.code !== 0) process.exit(1);

  const diff = await api('GET', '/api/decorate/diff?key=' + KEY, null, token);
  console.log('变更清单：' + (diff.json.data ? diff.json.data.total + ' 处' : JSON.stringify(diff.json).slice(0, 160)));

  if (!PUBLISH) {
    console.log('已存草稿（未发布）。到装修台点「生成代码」或加 --publish 参数即可写回 replica.js。');
    return;
  }

  console.log('正在发布（生成代码 + 回读校验，约需 1 分钟）…');
  const pub = await api('POST', '/api/decorate/publish', { key: KEY, note: '加入底部导航内置图标（复刻有赞图标字体）' }, token);
  console.log('发布 →', pub.json.code === 0 ? 'OK' : '失败 ' + pub.json.msg);
  if (pub.json.code !== 0) process.exit(1);
  console.log(JSON.stringify(pub.json.data).slice(0, 300));

  /* 发布后自检：读回 replica.js 核对。**必须真读文件** ——
     「接口返回 ok」不等于「目标数据真的写进去了」（本脚本第一版就踩过：
     只统计了「有几项不同」却没赋值，接口照样返回 ok，replica.js 一个字节没变）。 */
  const code = readFileSync(REPLICA_FILE, 'utf8');
  const mod = { exports: {} };
  new vm.Script('(function(module){' + code + '})(module);').runInNewContext({ module: mod });
  const got = (mod.exports.TABBAR || {}).items || [];
  let bad = 0;
  got.forEach((it, i) => {
    const want = next.items[i] || {};
    const okOne = it.path === want.path && it.icon === want.icon && it.activeIcon === want.activeIcon;
    if (!okOne) bad += 1;
    console.log(`  ${okOne ? '✓' : '✗'} ${it.text} ${it.icon || '(空)'}`);
  });
  if (bad) {
    console.log(`\n自检失败：${bad} 项与目标不一致，replica.js 没有按预期写入。`);
    process.exit(1);
  }
  console.log('\n自检通过：replica.js 里的 ' + got.length + ' 项图标与目标完全一致。');
})();
