/**
 * 探针 v3：**unlink 刚写完的大文件**在独立进程里稳不稳
 *
 * 起因：服务端 publish 失败路径上，`fs.unlinkSync(tmp)`（310KB、刚写完）**也会失败** ——
 *   一次性调用失败，连 4 次重试（累计约 0.5s）也失败，于是每轮都往 `miniprogram/config/`
 *   里留下 310KB 垃圾（实测 25 次发布留 36 个、约 12MB）。
 * 这一版把变量压到最小：只做「写 tmp → unlink」，看独立进程会不会复现。
 *   A 组：写完立刻 unlink
 *   B 组：写完等 5ms 再 unlink
 *   C 组：写完 rename 到新名字（不覆盖任何东西）再 unlink
 *
 * 全 0 失败 ⇒ unlink 失败只发生在服务进程内（与 rename 失败同源），要在进程内继续挖；
 * 有失败  ⇒ 这是本机对「刚写完的大文件」普遍行为，应改成写临时文件到别处 / 加长重试。
 *
 * 跑法：node .tooling/_probe-unlink.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'miniprogram/config';
const SRC = path.join(DIR, 'replica.js');
const base = fs.readFileSync(SRC, 'utf8');
console.log(`基准内容 ${base.length} 字符（取自 ${SRC}）`);

function run(name, n, { sleepMs = 0, renameFirst = false } = {}) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const tmp = path.join(DIR, `_probe-unlink-${i}.tmp.js`);
    try {
      fs.writeFileSync(tmp, base, 'utf8');
      if (sleepMs) { const e = Date.now() + sleepMs; while (Date.now() < e) { /* 忙等，不引依赖 */ } }
      if (renameFirst) fs.renameSync(tmp, `${tmp}.moved`);
      fs.unlinkSync(renameFirst ? `${tmp}.moved` : tmp);
    } catch (e) {
      codes.push(`${e.code}`);
      for (const p of [tmp, `${tmp}.moved`]) { try { fs.unlinkSync(p); } catch (_) { /* ignore */ } }
    }
  }
  const fail = codes.length;
  console.log(`${name}  ${n - fail}/${n} 成功` + (fail ? `  ⚠ 失败 ${fail}  错误码 ${[...new Set(codes)].join(',')}` : '  ✓'));
  return fail;
}

const N = 40;
const f1 = run('A 写完立刻 unlink        ', N);
const f2 = run('B 写完等 5ms 再 unlink   ', N, { sleepMs: 5 });
const f3 = run('C 先后改名再 unlink      ', N, { renameFirst: true });

try {
  for (const f of fs.readdirSync(DIR)) if (/^_probe-unlink-/.test(f)) fs.unlinkSync(path.join(DIR, f));
} catch (_) { /* ignore */ }

console.log('');
console.log(f1 + f2 + f3 === 0
  ? '结论：独立进程里 unlink 全过 ⇒ 失败只在服务进程内发生，与 rename 失败同源'
  : '结论：独立进程也能复现 ⇒ 是本机对「刚写完的大文件」的普遍行为');
process.exit(f1 + f2 + f3 > 0 ? 1 : 0);
