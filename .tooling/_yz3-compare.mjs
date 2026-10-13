/**
 * 资讯栏目 8 页复刻·逐像素对照验收（有赞原页 ↔ 本店 /preview 编译真机源码）。
 *
 * 为什么必须真浏览器 + 逐项量盒（同 _yz2-compare.mjs 的理由，这里再强调一遍）：
 *   /preview 是**直接编译真机 WXML + WXSS** 的，只有真 Chrome 才会做布局；
 *   jsdom 的 getBoundingClientRect 全是 0 —— 卡片摊成一条线也照样「全绿」。
 *   并排截图也看不出所有问题（盒子对了、外边距折叠错了，肉眼一样看不出）。
 *
 * 三类页面对账口径（按组件结构分组，不是按页面）：
 *   tab  —— 六页（01/02/04/05/06/08）：选题卡分类的 页签条/卡片行/卡片/图/题
 *   note —— 03 创业故事：内容卡片（图固定高 + 摘要）
 *   misc —— 07 售后服务：电梯导航 + 标题文本
 *
 * 外壳（white/rich_text/line）不做逐块对账，而是**用「选项卡模块的绝对 y」反证**：
 *   外壳任何一块高度错了，模块顶边就错位，一量就露 —— 比逐块量更省事且更严。
 *
 * 用法：node .tooling/_yz3-compare.mjs [--only=01,07] [--base http://127.0.0.1:3000] [--dump]
 * 产出：.tooling/_cmp/yz3-<id>-youzan.png / -ours.png ＋ .tooling/_cmp/yz3-side.png（8 页并排）
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import adminToken from './_admin.mjs';

const argv = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:3000', only: '', dump: false, noshot: false, side: false, sideonly: false };
for (let i = 0; i < argv.length; i++) {
  /* 支持 `--only=01,07` 与 `--only 01,07` 两种写法 —— 只认后者的话，
     写成等号形式会被静默忽略（本轮就踩了：以为在验 1 页，其实 8 页全跑了一遍）。 */
  const a = argv[i];
  const eq = a.indexOf('=');
  const k = eq > 0 ? a.slice(0, eq) : a;
  const v = eq > 0 ? a.slice(eq + 1) : argv[i + 1];
  if (k === '--base') { opt.base = v; if (eq < 0) i++; }
  else if (k === '--only') { opt.only = v; if (eq < 0) i++; }
  else if (k === '--dump') opt.dump = true;
  /* --noshot：只量盒不截图。长页面（03 有 3525px、2 倍图 = 750×7050 PNG）截一张要十几秒，
     偶发会撞上 raw() 的 90s 超时把整轮对比打断 —— 而纯对账根本不需要图。 */
  else if (k === '--noshot') opt.noshot = true;
  /* --sideonly：不重跑浏览器，直接用现有的 yz3-<id>-*.png 重新拼并排对照页。
     8 页跑一轮要 7 分钟，只想看拼图时犯不上重来。 */
  else if (k === '--sideonly') { opt.sideonly = true; opt.noshot = true; }
  /* --side：额外把并排对照页截成一张 PNG。
     8 页 × 两列 × 最长 3525px ≈ 2.9 万像素高，Chrome 截不动（实测必超时），**默认关**。 */
  else if (k === '--side') opt.side = true;
}
const BASE = opt.base.replace(/\/$/, '');

/* ---------------------------------------------------------------- 页面清单
 * 有赞移动端 URL 全部来自 `.tooling/_yz3/<页>.measure.json` 里记录的 location.href
 * （侦察时从装修台链接跟出来的真机地址，店铺 id 46010558 / sub_kdt_id 45818390）。
 * 03 那个 measure.json 是另一个探针写的（结构不同，title 不是字符串），单独保留 URL。
 * ---------------------------------------------------------------------- */
const YZ = 'https://shop46010558.m.youzan.com/wscshop/feature/';
const PAGES = [
  { id: '01', name: '关于莱克', key: 'p295', kind: 'tab', url: YZ + '85aBT4s5FU?sub_kdt_id=45818390' },
  { id: '02', name: '新闻大事', key: 'p296', kind: 'tab', url: YZ + 'OJbiwB713E?sub_kdt_id=45818390' },
  { id: '03', name: '创业故事', key: 'p297', kind: 'note', url: YZ + 'pWuQ9DAXB8' },
  { id: '04', name: '我们品牌', key: 'p298', kind: 'tab', url: YZ + '4FacRqfebo?sub_kdt_id=45818390' },
  { id: '05', name: '用户分享', key: 'p299', kind: 'tab', url: YZ + 'baxAQXWVa8?sub_kdt_id=45818390' },
  { id: '06', name: '业务模式', key: 'p300', kind: 'tab', url: YZ + '5xB3MluWoC?sub_kdt_id=45818390' },
  { id: '07', name: '售后服务', key: 'p301', kind: 'misc', url: YZ + 'J2dTSa2TaM' },
  { id: '08', name: '加入我们', key: 'p302', kind: 'tab', url: YZ + 'viB8OZAFJQ?sub_kdt_id=45818390' },
];

/* -------------------------------------------------------- 各结构的对账键位
 * 每一项 = [键, 我们的选择器, 有赞的选择器]；两边的键名一致，对账表直接相减。
 * 之所以用 [class*="_xxx"] 而不是完整类名：有赞的类名带 `_yzs_1_` 前缀，
 * 该前缀每次发布都可能变（本轮就见过 `_yzs_1_`），只匹后缀才稳。
 */
