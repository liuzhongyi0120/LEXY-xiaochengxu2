/**
 * 取证探针：**所有页面**的「字段树 ↔ 数据」对账
 *
 * 为什么要全页对账：装修台的属性面板按字段树拼路径读写（admin.js 的 joinPath / locate）。
 * 只要字段树写的是 `header.title` 而数据把标题放在 `data.title`，
 * 面板上那一格就是空的、改完被静默丢弃，且不报任何错 ——
 * 店铺笔记的「笔记头部」7 个字段就这么死过一轮（见 _probe-note-paths.cjs）。
 *
 * 只读：不改任何文件、不发请求。输出每个页面的「取不到的叶子」与「面板无入口的顶层键」。
 */
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const schema = require(ROOT + '/server/decorate/schema.js');
const shopnotes = require(ROOT + '/server/decorate/shopnotes.js');

/** data 里有、但字段树没有入口的键 —— 允许清单（每条都要写清为什么） */
const NO_PANEL_OK = {
  '*': ['publishedAt'], // 发布时间由系统在「生成代码」时写，刻意不给面板入口
};

function walk(node, base, out) {
  if (!node) return out;
  if (node.type === 'object') {
    (node.fields || []).forEach((f) => {
      if (f.type === 'group') { walk({ type: 'object', fields: f.fields }, base, out); return; }
      const p = base ? base + '.' + f.k : f.k;
      out.push({ path: p, type: f.type, label: f.label });
      walk(f, p, out);
    });
  }
  return out;
}
/**
 * 字段树根层「面板有入口」的键。
 * ⚠️ 必须把 type:'group' 摊平 —— 分组只是面板里的折叠块，它的成员字段**就在数据根层**
 *    （底部导航的「配色」分组就是这种：color / selectedColor / background / borderColor
 *     四个键直接住在 data 顶层）。不摊平就会把它们误报成「面板无入口」。
 */
function rootKeys(node) {
  const out = [];
  (node.fields || []).forEach((f) => {
    if (f.type === 'group') { out.push(...rootKeys({ fields: f.fields })); return; }
    out.push(f.k);
  });
  return out;
}
const getPath = (o, p) => String(p).split('.').reduce((a, s) => (a == null ? undefined : a[s]), o);

let R = {};
try { R = require(ROOT + '/miniprogram/config/replica.js'); } catch (e) { /* 可能还没有 */ }

let totals = { pages: 0, leaves: 0, dead: 0, noPanel: 0 };
schema.allPages().forEach((p) => {
  let data;
  try { data = p.from(R); } catch (e) { console.log('✗ ' + p.key + ' from() 抛异常: ' + e.message); return; }
  const leaves = walk(p.root, '', []);
  const dead = leaves.filter((lf) => getPath(data, lf.path) === undefined);
  const topKeys = rootKeys(p.root);
  const allow = NO_PANEL_OK['*'];
  const noPanel = Object.keys(data || {}).filter((k) => topKeys.indexOf(k) < 0 && allow.indexOf(k) < 0);

  totals.pages++;
  totals.leaves += leaves.length;
  totals.dead += dead.length;
  totals.noPanel += noPanel.length;

  const flag = (dead.length || noPanel.length) ? '✗' : '✓';
  console.log(flag + ' ' + String(p.key).padEnd(22) +
    (p.shopnote ? '[笔记]' : p.custom ? '[自定义]' : '[内置]') +
    '  叶子 ' + String(leaves.length).padStart(3) + '，取不到 ' + dead.length);
  if (dead.length) console.log('    取不到：' + dead.map((x) => x.path + '(' + x.type + ')').join(', '));
  if (noPanel.length) console.log('    面板无入口：' + noPanel.join(', '));
});

console.log('\n合计：页面 ' + totals.pages + '，叶子 ' + totals.leaves +
  '，取不到 ' + totals.dead + '，面板无入口 ' + totals.noPanel);
console.log('（笔记注册表里当前有 ' + shopnotes.count() + ' 条笔记）');
process.exit(totals.dead || totals.noPanel ? 1 : 0);
