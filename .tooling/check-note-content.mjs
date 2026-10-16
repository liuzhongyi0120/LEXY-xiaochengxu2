/**
 * 笔记正文验收：60 篇笔记里还有没有「外链 / 破图 / 空壳」
 *
 * 三条判据（都对得上才算交付）：
 *   1. **零外链**（铁律 29）：正文与区块里不得出现 yzcdn 等外部域名 —— 外链随时失效/防盗链，真机上就是破图
 *   2. **有内容**：每篇要么有正文 HTML，要么有视频区块（两者都没有 = 点进去一片空白的哑故障）
 *   3. **引用的本地素材真的存在**：/uploads/… 逐个 HEAD/GET 确认能取到（防止引用了没入库的文件）
 *
 * ⚠️ 本检查器验的是**数据层**（数据里有没有、文件在不在）。
 *    「数据里存的是 /uploads/ 相对路径 —— 真机渲染时到底能不能显示」属于**渲染层**，
 *    本脚本**验不到**，必须另跑：
 *      · `node .tooling/check-rich-assets.mjs`（专门守这条：真跑一遍 sanitizeRich 看产物）
 *      · 已并入 `server/tools/check-all.mjs` 第 697 条断言，随全量门禁一起跑
 *    2026-10-16 的教训：本脚本 6/6 全绿，而真机上 34 篇 / 421 张图**全是破图** ——
 *    因为富文本正文是 HTML 字符串，`resolveAssets()`（对象递归）进不去，
 *    而预览链路跑在网页里、`/uploads/x` 基于 origin 自然解析 → **预览永远看不出这个 bug**。
 *
 * 用法：node .tooling/check-note-content.mjs
 */
import fs from 'node:fs';

const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
};

const list = await get('/api/decorate/pages');
const notes = (list.data && (list.data.pages || list.data.list) || []).filter((p) => String(p.key || '').startsWith('note-'));
console.log('笔记总数：' + notes.length + '\n');

/*
 * ⚠ 判据只锁**资源类引用**（img 的 src / video 的 src 与 poster / 区块里的图片字段）。
 *   不要拿「全文有没有 http://」当判据：
 *   ① `http://www.w3.org/1999/xhtml` 是 XML 命名空间（不是外链），全文扫会一次报 60 条假红；
 *   ② 正文 `<a href="https://weibo.com/...">` 是**内容里的超链接**，属于笔记内容本身，
 *      跟「图片/视频资源引外链会破图」不是一回事 —— 混在一起判就是把意图搞错。
 */
const ASSET_ATTR = /(?:src|poster|data-src)\s*=\s*["']([^"']+)["']/gi;
const EXT = /^https?:\/\/(?!127\.0\.0\.1|localhost)/i;
const assetRefs = new Set();
const extAssets = [];
const contentLinks = [];
/*
 * 有赞富文本里带 `<img src="null">` 的懒加载占位（前端运行时才换真地址）。
 * 我们没有那个运行时 → 它就是一个请求 `/null` 的**破图**。必须整段剥掉，不能留。
 * ⚠ 判据只能判「src 的取值」，不能写 `<img[^>]*src=["']?null?["']?` 那种
 *   「引号和取值都可选」的正则 —— 那会匹配**每一个** img 标签（实测会把整篇正文删光）。
 */
const placeholders = [];
let withText = 0, withVideo = 0;
const empty = [];
const noSource = [];

/* 有有赞来源的笔记（按 alias 归并键算，不写死数字） */
const ids = JSON.parse(fs.readFileSync('.tooling/_yz-note-ids.json', 'utf8'));
const sourced = new Set(Object.values(ids).filter((r) => r && r.id).map((r) => 'note-' + r.id));
const aliasKeys = Object.keys(ids).filter((k) => k.startsWith('alias:'));
const sourcedIds = new Set(aliasKeys.map((k) => 'note-' + ids[k].id));