/** 外壳（7 页同构：white 8 → 富文本 → white 8 → 实线 → 组件）。
 *  逐块对到「有赞自己的类名」上，比用「组件顶边差多少」反推要直观得多 ——
 *  有赞这几个类名（cap-white / cap-richtext / cap-line）在 8 个页面里完全一致。 */
const SHELL_PAIRS = [
  ['shWhite0', '#blk-0', '[class*="cap-white"]'],
  ['shRich', '#blk-1 .c-rich', '[class*="cap-richtext"]'],
  ['shRichP1', '#blk-1 .cr-body p', '[class*="cap-richtext"] p'],
  ['shRichP2', '#blk-1 .cr-body p + p', '[class*="cap-richtext"] p + p'],
  /* 第二块 cap-white（富文本与实线之间那 8px）**不单独对账**：
     它在有赞 DOM 里不是同级第 2 个 div，`nth-of-type` 选不中，写了只会一直报「只有一边有」。
     它的存在由 `shLine` 的绝对 y 间接锁死（富文本底 + 8 + 10 外边距 = 实线的 y），够用。 */
  ['shLine', '#blk-3 .ln', '[class*="cap-line__item"]'],
];
const SHELL_STYLES = [
  ['sShWhite0', '#blk-0', ['height'], '[class*="cap-white"]'],
  ['sShRich', '#blk-1 .c-rich', ['padding', 'margin', 'background', 'fontSize', 'lineHeight', 'fontFamily'], '[class*="cap-richtext"]'],
  ['sShRichP', '#blk-1 .cr-body p', ['fontSize', 'lineHeight', 'margin', 'padding', 'fontFamily'], '[class*="cap-richtext"] p'],
  ['sShRichSpan', '#blk-1 .cr-body p span', ['fontSize', 'lineHeight', 'fontFamily'], '[class*="cap-richtext"] p span'],
  ['sShLine', '#blk-3 .ln', ['borderTopWidth', 'borderColor', 'margin', 'height'], '[class*="cap-line__item"]',
    { borderColor: '有赞是 <hr>（height:0 + 四边边框，另三边取默认 128），我们是 1px 高的 div；shLine 的绝对 y/h 已锁死',
      margin: '有赞 <hr> 自带 10px 上下外边距（已算进 gapY），我们由 line 块的 gapY 承接',
      height: '同上，<hr> 的 0 高靠边框撑出 1px' }],
];

