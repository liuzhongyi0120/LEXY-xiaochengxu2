/**
 * 个人中心「点得动」链路行为测试
 *
 * 用法： node .tooling/test-usercenter.mjs
 *
 * 为什么必须有这一份（而不是再做一遍静态断言）：
 *   用户的原话是「个人中心里所有功能都开发完善，现在每个点进去都点不了」。
 *   静态断言只能证明「页面文件在、跳转表写对了」，证明不了**点下去真的会去哪儿**。
 *   这一份把 `utils/blockPage.js` 的事件处理器**真的调一遍**（带上 wx 打桩），
 *   把每一次点击实际发出的 wx 调用抓下来逐条判定：
 *     · 该跳的必须 navigateTo 到一个 **app.json 里真实注册过的页面**；
 *     · 该讲原因的必须落「功能未开放」页，并且**带上了具体原因**（name + 足够长的 desc）；
 *     · 任何一次点击都**不许**只弹一句「开发中」这种等于没反应的提示。
 *
 * 判定口径与自检一致：页面清单以 app.json 为准（声明 ≠ 事实），
 * 依赖型入口的原因文案以 `blockPage.js` 的 NOT_READY 为准（原因只有一处定义）。
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const req = createRequire(import.meta.url);
const ROOT = process.cwd();
const MP = join(ROOT, 'miniprogram');

/* ------------------------------ 打桩 ------------------------------ */

globalThis.wx = new Proxy({}, { get: () => () => ({}) });
globalThis.Component = () => {};
globalThis.getApp = () => ({ globalData: {} });
globalThis.getCurrentPages = () => [];

/** 记录每一次 wx 调用（这就是「点下去到底发生了什么」的原始证据） */
let calls = [];
const reset = () => { calls = []; };

globalThis.wx = {
  navigateTo: (o) => { calls.push({ api: 'navigateTo', url: String((o && o.url) || '') }); },
  switchTab: (o) => { calls.push({ api: 'switchTab', url: String((o && o.url) || '') }); },
  redirectTo: (o) => { calls.push({ api: 'redirectTo', url: String((o && o.url) || '') }); },
  makePhoneCall: (o) => { calls.push({ api: 'makePhoneCall', phone: String((o && o.phoneNumber) || '') }); },
  showToast: (o) => { calls.push({ api: 'showToast', title: String((o && o.title) || '') }); },
  showModal: (o) => { calls.push({ api: 'showModal', title: String((o && o.title) || '') }); },
  showLoading: () => {}, hideLoading: () => {},
  setClipboardData: () => {}, setNavigationBarTitle: () => {},
  stopPullDownRefresh: () => {}, pageScrollTo: () => {},
  scanCode: () => {}, createInnerAudioContext: () => ({}),
  request: () => ({})
};

/** 页面模块捕获器（取真实的 Page 对象，方法名以它为准） */
function loadPage(rel) {
  let captured = null;
  globalThis.Page = (o) => { captured = o; };
  req(join(MP, rel + '.js'));
  return captured;
}

/* ------------------------------ 环境数据 ------------------------------ */

const appJson = JSON.parse(readFileSync(join(MP, 'app.json'), 'utf8'));
const registered = [];
(appJson.pages || []).forEach((p) => registered.push('/' + p));
(appJson.subPackages || []).forEach((sp) => (sp.pages || []).forEach((p) => registered.push('/' + sp.root + '/' + p)));

const routes = req(join(MP, 'utils', 'constants.js')).ROUTES;
const bp = req(join(MP, 'utils', 'blockPage.js'));
const blocksLib = req(join(MP, 'utils', 'blocks.js'));
const { UC_TOOL_ITEMS } = req(join(ROOT, 'server', 'decorate', 'yzUserCenter.js'));
const replica = req(join(MP, 'config', 'replica.js'));

/* 「拨打商家电话」要取客服号码：把 shop service 打桩成「后台已配号码」，
   这样既能验证拨号链路真的会调 wx.makePhoneCall，又不会在测试里发真实请求。 */
