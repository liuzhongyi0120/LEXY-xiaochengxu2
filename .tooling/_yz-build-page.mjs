/* 用抓取到的有赞「产品」页数据，构造一个 brand_category 区块并新建自定义页。
 * 用法：node .tooling/_yz-build-page.mjs [--dry]   （--dry 只打印不落库）
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const DIR = path.resolve('.tooling/_yz-assets');
const DRY = process.argv.includes('--dry');

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, '_manifest.json'), 'utf8'));
const uploaded = JSON.parse(fs.readFileSync(path.join(DIR, '_uploaded.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync('.tooling/_yz-content.json', 'utf8'));

/** 有赞原图 URL → 本机 /uploads/… 相对路径 */
function localOf(url) {
  if (!url) return '';
  const hit = manifest.assets.find((a) => a.url === url);
  if (!hit) return '';
  const up = uploaded[hit.file];
  return up ? up.url : '';
}

/* ---------- 型号 → 本机商品库商品 ID（商品库无对应型号的，链接留空） ---------- */
const GOODS = {
  // 莱克
  S10系列: 'g1003972', 'S9 Max': 'g_1791524125208_wq8k', S8: 'g_1791524127132_x80v', H5: 'g_1791524128415_kzuh',
  U7: '', U5: '', U3: '',
  F701: 'g_1791524130973_p3ef', F503: 'g_1791524132427_2qfp', F402: 'g_1791524133315_td5e', F305: 'g_1791524134837_8p5n',
  DH650: 'g_1791524135926_wlaa', DH350: 'g_1791524137197_hkrw', DH200: 'g_1791524138043_aoax', DH180: 'g_1791524139121_ncpv',
  K9Pro: 'g_1791524140352_i4vk', K8Pro: 'g_1791524141704_f4t7', K6Pro: 'g_1791524142815_7yl4', K5Pro: 'g_1791524144256_yrms',
  F8: 'g_1791524145595_a9bk', F6: 'g_1791524146881_26zx',
  M9: 'g_1791524148642_qnms', M7: 'g_1791524150427_1dge', C80: 'g_1791524151699_5edx',
  'N7 Pro': 'g_1791524153433_n1ds', N7: 'g_1791524155048_ogys', 'N5 Pro': 'g_1791524155625_dtkq', N5: 'g_1791524156197_qowf',
  HU801: 'g_1791524159269_1bb0', HU701: 'g_1791524160227_a92h', HU301: 'g_1791524161202_op43',
  // 碧云泉
  RT801: 'g_1791524603243_sdtu', RT702: 'g_1791524604590_5gfg', 'T5 系列': 'g_1791524605600_4j67', T5Max: 'g_1791524606775_fenp',
  R803: 'g_1791524608116_wqip', G5: 'g_1791524609541_iy4o', R702: '', C5Pro: 'g_1791524613616_h0om',
  C5Plus: 'g_1791524615445_sfdd', V6: 'g_1791524617189_d46y',
  'JSC-RL801': 'g_1791524619964_isv4', 'JSC-UL301': 'g_1791524621509_zpqe',
  // 吉米
  M7Ultra: 'g_1791524623060_z6sb', 'M7 Pro': 'g_1791524624571_zeay', 'B6 Pro': 'g_1791524625909_jbbs', M5: 'g_1791524626874_vd4p',
  // 咖博士
  'Grace 200': 'g_1791524628569_nvh7', H1S: 'g_1791524629713_aa7s', 'HOT 300': 'g_1791524631618_c674', 'HOT 100': 'g_1791524632667_du0l'
};

const GOODS_PATH = '/packageGoods/detail/detail?id=';
const BRAND_ORDER = [
  ['lexy', '莱克'],
  ['bqy', '碧云泉'],
  ['jimmy', '吉米'],
  ['drcoffee', '咖博士']
];

const missing = [];
const brands = BRAND_ORDER.map(([k, title]) => {
  const blocks = content[k] || [];
  const panels = blocks.map((b) => {
    const layout = b.cells.length === 1 ? '1' : '2';
    const items = b.cells.map((c) => {
      const gid = c.label ? GOODS[c.label] : '';
      if (c.label && gid === undefined) missing.push(c.label);
      const img = localOf(c.url);
      if (!img) missing.push('图片未本地化: ' + c.url);
      return {
        image: img,
        title: c.label || '',
        desc: '',
        linkMode: 'whole',
        link: gid ? GOODS_PATH + gid : ''
      };
    });
    return { title: '', link: '', layout, items };
  });
  return { title, panels };
});

