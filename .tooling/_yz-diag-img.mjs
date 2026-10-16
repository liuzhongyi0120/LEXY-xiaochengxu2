import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('.tooling/_yz-notes-content.json','utf8')).notes;
const cache = JSON.parse(fs.readFileSync('.tooling/_yz-img-cache.json','utf8'));
function urls(html){ const out=[]; const re=/(?:src|data-src)\s*=\s*["']([^"']+)["']/gi; let m;
  while((m=re.exec(html))) { const u=m[1]; if(/^https?:/i.test(u)&&/\.(png|jpe?g|webp|gif)([!?][^"']*)?$/i.test(u)&&out.indexOf(u)<0) out.push(u);} return out; }
const bad = [];
for (const [a,n] of Object.entries(c)) {
  if (!n.htmlLen) continue;
  for (const u of urls(n.html)) if (cache[u] === '') bad.push({a,u});
}
console.log('失败图片 URL 共', bad.length);
const seen=new Set(); const sample=[];
for(const b of bad){ if(seen.has(b.u))continue; seen.add(b.u); sample.push(b.u); }
console.log('去重后', sample.length, '，前 6 个逐个试下：');
for (const u of sample.slice(0,6)) {
  try{
    const r = await fetch(u,{headers:{referer:'https://shop44567186.youzan.com/'}});
    const b = Buffer.from(await r.arrayBuffer());
    console.log('  HTTP',r.status,(b.length/1048576).toFixed(2)+'MB', b.slice(0,4).toString('hex'), u.slice(0,90));
  }catch(e){ console.log('  ERR', e.message, u.slice(0,90)); }
}
console.log('\n--- 3 篇短正文的实际 html ---');
for (const a of ['bCDcJZ5fBB','hYjwFAZNyA','od1JOwQOup']) {
  if (c[a]) console.log(a, JSON.stringify(c[a].html));
}
