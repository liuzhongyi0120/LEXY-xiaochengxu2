/**
 * 只读探针：验证 `utils/constants.js` 的「按运行环境自动选档」在各环境下选得对。
 *
 * 为什么必须逐个场景试，而不是看代码觉得对：
 *   最危险的错法不是「开发者工具选不到 local」，而是**「把真机也选成 local」** ——
 *   那会让手机去连 127.0.0.1（手机自己），用户看到的是一片空白且完全没有报错。
 *   所以真机场景是这里的**主判据**，devtools 场景只是顺带。
 *
 * 用法：node .tooling/_verify-env-auto.cjs
 */
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'constants.js');

function load(wxStub) {
  delete require.cache[require.resolve(FILE)];
  const had = Object.prototype.hasOwnProperty.call(global, 'wx');
  const prev = global.wx;
  if (wxStub === undefined) delete global.wx; else global.wx = wxStub;
  try {
    const m = require(FILE);
    return { ENV: m.ENV, BASE_URL: m.BASE_URL };
  } finally {
    if (had) global.wx = prev; else delete global.wx;
    delete require.cache[require.resolve(FILE)];
  }
}

/**
 * 加载一次模块，但**换两次桩**：
 *   wxStubAtLoad —— 模块加载期（ENV / BASE_URL 就是在这一刻定下的）
 *   wxStubAtCall —— 页面渲染期（baseUrlNow() 在这一刻才被调用）
 * 用来复现「加载期 wx 还没就绪 → 兜底 server；渲染期才发现是模拟器」这条兜底路径。
 */
function loadLazy(wxStubAtLoad, wxStubAtCall) {
  const key = require.resolve(FILE);
  delete require.cache[key];
  const had = Object.prototype.hasOwnProperty.call(global, 'wx');
  const prev = global.wx;
  const setWx = (s) => { if (s === undefined) delete global.wx; else global.wx = s; };
  setWx(wxStubAtLoad);
  try {
    const m = require(FILE);
    const loadedEnv = m.ENV;
    const loadedBase = m.BASE_URL;
    setWx(wxStubAtCall);
    return { loadedEnv, loadedBase, tier: m.envNow(), url: m.baseUrlNow() };
  } finally {
    if (had) global.wx = prev; else delete global.wx;
    delete require.cache[key];
  }
}

const DT = { getSystemInfoSync: () => ({ platform: 'devtools' }) };
const AND = { getSystemInfoSync: () => ({ platform: 'android' }) };
const LOCAL_URL = 'http://127.0.0.1:3000';

/* 惰性复查：拼地址永远是「渲染期」的事，所以加载期取不到 platform 时不能就此钉死在 server */
const LAZY_CASES = [
  { name: '加载期无 wx（兜底 server）→ 渲染期是模拟器', load: undefined, call: DT, want: 'local' },
  { name: '加载期无 wx → 渲染期仍是真机', load: undefined, call: AND, want: 'server' },
  { name: '加载期真机 → 渲染期真机', load: AND, call: AND, want: 'server' },
  { name: '加载期模拟器（旧接口）→ 渲染期模拟器', load: DT, call: DT, want: 'local' },
  { name: '加载期模拟器（新接口）→ 渲染期模拟器',
    load: { getDeviceInfo: () => ({ platform: 'devtools' }) },
    call: { getDeviceInfo: () => ({ platform: 'devtools' }) }, want: 'local' },
  { name: '加载期真机 → 渲染期变模拟器（中途就绪）', load: AND, call: DT, want: 'local' },
  { name: '渲染期新接口空返回，旧接口兜住',
    load: undefined, call: { getDeviceInfo: () => ({}), getSystemInfoSync: () => ({ platform: 'devtools' }) }, want: 'local' },
  { name: '渲染期新接口抛错，旧接口兜住',
    load: undefined, call: { getDeviceInfo: () => { throw new Error('boom'); }, getSystemInfoSync: () => ({ platform: 'devtools' }) }, want: 'local' },
  { name: '渲染期接口抛异常（保守）', load: AND, call: { getSystemInfoSync: () => { throw new Error('boom'); } }, want: 'server' },
  { name: '渲染期 wx 消失（Node 侧）', load: DT, call: undefined, want: 'local' },
];

