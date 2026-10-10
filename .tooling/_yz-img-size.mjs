import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.tooling/_yz-assets');

export function sizeOf(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), type: 'jpg' };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return { w: 0, h: 0, type: '?' };
}

if (process.argv[1] && process.argv[1].endsWith('_yz-img-size.mjs')) {
  const mf = JSON.parse(fs.readFileSync(path.join(DIR, '_manifest.json'), 'utf8'));
  const out = {};
  for (const a of mf.assets) {
    const b = fs.readFileSync(path.join(DIR, a.file));
    const s = sizeOf(b);
    out[a.file] = s;
    console.log(a.file.padEnd(50), (s.w + 'x' + s.h).padEnd(12), (b.length / 1024).toFixed(0) + 'KB', 'ratio=' + (s.h / s.w).toFixed(3), '[' + a.brands.join(',') + ']');
  }
  fs.writeFileSync(path.join(DIR, '_sizes.json'), JSON.stringify(out, null, 1));
}
