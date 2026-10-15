/* shopnotes 数据层自测（跑完清空）
 * 记录形态：{ id, title(派生), key/name/belongs/path(派生), createdAt, updatedAt, published: { 内容 } }
 *
 * ⚠️ 开头必须**显式 reset()**：下面大量断言写死了 id（1、2…），
 *    只要注册表里还剩上一条（哪怕是别的自检留下的）就会整串错位。
 *    曾经没写，结果这个文件只能「删掉 json 后跑一次」—— 第二次跑必然红。
 */
const sn = require('../server/decorate/shopnotes.js');

sn.reset(); // 从零开始，保证可重复运行

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function throws(fn) { try { fn(); return null; } catch (e) { return e; } }

console.log('--- shopnotes 数据层自测 ---');

// 1. 新建
const a = sn.create({ title: '莱克新品上市' });
ok('新建返回自增 id', a.id === 1, '实际 ' + a.id);
ok('记录带 createdAt / updatedAt', !!a.createdAt && !!a.updatedAt);
ok('标题以派生字段暴露（装修台列表用）', a.title === '莱克新品上市');
/*
 * ⚠️ 内容的形状由装修台的字段树决定，**不是随便放的**：
 *    schema 里根节点是 [header, body, blocks] 三个键，面板按路径读写
 *    data.header.title —— 所以标题/摘要/标签/封面必须住在 header 里。
 *    曾经平铺在 published 顶层，结果面板上这 7 个字段全空、改完被静默丢弃
 *    （_probe-note-paths.cjs 取证的）。下面两条断言就是钉住这个形状的钉子。
 */
ok('内容形状 = header / body / blocks 三个键',
  Object.keys(a.published).sort().join(',') === 'blocks,body,header,publishedAt',
  Object.keys(a.published).join(','));
ok('内容落在 published.header.title', a.published.header.title === '莱克新品上市');
ok('顶层不再平铺 title（面板按 header.title 读写）', a.published.title === undefined);
ok('新建默认封面模式 = multi', a.published.header.coverMode === 'multi');
ok('新建默认头部开关齐全', a.published.header.showPublishTime === true && a.published.header.showBrowseCount === true);
ok('新建正文默认底色 #ffffff', a.published.body.bg === '#ffffff');
ok('新建组件流为空数组', Array.isArray(a.published.blocks) && a.published.blocks.length === 0);

// 2. 读
ok('get 拿到标题', sn.get(1).title === '莱克新品上市');
ok('has(1) = true', sn.has(1) === true);
ok('has(99) = false', sn.has(99) === false);
ok('get(99) = null', sn.get(99) === null);

// 3. key 换算
ok('pageKeyOf(1) = note-1', sn.pageKeyOf(1) === 'note-1');
ok('idOfKey("note-1") = 1', sn.idOfKey('note-1') === 1);
ok('idOfKey("home") = 0（非笔记 key）', sn.idOfKey('home') === 0);

// 4. 标签截断到 8 字（有赞「8 个字以内」）
const b = sn.update(1, { tags: '这是一个非常长的标签内容' });
ok('标签截断到 8 字', b.published.header.tags.length === 8, '实际 ' + b.published.header.tags.length + ' 字：「' + b.published.header.tags + '」');

// 5. 封面最多 9 张
const errCovers = throws(() => sn.update(1, { covers: new Array(10).fill('/uploads/a.png') }));
ok('封面超过 9 张被拒', !!errCovers && /9/.test(errCovers.message), errCovers && errCovers.message);

// 6. 标题超 40 字被拒（**不许静默截断**）
const errTitle = throws(() => sn.update(1, { title: '标'.repeat(41) }));
ok('标题超 40 字被拒', !!errTitle && /40/.test(errTitle.message), errTitle && errTitle.message);
ok('被拒后标题未被改动', sn.get(1).title === '莱克新品上市', '实际「' + sn.get(1).title + '」');

