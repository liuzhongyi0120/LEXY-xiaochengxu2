import fs from 'node:fs';
const s=fs.readFileSync('miniprogram/config/replica.js','utf8');
const re=/"?note-\d+"?\s*:\s*\{/g; const marks=[]; let m;
while((m=re.exec(s))) marks.push({key:m[0].split(':')[0].replace(/"/g,''), at:m.index});
const hits=[]; const hr=/src=\\"null\\"/g; let h;
while((h=hr.exec(s))){
  let owner='?';
  for(const mk of marks){ if(mk.at<=h.index) owner=mk.key; else break; }
  hits.push(owner);
}
console.log('note 键数:', marks.length);
console.log('7 处归属:', JSON.stringify(hits));
