/**
 * 装修台「店铺导航」+ 预览页底部导航 —— 浏览器验收脚本
 *
 * 自检（server/tools/check-all.mjs 15.11）覆盖的是「静态接线 + 接口边界」，
 * 但「运营点一下真的会变吗」只能在真浏览器里验。这个脚本补这一段缺口：
 *   1. 装修台列表页：navCard 出现、页面表格不含 nav
 *   2. 进入导航编辑器：三栏布局变成「无组件库」、页面标签=全局配置
 *   3. 区块树点第 3 项 → 手机壳底部导航高亮跟到「资讯」
 *   4. 改「导航名称」为 8 个字 → 实时截断成 5 个字（装修台预览 = 发布后的口径）
 *   5. 内置图标：5 项都渲染包内图标（高亮项取 -active）；点「内置图标」快捷按钮能写进字段；
 *      自传外链图标照样生效；「纯文字」模式 → 0 个图标框
 *   6. /preview：首页高亮第 1 项，切到产品页后高亮第 4 项，图片无破损（含底部 5 张包内图标）
 *
 * 前置：
 *   1) node server/index.js                （后端）
 *   2) node scripts/cdp-proxy.mjs          （web-access 技能里的 CDP 代理，监听 3456）
 *      需要 Chrome 已开着且允许调试；脚本只「新开标签页 → 用完关掉」，不动用户已有标签页。
 *
 * 用法：node .tooling/check-admin-nav.mjs
 *
 * ⚠️ 两个已知坑，脚本里已绕开，别改成「顺手点返回」：
 *   · 装修台有未保存改动时点「返回列表」会触发浏览器原生「离开？」弹窗并卡死该标签页
 *     （连 CDP eval 都会超时）—— 所以脚本改完只关标签页，不点返回。
 *   · 未保存改动只存在于页面内存里，关掉标签页即消失，服务端零残留（脚本会核对）。
 */
const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';

let pass = 0;
let fail = 0;
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
/** 在页面里求值；代理返回 { value }，页面脚本一律 return 字符串 */
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return '';
  if (r.error) return '';
  if (r.value !== undefined) return typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
  return '';
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });

/*
 * 管理员登录（报告 08 之后装修台必须登录，否则页面只有登录弹层、什么都测不到）。
 * 口令来源：ADMIN_PASSWORD → 非生产默认 admin。
 */
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

