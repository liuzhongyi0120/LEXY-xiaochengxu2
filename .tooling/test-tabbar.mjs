/**
 * 底部导航（店铺导航 / custom tabBar）专项单测
 *
 * 覆盖七组，全部在内存里跑纯函数 / 真实源码，不写文件、不连后端：
 *   [1] 兜底值三处一致：后端 schema / 小程序组件 / 预览渲染 pv-tabbar.js
 *   [2] schema.normalizeTabbar 的边界与幂等（发布链路的无损校验依赖幂等）
 *   [3] store.validate('nav') 的边界（微信硬限制：2~5 项 · 目标页面白名单）
 *   [4] emit 生成器：有 TABBAR 时写出并列入导出清单；无则整段省略
 *   [5] 小程序组件行为（用 vm 跑**真实组件源码**）：setActive 按路径、未命中 -1、
 *       onTap 的分流（内置页 switchTab / 自定义页 navigateTo / 容器内 redirectTo）、
 *       readConfig 的过滤 / 截断 / 兜底
 *   [6] 共享渲染 pv-tabbar.js 的渲染规则（DOM 桩）：项数 / 选中配色 /
 *       「仅选中显示图标」的占位 / 纯文字模式 / 隐藏 / 转义
 *   [7] 内置导航图标：三处兜底项逐项一致 + 10 张图标文件真的在代码包里
 *   [8] 导航图标染色（复刻有赞「导航图标色」）：两处口径等价 / 默认态零变化 /
 *       只染内置图标 / 真机组件两态地址 / 「仅选中显示图标」的 visibility 占位 /
 *       加载失败回落
 *
 * 为什么要跑真实组件源码：custom-tab-bar 是「每个 tab 页各一份实例」的特殊组件，
 * 它读不到真实自定义属性，只能靠 replica.TABBAR + 内部兜底 —— 这三处兜底值
 * 一旦有一处被单独改动，真机外观就会和装修台预览/预览页不一致，且只有真机才发现。
 *
 * ⚠️ 验「内置兜底」时必须喂一份**没有 TABBAR 的替身 replica**。
 *    `loadComponent(null)` 读的是**真实 replica**（已发布数据，运营会把某一项指到微页面、
 *    把文案改成「个人」），拿它比兜底必然不一致 —— 本文件曾因此出现假红。
 *
 * 跑法：node .tooling/test-tabbar.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MP = join(ROOT, 'miniprogram');

const schema = require('../server/decorate/schema');
const store = require('../server/decorate/store');
const emit = require('../server/decorate/emit');
const PvTabbar = require('../server/public/shared/pv-tabbar.js').PvTabbar;
const NavColor = require('../miniprogram/utils/navcolor.js');
const { BASE_URL } = require('../miniprogram/utils/constants.js');

let pass = 0;
let fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/** 只取比对用的字段（避免 JSON 键序/多余字段造成假红灯） */
const canon = (c) => JSON.stringify({
  color: c.color, selectedColor: c.selectedColor, background: c.background,
  borderColor: c.borderColor, iconMode: c.iconMode,
  items: (c.items || []).map((i) => [i.path, i.text, i.icon || '', i.activeIcon || ''])
});

/* ---------------------- 小程序组件：用 vm 跑真实源码 ---------------------- */

const CTB_FILE = join(MP, 'custom-tab-bar', 'index.js');
const CTB_SRC = readFileSync(CTB_FILE, 'utf8');
const CTB_REQ = createRequire(CTB_FILE);

/**
 * 跑一遍组件源码，拿到 Component 定义。
 * @param {object=} replicaOverride 传了就把 require('../config/replica') 换掉（模拟「已发布过导航」）
 */
