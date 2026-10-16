/* 串行补发布（每篇之间留出间隔，避开 Windows 对 replica.js 的 EPERM 占用） */
import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
async function req(p,body,tries=6){
  for(let i=0;i<tries;i++){ try{
    const r=await fetch(B+p, body===undefined?{headers:H}:{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(body)});
    return await r.json();
  }catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,2000*(i+1))); } }
}
const KEYS=process.argv.slice(2);
for(const k of KEYS){
  for(let att=0; att<4; att++){
    const d=await req('/api/decorate/page?key='+k);
    const data=JSON.parse(JSON.stringify((d.data&&d.data.data)||{}));
    await req('/api/decorate/draft',{key:k,data});
    const pb=await req('/api/decorate/publish',{key:k,note:'补发布（清占位图）'});
    if(pb.code===0){ console.log(k,'✓ 已发布', pb.data.bytes,'字节'); break; }
    console.log(k,'第'+(att+1)+'次失败 code='+pb.code+' → 等 6 秒重试');
    await new Promise(r=>setTimeout(r,6000));
  }
  await new Promise(r=>setTimeout(r,2500));
}
const s=fs.readFileSync('miniprogram/config/replica.js','utf8');
console.log('生成代码里剩余 src=null：', (s.match(/src=\\"null\\"/g)||[]).length);
