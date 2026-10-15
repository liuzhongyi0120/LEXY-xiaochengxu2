/**
 * 管理端鉴权：管理员会话与角色。
 *
 * 背景（为什么需要它）：
 *   `/api/admin/*`、`/api/decorate/*`、`/api/media/*` 共 40 多个点位此前全部是 `auth:false`，
 *   唯一的保护是 `DEBUG_PAGE` 这个页面总开关。也就是说 —— **开关一打开，任何人都能匿名
 *   改商品、删素材、发布装修**；而关掉开关，运营自己也没法用了。
 *   把「页面开关」当权限用，是这次整改里最危险的一条。
 *
 * 设计要点：
 *   1. 角色分三级，与「谁能做什么」直接对应：
 *        viewer   只读（看板、列表、详情）
 *        operator 运营（改商品/分类/库存/订单/券、上传素材、存草稿）
 *        owner    高危（删素材与素材夹、发布/回滚、删商品/分类/券、改店铺设置）
 *   2. 身份有三个来源，互不干扰：
 *        - `ADMIN_TOKENS`（环境变量，JSON：{ "<token>": { "role": "operator", "name": "运营A" } }）
 *          用于给不同的人/系统发不同角色的长期令牌；
 *        - `POST /api/admin/login` 用**共享口令**换取的会话令牌（JWT，带 admin 标记，登录即 owner）；
 *        - `POST /api/admin/login` 用**成员账号 + 口令**登录（2026-10-15 起，见 lib/members.js）——
 *          成员数据落在 `server/data/admin/members.json`，后台「成员管理」里能增删改。
 *      后两者共用同一个登录点位：带 `username` 走成员表，不带则沿用共享口令。
 *   3. 管理员令牌与**小程序用户令牌**必须互不通用：
 *        - 管理员令牌 payload 里只有 `admin:true`，没有 `userId` → 用户链路拿不到身份；
 *        - 用户令牌没有 `admin` 标记 → 管理链路一律拒绝，**不能因为「有 token」就放行**。
 *   4. 口令登录带简单的失败退避，避免被在线爆破。
 *   5. 生产环境未配置任何管理员凭证时**拒绝启动**（与 JWT_SECRET 同一原则）：
 *      只在日志里打一行警告是拦不住的。
 */

const authLib = require('./auth');
const members = require('./members');
const { BizError, ERR } = require('./http');

/** 角色等级：数值越大权限越高 */
const ROLE_RANK = { viewer: 1, operator: 2, owner: 3 };
const ROLE_LABEL = { viewer: '只读', operator: '运营', owner: '超级管理员' };

/** 管理员会话有效期（比小程序登录态短得多：后台是高权限入口） */
const ADMIN_TTL = Number(process.env.ADMIN_TTL || 12 * 3600); // 秒

const IS_PROD = process.env.NODE_ENV === 'production';
/** 开发环境默认口令；生产必须显式设置 ADMIN_PASSWORD */
const DEV_PASSWORD = 'admin';

function isRole(v) {
  return Object.prototype.hasOwnProperty.call(ROLE_RANK, v);
}

/**
 * 解析 `ADMIN_TOKENS`。
 * 形如 {"tok_a":{"role":"operator","name":"运营A"},"tok_b":{"role":"viewer"}}
 * 任何一条不合法都跳过并告警 —— 不能让一条写错的配置把整组凭证都废掉。
 */
function parseTokens(raw) {
  const out = {};
  if (!raw) return out;
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    console.warn('[warn] ADMIN_TOKENS 不是合法 JSON，已忽略（示例：{"tok_a":{"role":"operator"}}）');
    return out;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    console.warn('[warn] ADMIN_TOKENS 必须是对象：令牌 → { role, name }');
    return out;
  }
  Object.keys(obj).forEach((tok) => {
    const v = obj[tok];
    const role = v && typeof v === 'object' ? v.role : v;
    const name = (v && typeof v === 'object' && v.name) || '令牌用户';
    if (!tok || tok.length < 8) {
      console.warn('[warn] ADMIN_TOKENS 里有一条令牌太短（至少 8 位），已跳过');
      return;
    }
    if (!isRole(role)) {
      console.warn(`[warn] ADMIN_TOKENS 里的角色无法识别：${JSON.stringify(role)}，已跳过` +
        '（可用值：viewer / operator / owner）');
      return;
    }
    out[tok] = { role, name: String(name) };
  });
  return out;
}

