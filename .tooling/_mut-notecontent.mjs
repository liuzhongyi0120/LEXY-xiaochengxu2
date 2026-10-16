/**
 * `check-note-content.mjs` 的判别力验证（改坏 → 必须报红 → 用接口还原）
 *
 * 改坏三处，各自对应一条判据：
 *   ① 塞一条外链图片   → 「资源不得引外链」应红
 *   ② 把一篇正文清空   → 「每篇都要有内容」应红
 *   ③ 引用一个不存在的本地素材 → 「引用的素材取得到」应红
 *
 * 用法：node .tooling/_mut-notecontent.mjs break | restore
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
/*
 * ⚠ 必须重试：`check-note-content.mjs` 一次会打 468 个素材请求，紧随其后的请求
 *   偶发 ECONNRESET（连接复位，服务端其实已经处理完了）。不重试会误判成「脚本坏了」。
 */
async function req(p, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(B + p, body === undefined
        ? { headers: H }
        : { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}
const get = (p) => req(p);
const postJson = (p, body) => req(p, body);

const BAK = '.tooling/_mut-notecontent-bak.json';
const KEY = 'note-212';

const run = () => {
  try {
    const out = execFileSync(process.execPath, ['.tooling/check-note-content.mjs'], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') };
  }
};
const reds = (out) => (out.match(/✗/g) || []).length;

if (process.argv[2] === 'restore') {
  const bak = JSON.parse(fs.readFileSync(BAK, 'utf8'));
  /*
   * ⚠ 不能只信赖备份文件：上一轮「改坏 → 崩溃 → 再改坏」会让备份本身就已经带着
   *   上一次注入的片段（实测 BAK 里带着 no-such-file 的幽灵 img），照它还原等于
   *   把垃圾再写一遍。所以还原时**再按注入特征剥一遍**，双保险。
   */
  for (const [key, data] of Object.entries(bak)) {
    if (data.body && typeof data.body.html === 'string') {
      data.body.html = data.body.html
        .replace(/<img[^>]*(?:mutant\.jpg|no-such-file)[^>]*>\s*/gi, '')
        .replace(/<p>\s*<\/p>\s*$/gi, '');
    }
  }
  for (const [key, data] of Object.entries(bak)) {
    await postJson('/api/decorate/draft', { key, data });
    await postJson('/api/decorate/publish', { key, note: '还原' });
  }
  const r = run();
  console.log('还原后：失败 ' + reds(r.out) + ' 条（应为 0）  退出码 ' + r.code);
  process.exit(0);
}

/* ---- 备份原数据 ---- */
const list = await get('/api/decorate/pages');
const notes = (list.data && (list.data.pages || list.data.list) || []).filter((p) => String(p.key || '').startsWith('note-'));
const keys = [KEY];
const bak = {};
for (const k of keys) {
  const d = await get('/api/decorate/page?key=' + k);
  bak[k] = JSON.parse(JSON.stringify(d.data.data || {}));
}
fs.writeFileSync(BAK, JSON.stringify(bak, null, 1), 'utf8');

const base = run();
console.log('【基线】失败 ' + reds(base.out) + ' 条（应为 0）');

/* ---- ① 外链图片 ---- */
const d1 = JSON.parse(JSON.stringify(bak[KEY]));
d1.body = Object.assign({}, d1.body, { html: String(d1.body.html || '') + '<p><img src="https://img01.yzcdn.cn/upload_files/fake/mutant.jpg" /></p>' });
await postJson('/api/decorate/draft', { key: KEY, data: d1 });
await postJson('/api/decorate/publish', { key: KEY, note: '判别力验证-外链' });
const r1 = run();
console.log('【① 塞一条外链图片】失败 ' + reds(r1.out) + ' 条（应 ≥1）  ' + (r1.out.match(/✗[^\n]*/) || [''])[0].slice(0, 90));

/* ---- ② 清空正文 ---- */
const d2 = JSON.parse(JSON.stringify(bak[KEY]));
d2.body = Object.assign({}, d2.body, { html: '' });
d2.blocks = [];
await postJson('/api/decorate/draft', { key: KEY, data: d2 });
await postJson('/api/decorate/publish', { key: KEY, note: '判别力验证-空正文' });
const r2 = run();
console.log('【② 正文清空】失败 ' + reds(r2.out) + ' 条（应 ≥1）  ' + (r2.out.match(/✗[^\n]*/) || [''])[0].slice(0, 90));

/* ---- ③ 引用不存在的本地素材 ---- */
const d3 = JSON.parse(JSON.stringify(bak[KEY]));
d3.body = Object.assign({}, d3.body, { html: String(d3.body.html || '') + '<p><img src="/uploads/202610/no-such-file.jpg" /></p>' });
await postJson('/api/decorate/draft', { key: KEY, data: d3 });
await postJson('/api/decorate/publish', { key: KEY, note: '判别力验证-幽灵素材' });
const r3 = run();
console.log('【③ 引用不存在的素材】失败 ' + reds(r3.out) + ' 条（应 ≥1）  ' + (r3.out.match(/✗[^\n]*/) || [''])[0].slice(0, 90));

console.log('\n下一步：node .tooling/_mut-notecontent.mjs restore');
