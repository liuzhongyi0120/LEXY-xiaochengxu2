import fs from 'node:fs';
const s=fs.readFileSync('miniprogram/config/replica.js','utf8');
const re=/^\s{2}"(\d+)"\s*:\s*\{/gm; const marks=[]; let m;
while((m=re.exec(s))) marks.push({key:m[1], at:m.index});
const hr=/src=\\"null\\"/g; let h; const hits=[];
while((h=hr.exec(s))){
  let owner='?';
  for(const mk of marks){ if(mk.at<=h.index) owner='note-'+mk.key; else break; }
  hits.push(owner);
}
console.log('SHOPNOTES 里笔记数:', marks.length);
console.log('7 处归属:', JSON.stringify(hits));
