/* 只把「草稿干净但没下发到生成代码」的那 7 篇重新发布一次，并回读 replica.js 校验 */
import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
async function req(p,body,tries=5){
  for(let i=0;i<tries;i++){ try{
    const r=await fetch(B+p, body===undefined?{headers:H}:{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(body)});
    return await r.json();
  }catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,1500*(i+1))); } }
}
const KEYS=['note-214','note-215','note-216','note-217','note-232','note-234','note-262'];
for(const k of KEYS){
  const d=await req('/api/decorate/page?key='+k);
  const data=JSON.parse(JSON.stringify((d.data&&d.data.data)||{}));
  const dr=await req('/api/decorate/draft',{key:k,data});
  const pb=await req('/api/decorate/publish',{key:k,note:'补发布（清占位图）'});
  console.log(k,'draft',dr.code,'publish',pb.code, pb.data?('bytes '+pb.data.bytes):'');
}
const s=fs.readFileSync('miniprogram/config/replica.js','utf8');
console.log('生成代码里剩余 src=null：', (s.match(/src=\\"null\\"/g)||[]).length);
