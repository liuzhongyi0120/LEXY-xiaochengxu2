/* 复刻有赞「了解莱克」页（店铺 44567186 → 实际落在 46010558 的「莱克资讯」微页面）
 * 为一个 mixed_grid（混合排列A）区块的新自定义页。
 *
 * 用法：
 *   node .tooling/_yz2-build-page.mjs --dry           只打印不落库
 *   node .tooling/_yz2-build-page.mjs                 新建页面 + 存草稿 + 发布
 *   node .tooling/_yz2-build-page.mjs --key=pXXX      复用已有页面（重跑用）
 *
 * 数据来源全部是 2026-10-12 在**真移动视口（375 宽）**下量的实测值，
 * 不是照着截图估的：见 .tooling/_yz2-measure.js / _yz2-items.js 的输出记录。
 *
 * ⚠️ 跳转链接：原页 8 张卡片分别链到另一店铺（shop44567186）的 8 个微页面，
 *    本店没有对应内容 —— 故 **link 一律留空**（有意偏离，已在文档中记录）。
 *    卡片上的图片已全部本地化到 /uploads/，不写死有赞域名。
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const DRY = process.argv.includes('--dry');
const KEY_ARG = (process.argv.find((a) => a.startsWith('--key=')) || '').split('=')[1];

const uploaded = JSON.parse(fs.readFileSync('.tooling/_yz2-upload/_uploaded.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('.tooling/_yz2-assets/_manifest.json', 'utf8'));

/** 有赞原图 URL → 本机 /uploads/… 相对路径（按 manifest 的 file 字段对应上传结果） */
function localOf(file) {
  const up = uploaded[file];
  return up ? up.url : '';
}

/* 页面显示顺序 = 有赞 DOM 顺序（首行 2 张，之后每行 3 张） */
const ORDER = [
  '01-关于莱克.jpg', '02-新闻大事.jpg',
  '03-创业故事.jpg', '04-我们品牌.jpg', '05-用户分享.jpg',
  '06-业务模式.jpg', '07-售后服务.jpg', '08-加入我们.jpg'
];

const missing = [];
const items = ORDER.map((file) => {
  const hit = manifest.find((m) => m.file.replace(/\.(png|jpg|jpeg)$/, '') === file.replace(/\.jpg$/, ''));
  const img = localOf(file);
  if (!img) missing.push('图片未本地化: ' + file);
  return { image: img, title: hit ? hit.title : '', link: '' };
});

const block = {
  id: 'mg' + Date.now().toString(36),
  type: 'mixed_grid',

  /* 标题设置 —— 有赞实测：副标题 16px/400 #2e2b2b，主标题 20px/700 #444444，
     标题块 margin-top:45px、padding-left:15px、下间距 0 */
  subTitle: 'UNDERSTAND LEXY',
  title: '了解莱克',
  titleAlign: 'left',
  titleSize: 20,
  subSize: 16,
  titleWeight: 'bold',
  subWeight: 'normal',
  titleColor: '#444444',
  subColor: '#2E2B2B',
  titleGapTop: 45,
  titleGapBottom: 0,

  /* 基本设置 —— 「首行 2 张」= 有赞原样（w50 + w33 打类） */
  layout: '2-3',
  items,

  /* 样式设置 —— 有赞实测：margin4.5px / 圆角8px / rgba(248,248,248,0.33) / padding-top 133.33%(3:4)
     / 内距8px / 模块左右内收7.5px / 名称 14px/700 #444444 居中 单行 */
  cardStyle: 'white',
  cardBg: '#F8F8F8',
  cardBgAlpha: 33,
  radius: 'round',
  cardRadius: 8,
  imgRatio: '0.75',
  gap: 4.5,
  paddingInner: 8,
  paddingX: 7.5,
  paddingY: 0,
  itemTitleColor: '#444444',
  itemTitleSize: 14,
  itemTitleWeight: 'bold',
  itemTitleAlign: 'center',
  itemTitleLines: '1',

  /* 扩展设置 —— 模块底色 rgb(223,222,222)；动画开启（0.8s 淡入上浮，排内延迟 0.16s） */
  bg: '#DFDEDE',
  anim: true
};

/* body 底色实测 rgb(247,248,250) */
const pageData = { blocks: [block], meta: { desc: '了解莱克 · 栏目入口', bg: '#F7F8FA' } };

/* ---------------- 统计 ---------------- */
console.log('卡片 ' + items.length + ' 张｜已本地化图片 ' + items.filter((i) => i.image).length + ' 张');
items.forEach((it, i) => console.log('  ' + (i + 1) + '. ' + it.title + '  ' + it.image));
if (missing.length) console.log('⚠️ 异常: ' + missing.join('; '));

if (DRY) {
  fs.writeFileSync('.tooling/_yz2-page-draft.json', JSON.stringify(pageData, null, 1));
  console.log('\n[dry] 已写入 .tooling/_yz2-page-draft.json');
  process.exit(0);
}
if (missing.length) {
  console.error('\n有图片没本地化，先补上传再落库。');
  process.exit(1);
}

/* ---------------- 落库 ---------------- */
const lr = await fetch(BASE + '/api/admin/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PW || 'admin' })
});
const lrJson = await lr.json();
if (lrJson.code !== 0) { console.error('登录失败：', lrJson); process.exit(1); }
const TOKEN = lrJson.data.token;

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

let key = KEY_ARG;
if (!key) {
  const created = await api('/api/decorate/page/create', {
    name: '了解莱克',
    note: '复刻有赞「了解莱克」栏目入口页（三方扩展「混合排列A」8 张图文卡片）',
    template: 'blank'
  });
  key = created.key || (created.page && created.page.key);
  console.log('页面已建：key=' + key);
} else {
  console.log('更新已有页面：key=' + key);
}

await api('/api/decorate/draft', { key, data: pageData });
console.log('草稿已保存');

const pub = await api('/api/decorate/publish', { key, note: '复刻有赞「了解莱克」页（混合排列A）' });
console.log('已生成代码：' + (pub.versionId || pub.version || JSON.stringify(pub).slice(0, 120)));
console.log('\n页面地址：/pages/custom/index?key=' + key);
