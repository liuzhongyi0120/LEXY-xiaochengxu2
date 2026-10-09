/**
 * 页面黑屏诊断器（零依赖，直连 CDP）
 *
 * 与 ui-shot.mjs 的区别：**在导航之前**注入错误收集器，
 * 因此能捕获「脚本一开始就抛错 → 整页不渲染」这类问题（ui-shot 的 --eval 跑在导航之后，抓不到）。
 *
 * 用法：node .tooling/diag-page.mjs <url> [--w 1440] [--h 900] [--wait 2500] [--hash <#media>]
 * 输出：JS 异常 / console.error / 失败请求（含状态码与资源 URL）/ DOM 概况
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Users/8274282/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/headless_shell.exe'
];

const argv = process.argv.slice(2);
const opt = { w: 1440, h: 900, wait: 2500, hash: '' };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--w') opt.w = Number(argv[++i]);
  else if (a === '--h') opt.h = Number(argv[++i]);
  else if (a === '--wait') opt.wait = Number(argv[++i]);
  else if (a === '--hash') opt.hash = argv[++i];
  else positional.push(a);
}
const url = positional[0];
if (!url) { console.error('用法: node .tooling/diag-page.mjs <url>'); process.exit(2); }

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('未找到 chrome-headless-shell'); process.exit(2); }

const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'diagprof-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=' + opt.w + ',' + opt.h, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 未就绪 */ }
    await sleep(120);
  }
  throw new Error('连接 chrome 调试端口超时');
}

let ws, msgId = 0;
const pending = new Map();
const errors = [], consoleErrs = [], failedReqs = [], allReqs = [];

function send(method, params) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function cleanup(code) {
  try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  try { child.kill(); } catch (e) { /* ignore */ }
  process.exit(code);
}

(async () => {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      return;
    }
    // 事件
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrs.push(m.params.args.map((a) => a.value || a.description || a.type).join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrs.push('[log] ' + m.params.entry.text + ' @' + (m.params.entry.url || ''));
    } else if (m.method === 'Network.loadingFailed') {
      failedReqs.push({ id: m.params.requestId, err: m.params.errorText, type: m.params.type });
    } else if (m.method === 'Network.responseReceived') {
      const r = m.params.response;
      allReqs.push({ id: m.params.requestId, status: r.status, url: r.url, mime: r.mimeType });
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  // 关键：导航前注入
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: [
      'window.__errs=[];',
      'window.addEventListener("error",function(e){window.__errs.push("ERR: "+(e.message||"")+" @"+(e.filename||"")+":"+(e.lineno||0));},true);',
      'window.addEventListener("unhandledrejection",function(e){window.__errs.push("REJ: "+((e.reason&&(e.reason.stack||e.reason.message))||e.reason));});'
    ].join('\n')
  });
  await send('Emulation.setDeviceMetricsOverride', { width: opt.w, height: opt.h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(opt.wait);
  if (opt.hash) {
    await send('Runtime.evaluate', { expression: 'location.hash=' + JSON.stringify(opt.hash) });
    await sleep(1500);
  }

  const probe = `(()=>{const R={};
    R.readyState=document.readyState;
    R.hash=location.hash;
    R.title=document.title;
    R.bodyTextLen=(document.body.innerText||'').length;
    R.bodyTextHead=(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,180);
    R.bodyBg=getComputedStyle(document.body).backgroundColor;
    R.bodyColor=getComputedStyle(document.body).color;
    R.scripts=[...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));
    R.globals={App:typeof App,Modules:typeof MODULES,console:typeof CONSOLE,API:typeof API,api:typeof api};
    R.injectedErrors=(window.__errs||[]).slice(0,20);
    const nav=document.querySelector('aside,.side,.nav,.sidebar');R.navFound=!!nav;
    const main=document.querySelector('main,.main,#main,.content,#content');
    R.mainFound=!!main; R.mainHTMLlen=main?main.innerHTML.length:0;
    R.visibleEls=document.querySelectorAll('body *').length;
    R.failedRes=[...document.querySelectorAll('img,script,link')].filter(el=>{
      if(el.tagName==='IMG')return el.complete&&el.naturalWidth===0;
      return false;}).map(el=>el.getAttribute('src')).slice(0,10);
    R.res=LINKFAIL_PLACEHOLDER;
    return JSON.stringify(R,null,1);})()`;

  const res = await send('Runtime.evaluate', { expression: probe.replace('LINKFAIL_PLACEHOLDER', 'null'), returnByValue: true });
  console.log('===== DOM 概况 =====');
  console.log(res.result && res.result.value);

  console.log('\n===== 未捕获 JS 异常（导航后）=====');
  console.log(errors.length ? errors.join('\n---\n') : '(无)');

  console.log('\n===== console.error / 浏览器日志错误 =====');
  console.log(consoleErrs.length ? consoleErrs.join('\n---\n') : '(无)');

  console.log('\n===== 请求失败（网络层）=====');
  console.log(failedReqs.length ? JSON.stringify(failedReqs, null, 1) : '(无)');

  console.log('\n===== 非 2xx / 3xx 响应 =====');
  const bad = allReqs.filter((r) => r.status >= 400 || r.status === 0);
  console.log(bad.length ? JSON.stringify(bad, null, 1) : '(无)');

  console.log('\n===== 全部请求 =====');
  console.log(allReqs.map((r) => r.status + ' ' + r.url).join('\n'));

  cleanup(0);
})().catch((e) => { console.error('ERR: ' + e.message); cleanup(1); });
