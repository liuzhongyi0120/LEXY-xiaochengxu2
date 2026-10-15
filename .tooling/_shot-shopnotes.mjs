/**
 * 店铺笔记 · 出图脚本（给用户看效果，不是自检）
 *
 * 与 check-shopnotes-ui.mjs 的分工：
 *   那个脚本负责「断言」；这个只负责**截图**，产出 deliverables/ 下三张实图：
 *     1. 控制台「店铺笔记」栏目（笔记列表 + 配额 + 新建入口 + 行内「装修 / 删除」）
 *        —— 2026-10-15 起入口与列表在这里，装修台列表里已经没有笔记了
 *     2. 装修台编辑器（组件库 / 区块树 / 手机预览 / 笔记头部属性面板）
 *     3. /preview 编译真机源码后的**小程序端笔记详情页**
 *
 * 流程（注意第 3 张必须先发布 —— /preview 只编译 replica.js 里的真机数据，
 * 不发布就只会看到「笔记不存在或尚未发布」的空态）：
 *   建笔记 → 存草稿（截图 1、2）→ 生成代码 → 截图 3 → 删笔记 → replica.js 逐字节还原
 *
 * 用法（前置：① 后端 3000  ② 无头 CDP 代理 3456）：
 *   node .tooling/_shot-shopnotes.mjs
 *
 * ⚠️ 本脚本会**动 replica.js**（发布一次再删掉笔记重建），所以：
 *   - 开始前要求工作区里 replica.js 是干净的（git 无改动），否则直接退出不干；
 *   - 收尾用 `git checkout -- <replica.js>` 逐字节还原，并断言确实干净。
 *   这是「发布 → 删笔记」这条链路唯一的正确收尾方式：删除本身就会重建一次 replica，
 *   只回退时间戳不足以把文件还原成原样（发布还会带进 SHOPNOTES 段）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPLICA = join(ROOT, 'miniprogram/config/replica.js');
const OUT = join(ROOT, 'deliverables');

const P = 'http://127.0.0.1:3456';
const SITE = 'http://127.0.0.1:3000';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin';

const NOTE_TITLE = '秋冬除尘季，这几件小家电真香';
const NOTE_SUMMARY = '拍打除螨 + 恒温热烘，床褥沙发都能用';
const NOTE_TAGS = '除螨仪,除尘';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
async function open(url, wait = 2400) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id;
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return r;
  if (r.error) { console.log('    [eval error] ' + JSON.stringify(r.error).slice(0, 240)); return ''; }
  return r.value === undefined ? '' : (typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });
async function shot(id, name) {
  const file = join(OUT, name);
  const r = await j('/shot?target=' + id, { method: 'POST', body: file });
  const ok = r && r.ok;
  console.log(`    ${ok ? '✓' : '✗'} ${name}${ok && existsSync(file) ? '（' + Math.round(readFileSync(file).length / 1024) + ' KB）' : ''}`);
  return ok;
}

/* ---------------- 管理员会话（HTTP 侧） ---------------- */
let TOKEN = '';
async function api(method, path, body) {
  const opt = { method, headers: { Authorization: 'Bearer ' + TOKEN } };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(SITE + path, opt);
  const t = await r.json().catch(() => null);
  return { status: r.status, code: t && t.code, msg: t && t.msg, data: t && t.data };
}

/** 在装修台页面上完成登录（不登录就只有登录层，截出来毫无意义） */
async function ensureLoggedIn(tab) {
  const rows = async () => Number(await run(tab, `String(document.querySelectorAll('#pageRows tr').length)`));
  const hasForm = await run(tab, `String(!!document.getElementById('lgPw'))`);
  if (hasForm === 'true') {
    await run(tab, `(() => {
      const pw = document.getElementById('lgPw');
      pw.value = ${JSON.stringify(ADMIN_PW)};
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = [...document.querySelectorAll('#modal button')].find((b) => /登录/.test(b.textContent));
      if (btn) btn.click();
      return 'clicked';
    })()`);
    await sleep(1700);
  }
  if (await rows() === 0) await sleep(1500);
  return await rows() > 0;
}

/* ---------------- 造一条「像真的」的笔记 ---------------- */
/* 12 位随机 id：与装修台建区块时的形态一致（a-z0-9） */
const bid = () => Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

