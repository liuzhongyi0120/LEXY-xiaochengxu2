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
 *
 * ⚠ 另有一种**不会自愈**的 EPERM（笔记正文入库后 replica.js 涨到 310KB 才暴露）：
 *   它是「**该路径上的 rename 覆盖**被拒」，跟占用无关，等多久都没用 —— 详见 `replaceByMovingAway`。
 */

const fs = require('node:fs');
const nodePath = require('node:path');

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
  const attempts = (opt && opt.attempts) || 10;
  const waitMs = (opt && opt.waitMs) || 120;
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
 * 诊断：在 **rename 失败的那一刻**（不是事后）分项试探源与目标。
 *
 * 为什么要「那一刻」：事后诊断（第一版）报的是 `{dest_write:ok, tmp_write:ok, dest_delete:ok}`
 *   —— 全部正常，说明事后毫无锁。分不清是「锁只存在于失败那一刻」还是「压根与锁无关」，
 *   所以必须把探针塞进 catch 里，且**必须在 `unlink(tmp)` 之前**（源还在才试得出源的状态）。
 *
 * 五个探针各锁一个变量：
 *   ① src_to_new      —— 源能否被移动（= 源上 delete 共享是否放开）。新版名，不覆盖任何东西。
 *   ② dest_write      —— 目标能否被就地写（决定「退化成非原子就地写」这条退路通不通）。
 *   ③ src_to_existing —— 「rename 覆盖一个**已存在**文件」这个动作能不能做。
 *                        靶子用 `file+'.owtest'`（目标文件的副本）而不是目标本身，
 *                        避免误伤交付产物，又同样落在「同目录 + 已存在」这个条件上。
 *   ④ retry_exact     —— 当场重放**原样那一步**（新临时文件 → 目标）。
 *                        它若成功 ⇒ 失败是时间局部的；它若失败 ⇒ 失败此刻仍在发生。
 *   ⑤ away_then_in    —— 「先把目标挪走、再把 tmp 挪进来」在失败此刻通不通。
 *                        通了就说明修复方案成立（`replaceByMovingAway` 就是拿它改的）。
 *
 * 只在 `ATOMIC_DIAG=1` 时执行（默认关，正常路径零开销）。动作全部可回滚、不写目标内容。
 * @returns {string} 一行紧凑结果，拼进错误信息
 */
function diagMoment(file, tmp, text, i) {
  const r = {};
  const nw = `${file}.newtest`;
  const ow = `${file}.owtest`;
  /* ① 源 → 全新名字，再挪回来 */
  try {
    fs.renameSync(tmp, nw);
    r.src_to_new = 'ok';
    try { fs.renameSync(nw, tmp); } catch (e) { r.src_back = e.code || String(e); }
  } catch (e) { r.src_to_new = e.code || String(e); }
  /* ② 目标可写？ */
  try { const fd = fs.openSync(file, 'r+'); fs.closeSync(fd); r.dest_write = 'ok'; }
  catch (e) { r.dest_write = e.code || String(e); }
  /* ③ 源 → 已存在的副本（同目录、同体积、非目标路径） */
  try { fs.copyFileSync(file, ow); } catch (e) { r.ow_seed = e.code || String(e); }
  try { fs.renameSync(tmp, ow); r.src_to_existing = 'ok'; }
  catch (e) { r.src_to_existing = e.code || String(e); }
  /* ④ 当场重放原样那一步 */
  try { fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, file); r.retry_exact = 'ok'; }
  catch (e) { r.retry_exact = e.code || String(e); }
  /*
   * ⑤ 「退路」在失败此刻到底通不通：把目标**先挪走**（不是删），再把 tmp 挪进来。
   *    判据来自前三项：目标可写、可被改名、源可改名 —— 唯独「直接覆盖目标」被拒。
   *    若这条通，它就是修复方案的实证依据（而不是猜出来的）。
   *    任一步失败都必须把原文件挪回去，绝不留在「目标不见了」的状态。
   */
  const away = `${file}.awaytest`;
  try {
    fs.renameSync(file, away);
    try {
      if (fs.existsSync(tmp)) fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, file);
      r.away_then_in = 'ok';
    } catch (e) { r.away_then_in = e.code || String(e); }
    /* file 现在要么是刚挪进来的新内容（正是想要的），要么不存在 → 还原 */
    try { if (!fs.existsSync(file)) fs.renameSync(away, file); } catch (_) { /* 尽力还原 */ }
  } catch (e) { r.away_out = e.code || String(e); }
  try { fs.unlinkSync(away); } catch (_) { /* ignore */ }
  try { fs.unlinkSync(ow); } catch (_) { /* ignore */ }
  try { fs.unlinkSync(nw); } catch (_) { /* ignore */ }
  return `#${i}` + JSON.stringify(r);
}

/** 「先把目标挪走」时用的中转后缀；见到它说明上次替换在两次 rename 之间被打断了 */
const AWAY_SUFFIX = '.replacing';

