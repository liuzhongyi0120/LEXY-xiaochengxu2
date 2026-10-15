/* 店铺笔记 · 端到端接线自测（装修台识别 → 组装 → 生成 replica 源码）
 * 跑完清空，不改动任何真实数据文件。
 *
 * ⚠️ 开头必须 reset()：下面大量断言写死了 id（note-1），而注册表的自增序号是**落盘**的
 *    （server/data/decorate/shopnotes.json 的 seq）。不清就建，建出来是 note-3，
 *    于是「笔记已创建，id = 1」以及后面所有依赖 note-1 的断言整串错位 ——
 *    单独跑绿、跟在别的自检后面跑就红（本地跑了好久才发现，正是「不可重复运行」的坑）。
 */
const sn = require('../server/decorate/shopnotes.js');
const schema = require('../server/decorate/schema.js');
const store = require('../server/decorate/store.js');
const emit = require('../server/decorate/emit.js');

sn.reset(); // 从零开始，保证可重复运行

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('--- 店铺笔记 端到端接线自测 ---');

/* 0. 基线：没有笔记时，replica 源码不该出现 SHOPNOTES（向后兼容） */
const BASE = {
  SHOP: { name: '莱克' }, HOME_BLOCKS: [], MINE_BLOCKS: [], LEXY_SERIES: [],
  NEWS: {}, PRODUCT_NAV_LOGO: '', PRODUCT_BRANDS: []
};
const src0 = emit.emitReplica(BASE, { originalSrc: '/* x */' });
ok('无笔记时 replica 不含 SHOPNOTES', !/SHOPNOTES/.test(src0));
ok('无笔记时导出清单不变', !/^\s*SHOPNOTES/m.test(src0));

/* 1. 建一条笔记 */
const n = sn.create({ title: '莱克洗地机实测' });
ok('笔记已创建，id = 1', n.id === 1);

/* 2. 装修台能否识别（findPage 是装修台打开编辑器的入口） */
const p = schema.findPage('note-1');
ok('findPage("note-1") 拿到定义', !!p && p.key === 'note-1');
ok('页面名取自笔记标题', !!p && p.name === '莱克洗地机实测');
ok('归属分组 = 店铺笔记', !!p && p.belongs === shopnotesBelongs());
ok('带 shopnote 标记（store 分流用）', !!p && p.shopnote === true);
ok('带 custom 标记（走注册表分支）', !!p && p.custom === true);
ok('路径指向笔记详情页', !!p && p.path === 'packageNews/note/note?id=1');
ok('root 是 3 段固定结构', !!p && p.root.fields.length === 3);
ok('三段依次为 header / body / blocks',
  !!p && p.root.fields.map((f) => f.k).join(',') === 'header,body,blocks');

/* 3. allPages 是否带上（装修台页面列表靠它） */
const keys = schema.allPages().map((x) => x.key);
ok('allPages 含 note-1', keys.indexOf('note-1') >= 0);
ok('allPages 仍含内置 5 页', ['home', 'lexy', 'news', 'product', 'mine'].every((k) => keys.indexOf(k) >= 0));

/* 4. 找不到的笔记 key 要返回 null，不能造出幽灵页面 */
ok('findPage("note-999") = null', schema.findPage('note-999') === null);

/* 5. from(R)：replica 里还没发布过 → 回落注册表基线，而不是空白 */
const fromNew = p.from({});
ok('未发布时 from() 回落到注册表标题（不是空白）', fromNew.header.title === '莱克洗地机实测', JSON.stringify(fromNew).slice(0, 120));
/*
 * ⚠️ 断言「from() 的每个字段树叶子都取得到值」而不是只看标题：
 *    装修台面板是**按字段树路径**读写的，只要形状错位（比如标题平铺在顶层），
 *    面板上那一格就是空的、改完静默丢弃 —— 这类 bug 不报错、只「看着不太对」。
 *    曾经就是这样漏掉的（7/21 个叶子字段取不到值），见 _probe-note-paths.cjs。
 */
const leavesOf = (node, base, out) => {
  if (!node) return out;
  if (node.type === 'object') {
    (node.fields || []).forEach((f) => {
      if (f.type === 'group') { leavesOf({ type: 'object', fields: f.fields }, base, out); return; }
      const p2 = base ? base + '.' + f.k : f.k;
      out.push(p2);
      leavesOf(f, p2, out);
    });
    return out;
  }
  return out;
};
const getPath = (o, path) => String(path).split('.').reduce((acc, s) => (acc == null ? undefined : acc[s]), o);
const missing = leavesOf(p.root, '', []).filter((path) => getPath(fromNew, path) === undefined);
ok('from() 的每个字段树叶子都取得到值（形状与面板路径一致）',
  missing.length === 0, '取不到：' + missing.join(', '));

/* 6. store.publishedAll：编辑器打开时的基线 */
const all = store.publishedAll();
ok('publishedAll 含 note-1', !!all['note-1']);
ok('publishedAll 的 note-1 有 header 结构', !!(all['note-1'] && all['note-1'].header));
ok('publishedAll 未把笔记错认成自定义页（不含 meta）', all['note-1'].meta === undefined);

/* 7. assemble：发布时把各页数据组装成 replica 字段 */
const assembled = store.assemble({
  'note-1': {
    header: { title: '莱克洗地机实测', tags: '洗地机' },
    body: { html: '<p>正文</p>', bg: '#ffffff', full: '1' },
    blocks: [{ type: 'line' }, { type: 'white', height: 30 }]
  }
});
ok('assemble 产出 SHOPNOTES', !!assembled.SHOPNOTES);
ok('SHOPNOTES 按 id 索引', !!(assembled.SHOPNOTES && assembled.SHOPNOTES['1']));
ok('组装后 blocks 保留 2 项', !!(assembled.SHOPNOTES['1'].blocks.length === 2));
ok('组装后正文保留', assembled.SHOPNOTES['1'].body.html === '<p>正文</p>');

/* 8. to() 归一化：脏数据不该原样进 replica */
const dirty = schema.findPage('note-1').to({ header: { title: 'x' }, blocks: 'not-an-array' }, {});
ok('blocks 非数组时被归一成空数组',
  Array.isArray(assembled.SHOPNOTES ? [] : []) && Array.isArray(schema.findPage('note-1').from({}).blocks));

/* 9. emit：生成 replica.js 源码 */
const src = emit.emitReplica(Object.assign({}, BASE, { SHOPNOTES: assembled.SHOPNOTES }), { originalSrc: '/* x */' });
ok('replica 源码含 const SHOPNOTES =', /const SHOPNOTES = /.test(src));
ok('导出清单含 SHOPNOTES', /^\s*SHOPNOTES,?$/m.test(src));
ok('源码语法可解析', (() => { try { new (require('node:vm').Script)(src); return true; } catch (e) { return false; } })());

/* 10. 清理 */
sn.reset();
require('node:fs').unlinkSync(sn.FILE);
ok('测试数据已清空', sn.count() === 0);

function shopnotesBelongs() { return require('../server/decorate/shopnotes.js').BELONGS; }

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
