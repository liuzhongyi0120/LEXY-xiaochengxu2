/* 从 4 个品牌的 DOM dump 里提取全部图片 URL，下载原图到 _yz-assets/。
 * 用法：node .tooling/_yz-fetch-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.tooling/_yz-assets');
fs.mkdirSync(DIR, { recursive: true });

const FILES = [
  ['lexy', '.tooling/_yz-r2.json'],
  ['bqy', '.tooling/_yz-r2-b.json'],
  ['jimmy', '.tooling/_yz-r2-2.json'],
  ['drcoffee', '.tooling/_yz-r2-3.json']
];

const manifest = {};
const all = new Map(); // url -> { seeds: [], name }

for (const [brand, file] of FILES) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = raw.value || raw;
  const blocks = d.blocks || [];
  manifest[brand] = blocks.map((b) => ({
    kind: b.cellCount === 1 ? 'single' : 'grid',
    cells: b.cells.map((c) => {
      const u = (c.img || '').replace(/!(large|middle|small|tiny)\.webp$/, '');
      if (u) {
        if (!all.has(u)) all.set(u, { seeds: [], brands: [] });
        all.get(u).brands.push(brand);
      }
      return { label: c.label, url: u, imgH: c.imgBox ? c.imgBox[3] : 0, boxH: c.box[3] };
    })
  }));
}

// 左上角 Logo
const LOGO = 'https://img01.yzcdn.cn/upload_files/2025/06/07/FqJzOV45r-RW6l48xjsmk95oHEnX.png';
all.set(LOGO, { seeds: [], brands: ['logo'] });

console.log('唯一图片数：' + all.size);

const urls = [...all.keys()];
let i = 0;
const failed = [];
for (const u of urls) {
  i++;
  const base = u.split('/').pop();
  const ext = (base.match(/\.(png|jpe?g|webp|gif)$/i) || ['.jpg'])[0].toLowerCase();
  const name = String(i).padStart(3, '0') + '-' + base.replace(/\.[^.]+$/, '').slice(0, 40) + ext;
  const out = path.join(DIR, name);
  if (all.get(u).brands.includes('logo')) all.get(u).name = 'logo' + ext;
  else all.get(u).name = name;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(out, buf);
    all.get(u).bytes = buf.length;
    all.get(u).saved = name;
    console.log(String(i).padStart(3) + '/' + urls.length, (buf.length / 1024).toFixed(0) + 'KB', name, '[' + all.get(u).brands.join(',') + ']');
  } catch (e) {
    failed.push({ u, err: String(e.cause && e.cause.code || e.message) });
    console.log('  FAIL', u, e.cause && e.cause.code || e.message);
  }
}

fs.writeFileSync(path.join(DIR, '_manifest.json'), JSON.stringify({
  logo: LOGO,
  assets: [...all.entries()].map(([u, v]) => ({ url: u, file: v.saved, bytes: v.bytes, brands: v.brands })),
  failed
}, null, 1));

fs.writeFileSync('.tooling/_yz-content.json', JSON.stringify(manifest, null, 1));
console.log('\n下载完成，失败 ' + failed.length + ' 张；清单见 .tooling/_yz-assets/_manifest.json');