/** 在装修台页面上完成登录（填口令 → 点「登录」），返回 'clicked' / 'no-login-form' */
async function loginInPage(tab) {
  const r = await run(tab, `(() => {
    const pw = document.getElementById('lgPw');
    if (!pw) return 'no-login-form';
    pw.value = ${JSON.stringify(ADMIN_PW)};
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...document.querySelectorAll('#modal button')].find((b) => /登录/.test(b.textContent));
    if (!btn) return 'no-login-button';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(1500);
  return r;
}

/**
 * 确保页面已进入「已登录且列表已渲染」状态。
 * 两种情况都要能过：① 全新标签页 → 弹登录层（脚本自己登）；
 * ② 浏览器里已有登录态（上一次跑留下的 localStorage 令牌）→ 直接渲染，没有登录层。
 */
async function ensureLoggedIn(tab) {
  const rows = async () => Number(await run(tab, `String(document.querySelectorAll('#pageRows tr').length)`));
  const lg = await loginInPage(tab);
  if (await rows() > 0) return lg;
  await sleep(1500);
  if (await rows() > 0) return lg;
  return 'list-empty:' + lg;
}

/** 手机壳底部导航的可观测状态：每项文案 + 是否高亮；再带上图标框数量、图片地址与选中色 */
const BAR = `(() => {
  const bar = document.getElementById('phTabbar');
  if (!bar) return JSON.stringify({ err: 'no #phTabbar' });
  const items = [...bar.querySelectorAll('.pvtb-item')].map((n) => {
    const box = n.querySelector('.pvtb-ico');
    const im = box ? box.querySelector('img') : null;
    return {
      text: (n.querySelector('.pvtb-text') || {}).textContent || '',
      on: n.classList.contains('on'),
      color: n.style.color,
      ico: !!box,
      src: im ? (im.getAttribute('src') || '') : ''
    };
  });
  return JSON.stringify({
    count: items.length,
    icoCount: items.filter((x) => x.ico).length,
    srcs: items.map((x) => x.src),
    texts: items.map((x) => x.text + (x.on ? '★' : '')).join(' / '),
    onText: (items.filter((x) => x.on)[0] || {}).text || '',
    onColor: (items.filter((x) => x.on)[0] || {}).color || ''
  });
})()`;

const draftCount = async () => {
  const r = await fetch(SITE + '/api/decorate/stats', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  const jj = await r.json();
  return jj.data && jj.data.drafts;
};

ADMIN_TOKEN = await fetchAdminToken();
if (!ADMIN_TOKEN) {
  console.error('拿不到管理员会话：请设置 ADMIN_PASSWORD 或 ADMIN_TOKEN 后重跑');
  process.exit(1);
}

console.log('\n[1] 装修台列表页');
let tab = await open(SITE + '/admin/');
{
  // 报告 08 之后装修台必须登录：不先登一次，下面所有断言都会因为「页面只有登录弹层」而全红
  const lg = await ensureLoggedIn(tab);
  if (lg.indexOf('list-empty') === 0) {
    console.error('装修台没进入可用状态（' + lg + '）：页面可能没弹出登录层，请先手动看一次 /admin/');
    process.exit(1);
  }
  const who = JSON.parse(await run(tab, `JSON.stringify({ name: (document.getElementById('tbWho')||{}).textContent || '' })`));
  console.log('    已登录：' + (who.name || '(顶栏未显示身份)'));
}
{
  const info = JSON.parse(await run(tab, `(() => {
    const c = document.getElementById('navCard');
    return JSON.stringify({
      navCard: !!c && !c.hidden,
      navCardText: c ? c.innerText.replace(/\\s+/g, ' ') : '',
      pageRows: document.querySelectorAll('#pageRows tr').length,
      /* 「装修」/页面名都是 <a href="/admin?edit=<key>">（新窗口直达编辑器），
         没有 data-open 了 —— 从 href 里取 key，别再去找那个已下线的属性。 */
      rowKeys: [...new Set([...document.querySelectorAll('#pageRows a.pname')]
        .map((a) => decodeURIComponent((String(a.getAttribute('href') || '').split('edit=')[1] || ''))))],
      customKeys: [...document.querySelectorAll('#pageRows [data-del]')].map((x) => x.getAttribute('data-del'))
    });
  })()`));
  ok(info.navCard && /店铺导航/.test(info.navCardText) && /全局配置/.test(info.navCardText),
    '列表上方有「店铺导航」卡片（全局配置）', info.navCardText.slice(0, 70));
  /*
   * 别写死行数 —— 运营随时会自建自定义页（当前就有 2 个）。
   * 锁「等价关系」：5 个内置页一个不少、自定义页数量对得上、nav 一定不在列表里。
   * 写死 5 会在运营建页后变成假红，上一轮已经踩过一次（check-all 的同类断言）。
   */
  const builtin = ['home', 'lexy', 'news', 'product', 'mine'];
  const missingBuiltin = builtin.filter((k) => info.rowKeys.indexOf(k) < 0);
  ok(missingBuiltin.length === 0 &&
     info.pageRows === builtin.length + info.customKeys.length &&
     info.rowKeys.indexOf('nav') < 0,
    '页面表格 = 5 个内置页 + 自定义页，且导航（全局配置）不混进页面列表',
    `行数 ${info.pageRows} · 自定义 ${info.customKeys.length} 个 · 缺内置 ${missingBuiltin.join(',') || '无'} · 含 nav=${info.rowKeys.indexOf('nav') >= 0}`);
}

console.log('\n[2] 进入导航编辑器');
/*
 * 编辑器是「新窗口直达」形式：列表里的「装修」/ 页面名 / 「设置底部导航」都是
 * <a href="/admin?edit=nav" target="_blank">，链接自己开新窗口（见 admin.js 的注释：
 * 同时留着 data-open 委托会「既切视图又开新窗口」出现双份效果）。
 * 所以这里**不要模拟点击**，直接开编辑器地址；带 ?edit= 时页面登录完会自己续上。
 */
await close(tab);
tab = await open(SITE + '/admin/?edit=nav');
await ensureLoggedIn(tab);
await sleep(1800);
{
  const st = JSON.parse(await run(tab, `(() => JSON.stringify({
    navMode: !!document.querySelector('.view.edit.nav-mode'),
    lib: document.querySelector('.col-lib') ? getComputedStyle(document.querySelector('.col-lib')).display : 'n/a',
    tag: (document.getElementById('edPageTag') || {}).textContent || '',
    title: (document.getElementById('phTitle') || {}).textContent || '',
    tree: [...document.querySelectorAll('#tree .tnode .txt')].map((x) => x.textContent).join(' | ')
  }))()`));
  ok(st.navMode && st.lib === 'none', '导航编辑器隐藏「组件库」栏（全局配置没有区块可加）', `nav-mode=${st.navMode} lib=${st.lib}`);
  ok(st.tag === '全局配置' && st.title === '店铺导航', '页面标签 / 标题正确', `${st.tag} · ${st.title}`);
  ok(/首页 → 首页/.test(st.tree) && st.tree.split('|').length === 5, '区块树 5 项，标题形如「名称 → 跳转页面」', st.tree);

  const bar = JSON.parse(await run(tab, BAR));
  ok(bar.count === 5 && bar.onText === '', '手机壳底部导航渲染 5 项，未选中任何项时不高亮', bar.texts);
  ok((await run(tab, `[...document.querySelectorAll('#inspector .rbg button')].map((b) => b.textContent + ':' + (b.className || '-')).join(' | ')`))
    === '图标+文字:on | 仅选中显示图标:- | 纯文字:-',
    '属性面板 = 图标样式三态 + 导航项列表 + 配色（默认「图标+文字」）');
}

console.log('\n[3] 点区块树第 3 项 → 底部导航高亮跟随');
await run(tab, `document.querySelectorAll('#tree .tnode')[2].click(); 'ok'`);
await sleep(900);
{
  const bar = JSON.parse(await run(tab, BAR));
  ok(bar.onText === '资讯' && bar.texts.split(' / ')[2].indexOf('★') > -1,
    '选中第 3 项后底部导航高亮「资讯」（按路径同步，不是按序号）', bar.texts);
  const panel = await run(tab, `document.getElementById('inspector').innerText.replace(/\\s+/g, ' ').slice(0, 60)`);
  ok(/导航名称/.test(panel) && /跳转页面/.test(panel), '属性面板切换为该导航项的字段（名称 / 跳转页面 / 两个图标）', panel);
}

console.log('\n[4] 改导航名称 → 实时 5 字截断');
await run(tab, `(() => { const i = document.querySelector('#inspector input[type=text]');
  i.value = '一二三四五六七八'; i.dispatchEvent(new Event('input', { bubbles: true })); if (i.onchange) i.onchange(); return 'ok'; })()`);
await sleep(900);
{
  const bar = JSON.parse(await run(tab, BAR));
  ok(bar.texts.split(' / ')[2] === '一二三四五★',
    '超 5 字被截成「一二三四五」且高亮保持（装修台预览的截断口径 = 发布后的口径）', bar.texts);
  ok(await run(tab, `document.body.innerText.indexOf('未保存') >= 0 ? 'y' : 'n'`) === 'y', '改动进入「未保存」状态（不会偷偷写盘）');
}

console.log('\n[5] 内置图标 / 自定义图标');
{
  /*
   * 底部导航图标是**包内资源**（/images/tabbar/…，复刻自有赞「店铺导航」的图标字体），
   * 由发布写进 replica.TABBAR，所以 5 项默认都有图标。这里同时验三件事：
   *   · 图标地址是包内路径（不是 /uploads）—— 真机 iconPath 只认包内路径；
   *   · 高亮项取「选中图标」、其余取「未选中图标」（-active 后缀切换正确）；
   *   · 预览页能取到这些图（/images/… 有只读路由，见 [6] 的图片破损检查）。
   */
  const bar = JSON.parse(await run(tab, BAR));
  ok(bar.icoCount === 5 && bar.srcs.every((s) => s.indexOf('/images/tabbar/') === 0),
    '5 项都渲染出内置图标，且地址都是包内路径 /images/tabbar/…', bar.srcs.join(' '));
  ok(bar.srcs[2] === '/images/tabbar/news-active.png' && bar.srcs[0] === '/images/tabbar/home.png',
    '高亮项用「选中图标」(-active)、其余用未选中图标', `资讯=${bar.srcs[2]} 首页=${bar.srcs[0]}`);
}
{
  // 「内置图标」快捷选择：点一下就把地址填进字段（运营不用手打 -active 路径）
  const clicked = await run(tab, `(() => {
    const strips = [...document.querySelectorAll('#inspector .presets')];
    if (strips.length < 2) return 'no-presets:' + strips.length;
    const btn = [...strips[1].querySelectorAll('.preset')]
      .find((b) => (b.querySelector('em') || {}).textContent === '我的');
    if (!btn) return 'no-mine-button';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(900);
  const bar = JSON.parse(await run(tab, BAR));
  ok(clicked === 'clicked' && bar.srcs[2] === '/images/tabbar/mine-active.png',
    '点「选中图标」里的内置「我的」→ 该字段立刻变成 mine-active.png 且手机壳跟着变',
    `click=${clicked} src=${bar.srcs[2]} strip=${(await run(tab, `document.querySelectorAll('#inspector .presets').length`))}`);
  const field = await run(tab, `(() => {
    const strips = [...document.querySelectorAll('#inspector .presets')];
    const inputs = [...document.querySelectorAll('#inspector input[type=text]')]
      .filter((x) => /图片地址/.test(x.placeholder || ''));
    return inputs[1] ? inputs[1].value : '(no-input)';
  })()`);
  ok(field === '/images/tabbar/mine-active.png', '字段值同步为内置路径（不只是预览变了）', field);
}
{
  // 自传图标仍然可用：把该字段换成外链，预览跟着换
  await run(tab, `(() => { const i = [...document.querySelectorAll('#inspector input[type=text]')]
    .filter((x) => /图片地址/.test(x.placeholder || ''))[1];
    i.value = 'https://example.test/i.png'; i.dispatchEvent(new Event('input', { bubbles: true })); if (i.onchange) i.onchange(); return 'ok'; })()`);
  await sleep(1000);
  const bar = JSON.parse(await run(tab, BAR));
  ok(bar.srcs[2] === 'https://example.test/i.png' && bar.icoCount === 5,
    '改成外链图标后该项跟着换，其余 4 项仍是内置图标', bar.srcs.join(' '));
}

// 换「纯文字」：图标框应全部消失（用新标签页避免触发「返回」的离开确认）
await close(tab);
tab = await open(SITE + '/admin/?edit=nav');
await ensureLoggedIn(tab);
await sleep(1800);
await run(tab, `(() => { const b = [...document.querySelectorAll('#inspector .rbg button')].find((x) => x.textContent === '纯文字'); b.click(); return 'ok'; })()`);
await sleep(900);
{
  const st = await run(tab, `[...document.querySelectorAll('#inspector .rbg button')].map((b) => b.textContent + ':' + (b.className || '-')).join(' | ')`);
  ok(st === '图标+文字:- | 仅选中显示图标:- | 纯文字:on', '切到「纯文字」后按钮选中态正确', st);
  const bar = JSON.parse(await run(tab, BAR));
  ok(bar.count === 5 && bar.icoCount === 0, '「纯文字」模式下手机壳里一个图标框都没有', `${bar.icoCount} 个`);
  ok(await draftCount() === 0, '全程未落盘：服务端草稿数仍为 0（关标签页即丢弃）');
}
await close(tab);

console.log('\n[6] 预览页 /preview 高亮跟随');
tab = await open(SITE + '/preview/', 2800);
{
  const a = JSON.parse(await run(tab, BAR));
  ok(a.count === 5 && a.onText === '首页' && a.onColor === 'rgb(200, 16, 46)',
    '首页：第 1 项高亮且用选中色 #C8102E', `${a.texts} · ${a.onColor}`);
  await run(tab, `(() => {
    const hit = [...document.querySelectorAll('#pvPages .pv-item')].find((x) => /资讯/.test(x.textContent));
    if (hit) hit.click(); return 'ok';
  })()`);
  await sleep(1800);
  {
    const b = JSON.parse(await run(tab, BAR));
    ok(b.onText === '资讯', '切到「资讯」页后高亮跟到第 3 项（按路径匹配，不是按序号）', b.texts);
  }

  /*
   * 导航项指向**自定义页**时（当前第 4 项「产品」→ 微页面），光看内置页验不出来：
   * 预览里的「产品」页是 /pages/product/product，与第 4 项的目标路径不是同一个 ——
   * 点它**理应不高亮**。所以这里从**已发布的导航数据**里读出那条自定义页目标，
   * 打开它对应的预览页，高亮必须跟过去。
   * 这就是「指定微页面被选为底部导航跳转页时也展示底部导航」那件事的端到端验证。
   */
  const navData = await (await fetch(SITE + '/api/decorate/page?key=nav',
    { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } })).json();
  const customItem = (((navData.data || {}).published || {}).items || [])
    .filter((it) => String(it.path).indexOf('/pages/custom/index?key=') === 0)[0];
  if (customItem) {
    const hit = await run(tab, `(() => {
      const row = [...document.querySelectorAll('#pvPages .pv-item')]
        .find((x) => ((x.querySelector('small') || {}).textContent || '') === ${JSON.stringify(customItem.path)});
      if (!row) return 'no-row';
      row.click(); return 'clicked';
    })()`);
    await sleep(1800);
    const d = JSON.parse(await run(tab, BAR));
    ok(hit === 'clicked' && d.onText === customItem.text,
      '导航项指向自定义页时，打开那个微页面高亮跟到对应项（' + customItem.text + ' → ' + customItem.path + '）',
      `click=${hit} onText=${d.onText} · ${d.texts}`);
    // 反过来：点内置「产品」页不高亮任何项（它的路径不是第 4 项的目标）—— 这正是易错处
    await run(tab, `(() => {
      const row = [...document.querySelectorAll('#pvPages .pv-item')]
        .find((x) => ((x.querySelector('small') || {}).textContent || '') === '/pages/product/product');
      if (row) row.click(); return 'ok';
    })()`);
    await sleep(1500);
    const e = JSON.parse(await run(tab, BAR));
    ok(e.onText === '', '内置「产品」页不高亮任何导航项（第 4 项指向的是微页面，不是这个页面）', e.texts);
  } else {
    console.log('    （当前导航没有指向自定义页的项，跳过那两条断言）');
  }

  const img = JSON.parse(await run(tab, `(() => JSON.stringify({
    n: document.querySelectorAll('#preview img').length,
    broken: [...document.querySelectorAll('#preview img')].filter((i) => i.complete && i.naturalWidth === 0).length
  }))()`));
  ok(img.n > 0 && img.broken === 0, '预览页图片全部可用（无破损）', `${img.n} 张 / 破损 ${img.broken}`);

  /*
   * 底部导航的图标是**包内资源**（/images/tabbar/…），小程序端从代码包里读；
   * 但预览页是在**浏览器**里渲染的 —— 靠后端那条 /images/ 只读路由才取得到。
   * 这条断言就是那条约定的哨兵：路由一没，预览页底部立刻变成 5 个裂图。
   */
  const tb = JSON.parse(await run(tab, `(() => {
    const bar = document.getElementById('phTabbar');
    const ims = bar ? [...bar.querySelectorAll('.pvtb-ico img')] : [];
    return JSON.stringify({
      n: ims.length,
      broken: ims.filter((i) => i.complete && i.naturalWidth === 0).length,
      srcs: ims.map((i) => i.getAttribute('src') || '')
    });
  })()`));
  ok(tb.n === 5 && tb.broken === 0 && tb.srcs.every((s) => s.indexOf('/images/tabbar/') === 0),
    '预览页底部导航 5 张包内图标全部加载成功（浏览器侧靠 /images/ 只读路由）',
    `${tb.n} 张 / 破损 ${tb.broken} · ${tb.srcs.join(' ')}`);
}
await close(tab);

console.log('');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
