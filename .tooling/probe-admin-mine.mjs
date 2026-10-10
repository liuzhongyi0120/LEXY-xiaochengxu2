/**
 * 装修台「个人中心（我的）页可装修」—— 浏览器验收脚本
 *
 * 需求（2026-10-10）：「参照有赞 usercenter-decorate，在装修里添加个人中心页的搭建」。
 *
 * 静态自检（check-all 15.79）只证明「类型/字段/渲染分支/落盘都对得上」，
 * 这里补「运营点一下真的会怎样」——「我的」页此前是固定结构页，组件库整栏被收起，
 * 运营点任何组件都弹「该页面暂不支持添加组件」。验收的就是这条链路真的通了：
 *
 *   1. 点「我的」→ 组件库栏展开（不再有 no-blocks），tab 只有「个人中心组件」一个
 *   2. 卡片 25 张、一个「未接入」都没有，按有赞的 4 组（基础 7 / 营销 2 / 其他 11 / 专属 5）分组
 *   3. 手机预览画得出 7 个默认区块（标题栏 / 个人信息 / 个人资产 / 图片广告 / 我的订单 / 必备工具 / 关注公众号）
 *   4. 区块树 7 个可删节点；「+ 添加常用组件」按钮隐藏（个人中心没有「常用组件」tab）
 *   5. 点「文本」→ 真的加进页面、属性面板出现它的字段
 *   6. 切回「首页」→ 组件库立刻换回 3 个 tab（页面级组件库生效，不是全局那一份）
 *   7. 收尾：删掉刚加的区块，并核对服务端草稿零残留（页面内存改动，关标签页即消失）
 *
 * 前置：node server/index.js + CDP 代理（3456）。
 * 用法：node .tooling/probe-admin-mine.mjs
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
let ADMIN_TOKEN = '';

async function fetchAdminToken() {
  const env = String(process.env.ADMIN_TOKEN || '').trim();
  if (env) {
    const r = await fetch(SITE + '/api/admin/session', { headers: { Authorization: 'Bearer ' + env } });
    const jj = await r.json().catch(() => null);
    if (jj && jj.code === 0) return env;
  }
  if (!ADMIN_PW) return '';
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW })
  });
  const jj = await r.json().catch(() => null);
  return jj && jj.code === 0 && jj.data ? jj.data.token : '';
}

const DRAFT_COUNT = async () => {
  const r = await fetch(SITE + '/api/decorate/stats', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  const jj = await r.json();
  return jj.data && jj.data.drafts;
};

ADMIN_TOKEN = await fetchAdminToken();
if (!ADMIN_TOKEN) { console.error('拿不到管理员会话'); process.exit(1); }

const draftBefore = await DRAFT_COUNT();
let tab = await open(SITE + '/admin/');

try {
  /* 登录并进入「我的」页 */
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

  await run(tab, `(() => {
    const a = document.querySelector('#pageRows [data-open="mine"]');
    if (!a) return 'notfound';
    a.click();
    return 'ok';
  })()`);
  await sleep(2600);

  console.log('\n[1] 「我的」页进入编辑器：组件库栏必须展开');
  {
    const st = JSON.parse(await run(tab, `JSON.stringify({
      hidden: !!document.getElementById('viewEdit').hidden,
      noBlocks: document.getElementById('viewEdit').classList.contains('no-blocks'),
      name: (document.getElementById('edName')||{}).textContent || '',
      path: (document.getElementById('edPath')||{}).textContent || ''
    })`));
    ok(!st.hidden, '已进入编辑器视图');
    ok(!st.noBlocks, '组件库栏展开（不再是「该页面不支持添加组件」的收起态）');
    ok(st.name === '我的' && st.path === 'pages/mine', '编辑器标题与路径指向「我的」页', st.name + ' / ' + st.path);
  }

  console.log('\n[2] 组件库 = 照有赞的 4 组 25 项，且全部可点');
  {
    const st = JSON.parse(await run(tab, `(async () => {
      const tabs = [...document.querySelectorAll('.lib-tabs .lib-tab')];
      const cards = [...document.querySelectorAll('.lib-item')];
      const groups = [...document.querySelectorAll('.lib-group')];
      return JSON.stringify({
        tabs: tabs.map((t) => t.textContent.trim()),
        cards: cards.length,
        off: cards.filter((c) => c.classList.contains('off')).length,
        flag: cards.filter((c) => c.querySelector('.lib-flag')).length,
        groups: groups.map((g) => g.textContent.replace(/\\s+/g, ' ').trim()),
        addCommonHidden: !!document.getElementById('btnAddCommon').hidden
      });
    })()`));
    ok(st.tabs.length === 1 && /个人中心组件/.test(st.tabs[0]), 'tab 只有「个人中心组件」一个（对标有赞只有「添加组件」入口）', st.tabs.join(' | '));
    ok(st.cards === 25, '卡片 25 张（基础 7 + 营销 2 + 其他 11 + 专属 5）', 'cards=' + st.cards);
    ok(st.flag === 0 && st.off === 0, '没有任何「未接入」角标', 'flag=' + st.flag);
    ok(st.groups.length === 4 &&
      /基础组件\s*7/.test(st.groups[0]) && /营销组件\s*2/.test(st.groups[1]) &&
      /其他\s*11/.test(st.groups[2]) && /专属区块\s*5/.test(st.groups[3]),
      '按有赞的 4 组渲染（基础 7 / 营销 2 / 其他 11 / 专属区块 5）', st.groups.join(' | '));
    ok(st.addCommonHidden, '「+ 添加常用组件」按钮隐藏（个人中心没有常用组件 tab）');
  }

  console.log('\n[3] 手机预览画得出 7 个默认区块');
  {
    const st = JSON.parse(await run(tab, `JSON.stringify({
      blocks: document.querySelectorAll('#preview .pv-block').length,
      text: (document.getElementById('preview').textContent || '').replace(/\\s+/g, ' '),
      tags: [...document.querySelectorAll('#preview .pv-tag')].map((x) => x.textContent.trim().replace(/\\s*\\d+$/, ''))
    })`));
    ok(st.blocks >= 7, '预览里至少 7 个区块（含店铺信息块）', 'blocks=' + st.blocks);
    const want = ['标题栏', '个人信息', '个人资产', '我的订单', '必备工具', '关注公众号'];
    const miss = want.filter((w) => st.tags.indexOf(w) < 0);
    ok(miss.length === 0, '预览区块类型角标齐全', miss.length ? '缺 ' + miss.join(',') : st.tags.join(','));
    ok(/个人中心/.test(st.text) && /必备工具/.test(st.text), '预览里有真实内容（标题 / 必备工具卡片）');
  }

  console.log('\n[4] 区块树 7 个可删节点');
  {
    /* ⚠️ 只数**顶层区块节点**（data-list="blocks"）。
       区块内部还有嵌套列表（必备工具的 21 个工具项、轮播的图片…）也是 .tnode，
       直接数 .tnode 会数出二十几个，看起来像「凭空多了一堆区块」。 */
    const n = Number(await run(tab, `String(document.querySelectorAll('#tree .tnode[data-list="blocks"]').length)`));
    ok(n === 7, '区块树里 7 个顶层区块节点', 'n=' + n);
  }

  console.log('\n[5] 点「文本」组件：真的加进页面并能配属性');
  {
    const COUNT = `String(document.querySelectorAll('#tree .tnode[data-list="blocks"]').length)`;
    const before = Number(await run(tab, COUNT));
    const clicked = await run(tab, `(async () => {
      const c = [...document.querySelectorAll('.lib-item')].find((x) => /^\\s*文本\\s*$/.test((x.querySelector('.lib-name')||{}).textContent || ''));
      if (!c) return 'notfound';
      c.click();
      await new Promise((r) => setTimeout(r, 900));
      return 'clicked';
    })()`);
    await sleep(700);
    const after = Number(await run(tab, COUNT));
    ok(clicked === 'clicked', '组件库里能找到「文本」并点击');
    ok(after === before + 1, '区块数 +1', before + ' → ' + after);

    const insp = await run(tab, `(document.getElementById('inspector').textContent || '').replace(/\\s+/g, ' ')`);
    ok(/文本/.test(insp) && /字体大小/.test(insp) && /显示位置/.test(insp),
      '属性面板出现「文本」组件自己的字段（字体大小 / 显示位置…）',
      insp.slice(0, 120));

    /* 删掉刚加的那个顶层区块（装修台删除免二次确认） */
    await run(tab, `(() => {
      const rows = [...document.querySelectorAll('#tree .tnode[data-list="blocks"]')];
      const last = rows[rows.length - 1];
      const rm = last && last.querySelector('[data-rm]');
      if (rm) rm.click();
      return 'done';
    })()`);
    await sleep(700);
    const back = Number(await run(tab, COUNT));
    ok(back === before, '删除后区块数回到基线（删除免二次确认）', back + ' vs ' + before);
  }

  console.log('\n[6] 切回「首页」：组件库立刻换回全局那一份');
  {
    /* 有未保存改动时退出编辑器会弹原生 confirm 把标签页挂住 → 先解除拦截 */
    await run(tab, `(() => {
      window.onbeforeunload = null;
      window.confirm = function () { return true; };
      const b = document.getElementById('btnBack');
      if (b) b.click();
      return 'ok';
    })()`);
    await sleep(1200);
    await run(tab, `(() => {
      const a = document.querySelector('#pageRows [data-open="home"]');
      if (a) a.click();
      return 'ok';
    })()`);
    await sleep(2400);
    const st = JSON.parse(await run(tab, `JSON.stringify({
      back: !document.getElementById('viewList').hidden,
      tabs: [...document.querySelectorAll('.lib-tabs .lib-tab')].map((t) => t.textContent.trim()),
      addCommonHidden: !!document.getElementById('btnAddCommon').hidden
    })`));
    ok(st.tabs.length === 3 && /常用组件/.test(st.tabs[0]) && /基础组件/.test(st.tabs[1]),
      '首页用的是全局组件库（常用 / 基础 / 高级 三个 tab）', st.tabs.join(' | '));
    ok(st.addCommonHidden === false, '「+ 添加常用组件」按钮重新出现（首页有常用组件 tab）');
  }
} finally {
  await close(tab);
}

console.log('\n[7] 收尾：草稿零残留');
{
  const after = await DRAFT_COUNT();
  ok(after === draftBefore, '服务端草稿数与开始前一致（页面内存改动，关标签页即丢弃）', after + ' vs ' + draftBefore);
}

console.log('\n' + '─'.repeat(56));
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
console.log('─'.repeat(56));
process.exit(fail ? 1 : 0);
