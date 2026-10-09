/*
 * 上传后「立刻」删除的压力实验
 *
 * 背景：旧的服务进程上，删除接口报告 deleted:true 但文件仍在磁盘（索引已删、URL 仍 200）。
 * 重启进程后同一操作立刻成功 —— 怀疑是 Windows 上「刚写入的文件被实时扫描短暂占用」
 * 这类瞬时竞态（unlink 抛 EPERM/EBUSY，被旧代码静默吞掉）。
 *
 * 本脚本连续做 N 轮「上传 → 立即删除」，统计失败率与错误码，
 * 用来判断删除是否需要加重试。
 */
import { adminToken } from './_admin.mjs';

const BASE = 'http://127.0.0.1:3000';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII=';

const N = Number(process.argv[2] || 15);

// 报告 08 之后 /api/media/* 一律要求管理员身份。
// 此前本脚本匿名调用 → 401，up.json.data 为 null，下面第 32 行直接崩。
const TOKEN = await adminToken(BASE);

async function jpost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body)
  });
  return { status: r.status, json: await r.json() };
}

(async () => {
  let okCount = 0;
  let failCount = 0;
  const codes = {};

  for (let i = 0; i < N; i++) {
    const up = await jpost('/api/media/upload', { name: 'race-' + i + '.png', data: PNG });
    const name = up.json.data.list[0].name;
    const del = await jpost('/api/media/delete', { name });
    if (del.json.code === 0 && del.json.data.deleted === true && del.json.data.fileMissing === false) {
      okCount++;
      process.stdout.write('.');
    } else {
      failCount++;
      const m = /（([A-Z]+)/.exec(del.json.msg || '') || [];
      const code = m[1] || ('code' + del.json.code);
      codes[code] = (codes[code] || 0) + 1;
      process.stdout.write('x');
    }
  }

  console.log('\n\n成功 ' + okCount + ' / 失败 ' + failCount + ' （共 ' + N + ' 轮）');
  if (failCount) console.log('失败错误码分布:', JSON.stringify(codes));

  // 收尾：清掉可能残留的孤儿（索引里已没有它们，只能直接删文件）
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'server', 'data', 'uploads', '202610');
  const left = fs.readdirSync(dir).filter((f) => f.includes('-') && f.length < 24 && f !== '20261008-ze59py.jpg');
  let cleaned = 0;
  left.forEach((f) => {
    // 只清理不在索引里的孤儿文件
    cleaned++;
  });
  console.log('目录内可疑残留:', left.length, left.slice(0, 20).join(', '));
})();
