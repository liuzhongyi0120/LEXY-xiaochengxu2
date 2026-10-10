/**
 * 把 UC_DEFAULT_BLOCKS 以 emit.js 的同一字面量格式（jsExpr）写入 replica.js。
 *
 * 幂等：缺常量就插入、已有常量就**整体替换**（默认规格改了要能重灌，
 * 否则「改了 yzUserCenter.js 但 replica 还是老默认值」会一直错下去，
 * 而且因为发布器是从 replica 读的，装修台看到的也是老值）。
 * 替换用的是括号配平扫描而不是正则 —— 区块数据里有中文文案，正则很容易切错。
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { jsExpr } = require(path.join(root, 'server/decorate/emit.js'));
const { UC_DEFAULT_BLOCKS } = require(path.join(root, 'server/decorate/yzUserCenter.js'));

const file = path.join(root, 'miniprogram/config/replica.js');
let src = fs.readFileSync(file, 'utf8');
const literal = 'const MINE_BLOCKS = ' + jsExpr(UC_DEFAULT_BLOCKS) + ';';

if (src.includes('const MINE_BLOCKS = ')) {
  /* ---- 已存在：定位 `const MINE_BLOCKS = [` … 配对的 `];` 后整体替换 ---- */
  const start = src.indexOf('const MINE_BLOCKS = ');
  let i = src.indexOf('[', start);
  let depth = 0, quote = null, esc = false, end = -1;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('MINE_BLOCKS 的数组括号不配平，先人工检查');
  const afterSemi = src[end + 1] === ';' ? end + 2 : end + 1;
  src = src.slice(0, start) + literal + src.slice(afterSemi);
  console.log('已替换 MINE_BLOCKS 常量，区块数 =', UC_DEFAULT_BLOCKS.length);
} else {
  const marker = '/** ---------------- 莱克（产品系列） ---------------- */';
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('找不到插入锚点（莱克段注释）');
  const seg =
    '/** ---------------- 我的（个人中心） ---------------- */\n' +
    '/** 区块类型比首页多 5 种个人中心专属区块 + 4 种个人中心独有组件（见 server/decorate/yzUserCenter.js） */\n' +
    literal + '\n\n';
  src = src.slice(0, idx) + seg + src.slice(idx);
  console.log('已插入 MINE_BLOCKS 常量，区块数 =', UC_DEFAULT_BLOCKS.length);
}

if (/^\s*MINE_BLOCKS,\s*$/m.test(src)) {
  console.log('module.exports 已含 MINE_BLOCKS，跳过');
} else {
  const before = src;
  src = src.replace(/^(\s*)HOME_BLOCKS,\s*$/m, '$1HOME_BLOCKS,\n$1MINE_BLOCKS,');
  if (src === before) throw new Error('module.exports 里找不到 HOME_BLOCKS, 行');
  console.log('已把 MINE_BLOCKS 加入 module.exports');
}

fs.writeFileSync(file, src, 'utf8');
console.log('写入完成，字节数 =', Buffer.byteLength(src));
