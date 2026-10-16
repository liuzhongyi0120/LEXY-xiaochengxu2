import fs from 'node:fs';
const s=fs.readFileSync('miniprogram/config/replica.js','utf8');
const re=/^const ([A-Z0-9_]+)\s*=/gm; const marks=[]; let m;
while((m=re.exec(s))) marks.push({key:m[1], at:m.index});
const hits=[]; const hr=/src=\\"null\\"/g; let h;
while((h=hr.exec(s))){
  let owner='(文件头/未知)';
  for(const mk of marks){ if(mk.at<=h.index) owner=mk.key; else break; }
  hits.push(owner);
}
const cnt={}; hits.forEach(k=>cnt[k]=(cnt[k]||0)+1);
console.log('归属统计:', JSON.stringify(cnt));
console.log('顶层键顺序:', marks.map(x=>x.key).join(', ').slice(0,300));
/* 另一处：packageNews 的 data.js */
const fs2=fs.readFileSync('miniprogram/packageNews/data.js','utf8');
console.log('packageNews/data.js 里 src=null:', (fs2.match(/src=\\?"?null/gi)||[]).length);
