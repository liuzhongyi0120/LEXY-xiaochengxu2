/**
 * 装修台「手机预览居中」—— 浏览器实测验收
 *
 * 需求（2026-10-10）：「装修预览要居中」。
 * 这条只有真去量渲染几何才能验：CSS 静态看 `.phone-stage` 明明写了 `align-items: center`，
 * 但 `.phone` 自己的 `align-self: flex-start` 会把它**覆盖**掉 → 实测手机一直贴左。
 *
 * 验四件事：
 *   1. 预览列足够宽时，手机在列内**左右留白相等**（居中），机型标签也跟着居中
 *   2. computedStyle(.phone).alignSelf 不再是 flex-start（防「改回旧写法」）
 *   3. 切到 414 机型（zoom 1.104）后仍然居中
 *   4. **安全回退**：把预览列压到比手机还窄时，手机必须退化成左对齐且横向能滚到底
 *      —— 若改成 align-items/justify-content 居中，这里会「左半边被顶出容器、滚不回去」
 *
 * 前置：node server/index.js + CDP 代理（3456）。
 * 用法：node .tooling/probe-admin-center.mjs
 */
const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, wait = 2300) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id || (r.target && r.target.id);
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return '';
  if (r.error) return '';
  if (r.value !== undefined) return typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
  return '';
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });

const ADMIN_PW = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');

/*
 * 一次性把「手机 / 预览列 / 机型标签」三处几何全量出来，避免多次 eval 之间布局变化。
 * ⚠️ 左右留白必须相对**可用区**算（getBoundingClientRect().left + clientLeft 起、宽 clientWidth），
 *    不能用 rect 宽 —— rect 里含垂直滚动条，直接相减会让 8px 滚动条混进留白里，
 *    明明居中也判成「左 259 / 右 267」。
 */
const MEASURE = `(() => {
  const stage = document.querySelector('.phone-stage');
  const phone = document.querySelector('#phone');
  const model = document.querySelector('#phModel');
  if (!stage || !phone) return JSON.stringify({ err: 'no-phone' });
  const s = stage.getBoundingClientRect(), p = phone.getBoundingClientRect();
  const m = model ? model.getBoundingClientRect() : null;
  const boxL = s.left + stage.clientLeft, boxR = boxL + stage.clientWidth;
  return JSON.stringify({
    leftGap: Math.round(p.left - boxL), rightGap: Math.round(boxR - p.right),
    phoneW: Math.round(p.width),
    alignSelf: getComputedStyle(phone).alignSelf,
    marginL: getComputedStyle(phone).marginLeft, marginR: getComputedStyle(phone).marginRight,
    clientW: stage.clientWidth, scrollW: stage.scrollWidth,
    scrollbarW: Math.round(s.width - stage.clientWidth - stage.clientLeft),
    modelCenter: m ? Math.round((m.left + m.right) / 2) : 0,
    phoneCenter: Math.round((p.left + p.right) / 2),
    boxCenter: Math.round((boxL + boxR) / 2),           /* 内容盒中心（判居中用这个） */
    visualCenter: Math.round((s.left + s.right) / 2),   /* 肉眼看到的列中心（判视觉居中） */
    innerW: window.innerWidth
  });
})()`;

console.log('\n[1] 打开装修台并进入首页编辑器');
const tab = await open(SITE + '/admin/');
{
  await run(tab, `(() => {
    const pw = document.getElementById('lgPw');
    if (!pw) return 'logged';
    pw.value = ${JSON.stringify(ADMIN_PW)};
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    const b = [...document.querySelectorAll('#modal button')].find((x) => /登录/.test(x.textContent));
    if (b) b.click();
    return 'clicked';
  })()`);
  await sleep(1600);
  await run(tab, `(() => { const a = document.querySelector('#pageRows [data-open="home"]') || document.querySelector('#pageRows [data-open]'); if (a) a.click(); return 'ok'; })()`);
  await sleep(2400);
  const has = await run(tab, `!!document.querySelector('.phone-stage') && !!document.querySelector('#phone')`);
  ok(has === true || has === 'true', '已进入编辑器且手机壳存在', String(has));
}

