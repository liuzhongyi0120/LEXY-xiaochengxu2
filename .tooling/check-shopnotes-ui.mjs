/**
 * 店铺笔记 · 浏览器验收脚本（装修台 + 控制台两侧）
 *
 * 前面几个自检（_test-shopnotes / _test-notes-e2e / _test-notes-http / check-all 15.81）
 * 覆盖的是「数据层 → store 编排 → 接口」。但「运营点下去到底会不会变」只能在真浏览器里验，
 * 这个脚本补那一段。
 *
 * 2026-10-15 起「店铺笔记」的**入口与列表**从装修台搬到了后台控制台的「店铺笔记」栏目，
 * 装修台只保留「装修」那一半。所以本脚本分两半：
 *
 *  A. 装修台（不该再有笔记入口）：
 *    1. 没有 #statNote 统计卡、没有 #btnCreateNote 按钮，工具条只剩 筛选 / 重置 / + 新建页面
 *    2. 页面表格里 0 条笔记行，「归属」筛选里没有「店铺笔记」
 *    3. 底部说明指向控制台（链接到 /console#shopnotes）
 *    4. `/admin?edit=note-N` 仍能打开编辑器：顶栏标记 = 店铺笔记、青绿配色、组件库不收起、
 *       区块树两段固定区（笔记头部 / 笔记正文）
 *    5. 属性面板**读得出**运营填的标题 / 摘要 / 标签（曾经平铺在 data.title 上，面板全空）
 *    6. 面板改标题 → 存至草稿 → 接口回读确实是新标题；丢弃草稿 → 回到原标题
 *    7. 点组件卡片能加进区块树，且**存得下去**（面板放行的 kind 必须过草稿校验）
 *
 *  B. 控制台「店铺笔记」栏目（接管了入口与列表）：
 *    8. 未登录访问 /console 被强制落到 #login；侧栏其它栏目全部 .locked
 *    9. 共享口令登录 → 进 dashboard；点「店铺笔记」能看到同一篇（与装修台同一份数据）
 *   10. 行内「装修」= <a target=_blank href="/admin?edit=note-N">；「删除」走确认层
 *   11. 点「新建」→ 弹层 → 提交 → 列表 +1 → 再从行内「删除」删掉（走 UI 确认层）
 *
 * 收尾：清掉测试笔记、核对注册表已清空、replica.js 内容未变（只回退时间戳噪音）。
 *
 * 用法（前置：① 后端 3000 ② 无头 CDP 代理 3456）：
 *   node server/index.js
 *   node .tooling/_cdp-headless.mjs &
 *   node .tooling/check-shopnotes-ui.mjs
 *
 * ⚠️ 装修台有未保存改动时点「返回列表」会弹浏览器原生「离开？」框并卡死该标签页 ——
 *    这里只关标签页，不点返回（与 check-admin-nav.mjs 同一约定）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPLICA = join(ROOT, 'miniprogram/config/replica.js');

const P = 'http://localhost:3456';
const SITE = 'http://127.0.0.1:3000';

let pass = 0, fail = 0;
const fails = [];
/*
 * ⚠️ 形参顺序是 (名称, 条件)，与 check-admin-nav.mjs 的 (条件, 名称) **相反** ——
 *    本文件一律「名称在前」读起来更顺。曾经把顺序写反，结果条件位收到的是名称字符串
 *    （恒真），所有断言都打印「✓ true」，一个都不会红 —— 正是「恒真的断言等于没有断言」。
 *    新增断言前先确认调用形态：ok('某件事成立', 实际条件, 失败时的补充信息)。
 */
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(url, wait = 2300) {
  const r = await j('/new', { method: 'POST', body: url });
  const id = r.targetId || r.id || (r.target && r.target.id);
  if (!id) throw new Error('打不开标签页：' + JSON.stringify(r).slice(0, 200));
  await sleep(wait);
  return id;
}
async function run(id, js) {
  const r = await j('/eval?target=' + id, { method: 'POST', body: js });
  if (typeof r === 'string') return '';
  if (r.error) { console.log('    [eval error] ' + JSON.stringify(r.error).slice(0, 300)); return ''; }
  if (r.value !== undefined) return typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
  return '';
}
const close = (id) => j('/close?target=' + id, { method: 'POST', body: '' });

/* ---------------- 管理员会话（HTTP 侧，用于造/清测试数据） ---------------- */
const ADMIN_PW = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
let TOKEN = '';
async function api(method, path, body) {
  const opt = { method, headers: { Authorization: 'Bearer ' + TOKEN } };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(SITE + path, opt);
  const t = await r.json().catch(() => null);
  return { status: r.status, code: t && t.code, msg: t && t.msg, data: t && t.data };
}

