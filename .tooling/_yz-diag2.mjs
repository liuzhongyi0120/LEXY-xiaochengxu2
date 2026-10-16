import fs from 'node:fs';
const TOK = fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const get=async(p)=>(await(await fetch(B+p,{headers:H}))).json();
const list=await get('/api/decorate/pages');
const notes=(list.data&&(list.data.pages||list.data.list)||[]).filter(p=>String(p.key||'').startsWith('note-'));
const found=[];
for(const n of notes){
  const d=await get('/api/decorate/page?key='+n.key);
  const data=(d.data&&d.data.data)||{};
  const html=String((data.body&&data.body.html)||'');
  const re=/(?:src|poster|data-src)\s*=\s*["']([^"']+)["']/gi; let m;
  while((m=re.exec(html))){ const u=m[1]; if(/^https?:/i.test(u)) found.push({key:n.key,u}); }
}
const uniq=[...new Set(found.map(f=>f.u))];
console.log('全部外部资源引用:', uniq.length);
for(const u of uniq){
  let size='?';
  try{ const r=await fetch(u,{headers:{referer:'https://shop46010558.youzan.com/'}}); const b=Buffer.from(await r.arrayBuffer()); size=(b.length/1048576).toFixed(2)+'MB'; }catch(e){ size='ERR '+e.message; }
  console.log('  ', size.padStart(9), u.slice(0,110));
}
fs.writeFileSync('.tooling/_yz-ext-urls.json', JSON.stringify(uniq,null,1),'utf8');