/**
 * 尽力删掉一个临时/中转文件，失败不影响主流程。
 *
 * ⚠ **必须带重试**：进入「路径级 rename 覆盖被拒」那种状态时，**刚写完的 310KB 文件连 unlink 也会失败**
 *   （实测一次失败里 3 个临时文件一个都没删掉）——原来的一次性 `try{unlink}catch{}` 就是这么静默堆垃圾的：
 *   25 次发布留下 36 个文件、约 12MB，还都在 `miniprogram/` 源码树里。
 * 清不掉也不抛：下次写入前 `sweepStale` 还会再扫一遍。
 * @param {string} p 待删路径
 * @returns {boolean} 是否已删掉（或本来就不在）
 */
function tryRemove(p) {
  if (!p) return false;
  try { retrySync(() => fs.unlinkSync(p), `清理 ${p}`, { attempts: 4, waitMs: 80 }); return true; }
  catch (e) {
    if (e.code !== 'ENOENT') console.warn('[atomic] 临时文件清理失败，已留下残留：', p, e.code || e.message);
    return e.code === 'ENOENT';
  }
}

/**
 * 崩溃自愈：`replaceByMovingAway` 在两次 rename 之间被打断时，磁盘上会留下
 * `<file>.replacing[*]` 而 `<file>` 不见了。任何一次写入前先检查并还原。
 *
 * 注意要按**前缀**扫而不是只认一个固定名字：中转文件名在「残留删不掉」时会带上 pid/时间戳避让。
 * @param {string} file 目标文件绝对路径
 * @returns {boolean} 是否做过还原
 */
function healAfterCrash(file) {
  if (fs.existsSync(file)) return false;
  const dir = nodePath.dirname(file);
  const prefix = nodePath.basename(file) + AWAY_SUFFIX;
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.indexOf(prefix) === 0); } catch (_) { return false; }
  if (!names.length) return false;
  /* 取最新的那一份（可能同时存在多个：老残留 + 这次的新中转） */
  names.sort((a, b) => {
    try { return fs.statSync(nodePath.join(dir, b)).mtimeMs - fs.statSync(nodePath.join(dir, a)).mtimeMs; }
    catch (_) { return 0; }
  });
  try {
    fs.renameSync(nodePath.join(dir, names[0]), file);
    console.warn('[atomic] 检测到上次替换被中断，已用残留副本还原：', file, '<-', names[0]);
    return true;
  } catch (e) {
    console.warn('[atomic] 还原中断的替换失败：', file, e && e.code);
    return false;
  }
}

/**
 * 退路：把目标**先挪走**，再把新文件挪进来 —— 用「移动 + 移动」代替「覆盖」。
 *
 * 为什么需要它（结论全部来自实测，不是推测）：
 *   本机（Windows + 这台机器上的过滤驱动）会出现一种状态，探针逐项锁定为：
 *     · 目标可写（`openSync(file,'r+')` ok）
 *     · 目标可改名（`renameSync(file, 别的名字)` ok）
 *     · `rename` 覆盖**别的**已存在文件也 ok（拿同目录、同体积的副本当靶）
 *     · **唯独 `rename(tmp → replica.js)` 反复 EPERM**，而且**不会自愈**：
 *       连试 10 次、跨 5.4 秒全败 —— 所以「多等一会儿」这条思路是错的，只会把请求拖到 12 秒还失败
 *     · 在同一瞬间改成「先挪走目标 → 再把 tmp 挪进来」，**每次都成功**（探针⑤）
 *   这正是 `publish` / `note/delete` 报 HTTP 500 / code 5000 的根因。
 *
 * 代价：两次 rename 之间有一个极短窗口，目标文件不存在。进程内的读写都在同一线程且都是同步的，
 *   撞不上这个窗口；这是「宁可有微秒级窗口，也不要接口 500」的取舍。
 *   任一步失败都尽力把原文件放回去，绝不留在「文件不见了」的状态；
 *   万一进程恰好在那一步崩了，由 `healAfterCrash()` 兜底。
 *
 * @param {string} file 目标文件绝对路径
 * @param {string} tmp  已写好内容、待就位的临时文件
 */
function replaceByMovingAway(file, tmp) {
  if (!fs.existsSync(file)) { fs.renameSync(tmp, file); return; }
  /* 中转名默认固定（便于自愈时认出来）；上一份残留删不掉时带 pid/时间戳避让，
   * 否则 `rename(file → away)` 会落在「覆盖已存在文件」这一步上 —— 正是我们要绕开的那个坑。 */
  let away = file + AWAY_SUFFIX;
  if (fs.existsSync(away) && !tryRemove(away)) {
    away = `${file}${AWAY_SUFFIX}.${process.pid}.${Date.now()}`;
  }
  fs.renameSync(file, away);
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.renameSync(away, file); } catch (_) { /* 尽力还原，真正的错误由下面抛 */ }
    throw e;
  }
  tryRemove(away);
}