const KINDS = {
  tab: {
    pairs: [
      ['mod', '.c-tc', '[class*="_tabcatez4"]'],
      ...SHELL_PAIRS,
      ['navWrap', '.tc-tabs', '[class*="van-tabs__wrap"]'],
      ['tab0', '.tc-tab', '[role="tab"]'],
      /* `tabTxt0`（我们的 `.tc-tab-txt` ↔ 有赞 `.nav_text`）**故意不比盒子**：
         有赞的 nav_text 是内容宽（60）、居中在 75 宽的 tab 里 → x=7.5；
         我们的 `.tc-tab-txt` 直接 width:100%（75）靠 text-align 居中。
         两者**文字落点完全相同**，但盒子一个是 60 一个是 75 —— 比了每轮都报两条假差异。
         文字的渲染口径由 `sTabTxt`（字号/颜色/行高/对齐）比，落点由 `tab0` + `tline` 锁死。 */
      ['tline', '.tc-tab-line', '[class*="text_line"]'],
      ['body', '.tc-body', '[class*="van-tabs__content"]'],
      ['row', '.tc-row', '[class*="con_iner"]'],
      ['out0', '.tc-out', '[class*="list_out"]'],
      ['card0', '.tc-card', '[class*="list_out"] [class*="_list"]'],
      ['pic0', '.tc-pic, .tc-img-auto', '[class*="list_out"] [class*="item_img_wrap"]'],
      ['img0', '.tc-img, .tc-img-auto', '[class*="list_out"] img'],
      ['title0', '.tc-title', '[class*="list_out"] [class*="item_title"]'],
    ],    styles: [
      ...SHELL_STYLES,
      ['sNav', '.tc-tabs', ['height', 'background', 'display', 'alignItems'], '[class*="van-tabs__wrap"]',
        { display: '有赞 `.van-tabs__wrap` 外面还套了一层，我们是把 nav 自己做成 flex；选项盒 navWrap/tab0/tabTxt0/tline 逐项全等',
          alignItems: '同上，跨层比较' }],
      ['sTabTxt', '.tc-tab-txt', ['fontSize', 'fontWeight', 'color', 'lineHeight', 'margin', 'padding', 'textAlign'], '[class*="nav_text"]'],
      ['sLine', '.tc-tab-line', ['width', 'height', 'background', 'borderRadius', 'margin'], '[class*="text_line"]'],
      ['sRow', '.tc-row', ['margin', 'padding', 'display', 'flexWrap', 'alignItems'], '[class*="con_iner"]',
        { alignItems: '有赞外层是 block、flex 在更内层；row/out0/card0 逐项全等' }],
      ['sCard', '.tc-card', ['margin', 'background', 'borderRadius', 'boxShadow', 'border'], '[class*="list_out"] [class*="_list"]',
        { background: '01 页有赞卡片底是完全透明（那张卡片区域被图片整块盖住，不可见），我们 shadow 档位带白底；card0/pic0 盒逐项全等' }],
      /* `position` 不比：图片比例「自适应」的页面走 `.tc-img-auto`（静态 <image>），
         有赞的 `.item_img_wrap` 才是 relative 定位盒；两边的 pic0 盒已逐项全等。
         位置口径靠 `pic0`/`img0` 盒子锁，比 position 只会每轮报一条假差异。 */
      ['sPic', '.tc-pic, .tc-img-auto', ['paddingTop', 'borderRadius'], '[class*="list_out"] [class*="item_img_wrap"]'],
      ['sTitle', '.tc-title', ['fontSize', 'fontWeight', 'color', 'lineHeight', 'textAlign', 'margin'], '[class*="list_out"] [class*="item_title"]'],
    ],
  },
  note: {
    pairs: [
      /* 模块外框要跟**有赞的外层**比：有赞把圆角/投影放在 `.cap-showcase-wrapper`（外层，含 13px 内边距），
         内层的 `.shopnote-common-layout` 反而是无圆角无投影的；我们只有一层 `.c-ccard`。
         之前拿 `.c-ccard` 比内层，量出来当然对不上（3021 vs 2975），是**选错了对象**不是渲染错了。 */
      ['mod', '.c-ccard', '.cap-showcase-wrapper'],
      ['card0', '.cc-card', '.shopnote-common-layout'],
      ['pic0', '.cc-pic', '.wsc-img-list'],
      ['img0', '.cc-img', '.wsc-img-list__img'],
      ['body0', '.cc-body', '.shopnote-common-layout__summary'],
      ['title0', '.cc-t', '.shopnote-common-layout__summary-title'],
    ],
    styles: [
      /* sExtra 曾拿 `.video-hold` 比 null（有赞那侧压根没给选择器）—— 两边都取不到值，
         每轮都打印一行「有赞=undefined 我们=null」，纯噪音，已删。 */
      /* ⚠️ 圆角/投影归谁：我们只有一层 `.c-ccard`（卡片），有赞是
         `.cap-showcase-wrapper`（模块外框）> `.shopnote-common-layout`（卡片）两层。
         拿 `.cc-card` 比内层当然报「我们多圆角多投影」——**选错对象**。先量外框确认。 */
      ['sMod', '.c-ccard', ['background', 'borderRadius', 'boxShadow', 'padding'], '.cap-showcase-wrapper',
        { padding: '有赞是 13px 外层 + 卡片自身 5px 上边距（=18）两层，我们是单层 padY 18 + padX 15；卡片盒 card0 逐项全等' }],
      ['sCard', '.cc-card', ['margin', 'background', 'borderRadius', 'boxShadow', 'border', 'display', 'flexDirection'], '.shopnote-common-layout',
        { borderRadius: '有赞的圆角在卡片外层包装 div 上，内层 .shopnote-common-layout 没有；我们是单层卡片。白底白卡下圆角不可见',
          boxShadow: '同上 —— 逐像素实测两边卡片下缘都有投影（有赞 240→255、我们 232→247），只是挂在不同的层上',
          background: '两边都是完全透明（有赞是 rgba(182,60,60,0) 的零透明度色），已按「零透明度即透明」归一' }],
      ['sPic', '.cc-pic', ['height', 'paddingTop', 'borderRadius', 'position'], '.wsc-img-list'],
      ['sImg', '.cc-img', ['width', 'height', 'objectFit'], '.wsc-img-list__img'],
      ['sBody', '.cc-body', ['padding', 'margin'], '.shopnote-common-layout__summary'],
      ['sTitle', '.cc-t', ['fontSize', 'fontWeight', 'lineHeight', 'color', 'margin', 'padding'], '.shopnote-common-layout__summary-title'],
    ],
  },
  misc: {
    pairs: [
      ['elev', '.c-elev', '.elevator-navigation'],
      /* `elevBar`（我们的 `.ce-plain` ↔ 有赞 `.van-tabs__wrap`）**故意不比盒子**：
         有赞是「navigation(0,375) > cap-tabs > van-tabs__wrap > nav」多层，8px 内缩在最内层；
         我们只有一层 `.c-elev`（padding 0 8px）+ `.ce-plain`，所以盒子是 8/359 对 0/375。
         两边的**选项盒**（elevItem0 = 8/123/119.7/44）逐项全等 —— 用户看到的落点完全一致。 */
      ['elevItem0', '.ce-plainitem', '.elevator-navigation [role="tab"]'],
      ['title1', '.c-title', '.cap-title-text'],
    ],
    styles: [
      ['sElevBg', '.c-elev', ['background', 'padding'], '.elevator-navigation',
        { background: '有赞最外层是透明的（透出页面底色）；我们由 .c-elev 自己铺白底，本页页面底色本就是白/浅灰，观感一致',
          padding: '有赞的 8px 内缩在更内层的 cap-tabs 上，我们只有一层所以写在 .c-elev；elevItem0 逐项全等' }],
      ['sElevBar', '.ce-plain', ['height', 'display', 'alignItems', 'background'], '.elevator-navigation [class*="van-tabs__wrap"]',
        { display: '跨层：我们的 .ce-plain 对应的是有赞更内层的 nav，不是这层 wrap',
          alignItems: '同上（我们靠 stretch + 项内居中把可点区做到整条高，有赞是内层 nav 撑满）' }],
      ['sElevItem', '.ce-plainitem', ['fontSize', 'fontWeight', 'color', 'textAlign', 'lineHeight', 'flex'], '.elevator-navigation [role="tab"]',
        { flex: '有赞 1 0 auto（按内容宽、不收缩）/ 我们 1 1 0%（均分）；本页 3 项实测宽 × 高全等' }],
      /* ⚠️ 对账对象要从「有赞的外层 <a class="cap-title-text">」换成**真正装文字的那个 H1**
         （`.cap-title-text__title`）—— 外层是 `text-align:start` 的壳，
         拿我们的文字去比它，会同时报「字号 14≠16 / 对齐 center≠start / padding 16px≠0 16px」三条假差异。
         换成 H1 后实测：字号 16 = 我们有赞同款（`.c-title .ct-main.s-md` 32rpx = 16px），
         而且「小莱到家」的字形包围盒两边逐像素相同（312,371,437,401 / 126×31）。 */
      ['sTitle', '.c-title .ct-main', ['fontSize', 'fontWeight', 'color', 'textAlign', 'lineHeight'], '.cap-title-text__title',
        { lineHeight: '我们的标题是「比率 1.4」，有赞该组件是固定 22px；md 档（16px）下差 0.4px。' +
          '改成 1.375 只对这一档正确、sm/lg 档没有实测依据（有赞固定 px 时各档都是 22px），' +
          '所以保留比率不动 —— 字形包围盒两边逐像素相同（312,371,437,401 / 126×31）' }],
      ['sTitleBox', '.c-title', ['background', 'padding', 'margin'], '.cap-title-text',
        { padding: '有赞 `.cap-title-text` 是块级 <a>（padding 0 16px）+ 内部 wrap 给上下留白；我们是单层 padding 16px。title1 盒 375/54 全等' }],
    ],
  },
};

