/**
 * 浏览器验收：装修台列表「操作」列 —— 按钮**不许被压成竖排文字**（2026-10-10 用户反馈）。
 *
 * 用户原话：「红框处显示有问题，下面两个自定义页，后面的字变成竖排了，装修后面不需要有箭头显示」。
 *
 * 这条只能真去量文字盒，肉眼看代码看不出问题：
 *   `.btn.sm` 的高度写死 26px，字被折成两行时**按钮高度不变**，字是【溢出】按钮的
 *   —— 截图里「查看变 / 更」这种竖排就是这么来的。所以量高度没用，要量**文字占了几个行盒**：
 *     const r = document.createRange(); r.selectNodeContents(el);
 *     r.getClientRects().length  // 1 = 一行；≥2 = 折了
 *
 * 根因是**零余量**而不是「列窄」：修复前操作列 392px，内容区 364px；自定义页 6 个按钮
 * （装修/查看变更/版本/丢弃草稿/改名/删除）在用户机器上共需 **369px** —— 只差 5px。
 * flex 默认 flex-shrink:1，于是把每个按钮压窄约 1px；而**中文字只要差 1px 就会折行**
 * （「版本」两个字的行宽就是 24px，容器 23.6px 就够它分成两行），所以 6 个按钮全军覆没。
 * 内置页只有 4 个按钮（需 248px / 可用 364px），余量足 —— 现象只在自定义页那两行，
 * 与用户截图完全吻合（截图里 6 个按钮全都折成竖排，包括只有两个字的「版本」）。
 * 取证依据：用户截图 2230×731 是 125% 缩放的窗口（由「已发布」标签 61 设备 px ÷ 49 CSS px 得到），
 * 按竖边框量出 装修 61 / 查看变更 70 / 版本 46 CSS px，与「未压缩时的自然宽度」逐项吻合。
 *
 * 同日后续：用户要求「把查看变更和版本去掉」→ 按钮 6 → 4 个，操作列 424 → 320px。
 * 本脚本的断言**不依赖按钮数量**（按钮少了只会让余量更大、量测照跑），
 * 所以下架后无需改口径，直接复跑即可；[5] 的反向自证会自动把「折字」造出来验证仪器没空转。
 *
 * 覆盖：
 *   [1] 操作列宽度留有余量（可用宽 − 按钮总宽 = 余量 ≥ 24px），且每行都挂着 ops-row
 *   [2] 每个按钮标签只占 1 个行盒（没有竖排 / 折字），按钮高度一致
 *   [3] 装修台按钮文案不带 ↗ 箭头（用户明确要求），「新窗口」提示改放 title
 *   [4] 把操作列强行压到 120px：标签**仍然**只有 1 行盒、按钮宽度不变（nowrap + flex:0 0 auto 生效）
 *   [5] 反向自证：在同一窄列下人为去掉这两条保护 → 标签必定折成 ≥2 行盒
 *       （证明 [4] 不是空转；这一段是「改坏验红」内建到脚本里，跑一次就能看出断言有没有灵敏度）
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
const run = async (id, js) => {
  const r = await j('/eval?target=' + encodeURIComponent(id), { method: 'POST', body: js });
  const v = r && r.value !== undefined ? r.value : JSON.stringify(r);
  try { return JSON.parse(v); } catch (e) { return v; }
};

/* 注入到页面里的量测脚本：每个按钮的「行盒数 / 宽 / 高」+ 操作列可用宽与按钮总宽 */
const MEASURE = `(() => {
  const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects().length; };
  const rows = [...document.querySelectorAll('#pageRows tr')];
  return JSON.stringify({
    hasOpsRow: rows.filter((tr) => tr.querySelector('.ops.ops-row')).length,
    rows: rows.length,
    names: rows.map((tr) => tr.querySelector('.pname').textContent),
    per: rows.map((tr) => {
      const ops = tr.querySelector('.ops');
      const cs = getComputedStyle(ops);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const btns = [...ops.querySelectorAll('.btn')];
      const sum = btns.reduce((a, b) => a + b.getBoundingClientRect().width, 0);
      const gap = parseFloat(cs.columnGap || cs.gap) || 0;
      return {
        avail: Math.round(ops.clientWidth - pad),
        need: Math.round(sum + gap * (btns.length - 1)),
        opsH: Math.round(ops.getBoundingClientRect().height),
        overflow: ops.scrollWidth > ops.clientWidth + 1,
        labels: btns.map((b) => b.textContent),
        lineBoxes: btns.map(lines),
        widths: btns.map((b) => Math.round(b.getBoundingClientRect().width)),
        heights: btns.map((b) => Math.round(b.getBoundingClientRect().height))
      };
    }),
    arrows: [...document.querySelectorAll('#pageRows a, #pageRows button, .navcard a, .navcard button')]
      .map((e) => e.textContent).filter((t) => t.indexOf('\\u2197') >= 0),
    navBtn: (() => { const b = document.querySelector('.navcard .nv-ops a.btn'); return b ? { text: b.textContent, title: b.getAttribute('title'), lines: lines(b) } : null; })()
  });
})()`;

