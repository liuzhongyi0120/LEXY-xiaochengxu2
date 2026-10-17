/**
 * 后台管理员成员（账号）注册表。
 *
 * 背景（为什么要有这个文件）：
 *   在此之前，后台**没有「人」的概念** —— 能登录的只有两种东西：
 *     · `ADMIN_PASSWORD` 一个共享口令（登录即 owner）；
 *     · `ADMIN_TOKENS` 若干条长期令牌（写在环境变量里，给不同角色）。
 *   两者都要改 `.env` 并重启服务，于是现实里只剩一个共享 owner 口令：
 *   谁离职了不知道、谁改了什么查不到、想给运营开个「只能改商品」的号也无从下手。
 *   控制台左侧导航的「成员管理」就是补这一块：把「谁能进后台、各是什么角色」
 *   变成后台里能看、能改的数据。
 *
 * 设计要点：
 *   1. **口令只存哈希**（scrypt + 每账号独立随机盐，Node 自带 `crypto`，零三方依赖）。
 *      落盘文件里绝无明文口令；出接口时连哈希一起丢掉（见 `pub()`）——
 *      后台页面只需要知道「这个号有没有设过口令」，不需要知道口令是什么。
 *   2. **不能让最后一个 owner 消失**。删号 / 禁用 / 降级三条路都要拦：
 *      任何一条漏了，得到的都是「后台还在跑、但没人能登录」这种要连服务器改文件的故障。
 *   3. **与既有的两套凭证并存，不替代**。`ADMIN_PASSWORD` 与 `ADMIN_TOKENS` 继续有效 ——
 *      它们是「服务器救援通道」：成员表被改坏、全员口令忘了，还能用环境变量进去修。
 *      因此本模块**不**接管 `configured()` 的唯一判定，只作为第三个来源加进去。
 *   4. 用户名按**小写归一**比较。否则 `Admin` 与 `admin` 会被当成两个人各建一个号，
 *      而运营在登录框里输哪个全凭记忆。
 *
 * 存储：server/data/admin/members.json
 *   {
 *     seq: 2,
 *     members: [{
 *       id, username, name, role, enabled,
 *       pwd: { algo:'scrypt', N, r, p, salt, hash },
 *       createdAt, updatedAt, lastLoginAt
 *     }]
 *   }
 *
 * ⚠️ `load()` 只对「文件损坏」做备份重建；其它异常（IO、代码 bug）一律向上抛 ——
 *    绝不能因为一次意外就把能登录的账号全清空。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const nodePath = require('node:path');
const util = require('./util');
const atomic = require('./atomicFile');
const dataDir = require('./dataDir');
const { BizError, ERR } = require('./http');

const DIR = nodePath.join(dataDir.ROOT, 'admin');
const FILE = nodePath.join(DIR, 'members.json');

/** 角色取值（与 lib/adminAuth 的 ROLE_RANK 一一对应，这里只做合法性判断） */
const ROLES = ['viewer', 'operator', 'owner'];
const ROLE_LABEL = { viewer: '只读', operator: '运营', owner: '超级管理员' };

/** 账号：字母数字与 . _ - @，3~32 位。刻意不允许空格与中文 —— 登录框里少一类输错。 */
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,32}$/;
/** 口令长度口径（本项目自定，非照抄有赞）：下限 8 位挡住「123456」，上限 64 位挡住超长耗 CPU */
const PWD_MIN = 8;
const PWD_MAX = 64;
/** 姓名（备注名）长度 */
const NAME_MAX = 20;
/** 成员数量上限：内部后台，够用即可（也是防止把成员表撑成用户表） */
const MAX_MEMBERS = 50;

