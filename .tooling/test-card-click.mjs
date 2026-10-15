/**
 * 真机那一层的「点得动」验证：新闻大事 / 用户分享 两页卡片 → 笔记详情页。
 *
 * 为什么单开一个脚本：
 *   - `/preview` 是**静态渲染**（只编译真机源码），不模拟 wx.navigateTo，点卡片不会跳
 *     （实测点下去毫无反应，不是 bug，是它本来就不跑运行时）；
 *   - `check-cards-link.mjs` 验的是**后台数据**（卡片有没有 link、笔记在不在）；
 *   - 本脚本验的是**小程序端真机代码**：把 61 条 link 逐条喂给
 *     `miniprogram/utils/link.js` 的 openLink（跳转的唯一实现），看它到底做了什么。
 *
 * 判据落在「wx 被怎么调用」上，这才等价于真机上的那一次点击：
 *   · 必须走 wx.navigateTo（走成 switchTab 会把 ?id= 丢掉 → 打开的是列表不是那篇笔记）；
 *   · url 必须是 /packageNews/note/note?id=<id> 且该 id 在已发布的笔记里；
 *   · 不许落到 fail 分支（那会弹「页面暂未开放」）。
 *
 * 用法：node .tooling/test-card-click.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TOK = readFileSync('.tooling/_tok.txt', 'utf8');
const B = 'http://127.0.0.1:3000';
const get = async (p) => (await (await fetch(B + p, { headers: { Authorization: 'Bearer ' + TOK } }))).json();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  — ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ---------- 用一个假的 wx 接住「真机上会发生什么」 ---------- */
const calls = [];
global.wx = {
  navigateTo(o) { calls.push({ api: 'navigateTo', url: o.url }); },
  switchTab(o) { calls.push({ api: 'switchTab', url: o.url }); },
  showToast(o) { calls.push({ api: 'showToast', title: o.title }); },
  setClipboardData(o) { calls.push({ api: 'setClipboardData' }); o.success && o.success(); },
  makePhoneCall(o) { calls.push({ api: 'makePhoneCall' }); }
};

const requireHere = createRequire(import.meta.url);
const link = requireHere(join(ROOT, 'miniprogram', 'utils', 'link.js'));

console.log('--- 真机层：卡片点击会跳到哪 ---\n');

/* 已发布笔记的 id 集合（真机上只有这些 id 打得开） */
const notes = await get('/api/decorate/notes');
const liveIds = new Set(((notes.data && notes.data.list) || []).map((n) => String(n.id)));
ok('先取到已发布笔记清单（作为「id 是否打得开」的判据）', liveIds.size > 0, liveIds.size + ' 篇');

const cards = [];
for (const key of ['p296', 'p299']) {
  const page = await get('/api/decorate/page?key=' + key);
  ((page.data && page.data.published && page.data.published.blocks) || []).forEach((b) => {
    if (b.type !== 'tab_cate') return;
    (b.tabs || []).forEach((tb) => (tb.items || []).forEach((it) => {
      cards.push({ key, tab: tb.name, title: it.title, link: it.link });
    }));
  });
}
ok('取到两页的卡片', cards.length > 0, cards.length + ' 张');

const wrongApi = [], badUrl = [], toasted = [], noAction = [];
for (const c of cards) {
  calls.length = 0;
  const acted = link.openLink(c.link);
  const nav = calls.find((x) => x.api === 'navigateTo');
  const tab = calls.find((x) => x.api === 'switchTab');
  const toast = calls.find((x) => x.api === 'showToast');
  if (!acted || (!nav && !tab)) { noAction.push('[' + c.tab + '] ' + JSON.stringify(c.title) + ' → ' + JSON.stringify(c.link)); continue; }
  if (tab) { wrongApi.push('[' + c.tab + '] 走成 switchTab：' + tab.url); continue; }
  if (toast) { toasted.push('[' + c.tab + '] ' + toast.title); continue; }
  const m = /^\/packageNews\/note\/note\?id=(\d+)$/.exec(nav.url);
  if (!m) { badUrl.push('[' + c.tab + '] ' + nav.url); continue; }
  if (!liveIds.has(m[1])) badUrl.push('[' + c.tab + '] id=' + m[1] + ' 不在已发布笔记里');
}

ok('每张卡片点下去都真的发起了跳转（不是「什么都没发生」）',
  noAction.length === 0, noAction.length ? noAction.slice(0, 3).join('；') : cards.length + ' 张全部发起跳转');
ok('全部走 navigateTo（走成 switchTab 会把 ?id= 丢掉，打开的是列表不是那篇笔记）',
  wrongApi.length === 0, wrongApi.length ? wrongApi.slice(0, 3).join('；') : 'switchTab 0 次');
ok('没有一张落到「页面暂未开放」的兜底提示（那说明地址没被认出来）',
  toasted.length === 0, toasted.length ? toasted.slice(0, 3).join('；') : 'toast 0 次');
ok('跳转地址逐条对：/packageNews/note/note?id=<id> 且该 id 已发布',
  badUrl.length === 0, badUrl.length ? badUrl.slice(0, 3).join('；') : cards.length + ' 条地址全部命中已发布笔记');

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
/* 用 exitCode 而不是 process.exit()：后者会在 fetch 的句柄还没收干净时硬退，
   Windows 上打印一行 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`，
   看着像崩了，其实是退出姿势的问题。 */
process.exitCode = fail ? 1 : 0;
