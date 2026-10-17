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
 * 自有键判断。
 *
 * 所有「拿一个字符串当键去表里查身份」的地方都必须过这一层：
 * `obj[key]` 会把原型链上的 `constructor` / `toString` / `__proto__` 一起算进来，
 * 而它们是**永远存在的**，等于给全世界发了一张万能令牌（见 F01）。
 */
function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * 解析 `ADMIN_TOKENS`。
 * 形如 {"tok_a":{"role":"operator","name":"运营A"},"tok_b":{"role":"viewer"}}
 * 任何一条不合法都跳过并告警 —— 不能让一条写错的配置把整组凭证都废掉。
 */
function parseTokens(raw) {
  /*
   * ⚠️ 这里必须是「无原型对象」，不能是 `{}`。
   *
   * 曾经的事故（2026-10-17 审查 F01，P0）：用普通对象当令牌表 + `TOKENS[raw]` 直接查，
   * 会把 `constructor`、`toString`、`__proto__`、`valueOf` 这些 **从 Object.prototype
   * 继承来的属性**当成"有效令牌" —— 于是随便一个 `?token=constructor` 就能拿到 HTTP 200，
   * 而且读出来的 role 是 `undefined`，`ROLE_RANK[undefined] < ROLE_RANK['owner']` 的比较
   * 结果永远是 false，连 owner 专属的「成员管理」都拦不住。
   *
   * 两条都要做，缺一不可：
   *   1. 容器用 `Object.create(null)`（或 Map）—— 从根上不存在继承键；
   *   2. 读取用 `hasOwnProperty` —— 万一哪天有人把容器改回 `{}`，第二道还能挡住。
   */
  const out = Object.create(null);
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
 *
 * ⚠️ 成员身份**只绑定不可复用的 memberId**，不再绑定 username（审查 F02）。
 *   历史实现把 username 写进 JWT、每次请求再按用户名回查 —— 于是：
 *     「建一个 viewer 号 → 登录 → 把它改名 → 用腾出来的用户名建一个 owner 号」，
 *   旧 viewer 令牌下一次请求就被识别成新 owner。**改个名就能提权**。
 *   同理「删号 → 同名重建」也会让旧令牌复活到别人身上。
 *
 * @param {object} [member] 成员原始记录（走成员表登录时传）；不传 = 共享口令/长期令牌会话
 */
function issue(role, name, member) {
  const r = isRole(role) ? role : 'owner';
  const payload = { admin: true, role: r, name: String(name || ROLE_LABEL[r]) };
  if (member && member.id) {
    payload.mid = Number(member.id);
    payload.sv = Number(member.sessionVersion || 0);
    /* username 只留作**展示/排障**用（审计日志里能看出是谁），不再作为查身份的依据 */
    payload.username = String(member.username || '');
  }
  return authLib.sign(payload, ADMIN_TTL);
}

/** 兼容旧调用：直接给成员记录签令牌（老代码传的是 username 字符串） */
function issueForMember(member) {
  if (!member) return issue('owner', '超级管理员');
  return issue(member.role, member.name || member.username, member);
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
  if (hasOwn(ADMIN_TOKENS, raw)) {
    const rec = ADMIN_TOKENS[raw];
    /*
     * 身份来源无论是什么，**都必须落回一个合法角色**（审查 F01 验收标准）。
     * parseTokens 已经过滤过一遍，这里是第二道：万一 ADMIN_TOKENS 被别处改写、
     * 或某天新增了一条没走校验的来源，也不会拿到 role=undefined 的"幽灵管理员"。
     */
    if (!rec || !isRole(rec.role)) return null;
    return { role: rec.role, name: rec.name, source: 'env' };
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
     *   · 成员**改口令 / 被重置口令** → sessionVersion 自增，旧令牌立即失效（F04）；
     *   · 长期令牌（env）与共享口令会话**不受影响** —— 它们的身份不来自成员表。
     *
     * ⚠️ 按 `mid`（成员 ID）查，不按 `username` 查（F02）。用户名是可回收的，
     *   拿它当主键等于给「改名 / 删号重建」留了一条提权通道。
     */
    if (payload.mid) {
      const m = members.findById(payload.mid);
      if (!m || m.enabled === false) return null;
      if (!isRole(m.role)) return null;
      /* 会话版本号对不上 = 这枚令牌是在「改口令 / 撤销会话」之前签发的，已作废 */
      if (Number(m.sessionVersion || 0) !== Number(payload.sv || 0)) return null;
      return {
        role: m.role,
        name: m.name || m.username,
        source: 'member',
        memberId: m.id,
        username: m.username
      };
    }
    /*
     * 只有 username、没有 mid 的令牌 = 2026-10-17 之前签发的老令牌。
     * 它们的身份绑在一个**可回收的字符串**上，无法安全判定归属，一律拒绝。
     * 代价是本次升级后所有人重新登录一次；收益是彻底关掉 F02 那条提权通道。
     */
    if (payload.username) return null;
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
  /*
   * 回收站的「彻底清除 / 清空」比删除更不可逆（审查 F17）：
   * 删素材只是进回收站、还能恢复，purge 才是真的从盘上抹掉。
   * 所以它们与 delete 同级，只有 owner 能做；restore 是「把损失救回来」，
   * 反而不该卡太死 —— operator 就能恢复，误删时不用等 owner。
   */
  /*
   * 合并重复副本（审查 F18）：它会改写商品库 / 已发布 / 草稿三处引用，
   * 然后把副本移出素材库 —— 与删除同级，只有 owner 能做。
   */
  /^\/api\/media\/(delete|folder|move|purge|trash\/sweep|merge)$/,
  /^\/api\/decorate\/(publish|rollback)$/,
  /^\/api\/decorate\/page\/(create|rename|delete)$/,
  /*
   * 笔记删除（审查 F06，P1）。
   *
   * 它和「删除自定义页面」是同一类动作：连带删掉笔记注册记录、草稿与全部版本快照，
   * 并**重写 replica.js**。但自定义页面删除一直在 OWNER_RULES 里，笔记删除却漏了 ——
   * 于是 operator 就能毁掉一篇已经发布过的笔记，而 owner 还以为只有自己能删。
   * 判据是「做错了会不会不可逆」，不是「这个按钮在哪个菜单里」。
   */
  /^\/api\/decorate\/note\/delete$/,
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

/**
 * 路由自报的最低角色（审查 F06 的整改建议）。
 *
 * 光靠 OWNER_RULES 这张正则清单兜底有个结构性毛病：
 * **将来新加的高危点位，只要没人想起来往清单里补一条，就默认 operator 可用** ——
 * 权限是「默认放行、例外收紧」，漏一条就是一个洞（笔记删除就是这么漏的）。
 *
 * 所以路由可以在自己的文件里显式声明 `declareRouteMinRole('POST', path, 'owner')`：
 * 声明写在点位旁边，加点位的人顺手就写了，不用跑到另一个文件里去改正则表。
 * 声明优先于下面的兜底规则；OWNER_RULES 仍然保留，作为「清单漏了还有一层」的保险。
 */
const ROUTE_MIN_ROLE = new Map();

function declareRouteMinRole(method, path, role) {
  const r = isRole(role) ? role : null;
  if (!r) throw new Error(`declareRouteMinRole：角色不合法（${role}）`);
  ROUTE_MIN_ROLE.set(String(method).toUpperCase() + ' ' + String(path), r);
}

/** 该点位是否声明过最低角色（自检用：确认声明真的生效了，不是死代码） */
function declaredMinRole(method, path) {
  return ROUTE_MIN_ROLE.get(String(method).toUpperCase() + ' ' + String(path)) || null;
}

/** 该点位要求的最低角色 */
function minRoleFor(method, path) {
  /* 「改自己的口令」只要求已登录 —— 必须排在 GET 判断之前，它是 POST 点位 */
  if (String(path) === ADMIN_SELF_PASSWORD_PATH) return 'viewer';
  const declared = declaredMinRole(method, path);
  if (declared) return declared;
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
  /*
   * 兜底校验角色**本身**合法（F01 验收标准：未知角色默认拒绝）。
   * read() 已经保证过，这里再挡一次是因为：等级比较一旦遇到 undefined，
   * `undefined < 3` 是 false —— 会**静默放行**而不是报错。
   * 这种"比较失败即通过"的写法在权限代码里必须显式堵死。
   */
  if (!isRole(session.role)) {
    return {
      ok: false, status: 401, code: ERR.UNAUTHORIZED,
      msg: '身份角色无法识别，请重新登录'
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
 * 口令登录的失败退避（审查 F05 重写）。
 *
 * 旧实现是**一个进程全局计数**：任何人对任何账号连错 5 次，就把**所有管理员**
 * 一起锁 60 秒。换个不存在的账号名反复试，就能让运营在整整一分钟内登不进去 ——
 * 这不是爆破防护，这是白送一个 DoS 开关。
 *
 * 现在的口径：
 *   1. 按「来源 IP + 账号」分桶：A 账号的错误尝试不影响正常来源的 B 账号；
 *   2. 同一来源轮换账号仍会累计到自己的桶里（桶 key 含 IP，账号轮换也在同一来源内累计失败）；
 *   3. 计数有过期时间（10 分钟没再失败就清零），一次手滑不会被记一辈子；
 *   4. 另有总量保护：全局窗口内失败数超过 GLOBAL_MAX_FAILS 才触发全站短锁，
 *      用于挡分布式爆破，阈值远高于单桶，正常单人碰不到；
 *   5. 桶数量有上限，防止用随机账号名把内存撑爆。
 *
 * 单进程内存计数即可：目标是挡住在线爆破，不是做分布式风控。
 */
const MAX_ATTEMPTS = 5;            // 单桶连续失败上限
const LOCK_MS = 60 * 1000;         // 单桶锁定时长
const BUCKET_TTL = 10 * 60 * 1000; // 桶多久没动静就清零
const MAX_BUCKETS = 2000;          // 内存保护
const GLOBAL_WINDOW = 10 * 60 * 1000;
const GLOBAL_MAX_FAILS = 100;      // 全局窗口内失败总数阈值（远高于单桶，正常单人碰不到）
const GLOBAL_LOCK_MS = 60 * 1000;

/** 是否信任反向代理的 X-Forwarded-For：只有部署在 nginx 后面才开，直连开着等于让人伪造 IP */
const TRUST_PROXY = String(process.env.TRUST_PROXY || '') === '1';

/** 同上一节：键查找必须走自有键，否则 `buckets['constructor']` 也是"已存在" */
const buckets = Object.create(null);
const globalGate = { windowStart: 0, count: 0, lockedUntil: 0 };

/** 取来源 IP：默认只认 socket 地址（不可伪造）；显式 TRUST_PROXY=1 才读代理头 */
function clientIp(req) {
  const r = req || {};
  if (TRUST_PROXY && r.headers) {
    const xf = String(r.headers['x-forwarded-for'] || '');
    if (xf) return xf.split(',')[0].trim();
    const xr = String(r.headers['x-real-ip'] || '');
    if (xr) return xr.trim();
  }
  return String((r.socket && r.socket.remoteAddress) || r.ip || 'unknown');
}

function bucketKey(req, account) {
  return clientIp(req) + '|' + String(account || '').trim().toLowerCase();
}

function sweepBuckets(now) {
  const keys = Object.keys(buckets);
  if (keys.length <= MAX_BUCKETS) return;
  keys.forEach((k) => {
    if (now - (buckets[k].lastAt || 0) > BUCKET_TTL) delete buckets[k];
  });
  // 清完还超就直接全清 —— 宁可让攻击者白试一次，也不能让进程被撑爆
  if (Object.keys(buckets).length > MAX_BUCKETS) {
    Object.keys(buckets).forEach((k) => { delete buckets[k]; });
  }
}

function checkLocked(req, account) {
  const now = Date.now();
  if (globalGate.lockedUntil > now) {
    const left = Math.ceil((globalGate.lockedUntil - now) / 1000);
    throw new BizError(`登录尝试过于频繁，请 ${left} 秒后再试`, ERR.FORBIDDEN, 429);
  }
  const b = buckets[bucketKey(req, account)];
  if (b && b.lockedUntil > now) {
    const left = Math.ceil((b.lockedUntil - now) / 1000);
    throw new BizError(`尝试次数过多，请 ${left} 秒后再试`, ERR.FORBIDDEN, 429);
  }
}

function countFailure(req, account) {
  const now = Date.now();
  sweepBuckets(now);

  if (now - globalGate.windowStart > GLOBAL_WINDOW) {
    globalGate.windowStart = now;
    globalGate.count = 0;
  }
  globalGate.count += 1;
  if (globalGate.count > GLOBAL_MAX_FAILS) {
    globalGate.lockedUntil = now + GLOBAL_LOCK_MS;
    globalGate.count = 0;
  }

  const k = bucketKey(req, account);
  const b = buckets[k] || (buckets[k] = { count: 0, lockedUntil: 0, lastAt: now });
  if (now - b.lastAt > BUCKET_TTL) { b.count = 0; b.lockedUntil = 0; }
  b.lastAt = now;
  b.count += 1;
  if (b.count >= MAX_ATTEMPTS) {
    b.count = 0;
    b.lockedUntil = now + LOCK_MS;
    throw new BizError('尝试次数过多，请 1 分钟后重试', ERR.FORBIDDEN, 429);
  }
}

/**
 * 登录。
 *
 * @param {string} password 口令
 * @param {string} [username] 成员账号；留空 = 走共享口令（登录即 owner）
 * @param {object} [req] 原始请求（用于按「来源 + 账号」限流；自检不传时退化为按账号限流）
 * @returns {string} 会话令牌
 */
function login(password, username, req) {
  const uname = String(username == null ? '' : username).trim();
  checkLocked(req, uname);

  /* ---- 成员账号登录 ---- */
  if (uname) {
    const m = members.authenticate(uname, password);
    if (!m) {
      /* 刻意不区分「账号不存在 / 口令不对 / 账号已停用」三种情况：
       * 区分开就等于给出一个「这个账号存不存在」的探测接口。 */
      countFailure(req, uname);
      throw new BizError('账号或口令不正确', ERR.FORBIDDEN, 403);
    }
    delete buckets[bucketKey(req, uname)];
    return issueForMember(m);
  }

  /* ---- 共享口令登录（旧路径，保留） ---- */
  if (!PASSWORD) {
    // 生产未配置共享口令：这条路不可用，只能靠成员账号或 ADMIN_TOKENS
    throw new BizError('未配置管理员共享口令（服务端设置 ADMIN_PASSWORD 后可用）', ERR.FORBIDDEN, 403);
  }
  if (String(password || '') !== PASSWORD) {
    countFailure(req, '');
    throw new BizError('管理员口令不正确', ERR.FORBIDDEN, 403);
  }
  delete buckets[bucketKey(req, '')];
  return issue('owner', '超级管理员');
}

/** 仅自检使用：重置退避计数 */
function resetAttempts() {
  Object.keys(buckets).forEach((k) => { delete buckets[k]; });
  globalGate.windowStart = 0;
  globalGate.count = 0;
  globalGate.lockedUntil = 0;
}

module.exports = {
  ROLE_RANK,
  ROLE_LABEL,
  ADMIN_TTL,
  ADMIN_API_PREFIXES,
  ADMIN_LOGIN_PATH,
  ADMIN_SELF_PASSWORD_PATH,
  isAdminApiPath,
  OWNER_RULES,
  minRoleFor,
  declareRouteMinRole,
  declaredMinRole,
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
  issueForMember,
  clientIp,
  resetAttempts
};
