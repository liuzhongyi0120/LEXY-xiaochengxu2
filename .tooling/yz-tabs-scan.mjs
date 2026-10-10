/**
 * 扫描：有赞装修编辑器里，哪些组件的属性面板带「内容设置 / 样式设置 / 扩展设置」三段 tab。
 *
 * 为什么单独扫：`_yz-ctrls.json` 已证明这三个 tab 真实存在（字号 / 颜色 / 下划线都量过），
 * 但 `yz-panels2.mjs` 抓到的 `panel.tabs` 是**形态模板**（「传统样式 / 微信图文样式」），
 * 两者在 DOM 上都是 `.zent-tabs-nav`，**只有文案能区分**。实测「标题文本」根本没有三段 tab
 * ——所以它是**按组件存在**的，不能假设每个组件都有。
 *
 * 本脚本只扫「存不存在」与「每段下有哪些字段标签」，用来决定是否有必要在自建装修台上做这一层。
 *
 * 安全约定同 yz-panels2.mjs：只改内存画布，从不点「存至草稿 / 立即发布」。
 *
 * 用法：node .tooling/yz-tabs-scan.mjs [--only a,b] [--addwait 2400]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3456';
const TARGET = process.env.YZ_TARGET || 'CF53BBFD4DDF7E2A4CAA4EEEEA2A14B5';
const OUT_PATH = '.tooling/_yz-tabs.json';
const TABS = ['内容设置', '样式设置', '扩展设置'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(BASE + '/eval?target=' + encodeURIComponent(TARGET), { method: 'POST', body: js });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return t; }
  if (j && typeof j.value === 'string') { try { return JSON.parse(j.value); } catch { return j.value; } }
  if (j && 'value' in j) return j.value;
  return j;
}

const COUNT_JS = 'document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length';

const ADD_JS = (name, addwait) => `(async()=>{
  document.querySelectorAll('#yz-probe-item').forEach(e=>e.removeAttribute('id'));
  const items=[...document.querySelectorAll(".com-item-ns")].filter(e=>((e.querySelector(".com-item-ns__name")||{}).innerText||"").trim()===${JSON.stringify(name)});
  const it=items[0];
  if(!it) return JSON.stringify({err:"notfound"});
  const before=document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length;
  it.scrollIntoView({block:"center"});
  it.click();
  await new Promise(r=>setTimeout(r,${addwait}));
  const after=document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length;
  return JSON.stringify({ok:true,before,after});
})()`;

/** 列出面板里所有 tab 的文案（排除形态模板 tab） */
const TABS_JS = `(()=>{
  const out=[];
  document.querySelectorAll('.zent-tabs-nav').forEach(nav=>{
    const w=Math.round(nav.getBoundingClientRect().width);
    if(!w) return;
    const texts=[...nav.querySelectorAll('.zent-tabs-tab-inner')].map(e=>(e.textContent||'').trim()).filter(Boolean);
    out.push({w,texts});
  });
  const has3=TABS.every(t=>out.some(n=>n.texts.indexOf(t)>=0));
  return JSON.stringify({navs:out, hasPanelTabs:has3});
})()`.replace('TABS', JSON.stringify(TABS));

/** 点第 i 个 tab 后面板里的字段标签（只取可见的） */
const LABELS_JS = (i) => `(async()=>{
  const names=${JSON.stringify(TABS)};
  const cands=[...document.querySelectorAll('.zent-tabs-nav')]
    .filter(n=>n.querySelectorAll('.zent-tabs-tab-inner').length>=3)
    .filter(n=>[...n.querySelectorAll('.zent-tabs-tab-inner')].some(e=>(e.textContent||'').trim()===names[0]));
  if(!cands.length) return JSON.stringify({err:'no panel tabs'});
  const nav=cands[0];
  const tab=[...nav.querySelectorAll('.zent-tabs-tab-inner')].find(e=>(e.textContent||'').trim()===names[${i}]);
  if(!tab) return JSON.stringify({err:'tab missing '+names[${i}]});
  tab.click();
  await new Promise(r=>setTimeout(r,900));
  const labels=[...document.querySelectorAll('.deco-control-group__label')]
    .filter(e=>e.getBoundingClientRect().width>0)
    .map(e=>(e.textContent||'').trim()).filter(Boolean);
  return JSON.stringify({tab:names[${i}],labels});
})()`;

