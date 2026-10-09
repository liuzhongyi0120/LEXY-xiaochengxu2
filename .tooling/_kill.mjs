import { execSync } from 'node:child_process';

const pid = process.argv[2];
if (!pid) { console.log('用法: node _kill.mjs <pid>'); process.exit(1); }

const SYS = 'C:\\Windows\\System32\\';

try {
  const out = execSync(`${SYS}taskkill.exe /PID ${pid} /F`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('taskkill:', out.trim());
} catch (e) {
  console.log('taskkill 失败:', String((e.stdout || '') + (e.stderr || '')).trim());
}

// 确认端口是否已释放
const net = execSync(`${SYS}netstat.exe -ano`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const rows = net.split(/\r?\n/).filter((l) => /:3000\b/.test(l));
console.log('3000 端口剩余记录:', rows.length);
rows.forEach((l) => console.log('  ' + l.trim()));
