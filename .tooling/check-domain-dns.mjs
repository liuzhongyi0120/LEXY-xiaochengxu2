#!/usr/bin/env node
/**
 * 查「域名解析生效了没」——在 IT 加完 A 记录后、跑服务器脚本之前，先跑这个。
 *
 * 用法：
 *   node .tooling/check-domain-dns.mjs                        # 默认 mall.lexy.cn → 14.103.50.137
 *   node .tooling/check-domain-dns.mjs shop.lexy.cn           # 换域名
 *   node .tooling/check-domain-dns.mjs mall.lexy.cn 1.2.3.4   # 换域名 + 换期望 IP
 *
 * 为什么要问**多个**公共 DNS：各地递归解析缓存不一致，只问一个容易得出错误结论；
 * 但**问不通的服务器不计入判定** —— 本机网络挡住某个 DNS（实测 8.8.8.8 在这台机器上
 * 固定超时）不该被算成「解析没生效」，那样工具自己就成了假红制造机。
 *
 * 退出码：0 = 可以跑下一步（enable-domain-https.sh）；1 = 还没生效 / 问不通。
 */
import dns from 'node:dns';

const DOMAIN = (process.argv[2] || 'mall.lexy.cn').trim();
const EXPECT = (process.argv[3] || '14.103.50.137').trim();

/* 只用国内稳定可达的公共 DNS。8.8.8.8 实测在本机 ETIMEOUT，不要用。 */
const SERVERS = ['223.5.5.5', '119.29.29.29', '114.114.114.114'];

if (!/^[a-z0-9.-]+$/i.test(DOMAIN)) {
  console.error('[x] 域名格式看着不对：' + DOMAIN);
  process.exit(1);
}

const resolve4 = (server, name) =>
  new Promise((res) => {
    const r = new dns.Resolver();
    r.setServers([server]);
    r.resolve4(name, (err, addrs) => res(err ? { server, err: err.code } : { server, addrs }));
  });

/* 顺带查一下主域本身，方便判断「是没加记录」还是「整个域出了问题」 */
const apex = DOMAIN.split('.').slice(-2).join('.');

console.log('查 ' + DOMAIN + '（期望 ' + EXPECT + '）\n');

const [targets, apexRow] = await Promise.all([
  Promise.all(SERVERS.map((s) => resolve4(s, DOMAIN))),
  resolve4(SERVERS[0], apex),
]);

let hit = 0;
let responders = 0; // 真的回了话的服务器（含「明确说没有这条记录」）
const unreachable = [];

for (const r of targets) {
  if (r.err === 'ENODATA' || r.err === 'ENOTFOUND') {
    responders++;
    console.log('  ' + r.server.padEnd(15) + ' 没有这条记录（' + r.err + '）');
  } else if (r.err) {
    unreachable.push(r.server + '（' + r.err + '）');
    console.log('  ' + r.server.padEnd(15) + ' 问不通：' + r.err + '  ← 不计入判定');
  } else {
    responders++;
    const good = r.addrs.includes(EXPECT);
    if (good) hit++;
    console.log('  ' + r.server.padEnd(15) + ' → ' + r.addrs.join(', ') + (good ? '  ✓' : '  ✗ 不等于 ' + EXPECT));
  }
}

console.log('\n  参考：主域 ' + apex + ' → ' +
  (apexRow.err ? apexRow.err : (apexRow.addrs || []).join(', ')));
if (unreachable.length) {
  console.log('  （' + unreachable.length + ' 个 DNS 问不通：' + unreachable.join('、') + '）');
}
console.log('');

if (responders === 0) {
  console.log('✗ 一个 DNS 都没问通 —— 本机网络可能挡了外部 DNS 查询。');
  console.log('  换台机器/手机热点再试，或直接用 nslookup ' + DOMAIN + ' 8.8.8.8 手工确认。');
  process.exit(1);
}
if (hit === responders && hit > 0) {
  console.log('✓ ' + hit + '/' + responders + ' 个可用 DNS 都解析正确 —— 可以去服务器跑：');
  console.log('    ssh root@' + EXPECT + " 'DOMAIN=" + DOMAIN + ' bash /opt/lexy-mall/deploy/enable-domain-https.sh\'');
  process.exit(0);
}
if (hit > 0) {
  console.log('… 部分 DNS 已生效（' + hit + '/' + responders + '），还在传播中，等 1~10 分钟再查。');
  console.log('  （服务器脚本要求本机也能解析到，建议等全部通了再跑。）');
  process.exit(1);
}
console.log('✗ 还没生效。确认三件事：');
console.log('  1) 记录类型是 A（不是 CNAME / AAAA）');
console.log('  2) 主机记录填的是约定的前缀（如 mall），不是 @ 或 www');
console.log('  3) 记录值就是 ' + EXPECT);
console.log('  加记录的地方：lexy.cn 的 NS 是 ns1/ns2.ename.net（易名中国）。');
process.exit(1);
