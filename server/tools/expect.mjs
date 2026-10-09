/**
 * 一次请求「算不算通过」的唯一判定（纯函数）。
 *
 * 为什么单独抽出来：
 *   报告 15 指出自检的 expectFail 判定过宽 ——
 *   `passed = businessFailed || httpStatus in (401,403,404)`，
 *   只要服务「正常应答了且业务码非 0」就算通过。
 *   于是**任何服务端异常**（统一响应壳里的 code 5000，或 HTTP 5xx）
 *   都会被当成「预期拦截成功」，权限与参数校验用例形同虚设：
 *   接口崩了，自检还是全绿。
 *
 * 现在的判定顺序（先排除「假通过」，再校验具体期望）：
 *   1) 请求没完成（网络错误、非 JSON 响应）→ 失败
 *   2) HTTP 5xx 或业务码 5000（服务端异常）→ 失败，**无论是否写了 expectFail**
 *   3) expectFail：必须真的被拦下（业务码非 0 或 HTTP 401/403/404）
 *      且写了 expectHttp / expectCode 时必须逐一命中
 *   4) 非 expectFail：必须 HTTP 200 + 业务码 0
 *
 * 判定逻辑放在这里（而不是 check-all.mjs 内部）是为了能被单测直接喂输入断言，
 * 见 .tooling/test-nontrade.mjs「15 · 判定函数」一节。
 */

/** 统一响应壳里的「服务端异常」业务码（与 lib/http.js 的 ERR.SERVER 一致） */
export const SERVER_CODE = 5000;

/**
 * @param {object} o
 * @param {number} o.httpStatus  实际 HTTP 状态码（0 = 请求未完成）
 * @param {object|null} o.json   解析后的响应体
 * @param {string} o.errMsg      请求层错误（网络 / 非法 JSON 响应）
 * @param {string} o.expectFail  非空 = 本次「期望被拦截」
 * @param {number|null} o.expectHttp 期望的 HTTP 状态（给了就必须命中）
 * @param {number|null} o.expectCode 期望的业务码（给了就必须命中）
 * @returns {{passed:boolean, reason:string}}
 */
export function judge(o = {}) {
  const status = Number(o.httpStatus) || 0;
  const json = o.json || null;
  const code = json && typeof json.code === 'number' ? json.code : null;
  const errMsg = o.errMsg || '';
  const { expectFail = '', expectHttp = null, expectCode = null } = o;

  /* 1) 请求本身没完成 */
  if (errMsg) return { passed: false, reason: '请求未完成：' + errMsg };

  /* 2) 服务端异常绝不算「预期拦截」 */
  if (status >= 500) {
    return { passed: false, reason: `服务端错误 HTTP ${status}（服务端异常不得被当作预期拦截）` };
  }
  if (code === SERVER_CODE) {
    const m = (json && json.msg) || '';
    return { passed: false, reason: `服务端异常 code ${SERVER_CODE}${m ? '：' + m : ''}（不得被当作预期拦截）` };
  }

  if (expectFail) {
    const blocked = (code !== null && code !== 0) || status === 401 || status === 403 || status === 404;
    if (!blocked) {
      return { passed: false, reason: `期望被拦截，实际成功（HTTP ${status} / code ${code}）` };
    }
    if (expectHttp !== null && expectHttp !== undefined && status !== expectHttp) {
      return { passed: false, reason: `期望 HTTP ${expectHttp}，实际 ${status}` };
    }
    if (expectCode !== null && expectCode !== undefined && code !== expectCode) {
      return { passed: false, reason: `期望业务码 ${expectCode}，实际 ${code}` };
    }
    return { passed: true, reason: '' };
  }

  /* 3) 正常请求 */
  if (status !== 200) return { passed: false, reason: `期望 HTTP 200，实际 ${status}` };
  if (code !== 0) {
    const m = (json && json.msg) || '';
    return { passed: false, reason: `期望业务码 0，实际 ${code}${m ? '：' + m : ''}` };
  }
  return { passed: true, reason: '' };
}

export default judge;