console.log('\n[2] 预览列足够宽时：手机左右留白相等');
{
  /* 不论窗口多宽，都把预览列临时固定成 900px —— 测试不该依赖跑测试那台机器的窗口尺寸 */
  await run(tab, `(() => { const s = document.querySelector('.phone-stage'); s.style.flex = '0 0 900px'; return 'ok'; })()`);
  await sleep(500);
  const d = JSON.parse(await run(tab, MEASURE));
  console.log('    几何：' + JSON.stringify(d));
  if (d.err) { ok(false, '量不到手机几何', d.err); }
  else {
    ok(Math.abs(d.leftGap - d.rightGap) <= 2,
      '手机左右留白相等（居中）', '左 ' + d.leftGap + ' / 右 ' + d.rightGap);
    ok(d.alignSelf !== 'flex-start',
      'computedStyle(.phone).alignSelf 不是 flex-start（旧写法会把手机顶到左边）', 'alignSelf=' + d.alignSelf);
    ok(d.marginL === d.marginR,
      '手机用的是水平 auto margin（同一个值，居中靠它而不是容器的 align-items）',
      'margin ' + d.marginL + ' / ' + d.marginR);
    ok(Math.abs(d.modelCenter - d.boxCenter) <= 2,
      '机型标签跟着手机一起居中', '标签中心 ' + d.modelCenter + ' / 列中心 ' + d.boxCenter);
    /* 只占右侧的滚动条会把「内容盒中心」从「肉眼看到的列中心」挤偏 4px，
       scrollbar-gutter: stable both-edges 让两者重合 —— 这条就是钉它的 */
    ok(Math.abs(d.phoneCenter - d.visualCenter) <= 2,
      '手机相对「肉眼看到的列」也是居中的（两侧对称预留滚动条位置）',
      '手机中心 ' + d.phoneCenter + ' / 列视觉中心 ' + d.visualCenter + '（滚动条 ' + d.scrollbarW + 'px）');
  }
}

console.log('\n[3] 切到 414 机型（zoom 等比放大）后仍然居中');
{
  await run(tab, `(() => {
    const sel = document.getElementById('deviceSel');
    sel.value = '414';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(500);
  const d = JSON.parse(await run(tab, MEASURE));
  console.log('    几何：' + JSON.stringify(d));
  ok(!d.err && Math.abs(d.leftGap - d.rightGap) <= 2,
    '414 机型下左右留白仍相等', d.err || ('左 ' + d.leftGap + ' / 右 ' + d.rightGap));
  ok(!d.err && d.phoneW >= 400 && d.phoneW <= 430,
    '手机壳确实按 414 渲染（zoom 生效，不是只改了 width）', 'phoneW=' + d.phoneW);
}

console.log('\n[4] 安全回退：列比手机还窄时退化成左对齐、且能横向滚到底');
{
  await run(tab, `(() => { const s = document.querySelector('.phone-stage'); s.style.flex = '0 0 300px'; return 'ok'; })()`);
  await sleep(500);
  const d = JSON.parse(await run(tab, MEASURE));
  console.log('    几何：' + JSON.stringify(d));
  ok(!d.err && d.clientW < d.phoneW, '预览列确实比手机窄（构造出溢出场景）',
    d.err || ('列 ' + d.clientW + ' vs 手机 ' + d.phoneW));
  /* 左对齐 = 左留白就是列的 padding-left(16)，绝不能是负数（负数 = 左半边被顶出去、滚不回来） */
  ok(!d.err && d.leftGap >= 0 && d.leftGap <= 20,
    '溢出时手机退化为左对齐（左留白 = 列内边距，不是负数）', '左留白 ' + d.leftGap);
  ok(!d.err && d.scrollW > d.clientW,
    '横向可滚动（内容总宽 > 列宽，滚得到最左边）', d.err || (d.scrollW + ' > ' + d.clientW));
  /* 真去滚一下，确认最左端能滚出来（scrollLeft 归 0 时手机左缘可见） */
  const scrolled = JSON.parse(await run(tab, `(() => {
    const s = document.querySelector('.phone-stage');
    s.scrollLeft = 0;
    const p = document.querySelector('#phone').getBoundingClientRect();
    const sr = s.getBoundingClientRect();
    return JSON.stringify({ visible: p.left >= sr.left - 1, scrollLeft: s.scrollLeft });
  })()`));
  ok(scrolled.visible === true, '滚到最左时手机左缘可见（没有被容器裁掉）', JSON.stringify(scrolled));
}

console.log('\n[5] 复原并收尾');
{
  await run(tab, `(() => {
    const s = document.querySelector('.phone-stage');
    s.style.removeProperty('flex');
    const sel = document.getElementById('deviceSel');
    sel.value = '375';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(400);
  const d = JSON.parse(await run(tab, MEASURE));
  ok(!d.err && Math.abs(d.leftGap - d.rightGap) <= 2, '复原后（按真实窗口宽）仍居中',
    d.err || ('窗口 ' + d.innerW + ' ／ 左 ' + d.leftGap + ' / 右 ' + d.rightGap));
  await close(tab);
  console.log('  已关闭测试标签页');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
