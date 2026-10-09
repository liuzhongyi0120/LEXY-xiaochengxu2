/**
 * 莱克企业商城小程序 · 自建后端服务
 *
 * 启动： node server/index.js
 * 端口： PORT 环境变量，默认 3000
 *
 * 设计要点：
 *   - 零第三方依赖（仅 Node 内置模块），clone 下来即可 node 起服务，无需 npm install
 *   - 统一响应 { code, msg, data }，与《技术方案》第六章契约一致
 *   - 鉴权：JWT（Authorization: Bearer <token>），401 时前端清 token 重新登录
 *   - 存储：JSON 文件（lib/store.js 封装），换 MySQL 只改该层
 *   - 微信能力双模式：未配置 AppID 时走本地模拟，保证开发期每个点位都能跑通
 */

const http = require('node:http');
const fs = require('node:fs');
const nodePath = require('node:path');
const { URL } = require('node:url');

const { parseBody, parseQuery, ok, fail, preflight, BizError, ERR } = require('./lib/http');
const authLib = require('./lib/auth');
const adminAuth = require('./lib/adminAuth');
const store = require('./lib/store');
const router = require('./routes');
const wechat = require('./lib/wechat');
const media = require('./lib/media');
const flags = require('./lib/featureFlags');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

/** 无需鉴权即可访问的公共点位 */
const PUBLIC = ['/api/health', '/api/routes'];

/**
 * 管理页面开关（接口调试台 / 店铺装修台 / 后台控制台三个页面 + 三类管理接口共用）：
 *   - 未设置：跟随环境——非 production 开放，production 关闭
 *   - 显式打开：`1` / `on` / `true` / `yes`
 *   - 显式关闭：`0` / `off` / `false` / `no`（大小写、首尾空格均容忍）
 *   - ⚠️ 其它取值（拼错的值）：**一律按关闭处理**——这是安全开关，失败必须往安全侧倒，
 *     不能因为把 off 拼成 offf 就把管理后台敞在公网。
 *     此前只认 '0'，导致按文档设置的 `DEBUG_PAGE=off` 实际是「开放」，是个真事故隐患。
 *   判定逻辑抽在 lib/featureFlags.js（纯函数），判定矩阵由自检单测覆盖。
 */
const DEBUG_PAGE = flags.resolveDebugPage(process.env.DEBUG_PAGE, process.env.NODE_ENV);
if (!flags.isKnownDebugPageValue(process.env.DEBUG_PAGE)) {
  console.warn(`[warn] DEBUG_PAGE 取值无法识别（${JSON.stringify(process.env.DEBUG_PAGE)}），` +
    '已按「关闭管理页面与运营接口」处理；可用值：1/on/true/yes 开启，0/off/false/no 关闭');
}

/**
 * 运营后台页面开关（`/admin` 装修台 与 `/console` 控制台）。
 *
 * 与 DEBUG_PAGE 分开：DEBUG_PAGE 管的是**开发用具**（`/debug` 接口调试台、`/preview` 前端预览、
 * `/mp-src` 源码只读），ADMIN_PAGE 管的是**运营日常要用的后台**。
 * 一个总开关做不到「关掉调试台、留下后台」，也做不到「后台也要正式鉴权」。
 * 未设置时回落 DEBUG_PAGE，保证历史上线脚本的行为不变。
 */
const ADMIN_PAGE = flags.resolveAdminPage(process.env.ADMIN_PAGE, DEBUG_PAGE);
if (!flags.isKnownFlagValue(process.env.ADMIN_PAGE)) {
  console.warn(`[warn] ADMIN_PAGE 取值无法识别（${JSON.stringify(process.env.ADMIN_PAGE)}），` +
    '已按「关闭运营后台」处理；可用值：1/on/true/yes 开启，0/off/false/no 关闭');
}
const PUBLIC_DIR = nodePath.join(__dirname, 'public');