const shopSvc = req(join(MP, 'services', 'shop.js'));
const PHONE = '4008282288';
shopSvc.fetchSettings = () => Promise.resolve({ servicePhone: PHONE, serviceHours: '9:00-18:00' });

/* ------------------------------ 判定工具 ------------------------------ */

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

const pageOf = (url) => String(url || '').split('?')[0];
const isRegistered = (url) => registered.indexOf(pageOf(url)) >= 0;
const lastUrl = () => (calls.filter((c) => c.api === 'navigateTo').slice(-1)[0] || {}).url || '';
const hasToast = (t) => calls.some((c) => c.api === 'showToast' && c.title.indexOf(t) >= 0);

/** 造一个可以被事件处理器使用的页面上下文 */
function ctxOf(pageObj, extra) {
  return Object.assign({ data: { blocks: [] }, setData() {} }, pageObj || {}, extra || {});
}

/* ==========================================================================
 * 1. 必备工具：23 项逐个点
 * ========================================================================== */
{
  const mine = loadPage('pages/mine/mine');
  UC_TOOL_ITEMS.forEach((it) => {
    const ctx = ctxOf(mine);
    reset();
    bp.blockPageBehavior.onTapToolItem.call(ctx, { currentTarget: { dataset: { key: it.type, label: it.title } } });

    const nav = calls.filter((c) => c.api === 'navigateTo').slice(-1)[0];
    if (it.real === true && bp.TOOL_ROUTE[it.type]) {
      const want = bp.TOOL_ROUTE[it.type];
      check(`工具·${it.title}(${it.type}) 跳到真实页面`, nav && nav.url === want && isRegistered(want),
        nav ? `→ ${nav.url}${isRegistered(want) ? '' : '（未在 app.json 注册）'}` : '没有任何跳转');
    } else if (it.real === true && bp.TOOL_NON_NAV[it.type] === 'contact') {
      check(`工具·${it.title}(${it.type}) 由 open-type=contact 按钮承载（不走事件）`, calls.length === 0,
        calls.length ? `意外调用：${JSON.stringify(calls)}` : '零 wx 调用（wxml 里的 button 自己拉起客服）');
    } else if (it.real === true && bp.TOOL_NON_NAV[it.type] === 'phone') {
      // callMerchant 是异步的：等一个微任务队列轮次再判定
      check(`工具·${it.title}(${it.type}) 走拨号链路（取号后 makePhoneCall）`,
        hasToast('开发中') === false && calls.every((c) => c.api !== 'showToast' || /失败/.test(c.title)),
        '异步打桩：号码 ' + PHONE + '（下方异步用例再校验真调用）');
    } else if (it.real !== true) {
      const coming = nav && pageOf(nav.url) === routes.COMING;
      const name = nav ? decodeURIComponent((nav.url.split('name=')[1] || '').split('&')[0]) : '';
      const desc = nav ? decodeURIComponent((nav.url.split('desc=')[1] || '')) : '';
      check(`工具·${it.title}(${it.type}) 落到「功能未开放」并带上具体原因`,
        !!coming && name.length > 0 && desc.length >= 20 && isRegistered(routes.COMING),
        nav ? `→ ${name}｜原因 ${desc.length} 字` : '没有任何跳转');
    } else {
      /* real:true 却既不在 TOOL_ROUTE 也不在 TOOL_NON_NAV —— 这一档**必须报红**：
         它点下去会落到「功能未开放」页，看起来「有反应」，实际是一次退步。
         （曾经这里没有这条分支，于是把跳转表里的一行摘掉，测试照样全绿。） */
      check(`工具·${it.title}(${it.type}) 标了 real:true 却没有落点`, false,
        `既不在 TOOL_ROUTE 也不在 TOOL_NON_NAV；实际落点 ${nav ? nav.url : '（无）'}`);
    }
    if (hasToast('开发中')) check(`工具·${it.title}(${it.type}) 不再弹「开发中」`, false, calls.map((c) => c.title || c.url).join('；'));
  });

  /* 拨号链路单独跑一遍（异步） */
  const ctx = ctxOf(mine);
  reset();
  bp.blockPageBehavior.onTapToolItem.call(ctx, { currentTarget: { dataset: { key: 'merchantsCall', label: '拨打商家电话' } } });
  await new Promise((r) => setTimeout(r, 50));
  const ph = calls.filter((c) => c.api === 'makePhoneCall').slice(-1)[0];
  check('工具·拨打商家电话 真的调了 makePhoneCall，且号码取自后台运营参数',
    !!ph && ph.phone === PHONE, ph ? `拨出 ${ph.phone}` : '没有拨号调用：' + JSON.stringify(calls));
}

