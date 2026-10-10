/**
 * 有赞装修编辑器 · 组件属性面板结构化抓取（v2）
 *
 * 与 v1（yz-extract.mjs → _yz-panels.json）的区别：
 *   v1 只记「标签 + 当前值」序列，**单选/多选的全部选项没抓**，不足以 1:1 复刻；
 *   v2 每个组件逐个「加到画布 → 抓右侧面板（含全部选项）→ 立即删掉」，写入 _yz-panels2.json。
 *
 * 安全约定（与 v1 相同，务必保持）：
 *   · 全程只改浏览器内存里的画布，**从不点「存至草稿 / 立即发布」**；
 *   · 每抓完一个组件立刻 `decorateActions.deleteInst()` 把它删掉，回到基线；
 *   · 默认**不刷新页面**（刷新会丢掉用户自己在编辑器里的未保存改动）；
 *     需要干净基线时显式加 `--reload`。
 *
 * 用法：
 *   node .tooling/yz-panels2.mjs                     # 抓全部 55 个基础组件
 *   node .tooling/yz-panels2.mjs --only 商品分组,优惠券
 *   node .tooling/yz-panels2.mjs --from 20 --to 30
 *   node .tooling/yz-panels2.mjs --reload            # 先刷新到服务端状态再抓
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'http://localhost:3456';
const TARGET = process.env.YZ_TARGET || 'B1CF1B38764F7C6E8370A1071D861900';
const OUT_PATH = '.tooling/_yz-panels2.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function raw(route, body, method) {
  const r = await fetch(BASE + route + (route.includes('?') ? '&' : '?') + 'target=' + encodeURIComponent(TARGET),
    method ? { method, body } : undefined);
  return await r.text();
}
async function ev(js) {
  const t = await raw('/eval', js, 'POST');
  let j; try { j = JSON.parse(t); } catch { return { __raw: t }; }
  if (j && typeof j.value === 'string') { try { return JSON.parse(j.value); } catch { return j.value; } }
  if (j && 'value' in j) return j.value;
  return j;
}

const COUNT_JS = 'document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length';

const ADD_JS = (name, nth) => `(async()=>{
  document.querySelectorAll('#yz-probe-item').forEach(e=>e.removeAttribute('id'));
  const items=[...document.querySelectorAll(".com-item-ns")].filter(e=>((e.querySelector(".com-item-ns__name")||{}).innerText||"").trim()===${JSON.stringify(name)});
  const it=items[${nth}]||items[0];
  if(!it) return JSON.stringify({err:"notfound", inLib: document.querySelectorAll(".com-item-ns").length});
  const before=document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length;
  it.scrollIntoView({block:"center"});
  it.click();                       // 库项 draggable，真实鼠标按下会走拖拽，只能用 JS click
  await new Promise(r=>setTimeout(r,2800));
  const after=document.querySelectorAll(".preview-page-manager-content .deco-editor-card-item").length;
  return JSON.stringify({ok:true,before,after});
})()`;

const DEL_JS = `(async()=>{
  const n=${COUNT_JS};
  if(n<=1) return "skip";
  try { window.decorateActions.deleteInst(n-1); } catch(e) { return "err:"+e.message; }
  await new Promise(r=>setTimeout(r,800));
  return String(${COUNT_JS});
})()`;

const ENSURE_TAB = `(async()=>{
  const t=[...document.querySelectorAll(".coms-lib-header-tab > div")].find(e=>(e.textContent||"").trim()==="基础组件");
  if(!t) return "no-tab";
  if(!/active|selected|on/.test(t.className)) { t.click(); await new Promise(r=>setTimeout(r,900)); }
  return String(document.querySelectorAll(".com-item-ns").length);
})()`;

const DUMP_JS = readFileSync('.tooling/yz-panel-dump.js', 'utf8');

/* ------- 参数 ------- */
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.indexOf(k) >= 0;

const names = JSON.parse(readFileSync('.tooling/_yz-lib-basic.json', 'utf8')).cards.map((c) => c.name);
let targets = names;
if (has('--only')) {
  const want = String(flag('--only', '')).split(',').map((s) => s.trim()).filter(Boolean);
  targets = want.filter((w) => names.indexOf(w) >= 0);
  const missing = want.filter((w) => names.indexOf(w) < 0);
  if (missing.length) console.log('⚠️  库清单里没有：' + missing.join(', '));
} else {
  const from = Number(flag('--from', 0));
  const to = Number(flag('--to', names.length));
  targets = names.slice(from, to);
}

const OUT = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : { at: '', items: {} };
OUT.at = new Date().toISOString();
OUT.libCount = names.length;

/* ------- 开始 ------- */
if (has('--reload')) {
  await raw('/eval', 'location.reload(); 1', 'POST');
  await sleep(8000);
}
const inLib = await ev(ENSURE_TAB);
if (inLib === 'no-tab') { console.error('没找到「基础组件」tab —— 请确认有赞标签页停在装修编辑器'); process.exit(1); }
const base = await ev(COUNT_JS);
console.log('库项 = ' + inLib + '，画布基线组件数 = ' + base + '，本次抓 ' + targets.length + ' 个');

let okN = 0, failN = 0;
for (const name of targets) {
  const res = await ev(ADD_JS(name, 0));
  if (!res || res.err === 'notfound') {
    OUT.items[name] = { err: 'library item not found' };
    console.log('  ✗ ' + name + ' 库项未找到');
    failN++;
    continue;
  }
  const panel = await ev(DUMP_JS);
  const added = res.after > res.before;
  const rows = panel && panel.tabs ? panel.tabs.reduce((a, t) => a + t.rows.length, 0) : 0;
  OUT.items[name] = { added, panel };
  writeFileSync(OUT_PATH, JSON.stringify(OUT, null, 1));
  const mark = added && rows ? '✓' : '⚠';
  if (added && rows) okN++; else failN++;
  console.log('  ' + mark + ' ' + name.padEnd(8, '　') +
    ' 加入=' + added + ' 面板字段=' + rows +
    ' tab=' + ((panel && panel.tabs || []).map((t) => t.tab + ':' + t.rows.length).join(' / ') || '-'));
  const back = await ev(DEL_JS);
  if (String(back) !== 'skip' && Number(back) !== res.before) {
    console.log('     ⚠️ 删除后组件数 = ' + back + '（基线 ' + res.before + '），下一轮基线会漂移');
  }
}
console.log('---- 完成：' + okN + ' 成功 / ' + failN + ' 异常，已写入 ' + OUT_PATH + ' ----');
