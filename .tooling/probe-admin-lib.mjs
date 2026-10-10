/**
 * 装修台「组件库全量接入」—— 浏览器验收脚本
 *
 * 需求（2026-10-10）：「所有组件都一样，完全照搬过来，包括所有组件的详细功能」。
 * 静态自检（check-all）只证明「字段定义齐全 + 预览有分支」，这里补「运营点一下真的会怎样」：
 *
 *   1. 组件库三个 tab 里**一个「未接入」都不剩**（55 基础 + 2 高级全部可点）
 *   2. 依赖型组件带「依赖」角标，数量与 schema 里一致
 *   3. 卡片第二行显示「已用 / 上限」（有赞同款）
 *   4. 点一个此前未接入的组件（商品分组）→ 真的加进页面、属性面板里出现它的字段
 *   5. 新加区块的预览里能看到内容（不是一片空白）
 *   6. 收尾：删掉刚加的区块，并核对服务端草稿零残留（页面内存改动，关标签页即消失）
 *
 * 前置：node server/index.js + CDP 代理（3456）。
 * 用法：node .tooling/probe-admin-lib.mjs
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

/* 期望的「已接入 / 上限」事实来自服务端 schema —— 不在脚本里写死数字，避免两边各说各话 */
async function libFacts() {
  const r = await fetch(SITE + '/api/decorate/pages', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  const jj = await r.json().catch(() => null);
  const lib = jj && jj.data && jj.data.lib;
  if (!lib) return null;
  return {
    total: lib.basic.length + lib.adv.length,
    off: lib.basic.concat(lib.adv).filter((x) => !x.ok).length,
    // 基础组件 tab 只画 lib.basic 那 55 张卡（「个性导航」在高级 tab），比较时要分开算
    depBasic: lib.basic.filter((x) => x.ok && x.dep).length,
    depAll: lib.basic.concat(lib.adv).filter((x) => x.ok && x.dep).length,
    kinds: lib.kinds.length
  };
}

const STATS = async () => {
  const r = await fetch(SITE + '/api/decorate/stats', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  const jj = await r.json();
  return jj.data && jj.data.drafts;
};

ADMIN_TOKEN = await fetchAdminToken();
if (!ADMIN_TOKEN) { console.error('拿不到管理员会话'); process.exit(1); }

const draftBefore = await STATS();

console.log('\n[1] 组件库全量可点');
let tab = await open(SITE + '/admin/');
let expr = null;
{
  /* 登录 */
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

  /* 切到「基础组件」tab 再数：未接入角标 / 依赖角标 / 上限计数 */
  expr = JSON.parse(await run(tab, `(async() => {
    const t = [...document.querySelectorAll('.lib-tabs .lib-tab')].find((x) => /基础组件/.test(x.textContent));
    if (t) { t.click(); await new Promise((r) => setTimeout(r, 400)); }
    const cards = [...document.querySelectorAll('.lib-item')];
    /* 只读 .lib-num 自己（读整张卡片会把组件名一起带进来，正则就永远不匹配） */
    const firstNum = cards.find((c) => c.querySelector('.lib-num'));
    return JSON.stringify({
      cards: cards.length,
      off: cards.filter((c) => c.classList.contains('off')).length,
      flag: cards.filter((c) => c.querySelector('.lib-flag')).length,
      dep: cards.filter((c) => c.querySelector('.lib-dep')).length,
      num: cards.filter((c) => c.querySelector('.lib-num')).length,
      sampleNum: firstNum ? (firstNum.querySelector('.lib-num').textContent || '').trim() : ''
    });
  })()`));

  const facts = await libFacts();
  if (!facts) { console.error('拿不到 /api/decorate/pages 的 lib'); await close(tab); process.exit(1); }
  console.log('    schema 事实：' + JSON.stringify(facts));

  ok(expr.cards === 55, '基础组件 tab 里 55 张卡片', 'cards=' + expr.cards);
  ok(expr.off === 0 && expr.flag === 0, '没有任何「未接入」角标', 'off=' + expr.off + ' flag=' + expr.flag);
  ok(expr.dep === facts.depBasic, '「依赖」角标数 = schema 里带依赖的基础组件数',
    expr.dep + ' vs ' + facts.depBasic + '（另 ' + (facts.depAll - facts.depBasic) + ' 个在高级组件 tab）');
  ok(expr.num === expr.cards, '每张卡片都有「已用 / 上限」计数', 'num=' + expr.num);
  ok(/^\d+\s*\/\s*\d+$/.test(String(expr.sampleNum).replace(/\s+/g, ' ').trim()), '计数形如「0 / 50」', JSON.stringify(expr.sampleNum));
}

console.log('\n[2] 点一个「此前未接入」的组件：商品分组');
{
  await run(tab, `(() => {
    window.__confirmCalls = 0;
    window.confirm = function () { window.__confirmCalls++; return false; };
    return 'hooked';
  })()`);

  const before = Number(await run(tab, `String([...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]')).length)`));

  const clicked = await run(tab, `(async() => {
    const c = [...document.querySelectorAll('.lib-item')].find((x) => /商品分组/.test(x.textContent));
    if (!c) return 'notfound';
    c.click();
    await new Promise((r) => setTimeout(r, 900));
    return 'clicked';
  })()`);
  await sleep(700);

  const after = Number(await run(tab, `String([...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]')).length)`));
  ok(clicked === 'clicked', '在组件库里找到「商品分组」', clicked);
  ok(after === before + 1, '点一下就把区块加进了页面', before + ' → ' + after);
  ok(Number(await run(tab, `String(window.__confirmCalls)`)) === 0, '添加过程没有弹原生 confirm');

  /* 属性面板里必须出现有赞实测的字段（少一项就是「字段没接上」） */
  /* 用 textContent 而不是 innerText：属性面板里的「样式设置」分组默认是收起的，
     innerText 会跳过 display:none 的内容，导致「字段没渲染」的假红。 */
  const insp = await run(tab, `(() => {
    const el = document.querySelector('#insp') || document.querySelector('.col-inspector') || document.body;
    return (el.textContent || '').replace(/\\s+/g, ' ');
  })()`);
  ['菜单样式', '菜单吸顶', '显示全部分组', '列表样式', '商品样式', '分组'].forEach((label) => {
    ok(insp.indexOf(label) >= 0, '属性面板里有「' + label + '」');
  });

  /* 预览里必须画出来（不是空白） */
  const pv = await run(tab, `(() => {
    const last = [...document.querySelectorAll('#preview .pv-block')].pop();
    return last ? (last.innerText || '').replace(/\\s+/g, ' ').slice(0, 120) : '';
  })()`);
  ok(pv.length > 0, '预览里画出了该组件（不是空白）', JSON.stringify(pv).slice(0, 90));

  /* 收尾：删掉刚加的这一项，回到原状 */
  await run(tab, `(() => {
    const items = [...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]'));
    const it = items[items.length - 1];
    if (it) it.querySelector('[data-rm]').click();
    return 'done';
  })()`);
  await sleep(600);
  const restored = Number(await run(tab, `String([...document.querySelectorAll('#tree .tnode')].filter((n) => n.querySelector('[data-rm]')).length)`));
  ok(restored === before, '删掉后区块数回到原值', restored + ' / 期望 ' + before);
}

console.log('\n[3] 服务端零残留');
{
  const draftAfter = await STATS();
  ok(draftAfter === draftBefore, '草稿数未变（只在页面内存里改）', draftBefore + ' → ' + draftAfter);
}

await close(tab);

console.log('\n' + '─'.repeat(56));
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
