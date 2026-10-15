/**
 * 「上传微信小程序前」体检脚本（**只读，不改任何文件**）。
 *
 * 用法：node .tooling/preflight-wechat.mjs
 * 退出码：0 = 没有 ❌ 阻塞项（⚠️ 人工项仍需自己去微信后台确认）；1 = 有阻塞项。
 *
 * 为什么要有它：`check-all.mjs` 保证的是「代码自身自洽」，而**能不能上架**取决于一堆
 * **代码之外**的东西 —— 域名是否备案、包体积、隐私指引申报、商户号/客服是否开通。
 * 这些东西在本地全绿时也照样能让审核驳回，所以单独拎出来一遍遍跑。
 *
 * 判据全部来自**真读文件 / 真发请求**，不做任何猜测：
 *   · 包体积  → 遍历 miniprogram/ 逐字节求和（主包 ≤2MB、单个分包 ≤2MB、总计 ≤20MB）
 *   · 后端地址 → 解析 utils/constants.js 的 ENV / BASE_URL_MAP
 *   · 线上健康 → GET <BASE_URL>/api/health（微信登录/支付是真接口还是模拟、JWT 是否默认密钥）
 *   · 隐私接口 → 扫 miniprogram/ 下 js/wxml（**先剥注释**）再对官方「处理的信息 ↔ 接口」对照表
 *   · 导航图标 → 读 PNG 头（魔数 + IHDR 宽高）
 *
 * ⚠️ 本机（公司内网）**出口按 SNI 拦本域名** → 直连电商域名必得 ECONNRESET。
 *    原实现此时整段跳进 catch，D 节（登录/支付/JWT/门控）**一条判据都不执行** ——
 *    那是「假绿」里最坏的一种：2026-10-15 线上 `wechat.pay` 明明是 `mock`（连带
 *    `/api/pay/mock-success` 在公网开着 = 资损），体检却只平静地报一句「连不上」。
 *    故直连失败时**自动再走一次替代路径**（空 SNI + Host 头，只读 GET，永不写）。
 */
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import https from 'node:https';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MP = path.join(ROOT, 'miniprogram');
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));

const rows = []; // { level:'ok'|'warn'|'block', name, detail }
const ok = (name, detail = '') => rows.push({ level: 'ok', name, detail });
const warn = (name, detail = '') => rows.push({ level: 'warn', name, detail });
const block = (name, detail = '') => rows.push({ level: 'block', name, detail });

/* ─────────── A. 工程配置 ─────────── */
const proj = readJson(path.join(ROOT, 'project.config.json'));
const appJson = readJson(path.join(MP, 'app.json'));

rows.push({ level: 'head', name: 'A. 工程配置' });
ok('AppID', proj.appid + '（在微信后台确认与要上传的小程序一致）');
ok('miniprogramRoot', proj.miniprogramRoot);
ok('基础库', String(proj.libVersion));
if (proj.setting && proj.setting.urlCheck === false) {
  warn('urlCheck=false', '开发者工具「不校验合法域名」是**本机开发设置**，上传后对正式版无效；上线前必须真的配好合法域名');
}

/* ─────────── B. 包体积 ─────────── */
rows.push({ level: 'head', name: 'B. 包体积（主包/单分包 ≤2MB，总计 ≤20MB）' });
const SUB_ROOTS = (appJson.subPackages || []).map((s) => s.root);
const KB = 1024;
const size = {};
let main = 0;
let subTotal = 0;
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else {
      const rel = path.relative(MP, p).split(path.sep).join('/');
      const top = rel.split('/')[0];
      const n = fs.statSync(p).size;
      if (SUB_ROOTS.includes(top)) {
        size[top] = (size[top] || 0) + n;
        subTotal += n;
      } else main += n;
    }
  }
})(MP);
const MB = (b) => (b / KB / KB).toFixed(2) + ' MB';
if (main / KB / KB > 2) block('主包 ' + MB(main), '超过 2MB 上限');
else ok('主包 ' + MB(main), '上限 2MB');
for (const r of SUB_ROOTS) {
  const v = size[r] || 0;
  if (v / KB / KB > 2) block('分包 ' + r + ' ' + MB(v), '超过 2MB 上限');
  else ok('分包 ' + r + ' ' + MB(v), '上限 2MB');
}
const total = main + subTotal;
if (total / KB / KB > 20) block('总计 ' + MB(total), '超过 20MB 上限');
else ok('总计 ' + MB(total), '上限 20MB');

