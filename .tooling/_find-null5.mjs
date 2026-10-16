import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const list=await (await fetch(B+'/api/decorate/pages',{headers:H})).json();
const notes=(list.data&&(list.data.pages||list.data.list)||[]).filter(p=>String(p.key||'').startsWith('note-'));
const BAD=/src\s*=\s*["']?null/i;
let n=0;
for(const p of notes){
  const d=await (await fetch(B+'/api/decorate/page?key='+p.key,{headers:H})).json();
  const dd=(d.data&&d.data.data)||{};
  const pub=(d.data&&d.data.published&&d.data.published.data)||{};
  const a=String((dd.body&&dd.body.html)||'');
  const b=String((pub.body&&pub.body.html)||'');
  if(BAD.test(a)||BAD.test(b)){ n++; console.log(p.key,' draft含null:',BAD.test(a),' 已发布含null:',BAD.test(b)); }
}
console.log('含 null-src 的笔记本数：', n);
