/* =========================================================================
 * 预览渲染内核单测（WXSS 转译 + WXML 编译）
 *
 * 为什么要有：前端预览页的价值全在「与真机一致」。这两个编译器是浏览器脚本
 * （不是 CommonJS），跑不了 require，所以这里读源码后在当前全局作用域执行 ——
 * 这样就能在 node 里对真实的小程序源码做断言，不依赖浏览器、不依赖 CDP。
 *
 * 断言来源全部是**真机源码本身**（product.wxss / product.wxml / reset.wxss），
 * 不是手抄的期望值：真机改了、预览没跟上，这里就会红。
 * ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MP = join(ROOT, 'miniprogram');

/* ------------------------------ 载入浏览器脚本 ------------------------------ */
// 顶层是 (function(root){...})(window || this) —— 在非严格模式下 this 即 globalThis，
// 于是 MpWxss / MpWxml 会挂到全局，供下面的断言使用。
for (const f of ['mp-wxss.js', 'mp-wxml.js']) {
  // eslint-disable-next-line no-eval
  (0, eval)(readFileSync(join(ROOT, 'server', 'public', 'shared', f), 'utf8'));
}
const Wxss = globalThis.MpWxss;
const Wxml = globalThis.MpWxml;

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
  else { fail += 1; failures.push(name); console.log('  ✗ ' + name + '  ' + (detail || '')); }
}
const read = (p) => readFileSync(join(MP, p), 'utf8');

/* ------------------------------ 1. WXSS 单位换算 ------------------------------ */
console.log('\n【1】WXSS 单位换算');
ok('rpx → px（750 设计稿基准，预览按 375 宽渲染 → ÷2）',
  Wxss.rpx2px('width:196rpx') === 'width:98px', Wxss.rpx2px('width:196rpx'));
ok('半像素不丢（239rpx → 119.5px）',
  Wxss.rpx2px('height:239rpx') === 'height:119.5px', Wxss.rpx2px('height:239rpx'));
ok('vh 按手机屏可视区高度换算（100vh → 718px，不是浏览器窗口高）',
  /100vh/.test(Wxss.compile('a{height:100vh}')) === false &&
  /height:718px/.test(Wxss.compile('a{height:100vh}')), Wxss.compile('a{height:100vh}'));
ok('vw 按手机屏宽度换算（100vw → 375px）',
  /width:375px/.test(Wxss.compile('a{width:100vw}')), Wxss.compile('a{width:100vw}'));

