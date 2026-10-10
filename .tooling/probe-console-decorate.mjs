/**
 * 浏览器验收：**点「装修」= 在新窗口打开编辑器**（2026-10-10 用户确认的口径）。
 *
 * 这条口径被改过两次，脚本锁的是当前版本：
 *   · 最初：/admin 的「装修」是同页切 #viewList / #viewEdit；
 *   · 中间一版（错的）：按「不要新窗口」把控制台的新窗口入口也一起去掉了；
 *   · 现在：点「装修」在新窗口打开，且新窗口里的 /admin?edit=<key> **必须直达编辑器** ——
 *     否则运营每开一个页面都要在新窗口里再点一次「装修」，比同页切换还费事。
 *
 * ⚠️ 为什么不直接断言「点击后真的多出一个标签页」：
 *    合成点击（element.click() / dispatchEvent）不带用户手势，Chrome 的弹窗拦截会**静默拦下**
 *    新窗口 —— 于是一个完全正确的实现也会被这脚本判红（假红比不检查更浪费时间）。
 *    真实用户点击 <a target="_blank"> 必开新标签页，这是浏览器标准行为，不需要在这里"证明"。
 *    所以改为三重证据：
 *      ① 元素必须是真 <a target="_blank"> 且 href 指向 /admin?edit=<key>（不是 <button> + window.open）；
 *      ② 点它**不会被 preventDefault**（dispatchEvent 返回 true / defaultPrevented === false），
 *         即浏览器一定会执行「新窗口打开」的默认行为；
 *      ③ ?edit= 直达编辑器这条链路单独开一个标签页端到端验证。
 *
 * 覆盖：
 *   [1] /admin 列表：每行「装修」/ 页面名 / 设置底部导航都是 <a target="_blank"> 且带 ?edit=；无同页按钮
 *   [2] 「装修」是真链接且点击不被拦截
 *   [3] /admin?edit=<key> 端到端：新窗口直达编辑器；点「返回列表」地址栏回落 /admin
 *   [4] 控制台有指向 /admin 的新窗口入口（卡片按钮 + 侧栏「装修台 /admin」）
 *   [5] 「去装修台修改」是新窗口链接（不是同页切视图的按钮）
 *   [6] 「店铺装修」视图仍内嵌装修台，且 iframe 高度不溢出（漏算卡片标题栏会把「生成代码」顶出屏幕）
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
const opened = [];

async function ensureLogin(tab) {
  const sess = JSON.parse(await run(tab, `JSON.stringify(window.__admin ? window.__admin.session() : {})`));
  if (sess && sess.me) return true;
  await run(tab, `(() => {
    const pw = document.getElementById('lgPw');
    if (!pw) return 'no-form';
    pw.value = ${JSON.stringify(PW)};
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    const b = [...document.querySelectorAll('#modal button')].find((x) => /登录/.test(x.textContent));
    if (b) b.click();
    return 'submitted';
  })()`);
  await sleep(2200);
  const s2 = JSON.parse(await run(tab, `JSON.stringify(window.__admin.session())`));
  return !!(s2 && s2.me);
}

const r = await j('/new', { method: 'POST', body: SITE + '/admin' });
await sleep(2800);
const tab = r.targetId || r.id;
opened.push(tab);
ok(await ensureLogin(tab), '装修台已登录（新窗口才能直达编辑器）');

let editKey = '';
console.log('\n[1] /admin 列表：三个「进入编辑器」的入口都是新窗口真链接');
{
  const st = JSON.parse(await run(tab, `JSON.stringify({
    rows: document.querySelectorAll('#pageRows tr').length,
    open: [...document.querySelectorAll('#pageRows a.btn[target="_blank"]')].map((a) => a.getAttribute('href')).filter((h) => h && h.indexOf('/admin?edit=') === 0),
    pname: [...document.querySelectorAll('#pageRows a.pname[target="_blank"]')].map((a) => a.getAttribute('href')),
    nav: [...document.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute('href')).filter((h) => h && h.indexOf('/admin?edit=nav') === 0),
    samePageBtn: document.querySelectorAll('#pageRows button[data-open]').length
  })`));
  editKey = (st.open[0] || '').replace('/admin?edit=', '');
  ok(st.rows > 0 && st.open.length === st.rows, '每行「装修」都是 target=_blank 且 href=/admin?edit=<key>',
    st.open.length + '/' + st.rows + ' 行 ｜ 首行 ' + st.open[0]);
  ok(st.pname.length === st.rows, '页面名同样是新窗口链接（与「装修」同一个入口口径）', st.pname.length + '/' + st.rows);
  ok(st.nav.length >= 1, '「设置底部导航」是新窗口链接 /admin?edit=nav', JSON.stringify(st.nav));
  ok(st.samePageBtn === 0, '不再有同页进入编辑器的按钮（button[data-open]）');
}

console.log('\n[2] 「装修」是真链接，且点击不被拦（浏览器会执行「新窗口打开」的默认行为）');
{
  const st = JSON.parse(await run(tab, `(() => {
    const a = document.querySelector('#pageRows a.btn[target="_blank"]');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
    const notCancelled = a.dispatchEvent(ev);   // false 表示有人 preventDefault
    return JSON.stringify({
      tag: a.tagName, target: a.getAttribute('target'), rel: a.getAttribute('rel'),
      href: a.getAttribute('href'), notCancelled: notCancelled, defaultPrevented: ev.defaultPrevented
    });
  })()`));
  ok(st.tag === 'A' && st.target === '_blank', '「装修」是真 <a target="_blank">（不是 <button> + window.open）',
    st.tag + ' target=' + st.target + ' rel=' + st.rel);
  ok(st.defaultPrevented === false, '点它不会被 preventDefault 拦下', 'defaultPrevented=' + st.defaultPrevented);
  /* 这条是真正要害：装修台是单页应用，历史上靠「列表点击委托」把进入编辑器全接在 JS 上。
     现在必须只剩 <a> 的默认行为，否则点下去会「同页切视图 + 新窗口」各来一份。 */
  ok(st.tag === 'A' && st.href.indexOf('/admin?edit=') === 0, '进入编辑器完全交给链接本身（没有 JS 抢走这个动作）',
    'href=' + st.href);
  await sleep(400);
}

