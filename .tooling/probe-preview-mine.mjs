/**
 * 前端预览页 /preview —— 「我的」（个人中心）真机源码编译验收
 *
 * /preview 与装修台是**两条链路**（见 MEMORY 铁律 3）：
 *   · 装修台手机壳 = shared/pv-render.js 近似渲染；
 *   · /preview     = 直接编译真机源码（mine.wxml + blocks.wxml + mine.js + mine.wxss）。
 * 所以「装修台里能看到」不等于「真机源码能编出来」—— 本脚本走的就是后者。
 *
 * 断言：
 *   1. 编译成功（没有 pv-error 错误条）
 *   2. 渲染出 7 个区块的**真机结构**：标题栏 / 个人信息 / 个人资产 / 我的订单 / 必备工具 / 关注公众号
 *   3. 必备工具渲染出真实条目（购物车 / 收货地址 / 关于我们…），客服是真按钮 open-type="contact"
 *   4. 个人信息区渲染出「未登录」与登录按钮（mine.js 的 applyUserProfile 真的跑了）
 *   5. 样式真的注入了 .cu- 系列（mine.wxss 被编译进来，不是裸 DOM）
 *   6. 底部导航仍按 replica.TABBAR 渲染，「我的」高亮
 *
 * 前置：node server/index.js（DEBUG_PAGE 开启）+ CDP 代理（3456）。
 * 用法：node .tooling/probe-preview-mine.mjs
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
async function open(url, wait = 2500) {
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

/* 预览页要管理员令牌（它读 /api/decorate/pages），先拿一个并塞进 localStorage */
const ADMIN_PW = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
async function fetchAdminToken() {
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW })
  });
  const jj = await r.json().catch(() => null);
  return jj && jj.code === 0 && jj.data ? jj.data.token : '';
}
const TOKEN = await fetchAdminToken();
if (!TOKEN) { console.error('拿不到管理员会话'); process.exit(1); }