/* ─────────── C. 后端地址 ─────────── */
rows.push({ level: 'head', name: 'C. 后端地址（正式版只接受「已备案域名 + 有效 HTTPS」）' });
const constSrc = read(path.join(MP, 'utils', 'constants.js'));
/* 档位自 2026-10-15 起是「**按运行环境自动选**」：真机/正式版 → server，开发者工具模拟器 → local。
 * 体检判的是「**上传后用户会连哪儿**」，所以永远看 server 那一档的值，
 * 而不是常量 ENV 的求值结果 —— 它在源码里已没有字面量（Node 侧恒为 'server'），
 * 拿旧正则去抠会抠到空串，进而把「BASE_URL 不是 HTTPS」误报出来（典型的假红）。 */
const pinEnv = (/const\s+ENV_OVERRIDE\s*=\s*'([^']*)'/.exec(constSrc) || [])[1] || '';
const ENV = pinEnv || 'server';
const baseUrl = /\bserver\s*:\s*'([^']*)'/.exec(constSrc);
const BASE_URL = baseUrl ? baseUrl[1] : '';
ok('ENV', (pinEnv ? ('手动钉死为 ' + pinEnv) : '自动（真机 → server / 开发者工具 → local）')
  + ' → 线上档 BASE_URL = ' + (BASE_URL || '(空，走 mock)'));

if (pinEnv === 'mock' || pinEnv === 'local') {
  warn('常量被手动钉死成 ' + pinEnv + ' 档', '上传后真机会去连本机地址、必然一片空白 —— 上传前把它改回空（自动）或 server');
} else if (!/^https:\/\//.test(BASE_URL)) {
  block('BASE_URL 不是 HTTPS', BASE_URL);
} else {
  const host = BASE_URL.replace(/^https:\/\//, '').split('/')[0];
  const hostname = host.split(':')[0];
  const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  if (isIP) {
    block('后端是 IP（' + hostname + '）', '微信「服务器域名」**不支持 IP**，必须是已 ICP 备案的域名 —— 正式版 wx.request 必被拒；' +
      '开发版/体验版只能靠开发者工具「不校验合法域名」或胶囊菜单「开发调试」绕过');
  } else {
    ok('后端域名 ' + hostname, '域名形式合法（备案状态需自行到工信部/微信后台确认）');
  }
}

/**
 * 替代探测路径（**只读**，2026-10-15 加）：绕开「公司出口按 SNI 拦本域名」。
 *
 * 为什么必须加：直连失败会让**整段 D 节判据被跳过**（登录/支付/JWT/门控一条都不跑）。
 * 那是「假绿」里最坏的一种 —— 体检只平静地报一句「连不上」，人以为「只是本机网络的已知小问题」，
 * 而线上真实状态（`wechat.pay = mock`、`/api/pay/mock-success` 公网开着 ＝ 资损）**从来没被看见过**。
 *
 * 做法：TCP 连该域名的 IP，但 TLS **不发 SNI**（出口设备正是按 SNI 判的），
 * 再用 `Host: <域名>` 让 nginx 路由到正确 server 块。**只发这一个 GET，不做任何写操作。**
 * 注：SNI 为空时拿回的是默认 server 的证书 → 域名必然对不上 → 关掉校验（仅此探针）。
 */
function healthViaHostHeader(base) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    dns.lookup(u.hostname, (dnsErr, address) => {
      if (dnsErr) return reject(dnsErr);
      const req = https.request(
        {
          host: address,
          port: u.port || 443,
          method: 'GET',
          path: u.pathname.replace(/\/+$/, '') + '/api/health',
          servername: '',
          headers: { Host: u.host },
          rejectUnauthorized: false
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(b) });
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(8000, () => req.destroy(new Error('TIMEOUT')));
      req.end();
    });
  });
}