/**
 * 运营管理接口前缀：受 ADMIN_PAGE 开关约束，**且必须携带管理员令牌**。
 *
 * ⚠️ 「关掉页面」不等于「关掉接口」：只把 /admin、/console 403 掉，
 *    这 40 多个点位照样能被匿名调用（删商品、改店铺配置、写文件）。
 *    所以这里两道门：开关一道（页面级），身份与角色一道（请求级）。
 *    前缀清单由 lib/adminAuth 单点维护（路由清单也要用它标注）。
 */
const ADMIN_LOGIN_PATH = adminAuth.ADMIN_LOGIN_PATH;
const isAdminApiPath = adminAuth.isAdminApiPath;

/** 运营后台页面（与调试台分开控制） */
const ADMIN_PAGES = ['/admin', '/admin/', '/console', '/console/'];
const ADMIN_STATIC_DIRS = ['/admin/', '/console/'];
/** 两边共用：装修台与前端预览页都要加载它 */
const SHARED_DIR = '/shared/';

/** 页面入口路由 → public 下的文件 */
const STATIC_PAGES = {
  '/': 'debug.html',
  '/debug': 'debug.html',
  '/debug/': 'debug.html',
  '/admin': 'admin/index.html',
  '/admin/': 'admin/index.html',
  '/console': 'console/index.html',
  '/console/': 'console/index.html',
  '/preview': 'preview/index.html',
  '/preview/': 'preview/index.html'
};

/**
 * 允许直接访问的静态子目录（前缀 → public 下的目录）
 *   /shared/ —— 装修台与前端预览页共用的渲染核心（pv-render.js），两边都要加载它
 */
const STATIC_DIRS = { '/admin/': 'admin/', '/console/': 'console/', '/preview/': 'preview/', '/shared/': 'shared/' };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

/** 素材库对外访问的类型（比管理页的静态资源宽，含 webp / gif 与视频）
 *  视频这三项不是可选项：扩展名不在表里会被直接 403「不支持的素材类型」，
 *  与 media.js 放行的 TYPES 必须一一对应（.m4v 也归 mp4，手机相册常见）。 */
const UPLOAD_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

/**
 * 小程序源码（只读）：GET /mp-src/<miniprogram 下的相对路径>
 *
 * 用途：前端预览页（/preview）**直接把真机的 WXML + WXSS 拿来渲染**，
 * 而不是另写一套 HTML 近似 —— 近似写法会跟真机慢慢走样（实测：型号网格写成 3 列、
 * 选中态写成红字白底，真机其实是 2 列 + 黑底白字），预览就不再可信。
 *
 * 安全：
 *   - 跟随 DEBUG_PAGE 开关（关闭时一律 403），与 /admin、/console、/preview 同进同退；
 *   - 扩展名白名单：只有小程序源码文本，图片等资源仍走 /uploads；
 *   - 拒绝 `..` 与绝对路径，防目录穿越；
 *   - 不缓存（改完源码刷新预览页即可生效）。
 */
