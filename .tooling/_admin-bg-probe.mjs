/**
 * 装修台手机壳的**页面底色**取证（/admin?edit=<key>）。
 *
 * 为什么单独一个探针：
 *   `/preview` 与装修台是**两条链路**（MEMORY 铁律 3）。`/preview` 直接编译真机源码，
 *   真机 WXML 的根节点 `style="background: {{meta.bg || '#F5F6F8'}}"` 天然生效；
 *   而装修台走 `PvRender.render()` 的近似渲染，底色**得自己画**。
 *   原先没画，靠手机壳自己的 `.phone-screen { background: #fff }` 顶着 ——
 *   运营在装修台照着白底调、真机却是灰的（复刻 03「创业故事」时正好反过来）。
 *   `pv-render.js` 加了 `pvPageBg()` 之后，这里负责**在真浏览器里**确认它确实生效，
 *   而不是只信源码里那一行字符串。
 *
 * 前置：node server/index.js（DEBUG_PAGE 开启）+ CDP 代理（3456）。
 * 用法：node .tooling/_admin-bg-probe.mjs [--keys home,p297,p301]
 */
const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : (args.find((a) => a.startsWith(n + '=')) || '').split('=')[1] || d;
};
const KEYS = getArg('--keys', 'home,p297,p301').split(',').map((s) => s.trim()).filter(Boolean);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); } };

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, wait = 2500) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id || (r.target && r.target.id);
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (r && r.value !== undefined) return typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
  return '';
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });

const ADMIN_PW = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
const TOKEN = await (async () => {
  const r = await fetch(SITE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW })
  });
  const jj = await r.json().catch(() => null);
  return jj && jj.code === 0 && jj.data ? jj.data.token : '';
})();
if (!TOKEN) { console.error('拿不到管理员会话'); process.exit(1); }

/* 期望底色从**接口**读（不写死），这样断言锁的是「装修台画出来的 == 该页 meta.bg」这个等价关系 */
const want = {};
for (const k of KEYS) {
  const r = await fetch(SITE + '/api/decorate/page?key=' + encodeURIComponent(k),
    { headers: { Authorization: 'Bearer ' + TOKEN } });
  const jj = await r.json();
  want[k] = (jj.data && jj.data.data && jj.data.data.meta && jj.data.data.meta.bg) || null;
}

for (const key of KEYS) {
  console.log(`\n═══ 装修台 /admin?edit=${key} ═══`);
  const tab = await open(SITE + '/admin?edit=' + encodeURIComponent(key));
  await run(tab, `(() => { localStorage.setItem('lexy_admin_token', ${JSON.stringify(TOKEN)}); return 'ok'; })()`);
  await j('/navigate?target=' + tab, { method: 'POST', body: SITE + '/admin?edit=' + encodeURIComponent(key) });
  await sleep(3200);

  const got = await run(tab, `(() => {
    const host = document.getElementById('preview');
    if (!host) return JSON.stringify({ err: '没有 #preview' });
    const wrap = host.querySelector('.pv-page');
    const cs = (e) => (e ? getComputedStyle(e).backgroundColor : null);
    /* 判「是否进入编辑器」看 #viewList.hidden：列表态是 false（页面列表可见）、
       编辑态是 true（被区块树替换掉）。**不是** !hidden —— 同一份 DOM 实测：
         /admin            → viewList.hidden=false、#preview 内容 0B
         /admin?edit=home  → viewList.hidden=true 、#preview 内容 8712B
       （#edPageTag / #phTitle 在静态 HTML 里就有默认文案，拿它们判断会被误导。） */
    return JSON.stringify({
      editorIn: document.getElementById('viewList').hidden === true,
      wrapBg: cs(wrap),
      hostBg: cs(host),
      shellBg: cs(document.querySelector('.phone-screen')),
      blocks: host.querySelectorAll('[data-path]').length
    });
  })()`);
  let d = {};
  try { d = JSON.parse(got); } catch (e) { d = { err: got }; }
  if (d.err) { ok(false, '装修台能读到 #preview', d.err); await close(tab); continue; }

  /* 接口返回的 #RRGGBB → rgb(r, g, b)，与浏览器口径对齐后再比 */
  const hex = String(want[key] || '').replace('#', '');
  const expand = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const expect = expand.length === 6
    ? `rgb(${parseInt(expand.slice(0, 2), 16)}, ${parseInt(expand.slice(2, 4), 16)}, ${parseInt(expand.slice(4, 6), 16)})`
    : null;

  console.log(`  编辑器内=${d.editorIn}　区块数=${d.blocks}`);
  console.log(`  手机壳=.phone-screen ${d.shellBg}　#preview ${d.hostBg}`);
  console.log(`  页面底色=.pv-page ${d.wrapBg}　（接口 meta.bg=${want[key]} → 期望 ${expect}）`);

  ok(!!d.editorIn, '确实进了编辑器（#viewList 已隐藏）', 'editorIn=' + d.editorIn);
  ok(d.blocks > 0, '手机壳里渲染出了区块', 'blocks=' + d.blocks);
  ok(!!expect, '接口能读到该页 meta.bg', String(want[key]));
  /* 这一条才是本探针的目的：近似渲染也必须把页面底色画出来 */
  ok(!!d.wrapBg && d.wrapBg === expect,
    '装修台手机壳画出了页面底色（== 该页 meta.bg，不再是手机壳自带的白）',
    `wrap=${d.wrapBg} 期望=${expect} 壳=${d.shellBg}`);
  await close(tab);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