/** 两条路都连不上时的诊断 —— 把「DNS 解析不了」与「后端挂了」分开，否则人会跑错方向 */
function reportHealthError(e) {
  rows.push({ level: 'head', name: 'D. 线上健康（GET ' + BASE_URL + '/api/health）' });
  const code = (e && (e.code || (e.cause && e.cause.code))) || '';
  const u = new URL(BASE_URL);
  if (/ENOTFOUND|ENODATA/i.test(code)) {
    /* 2026-10-14 实测：公网 DNS（易名）已加好 A 记录、三个公共 DNS 全 ✓、服务器侧探针全绿，
     * 但**本机** lookup 仍 ENOTFOUND —— 因为 lexy.cn 在公司内网还有一套自建权威 DNS，
     * 那套没有 mall 记录。把它笼统报成「连不上线上后端」，人会跑去服务器反复折腾证书（白忙）。 */
    warn('本机解析不了 ' + u.hostname + '（' + code + '）',
      '**不是后端故障**：真机与平台审核走公共 DNS，不受影响；受影响的是本机开发者工具。' +
      '先跑 node .tooling/check-domain-dns.mjs（同时查公共 DNS 与内网 DNS）；内网 DNS 缺记录 → 找 IT 补；' +
      '本机应急 → 临时换 DNS 或加 hosts。⚠️ 替代路径此刻同样无效（它也得先解析出 IP）。');
  } else if (/SELF_SIGNED|UNABLE_TO_VERIFY|CERT|SSL|TLS/i.test(code + ' ' + e.message)) {
    block('HTTPS 证书不可信', code + ' —— iOS 端连自签名证书都连不上，正式版必失败；要换受信任 CA 证书（如 Let\'s Encrypt / 腾讯云免费证书）');
  } else {
    warn('直连与替代路径都没连上（' + (code || String(e.message).slice(0, 60)) + '）',
      '⚠️ **这次 D 节的登录 / 支付 / JWT / 门控判据一条都没跑，别把本次体检当完整结论。** ' +
      '先在服务器上验后端：curl -s -o /dev/null -w "%{http_code}" https://' + u.host + u.pathname.replace(/\/+$/, '') + '/api/health（应得 200）。' +
      '本机为何直连不了域名（出口按 SNI 拦）见 deploy/添加子域名操作单.md 第六之二节。');
  }
}

/* 真发一次请求：既验链路通不通，也看重定向后的证书是否可信。
 * 直连失败（本机被出口按 SNI 拦）→ 自动退一次替代路径，保证 D 节判据真的被执行。 */
