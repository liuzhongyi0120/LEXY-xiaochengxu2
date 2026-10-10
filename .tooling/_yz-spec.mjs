/**
 * 把 `.tooling/_yz-panels.json`（有赞装修台逐个组件抓取的面板字段序列）
 * 解析成「字段规格」，供 1:1 复刻 schema 用。
 *
 * 底稿的 `panel.seq` 是扁平流：标签 → 值/控件描述符 →（色值后再跟一个「重置」）。
 *   · `⟨input 提示=请输入标题⟩` / `⟨textarea:…⟩` / `⟨input:checkbox ☐⟩` 这类带尖括号的是控件描述符
 *   · `#RRGGBB` 是颜色控件的当前值
 *   · 其余为标签，或单选/下拉的当前选项文案
 *
 * 用法：
 *   node .tooling/_yz-spec.mjs            # 列出全部组件 + 字段条数
 *   node .tooling/_yz-spec.mjs 标题文本    # 打印单个组件的人话规格
 *   node .tooling/_yz-spec.mjs --all      # 打印全部组件的人话规格
 */
import { readFileSync } from 'node:fs';

const SRC = new URL('./_yz-panels.json', import.meta.url);
const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const items = raw.items || {};

const CTRL = /^⟨(.+?)⟩$/;
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function spec(name) {
  const it = items[name];
  if (!it) return null;
  const seq = (it.panel && it.panel.seq) || [];
  const out = {
    name,
    type: it.type,
    group: it.group,
    added: !!it.added,
    fields: [],
    raw: seq.slice()
  };
  let cur = null;
  for (let i = 0; i < seq.length; i++) {
    const s = seq[i];
    const m = CTRL.exec(s);
    if (m) {
      if (cur) { cur.control = m[1]; out.fields.push(cur); cur = null; }
      else out.fields.push({ label: '(无标签)', control: m[1] });
      continue;
    }
    if (HEX.test(s)) {
      if (cur) { cur.control = 'color'; cur.value = s; }
      continue;
    }
    if (s === '重置') { continue; }
    // 新标签：把上一个没有控件的收尾（视为 radio/select，当前值 = 紧随其后的文案）
    if (cur) out.fields.push(cur);
    cur = { label: s, control: 'text', value: '' };
  }
  if (cur) out.fields.push(cur);
  return out;
}

const names = Object.keys(items);

const args = process.argv.slice(2);
if (!args.length) {
  console.log('底稿时间：' + raw.at + '   组件数：' + names.length);
  names.forEach((n) => {
    const s = spec(n);
    console.log(
      (s.added ? '●' : '○') + ' ' + n.padEnd(12, '　') +
      ' [' + (s.group || '') + '] 字段 ' + String(s.fields.length).padStart(2) +
      '  控件 ' + [...new Set(s.fields.map((f) => f.control))].join(',')
    );
  });
} else {
  const list = args[0] === '--all' ? names : args;
  list.forEach((n) => {
    const s = spec(n);
    if (!s) { console.log('\n### ' + n + ' —— 底稿里没有\n'); return; }
    console.log('\n### ' + n + '  [' + (s.group || '') + ']  ' + s.type);
    s.fields.forEach((f, i) => {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + f.label +
        '   <' + f.control + '>' + (f.value ? '  = ' + f.value : ''));
    });
  });
}
