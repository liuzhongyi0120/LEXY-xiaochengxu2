const P='http://127.0.0.1:3456'; const SITE='http://127.0.0.1:3000';
async function j(u,o){ const t=await (await fetch(P+u,o)).text(); try{return JSON.parse(t);}catch(e){return t;} }
const r=await j('/new',{method:'POST',body:SITE+'/preview'});
const id=r.targetId||r.id;
await new Promise(r=>setTimeout(r,3200));
await j('/eval?target='+id,{method:'POST',body:`(()=>{const it=document.querySelector('#pvPages .pv-item[data-key="note-216"]');if(!it)return 'nf';it.click();return 'ok';})()`});
await new Promise(r=>setTimeout(r,5000));
const out=await j('/eval?target='+id,{method:'POST',body:`(()=>{
  const p=document.querySelector('#preview .note-page');
  const bad=[...p.querySelectorAll('img')].filter(im=>im.complete&&im.naturalWidth===0);
  return JSON.stringify(bad.map(im=>({ outer: im.outerHTML.slice(0,140), parentCls: (im.parentElement&&im.parentElement.className)||'', grandCls: (im.parentElement&&im.parentElement.parentElement&&im.parentElement.parentElement.className)||'' })));
})()`});
console.log(out.value ?? out);
/* 换一页（首页）看是不是所有页面都有这个 null img */
const out2=await j('/eval?target='+id,{method:'POST',body:`(()=>{
  const all=[...document.querySelectorAll('#preview img')].filter(im=>im.getAttribute('src')==='null');
  return JSON.stringify(all.length);
})()`});
console.log('当前预览页里 src=null 的 img 总数:', out2.value ?? out2);