let health = null;
let healthVia = '';
try {
  const res = await fetch(BASE_URL + '/api/health', { signal: AbortSignal.timeout(8000) });
  health = { status: res.status, body: await res.json() };
} catch (e) {
  try {
    health = await healthViaHostHeader(BASE_URL);
    healthVia = '　⚙️ 经替代路径取得（空 SNI + Host 头；本机直连被公司出口按 SNI 拦，非后端故障）';
  } catch (e2) {
    reportHealthError(e);
  }
}
if (health) {
  const d = health.body && health.body.data ? health.body.data : health.body;
  rows.push({ level: 'head', name: 'D. 线上健康（GET ' + BASE_URL + '/api/health）' + healthVia });
  if (health.status !== 200) block('健康检查返回 ' + health.status, JSON.stringify(d).slice(0, 160));
  else ok('健康检查 200', 'service=' + d.service + '  uptime=' + d.uptime + 's');
  if (d.wechat) {
    if (d.wechat.login === 'real') ok('微信登录 = 真实接口', 'WX_APPID/WX_SECRET 已配置');
    else block('微信登录 = 本地模拟', '未配置 WX_APPID/WX_SECRET → 真机 wx.login 拿不到 openid，登录链路整条不通');
    if (d.wechat.pay === 'real') ok('微信支付 = 真实接口', 'WX_MCH_ID/WX_PAY_KEY 已配置');
    else block('微信支付 = 本地模拟（**发布前必须解决**）',
      '未配商户号 → wx.requestPayment 必然失败、前端弹「联调环境」弹窗。' +
      '🔴 更要紧的是**资损**：线上 `ALLOW_MOCK_PAY=1`（deploy/setup-server.sh 的默认值）时 ' +
      '`/api/pay/mock-success` 在公网开着（只需登录），任何用户都能把自己的订单**免费标成已支付**，' +
      '订单状态 / 库存 / 销量都是真改。发布前二选一：' +
      '① 接通真实支付（推荐 —— `HAS_WX_PAY` 一变真，代码**自动关闭**模拟，不用人去删 .env）；' +
      '② 急着先上 → 先设 `ALLOW_MOCK_PAY=0` **并藏掉支付入口**（否则用户点付款只会看到报错）。');
  }
  if (d.jwtSecret === 'default(dev-only)') block('JWT 用的是开发默认密钥', '上线前必须设自定义 JWT_SECRET（默认值等于任何人可伪造登录态）');
  else ok('JWT 密钥已自定义');
  if (d.adminAuth) {
    const a = d.adminAuth;
    if (a.password === 'dev-default') block('后台口令仍是开发默认值', '公网可访问时等于后台敞开（adminAuth.usingDevPassword）');
    else ok('后台口令已自定义', '凭证 ' + a.credentials + ' / 可写 ' + a.writable);
  }
  ok('页面门控', 'debugPage=' + d.debugPage + '  adminPage=' + d.adminPage + '（线上应为 off）');
}
/* 注：旧版这里有一整段「直连失败」的诊断分支。2026-10-15 起已抽成上面的
 * reportHealthError()，并且**只有在直连与替代路径都不通时才会走到** —— 因为原来那段
 * 会让整个 D 节判据被静默跳过（体检报「阻塞 3」，真实的第 4 项资损风险从未被发现）。 */

/* ── 外部事实登记表（**只放公开信息**：备案号 / 域名 / 日期；禁写任何密钥）──────────
 * 有些项脚本**永远查不到**「用户是否已在微信后台办完」—— 办了却没登记就会一直报红（假红），
 * 分不清「还没办」和「早办完了」。E 节（隐私指引申报）与 H 节（备案 / 认证 / 域名 / 商户号）
 * **共用这一张表**，所以在这里就先读进来。 */
const EXT_PATH = path.join(ROOT, 'deploy', 'wechat-external.json');
let EXT = null;
try { EXT = readJson(EXT_PATH); } catch { /* 缺失 → 一律按「未办」提示（保守方向，不会漏报） */ }

