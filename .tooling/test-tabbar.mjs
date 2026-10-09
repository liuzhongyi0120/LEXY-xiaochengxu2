/**
 * 底部导航（店铺导航 / custom tabBar）专项单测
 *
 * 覆盖六组，全部在内存里跑纯函数 / 真实源码，不写文件、不连后端：
 *   [1] 兜底值三处一致：后端 schema / 小程序组件 / 预览渲染 pv-tabbar.js
 *   [2] schema.normalizeTabbar 的边界与幂等（发布链路的无损校验依赖幂等）
 *   [3] store.validate('nav') 的边界（微信硬限制：2~5 项 · 页面白名单）
 *   [4] emit 生成器：有 TABBAR 时写出并列入导出清单；无则整段省略
 *   [5] 小程序组件行为（用 vm 跑**真实组件源码**）：setActive 按路径、未命中 -1、
 *       onTap 只 switchTab、readConfig 的过滤 / 截断 / 兜底
 *   [6] 共享渲染 pv-tabbar.js 的渲染规则（DOM 桩）：项数 / 选中配色 /
 *       「仅选中显示图标」的占位 / 纯文字模式 / 隐藏 / 转义
 *
 * 为什么要跑真实组件源码：custom-tab-bar 是「每个 tab 页各一份实例」的特殊组件，
 * 它读不到真实自定义属性，只能靠 replica.TABBAR + 内部兜底 —— 这三处兜底值
 * 一旦有一处被单独改动，真机外观就会和装修台预览/预览页不一致，且只有真机才发现。
 *
 * 跑法：node .tooling/test-tabbar.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
  const calls = { switchTab: [], toast: [] };
  const req = replicaOverride
    ? (spec) => (spec === '../config/replica' ? replicaOverride : CTB_REQ(spec))
    : CTB_REQ;
  const sandbox = {
    console,
    require: req,
    Component: (d) => { def.value = d; },
    wx: {
      switchTab: (o) => { calls.switchTab.push(o.url); },
      showToast: (o) => { calls.toast.push(o.title); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(CTB_SRC, sandbox, { filename: 'custom-tab-bar/index.js' });
  return { def: def.value, calls };
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
  const { def } = loadComponent(null); // replica 里还没有 TABBAR → 组件只能走内置兜底
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
  ok(/不在小程序底部导航候选/.test(v({ items: [{ path: '/pages/index/index' }, { path: '/pages/custom/index' }] })),
    '非 tabBar 页面被拦（自定义页不能塞进底部导航）');
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
  const { def, calls } = loadComponent(null);
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

  const { def: d2 } = loadComponent({ TABBAR: {
    iconMode: '乱写', color: '#123456',
    items: [
      { text: '没有 path 的项' },
      { path: '/pages/mine/mine', text: '一二三四五六七八' },
      { path: '/pages/index/index', text: '首页' }
    ]
  } });
  ok(d2.data.items.length === 2, '没有 path 的项被丢掉', String(d2.data.items.length));
  ok(d2.data.items[0].text === '一二三四五', '超 5 字截断', JSON.stringify(d2.data.items[0].text));
  ok(d2.data.iconMode === 'always', '非法 iconMode 回落默认 always', d2.data.iconMode);
  ok(d2.data.color === '#123456', '自定义配色生效', d2.data.color);
  ok(d2.data.items[0].hasIcon === false && d2.data.items[0].icon === '', '没配图标的项 hasIcon=false');
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

console.log('');
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
