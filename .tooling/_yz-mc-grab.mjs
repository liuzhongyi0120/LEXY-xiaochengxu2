/* 抓有赞前台个人中心页的 HTML 与相关 CSS，落盘供离线分析 */
import fs from 'node:fs';
const OUT = 'C:/Users/8274282/WorkBuddy/2026-10-07-13-19-01/.tooling/_yzmc';
fs.mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function grab(url, file, headers) {
  try {
    const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers || {}) });
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(`${OUT}/${file}`, buf);
    console.log(`[${r.status}] ${buf.length} B  ${file}  <- ${url.slice(0, 110)}`);
    return buf.toString('utf8');
  } catch (e) {
    console.log(`[ERR] ${file}  ${url.slice(0, 90)}  ${e.message}`);
    return '';
  }
}

(async () => {
  /* 1) 前台个人中心 HTML */
  const html = await grab(
    'https://shop44567186.youzan.com/wscuser/membercenter?kdt_id=44375018',
    'membercenter.html',
    { Referer: 'https://shop44567186.youzan.com/' }
  );

  /* 2) 从 HTML 里抽 css / js 链接 */
  const links = [];
  const re = /(?:href|src)="([^"]+\.(?:css|js))"/g;
  let m;
  while ((m = re.exec(html))) links.push(m[1]);
  console.log('\nHTML 内引用资源 %d 个：', links.length);
  links.slice(0, 30).forEach((l) => console.log('  ' + l.slice(0, 130)));

  /* 3) 抓所有 css */
  let i = 0;
  for (const l of links.filter((x) => /\.css/.test(x)).slice(0, 12)) {
    const u = l.startsWith('//') ? 'https:' + l : l.startsWith('/') ? 'https://shop44567186.youzan.com' + l : l;
    await grab(u, `css-${String(++i).padStart(2, '0')}.css`, { Referer: 'https://shop44567186.youzan.com/' });
  }

  /* 4) 装修台的个人中心 CSS（已知含 usercenter-icon 字体定义） */
  await grab(
    'https://b.yzcdn.cn/wsc-pc-decorate/shop-decorate-manage/usercenter-decorate_155be553.css',
    'decorate-usercenter.css',
    { Referer: 'https://store.youzan.com/' }
  );
})();
