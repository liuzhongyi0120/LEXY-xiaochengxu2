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
let html=String((data.body&&data.body.html)||'');
const before=html.length;
html=html.replace(/<p>\s*<\/p>\s*\$/i,'');
console.log('note-212 html', before, '→', html.length);
data.body=Object.assign({},data.body,{html});
console.log('draft',(await req('/api/decorate/draft',{key:'note-212',data})).code,'publish',(await req('/api/decorate/publish',{key:'note-212',note:'清掉空段落'})).code);
