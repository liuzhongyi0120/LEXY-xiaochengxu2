import fs from 'node:fs';
const TOK = fs.readFileSync('.tooling/_tok.txt','utf8').trim();
const B='http://127.0.0.1:3000'; const H={Authorization:'Bearer '+TOK};
const get=async(p)=>(await(await fetch(B+p,{headers:H}))).json();
const d = await get('/api/decorate/page?key=note-212');
const data = d.data.data;
console.log('现状 html 长度', (data.body&&data.body.html||'').length);
data.body.html = (data.body.html||'') + '<p><img src="https://img01.yzcdn.cn/upload_files/fake/mutant.jpg" /></p>';
try{
  const dr = await fetch(B+'/api/decorate/draft',{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify({key:'note-212',data})});
  console.log('draft HTTP', dr.status);
  console.log('draft body', (await dr.text()).slice(0,200));
}catch(e){ console.log('draft ERR', e.message, e.cause&&e.cause.message); }
try{
  const pb = await fetch(B+'/api/decorate/publish',{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify({key:'note-212',note:'mut'})});
  console.log('publish HTTP', pb.status);
  console.log('publish body', (await pb.text()).slice(0,300));
}catch(e){ console.log('publish ERR', e.message, e.cause&&e.cause.message); }
