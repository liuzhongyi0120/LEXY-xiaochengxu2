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

const CASES = [
  // ---- 主判据：真机必须恒为 server（选错 = 手机全空且无报错）----
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
process.exit(bad ? 1 : 0);
