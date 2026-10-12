/* 下载有赞「莱克资讯」页的 8 张卡片图（去掉 !large.webp 后缀取原图，取不到再回落压缩版）。
 * 用法：node .tooling/_yz2-dl.mjs
 * 产出：.tooling/_yz2-assets/<序号>-<文件名>  以及 _manifest.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ITEMS = [
  ['01', '关于莱克', 'https://img01.yzcdn.cn/upload_files/2025/01/17/FqSuZDEO9tXps6i-YyTynZ5WdwrU.png'],
  ['02', '新闻大事', 'https://img01.yzcdn.cn/upload_files/2025/01/18/FsHt5BUUESrpu1Dhc-nw-gzKxvue.png'],
  ['03', '创业故事', 'https://img01.yzcdn.cn/upload_files/2025/01/16/FvPNYdc7cOq1Z2qOnMJfQZ_6QGvL.png'],
  ['04', '我们品牌', 'https://img01.yzcdn.cn/upload_files/2026/01/06/Fml3p5gzwaZIBu59McvIzciUd9Yd.jpg'],
  ['05', '用户分享', 'https://img01.yzcdn.cn/upload_files/2025/01/18/FjRf6fbuGMS-0NtLDLJhvhuLQ-RW.png'],
  ['06', '业务模式', 'https://img01.yzcdn.cn/upload_files/2025/01/15/FlEGD1Kzz0DhqQIPBT_9IuG3Mx57.png'],
  ['07', '售后服务', 'https://img01.yzcdn.cn/upload_files/2025/01/18/FgXBmhC4vgU2Zzj883y6u5HwpE5r.png'],
  ['08', '加入我们', 'https://img01.yzcdn.cn/upload_files/2025/01/18/Fu667fFSbNvtJW0LY75s1VmaLJbN.png']
];

const DIR = path.resolve('.tooling/_yz2-assets');
fs.mkdirSync(DIR, { recursive: true });

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40';
const manifest = [];

for (const [i, title, base] of ITEMS) {
  const ext = path.extname(new URL(base).pathname);
  let buf = null, used = '', note = '';
  for (const cand of [base, base + '!large.webp', base + '!large']) {
    try {
      const r = await fetch(cand, { headers: { 'user-agent': UA, referer: 'https://shop46010558.m.youzan.com/' } });
      if (!r.ok) { note += ` ${cand.slice(-24)}→${r.status}`; continue; }
      const b = Buffer.from(await r.arrayBuffer());
      // 魔数校验：只认 PNG / JPEG / WebP
      const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
      const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
      const isWebp = b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
      if (!isPng && !isJpg && !isWebp) { note += ` 魔数不符(${b.slice(0, 4).toString('hex')})`; continue; }
      buf = b; used = cand;
      buf.kind = isPng ? 'png' : (isJpg ? 'jpg' : 'webp');
      break;
    } catch (e) { note += ' ' + e.message; }
  }
  if (!buf) { console.log(`✗ ${i} ${title} 下载失败：${note}`); continue; }
  const file = `${i}-${title}${buf.kind === 'jpg' ? ext : '.' + buf.kind}`;
  fs.writeFileSync(path.join(DIR, file), buf);
  manifest.push({ i, title, file, source: used, kind: buf.kind, bytes: buf.length });
  console.log(`✓ ${i} ${title.padEnd(5)} ${buf.kind.padEnd(4)} ${(buf.length / 1024).toFixed(1)} KB  ${path.basename(used)}`);
}

fs.writeFileSync(path.join(DIR, '_manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\n共 ${manifest.length}/8 张，写入 ${DIR}`);
