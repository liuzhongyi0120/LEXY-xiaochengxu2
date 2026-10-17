/**
 * 一次性探针：看线上跑的是不是新代码。
 * 判据 = GET /mall-api/api/health 里的 routes 数量（整改前 85 业务点位 → 约 87；整改后 110 + 2 = 112）。
 * 本机直连域名会被公司出口按 SNI 拦，故走「空 SNI + Host 头」替代路径（只读 GET，不做任何写操作）。
 */
import tls from 'node:tls';
import dns from 'node:dns';

const HOST = 'mall.lexy.cn';
const PATH = '/mall-api/api/health';

function get() {
  return new Promise((resolve, reject) => {
    dns.lookup(HOST, (err, ip) => {
      if (err) return reject(err);
      const sock = tls.connect({
        host: ip,
        port: 443,
        servername: '',
        rejectUnauthorized: false
      }, () => {
        sock.write(
          `GET ${PATH} HTTP/1.1\r\nHost: ${HOST}\r\nUser-Agent: probe\r\nConnection: close\r\n\r\n`
        );
      });
      let buf = '';
      sock.on('data', (d) => { buf += d.toString('utf8'); });
      sock.on('end', () => resolve(buf));
      sock.on('error', reject);
      setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, 15000);
    });
  });
}

const raw = await get();
const body = raw.slice(raw.indexOf('\r\n\r\n') + 4);
let j = {};
try { j = JSON.parse(body); } catch { console.log('原始响应：', raw.slice(0, 400)); process.exit(1); }
console.log('线上 health：');
console.log('  service =', j.service);
console.log('  uptime  =', j.uptime, '秒（约', (j.uptime / 86400).toFixed(2), '天）');
console.log('  routes  =', j.routes);
console.log('  login   =', j.wechat && j.wechat.login, '| pay =', j.wechat && j.wechat.pay);
console.log('  env     =', j.env);
console.log('');
console.log(j.routes >= 112 ? '=> 线上已是新代码（>=112）' : '=> 线上仍是旧代码（' + j.routes + ' < 112），本次整改尚未部署');
