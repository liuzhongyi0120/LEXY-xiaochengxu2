/**
 * 素材库「文件夹 + 多选移动 + 放大预览」UI 无头实测（jsdom 加载真实后台页面，模拟真实点击）
 *
 *   node .tooling/test-media-ui.mjs
 *
 * 为什么要有它：console.modules.js 是纯浏览器脚本，`node --check` 只能证明「语法没错」，
 * 证明不了「选择器都对、点了有反应」。而自检里那套静态断言也抓不到
 * `document.querySelector('[data-x]')` 返回 null 之后 `addEventListener` 抛错这类问题
 * —— 表现就是页面卡在「加载中…」或整块空白。
 *
 * 这里用 jsdom 真的把 /console#media 加载起来（连 CSS / JS 都走真实 HTTP），
 * 然后模拟点击文件夹、勾选素材、全选、建文件夹、移动、删文件夹、**点图放大预览并翻页**、
 * **点空白处关闭**、**上传视频并切到视频档**，每一步都断言 DOM 与后端数据的真实变化。
 * 跑完自清理（不留下测试文件夹、测试图与测试视频）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_HELPER = await import('./_admin.mjs');
/** 管理员令牌（报告 08：素材 / 控制台点位都要求管理员身份） */
let ADMIN = '';
const ROOT = path.join(HERE, '..');
const BASE = process.env.MP_BASE || 'http://127.0.0.1:3000';

const TMP_FOLDER = '测试用文件夹';
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII=',
  'base64'
);

/** 最小 ISO BMFF（ftyp + moov[mvhd + trak[tkhd]]）—— 只为验证后端能认类型、能读出时长/分辨率 */
function mp4Fixture(w = 640, h = 360, seconds = 3) {
  const box = (type, payload) => {
    const b = Buffer.alloc(8 + payload.length);
    b.writeUInt32BE(8 + payload.length, 0);
    b.write(type, 4, 'ascii');
    payload.copy(b, 8);
    return b;
  };
  const ts = 1000;
  const mvhdP = Buffer.alloc(100);
  mvhdP.writeUInt32BE(ts, 12);
  mvhdP.writeUInt32BE(seconds * ts, 16);
  const tkhdP = Buffer.alloc(84);
  tkhdP.writeUInt32BE(7, 0);
  tkhdP.writeUInt32BE(w * 65536, 76);
  tkhdP.writeUInt32BE(h * 65536, 80);
  return Buffer.concat([
    box('ftyp', Buffer.concat([Buffer.from('isom', 'ascii'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2avc1mp41', 'ascii')])),
    box('moov', Buffer.concat([box('mvhd', mvhdP), box('trak', box('tkhd', tkhdP))]))
  ]);
}

let pass = 0;
let fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const skipped = (name, why) => console.log('  ⊘ ' + name + (why ? '  → ' + why : ''));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 10000, interval = 80) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = !!fn(); } catch (e) { v = false; }
    if (v) return true;
    if (Date.now() - t0 > timeout) return false;
    await sleep(interval);
  }
}
/** 同 waitFor，但判定函数是 async（例如要回头问后端「数据真的变了吗」） */
async function waitTrue(fn, timeout = 8000, interval = 200) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch (e) { /* 继续等 */ }
    if (Date.now() - t0 > timeout) return false;
    await sleep(interval);
  }
}