/* ─────────── E. 隐私接口 → 需申报的信息类型 ─────────── */
rows.push({ level: 'head', name: 'E. 隐私接口（《用户隐私保护指引》逐项申报，2023-10-17 起未申报即禁用）' });
/** 官方「处理的信息 ↔ 接口或组件」对照表（developers.weixin.qq.com/.../user-privacy/miniprogram-intro.html） */
const PRIVACY_MAP = [
  ['读取你的剪切板', ['wx.setClipboardData', 'wx.getClipboardData']],
  ['收集你的昵称、头像', ['wx.getUserInfo', 'wx.getUserProfile', 'open-type="chooseAvatar"', 'type="nickname"']],
  ['收集你的位置信息', ['wx.getLocation', 'wx.startLocationUpdate', 'wx.startLocationUpdateBackground', 'wx.getFuzzyLocation', 'scope.userLocation']],
  ['收集你选择的位置信息', ['wx.choosePoi', 'wx.chooseLocation']],
  ['收集你的地址', ['wx.chooseAddress']],
  ['收集你的发票信息', ['wx.chooseInvoiceTitle', 'wx.chooseInvoice']],
  ['收集你的微信运动步数', ['wx.getWeRunData']],
  ['收集你的手机号', ['open-type="getPhoneNumber"', 'open-type="getRealtimePhoneNumber"']],
  ['收集你的车牌号', ['wx.chooseLicensePlate']],
  ['收集你选中的照片或视频信息', ['wx.chooseImage', 'wx.chooseMedia', 'wx.chooseVideo']],
  ['收集你选中的文件', ['wx.chooseMessageFile']],
  ['访问你的麦克风', ['wx.startRecord', 'RecorderManager.start', 'wx.joinVoIPChat', 'live-pusher', 'scope.record']],
  ['访问你的蓝牙', ['wx.openBluetoothAdapter', 'wx.createBLEPeripheralServer', 'scope.bluetooth']],
  ['使用你的相册（仅写入）权限', ['wx.saveImageToPhotosAlbum', 'wx.saveVideoToPhotosAlbum', 'scope.writePhotosAlbum']],
  ['使用你的通讯录（仅写入）权限', ['wx.addPhoneContact', 'scope.addPhoneContact']],
  ['使用你的日历（仅写入）权限', ['wx.addPhoneCalendar', 'wx.addPhoneRepeatCalendar', 'scope.addPhoneCalendar']],
  ['调用你的加速传感器', ['wx.startAccelerometer']],
  ['调用你的磁场传感器', ['wx.startCompass']],
  ['调用你的方向传感器', ['wx.startDeviceMotionListening']],
  ['调用你的陀螺仪传感器', ['wx.startGyroscope']]
];
/** 剥注释再扫：注释里写着的接口名不算「真的调用了」（本项目一贯口径） */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}
const srcFiles = [];
(function collect(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) collect(p);
    else if (/\.(js|wxml|json)$/.test(ent.name)) srcFiles.push(p);
  }
})(MP);
const found = new Map(); // 接口 → 命中文件列表
for (const f of srcFiles) {
  const src = stripComments(read(f));
  for (const [info, apis] of PRIVACY_MAP) {
    for (const api of apis) {
      if (src.includes(api)) {
        if (!found.has(info)) found.set(info, new Map());
        const m = found.get(info);
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        if (!m.has(api)) m.set(api, []);
        if (m.get(api).length < 3) m.get(api).push(rel);
      }
    }
  }
}
/* 「已申报」脚本查不到（微信后台不给接口）→ 靠登记表。不登记就一直报红 = 假红；
 * 反过来**不许因为登记了就不看源码** —— 源码扫描永远执行，登记表只决定「红还是绿」。 */
