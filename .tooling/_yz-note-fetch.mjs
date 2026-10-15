/**
 * 有赞店铺笔记正文抓取（需用户先在带界面 Chrome 里登录）
 *
 * 前置：
 *   chrome.exe --remote-debugging-port=9223 --user-data-dir=... <有赞笔记详情页>
 *   （端口见 PORT；登录页会跳 passport.youzan.com，用户扫码/验证码登一下）
 *
 * 行为：
 *   1. 连 9223 找页面 target；
 *   2. 轮询检测登录（URL 离开 passport.youzan.com 即视为已登录），最长等 WAIT_MIN 分钟；
 *   3. 逐个导航到 noteAlias 详情页，抓「标题 / 正文 HTML / 纯文本 / 图片」；
 *   4. 落盘 .tooling/_yz-notes-content.json，每抓一篇就写一次（中断也不丢）。
 *
 * 用法： node .tooling/_yz-note-fetch.mjs            # 全量
 *        node .tooling/_yz-note-fetch.mjs 3          # 只抓前 3 篇（探查用）
 */
import fs from 'node:fs';

const PORT = 9223;
const WAIT_MIN = 20;
const OUT = '.tooling/_yz-notes-content.json';
const LIMIT = Number(process.argv[2] || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 极简 CDP 客户端（Node 内置 WebSocket） ---------- */
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

/* ---------- 抓一篇笔记的正文 ---------- */
const EXTRACT = `
(() => {
  const out = { url: location.href, title: document.title, text: '', html: '', imgs: [] };
  // 正文容器：优先找能装下大段内容的最大文本块
  let best = null, bestLen = 0;
  document.querySelectorAll('div,article,section').forEach((el) => {
    const t = (el.innerText || '').trim();
    if (t.length > bestLen && el.querySelectorAll('img').length >= 0) { bestLen = t.length; best = el; }
  });
  const root = best || document.body;
  out.text = (root.innerText || '').trim().slice(0, 20000);
  out.html = (root.innerHTML || '').slice(0, 60000);
  root.querySelectorAll('img').forEach((im) => {
    const src = im.currentSrc || im.src || im.getAttribute('data-src') || '';
    if (src && src.indexOf('data:') !== 0) out.imgs.push(src);
  });
  // 笔记标题：h1 / 大号文本
  const h = document.querySelector('h1,h2');
  out.head = h ? (h.innerText || '').trim() : '';
  return out;
})()
`;

async function main() {
  const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('9223 上没找到页面 target（Chrome 没起来？）');
  const cdp = await CDP.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  /* ---- 等登录 ---- */
  console.log('等待登录（最长 ' + WAIT_MIN + ' 分钟）…');
  const deadline = Date.now() + WAIT_MIN * 60 * 1000;
  let logged = false;
  while (Date.now() < deadline) {
    const href = await cdp.eval('location.href').catch(() => '');
    if (href && href.indexOf('passport.youzan.com') < 0 && href.indexOf('/login') < 0) {
      logged = true;
      console.log('已登录 → ' + href);
      break;
    }
    process.stdout.write('.');
    await sleep(3000);
  }
  if (!logged) { console.log('\n超时未登录，退出'); cdp.close(); process.exit(2); }

  /* ---- 抓 ---- */
  const map = JSON.parse(fs.readFileSync('.tooling/_yz-note-map.json', 'utf8'));
  const jobs = [];
  const seen = new Set();
  for (const key of ['p296', 'p299']) {
    (map[key] || []).forEach((x) => {
      if (!x.alias || seen.has(x.alias)) return;
      seen.add(x.alias);
      jobs.push({ alias: x.alias, sampleTitle: x.title });
    });
  }
  const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
  console.log('待抓 ' + todo.length + ' 篇（唯一 alias）');

  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { notes: {} };
  if (!out.notes) out.notes = {};

  for (let i = 0; i < todo.length; i++) {
    const j = todo[i];
    const url = 'https://shop44567186.youzan.com/wscshop/shopnote/detail?noteAlias=' + j.alias;
    try {
      await cdp.nav(url);
      await sleep(3800);
      const d = await cdp.eval(EXTRACT);
      out.notes[j.alias] = {
        alias: j.alias,
        sampleTitle: j.sampleTitle,
        head: d.head || '',
        title: d.title || '',
        text: d.text || '',
        html: d.html || '',
        imgs: d.imgs || [],
        fetchedAt: new Date().toISOString()
      };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
      console.log('[' + (i + 1) + '/' + todo.length + '] ' + j.alias +
        '  text=' + (d.text || '').length + ' imgs=' + (d.imgs || []).length +
        '  head=' + JSON.stringify((d.head || '').slice(0, 30)));
    } catch (e) {
      console.log('[' + (i + 1) + '/' + todo.length + '] ' + j.alias + '  ERROR ' + e.message);
      out.notes[j.alias] = { alias: j.alias, sampleTitle: j.sampleTitle, error: e.message };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
    }
  }
  cdp.close();
  console.log('\n完成，写入 ' + OUT + '（' + Object.keys(out.notes).length + ' 篇）');
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