for (const n of notes) {
  const d = await get('/api/decorate/page?key=' + n.key);
  const data = (d.data && d.data.data) || {};
  const html = String((data.body && data.body.html) || '');
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const hasVideo = blocks.some((b) => b && b.type === 'video');
  if (html.length > 0) withText++;
  if (hasVideo) withVideo++;
  if (!html.length && !hasVideo) {
    (sourcedIds.has(n.key) ? empty : noSource).push(n.key + '  ' + (n.title || ''));
  }

  let m;
  ASSET_ATTR.lastIndex = 0;
  while ((m = ASSET_ATTR.exec(html))) {
    const u = m[1];
    if (/^\/uploads\//.test(u)) assetRefs.add(u);
    else if (EXT.test(u)) extAssets.push(n.key + ' → ' + u.slice(0, 60));
  }
  for (const b of blocks) {
    ['src', 'poster', 'image'].forEach((k) => {
      const u = b && b[k];
      if (typeof u !== 'string' || !u) return;
      if (/^\/uploads\//.test(u)) assetRefs.add(u);
      else if (EXT.test(u)) extAssets.push(n.key + ' → ' + u.slice(0, 60));
    });
  }
  (html.match(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi) || []).forEach((a) => contentLinks.push(n.key + ' ' + a.slice(0, 60)));

  (html.match(/<img\b[^>]*>/gi) || []).forEach((tag) => {
    const mm = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const v = mm ? (mm[1] !== undefined ? mm[1] : mm[2] !== undefined ? mm[2] : mm[3]) : '';
    if (!v || /^(null|undefined)$/i.test(v.trim())) placeholders.push(n.key + ' → src=' + JSON.stringify(v));
  });
}

t('有有赞来源的笔记每篇都有内容（正文或视频区块；两者皆空 = 点进去一片空白）', empty.length === 0,
  `有正文 ${withText} 篇 / 有视频 ${withVideo} 篇；待补 ${empty.length} 篇 ${empty.slice(0, 4).join('；')}`);
t('没有一条**图片/视频资源**引外链（铁律 29：外链会失效/防盗链 → 真机破图）',
  extAssets.length === 0, extAssets.slice(0, 6).join('；') || '0 处');
if (noSource.length) {
  console.log('  · 另有 ' + noSource.length + ' 篇有赞侧没有对应笔记（需人工补内容，不计失败）：');
  noSource.forEach((s) => console.log('      ' + s));
}
if (contentLinks.length) {
  console.log('  · 正文里有 ' + contentLinks.length + ' 处内容超链接（属于笔记内容本身，不是资源外链）：' + contentLinks.slice(0, 3).join('；'));
}
t('正文里没有 src 为空 / null 的懒加载占位 `<img>`（它在真机上就是一张破图）',
  placeholders.length === 0, placeholders.slice(0, 5).join('；') || '0 处');
/*
 * ⚠ 必须再查**生成代码**这一层：接口里的数据干净 ≠ replica.js 里干净。
 *   实测踩过：草稿改好、接口读回来也干净，但那几次 publish 撞上 Windows 对
 *   replica.js 的 EPERM 占用（服务端重试 6 次仍失败，返回 5000）→ 生成代码里
 *   还留着 7 处 src="null"，真机/预览照旧是破图。**只查接口 = 验证的层不对**。
 */
{
  const src = fs.readFileSync('.tooling/../miniprogram/config/replica.js', 'utf8');
  const nulls = (src.match(/src=\\"null\\"/g) || []).length;
  const hasNotes = /const SHOPNOTES/.test(src);
  t('生成代码 replica.js 的笔记正文里也没有占位 `<img src="null">`（真机读的是它，不是接口）',
    nulls === 0, hasNotes ? (nulls ? nulls + ' 处残留' : '0 处') : '没找到 SHOPNOTES（判据失效，需修脚本）');
}
t('确实扫到了内容（防「一篇都没查还显示绿」的空表恒真）', notes.length > 0 && assetRefs.size > 0,
  `笔记 ${notes.length} 篇，引用本地素材 ${assetRefs.size} 个`);

/* 素材真的存在吗 */
/*
 * ⚠ 必须重试：一次打 468 个请求，偶发 ECONNRESET —— 不重试会把「网络抖了一下」
 *   报成「素材没入库」，而实际上素材是好的（验证器自己说谎比不检查更糟）。
 */
const missing = [];
for (const u of assetRefs) {
  let okAsset = false, why = '';
  for (let i = 0; i < 3 && !okAsset; i++) {
    try {
      const r = await fetch(B + u, { method: 'GET' });
      if (r.ok) okAsset = true; else why = 'HTTP ' + r.status;
    } catch (e) {
      why = e.message;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  if (!okAsset) missing.push(u + '（' + why + '）');
}
t('引用的本地素材逐个真的取得到（防「引用了没入库的文件」）', missing.length === 0,
  missing.length ? missing.slice(0, 6).join('；') : `${assetRefs.size} 个全部 200`);

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
if (fail) process.exitCode = 1;