/** scrypt 参数：128*N*r = 16MB，低于 Node 默认 maxmem 32MB，单次约几十毫秒 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

let cache = null;
let needFlush = false;
let flushTimer = null;

/** 空结构 */
function empty() {
  return { seq: 0, members: [] };
}

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(FILE)) {
    const raw = fs.readFileSync(FILE, 'utf8');
    try {
      cache = JSON.parse(raw);
      if (!util.isPlainObject(cache)) {
        throw new Error(`内容不是 JSON 对象（实际为 ${util.describeJson(cache)}）`);
      }
    } catch (parseErr) {
      const broken = FILE + '.broken.' + Date.now();
      try { atomic.renameSync(FILE, broken); } catch (_) { /* 备份失败不阻断启动 */ }
      console.error(`[members] members.json 无法使用，已备份为 ${broken}：${parseErr.message}`);
      cache = empty();
    }
    const base = empty();
    Object.keys(base).forEach((k) => { if (cache[k] === undefined) cache[k] = base[k]; });
    if (!Array.isArray(cache.members)) cache.members = [];
    if (!Number.isFinite(cache.seq)) cache.seq = 0;
    /* 剔掉非对象记录：手工编辑或历史遗留的脏数据不该让整个成员页打不开 */
    const dirty = cache.members.filter((m) => !util.isPlainObject(m));
    if (dirty.length) {
      console.error(`[members] 忽略 ${dirty.length} 条非对象成员记录`);
      needFlush = true;
    }
    cache.members = cache.members.filter((m) => util.isPlainObject(m));
    /* id 必须是正整数：它不是主键展示用，但删改都按它定位，重复/空值会误伤别人 */
    cache.members.forEach((m) => {
      if (!Number.isInteger(m.id) || m.id <= 0) {
        m.id = (cache.seq = (cache.seq || 0) + 1);
        needFlush = true;
      }
      if (!ROLES.includes(m.role)) { m.role = 'viewer'; needFlush = true; }
      if (typeof m.enabled !== 'boolean') { m.enabled = true; needFlush = true; }
      /*
       * sessionVersion：会话版本号（审查 F04）。
       * 改口令 / 重置口令时自增，管理员令牌里的 sv 与之对不上即作废 ——
       * 否则「改密码」挡不住已经被人拿走的旧令牌：那 12 小时里它照样能用。
       * 存量记录没有这个字段时补 0；老令牌（payload 里没有 sv）因此全部失效，
       * 需要重新登录一次 —— 有意为之，因为本次升级同时关掉了 F02 的「用户名重用提权」，
       * 老令牌本来就绑在可回收的用户名上，不能再信。
       */
      if (!Number.isFinite(m.sessionVersion) || m.sessionVersion < 0) {
        m.sessionVersion = 0;
        needFlush = true;
      }
    });
  } else {
    cache = empty();
  }
  return cache;
}

function flushNow() {
  if (!needFlush) return;
  ensureDir();
  atomic.writeFileAtomic(FILE, JSON.stringify(load(), null, 2));
  needFlush = false;
}

/** 标记待落盘（合并 50ms 内的连续写，避免连点保存时反复写盘） */
function commit() {
  needFlush = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flushNow(); }, 50);
}

/** 立刻落盘（测试与进程退出用） */
function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  flushNow();
}

/**
 * 校验完成后**同步落盘**（审查 F03 + F11）。
 *
 * 成员表是「谁能进后台」的真源：写完却没落盘，重启后改动消失（甚至可能
 * 退回一个已经被降级的 owner），比商品数据分叉更危险。
 * 所以成员写路径一律等落盘结果，失败就让请求失败。
 */
function commitSync() {
  needFlush = true; // flushNow() 只写「标记过脏」的数据，这里必须先标
  flush();
}

/** 重置内存缓存（自检夹具用：改完文件后强制重新读） */
function reload() {
  flush();
  cache = null;
}

/* ------------------------------ 口令 ------------------------------ */

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT.keylen,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
  return { algo: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt, hash };
}

/**
 * 校验口令。
 *
 * 用 `timingSafeEqual` 而不是 `===`：比较耗时不该随「前几位对不对」变化。
 * 长度不等时直接返回 false（timingSafeEqual 对不等长会抛错，不能直接喂进去）。
 */