const SET_NARROW = `(() => {
  const s = document.createElement('style'); s.id = '__probe_narrow';
  /* 直接把第 5 列（操作）压到 120px：表格是 table-layout:fixed，列宽就取这里声明值 */
  s.textContent = 'table.grid th:nth-child(5),table.grid td:nth-child(5){width:120px !important}';
  document.head.appendChild(s);
  return 'ok';
})()`;

/*
 * 反向自证用：复现修复**前**的结果 —— 「按钮被压到 34px + 允许折字」。
 *
 * ⚠️ 为什么不直接把 `flex-shrink` 改回 1 来复现：
 *    本机 Chrome 里对 `.btn` 注入 `flex-shrink:1 !important` / `color:red !important`
 *    都**读不到生效**（`getComputedStyle` 仍是 `0 0 auto`），而同一张注入表里的
 *    `flex-basis` / `white-space` / `flex-wrap` 却能生效 —— 原因未查明（疑似该 Chrome 配置里
 *    有扩展注入了用户级 !important，用户级 !important 会压过作者级 !important，连内联 !important 也压不过）。
 *    所以改用**能可靠覆盖的两个属性**把结果造出来，而不是造原因：
 *      · `flex-basis: 34px`  —— 34px 正是「一个汉字 + 左右内边距 20 + 边框 2」的 min-content
 *        宽度，也正是修复前 flex 压缩能压到的最小值（旧代码允许折字，min-content 因此只有 1 个字宽）；
 *      · `white-space: normal` —— 恢复折字。
 *    两条合起来 = 用户截图里那 6 个按钮的状态，脚本据此断言「行盒数 ≥2」，
 *    既证明量测仪器（Range 行盒计数）不空转，也把当年的现象钉成可复跑的样例。
 */
const BREAK_GUARD = `(() => {
  const s = document.createElement('style'); s.id = '__probe_break';
  s.textContent = '.ops-row{flex-wrap:nowrap !important}' +
    '.ops-row .btn{white-space:normal !important;flex-basis:34px !important}';
  document.head.appendChild(s);
  return 'ok';
})()`;

const CLEAN = `(() => { ['__probe_narrow', '__probe_break'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); }); return 'ok'; })()`;

const r = await j('/new', { method: 'POST', body: SITE + '/admin' });
await sleep(2800);
const tab = r.targetId || r.id;
{
  const sess = await run(tab, `JSON.stringify(window.__admin ? window.__admin.session() : {})`);
  if (sess && !sess.me) {
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
    await run(tab, 'loadPages(); "reloaded"');
  }
}

console.log('\n[1] 操作列宽度留有余量（零余量 = 字体稍有差异就折字）');
const m1 = await run(tab, MEASURE);
ok(m1.rows > 0 && m1.hasOpsRow === m1.rows, '每一行的操作按钮组都挂着 ops-row',
  m1.hasOpsRow + '/' + m1.rows + ' 行');
{
  const worst = m1.per.map((p) => p.avail - p.need).sort((a, b) => a - b)[0];
  const most = m1.per.map((p) => p.widths.length).sort((a, b) => b - a)[0];
  ok(worst >= 24, '按钮最紧的那一行仍有 ≥24px 余量', '最紧余量 ' + worst + 'px ｜ 按钮最多 ' + most + ' 个');
  ok(!m1.per.some((p) => p.overflow), '没有任何一行的按钮组横向溢出',
    m1.per.map((p) => '可用' + p.avail + '/需' + p.need).join('，'));
}

console.log('\n[2] 每个按钮标签只占 1 个行盒（不折字、不竖排）');
{
  const bad = [];
  m1.per.forEach((p, i) => p.lineBoxes.forEach((n, k) => { if (n > 1) bad.push(m1.names[i] + ' / ' + p.labels[k] + ' = ' + n + ' 行'); }));
  ok(bad.length === 0, '所有按钮文字都是单行', bad.length ? bad.join('；') : '共 ' + m1.per.reduce((a, p) => a + p.labels.length, 0) + ' 个按钮');
  const hs = [...new Set(m1.per.flatMap((p) => p.heights))];
  ok(hs.length === 1, '所有按钮同高（a.btn 盒模型对齐没退回 content-box）', '高度 = ' + hs.join('/') + 'px');
}

