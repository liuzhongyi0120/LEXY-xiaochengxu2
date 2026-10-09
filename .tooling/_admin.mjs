/**
 * 测试脚本共用的「管理员会话」助手。
 *
 * 背景（整改报告 08）：`/api/admin/*`、`/api/decorate/*`、`/api/media/*` 全部要求管理员令牌，
 * 此前这些脚本都是匿名调用，08 之后一律 401 —— 脚本要么报「服务未启动」，
 * 要么抛出一堆看不懂的失败，很容易被误判成「环境坏了」。
 *
 * 凭证来源（与 check-all.mjs 同一优先级）：
 *   1) ADMIN_TOKEN    → 直接验证（对应服务端 ADMIN_TOKENS 长期令牌）
 *   2) ADMIN_PASSWORD → POST /api/admin/login 换会话令牌
 *   3) 非生产环境      → 开发默认口令 admin
 * 都拿不到就抛错，并在消息里写清怎么配。
 */

const DEFAULT_BASE = 'http://127.0.0.1:3000';

async function json(res) {
  try { return await res.json(); } catch (e) { return null; }
}

/** 换取一个可用的管理员令牌 */
export async function adminToken(base = DEFAULT_BASE) {
  const env = String(process.env.ADMIN_TOKEN || '').trim();
  const candidates = [];
  if (env) candidates.push({ bearer: env });
  [process.env.ADMIN_PASSWORD, process.env.NODE_ENV === 'production' ? '' : 'admin']
    .filter(Boolean)
    .forEach((password) => candidates.push({ password }));

  const errors = [];
  for (const c of candidates) {
    if (c.bearer) {
      const j = await json(await fetch(base + '/api/admin/session', {
        headers: { Authorization: 'Bearer ' + c.bearer }
      }));
      if (j && j.code === 0) return c.bearer;
      errors.push('ADMIN_TOKEN 无效');
    } else {
      const j = await json(await fetch(base + '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: c.password })
      }));
      if (j && j.code === 0 && j.data && j.data.token) return j.data.token;
      errors.push('口令登录失败');
    }
  }
  throw new Error('拿不到管理员会话（' + (errors.join(' / ') || '未提供任何凭证') +
    '）：请设置 ADMIN_PASSWORD 或 ADMIN_TOKEN 后重跑');
}

/** 带管理员身份的请求头 */
export function authHeaders(token, extra) {
  return Object.assign({ Authorization: 'Bearer ' + token }, extra || {});
}

export default adminToken;
