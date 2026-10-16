import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const d=await (await fetch(B+'/api/decorate/page?key=note-216',{headers:H})).json();
const h=(d.data.data||{}).header||{};
console.log('coverMode:', h.coverMode, '| covers:', JSON.stringify(h.covers));
