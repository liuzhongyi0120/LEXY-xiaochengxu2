/* 清掉判别力验证留下的幽灵素材引用（只动这一条，不做别的） */
import fs from 'node:fs';
const TOK=fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const postJson=async(p,b)=>(await(await fetch(B+p,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(b)}))).json();
const KEY='note-212';
const d=await (await fetch(B+'/api/decorate/page?key='+KEY,{headers:H})).json();
const data=JSON.parse(JSON.stringify(d.data.data||{}));
let html=String((data.body&&data.body.html)||'');
const before=html.length;
html=html.replace(/<img[^>]*no-such-file[^>]*>\s*/gi,'');
data.body=Object.assign({},data.body,{html});
console.log('html', before, '→', html.length, '| 仍含幽灵:', html.indexOf('no-such-file')>=0);
const dr=await postJson('/api/decorate/draft',{key:KEY,data});
const pb=await postJson('/api/decorate/publish',{key:KEY,note:'清掉判别力验证残留'});
console.log('draft',dr.code,'publish',pb.code);
