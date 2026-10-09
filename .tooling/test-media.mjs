/**
 * 素材库（图片本地上传）端到端测试
 *
 * 全部走真实 HTTP，不 mock：
 *   1  上传单张（multipart）→ 校验落盘文件、魔数探测出的尺寸、相对路径
 *   2  多张一起上传（一次选几张的真实场景）
 *   3  静态访问 /uploads/… → 字节完全一致 + ETag 304
 *   4  JSON + base64 上传（调试台/脚本调用的等价入口）
 *   5  伪装图片（文本改名 .png）被拒 —— 说明校验的是文件头而不是扩展名
 *   6  SVG 被拒（同源可执行脚本，存储型 XSS 风险）
 *   7  超过单张上限被拒，且磁盘上不留垃圾文件
 *   8  素材库列表：统计、排序、搜索
 *   9  引用检查：草稿引用后删除被拒；解除引用后可删且文件真的消失
 *  10  路径穿越（删除接口与静态服务两条路径）均被拦截
 *  11  收尾：清理本次测试上传的全部素材，不污染用户的素材库
 *
 * 用法：node .tooling/test-media.mjs
 */

import fs from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminToken, authHeaders } from './_admin.mjs';

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));

const BASE = 'http://127.0.0.1:3000';
const UPLOAD_DIR = nodePath.join(__dirname, '..', 'server', 'data', 'uploads');

let pass = 0;
let fail = 0;
const created = []; // 本次测试创建的素材名，收尾时清理

function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); } else {
    fail += 1;
    console.log('  ✗ ' + name + (detail ? '  → ' + detail : ''));
  }
}

function section(t) { console.log('\n' + t); }

/* 管理类点位需要管理员令牌（报告 08）：启动时换一次，之后所有请求都带上 */
let ADMIN = '';
const H = (extra) => authHeaders(ADMIN, extra);

async function uploadRaw(buf, filename, mime) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime || 'image/png' }), filename);
  const r = await fetch(BASE + '/api/media/upload', { method: 'POST', headers: H(), body: fd });
  return { httpStatus: r.status, json: await r.json() };
}

async function uploadMulti(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append('file', new Blob([f.buf], { type: f.mime }), f.name));
  const r = await fetch(BASE + '/api/media/upload', { method: 'POST', headers: H(), body: fd });
  return { httpStatus: r.status, json: await r.json() };
}

async function jpost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  return { httpStatus: r.status, json: await r.json() };
}

async function jget(path) {
  const r = await fetch(BASE + path, { headers: H() });
  return { httpStatus: r.status, json: await r.json() };
}

function exists(name) { return fs.existsSync(nodePath.join(UPLOAD_DIR, name)); }

/* ----------------------------- 测试素材 ----------------------------- */

/** 2×2 红色 PNG */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII=',
  'base64'
);
/** 1×1 透明 GIF */
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

