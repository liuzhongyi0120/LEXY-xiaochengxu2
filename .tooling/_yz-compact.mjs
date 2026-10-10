/**
 * 把 v1 面板序列压成「一行一组件」的紧凑规格，便于逐个复刻 schema。
 *
 * 输出记号：
 *   标签⟨radio:选项1/选项2⟩      单选（有赞真实 input:radio，选项完整）
 *   标签⟨check:☑⟩               单个勾选框
 *   标签⟨input:值=30⟩           输入框（带当前值）
 *   标签⟨input:ph=请输入标题⟩    输入框（带占位提示）
 *   标签⟨ta:ph=…⟩               多行输入
 *   标签⟨color:#ffffff⟩         取色器
 *   标签⟨?⟩                     后面没跟控件 —— 需人工判断（多为缩略图选择器 / 分组标题）
 *     · 紧跟其后的裸词用 `·` 连接，作为「疑似选项 / 当前值」参考
 *
 * 用法：node .tooling/_yz-compact.mjs [组件名…]      # 不传=全部
 */
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./_yz-panels.json', import.meta.url), 'utf8'));
const items = raw.items;
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(items);

const M = {
  radio: /^⟨input:radio ([◉○])⟩$/,
  check: /^⟨input:checkbox ([☑☐])⟩$/,
  val: /^⟨input 值=(.*)⟩$/,
  ph: /^⟨input 提示=(.*)⟩$/,
  ta: /^⟨textarea:.*?(?:提示=(.*))?⟩$/,
  hex: /^#[0-9a-fA-F]{6}$/
};
const isHint = (s) => s.length >= 16;

for (const n of names) {
  const it = items[n];
  if (!it) { console.log('### ' + n + '（底稿缺失）'); continue; }
  const seq = (it.panel && it.panel.seq) || [];
  const out = [];
  let i = 0;
  let pending = null;      // 已输出的最后一个「标签」条目（用于挂 ✓/○ 选项）
  while (i < seq.length) {
    const t = seq[i];
    const mr = M.radio.exec(t);
    if (mr) {
      // 选项：紧随 marker 之后的裸词
      const nxt = seq[i + 1];
      if (nxt && !isHint(nxt) && !M.radio.test(nxt) && !M.check.test(nxt) && !M.val.test(nxt) && !M.ph.test(nxt) && !M.hex.test(nxt)) {
        if (pending && pending.kind === 'radio') pending.opts.push(nxt + (mr[1] === '◉' ? '●' : ''));
        else { out.push({ kind: 'radio', label: '(无标签)', opts: [nxt + (mr[1] === '◉' ? '●' : '')] }); pending = out[out.length - 1]; }
        i += 2; continue;
      }
      i += 1; continue;
    }
    const mc = M.check.exec(t);
    if (mc) {
      if (pending && pending.kind === '?') { pending.kind = 'check'; pending.val = mc[1]; pending = null; }
      else out.push({ kind: 'check', label: '(无标签)', val: mc[1] });
      i += 1; continue;
    }
    const mv = M.val.exec(t);
    if (mv) { if (pending && pending.kind === '?') { pending.kind = 'input'; pending.val = mv[1]; pending = null; } else out.push({ kind: 'input', label: '(无标签)', val: mv[1] }); i++; continue; }
    const mp = M.ph.exec(t);
    if (mp) { if (pending && pending.kind === '?') { pending.kind = 'ph'; pending.val = mp[1]; pending = null; } else out.push({ kind: 'ph', label: '(无标签)', val: mp[1] }); i++; continue; }
    const mt = M.ta.exec(t);
    if (mt) { if (pending && pending.kind === '?') { pending.kind = 'ta'; pending.val = mt[1] || ''; pending = null; } else out.push({ kind: 'ta', label: '(无标签)', val: mt[1] || '' }); i++; continue; }
    if (M.hex.test(t)) { if (pending && pending.kind === '?') { pending.kind = 'color'; pending.val = t; pending = null; } else out.push({ kind: 'color', label: '(无标签)', val: t }); i++; continue; }
    if (t === '重置') { i++; continue; }
    if (isHint(t)) {
      const prev = out[out.length - 1];
      if (prev && !prev.hint) prev.hint = t;
      i++; continue;
    }
    // 裸标签
    const nx = seq[i + 1];
    if (nx && M.radio.test(nx)) { out.push({ kind: 'radio', label: t, opts: [] }); pending = out[out.length - 1]; i++; continue; }
    if (nx && M.hex.test(nx)) { out.push({ kind: 'color', label: t, val: nx }); pending = null; i += 2; continue; }
    if (nx && (M.check.test(nx) || M.val.test(nx) || M.ph.test(nx) || M.ta.test(nx))) { out.push({ kind: '?', label: t }); pending = out[out.length - 1]; i++; continue; }
    out.push({ kind: '?', label: t }); pending = null; i++;
  }

  console.log('### ' + n + '  [' + (it.group || '') + ']  ' + (it.type || ''));
  const parts = [];
  for (const o of out) {
    let s = o.label;
    if (o.kind === 'radio') s += '⟨radio:' + o.opts.join('/') + '⟩';
    else if (o.kind === 'check') s += '⟨check:' + (o.val || '') + '⟩';
    else if (o.kind === 'input') s += '⟨input:值=' + o.val + '⟩';
    else if (o.kind === 'ph') s += '⟨input:ph=' + o.val + '⟩';
    else if (o.kind === 'ta') s += '⟨ta:ph=' + (o.val || '') + '⟩';
    else if (o.kind === 'color') s += '⟨color:' + o.val + '⟩';
    else s += '⟨?⟩';
    if (o.hint) s += ' ⚑' + o.hint.slice(0, 50);
    parts.push(s);
  }
  console.log('  ' + parts.join('  |  '));
  console.log('');
}
