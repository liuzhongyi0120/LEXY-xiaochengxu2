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
import { readFileSync, statSync } from 'node:fs';
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

  /* 个人资产区块：缺省数值按项给（余额 / 积分 '0'，张数类 '—'），优惠券由页面回填真实张数 */
  const statBlock = blocksLib.normalizeBlock({ type: 'uc_stats', showBalance: true, showCoupon: true, showWallet: true });
  const couponItem = (statBlock.items || []).filter((i) => i.key === 'coupon')[0];
  check('个人资产区块：优惠券项带真实落点，其余项带依赖说明',
    !!couponItem && couponItem.route === routes.COUPON
    && statBlock.items.filter((i) => !i.route).every((i) => i.dep.length > 0),
    `items=${statBlock.items.map((i) => i.key + (i.route ? '✓' : '·')).join(' ')}`);

  /* 缺省数值口径（2026-10-13 店主要求）：余额 / 积分显示 0，张数类显示 —。
     这条的作用是**锁口径**：以前全表都是 `—`，谁把它改回 `—`（或把张数类改成 0）都会红。 */
  const defItems = blocksLib.normalizeBlock({ type: 'uc_stats' }).items;
  const defZero = ['balance', 'points'];
  const defBad = defItems
    .filter((i) => i.value !== (defZero.indexOf(i.key) >= 0 ? '0' : '—'))
    .map((i) => i.key + '=' + i.value);
  check('个人资产缺省数值：余额 / 积分是 0（新用户的真实状态），张数类（权益卡 / 券 / 钱包 / 礼品卡 / 提货卡）是 —（「查不到」≠「0 张」）',
    defBad.length === 0,
    defBad.length ? `口径不对：${defBad.join(', ')}` : defItems.map((i) => i.label + '=' + i.value).join(' '));

  const patched = blocksLib.applyStatValues(
    blocksLib.normalizeBlocks([{ type: 'uc_stats', showCoupon: true, showBalance: true }]),
    { coupon: 3 }
  )[0];
  check('真实券数能回填到优惠券项，未回填的项保持各自缺省值（余额仍是 0、权益卡仍是 —）',
    patched.items.filter((i) => i.key === 'coupon')[0].value === '3'
    && patched.items.filter((i) => i.key === 'balance')[0].value === '0'
    && patched.items.filter((i) => i.key === 'card')[0].value === '—',
    patched.items.map((i) => i.key + '=' + i.value).join(' '));

  /* 复位出口：未登录 / 退出登录必须整块回到缺省值，而不是只手写优惠券那一项 */
  const resetVals = typeof blocksLib.defaultStatValues === 'function' ? blocksLib.defaultStatValues() : null;
  const resetBad = (blocksLib.UC_STAT_DEFS || []).filter((d) => !resetVals || resetVals[d.key] !== (d.def || '—'));
  check('defaultStatValues() 覆盖全部资产项且与 UC_STAT_DEFS 逐项一致（复位值只有一处定义）',
    !!resetVals && resetBad.length === 0,
    !resetVals ? 'blocks.js 没有导出 defaultStatValues()'
      : (resetBad.length ? `不一致：${resetBad.map((d) => d.key).join(', ')}` : JSON.stringify(resetVals)));
}

