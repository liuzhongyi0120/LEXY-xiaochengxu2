import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const list=await (await fetch(B+'/api/decorate/pages',{headers:H})).json();
const notes=(list.data&&(list.data.pages||list.data.list)||[]).filter(p=>String(p.key||'').startsWith('note-'));
for(const n of notes){
  const d=await (await fetch(B+'/api/decorate/page?key='+n.key,{headers:H})).json();
  const s=JSON.stringify(d.data.data||{});
  if(s.indexOf('no-such-file')>=0) console.log('幽灵素材在', n.key);
}
const bak=JSON.parse(fs.readFileSync('.tooling/_mut-notecontent-bak.json','utf8'));
console.log('BAK 里有幽灵吗:', JSON.stringify(bak).indexOf('no-such-file')>=0, '| BAK html 长度:', ((bak['note-212']||{}).body||{}).html?.length);
