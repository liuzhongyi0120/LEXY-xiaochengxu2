/**
 * 浏览器验收：控制台里的「装修」入口一律在**当前页**打开，不新开窗口。
 *
 * 背景（用户反馈）：「店铺装修，点页面装修都在新窗口打开而不是在当前页显示」。
 * 盘查结论：装修台（/admin）点页面行的「装修」本来就是同页切换（本脚本第 5 段复验），
 * 真正会弹新窗口的是控制台里两处 `<a target="_blank">`：
 *   ① 「店铺装修」视图右上角的「在新窗口打开 ↗」
 *   ② 「店铺设置」里的「去装修台修改」
 * 两处已改为当前页动作，本脚本把「不得再出现新窗口入口」「点了不产生新标签页」都锁住。
 *
 * 需要：后端在 3000、CDP 代理在 3456。
 */
import { setTimeout as sleep } from 'node:timers/promises';

const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';
const PW = process.env.ADMIN_PASSWORD || 'admin';
let pass = 0, fail = 0;
const ok = (cond, title, detail) => {
  if (cond) { pass++; console.log('  ✓', title, detail ? '｜' + detail : ''); }
  else { fail++; console.log('  ✗', title, detail ? '｜' + detail : ''); }
};
const j = async (u, o) => { const r = await fetch(P + u, o); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return t; } };
const run = async (id, js) => { const r = await j('/eval?target=' + encodeURIComponent(id), { method: 'POST', body: js }); return r && r.value !== undefined ? r.value : JSON.stringify(r); };
const pageIds = async () => (await (await fetch(P + '/targets')).json()).filter((t) => t.type === 'page').map((t) => t.targetId);

const before = await pageIds();
const r = await j('/new', { method: 'POST', body: SITE + '/console#decorate' });
await sleep(2800);
const tab = r.targetId || r.id;
const extra = async () => (await pageIds()).filter((x) => !before.includes(x) && x !== tab);

console.log('\n[1] 店铺装修视图：装修台内嵌在当前页');
{
  const st = JSON.parse(await run(tab, `JSON.stringify({
    iframe: !!document.querySelector('.frame-wrap iframe'),
    src: (document.querySelector('.frame-wrap iframe') || {}).getAttribute ? document.querySelector('.frame-wrap iframe').getAttribute('src') : '',
    reloadBtn: !!document.querySelector('[data-frame-reload]'),
    defBlank: [...document.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute('href')),
    frameBlank: (() => { const f = document.querySelector('.frame-wrap iframe'); const d = f && f.contentDocument; return d ? [...d.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute('href')) : []; })(),
    h: Math.round((document.querySelector('.frame-wrap') || {}).getBoundingClientRect ? document.querySelector('.frame-wrap').getBoundingClientRect().height : 0),
    vh: window.innerHeight
  })`));
  ok(st.iframe && st.src === '/admin', '装修台以 iframe 内嵌在当前页', 'src=' + st.src);
  ok(st.reloadBtn, '有「刷新装修台」按钮（替代原来的新窗口入口）');
  ok(!st.defBlank.includes('/admin') && !st.frameBlank.includes('/admin'), '控制台与 iframe 内都没有指向 /admin 的新窗口链接',
    JSON.stringify(st.defBlank) + ' / ' + JSON.stringify(st.frameBlank));
  ok(st.h > 400 && st.h < st.vh, 'iframe 高度按整页占位计算（不溢出、不塌陷）', st.h + 'px / 视口 ' + st.vh + 'px');
}

console.log('\n[2] 点「刷新装修台」→ 在当前页重载，不产生新标签页');
{
  const n0 = (await extra()).length;
  await run(tab, `document.querySelector('[data-frame-reload]').click(); 'ok'`);
  await sleep(2600);
  const st = JSON.parse(await run(tab, `JSON.stringify({ src: document.querySelector('.frame-wrap iframe').getAttribute('src'), rows: (() => { const d = document.querySelector('.frame-wrap iframe').contentDocument; return d ? d.querySelectorAll('#pageRows tr').length : -1; })() })`));
  ok(st.src === '/admin' && st.rows > 0, '刷新后装修台重新加载出页面列表', 'src=' + st.src + ' 行数=' + st.rows);
  ok((await extra()).length === n0, '没有多出任何标签页（不是新窗口打开）');
}

console.log('\n[3] 在控制台里点页面行的「装修」→ 在当前页（iframe 内）打开编辑器');
{
  const n0 = (await extra()).length;
  await run(tab, `(() => { const d = document.querySelector('.frame-wrap iframe').contentDocument; const pw = d.getElementById('lgPw'); if (pw) { pw.value = ${JSON.stringify(PW)}; pw.dispatchEvent(new Event('input', { bubbles: true })); const b = [...d.querySelectorAll('#modal button')].find((x) => /登录/.test(x.textContent)); if (b) b.click(); } return 'ok'; })()`);
  await sleep(1600);
  await run(tab, `(() => { const d = document.querySelector('.frame-wrap iframe').contentDocument; d.querySelector('#pageRows button[data-open]').click(); return 'clicked'; })()`);
  await sleep(2600);
  const st = JSON.parse(await run(tab, `(() => { const d = document.querySelector('.frame-wrap iframe').contentDocument; return JSON.stringify({ listHidden: d.getElementById('viewList').hidden, editHidden: d.getElementById('viewEdit').hidden, ed: d.getElementById('edName').textContent, url: location.href }); })()`));
  ok(st.listHidden === true && st.editHidden === false, '编辑器在 iframe 内打开（当前页切换，不是新窗口）', 'ed=' + st.ed);
  ok(st.url.indexOf('/console') >= 0, '控制台地址不变（内容确实落在当前页）', st.url);
  ok((await extra()).length === n0, '没有多出任何标签页');
}

console.log('\n[4] 店铺设置：「去装修台修改」→ 当前页切视图');
{
  const n0 = (await extra()).length;
  await run(tab, `App.go('settings'); 'ok'`);
  await sleep(2600);
  const st = JSON.parse(await run(tab, `JSON.stringify({
    btn: !!document.querySelector('[data-goto-decorate]'),
    blank: [...document.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute('href')),
    samePage: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
  })`));
  ok(st.btn, '「去装修台修改」是按钮（不再是 target=_blank 链接）');
  /* 只锁「新窗口」入口：侧栏底部的「装修台 /admin」是**同页**链接（用户要的正是「在当前页显示」），
     它会把当前标签页导航过去，不属于本次要修的问题，所以不在这里拦。 */
  ok(!st.blank.some((h) => h && h.indexOf('/admin') >= 0), '店铺设置页没有指向 /admin 的**新窗口**入口', JSON.stringify(st.blank));
  await run(tab, `document.querySelector('[data-goto-decorate]').click(); 'ok'`);
  await sleep(2600);
  const st2 = JSON.parse(await run(tab, `JSON.stringify({ hash: location.hash, iframe: !!document.querySelector('.frame-wrap iframe'), h1: (document.getElementById('pgTitle') || {}).textContent })`));
  ok(st2.hash === '#decorate' && st2.iframe, '点击后切到当前页的「店铺装修」视图', st2.hash + ' / ' + st2.h1);
  ok((await extra()).length === n0, '没有多出任何标签页');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
await j('/close?target=' + encodeURIComponent(tab), { method: 'POST', body: '' });
process.exit(fail ? 1 : 0);
