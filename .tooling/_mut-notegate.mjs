/**
 * 「改坏验判别力」· 笔记「生成代码」门（2026-10-15）
 *
 * 用法：node .tooling/_mut-notegate.mjs apply <1|2|3>  /  restore  /  status
 *
 *  1 把门整个拆掉（退回有 bug 的那版）    → 期望红：静态门 + 运行时「不会把 A 一起下发」
 *  2 修过头：一律跳过所有笔记            → 期望红：静态门 + 「B 确实进了产物」+「B 不许被抹掉」
 *  3 只在 id 归一上出错（不加 String()） → 期望红：静态门 + 同 2（拿 Number 去 has 字符串集合）
 *
 * ⚠️ 备份只覆盖 server/decorate/store.js，且**用完请立刻 remove 备份目录**：
 *    备份是对「当时的文件」拍的快照，留着它会让之后新写的代码在 restore 时被一起吃掉
 *    （2026-10-15 就踩过一次：assemble 的修复被早先拍的备份覆盖）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TARGET = join(ROOT, 'server/decorate/store.js');
const BAK = join(__dirname, '_mut-notegate-bak', 'store.js');

const FILTER = "    if (p.shopnote && p.key !== keepKey &&\n" +
  "        !generatedNoteIds.has(String(shopnotes.idOfKey(p.key)))) return;";

const CUSTOM_BRANCH = "    } else if (p.custom) {\n" +
  "      if (p.key !== keepKey && !liveCustomKeys.has(p.key)) return;\n" +
  "    }\n";

const MUTS = {
  1: { from: FILTER, to: '    /* 门已被拆掉（改坏验判别力） */', why: '把「生成代码」门整个拆掉' },
  2: {
    from: '!generatedNoteIds.has(String(shopnotes.idOfKey(p.key)))',
    to: 'true', why: '修过头：一律跳过所有笔记'
  },
  3: {
    from: 'generatedNoteIds.has(String(shopnotes.idOfKey(p.key)))',
    to: 'generatedNoteIds.has(shopnotes.idOfKey(p.key))', why: '笔记 id 不做字符串归一'
  },
  4: { from: CUSTOM_BRANCH, to: '    }\n', why: '自定义页那半边门拆掉' },
  5: {
    from: '!liveCustomKeys.has(p.key)', to: 'true',
    why: '修过头：一律跳过所有自定义页'
  },
  6: {
    from: "writeReplica(publishedAll(), newKey, { keepKey: wasLive ? newKey : '' });",
    to: 'writeReplica(publishedAll(), newKey);',
    why: '改名时不传 keepKey（已发布的自定义页改名后会从 replica 里消失）'
  }
};

const mode = process.argv[2] || 'status';
const id = process.argv[3];

if (mode === 'apply') {
  const m = MUTS[id];
  if (!m) { console.log('✗ 未知编号 ' + id); process.exit(1); }
  if (!existsSync(BAK)) { mkdirSync(join(__dirname, '_mut-notegate-bak'), { recursive: true }); writeFileSync(BAK, readFileSync(TARGET)); }
  const src = readFileSync(TARGET, 'utf8');
  const n = src.split(m.from).length - 1;
  if (n !== 1) { console.log(`✗ 锚点命中 ${n} 次（要求 1），不改：${m.why}`); process.exit(1); }
  writeFileSync(TARGET, src.replace(m.from, m.to));
  console.log(`✓ 已改坏【${id}】${m.why}　→ 后端改动，跑运行时断言前要重启后端`);
} else if (mode === 'restore') {
  if (existsSync(BAK)) {
    writeFileSync(TARGET, readFileSync(BAK));
    rmSync(join(__dirname, '_mut-notegate-bak'), { recursive: true, force: true });
    console.log('✓ 已逐字节还原，并删除备份目录（防止吃掉之后的改动）');
  } else console.log('（没有备份可还原）');
} else {
  console.log(existsSync(BAK) ? '⚠️ 备份还在，说明上次没还原干净' : '✓ 无备份残留');
  console.log('  门在文件里吗 = ' + (readFileSync(TARGET, 'utf8').indexOf('generatedNoteIds.has(String(') >= 0));
}