/** 在装修台页面上完成登录（全新标签页会弹登录层） */
async function loginInPage(tab) {
  const r = await run(tab, `(() => {
    const pw = document.getElementById('lgPw');
    if (!pw) return 'no-login-form';
    pw.value = ${JSON.stringify(ADMIN_PW)};
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...document.querySelectorAll('#modal button')].find((b) => /登录/.test(b.textContent));
    if (!btn) return 'no-login-button';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(1500);
  return r;
}

/** 确保「已登录且列表已渲染」 */
async function ensureLoggedIn(tab) {
  const rows = async () => Number(await run(tab, `String(document.querySelectorAll('#pageRows tr').length)`));
  const lg = await loginInPage(tab);
  if (await rows() > 0) return lg;
  await sleep(1600);
  if (await rows() > 0) return lg;
  return 'list-empty:' + lg;
}

const NOTE_TITLE = '秋冬除尘季，这几件小家电真香';
const NOTE_SUMMARY = '一句话卖点';
const NOTE_TAGS = '洗地机,吸尘器';
let createdKey = '';
/* 第 2.5 节从控制台 UI 新建的那一篇（正常会当场删掉；中途异常时由 finally 按标题扫掉） */
let consoleNoteTitle = '';

(async function main() {
  /*
   * 章节标头带一个「距开跑多少秒」的时间戳。
   *
   * 这不是装饰：这个脚本会**真发布一次笔记**，而 replica.js 里出现 SHOPNOTES 也是别的
   * 环节（删笔记、发布页面）的副作用。排查「到底哪一步把它写出来的」时，
   * 把本脚本的时间戳与 `.tooling/_watch-shopnotes.mjs` 的观察时刻一对就定位了
   * （2026-10-15 那个「没点生成代码的笔记被顺带下发」的 bug 就是这么抓到的）。
   */
  const T0 = Date.now();
  const TLOG = (m) => {
    const t = '  [t=' + ((Date.now() - T0) / 1000).toFixed(1) + 's]';
    console.log(String(m).replace(/\n$/, '') + t);
  };
  const before = readFileSync(REPLICA);
  const tabs = [];

  try {
    /* ---------- 0. 前置：后端 + CDP 代理 + 管理员令牌 ---------- */
    console.log('【0】前置检查');
    const ver = await j('/json/version').catch(() => null);
    ok('无头 CDP 代理可用', !!(ver && ver.Browser), JSON.stringify(ver).slice(0, 120));
    const lg = await api('POST', '/api/admin/login', { password: ADMIN_PW });
    TOKEN = lg.data && lg.data.token;
    ok('管理员令牌已拿到', !!TOKEN, lg.msg || String(lg.code));
    if (!TOKEN) throw new Error('拿不到管理员令牌');

    /* 清掉可能残留的同名测试笔记，保证幂等 */
    const pre = await api('GET', '/api/decorate/notes');
    for (const n of ((pre.data && pre.data.list) || [])) {
      if (n.title === NOTE_TITLE) await api('POST', '/api/decorate/note/delete', { key: n.key });
    }

    /* ---------- 1. 造一条测试笔记 ---------- */
    TLOG('\n【1】造测试数据');
    const cr = await api('POST', '/api/decorate/note/create', { title: NOTE_TITLE, summary: NOTE_SUMMARY, tags: NOTE_TAGS });
    createdKey = cr.data && cr.data.page && cr.data.page.key;
    ok('笔记已创建', !!createdKey, JSON.stringify(cr).slice(0, 200));

    /* ---------- 2. 装修台列表页：笔记入口与列表已撤（真浏览器） ---------- */
    TLOG('\n【2】装修台列表页：笔记入口与列表已撤');
    const tab = await open(SITE + '/admin');
    tabs.push(tab);
    const state = await ensureLoggedIn(tab);
    ok('列表已渲染', Number(await run(tab, `String(document.querySelectorAll('#pageRows tr').length)`)) > 0, state);

    const gone = await run(tab, `(() => {
      const trs = [...document.querySelectorAll('#pageRows tr')];
      return JSON.stringify({
        hasStatNote: !!document.getElementById('statNote'),
        hasCreateNoteBtn: !!document.getElementById('btnCreateNote'),
        toolbar: [...document.querySelectorAll('.toolbar button')].map((b) => b.textContent.trim()),
        toolbarAll: [...document.querySelectorAll('.toolbar [id^=btn]')].map((b) => b.id),
        noteRows: trs.filter((r) => r.innerText.indexOf('店铺笔记') >= 0).length,
        belongs: [...document.querySelectorAll('#fBelongs option')].map((o) => o.textContent).join(','),
        foot: document.getElementById('listFoot').innerHTML,
        noteLink: !!document.querySelector('#listFoot a[href="/console#shopnotes"]')
      });
    })()`);
    let g = {};
    try { g = JSON.parse(gone); } catch (e) { /* ignore */ }
    ok('顶部「店铺笔记 N / 50」统计卡已撤掉（#statNote 不存在）', g.hasStatNote === false, gone);
    ok('工具条里的「+ 新建笔记」已撤掉（#btnCreateNote 不存在）', g.hasCreateNoteBtn === false, gone);
    ok('工具条只剩 筛选 / 重置 / + 新建页面',
      (g.toolbar || []).join('|') === '筛选|重置|+ 新建页面', (g.toolbar || []).join('|'));
    ok('页面表格里 0 条笔记行（笔记不再混在页面列表里）', g.noteRows === 0, String(g.noteRows));
    ok('「归属」筛选里没有「店铺笔记」（它已不是本页的页面类型）',
      (g.belongs || '').indexOf('店铺笔记') < 0, g.belongs);
    ok('底部说明指向控制台「店铺笔记」栏目（真链接 /console#shopnotes）', g.noteLink === true,
      String(g.foot).replace(/\s+/g, ' ').slice(0, 120));

    /* ---------- 2.5 控制台「店铺笔记」栏目接管（真浏览器） ---------- */
    TLOG('\n【2.5】控制台「店铺笔记」栏目接管（真浏览器）');
    const ctab = await open(SITE + '/console');
    tabs.push(ctab);
    /* 先清掉登录态再看 —— 否则上一轮跑完留在 localStorage 里的令牌会让「未登录强制跳转」假绿。
     *
     * ⚠️ 只清 localStorage **不够**：AdminSession 会把令牌与身份在内存里缓存一份
     *    （`_token` / `_me` 为 null 时才回读 localStorage），所以必须整页重载。
     *    重载放在 setTimeout 里：让这次 eval 先把结果返回，别跟导航抢时序。
     *    也不直接调 boot()/AdminSession.clear() —— 那是内部函数，改名就断
     *    （断言要锁意图，不锁实现字面）。 */
    await run(ctab, `(() => {
      localStorage.removeItem('lexy_admin_token');
      localStorage.removeItem('lexy_admin_me');
      location.hash = '';
      setTimeout(function () { location.reload(); }, 30);
      return 'reload-scheduled';
    })()`);
    await sleep(2500);

    const cnav = await run(ctab, `(() => {
      const items = [...document.querySelectorAll('#nav .nav-item')];
      return JSON.stringify({
        texts: items.map((b) => b.textContent.trim()),
        locked: items.filter((b) => b.classList.contains('locked')).map((b) => b.textContent.trim()),
        hash: location.hash,
        title: document.getElementById('pgTitle').textContent,
        hasPwForm: !!document.querySelector('#body [data-p]'),
        pwType: (document.querySelector('#body [data-p]') || {}).type || ''
      });
    })()`);
    let cn = {};
    try { cn = JSON.parse(cnav); } catch (e) { /* ignore */ }
    console.log('    侧栏实测：' + cnav);
    ok('★ 未登录访问 /console 被强制落到登录页（hash=#login、标题=登录）',
      cn.hash === '#login' && cn.title === '登录', cnav);
    ok('登录页渲染出账号 + 口令表单（口令框 type=password）',
      cn.hasPwForm === true && cn.pwType === 'password', cnav);
    ok('侧栏含 店铺笔记 / 成员管理 / 登录 三栏',
      ['店铺笔记', '成员管理', '登录'].every((t) => (cn.texts || []).indexOf(t) >= 0),
      (cn.texts || []).join('/'));
    ok('未登录时除「登录」外全部置灰不可点（13 栏里 12 栏 locked）',
      (cn.locked || []).length === (cn.texts || []).length - 1 && (cn.locked || []).indexOf('登录') < 0,
      'locked=' + (cn.locked || []).length + '/' + (cn.texts || []).length);

    /* 用共享口令登录（控制台自己的表单，与装修台的登录层不是一回事） */
    await run(ctab, `(() => {
      document.querySelector('#body [data-p]').value = ${JSON.stringify(ADMIN_PW)};
      document.querySelector('#body [data-login]').click();
      return 'clicked';
    })()`);
    await sleep(1800);
    const afterLogin = await run(ctab, `JSON.stringify({ hash: location.hash, title: document.getElementById('pgTitle').textContent })`);
    let al = {};
    try { al = JSON.parse(afterLogin); } catch (e) { /* ignore */ }
    ok('共享口令登录后进入数据概览（hash=#dashboard）', al.hash === '#dashboard', afterLogin);

    /* 进「店铺笔记」栏目 —— 与装修台读的是同一份数据，所以应该看得见刚造的那篇 */
    await run(ctab, `(() => {
      const b = [...document.querySelectorAll('#nav .nav-item')].find((x) => x.textContent.trim() === '店铺笔记');
      b.click();
      return 'clicked';
    })()`);
    await sleep(1500);
    const listInfo = await run(ctab, `(() => {
      const trs = [...document.querySelectorAll('#body table.tb tbody tr')];
      const hit = trs.find((r) => r.innerText.indexOf(${JSON.stringify(NOTE_TITLE)}) >= 0);
      return JSON.stringify({
        rows: trs.length,
        headers: [...document.querySelectorAll('#body table.tb thead th')].map((t) => t.textContent.trim()),
        hitFound: !!hit,
        hitButtons: hit ? [...hit.querySelectorAll('a, button')].map((b) => ({
          text: b.textContent.trim(), tag: b.tagName.toLowerCase(),
          href: b.getAttribute('href') || '', target: b.getAttribute('target') || ''
        })) : [],
        hasNewBtn: !!document.querySelector('#body [data-new]'),
        hitCells: hit ? [...hit.querySelectorAll('td')].map((t) => t.innerText.replace(/\\s+/g, ' ').trim()) : [],
        statLine: (document.querySelector('#body .card.stat-line') || {}).innerText || ''
      });
    })()`);
    console.log('    列表实测：' + listInfo);
    let li = {};
    try { li = JSON.parse(listInfo); } catch (e) { /* ignore */ }
    ok('控制台「店铺笔记」栏目里能看到装修台造的那一篇（两侧同一份数据）', li.hitFound === true, listInfo);
    ok('列头 = 笔记标题 · 真机地址 / 状态 / 内容量 / 操作',
      (li.headers || []).join('|') === '笔记标题 · 真机地址|状态|内容量|操作', (li.headers || []).join('|'));
    const draw = (li.hitButtons || []).find((b) => b.text === '装修');
    ok('★ 行内「装修」是新窗口打开的真链接 /admin?edit=note-N（装修那一半仍留在装修台）',
      !!draw && draw.tag === 'a' && draw.target === '_blank' &&
      draw.href.indexOf('?edit=' + encodeURIComponent(createdKey)) > 0,
      JSON.stringify(draw));
    const delBtnInfo = (li.hitButtons || []).find((b) => b.text === '删除');
    ok('行内有「删除」按钮（笔记行**没有**「改名」—— 改名会与「标题在编辑器里改」两处打架）',
      !!delBtnInfo && (li.hitButtons || []).every((b) => b.text !== '改名'), JSON.stringify(li.hitButtons));
    ok('本页带「新建」入口（#body [data-new]）', li.hasNewBtn === true, listInfo);
    /*
     * 「内容量」列：这篇刚建好、**还没有草稿**，所以报的是已生成代码那份（0 个组件）。
     * 期望值直接写文案而不是只判「非空」——只判非空的话，把这一列改回写死的 0 也会绿。
     * 有草稿时该列换成「草稿 N 个组件」，那一条在第 4 节存完草稿后复查（见下）。
     */
    ok('「内容量」列：无草稿时报已生成代码的区块数（未生成代码 → 0 个组件）',
      String((li.hitCells || [])[2] || '') === '0 个组件', JSON.stringify(li.hitCells));
    /* ⚠️ innerText 里「/ 50 篇」前后是换行，先把连续空白折成一个空格再比 ——
     *    直接对着带换行的原文写正则，红的是「排版换行」而不是「配额没了」（假红）。 */
    const statFlat = String(li.statLine).replace(/\s+/g, ' ');
    ok('页面顶部有笔记配额与口径说明（店铺笔记 N / 50 篇）',
      /店铺笔记 \d+ \/ 50 篇/.test(statFlat), statFlat.slice(0, 100));

    /* 点「新建」→ 弹层 */
    const UI_NOTE_TITLE = '控制台验收临时笔记（会自动删）';
    const ROWS_EXPR = `[...document.querySelectorAll('#body table.tb tbody tr')]`;
    await run(ctab, `document.querySelector('#body [data-new]').click(); 'ok'`);
    await sleep(600);
    const dlgInfo = await run(ctab, `(() => {
      const mask = document.querySelector('#layer .mask');
      if (!mask) return JSON.stringify({ err: 'no-modal' });
      return JSON.stringify({
        title: (document.querySelector('#layer .mask + *') || {}).textContent || '',
        hasTitle: !!mask.querySelector('[data-title]'),
        hasSummary: !!mask.querySelector('[data-summary]'),
        hasTags: !!mask.querySelector('[data-tags]'),
        titlePh: (mask.querySelector('[data-title]') || {}).placeholder || '',
        okText: (mask.querySelector('[data-ok]') || {}).textContent || '',
        text: mask.innerText.replace(/\\s+/g, ' ').slice(0, 200)
      });
    })()`);
    let di = {};
    try { di = JSON.parse(dlgInfo); } catch (e) { /* ignore */ }
    ok('新建弹层含 标题 / 摘要 / 标签 三格，且标题占位写明「必填，5~40 字」口径（口径由后端下发，前端不写死）',
      di.hasTitle === true && di.hasSummary === true && di.hasTags === true &&
      /必填，5~40 字/.test(String(di.titlePh)), dlgInfo);
    ok('弹层说明「新建后只是后台多出一篇笔记，生成代码才写进 replica.js」',
      /replica\.js/.test(String(di.text)) && /生成代码/.test(String(di.text)), String(di.text).slice(0, 100));

    /* 超长标题（41 字）→ 前端先拦一次，列表条数必须不变（后果断言） */
    const TOO_LONG = '超'.repeat(41);
    await run(ctab, `(() => {
      const mask = document.querySelector('#layer .mask');
      mask.querySelector('[data-title]').value = ${JSON.stringify(TOO_LONG)};
      mask.querySelector('[data-ok]').click();
      return 'ok';
    })()`);
    await sleep(1000);
    const overLong = await run(ctab, `JSON.stringify({ rows: ${ROWS_EXPR}.length, modalOpen: !!document.querySelector('#layer .mask') })`);
    let ol = {};
    try { ol = JSON.parse(overLong); } catch (e) { /* ignore */ }
    ok('超长标题（41 字）被拦下：列表条数不变、弹层还开着（不假装建成功）',
      ol.rows === li.rows && ol.modalOpen === true, overLong);

    /* 填合法标题 → 提交 → 列表 +1，并且「建完直接开编辑器」真的调了 window.open(…?edit=note-N) */
    await run(ctab, `(() => {
      /* 把 window.open 换掉：只记录参数、不真开标签页 ——
       * 既验了「建完会直接带去编辑器」，又不给本脚本留下收尾用的多余标签页。 */
      window.__opened = '';
      window.open = function (u) { window.__opened = String(u); return {}; };
      const mask = document.querySelector('#layer .mask');
      mask.querySelector('[data-title]').value = ${JSON.stringify(UI_NOTE_TITLE)};
      mask.querySelector('[data-summary]').value = '一句话卖点';
      mask.querySelector('[data-tags]').value = '验收';
      mask.querySelector('[data-ok]').click();
      return 'ok';
    })()`);
    await sleep(1900);
    const afterNew = await run(ctab, `(() => {
      const trs = ${ROWS_EXPR};
      return JSON.stringify({
        rows: trs.length,
        hit: trs.filter((r) => r.innerText.indexOf(${JSON.stringify(UI_NOTE_TITLE)}) >= 0).length,
        opened: window.__opened || ''
      });
    })()`);
    let an = {};
    try { an = JSON.parse(afterNew); } catch (e) { /* ignore */ }
    ok('★ 从控制台新建 → 列表多出一行（走的是同一个 /api/decorate/note/create）',
      an.hit === 1 && an.rows === (li.rows || 0) + 1, afterNew);
    ok('建完直接带进编辑器：window.open 的地址是 /admin?edit=note-N',
      /^\/admin\?edit=note-\d+$/.test(String(an.opened)), String(an.opened));

    /* 再从行内「删除」删掉它（走 UI 确认层） */
    const delFlow = await run(ctab, `(() => {
      const tr = [...document.querySelectorAll('#body table.tb tbody tr')]
        .find((r) => r.innerText.indexOf(${JSON.stringify(UI_NOTE_TITLE)}) >= 0);
      if (!tr) return JSON.stringify({ err: 'row-gone' });
      tr.querySelector('[data-note-del]').click();
      return JSON.stringify({ clicked: true });
    })()`);
    await sleep(700);
    const confirmInfo = await run(ctab, `(() => {
      const mask = document.querySelector('#layer .mask');
      return JSON.stringify({
        text: mask ? mask.innerText.replace(/\\s+/g, ' ').slice(0, 220) : '(无确认层)',
        hasDelBtn: !!mask && [...mask.querySelectorAll('button')].some((b) => b.textContent.trim() === '删除')
      });
    })()`);
    let ci = {};
    try { ci = JSON.parse(confirmInfo); } catch (e) { /* ignore */ }
    ok('点「删除」先弹确认层，文案讲清连带影响与不可撤销',
      ci.hasDelBtn === true && /删除笔记/.test(String(ci.text)) && /不可撤销/.test(String(ci.text)),
      String(ci.text).slice(0, 160));
    await run(ctab, `(() => {
      const mask = document.querySelector('#layer .mask');
      const b = [...mask.querySelectorAll('button')].find((x) => x.textContent.trim() === '删除');
      b.click();
      return 'ok';
    })()`);
    await sleep(1900);
    const afterDel = await run(ctab, `(() => {
      const trs = [...document.querySelectorAll('#body table.tb tbody tr')];
      return JSON.stringify({
        rows: trs.length,
        gone: trs.filter((r) => r.innerText.indexOf(${JSON.stringify(UI_NOTE_TITLE)}) >= 0).length
      });
    })()`);
    let ad = {};
    try { ad = JSON.parse(afterDel); } catch (e) { /* ignore */ }
    ok('★ 确认后那一行消失、列表回到新建前的条数（UI 删除路径真的通）',
      ad.gone === 0 && ad.rows === (li.rows || 0), afterDel);
    /* 兜底：万一 UI 删除没成，这一步的残留交给 finally 按标题扫一遍清掉 */
    consoleNoteTitle = UI_NOTE_TITLE;

    /* ---------- 3. 编辑器（?edit=note-N 直达） ---------- */
    TLOG('\n【3】编辑器直达（?edit=' + createdKey + '）');
    const tab2 = await open(SITE + '/admin?edit=' + encodeURIComponent(createdKey), 2600);
    tabs.push(tab2);
    const st2 = await ensureLoggedIn(tab2);
    ok('编辑器已打开（顶栏出现页面名）',
      (await run(tab2, `document.getElementById('edName').textContent`)) === NOTE_TITLE, st2);

    const ed = await run(tab2, `(() => {
      const tag = document.getElementById('edPageTag');
      // 区块树每一项是 .tnode（不是 .tree-item）：文案在子元素 .txt 里
      const nodes = [...document.querySelectorAll('#tree .tnode')];
      const texts = nodes.map((n) => {
        const t = n.querySelector(':scope > .txt');
        return t ? t.textContent : '';
      });
      const kinds = nodes.map((n) => {
        const k = n.querySelector(':scope > .kind');
        return k ? k.textContent : '';
      });
      return JSON.stringify({
        tag: tag.textContent,
        tagColor: getComputedStyle(tag).color,
        path: document.getElementById('edPath').textContent,
        noBlocks: document.getElementById('viewEdit').classList.contains('no-blocks'),
        navMode: document.getElementById('viewEdit').classList.contains('nav-mode'),
        treeItems: nodes.length,
        treeTexts: texts,
        treeKinds: kinds,
        addButtons: [...document.querySelectorAll('#treeAddWrap button')].map((b) => b.textContent.trim()),
        libTotal: document.querySelectorAll('#libGrid .lib-item').length,
        libAvail: document.querySelectorAll('#libGrid .lib-item:not(.off)').length,
        inspFields: document.querySelectorAll('#inspector input, #inspector textarea').length
      });
    })()`);
    console.log('    编辑器实测：' + ed);
    let e = {};
    try { e = JSON.parse(ed); } catch (err) { /* ignore */ }
    ok('顶栏标记 = 店铺笔记（不是「自定义页」）', e.tag === '店铺笔记', ed);
    ok('顶栏标记配色 = 笔记青绿', e.tagColor === 'rgb(15, 122, 90)', e.tagColor);
    ok('顶栏路径 = packageNews/note/note?id=N', /^packageNews\/note\/note\?id=\d+$/.test(String(e.path)), e.path);
    ok('左栏组件库**不**收起（笔记可以拼组件）', e.noBlocks === false && e.navMode === false, ed);
    /* 笔记的树结构与有赞的布局面板同构：两段固定区（头部/正文）作为分组节点，
       自定义组件按条目平铺在下面 —— 顶层 list 字段不生成自己的节点是**既有设计**
       （自定义页整页就是一个平铺的组件流，见 admin.js nodesOf）。 */
    ok('区块树两段固定区 = 笔记头部 / 笔记正文',
      (e.treeTexts || []).join('|') === '笔记头部|笔记正文', JSON.stringify(e.treeTexts));
    ok('两段固定区都标为「分组」（不可拖拽排序）',
      (e.treeKinds || []).join('|') === '分组|分组', JSON.stringify(e.treeKinds));
    /* 笔记页里只有两个列表字段：笔记头部里的「封面图」与页面级的「笔记组件」。
       「添加内容」区是**平铺全页所有列表字段**（collectLists 不看当前选中项），
       所以两个入口都该出现，且不应混进首页那套组件入口。 */
    ok('「添加内容」= + 封面图 / + 笔记组件（笔记页只有这两个列表字段）',
      (e.addButtons || []).join('|') === '+ 封面图|+ 笔记组件', JSON.stringify(e.addButtons));
    ok('属性面板渲染出字段控件', e.inspFields >= 5, String(e.inspFields));
    ok('组件库渲染出卡片且有可用项', e.libTotal > 0 && e.libAvail > 0,
      'total=' + e.libTotal + ' avail=' + e.libAvail);

    /* ---------- 3.5 面板真的显示出「笔记头部」的值（这一条是本轮修 bug 的核心验收） ----------
     *
     * 装修台的属性面板是**按 schema 字段树拼路径**读写的：点「笔记头部」→ 路径前缀 header
     * → 读 data.header.title。曾经数据把标题平铺在 data.title，于是这几格**全是空的**、
     * 改完还被静默丢弃（不报错、只是"看着不太对"）。
     * 所以这里必须断言「面板上真的显示出了运营在弹层里填的那几个值」——
     * 只看 DOM 里有没有 input（上面那条 inspFields）是拦不住这个 bug 的。
     */
    TLOG('\n【3.5】面板显示「笔记头部」的值');
    const fields = await run(tab2, `(() => {
      const head = [...document.querySelectorAll('#tree .tnode')]
        .find((n) => ((n.querySelector(':scope > .txt') || {}).textContent || '') === '笔记头部');
      if (!head) return JSON.stringify({ err: 'no-header-node' });
      head.click();
      const text = {}, radio = {}, sw = {}, kinds = {};
      document.querySelectorAll('#inspector .fld').forEach((f) => {
        const lb = f.querySelector('label');
        if (!lb) return;
        const name = lb.textContent.replace('*', '').trim();
        const inp = f.querySelector('input:not([type=checkbox]), textarea, select');
        if (inp) { text[name] = inp.value; kinds[name] = 'text'; return; }
        const rbg = f.querySelector('.rbg');
        if (rbg) { const on = rbg.querySelector('button.on'); radio[name] = on ? on.textContent.trim() : ''; kinds[name] = 'radio'; return; }
        const s = f.querySelector('.sw');
        if (s) { const cb = s.querySelector('input'); sw[name] = cb ? cb.checked : null; kinds[name] = 'switch'; return; }
        // 剩下的就是列表型字段（封面图）——它渲染成增删行的管理器，没有单个 input
        kinds[name] = 'list';
      });
      /* 列表型字段（封面图）不在 .fld 里 —— 它渲染成折叠面板 .grp，标题在 .grp-head、
         项数与上限在 .gk 里。所以要单独抓，否则会误判成「没渲染」。 */
      const grp = [...document.querySelectorAll('#inspector .grp-head')].map((n) => ({
        text: n.textContent.replace(/\s+/g, ' ').trim(),
        gk: (n.querySelector('.gk') || {}).textContent || ''
      }));
      return JSON.stringify({ kinds: kinds, text: text, radio: radio, sw: sw, grp: grp });
    })()`);
    await sleep(500);
    console.log('    头部面板实测：' + fields);
    let f = {};
    try { f = JSON.parse(fields); } catch (err) { /* ignore */ }
    const fv = f.text || {}, fk = f.kinds || {};
    ok('头部面板含 标题 / 摘要 / 标签 三格文本输入',
      fk['标题'] === 'text' && fk['摘要'] === 'text' && fk['标签'] === 'text', JSON.stringify(fk));
    ok('★ 标题那格显示的是真实标题（不是空白）', fv['标题'] === NOTE_TITLE, JSON.stringify(fv['标题']));
    ok('★ 摘要那格显示的是真实摘要', fv['摘要'] === NOTE_SUMMARY, JSON.stringify(fv['摘要']));
    ok('★ 标签那格显示的是真实标签', fv['标签'] === NOTE_TAGS, JSON.stringify(fv['标签']));
    ok('封面图片（封面模式）是单选控件且选中「多图」',
      fk['封面图片'] === 'radio' && (f.radio || {})['封面图片'] === '多图',
      JSON.stringify(f.radio));
    const coverGrp = (f.grp || []).filter((g) => g.text.indexOf('封面图') === 0)[0];
    ok('封面图渲染成列表管理器，且上限口径 = 9（有赞「最多上传 9 张」）',
      !!coverGrp && coverGrp.gk === '0 / 9 项', JSON.stringify(f.grp));
    ok('两个商品开关渲染成开关且默认都开',
      fk['封面展示商品卡片'] === 'switch' && fk['商品详情页展示该笔记'] === 'switch' &&
      (f.sw || {})['封面展示商品卡片'] === false && (f.sw || {})['商品详情页展示该笔记'] === false,
      JSON.stringify(f.sw));
    ok('六个显示开关渲染成开关且默认都开',
      ['显示标题', '显示发布时间', '显示浏览量', '显示点赞数', '显示进店按钮', '显示推荐商品']
        .every((k) => (f.sw || {})[k] === true), JSON.stringify(f.sw));

    /* ---------- 3.6 在面板里改标题 → 存至草稿 → 读回来确实是新标题 ----------
     * 3.5 证的是「读得出来」，这里证的是「写得下去」——两段合起来才是完整的对账。
     */
    TLOG('\n【3.6】面板改标题 → 存至草稿 → 读回');
    const NEW_TITLE = '面板改过的标题（验收）';
    await run(tab2, `(() => {
      const fld = [...document.querySelectorAll('#inspector .fld')]
        .find((f) => ((f.querySelector('label') || {}).textContent || '').replace('*', '').trim() === '标题');
      if (!fld) return 'no-field';
      const inp = fld.querySelector('input');
      inp.value = ${JSON.stringify(NEW_TITLE)};
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`);
    await sleep(400);
    await run(tab2, `document.getElementById('btnSave').click();`);
    await sleep(1400);
    const afterSave = await api('GET', '/api/decorate/page?key=' + encodeURIComponent(createdKey));
    const savedTitle = afterSave.data && afterSave.data.data && afterSave.data.data.header && afterSave.data.data.header.title;
    ok('★ 面板里改的标题真的存进了草稿（header.title）', savedTitle === NEW_TITLE, JSON.stringify(savedTitle));
    ok('存草稿后顶层仍然没有平铺 title', !!(afterSave.data && afterSave.data.data) && afterSave.data.data.title === undefined,
      JSON.stringify(afterSave.data && afterSave.data.data && afterSave.data.data.title));
    // 面板自己也要显示「有未保存改动」→ 存完应回到「无未保存改动」
    ok('存至草稿后状态回到「无未保存改动」',
      /无未保存改动/.test(await run(tab2, `document.getElementById('edDirty').textContent`)),
      await run(tab2, `document.getElementById('edDirty').textContent`));
    // 丢弃草稿，别把这份"改过的标题"留给后续步骤 / 收尾（收尾删笔记也会连带清草稿）。
    // ⚠️ 「丢弃草稿」会弹浏览器原生 confirm —— 无头环境里它会**挂住标签页**，
    //    所以先把 confirm 换成恒真，再点按钮（按钮本身还是会走它自己的逻辑）。
    await run(tab2, `window.confirm = function () { return true; }; 'ok'`);
    await run(tab2, `document.getElementById('btnDiscard').click();`);
    await sleep(900);
    const afterDiscard = await api('GET', '/api/decorate/page?key=' + encodeURIComponent(createdKey));
    ok('丢弃草稿后回到原标题',
      !!(afterDiscard.data && afterDiscard.data.data && afterDiscard.data.data.header) &&
      afterDiscard.data.data.header.title === NOTE_TITLE,
      JSON.stringify(afterDiscard.data && afterDiscard.data.data && afterDiscard.data.data.header && afterDiscard.data.data.header.title));

    /* ---------- 4. 真加一个组件：证明笔记真的可拼组件（不只是结构上接了） ---------- */
    TLOG('\n【4】加一个组件（辅助线）');
    const added = await run(tab2, `(() => {
      const card = [...document.querySelectorAll('#libGrid .lib-item:not(.off)')]
        // 笔记组件面板用**有赞的名字**（辅助线 / 辅助空白），不是内部名「辅助分割」
        .find((b) => /辅助线/.test(b.textContent));
      if (!card) return JSON.stringify({ err: 'no-card' });
      const read = () => [...document.querySelectorAll('#tree .tnode')].map((n) => {
        const k = n.querySelector(':scope > .kind');
        return k ? k.textContent : '';
      });
      const before = document.querySelectorAll('#tree .tnode').length;
      card.click();
      const after = document.querySelectorAll('#tree .tnode').length;
      const kinds = read();
      return JSON.stringify({
        before: before,
        after: after,
        kinds: kinds,
        lastKind: kinds[kinds.length - 1] || '',
        dirty: document.getElementById('edDirty').textContent
      });
    })()`);
    await sleep(700);
    console.log('    加组件实测：' + added);
    let a = {};
    try { a = JSON.parse(added); } catch (err) { /* ignore */ }
    ok('点组件卡片后区块树多出一项', a.after === (a.before || 0) + 1, added);
    /* 新增项在树里的**文案**是「第 N 项」（列表项标题由服务端算好下发，新建的这一条还没有），
       所以判据取类型角标（客户端按 union 的 kinds 现算）而不是 .txt。 */
    ok('新增项的组件类型 = 辅助线（面板用有赞名，不是内部名「辅助分割」）', a.lastKind === '辅助线', added);
    ok('加到页面后标记为「有未保存的改动」（只改内存草稿）', /未保存/.test(String(a.dirty)), String(a.dirty));

    /* ---------- 4.5 ★「加得进去」还得「存得下去」 ----------
     *
     * 上面那三条只证明了装修台把组件塞进了**内存草稿**。2026-10-15 的真 bug 恰好长在这一段：
     * 笔记组件面板放行的 7 个 kind 里，「文本」「辅助空白」住在 UC_KINDS，
     * 而当时的草稿校验写死了 HOME_BLOCK_KINDS → 面板加得进去、一点「存至草稿」就 1001。
     * 「加了组件就标记未保存」这条断言当时是绿的，因为**它压根没碰保存**。
     * 所以这里必须真点一次「存至草稿」，再回读接口确认那一项落盘了。
     */
    TLOG('\n【4.5】★「加得进去」还得「存得下去」');
    await run(tab2, `document.getElementById('btnSave').click();`);
    await sleep(1500);
    const afterAdd = await api('GET', '/api/decorate/page?key=' + encodeURIComponent(createdKey));
    const savedBlocks = (afterAdd.data && afterAdd.data.data && afterAdd.data.data.blocks) || [];
    ok('★ 面板加的那一项真的存进了草稿（blocks 里多出一条 line）',
      savedBlocks.length >= 1 && savedBlocks.some((b) => b.type === 'line'),
      'blocks=' + JSON.stringify(savedBlocks.map((b) => b.type)));
    ok('存完状态回到「无未保存改动」',
      /无未保存改动/.test(await run(tab2, `document.getElementById('edDirty').textContent`)),
      await run(tab2, `document.getElementById('edDirty').textContent`));

    /*
     * ★ 「内容量」列在有草稿时改报**草稿**的区块数（2026-10-15 补）。
     *
     * 起因：控制台截图里一篇编了 5 个组件、还没点「生成代码」的笔记显示「0 个组件」。
     * 数字按原口径没错（blockCount = 已生成代码里几个区块），但它回答不了运营的问题。
     *
     * ⚠️ 期望值**不写死数字**，而是拿接口现查的 draftBlockCount 对齐 ——
     *    断言锁的是「界面与接口同源」；写死「草稿 1 个组件」的话，改坏成「草稿 2 个」照样绿，
     *    而且以后调整初始区块数就要来改断言（假红）。
     */
    const pagesNow = await api('GET', '/api/decorate/pages');
    const rowNow = ((pagesNow.data && pagesNow.data.list) || []).filter((p) => p.key === createdKey)[0] || {};
    /* 回控制台：先把 hash 切走再切回来 —— 同 hash 直接重设不会触发重渲染（go() 同页直接返回） */
    await run(ctab, `location.hash = '#dashboard'; 'ok'`);
    await sleep(500);
    await run(ctab, `(() => {
      const b = [...document.querySelectorAll('#nav .nav-item')].find((x) => x.textContent.trim() === '店铺笔记');
      b.click(); return 'ok';
    })()`);
    await sleep(1300);
    const cellNow = await run(ctab, `(() => {
      const hit = [...document.querySelectorAll('#body table.tb tbody tr')]
        .find((r) => r.innerText.indexOf(${JSON.stringify(NOTE_TITLE)}) >= 0);
      return hit ? [...hit.querySelectorAll('td')].map((t) => t.innerText.replace(/\\s+/g, ' ').trim()).join(' | ') : 'ROW-NOT-FOUND';
    })()`);
    ok('★「内容量」列：有草稿时报草稿的区块数（与接口 draftBlockCount 同源），没被已生成代码那份盖住',
      typeof rowNow.draftBlockCount === 'number' &&
      cellNow.indexOf('草稿 ' + rowNow.draftBlockCount + ' 个组件') >= 0,
      '接口 generated=' + JSON.stringify(rowNow.generated) + ' status=' + JSON.stringify(rowNow.status) +
      ' blockCount=' + JSON.stringify(rowNow.blockCount) + ' draftBlockCount=' + JSON.stringify(rowNow.draftBlockCount) +
      '　界面=' + cellNow);

    /* 把这份带组件的草稿丢弃，免得影响后续步骤与收尾的「replica.js 未变」 */
    await run(tab2, `window.confirm = function () { return true; }; 'ok'`);
    await run(tab2, `document.getElementById('btnDiscard').click();`);
    await sleep(900);
    const afterDiscard2 = await api('GET', '/api/decorate/page?key=' + encodeURIComponent(createdKey));
    ok('丢弃草稿后 blocks 回到空（这一轮没留下组件）',
      ((afterDiscard2.data && afterDiscard2.data.data && afterDiscard2.data.data.blocks) || []).length === 0,
      JSON.stringify(((afterDiscard2.data && afterDiscard2.data.data && afterDiscard2.data.data.blocks) || []).map((b) => b.type)));
  } catch (err) {
    fail++;
    fails.push('脚本异常：' + (err && err.stack ? err.stack : err));
    console.log('\n✗ 脚本异常：' + (err && err.stack ? err.stack : err));
  } finally {
    /* 收尾 1：关掉所有标签页（不点「返回」，避免原生「离开？」框卡死标签页） */
    for (const t of tabs) { try { await close(t); } catch (_) { /* ignore */ } }
    /* 收尾 2：清掉测试笔记。
     *
     * 两处都要清：① 第 1 节用接口造的那篇（createdKey）；② 第 2.5 节从控制台 UI 新建的那篇
     * （正常已在 UI 里删掉，这里按标题兜一遍 —— 万一中途异常退出，别把垃圾留在注册表里）。 */
    if (TOKEN) {
      if (consoleNoteTitle) {
        const all = await api('GET', '/api/decorate/notes');
        for (const n of ((all.data && all.data.list) || [])) {
          if (n.title === consoleNoteTitle) {
            const r2 = await api('POST', '/api/decorate/note/delete', { key: n.key });
            console.log('\n收尾：清掉控制台 UI 残留笔记 ' + n.key + ' → ' + (r2.code === 0 ? '已删除' : 'code=' + r2.code));
          }
        }
      }
      if (createdKey) {
        const rm = await api('POST', '/api/decorate/note/delete', { key: createdKey });
        console.log('收尾：清理测试笔记 ' + createdKey + ' → ' + (rm.code === 0 ? '已删除' : 'code=' + rm.code));
      }
      const left = await api('GET', '/api/decorate/notes');
      const n = left.data && left.data.stats ? left.data.stats.count : -1;
      console.log('收尾：注册表剩余笔记数 = ' + n + (n === 0 ? ' ✓' : ' ✗（有残留）'));
      if (n !== 0) { fail++; fails.push('收尾后仍有 ' + n + ' 篇笔记残留'); }
    }
    /* 收尾 3：replica.js 必须没变。
     *
     * 这里判的是**剥掉时间戳之后**的内容，不是逐字节 —— 本脚本最后会删掉自己造的笔记，
     * 而删除会重新生成一次 replica.js（重新生成必然刷新首部那行发布时间的注释）。
     * 逐字节比会在「只差一个时间戳」时报红，把真正的内容改动淹掉；
     * 反过来，剥了时间戳之后任何实际差异（多了/少了字段）都还是会红。
     * 判完再把原文**逐字节写回**，让工作区保持干净。 */
    const stripTs = (s) => String(s).replace(/最后发布 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '最后发布 <TS>');
    const after = readFileSync(REPLICA);
    const same = stripTs(before.toString('utf8')) === stripTs(after.toString('utf8'));
    if (!same) {
      console.log('收尾：replica.js 内容变了 ✗ —— 请手工 diff，脚本不自动回退内容差异');
    } else {
      writeFileSync(REPLICA, before); // 只回退时间戳噪音
      const restored = Buffer.compare(before, readFileSync(REPLICA)) === 0;
      console.log('收尾：replica.js 内容未变 ✓（发布注释时间戳已回退：' + (restored ? '逐字节一致' : '回退失败') + '）');
      if (!restored) { fail++; fails.push('replica.js 时间戳回退失败'); }
    }
    if (!same) { fail++; fails.push('replica.js 内容被改动'); }

    console.log('\n──────── 结果：' + pass + ' 通过 / ' + fail + ' 失败 ────────');
    if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  · ' + f)); }
    process.exit(fail ? 1 : 0);
  }
})();
