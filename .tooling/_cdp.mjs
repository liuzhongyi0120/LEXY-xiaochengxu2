/* CDP 代理调用小工具（本机**没有 curl**，凡要碰 CDP 代理就用它）
 *
 * 代理地址： http://localhost:3456 （由 web-access skill 的 cdp-proxy.mjs 提供）
 * 用法：    node .tooling/_cdp.mjs <cmd> [args...]
 *
 *   targets                        列出所有标签页（id / type / title / url）
 *   new <url>                      新建标签页
 *   nav <target> <url>             让某标签页跳转
 *   info <target>                  标签页信息
 *   eval <target> <js文件>         注入执行本地 js 文件，返回其求值结果
 *   shot <target> <png>            截图到本地文件
 *   click <target> <css选择器>     点击元素
 *   scroll <target> [bottom|top]   滚动
 *   close <target>                 关闭标签页（**卡死的标签页用这个救**）
 *   raw <route> [target] [body]    直连任意代理路由；body 以 @ 开头 = 读本地文件
 *
 * ⚠️ 装修台有未保存改动时**不要**点「返回列表 / reload」—— 浏览器原生「离开？」弹窗会
 *    把整个标签页挂住，连 eval 都会超时；改用 close 关掉它、另开新标签页继续。
 */
const P = 'http://localhost:3456';
const [, , cmd, ...rest] = process.argv;

async function j(url, opt) {
  const r = await fetch(P + url, opt);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}

const show = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 1));

switch (cmd) {
  case 'targets': {
    const list = await j('/targets');
    (list.targets || list || []).forEach((t) => {
      console.log(t.id ? `${t.id}  ${t.type || ''}  ${t.title || ''}  ${t.url || ''}` : JSON.stringify(t));
    });
    break;
  }
  case 'new': {
    show(await j('/new', { method: 'POST', body: rest[0] }));
    break;
  }
  case 'nav': {
    show(await j('/navigate?target=' + rest[0], { method: 'POST', body: rest[1] }));
    break;
  }
  case 'info': {
    show(await j('/info?target=' + rest[0]));
    break;
  }
  case 'eval': {
    const fs = await import('node:fs');
    const js = fs.readFileSync(rest[1], 'utf8');
    show(await j('/eval?target=' + rest[0], { method: 'POST', body: js }));
    break;
  }
  case 'shot': {
    show(await j('/screenshot?target=' + rest[0] + '&file=' + encodeURIComponent(rest[1])));
    break;
  }
  case 'click': {
    show(await j('/click?target=' + rest[0], { method: 'POST', body: rest[1] }));
    break;
  }
  case 'scroll': {
    show(await j('/scroll?target=' + rest[0] + '&direction=' + (rest[1] || 'bottom')));
    break;
  }
  case 'close': {
    show(await j('/close?target=' + rest[0]));
    break;
  }
  /* 直连任意代理路由 —— 代理新增路由时不必再改本文件。
     body 以 @ 开头视为本地文件路径（便于传长 JS）。 */
  case 'raw': {
    const fs = await import('node:fs');
    const route = rest[0] || '';
    const target = rest[1];
    let body = rest[2];
    if (body && body.startsWith('@')) body = fs.readFileSync(body.slice(1), 'utf8');
    let url = '/' + route;
    if (target) url += (url.includes('?') ? '&' : '?') + 'target=' + encodeURIComponent(target);
    const opt = (body !== undefined && body !== '') ? { method: 'POST', body } : undefined;
    show(await j(url, opt));
    break;
  }
  default:
    console.log('unknown cmd');
}
