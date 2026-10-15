/**
 * 店铺笔记 · HTTP 层端到端自检
 *
 * 覆盖「后台按钮点下去会发生什么」这一层：路由注册 → 鉴权 → 参数校验 →
 * store 编排 → replica.js 真的被写出来。前面两个自检（_test-shopnotes / _test-notes-e2e）
 * 只测到 store，测不到路由有没有挂上、参数名有没有写错、鉴权有没有漏。
 *
 * 运行前必须已启动本机服务（DEBUG_PAGE=on ADMIN_PAGE=on node server/index.js）。
 *
 * ⚠️ 本脚本会**真的生成一次 replica.js**（走 publish），因此：
 *    开始时把 replica.js 原文读进内存，结束时**逐字节写回**，不留任何痕迹。
 *    replica.js 是交付产物，测试不能改变它。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPLICA = path.join(ROOT, 'miniprogram/config/replica.js');
const BASE = 'http://127.0.0.1:3000';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }

async function http(method, p, body, token) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + p, opt);
  let j = null;
  try { j = await r.json(); } catch (_) { /* 非 JSON */ }
  /*
   * 后端统一信封 { code, msg, data }（见 server/lib/http.js）。
   * 这里把 data 拆出来做 body，code/msg 平铺到顶层 ——
   * 断言写 body.xxx 就是业务数据，写 code 就是业务码，不用每处都 .data 一层。
   */
  const isEnv = j && typeof j === 'object' && 'code' in j && 'data' in j;
  return {
    status: r.status,
    code: isEnv ? j.code : (j && j.code),
    msg: isEnv ? j.msg : '',
    body: isEnv ? j.data : j,
    raw: j
  };
}