/* ---- 直连后端做准备工作（与 UI 无关的部分不经过浏览器） ---- */
async function api(method, p, body) {
  const headers = { Authorization: 'Bearer ' + ADMIN };
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}
async function cleanupFolder(name) {
  const r = await api('POST', '/api/media/folder', { op: 'remove', name });
  return r;
}
async function uploadTemp(folder) {
  const fd = new FormData();
  fd.append('file', new Blob([PNG_2X2], { type: 'image/png' }), 'ui-test-' + crypto.randomBytes(3).toString('hex') + '.png');
  const res = await fetch(BASE + '/api/media/upload?folder=' + encodeURIComponent(folder), { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN }, body: fd });
  const json = await res.json();
  return json.code === 0 ? json.data.list[0] : null;
}
/** 上传一个最小的 mp4（未分组），供「视频档 / 视频卡片 / 视频预览」三处断言使用 */
async function uploadTempVideo() {
  const fd = new FormData();
  fd.append('file', new Blob([mp4Fixture()], { type: 'video/mp4' }), 'ui-test-' + crypto.randomBytes(3).toString('hex') + '.mp4');
  const res = await fetch(BASE + '/api/media/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN }, body: fd });
  const json = await res.json();
  return json.code === 0 ? json.data.list[0] : null;
}

(async () => {
  console.log('\n素材库文件夹 UI 无头实测（jsdom）');
  console.log('目标：' + BASE + '/console#media\n');

  /* 报告 08：控制台与素材点位都要求管理员令牌，换不到就直接停 */
  try {
    ADMIN = await ADMIN_HELPER.adminToken(BASE);
    console.log('管理员会话已就绪\n');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // 清掉上次可能的残留
  await cleanupFolder(TMP_FOLDER);

  /* ---------- 准备一张「测试用文件夹」里的图，供移动测试使用 ---------- */
  const seeded = await uploadTemp(TMP_FOLDER);
  ok(!!seeded, '预置：上传一张测试图到「' + TMP_FOLDER + '」（供 UI 移动测试）', seeded ? seeded.url : '上传失败');
  if (!seeded) { console.log('\n准备失败，终止。'); process.exit(1); }

  /* ---------- 加载真实页面 ---------- */
  const errors = [];
  const vc = new VirtualConsole();
  // jsdom 没实现 HTMLMediaElement（load / pause / play 都只是 stub），它会以 jsdomError 形式
  // 报「Not implemented」—— 那是测试环境的限制，不是页面 bug，必须滤掉，否则视频用例必然假红灯
  const noteErr = (msg) => { if (!/Not implemented/.test(msg)) errors.push(msg); };
  vc.on('jsdomError', (e) => noteErr('jsdomError: ' + (e && e.message)));
  vc.on('error', (...a) => noteErr('console.error: ' + a.map(String).join(' ')));

  const dom = await JSDOM.fromURL(BASE + '/console#media', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom 不带 fetch：把它桥到 node 的 fetch，并把相对路径补成绝对地址
      window.fetch = (input, init) => globalThis.fetch(new URL(String(input), BASE).toString(), init);
      // 报告 08 之后控制台要求登录：把管理员令牌预置进同源 localStorage，
      // 否则页面只会渲染出登录遮罩，后面几十条断言全部失败。
      try { window.localStorage.setItem('lexy_admin_token', ADMIN); } catch (e) { /* ignore */ }
    }
  });
  const win = dom.window;
  const doc = win.document;

  const rendered = await waitFor(() => doc.querySelector('.media-side'), 15000);
  ok(rendered, '后台「素材」页能渲染出文件夹栏（不是卡在「加载中…」）',
    'body 前 120 字：' + (doc.getElementById('body') ? doc.getElementById('body').textContent.slice(0, 120) : '-'));
  if (!rendered) {
    errors.forEach((e) => console.log('      ' + e));
    console.log('\n渲染失败，终止。');
    process.exit(1);
  }

  const q = (sel) => doc.querySelector(sel);
  const qa = (sel) => Array.from(doc.querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  /* ---------- 1. 文件夹栏内容 ---------- */
  ok(!!q('.media-side-it[data-folder=""]'), '侧栏有「全部素材」入口');
  ok(!!q('.media-side-it[data-folder="__none__"]'), '侧栏有「未分组」入口');
  const pageFolders = qa('.media-side-it[data-folder]').map((el) => el.getAttribute('data-folder'))
    .filter((v) => v && v !== '__none__');
  ok(pageFolders.length > 0, '侧栏列出了导入的页面文件夹', pageFolders.join(' / '));
  ok(pageFolders.indexOf('首页') > -1 && pageFolders.indexOf('产品') > -1,
    '页面文件夹名与页面名一致（含「首页」「产品」）', pageFolders.join(' / '));
  ok(!errors.length, '页面加载期间无 JS 报错', errors.slice(0, 2).join(' | '));

  /* ---------- 2. 点文件夹 → 网格按文件夹过滤 ---------- */
  const allCount = qa('.media-grid .media-it').length;
  click(q('.media-side-it[data-folder="首页"]'));
  const filtered = await waitFor(() => q('.media-side-it[data-folder="首页"]').classList.contains('on'), 6000);
  ok(filtered, '点击文件夹后该条目进入选中态');
  const homeCount = qa('.media-grid .media-it').length;
  ok(homeCount > 0 && homeCount < allCount, '切到「首页」后网格只剩该文件夹的图',
    `全部 ${allCount} 张 → 首页 ${homeCount} 张`);
  ok(q('.upzone').textContent.indexOf('首页') > -1, '上传区提示「上传后归入：文件夹「首页」」');

  /* ---------- 3. 勾选 / 全选 / 清空（原地切 class） ---------- */
  const firstCard = q('.media-grid .media-it');
  const firstImg = firstCard.querySelector('img');
  ok(!!firstCard.querySelector('.pickbox'), '每张卡片都有常驻的勾选圈（多选入口可见）');
  ok(!!firstCard.querySelector('.zoomtip'), '卡片上有「查看大图」提示（告诉用户点图是预览不是选中）');
  click(firstCard.querySelector('.pickbox'));
  ok(firstCard.classList.contains('sel'), '点勾选圈进入选中态（.sel）');
  ok(firstImg === firstCard.querySelector('img'), '勾选没有重建 <img>（不整块重绘，避免缩略图闪白）');
  ok(q('[data-selcnt]').textContent === '1', '「已选 N 张」随选择更新', q('[data-selcnt]').textContent);
  ok(!q('[data-actbar]').hasAttribute('hidden'), '选中后操作条（移动到…）显示出来');
  click(firstCard.querySelector('.pickbox'));
  ok(!firstCard.classList.contains('sel') && q('[data-selcnt]').textContent === '0', '再点一次取消勾选');
  ok(q('[data-actbar]').hasAttribute('hidden'), '取消选择后操作条隐藏');

  click(q('[data-selall]'));
  ok(q('[data-selcnt]').textContent === String(homeCount), '「全选本页」选中本页全部素材', q('[data-selcnt]').textContent);
  click(q('[data-selnone]'));
  ok(q('[data-selcnt]').textContent === '0', '「清空选择」生效');

  /* ---------- 3.5 放大预览（点图 = 看大图，不是选中） ---------- */
  // 浮层根类名是 .lbx（不是 .lb —— .lb 是概览页图表 x 轴标签，撞过车，见 console.css）
  const lb = () => q('#layer .lbx');
  click(firstCard);
  const lbOpen = await waitFor(() => lb(), 4000);
  ok(lbOpen, '点素材缩略图打开大图预览浮层');
  ok(q('[data-selcnt]').textContent === '0', '点开预览不会顺手把图选上（原来最容易误触的地方）');
  ok(lb() && lb().querySelector('[data-img]').getAttribute('src') === firstImg.getAttribute('src'),
    '预览层显示的就是被点的那张图',
    lb() ? String(lb().querySelector('[data-img]').getAttribute('src')) : '无预览层');
  ok(lb() && lb().querySelector('[data-idx]').textContent === '1 / ' + homeCount,
    '预览层显示「第几张 / 共几张」', lb() ? lb().querySelector('[data-idx]').textContent : '-');
  ok(lb() && lb().querySelector('[data-name]').textContent.length > 0, '预览层显示文件名/元信息');

  // 点图片本身不该关（要凑近看细节）；点空白才关
  click(lb().querySelector('[data-img]'));
  await sleep(120);
  ok(!!lb(), '点图片本身不会误关预览');

  click(lb().querySelector('[data-next]'));
  ok(lb().querySelector('[data-idx]').textContent === '2 / ' + homeCount, '点「下一张」能翻页',
    lb().querySelector('[data-idx]').textContent);
  click(lb().querySelector('[data-prev]'));
  ok(lb().querySelector('[data-idx]').textContent === '1 / ' + homeCount, '点「上一张」能翻回去');

  // 键盘：→ 前进、← 后退
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  ok(lb().querySelector('[data-idx]').textContent === '2 / ' + homeCount, '键盘 → 也能翻页',
    lb().querySelector('[data-idx]').textContent);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  ok(lb().querySelector('[data-idx]').textContent === '1 / ' + homeCount, '键盘 ← 也能翻回去');

  // 首尾循环：在第 1 张按 ← 应该跳到最后一张（而不是卡住/崩掉）
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  ok(lb().querySelector('[data-idx]').textContent === homeCount + ' / ' + homeCount, '在第 1 张按 ← 循环到最后一张',
    lb().querySelector('[data-idx]').textContent);

  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  const lbClosed = await waitFor(() => !lb(), 3000);
  ok(lbClosed, 'Esc 能关闭预览');
  // 关键：监听器必须解绑，否则关掉预览后按方向键还会打到已经不在屏幕上的浮层
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await sleep(150);
  ok(!lb(), '关闭后键盘事件不残留（不会凭空又打开）');
  ok(doc.body.style.overflow === '' || doc.body.style.overflow === 'visible',
    '关闭后恢复页面滚动（不会把整页锁死不能滚）', doc.body.style.overflow);

  click(firstCard);
  await waitFor(() => lb(), 3000);
  click(lb().querySelector('[data-img]'));      // 再点一次图片，仍不关
  await sleep(100);
  ok(!!lb(), '（复测）点图片本身仍不会误关预览');

  /*
   * 关键回归 —— 点「图片四周的留白」必须能关。
   * 这块留白在 DOM 上属于 .lb-view（铺满整个舞台的容器），早先的关闭判定把它当成
   * 「点在图片上」排除掉了，于是"点空白关不掉"、功能形同虚设；
   * 而旧用例点的是浮层根元素（.lb），恰好绕过了这个坑，所以一直没被发现。
   */
  click(lb().querySelector('.lb-view'));
  const closedByGap = await waitFor(() => !lb(), 3000);
  ok(closedByGap, '点图片四周的留白能关闭（此前被判定成「点在图上」→ 关不掉）');

  click(firstCard);
  await waitFor(() => lb(), 3000);
  click(lb().querySelector('.lb-stage'));        // 更外层的舞台空白
  ok(await waitFor(() => !lb(), 3000), '点舞台区域的空白也能关闭');

  click(firstCard);
  await waitFor(() => lb(), 3000);
  click(lb().querySelector('[data-close]'));
  ok(await waitFor(() => !lb(), 3000), '右上角 × 能关闭');

  /* ---------- 3.8 卡片排版：图在上、信息在下、操作常驻 ---------- */
  const layoutCard = q('.media-grid .media-it');
  const kids = Array.from(layoutCard.children).map((el) => el.className);
  ok(kids[0] === 'mt', '卡片第一块是缩略图区（图片在上）', kids.join(' > '));
  ok(kids[1] === 'inf', '第二块是信息区（名称 + 元信息，都在图下面）', kids.join(' > '));
  const infKids = Array.from(layoutCard.querySelector('.inf').children).map((el) => el.className);
  ok(infKids[0] === 'nm' && infKids[1] === 'meta',
    '信息区顺序：文件名在上、元信息在下', infKids.join(' > '));
  ok(layoutCard.querySelector('.nm').textContent.trim().length > 0, '卡片下方显示文件名',
    layoutCard.querySelector('.nm').textContent);
  ok(layoutCard.querySelector('.meta').textContent.indexOf('×') > -1, '卡片下方显示尺寸等元信息',
    layoutCard.querySelector('.meta').textContent);
  /* 缩略图区一旦被写成 .thumb，就会被表格小方图的 `.thumb{width:42px;height:42px}` 命中，
   * 缩略图缩成一枚 42px 小图还溢出压住文件名 —— 这是真出过的 bug，
   * 这里用「类名 + 布局归属」两层锁住（像素级回归在 test-media-layout.mjs 里）。 */
  ok(!layoutCard.querySelector('.thumb'),
    '缩略图区不叫 .thumb（避免被表格小方图样式 42px 命中）');
  const ft = layoutCard.querySelector('.ft');
  ok(!!ft && !!ft.querySelector('[data-copy]') && !!ft.querySelector('[data-down]') && !!ft.querySelector('[data-del]'),
    '卡片下方有常驻操作行（复制链接 / 下载 / 删除，不藏在 hover 里）');
  ok(!layoutCard.querySelector('.ops2'),
    '旧的三枚文字按钮行（.ops2）已移除，改为图标行 —— 否则整片网格被字糊住');
  ok(!!q('[data-kindt=""]') && !!q('[data-kindt="image"]') && !!q('[data-kindt="video"]'),
    '顶栏有「全部 / 图片 / 视频」分档');

  /* ---------- 3.9 视频素材：分档 → 卡片 → 预览 → 点空白关闭 ---------- */
  const video = await uploadTempVideo();
  ok(!!video && video.kind === 'video', '预置：上传一个 mp4 测试视频（供视频用例）',
    video ? `${video.url} ${video.duration}s` : '上传失败');

  // 分档与文件夹是 AND 关系：先把文件夹切回「全部素材」，再看视频档
  click(q('.media-side-it[data-folder=""]'));
  await waitFor(() => q('.media-side-it[data-folder=""]').classList.contains('on'), 6000);
  click(q('[data-kindt="video"]'));
  const onVideoTab = await waitFor(() => q('[data-kindt="video"]').classList.contains('on'), 6000);
  ok(onVideoTab, '点「视频」分档后该标签进入选中态');
  let vCard = null;
  if (video) {
    await waitFor(() => q('.media-grid .media-it[data-pick="' + video.name + '"]'), 6000);
    vCard = q('.media-grid .media-it[data-pick="' + video.name + '"]');
  }
  ok(!!vCard, '视频档里能看到刚上传的视频');
  if (vCard) {
    ok(!!vCard.querySelector('video'), '视频卡片用 <video> 渲染（能显示首帧而不是裂图）');
    ok(!!vCard.querySelector('.vbadge'), '视频卡片带「视频」角标（首帧容易被当成一张图）');
    ok(vCard.getAttribute('data-kind') === 'video', '卡片带 data-kind=video（样式与测试都靠它分流）');
    ok(vCard.querySelector('.meta').textContent.indexOf('时长') > -1, '视频卡片显示时长',
      vCard.querySelector('.meta').textContent);

    click(vCard);
    const vOpen = await waitFor(() => lb(), 4000);
    ok(vOpen, '点视频卡片能打开预览浮层');
    const vEl = lb() && lb().querySelector('[data-video]');
    ok(!!vEl && !vEl.hasAttribute('hidden'), '预览层显示 <video>（而不是把视频塞进 <img>）');
    ok(!!vEl && String(vEl.getAttribute('src')).indexOf(video.name) > -1, '预览层播放的正是被点的那个视频');
    ok(!!lb().querySelector('[data-img]').hasAttribute('hidden'), '预览视频时 <img> 已隐藏（两条路只走一条）');

    click(lb().querySelector('.lb-view'));
    ok(await waitFor(() => !lb(), 3000), '视频预览同样能点空白处关闭');

    // 视频档里不该混进图片
    const allVideoKind = qa('.media-grid .media-it').every((el) => el.getAttribute('data-kind') === 'video');
    ok(allVideoKind, '「视频」档只列视频（图片不会混进来）', qa('.media-grid .media-it').length + ' 张');
  }

  click(q('[data-kindt="image"]'));
  const backImg = await waitFor(() => q('[data-kindt="image"]').classList.contains('on'), 6000);
  ok(backImg && qa('.media-grid .media-it').every((el) => el.getAttribute('data-kind') === 'image'),
    '切回「图片」档后网格里全是图片（分档真的在过滤）');

  click(q('[data-kindt=""]'));
  await waitFor(() => q('[data-kindt=""]').classList.contains('on'), 6000);
  ok(q('[data-kindt=""]').classList.contains('on'), '「全部」档能切回来（后续用例依赖完整列表）');

  // 视频用例的清理：删掉测试视频，别留在素材库里
  if (video) {
    const delV = await api('POST', '/api/media/delete', { name: video.name, force: 1 });
    ok(delV.code === 0, '测试视频已回收（不留在素材库里）', delV.msg);
  }

  /* ---------- 4. 新建文件夹（真实落库） ---------- */
  const NEW_FOLDER = '自检新建文件夹';
  await cleanupFolder(NEW_FOLDER);
  click(q('[data-newfolder]'));
  const hadPrompt = await waitFor(() => q('#layer .modal [data-input]'), 4000);
  ok(hadPrompt, '「+ 新建文件夹」弹出输入框');
  if (hadPrompt) {
    const inp = q('#layer .modal [data-input]');
    inp.value = NEW_FOLDER;
    click(q('#layer .modal [data-ok]'));
    const appeared = await waitFor(() => q('.media-side-it[data-folder="' + NEW_FOLDER + '"]'), 6000);
    ok(appeared, '新建的文件夹出现在侧栏（真实写入索引）');
    const lst = await api('GET', '/api/media/list?folder=' + encodeURIComponent(NEW_FOLDER));
    ok(lst.code === 0 && (lst.data.folders || []).some((f) => f.name === NEW_FOLDER),
      '后端确认文件夹已创建（不是只在前端画了一个）');
  }

  /* ---------- 5. 批量移动（用预置在「测试用文件夹」里的那张图） ---------- */
  click(q('.media-side-it[data-folder="' + TMP_FOLDER + '"]'));
  const inTmp = await waitFor(() => qa('.media-grid .media-it').length === 1, 6000);
  ok(inTmp, '切到「' + TMP_FOLDER + '」看到预置的那张图');
  click(q('.media-grid .media-it .pickbox'));
  ok(q('[data-selcnt]').textContent === '1', '选中待移动的素材');
  const sel = q('[data-moveto]');
  sel.value = NEW_FOLDER;
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  const movedOk = await waitTrue(async () => {
    const r = await api('GET', '/api/media/list?folder=' + encodeURIComponent(NEW_FOLDER));
    return r.code === 0 && r.data.total === 1;
  }, 8000, 200);
  ok(movedOk, 'UI 里选「移动到…」后素材真的落到目标文件夹（后端数据变了）');

  /* ---------- 6. 删除文件夹：只删分类，素材回未分组 ---------- */
  click(q('.media-side-it[data-folder="' + NEW_FOLDER + '"]'));
  await sleep(300);
  const delBtn = q('.media-side-it[data-folder="' + NEW_FOLDER + '"] [data-df]');
  ok(!!delBtn, '文件夹条目上有删除按钮（hover 显示）');
  if (delBtn) {
    click(delBtn);
    const hadConfirm = await waitFor(() => q('#layer .modal [data-ok]'), 4000);
    ok(hadConfirm, '删除文件夹前有二次确认');
    if (hadConfirm) click(q('#layer .modal [data-ok]'));
    const gone = await waitFor(() => !q('.media-side-it[data-folder="' + NEW_FOLDER + '"]'), 6000);
    ok(gone, '文件夹从侧栏消失');
    const check = await api('GET', '/api/media/list?folder=__none__');
    ok(check.code === 0 && (check.data.list || []).some((x) => x.name === seeded.name),
      '删文件夹后素材回到「未分组」而不是被删掉（图还在）');
  }

  /* ---------- 7. 预览层里的「删除」（在临时素材上做，不碰真实页面素材） ---------- */
  click(q('.media-side-it[data-folder="__none__"]'));
  const cardSel = '.media-grid .media-it[data-pick="' + seeded.name + '"]';
  const cardFound = await waitFor(() => q(cardSel), 6000);
  ok(cardFound, '预置素材现在位于「未分组」（可直接在网格里定位到它）');
  const card = q(cardSel);
  if (card) {
    click(card);
    await waitFor(() => lb(), 4000);
    ok(!!lb() && lb().querySelector('[data-img]').getAttribute('src') === seeded.url,
      '预览层显示的正是这张图');
    click(lb().querySelector('[data-del]'));
    const sure = await waitFor(() => q('#layer .modal [data-ok]'), 4000);
    ok(!!sure, '预览里点删除会先二次确认');
    if (sure) {
      click(q('#layer .modal [data-ok]'));
      const gone = await waitTrue(async () => {
        const r = await api('GET', '/api/media/list');
        return !(r.data.list || []).some((x) => x.name === seeded.name);
      }, 8000, 200);
      ok(gone, '确认后素材真的被删除（后端数据变了）');
      const cardGone = await waitFor(() => !q('.media-grid .media-it[data-pick="' + seeded.name + '"]'), 6000);
      ok(cardGone, '预览层里删除后，背后的网格同步刷新（卡片消失）');
      await sleep(200);
      ok(!!lb() && lb().querySelector('[data-img]').getAttribute('src') !== seeded.url,
        '删掉当前这张后自动切到下一张（不会停在一张已不存在的图上）');
      click(lb().querySelector('[data-close]'));
    }
  }

  /* ---------- 8. 全程无 JS 报错 ---------- */
  ok(errors.length === 0, '整轮交互无 JS 报错', errors.slice(0, 3).join(' | '));

  /* ---------- 收尾：删掉测试图与残留文件夹 ---------- */
  await api('POST', '/api/media/delete', { name: seeded.name, force: 1 });
  await cleanupFolder(TMP_FOLDER);
  await cleanupFolder(NEW_FOLDER);
  const final = await api('GET', '/api/media/list');
  const leftovers = (final.data.folders || []).filter((f) => f.name.indexOf('测试') === 0 || f.name.indexOf('自检') === 0);
  ok(leftovers.length === 0, '收尾干净（无残留的自检/测试文件夹）', JSON.stringify(leftovers));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n测试崩溃：' + e.message + '\n' + e.stack);
  process.exit(1);
});
