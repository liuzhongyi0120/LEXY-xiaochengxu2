/**
 * 临时取证：盯着 replica.js，一旦出现 SHOPNOTES 就记下时刻与内容。
 * 用来查「刚建的笔记为什么被判成『代码已生成』」。
 *   node .tooling/_watch-shopnotes.mjs <持续秒数>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPLICA = join(dirname(fileURLToPath(import.meta.url)), '..', 'miniprogram/config/replica.js');
const secs = Number(process.argv[2] || 90);
const t0 = Date.now();
let last = null;
let seen = false;

const iv = setInterval(() => {
  let txt = '';
  try { txt = readFileSync(REPLICA, 'utf8'); } catch (e) { return; }
  const m = /SHOPNOTES\s*=\s*\{([\s\S]{0,200})/.exec(txt);
  const key = m ? (m[1].match(/"(\d+)"/) || [])[1] : null;
  const stamp = /最后发布 ([0-9: \-]+)/.exec(txt);
  const sig = key ? 'HAS:' + key : 'none';
  if (sig !== last) {
    const el = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[+${el}s] replica.js → ${sig}　发布注释=${stamp ? stamp[1] : '?'}`);
    if (key) { seen = true; console.log('        SHOPNOTES 片段：' + m[1].replace(/\s+/g, ' ').slice(0, 160)); }
    last = sig;
  }
  if (Date.now() - t0 > secs * 1000) {
    clearInterval(iv);
    console.log(seen ? '结论：过程中**出现过** SHOPNOTES' : '结论：全程没有出现 SHOPNOTES');
  }
}, 120);
