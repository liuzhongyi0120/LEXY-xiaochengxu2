/**
 * 一次性探针：确认线上（14.103.50.137）后端本身是否存活。
 * 只做只读 GET，不改任何线上数据。
 * 用法：node .tooling/probe-online-alive.mjs
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const TARGETS = [
  ['线上首页（nginx 根）', 'https://14.103.50.137/'],
  ['线上后台 /admin', 'https://14.103.50.137/admin'],
  ['线上控制台 /console', 'https://14.103.50.137/console'],
  ['线上装修台接口', 'https://14.103.50.137/mall-api/api/decorate/state'],
  ['线上健康/只读接口', 'https://14.103.50.137/mall-api/api/shop/settings'],
  ['线上 /images/tabbar/首页.png', 'https://14.103.50.137/mall-api/images/tabbar/index.png'],
];

async function hit(label, url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const ct = (res.headers.get('content-type') || '').split(';')[0];
    return `${label.padEnd(26, ' ')} ${String(res.status).padEnd(6)} ${ct.padEnd(20)} ${Date.now() - t0}ms`;
  } catch (e) {
    return `${label.padEnd(26, ' ')} ERR    ${String(e.message || e).slice(0, 50)} (${Date.now() - t0}ms)`;
  }
}

for (const [l, u] of TARGETS) console.log(await hit(l, u));
