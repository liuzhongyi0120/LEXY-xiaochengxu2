/**
 * 探针：`rename 覆盖已存在文件` 在本机到底稳不稳
 *
 * 背景：publish 报 `EPERM: rename 'replica.js.tmp.*' -> 'replica.js'`。
 *   上一轮我把它归因成「固定临时文件名上留了锁」，改成唯一临时名后**照样发作**（15 次里 3 次），
 *   → 那个归因是错的。真实失败点是 **rename 的目标 `replica.js`**（临时文件 writeFileSync 是成功的）。
 *
 * 这个探针要把因果分清（三选一）：
 *   (a) 本机普遍现象 —— 同目录任何「覆盖已存在文件」都偶发 EPERM（杀软/索引器扫大文件）
 *   (b) replica.js 这个文件**具体**被谁占着
 *   (c) 只有服务在跑/被读的时候才发作
 *
 * 做法：同目录三组，各 30 次「写 tmp → rename 覆盖」：
 *   ① 1KB 小文件  ② 310KB（replica.js 同体积副本）  ③ 真目标 replica.js（回写**等长同内容**）
 * 顺序有讲究：真目标放最后 —— 先证明「普遍现象」是否存在，再决定要不要碰真文件。
 * 收尾校验 replica.js 的 sha256 未变（等长同内容回写不该改变哈希）。
 *
 * 跑法：node .tooling/_probe-rename.mjs    （服务可开可关，两种都跑一遍对比）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'miniprogram/config';
const REAL = path.join(DIR, 'replica.js');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

const before = fs.readFileSync(REAL, 'utf8');
console.log(`replica.js  ${before.length} 字符  sha=${sha(before)}`);

const small = { file: path.join(DIR, '_probe-small.js'), text: '// probe\n' + 'x'.repeat(1000) };
const big = { file: path.join(DIR, '_probe-big.js'), text: before };

/** 连做 n 次「写 tmp → rename 覆盖 file」，返回失败次数 */
function stress(name, file, text, n) {
  let ok = 0;
  const codes = [];
  for (let i = 0; i < n; i++) {
    const tmp = `${file}.tmp.probe.${i}`;
    try {
      fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, file);
      ok++;
    } catch (e) {
      codes.push(`${e.code}/${e.errno}`);
      try { fs.unlinkSync(tmp); } catch (_) { /* 清不掉就算了 */ }
    }
  }
  const fail = n - ok;
  console.log(`${name}  成功 ${ok}/${n}` + (fail ? `  ⚠ 失败 ${fail}  错误码: ${[...new Set(codes)].join(',')}` : '  ✓'));
  return fail;
}

// 先把两个探针目标「建出来」，让第一次也是「覆盖」而不是「新建」
fs.writeFileSync(small.file, 'seed\n', 'utf8');
fs.writeFileSync(big.file, 'seed\n', 'utf8');

const N = 30;
const f1 = stress('① 小文件覆盖 1KB           ', small.file, small.text, N);
const f2 = stress('② 大文件覆盖 310KB(副本)   ', big.file, big.text, N);
const f3 = stress('③ 真目标 replica.js 同内容 ', REAL, fs.readFileSync(REAL, 'utf8'), N);

// 清理探针文件
for (const f of [small.file, big.file]) { try { fs.unlinkSync(f); } catch (_) { /* ignore */ } }
try { for (const f of fs.readdirSync(DIR)) if (/^_probe-|\.tmp\.probe\./.test(f)) fs.unlinkSync(path.join(DIR, f)); } catch (_) { /* ignore */ }

const after = fs.readFileSync(REAL, 'utf8');
console.log(`收尾 replica.js ${after.length} 字符 sha=${sha(after)}  ${sha(after) === sha(before) ? '✓ 未被改坏' : '✗ 内容变了！'}`);
console.log(`结论提示：①>0 → 本机普遍现象；仅③>0 → replica.js 被具体占用；全 0 → 需要服务在跑时才发作`);
process.exit(f1 + f2 + f3 > 0 ? 1 : 0);
