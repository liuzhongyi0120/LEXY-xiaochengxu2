import fs from 'node:fs';
const s=fs.readFileSync('miniprogram/config/replica.js','utf8');
const KEY=/^\s{2}"?(note-\d+)"?:\s*\{/gm;
const marks=[]; let m;
while((m=KEY.exec(s))) marks.push({key:m[1], at:m.index});
const hits=[];
const re=/src=\\"null\\"/g; let h;
while((h=re.exec(s))){
  let owner='(unknown)';
  for(const mk of marks){ if(mk.at < h.index) owner=mk.key; else break; }
  hits.push(owner);
}
console.log('replica.js 里 src=null 共', hits.length, '处，归属：', JSON.stringify(hits));
