/**
 * 抓取有赞「产品」微页面（NimpMk7rIc / kdt_id 45818390）的真实装修数据。
 *
 * 页面左侧是分类导航（品牌），右侧是若干「行组 ul」：
 *   - li width 100% 且无型号名  → 通栏大图（系列主图 / 海报）
 *   - li width 50%  且有型号名  → 双列型号卡，a[href] 直指有赞商品详情页
 * 因此按「品牌 → 行组 → 项」三层抓取，才能无损还原。
 *
 * 用法：node .tooling/probe-yz-product.mjs <targetId>
 */
import { writeFileSync } from 'node:fs';

const TARGET = process.argv[2];
if (!TARGET) {
  console.error('缺少 targetId');
  process.exit(1);
}
const BASE = 'http://localhost:3456';

async function ev(js) {
  const res = await fetch(`${BASE}/eval?target=${encodeURIComponent(TARGET)}`, { method: 'POST', body: js });
  const txt = await res.text();
  let j;
  try {
    j = JSON.parse(txt);
  } catch {
    throw new Error('proxy 返回非 JSON：' + txt.slice(0, 300));
  }
  if (j.value === undefined) throw new Error('eval 无 value：' + txt.slice(0, 300));
  return j.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 左栏（分类导航）：顶部图 + 分类项 */
const J_LEFT = `(()=>{
  const left=document.querySelector('.ranta-container-0-0-0 div[data-v-63d01b93]').children[0].children[0];
  const top=left.children[0];
  const st=top?(top.getAttribute('style')||''):'';
  const m=st.match(/url\\(["']?([^"')]+)["']?\\)/);
  const box=document.querySelector('.ranta-container-0-0-0 div[data-v-63d01b93]');
  const listBox=left.children[1];
  const items=listBox?[...listBox.children].map(d=>({txt:(d.innerText||'').trim(),style:(d.getAttribute('style')||'')})).filter(x=>x.txt):[];
  return JSON.stringify({
    topImg:m?m[1]:'', topHref:top?(top.getAttribute('href')||''):'',
    boxStyle:(box.getAttribute('style')||''),
    leftStyle:(left.getAttribute('style')||''),
    items
  });
})()`;

/** 右栏：按行组提取 */
const J_RIGHT = `(()=>{
  const right=document.querySelector('._yzs_1_rightItem');
  if(!right) return JSON.stringify({err:'no rightItem'});
  const wrap=right.children[0];
  if(!wrap) return JSON.stringify({err:'no wrap'});
  const groups=[];
  [...wrap.children].forEach(g=>{
    const ul=g.querySelector('ul');
    if(!ul) return;
    const items=[...ul.children].map(li=>{
      const a=li.querySelector('a');
      const imgEl=li.querySelector('._yzs_1_img');
      const p=li.querySelector('p');
      const st=imgEl?(imgEl.getAttribute('style')||''):'';
      const m=st.match(/url\\(["']?([^"')]+)["']?\\)/);
      const pt=(st.match(/padding-top:\\s*([\\d.]+)%/)||[])[1];
      const w=((li.getAttribute('style')||'').match(/width:\\s*([\\d.]+)%/)||[])[1];
      return {w:w||'', img:m?m[1]:'', pt:pt||'', href:a?(a.getAttribute('href')||''):'', label:p?(p.innerText||'').trim():''};
    }).filter(x=>x.img);
    if(items.length) groups.push(items);
  });
  return JSON.stringify(groups);
})()`;

const brands = JSON.parse(await ev(J_LEFT));
console.log('左栏分类：' + brands.items.map((x) => x.txt).join(' / '));
console.log('顶部图：' + brands.topImg);
console.log('');

const out = { page: { topImg: brands.topImg, topHref: brands.topHref, boxStyle: brands.boxStyle, leftStyle: brands.leftStyle, itemStyle: brands.items[0] && brands.items[0].style }, brands: [] };

for (let i = 0; i < brands.items.length; i++) {
  // 点击第 i 个分类
  await ev(`(()=>{
    const left=document.querySelector('.ranta-container-0-0-0 div[data-v-63d01b93]').children[0].children[0];
    const listBox=left.children[1];
    const items=[...listBox.children].filter(d=>(d.innerText||'').trim());
    const t=items[${i}];
    if(!t) return 'no item';
    t.click();
    return 'clicked';
  })()`);
  await sleep(900);
  const groups = JSON.parse(await ev(J_RIGHT));
  const name = brands.items[i].txt;
  const flat = groups.reduce((s, g) => s + g.length, 0);
  console.log(`[${i}] ${name}：${groups.length} 个行组，${flat} 项`);
  groups.forEach((g, gi) => {
    const cols = [...new Set(g.map((x) => x.w))].join('/');
    const labels = g.slice(0, 4).map((x) => x.label || '(无型号名)').join(', ');
    console.log(`     行 ${gi}: ${g.length} 项 · 列宽 ${cols}% · ${labels}${g.length > 4 ? ' …' : ''}`);
  });
  out.brands.push({ name, style: brands.items[i].style, groups });
}

writeFileSync('.tooling/_yz-product.json', JSON.stringify(out, null, 2), 'utf8');
console.log('');
console.log('已写入 .tooling/_yz-product.json');
