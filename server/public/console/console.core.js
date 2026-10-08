/**
 * 后台控制台 · 核心（路由 / 请求 / 通用组件 / 数据概览 / 店铺设置）
 *
 * 零依赖，纯浏览器端。模块页面注册到 App.views，由 App.go(name) 切换。
 * 与装修台（/admin）的区别：装修台改的是「小程序页面长什么样」，控制台管的是「商品/订单/客户/营销」。
 */

/* ============================== 基础工具 ============================== */

const $ = (sel, root) => (root || document).querySelector(sel);

/** HTML 转义（所有后端数据进模板前必须过一遍） */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const fen2yuan = (fen) => (Number(fen || 0) / 100).toFixed(2);
const money = (fen) => '¥' + Number(fen2yuan(fen)).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wan = (fen) => {
  const y = Number(fen || 0) / 100;
  if (y >= 10000) return '¥' + (y / 10000).toFixed(2) + ' 万';
  return money(fen);
};

function fmtTime(ts, withTime) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  const p = (v) => String(v).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime === false ? day : `${day} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromNow(ts) {
  if (!ts) return '—';
  const diff = Date.now() - Number(ts);
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
}

/* ============================== 请求层 ============================== */

const API = {
  async call(path, { method = 'GET', query, body } = {}) {
    let url = path;
    if (query) {
      const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
      if (qs) url += (url.indexOf('?') > -1 ? '&' : '?') + qs;
    }
    const opt = { method, headers: {} };
    if (body && method !== 'GET') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(url, opt);
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error('服务端返回异常（HTTP ' + res.status + '）'); }
    if (json.code !== 0) throw new Error(json.msg || '请求失败');
    return json.data;
  },
  get: (path, query) => API.call(path, { query }),
  post: (path, body) => API.call(path, { method: 'POST', body: body || {} })
};

/* ============================== 提示与弹层 ============================== */

let toastTimer = null;
function toast(msg, isErr) {
  const old = $('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), isErr ? 3200 : 1900);
}

function loading(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text || '加载中…';
  document.body.appendChild(el);
  return () => el.remove();
}

/**
 * 打开弹层
 * @param {{title:string, html:string, footer?:string, width?:'wide'|'narrow'}} opt
 * @returns {{root:HTMLElement, close:Function}}
 */
function openModal(opt) {
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.innerHTML =
    '<div class="modal ' + (opt.width || '') + '">' +
      '<div class="modal-h"><b>' + esc(opt.title || '') + '</b><button class="x" data-close>×</button></div>' +
      '<div class="modal-b">' + (opt.html || '') + '</div>' +
      (opt.footer === null ? '' : '<div class="modal-f">' + (opt.footer || '<button class="btn" data-close>关闭</button>') + '</div>') +
    '</div>';
  $('#layer').appendChild(mask);
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => {
    if (e.target === mask || e.target.hasAttribute('data-close')) close();
  });
  return { root: mask, close, $: (sel) => mask.querySelector(sel) };
}

/** 二次确认 */
function confirmBox(msg, okText) {
  return new Promise((resolve) => {
    const m = openModal({
      title: '请确认',
      width: 'narrow',
      html: '<div style="padding:6px 0 2px;line-height:1.7">' + msg + '</div>',
      footer: '<button class="btn" data-cancel>取消</button><button class="btn primary" data-ok>' + esc(okText || '确定') + '</button>'
    });
    m.root.querySelector('[data-cancel], .x').addEventListener('click', () => resolve(false));
    m.root.querySelectorAll('.x').forEach((x) => x.addEventListener('click', () => resolve(false)));
    m.root.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(true); });
  });
}

/* ============================== 图片选择器 ============================== */

/**
 * 选图（本地上传 / 素材库 / 外链），返回 Promise<string[]>
 * @param {{multi?:boolean, max?:number, value?:string[]}} opt
 */
function pickImage(opt) {
  const o = opt || {};
  const multi = !!o.multi;
  const max = o.max || (multi ? 9 : 1);
  const picked = (o.value || []).slice(0, max);

  return new Promise((resolve) => {
    const html =
      '<div class="tabs" style="display:flex;gap:6px;margin-bottom:12px">' +
        '<button class="btn sm tab on" data-tab="upload">本地上传</button>' +
        '<button class="btn sm tab" data-tab="lib">素材库</button>' +
        '<button class="btn sm tab" data-tab="url">外链地址</button>' +
      '</div>' +
      '<div data-pane="upload">' +
        '<div class="upzone" data-zone><b>点击选择图片</b>，或把图片拖到这里<br><span class="sub">支持 PNG / JPG / WebP / GIF，单张 ≤ 5MB</span>' +
        '<input type="file" accept="image/*" multiple hidden data-file></div>' +
        '<div class="media-grid" style="margin-top:10px" data-uplist></div>' +
      '</div>' +
      '<div data-pane="lib" hidden>' +
        '<div class="filter" style="padding:0 0 10px;border:0"><input type="text" class="w160" placeholder="搜索素材…" data-q>' +
        '<select class="w120" data-sort><option value="new">最新</option><option value="old">最早</option><option value="big">最大</option></select>' +
        '<span class="sub" data-stat></span></div>' +
        '<div class="media-grid" data-liblist></div>' +
      '</div>' +
      '<div data-pane="url" hidden>' +
        '<div class="field"><label>图片地址</label><input type="text" class="w220" style="flex:1" placeholder="https://… 或 /uploads/…" data-url>' +
        '<button class="btn" data-addurl>添加</button></div>' +
        '<div class="sub" style="margin-top:8px">支持外链，也支持本站素材相对路径 /uploads/…</div>' +
      '</div>' +
      '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">' +
        '<div class="sub" style="margin-bottom:6px">已选 <b data-cnt>0</b> / ' + max + '</div>' +
        '<div class="img-list" data-picked></div>' +
      '</div>';

    const m = openModal({
      title: multi ? '选择图片（可多选）' : '选择图片',
      width: 'wide',
      html,
      footer: '<span class="grow sub" data-foot></span><button class="btn" data-close>取消</button><button class="btn primary" data-ok>确定</button>'
    });

    const root = m.root;
    const renderPicked = () => {
      root.querySelector('[data-cnt]').textContent = picked.length;
      root.querySelector('[data-picked]').innerHTML = picked.length
        ? picked.map((u, i) => '<div class="img-slot filled" style="background-image:url(' + esc(u) + ')"><button class="del" data-rm="' + i + '">×</button><span class="lv">' + (i + 1) + '</span></div>').join('')
        : '<span class="sub">还没有选图片</span>';
      root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
        picked.splice(Number(b.getAttribute('data-rm')), 1);
        renderPicked();
      }));
    };

    const add = (urls) => {
      (Array.isArray(urls) ? urls : [urls]).forEach((u) => {
        if (!u) return;
        if (picked.length >= max) { toast('最多选 ' + max + ' 张', true); return; }
        if (picked.indexOf(u) === -1) picked.push(u);
      });
      renderPicked();
    };

    /* --- tab 切换 --- */
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('primary', 'on'));
        btn.classList.add('primary', 'on');
        const t = btn.getAttribute('data-tab');
        root.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.getAttribute('data-pane') !== t; });
        if (t === 'lib') loadLib();
      });
    });
    root.querySelector('[data-tab]').classList.add('primary', 'on');

    /* --- 本地上传 --- */
    const upload = async (files) => {
      const list = Array.from(files || []).filter((f) => f.type.indexOf('image/') === 0);
      if (!list.length) return;
      const stop = loading('上传中…');
      const box = root.querySelector('[data-uplist]');
      try {
        for (const f of list) {
          const fd = new FormData();
          fd.append('file', f, f.name);
          const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
          const json = await res.json();
          if (json.code !== 0) throw new Error(json.msg || '上传失败');
          const up = json.data.list[0];
          add(up.url);
          box.insertAdjacentHTML('afterbegin',
            '<div class="media-it"><img src="' + esc(up.url) + '" alt=""><div class="m"><span>' + esc(f.name).slice(0, 14) + '</span><span>' + up.width + '×' + up.height + '</span></div></div>');
        }
        toast('上传成功，已自动勾选');
      } catch (e) {
        toast(e.message, true);
      } finally { stop(); }
    };
    root.querySelector('[data-zone]').addEventListener('click', () => root.querySelector('[data-file]').click());
    root.querySelector('[data-file]').addEventListener('change', (e) => upload(e.target.files));
    const zone = root.querySelector('[data-zone]');
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('on'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('on'); }));
    zone.addEventListener('drop', (e) => upload(e.dataTransfer.files));
    root.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) upload(items);
    });

    /* --- 素材库 --- */
    let libLoaded = false;
    const loadLib = async () => {
      if (libLoaded) return;
      libLoaded = true;
      await refreshLib();
    };
    const refreshLib = async () => {
      const q = root.querySelector('[data-q]').value.trim();
      const sort = root.querySelector('[data-sort]').value;
      try {
        const d = await API.get('/api/media/list', { q, sort, page: 1, size: 60 });
        root.querySelector('[data-stat]').textContent = `共 ${d.stat.count} 张 · 占用 ${(d.stat.bytes / 1024 / 1024).toFixed(1)}MB`;
        root.querySelector('[data-liblist]').innerHTML = d.list.length
          ? d.list.map((it) => '<div class="media-it" data-pick="' + esc(it.url) + '"><img src="' + esc(it.url) + '" alt=""><div class="m"><span>' + esc(it.orig || it.name).slice(0, 12) + '</span><span>' + it.width + '×' + it.height + '</span></div></div>').join('')
          : '<div class="empty-state">素材库还没有图片，去「本地上传」传一张</div>';
        root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('click', () => {
          add(el.getAttribute('data-pick'));
          el.classList.add('sel');
        }));
      } catch (e) { toast(e.message, true); }
    };
    let libTimer = null;
    root.querySelector('[data-q]').addEventListener('input', () => {
      clearTimeout(libTimer);
      libTimer = setTimeout(refreshLib, 300);
    });
    root.querySelector('[data-sort]').addEventListener('change', refreshLib);

    /* --- 外链 --- */
    root.querySelector('[data-addurl]').addEventListener('click', () => {
      const v = root.querySelector('[data-url]').value.trim();
      if (!v) return;
      add(v);
      root.querySelector('[data-url]').value = '';
    });

    renderPicked();
    root.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(picked); });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(null)));
  });
}

/* ============================== 导航与路由 ============================== */

const NAV = [
  { group: '经营' },
  { key: 'dashboard', text: '数据概览', ico: '▤' },
  { key: 'orders', text: '订单管理', ico: '▦' },
  { key: 'customers', text: '客户管理', ico: '☺' },
  { group: '商品' },
  { key: 'goods', text: '商品管理', ico: '▣' },
  { key: 'categories', text: '分类管理', ico: '☰' },
  { key: 'comments', text: '评价管理', ico: '✦' },
  { group: '营销与内容' },
  { key: 'marketing', text: '优惠券', ico: '◈' },
  { key: 'media', text: '素材库', ico: '▨' },
  { key: 'decorate', text: '店铺装修', ico: '✎' },
  { group: '系统' },
  { key: 'settings', text: '店铺设置', ico: '⚙' }
];

const App = {
  view: 'dashboard',
  /** 各视图的查询状态（切页保留筛选条件） */
  q: {},
  views: {},
  badges: {},

  go(view) {
    if (!this.views[view]) view = 'dashboard';
    this.view = view;
    location.hash = '#' + view;
    this.renderNav();
    this.render();
  },

  /** 当前视图的查询状态 */
  state(view) {
    if (!this.q[view]) this.q[view] = { page: 1 };
    return this.q[view];
  },

  renderNav() {
    $('#nav').innerHTML = NAV.map((n) => {
      if (n.group) return '<div class="nav-group">' + esc(n.group) + '</div>';
      const b = this.badges[n.key];
      return '<button class="nav-item' + (n.key === this.view ? ' on' : '') + '" data-view="' + n.key + '">' +
        '<span class="ico">' + n.ico + '</span><span>' + esc(n.text) + '</span>' +
        (b ? '<span class="badge">' + b + '</span>' : '') + '</button>';
    }).join('');
    $('#nav').querySelectorAll('[data-view]').forEach((el) => {
      el.addEventListener('click', () => this.go(el.getAttribute('data-view')));
    });
    const cur = NAV.find((n) => n.key === this.view) || {};
    $('#pgTitle').textContent = cur.text || '数据概览';
    document.title = '莱克商城后台 · ' + (cur.text || '');
  },

  async render() {
    const v = this.views[this.view];
    const body = $('#body');
    body.innerHTML = '<div class="empty-state">加载中…</div>';
    try {
      await v.render(body, this.state(this.view));
    } catch (e) {
      body.innerHTML = '<div class="card"><div class="card-b"><div class="empty-state"><div class="ic">⚠</div>' +
        '加载失败：' + esc(e.message) + '<div style="margin-top:10px"><button class="btn" onclick="App.render()">重试</button></div></div></div></div>';
    }
  },

  /** 侧栏角标（待发货等） */
  async refreshBadges() {
    try {
      const d = await API.get('/api/admin/dashboard', { days: 7 });
      this.badges = {
        orders: d.todo.pendingShip || 0,
        goods: d.todo.lowStock || 0
      };
      this.renderNav();
    } catch (e) { /* 静默 */ }
  }
};

/* ============================== 通用表格片段 ============================== */

/** 分页条 */
function pagerHtml(total, page, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  return '<div class="pager">' +
    '<span>共 ' + total + ' 条 · 第 ' + page + '/' + pages + ' 页</span>' +
    '<button class="btn sm" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
    '<button class="btn sm" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
  '</div>';
}

/** 绑定分页按钮 */
function bindPager(root, state, reload) {
  root.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = Number(b.getAttribute('data-page'));
    if (p < 1) return;
    state.page = p;
    reload();
  }));
}

const statusTag = {
  pending_pay: '<span class="tag warn">待付款</span>',
  pending_ship: '<span class="tag red">待发货</span>',
  shipped: '<span class="tag blue">待收货</span>',
  finished: '<span class="tag on">已完成</span>',
  cancelled: '<span class="tag off">已取消</span>'
};

/* ============================== 视图：数据概览 ============================== */

App.views.dashboard = {
  async render(body, state) {
    const days = state.days || 7;
    const d = await API.get('/api/admin/dashboard', { days });
    const t = d.today;
    const cmp = t.gmvCompare;
    const arrow = cmp >= 0 ? '<span class="up">↑ ' : '<span class="down">↓ ';
    const cmpText = (d.yesterday.gmv ? (Math.abs(cmp / (d.yesterday.gmv || 1)) * 100).toFixed(1) + '%' : '—');

    const max = Math.max.apply(null, d.trend.map((x) => x.gmv).concat([1]));
    const bars = d.trend.map((x) =>
      '<div class="b" title="' + esc(x.label) + '：GMV ' + money(x.gmv) + '，订单 ' + x.orders + ' 笔"><div class="bar" style="height:' +
      Math.max(3, Math.round(x.gmv / max * 132)) + 'px"><span class="val">' + (x.gmv ? wan(x.gmv) : '') + '</span></div><div class="lb">' + esc(x.label) + '</div></div>').join('');

    body.innerHTML =
      '<div class="grid c4" style="margin-bottom:14px">' +
        '<div class="kpi primary"><div class="k">今日 GMV</div><div class="v">' + wan(t.gmv) + '</div><div class="d">' +
          arrow + cmpText + '</span> 较昨日（' + wan(d.yesterday.gmv) + '）</div></div>' +
        '<div class="kpi"><div class="k">今日订单</div><div class="v">' + t.orders + ' <small>笔</small></div><div class="d">已付款 ' + t.paidOrders + ' 笔 · 客单价 ' + money(t.avgOrder) + '</div></div>' +
        '<div class="kpi"><div class="k">今日新增客户</div><div class="v">' + t.newCustomers + ' <small>人</small></div><div class="d">累计客户 ' + d.total.customers + ' 人</div></div>' +
        '<div class="kpi"><div class="k">待处理</div><div class="v">' + (d.todo.pendingShip + d.todo.pendingPay) + ' <small>单</small></div><div class="d">待发货 ' + d.todo.pendingShip + ' · 待付款 ' + d.todo.pendingPay + '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>销售趋势</h2><div class="grow"></div>' +
        '<button class="btn sm' + (days === 7 ? ' primary' : '') + '" data-days="7">近 7 天</button>' +
        '<button class="btn sm' + (days === 30 ? ' primary' : '') + '" data-days="30">近 30 天</button>' +
      '</div><div class="card-b"><div class="bars">' + bars + '</div>' +
      '<div class="sub" style="margin-top:8px">近 ' + days + ' 天累计 GMV ' + money(d.trend.reduce((s, x) => s + x.gmv, 0)) +
        ' · 订单 ' + d.trend.reduce((s, x) => s + x.orders, 0) + ' 笔</div></div></div>' +

      '<div class="grid c2">' +
        '<div class="card"><div class="card-h"><h2>待办</h2></div><div class="card-b">' +
          '<div class="todo-item"><span class="n">' + d.todo.pendingShip + '</span><span class="t"><b>待发货订单</b><span>客户已付款，等待你发货</span></span><button class="btn sm" data-goto="orders" data-status="pending_ship">去处理</button></div>' +
          '<div class="todo-item"><span class="n">' + d.todo.pendingPay + '</span><span class="t"><b>待付款订单</b><span>超时未付可关闭并释放库存</span></span><button class="btn sm" data-goto="orders" data-status="pending_pay">去看看</button></div>' +
          '<div class="todo-item"><span class="n">' + d.todo.lowStock + '</span><span class="t"><b>库存预警商品</b><span>库存 ≤ 10 件，及时补货</span></span><button class="btn sm" data-goto="goods" data-lowstock="1">去补货</button></div>' +
        '</div></div>' +
        '<div class="card"><div class="card-h"><h2>热销商品 Top 5</h2><div class="grow"></div><span class="hint">按已付款订单销量</span></div>' +
          '<div class="card-b tight"><div class="table-wrap"><table class="tb"><thead><tr><th>商品</th><th class="num">销量</th><th class="num">销售额</th></tr></thead><tbody>' +
          (d.topGoods.length ? d.topGoods.map((g) => '<tr><td>' + esc(g.name) + '</td><td class="num">' + g.qty + '</td><td class="num money">' + money(g.amount) + '</td></tr>').join('')
            : '<tr><td colspan="3" class="empty">暂无已付款订单</td></tr>') +
          '</tbody></table></div></div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>最近订单</h2><div class="grow"></div><button class="btn sm" data-goto="orders">全部订单 →</button></div>' +
        '<div class="card-b tight"><div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th>订单号</th><th>客户</th><th>商品</th><th class="num">实付</th><th>状态</th><th>下单时间</th><th></th></tr></thead><tbody>' +
        (d.recentOrders.length ? d.recentOrders.map((o) =>
          '<tr><td class="nowrap">' + esc(o.orderNo) + '</td><td>' + esc(o.customer || '—') + '</td>' +
          '<td class="sub">' + esc(o.firstItem).slice(0, 16) + (o.itemCount > 1 ? ' 等 ' + o.itemCount + ' 件' : '') + '</td>' +
          '<td class="num money red">' + money(o.payAmount) + '</td><td>' + (statusTag[o.status] || o.status) + '</td>' +
          '<td class="sub nowrap">' + fmtTime(o.createdAt) + '</td>' +
          '<td><button class="btn text sm" data-order="' + esc(o.orderId) + '">详情</button></td></tr>').join('')
          : '<tr><td colspan="7" class="empty">还没有订单</td></tr>') +
        '</tbody></table></div></div></div>' +

      '<div class="sub" style="text-align:right">统计口径：GMV = 已付款订单实付金额（不含已取消） · 更新于 ' + fmtTime(d.updatedAt) + '</div>';

    body.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
      state.days = Number(b.getAttribute('data-days'));
      App.render();
    }));
    body.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      const target = App.state(b.getAttribute('data-goto'));
      if (b.dataset.status) target.status = b.dataset.status;
      if (b.dataset.lowstock) target.lowStock = '1';
      target.page = 1;
      App.go(b.getAttribute('data-goto'));
    }));
    body.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
      App.views.orders.openDetail(b.getAttribute('data-order'));
    }));
  }
};

/* ============================== 视图：店铺设置 ============================== */

App.views.settings = {
  async render(body, state) {
    const d = await API.get('/api/admin/settings');
    const s = d.settings;
    const row = (label, tip, input) =>
      '<div class="form-row"><div class="lbl">' + esc(label) + '</div><div class="ctl">' + input +
      (tip ? '<div class="tip">' + tip + '</div>' : '') + '</div></div>';

    body.innerHTML =
      '<div class="grid c2">' +
        '<div class="card"><div class="card-h"><h2>基本信息</h2><div class="grow"></div><span class="hint">小程序端展示用</span></div><div class="card-b">' +
          row('店铺名称', '', '<input type="text" class="w220" data-k="shopName" value="' + esc(s.shopName) + '">') +
          row('店铺 Logo', '建议 200×200 PNG，用于「我的」页与分享卡片', '<input type="text" class="w220" data-k="logo" value="' + esc(s.logo) + '" placeholder="图片地址"><button class="btn" data-pick="logo">选图</button>') +
          row('客服电话', '', '<input type="text" class="w160" data-k="servicePhone" value="' + esc(s.servicePhone) + '">') +
          row('客服时间', '', '<input type="text" class="w160" data-k="serviceHours" value="' + esc(s.serviceHours) + '">') +
          row('店铺公告', '', '<input type="text" class="w220" style="flex:1" data-k="notice" value="' + esc(s.notice) + '">') +
        '</div></div>' +

        '<div class="card"><div class="card-h"><h2>交易设置</h2></div><div class="card-b">' +
          row('包邮门槛', '全场满此金额免运费；填 0 表示不启用（单位：元）', '<input type="number" class="w90" data-k="freightFree" value="' + (s.freightFree / 100) + '"><span class="sub">元</span>') +
          row('默认运费', '未达包邮门槛时的运费（单位：元）', '<input type="number" class="w90" data-k="defaultFreight" value="' + (s.defaultFreight / 100) + '"><span class="sub">元</span>') +
          row('自动确认收货', '发货后多少天自动确认（0 = 不自动）', '<input type="number" class="w90" data-k="autoConfirmDays" value="' + s.autoConfirmDays + '"><span class="sub">天</span>') +
          row('支付超时', '下单后多少分钟未付款自动关闭', '<input type="number" class="w90" data-k="payExpireMinutes" value="' + s.payExpireMinutes + '"><span class="sub">分钟</span>') +
        '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>数据资产</h2><div class="grow"></div><span class="hint">存放于 server/data/catalog.json，后台改完立刻生效</span></div>' +
      '<div class="card-b"><div class="grid c3">' +
        '<div><div class="sub">商品</div><b>' + d.goodsCount + '</b> 个</div>' +
        '<div><div class="sub">分类</div><b>' + d.categoryCount + '</b> 个</div>' +
        '<div><div class="sub">优惠券模板</div><b>' + d.couponCount + '</b> 张</div>' +
      '</div></div></div>' +

      '<div class="btn-group"><button class="btn primary" data-save>保存设置</button>' +
      '<button class="btn" data-reset>恢复默认</button>' +
      '<span class="sub" style="align-self:center">保存后小程序端「我的」页与下单页会读取新值</span></div>';

    /** 收集表单：金额字段「元 → 分」 */
    const collect = () => {
      const g = (k, def) => {
        const el = body.querySelector('[data-k="' + k + '"]');
        return el ? el.value : def;
      };
      return {
        shopName: g('shopName'),
        logo: g('logo'),
        servicePhone: g('servicePhone'),
        serviceHours: g('serviceHours'),
        notice: g('notice'),
        freightFree: Math.round(Number(g('freightFree') || 0) * 100),
        defaultFreight: Math.round(Number(g('defaultFreight') || 0) * 100),
        autoConfirmDays: Math.round(Number(g('autoConfirmDays') || 0)),
        payExpireMinutes: Math.round(Number(g('payExpireMinutes') || 0))
      };
    };

    body.querySelector('[data-pick]').addEventListener('click', async () => {
      const r = await pickImage({ value: [body.querySelector('[data-k=logo]').value].filter(Boolean) });
      if (r && r.length) body.querySelector('[data-k=logo]').value = r[0];
    });
    body.querySelector('[data-save]').addEventListener('click', async () => {
      try {
        await API.post('/api/admin/settings/save', collect());
        toast('设置已保存');
      } catch (e) { toast(e.message, true); }
    });
    body.querySelector('[data-reset]').addEventListener('click', async () => {
      if (!(await confirmBox('恢复为默认设置？当前填写内容会丢失。'))) return;
      try {
        await API.post('/api/admin/settings/save', d.defaults);
        toast('已恢复默认');
        App.render();
      } catch (e) { toast(e.message, true); }
    });
  }
};

/* ============================== 启动 ============================== */

function boot() {
  $('#btnReload').addEventListener('click', () => App.render());
  const hash = (location.hash || '').replace('#', '');
  App.view = App.views[hash] ? hash : 'dashboard';
  App.renderNav();
  App.render();
  App.refreshBadges();
  window.addEventListener('hashchange', () => {
    const v = (location.hash || '').replace('#', '');
    if (App.views[v] && v !== App.view) { App.view = v; App.renderNav(); App.render(); }
  });
}