/* ==========================================================================
 * 5. 个人中心图标（复刻有赞 usercenter-icon 图标字体）
 *
 * 为什么行为测试也要管图标：静态断言只能证明「TOOL_META 里写的是基名、
 * 文件在包里」，证明不了**点下去渲染出来的那个 URL 真的打得开**。
 * 图标错一个字符不会报错，真机上就是一块空白；而装修台预览走 /images/…
 * 读同一份文件 —— 拼错了预览与真机一起白。所以这里把 normalizeBlock()
 * 真的跑一遍，拿它吐出来的 iconFile 去文件系统里核。
 * ========================================================================== */
{
  const iconRoot = join(MP, 'images', 'usercenter');
  const fileOk = (rel) => {
    try { return statSync(join(iconRoot, rel)).isFile(); } catch (e) { return false; }
  };

  /* (1) 工具项：真机渲染出来的 iconFile 必须指向真实文件（且两种风格都有）。
   *     ⚠️ 必须走 `TOOL_META`（真机的**兜底表**），不能只走服务端面板清单 ——
   *     面板清单是装修台给人看的，真机真正回落用的是 TOOL_META。第一版查的是清单，
   *     于是把 `TOOL_META.cart` 改成不存在的文件时这条**照样绿**（注入验红才抓出来）。
   *     两侧都要查：清单的 icon 已经被 (8c) 断言焊在 TOOL_META 上，这里再兜一次。 */
  const toolBad = [];
  const toolSrcs = [['TOOL_META', blocksLib.TOOL_META || {}],
    ['服务端清单', Object.fromEntries((UC_TOOL_ITEMS || []).map((t) => [t.type, { icon: t.icon }]))]];
  toolSrcs.forEach(([srcName, map]) => {
    Object.keys(map).forEach((k) => {
      ['line', 'fill'].forEach((mode) => {
        const blk = blocksLib.normalizeBlock({
          type: 'uc_tools', iconMode: mode,
          plugins: [{ type: k, title: k, icon: map[k].icon, show: true, enabled: true }]
        });
        const item = (blk.items || [])[0];
        if (!item || !item.iconFile) { toolBad.push(`${srcName}·${k}(${mode})=无 iconFile`); return; }
        const rel = String(item.iconFile).replace('/images/usercenter/', '');
        if (!fileOk(rel)) toolBad.push(`${srcName}·${k}(${mode})→${item.iconFile} 不存在`);
      });
    });
  });
  check('工具图标：TOOL_META 与服务端清单各 23 项 × 两种风格的 iconFile 都指向真实包内文件',
    toolBad.length === 0,
    toolBad.length ? '坏点：' + toolBad.slice(0, 8).join('；')
      : `${Object.keys(blocksLib.TOOL_META || {}).length} 项 × 2 套 × 2 处来源全部命中`);

  /* (2) 订单项：不随 iconMode 变（有赞只给一套），全名照抄 order__ 前缀 */
  const orderBlk = blocksLib.normalizeBlock({ type: 'uc_order', iconMode: 'fill' });
  const orderBad = (orderBlk.items || []).filter((i) => {
    const rel = String(i.iconFile || '').replace('/images/usercenter/', '');
    return !rel || !fileOk(rel);
  }).map((i) => i.key);
  const orderNames = blocksLib.UC_ORDER_DEFS.map((d) => d.icon);
  check('订单图标：5 个入口的 iconFile 都真实存在，且用的是有赞 order__ 全名（5 项混用实色/线性）',
    orderBad.length === 0 && orderNames.length === 5 && orderNames.every((n) => /^order__/.test(n)),
    orderBad.length ? '坏点：' + orderBad.join(', ') : orderNames.join(' · '));

  /* (3) 资产项：有赞这 7 项是位图（stats/），且 cards·giftCard·deliveryCard 共用一张 */
  const statBlk = blocksLib.normalizeBlock({
    type: 'uc_stats', showBalance: true, showCoupon: true, showWallet: true, showCard: true
  });
  const statBad = (blocksLib.UC_STAT_DEFS || [])
    .filter((d) => !fileOk(String(d.icon || '') + '.png'))
    .map((d) => d.key);
  check('资产图标：7 项的 stats/ 位图都存在（有赞 STATS_ICON_MAP 本来就是 PNG 不是字体）',
    statBad.length === 0,
    statBad.length ? '坏点：' + statBad.join(', ') : blocksLib.UC_STAT_DEFS.map((d) => d.key + '=' + d.icon).join(' · '));

  /* (4) 资产行「多项不显示图标、单项才显示」这条口径（有赞实测如此）。
   *     实现细节：`o.items = UC_STAT_DEFS.filter((d) => o[d.k] !== false)` —— 是**逐项过滤**，
   *     所以想造「单项」必须把其余 6 个开关显式关掉（第一版只关了两个，断言自己写错了）。 */
  const onlyCoupon = { type: 'uc_stats' };
  blocksLib.UC_STAT_DEFS.forEach((d) => { onlyCoupon[d.k] = (d.key === 'coupon'); });
  const single = blocksLib.normalizeBlock(onlyCoupon);
  const allOn = { type: 'uc_stats' };
  blocksLib.UC_STAT_DEFS.forEach((d) => { allOn[d.k] = true; });
  const multi = blocksLib.normalizeBlock(allOn);
  const singleRel = String((single.items[0] || {}).iconFile || '').replace('/images/usercenter/', '');
  check('资产行：单项配置时那一项的图标真实可用；多项时区块不画图标（有赞同口径）',
    (single.items || []).length === 1 && !!singleRel && fileOk(singleRel)
    && (multi.items || []).length === (blocksLib.UC_STAT_DEFS || []).length,
    `单项 ${(single.items || []).length} 项（${singleRel || '无 iconFile'}）/ 多项 ${(multi.items || []).length} 项`);

  /* (5) 路径出口只有一处：ucIconFile 的后缀口径（写死路径就会绕过它）。
   *     ⚠️ 口径是「只有 mode==='line' 才加 -o，其余（含省略）原样拼」——
   *     不是「省略=线性」，第一版照后者写，当场自己报红。 */
  const fnOk = typeof blocksLib.ucIconFile === 'function'
    && blocksLib.ucIconFile('cart', 'line') === '/images/usercenter/cart-o.png'
    && blocksLib.ucIconFile('cart', 'fill') === '/images/usercenter/cart.png'
    && blocksLib.ucIconFile('cart') === '/images/usercenter/cart.png'      /* 省略 mode = 原样拼 */
    && blocksLib.ucIconFile('cart', 'other') === '/images/usercenter/cart.png'
    && blocksLib.ucIconFile('  ') === ''                                   /* 空基名 → 空串（模板据此不渲染） */
    && blocksLib.ucIconFile('order__tosend', 'fill') === '/images/usercenter/order__tosend.png';
  check('ucIconFile() 是图标路径的唯一出口（line→-o / 其余原样拼 / 空基名→空串）',
    fnOk, fnOk ? '口径与有赞 ICON_MODE_MAP={1:colorIcon,2:icon} 同义' : 'ucIconFile 缺失或后缀口径不对');

  /* (6) 老数据回落：本批之前发布的汉字 icon 不许画成裂图 */
  const legacy = blocksLib.normalizeBlock({
    type: 'uc_tools', iconMode: 'line',
    plugins: [{ type: 'cart', title: '购物车', icon: '车', show: true, enabled: true }]
  });
  check('老数据回落：装修数据里残留的汉字图标（本批之前发布的）落到 TOOL_META 的基名，不是裂图',
    legacy.items[0] && legacy.items[0].icon === 'cart'
    && legacy.items[0].iconFile === '/images/usercenter/cart-o.png',
    legacy.items[0] ? `"车" → ${legacy.items[0].icon} → ${legacy.items[0].iconFile}` : '归一化后没有 items');

  /* (7) 模板侧：三个区块都必须用 <image>，且不许再把基名当文字画出来。
   *     ⚠️ 先剥 HTML 注释 —— 注释里正写着要禁用的字面量（§V 的老坑）。 */
  const tplSrc = readFileSync(join(MP, 'templates', 'blocks.wxml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  /* 诊断行逐条列真实原因；`<text>` 要带 `[^>]*`（真实写法带 class，写死会漏判）。
   * 第一版这两点都没做，注入验红时失败了却打印「三处均为 <image>」—— 骗人。 */
  const tplProblems = [
    /<text[^>]*>\{\{tl\.icon\}\}<\/text>/.test(tplSrc) ? 'uc_tools 仍把 icon 当文本' : '',
    /<text[^>]*>\{\{item\.icon\}\}<\/text>/.test(tplSrc) ? 'uc_order 仍把 icon 当文本' : '',
    /<image[^>]*src="\{\{item\.iconFile\}\}"/.test(tplSrc) ? '' : 'uc_order 缺 <image src="{{item.iconFile}}">',
    /<image[^>]*src="\{\{tl\.iconFile\}\}"/.test(tplSrc) ? '' : 'uc_tools 缺 <image src="{{tl.iconFile}}">'
  ].filter(Boolean);
  check('模板侧：uc_stats / uc_order / uc_tools 三个区块的图标都走 <image src="{{…iconFile}}">',
    tplProblems.length === 0,
    tplProblems.length ? tplProblems.join('；') : '三处均为 <image> 且绑 iconFile');

  /* (8) 已发布数据：icon 必须已经是基名（改了默认值不重灌 replica＝预览白、真机有） */
  const pubTools = ((replica.MINE_BLOCKS || []).filter((b) => b.type === 'uc_tools')[0] || {}).plugins || [];
  const pubBad = pubTools.filter((p) => p && p.icon !== undefined && !blocksLib.isIconBase(p.icon))
    .map((p) => `${p.type}=${JSON.stringify(p.icon)}`);
  check('已发布数据：必备工具的 icon 已是图标基名（改了图标必须重灌 replica，否则装修台预览与真机走样）',
    pubBad.length === 0,
    pubBad.length ? '仍是旧值：' + pubBad.slice(0, 6).join('；') : `${pubTools.length} 项均为基名`);
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
