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
 *   2. 令牌有两个来源，互不干扰：
 *        - `ADMIN_TOKENS`（环境变量，JSON：{ "<token>": { "role": "operator", "name": "运营A" } }）
 *          用于给不同的人/系统发不同角色的长期令牌；
 *        - `POST /api/admin/login` 用口令换取的会话令牌（JWT，带 admin 标记）。
 *   3. 管理员令牌与**小程序用户令牌**必须互不通用：
 *        - 管理员令牌 payload 里只有 `admin:true`，没有 `userId` → 用户链路拿不到身份；
 *        - 用户令牌没有 `admin` 标记 → 管理链路一律拒绝，**不能因为「有 token」就放行**。
 *   4. 口令登录带简单的失败退避，避免被在线爆破。
 *   5. 生产环境未配置任何管理员凭证时**拒绝启动**（与 JWT_SECRET 同一原则）：
 *      只在日志里打一行警告是拦不住的。
 */

const authLib = require('./auth');
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

/** 是否配置了可用的管理员凭证 */
function configured() {
  return Object.keys(ADMIN_TOKENS).length > 0 || !!PASSWORD;
}

/** 是否至少有一条「能写」的凭证（只有只读凭证时运营会寸步难行，启动日志要提示） */
function hasWritableCredential() {
  if (PASSWORD) return true;
  return Object.keys(ADMIN_TOKENS).some((t) => ROLE_RANK[ADMIN_TOKENS[t].role] >= ROLE_RANK.operator);
}

/* ------------------------------ 会话 ------------------------------ */

/** 签发管理员会话令牌（复用 lib/auth 的 HS256 实现，payload 里打 admin 标记） */
function issue(role, name) {
  const r = isRole(role) ? role : 'owner';
  return authLib.sign({ admin: true, role: r, name: String(name || ROLE_LABEL[r]) }, ADMIN_TTL);
}

/**
 * 读取请求里的管理员身份。
 * @returns {{role:string, name:string, source:string}|null}
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
    return { role: payload.role, name: String(payload.name || ROLE_LABEL[payload.role]), source: 'session' };
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
  /^\/api\/admin\/settings\/save$/
];

/** 该点位要求的最低角色 */
function minRoleFor(method, path) {
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

function login(password) {
  const now = Date.now();
  if (attempts.lockedUntil > now) {
    const left = Math.ceil((attempts.lockedUntil - now) / 1000);
    throw new BizError(`尝试次数过多，请 ${left} 秒后再试`, ERR.FORBIDDEN, 429);
  }
  if (!PASSWORD) {
    // 生产未配置口令：登录不可用，只能靠 ADMIN_TOKENS
    throw new BizError('未配置管理员口令（服务端设置 ADMIN_PASSWORD 后可用）', ERR.FORBIDDEN, 403);
  }
  if (String(password || '') !== PASSWORD) {
    attempts.count += 1;
    if (attempts.count >= MAX_ATTEMPTS) {
      attempts.count = 0;
      attempts.lockedUntil = now + LOCK_MS;
      throw new BizError('尝试次数过多，请 1 分钟后重试', ERR.FORBIDDEN, 429);
    }
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
  resetAttempts
};
