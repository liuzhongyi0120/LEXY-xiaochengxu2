/**
 * 把产品页（/pages/product/product）里每个型号卡片的「跳转」配到对应商品
 *
 * 依赖：.tooling/_yz/import-state.json（yz-import-products.mjs 产出：alias → goodsId）
 * 链路：读产品页装修数据 → 只改 products[].link → 存草稿 → 生成代码（发布）
 *
 * ⚠️ 「生成代码」只是写回 miniprogram/config/replica.js，**不等于线上生效**，
 *    仍需上传并发布小程序新版本。
 *
 * 用法：node .tooling/yz-link-products.mjs --dry | node .tooling/yz-link-products.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminToken, authHeaders } from './_admin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '_yz');
const BASE = process.env.MP_BASE || 'http://127.0.0.1:3000';
const DRY = process.argv.includes('--dry');

const state = JSON.parse(fs.readFileSync(path.join(DIR, 'import-state.json'), 'utf8'));

/*
 * ⚠️ 必须用 cards-all.json（**全部 32 张卡片**），不能用 cards.json 的 uniqList：
 *    U7 / U5 / U3 三个型号卡片指向**同一个**商品链接（洗地机 U 系列聚合页），
 *    按链接去重后它们会被合并掉，于是这三个型号永远挂不上商品。
 */
const cardsAll = fs.existsSync(path.join(DIR, 'cards-all.json'));
const cards = cardsAll
  ? JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR, 'cards-all.json'), 'utf8')).value)
  : JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR, 'cards.json'), 'utf8')).value).uniqList;

/** 型号名 → 有赞 alias（产品页的型号名与产品页卡片名同源，直接对上） */
const modelToAlias = new Map();
cards.forEach((c) => { if (c.name && c.name.trim()) modelToAlias.set(c.name.trim(), c.alias); });

const linkOf = (goodsId) => '/packageGoods/detail/detail?id=' + goodsId;

const api = async (p, params, method, token) => {
  const r = await fetch(BASE + p, {
    method: method || 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: params === undefined ? undefined : JSON.stringify(params)
  });
  const j = await r.json().catch(() => null);
  if (!j || j.code !== 0) throw new Error(p + ' → HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 220));
  return j.data;
};

const token = await adminToken(BASE);
const page = await api('/api/decorate/page?key=product', undefined, 'GET', token);

const hasDraft = page.draft && Object.keys(page.draft).length > 0;
if (hasDraft) {
  console.log('⚠️  该页存在未发布的草稿，本次将以【已发布数据】为基线改写，草稿会被覆盖。');
}

const base = JSON.parse(JSON.stringify(page.published || {}));
if (!base.brands) throw new Error('产品页已发布数据里没有 brands 字段，拒绝改写');

let linked = 0, already = 0, missing = [];
base.brands.forEach((b) => {
  (b.groups || []).forEach((g) => {
    (g.products || []).forEach((p) => {
      const model = String(p.model || '').trim();
      const alias = modelToAlias.get(model);
      const goodsId = alias ? state.goods[alias] : null;
      const want = goodsId ? linkOf(goodsId) : '';
      if (!want) { if (p.link) { p.link = ''; } missing.push(b.name + '/' + (model || '未命名')); return; }
      if (p.link === want) { already++; return; }
      p.link = want;
      linked++;
    });
  });
});

console.log('可关联型号：' + linked + ' 个待写、' + already + ' 个已一致');
if (missing.length) console.log('无对应商品（保持不跳转，点击仍是放大看图）：' + missing.join('、'));

if (DRY) {
  base.brands.forEach((b) => {
    const rows = [];
    (b.groups || []).forEach((g) => (g.products || []).forEach((p) => { if (p.link) rows.push('   ' + String(p.model).padEnd(12, '　') + ' → ' + p.link.replace('/packageGoods/detail/detail?id=', '')); }));
    if (rows.length) console.log('\n[' + b.name + '] ' + rows.length + ' 个已挂商品'); rows.forEach((r) => console.log(r));
  });
  process.exit(0);
}

if (!linked) { console.log('无需改动。'); process.exit(0); }

await api('/api/decorate/draft', { key: 'product', data: base }, 'POST', token);
const pub = await api('/api/decorate/publish', { key: 'product', note: '按有赞产品页导入商品后，自动关联型号跳转（' + linked + ' 个）' }, 'POST', token);
console.log('✅ 草稿已保存并生成代码（' + (pub && pub.at ? new Date(pub.at).toLocaleString('zh-CN') : 'ok') + '）');
console.log('   注意：这只是写回 replica.js，真机生效还需上传并发布小程序新版本。');