/** 生成「量一组盒子 + 读一组样式」的求值表达式（盒子/样式的选择器两边各自传） */
function mkExpr(pairs, styles, yz) {
  const BX = pairs.map((p) => [p[0], yz ? p[2] : p[1]]).filter((p) => p[1]);
  const ST = styles.map((s) => [s[0], yz ? s[3] : s[1], s[2]]).filter((s) => s[1]);
  return `(() => {
    const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +(r.y + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const CS = (e, ps) => { if (!e) return null; const c = getComputedStyle(e); const o = {};
      ps.forEach((p) => { o[p] = c[p]; }); return o; };
    const out = { vw: innerWidth, sh: document.documentElement.scrollHeight };
    const BX = ${JSON.stringify(BX)}, ST = ${JSON.stringify(ST)};
    for (const [k, sel] of BX) out[k] = R(document.querySelector(sel));
    for (const [k, sel, ps] of ST) out[k] = CS(document.querySelector(sel), ps);
    return out;
  })()`;
}

/**
 * 页面底色对账 —— 这是**模块盒子量不到**的一层，所以必须单独量一次。
 *
 * 为什么要它：复刻 03 创业故事时，几何 6/6 全绿、内容高 Δ0.0，但逐像素取样发现
 *   有赞卡片外是 255 白、我们卡片外是 247,248,250（= #F7F8FA）。
 * 双方都是「逐页」的底色：
 *   有赞 —— 平台级 `div.content`（03 实测 rgb(255,255,255)；01 是透明，透出 body 的 rgb(247,248,250)）；
 *   我们 —— 自定义页的 `meta.bg`（`pages/custom/index.wxml` 根节点的 inline style）。
 * 「谁第一个不透明」才是用户真正看到的那层，所以两边都按「content → 落回根」求有效值。
 */
const PAGEBG_EXPR = {
  ours: `(() => {
    const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; };
    const page = cs('#preview .page');           // = meta.bg（真机 WXML 的根节点）
    const root = cs('#preview');                 // = 真机 page{} 的底色（--color-bg）
    const opaque = (c) => c && c !== 'rgba(0, 0, 0, 0)';
    return { layer: page, root: root, eff: opaque(page) ? page : root };
  })()`,
  yz: `(() => {
    const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; };
    const layer = cs('div.content');             // 有赞平台级内容层
    const root = cs('body');
    const opaque = (c) => c && c !== 'rgba(0, 0, 0, 0)';
    return { layer: layer, root: root, eff: opaque(layer) ? layer : root };
  })()`,
};

/* 每页还要各自量一份「区块轮廓」，用来反证外壳（white / rich / line）的高度 */
const OUTLINE_EXPR = {  ours: `(() => {
    const R = (e) => { const r = e.getBoundingClientRect();
      return { y: +(r.y + scrollY).toFixed(1), h: +r.height.toFixed(1) }; };
    const bs = [...document.querySelectorAll('.blk')];
    const last = bs[bs.length - 1];
    const lb = last ? last.getBoundingClientRect() : null;
    return { n: bs.length, pageH: document.documentElement.scrollHeight,
      contentH: lb ? +(lb.bottom + scrollY).toFixed(1) : 0,
      imgs: { total: document.images.length,
        pending: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length },
      blks: bs.map((b) => ({ id: b.id, ...R(b) })) };
  })()`,
  yz: `(() => {
    const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
      return { y: +(r.y + scrollY).toFixed(1), h: +r.height.toFixed(1) }; };
    const root = document.querySelector('[rm-id*="web-feature-page-steup"]');
    /* 内容高必须用「最后一个子块的底边」——
       有赞内容根带 min-height:100vh，页面内容不满一屏时 rect.h 会顶到 812，
       直接拿 rect.h 当真高会把「短页面」误判成「一样高」（08 页就差点这么过去）。 */
    const kids = root ? [...root.children] : [];
    const last = kids.filter((k) => k.getBoundingClientRect().height > 0).pop();
    const bottom = last ? last.getBoundingClientRect().bottom + scrollY : 0;
    const foot = document.querySelector('[rm-id*="tee-shop/footer"]');
    /* 有赞顶层区块的类名不固定（cap-* / elevator-* / 扩展的 _yzs_1_* 各自一套），
       用「类名特征 + 盒子」扫一遍，dump 模式下人工核对 —— 比逐个页面猜选择器快。 */
    const mods = [...root.querySelectorAll('*')].filter((e) => {
      const c = String(e.className || '');
      return /cap-|elevator|van-divider/.test(c) || e.tagName === 'HR';
    }).slice(0, 40).map((e) => ({ cls: String(e.className).slice(0, 46), tag: e.tagName, ...R(e) }));
    return { root: R(root), rootScroll: root ? root.scrollHeight : 0,
      contentH: +bottom.toFixed(1), kids: kids.length, mods: mods,
      footer: foot ? +foot.getBoundingClientRect().height.toFixed(1) : 0,
      pageH: document.documentElement.scrollHeight,
      imgs: { total: document.images.length,
        pending: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length } };
  })()`,
};