const ADMIN_TOKENS = parseTokens(process.env.ADMIN_TOKENS);

/** 生效的登录口令（生产未配置时为空字符串 = 登录不可用） */
function effectivePassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return IS_PROD ? '' : DEV_PASSWORD;
}

const PASSWORD = effectivePassword();
const USING_DEV_PASSWORD = !process.env.ADMIN_PASSWORD && !IS_PROD;

/**
 * 是否配置了可用的管理员凭证。
 *
 * 成员表也算「已配置」—— 但**不替代**环境变量那两个来源：
 * 环境变量是服务器侧的救援通道（成员表被改坏 / 全员口令忘了还能进去修），
 * 所以这里只是把第三个来源并进来，任何一处可用就不算「没人能登录」。
 */
function configured() {
  return Object.keys(ADMIN_TOKENS).length > 0 || !!PASSWORD || members.count() > 0;
}

/** 是否至少有一条「能写」的凭证（只有只读凭证时运营会寸步难行，启动日志要提示） */
function hasWritableCredential() {
  if (PASSWORD) return true;
  if (Object.keys(ADMIN_TOKENS).some((t) => ROLE_RANK[ADMIN_TOKENS[t].role] >= ROLE_RANK.operator)) return true;
  return members.hasWritable();
}

/* ------------------------------ 会话 ------------------------------ */

/**
 * 签发管理员会话令牌（复用 lib/auth 的 HS256 实现，payload 里打 admin 标记）。
 * @param {string} [username] 成员账号名（共享口令登录时为空；「改自己的口令」要靠它认人）
 */
function issue(role, name, username) {
  const r = isRole(role) ? role : 'owner';
  const payload = { admin: true, role: r, name: String(name || ROLE_LABEL[r]) };
  if (username) payload.username = String(username);
  return authLib.sign(payload, ADMIN_TTL);
}

/**
 * 读取请求里的管理员身份。
 * @returns {{role:string, name:string, source:string, username?:string}|null}
 */
function read(req) {
  const raw = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!raw) return null;

  // 优先匹配环境变量里的长期令牌（等值比较；长度不同直接跳过）
  if (ADMIN_TOKENS[raw]) {
    return { role: ADMIN_TOKENS[raw].role, name: ADMIN_TOKENS[raw].name, source: 'env' };
  }

  const payload = authLib.verify(raw);
  if (payload && payload.admin === true && isRole(payload.role)) {
    /*
     * 成员账号：**每次都回查成员表**，不直接信令牌里的角色。
     *
     * 为什么必须回查：会话 TTL 是 12 小时。只在签发时校验一次的话，
     * 「停用某人」要等他的令牌自然过期才生效 —— 那 12 小时里他能照常改价、发货、删素材，
     * 也就是说**「停用」按钮是假的**。同理，改角色也当场生效，不必等人重新登录。
     * 代价是内存里一次数组查找（成员上限 50），可以忽略。
     *
     * 回查带来的语义（写在这里，免得以后被当成 bug 改回去）：
     *   · 成员被**停用或删除** → 他手里所有未过期的令牌**立即**失效（下一个请求就 401）；
     *   · 成员被**降级** → 下一个请求就按新角色判权；
     *   · 长期令牌（env）与共享口令会话**不受影响** —— 它们的身份不来自成员表。
     */
    if (payload.username) {
      const m = members.findByName(payload.username);
      if (!m || m.enabled === false) return null;
      return {
        role: m.role,
        name: m.name || m.username,
        source: 'member',
        username: m.username
      };
    }
    return {
      role: payload.role,
      name: String(payload.name || ROLE_LABEL[payload.role]),
      source: 'session',
      username: ''
    };
  }
  return null;
}

