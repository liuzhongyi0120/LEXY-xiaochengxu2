/**
 * HTTP 层：请求解析 / 统一响应 / CORS / 业务错误
 *
 * 统一响应结构（与技术方案第六章一致）：
 *   成功 { code: 0, msg: 'ok', data: {...} }
 *   失败 { code: <非0>, msg: '<可展示的提示>' }
 */

const { URL } = require('node:url');

/** 业务错误码 */
const ERR = {
  OK: 0,
  PARAM: 1001,        // 参数错误
  UNAUTHORIZED: 401,  // 未登录 / token 失效
  FORBIDDEN: 403,     // 无权限
  NOT_FOUND: 404,     // 资源不存在
  BIZ: 2000,          // 通用业务失败（如库存不足、状态不允许）
  SERVER: 5000        // 服务端异常
};

/** 业务异常，由路由抛出，统一由入口捕获成响应 */
class BizError extends Error {
  constructor(msg, code = ERR.BIZ, httpStatus = 200) {
    super(msg);
    this.name = 'BizError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** 读取并解析请求体：兼容 JSON 与表单 */
function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      // 限制 2MB，防止超大 body 打爆内存
      if (size > 2 * 1024 * 1024) {
        req.destroy();
        resolve({});
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      const type = String(req.headers['content-type'] || '');
      try {
        if (type.includes('application/x-www-form-urlencoded')) {
          const obj = {};
          new URLSearchParams(raw).forEach((v, k) => { obj[k] = v; });
          return resolve(coerce(obj));
        }
        return resolve(coerce(JSON.parse(raw)));
      } catch (e) {
        return resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/** 把纯数字型字符串转成数字，避免前端传 '1' 被当成字符串比较 */
function coerce(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(coerce);
  const out = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (typeof v === 'string' && v !== '' && /^-?\d+(\.\d+)?$/.test(v)) {
      out[k] = Number(v);
    } else if (v && typeof v === 'object') {
      out[k] = coerce(v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

/** 解析 query 参数（同样做数字归一） */
function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  const raw = {};
  u.searchParams.forEach((v, k) => { raw[k] = v; });
  return coerce(raw);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

/** 发送 JSON 响应 */
function send(res, httpStatus, body) {
  const payload = JSON.stringify(body);
  res.writeHead(httpStatus, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  }, corsHeaders()));
  res.end(payload);
}

/** 成功响应：直接下发 data */
function ok(res, data = null, msg = 'ok') {
  send(res, 200, { code: ERR.OK, msg, data });
}

/** 失败响应 */
function fail(res, msg, code = ERR.BIZ, httpStatus = 200) {
  send(res, httpStatus, { code, msg, data: null });
}

/** 预检 */
function preflight(res) {
  res.writeHead(204, corsHeaders());
  res.end();
}

module.exports = {
  ERR,
  BizError,
  parseBody,
  parseQuery,
  send,
  ok,
  fail,
  preflight,
  corsHeaders
};