/* ------------------------------------------------------------------ 浏览器 */
const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe',
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const OUT = resolve('.tooling/_cmp');
mkdirSync(OUT, { recursive: true });

const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'yz3-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=900,1400', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const p = list.filter((t) => t.type === 'page')[0];
    if (p && p.webSocketDebuggerUrl) {
      ws = new WebSocket(p.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
      break;
    }
  } catch (e) { /* 未就绪 */ }
  await sleep(120);
}
if (!ws) throw new Error('连接 chrome 调试端口超时');

let _id = 0;
const _pending = new Map();
ws.addEventListener('message', (evt) => {
  const m = JSON.parse(evt.data);
  if (m.id && _pending.has(m.id)) {
    const { resolve: rs, reject: rj } = _pending.get(m.id);
    _pending.delete(m.id);
    /* 一定要把 m.error.data 带出来：否则只剩一句「Invalid parameters」（clip 漏 scale 的坑） */
    if (m.error) rj(new Error(m.error.message + ' :: ' + JSON.stringify(m.error.data || '')));
    else rs(m.result);
  }
});
const raw = (method, params, sessionId, timeoutMs) => new Promise((rs, rj) => {
  const id = ++_id;
  _pending.set(id, { resolve: rs, reject: rj });
  const msg = { id, method, params: params || {} };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); rj(new Error('timeout ' + method)); } }, timeoutMs || 90000);
});
const newTab = async (url) => (await raw('Target.createTarget', { url })).targetId;
const attach = async (tid) => (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
const ev = async (sid, expression) => {
  const r = await raw('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sid);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
};

/** 同一会话里设视口 → 量盒 → 截图（单独设的覆盖会在会话断开时被 Chrome 清掉） */
async function shoot(sid, file, { w = 375, h = 812, mobile = false, clipOf }) {
  const setView = (dpr) => raw('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile, screenWidth: w, screenHeight: h,
  }, sid);
  await setView(2);
  await sleep(1500);
  let clip;
  if (clipOf) {
    const box = await ev(sid, `(() => { const e = document.querySelector(${JSON.stringify(clipOf)});
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y + scrollY), width: Math.round(r.width),
               height: Math.ceil(Math.max(e.scrollHeight, r.height)) }; })()`);
    /* clip 的 scale 是必填项 —— 漏了会直接抛 Invalid parameters */
    clip = { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 };
  } else {
    const m = await raw('Page.getLayoutMetrics', {}, sid);
    const cs = m.cssContentSize || m.contentSize;
    clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
  }
  /* 超长页面（03 是 3525px 高）在 2 倍图下要渲 750×7050 的位图，
     headless 实测会卡到 240s 都出不来（偶发直接超时）—— 这类页面自动降到 1 倍图。
     截图只用于并排肉眼比对，不参与任何数值对账，降倍不影响结论。 */
  if (clip.height > 3000) {
    console.log(`（页面高 ${clip.height}px，截图降到 1 倍图）`);
    await setView(1);
    await sleep(1500);
    if (clipOf) {
      const box2 = await ev(sid, `(() => { const e = document.querySelector(${JSON.stringify(clipOf)});
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y + scrollY), width: Math.round(r.width),
                 height: Math.ceil(Math.max(e.scrollHeight, r.height)) }; })()`);
      clip = { x: box2.x, y: box2.y, width: box2.width, height: box2.height, scale: 1 };
    } else {
      const m2 = await raw('Page.getLayoutMetrics', {}, sid);
      const cs2 = m2.cssContentSize || m2.contentSize;
      clip = { x: 0, y: 0, width: Math.ceil(cs2.width), height: Math.ceil(cs2.height), scale: 1 };
    }
  }
  /* 长页面截图很慢（03 是 3525px 高），单独给截图一个更宽的窗口：
     不然整轮对比会被一张图打断。 */
  const { data } = await raw('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }, sid, 240000);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return { w: clip.width, h: clip.height };
}

/** 等所有 <img> 都解码完（含 loading="lazy" 那些）—— 不等就会量到「图还没撑开」的高度差 */
const WAIT_IMGS = `(async () => {
  const imgs = [...document.querySelectorAll('img')];
  imgs.forEach((i) => { i.loading = 'eager'; i.decoding = 'sync'; });
  /* 先按视口步进取景，触发 IntersectionObserver 型的懒加载；再回顶 */
  const H = document.documentElement.scrollHeight;
  for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise((r) => setTimeout(r, 600));
  window.scrollTo(0, 0);
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const bad = imgs.filter((i) => !i.complete || i.naturalWidth === 0);
    if (!bad.length) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 900));
  return { total: imgs.length, pending: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
           h: document.documentElement.scrollHeight };
})()`;

/** 打开有赞页并等到渲染稳定（图片是懒加载的，必须强制加载完再量高度） */
async function openYz(url) {
  const tid = await newTab('about:blank');
  const sid = await attach(tid);
  await raw('Page.enable', {}, sid);
  await raw('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 812,
  }, sid);
  await raw('Page.navigate', { url }, sid);
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    const st = await raw('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sid);
    if (st.result.value === 'complete' && i >= 6) break;
  }
  await sleep(2000);
  const w = await ev(sid, WAIT_IMGS);
  await sleep(500);
  return { tid, sid, imgs: w };
}

/** 打开 /preview 并切到指定自定义页，然后拆掉预览外壳 */
async function openOurs(key, token) {
  const tid = await newTab(BASE + '/preview');
  const sid = await attach(tid);
  /* 预览页没有 viewport meta，开 mobile 模拟会退化成 980 布局视口；页面宽度由注入的样式锁死 375 */
  await raw('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: false, screenWidth: 375, screenHeight: 812,
  }, sid);
  await sleep(1200);
  await ev(sid, `localStorage.setItem('lexy_admin_token', ${JSON.stringify(token)}); location.reload(); true`);
  await sleep(3500);
  const picked = await ev(sid, `(() => {
    const b = document.querySelector('.pv-item[data-key=${JSON.stringify(key)}]');
    if (!b) return '未找到页面 ' + ${JSON.stringify(key)};
    b.click(); return 'ok';
  })()`);
  if (picked !== 'ok') throw new Error(picked + '（先确认页面已发布）');
  await sleep(4000);
  /* 拆壳：⚠️ 必须用 CSSOM 逐元素赋值 —— 动态创建的 <style> 在本页会被丢弃（量出来是手机壳那一份盒子） */
  await ev(sid, `(() => {
    const set = (sel, css) => { const e = document.querySelector(sel); if (e) Object.assign(e.style, css); };
    set('.pv-top', { display: 'none' }); set('.pv-side', { display: 'none' });
    set('.pv-status', { display: 'none' }); set('.pv-note', { display: 'none' });
    set('.pv-main', { display: 'block', padding: '0' });
    set('.pv-stage', { padding: '0', display: 'block' });
    set('#phone', { width: '375px', border: '0', borderRadius: '0', boxShadow: 'none', margin: '0' });
    set('.phone-bar', { display: 'none' });
    set('#preview', { height: 'auto', maxHeight: 'none', minHeight: '0', overflow: 'visible' });
    set('body', { background: '#fff', margin: '0' });
    return true;
  })()`);
  await sleep(600);
  /* 拆壳之后再等图：手机壳里的 #preview 自己是个滚动容器，壳没拆时窗口滚动到不了下面的图，
     lazy 的图永远不加载，量出来整页高度会少几百像素（本轮第一版就少了 75~286px）。 */
  const w = await ev(sid, WAIT_IMGS);
  await sleep(500);
  return { tid, sid, imgs: w };
}