/* ------------------------------ 角色规则 ------------------------------ */

/**
 * 受管理鉴权保护的接口前缀。
 *
 * 放在这里（而不是 index.js）是为了让路由清单（/api/routes）也能标注
 * 「哪些点位需要管理员令牌」—— 两处各写一份前缀列表，迟早会漏掉新增的那一类。
 */
const ADMIN_API_PREFIXES = ['/api/admin/', '/api/decorate/', '/api/media/'];
/** 管理员登录点位（受页面开关约束，但不要求令牌） */
const ADMIN_LOGIN_PATH = '/api/admin/login';
/**
 * 「改自己的口令」点位。
 *
 * 单独开一个例外：它**只要求已登录**（viewer 起），不要求 operator —— 否则只读成员
 * 连自己的口令都换不了，只能让 owner 代改，等于人人共用一个口令，成员分级白做。
 * 处理器内部再验一次旧口令（见 members.changeOwnPassword），所以放宽这里不会开口子。
 */
const ADMIN_SELF_PASSWORD_PATH = '/api/admin/me/password';
/** 该路径是否属于管理接口 */
function isAdminApiPath(p) {
  return ADMIN_API_PREFIXES.some((x) => String(p).indexOf(x) === 0);
}

/**
 * 需要 owner（高危）的点位。
 *
 * 判定标准是「**做错了会不会造成不可逆损失**」：
 *   - 删素材 / 删素材夹 / 移动素材 → 线上图片直接裂图，且素材可能已被商品与装修引用；
 *   - 发布 / 回滚装修 → 全站前端内容整体替换；
 *   - 删商品 / 删分类 / 删券模板 → 商品与分类树结构被破坏；
 *   - 改店铺设置 → 影响全局展示与交易参数。
 * 其余写操作（改价格、改库存、上下架、发货、回复评价…）属于日常运营，operator 即可。
 */
const OWNER_RULES = [
  /^\/api\/media\/(delete|folder|move)$/,
  /^\/api\/decorate\/(publish|rollback)$/,
  /^\/api\/decorate\/page\/(create|rename|delete)$/,
  /^\/api\/admin\/goods\/delete$/,
  /^\/api\/admin\/category\/delete$/,
  /^\/api\/admin\/coupon\/(save|status|delete)$/,
  /^\/api\/admin\/settings\/save$/,
  /*
   * 成员管理 = 最高危：能改谁能进后台、能把自己提成 owner。
   * 只让 owner 动，并且**禁用 / 降级 / 删除三条路**都在 members.js 里做了
   * 「不能消灭最后一个启用中的 owner」的防护 —— 权限给错一次就再也进不来了。
   * （GET /api/admin/members 是只读列表，仍走 viewer，方便只读成员看清自己是谁。）
   */
  /^\/api\/admin\/members\/(save|delete|status|password)$/
];

/** 该点位要求的最低角色 */
function minRoleFor(method, path) {
  /* 「改自己的口令」只要求已登录 —— 必须排在 GET 判断之前，它是 POST 点位 */
  if (String(path) === ADMIN_SELF_PASSWORD_PATH) return 'viewer';
  if (String(method).toUpperCase() === 'GET') return 'viewer';
  if (OWNER_RULES.some((re) => re.test(path))) return 'owner';
  return 'operator';
}

/**
 * 校验一次管理请求。
 * @returns {{ok:true, session:object, minRole:string} | {ok:false, status:number, code:number, msg:string}}
 */