const BLOCK_TEXT = {
  id: bid(), type: 'text',
  text: '入秋之后最明显的变化不是温度，是床上的灰。\n每周换洗一次床单，不代表床垫干净 —— 皮屑、尘螨的尸体和排泄物都沉在纤维深处，晒被子只能杀掉表层。',
  size: 'md', color: '#333333', bg: '#FFFFFF', align: 'left', link: '', showSplitLine: false
};
const BLOCK_IMG = {
  id: bid(), type: 'swiper', mode: 'single', height: 750, radius: 'round',
  images: [{ image: '/uploads/202610/20261009-eqst4d.jpg', link: '' }],
  interval: 4500, indicator: 'none', pageMargin: 12, imageGap: 0
};
const BLOCK_LINE = {
  id: bid(), type: 'line', style: 'solid', height: 2, gapY: 16,
  color: '#EEEEEE', bg: '', pageMargin: 12
};
/* 顺带把「辅助空白」也放进去 —— 它与「文本」是 2026-10-15 那个放行清单 bug 的两个当事 kind，
   出图时让它们真的出现在页面上，比只在自检里过一遍更有说服力（截图里看得到空白高度差）。 */
const BLOCK_BLANK = { id: bid(), type: 'blank', height: 30 };
const BLOCK_TEXT2 = {
  id: bid(), type: 'text',
  text: '实测下来两件事最有用：一是重锤拍打把深层的灰「震」出来，二是恒温热烘把潮气带走 —— 除螨这件事，干燥比什么都管用。',
  size: 'md', color: '#333333', bg: '#FFFFFF', align: 'left', link: '', showSplitLine: false
};
const BODY_HTML = [
  '<p><b>秋冬除尘季</b>，把除螨这件事当成换季的固定动作。</p>',
  '<p>选除螨仪只看三点：拍打力度、吸力、以及有没有热风。下面这台是今年回购率最高的一款。</p>'
].join('');

const DRAFT = {
  header: {
    title: NOTE_TITLE,
    summary: NOTE_SUMMARY,
    tags: NOTE_TAGS,
    coverMode: 'multi',
    covers: ['/uploads/202610/20261009-e88t3q.jpg'],
    showGoodsCard: true,
    showNoteOnGoods: false,
    templateId: 2,
    showTitle: true, showPublishTime: true, showBrowseCount: true,
    showThumbsUpCount: true, showEnterShop: true, showRecommendItems: true
  },
  body: { html: BODY_HTML, bg: '#ffffff', full: '1' },
  blocks: [BLOCK_TEXT, BLOCK_IMG, BLOCK_BLANK, BLOCK_LINE, BLOCK_TEXT2]
};

let createdKey = '';

