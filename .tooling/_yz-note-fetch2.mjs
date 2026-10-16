/**
 * 有赞店铺笔记正文抓取 v2 —— 从页面自带的初始化数据里取，不靠 DOM 渲染
 *
 * 为什么不用 v1（_yz-note-fetch.mjs）：
 *   v1 抓 document.body.innerText，实测只有 69 字 —— 正文本体在
 *   `window._global.featureComponents[].content` 里（富文本 HTML），页面还可能被
 *   有赞风控的「请完成安全验证」滑块挡住不渲染。**判据选错层 = 永远抓不到**。
 *
 * 行为：
 *   1. 连 9223 找一个页面 target；
 *   2. 逐个 alias 导航到笔记详情页；
 *   3. 轮询等 `window._global.noteAlias === alias`（waitFor，不睡死等）；
 *   4. 取 featureComponents 的 content + noteData；
 *   5. 每篇落一次盘，中断不丢。
 *
 * 安全：只读，绝不点「存至草稿 / 立即发布」；遇到风控滑块**停下如实上报**，不硬闯不重试。
 *
 * 用法： node .tooling/_yz-note-fetch2.mjs [条数] [shopId]
 */
import fs from 'node:fs';

const PORT = 9223;
const OUT = '.tooling/_yz-notes-content.json';
const LIMIT = Number(process.argv[2] || 0);
const SHOP = process.argv[3] || '44567186';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 极简 CDP ---------- */
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

/* ---------- 判定页面是否就绪（waitFor，不固定 sleep） ----------
 * ⚠ 不能用 alias 判「是不是这一篇」：实测 shop44567186?noteAlias=<A> 会重定向到
 *   shop46010558?noteAlias=<B>（同一篇笔记，alias 与店号都被规范化）→ 判 alias 会永远 stale。
 *   改用「标题对得上」，顺带能抓出「重定向到了别的笔记」。 */
const READY = (alias) => `(function(){
  var g = window._global;
  if (!g) return 'no-global';
  var t = (document.body && document.body.innerText || '');
  if (t.indexOf('请完成安全验证') >= 0) return 'riskctl';
  var nd = g.noteData || {};
  if (!g.featureComponents && !nd.title) return 'no-data';
  return 'ok';
})()`;

/* ---------- 抽正文 ---------- */
const EXTRACT = `(function(){
  var g = window._global || {};
  var comps = g.featureComponents || [];
  var html = comps.map(function(c){ return c.content || ''; }).join('\\n');
  var nd = g.noteData || {};
  var imgs = [];
  (html.match(/(https?:[^"'\\s\\\\)]+?\\.(?:jpg|jpeg|png|gif|webp))/gi) || []).forEach(function(u){ if (imgs.indexOf(u) < 0) imgs.push(u); });
  var text = html.replace(/<[^>]+>/g, '\\n').replace(/&nbsp;/g, ' ').replace(/\\n{2,}/g, '\\n').trim();
  return JSON.stringify({
    realAlias: g.noteAlias || '',
    realHref: location.href,
    kdtId: g.kdt_id || '',
    compCount: comps.length,
    compTypes: comps.map(function(c){ return c.type || c.name || ''; }),
    htmlLen: html.length,
    textLen: text.length,
    html: html.slice(0, 200000),
    text: text.slice(0, 20000),
    imgs: imgs,
    noteData: { title: nd.title || '', summary: nd.summary || '', cover: (nd.coverImage || nd.cover || nd.image || '') }
  });
})()`;

async function main() {
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('9223 上没找到页面 target（Chrome 没起来？）');
  const cdp = await CDP.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const map = JSON.parse(fs.readFileSync('.tooling/_yz-note-map.json', 'utf8'));
  const seen = new Set();
  const jobs = [];
  for (const key of ['p296', 'p299']) {
    (map[key] || []).forEach((x) => {
      if (!x.alias || seen.has(x.alias)) return;
      seen.add(x.alias);
      jobs.push({ alias: x.alias, sampleTitle: x.title, yzTitle: x.yzTitle || x.title });
    });
  }
  const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
  console.log(`待抓 ${todo.length} 篇（唯一 alias），shop=${SHOP}`);

  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { shop: SHOP, notes: {} };
  if (!out.notes) out.notes = {};
  out.shop = SHOP;

  let riskStop = false;
  for (let i = 0; i < todo.length; i++) {
    const j = todo[i];
    const url = `https://shop${SHOP}.youzan.com/wscshop/shopnote/detail?noteAlias=${j.alias}`;
    try {
      await cdp.nav(url);
      let state = '';
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        state = await cdp.eval(READY(j.alias)).catch(() => 'eval-err');
        if (state === 'ok' || state === 'riskctl') break;
        await sleep(700);
      }
      if (state === 'riskctl') {
        console.log(`[${i + 1}/${todo.length}] ${j.alias}  ⚠ 触发有赞风控滑块 → 停下，需人工拖一下`);
        riskStop = true;
        break;
      }
      if (state !== 'ok') {
        console.log(`[${i + 1}/${todo.length}] ${j.alias}  未就绪(${state})`);
        out.notes[j.alias] = { alias: j.alias, sampleTitle: j.sampleTitle, error: 'not-ready:' + state };
        fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
        continue;
      }
      const d = JSON.parse(await cdp.eval(EXTRACT));
      const realTitle = (d.noteData.title || '').trim();
      const matched = realTitle === String(j.yzTitle || '').trim();
      out.notes[j.alias] = {
        alias: j.alias, sampleTitle: j.sampleTitle, yzTitle: j.yzTitle,
        titleMatched: matched, ...d, fetchedAt: new Date().toISOString()
      };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
      console.log(`[${i + 1}/${todo.length}] ${j.alias}  html=${d.htmlLen} text=${d.textLen} imgs=${d.imgs.length} ${matched ? '✓' : '⚠标题不符'}  ${JSON.stringify(realTitle.slice(0, 24))}`);
    } catch (e) {
      console.log(`[${i + 1}/${todo.length}] ${j.alias}  ERROR ${e.message}`);
      out.notes[j.alias] = { alias: j.alias, sampleTitle: j.sampleTitle, error: e.message };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
    }
  }
  cdp.close();
  const ok = Object.values(out.notes).filter((n) => n && n.htmlLen > 0).length;
  console.log(`\n完成：${Object.keys(out.notes).length} 条记录，其中 ${ok} 条有正文 → ${OUT}`);
  if (riskStop) { console.log('⚠ 因风控滑块提前停止，未抓完'); process.exitCode = 3; }
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
