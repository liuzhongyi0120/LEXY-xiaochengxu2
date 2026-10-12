/* 把「莱克资讯」页复刻用的 8 张卡片图上传到本机素材库（JSON + base64）。
 * 用法：node .tooling/_yz2-upload.mjs
 * 产出：.tooling/_yz2-upload/_uploaded.json —— 本地文件名 → /uploads/... 相对路径（可续跑）
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.tooling/_yz2-upload');
const BASE = 'http://127.0.0.1:3000';
const API = BASE + '/api/media/upload?folder=yz-lexy-news';

const lr = await fetch(BASE + '/api/admin/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PW || 'admin' })
});
const lj = await lr.json();
if (lj.code !== 0) { console.log('管理员登录失败：' + lj.msg); process.exit(1); }
const TOKEN = lj.data.token;
console.log('管理员登录成功\n');

const man = JSON.parse(fs.readFileSync(path.join(DIR, '_manifest.json'), 'utf8'));
const outFile = path.join(DIR, '_uploaded.json');
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};

let ok = 0, skip = 0;
const failed = [];
for (const a of man) {
  if (done[a.file]) { skip++; continue; }
  const buf = fs.readFileSync(path.join(DIR, a.file));
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ name: a.file, data: buf.toString('base64') }),
      signal: AbortSignal.timeout(60000)
    });
    const j = await r.json();
    if (j.code !== 0) throw new Error('code=' + j.code + ' ' + j.msg);
    const item = j.data.list[0];
    done[a.file] = { url: item.url, name: item.name, w: item.width || item.w, h: item.height || item.h, bytes: item.size };
    fs.writeFileSync(outFile, JSON.stringify(done, null, 1));
    ok++;
    console.log('OK   ' + a.file.padEnd(24) + ' -> ' + item.url);
  } catch (e) {
    failed.push({ file: a.file, err: String((e.cause && e.cause.code) || e.message) });
    console.log('FAIL ' + a.file + ' :: ' + ((e.cause && e.cause.code) || e.message));
  }
}
console.log(`\n新上传 ${ok} 张，跳过 ${skip} 张，失败 ${failed.length} 张`);
if (failed.length) console.log(JSON.stringify(failed, null, 1));
