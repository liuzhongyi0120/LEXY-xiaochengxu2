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

/** 请求体体积上限（普通 JSON 接口） */
const MAX_JSON_BODY = 2 * 1024 * 1024;

/**
 * 读取并解析请求体：兼容 JSON 与表单。
 *
 * ⚠️ 两个刻意的行为：
 *   1）非法 JSON **必须报错**，不能静默变成空对象 ——
 *      早前 catch 里 `resolve({})`，等于把「客户端发坏了」伪装成「没传参数」，
 *      调用方拿到的提示是「请填写商品名称」这种看不出真因的校验失败，
 *      更糟的是可能带着半截参数把数据改了。
 *   2）合法 JSON 但不是对象（null / 123 / "abc" / []）同样报错 ——
 *      与持久化层同一个道理：JSON.parse 成功 ≠ 数据可用。
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY) {
        req.destroy();
        done(reject, new BizError('请求体过大（上限 2MB）', ERR.PARAM, 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return done(resolve, {});
      const type = String(req.headers['content-type'] || '');
      if (type.includes('application/x-www-form-urlencoded')) {
        const obj = {};
        new URLSearchParams(raw).forEach((v, k) => { obj[k] = v; });
        return done(resolve, numericize(obj));
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return done(reject, new BizError('请求体不是合法 JSON', ERR.PARAM, 400));
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return done(reject, new BizError('请求体必须是 JSON 对象', ERR.PARAM, 400));
      }
      // 已经是 JSON，类型由客户端给出，不再做任何猜测式转换
      return done(resolve, parsed);
    });
    req.on('error', () => done(reject, new BizError('读取请求体失败', ERR.PARAM, 400)));
  });
}

/**
 * 需要按数字处理的**通用**参数（页码 / 数量 / 计数类）。
 *
 * 这是本文件里唯一允许「字符串 → 数字」的地方，而且只作用于明确的键名。
 * 之前的写法是递归把**所有**形如 `^-?\d+(\.\d+)?$` 的字符串都转成 Number，
 * 它分不清「数字字段」和「长得像数字的文本」——
 * 邮编 `010010` 会变成 10010，编号 `00123` 会变成 123，
 * 纯数字昵称与长数字标识还会丢精度。名称、标识、手机号、编码一律保持字符串。
 */
const NUMERIC_KEYS = ['page', 'size', 'limit', 'quantity', 'count', 'days',
  'value', 'threshold', 'stock', 'num', 'idx', 'index', 'target'];

/** 只对白名单键做数字归一（对象/数组递归，但键名仍受白名单约束） */
function numericize(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(numericize);
  const out = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (typeof v === 'string' && NUMERIC_KEYS.indexOf(k) > -1 && v !== '' && /^-?\d+(\.\d+)?$/.test(v)) {
      out[k] = Number(v);
    } else if (v && typeof v === 'object') {
      out[k] = numericize(v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

/** 解析 query 参数（仅白名单键做数字归一，其余原样保留为字符串） */
function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  const raw = {};
  u.searchParams.forEach((v, k) => { raw[k] = v; });
  return numericize(raw);
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