function verifyPassword(pw, rec) {
  if (!rec || rec.algo !== 'scrypt' || !rec.salt || !rec.hash) return false;
  let got;
  try {
    got = crypto.scryptSync(String(pw), rec.salt, SCRYPT.keylen,
      { N: rec.N || SCRYPT.N, r: rec.r || SCRYPT.r, p: rec.p || SCRYPT.p }).toString('hex');
  } catch (e) {
    return false;
  }
  const a = Buffer.from(got, 'utf8');
  const b = Buffer.from(String(rec.hash), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------ 取值与归一 ------------------------------ */

/** 用户名归一：比较与唯一性都用它（存原样，方便运营看清自己填的是什么） */
function normName(u) {
  return String(u == null ? '' : u).trim().toLowerCase();
}

/**
 * 出接口的安全形状 —— **绝不含 pwd**。
 *
 * 单独写一个函数而不是在 handler 里手拼字段：手拼总有漏的时候，
 * 而漏掉的那次就是把哈希发到浏览器里。
 */
function pub(m) {
  return {
    id: m.id,
    username: m.username,
    name: m.name || '',
    role: m.role,
    roleLabel: ROLE_LABEL[m.role] || m.role,
    enabled: m.enabled !== false,
    pwdSet: !!(m.pwd && m.pwd.hash),
    createdAt: m.createdAt || null,
    updatedAt: m.updatedAt || null,
    lastLoginAt: m.lastLoginAt || null
  };
}

/** 全部成员（安全形状），创建时间倒序（新的在前） */
function list() {
  return load().members.slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.id - a.id)
    .map(pub);
}

/** 原始记录（内部用；**不要**直接出接口） */
function raw(id) {
  return load().members.find((m) => m.id === Number(id)) || null;
}

function findByName(username) {
  const key = normName(username);
  if (!key) return null;
  return load().members.find((m) => normName(m.username) === key) || null;
}

/**
 * 按成员 ID 查（**身份认定的唯一依据**，审查 F02）。
 *
 * 用户名可被改名、可被删除后重建，拿它当主键等于给「改名 / 同名重建」留一条提权通道：
 * 建 viewer 号 → 登录 → 改名 → 用腾出来的名字建 owner 号 → 旧 viewer 令牌下一次请求
 * 就被识别成 owner。成员 ID 单调递增、永不复用，才能作为令牌里的身份锚点。
 */
function findById(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return load().members.find((m) => m.id === n) || null;
}

/**
 * 自增会话版本号 → 该成员**已签发的全部令牌立即失效**（F04）。
 * 改口令、被 owner 重置口令、或被强制下线时调用。
 */
function bumpSessionVersion(m) {
  if (!m) return 0;
  m.sessionVersion = Number(m.sessionVersion || 0) + 1;
  m.updatedAt = Date.now();
  commitSync();
  return m.sessionVersion;
}

function count() {
  return load().members.length;
}

/** 启用中的 owner 数量 —— 「不能把自己锁在门外」的所有判断都基于它 */
function activeOwnerCount(exceptId) {
  return load().members.filter((m) => m.role === 'owner' && m.enabled !== false &&
    m.id !== Number(exceptId)).length;
}

/** 至少有一个可写的启用成员（供启动日志/health 判断） */
function hasWritable() {
  return load().members.some((m) => m.enabled !== false &&
    (m.role === 'operator' || m.role === 'owner'));
}

/* ------------------------------ 校验 ------------------------------ */

function checkUsername(u, exceptId) {
  const s = String(u == null ? '' : u).trim();
  if (!s) throw new BizError('请填写登录账号', ERR.PARAM);
  if (!USERNAME_RE.test(s)) {
    throw new BizError('登录账号只能用字母 / 数字 / . _ - @，长度 3~32 位', ERR.PARAM);
  }
  const dup = findByName(s);
  if (dup && dup.id !== Number(exceptId)) {
    throw new BizError(`登录账号「${s}」已被占用（账号不区分大小写）`, ERR.PARAM);
  }
  return s;
}

function checkPassword(pw, required) {
  const s = String(pw == null ? '' : pw);
  if (!s) {
    if (required) throw new BizError(`请设置登录口令（至少 ${PWD_MIN} 位）`, ERR.PARAM);
    return '';
  }
  if (s.length < PWD_MIN) throw new BizError(`登录口令至少 ${PWD_MIN} 位`, ERR.PARAM);
  if (s.length > PWD_MAX) throw new BizError(`登录口令最多 ${PWD_MAX} 位`, ERR.PARAM);
  return s;
}

function checkRole(role) {
  if (!ROLES.includes(role)) {
    throw new BizError('角色只能是 viewer（只读）/ operator（运营）/ owner（超级管理员）', ERR.PARAM);
  }
  return role;
}

/* ------------------------------ 写操作 ------------------------------ */

/** 新建成员 */
function create(p) {
  const data = load();
  if (data.members.length >= MAX_MEMBERS) {
    throw new BizError(`成员数量已达上限（${MAX_MEMBERS} 个）`, ERR.BIZ);
  }
  /*
   * 全部校验与哈希计算都在**局部变量**里完成，最后才 push（审查 F03）。
   * 顺序很重要：任何一项校验抛错，data.members / data.seq 都保持原状 ——
   * 不会出现「提示保存失败，但记录其实已经建好了」这种最骗人的失败。
   */
  const username = checkUsername(p.username);
  const password = checkPassword(p.password, true);
  const role = checkRole(p.role || 'operator');
  const name = String(p.name == null ? '' : p.name).trim().slice(0, NAME_MAX);
  const pwd = hashPassword(password);
  const now = Date.now();

  const m = {
    id: (data.seq = (data.seq || 0) + 1),
    username,
    name: name || username,
    role,
    enabled: p.enabled === undefined ? true : !!p.enabled,
    pwd,
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };
  data.members.push(m);
  commitSync();
  return pub(m);
}

/**
 * 修改成员（姓名 / 角色 / 启用状态 / 重置口令）。
 *
 * ⚠️ 三条自锁防护都收在这里，而不是散在路由里：
 *    删掉这个号会让「启用中的 owner」归零时，拒绝 —— 无论从哪条路走过来。
 *
 * ⚠️ **先在临时对象上完成全部校验，再一次性替换**（审查 F03）。
 *    旧实现是「边校验边写 m」：同时提交新名称 + operator 角色 + 不足 8 位的新口令时，
 *    前面两项已经写进缓存，最后一项才抛错 —— 运营看到「口令至少 8 位」的红色提示，
 *    以为什么都没改，实际这个号**已经被提成运营了**。而且这次"失败"的变更还会在
 *    下一次无关保存时被一起落盘，变成永久提权。
 *    现在的写法：任何一项校验失败 → 内存、文件、更新时间、实际权限全部保持原状。
 */
function update(id, p) {
  const m = raw(id);
  if (!m) throw new BizError('成员不存在（可能已被其他人删除，刷新后重试）', ERR.NOT_FOUND, 404);

  /* ---- 第一步：只读地算出「下一份应该是什么样」，任何一步抛错都不碰 m ---- */
  const next = {
    username: m.username,
    name: m.name,
    role: m.role,
    enabled: m.enabled !== false
  };
  if (p.username !== undefined) next.username = checkUsername(p.username, m.id);
  if (p.name !== undefined) {
    next.name = String(p.name == null ? '' : p.name).trim().slice(0, NAME_MAX) || m.username;
  }
  if (p.role !== undefined) next.role = checkRole(p.role);
  if (p.enabled !== undefined) next.enabled = !!p.enabled;

  const wasActiveOwner = m.role === 'owner' && m.enabled !== false;
  const stillActiveOwner = next.role === 'owner' && next.enabled;
  if (wasActiveOwner && !stillActiveOwner && activeOwnerCount(m.id) === 0) {
    throw new BizError('这是最后一个启用中的超级管理员，不能降级或禁用（否则没人能再登录后台）', ERR.BIZ);
  }

  /* 口令校验放在**最后**：它是失败率最高的一项，绝不能让它前面已经改了角色 */
  const pw = p.password === undefined ? '' : checkPassword(p.password, false);
  const nextPwd = pw ? hashPassword(pw) : m.pwd;

  /* ---- 第二步：校验全过，一次性落定 ---- */
  m.username = next.username;
  m.name = next.name;
  m.role = next.role;
  m.enabled = next.enabled;
  m.pwd = nextPwd;
  /* 改口令 = 撤销该成员手上所有旧会话（F04） */
  if (pw) m.sessionVersion = Number(m.sessionVersion || 0) + 1;
  m.updatedAt = Date.now();
  commitSync();
  return pub(m);
}

/** 删除成员 */
function remove(id) {
  const data = load();
  const m = raw(id);
  if (!m) throw new BizError('成员不存在（可能已被其他人删除，刷新后重试）', ERR.NOT_FOUND, 404);
  if (m.role === 'owner' && m.enabled !== false && activeOwnerCount(m.id) === 0) {
    throw new BizError('这是最后一个启用中的超级管理员，不能删除（否则没人能再登录后台）', ERR.BIZ);
  }
  data.members = data.members.filter((x) => x.id !== m.id);
  commitSync();
  return { id: m.id, username: m.username };
}

/**
 * 校验账号 + 口令。
 * @returns {object|null} 成功返回原始记录（调用方只取 role / name），失败返回 null
 *
 * 刻意**不区分**「账号不存在」与「口令不对」的返回值 —— 区分开等于送出一个
 * 「这个账号存在」的探测接口。调用方的文案统一写「账号或口令不正确」。
 */
function authenticate(username, password) {
  const m = findByName(username);
  if (!m) return null;
  if (!verifyPassword(password, m.pwd)) return null;
  if (m.enabled === false) return null;
  m.lastLoginAt = Date.now();
  commitSync();
  return m;
}

/** 自己改自己的口令（需要验证旧口令） */
function changeOwnPassword(username, oldPw, newPw) {
  const m = findByName(username);
  if (!m) throw new BizError('当前身份不是成员账号（长期令牌 / 共享口令登录无法在此改口令）', ERR.FORBIDDEN, 403);
  if (!verifyPassword(oldPw, m.pwd)) throw new BizError('原口令不正确', ERR.FORBIDDEN, 403);
  const pw = checkPassword(newPw, true);
  const pwd = hashPassword(pw);
  m.pwd = pwd;
  /* 会话版本号自增 → 修改前签发的令牌立即作废（F04：改密码必须能撤掉已泄露的会话） */
  m.sessionVersion = Number(m.sessionVersion || 0) + 1;
  m.updatedAt = Date.now();
  commitSync();
  return pub(m);
}

/**
 * 强制下线某人：把他手上所有已签发的令牌作废。
 *
 * 用于 owner 重置口令（update 已自动 bump）之外的场景：
 * 账号疑似泄露、成员离职但记录要留着当审计线索。
 */
function revokeSessions(id) {
  const m = raw(id);
  if (!m) throw new BizError('成员不存在（可能已被其他人删除，刷新后重试）', ERR.NOT_FOUND, 404);
  return bumpSessionVersion(m);
}

module.exports = {
  FILE,
  ROLES,
  ROLE_LABEL,
  USERNAME_RE,
  PWD_MIN,
  PWD_MAX,
  NAME_MAX,
  MAX_MEMBERS,
  list,
  raw,
  findByName,
  findById,
  bumpSessionVersion,
  revokeSessions,
  count,
  hasWritable,
  activeOwnerCount,
  create,
  update,
  remove,
  authenticate,
  changeOwnPassword,
  hashPassword,
  verifyPassword,
  flush,
  commitSync,
  reload
};