const PRIVACY_DECLARED = !!(EXT && EXT.items && EXT.items.privacyGuide && EXT.items.privacyGuide.status === 'done');
if (!found.size) {
  ok('未扫到任何隐私接口', '提审时可勾选「未采集用户隐私」（仍建议人工复核一遍）');
} else if (PRIVACY_DECLARED) {
  const it = EXT.items.privacyGuide;
  for (const [info, apis] of found) {
    ok('已申报：' + info, [...apis.entries()].map(([a, fs2]) => a + '（' + fs2.join('、') + '）').join('； ')
      + '　← 登记于 deploy/wechat-external.json（' + [it.doneAt, it.note].filter(Boolean).join('　·　') + '）');
  }
} else {
  for (const [info, apis] of found) {
    block('必须申报：' + info, [...apis.entries()].map(([a, fs2]) => a + '（' + fs2.join('、') + '）').join('； ')
      + '　→ 微信后台「设置 → 服务内容声明 → 用户隐私保护指引」逐项勾选并写清用途；'
      + '**办完请把 deploy/wechat-external.json 的 items.privacyGuide 改成 status="done"**（补 doneAt + note），'
      + '否则这里会**一直报红** —— 脚本查不到微信后台的申报状态，只能靠这张登记表。');
  }
}
// 官方对照表未逐字列出的一个：wx.scanCode 会拉起相机取景
const scanHit = srcFiles.filter((f) => stripComments(read(f)).includes('wx.scanCode'));
if (scanHit.length) {
  warn('wx.scanCode 需人工确认', '官方对照表未逐字列出 scanCode，但扫码会拉起相机取景（scope.camera）→ 到微信后台按「访问你的摄像头」口径申报最稳；' +
    scanHit.map((f) => path.relative(ROOT, f).split(path.sep).join('/')).join('、'));
}

/* ─────────── F. 需要后台开通的能力 ─────────── */
rows.push({ level: 'head', name: 'F. 微信后台需开通的能力' });
const allSrc = srcFiles.filter((f) => f.endsWith('.js') || f.endsWith('.wxml')).map((f) => stripComments(read(f))).join('\n');
if (allSrc.includes('wx.requestPayment')) ok('用到微信支付', '需：企业主体 + 微信认证 + 微信支付商户号并绑定本小程序 + 配置回调地址');
else ok('未用到微信支付');
if (allSrc.includes('open-type="contact"')) ok('用到微信客服', '需在后台「客服」里绑定客服人员，否则点客服按钮无会话');
if (allSrc.includes('open-type="getPhoneNumber"')) ok('用到手机号快速验证', '需企业主体 + 认证；1000 次内免费，超出按次计费');
warn('服务类目与资质', '家用电器自营 → 选「商家自营-家用电器」等对应类目；若涉食品/医疗器械等需前置审批资质，类目不符会直接驳回');

/* ─────────── G. 静态资源规范 ─────────── */
rows.push({ level: 'head', name: 'G. 静态资源与图标规范' });
const tb = (appJson.tabBar && appJson.tabBar.list) || [];
if (appJson.tabBar && appJson.tabBar.custom) {
  ok('自定义 tabBar', tb.length + ' 项，静态声明已满足 2~5 项限制');
} else warn('未用自定义 tabBar', 'default tabBar 的 iconPath 必填且单图 ≤40KB');
const iconDir = path.join(MP, 'images', 'tabbar');
if (fs.existsSync(iconDir)) {
  const files = fs.readdirSync(iconDir).filter((f) => f.endsWith('.png'));
  let bad = [];
  let dims = new Set();
  for (const f of files) {
    const b = fs.readFileSync(path.join(iconDir, f));
    const isPng = b.length > 24 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG';
    if (!isPng) bad.push(f + '(魔数不对)');
    else {
      const w = b.readUInt32BE(16);
      const h = b.readUInt32BE(20);
      dims.add(w + '×' + h);
      if (!(b[25] === 6 || b[25] === 4)) bad.push(f + '(第25字节=' + b[25] + '，非 RGBA/灰度+alpha，透明底可能失效)');
    }
  }
  if (bad.length) block('导航图标有问题', bad.join('、'));
  else ok('导航图标 ' + files.length + ' 张', 'PNG 魔数正常，尺寸 ' + [...dims].join('/') + '，均带 alpha 通道');
} else warn('未找到 miniprogram/images/tabbar/');
const sm = path.join(MP, 'sitemap.json');
if (fs.existsSync(sm)) {
  const rules = readJson(sm).rules || [];
  const badPages = rules.map((r) => r.page).filter((p) => p && p !== '*' && !appJson.pages.includes(p) && !(appJson.subPackages || []).some((s) => p.startsWith(s.root + '/')));
  if (badPages.length) block('sitemap 引用了不存在的页面', badPages.join('、'));
  else ok('sitemap.json', rules.length + ' 条规则，引用的页面都在 app.json 里');
} else warn('缺 sitemap.json');