/* ------------------------------------------------------------------ 主流程 */
const want = opt.only ? opt.only.split(',') : PAGES.map((p) => p.id);
const results = [];

/* --sideonly：不碰浏览器，直接用现有的 yz3-<id>-*.png 重拼并排对照页 */
if (opt.sideonly) {
  for (const page of PAGES) {
    if (!want.includes(page.id)) continue;
    results.push({ page });
  }
  console.log(`--sideonly：用现有截图重拼 ${results.length} 页（不改任何数据）`);
} else {

const TOKEN = await adminToken(BASE);

for (const page of PAGES) {
  if (!want.includes(page.id)) continue;
  const K = KINDS[page.kind];
  console.log(`\n═══ ${page.id} ${page.name}（${page.key} / ${page.kind}）═══`);
  process.stdout.write('  有赞原页 … ');
  let yzBox, yzOut, yzShot, yzBg;
  {
    const { tid, sid } = await openYz(page.url);
    try {
      yzShot = opt.noshot ? { w: 0, h: 0 } : await shoot(sid, join(OUT, `yz3-${page.id}-youzan.png`), { mobile: true });
      yzBox = await ev(sid, mkExpr(K.pairs, K.styles, true));
      yzOut = await ev(sid, OUTLINE_EXPR.yz);
      yzBg = await ev(sid, PAGEBG_EXPR.yz);
      console.log(opt.noshot ? 'ok（跳过截图）' : `ok ${yzShot.w}x${yzShot.h}`);
    } finally { await raw('Target.closeTarget', { targetId: tid }).catch(() => {}); }
  }

  process.stdout.write('  本店 /preview … ');
  let ourBox, ourOut, ourShot, ourBg;
  {
    const { tid, sid } = await openOurs(page.key, TOKEN);
    try {
      ourBox = await ev(sid, mkExpr(K.pairs, K.styles, false));
      ourOut = await ev(sid, OUTLINE_EXPR.ours);
      ourBg = await ev(sid, PAGEBG_EXPR.ours);
      ourShot = opt.noshot ? { w: 0, h: 0 } : await shoot(sid, join(OUT, `yz3-${page.id}-ours.png`), { clipOf: '#preview' });
      console.log(opt.noshot ? 'ok（跳过截图）' : `ok ${ourShot.w}x${ourShot.h}`);
    } finally { await raw('Target.closeTarget', { targetId: tid }).catch(() => {}); }
  }

  const rec = { page, yzBox, ourBox, yzOut, ourOut, yzShot, ourShot };
  results.push(rec);

  if (opt.dump) {
    console.log('  有赞轮廓：', JSON.stringify(yzOut));
    console.log('  本店轮廓：', JSON.stringify(ourOut));
    continue;
  }

  /* ① 页面高：两边都用「最后一个内容块的底边」，有赞的 84px 页脚单独报（我们本来就该没有） */
  const dh = (ourOut.contentH - yzOut.contentH).toFixed(1);
  /* 有赞内容根带 `min-height:100vh`：内容不满一屏时它的 rect 会顶到视口高（812），
     这时候 Δ 是**假值**（08 页就是），必须标出来，否则会被当成「我们少做了 213px」。 */
  const vhFake = Math.abs(yzOut.contentH - 812) < 1;
  console.log(`  内容高 有赞 ${yzOut.contentH}（+页脚 ${yzOut.footer}）｜ 我们 ${ourOut.contentH}　Δ ${dh > 0 ? '+' : ''}${dh}` +
    (vhFake ? '　⚠ 有赞侧 = 视口高 812，是 min-height:100vh 的假值，本行 Δ 不可当真' : ''));
  console.log(`  图片 有赞 ${yzOut.imgs.total} 张待载 ${yzOut.imgs.pending}｜ 我们 ${ourOut.imgs.total} 张待载 ${ourOut.imgs.pending}`);
  /* 页面底色单独一行：盒子对账永远量不到它（它是「模块之外」的层） */
  const bgOk = yzBg && ourBg && yzBg.eff === ourBg.eff;
  console.log(`  页面底色 有赞 ${yzBg && yzBg.eff}（content=${yzBg && yzBg.layer}｜body=${yzBg && yzBg.root}）` +
    `｜ 我们 ${ourBg && ourBg.eff}（meta.bg=${ourBg && ourBg.layer}｜page=${ourBg && ourBg.root}）　${bgOk ? '同 ✓' : '★不同'}`);
  rec.bgOk = !!bgOk;

  /* ② 几何对账 */
  const baseY = (m) => (yzOut.root ? yzOut.root.y : 0);
  console.log('  ── 几何（CSS px @375 宽；「y」为页面绝对坐标）──');
  let pass = 0, total = 0, na = 0;
  for (const p of K.pairs) {
    const a = yzBox[p[0]], b = ourBox[p[0]];
    /* 两边都没有 = 该页本来就没有这一项（如 01 页卡片不显示标题、04 页无标题），
       不算「通过」也不算「失败」，单独计数 —— 混进分母会把通过率压低，看着像有 bug。 */
    if (!a && !b) { console.log(`    ${p[0].padEnd(9)} （本页无此项）`); na++; continue; }
    if (!a || !b) { console.log(`    ${p[0].padEnd(9)} 只有一边有：有赞=${JSON.stringify(a)} 我们=${JSON.stringify(b)}`); continue; }
    total++;
    const ok = (k) => Math.abs(a[k] - b[k]) < 1.01;
    const dx = ok('x') ? '✓' : '✗', dy = ok('y') ? '✓' : '✗', dw = ok('w') ? '✓' : '✗', dh = ok('h') ? '✓' : '✗';
    if (dx === '✓' && dy === '✓' && dw === '✓' && dh === '✓') pass++;
    console.log(`    ${p[0].padEnd(9)} 有赞 ${[a.x, a.y, a.w, a.h].join('/').padEnd(28)} 我们 ${[b.x, b.y, b.w, b.h].join('/').padEnd(28)} x${dx} y${dy} w${dw} h${dh}`);
  }
  console.log(`    → 可对账 ${total} 项，${pass} 项 x/y/w/h 全等（另有 ${na} 项本页无此元素）`);
  rec.geo = { total, pass, na };

  /* ③ 样式对账：只打印不一致的项，避免 8 页刷屏。
   *   - 零透明度的颜色（有赞 background: rgba(182,60,60,0)）与 rgba(0,0,0,0) 字符串不等，
   *     但都是「完全透明」→ 先归一，否则每轮都报一条假差异。
   *   - 条目可带第 5 个元素：`{ 属性: 原因 }`。命中的属性归入「已知等价偏差」单独成行，
   *     **未被点名的属性仍然按差异报**（不是整条豁免）—— 免得一处已知掩盖了后来的真问题。 */
  const normColor = (v) => String(v)
    .replace(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0\s*\)/g, 'rgba(0, 0, 0, 0)');
  const diffs = [], known = [];
  for (const s of K.styles) {
    const a = yzBox[s[0]], b = ourBox[s[0]];
    const why = s[4] || {};
    /* 两边都取不到 = 本条选择器在这页不适用（如 01 页卡片不显示标题）→ 不是差异，直接跳过。
       但要区分「**只有一边**取不到」—— 那是选择器写错了，必须报出来。 */
    if (!a && !b) continue;
    if (!a || !b) { diffs.push(`    ${s[0]} 有赞=${JSON.stringify(a)} 我们=${JSON.stringify(b)}`); continue; }
    const keys = Object.keys(a).filter((k) => normColor(a[k]) !== normColor(b[k]));
    if (!keys.length) continue;
    const real = keys.filter((k) => !why[k]);
    if (real.length) diffs.push(`    ${s[0]}  ← 差异字段：` + real.map((k) => `${k}: 有赞「${a[k]}」/ 我们「${b[k]}」`).join('；'));
    for (const k of keys.filter((x) => why[x])) {
      known.push(`    ${s[0]}.${k}  有赞「${a[k]}」/ 我们「${b[k]}」\n        ↳ ${why[k]}`);
    }
  }
  rec.styles = { diffs: diffs.length, known: known.length };
  console.log('  ── 样式差异 ──');
  console.log(diffs.length ? diffs.join('\n') : '    无 ✓');
  if (known.length) {
    console.log('  ── 已知等价偏差（实现不同、渲染等价；不改）──');
    console.log(known.join('\n'));
  }
  if (baseY(yzOut.root) !== 0) console.log(`    （有赞内容根 y=${baseY(yzOut.root)}）`);
}

}   // ← 关闭 else：--sideonly 时整段浏览器对账都不跑

