import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const post=async(p,b)=>{ const r=await fetch(B+p,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(b)}); return {status:r.status, body: await r.text()}; };
const c=await post('/api/decorate/note/create',{title:'自检笔记-触发重建乙'});
console.log('create', c.status, c.body.slice(0,200));
const key=(JSON.parse(c.body).data||{}).key;
const d=await post('/api/decorate/note/delete',{key});
console.log('delete', d.status, d.body.slice(0,400));