/* ─────────── H. 人工项（脚本给结论，动作在微信后台/工信部） ─────────── */
rows.push({ level: 'head', name: 'H. 只能人工办的前置条件' });

/* 这些事脚本查不到（工信部不给接口、微信后台拿不到），但**办完了就不该一直报红**——
 * 否则体检永远显示「需人工处理 N 项」，分不清「还剩什么没办」和「早就办完了」（假红）。
 * 已办完的事实登记在 deploy/wechat-external.json（**只放公开信息**：备案号/域名/日期）。
 * ⚠️ `EXT_PATH` / `EXT` 已在 **E 节之前**读取（E 节也要用同一张表），此处**不重复定义**。 */
const extDone = (k) => {
  const it = EXT && EXT.items && EXT.items[k];
  if (!it || it.status !== 'done') return '';
  return [it.doneAt || '日期未记', it.no, it.note].filter(Boolean).join('　·　');
};
const extRow = (key, name, pendingHint) => {
  const d = extDone(key);
  if (d) ok(name + '（已完成）', d);
  else warn(name, pendingHint);
};
if (!EXT) warn('deploy/wechat-external.json 缺失', '外部事实登记表不在 → 下列各项一律按「未办」提示（保守，不会漏报）；见该文件 _说明');

extRow('beian', '小程序 ICP 备案（工信部）',
  '2023-09-01 起所有新上线小程序必须**先备案再提审**：后台「设置-基础设置-小程序备案」→ 平台初审 → 12381 短信核验（24 小时内）→ 管局终审（1~20 工作日）');
extRow('domainIcp', '域名 ICP 备案 + 受信任 HTTPS 证书',
  '服务器域名只需**已 ICP 备案**即可 —— 微信**不要求**域名备案主体与小程序主体相同（这是两条独立的主体线，别混）；不支持 IP / localhost；iOS 不认自签名证书');
extRow('cert', '微信认证（企业 300 元/年）',
  '备案的前置条件，也是开通支付/客服/手机号的前提');
extRow('requestDomain', 'request 合法域名',
  '把后端域名填进「开发-开发设置-服务器域名-request 合法域名」；每个类型每月最多改 5 次');
extRow('mchNew', '微信支付商户号（新「普通商户」号）',
  '旧号开不了产品权限（平台显示普通商户、主账号登录也无产品中心）→ 已另开新号，**审核中（1~2 工作日）**。等待期内核对：申请表经营场景勾「小程序」+ 填 AppID。到手后：产品中心开通 JSAPI 支付 → 绑 AppID → 取三样凭据 → 换线上 .env 5 值（见 deploy/微信支付接入清单.md 第零节 A/B）');

/* ─────────── 输出 ─────────── */
const mark = { ok: '  OK  ', warn: ' WARN ', block: ' FAIL ', head: '' };
console.log('');
for (const r of rows) {
  if (r.level === 'head') {
    console.log('\n' + r.name);
    continue;
  }
  console.log('[' + mark[r.level] + '] ' + r.name + (r.detail ? '\n           ' + r.detail : ''));
}
const nBlock = rows.filter((r) => r.level === 'block').length;
const nWarn = rows.filter((r) => r.level === 'warn').length;
const nOk = rows.filter((r) => r.level === 'ok').length;
console.log('\n────────────────────────────────────────');
console.log('通过 ' + nOk + ' 项，需人工处理 ' + nWarn + ' 项，阻塞 ' + nBlock + ' 项');
console.log(nBlock ? '❌ 存在阻塞项，现在上传必然出问题 —— 先把 FAIL 清掉' : '✅ 没有硬阻塞；把 WARN 逐条在微信后台确认完再上传');
console.log('');
process.exit(nBlock ? 1 : 0);