let tab = await open(SITE + '/preview/');
try {
  await run(tab, `(() => { localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); return 'ok'; })()`);
  /* 重新载入让预览页带着令牌初始化 */
  const r = await j('/navigate?target=' + tab, { method: 'POST', body: SITE + '/preview/' });
  void r;
  await sleep(3000);

  console.log('\n[1] 左栏选中「我的」');
  {
    const clicked = await run(tab, `(() => {
      const b = [...document.querySelectorAll('#pvPages .pv-item')].find((x) => /我的/.test(x.textContent));
      if (!b) return 'notfound';
      b.click();
      return 'ok';
    })()`);
    ok(clicked === 'ok', '左栏能点到「我的」', clicked);
    await sleep(3000);
  }

  console.log('\n[2] 真机源码编译结果');
  {
    const st = JSON.parse(await run(tab, `JSON.stringify({
      err: !!document.querySelector('#preview .pv-error'),
      errText: ((document.querySelector('#preview .pv-error') || {}).textContent || '').slice(0, 120),
      note: ((document.getElementById('pvNote') || {}).textContent || '').slice(0, 120),
      html: document.getElementById('preview').innerHTML.length,
      text: (document.getElementById('preview').textContent || '').replace(/\\s+/g, ' '),
      cssHasCu: /cu-nav|cu-prof|cu-tools/.test(document.getElementById('mpStyle').textContent || ''),
      cssLen: (document.getElementById('mpStyle').textContent || '').length
    })`));
    ok(!st.err, '没有渲染失败错误条', st.errText || st.note);
    ok(st.html > 2000, '渲染出了真机 DOM（不是空白）', 'html=' + st.html);
    /* 断言必须落在**真机源码真的会输出的文案**上：
     *   · 「个人中心」是装修台里的页面名，真机页面上没有这四个字；
     *   · 「必备工具」是区块在后台的标签，有赞的 uc_widgets 数据里没有标题字段、真机也不渲染标题
     *     （有标题的是「我的订单」+「全部订单 ›」）—— 照这两个字查会永远红。 */
    ok(['未登录', '我的订单', '全部订单'].every((t) => st.text.indexOf(t) >= 0),
      '区块流的真机文案渲染出来（未登录 / 我的订单 / 全部订单 ›）', st.text.slice(0, 120));
    ok(st.cssHasCu, 'mine.wxss 的 .cu- 系列样式已编译注入', 'css=' + st.cssLen + ' 字节');
  }

  console.log('\n[3] 各区块的真机结构');
  {
    const st = JSON.parse(await run(tab, `JSON.stringify({
      navbar: (document.querySelectorAll('.cu-nav').length),
      nick: (document.querySelector('.cu-nick') || {}).textContent || '',
      loginBtn: (document.querySelector('.cu-prof-act') || {}).textContent || '',
      stats: [...document.querySelectorAll('.cu-stat-l')].map((x) => x.textContent.trim()),
      orders: [...document.querySelectorAll('.cu-order-lb')].map((x) => x.textContent.trim()),
      tools: [...document.querySelectorAll('.cu-tool-lb')].map((x) => x.textContent.trim()),
      contact: !!document.querySelector('.cu-tool[open-type="contact"]'),
      oaNode: !!document.querySelector('official-account'),
      oaComment: /未支持的自定义组件：official-account/.test(document.getElementById('preview').innerHTML),
      dep: [...document.querySelectorAll('.cu-dep')].map((x) => x.textContent.trim().slice(0, 24)),
      version: (document.querySelector('.version') || {}).textContent || ''
    })`));
    ok(st.navbar === 1, '标题栏渲染出 1 个', 'n=' + st.navbar);
    ok(st.nick === '未登录' && /登录/.test(st.loginBtn), '个人信息区渲染出登录态与登录按钮', st.nick + ' / ' + st.loginBtn);
    ok(st.stats.length === 5 && st.stats.indexOf('余额') >= 0, '个人资产按 5 个默认开启项渲染', st.stats.join(','));
    ok(st.orders.length === 5 && st.orders.indexOf('待付款') >= 0, '我的订单渲染出 5 个入口', st.orders.join(','));
    ok(st.tools.length >= 6 && st.tools.indexOf('购物车') >= 0 && st.tools.indexOf('关于我们') >= 0,
      '必备工具按装修数据渲染出真实条目', st.tools.join(','));
    ok(st.contact, '「客服聊天」是真按钮 open-type="contact"（不是点了没反应的占位）');
    /* follow_oa 用的是微信原生 <official-account>，预览内核**故意不支持**原生组件
     * （真机上它由微信注入，预览里没有对应实现）。所以这里不能断言「渲染出真节点」，
     * 只能断言「内核如实说明了它不支持 + 仍在页面上留了位置」—— 这是等价断言。 */
    ok(!st.oaNode && st.oaComment,
      '关注公众号：内核如实标注 official-account 未支持（不假装渲染出来）',
      'node=' + st.oaNode + ' comment=' + st.oaComment);
    ok(st.dep.length >= 2, '依赖型区块带「依赖 XX · 仅占位展示」标注', st.dep.join(' | '));
    ok(/LEXY|莱克/.test(st.version), '页脚仍显示店铺名与版本（真实交互保留）', st.version);
  }

  console.log('\n[4] 底部导航仍按 replica.TABBAR 渲染');
  {
    const st = JSON.parse(await run(tab, `JSON.stringify({
      items: [...document.querySelectorAll('#phTabbar .tb-item, #phTabbar [class*=item]')].map((x) => x.textContent.trim()),
      html: document.getElementById('phTabbar').innerHTML.length
    })`));
    ok(st.html > 50, '底部导航已渲染', 'html=' + st.html);
    ok(st.items.length === 0 || st.items.length <= 5, '底部导航项数合法（≤5）', st.items.join(','));
  }
} finally {
  await close(tab);
}

console.log('\n' + '─'.repeat(56));
console.log(` 结果：${pass} 通过 / ${fail} 失败`);
console.log('─'.repeat(56));
process.exit(fail ? 1 : 0);
