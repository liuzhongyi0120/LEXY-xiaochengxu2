/**
 * 抓有赞「产品」页**全部 4 个品牌**的商品卡片
 *
 * 背景：该页左侧是品牌导航（莱克 / 碧云泉 / 吉米 / 咖博士），点击后右侧换成该品牌的型号网格。
 *      第一版只抓了默认显示的「莱克」，所以碧云泉 / 吉米 / 咖博士的型号没有对应商品。
 *
 * 产物：.tooling/_yz/cards-all.json —— 每条 { name, alias, brand, img }
 *      同名卡片指向同一商品链接的（如洗地机 U 系列共用一篇）**全部保留**，不去重。
 *
 * 用法：node .tooling/yz-cards.mjs <targetId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '_yz');
const API = 'http://localhost:3456';
const TARGET = process.argv[2];
if (!TARGET) { console.error('用法：node .tooling/yz-cards.mjs <targetId>'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (code) => {
  const r = await fetch(API + '/eval?target=' + TARGET, { method: 'POST', body: code });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.value;
};

const BRANDS = ['莱克', '碧云泉', '吉米', '咖博士'];

const CLICK = (b) => `(()=>{
  const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0 && (e.innerText||'').trim()===${JSON.stringify(b)});
  if(!el) return 'notfound';
  el.click();
  return 'ok';
})()`;

const EXTRACT = `(()=>{
  return JSON.stringify([...document.querySelectorAll('a[href*=wscgoods]')].map(a=>{
    const h=a.getAttribute('href')||'';
    const d=a.querySelector('div');
    let img='';
    if(d){const bg=getComputedStyle(d).backgroundImage; const m=/url\\("?([^")]+)"?\\)/.exec(bg); img=m?m[1]:'';}
    return {
      name:(a.innerText||'').trim().replace(/\\s+/g,' '),
      alias:(h.split('/detail/')[1]||'').split('?')[0],
      img
    };
  }));
})()`;

const all = [];
for (const b of BRANDS) {
  const c = await evalJs(CLICK(b));
  if (c !== 'ok') { console.log('✗ 找不到品牌 tab：' + b); continue; }
  await sleep(2600);
  const raw = await evalJs(EXTRACT);
  const list = JSON.parse(raw).filter((x) => x.alias).map((x) => Object.assign(x, { brand: b }));
  all.push(...list);
  console.log(b + ' → ' + list.length + ' 张卡片' + (list.length ? '：' + list.map((x) => x.name || '(无名)').join('、') : ''));
}

fs.writeFileSync(path.join(DIR, 'cards-all.json'), JSON.stringify({ value: JSON.stringify(all) }, null, 1), 'utf8');
const uniqAlias = new Set(all.map((x) => x.alias));
console.log('\n合计卡片 ' + all.length + ' 张，唯一商品链接 ' + uniqAlias.size + ' 个 → cards-all.json');