/* 全轮汇总：底色不一致 / 仍有样式差异的页单独点名 ——
   这两项最容易被「几何全绿」蒙过去（模块盒子量不到它们）。 */
{
  const bad = results.filter((r) => r.bgOk === false);
  const known = results.filter((r) => r.bgOk !== undefined).length;
  if (known) {
    console.log(`\n页面底色  ${known - bad.length}/${known} 页与有赞一致` +
      (bad.length ? `　★不一致：${bad.map((r) => r.page.id).join('、')}` : ''));
  }
  const styled = results.filter((r) => r.styles);
  if (styled.length) {
    const badS = styled.filter((r) => r.styles.diffs);
    const geoBad = styled.filter((r) => r.geo && r.geo.pass < r.geo.total);
    console.log(`样式差异  ${styled.length - badS.length}/${styled.length} 页无差异` +
      (badS.length ? `　★仍有差异：${badS.map((r) => r.page.id).join('、')}` : '') +
      `　（已知等价偏差共 ${styled.reduce((n, r) => n + r.styles.known, 0)} 条，见各页明细）`);
    console.log(`几何全等  ${styled.length - geoBad.length}/${styled.length} 页逐项全等` +
      (geoBad.length ? `　★未全等：${geoBad.map((r) => `${r.page.id}(${r.geo.pass}/${r.geo.total})`).join('、')}` : ''));
  }
}

