/**
 * 出图：一篇「视频笔记」的详情页 + 一篇图片最多的图文笔记（取证正文真的进去了）
 * 用法（前置：后端 3000 + CDP 代理 3456）：node .tooling/_shot-note-video.mjs
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'deliverables');
const P = 'http://127.0.0.1:3456';
const SITE = 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, opt) {
  const t = await (await fetch(P + url, opt)).text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
async function open(url, wait = 3000) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id;
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return r;
  if (r && r.error) return '';
  return r && r.value === undefined ? '' : (typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
}
async function shot(id, name) {
  const file = join(OUT, name);
  const r = await j('/shot?target=' + id, { method: 'POST', body: file });
  console.log(`    ${r && r.ok ? '✓' : '✗'} ${name}${existsSync(file) ? '（' + Math.round(readFileSync(file).length / 1024) + ' KB）' : ''}`);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const tok = readFileSync('.tooling/_tok.txt', 'utf8').trim();
const tab = await open(SITE + '/preview', 3200);

for (const [key, name, probe] of [
  ['note-236', '用户分享-视频笔记详情页.png', 'video'],
  ['note-216', '新闻大事-图文笔记详情页（22 张图）.png', 'img']
]) {
  await run(tab, `(() => {
    const it = document.querySelector('#pvPages .pv-item[data-key="${key}"]');
    if (!it) return 'not-found';
    it.click(); it.scrollIntoView({ block: 'nearest' }); return 'clicked';
  })()`);
  await sleep(5000);
  const info = await run(tab, `(() => {
    const p = document.querySelector('#preview .note-page');
    if (!p) return 'no-note-page';
    const imgs = p.querySelectorAll('img').length;
    const vids = p.querySelectorAll('video').length;
    const broken = [...p.querySelectorAll('img')].filter(im => im.complete && im.naturalWidth === 0).length;
    return JSON.stringify({ imgs, vids, broken, text: (p.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) });
  })()`);
  console.log('【' + key + '】' + info);
  await shot(tab, name);
}

/* 控制台列表：确认「内容量」列体现了正文 */
const tab2 = await open(SITE + '/console', 3500);
await run(tab2, `(() => {
  const s = localStorage.getItem('mallAdminToken') || '';
  return 'token:' + (s ? 'yes' : 'no');
})()`);
await shot(tab2, '店铺笔记-控制台列表（正文已回填）.png');
console.log('出图结束');
