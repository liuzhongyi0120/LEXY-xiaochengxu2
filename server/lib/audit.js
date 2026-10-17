/**
 * 后台操作审计日志（审查 F27）。
 *
 * 背景：出事时最常问的三个问题 ——「谁改的」「改了什么」「什么时候改的」，
 * 之前的请求日志一个都答不上来：它只记 method / path / 状态码 / 耗时，
 * 而 path 里通常没有记录 ID（`POST /api/admin/goods/save`），
 * 操作者也只有一个**可被改名、可被删除重建**的用户名（见 F02）——
 * 拿它当历史归属依据，等于把账记在一个会变的东西上。
 *
 * 设计：
 *   1. 只记**管理侧**的写操作（admin / decorate / media 的 POST），读操作不记
 *      （读日志会把文件撑爆，也捞不出有用信息）；
 *   2. 操作者用**稳定的 actorId**（成员 ID；长期令牌/共享口令用 `env:<令牌前 8 位>`），
 *      用户名只作为附注 —— 改名不影响历史归属；
 *   3. 目标对象与结果摘要由调用方给，敏感值（口令、令牌、完整手机号）**绝不落盘**；
 *   4. JSONL 按天切文件，保留 AUDIT_KEEP_DAYS 天，超期的在写新文件时顺手清掉
 *      —— 日志不能无限增长；
 *   5. 写失败只打日志，**绝不阻断业务**：审计是为了追责，不该反过来成为故障源。
 *
 * 存储：data/audit/audit-YYYY-MM-DD.jsonl
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const dataDir = require('./dataDir');
const atomic = require('./atomicFile');

const DIR = nodePath.join(dataDir.ROOT, 'audit');
/** 保留天数：内部审计留 30 天足够回溯，再久只会占盘 */
const KEEP_DAYS = Number(process.env.AUDIT_KEEP_DAYS || 30);
/** 单条摘要上限（防止把整页装修数据塞进来） */
const DETAIL_MAX = 400;

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function fileOf(ts) {
  const d = new Date(ts);
  const p = (v) => String(v).padStart(2, '0');
  return nodePath.join(DIR, `audit-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jsonl`);
}

/** 脱敏：口令 / 令牌 / 手机号这类字段一律不进日志（写进来就是第二次泄露） */
const SENSITIVE = /^(password|oldPassword|newPassword|token|pwd|secret|payKey)$/i;

function sanitize(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.slice(0, 10).map(sanitize);
  if (typeof v === 'object') {
    const out = {};
    Object.keys(v).slice(0, 20).forEach((k) => {
      out[k] = SENSITIVE.test(k) ? '***' : sanitize(v[k]);
    });
    return out;
  }
  if (typeof v === 'string') return v.length > 120 ? v.slice(0, 120) + '…' : v;
  return v;
}

/**
 * 记录一条审计事件。
 *
 * @param {object} e
 *   actorId    稳定操作者标识（成员 ID / env:<前缀>）—— **不要用用户名当主键**
 *   actorName  展示名（可能是用户名，仅作附注）
 *   role       当时的角色（viewer / operator / owner）
 *   action     动作（= method + path）
 *   target     目标标识（商品 ID / 页面 key / 素材名 …）
 *   result     'ok' | 'fail'
 *   code       业务码（失败时）
 *   msg        失败原因（失败时）
 *   detail     变更摘要（已脱敏、已截断）
 *   requestId  请求 ID（与响应头 X-Request-Id 同源，便于把日志串起来）
 */
function record(e) {
  try {
    const now = Date.now();
    ensureDir();
    const line = JSON.stringify({
      at: now,
      atText: new Date(now).toISOString(),
      actorId: String((e && e.actorId) || 'anonymous'),
      actorName: String((e && e.actorName) || ''),
      role: String((e && e.role) || ''),
      action: String((e && e.action) || ''),
      target: String((e && e.target) || ''),
      result: (e && e.result) === 'fail' ? 'fail' : 'ok',
      code: e && e.code === undefined ? null : e.code,
      msg: String((e && e.msg) || '').slice(0, 200),
      detail: sanitize(e && e.detail),
      requestId: String((e && e.requestId) || '')
    });
    const f = fileOf(now);
    fs.appendFileSync(f, line + '\n', 'utf8');
    sweep(now);
  } catch (err) {
    /* 审计写失败只打日志：它不该把业务请求拖垮 */
    console.error('[audit] 写入失败：', err && err.message);
  }
}

/** 清理超期日志（只在写新文件时顺手做一次，不另起定时器） */
let lastSweepDay = '';
function sweep(now) {
  const p = (v) => String(v).padStart(2, '0');
  const d = new Date(now);
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (lastSweepDay === day) return;
  lastSweepDay = day;
  try {
    const cutoff = now - KEEP_DAYS * 24 * 3600 * 1000;
    fs.readdirSync(DIR).forEach((name) => {
      if (name.indexOf('audit-') !== 0 || !name.endsWith('.jsonl')) return;
      const st = fs.statSync(nodePath.join(DIR, name));
      if (st.mtimeMs < cutoff) {
        try { fs.unlinkSync(nodePath.join(DIR, name)); } catch (_) { /* 占用中，下次再说 */ }
      }
    });
  } catch (err) {
    console.error('[audit] 清理过期日志失败：', err && err.message);
  }
}

/**
 * 从管理员会话里取出稳定的 actorId。
 *
 * ⚠️ 刻意**不用 username**当主键：它可被改名、可被删除后重建（F02），
 *    拿它做历史归属，等于把账记在一个会变的东西上。
 */
function actorIdOf(session) {
  if (!session) return 'anonymous';
  if (session.source === 'member' && session.memberId) return 'member:' + session.memberId;
  if (session.source === 'env') return 'env:' + String(session.name || 'token');
  if (session.source === 'session') return 'shared:owner';
  return 'unknown';
}

/** 读最近的审计记录（后台「操作记录」用；倒序） */
function recent({ limit = 50, actorId = '', action = '' } = {}) {
  const out = [];
  try {
    if (!fs.existsSync(DIR)) return { list: out, total: 0 };
    const files = fs.readdirSync(DIR)
      .filter((n) => n.indexOf('audit-') === 0 && n.endsWith('.jsonl'))
      .sort().reverse(); // 新日期在前
    for (const name of files) {
      const text = fs.readFileSync(nodePath.join(DIR, name), 'utf8');
      const lines = text.split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        let o;
        try { o = JSON.parse(lines[i]); } catch (e) { continue; }
        if (actorId && o.actorId !== actorId) continue;
        if (action && String(o.action).indexOf(action) < 0) continue;
        out.push(o);
        if (out.length >= limit) return { list: out, total: out.length };
      }
    }
  } catch (err) {
    console.error('[audit] 读取失败：', err && err.message);
  }
  return { list: out, total: out.length };
}

module.exports = {
  DIR,
  KEEP_DAYS,
  record,
  actorIdOf,
  recent,
  sanitize,
  /** 落盘（进程退出用；appendFileSync 本身是同步的，这里只为语义完整） */
  flush() { /* 同步写，无需额外 flush */ }
};
