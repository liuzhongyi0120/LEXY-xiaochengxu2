/* 给 note-212 注入一个 src="null" 的占位 img，看 check-note-content 会不会红 */
import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
async function req(p,body,tries=4){
  for(let i=0;i<tries;i++){ try{
    const r=await fetch(B+p, body===undefined?{headers:H}:{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(body)});
    return await r.json();
  }catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,1200*(i+1))); } }
}
const d=await req('/api/decorate/page?key=note-212');
const data=JSON.parse(JSON.stringify(d.data.data||{}));
data.body=Object.assign({},data.body,{html:String((data.body&&data.body.html)||'')+'<p><img src="null" /></p>'});
console.log('draft',(await req('/api/decorate/draft',{key:'note-212',data})).code,'publish',(await req('/api/decorate/publish',{key:'note-212',note:'判别力验证-占位图'})).code);
