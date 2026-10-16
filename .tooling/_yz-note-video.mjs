/**
 * 有赞「视频笔记」的正文 = 一支视频（没有图文），把视频抓回本机再挂成视频区块
 *
 * 为什么必须转存：有赞视频地址是 `mps-trans.yzcdn.cn/...mp4?sign=<动态>&t=<动态>`，
 *   **签名会过期**（schema.js 里那句提示就是这么写的）—— 直接把外链写进数据，
 *   过一阵真机上就播不了；必须下载重传到本机 /uploads。
 *
 * 为什么不用已有的 `.tooling/yz-fetch-videos.mjs`：那个走 3456 无头代理 + 直接
 *   `media.upload()` 写文件；服务在跑的时候直接写数据文件会被内存态覆盖（铁律 16），
 *   所以这里改用 9223 + HTTP 上传接口。
 *
 * 用法：
 *   node .tooling/_yz-note-video.mjs           # 采集：读出 16 篇的 mp4/封面地址 → _yz-note-videos.json
 *   node .tooling/_yz-note-video.mjs --apply   # 下载重传 + 给笔记挂视频区块 + 生成代码
 */
import fs from 'node:fs';

const PORT = 9223;
const APPLY = process.argv.includes('--apply');
const OUT = '.tooling/_yz-note-videos.json';
const CONTENT = '.tooling/_yz-notes-content.json';
const IDS = '.tooling/_yz-note-ids.json';
const TOK = fs.readFileSync('.tooling/_tok.txt', 'utf8').trim();
const B = 'http://127.0.0.1:3000';
const H = { Authorization: 'Bearer ' + TOK };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const REFERER = 'https://shop46010558.youzan.com/';

/* ---------------- CDP ---------------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && c.pending.has(m.id)) { c.pending.get(m.id)(m); c.pending.delete(m.id); }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(js) {
    const r = await this.send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval exception');
    return r.result.value;
  }
  async nav(url) { await this.send('Page.navigate', { url }); }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}

/* ---------- 待处理的视频笔记 ---------- */
const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8')).notes || {};
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
const aliasToId = new Map();
for (const [mk, rec] of Object.entries(ids)) {
  if (mk.startsWith('alias:')) aliasToId.set(mk.slice(6), rec);
}
/*
 * ⚠ 筛选条件不能写成「正文为空 且 有 video 组件」：有一批笔记是
 *   `compTypes: ["rich_text","video"]` —— 图文 + 视频混排，正文非空但**同样有视频**。
 *   按「正文为空」筛会漏掉 12 篇（实测共 28 篇带视频，第一次只抓到 16 篇）。
 */
const videoAliases = Object.keys(content).filter((a) => {
  const c = content[a];
  return c && (c.compTypes || []).indexOf('video') >= 0 && aliasToId.has(a);
});
console.log('视频笔记：' + videoAliases.length + ' 篇');

/* ---------------- 阶段一：采集地址 ---------------- */
const PICK = `(() => {
  const v = document.querySelector('video');
  const g = window._global || {};
  // ⚠ 视频组件**不一定是第 0 个**：混排笔记是 ["rich_text","video"]，取 c0 拿到的是
  //   富文本组件，cover 宽高全是 0 → 高度会退回默认 420rpx（比例不对会拉伸）。
  const c0 = ((g.featureComponents || []).find(function(c){ return c && c.type === 'video'; })
           || (g.featureComponents || [])[0] || {});
  const vd = c0.video || {};
  if (!v) return JSON.stringify({ ready: false, why: 'no-video-el' });
  const src = v.currentSrc || v.src || '';
  if (!src) return JSON.stringify({ ready: false, why: 'no-src' });
  return JSON.stringify({
    ready: true, src,
    poster: v.poster || vd.cover_url || '',
    w: Number(vd.cover_width || 0), h: Number(vd.cover_height || 0),
    name: vd.video_name || '', dur: Number(vd.video_duration || 0), size: Number(vd.video_size || 0),
    title: ((g.noteData || {}).title || '').trim()
  });
})()`;

