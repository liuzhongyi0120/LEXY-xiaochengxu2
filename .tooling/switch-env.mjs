#!/usr/bin/env node
/**
 * 切换小程序端的后端地址（改 `miniprogram/utils/constants.js` 一处 + 同步文件头注释）。
 *
 * 用法：
 *   node .tooling/switch-env.mjs --url=https://mall.lexy.cn/mall-api
 *   node .tooling/switch-env.mjs --url=https://mall.lexy.cn/mall-api --env=server
 *   node .tooling/switch-env.mjs --show          # 只看当前值，不改
 *
 * 为什么要有脚本，而不是手改一行：
 *   ① 同一个「线上地址」在这个文件里出现**三处**：
 *        第 29 行 `BASE_URL_MAP.server` 的值、
 *        第 7 行注释「连云服务器（腾讯云 CVM 14.103.50.137）」、
 *        第 18 行注释「14.103.50.137 是 IP 不是域名，必然临时关校验」。
 *      只要漏一处，后人读注释就会被误导 —— 尤其第 18 行，换域名后它**是错的**
 *      （会让人以为正式版也要关域名校验）。手改必漏，所以交给脚本一次改全。
 *   ② 改完必须能立刻验证「真的生效」：脚本会 require 一次 constants.js 把 ENV / BASE_URL 打出来。
 *   ③ 换域名是个**高频回滚动作**（出问题要马上切回 IP），一条命令比手改稳。
 *   ④ 最后还有一道闸：**文件里不许残留旧主机**（任何一处漏改 → 拒绝写入，退出码 1）。
 *
 * 只动 constants.js，不碰任何业务代码；退出码 1 = 参数不对或改完自检不过。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'miniprogram', 'utils', 'constants.js');
const require_ = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const arg = (n) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return '';
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
};

const show = argv.includes('--show');
const url = arg('url').trim();
const envName = arg('env').trim() || 'server';

function current() {
  const m = require_(FILE);
  return { ENV: m.ENV, BASE_URL: m.BASE_URL };
}

if (show || !url) {
  const c = current();
  console.log('当前：ENV = ' + c.ENV);
  console.log('      BASE_URL = ' + (c.BASE_URL || '(空)'));
  if (!url) {
    console.log('\n（只想看就加 --show；要切换请给 --url=https://你的域名/mall-api）');
    process.exit(show ? 0 : 1);
  }
}

/* ── 参数校验：宁可报错，也不要写进一个必然被微信拒的地址 ── */
if (!/^https:\/\//.test(url)) {
  console.error('[x] 必须是 https:// 开头（微信服务器域名要求 HTTPS）：' + url);
  process.exit(1);
}
const host = url.replace(/^https:\/\//, '').split('/')[0];
if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
  console.error(
    '[x] 这是 IP（' + host + '），微信「服务器域名」不接受 IP —— 换域名再来。\n' +
    '    真要临时切回 IP 链路，请手改 constants.js（并在知会里写明「仅供开发者工具/体验版联调」）。'
  );
  process.exit(1);
}
if (!/\/mall-api$/.test(url)) {
  console.error(
    '[x] 地址必须以 /mall-api 结尾（nginx 靠这个前缀剥掉再转发）：' + url + '\n' +
    '    正确写法：https://' + host + '/mall-api'
  );
  process.exit(1);
}

const src = readFileSync(FILE, 'utf8');
const before = current();

/* ① ENV
 * ⚠️ 这里必须**先测模式在不在**，不能靠「replace 之后字符串没变」反推「没找到」——
 *    当 ENV 本来就是目标值（如都是 server）时，replace 后字符串必然相同，
 *    那样会把「无需改动」误报成「结构变了」。实测踩过一次。 */
const envRe = /^const ENV = '[^']*';/m;
if (!envRe.test(src)) {
  console.error('[x] 没找到 `const ENV = ...;` —— constants.js 结构变了，先人工看一眼');
  process.exit(1);
}
let out = src.replace(envRe, `const ENV = '${envName}';`);

