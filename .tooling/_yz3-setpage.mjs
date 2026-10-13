/**
 * 页面/区块字段微调（写草稿 → 生成代码），用于「复刻有赞原页」时逐字段对齐。
 *
 * 为什么要有这个脚本：这类调整**不适合手工点装修台**——
 *   - 数值来自实测（有赞原页的计算样式 / 逐像素取样），要能写进提交信息、可复核；
 *   - 走的是同一条 draft → publish 链路（照样过校验器 + 无损回读），不是直接改 JSON；
 *   - 一次改多处时能一起生成一个版本，避免「改了一半」的中间态。
 *
 * 语法：<页面 key> <字段路径>=<值>
 *   node .tooling/_yz3-setpage.mjs p297 meta.bg=#ffffff
 *   node .tooling/_yz3-setpage.mjs p301 meta.bg=#f9f9f9
 *   node .tooling/_yz3-setpage.mjs p295 tab_cate.cardStyle=shadow
 *   node .tooling/_yz3-setpage.mjs --show p295 p297
 * 字段路径：`meta.<k>`（页面级）/ `<区块 type>.<k>`（该页第一个该类型的区块）
 * 加 --dry 只打印不落库。
 */
import adminToken from './_admin.mjs';

const BASE = process.env.LEX_BASE || 'http://127.0.0.1:3000';
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const showOnly = argv.includes('--show');
const args = argv.filter((a) => !a.startsWith('--'));

if (!args.length) {
  console.log('用法：node .tooling/_yz3-setpage.mjs p297 meta.bg=#ffffff [p295 tab_cate.cardStyle=shadow ...] [--dry]');
  console.log('      node .tooling/_yz3-setpage.mjs --show p295 p297');
  process.exit(2);
}

const TOKEN = await adminToken(BASE);
const get = async (p) => {
  const r = await fetch(BASE + p, { headers: { authorization: 'Bearer ' + TOKEN } });
  const j = await r.json();
  if (j.code !== 0) throw new Error(p + ' -> code=' + j.code + ' ' + j.msg);
  return j.data;                    // ⚠️ 已剥掉一层：内容数据在 .data（{blocks, meta}）
};
const post = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(p + ' -> code=' + j.code + ' ' + j.msg);
  return j.data;
};

/** 色值归一：#fff → #FFFFFF（发布链路会转大写，先对齐免得出现「改了却没生效」的假象） */
function normVal(path, v) {
  if (!/color|bg$/i.test(path)) return v;
  let s = String(v || '').trim();
  if (!s) return '';
  if (s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error('色值不合法：' + v);
  return s.toUpperCase();
}

/* 按「页面 key」分组，一页一次 draft+publish（不是一字段一次）。
 * 参数写法：裸 key 之后跟若干 `字段=值` ——
 *   `p295 tab_cate.cardStyle=shadow p301 meta.bg=#F9F9F9`
 * 裸 key 会切换「当前页面」，所以一条命令能改多页。
 * ⚠️ 别把 `<key> <字段>` 当成两个独立参数去配对：那样 `p295` 会被当成"无改动的页面"，
 * `tab_cate.cardStyle=shadow` 里 `=` 左边被当成 key → 报 404 页面不存在：tab_cate（踩过）。 */
const byPage = new Map();
let cur = null;
for (const a of args) {
  const eq = a.indexOf('=');
  if (eq < 0) {                              // 裸 key
    cur = a;
    if (!byPage.has(cur)) byPage.set(cur, []);
    continue;
  }
  const path = a.slice(0, eq);
  const val = a.slice(eq + 1);
  const dot = path.indexOf('.');
  if (dot < 0) throw new Error('字段路径要带前缀（meta.<k> / <区块type>.<k>）：' + path);
  const key = path.slice(0, dot);
  /* 允许 `p295.meta.bg=#fff` 这种把 key 写在路径里的写法（此时不需要裸 key） */
  const isKeyed = /^p\d+$/.test(key);
  const pageKey = isKeyed ? key : cur;
  const field = isKeyed ? path.slice(dot + 1) : path;
  if (!pageKey) throw new Error('没指定页面 key：' + a);
  if (!byPage.has(pageKey)) byPage.set(pageKey, []);
  byPage.get(pageKey).push([field, normVal(field, val)]);
}

for (const [key, edits] of byPage) {
  const page = await get('/api/decorate/page?key=' + encodeURIComponent(key));
  const data = page.data;
  console.log(`\n═══ ${key} ${(page.meta && page.meta.name) || ''} ═══`);
  console.log(`  当前：meta=${JSON.stringify(data.meta)}`);
  for (const b of data.blocks || []) {
    if (b.type === 'tab_cate' || b.type === 'content_card' || b.type === 'mixed_grid') {
      console.log(`  区块 ${b.type}(${b.id})：` +
        ['style', 'cardStyle', 'radius', 'padY', 'pageMargin'].map((k) => k + '=' + JSON.stringify(b[k])).join('  '));
    }
  }
  if (showOnly || !edits.length) continue;

  const blocks = (data.blocks || []).slice();
  const meta = Object.assign({}, data.meta);
  const changed = [];
  for (const [field, val] of edits) {
    const dot = field.indexOf('.');
    if (dot < 0) throw new Error('字段路径要带前缀（meta. / <区块type>.）：' + field);
    const scope = field.slice(0, dot);
    const k = field.slice(dot + 1);
    if (scope === 'meta') {
      if (meta[k] === val) { console.log(`  meta.${k} 已是 ${val}`); continue; }
      console.log(`  meta.${k}: ${JSON.stringify(meta[k])} → ${JSON.stringify(val)}`);
      meta[k] = val;
      changed.push('meta.' + k);
    } else {
      const i = blocks.findIndex((b) => b.type === scope);
      if (i < 0) throw new Error(`${key} 里没有 ${scope} 区块`);
      if (blocks[i][k] === val) { console.log(`  ${scope}.${k} 已是 ${val}`); continue; }
      console.log(`  ${scope}.${k}: ${JSON.stringify(blocks[i][k])} → ${JSON.stringify(val)}`);
      blocks[i] = Object.assign({}, blocks[i], { [k]: val });
      changed.push(`${scope}.${k}`);
    }
  }
  if (!changed.length) { console.log('  无需改动'); continue; }
  if (dry) { console.log('  --dry：不落库'); continue; }

  /* ⚠️ 草稿必须带**该页面自己的全部字段**，不能只发 `{blocks, meta}`：
     首页的校验明确要求 `shop` 对象（schema.validate）——
     只发两段会报「数据校验未通过：首页缺少 shop 对象」，
     看起来像装修接口坏了，其实是这个工具少发了字段（2026-10-12 还原首页底色时踩到）。
     自定义页本来就只有 blocks + meta，多带字段对它没有任何影响。 */
  await post('/api/decorate/draft', { key, data: Object.assign({}, data, { blocks, meta }) });
  const pub = await post('/api/decorate/publish', {
    key,
    note: '对齐有赞原页：' + changed.join('、'),
  });
  console.log('  已生成代码：' + (pub.versionId || pub.version || JSON.stringify(pub).slice(0, 120)));
}
console.log('');
