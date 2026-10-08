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
const PUBLIC_DIR = nodePath.join(__dirname, 'public');

/** 运营管理接口前缀：受 DEBUG_PAGE 开关约束（关闭页面时必须一并关闭） */
const MANAGE_API_PREFIXES = ['/api/admin/', '/api/decorate/', '/api/media/'];

/** 页面入口路由 → public 下的文件 */
const STATIC_PAGES = {
  '/': 'debug.html',
  '/debug': 'debug.html',
  '/debug/': 'debug.html',
  '/admin': 'admin/index.html',
  '/admin/': 'admin/index.html',
  '/console': 'console/index.html',
  '/console/': 'console/index.html'
};

/** 允许直接访问的静态子目录（前缀 → public 下的目录） */
const STATIC_DIRS = { '/admin/': 'admin/', '/console/': 'console/' };

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

/** 素材库对外访问的图片类型（比管理页的静态资源宽，含 webp / gif） */
const UPLOAD_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

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
    fail(res, '不支持的素材类型（仅图片）', ERR.FORBIDDEN, 403);
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
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=604800' });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      ETag: etag,
      'Cache-Control': 'public, max-age=604800'
    });
    fs.createReadStream(file).pipe(res);
  });
  return true;
}

/**
 * 静态资源处理：命中返回 true（响应已发出），未命中返回 false
 * 开启开关：调试台与装修后台都只在开发环境开放，线上设 DEBUG_PAGE=off 一并关闭
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

  if (!DEBUG_PAGE) {
    fail(res, '管理页面已关闭（设置 DEBUG_PAGE=1 可临时开启）', ERR.FORBIDDEN, 403);
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

  /* 静态页：接口调试台（/debug）与店铺装修后台（/admin） */
  if (method === 'GET' && tryStatic(path, res)) return;

  /* 素材库图片：/uploads/…（不受管理页面开关影响） */
  if (method === 'GET' && tryUploads(path, req, res)) return;

  /* 图标：避免浏览器反复 404 干扰日志 */
  if (method === 'GET' && path === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  /*
   * 运营管理点位同样受管理页面开关约束。
   *
   * ⚠️ 只关页面不管接口是**假关闭**：`/admin` 打不开了，但
   *    `POST /api/admin/goods/delete`、`/api/admin/settings/save`、`/api/media/upload`
   *    仍可被任何人匿名调用（改商品、改店铺配置、往服务器写文件）。
   *    因此这三个前缀在开关关闭时一并返回 403，与页面同进同退。
   *    （`/uploads/…` 静态图片不在此列——那是小程序线上内容，必须始终可访问。）
   */
  if (!DEBUG_PAGE && MANAGE_API_PREFIXES.some((p) => path.indexOf(p) === 0)) {
    return fail(res, '管理接口已关闭（设置 DEBUG_PAGE=1 可临时开启）', ERR.FORBIDDEN, 403);
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
      debugPage: DEBUG_PAGE ? 'on' : 'off'
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

server.listen(PORT, HOST, () => {
  const routes = router.describe();
  const authed = routes.filter((r) => r.auth).length;
  log('─'.repeat(64));
  log('莱克企业商城小程序 · 自建后端已启动');
  log(`监听地址   http://127.0.0.1:${PORT}`);
  log(`接口调试台 http://127.0.0.1:${PORT}/debug  ${DEBUG_PAGE ? '（已开放，线上请设 DEBUG_PAGE=off）' : '（已关闭）'}`);
  log(`店铺装修台 http://127.0.0.1:${PORT}/admin  ${DEBUG_PAGE ? '（逐个页面改前端，发布写回 replica.js）' : '（已关闭）'}`);
  log(`后台控制台 http://127.0.0.1:${PORT}/console  ${DEBUG_PAGE ? '（商品/订单/客户/营销/设置）' : '（已关闭）'}`);
  log(`管理接口   ${DEBUG_PAGE ? '（41 个 admin/decorate/media 点位随页面一同开放）' : '（已随页面一同关闭，返回 403）'}`);
  log(`点位总数   ${routes.length + 2} 个（业务 ${routes.length} + 运维 2，需登录 ${authed} 个）`);
  log(`数据文件   ${store.DB_FILE}`);
  media.ensureDir(media.ROOT);
  let mediaCount = 0;
  try { mediaCount = media.list({ size: 1 }).stat.count; } catch (e) { /* 首次启动无目录 */ }
  log(`素材目录   ${media.ROOT}（已有 ${mediaCount} 张，对外访问 ${media.URL_PREFIX}/…，单张上限 ${media.humanSize(media.MAX_BYTES)}）`);
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