const MP_SRC_DIR = nodePath.join(__dirname, '..', 'miniprogram');
const MP_SRC_MIME = {
  '.wxml': 'text/plain; charset=utf-8',
  '.wxss': 'text/plain; charset=utf-8',
  '.wxs': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function tryMpSrc(path, res) {
  if (path.indexOf('/mp-src/') !== 0) return false;

  if (!DEBUG_PAGE) {
    fail(res, '管理页面已关闭（设置 DEBUG_PAGE=1 可临时开启）', ERR.FORBIDDEN, 403);
    return true;
  }

  let rel = '';
  try { rel = decodeURIComponent(path.slice('/mp-src/'.length)); } catch (e) { rel = ''; }
  if (!rel || rel.indexOf('..') !== -1 || rel.startsWith('/') || rel.indexOf('\\') !== -1) {
    fail(res, '源码路径不合法', ERR.PARAM, 400);
    return true;
  }

  const type = MP_SRC_MIME[nodePath.extname(rel).toLowerCase()];
  if (!type) {
    fail(res, '仅支持小程序源码文本（wxml / wxss / js / json / wxs）', ERR.FORBIDDEN, 403);
    return true;
  }

  const file = nodePath.join(MP_SRC_DIR, rel);
  fs.readFile(file, (err, buf) => {
    if (err) {
      console.error('[error] 读取小程序源码失败', rel, err.code);
      return fail(res, '源码文件不存在：' + rel, ERR.NOT_FOUND, 404);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
  return true;
}

/**
 * 素材静态服务：GET /uploads/<yyyyMM>/<file>
 *
 * 与调试台 / 装修台不同，这里**不受 DEBUG_PAGE 开关影响**——
 * 上传的图片是小程序线上的正式内容，关掉管理页面也必须能正常访问。
 */
function tryUploads(path, req, res) {
  if (path.indexOf('/uploads/') !== 0) return false;

  let rel = '';
  try { rel = decodeURIComponent(path.slice('/uploads/'.length)); } catch (e) { rel = ''; }
  if (!rel || rel.indexOf('..') !== -1 || rel.startsWith('/') || rel.indexOf('\\') !== -1) {
    fail(res, '素材路径不合法', ERR.PARAM, 400);
    return true;
  }

  const type = UPLOAD_MIME[nodePath.extname(rel).toLowerCase()];
  if (!type) {
    fail(res, '不支持的素材类型（仅图片与 MP4 / MOV / WebM 视频）', ERR.FORBIDDEN, 403);
    return true;
  }

  const file = nodePath.join(media.ROOT, rel);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      fail(res, '素材不存在：' + rel, ERR.NOT_FOUND, 404);
      return;
    }
    // 文件名带随机段，可安全长缓存；用 ETag 支持 304
    const etag = '"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
    const total = st.size;

    /*
     * Range 支持 —— 视频的必备项，不是优化项：
     * 浏览器播放器与小程序 <video> 都会先发 `Range: bytes=0-` 再按需续取，
     * iOS Safari 遇到「不支持 Range」的响应会**直接不播**；支持之后才能拖动进度条。
     * 图片走不到这里（不会带 Range），逻辑与以前完全一致。
     */
    const rm = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    let start = 0;
    let end = total - 1;
    let partial = false;
    if (rm && (rm[1] || rm[2])) {
      if (rm[1]) {
        start = Number(rm[1]);
        end = rm[2] ? Number(rm[2]) : total - 1;
      } else {
        start = Math.max(0, total - Number(rm[2])); // bytes=-N → 末尾 N 字节
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + total });
        return res.end();
      }
      end = Math.min(end, total - 1);
      partial = true;
    }

    // 304 只对完整请求有意义：带 Range 的响应必须真的把那段字节发出去
    if (!partial && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=604800' });
      return res.end();
    }
    if (partial) {
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        ETag: etag,
        'Cache-Control': 'public, max-age=604800'
      });
      fs.createReadStream(file, { start: start, end: end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'Cache-Control': 'public, max-age=604800'
    });
    fs.createReadStream(file).pipe(res);
  });
  return true;
}

/**
 * 静态资源处理：命中返回 true（响应已发出），未命中返回 false
 *
 * 开关分两档：
 *   - 运营后台（`/admin`、`/console`）→ ADMIN_PAGE
 *   - 开发用具（`/debug` 调试台、`/preview` 预览）→ DEBUG_PAGE
 *   - `/shared/` 两边共用（装修台与预览页都要加载 pv-render.js）→ 任一开启即可
 */
