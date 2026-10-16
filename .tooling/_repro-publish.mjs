import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const post=async(p,b)=>{ const t0=Date.now(); const r=await fetch(B+p,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(b)}); const j=await r.json().catch(()=>({})); return {code:j.code, msg:j.msg, ms:Date.now()-t0}; };
for(let i=0;i<25;i++){ try{const r=await fetch('http://127.0.0.1:3000/api/health'); if(r.ok) break;}catch(e){} await new Promise(r=>setTimeout(r,1000)); }
const KEY='p296';
for(let i=1;i<=5;i++){
  const d=await (await fetch(B+'/api/decorate/page?key='+KEY,{headers:H})).json();
  const data=(d.data&&d.data.data)||{};
  const dr=await post('/api/decorate/draft',{key:KEY,data});
  const pb=await post('/api/decorate/publish',{key:KEY,note:'压力测试 '+i});
  console.log('第'+i+'次  draft',dr.code,'| publish code='+pb.code,(pb.ms)+'ms', pb.msg||'');
}
