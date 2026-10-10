/**
 * 数字步进器（.numf）实机验收：加一个带 number 字段的组件，量尺寸 + 点 −/+ 看值有没有变。
 *
 * 为什么单独有这一支：步进器有两条**只在真渲染里才暴露**的坑 ——
 *   ① CSS 选择器少写 `.fld` 前缀 → 被 `.fld > label + *` 的 `flex: 1 1 0` 撑满整行（100px → 通栏）；
 *   ② −/+ 只改 DOM 不写数据 → 看起来在动、保存后其实没生效。
 * 静态断言只能覆盖 ①，② 必须真点。
 *
 * 安全：只在浏览器内存里加/删区块，**从不点「存至草稿」**，结束前把区块删掉回到基线。
 */
const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + msg + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  ✗ ' + msg + (extra ? '  [' + extra + ']' : '')); }
};

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
async function ev(id, js) {
  const d = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (d && typeof d.value === 'string') { try { return JSON.parse(d.value); } catch (e) { return d.value; } }
  if (d && 'value' in d) return d.value;
  return d;
}

const pw = process.env.ADMIN_PASSWORD || 'admin';
const lr = await fetch(SITE + '/api/admin/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw })
});
const tk = (await lr.json()).data.token;

const r = await j('/new', { method: 'POST', body: SITE + '/admin/' });
const id = r.targetId || r.id;
await sleep(1600);
await j('/eval?target=' + id, { method: 'POST', body: `localStorage.setItem('lexy_admin_token', ${JSON.stringify(tk)}); 1` });
await j('/navigate?target=' + id, { method: 'POST', body: SITE + '/admin/' });
await sleep(2200);

/* 登录（口令由 ADMIN_PASSWORD 提供，非生产默认 admin） */
await ev(id, `(() => {
  const pw = document.getElementById('lgPw');
  if (!pw) return 'logged';
  pw.value = ${JSON.stringify(pw)};
  pw.dispatchEvent(new Event('input', { bubbles: true }));
  const b = [...document.querySelectorAll('#modal button')].find((x) => /登录/.test(x.textContent));
  if (b) b.click();
  return 'clicked';
})()`);
await sleep(1600);

/* 进首页编辑器 */
await ev(id, `(() => { const b = document.querySelector('#pageRows [data-open="home"]') || document.querySelector('#pageRows [data-open]'); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`);
await sleep(2400);

/* 切到「基础组件」tab（默认停在常用，那里没有「限时折扣」） */
await ev(id, `(async () => {
  const t = [...document.querySelectorAll('.lib-tabs .lib-tab')].find((x) => /基础组件/.test(x.textContent));
  if (t) { t.click(); await new Promise((r) => setTimeout(r, 500)); }
  return 1;
})()`);

/* 加一个带 number 字段的组件（限时折扣：商品样式 > 页面边距 / 商品间距） */
const before = await ev(id, `String([...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]')).length)`);
const added = await ev(id, `(() => {
  const cards = [...document.querySelectorAll('.lib-item')];
  const c = cards.find((x) => /限时折扣/.test(x.textContent));
  if (!c) return 'notfound:' + cards.length;
  c.click(); return 'ok';
})()`);
await sleep(1600);
ok(added === 'ok', '组件库能点「限时折扣」', String(added));

/* 展开所有折叠分组，让 number 字段露出来 */
await ev(id, `(() => { document.querySelectorAll('.col-inspector .grp-head').forEach(h => { const g = h.parentElement; if (g && !g.classList.contains('open')) h.click(); }); return 1; })()`);
await sleep(600);

const nums = await ev(id, `(() => {
  return JSON.stringify([...document.querySelectorAll('.col-inspector .numf')].map(e => {
    const r = e.getBoundingClientRect();
    const btns = [...e.querySelectorAll('.nb')].map(b => b.textContent);
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, btns, v: (e.querySelector('.nv') || {}).value };
  }));
})()`);
console.log('  numf 实测：' + JSON.stringify(nums));

