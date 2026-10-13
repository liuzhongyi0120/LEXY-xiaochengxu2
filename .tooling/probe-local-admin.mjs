/**
 * 一次性探针：确认本机后台各入口是否真的打得开。
 * 用法：node .tooling/probe-local-admin.mjs
 * 判据：HTML 入口 200 + Content-Type 是 text/html；管理接口无令牌应 401/403（不是 404/连不上）。
 */
const BASE = 'http://127.0.0.1:3000';

const PAGES = [
  ['装修台', '/admin'],
  ['控制台', '/console'],
  ['前端预览', '/preview'],
  ['接口调试台', '/debug'],
  ['首页(线上预览)', '/'],
];

async function probe(name, path) {
  try {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    const ct = res.headers.get('content-type') || '';
    const body = res.status === 200 && ct.includes('html') ? await res.text() : '';
    const len = res.status === 200 ? (body ? body.length : Number(res.headers.get('content-length') || 0)) : 0;
    const hasTitle = /<title>([^<]*)<\/title>/.exec(body || '');
    return { name, path, status: res.status, ct: ct.split(';')[0], len, title: hasTitle ? hasTitle[1].trim() : '' };
  } catch (e) {
    return { name, path, status: 'ERR', ct: '', len: 0, title: String(e.message || e).slice(0, 60) };
  }
}

const rows = [];
for (const [n, p] of PAGES) rows.push(await probe(n, p));

console.log('入口          路径         状态  类型           字节    标题');
for (const r of rows) {
  console.log(
    String(r.name).padEnd(12, ' ') + String(r.path).padEnd(13, ' ') +
    String(r.status).padEnd(5, ' ') + String(r.ct).padEnd(15, ' ') +
    String(r.len).padEnd(7, ' ') + r.title
  );
}

// 管理接口：无令牌必须是 401/403（证明「点位在、只是要鉴权」，而不是服务没了）
const api = await fetch(BASE + '/api/admin/goods').then((r) => r.status).catch((e) => 'ERR ' + e.message);
console.log('\n/api/admin/goods（无令牌）→', api, '（期望 401/403）');

const bad = rows.filter((r) => r.status !== 200).length;
console.log(`\n结论：${rows.length - bad}/${rows.length} 个入口可打开`);
process.exit(bad === 0 ? 0 : 1);