/* ==========================================================================
 * 2. 个人资产 7 项逐个点
 * ========================================================================== */
{
  const mine = loadPage('pages/mine/mine');
  blocksLib.UC_STAT_DEFS.forEach((d) => {
    const ctx = ctxOf(mine);
    reset();
    bp.blockPageBehavior.onTapUcStat.call(ctx, { currentTarget: { dataset: { key: d.key, label: d.label } } });
    const nav = calls.filter((c) => c.api === 'navigateTo').slice(-1)[0];
    if (d.route) {
      check(`资产·${d.label} 跳到真实页面`, nav && nav.url === d.route && isRegistered(d.route),
        nav ? `→ ${nav.url}` : '没有任何跳转');
    } else {
      const name = nav ? decodeURIComponent((nav.url.split('name=')[1] || '').split('&')[0]) : '';
      const desc = nav ? decodeURIComponent((nav.url.split('desc=')[1] || '')) : '';
      check(`资产·${d.label} 落到「功能未开放」并说明依赖（${d.dep}）`,
        nav && pageOf(nav.url) === routes.COMING && name === d.label && desc.indexOf(d.dep) >= 0,
        nav ? `→ ${name}｜${desc.slice(0, 40)}…` : '没有任何跳转');
    }
    if (hasToast('开发中')) check(`资产·${d.label} 不再弹「开发中」`, false, calls.map((c) => c.title || c.url).join('；'));
  });
}

/* ==========================================================================
 * 3. 我的订单 6 个入口（含「全部订单」）
 * ========================================================================== */
{
  const mine = loadPage('pages/mine/mine');
  const entries = [
    ['ALL', '全部订单'], ['PENDING_PAY', '待付款'], ['PENDING_SHIP', '待发货'],
    ['SHIPPED', '待收货'], ['FINISHED', '待评价'], ['REFUND', '退款/售后']
  ];
  entries.forEach(([key, label]) => {
    // ① 页面自己实现的路径（mine.js 的 onTapOrderStatus）
    const ctxPage = ctxOf(mine);
    reset();
    bp.blockPageBehavior.onTapUcOrder.call(ctxPage, { currentTarget: { dataset: { status: key } } });
    const pageUrl = lastUrl();

    // ② 区块行为的兜底路径（别的页面渲染 uc_order 时用）
    const ctxBare = ctxOf(null);
    reset();
    bp.blockPageBehavior.onTapUcOrder.call(ctxBare, { currentTarget: { dataset: { status: key } } });
    const bareUrl = lastUrl();

    if (key === 'REFUND') {
      const name = decodeURIComponent((pageUrl.split('name=')[1] || '').split('&')[0]);
      const desc = decodeURIComponent((pageUrl.split('desc=')[1] || ''));
      check(`订单·${label} 落到「功能未开放」并说明本店没有退款态`,
        pageOf(pageUrl) === routes.COMING && name === '退款 / 售后' && desc.indexOf('没有退款态') >= 0,
        pageUrl ? `→ ${name}｜${desc.slice(0, 40)}…` : '没有任何跳转');
    } else {
      check(`订单·${label} 跳订单列表并原样带上入口 key（列表页自己映射成后端状态）`,
        pageOf(pageUrl) === routes.ORDER_LIST && isRegistered(routes.ORDER_LIST)
        && decodeURIComponent(pageUrl.split('status=')[1] || '') === key
        && bareUrl === pageUrl,
        pageUrl ? `→ ${pageUrl}${bareUrl === pageUrl ? '（页面实现与兜底一致）' : '｜兜底路径不一致：' + bareUrl}` : '没有任何跳转');
    }
    if (calls.some((c) => c.api === 'showToast' && c.title.indexOf('开发中') >= 0)) {
      check(`订单·${label} 不再弹「开发中」`, false, JSON.stringify(calls));
    }
  });
}

