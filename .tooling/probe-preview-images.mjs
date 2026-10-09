/*
 * 预览页体检：依次切 5 个页面，统计图片加载情况。
 * 注意两点（都踩过）：
 *   1. 本文件会被 ui-shot 包进 (async()=>{ ... })() 执行，必须**显式 return**；
 *   2. /preview **不读 URL 参数**，切页靠点左栏按钮 —— 想验别的页必须在这里点。
 *
 * 关键指标是 broken（complete 且 naturalWidth 为 0，即真的没加载出来）。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srcOf = (i) => i.getAttribute('src') || i.getAttribute('data-src') || '';
const isRemote = (u) => /^https?:\/\//.test(u) && !/^https?:\/\/127\.0\.0\.1/.test(u);

await sleep(2500);
const keys = ['home', 'lexy', 'news', 'product', 'mine'];
const out = [];

for (const k of keys) {
  const btn = document.querySelector('.pv-item[data-key="' + k + '"]');
  if (!btn) { out.push({ key: k, err: '左栏没有该入口' }); continue; }
  btn.click();
  await sleep(1800);
  // 滚到底触发懒加载
  for (let i = 0; i < 10; i++) { window.scrollBy(0, window.innerHeight); await sleep(220); }
  window.scrollTo(0, 0);
  await sleep(900);

  const imgs = [...document.querySelectorAll('img')];
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
  const pending = imgs.filter((i) => !i.complete);
  const local = imgs.filter((i) => /\/uploads\//.test(srcOf(i)));
  const remote = imgs.filter((i) => isRemote(srcOf(i)));
  const vids = [...document.querySelectorAll('video')];

  out.push({
    key: k,
    imgs: imgs.length,
    localImgs: local.length,
    remoteImgs: remote.length,
    broken: broken.length,
    pending: pending.length,
    videos: vids.length,
    localVideos: vids.filter((v) => /\/uploads\//.test(v.getAttribute('src') || '')).length,
    brokenSrcs: broken.slice(0, 4).map(srcOf),
    remoteSrcs: [...new Set(remote.map(srcOf))].slice(0, 4)
  });
}

return JSON.stringify(out);
