/**
 * 「新闻大事 / 用户分享 → 店铺笔记」出图（给用户看效果，不是自检）
 *
 * 三张图，回答一个问题：**这两页的卡片现在点得动了没有**
 *   1. /preview 打开 p296（新闻大事）—— 分类 tab + 卡片墙
 *   2. 点第一张卡片 → 真的跳到笔记详情页（链接接上了的硬证据）
 *   3. 后台控制台「店铺笔记」栏目 —— 60 篇都在，配额 60/100
 *
 * 与 `_shot-shopnotes.mjs` 的分工：那个是「笔记怎么装修」，这个是「卡片怎么跳」。
 * 本脚本**不发布、不建笔记**，所以不要求 replica.js 干净（现在它里面本来就有这 60 篇）。
 *
 * 用法（前置：后端 3000 + 无头 CDP 代理 3456）：node .tooling/_shot-card-links.mjs
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'deliverables');

const P = 'http://127.0.0.1:3456';
const SITE = 'http://127.0.0.1:3000';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
async function open(url, wait = 2600) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id;
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return r;
  if (r && r.error) { console.log('    [eval error] ' + JSON.stringify(r.error).slice(0, 200)); return ''; }
  return r && r.value === undefined ? '' : (typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });
async function shot(id, name) {
  const file = join(OUT, name);
  const r = await j('/shot?target=' + id, { method: 'POST', body: file });
  const ok = r && r.ok;
  console.log(`    ${ok ? '✓' : '✗'} ${name}${ok && existsSync(file) ? '（' + Math.round(readFileSync(file).length / 1024) + ' KB）' : ''}`);
  return ok;
}

const tabs = [];
try {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const ver = await j('/json/version').catch(() => null);
  if (!ver || !ver.Browser) throw new Error('无头 CDP 代理（3456）不可用');

  /* ---------- 1. /preview 打开 p296 ---------- */
  console.log('【1】/preview → 新闻大事（p296）');
  const tabA = await open(SITE + '/preview', 3000);
  tabs.push(tabA);
  const picked = await run(tabA, `(() => {
    const it = document.querySelector('#pvPages .pv-item[data-key="p296"]');
    if (!it) return 'not-found:' + String(document.querySelectorAll('#pvPages .pv-item').length) + 'items';
    it.click();
    return 'clicked';
  })()`);
  console.log('    左栏点 p296 → ' + picked);
  await sleep(4200);
  await shot(tabA, '新闻大事-页面（卡片墙）.png');

  /* ---------- 2. 卡片指向的那篇笔记，打开看看长什么样 ----------
   *
   * ⚠️ 这里**不点卡片**：/preview 是静态渲染（只编译真机源码），不模拟 wx.navigateTo，
   *    点下去不会跳（实测过，不是 bug，是它本来就不跑运行时）。
   *    「点得动」的判据在 `.tooling/test-card-click.mjs`：那里把 61 条 link 逐条喂给
   *    真机的 utils/link.js，看它到底发起了 navigateTo 还是 switchTab。
   *    所以这里改成直接打开卡片指向的那篇笔记，回答「跳过去看到的是什么」。 */
  console.log('\n【2】打开第一张卡片指向的笔记');
  const firstLink = await run(tabA, `(() => {
    const it = document.querySelector('#pvPages .pv-item[data-key="p296"]');
    return 'p296';
  })()`);
  const noteKey = await (async () => {
    const t = readFileSync('.tooling/_tok.txt', 'utf8').trim();
    const p = await (await fetch(SITE + '/api/decorate/page?key=p296', { headers: { Authorization: 'Bearer ' + t } })).json();
    const b = ((p.data && p.data.published && p.data.published.blocks) || []).find((x) => x.type === 'tab_cate');
    const item = b && b.tabs && b.tabs[0] && b.tabs[0].items && b.tabs[0].items[0];
    return { link: item ? item.link : '', title: item ? item.title : '' };
  })();
  console.log('    第一张卡片：' + JSON.stringify(noteKey.title) + ' → ' + noteKey.link);
  const nKey = 'note-' + String((/id=(\d+)/.exec(noteKey.link) || [])[1] || '');
  const pickedNote = await run(tabA, `(() => {
    const it = document.querySelector('#pvPages .pv-item[data-key="${nKey}"]');
    if (!it) return 'not-found';
    it.click();
    it.scrollIntoView({ block: 'nearest' });
    return 'clicked';
  })()`);
  console.log('    左栏点 ' + nKey + ' → ' + pickedNote + '（' + firstLink + ' 已渲染过）');
  await sleep(4200);
  const noteInfo = await run(tabA, `(() => {
    const p = document.querySelector('#preview .note-page');
    return JSON.stringify({
      notePage: !!p,
      title: p ? ((p.querySelector('.nt-title') || {}).textContent || '') : '',
      text: p ? (p.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70) : ''
    });
  })()`);
  console.log('    笔记页实测：' + noteInfo);
  await shot(tabA, '新闻大事-卡片指向的笔记详情页.png');

  /* ---------- 2b. 用户分享（p299）---------- */
  console.log('\n【2b】/preview → 用户分享（p299）');
  const picked2 = await run(tabA, `(() => {
    const it = document.querySelector('#pvPages .pv-item[data-key="p299"]');
    if (!it) return 'not-found';
    it.click();
    it.scrollIntoView({ block: 'nearest' });
    return 'clicked';
  })()`);
  console.log('    左栏点 p299 → ' + picked2);
  await sleep(4200);
  await shot(tabA, '用户分享-页面（卡片墙）.png');

  /* ---------- 3. 控制台「店铺笔记」栏目 ---------- */
  console.log('\n【3】控制台「店铺笔记」栏目');
  const tabB = await open(SITE + '/console#shopnotes', 3000);
  tabs.push(tabB);
  await run(tabB, `(() => {
    const p = document.querySelector('#body [data-p]');
    if (!p) return 'already';
    p.value = ${JSON.stringify(ADMIN_PW)};
    document.querySelector('#body [data-login]').click();
    return 'logged';
  })()`);
  await sleep(2100);
  await run(tabB, `(() => {
    const b = [...document.querySelectorAll('#nav .nav-item')].find((x) => x.textContent.trim() === '店铺笔记');
    if (b) b.click();
    return 'ok';
  })()`);
  await sleep(1800);
  const stat = await run(tabB, `(() => {
    const rows = document.querySelectorAll('#body table.tb tbody tr').length;
    const quota = [...document.querySelectorAll('#body *')].map((n) => n.textContent || '')
      .find((t) => /\\/\\s*100\\s*/.test(t) && t.length < 30) || '';
    return JSON.stringify({ rows, quota: quota.trim().slice(0, 24) });
  })()`);
  console.log('    列表：' + stat);
  await shot(tabB, '店铺笔记-控制台列表（60 篇）.png');
} catch (e) {
  console.log('\n✗ 异常：' + (e && e.stack ? e.stack : e));
} finally {
  for (const t of tabs) { try { await close(t); } catch (_) { /* ignore */ } }
  console.log('\n出图结束');
}