// 7. 标题必填校验（create / update / store.validate 三处共用）
// 这里刻意**不留 required 开关**：以前可以传 false 关掉必填，结果空标题被静默接受；
// 标题就是笔记在列表里的名字，没有「可以不填」的合法场景。
ok('checkTitle 空值报必填', /必填/.test(sn.checkTitle('')));
ok('checkTitle 超长报上限', /最多/.test(sn.checkTitle('x'.repeat(41))));
ok('checkTitle 正常放行', sn.checkTitle('莱克新品上市') === '');
ok('create 空标题被拒（必填是硬约束）', !!throws(() => sn.create({ title: '' })));
ok('update 把标题清空也被拒', !!throws(() => sn.update(1, { title: '' })));

// 8. 正文与组件流写回
sn.update(1, { body: { html: '<p>正文</p>', bg: '#000', fullscreen: true } });
sn.update(1, { blocks: [{ type: 'rich_text', html: '<p>x</p>' }, { type: 'white', height: 30 }] });
const c = sn.get(1);
ok('正文 html 写回', c.published.body.html === '<p>正文</p>' && c.published.body.fullscreen === true);
ok('组件流写回 2 项', c.published.blocks.length === 2 && c.published.blocks[0].type === 'rich_text');

// 8b. header / body 是**浅合并**而不是整体替换（否则改一个开关会丢其它开关）
sn.update(1, { header: { showTitle: false } });
const hm = sn.get(1).published.header;
ok('改 header 单个开关不丢其它开关',
  hm.showTitle === false && hm.showPublishTime === true && hm.showEnterShop === true,
  JSON.stringify(hm));
ok('改 header 不覆盖 body', sn.get(1).published.body.html === '<p>正文</p>');

// 9. 列表 / 概要
sn.create({ title: '第二条笔记' });
ok('count = 2', sn.count() === 2, '实际 ' + sn.count());
const sums = sn.summaries();
ok('summaries 不含 blocks', sums[0].published.blocks === undefined);
ok('summaries 不含 body', sums[0].published.body === undefined);
ok('summaries 保留标题', sums[0].title === '莱克新品上市');
ok('summary(1) 单条也精简', sn.summary(1).published.blocks === undefined);

// 10. 已发布内容读取
ok('publishedContent(1) 拿到正文', sn.publishedContent(1).body.html === '<p>正文</p>');
ok('publishedContent(99) 给空白内容不炸', sn.publishedContent(99).header.title === '' && Array.isArray(sn.publishedContent(99).blocks));

// 11. 发布回写
sn.setPublished(1, { title: '莱克新品上市（已发布）', blocks: [{ type: 'line' }], body: { html: 'x' } });
ok('setPublished 落 published.header.title', sn.get(1).published.header.title === '莱克新品上市（已发布）');
ok('setPublished 后列表标题同步', sn.get(1).title === '莱克新品上市（已发布）');

// 12. 删除
sn.remove(1);
ok('删除后 has(1) = false', sn.has(1) === false);
ok('删除后 count = 1', sn.count() === 1);
const errDel = throws(() => sn.remove(1));
ok('删不存在的笔记 → 404 BizError', !!errDel && errDel.httpStatus === 404, errDel && (errDel.httpStatus + ' ' + errDel.message));

// 13. 上限与统计
ok('MAX_NOTES = 50', sn.MAX_NOTES === 50);
ok('stats 形态正确', typeof sn.stats().count === 'number' && sn.stats().max === 50);

/* 14. 「笔记头部」的形状与搬运（这一组是本轮修 bug 后补的，钉住三层行为）
 *
 * 背景：装修台面板按字段树路径读写 data.header.title。曾经内容平铺在 published 顶层，
 * 于是面板上标题/摘要/标签/封面/两个商品开关**显示为空、改完被静默丢弃**、还不报错。
 * 下面三类断言分别锁住：① 规范形状；② 旧形状的兼容读取（已存下的草稿不能丢内容）；
 * ③ 对外平铺入参的搬运（create/update 的公开入参一直是平的，route 层也是）。
 */
