import fs from 'node:fs';
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
const url = 'https://img01.yzcdn.cn/upload_files/2026/09/10/a772d81d882506a1ef6f14073c7913b7.jpg';
const r = await fetch(url, { headers: { referer: 'https://shop44567186.youzan.com/' } });
const buf = Buffer.from(await r.arrayBuffer());

// A) multipart + folder
const fd = new FormData();
fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'yz-test.jpg');
const upA = await fetch(B + '/api/media/upload?folder=' + encodeURIComponent('有赞笔记正文'), { method: 'POST', headers: H, body: fd }).then((x) => x.json());
console.log('A multipart+folder:', JSON.stringify(upA).slice(0, 400));

// B) multipart 无 folder
const fd2 = new FormData();
fd2.append('file', new Blob([buf], { type: 'image/jpeg' }), 'yz-test2.jpg');
const upB = await fetch(B + '/api/media/upload', { method: 'POST', headers: H, body: fd2 }).then((x) => x.json());
console.log('B multipart:', JSON.stringify(upB).slice(0, 400));

// C) JSON base64
const upC = await fetch(B + '/api/media/upload', {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'yz-test3.jpg', data: 'data:image/jpeg;base64,' + buf.toString('base64') })
}).then((x) => x.json());
console.log('C json:', JSON.stringify(upC).slice(0, 400));
