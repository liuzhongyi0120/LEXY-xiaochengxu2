import fs from 'node:fs';
const F='miniprogram/config/replica.js';
const T=F+'.tmp';
console.log('tmp 存在:', fs.existsSync(T), fs.existsSync(T)? fs.statSync(T).size+' 字节':'');
// 试：新建 tmp → rename
try{ fs.writeFileSync(T,'x'); console.log('写 tmp ok'); }catch(e){ console.log('写 tmp 失败', e.code, e.message); }
try{ fs.renameSync(T, F+'.probe'); console.log('rename tmp → .probe ok'); }catch(e){ console.log('rename 失败', e.code, e.message); }
try{ if(fs.existsSync(F+'.probe')) fs.unlinkSync(F+'.probe'); }catch(e){ console.log('删 .probe 失败', e.code); }
// 试：直接写目标文件（非原子）
try{ const s=fs.readFileSync(F,'utf8'); fs.writeFileSync(F, s); console.log('直接回写目标 ok'); }catch(e){ console.log('直接回写失败', e.code, e.message); }
