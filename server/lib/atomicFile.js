/**
 * 原子落盘唯一实现（写临时文件 + rename 替换）与「瞬态文件错误」重试
 *
 * 为什么需要这一层：
 *   数据文件（db.json / catalog.json / state.json / replica.js / 素材索引）都采用
 *   「写 .tmp 再 rename 覆盖」的原子写，避免进程中断留下半个文件。
 *   但在 Windows 上 rename / unlink 会**偶发**抛 EPERM / EACCES / EBUSY ——
 *   目标文件恰好被实时杀毒扫描、被编辑器打开、或上一轮的读句柄还没释放，
 *   都会瞬时占用。实测：连续 15 轮「上传素材 → 立刻删除」出现 1 次
 *   `EPERM: rename 'index.json.tmp' -> 'index.json'`。
 *
 *   这类失败**重试几十毫秒就成功**，但如果不处理，后果是「接口报成功、数据没落盘」：
 *   曾经 media.remove 把 unlink 的异常静默吞掉后照样删索引，导致运营以为素材已下架、
 *   磁盘上的文件和 /uploads/... 却都还在。写路径同理 —— 调用方以为订单状态存下了，
 *   重启后却回滚到旧值。所以凡原子写与删除**一律走这里**。
 *
 * 只对「可重试的瞬态错误」重试；ENOENT / 参数错误等语义错误直接向上抛，
 * 不做「什么都重试」的宽泛兜底（那会把真 bug 也盖住）。
 */

const fs = require('node:fs');

/** 判断是不是「等一会儿再试就好」的瞬态错误 */
const TRANSIENT_CODES = ['EPERM', 'EACCES', 'EBUSY'];
function isTransient(e) {
  return !!e && TRANSIENT_CODES.indexOf(e.code) >= 0;
}

/** 同步等待（Node 主线程可用；重试间隔用，量级几十毫秒，不阻塞其它请求的语义问题） */
function sleepSync(ms) {
  if (!(ms > 0)) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (e) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* 兜底忙等 */ }
  }
}

/**
 * 带重试地执行一个同步 fs 操作
 * @param {Function} fn        实际动作，抛错则按需重试
 * @param {string}   label     出错信息里的动作名（如 'rename db.json.tmp'）
 * @param {object}   [opt]     { attempts, waitMs }
 * @returns {*} fn 的返回值
 */
function retrySync(fn, label, opt) {
  const attempts = (opt && opt.attempts) || 6;
  const waitMs = (opt && opt.waitMs) || 40;
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return fn();
    } catch (e) {
      last = e;
      /* 非瞬态错误立即抛：语义错误重试没有意义，只会掩盖问题 */
      if (!isTransient(e)) throw e;
      if (i < attempts) sleepSync(waitMs * i);
    }
  }
  const err = new Error(`${label} 失败（${last.code}），文件可能正被占用，已重试 ${attempts} 次：${last.message}`);
  err.code = last.code;
  err.cause = last;
  throw err;
}

/**
 * 原子写文本文件：写 <file>.tmp → rename 覆盖 <file>
 * @param {string} file       目标文件绝对路径
 * @param {string} text       文件内容
 */
function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  retrySync(() => fs.writeFileSync(tmp, text, 'utf8'), `写 ${tmp}`);
  retrySync(() => fs.renameSync(tmp, file), `替换 ${file}`);
}

/** 带重试地删除文件；文件本来就不在时返回 false（由调用方决定这是否算正常） */
function unlinkSync(file) {
  try {
    retrySync(() => fs.unlinkSync(file), `删除 ${file}`);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

/** 带重试地重命名/移动文件（备份损坏文件、改名也用得上） */
function renameSync(from, to) {
  retrySync(() => fs.renameSync(from, to), `重命名 ${from} → ${to}`);
}

module.exports = {
  TRANSIENT_CODES,
  isTransient,
  sleepSync,
  retrySync,
  writeFileAtomic,
  unlinkSync,
  renameSync
};