(async () => {
  console.log('═'.repeat(70));
  console.log('素材库（图片本地上传）端到端测试 · ' + BASE);
  console.log('═'.repeat(70));

  /* 前置：服务可用 + 管理员会话 */
  let ready = false;
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(BASE + '/api/media/list');
      // 401 也算「服务活着」，只是还没带令牌 —— 之前只认 r.ok，
      // 08 之后这里会一路等到超时，然后报出一句误导性的「服务未启动」。
      if (r.ok || r.status === 401 || r.status === 403) { ready = true; break; }
    } catch (e) { /* 继续等 */ }
    await new Promise((s) => setTimeout(s, 400));
  }
  if (!ready) {
    console.error('服务未启动，请先运行 node server/index.js');
    process.exit(1);
  }

  /* 管理类点位需要管理员令牌：换不到就直接停下，别让后面 40 多条断言全报 401 */
  try {
    ADMIN = await adminToken(BASE);
    console.log('\n管理员会话已就绪（报告 08：素材库点位均要求管理员身份）');
  } catch (e) {
    console.error('\n' + e.message);
    process.exit(1);
  }

  const before = (await jget('/api/media/list')).json.data;

  /* ---------------------------------------------------------------- */
  section('[1] 上传单张（multipart/form-data）');
  {
    const r = await uploadRaw(PNG, '莱克 测试图.png');
    const d = r.json.data || {};
    const one = (d.list || [])[0] || {};
    ok('HTTP 200 且业务码 0', r.httpStatus === 200 && r.json.code === 0, 'code=' + r.json.code + ' msg=' + r.json.msg);
    ok('返回相对路径 /uploads/…', /^\/uploads\/\d{6}\/\d{8}-[a-z0-9]{6}\.png$/.test(one.url || ''), one.url);
    ok('从文件头探测出真实尺寸 2×2', one.width === 2 && one.height === 2, one.width + '×' + one.height);
    ok('原始中文文件名被保留（便于素材库检索）', one.orig === '莱克 测试图.png', one.orig);
    ok('文件真的落盘了', !!one.name && exists(one.name), nodePath.join(UPLOAD_DIR, one.name || ''));
    ok('返回可读体积文案', one.sizeText === '71 B', one.sizeText);
    if (one.name) created.push(one.name);
  }

  /* ---------------------------------------------------------------- */
  section('[2] 一次选多张（multipart 多文件）');
  {
    const r = await uploadMulti([
      { buf: PNG, name: 'banner-a.png', mime: 'image/png' },
      { buf: GIF, name: 'icon-b.gif', mime: 'image/gif' }
    ]);
    const d = r.json.data || {};
    ok('两张都成功', r.json.code === 0 && d.success === 2 && d.failed === 0, 'success=' + d.success + ' failed=' + d.failed);
    ok('GIF 类型被正确识别', (d.list || []).some((x) => x.mime === 'image/gif'), JSON.stringify((d.list || []).map((x) => x.mime)));
    ok('两种格式都落盘', (d.list || []).every((x) => exists(x.name)));
    (d.list || []).forEach((x) => created.push(x.name));
  }

  /* ---------------------------------------------------------------- */
  section('[3] 静态访问 /uploads/…（小程序端就是读这个地址）');
  {
    const name = created[0];
    const r = await fetch(BASE + '/uploads/' + name);
    const buf = Buffer.from(await r.arrayBuffer());
    ok('HTTP 200', r.status === 200, 'HTTP ' + r.status);
    ok('Content-Type 为 image/png', r.headers.get('content-type') === 'image/png', r.headers.get('content-type'));
    ok('返回字节与上传的完全一致', buf.equals(PNG), 'len ' + buf.length + ' vs ' + PNG.length);
    const etag = r.headers.get('etag');
    const r2 = await fetch(BASE + '/uploads/' + name, { headers: { 'If-None-Match': etag } });
    ok('带 ETag 且支持 304 缓存', !!etag && r2.status === 304, 'etag=' + etag + ' 二次=' + r2.status);
    const miss = await fetch(BASE + '/uploads/202610/not-exist.png');
    ok('不存在的素材返回 404', miss.status === 404, 'HTTP ' + miss.status);
  }

  /* ---------------------------------------------------------------- */
  section('[4] JSON + base64 上传（等价入口）');
  {
    const r = await jpost('/api/media/upload', {
      name: 'from-json.png',
      data: 'data:image/png;base64,' + PNG.toString('base64')
    });
    const one = ((r.json.data || {}).list || [])[0] || {};
    ok('业务码 0 且落盘', r.json.code === 0 && !!one.name && exists(one.name), r.json.msg);
    if (one.name) created.push(one.name);
  }

  /* ---------------------------------------------------------------- */
  section('[5] 伪装图片（校验文件头，不信任扩展名）');
  {
    const r = await uploadRaw(Buffer.from('这其实是一个文本文件，只是改名成了 png', 'utf8'), 'evil.png', 'image/png');
    ok('被拒绝', r.json.code !== 0, 'code=' + r.json.code);
    ok('提示里说明了支持的格式', /不支持的素材格式/.test(r.json.msg || '') && /MP4/.test(r.json.msg || ''), r.json.msg);
    const after = (await jget('/api/media/list')).json.data;
    ok('没有产生任何垃圾文件', after.all === before.all + created.length, after.all + ' vs ' + (before.all + created.length));
  }

  /* ---------------------------------------------------------------- */
  section('[6] SVG 被拒（同源可执行脚本风险）');
  {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>', 'utf8');
    const r = await uploadRaw(svg, 'x.svg', 'image/svg+xml');
    ok('被拒绝', r.json.code !== 0, 'code=' + r.json.code);
    ok('提示里点名 SVG 的安全原因', /SVG/.test(r.json.msg || ''), r.json.msg);
  }

  /* ---------------------------------------------------------------- */
  section('[7] 超过单张上限被拒');
  {
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]); // 6MB > 5MB 上限
    const r = await uploadRaw(big, 'too-big.png');
    ok('被拒绝', r.json.code !== 0, 'code=' + r.json.code);
    ok('提示里给出上限', /上限/.test(r.json.msg || ''), r.json.msg);
    const after = (await jget('/api/media/list')).json.data;
    ok('磁盘没多出文件', after.all === before.all + created.length, after.all + '');
  }

  /* ---------------------------------------------------------------- */
  section('[8] 素材库列表：统计 / 排序 / 搜索');
  {
    const d = (await jget('/api/media/list?size=200')).json.data;
    ok('总数 = 原有 + 本次上传', d.all === before.all + created.length, d.all + ' vs ' + (before.all + created.length));
    ok('stat 含张数 / 总占用 / 单张上限', d.stat.count > 0 && d.stat.bytes > 0 && d.stat.maxBytes === 5 * 1024 * 1024, JSON.stringify(d.stat));
    ok('默认按最新在前排序', d.list.length > 1 && d.list[0].at >= d.list[1].at, d.list[0].at + ' vs ' + d.list[1].at);
    const newest = d.list[0].name;
    ok('最新一条就是刚上传的', created.indexOf(newest) !== -1, newest);

    const byName = (await jget('/api/media/list?size=200&q=' + encodeURIComponent('莱克 测试图'))).json.data;
    ok('按原始文件名搜索命中', byName.total === 1 && byName.list[0].orig === '莱克 测试图.png', 'total=' + byName.total);

    const byPath = (await jget('/api/media/list?size=200&q=from-json')).json.data;
    ok('按相对路径搜索命中', byPath.total >= 1, 'total=' + byPath.total);

    const big2 = (await jget('/api/media/list?size=200&sort=big')).json.data;
    ok('按体积倒序可用', big2.list.length < 2 || big2.list[0].size >= big2.list[1].size, JSON.stringify(big2.list.slice(0, 2).map((x) => x.size)));

    const paged = (await jget('/api/media/list?page=1&size=1')).json.data;
    ok('分页参数生效（size=1 只回 1 条）', paged.list.length === 1 && paged.size === 1, 'len=' + paged.list.length);
  }

  /* ---------------------------------------------------------------- */
  section('[9] 引用检查：草稿里用到的图不允许直接删（用一个非首页做测试，不影响用户内容）');
  {
    const target = ((await jpost('/api/media/upload', { name: 'ref-test.png', data: PNG.toString('base64') })).json.data.list || [])[0];
    created.push(target.name);

    const pageKey = 'mine';
    const page = (await jget('/api/decorate/page?key=' + pageKey)).json.data;
    ok('测试页当前没有草稿（不会覆盖用户正在编辑的内容）', page.hasDraft === false, 'hasDraft=' + page.hasDraft);

    const data = JSON.parse(JSON.stringify(page.data));
    const parts = pageKey === 'mine' ? data.shop : data;
    parts.avatar = target.url;
    ok('把该图写进 ' + pageKey + ' 页的店铺头像字段', parts.avatar === target.url, parts.avatar);

    const saved = await jpost('/api/decorate/draft', { key: pageKey, data: data });
    ok('草稿保存成功', saved.json.code === 0, saved.json.msg);

    const denied = await jpost('/api/media/delete', { name: target.name });
    ok('删除被拒（业务码 2000）', denied.json.code === 2000, 'code=' + denied.json.code);
    ok('提示里给出引用处数', /引用/.test(denied.json.msg || '') && /草稿/.test(denied.json.msg || ''), denied.json.msg);
    ok('文件仍在磁盘上', exists(target.name));

    const discarded = await jpost('/api/decorate/discard', { key: pageKey });
    ok('草稿已丢弃（页面回到线上内容）', discarded.json.code === 0, discarded.json.msg);

    const removed = await jpost('/api/media/delete', { name: target.name });
    ok('解除引用后删除成功', removed.json.code === 0 && removed.json.data.deleted === true, removed.json.msg);
    ok('文件真的被删掉了', !exists(target.name));
    created.splice(created.indexOf(target.name), 1);

    const gone = await fetch(BASE + target.url);
    ok('原地址访问变成 404', gone.status === 404, 'HTTP ' + gone.status);
  }

  /* ---------------------------------------------------------------- */
  section('[10] 路径穿越防护');
  {
    const a = await jpost('/api/media/delete', { name: '../../server/index.js' });
    ok('删除接口拦住 ../ 穿越', a.json.code !== 0, 'code=' + a.json.code);
    ok('server/index.js 毫发无损', fs.existsSync(nodePath.join(__dirname, '..', 'server', 'index.js')));

    const b = await fetch(BASE + '/uploads/../server/index.js');
    ok('静态服务拦住 ../ 穿越（400/403/404 都算拦截）', b.status === 400 || b.status === 403 || b.status === 404, 'HTTP ' + b.status);

    const c = await fetch(BASE + '/uploads/' + encodeURIComponent('../../package.json'));
    ok('编码后的穿越同样被拦', c.status >= 400, 'HTTP ' + c.status);

    const d = await fetch(BASE + '/uploads/index.json');
    ok('索引文件不允许被下载', d.status === 403, 'HTTP ' + d.status);
  }

  /* ---------------------------------------------------------------- */
  section('[11] 收尾：清理本次测试素材');
  {
    let removedCount = 0;
    for (const name of created.slice()) {
      const r = await jpost('/api/media/delete', { name: name, force: 1 });
      if (r.json.code === 0) removedCount += 1;
    }
    const after = (await jget('/api/media/list?size=200')).json.data;
    ok('测试素材已全部清理', after.all === before.all, after.all + ' vs ' + before.all);
    ok('达到预期清理条数', removedCount === created.length, removedCount + '/' + created.length);
    console.log('  · 素材库当前共 ' + after.stat.count + ' 张，占用 ' + after.stat.sizeText);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(fail === 0 ? `✅ 全部通过：${pass}/${pass}` : `❌ ${fail} 项失败（通过 ${pass} 项）`);
  console.log('═'.repeat(70));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('测试异常：', e);
  process.exit(1);
});
