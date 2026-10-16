import { readFileSync } from 'node:fs';
const P='http://127.0.0.1:3456'; const SITE='http://127.0.0.1:3000';
async function j(u,o){ const t=await (await fetch(P+u,o)).text(); try{return JSON.parse(t);}catch(e){return t;} }
const r = await j('/new',{method:'POST',body:SITE+'/preview'});
const id = r.targetId||r.id;
await new Promise(r=>setTimeout(r,3200));
await j('/eval?target='+id,{method:'POST',body:`(()=>{const it=document.querySelector('#pvPages .pv-item[data-key="note-216"]');if(!it)return 'nf';it.click();return 'ok';})()`});
await new Promise(r=>setTimeout(r,5000));
const out = await j('/eval?target='+id,{method:'POST',body:`(()=>{
  const p=document.querySelector('#preview .note-page');
  const bad=[...p.querySelectorAll('img')].filter(im=>im.complete&&im.naturalWidth===0)
    .map(im=>JSON.stringify({src:(im.getAttribute('src')||'').slice(0,80), cur:(im.currentSrc||'').slice(0,80), w:im.naturalWidth}));
  const all=[...p.querySelectorAll('img')].map(im=>(im.getAttribute('src')||'').slice(0,60)).filter(s=>s.indexOf('/uploads/')!==0);
  return JSON.stringify({bad, nonUploads: all.slice(0,10)});
})()`});
console.log(out.value ?? out);