async function collect() {
  const j = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = j.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('9223 上没有页面 target');
  const cdp = await CDP.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  for (let i = 0; i < videoAliases.length; i++) {
    const a = videoAliases[i];
    if (out[a] && out[a].src) { console.log(`[${i + 1}/${videoAliases.length}] ${a} 已采集，跳过`); continue; }
    await cdp.nav(`https://shop44567186.youzan.com/wscshop/shopnote/detail?noteAlias=${a}`);
    let d = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const raw = await cdp.eval(PICK).catch(() => '{"ready":false,"why":"eval-err"}');
      d = JSON.parse(raw);
      if (d.ready) break;
      await sleep(1500);
    }
    if (!d || !d.ready) { console.log(`[${i + 1}/${videoAliases.length}] ${a}  ✗ ${(d && d.why) || '超时'}`); out[a] = { error: (d && d.why) || 'timeout' }; }
    else {
      out[a] = d;
      console.log(`[${i + 1}/${videoAliases.length}] ${a}  ${(d.size / 1048576).toFixed(1)}MB / ${d.dur}s  ${JSON.stringify(d.title.slice(0, 20))}`);
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
  }
  cdp.close();
  console.log('\n采集完成 → ' + OUT);
}

/* ---------------- 阶段二：下载重传 + 挂区块 ---------------- */
async function uploadFile(url, folder, fallbackName) {
  const r = await fetch(url, { headers: { Referer: REFERER, 'User-Agent': UA } });
  if (!r.ok) return { url: '', why: 'HTTP ' + r.status };
  const buf = Buffer.from(await r.arrayBuffer());
  const isVideo = /\.mp4/i.test(url.split('?')[0]);
  const cap = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
  if (buf.length > cap) return { url: '', why: '超过 ' + cap / 1048576 + 'MB（实际 ' + (buf.length / 1048576).toFixed(1) + 'MB）' };
  const fd = new FormData();
  fd.append('file', new Blob([buf]), fallbackName);
  const up = await fetch(B + '/api/media/upload?folder=' + encodeURIComponent(folder), { method: 'POST', headers: H, body: fd }).then((x) => x.json());
  const got = (up.data && up.data.list && up.data.list[0] && up.data.list[0].url) || '';
  return { url: got, why: got ? '' : JSON.stringify(up).slice(0, 120), size: buf.length };
}

const postJson = async (p, body) => (await (await fetch(B + p, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}))).json();
const get = async (p) => (await (await fetch(B + p, { headers: H }))).json();

async function apply() {
  const vids = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  let ok = 0, fail = 0;
  const items = Object.entries(vids).filter(([, v]) => v && v.src);
  for (let i = 0; i < items.length; i++) {
    const [alias, v] = items[i];
    const rec = aliasToId.get(alias);
    const key = 'note-' + rec.id;
    const cur = await get('/api/decorate/page?key=' + key);
    const data = JSON.parse(JSON.stringify(cur.data.data || {}));
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    if (blocks.some((b) => b && b.type === 'video')) { console.log(`  · ${key} 已有视频区块，跳过`); continue; }

    const vid = await uploadFile(v.src, '有赞笔记视频', 'note-' + rec.id + '.mp4');
    if (!vid.url) { console.log(`  ✗ ${key} 视频入库失败：${vid.why}`); fail++; continue; }
    let poster = '';
    if (v.poster) {
      const p = await uploadFile(v.poster, '有赞笔记视频', 'note-' + rec.id + '-poster.jpg');
      poster = p.url || '';
    }
    // 封面 1080×1440 → 750 宽基准下的 rpx 高度（与 schema 的 height 单位一致）
    const height = (v.w && v.h) ? Math.min(1600, Math.round(750 * v.h / v.w)) : 420;
    blocks.push({ type: 'video', height, poster, src: vid.url });
    data.blocks = blocks;

    const d = await postJson('/api/decorate/draft', { key, data });
    if (d.code !== 0) { console.log(`  ✗ draft ${key} → ${JSON.stringify(d).slice(0, 140)}`); fail++; continue; }
    const pb = await postJson('/api/decorate/publish', { key, note: '回填有赞笔记视频' });
    if (pb.code !== 0) { console.log(`  ✗ publish ${key} → ${JSON.stringify(pb).slice(0, 140)}`); fail++; continue; }
    console.log(`  ✓ #${i + 1} ${key}  视频 ${(vid.size / 1048576).toFixed(1)}MB  高度 ${height}rpx  封面 ${poster ? '✓' : '—'}  ${rec.title}`);
    ok++;
  }
  console.log(`\n完成：成功 ${ok} / 失败 ${fail}`);
}

if (APPLY) await apply(); else await collect();