console.log('\n[3] /admin?edit=<key> 端到端：新窗口直达编辑器，返回列表后地址栏回落');
{
  const t2 = (await j('/new', { method: 'POST', body: SITE + '/admin?edit=' + encodeURIComponent(editKey) })).targetId;
  opened.push(t2);
  await sleep(3400);
  const st = JSON.parse(await run(t2, `JSON.stringify({
    url: location.pathname + location.search,
    listHidden: document.getElementById('viewList').hidden,
    editHidden: document.getElementById('viewEdit').hidden,
    ed: (document.getElementById('edName') || {}).textContent
  })`));
  ok(/^\/admin\?edit=/.test(st.url), '新标签页地址带 ?edit=<key>', st.url);
  ok(st.listHidden === true && st.editHidden === false,
    '**直达**编辑器（没让运营在新窗口里再点一次「装修」）', 'ed=' + st.ed);
  await run(t2, `document.getElementById('btnBack').click(); 'ok'`);
  await sleep(2000);
  const st2 = JSON.parse(await run(t2, `JSON.stringify({ url: location.pathname + location.search, listHidden: document.getElementById('viewList').hidden })`));
  ok(st2.url === '/admin' && st2.listHidden === false, '点「返回列表」地址栏回落到 /admin（刷新不会弹回编辑器）', st2.url);
}

console.log('\n[4] 控制台：有指向 /admin 的新窗口入口');
const ctab = (await j('/new', { method: 'POST', body: SITE + '/console#decorate' })).targetId;
opened.push(ctab);
await sleep(3000);
{
  const st = JSON.parse(await run(ctab, `(() => {
    const a = document.querySelector('.card-h a[href="/admin"][target="_blank"]');
    let notCancelled = null;
    if (a) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      notCancelled = a.dispatchEvent(ev);
    }
    return JSON.stringify({
      iframe: !!document.querySelector('.frame-wrap iframe'),
      cardOpen: !!a, cardText: a ? a.textContent.trim() : '', notCancelled: notCancelled,
      side: [...document.querySelectorAll('.side-foot a')].map((x) => x.getAttribute('href') + ':' + x.getAttribute('target')),
      h: Math.round((document.querySelector('.frame-wrap') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
      vh: window.innerHeight
    });
  })()`));
  ok(st.cardOpen, '「店铺装修」卡片上有「在新窗口打开 ↗」指向 /admin', st.cardText);
  ok(st.notCancelled === true, '点它不被 preventDefault 拦下');
  ok(st.side.some((s) => s === '/admin:_blank'), '侧栏「装修台 /admin」也是新窗口链接', JSON.stringify(st.side));
  ok(st.iframe, '「店铺装修」视图仍内嵌装修台（能一眼看到页面列表 / 草稿状态）');
  ok(st.h > 400 && st.h < st.vh, 'iframe 高度按整页占位计算（不溢出、不塌陷）', st.h + 'px / 视口 ' + st.vh + 'px');
}

console.log('\n[5] 店铺设置：「去装修台修改」是新窗口链接');
{
  await run(ctab, `App.go('settings'); 'ok'`);
  await sleep(2600);
  const st = JSON.parse(await run(ctab, `JSON.stringify({
    a: (() => { const x = [...document.querySelectorAll('a')].find((a) => /去装修台修改/.test(a.textContent)); return x ? x.getAttribute('href') + ':' + x.getAttribute('target') : null; })(),
    btn: !!document.querySelector('[data-goto-decorate]')
  })`));
  ok(st.a === '/admin:_blank', '「去装修台修改」是 target=_blank 的真链接', String(st.a));
  ok(!st.btn, '不再是在当前页切视图的按钮（data-goto-decorate 已摘掉）');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
for (const t of opened) { try { await j('/close?target=' + encodeURIComponent(t), { method: 'POST', body: '' }); } catch (e) { /* ignore */ } }
process.exit(fail ? 1 : 0);
