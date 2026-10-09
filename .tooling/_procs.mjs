import { execSync } from 'node:child_process';

const SYS = 'C:\\Windows\\System32\\';

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return '!!ERR ' + String((e.stdout || '') + (e.stderr || '')).slice(0, 300); }
}

console.log('=== netstat -ano | :3000 ===');
const net = run(SYS + 'netstat.exe -ano');
net.split(/\r?\n/).filter((l) => /:3000\b/.test(l)).forEach((l) => console.log(l.trim()));

console.log('\n=== node 进程 ===');
const tl = run(SYS + 'tasklist.exe /FI "IMAGENAME eq node.exe" /FO CSV /NH');
tl.split(/\r?\n/).filter(Boolean).forEach((l) => console.log(l.trim()));