function tryStatic(path, res) {
  let rel = null;
  if (STATIC_PAGES[path]) {
    rel = STATIC_PAGES[path];
  } else {
    const prefix = Object.keys(STATIC_DIRS).filter((p) => path.indexOf(p) === 0)[0];
    if (prefix) {
      const rest = path.slice(prefix.length);
      // 防目录穿越：不允许 .. 与绝对路径
      if (rest && rest.indexOf('..') === -1 && !rest.startsWith('/')) {
        rel = STATIC_DIRS[prefix] + rest;
      }
    }
  }
  if (!rel) return false;

  const isAdmin = ADMIN_PAGES.indexOf(path) > -1 || ADMIN_STATIC_DIRS.some((p) => path.indexOf(p) === 0);
  const isShared = path.indexOf(SHARED_DIR) === 0;
  const allowed = isShared ? (ADMIN_PAGE || DEBUG_PAGE) : (isAdmin ? ADMIN_PAGE : DEBUG_PAGE);
  if (!allowed) {
    fail(res, isAdmin
      ? '运营后台已关闭（设置 ADMIN_PAGE=1 可临时开启）'
      : '调试页面已关闭（设置 DEBUG_PAGE=1 可临时开启）', ERR.FORBIDDEN, 403);
    return true;
  }

  const ext = nodePath.extname(rel).toLowerCase();
  const type = MIME[ext];
  if (!type) {
    fail(res, '不支持的静态资源类型', ERR.FORBIDDEN, 403);
    return true;
  }

  const file = nodePath.join(PUBLIC_DIR, rel);
  fs.readFile(file, (err, buf) => {
    if (err) {
      console.error('[error] 读取静态资源失败', rel, err.code);
      return fail(res, '静态文件缺失：' + rel, ERR.NOT_FOUND, 404);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
  return true;
}

function timestamp() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(...args) {
  console.log(`[${timestamp()}]`, ...args);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let u;
  try {
    u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (e) {
    return fail(res, '请求地址不合法', ERR.PARAM, 400);
  }
  const path = u.pathname;
  const method = req.method.toUpperCase();

  /* CORS 预检 */
  if (method === 'OPTIONS') return preflight(res);

  /* 静态页：接口调试台（/debug）、店铺装修后台（/admin）、后台控制台（/console）、前端预览（/preview） */
  if (method === 'GET' && tryStatic(path, res)) return;

  /* 小程序源码只读：/mp-src/…（预览页直接编译真机 WXML + WXSS 用） */
  if (method === 'GET' && tryMpSrc(path, res)) return;

  /* 素材库图片：/uploads/…（不受管理页面开关影响） */
  if (method === 'GET' && tryUploads(path, req, res)) return;

  /* 图标：避免浏览器反复 404 干扰日志 */
  if (method === 'GET' && path === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  /*
   * 运营管理点位：两道门，缺一不可。
   *
   * 第一道 —— 页面开关（ADMIN_PAGE）：关闭时与页面同进同退，返回 403。
   *   只关页面不管接口是**假关闭**：`/admin` 打不开了，但
   *   `POST /api/admin/goods/delete`、`/api/admin/settings/save`、`/api/media/upload`
   *   仍可被任何人匿名调用（改商品、改店铺配置、往服务器写文件）。
   *   （`/uploads/…` 静态图片不在此列——那是小程序线上内容，必须始终可访问。）
   *
   * 第二道 —— 管理员身份与角色（lib/adminAuth）：
   *   页面开着不等于谁都能改。每个请求都要带管理员令牌，并按「点位所需最低角色」校验。
   *   管理员令牌与小程序用户令牌**互不通用**：普通用户 token 到这里一律 401/403。
   */
  const isAdminApi = isAdminApiPath(path);
  if (isAdminApi && !ADMIN_PAGE) {
    return fail(res, '管理接口已关闭（设置 ADMIN_PAGE=1 可临时开启）', ERR.FORBIDDEN, 403);
  }
  if (isAdminApi && path !== ADMIN_LOGIN_PATH) {
    const gate = adminAuth.guard(req, method, path);
    if (!gate.ok) return fail(res, gate.msg, gate.code, gate.status);
  }

  /* 健康检查 */
  if (path === '/api/health') {
    return ok(res, {
      status: 'up',
      service: 'lexy-mall-api',
      time: Date.now(),
      uptime: Math.round(process.uptime()),
      routes: router.describe().length + 2, // 业务点位 + health / routes 两个运维点位
      wechat: { login: wechat.HAS_WX_LOGIN ? 'real' : 'mock', pay: wechat.HAS_WX_PAY ? 'real' : 'mock' },
      jwtSecret: authLib.IS_DEFAULT_SECRET ? 'default(dev-only)' : 'custom',
      debugPage: DEBUG_PAGE ? 'on' : 'off',
      adminPage: ADMIN_PAGE ? 'on' : 'off',
      // 管理接口至少要看清三件事：有没有配凭证、能不能写、是不是在用开发默认口令
      adminAuth: {
        credentials: adminAuth.configured() ? 'on' : 'off',
        tokens: adminAuth.tokenCount(),
        writable: adminAuth.hasWritableCredential() ? 'yes' : 'no',
        password: adminAuth.usingDevPassword() ? 'dev-default' : (adminAuth.configured() ? 'custom' : 'unset')
      }
    });
  }

  /* 点位清单：联调期用来核对「每个点位是否已注册」 */
  if (path === '/api/routes') {
    // 两个运维点位也走 withSample，保证「示例参数」与业务点位同源、不脱节
    const list = [
      { method: 'GET', path: '/api/health', auth: false, desc: '健康检查（运维点位）' },
      { method: 'GET', path: '/api/routes', auth: false, desc: '点位清单（运维点位）' }
    ].map(router.withSample).concat(router.describe());
    return ok(res, { total: list.length, bizTotal: router.describe().length, list });
  }

  /* 路由匹配 */
  const route = router.match(method, path);
  if (!route) {
    return fail(res, `接口不存在：${method} ${path}`, ERR.NOT_FOUND, 404);
  }

  try {
    const query = parseQuery(req.url);
    // raw 点位（文件上传）自己读原始流，不能用 JSON 解析器消耗掉
    let body = {};
    let deleteBody = {};
    if (!route.raw) {
      body = method === 'GET' || method === 'DELETE' ? {} : await parseBody(req);
      // DELETE 允许把参数放 body（wx.request 的 DELETE 行为），也兼容 query
      deleteBody = method === 'DELETE' ? await parseBody(req) : {};
    }
    const params = Object.assign({}, query, body, deleteBody);

    /* 鉴权 */
    let userId = null;
    const needAuth = route.auth && PUBLIC.indexOf(path) === -1;
    if (needAuth) {
      userId = authLib.getUserId(req);
      if (!userId) {
        return fail(res, '登录态已失效，请重新登录', ERR.UNAUTHORIZED, 401);
      }
    }

    const ctx = {
      req,
      res,
      db: store.get(),
      userId,
      params,
      query,
      body: Object.assign({}, body, deleteBody)
    };

    const data = await route.handler(ctx);
    // 请求过程中可能产生数据变更（含惰性过期），统一提交
    store.commit();

    ok(res, data);
    log(`${method} ${path} → 200 (${Date.now() - started}ms)`);
  } catch (err) {
    // 业务异常：正常 HTTP 200 + 业务码，前端按 msg 提示
    if (err instanceof BizError) {
      store.commit();
      fail(res, err.message, err.code, err.httpStatus);
      log(`${method} ${path} → 业务失败 ${err.code} ${err.message}`);
      return;
    }
    // 未预期异常：打日志，对外不暴露堆栈
    console.error(`[error] ${method} ${path}`, err);
    fail(res, '服务开小差了，请稍后重试', ERR.SERVER, 500);
  }
});

/*
 * 生产环境硬校验：JWT 密钥未设置时**拒绝启动**。
 *
 * 此前只是在启动日志里打一行 ⚠️，但日志很容易被忽略——一旦带着开发默认密钥
 * `dev-only-secret-change-me` 上线，任何人都能用它伪造任意 userId 的 token，
 * 整套鉴权形同虚设。安全默认值必须让进程起不来，而不是靠人看日志。
 */
if (process.env.NODE_ENV === 'production' && authLib.IS_DEFAULT_SECRET) {
  console.error('[fatal] NODE_ENV=production 但未设置 JWT_SECRET，拒绝启动。');
  console.error('        默认密钥是公开的，会让任何人都能伪造登录态。');
  console.error('        请设置一个足够长的随机值，例如：');
  console.error("        JWT_SECRET=\"$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")\"");
  process.exit(1);
}

/*
 * 生产环境硬校验：既要开运营后台，又没有配置任何管理员凭证 → 拒绝启动。
 *
 * 「后台开着但谁都能进」比「后台关着」危险得多：运维会以为已经有人管着了。
 * 同样不能让这一步只依赖日志警告。
 */
if (process.env.NODE_ENV === 'production' && ADMIN_PAGE && !adminAuth.configured()) {
  console.error('[fatal] NODE_ENV=production 且 ADMIN_PAGE 开启，但未配置任何管理员凭证，拒绝启动。');
  console.error('        请至少设置其中一项：');
  console.error('        ADMIN_PASSWORD=\'你的强口令\'                     # 口令登录（换取超级管理员会话）');
  console.error('        ADMIN_TOKENS=\'{"tok_long_enough":{"role":"operator","name":"运营A"}}\'  # 分角色长期令牌');
  console.error('        或直接设置 ADMIN_PAGE=off 关闭运营后台。');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && ADMIN_PAGE && adminAuth.usingDevPassword()) {
  console.error('[fatal] NODE_ENV=production 下不允许使用开发默认管理员口令，拒绝启动。');
  console.error('        请设置 ADMIN_PASSWORD。');
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  const routes = router.describe();
  const authed = routes.filter((r) => r.auth).length;
  log('─'.repeat(64));
  log('莱克企业商城小程序 · 自建后端已启动');
  log(`监听地址   http://127.0.0.1:${PORT}`);
  log(`接口调试台 http://127.0.0.1:${PORT}/debug  ${DEBUG_PAGE ? '（已开放，线上请设 DEBUG_PAGE=off）' : '（已关闭）'}`);
  log(`店铺装修台 http://127.0.0.1:${PORT}/admin  ${ADMIN_PAGE ? '（逐个页面改前端，发布写回 replica.js）' : '（已关闭）'}`);
  log(`前端预览   http://127.0.0.1:${PORT}/preview  ${DEBUG_PAGE ? '（发布后看线上效果，直接编译真机 WXML+WXSS）' : '（已关闭）'}`);
  log(`后台控制台 http://127.0.0.1:${PORT}/console  ${ADMIN_PAGE ? '（商品/订单/客户/营销/设置）' : '（已关闭）'}`);
  log(`管理接口   ${ADMIN_PAGE
    ? '（全部要求管理员令牌；只读=viewer、日常运营=operator、删素材/发布/删除商品=owner）'
    : '（已随页面一同关闭，返回 403）'}`);
  log(`管理员凭证 ${!adminAuth.configured()
    ? '⚠️  未配置，登录不可用（ADMIN_PASSWORD 或 ADMIN_TOKENS 至少设置一项）'
    : (adminAuth.usingDevPassword()
      ? `⚠️  正在使用开发默认口令（${ADMIN_PAGE ? '请立刻设置' : ''} ADMIN_PASSWORD），仅限本机联调`
      : `已配置（长期令牌 ${adminAuth.tokenCount()} 条）`)}`);
  log(`点位总数   ${routes.length + 2} 个（业务 ${routes.length} + 运维 2，需登录 ${authed} 个）`);
  log(`数据文件   ${store.DB_FILE}`);
  media.ensureDir(media.ROOT);
  let mediaCount = 0;
  try { mediaCount = media.list({ size: 1 }).stat.count; } catch (e) { /* 首次启动无目录 */ }
  log(`素材目录   ${media.ROOT}（已有 ${mediaCount} 个，对外访问 ${media.URL_PREFIX}/…，上限 图片 ${media.humanSize(media.MAX_BYTES)} / 视频 ${media.humanSize(media.MAX_VIDEO_BYTES)}）`);
  log(`微信能力   登录=${wechat.HAS_WX_LOGIN ? '真实接口' : '本地模拟'}  支付=${wechat.HAS_WX_PAY ? '真实接口' : '本地模拟'}`);
  log(`JWT 密钥   ${authLib.IS_DEFAULT_SECRET ? '⚠️  使用开发默认值，上线前必须设置 JWT_SECRET' : '已自定义'}`);
  log(`小程序端   把 utils/constants.js 的 ENV 改为 local 即可联调`);
  log('─'.repeat(64));
});

/* 优雅退出：先把内存数据落盘，避免丢单 */
['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    log('收到退出信号，正在落盘…');
    store.flushNow();
    server.close(() => process.exit(0));
    // 兜底：1 秒内没关完就强退
    setTimeout(() => process.exit(0), 1000);
  });
});

module.exports = server;