const list = Array.isArray(nums) ? nums : [];
ok(list.length > 0, '属性面板里出现了数字步进器', list.length + ' 个');
if (list.length) {
  const w = list[0].w, h = list[0].h;
  /* 有赞实测整块 100×32。允许 1px 误差（描边 / 取整） */
  ok(Math.abs(w - 100) <= 2, '步进器宽 100px（没被 flex:1 1 0 撑满整行）', w + 'px');
  ok(Math.abs(h - 32) <= 2, '步进器高 32px', h + 'px');
  ok(JSON.stringify(list[0].btns) === JSON.stringify(['–', '+']), '两侧是 − / + 两个按钮', JSON.stringify(list[0].btns));
}

/* 点 + 与 −，看值有没有真的变（不只是 DOM 变） */
const clickRes = await ev(id, `(async () => {
  const box = document.querySelector('.col-inspector .numf');
  if (!box) return JSON.stringify({ err: 'no numf' });
  const nv = box.querySelector('.nv');
  const plus = [...box.querySelectorAll('.nb')].find(b => b.textContent === '+');
  const minus = [...box.querySelectorAll('.nb')].find(b => b.textContent === '–');
  const v0 = nv.value;
  plus.click(); await new Promise(r => setTimeout(r, 160));
  const v1 = nv.value;
  plus.click(); await new Promise(r => setTimeout(r, 160));
  const v2 = nv.value;
  minus.click(); await new Promise(r => setTimeout(r, 160));
  const v3 = nv.value;
  return JSON.stringify({ v0, v1, v2, v3 });
})()`);
console.log('  点按序列：' + JSON.stringify(clickRes));
if (clickRes && !clickRes.err) {
  ok(Number(clickRes.v1) === Number(clickRes.v0) + 1, '点 + 一次值 +1', clickRes.v0 + ' → ' + clickRes.v1);
  ok(Number(clickRes.v2) === Number(clickRes.v1) + 1, '再点 + 一次再 +1', clickRes.v1 + ' → ' + clickRes.v2);
  ok(Number(clickRes.v3) === Number(clickRes.v2) - 1, '点 − 一次值 −1', clickRes.v2 + ' → ' + clickRes.v3);
}

/* 关键：值有没有真的写进装修数据（只改 DOM 不算） */
const wrote = await ev(id, `(() => {
  const box = document.querySelector('.col-inspector .numf');
  if (!box) return 'no';
  const nv = box.querySelector('.nv');
  const plus = [...box.querySelectorAll('.nb')].find(b => b.textContent === '+');
  const v = Number(nv.value);
  plus.click();
  return String(v);
})()`);
await sleep(300);
await ev(id, `(() => { const b = document.querySelector('#libList'); return 1; })()`);
/* 用「另选一次该区块 → 面板回显的值」来判断数据是否真被写了。
   ⚠️ 重新选中会**重建属性面板**，折叠分组回到「折叠」初始态 —— 不重新展开就取不到 .numf
   （第一版漏了这步，把「组折叠了」误报成「值没写进去」）。 */
const reShown = await ev(id, `(async () => {
  const items = [...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]'));
  const last = items[items.length - 1];
  if (!last) return 'no-node';
  last.click();
  await new Promise(r => setTimeout(r, 500));
  document.querySelectorAll('.col-inspector .grp-head').forEach(h => {
    const g = h.parentElement; if (g && !g.classList.contains('open')) h.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const boxes = [...document.querySelectorAll('.col-inspector .numf')];
  return boxes.length ? String((boxes[0].querySelector('.nv') || {}).value) : 'no-numf:' + boxes.length;
})()`);
console.log('  数据回显：点 + 前=' + wrote + '，重新选中后读回=' + reShown);
ok(String(reShown) === String(Number(wrote) + 1), '点 + 后值真的写进了装修数据（重新选中仍读到新值）', wrote + ' → ' + reShown);

await j('/screenshot?target=' + id + '&file=' + encodeURIComponent('C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_ours-numf.png'));

/* 收尾：把加进去的区块删掉，不保存 */
await ev(id, `(() => {
  const items = [...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]'));
  const last = items[items.length - 1];
  if (last) last.querySelector('[data-rm]').click();
  return 1;
})()`);
await sleep(700);
const cleaned = await ev(id, `String([...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]')).length)`);
ok(Number(cleaned) === Number(before), '收尾：删掉测试区块，区块数回到基线', before + ' → ' + cleaned);

console.log('\n' + '─'.repeat(56));
console.log(' 结果：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('─'.repeat(56));
await j('/close?target=' + id);
process.exit(fail ? 1 : 0);
