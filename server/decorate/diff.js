/**
 * 装修后台 · 数据差异对比
 *
 * 用于「查看变更」：把草稿与已发布数据递归对比，给出人类可读的变更清单。
 * （不引入第三方 diff 库，保持零依赖）
 */

const MAX = 300;

function isObj(v) { return v !== null && typeof v === 'object'; }

function short(v) {
  if (v === undefined) return '(无)';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '…' : v;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
  return String(v);
}

/**
 * @param {*} a 基准（已发布）
 * @param {*} b 对比（草稿）
 * @returns {{ list: Array, truncated: boolean, added: number, removed: number, changed: number }}
 */
function diff(a, b) {
  const list = [];
  let truncated = false;
  let added = 0; let removed = 0; let changed = 0;

  function push(item) {
    if (list.length >= MAX) { truncated = true; return; }
    list.push(item);
    if (item.type === 'add') added++;
    else if (item.type === 'del') removed++;
    else changed++;
  }

  function walk(x, y, path) {
    if (list.length >= MAX) { truncated = true; return; }

    if (Array.isArray(x) && Array.isArray(y)) {
      const n = Math.max(x.length, y.length);
      for (let i = 0; i < n; i++) {
        const p = path + '[' + i + ']';
        if (i >= x.length) push({ type: 'add', path: p, to: short(y[i]) });
        else if (i >= y.length) push({ type: 'del', path: p, from: short(x[i]) });
        else walk(x[i], y[i], p);
      }
      return;
    }

    if (isObj(x) && isObj(y)) {
      const keys = [];
      Object.keys(x).forEach((k) => { if (keys.indexOf(k) === -1) keys.push(k); });
      Object.keys(y).forEach((k) => { if (keys.indexOf(k) === -1) keys.push(k); });
      keys.forEach((k) => {
        const p = path ? path + '.' + k : k;
        if (x[k] === undefined) push({ type: 'add', path: p, to: short(y[k]) });
        else if (y[k] === undefined) push({ type: 'del', path: p, from: short(x[k]) });
        else walk(x[k], y[k], p);
      });
      return;
    }

    // 到这里说明一方是原始值（或类型不一致），直接比较
    if (x !== y) push({ type: 'change', path, from: short(x), to: short(y) });
  }

  walk(a, b, '');
  return { list, truncated, added, removed, changed, total: added + removed + changed };
}

module.exports = { diff };