const DEL_JS = `(async()=>{
  const n=${COUNT_JS};
  if(n<=1) return "skip";
  try { window.decorateActions.deleteInst(n-1); } catch(e) { return "err:"+e.message; }
  await new Promise(r=>setTimeout(r,900));
  return String(${COUNT_JS});
})()`;

/* ------- 参数 ------- */
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.indexOf(k) >= 0;
const addwait = Number(flag('--addwait', 2800));

let names = JSON.parse(readFileSync('.tooling/_yz-lib-basic.json', 'utf8')).cards.map((c) => c.name);
if (has('--only')) {
  const want = String(flag('--only', '')).split(',').map((s) => s.trim()).filter(Boolean);
  names = want.filter((w) => names.indexOf(w) >= 0);
  const missing = want.filter((w) => names.indexOf(w) < 0);
  if (missing.length) console.log('⚠️  库清单里没有：' + missing.join(', '));
}

/* 必须先切到「基础组件」tab —— 默认停在「常用组件」，那里只有 14 项，其余组件会全部 notfound */
const ENSURE_TAB = `(async()=>{
  const t=[...document.querySelectorAll(".coms-lib-header-tab > div")].find(e=>(e.textContent||"").trim()==="基础组件");
  if(!t) return "no-tab";
  if(!/active|selected|on/.test(t.className)) { t.click(); await new Promise(r=>setTimeout(r,1000)); }
  return String(document.querySelectorAll(".com-item-ns").length);
})()`;
const tabRes = await ev(ENSURE_TAB);
if (tabRes === 'no-tab') { console.error('没找到「基础组件」tab —— 请确认有赞标签页停在装修编辑器'); process.exit(1); }
console.log('切到基础组件 tab 后库项 = ' + tabRes);

const libN = await ev('document.querySelectorAll(".com-item-ns").length');
if (!libN) { console.error('没找到组件库 —— 请确认有赞标签页停在装修编辑器'); process.exit(1); }
const base = await ev(COUNT_JS);
console.log('库项 = ' + libN + '，画布基线 = ' + base + '，本次扫 ' + names.length + ' 个');

const OUT = { at: new Date().toISOString(), items: {} };
let withTabs = [];

for (const name of names) {
  const res = await ev(ADD_JS(name, addwait));
  if (!res || res.err) { OUT.items[name] = { err: res && res.err }; console.log('  ✗ ' + name); continue; }
  const t = await ev(TABS_JS).catch((e) => ({ err: String(e) }));
  let tabs = null;
  if (t && t.hasPanelTabs) {
    tabs = [];
    for (let i = 0; i < TABS.length; i++) {
      const d = await ev(LABELS_JS(i));
      tabs.push(d && d.labels ? { tab: TABS[i], labels: d.labels } : { tab: TABS[i], err: d && d.err });
    }
  }
  OUT.items[name] = { added: res.after > res.before, navs: (t && t.navs) || null, panelTabs: t && t.hasPanelTabs ? tabs : null };
  writeFileSync(OUT_PATH, JSON.stringify(OUT, null, 1));
  if (t && t.hasPanelTabs) { withTabs.push(name); console.log('  ★ ' + name + ' 有三段 tab：' + tabs.map((x) => x.tab + '=' + ((x.labels || []).length) + '项').join(' / ')); }
  else console.log('  · ' + name + ' 无三段 tab，nav 文案 = ' + JSON.stringify((t && t.navs || []).map((n) => n.texts.join('|'))));
  const back = await ev(DEL_JS);
  if (String(back) !== 'skip' && Number(back) !== res.before) console.log('     ⚠️ 删除后 = ' + back + '（基线 ' + res.before + '）');
}

console.log('\n---- 完成：' + withTabs.length + ' / ' + names.length + ' 个组件带三段 tab ----');
if (withTabs.length) console.log('带三段 tab 的组件：' + withTabs.join('、'));
console.log('已写入 ' + OUT_PATH);
