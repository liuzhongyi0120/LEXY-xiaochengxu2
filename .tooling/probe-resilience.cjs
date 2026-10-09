/**
 * 持久化层韧性探针
 *
 * 目的：验证「文件内容是合法 JSON 但不是对象」时（如 null / 123 / "abc" / []），
 *       三处存储层能否**备份原文件 + 重建**，而不是抛 TypeError 之后永久崩掉。
 *
 * 为什么单独写脚本而不是塞进 check-all：
 *   它必须真的去篡改 server/data 下的数据文件，属于破坏性验证。
 *   本脚本全程「先备份 → 篡改 → 断言 → 无条件复原 → 清理 .broken」，
 *   并在结束时用哈希校验确认数据与开始前逐字节一致。
 *
 * 用法：node .tooling/probe-resilience.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'server', 'data');

const TARGETS = [
  { name: 'db.json', file: path.join(DATA, 'db.json'), mod: 'server/lib/store.js', how: 'get' },
  { name: 'catalog.json', file: path.join(DATA, 'catalog.json'), mod: 'server/lib/catalogStore.js', how: 'get' },
  { name: 'custom-pages.json', file: path.join(DATA, 'decorate', 'custom-pages.json'), mod: 'server/decorate/customPages.js', how: 'list' }
];

const BAD = ['null', '123', '"abc"', '[]', '{"seq":"x","pages":"nope"}'];

let pass = 0;
let fail = 0;
const hash = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

function ok(label, extra) {
  pass++;
  console.log(`  ✓ ${label}${extra ? '  ' + extra : ''}`);
}
function bad(label, extra) {
  fail++;
  console.log(`  ✗ ${label}${extra ? '  ' + extra : ''}`);
}

/* ---------------- 备份 ---------------- */
const backups = new Map();
TARGETS.forEach((t) => {
  if (fs.existsSync(t.file)) backups.set(t.file, fs.readFileSync(t.file));
});
console.log(`\n已备份 ${backups.size} 个数据文件\n`);

/** 复原所有数据文件，并清掉本次产生的 .broken / .tmp */
function restore(before) {
  backups.forEach((buf, file) => fs.writeFileSync(file, buf));
  fs.readdirSync(DATA).forEach((f) => {
    if (/\.broken\.\d+$/.test(f)) {
      const stamp = Number(f.split('.').pop());
      if (stamp >= before) fs.unlinkSync(path.join(DATA, f));
    }
  });
  const deco = path.join(DATA, 'decorate');
  if (fs.existsSync(deco)) {
    fs.readdirSync(deco).forEach((f) => {
      if (/\.(broken\.\d+|tmp)$/.test(f)) {
        const stamp = Number((f.match(/\d+$/) || [0])[0]);
        if (!stamp || stamp >= before) fs.unlinkSync(path.join(deco, f));
      }
    });
  }
}

const startStamp = Date.now();

/* ---------------- 逐文件、逐坏形态验证 ---------------- */
TARGETS.forEach((t) => {
  console.log(`── ${t.name} ──`);
  BAD.forEach((raw) => {
    fs.writeFileSync(t.file, raw, 'utf8');
    // 每个用例都要在新的模块缓存里跑（否则复用上一次的内存副本，测不到 load()）
    Object.keys(require.cache).forEach((k) => delete require.cache[k]);
    let threw = null;
    try {
      const m = require(path.join(ROOT, t.mod));
      if (t.how === 'get') m.get();
      else m.list();
    } catch (e) {
      threw = e;
    }
    if (threw) {
      bad(`${t.name} 内容为 ${raw} 时不抛异常`, `→ ${threw.constructor.name}: ${threw.message.slice(0, 60)}`);
    } else {
      ok(`${t.name} 内容为 ${raw} 时可自愈（备份 + 重建）`);
    }
  });
  console.log('');
});

/* 值本身没坏、只是缺字段：不应被误判为损坏 */
console.log('── 缺字段/多余字段不应误判为损坏 ──');
TARGETS.forEach((t) => {
  const base = JSON.parse(backups.get(t.file).toString('utf8'));
  base.__extraField = 'unknown-but-harmless';
  fs.writeFileSync(t.file, JSON.stringify(base), 'utf8');
  Object.keys(require.cache).forEach((k) => delete require.cache[k]);
  let threw = null;
  try {
    const m = require(path.join(ROOT, t.mod));
    if (t.how === 'get') m.get();
    else m.list();
  } catch (e) {
    threw = e;
  }
  if (threw) bad(`${t.name} 缺字段/多余字段不误判`, `→ ${threw.message.slice(0, 60)}`);
  else ok(`${t.name} 缺字段/多余字段不误判为损坏（未被重建）`);
});
console.log('');

/* ---------------- 无条件复原 ---------------- */
restore(startStamp);

/* ---------------- 逐字节校验 ---------------- */
console.log('── 复原校验 ──');
let allSame = true;
backups.forEach((buf, file) => {
  const same = fs.existsSync(file) && hash(file) === crypto.createHash('md5').update(buf).digest('hex');
  if (!same) allSame = false;
  console.log(`  ${same ? '✓' : '✗'} ${path.relative(ROOT, file)} 与开始前逐字节一致`);
  if (!same) fail++;
});
const leftovers = [];
['', 'decorate'].forEach((d) => {
  fs.readdirSync(path.join(DATA, d)).forEach((f) => {
    if (!/\.broken\.\d+$/.test(f)) return;
    // 只看本次运行产生的：历史上真正的损坏备份（如 db.json.broken.1791420591380）
    // 是有意保留的证据，不该被算作残留
    const stamp = Number(f.split('.').pop());
    if (stamp >= startStamp) leftovers.push(path.join(d, f));
  });
});
if (leftovers.length) {
  allSame = false;
  fail++;
  console.log(`  ✗ 残留 .broken 文件：${leftovers.join(', ')}`);
} else {
  console.log('  ✓ 无本次产生的 .broken / .tmp 残留');
}

console.log(`\n${'─'.repeat(40)}`);
console.log(`${pass}/${pass + fail} 通过`);
process.exit(fail === 0 ? 0 : 1);