/* ② BASE_URL_MAP 里那一档 */
const mapRe = new RegExp(`(\\b${envName}:\\s*')[^']*(')`);
if (!mapRe.test(out)) {
  console.error('[x] BASE_URL_MAP 里没有 `' + envName + '` 这一档');
  process.exit(1);
}
out = out.replace(mapRe, `$1${url}$2`);

/* ③ 文件头注释里那句「连云服务器（…）」—— 不改就会误导后人 */
out = out.replace(
  /(^ \* +server —— 连云服务器（)[^）]*(）)/m,
  `$1${host}$2`
);

/* ④ 文件头「联调前置 2)」那段。
 *    原文写「14.103.50.137 是 IP 不是域名，**必须临时关校验**」—— 那是 IP 时代的结论。
 *    换成已备案域名并在 mp 后台配好 request 合法域名之后，这句就**是错的**，
 *    读注释的人会以为正式版也得关校验。整段重写，别只改数字。
 *    （锚点用后一行「⚠️ 图片地址由…」，非贪婪匹配到它为止 → 天然幂等，
 *      因为重写后的文本同样以「 *   2) 微信开发者工具」开头。） */
const preRe = /( \*   2\) 微信开发者工具[\s\S]*?)(?= \* ⚠️ 图片地址)/;
if (!preRe.test(out)) {
  console.error('[x] 没找到文件头「联调前置 2)」段 —— constants.js 结构变了，先人工看一眼');
  process.exit(1);
}
out = out.replace(
  preRe,
  ' *   2) 微信开发者工具 → 详情 → 本地设置 → 勾选\n' +
  ' *      「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」\n' +
  ' *      （联调期勾上更省事；但**正式版不需要它** —— BASE_URL 主机 ' + host + '\n' +
  ' *       已在 mp 后台「开发设置 → 服务器域名」配好 request 合法域名，\n' +
  ' *       模拟器与真机都直连即可，真机也无需开「胶囊 → 开发调试」）\n' +
  ' *\n'   /* ← 保留原文里那行空注释（分隔「联调前置」与下方 ⚠️ 段），别顺手删掉 */
);

/* ⑤ 最后一道闸：文件里**不许残留旧主机**。
 *    上面 ②③④ 是按已知的三处逐个替换的 —— 万一以后有人在别处又写了一句旧地址
 *    （新注释、示例、TODO），逐个替换必漏。这里直接全文检，命中就**拒绝写入**（原子性）。 */
const oldHost = String(before.BASE_URL || '').replace(/^https?:\/\//, '').split('/')[0];
if (oldHost && oldHost !== host && out.includes(oldHost)) {
  console.error(
    '[x] 改完文件里仍残留旧主机 ' + oldHost + ' —— 说明有新位置没跟着改（脚本已放弃写入，文件保持原样）。\n' +
    '    全库搜一下：grep -rn "' + oldHost + '" miniprogram/'
  );
  process.exit(1);
}

if (out === src) {
  console.log('已经是这个地址了，无需改动：' + url);
} else {
  writeFileSync(FILE, out, 'utf8');
  console.log('已改：miniprogram/utils/constants.js');
}

/* ── 自检：真的读得回来才算数 ── */
delete require_.cache[require_.resolve(FILE)];
const after = current();
const okEnv = after.ENV === envName;
const okUrl = after.BASE_URL === url;
console.log('  改前：ENV=' + before.ENV + '  BASE_URL=' + (before.BASE_URL || '(空)'));
console.log('  改后：ENV=' + after.ENV + '  BASE_URL=' + after.BASE_URL);
if (!okEnv || !okUrl) {
  console.error('[x] 改完读回来的值和期望不一致（ENV 对了=' + okEnv + '，URL 对了=' + okUrl + '）');
  process.exit(1);
}

console.log('\n下一步：');
console.log('  1) node .tooling/preflight-wechat.mjs        # 重新体检（会真打一次新域名的 /api/health）');
console.log('  2) node server/tools/check-all.mjs           # 门禁（有断言依赖 BASE_URL，确认没被改坏）');
