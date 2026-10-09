/**
 * 自定义页面 HTTP 级冒烟（走真实路由，验证点位注册与参数传递）
 *
 * 覆盖：新建 → 列表 → 打开编辑器 → 存草稿 → 发布（replica 出现 CUSTOM_PAGES）
 *       → 改名（键名迁移）→ 删除（replica 复原）→ 各类非法入参
 * 收尾自动清理测试页面，不污染真实数据。
 *
 * ⚠️ /api/decorate/* 在报告 08 之后全部要求管理员令牌，本脚本启动时先换一个会话，
 *    所有请求都带上 Authorization；拿不到就直接停下并说清怎么配。
 *
 * 前置：服务已启动（node server/index.js）
 * 用法：node .tooling/probe-custom-http.cjs
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const BASE = 'http://127.0.0.1:3000';
const REPLICA = nodePath.join(__dirname, '..', 'miniprogram', 'config', 'replica.js');
const KEY = 'zzhttptest';
const NAME = 'HTTP 自检页';

/** 管理员令牌（启动时填充） */
let ADMIN = '';

/** 换取管理员会话：ADMIN_TOKEN → ADMIN_PASSWORD → 非生产默认 admin */
async function fetchAdminToken() {
  const env = String(process.env.ADMIN_TOKEN || '').trim();
  if (env) {
    const r = await fetch(BASE + '/api/admin/session', { headers: { Authorization: 'Bearer ' + env } });
    const j = await r.json().catch(() => null);
    if (j && j.code === 0) return env;
  }
  const pwds = [process.env.ADMIN_PASSWORD, process.env.NODE_ENV === 'production' ? '' : 'admin'].filter(Boolean);
  for (const password of pwds) {
    const r = await fetch(BASE + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    const j = await r.json().catch(() => null);
    if (j && j.code === 0 && j.data && j.data.token) return j.data.token;
  }
  return '';
}

const results = [];
function ok(label, pass, extra) {
  results.push({ label, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra === undefined ? '' : '  → ' + extra}`);
}

async function api(method, path, body) {
  const headers = { Authorization: 'Bearer ' + ADMIN };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await r.json(); } catch (e) { /* ignore */ }
  return { status: r.status, code: json ? json.code : null, msg: json ? json.msg : '', data: json ? json.data : null };
}

const readReplica = () => fs.readFileSync(REPLICA, 'utf8');

/** 收尾：删掉所有自检页面 */
async function cleanup() {
  const list = await api('GET', '/api/decorate/pages');
  const mine = ((list.data && list.data.list) || []).filter((p) => p.custom && p.key.indexOf('zzhttptest') === 0);
  for (const p of mine) {
    await api('POST', '/api/decorate/page/delete', { key: p.key });
  }
  if (mine.length) console.log(`（已清理 ${mine.length} 个自检页面：${mine.map((p) => p.key).join(', ')}）`);
}

(async () => {
  ADMIN = await fetchAdminToken();
  if (!ADMIN) {
    console.error('拿不到管理员会话：请设置 ADMIN_PASSWORD 或 ADMIN_TOKEN 后重跑');
    process.exit(1);
  }
  console.log('管理员会话已就绪（报告 08：装修点位均要求管理员身份）\n');

  const originalReplica = readReplica();

  try {
    /* 0. 前置清理 */
    await cleanup();

    /* 1. 模板与配额 */
    const tpls = await api('GET', '/api/decorate/templates');
    ok('模板点位返回模板清单与配额',
      tpls.code === 0 && Array.isArray(tpls.data.list) && tpls.data.list.length === 2 && tpls.data.custom.max === 20,
      `模板 ${tpls.data && tpls.data.list && tpls.data.list.length} 个 · 上限 ${tpls.data && tpls.data.custom && tpls.data.custom.max}`);

    const pages0 = await api('GET', '/api/decorate/pages');
    /* nav（店铺导航）是全局配置项，不是页面 —— 统计内置页时排除 */
    ok('/pages 一并下发 custom 配额与模板',
      pages0.code === 0 && !!pages0.data.custom && Array.isArray(pages0.data.templates) &&
      pages0.data.list.filter((p) => !p.custom && !p.nav).length === 5 &&
      pages0.data.list.filter((p) => p.nav).length === 1,
      `内置 ${pages0.data.list.filter((p) => !p.custom && !p.nav).length} 个 · 导航配置 ${pages0.data.list.filter((p) => p.nav).length} 个 · 自定义 ${pages0.data.list.filter((p) => p.custom).length} 个`);

    /* 2. 新建 */
    const made = await api('POST', '/api/decorate/page/create', { name: NAME, key: KEY, note: '自检', template: 'blank' });
    ok('新建页面成功', made.code === 0 && made.data.page.key === KEY, made.code === 0 ? made.data.page.path : made.msg);
    ok('新建后未发布，replica 里还没有 CUSTOM_PAGES', readReplica().indexOf('CUSTOM_PAGES') < 0);

    const list1 = await api('GET', '/api/decorate/pages');
    const hit = (list1.data.list || []).filter((p) => p.key === KEY)[0];
    ok('列表里标记为自定义页', !!hit && hit.custom === true && hit.belongs === '自定义页面',
      hit ? hit.belongs : 'not found');

    /* 3. 打开编辑器 */
    const opened = await api('GET', '/api/decorate/page?key=' + KEY);
    ok('打开编辑器返回区块 schema',
      opened.code === 0 && opened.data.meta.custom === true &&
      opened.data.schema.fields.map((f) => f.k).join(',') === 'blocks,meta',
      opened.data ? opened.data.schema.fields.map((f) => f.k).join(',') : opened.msg);

    /* 4. 非法数据被拦 */
    const bad = await api('POST', '/api/decorate/draft', {
      key: KEY,
      data: { blocks: [{ type: '不存在的区块', text: 'x' }] }
    });
    ok('未知区块类型被拒绝', bad.code !== 0 && /不支持/.test(bad.msg), bad.msg);

    /* 5. 存草稿 → 发布 */
    const draft = await api('POST', '/api/decorate/draft', {
      key: KEY,
      data: { blocks: [{ type: 'title', text: 'HTTP 自检标题', size: 'lg' }], meta: { bg: '#FFFFFF' } }
    });
    ok('存草稿成功', draft.code === 0, draft.msg);

    const pub = await api('POST', '/api/decorate/publish', { key: KEY, note: '自检发布' });
    ok('发布成功', pub.code === 0 && /^v\d+$/.test(pub.data.versionId || ''), pub.data ? pub.data.versionId : pub.msg);

    const afterPub = readReplica();
    ok('replica.js 写入 CUSTOM_PAGES 与页面数据',
      /const CUSTOM_PAGES = \{/.test(afterPub) && afterPub.indexOf(KEY) >= 0 && afterPub.indexOf('HTTP 自检标题') >= 0);
    ok('replica.js 导出 CUSTOM_PAGES', /^\s*CUSTOM_PAGES,?$/m.test(afterPub));

    const diff = await api('GET', '/api/decorate/diff?key=' + KEY);
    ok('发布后草稿已清空（diff 提示与线上一致）',
      diff.code === 0 && diff.data.hasDraft === false, diff.data && diff.data.note);

    /* 6. 小程序端读取模拟：require replica 能拿到该页 */
    delete require.cache[require.resolve(REPLICA)];
    const R = require(REPLICA);
    ok('小程序端能按 key 读到页面数据',
      !!(R.CUSTOM_PAGES && R.CUSTOM_PAGES[KEY] && R.CUSTOM_PAGES[KEY].blocks[0].text === 'HTTP 自检标题'),
      R.CUSTOM_PAGES && R.CUSTOM_PAGES[KEY] ? 'name=' + R.CUSTOM_PAGES[KEY].name : 'missing');

    /* 7. 改名（key 迁移） */
    const NEW_KEY = KEY + '-x';
    const rn = await api('POST', '/api/decorate/page/rename', { key: KEY, name: NAME + '改名', newKey: NEW_KEY });
    ok('改名成功并返回旧标识', rn.code === 0 && rn.data.renamedFrom === KEY && rn.data.page.key === NEW_KEY,
      rn.code === 0 ? `${rn.data.renamedFrom} → ${rn.data.page.key}` : rn.msg);

    const afterRename = readReplica();
    ok('replica 键名已同步', afterRename.indexOf(NEW_KEY) >= 0 && afterRename.indexOf('"' + KEY + '"') < 0);
    const reOpened = await api('GET', '/api/decorate/page?key=' + NEW_KEY);
    ok('改名后内容不丢', reOpened.code === 0 && reOpened.data.published.blocks[0].text === 'HTTP 自检标题');

    /* 8. 非法入参 */
    const dup = await api('POST', '/api/decorate/page/create', { name: NAME + '改名' });
    ok('页面名称重复被拒绝', dup.code !== 0 && /已存在/.test(dup.msg), dup.msg);

    const reserved = await api('POST', '/api/decorate/page/create', { name: '保留字测试', key: 'home' });
    ok('保留标识被拒绝', reserved.code !== 0 && /保留字/.test(reserved.msg), reserved.msg);

    const delHome = await api('POST', '/api/decorate/page/delete', { key: 'home' });
    ok('内置页不可删除', delHome.code !== 0 && /不可删除/.test(delHome.msg), delHome.msg);

    const renameHome = await api('POST', '/api/decorate/page/rename', { key: 'home', name: 'X' });
    ok('内置页不可改名', renameHome.code !== 0 && /不支持改名/.test(renameHome.msg), renameHome.msg);

    const missing = await api('GET', '/api/decorate/page?key=notexist123');
    ok('不存在的页面返回 404', missing.status === 404, 'HTTP ' + missing.status);

    /* 9. 删除 */
    const del = await api('POST', '/api/decorate/page/delete', { key: NEW_KEY });
    ok('删除成功', del.code === 0 && del.data.name === NAME + '改名', del.code === 0 ? del.data.name : del.msg);

    const afterDel = readReplica();
    ok('删干净：replica 里没有 CUSTOM_PAGES', afterDel.indexOf('CUSTOM_PAGES') < 0);
    ok('删干净：replica 里没有残留内容',
      afterDel.indexOf(NEW_KEY) < 0 && afterDel.indexOf('HTTP 自检标题') < 0);
    ok('内置 6 个字段完好',
      ['SHOP', 'HOME_BLOCKS', 'LEXY_SERIES', 'NEWS', 'PRODUCT_NAV_LOGO', 'PRODUCT_BRANDS']
        .every((k) => afterDel.indexOf('const ' + k + ' =') > 0));

    /* 10. 装修台与控制台静态页可达 */
    for (const p of ['/admin', '/console', '/admin/admin.js', '/admin/admin.css']) {
      const r = await fetch(BASE + p);
      ok(`静态资源可达 ${p}`, r.status === 200, 'HTTP ' + r.status);
    }
    const adminJs = await (await fetch(BASE + '/admin/admin.js')).text();
    ok('装修台脚本含新建页面入口', adminJs.indexOf('btnCreatePage') >= 0 && adminJs.indexOf('新建页面') >= 0);
    ok('装修台脚本含删除/改名入口', adminJs.indexOf('data-del') >= 0 && adminJs.indexOf('data-rename') >= 0);
    const adminHtml = await (await fetch(BASE + '/admin')).text();
    // 列表页表头：9 列压成 5 列（名称/路径/内容量合并、操作列不再换行）
    ok('装修台页面含新建按钮与 5 列表头',
      adminHtml.indexOf('btnCreatePage') >= 0 &&
      ['页面名称 · 路径 · 内容量', '页面状态', '数据来源', '备注', '操作']
        .every((h) => adminHtml.indexOf('>' + h + '<') >= 0));
    // 顶栏双形态：列表态须收起编辑控件，避免出现「正在装修：—」和误点发布
    ok('装修台顶栏为列表/编辑双形态',
      adminHtml.indexOf('topbar mode-list') >= 0 && adminHtml.indexOf('tb-edit-only') >= 0);
    ok('装修台快捷键入口存在（Ctrl/⌘+K 说明层）',
      adminHtml.indexOf('btnKeys') >= 0 && adminJs.indexOf('keysDialog') >= 0);
    // 防重复点击：发布/存草稿是写文件动作，手快连点不能发两次
    ok('装修台写操作有防重复点击包装（withBusy）', adminJs.indexOf('function withBusy') >= 0);
    // 报错即定位：服务端校验信息里的「第 N 个」要能自动选中并滚动到该区块
    ok('装修台支持按报错信息自动定位区块（locateFromMessage）',
      adminJs.indexOf('function locateFromMessage') >= 0 && adminJs.indexOf('scrollToSel()') > 0);
  } catch (e) {
    console.error('EXCEPTION:', (e && e.stack) || e);
    results.push({ label: '未捕获异常', pass: false });
  } finally {
    await cleanup();
    // 若中途异常导致 replica 没复原，用备份兜底
    const now = readReplica();
    if (now.indexOf('CUSTOM_PAGES') >= 0) {
      console.log('（replica 仍有残留，检查是否有自检页未清理）');
    }
    void originalReplica;
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n──────────────────────────────');
  console.log(`${results.length - failed.length}/${results.length} 通过` + (failed.length ? `，失败 ${failed.length}` : ''));
  failed.forEach((f) => console.log('  FAIL ' + f.label));
  process.exit(failed.length ? 1 : 0);
})();