(async function main() {
  const original = fs.readFileSync(REPLICA); // 逐字节备份
  console.log('replica.js 已备份 ' + original.length + ' 字节\n');

  // 中途失败兜底用：测试建出来的笔记 id（收尾无论成败都要清掉，不然会在
  // server/data/decorate/shopnotes.json 里留档，下一轮 `配额 +1` 的断言就对不上）
  let createdId = 0;
  let token = '';

  try {
    /* ---------------- 0. 登录 ---------------- */
    console.log('【0】管理员登录');
    const login = await http('POST', '/api/admin/login', { password: 'admin' });
    ok('登录成功', login.status === 200, 'status=' + login.status);
    token = login.body && login.body.token;
    ok('拿到管理员令牌', !!token);

    /* ---------------- 1. 未登录必须被挡 ---------------- */
    console.log('\n【1】鉴权：未带令牌必须拒绝');
    const anon = await http('GET', '/api/decorate/notes');
    ok('GET /notes 未登录被拒（401/403）', anon.status === 401 || anon.status === 403, 'status=' + anon.status);

    /* ---------------- 2. 列表里先有笔记配额 ---------------- */
    console.log('\n【2】首屏 /pages 下发笔记配额');
    const p0 = await http('GET', '/api/decorate/pages', undefined, token);
    eq('GET /pages 200', p0.status, 200);
    ok('响应带 notes 配额', !!(p0.body && p0.body.notes), JSON.stringify(p0.body && p0.body.notes));
    ok('配额含 count/max/belongs',
      p0.body.notes && typeof p0.body.notes.count === 'number' &&
      typeof p0.body.notes.max === 'number' && !!p0.body.notes.belongs,
      JSON.stringify(p0.body.notes));
    const beforeCount = p0.body.notes.count;

    /* ---------------- 3. 参数校验 ---------------- */
    console.log('\n【3】参数校验（都必须是 1001 参数类）');
    const noTitle = await http('POST', '/api/decorate/note/create', { title: '' }, token);
    eq('空标题被拒 1001', noTitle.code, 1001);

    const tooLong = await http('POST', '/api/decorate/note/create', { title: 'x'.repeat(41) }, token);
    eq('41 字标题被拒 1001', tooLong.code, 1001);

    const delNoId = await http('POST', '/api/decorate/note/delete', {}, token);
    eq('删除不带 key 被拒 1001', delNoId.code, 1001);

    const delGhost = await http('POST', '/api/decorate/note/delete', { key: 'note-999999' }, token);
    eq('删除不存在笔记 → 404', delGhost.status, 404);

    /* ---------------- 4. 新建笔记 ---------------- */
    console.log('\n【4】新建笔记');
    const created = await http('POST', '/api/decorate/note/create',
      { title: '秋冬除尘季，这几件小家电真香', summary: '一句话卖点', tags: '洗地机,吸尘器' }, token);
    eq('新建 200', created.status, 200);
    const key = created.body && created.body.page && created.body.page.key;
    // 数字 id 不再由 meta 下发（页面元信息里没有它），从 key（note-<id>）里取 —— 两者本就同源
    const num = String(key).replace(/^note-/, '');
    createdId = Number(num) || 0;
    ok('key 形如 note-<id>', /^note-\d+$/.test(String(key)), 'key=' + key);
    ok('page 带 shopnote 标记', created.body.page.shopnote === true, JSON.stringify(created.body.page.shopnote));

    /* ---------------- 5. 列表里认得出这是笔记 ---------------- */
    console.log('\n【5】列表页标记与归属');
    const p1 = await http('GET', '/api/decorate/pages', undefined, token);
    const row = (p1.body.list || []).filter((x) => x.key === key)[0];
    ok('笔记出现在列表里', !!row);
    eq('列表项带 shopnote', row && row.shopnote, true);
    eq('归属 = 店铺笔记', row && row.belongs, '店铺笔记');
    eq('路径 = packageNews/note/note', row && row.path, 'packageNews/note/note?id=' + num);
    eq('状态 = 未生成代码', row && row.status, '未生成代码');
    eq('generated = false', row && row.generated, false);
    eq('配额 +1', p1.body.notes.count, beforeCount + 1);

    /* ---------------- 6. 编辑器拿得到三段结构 ---------------- */
    console.log('\n【6】编辑器 schema / 初始数据');
    const pg2 = await http('GET', '/api/decorate/page?key=' + encodeURIComponent(key), undefined, token);
    eq('取单页 200', pg2.status, 200);
    // ⚠️ 响应里的 schema **就是根节点本身**（store 侧 serialize(page.root)），
    //    没有多一层 .root —— 写 .schema.root.fields 会静默拿到 undefined。
    const fields = ((pg2.body || {}).schema || {}).fields || [];
    const fieldKeys = fields.map((f) => f.k).join(',');
    ok('root.fields = header,body,blocks', fieldKeys === 'header,body,blocks', fieldKeys);
    ok('data 里有标题', !!(pg2.body.data && pg2.body.data.header && pg2.body.data.header.title),
      JSON.stringify(pg2.body.data && pg2.body.data.header && pg2.body.data.header.title));
    /*
     * ⚠️ 形状断言：装修台面板按字段树路径读写（data.header.title）。
     *    这一条刻意**同时**检查「header 里有」和「顶层没有」——
     *    只看前者的话，把标题同时放两处也能过，而顶层那一份是死数据。
     */
    ok('标题住在 data.header.title（面板路径）而非顶层',
      pg2.body.data.header.title === '秋冬除尘季，这几件小家电真香' && pg2.body.data.title === undefined,
      'header.title=' + JSON.stringify(pg2.body.data.header.title) + ' 顶层 title=' + JSON.stringify(pg2.body.data.title));
    ok('data 里有正文默认值', !!(pg2.body.data && pg2.body.data.body && pg2.body.data.body.bg === '#ffffff'),
      JSON.stringify(pg2.body.data && pg2.body.data.body));
    ok('header 六个显示开关齐全（默认全开）',
      pg2.body.data.header &&
      pg2.body.data.header.showTitle === true && pg2.body.data.header.showPublishTime === true &&
      pg2.body.data.header.showBrowseCount === true && pg2.body.data.header.showThumbsUpCount === true &&
      pg2.body.data.header.showEnterShop === true && pg2.body.data.header.showRecommendItems === true,
      JSON.stringify(pg2.body.data.header));

    /* ---------------- 7. 存草稿 → 生成代码 ---------------- */
    console.log('\n【7】存草稿 → 生成代码（写 replica.SHOPNOTES）');
    const edited = JSON.parse(JSON.stringify(pg2.body.data));
    // 改标题走**面板真实路径**（header.title）—— 这才是运营在装修台上改标题时传来的形状
    edited.header.title = '秋冬除尘季，这几件小家电真香（改）';
    edited.header.showThumbsUpCount = false;
    edited.body.html = '<p>正文段落一</p>';
    const dr = await http('POST', '/api/decorate/draft', { key: key, data: edited }, token);
    eq('存草稿 200', dr.status, 200);

    // 再存一次草稿：用**平铺**写法（脚本 / 旧调用方）改标题，必须同样生效 ——
    // 否则「面板改得动、脚本改不动」这种半通不通的状态会在下次有人写脚本时爆出来
    const flatEdit = JSON.parse(JSON.stringify(edited));
    delete flatEdit.header.title;
    flatEdit.title = '秋冬除尘季，这几件小家电真香（平铺改）';
    const dr2 = await http('POST', '/api/decorate/draft', { key: key, data: flatEdit }, token);
    eq('平铺写法存草稿 200', dr2.status, 200);
    // 读回来应该已经归一成 header.title（草稿 API 也过 store 的归一）
    const pg3 = await http('GET', '/api/decorate/page?key=' + encodeURIComponent(key), undefined, token);
    ok('平铺写法也被归一进 header.title',
      pg3.body.data.header.title === '秋冬除尘季，这几件小家电真香（平铺改）' && pg3.body.data.title === undefined,
      JSON.stringify(pg3.body.data.header.title));

    const pb = await http('POST', '/api/decorate/publish', { key: key }, token);
    eq('生成代码 200', pb.status, 200);
    ok('返回备份文件名', !!pb.body.backup, JSON.stringify(pb.body.backup));

    const src = fs.readFileSync(REPLICA, 'utf8');
    ok('replica.js 出现 const SHOPNOTES', /const SHOPNOTES = \{/.test(src));
    ok('replica.js 导出清单含 SHOPNOTES', /SHOPNOTES/.test(src) && /module\.exports|export/.test(src));
    // 后一次是「平铺改」那次草稿（见上面第 7 段），发布的是它 —— 标题口径以后写入的为准
    ok('replica.js 里带上了改后的标题（平铺改那次草稿）', src.indexOf('秋冬除尘季，这几件小家电真香（平铺改）') >= 0);
    ok('replica.js 里带上了正文', src.indexOf('正文段落一') >= 0);

    // 真机侧能不能 require 出来（语法 + 结构）
    delete require.cache[require.resolve(REPLICA)];
    const R = require(REPLICA);
    ok('require 成功且 SHOPNOTES 是对象', !!(R.SHOPNOTES && typeof R.SHOPNOTES === 'object'));
    ok('SHOPNOTES[num] 存在', !!R.SHOPNOTES[num], Object.keys(R.SHOPNOTES || {}).join(','));
    // 标题真源是 header.title（与装修台字段树一致），顶层不再有 title
    eq('落盘标题正确（header.title）', R.SHOPNOTES[num] && R.SHOPNOTES[num].header && R.SHOPNOTES[num].header.title, '秋冬除尘季，这几件小家电真香（平铺改）');
    eq('落盘形态里顶层无平铺 title', R.SHOPNOTES[num] && R.SHOPNOTES[num].title, undefined);
    eq('开关落盘正确', R.SHOPNOTES[num] && R.SHOPNOTES[num].header && R.SHOPNOTES[num].header.showThumbsUpCount, false);

    /* ---------------- 8. 发布后状态与标题同步 ---------------- */
    console.log('\n【8】生成代码后列表状态');
    const p2 = await http('GET', '/api/decorate/pages', undefined, token);
    const row2 = (p2.body.list || []).filter((x) => x.key === key)[0];
    eq('generated 变 true', row2 && row2.generated, true);
    eq('状态 = 代码已生成', row2 && row2.status, '代码已生成');
    eq('列表名跟随标题', row2 && row2.name, '秋冬除尘季，这几件小家电真香（平铺改）');
    eq('无未发布草稿', row2 && row2.hasDraft, false);

    /* ---------------- 9. 笔记列表端点 ---------------- */
    console.log('\n【9】GET /notes 清单');
    const nl = await http('GET', '/api/decorate/notes', undefined, token);
    eq('200', nl.status, 200);
    const hit = (nl.body.list || []).filter((x) => x.key === key)[0];
    ok('清单里能查到', !!hit, JSON.stringify(nl.body.list));
    ok('清单项带 title', !!(hit && hit.title), JSON.stringify(hit));
    ok('清单项带 published', !!(hit && hit.published));

    /* ---------------- 10. 生成代码不影响别的页面 ---------------- */
    console.log('\n【10】不误伤其它页面');
    ok('首页区块还在', Array.isArray(R.HOME_BLOCKS) && R.HOME_BLOCKS.length > 0);
    ok('自定义页表还在', R.CUSTOM_PAGES !== undefined);
    ok('SHOPNOTES 只多了这一条', Object.keys(R.SHOPNOTES).length === 1, Object.keys(R.SHOPNOTES).join(','));

    /* ---------------- 11. 删除 ---------------- */
    console.log('\n【11】删除笔记');
    const del = await http('POST', '/api/decorate/note/delete', { key: key }, token);
    eq('删除 200', del.status, 200);
    ok('返回被删标题', !!(del.body && del.body.title), JSON.stringify(del.body));
    const src2 = fs.readFileSync(REPLICA, 'utf8');
    ok('replica.js 不再有 SHOPNOTES 段', !/const SHOPNOTES = \{/.test(src2));
    delete require.cache[require.resolve(REPLICA)];
    const R2 = require(REPLICA);
    ok('SHOPNOTES 已从导出里消失或为空', !R2.SHOPNOTES || Object.keys(R2.SHOPNOTES).length === 0,
      JSON.stringify(R2.SHOPNOTES));
    const p3 = await http('GET', '/api/decorate/pages', undefined, token);
    eq('列表里已无该笔记', (p3.body.list || []).filter((x) => x.key === key).length, 0);
    eq('配额回到原值', p3.body.notes.count, beforeCount);
    const again = await http('POST', '/api/decorate/note/delete', { key: key }, token);
    eq('重复删除 → 404', again.status, 404);

    /* ---------------- 12. 限流/配额字段 ---------------- */
    console.log('\n【12】配额上限口径');
    ok('上限 50', nl.body.stats.max === 50, String(nl.body.stats.max));
    eq('stats.belongs = 店铺笔记', nl.body.stats.belongs, '店铺笔记');
  } catch (e) {
    fail++;
    fails.push('脚本异常：' + (e && e.stack ? e.stack : e));
    console.log('\n✗ 脚本异常：' + (e && e.stack ? e.stack : e));
  } finally {
    /* 收尾 1：清掉测试建出来的笔记（成功路径上已经删过一次，这里按 id 再兜一次，
       删不到就忽略 —— 目的只是「不留下测试数据」，不是断言）。 */
    if (createdId && token) {
      try {
        const rm = await http('POST', '/api/decorate/note/delete', { key: 'note-' + createdId }, token);
        // 注意判的是业务码不是 HTTP 状态：本后端所有响应都是 HTTP 200，成败写在 code 里
        console.log('收尾：清理测试笔记 #' + createdId + ' → ' + (rm.code === 0 ? '已删除' : '已不在（code=' + rm.code + '）'));
      } catch (_) { console.log('收尾：清理测试笔记 #' + createdId + ' 失败（忽略）'); }
    }
    /* 收尾 2：逐字节还原 replica.js —— 它是交付产物，测试不能改变它 */
    fs.writeFileSync(REPLICA, original); // 逐字节还原
    const back = fs.readFileSync(REPLICA);
    console.log('\nreplica.js 已还原：' + (Buffer.compare(original, back) === 0 ? '逐字节一致 ✓' : '不一致 ✗'));
    console.log('\n──────── 结果：' + pass + ' 通过 / ' + fail + ' 失败 ────────');
    if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  · ' + f)); }
    process.exit(fail ? 1 : 0);
  }
})();