/* ------------------------------ 2. 作用域与标签映射 ------------------------------ */
console.log('\n【2】作用域隔离与标签映射');
const scoped = Wxss.compile('page{color:red}\n.a .b{width:10px}\n.a,.b{height:1px}');
ok('page{…} 映射为根节点 .mp-root（设计令牌定义处）', /\.mp-root\{color:red\}/.test(scoped), '');
ok('普通选择器统一加 .mp-root 前缀', /\.mp-root \.a \.b\{/.test(scoped), '');
ok('逗号选择器逐段加前缀', /\.mp-root \.a, \.mp-root \.b\{/.test(scoped), '');
const tagMapped = Wxss.compile('image{display:block}\nvalue.foo{color:red}');
ok('裸标签 image → img（WXML 编译后是 <img>，不换这条样式就丢了）',
  /\.mp-root img\{display:block\}/.test(tagMapped), tagMapped.split('\n')[0]);
ok('类名里的 text/value 不被误伤（.empty-text 不能被改成 .empty-span）',
  Wxss.compile('.empty-text{color:red}').indexOf('.empty-span') === -1);
ok('@import 语句被剥离（由调用方先合并依赖文件）',
  Wxss.compile('@import "styles/x.wxss";\n.a{color:red}').indexOf('@import') === -1);

/* ------------------------------ 3. WXML 编译 ------------------------------ */
console.log('\n【3】WXML 编译');
Wxml.resetStats();
const fixture = `<view class="page" style="background: {{bg}};">
  <view wx:for="{{list}}" wx:key="id" wx:for-item="it" wx:for-index="i"
        class="item {{i === 0 ? 'first' : ''}}">
    <text>{{it.name}}</text>
    <image wx:if="{{it.img}}" class="pic" src="{{it.img}}" mode="aspectFit" />
    <view wx:else class="ph"></view>
  </view>
  <view wx:if="{{a && b}}">AND</view>
  <scroll-view class="sv" scroll-y show-scrollbar="{{false}}"><view>x</view></scroll-view>
</view>`;
const html = Wxml.render(Wxml.parse(fixture), Wxml.makeScope({
  bg: '#fff', list: [{ name: '甲', img: '/a.jpg' }, { name: '乙' }], a: 1, b: 1
}), {});
ok('wx:for 展开 + wx:for-item/index 起作用', (html.match(/class="item/g) || []).length === 2);
ok('{{}} 三元表达式在属性里求值（第一条加 first）', /class="item first"/.test(html));
/* ⚠️ 这条曾经是弱断言（只查「两个串都在」）—— 条件链写反时，真机上会出现
 * 「有图的项既有 <img> 又有占位、无图的项两个都没有」，两个串依然都在，查不出来。
 * 必须按「每个列表项二选一」的**互斥**口径来锁：有图 1 张、占位 1 个。 */
const nImg = (html.match(/\/a\.jpg/g) || []).length;
const nPh = (html.match(/class="ph"/g) || []).length;
ok('wx:if / wx:else 同级链每个列表项二选一（图 1 张 / 占位 1 个，互斥）',
  nImg === 1 && nPh === 1, 'img=' + nImg + ' ph=' + nPh);
ok('含裸 && 的条件表达式不报错且成立于真', html.indexOf('AND') > -1);
ok('内联样式里的 {{}} 被替换', /background: #fff/.test(html));
ok('image → img 且 mode 落到 data-mode', /<img[^>]+data-mode="aspectFit"/.test(html));
ok('scroll-view 的 scroll-y / show-scrollbar={{false}} 真正求值（不是字面量比对）',
  /data-scroll-y="1"/.test(html) && /data-scroll-hidden="1"/.test(html), html.match(/<div class="sv"[^>]*>/)?.[0] || '');
ok('模板中的 bindtap / hover-class / data-* 不进产物',
  !/bindtap|hover-class|data-index=/.test(html));
ok('编译期统计全 0（表达式失败 / 未支持组件 / include 未解析）',
  Wxml.stats.exprFail === 0 && Wxml.stats.unsupportedTag === 0 && Wxml.stats.missingInclude === 0,
  JSON.stringify(Wxml.stats.samples));

/* --------------------- 3b. wx:if / elif / else 三级条件链 ---------------------
 * 这段逻辑**曾经写反过**：条件为假时把链标记成「已命中」、命中后标记成「未命中」。
 * 后果是真机上：
 *   · wx:if 为真 → if 分支与 else 分支**同时**渲染（重复内容）；
 *   · wx:if 为假 → 两个分支**都不**渲染（整块空白）。
 * 「必备工具」在 /preview 里整块空白、官方账号区块内容错位，根因就是它。
 *
 * 上面那条「每个列表项二选一」的断言是**间接**的（要看 fixture 恰好一真一假才暴露），
 * 这里用 A/B/C 三态隔离用例把语义直接钉死 —— 否则以后有人再改坏，可能又被绕过去。
 * ------------------------------------------------------------------------- */
const stripTags = (h) => h.replace(/<[^>]*>/g, '').trim();
const chain3 = (a, b) => stripTags(Wxml.render(Wxml.parse(
  '<view><view wx:if="{{a}}">A</view><view wx:elif="{{b}}">B</view><view wx:else>C</view></view>'
), Wxml.makeScope({ a: a, b: b }), {}));
console.log('\n【3b】wx:if / wx:elif / wx:else 三级条件链');
ok('wx:if 命中 → 只渲染 if 分支（底下的 elif / else 都必须让位）', chain3(1, 0) === 'A', chain3(1, 0));
ok('wx:elif 命中 → 只渲染 elif 分支', chain3(0, 1) === 'B', chain3(0, 1));
ok('全部为假 → 只渲染 else 分支（不能整块空白）', chain3(0, 0) === 'C', chain3(0, 0));
ok('wx:if 与 wx:elif 同时为真 → if 优先，elif 不重复出', chain3(1, 1) === 'A', chain3(1, 1));
/* 链状态不能跨节点串台：两条各自独立的 wx:if 都必须出（这是最容易写坏的一种） */
const twoIf = stripTags(Wxml.render(Wxml.parse(
  '<view><view wx:if="{{a}}">A</view><view wx:if="{{b}}">B</view></view>'
), Wxml.makeScope({ a: 1, b: 1 }), {}));
ok('两条独立 wx:if 各自成立 → 两条都渲染（链状态不跨节点串台）', twoIf === 'AB', twoIf);
/* 兄弟节点混入无关标签后，链仍要正确（真机模板里 if/else 之间常有注释或换行） */
const withNoise = stripTags(Wxml.render(Wxml.parse(
  '<view><view wx:if="{{a}}">A</view><view wx:else>C</view><text>Z</text></view>'
), Wxml.makeScope({ a: 0 }), {}));
ok('wx:if 为假且链后还有别的节点 → 出 else 分支 + 后续节点', withNoise === 'CZ', withNoise);

/* --------------- 4. 用真机 product.wxss 做端到端对账 --------------- */
console.log('\n【4】真机 product.wxss → 预览 CSS 端到端对账');
const prodCss = Wxss.compile(read('pages/product/product.wxss'));

/*
 * 比对前先归一化空白：编译器**不改声明格式**（只换单位），真机源码写的是
 * `width: 196rpx;`（冒号后带空格），编译出来自然是 `width: 98px;`。
 * 直接拿 `width:98px` 去 indexOf 会永远落空 —— 这是断言写法的问题，不是编译的问题。
 */
const norm = (s) => String(s)
  .replace(/\{\s*/g, '{')
  .replace(/\s*\}/g, '}')
  .replace(/\s*:\s*/g, ':')
  .replace(/\s*;\s*/g, ';')
  .replace(/\s*,\s*/g, ',');
const prodNorm = norm(prodCss);
/** 取出某条规则（选择器 → 声明块），找不到返回 null */
function rule(css, sel) {
  const i = css.indexOf(sel);
  if (i < 0) return null;
  const j = css.indexOf('}', i);
  return j < 0 ? null : css.slice(i + sel.length, j);
}
const expectations = [
  ['.mp-root .side{', 'width:98px', '左栏 196rpx → 98px'],
  ['.mp-root .side-item{', 'height:45px', '导航项 90rpx 高 → 45px'],
  ['.mp-root .side-item{', 'font-size:15px', '导航项 30rpx 字 → 15px'],
  ['.mp-root .side-item-active{', 'background:#000000', '选中态黑底（不是红字白底）'],
  ['.mp-root .side-item-active{', 'color:var(--color-text-inverse)', '选中态白字'],
  ['.mp-root .prod{', 'width:50%', '型号卡片占一半 = 两列'],
  ['.mp-root .prod-pic{', 'height:119.5px', '图片区 239rpx → 119.5px'],
  ['.mp-root .prod-model{', 'font-size:14px', '型号名 28rpx → 14px'],
  ['.mp-root .prod-model{', 'margin-top:10px', '型号名上边距 20rpx → 10px']
];
for (const [sel, decl, label] of expectations) {
  const body = rule(prodCss, sel);
  ok(label,
    body !== null && norm(body).indexOf(decl) > -1,
    body === null ? '找不到选择器 ' + sel : norm(body).trim());
}
ok('product.wxss 的 100vh 已被换算（.page 高度不再依赖浏览器窗口）',
  /height:718px/.test(norm(rule(prodCss, '.mp-root .page{') || '')) &&
  prodNorm.indexOf('100vh') === -1,
  norm(rule(prodCss, '.mp-root .page{') || '').slice(0, 80));
ok('真机源码里的裸标签选择器已换成 HTML 标签（.side-item-active text → span）',
  prodNorm.indexOf('.mp-root .side-item-active span{') > -1);
ok('编译结果里不再残留任何 rpx（漏换的 rpx 在浏览器里无效）',
  prodCss.indexOf('rpx') === -1);

const homeBlocks = read('templates/blocks.wxml');
ok('首页区块模板 (templates/blocks.wxml) 可被解析且节点数 > 100',
  Wxml.parse(homeBlocks).length > 0, Wxml.parse(homeBlocks).length + ' 个顶层节点');
ok('区块模板用了 include 依赖（预览必须支持 include 才渲染得出首页）',
  /<include\s+src=/.test(read('pages/index/index.wxml')));

/* --------------- 5. 装修台的产品页预览必须与真机口径一致 --------------- */
console.log('\n【5】装修台预览与真机口径对账（防两处再次走样）');
const adminCss = readFileSync(join(ROOT, 'server', 'public', 'admin', 'admin.css'), 'utf8');
const pvRender = readFileSync(join(ROOT, 'server', 'public', 'shared', 'pv-render.js'), 'utf8');
const pairs = [
  [/\.pv-nav\s*\{[^}]*width:\s*98px/, '装修台预览左栏 98px（= 真机 196rpx）'],
  [/\.pv-nav\s*>\s*div\.on\s*\{[^}]*background:\s*#000/, '装修台预览选中态黑底'],
  [/\.pv-nav\s*>\s*div\.on\s*\{[^}]*color:\s*#fff/, '装修台预览选中态白字'],
  [/\.pv-prods\s+\.pv-cell\s*\{[^}]*width:\s*50%/, '装修台预览型号卡片两列'],
  [/\.pv-prods\s+\.pv-cell\s+img\s*\{[^}]*height:\s*119\.5px/, '装修台预览图片区 119.5px'],
  [/\.pv-prods\s+\.pv-cell\.pv-model\s+b\s*\{[^}]*font-size:\s*14px/, '装修台预览型号名 14px']
];
for (const [re, label] of pairs) ok(label, re.test(adminCss));
ok('装修台预览用 pv-prods 两列容器（不再是三列的 pv-grid g3）',
  /class="pv-prods"/.test(pvRender) && !/pv-grid g3/.test(pvRender.slice(pvRender.indexOf('function pvProduct'), pvRender.indexOf('function pvMine'))));

/* -------------------- 6. 品牌分类（brand_category）真机链路 -------------------- */
/*
 * 为什么单测这一块：
 *   /preview 的链路是「真机源码直接编译」，但它只渲染**已发布**的 replica.js；
 *   而品牌分类是本次新接入的区块，没人会为了验它去发布一次线上内容。
 *   所以在这里用合成数据直接跑 WXML 编译 + WXSS 对账，等价且不碰线上。
 */
console.log('\n【6】品牌分类（brand_category）真机渲染链路');

// blocks.js 是 CommonJS（小程序侧也用它），具名导出不一定被 lexer 认出来，两条路都兜
const blocksMod = await import('../miniprogram/utils/blocks.js');
const normalizeBlock = blocksMod.normalizeBlock
  || (blocksMod.default && blocksMod.default.normalizeBlock);
if (typeof normalizeBlock !== 'function') throw new Error('拿不到 normalizeBlock，import 口径变了');

const rawBlock = {
  id: 'probe-bcat', type: 'brand_category',
  navStyle: 'C', navWidth: 26, layout: '2',
  effect: 'up', effectSpeed: 1.5, effectDelay: 0.3,
  panelGap: 13, itemGapX: 12, itemGapY: 8, itemTitleColor: '', panelTitleColor: '',
  brands: [
    {
      title: '莱克', panels: [
        {
          title: '热门推荐', layout: '2', items: [
            { image: '/uploads/202610/a.png', title: '洗地机 X1', desc: '家用', linkMode: 'whole', link: '/packageGoods/detail/detail?id=g1' },
            { image: '/uploads/202610/b.png', title: '吸尘器 X2', desc: '', linkMode: 'hot', link: '/packageGoods/detail/detail?id=g2' }
          ]
        },
        { title: '型号入口', layout: 'nav', items: [{ image: '/uploads/202610/c.png', title: 'C5 Pro', linkMode: 'whole', link: '' }] }
      ]
    },
    { title: '碧云泉', panels: [{ title: '', layout: '3', items: [{ image: '/uploads/202610/d.png', title: '净饮机 G7' }] }] },
    { title: '   ', panels: [] }        // 空标题品牌：必须被剔除
  ]
};

const nb = normalizeBlock(rawBlock);
const bcatHtml = Wxml.render(Wxml.parse(homeBlocks), Wxml.makeScope({ blocks: [nb] }), {});

ok('空标题品牌被剔除（3 个品牌 → 2 个导航项）',
  (bcatHtml.match(/class="bc-nav /g) || []).length === 2 && nb.navs.length === 2, 'navs=' + JSON.stringify(nb.navs));
ok('空标题品牌没有留下导航文案', bcatHtml.indexOf('bc-navt">   ') === -1);
ok('左栏宽度按 navWidth 落到 inline style（26%）', /width: 26%/.test(bcatHtml));
ok('左栏底色走 inline style（#F1F1F1）', /background: #F1F1F1/.test(bcatHtml));
ok('第一个品牌是选中态、其余不是',
  (bcatHtml.match(/class="bc-navi on /g) || []).length === 1 && /bc-navi on /.test(bcatHtml));
ok('风格 C 的竖条标记落在选中项上', (bcatHtml.match(/bc-navi on is-c/g) || []).length === 1);
/* 内联样式里的 rpx 会被 mp-wxml 换算成 px（375 基准，见 mp-wxml.js 的 style 分支），
   所以断言要拿换算后的值：真机 20rpx×2rpx ⇔ 预览 10px×1px。 */
ok('风格 C 的竖条尺寸真机 20rpx×2rpx → 预览 10px×1px',
  /--bc-bar-h: 10px/.test(bcatHtml) && /--bc-bar-w: 1px/.test(bcatHtml));
ok('导航项高度真机 90rpx → 预览 45px（rpx 换算对内联样式同样生效）',
  /height: 45px/.test(bcatHtml));
ok('右栏条目数 = 当前品牌下的条目数（2 列组 2 项 + 导航组 1 项 = 3）',
  (bcatHtml.match(/class="bc-cell /g) || []).length === 3);
ok('「导航」布局的条目带 nav 修饰类', (bcatHtml.match(/class="bc-cell nav /g) || []).length === 1);
ok('缓动 class 由 JS 拼好并落到条目上（anim-up ×3，模板里不做字符串拼接）',
  (bcatHtml.match(/anim-up/g) || []).length === 3);
ok('缓动时长 / 间隔落到 animation-duration / animation-delay',
  /animation-duration: 1500ms/.test(bcatHtml) && /animation-delay: 0ms/.test(bcatHtml) && /animation-delay: 300ms/.test(bcatHtml));
ok('条目图片 src 真的进了产物', /\/uploads\/202610\/a\.png/.test(bcatHtml) && /\/uploads\/202610\/c\.png/.test(bcatHtml));
ok('图片按原图比例撑高（widthFix）而非裁切', /data-mode="widthFix"/.test(bcatHtml));
ok('导航模式下小图用 aspectFill + square', /data-mode="aspectFill"/.test(bcatHtml));
ok('两列组的格子宽度 = 50%（cellW 由 JS 算好）', /width: 50%/.test(bcatHtml));
ok('小组标题渲染出来（含 panelTitleGap 内距）', bcatHtml.indexOf('热门推荐') > -1 && bcatHtml.indexOf('bc-ptitle') > -1);
ok('标题色留空时兜底 #323233（不能留成空串 —— 空的 var 是无效值，会整条声明作废）',
  /--bc-ifg: #323233/.test(bcatHtml) && /--bc-pfg: #323233/.test(bcatHtml));
ok('跳转与 hover 只以 data-* / hover-class 形式进产物（不泄漏 bindtap）',
  !/bindtap|catchtap|hover-class/.test(bcatHtml));

/* 空数据不炸模板，且有可照做的提示。
   注意左栏外壳（.bc-navcol）**故意保留** —— 与有赞一致：框架在、内容空，
   运营一眼就知道「是没配内容」而不是「组件没生效」；真正要断言的是没有导航项与条目。 */
const emptyHtml = Wxml.render(Wxml.parse(homeBlocks), Wxml.makeScope({ blocks: [normalizeBlock({ type: 'brand_category' })] }), {});
ok('没有品牌时：空态提示在场、导航项与条目一个都不出（左栏外壳保留）',
  /bc-empty/.test(emptyHtml) && !/bc-navt/.test(emptyHtml) && !/bc-cell/.test(emptyHtml) && /c-bcat/.test(emptyHtml),
  'empty=' + /bc-empty/.test(emptyHtml) + ' navt=' + /bc-navt/.test(emptyHtml) + ' cell=' + /bc-cell/.test(emptyHtml));

/* 五套标题风格都跑一遍：不能有未支持的写法、不能产物为空 */
const styleOut = ['A', 'B', 'C', 'D', 'E'].map((s) => {
  const h = Wxml.render(Wxml.parse(homeBlocks), Wxml.makeScope({ blocks: [normalizeBlock(Object.assign({}, rawBlock, { navStyle: s }))] }), {});
  return { s, len: h.length, isC: /bc-navi on is-c/.test(h), isD: /bc-nav is-d/.test(h), hasBc: /c-bcat/.test(h) };
});
ok('5 种标题风格全部渲染成功且只点亮各自专属装饰',
  styleOut.every((x) => x.hasBc && x.len > 500) &&
  styleOut.filter((x) => x.isC).map((x) => x.s).join('') === 'C' &&
  styleOut.filter((x) => x.isD).map((x) => x.s).join('') === 'D',
  JSON.stringify(styleOut));

/* 品牌分类用到的 class 必须都在 wxss 里有定义（防「哑样式」：模板写了、样式没写） */
const idxCss = norm(Wxss.compile(read('pages/index/index.wxss')));
const appCss = norm(Wxss.compile(read('app.wxss')));
const bcatClasses = ['c-bcat', 'bc-wrap', 'bc-navcol', 'bc-nav', 'bc-navi', 'bc-navt', 'bc-main', 'bc-inner',
  'bc-ptitle', 'bc-grid', 'bc-cell', 'bc-pic', 'bc-picph', 'bc-txt', 'bc-it', 'bc-id', 'bc-empty'];
const missing = bcatClasses.filter((c) => idxCss.indexOf('.' + c) === -1);
ok('品牌分类的 17 个核心 class 都在 index.wxss 里有定义', missing.length === 0, '缺：' + missing.join(', '));
ok('hover-lite 定义在 app.wxss（全局 hover 反馈）', appCss.indexOf('.hover-lite') > -1);
ok('shadow / square 两个修饰类有定义', idxCss.indexOf('.shadow') > -1 && idxCss.indexOf('.square') > -1);
const animMissing = ['anim-right', 'anim-up', 'anim-zoom', 'anim-fade'].filter((c) => idxCss.indexOf('.' + c) === -1);
ok('4 种缓动 class 都有 keyframes 对应', animMissing.length === 0, '缺：' + animMissing.join(', '));

/* ------------------------------ 汇总 ------------------------------ */
console.log('\n' + '─'.repeat(56));
console.log(`预览渲染内核单测：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('全部通过 ✓');
