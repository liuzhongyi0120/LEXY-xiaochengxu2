/**
 * 有赞装修编辑器 · 组件配置面板批量提取（v2：加一个 → 抓取 → 立即删除）
 *
 * 背景：有赞单页组件数上限约 20 个，v1「只加不删」跑到第 20 个就触顶，
 * 之后所有点击都落空（面板停留在上一个组件）。v2 每抓完一个就把刚加的组件删掉，
 * 画布始终只比基线多 1 个，因此可以跑完全部 54 个组件。
 *
 * 安全：全程只改「内存中的画布」，从不点「存至草稿 / 立即发布」；
 *      跑完还会刷新页面，把画布恢复成服务端状态。
 *
 * 用法：node .tooling/yz-extract.mjs [起始索引] [结束索引]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'http://localhost:3456';
const TARGET = process.env.YZ_TARGET || '94D93E45B4021EA6941248B2A8B478FF';
const TARGET_PAGE = 'https://store.youzan.com/v4/deco/decorate#/edit/142448593';

const lib = JSON.parse(readFileSync('.tooling/_yz-lib.json', 'utf8'));
const GROUP_ORDER = ['页面装修', '商品', '新零售', '营销活动', '会员', '直播', '智能运营', '教育', '积分', '其他'];
const flat = [];
lib.cats.forEach((c, i) => c.items.forEach((it) => flat.push({ ...it, group: GROUP_ORDER[i] || c.cat })));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function raw(route, body, method) {
  const r = await fetch(BASE + route + (route.includes('?') ? '&' : '?') + 'target=' + encodeURIComponent(TARGET), method ? { method, body } : undefined);
  return await r.text();
}
async function ev(js) {
  const t = await raw('/eval', js, 'POST');
  let j; try { j = JSON.parse(t); } catch { return { __raw: t }; }
  if (j && typeof j.value === 'string') { try { return JSON.parse(j.value); } catch { return j.value; } }
  if (j && 'value' in j) return j.value; // 数字 / 布尔等标量
  return j;
}
const clickAt = (sel) => raw('/clickAt', sel, 'POST');

const ADD_JS = (name, idx) => `(async()=>{
  document.querySelectorAll('#yz-probe-item').forEach(e=>e.removeAttribute('id'));
  const items=[...document.querySelectorAll(".com-item-ns")].filter(e=>((e.querySelector(".com-item-ns__name")||{}).innerText||"").trim()===${JSON.stringify(name)});
  const it=items[${idx}]||items[0];
  if(!it) return "notfound";
  const before=document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length;
  it.scrollIntoView({block:"center"});
  // 注意：库项带 draggable，真实鼠标按下会走拖拽流程，必须用 JS click
  it.click();
  await new Promise(r=>setTimeout(r,2600));
  const after=document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length;
  return JSON.stringify({ok:true,before,after});
})()`;

const COUNT_JS = 'document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length';

const DEL_JS = `(async()=>{
  const n=${COUNT_JS};
  if(n<=1) return "skip";
  window.decorateActions.deleteInst(n-1);
  await new Promise(r=>setTimeout(r,700));
  return String(${COUNT_JS});
})()`;

const DUMP_JS = readFileSync('.tooling/yz-panel-dump.js', 'utf8');

const start = Number(process.argv[2] || 0);
const end = Number(process.argv[3] || flat.length);

const OUT = existsSync('.tooling/_yz-panels.json') ? JSON.parse(readFileSync('.tooling/_yz-panels.json', 'utf8')) : { at: '', items: {} };
OUT.at = new Date().toISOString();

// 基线：刷新页面 → 切到「基础组件」tab（重载后默认停在「常用组件」，只有 14 个）
await raw('/eval', 'location.reload(); 1', 'POST');
await sleep(7000);
const switchTab = await ev(`(async()=>{
  const t=[...document.querySelectorAll(".coms-lib-header-tab > div")].find(e=>(e.textContent||"").trim()==="基础组件");
  if(!t) return "no tab";
  t.click();
  await new Promise(r=>setTimeout(r,900));
  return document.querySelectorAll(".com-item-ns").length;
})()`);
const base = await ev(COUNT_JS);
console.log('基线组件数 =', base, ' 基础组件 tab 内库项 =', switchTab);

for (let i = start; i < end; i++) {
  const c = flat[i];
  if (!c) continue;
  const sameNameBefore = flat.slice(0, i).filter((x) => x.name === c.name).length;
  const res = await ev(ADD_JS(c.name, sameNameBefore));
  if (res === 'notfound' || !res || !res.ok) {
    OUT.items[c.name] = { ...c, err: 'library item not found' };
    console.log(`[${i}] ${c.name} ✗ 库项未找到`);
    continue;
  }
  const panel = await ev(DUMP_JS);
  const added = res.after > res.before;
  OUT.items[c.name] = { ...c, added, panel };
  writeFileSync('.tooling/_yz-panels.json', JSON.stringify(OUT, null, 1));
  console.log(`[${i}] ${c.group}/${c.name} type=${c.type} 加入=${added} 文本长=${panel && panel.text ? panel.text.length : 0}`);

  // 删除刚加的组件，回到基线
  await ev(DEL_JS);
}

console.log('---- 完成 ' + start + '..' + end + ' ----');