function guard(req, method, path) {
  const minRole = minRoleFor(method, path);
  const session = read(req);
  if (!session) {
    return {
      ok: false, status: 401, code: ERR.UNAUTHORIZED,
      msg: '需要管理员身份：请在后台右上角登录（或携带管理员令牌）'
    };
  }
  if (ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    return {
      ok: false, status: 403, code: ERR.FORBIDDEN,
      msg: `当前身份「${ROLE_LABEL[session.role]}」无权执行该操作（需要「${ROLE_LABEL[minRole]}」及以上）`
    };
  }
  return { ok: true, session, minRole };
}

/* ------------------------------ 口令登录 ------------------------------ */

/**
 * 口令登录的失败退避。
 * 单进程内存计数即可：目标是挡住在线爆破，不是做分布式风控。
 */
const attempts = { count: 0, lockedUntil: 0 };
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;

function countFailure() {
  attempts.count += 1;
  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.count = 0;
    attempts.lockedUntil = Date.now() + LOCK_MS;
    throw new BizError('尝试次数过多，请 1 分钟后重试', ERR.FORBIDDEN, 429);
  }
}

/**
 * 登录。两种方式共用同一套失败退避（否则攻击者可以拿成员账号把退避刷满、
 * 把共享口令那条路一起锁死，或者反过来）。
 *
 * @param {string} password 口令
 * @param {string} [username] 成员账号；留空 = 走共享口令（登录即 owner）
 * @returns {string} 会话令牌
 */
function login(password, username) {
  const now = Date.now();
  if (attempts.lockedUntil > now) {
    const left = Math.ceil((attempts.lockedUntil - now) / 1000);
    throw new BizError(`尝试次数过多，请 ${left} 秒后再试`, ERR.FORBIDDEN, 429);
  }

  const uname = String(username == null ? '' : username).trim();

  /* ---- 成员账号登录 ---- */
  if (uname) {
    const m = members.authenticate(uname, password);
    if (!m) {
      /* 刻意不区分「账号不存在 / 口令不对 / 账号已停用」三种情况：
       * 区分开就等于给出一个「这个账号存不存在」的探测接口。 */
      countFailure();
      throw new BizError('账号或口令不正确', ERR.FORBIDDEN, 403);
    }
    attempts.count = 0;
    attempts.lockedUntil = 0;
    return issue(m.role, m.name || m.username, m.username);
  }

  /* ---- 共享口令登录（旧路径，保留） ---- */
  if (!PASSWORD) {
    // 生产未配置共享口令：这条路不可用，只能靠成员账号或 ADMIN_TOKENS
    throw new BizError('未配置管理员共享口令（服务端设置 ADMIN_PASSWORD 后可用）', ERR.FORBIDDEN, 403);
  }
  if (String(password || '') !== PASSWORD) {
    countFailure();
    throw new BizError('管理员口令不正确', ERR.FORBIDDEN, 403);
  }
  attempts.count = 0;
  attempts.lockedUntil = 0;
  return issue('owner', '超级管理员');
}

/** 仅自检使用：重置退避计数 */
function resetAttempts() {
  attempts.count = 0;
  attempts.lockedUntil = 0;
}

module.exports = {
  ROLE_RANK,
  ROLE_LABEL,
  ADMIN_TTL,
  ADMIN_API_PREFIXES,
  ADMIN_LOGIN_PATH,
  ADMIN_SELF_PASSWORD_PATH,
  isAdminApiPath,
  minRoleFor,
  guard,
  read,
  issue,
  login,
  configured,
  hasWritableCredential,
  usingDevPassword: () => USING_DEV_PASSWORD,
  tokenCount: () => Object.keys(ADMIN_TOKENS).length,
  /** 共享口令是否可用（开发环境的默认口令也算可用 —— 与 login() 的判据同源） */
  sharedPasswordUsable: () => !!PASSWORD,
  /** 成员账号数（health 与启动日志用；具体成员列表走 /api/admin/members） */
  memberCount: () => members.count(),
  /** 是否有至少一个可写的启用成员 */
  hasMemberWritable: () => members.hasWritable(),
  resetAttempts
};