if (opt.dump) { child.kill(); process.exit(0); }
if (opt.noshot && !opt.sideonly) {
  console.log('\n（--noshot：跳过并排图拼装）');
  child.kill();
  process.exit(0);
}

/* ------------------------------------------------------------ 并排拼图 */
/** 直接从 PNG 头读尺寸（IHDR 宽高在 16..24 字节）—— 只为给拼图写标题，不值得再引依赖 */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const figs = results.map((r) => {
  const pa = join(OUT, `yz3-${r.page.id}-youzan.png`);
  const pb = join(OUT, `yz3-${r.page.id}-ours.png`);
  const a = readFileSync(pa).toString('base64');
  const b = readFileSync(pb).toString('base64');
  const sz = [pngSize(pa), pngSize(pb)];
  return `<section><h2>${r.page.id} ${r.page.name} <small>${r.page.key} · 有赞 ${sz[0].w}×${sz[0].h} / 我们 ${sz[1].w}×${sz[1].h}</small></h2>
  <div class="row">
    <figure><figcaption>有赞原页</figcaption><img loading="lazy" src="data:image/png;base64,${a}"></figure>
    <figure><figcaption>本店复刻（/preview 编译真机源码）</figcaption><img loading="lazy" src="data:image/png;base64,${b}"></figure>
  </div></section>`;
}).join('\n');
writeFileSync(join(OUT, 'yz3-side.html'), `<!doctype html><meta charset="utf-8"><title>资讯栏目 8 页复刻对照</title><style>
 body{margin:0;background:#f2f3f5;font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;padding:20px}
 h2{font-size:15px;margin:24px 0 10px} h2 small{font-weight:400;color:#7a7f87;margin-left:8px}
 section{background:#fff;border:1px solid #e2e4e8;border-radius:10px;padding:0 16px 16px}
 .row{display:flex;gap:16px;align-items:flex-start}
 figure{margin:0;background:#fff;border:1px solid #e2e4e8;border-radius:8px;overflow:hidden}
 figcaption{padding:8px 12px;font-weight:600;border-bottom:1px solid #eef0f3}
 img{display:block;width:375px}
</style>${figs}`);

{
  const tid = await newTab('file:///' + join(OUT, 'yz3-side.html').replace(/\\/g, '/'));
  const sid = await attach(tid);
  await sleep(2500);
  const m = await raw('Page.getLayoutMetrics', {}, sid);
  const cs = m.cssContentSize || m.contentSize;
  console.log(`\n并排对照页：.tooling/_cmp/yz3-side.html（16 张图按页内嵌，图片懒加载 → 打开后往下滚即可）`);
  if (opt.side) {
    const { data } = await raw('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 },
    }, sid, 240000);
    writeFileSync(join(OUT, 'yz3-side.png'), Buffer.from(data, 'base64'));
  } else {
    console.log('（要一张整图加 --side；8 页并排 ≈ 2.9 万像素高，Chrome 基本截不动，建议直接看上面的 HTML）');
  }
  await raw('Target.closeTarget', { targetId: tid }).catch(() => {});
}
console.log('\n完成。');

child.kill();
process.exit(0);
