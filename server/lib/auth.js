/**
 * 鉴权层：JWT 签发与校验（HS256，使用 Node 内置 crypto，零第三方依赖）
 *
 * 约定：
 *   - 请求头 Authorization: Bearer <token>
 *   - token 默认 7 天有效期，payload 只放 userId（不放手机号等敏感信息）
 *   - 密钥来自环境变量 JWT_SECRET，未配置时使用开发默认值并在启动日志告警
 */

const crypto = require('node:crypto');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TTL = Number(process.env.JWT_TTL || 7 * 24 * 3600); // 秒

const IS_DEFAULT_SECRET = !process.env.JWT_SECRET;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function sign(payload, ttl = TTL) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = Object.assign({}, payload, {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl
  });
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

/** 校验并解出 payload；失败返回 null */
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  const expect = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  const actual = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  // 长度不等时 timingSafeEqual 会抛错，先挡一层
  if (expect.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expect, actual)) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(p));
  } catch (e) {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** 从请求头取出 token 并解出 userId */
function getUserId(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(auth).trim());
  if (!m) return null;
  const payload = verify(m[1]);
  return payload ? payload.userId : null;
}

module.exports = { sign, verify, getUserId, TTL, IS_DEFAULT_SECRET };