(async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  /* ---------- 0. 前置：replica.js 必须没有未提交改动（本脚本会发布一次再 checkout 还原） ----------
   * 判据只锁**这一个文件**：收尾用的是 `git checkout -- <replica.js>`，
   * 它只可能吃掉这一个文件的未提交改动。用「整个工作区必须干净」当拦路牌太糙 ——
   * 会因为一个还没提交的脚本或文档就把出图卡住，而它跟本脚本干的事毫无关系。 */
  const dirty = git(['status', '--porcelain', '--', 'miniprogram/config/replica.js']).trim();
  if (dirty) {
    console.log('✗ replica.js 有未提交改动，先提交或还原再跑（本脚本会发布一次并重建它）：\n' + dirty);
    process.exit(2);
  }
  const before = readFileSync(REPLICA);

  const tabs = [];
  try {
    const ver = await j('/json/version').catch(() => null);
    if (!ver || !ver.Browser) throw new Error('无头 CDP 代理（3456）不可用');
    console.log('【0】前置 OK：' + ver.Browser);

    const lg = await api('POST', '/api/admin/login', { password: ADMIN_PW });
    TOKEN = lg.data && lg.data.token;
    if (!TOKEN) throw new Error('拿不到管理员令牌：' + (lg.msg || lg.code));

    /* 清掉可能残留的同名笔记，保证幂等 */
    const pre = await api('GET', '/api/decorate/notes');
    for (const n of ((pre.data && pre.data.list) || [])) {
      if (n.title === NOTE_TITLE) await api('POST', '/api/decorate/note/delete', { key: n.key });
    }

    /* ---------- 1. 建笔记 + 存草稿 ---------- */
    console.log('【1】建笔记');
    const cr = await api('POST', '/api/decorate/note/create', { title: NOTE_TITLE, summary: NOTE_SUMMARY, tags: NOTE_TAGS });
    createdKey = cr.data && cr.data.page && cr.data.page.key;
    if (!createdKey) throw new Error('新建笔记失败：' + JSON.stringify(cr).slice(0, 200));
    const noteId = Number(String(createdKey).replace(/^note-/, ''));
    const dr = await api('POST', '/api/decorate/draft', { key: createdKey, data: DRAFT });
    if (dr.code !== 0) throw new Error('存草稿失败：' + JSON.stringify(dr).slice(0, 240));
    console.log('    ' + createdKey + '（id=' + noteId + '）草稿已存，' + DRAFT.blocks.length + ' 个组件');

    /* ---------- 2. 控制台「店铺笔记」栏目 ----------
     *
     * 2026-10-15 起笔记的入口与列表搬到后台控制台的「店铺笔记」栏目，
     * 装修台列表里已经没有它了（那里只剩「装修」那一半，见第 3 张图）。
     * 截图要跟着搬到 /console#shopnotes，别再对着装修台列表找笔记行。
     */
    console.log('\n【2】截控制台「店铺笔记」栏目');
    const tabA = await open(SITE + '/console#shopnotes', 2800);
    tabs.push(tabA);
    const cl = await run(tabA, `(() => {
      const p = document.getElementById('body') ? document.querySelector('#body [data-p]') : null;
      if (!p) return 'already-logged-in';
      p.value = ${JSON.stringify(ADMIN_PW)};
      document.querySelector('#body [data-login]').click();
      return 'logged-in';
    })()`);
    await sleep(1900);
    /* 登录后 hash 会被带回 #dashboard，再点一次侧栏「店铺笔记」 */
    await run(tabA, `(() => {
      const b = [...document.querySelectorAll('#nav .nav-item')].find((x) => x.textContent.trim() === '店铺笔记');
      if (!b) return 'no-nav';
      b.click();
      return 'ok';
    })()`);
    await sleep(1500);
    const rowSeen = await run(tabA, `String([...document.querySelectorAll('#body table.tb tbody tr')]
      .filter((r) => r.innerText.indexOf(${JSON.stringify(NOTE_TITLE)}) >= 0).length)`);
    console.log('    控制台登录 → ' + cl + '；命中的笔记行 = ' + rowSeen);
    if (rowSeen !== '1') console.log('    ⚠️ 期望命中 1 行（这次建的这篇），实际 ' + rowSeen + ' 行');
    await shot(tabA, '店铺笔记-控制台列表.png');

    /* ---------- 3. 装修台编辑器（?edit=note-N 直达） ---------- */
    console.log('\n【3】截装修台编辑器');
    const tabB = await open(SITE + '/admin?edit=' + encodeURIComponent(createdKey), 3400);
    tabs.push(tabB);
    // 同一浏览器同源，tabA 已登录 → tabB 直接带令牌；这里只是兜底
    await ensureLoggedIn(tabB);
    /* 选中「笔记头部」：属性面板才会切到标题/摘要/标签/封面/开关那一屏
       （选中的是区块树里那个分组节点，与 check-shopnotes-ui.mjs 同一选择器） */
    const picked = await run(tabB, `(() => {
      const head = [...document.querySelectorAll('#tree .tnode')]
        .find((n) => ((n.querySelector(':scope > .txt') || {}).textContent || '') === '笔记头部');
      if (!head) return 'no-header-node';
      head.click();
      return 'ok';
    })()`);
    console.log('    选中「笔记头部」→ ' + picked);
    await sleep(1200);
    await shot(tabB, '店铺笔记-装修台编辑器.png');

    /* ---------- 4. 生成代码（发布）→ /preview 编译真机源码 ---------- */
    console.log('\n【4】生成代码 → 截小程序端详情页');
    /*
     * 发布走装修台自己的接口（与点「生成代码」同一个入口），不用脚本另写一份写文件逻辑。
     * ⚠️ 发布前先确认草稿还在 —— 上面 tabB 只是「打开」，没有点存至草稿，
     *    所以这里发布的就是第 1 步 POST 进去的那份草稿。
     */
    const pub = await api('POST', '/api/decorate/publish', { key: createdKey, note: '出图用（脚本）' });
    if (pub.code !== 0) throw new Error('发布失败：' + JSON.stringify(pub).slice(0, 240));
    console.log('    replica.js 已重建（含 SHOPNOTES.' + noteId + '）');
    const tabC = await open(SITE + '/preview', 2600);
    tabs.push(tabC);
    // 左栏列表里点中这条笔记（说明：这里**不发请求**，页面自己加载完列表后点它）
    const clicked = await run(tabC, `(() => {
      const it = document.querySelector('#pvPages .pv-item[data-key=\\"${createdKey}\\"]');
      if (!it) return 'item-not-found';
      it.click();
      // 左栏也是内部滚动容器：把选中项滚到可见处，截图里才看得到「店铺笔记」这个角标
      // （block:'nearest' 只滚最近的可滚祖先，不会把整页带着跳）
      it.scrollIntoView({ block: 'nearest' });
      return 'clicked';
    })()`);
    console.log('    左栏点击 ' + createdKey + ' → ' + clicked);
    await sleep(3600); // 真机源码编译 + 图片加载
    await shot(tabC, '店铺笔记-小程序端详情页.png');

    /* 顺手确认一下真机页面**确实**渲染出了内容（截图是给人看的，这里给个客观判据）
     * ⚠️ 选择器别写 `[data-block], .c-*` —— 类选择器里 `*` 非法，会直接抛 SyntaxError
     *    （第一次就是这么写的，报 "not a valid selector"，整条实测变空）。 */
    const pageInfo = await run(tabC, `(() => {
      const p = document.querySelector('#preview .note-page');
      if (!p) return JSON.stringify({ err: 'no-note-page' });
      const cls = [...p.querySelectorAll('*')]
        .map((n) => (typeof n.className === 'string' ? n.className : ''))
        .join(' ');
      return JSON.stringify({
        title: (p.querySelector('.nt-title') || {}).textContent || '',
        time: (p.querySelector('.nt-time-t') || {}).textContent || '',
        tags: [...p.querySelectorAll('.nt-tag')].map((t) => t.textContent).join(','),
        textBlock: cls.indexOf('cu-text') >= 0,
        imgOk: [...p.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0),
        imgCount: p.querySelectorAll('img').length,
        text: (p.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
      });
    })()`);
    console.log('    详情页实测：' + pageInfo);
  } catch (err) {
    console.log('\n✗ 异常：' + (err && err.stack ? err.stack : err));
  } finally {
    /* 收尾 1：关标签页（不点「返回」，避免原生「离开？」框卡死） */
    for (const t of tabs) { try { await close(t); } catch (_) { /* ignore */ } }
    /* 收尾 2：删掉出图用的笔记（会连带草稿、版本记录，并重建 replica.js） */
    if (createdKey && TOKEN) {
      const rm = await api('POST', '/api/decorate/note/delete', { key: createdKey });
      console.log('\n收尾：删除 ' + createdKey + ' → code=' + rm.code);
    }
    /* 收尾 3：replica.js 逐字节还原。
     *   本脚本发布过一次，只回退时间戳是不够的（SHOPNOTES 段要一起没）。
     *   脚本开头已经断言过工作区干净，所以这里 `git checkout` 是安全的，
     *   不会掩盖任何「原本就有的改动」。 */
    try {
      git(['checkout', '--', 'miniprogram/config/replica.js']);
      const same = Buffer.compare(before, readFileSync(REPLICA)) === 0;
      console.log('收尾：replica.js ' + (same ? '逐字节还原 ✓' : '还原后与开始时不一致 ✗（请手工 diff）'));
    } catch (e) {
      console.log('收尾：replica.js 还原失败 ✗ ' + e.message);
    }
    const left = git(['status', '--porcelain']).trim();
    console.log('收尾：工作区 ' + (left ? '有残留 ✗\n' + left : '干净 ✓'));
  }
})();