const CASES = [
  { name: '真机 Android（开发版也走这条）', wx: { getSystemInfoSync: () => ({ platform: 'android' }) }, want: 'server' },
  { name: '真机 iOS', wx: { getSystemInfoSync: () => ({ platform: 'ios' }) }, want: 'server' },
  { name: '真机 Windows 微信', wx: { getSystemInfoSync: () => ({ platform: 'windows' }) }, want: 'server' },
  { name: '真机 macOS 微信', wx: { getSystemInfoSync: () => ({ platform: 'mac' }) }, want: 'server' },
  // ---- 开发者工具模拟器 → local ----
  { name: '开发者工具模拟器（旧接口）', wx: { getSystemInfoSync: () => ({ platform: 'devtools' }) }, want: 'local' },
  { name: '开发者工具模拟器（新接口 getDeviceInfo）', wx: { getDeviceInfo: () => ({ platform: 'devtools' }) }, want: 'local' },
  { name: '模拟器：新接口不返回 platform，旧接口兜住',
    wx: { getDeviceInfo: () => ({}), getSystemInfoSync: () => ({ platform: 'devtools' }) }, want: 'local' },
  { name: '模拟器：新接口抛错，旧接口兜住',
    wx: { getDeviceInfo: () => { throw new Error('boom'); }, getSystemInfoSync: () => ({ platform: 'devtools' }) }, want: 'local' },
  // ---- Node 侧（自检 / preflight / deploy-data）必须与旧版逐字一致 ----
  { name: 'Node（无 wx 全局）', wx: undefined, want: 'server' },
  // ---- 失败一律往安全侧倒 ----
  { name: 'API 抛异常', wx: { getSystemInfoSync: () => { throw new Error('boom'); } }, want: 'server' },
  { name: 'API 返回空对象', wx: { getSystemInfoSync: () => ({}) }, want: 'server' },
  { name: 'API 返回 null', wx: { getSystemInfoSync: () => null }, want: 'server' },
  { name: 'wx 存在但两个接口都没有', wx: {}, want: 'server' },
];

let bad = 0;
console.log('场景'.padEnd(42) + '期望'.padEnd(9) + '实际'.padEnd(9) + 'BASE_URL');
console.log('-'.repeat(96));
CASES.forEach((c) => {
  const r = load(c.wx);
  const ok = r.ENV === c.want;
  if (!ok) bad++;
  console.log(
    (ok ? '  ' : '✗ ') + c.name.padEnd(40) + String(c.want).padEnd(9) + String(r.ENV).padEnd(9) + r.BASE_URL
  );
});
console.log('-'.repeat(96));
console.log(bad ? `✗ ${bad} / ${CASES.length} 选错了` : `✓ ${CASES.length} / ${CASES.length} 全部选档正确`);

console.log('');
console.log('— 惰性复查（baseUrlNow：加载期 → 渲染期，两次取平台的时刻不同）—');
console.log('场景'.padEnd(42) + '期望'.padEnd(9) + '实际'.padEnd(9) + '渲染期地址');
console.log('-'.repeat(96));
let badLazy = 0;
LAZY_CASES.forEach((c) => {
  const r = loadLazy(c.load, c.call);
  const wantUrl = c.want === 'local' ? LOCAL_URL : r.loadedBase;
  const ok = r.tier === c.want && r.url === wantUrl;
  if (!ok) badLazy++;
  console.log(
    (ok ? '  ' : '✗ ') + c.name.padEnd(40) + String(c.want).padEnd(9) + String(r.tier).padEnd(9) + r.url
  );
});
/* 区分性检查：真要出现「加载期 server、渲染期 devtools」，地址必须**真的换掉** */
const key = loadLazy(undefined, DT);
const keyOk = key.url === LOCAL_URL && key.loadedBase !== LOCAL_URL;
if (!keyOk) badLazy++;
console.log('-'.repeat(96));
console.log('区分性：加载期快照 ' + key.loadedBase + ' → 渲染期 ' + key.url + (keyOk ? '  ✓ 确实换掉了' : '  ✗ 没换'));
console.log(badLazy
  ? `✗ ${badLazy} / ${LAZY_CASES.length + 1} 条惰性场景不对`
  : `✓ ${LAZY_CASES.length + 1} / ${LAZY_CASES.length + 1} 惰性复查全部正确`);

process.exit(bad || badLazy ? 1 : 0);
