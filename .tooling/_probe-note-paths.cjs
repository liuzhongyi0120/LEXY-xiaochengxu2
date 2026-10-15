/**
 * 取证：店铺笔记「笔记头部」字段树路径 vs 实际数据结构
 *
 * 为什么要这个探针：装修台的属性面板是**按 field 树拼路径**的
 * （见 server/public/admin/admin.js 的 joinPath / locate）。
 * 若 field 树写的是 `header.title`，而数据里标题平铺在 `data.title`，
 * 那么面板上「标题」输入框会永远是空的、改了什么也不会生效 —— 且不报任何错。
 *
 * 只读探针：只打印，不改任何文件。跑完把探针建的笔记删掉。
 */
const ROOT = require('path').resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:3000';

async function http(method, p, body, token) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + p, opt);
  const j = await r.json().catch(() => null);
  const isEnv = j && typeof j === 'object' && 'code' in j && 'data' in j;
  return { status: r.status, code: isEnv ? j.code : undefined, msg: isEnv ? j.msg : '', body: isEnv ? j.data : j };
}

function walk(node, path, out) {
  if (!node) return out;
  if (node.type === 'object') {
    (node.fields || []).forEach((f) => {
      if (f.type === 'group') {
        walk({ type: 'object', fields: f.fields }, path, out);
        return;
      }
      out.push({ path: path ? path + '.' + f.k : f.k, type: f.type, label: f.label });
      walk(f, path ? path + '.' + f.k : f.k, out);
    });
    return out;
  }
  // list 节点在上一层（object 分支）已经登记过了，这里不再重复 push ——
  // 重复会让「取不到的叶子数」这条判据的分母虚高（探针自己也要准）
  if (node.type === 'list') return out;
  return out;
}

/**
 * data 里有、但字段树没有入口的键 —— 允许清单。
 *
 *  `publishedAt`：发布时间由系统在「生成代码」时写，**刻意不给面板入口**
 *  （让运营手改发布时间没有意义，还会和发布动作对不上）。
 */
const NO_PANEL_OK = ['publishedAt'];

function getByPath(data, path) {
  const segs = String(path).split('.');
  let cur = data;
  for (const s of segs) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[s];
  }
  return cur;
}

(async function main() {
  const login = await http('POST', '/api/admin/login', { password: 'admin' });
  const token = login.body && login.body.token;
  if (!token) { console.log('登录失败', login); process.exit(1); }

  /* 先清掉上一轮探针留下的笔记（探针中途崩过，注册表里可能残留） */
  const old = await http('GET', '/api/decorate/notes', undefined, token);
  for (const r of ((old.body && old.body.list) || [])) {
    if (r.title === '路径探针笔记') {
      await http('POST', '/api/decorate/note/delete', { key: r.key }, token);
      console.log('清掉残留探针笔记 ' + r.key);
    }
  }

  const created = await http('POST', '/api/decorate/note/create', { title: '路径探针笔记', summary: 'S', tags: 'a,b' }, token);
  const key = created.body.page.key;
  console.log('新建笔记 key = ' + key + '\n');

  const pg = await http('GET', '/api/decorate/page?key=' + encodeURIComponent(key), undefined, token);
  const schema = pg.body.schema;
  const data = pg.body.data;

  console.log('root.fields = ' + (schema.fields || []).map((f) => f.k).join(', '));
  console.log('\n--- data 顶层键 ---');
  console.log(Object.keys(data).map((k) => k + '(' + (typeof data[k]) + ')').join(', '));
  console.log('\n--- data.header 键 ---');
  console.log(data.header ? Object.keys(data.header).join(', ') : '(无 header)');

  const leaves = walk(schema, '', []);
  console.log('\n--- field 树叶子（' + leaves.length + '）→ 在 data 里取到的值 ---');
  let dead = 0;
  leaves.forEach((lf) => {
    const v = getByPath(data, lf.path);
    const miss = v === undefined;
    if (miss) dead++;
    console.log('  ' + (miss ? '✗ 取不到' : '✓') + '  ' + lf.path.padEnd(34) + ' [' + lf.type + '] ' +
      (miss ? '' : JSON.stringify(v).slice(0, 60)));
  });
  console.log('\n取不到的叶子字段数 = ' + dead + ' / ' + leaves.length);

  /* 反向：data 里有、field 树里没有的键（这些字段运营在面板上根本看不到） */
  console.log('\n--- data 顶层里 field 树没有直接对应的键 ---');
  const topKeys = (schema.fields || []).map((f) => f.k);
  let noPanel = 0;
  Object.keys(data).forEach((k) => {
    if (topKeys.indexOf(k) >= 0) return;
    if (NO_PANEL_OK.indexOf(k) >= 0) { console.log('  · 有意无入口: ' + k); return; }
    noPanel++;
    console.log('  ✗ 面板无入口: ' + k + ' = ' + JSON.stringify(data[k]).slice(0, 60));
  });
  if (!noPanel) console.log('  （无）');

  /* 关键判据：模拟装修台「在面板里改标题 → 再走一遍 normalize」这条链 */
  console.log('\n--- 模拟面板写入 header.title 后再 normalize ---');
  const probe = JSON.parse(JSON.stringify(data));
  probe.header.title = '面板改过的标题';
  const shopnotes = require(ROOT + '/server/decorate/shopnotes.js');
  const after = shopnotes.normalizeContent(probe);
  const got = after.header && after.header.title;
  console.log('  normalize 后 header.title = ' + JSON.stringify(got));
  console.log('  ' + (got === '面板改过的标题' ? '✓ 会生效' : '★ 不会生效（被丢掉）'));

  const del = await http('POST', '/api/decorate/note/delete', { key: key }, token);
  console.log('\n清理探针笔记: code=' + del.code + ' removedVersions=' + (del.body && del.body.removedVersions));
})().catch((e) => { console.error('探针异常', e); process.exit(1); });