const block = {
  id: 'bcat' + Date.now().toString(36),
  type: 'brand_category',

  /* 内容 */
  brands,
  navLogo: localOf(manifest.assets.find((a) => a.brands.includes('logo')) ? manifest.assets.find((a) => a.brands.includes('logo')).url : ''),
  link: '',

  /* 样式设置 · 布局（全部取自 2026-10-10 对该页面的实测） */
  switchMode: 'page',
  navWidth: 26,
  contentPadX: 0,

  /* 样式设置 · 左侧导航 */
  navStyle: 'B',
  navBg: '#F1F1F1',
  navColor: '#050505',
  navColorActive: '#FFFFFF',
  navBgActive: '#000000',
  navBgIdle: '#F9F9F9',
  navBorderColor: '',
  navBorderLine: '#DDDDDD',
  navHeight: 45,
  navMargin: 1,
  navBorderH: 10,
  navBorderW: 1,
  navFontSize: 15,
  navWeight: '300',
  navWeightActive: '450',
  navAlign: 'left',

  /* 样式设置 · 右侧内容 */
  itemShadow: 'none',
  itemBorderColor: '',
  itemTitleColor: '#323233',
  itemGapX: 0,
  itemGapY: 10,
  itemRadius: 0,
  itemTitleSize: 14,
  itemTitleWeight: '400',
  itemTitleAlign: 'center',
  panelTitleColor: '#323233',
  panelTitleSize: 16,
  panelTitleWeight: '700',
  panelTitleAlign: 'left',
  panelTitleGapX: 0,
  panelTitleGapY: 0,
  panelGap: 13,
  contentPadBottom: 0,
  effect: 'none',
  effectSpeed: 1,
  effectDelay: 0.2,

  /* 扩展设置 */
  searchMode: 'hide',
  bg: '#FFFFFF',
  moduleBgImage: '',
  moduleBgFill: 'cover',
  reserveTabbar: false,
  navSticky: 'off',
  /* 有赞线上的品牌分类页是**整屏橱窗**：组件占满一屏，左右两栏各自内部滚动 */
  heightMode: 'screen'
};

const pageData = { blocks: [block], meta: { desc: '', bg: '#F5F6F8' } };

/* ---------------- 统计 ---------------- */
const stat = { panels: 0, items: 0, linked: 0, unlinked: [] };
brands.forEach((b) => b.panels.forEach((p) => {
  stat.panels++;
  p.items.forEach((it) => {
    stat.items++;
    if (it.link) stat.linked++; else if (it.title) stat.unlinked.push(it.title);
  });
}));
console.log('品牌 ' + brands.length + ' 个｜分组 ' + stat.panels + ' 个｜条目 ' + stat.items + ' 个｜已挂商品链接 ' + stat.linked + ' 个');
console.log('未挂链接（商品库无对应）: ' + (stat.unlinked.join('、') || '无'));
if (missing.length) console.log('⚠️ 异常: ' + [...new Set(missing)].join('; '));

if (DRY) {
  fs.writeFileSync('.tooling/_yz-page-draft.json', JSON.stringify(pageData, null, 1));
  console.log('\n[dry] 已写入 .tooling/_yz-page-draft.json');
  process.exit(0);
}

/* ---------------- 落库 ---------------- */
const lr = await fetch(BASE + '/api/admin/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PW || 'admin' })
});
const TOKEN = (await lr.json()).data.token;
const api = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body || {})
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(p + ' -> ' + j.code + ' ' + j.msg);
  return j.data;
};

const KEY_ARG = (process.argv.find((a) => a.startsWith('--key=')) || '').split('=')[1];
let key = KEY_ARG;
if (!key) {
  const created = await api('/api/decorate/page/create', { name: '产品型号导航', note: '复刻有赞「产品」页（莱克/碧云泉/吉米/咖博士四品牌型号导航）', template: 'blank' });
  key = created.key || (created.page && created.page.key);
  console.log('页面已建：key=' + key);
} else {
  console.log('更新已有页面：key=' + key);
}

await api('/api/decorate/draft', { key, data: pageData });
console.log('草稿已保存');

const pub = await api('/api/decorate/publish', { key, note: '首次生成：复刻有赞产品页' });
console.log('已生成代码：版本 ' + (pub.versionId || pub.version || JSON.stringify(pub).slice(0, 120)));
console.log('\n页面地址：/pages/custom/index?key=' + key);