/* ==========================================================================
 * 4. 装修数据与清单对账：真的能点到这些入口吗
 * ========================================================================== */
{
  const toolsBlock = (replica.MINE_BLOCKS || []).filter((b) => b.type === 'uc_tools')[0];
  const plugins = (toolsBlock && toolsBlock.plugins) || [];
  const shown = plugins.filter((p) => p.show !== false && p.enabled !== false);
  const badReal = shown.filter((p) => {
    const srv = UC_TOOL_ITEMS.filter((t) => t.type === p.type)[0];
    return !srv || !!p.real !== !!srv.real;
  }).map((p) => p.type);
  check('已发布的「必备工具」条目里，real 标记与服务端清单逐项一致（不一致＝真机说能用、后台标未接入）',
    badReal.length === 0 && plugins.length === UC_TOOL_ITEMS.length,
    `落盘 ${plugins.length} 项 / 清单 ${UC_TOOL_ITEMS.length} 项` + (badReal.length ? `；打架：${badReal.join(', ')}` : ''));

  /* 页面上真正会被渲染出来的入口（show/enabled 都为真）里，每一项都必须「有落点」 */
  const noTarget = shown.filter((p) => {
    const meta = blocksLib.TOOL_META[p.type] || {};
    return !!meta.real && !bp.TOOL_ROUTE[p.type] && !bp.TOOL_NON_NAV[p.type];
  }).map((p) => p.type);
  check('页面上会渲染出来的工具项，每项都有可用的落点（真页面 / 非跳转方式 / 说明页）', noTarget.length === 0,
    noTarget.length ? `无落点：${noTarget.join(', ')}` : `${shown.length} 项全部有落点`);

  /* 个人资产区块：数值先给 `—`，优惠券由页面回填真实张数 */
  const statBlock = blocksLib.normalizeBlock({ type: 'uc_stats', showBalance: true, showCoupon: true, showWallet: true });
  const couponItem = (statBlock.items || []).filter((i) => i.key === 'coupon')[0];
  check('个人资产区块：优惠券项带真实落点，其余项带依赖说明',
    !!couponItem && couponItem.route === routes.COUPON
    && statBlock.items.filter((i) => !i.route).every((i) => i.dep.length > 0),
    `items=${statBlock.items.map((i) => i.key + (i.route ? '✓' : '·')).join(' ')}`);

  const patched = blocksLib.applyStatValues(
    blocksLib.normalizeBlocks([{ type: 'uc_stats', showCoupon: true, showBalance: true }]),
    { coupon: 3 }
  )[0];
  check('真实券数能回填到优惠券项，且未回填的项保持 `—`（「未知」不等于「0」）',
    patched.items.filter((i) => i.key === 'coupon')[0].value === '3'
    && patched.items.filter((i) => i.key === 'balance')[0].value === '—',
    patched.items.map((i) => i.key + '=' + i.value).join(' '));
}

/* ------------------------------ 汇总 ------------------------------ */

const failed = results.filter((r) => !r.ok);
results.forEach((r) => {
  console.log(` ${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '  —— ' + r.detail : ''}`);
});
console.log('\n' + '='.repeat(72));
console.log(` 个人中心链路：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log(' 失败项：');
  failed.forEach((r) => console.log(`   ✗ ${r.name}  —— ${r.detail}`));
  process.exit(1);
}
console.log(' 全部通过：个人中心每个入口点下去都有明确去处（真页面 / 拨号 / open-type / 讲清原因的说明页）');