function loadComponent(replicaOverride) {
  const def = {};
  const calls = { switchTab: [], toast: [], navigateTo: [], redirectTo: [] };
  /* 页面栈：onTap 里读 getCurrentPages() 决定用 navigateTo 还是 redirectTo（在自定义页容器内时） */
  const stack = { list: [{ route: 'pages/index/index' }] };
  const req = replicaOverride
    ? (spec) => (spec === '../config/replica' ? replicaOverride : CTB_REQ(spec))
    : CTB_REQ;
  const sandbox = {
    console,
    require: req,
    Component: (d) => { def.value = d; },
    getCurrentPages: () => stack.list,
    wx: {
      switchTab: (o) => { calls.switchTab.push(o.url); },
      navigateTo: (o) => { calls.navigateTo.push(o.url); },
      redirectTo: (o) => { calls.redirectTo.push(o.url); },
      showToast: (o) => { calls.toast.push(o.title); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(CTB_SRC, sandbox, { filename: 'custom-tab-bar/index.js' });
  return { def: def.value, calls, stack };
}

/** 造一个组件实例（只实现 setActive / onTap 需要的那点宿主能力） */
function makeInst(def) {
  const inst = {
    data: JSON.parse(JSON.stringify(def.data)),
    setData(patch) { Object.assign(this.data, patch); }
  };
  Object.keys(def.methods || {}).forEach((k) => { inst[k] = def.methods[k].bind(inst); });
  return inst;
}

/* ------------------------------ [1] 三处兜底一致 ------------------------------ */

console.log('[1] 兜底值三处一致（后端 schema / 小程序组件 / 预览渲染）');
{
  /* 喂一份**没有 TABBAR 的替身 replica**：组件才会走内置兜底。
     传 null 会读到真实 replica 的**已发布数据**（运营把第 4 项指到了微页面、
     第 5 项文案改成「个人」），那是「发布结果」不是「兜底值」，比出来必然不一致。 */
  const { def } = loadComponent({ CUSTOM_PAGES: {} });
  const trio = {
    '后端 schema': schema.tabbarDefault(),
    '小程序组件': def.data,
    '预览渲染': PvTabbar.normalize(null)
  };
  const vals = Object.keys(trio).map((k) => [k, canon(trio[k])]);
  const uniq = Array.from(new Set(vals.map((v) => v[1])));
  ok(uniq.length === 1, '三处默认配置逐字段一致',
    uniq.length === 1 ? '' : vals.map((v) => v[0] + '=' + v[1]).join(' ｜ '));
  ok(schema.tabbarDefault().items.length === 5, '默认 5 个导航项', String(schema.tabbarDefault().items.length));
  ok(schema.TABBAR_PAGES.every((p, i) => schema.tabbarDefault().items[i].path === p.path),
    '默认项顺序 = 内置页面顺序', schema.tabbarDefault().items.map((i) => i.path).join(','));
  ok(def.data.items.length === 5 && def.data.selected === 0, '组件在「没有 TABBAR」时仍渲染 5 项且默认高亮第 1 项');
}

/* ---------------------- [2] normalizeTabbar 边界与幂等 ---------------------- */

console.log('[2] schema.normalizeTabbar：边界与幂等');
{
  const d = (v) => schema.normalizeTabbar(v);
  const whitelisted = (c) => (c.items || []).every((i) => schema.TABBAR_PAGES.some((p) => p.path === i.path));

  ok(d(undefined).items.length === 5, 'undefined → 默认 5 项');
  ok(d({}).items.length === 5, '{} → 默认 5 项');
  ok(whitelisted(d({ items: [{ path: '/pages/nope/nope', text: '野路径' }] })),
    '非白名单 path 被换成候选页（否则真机 switchTab 打不开）', JSON.stringify(d({ items: [{ path: '/pages/nope/nope' }] }).items.map((i) => i.path)));

  const dup = d({ items: [
    { path: '/pages/index/index', text: 'A' },
    { path: '/pages/index/index', text: 'B' },
    { path: '/pages/mine/mine', text: 'C' }
  ] });
  ok(dup.items.length === 2 && dup.items[0].text === 'A',
    '同一页面重复出现只保留第一次（否则底部会有两处同时高亮）', JSON.stringify(dup.items.map((i) => i.text)));

  const long = d({ items: [
    { path: '/pages/index/index', text: '  一二三四五六七八  ' },
    { path: '/pages/lexy/lexy', text: '莱克' }
  ] });
  ok(long.items[0].text === '一二三四五', '文案超 5 字截断，且前导空格不吃字数配额', JSON.stringify(long.items[0].text));

  const empty = d({ items: [{ path: '/pages/news/news', text: '' }, { path: '/pages/mine/mine', text: '我的' }] });
  ok(empty.items[0].text === '资讯', '空文案回落页面名（装修台允许留空）', JSON.stringify(empty.items[0].text));

  const one = d({ items: [{ path: '/pages/news/news', text: '资讯' }] });
  ok(one.items.length === 2 && whitelisted(one), '只有 1 项时自动补足到 2（微信下限）', JSON.stringify(one.items.map((i) => i.path)));

  const many = d({ items: schema.TABBAR_PAGES.map((p) => ({ path: p.path, text: p.name })).concat([{ path: '/pages/index/index', text: '第六' }]) });
  ok(many.items.length === 5, '超过 5 项时截断到 5（微信上限）', String(many.items.length));

  ok(d({ color: 'red', selectedColor: '#abc', background: '', borderColor: '#00ff00' }).color === schema.TABBAR_DEFAULTS.color &&
    d({ selectedColor: '#abc' }).selectedColor === schema.TABBAR_DEFAULTS.selectedColor &&
    d({ background: '' }).background === schema.TABBAR_DEFAULTS.background &&
    d({ borderColor: '#00ff00' }).borderColor === '#00FF00',
    '色值非法回落默认 / 合法转大写（绝不把脏值写进 replica.js）');
  ok(d({ iconMode: '乱写' }).iconMode === 'always' && d({ iconMode: 'never' }).iconMode === 'never',
    'iconMode 非法回落 always，合法原样保留');

  const src = {
    iconMode: 'active', color: '#123456', selectedColor: '#abcdef',
    background: '#000000', borderColor: '#EEEEEE',
    items: [
      { path: '/pages/mine/mine', text: '  我的首页啦啊哦  ' },
      { path: '/pages/index/index', text: '首页啊' },
      { path: '/pages/mine/mine', text: '重复项' },
      { path: '/pages/lexy/lexy', text: '莱克', icon: '/uploads/x.png' }
    ]
  };
  const once = d(src);
  const twice = d(once);
  ok(JSON.stringify(once) === JSON.stringify(twice),
    '幂等：归一化结果再归一化完全一致（发布链路的无损校验靠它）',
    JSON.stringify(once) !== JSON.stringify(twice) ? JSON.stringify(once) + ' vs ' + JSON.stringify(twice) : '');
  ok(canon(once) === canon(PvTabbar.normalize(src)),
    'schema 与 pv-tabbar 的归一化结果逐字段一致（装修台拿草稿直接预览，口径必须完全相同）',
    canon(once) === canon(PvTabbar.normalize(src)) ? '' : canon(once) + ' vs ' + canon(PvTabbar.normalize(src)));
  ok(JSON.stringify(PvTabbar.PAGES) === JSON.stringify(schema.TABBAR_PAGES),
    'pv-tabbar 内置的候选页面表与后端 schema.TABBAR_PAGES 一致（第 4 处副本，靠这条锁死）',
    JSON.stringify(PvTabbar.PAGES));
  ok(PvTabbar.MIN_ITEMS === schema.TABBAR_MIN && PvTabbar.MAX_ITEMS === schema.TABBAR_MAX,
    'pv-tabbar 的项数上下限与后端一致', `${PvTabbar.MIN_ITEMS}~${PvTabbar.MAX_ITEMS} vs ${schema.TABBAR_MIN}~${schema.TABBAR_MAX}`);

  // 三处「文案截断」规则必须行为一致（预览显示的和真机发布后的必须是同一个字符串）
  const { def: cutDef } = loadComponent({ TABBAR: src });
  ok(once.items[0].text === cutDef.data.items[0].text && once.items[0].text === PvTabbar.normalize(src).items[0].text,
    '超长文案的截断结果三处一致（trim → 截 5 字 → trim）',
    [once.items[0].text, cutDef.data.items[0].text, PvTabbar.normalize(src).items[0].text].map(JSON.stringify).join(' / '));
  ok(!!cutDef.data.items[2].hasIcon && cutDef.data.items[2].icon.indexOf('/uploads/x.png') > -1,
    '组件对图标做 resolveAssets（replica 里存的是 /uploads/… 相对路径，真机必须是绝对地址）',
    cutDef.data.items[2].icon);
  ok(once.items.every((it, i) => cutDef.data.items[i] && cutDef.data.items[i].path === it.path && cutDef.data.items[i].text === it.text),
    '组件渲染出的项顺序与文案与归一化结果一致（运营在装修台调过的顺序/文案真机会照做）',
    cutDef.data.items.map((i) => i.text + '@' + i.path).join(','));
  ok(cutDef.data.items.length === once.items.length,
    '组件对重复页面也去重（与后端 / 预览同口径，避免底部两处同时高亮）',
    `${cutDef.data.items.length} vs ${once.items.length}`);
}

/* ------------------------- [3] store.validate('nav') ------------------------- */

console.log("[3] store.validate('nav')：微信硬限制");
{
  const v = (d) => store.validate('nav', d);
  ok(v(schema.tabbarDefault()) === '', '默认配置通过校验', v(schema.tabbarDefault()));
  ok(/至少需要 2 项/.test(v({ items: [{ path: '/pages/index/index', text: 'A' }] })), '1 项被拦（微信下限 2）');
  ok(/最多 5 项/.test(v({ items: new Array(6).fill({ path: '/pages/index/index', text: 'A' }) })), '6 项被拦（微信上限 5）');
  ok(/不能作为底部导航目标/.test(v({ items: [{ path: '/pages/index/index' }, { path: '/pages/cart/cart' }] })),
    '分类 / 购物车这类「既不是内置 tab 页、也不是自定义页」的路径被拦（真机 switchTab 打不开，也没地方渲染导航）',
    v({ items: [{ path: '/pages/index/index' }, { path: '/pages/cart/cart' }] }));
  ok(v({ items: [{ path: '/pages/index/index' }, { path: '/pages/custom/index?key=p236' }] }) === '',
    '自定义页（带 ?key=）可以当底部导航目标 —— 小程序端改走 navigateTo 并在页内自渲染导航');
  ok(/不能作为底部导航目标/.test(v({ items: [{ path: '/pages/index/index' }, { path: '/pages/custom/index' }] })),
    '/pages/custom/index 少了 ?key= 仍被拦（认不出是哪一页，真机也打不开）',
    v({ items: [{ path: '/pages/index/index' }, { path: '/pages/custom/index' }] }));
  ok(/同一个页面只能出现一次/.test(v({ items: [
    { path: '/pages/index/index', text: '首页' }, { path: '/pages/lexy/lexy', text: '莱克' },
    { path: '/pages/news/news', text: '资讯' }, { path: '/pages/lexy/lexy', text: '莱克又一次' }
  ] })),
    '同一页面配两次被拦（否则他配了 4 项、真机只有 3 项，且两处指向同一页 —— 静默少一项最难查）',
    v({ items: [
      { path: '/pages/index/index', text: '首页' }, { path: '/pages/lexy/lexy', text: '莱克' },
      { path: '/pages/news/news', text: '资讯' }, { path: '/pages/lexy/lexy', text: '莱克又一次' }
    ] }));
  ok(/必须是对象/.test(v(null)), '非对象被拦');
  ok(/缺少 items/.test(v({})), '缺 items 被拦');
  ok(/至少需要 2 项/.test(v({ items: [{ text: 'A' }, { text: 'B' }] })),
    '没有 path 的项不计入项数（两个空项 = 0 项，仍被拦）', v({ items: [{ text: 'A' }, { text: 'B' }] }));
}

/* ------------------------- [4] emit 生成器的输出 ------------------------- */

console.log('[4] emit：TABBAR 的条件输出与导出清单');
{
  const runReplica = (code) => {
    const mod = { exports: {} };
    new vm.Script('(function(module){' + code + '})(module);').runInNewContext({ module: mod });
    return mod.exports;
  };

  const asmWith = store.assemble(store.publishedAll());
  const codeWith = emit.emitReplica(asmWith, { originalSrc: '', publishedAt: Date.now() });
  ok(codeWith.includes('const TABBAR'), '装配结果总是含 TABBAR（nav 的 from() 会把「没有配置」也归一成默认值）');
  ok(/module\.exports\s*=\s*\{[\s\S]*\bTABBAR\b[\s\S]*\}/.test(codeWith), '导出清单包含 TABBAR');
  ok(['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS', 'PAGE_META']
    .every((k) => codeWith.includes('const ' + k)), '其余 7 个字段一个不少');
  const mod = runReplica(codeWith);
  ok(!!mod.TABBAR && mod.TABBAR.items.length === 5, '生成的 replica.js 可执行且 TABBAR 有 5 项',
    mod.TABBAR ? String(mod.TABBAR.items.length) : 'undefined');

  const asmNo = store.assemble(store.publishedAll());
  delete asmNo.TABBAR;
  const codeNo = emit.emitReplica(asmNo, { originalSrc: '', publishedAt: Date.now() });
  ok(!codeNo.includes('const TABBAR'), '生成器层面：没有 TABBAR 时整段省略');
  ok(!/module\.exports\s*=\s*\{[\s\S]*\bTABBAR\b[\s\S]*\}/.test(codeNo), '导出清单也不含 TABBAR（杜绝「导出了不存在的变量」）');
  const modNo = runReplica(codeNo);
  ok(modNo.TABBAR === undefined && modNo.SHOP && modNo.PAGE_META, '老结构的 replica.js 仍可正常加载');

  const pd2 = store.publishedAll();
  pd2.nav = {
    iconMode: 'never', color: '#000000', selectedColor: '#ffffff', background: '#fafafa', borderColor: '#dddddd',
    items: [{ path: '/pages/mine/mine', text: '  我  ' }, { path: '/pages/news/news', text: '资讯' }]
  };
  const mod2 = runReplica(emit.emitReplica(store.assemble(pd2), { originalSrc: '', publishedAt: Date.now() }));
  ok(mod2.TABBAR.iconMode === 'never' && mod2.TABBAR.background === '#FAFAFA' &&
    mod2.TABBAR.items.length === 2 && mod2.TABBAR.items[0].path === '/pages/mine/mine' && mod2.TABBAR.items[0].text === '我',
    '自定义导航（顺序反转 / 纯文字 / 小写色值）如实写回',
    JSON.stringify(mod2.TABBAR.items.map((i) => i.text + '@' + i.path)));
}

/* --------------------- [5] 小程序组件行为（真实源码） --------------------- */

console.log('[5] 小程序组件行为（vm 跑真实组件源码）');
{
  /* 同上：验兜底要喂没有 TABBAR 的替身 replica（否则 items 是「已发布数据」，
     第 4 项指向微页面、高亮按路径自然找不到） */
  const { def, calls, stack } = loadComponent({ CUSTOM_PAGES: {} });
  const inst = makeInst(def);

  inst.setActive('/pages/product/product');
  ok(inst.data.selected === 3, 'setActive 按路径定位高亮（产品 → 第 4 项）', String(inst.data.selected));
  inst.setActive('/pages/news/news');
  ok(inst.data.selected === 2, '换路径立刻改高亮（顺序无关）', String(inst.data.selected));
  inst.setActive('/pages/nope/nope');
  ok(inst.data.selected === -1, '路径不在导航里 → 全部不高亮（宁可不亮，也不错误地高亮别人）', String(inst.data.selected));

  const reordered = loadComponent({ TABBAR: {
    items: [{ path: '/pages/mine/mine', text: '我的' }, { path: '/pages/index/index', text: '首页' }]
  } });
  const inst2 = makeInst(reordered.def);
  inst2.setActive('/pages/mine/mine');
  ok(inst2.data.selected === 0, '装修台调过顺序后，按路径仍能找到（用序号就会错位）', String(inst2.data.selected));

  inst.setActive('/pages/index/index');
  const before = calls.switchTab.length;
  inst.onTap({ currentTarget: { dataset: { index: 0 } } });
  ok(calls.switchTab.length === before, '点当前页不触发 switchTab（避免无意义闪动）');
  inst.onTap({ currentTarget: { dataset: { index: 3 } } });
  ok(calls.switchTab.length === before + 1 && calls.switchTab[calls.switchTab.length - 1] === '/pages/product/product',
    '点其它项 wx.switchTab 到对应路径', calls.switchTab.join(','));
  inst.onTap({ currentTarget: { dataset: { index: 99 } } });
  ok(calls.switchTab.length === before + 1 && calls.toast.length === 0, '越界索引不崩、不误跳、不误报错');

  /* 目标页面是「自定义页」时必须换一条路：微信只允许 switchTab 打开 tabBar.list 里的页面，
     自定义页共用 pages/custom/index 且靠 ?key= 区分 —— switchTab 既进不去、也传不了参数。 */
  const cp = loadComponent({
    TABBAR: { items: [
      { path: '/pages/index/index', text: '首页' },
      { path: '/pages/custom/index?key=p236', text: '全系' }
    ] },
    CUSTOM_PAGES: { p236: { name: '全系' } }
  });
  const instCp = makeInst(cp.def);
  instCp.setActive('/pages/index/index');
  instCp.onTap({ currentTarget: { dataset: { index: 1 } } });
  ok(cp.calls.navigateTo.length === 1 && cp.calls.navigateTo[0] === '/pages/custom/index?key=p236',
    '点自定义页项用 navigateTo（switchTab 打不开，也传不了 ?key=）', cp.calls.navigateTo.join(','));
  ok(cp.calls.switchTab.length === 0 && cp.calls.redirectTo.length === 0,
    '自定义页目标绝不误用 switchTab / redirectTo', `switchTab=${cp.calls.switchTab.length} redirectTo=${cp.calls.redirectTo.length}`);

  /* 已经在自定义页容器里 → redirectTo 替换当前页。
     不这么做时「自定义页 A → B → C…」会把页面栈越堆越深（微信上限 10 层），返回也要连按多次。 */
  cp.stack.list.push({ route: 'pages/custom/index' });
  instCp.setActive('/pages/index/index');
  instCp.onTap({ currentTarget: { dataset: { index: 1 } } });
  ok(cp.calls.redirectTo.length === 1 && cp.calls.navigateTo.length === 1,
    '已在自定义页容器内再点自定义页项 → redirectTo（换成 navigateTo 会把页面栈越堆越深）',
    `navigateTo=${cp.calls.navigateTo.join(',')} redirectTo=${cp.calls.redirectTo.join(',')}`);

  const { def: d2 } = loadComponent({ TABBAR: {
    iconMode: '乱写', color: '#123456',
    items: [
      { text: '没有 path 的项' },
      { path: '/pages/mine/mine', text: '一二三四五六七八', icon: '/images/tabbar/mine.png' },
      { path: '/pages/index/index', text: '首页' }
    ]
  } });
  ok(d2.data.items.length === 2, '没有 path 的项被丢掉', String(d2.data.items.length));
  ok(d2.data.items[0].text === '一二三四五', '超 5 字截断', JSON.stringify(d2.data.items[0].text));
  ok(d2.data.iconMode === 'always', '非法 iconMode 回落默认 always', d2.data.iconMode);
  ok(d2.data.color === '#123456', '自定义配色生效', d2.data.color);
  ok(d2.data.items[1].hasIcon === false && d2.data.items[1].icon === '',
    '没配图标的项 hasIcon=false / icon 为空（装修台「纯文字」与真机同口径）',
    JSON.stringify([d2.data.items[1].hasIcon, d2.data.items[1].icon]));
  ok(d2.data.items[0].icon === '/images/tabbar/mine.png' && d2.data.items[0].activeIcon === '/images/tabbar/mine.png',
    '运营只配一张图时两态用同一张（activeIcon 空 → 沿用未选中图标）',
    JSON.stringify([d2.data.items[0].icon, d2.data.items[0].activeIcon]));
  /* 包内图标（站内路径）不能被 resolveAssets 拼上域名，否则真机取不到图 */
  ok(d2.data.items[0].icon.indexOf('http') < 0,
    '站内路径 /images/… 原样保留，不被 resolveAssets 拼域名', d2.data.items[0].icon);
}

/* ------------------- [6] 共享渲染 pv-tabbar.js 的渲染规则 ------------------- */

console.log('[6] 共享渲染 pv-tabbar.js（装修台手机壳 + /preview 共用的唯一实现）');
{
  const makeDoc = () => ({
    head: { children: [], appendChild(n) { this.children.push(n); } },
    getElementById(id) { return this.head.children.filter((n) => n.id === id)[0] || null; },
    createElement(tag) { return { tagName: tag, id: '', textContent: '' }; }
  });
  const makeBox = (doc) => ({ ownerDocument: doc, style: {}, className: '', hidden: false, innerHTML: '' });
  const count = (s, sub) => s.split(sub).length - 1;
  const colorsOf = (html) => Array.from(html.matchAll(/style="color:([^"]*)"/g)).map((m) => m[1]);

  const ICONS = { items: [
    { path: '/pages/index/index', text: '首页', icon: '/uploads/a.png', activeIcon: '/uploads/a2.png' },
    { path: '/pages/lexy/lexy', text: '莱克', icon: '/uploads/b.png' },
    { path: '/pages/mine/mine', text: '我的' }
  ]};

  // A. 图标 + 文字 / 选中态配色 / 选中图标
  const dA = makeDoc();
  const bA = makeBox(dA);
  PvTabbar.apply(bA, Object.assign({ iconMode: 'always' }, ICONS), '/pages/lexy/lexy', false);
  ok(bA.className === 'pvtb' && bA.hidden === false, 'class = pvtb，hidden=false 时可见');
  ok(count(bA.innerHTML, 'class="pvtb-item') === 3, '按配置渲染 3 项', String(count(bA.innerHTML, 'class="pvtb-item')));
  ok(count(bA.innerHTML, 'pvtb-ico') === 2, '只有配了图标的项才有图标框', String(count(bA.innerHTML, 'pvtb-ico')));
  const cA = colorsOf(bA.innerHTML);
  ok(cA.length === 3 && cA[1] === schema.TABBAR_DEFAULTS.selectedColor && cA[0] === schema.TABBAR_DEFAULTS.color,
    '选中项用 selectedColor、其余用 color', cA.join(','));
  ok(bA.innerHTML.includes('/uploads/a.png') && !bA.innerHTML.includes('/uploads/a2.png'),
    '未选中项用「未选中图标」（该页配了选中图标也不该用它）');
  const dA2 = makeDoc();
  const bA2 = makeBox(dA2);
  PvTabbar.apply(bA2, Object.assign({ iconMode: 'always' }, ICONS), '/pages/index/index', false);
  ok(bA2.innerHTML.includes('/uploads/a2.png') && !bA2.innerHTML.includes('/uploads/a.png'),
    '选中项优先用「选中图标」（同一项两态图标不同，必须切对）');
  ok(!/visibility:hidden/.test(bA.innerHTML), '图标+文字模式不隐藏任何图标');

  // B. 「仅选中显示图标」：隐藏而不是删掉，占位保留 → 文字不跳
  const dB = makeDoc();
  const bB = makeBox(dB);
  PvTabbar.apply(bB, Object.assign({ iconMode: 'active' }, ICONS), '/pages/index/index', false);
  ok(count(bB.innerHTML, 'pvtb-ico') === 2 && count(bB.innerHTML, 'visibility:hidden') === 1,
    '「仅选中显示图标」只隐藏未选中项，且图标框占位保留（文字不会上下跳）',
    `box=${count(bB.innerHTML, 'pvtb-ico')} hidden=${count(bB.innerHTML, 'visibility:hidden')}`);

  // C. 纯文字 / 无高亮项
  const dC = makeDoc();
  const bC = makeBox(dC);
  PvTabbar.apply(bC, Object.assign({ iconMode: 'never' }, ICONS), '', false);
  ok(count(bC.innerHTML, 'pvtb-ico') === 0, '纯文字模式完全没有图标框');
  ok(colorsOf(bC.innerHTML).every((c) => c === schema.TABBAR_DEFAULTS.color),
    'activePath 为空（自定义页）时没有任何项被高亮', colorsOf(bC.innerHTML).join(','));

  // D. 隐藏（自定义页真机上也没有底部导航）
  const dD = makeDoc();
  const bD = makeBox(dD);
  PvTabbar.apply(bD, ICONS, '/pages/index/index', true);
  ok(bD.hidden === true, 'hidden=true 时整条导航隐藏');

  // E. 背景色 / 分割线色来自配置
  const dE = makeDoc();
  const bE = makeBox(dE);
  PvTabbar.apply(bE, { background: '#000000', borderColor: '#333333', iconMode: 'never', items: ICONS.items }, '', false);
  ok(bE.style.background === '#000000' && bE.style.borderTopColor === '#333333',
    '背景色与顶部分割线色来自配置', `${bE.style.background} / ${bE.style.borderTopColor}`);

  // F. 文案转义（导航文案是运营输入，直接拼进 innerHTML）
  const dF = makeDoc();
  const bF = makeBox(dF);
  PvTabbar.apply(bF, { iconMode: 'never', items: [{ path: '/pages/index/index', text: '<img src=x onerror=alert(1)>' }] }, '', false);
  ok(bF.innerHTML.indexOf('<img') < 0 && bF.innerHTML.indexOf('&lt;img') > -1,
    '文案里的 HTML 被转义（装修台与预览页都是同源页面，必须防注入）');

  // G. 样式只注入一次 + 两条关键规则
  ok(dA.head.children.length === 1 && !!dA.getElementById('pvtbStyle'), '样式注入到文档头且只注入一次');
  PvTabbar.apply(bA, ICONS, '', false);
  ok(dA.head.children.length === 1, '二次 apply 不再重复注入样式（不随渲染次数累积）');
  const css = dA.head.children[0].textContent;
  ok(/\.pvtb\[hidden\]\{display:none !important;\}/.test(css),
    '[hidden] 兜底规则存在（作者样式的 display 会盖过 UA 样式表的 [hidden]{display:none}）');
  ok(/\.pvtb\{[^}]*height:50px/.test(css), '高度 50px —— 页面可视区 718px 的扣减基准，不许改');
  ok(/\.pvtb-ico\{height:22px/.test(css), '图标区 22px（与小程序组件 index.wxss 同口径）');

  // H. 去重先于截断：8 个「首页」只会剩 1 项，再补足到下限 2（上限分支是防御性的：
  //    5 个候选页去重后本来就不可能有第 6 项）
  const dH = makeDoc();
  const bH = makeBox(dH);
  PvTabbar.apply(bH, { iconMode: 'never', items: new Array(8).fill(0).map((_, i) => ({ path: '/pages/index/index', text: 'n' + i })) }, '', false);
  ok(count(bH.innerHTML, 'class="pvtb-item') === PvTabbar.MIN_ITEMS,
    `8 个重复项 → 去重剩 1 项 → 补足到下限 ${PvTabbar.MIN_ITEMS} 项`,
    String(count(bH.innerHTML, 'class="pvtb-item')));
  const dH2 = makeDoc();
  const bH2 = makeBox(dH2);
  PvTabbar.apply(bH2, { iconMode: 'never', items: schema.TABBAR_PAGES.map((p) => ({ path: p.path, text: p.name })) }, '', false);
  ok(count(bH2.innerHTML, 'class="pvtb-item') === 5, '5 个候选页全用上时渲染 5 项',
    String(count(bH2.innerHTML, 'class="pvtb-item')));
}

/* ------------------------ [7] 内置导航图标（包内资源） ------------------------ */

console.log('[7] 内置导航图标：包内文件与三处默认值对得上');
{
  /* 图标为什么必须在**代码包内**：微信原生 tabBar 的 iconPath 只认包内路径，
     且底部导航是每个页面都要立刻显示的界面骨架，不能依赖「素材已同步到线上」。
     目录：miniprogram/images/tabbar/（复刻自有赞图标字体 yz-tabbar-icon-v2，
     生成脚本 .tooling/make-tabbar-icons.py） */
  const DIR = join(MP, 'images', 'tabbar');
  const NAMES = ['home', 'lexy', 'news', 'product', 'mine'];
  const WANT = [];
  NAMES.forEach((n) => { WANT.push(n + '.png'); WANT.push(n + '-active.png'); });

  const missing = WANT.filter((f) => !existsSync(join(DIR, f)));
  ok(missing.length === 0, '10 张图标文件都在代码包里（少了真机底部图标直接空白）', missing.join(','));

  /* 按魔数校验：空文件 / 被截断 / 改名的文本文件在真机上都是「整条导航空白」，不报错 */
  const bad = WANT.filter((f) => {
    const p = join(DIR, f);
    if (!existsSync(p)) return true;
    const b = readFileSync(p);
    return !(b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47);
  });
  ok(bad.length === 0, '每张都真的是 PNG（按文件头魔数校验，不信任扩展名）', bad.join(','));

  // 三处默认值里的图标路径：必须落在 /images/tabbar/ 下、成对出现、且**两态文件**都真的存在
  const trioDefs = { schema: schema.tabbarDefault(), pv: PvTabbar.normalize(null) };
  ['schema', 'pv'].forEach((k) => {
    const items = trioDefs[k].items;
    const allIn = items.every((it) =>
      [it.icon, it.activeIcon].every((u) =>
        typeof u === 'string' && u.indexOf(schema.TABBAR_ICON_DIR) === 0 && existsSync(join(MP, u.slice(1)))));
    ok(allIn, `「${k}」默认项的选中 / 未选中图标都指向包内已存在的文件`,
      items.map((i) => i.icon + '→' + i.activeIcon).join(','));
    const paired = items.every((it) => it.activeIcon === it.icon.replace(/\.png$/, '-active.png'));
    ok(paired, `「${k}」每项选中图标 = 未选中图标加 -active（两态必须成对，否则选中时借不到别的字形）`,
      items.map((i) => i.icon + '→' + i.activeIcon).join(','));
  });

  ok(schema.TABBAR_PAGES.every((p) => !!schema.tabbarIconName(p.path)),
    '5 个内置 tab 页在 TABBAR_ICON_FILES 里都有对应图标名（漏一个 → 该页默认项没图标）',
    schema.TABBAR_PAGES.map((p) => p.path + '=' + (schema.tabbarIconName(p.path) || '✗')).join(' '));
  const iconVals = Object.keys(schema.TABBAR_ICON_FILES).map((k) => schema.TABBAR_ICON_FILES[k]);
  ok(new Set(iconVals).size === iconVals.length && iconVals.length === schema.TABBAR_PAGES.length,
    '图标名映射表与内置页面表一一对应且无重名（多一项 / 少一项 / 两项同图都会让默认值静默出错）',
    iconVals.join(','));
  ok(schema.TABBAR_ICON_DIR === '/images/tabbar/',
    '图标目录是唯一约定（装修台预览与 /preview 靠后端 /images/ 只读路由取同一张图，不另写一份）',
    schema.TABBAR_ICON_DIR);

  /* 图标快捷按钮（装修台字段下的「内置图标」）：值必须就是上面那 10 张，
     否则运营一点按钮就把导航改成了一张线上还没同步的图。 */
  const presetVals = schema.TABBAR_PRESET_OFF.concat(schema.TABBAR_PRESET_ON).map((p) => p.value);
  ok(presetVals.length === 10 && presetVals.every((v) => existsSync(join(MP, String(v).slice(1)))),
    '装修台「内置图标」快捷按钮的 10 个取值都指向包内真实文件',
    presetVals.join(','));
  ok(schema.TABBAR_PRESET_OFF.every((p, i) => p.value === schema.tabbarDefault().items[i].icon) &&
      schema.TABBAR_PRESET_ON.every((p, i) => p.value === schema.tabbarDefault().items[i].activeIcon),
    '快捷按钮的取值就是默认项自身（改默认项时按钮跟着变，不会各写一份后走样）');
}

/* -------------------- [8] 导航图标染色（有赞「导航图标色」） -------------------- */

console.log('\n[8] 导航图标染色：内置位图跟着配色走（有赞那套是图标字体，我们让服务端出一张染色 PNG）');
{
  /* 两处实现必须等价（真机 utils/navcolor.js / 预览 pv-tabbar.js 各存一份规则） */
  const icons = ['/images/tabbar/home.png', '/images/tabbar/home-active.png', '/images/tabbar/news-active.png'];
  const colors = ['#8A8A8A', '#C8102E', '#000000', '#FFFFFF', '#2B6CB0', '#0F9D58',
    '#F5A623', '#7B3FE4', '#FF0080', '#334155', '#E11D48', '#9661BC'];
  const diff = [];
  icons.forEach((s) => colors.forEach((h) => {
    const a = NavColor.iconPath(s, h);
    const b = PvTabbar.tintPath(s, h);
    /* 唯一允许的差异：真机要绝对地址（多一个 BASE_URL 前缀），预览与服务器同源用相对路径 */
    if (!(a === b || (b !== '' && a === BASE_URL + b))) diff.push(s + ' ' + h);
  }));
  ok(diff.length === 0, '两处染色口径等价（同一批「图标 × 色值」→ 同一串地址）', diff.join(' '));
  ok(NavColor.iconPath('/images/tabbar/home.png', '#2B6CB0') ===
    NavColor.iconPath('/images/tabbar/home.png', '#2b6cb0'),
    '大小写归一（同一色值必得同一地址，否则预览与真机会指向两张图）',
    NavColor.iconPath('/images/tabbar/home.png', '#2B6CB0'));

  /* 默认色 == 源图主色 → 不染色（改造前后像素零变化，而且零网络请求） */
  ok(NavColor.iconPath('/images/tabbar/home.png', schema.TABBAR_DEFAULTS.color) === '' &&
    NavColor.iconPath('/images/tabbar/home-active.png', schema.TABBAR_DEFAULTS.selectedColor) === '',
    '默认配色下不染色（源图主色就是 #8A8A8A / #C8102E，不必多这一次请求）',
    schema.TABBAR_DEFAULTS.color + ' / ' + schema.TABBAR_DEFAULTS.selectedColor);

  /* 自传图 / 素材库图不染 —— 与有赞一致（它只染自己的图标字体） */
  ok(NavColor.iconPath('/uploads/202610/a.png', '#2B6CB0') === '' &&
    NavColor.iconPath('http://x/uploads/202610/a.png', '#2B6CB0') === '',
    '自传 / 素材库图标保持原色（彩图被整体染色只会更糟，有赞也不染自传图）');

  /* 色值非法 → 不染（宁可保持原色，也不要拼出一个必然 404 的地址：那会变成空白图标） */
  ok(NavColor.iconPath('/images/tabbar/home.png', 'not-a-color') === '',
    '色值非法时不染色（地址一定 404，宁可留着原色图标）');

  /* 真机组件：改配色后 readConfig 必须把两态的地址一起算好 */
  const tinted = loadComponent({
    TABBAR: {
      color: '#2B6CB0', selectedColor: '#0F9D58', background: '#FFFFFF',
      borderColor: '#EEEEEE', iconMode: 'active', items: schema.TABBAR_DEFAULT_ITEMS
    }
  }).def.data;
  const it0 = (tinted.items || [])[0] || {};
  ok(it0.srcOff === BASE_URL + '/navicon/home@2b6cb0.png' &&
    it0.srcOn === BASE_URL + '/navicon/home-active@0f9d58.png',
    '真机组件两态各按自己的色算出图标地址（不能共用一条）', it0.srcOff + ' | ' + it0.srcOn);
  ok(it0.styleOff === 'visibility:hidden',
    '「仅选中显示图标」时未选中态 = visibility 占位（用 display:none 文字会上下跳）', it0.styleOff);

  /* 默认态：组件产出的地址必须仍是包内原图（喂一份没有 TABBAR 的替身，才会走兜底） */
  const plain = loadComponent({ CUSTOM_PAGES: {} }).def.data;
  ok((plain.items || []).every((i) => i.srcOff === i.rawOff && i.srcOn === i.rawOn &&
    String(i.srcOff).indexOf('/navicon/') === -1),
    '默认配色下组件仍用包内原图（零网络请求、改造前后真机零变化）',
    (plain.items || []).map((i) => i.srcOff).slice(0, 2).join(' | '));

  /* wxml 只原样输出算好的地址；另外必须挂加载失败回落 —— 染色图是网络图，取不到时会变空白 */
  const wxml = readFileSync(join(MP, 'custom-tab-bar', 'index.wxml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  ok(/selected === index \? item\.srcOn : item\.srcOff/.test(wxml) &&
    /binderror="onIconError"/.test(wxml),
    '真机 wxml 原样输出 item.srcOn / srcOff，并挂 binderror 回落到包内原图');
}

console.log('');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