console.log('\n[3] 装修台按钮文案不带 ↗ 箭头（新窗口提示改放 title）');
ok(m1.arrows.length === 0, '列表与导航卡片里没有带 ↗ 的文案', m1.arrows.join('；') || '0 处');
ok(!!m1.navBtn && m1.navBtn.lines === 1 && m1.navBtn.text === '设置底部导航',
  '「设置底部导航」文案为纯文字且单行', m1.navBtn ? m1.navBtn.text + '（' + m1.navBtn.lines + ' 行）' : '没找到');
ok(!!m1.navBtn && /新窗口/.test(m1.navBtn.title || ''), '新窗口口径仍在 title 里（不靠箭头）',
  m1.navBtn ? m1.navBtn.title : '');

console.log('\n[4] 把操作列强行压到 120px：标签仍单行、按钮不被压缩');
await run(tab, SET_NARROW);
/* ⚠️ 必须等过渡结束再量：`.btn { transition: .15s }` 是「全属性」过渡，
   而 flex-shrink / color 都是可动画属性 —— 注入覆盖后立刻读，拿到的是**过渡前**的旧值
   （实测 300ms 还能读到 flex-shrink:0、按钮宽度未变，误判成「覆盖不生效」）。600ms 稳定。 */
await sleep(700);
const m2 = await run(tab, MEASURE);
{
  const bad = [];
  m2.per.forEach((p, i) => p.lineBoxes.forEach((n, k) => { if (n > 1) bad.push(m2.names[i] + ' / ' + p.labels[k] + ' = ' + n + ' 行'); }));
  ok(bad.length === 0, '窄列下每个按钮文字仍是单行（white-space:nowrap 生效）', bad.join('；') || '全部单行');
  const w1 = m1.per[0].widths.join(',');
  const w2 = m2.per[0].widths.join(',');
  ok(w1 === w2, '窄列下按钮宽度一个像素都没被压（flex:0 0 auto 生效）', w1 + ' → ' + w2);
  ok(m2.per[0].opsH > m1.per[0].opsH, '窄列下按钮组改为整颗换行（容器变高），而不是把字挤成竖排',
    '容器高 ' + m1.per[0].opsH + 'px → ' + m2.per[0].opsH + 'px');
}

console.log('\n[5] 反向自证：造出修复前的状态（按钮压到 34px + 允许折字）→ 必须出现竖排');
await run(tab, BREAK_GUARD);
await sleep(700);   // 同上：等 .btn 的全属性过渡走完再看压缩与折字
const m3 = await run(tab, MEASURE);
{
  const wrapped = m3.per.flatMap((p) => p.lineBoxes).filter((n) => n > 1).length;
  const worst = Math.max(...m3.per.flatMap((p) => p.lineBoxes));
  ok(wrapped > 0, '压窄 + 允许折字后确实出现折字（证明 [2] [4] 的断言不空转）',
    wrapped + ' 个按钮折成多行，最多 ' + worst + ' 行 ｜ 例：' +
    m3.per[0].labels.map((t, k) => m3.per[0].lineBoxes[k] > 1 ? t + '=' + m3.per[0].lineBoxes[k] + '行' : '').filter(Boolean).join('，'));
  const shrunk = m3.per[0].widths.some((w, i) => w < m2.per[0].widths[i]);
  ok(shrunk, '按钮确实被压窄了（这正是修复前 flex 能把每个按钮压到 1 个字宽的原因）',
    m2.per[0].widths.join(',') + ' → ' + m3.per[0].widths.join(','));
  ok(m3.per[0].lineBoxes.length === m2.per[0].lineBoxes.length, '按钮数量不变（折字不是靠丢按钮实现的）');
}
await run(tab, CLEAN);
await sleep(700);
const m4 = await run(tab, MEASURE);
ok(m4.per.every((p) => p.lineBoxes.every((n) => n === 1)), '清理注入样式后恢复如初');

/* 留一张列表截图，方便肉眼复核（跑完可删）。
   ⚠️ CDP 的 /screenshot 是 **GET** 路由：写成 POST 会静默不落盘（探针不检查返回值时最难发现）。 */
const shot = process.env.SHOT || '';
if (shot) {
  const say = await fetch(P + '/screenshot?target=' + encodeURIComponent(tab) + '&file=' + encodeURIComponent(shot))
    .then((r) => r.text()).catch((e) => 'ERR ' + e.message);
  console.log('\n截图：' + shot + ' ｜ ' + say);
}
await j('/close?target=' + encodeURIComponent(tab), { method: 'POST', body: '' });

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
