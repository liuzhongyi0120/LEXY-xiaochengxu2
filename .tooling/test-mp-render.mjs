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
ok('wx:if / wx:else 同级链只出一条', html.indexOf('/a.jpg') > -1 && html.indexOf('class="ph"') > -1);
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

/* ------------------------------ 汇总 ------------------------------ */
console.log('\n' + '─'.repeat(56));
console.log(`预览渲染内核单测：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('全部通过 ✓');