ok('HEADER_KEYS 覆盖 7 个内容键且不含开关',
  sn.HEADER_KEYS.join(',') === 'title,summary,tags,coverMode,covers,showGoodsCard,showNoteOnGoods',
  sn.HEADER_KEYS.join(','));

// ① 旧形状（平铺）能被读出来 —— 上一轮存下的草稿打开不能变成一篇空标题笔记
const legacy = sn.normalizeContent({
  title: '旧形状标题', summary: '旧摘要', tags: '旧标签',
  covers: ['/uploads/202610/a.png'], coverMode: 'single',
  showGoodsCard: true, header: { showTitle: false, showEnterShop: false }
});
ok('旧平铺形状的标题被读进 header', legacy.header.title === '旧形状标题', legacy.header.title);
ok('旧平铺形状的摘要/标签/封面都被读进 header',
  legacy.header.summary === '旧摘要' && legacy.header.tags === '旧标签' &&
  legacy.header.covers.length === 1 && legacy.header.coverMode === 'single');
ok('旧平铺形状的商品卡片开关被读进 header', legacy.header.showGoodsCard === true);
ok('旧形状的显示开关不被顶层的同名键污染（开关只认 header）',
  legacy.header.showTitle === false && legacy.header.showEnterShop === false);

// ② 对外平铺入参 → 搬进 header（只此一处转换）
const hoisted = sn.hoistHeader({ title: '平铺标题', blocks: [] });
ok('hoistHeader 把顶层 title 搬进 header', hoisted.header && hoisted.header.title === '平铺标题');
ok('hoistHeader 搬完不留顶层同名键', hoisted.title === undefined);
ok('hoistHeader 不动非 header 键', Array.isArray(hoisted.blocks));
const both = sn.hoistHeader({ title: '平铺的', header: { title: '嵌套的' } });
ok('两种写法同时出现时以 header 里的为准', both.header.title === '嵌套的', both.header.title);
ok('hoistHeader 对空入参安全', sn.hoistHeader(undefined).header === undefined);

// ③ 走 create / update 的真实链路：面板改标题必须落得下、且不顺手改坏开关
sn.update(2, { header: { showTitle: false } });
const n3 = sn.create({ title: '搬运测试笔记' });
ok('create 后内容落在 header.title', n3.published.header.title === '搬运测试笔记');
ok('create 后顶层无平铺 title', n3.published.title === undefined);
const n3b = sn.update(n3.id, { title: '面板改过的标题' });
ok('★ update 用平铺入参改标题会生效（这就是之前静默失效的那条链）',
  n3b.published.header.title === '面板改过的标题', n3b.published.header.title);
sn.update(n3.id, { header: { showTitle: false } });
const n3c = sn.update(n3.id, { header: { title: '面板路径改的标题' } });
ok('★ update 用 header.title（面板真实路径）改标题会生效',
  n3c.published.header.title === '面板路径改的标题', n3c.published.header.title);
ok('改标题没有顺手把开关改回默认', n3c.published.header.showTitle === false);
ok('列表标题跟随 header.title', sn.get(n3.id).title === '面板路径改的标题');
ok('record 派生 tags（装修台列表副标题）', sn.get(2).tags === '', JSON.stringify(sn.get(2).tags));
sn.update(2, { tags: '洗地机' });
ok('record 的 tags 跟随 header.tags', sn.get(2).tags === '洗地机', sn.get(2).tags);

console.log(`\n通过 ${pass} / 失败 ${fail}`);

// 清空（测试数据不留档）
sn.reset();
require('node:fs').unlinkSync(sn.FILE);
console.log('已清空测试数据并删除 ' + sn.FILE);
process.exit(fail ? 1 : 0);