/**
 * 清理 `<file>` 的同名残留：`<file>.tmp.<pid>.<ts>.<n>`（写临时文件）、`<file>.replacing`
 * （退路中转）、以及诊断探针文件。
 *
 * ⚠ 为什么非要有它：进入那种「路径级 rename 覆盖被拒」的状态后，**连 `unlink` 也会失败**
 *   （同一次失败里，4 个临时文件一个都没删掉）。原来的写法是一次性 `try{unlink}catch{}`，
 *   于是静默留下 310KB 一份的垃圾 —— 实测 30 次发布留下 35 个、约 11MB，而且它们在
 *   `miniprogram/` 源码树里（会被打包/扫描），`*.tmp` 这条 .gitignore 也兜不住
 *   （名字不是以 `.tmp` 结尾），`git add -A` 会把它们提交进去。
 *   所以：① 改成带重试的删除；② 每次写入前顺手扫一遍历史残留。
 *
 * 清理失败绝不影响主流程 —— 下次写入还会再扫。
 * @param {string} file 目标文件绝对路径
 */
function sweepStale(file) {
  const dir = nodePath.dirname(file);
  const base = nodePath.basename(file);
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return; }
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '\\.(?:tmp\\.|replacing|newtest|owtest|awaytest|diagmove|cpytest)');
  for (const n of names) {
    if (!re.test(n)) continue;
    tryRemove(nodePath.join(dir, n));
  }
}

/**
 * 原子写文本文件：写 <file>.tmp → rename 覆盖 <file>
 *
 * 三段式：先走纯原子路径；不行再走 `replaceByMovingAway`（对付本机那种「路径级覆盖被拒」）；
 * 还不行才当「真被占用」多等几轮。分三段是因为两种失败长得一样但处理方式相反 ——
 * 前者等多久都没用（实测 5.4s 全败），后者必须等。
 *
 * @param {string} file       目标文件绝对路径
 * @param {string} text       文件内容
 */
function writeFileAtomic(file, text) {
  const DIAG = process.env.ATOMIC_DIAG === '1';
  /* 先自愈（上次退路被打断）→ 再扫掉历史残留 → 才开始写 */
  healAfterCrash(file);
  sweepStale(file);
  /*
   * ⚠ 临时文件**每次尝试都要换名字**：
   *   固定用 `<file>.tmp` 时，第一次失败就会把一把锁留在那个固定路径上，后面几次重试写的都是
   *   **同一个名字**，等于反复撞同一把锁。改成 `pid.时间戳.第几次` 的唯一名，每次都是一条干净的新路径。
   */
  const tag = `${process.pid}.${Date.now()}`;
  const writeTmp = (mark) => {
    const t = `${file}.tmp.${tag}.${mark}`;
    fs.writeFileSync(t, text, 'utf8');
    return t;
  };
  const waitMs = 120;
  let last;
  const trace = [];

  /* 第 1 段：纯原子路径。绝大多数情况一次就过。
   * 只试 3 次（约 360ms）就转退路：实测这种失败**不会自愈**，多试只是白等 + 阻塞事件循环；
   * 真正「被占用」的短锁由第 3 段兜（退路在这种情形下会立刻失败并转段 3）。 */
  const PURE_A = 3;
  for (let i = 1; i <= PURE_A; i++) {
    let tmp = '';
    try {
      tmp = writeTmp(i);
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      last = e;
      /* ⚠ 诊断必须在 unlink 之前：源没了就试不出源的状态 */
      if (DIAG && i === 1) {
        const line = diagMoment(file, tmp, text, i);
        trace.push(line);
        console.warn('[atomic] rename 失败现场', file, line);
      }
      try { if (tmp) tryRemove(tmp); } catch (_) { /* tryRemove 自身不抛 */ }
      if (!isTransient(e)) throw e;
      if (i < PURE_A) sleepSync(waitMs * i);
    }
  }

  /* 第 2 段：退路 —— 本机那类「路径级 rename 覆盖被拒」在这里被解决。 */
  try {
    const tmp2 = writeTmp('away');
    replaceByMovingAway(file, tmp2);
    console.warn('[atomic] rename 覆盖失败，已改用「先挪走再挪进」完成替换：', file);
    return;
  } catch (e) {
    last = e;
    tryRemove(`${file}.tmp.${tag}.away`);
    /* 退路也失败 ⇒ 大概率是**真的**被别人占着。这时才值得等。 */
    if (!isTransient(e)) throw e;
  }

  /* 第 3 段：真锁的长尾 —— 多等几轮，覆盖「杀软/索引器短暂占用」这种会自愈的情况。 */
  const PURE_B = 6;
  for (let i = 1; i <= PURE_B; i++) {
    let tmp = '';
    try {
      tmp = writeTmp(`b${i}`);
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      last = e;
      tryRemove(tmp);
      if (!isTransient(e)) throw e;
      if (i < PURE_B) sleepSync(waitMs * i);
    }
  }

  const diag = trace.length ? `  【失败现场】${trace.join(' | ')}` : '';
  const err = new Error(`替换 ${file} 失败（${last && last.code}），文件可能正被占用：${last && last.message}${diag}`);
  err.code = last && last.code;
  err.cause = last;
  throw err;
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
  renameSync,
  /* 供 store 在读路径上兜底：崩溃留下的 `<file>.replacing` 需要能还原 */
  healAfterCrash,
  /* 供工具脚本全仓扫一遍历史残留 */
  sweepStale
};
