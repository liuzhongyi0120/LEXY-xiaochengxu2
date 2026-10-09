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

/** 输入框弹层（新建 / 重命名文件夹等场景），返回 Promise<string|null>；取消返回 null */
function promptBox(title, defaultValue, placeholder) {
  return new Promise((resolve) => {
    const m = openModal({
      title: title,
      width: 'narrow',
      html: '<div class="field" style="padding:4px 0"><input type="text" data-input style="flex:1" placeholder="' +
        esc(placeholder || '') + '" value="' + esc(defaultValue || '') + '"></div>',
      footer: '<button class="btn" data-cancel>取消</button><button class="btn primary" data-ok>确定</button>'
    });
    const input = m.root.querySelector('[data-input]');
    const done = (v) => { m.close(); resolve(v); };
    setTimeout(() => { input.focus(); input.select(); }, 30);
    m.root.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    m.root.querySelector('[data-ok]').addEventListener('click', () => done(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      if (e.key === 'Escape') done(null);
    });
    // 点遮罩或右上角 × 也要收尾，否则 Promise 永远挂起（调用方 await 后整段逻辑不执行）
    m.root.addEventListener('click', (e) => {
      if (e.target === m.root || e.target.hasAttribute('data-close')) done(null);
    });
  });
}

/* ============================== 大图预览 ============================== */

/**
 * 大图预览浮层（素材库点缩略图打开）
 *
 * 四个刻意的取舍，都是为了让「看图」这件事不出岔子：
 *   ① 由调用方传入**当前这一页的整个列表** + 当前下标，而不是只传一张图的地址。
 *      这样 ←/→ 翻的就是「你正在看的这个筛选结果」，预览层不必自己再发一次请求 ——
 *      也就不会出现「预览里的顺序和网格里的顺序对不上」这种事后很难查的错位。
 *   ② 切换只改 <img> 的 src，不重建浮层：重建会让遮罩闪一下。
 *      相邻一张提前 `new Image()` 预载，翻页不空等（视频不预载，代价不成比例）。
 *   ③ 加载失败必须给可见提示 + 兜底入口 —— 素材可能刚在别处被删掉，
 *      此时白屏会让人以为「后台坏了」，而不是「这张图没了」。
 *   ④ 键盘监听挂在 document 上，关闭时必须解绑：否则关掉预览后按 ←/→，
 *      事件还会打到已经不在屏幕上的浮层上。
 *
 * 视频分支（kind === 'video'）：
 *   同一套翻页 / 删除 / 下载逻辑，只是把 <img> 换成 <video controls>；
 *   切走或关闭时**必须 pause + 清 src**，否则会在后台继续缓冲、甚至继续出声。
 *
 * @param {{list:Array, index?:number, actions?:boolean,
 *          onDelete?:Function, onPick?:Function, pickText?:string}} opt
 *        onDelete(item) 返回 Promise<boolean>，resolve true 表示「确实删掉了」，
 *        浮层会把它从当前列表里摘掉并跳到下一张（全删光则自动关闭）。
 * @returns {{close:Function}}
 */
/**
 * 下载一个素材（预览浮层与卡片的「下载」共用这一份实现）
 *   - 本站素材（/uploads/… 或同源）：<a download> 直接落盘，文件名取原始名
 *   - 外链（有赞 CDN 等）：跨域下 download 属性会被忽略，只能新窗口打开
 * 抽出来的原因和删除一样：两处各写一份，迟早会有一处忘了处理外链。
 */
function downloadUrl(it) {
  const url = (it && it.url) ? it.url : String(it || '');
  if (!url) return;
  const same = url.indexOf('/uploads/') === 0 || url.indexOf(location.origin) === 0;
  const a = document.createElement('a');
  a.href = url;
  if (same) a.download = String((it && (it.orig || it.name)) || 'media').replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_');
  else a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function lightbox(opt) {
  const list = (opt.list || []).filter((x) => x && x.url).slice();
  if (!list.length) return { close() {} };

  let i = Math.min(Math.max(0, Number(opt.index) || 0), list.length - 1);
  const showActions = opt.actions !== false;
  const single = list.length < 2;

  const el = document.createElement('div');
  el.className = 'lb';
  el.innerHTML =
    '<div class="lb-h">' +
      '<div class="lb-t"><b data-name></b><span class="lb-meta" data-meta></span></div>' +
      '<span class="grow"></span>' +
      (single ? '' : '<span class="lb-idx" data-idx></span>') +
      '<button class="lb-x" data-close title="关闭（Esc）">×</button>' +
    '</div>' +
    '<div class="lb-stage">' +
      (single ? '' : '<button class="lb-nav prev" data-prev title="上一张（←）">‹</button>') +
      '<div class="lb-view">' +
        '<img data-img alt="">' +
        '<video data-video controls playsinline preload="metadata" hidden></video>' +
        '<div class="lb-tip" data-tip>加载中…</div>' +
        '<div class="lb-err" data-err hidden>' +
          '<b data-errtitle>加载失败</b>' +
          '<span class="sub" data-errmeta></span>' +
          '<button class="btn sm" data-new>在新窗口打开</button>' +
        '</div>' +
      '</div>' +
      (single ? '' : '<button class="lb-nav next" data-next title="下一张（→）">›</button>') +
    '</div>' +
    '<div class="lb-f">' +
      '<span class="grow"></span>' +
      (opt.onPick ? '<button class="btn sm primary" data-pickbtn>' + esc(opt.pickText || '使用这张') + '</button>' : '') +
      (showActions
        ? '<button class="btn sm" data-copy>复制地址</button>' +
          '<button class="btn sm" data-down>下载</button>'
        : '') +
      (opt.onDelete ? '<button class="btn sm danger" data-del>删除</button>' : '') +
    '</div>';

  const q = (s) => el.querySelector(s);
  const img = q('[data-img]');
  const vid = q('[data-video]');
  const tip = q('[data-tip]');
  const errBox = q('[data-err]');

  /** 是不是视频：优先看后端的 kind，外链（导入的旧素材）则用扩展名兜底 */
  const isVideo = (it) => (it.kind ? it.kind === 'video' : /\.(mp4|m4v|mov|webm)(\?|$)/i.test(String(it.url || '')));

  /** 只换 src，不重建浮层；同一张重复渲染时跳过赋值（同 src 再赋值不会重新触发 load） */
  const show = () => {
    const it = list[i];
    const video = isVideo(it);
    q('[data-name]').textContent = it.orig || it.name || '';
    const bits = [];
    if (it.width && it.height) bits.push(it.width + '×' + it.height);
    if (it.size) bits.push((it.size / 1024).toFixed(0) + 'KB');
    if (video && it.durationText) bits.push('时长 ' + it.durationText);
    if (it.folder) bits.push('文件夹：' + it.folder);
    q('[data-meta]').textContent = bits.join('  ·  ');
    const idxEl = q('[data-idx]');
    if (idxEl) idxEl.textContent = (i + 1) + ' / ' + list.length;

    errBox.setAttribute('hidden', '');
    q('[data-errtitle]').textContent = video ? '视频加载失败' : '图片加载失败';

    // 切换时把用不到的那一路彻底停掉：视频不 pause + 清 src 会在后台继续下载 / 出声
    if (video) {
      img.setAttribute('hidden', '');
      img.removeAttribute('src');
      vid.removeAttribute('hidden');
      if (vid.getAttribute('src') !== it.url) {
        vid.setAttribute('src', it.url);
        tip.textContent = '加载中…';
        tip.removeAttribute('hidden');
      } else {
        tip.setAttribute('hidden', '');
      }
    } else {
      vid.pause();
      vid.setAttribute('hidden', '');
      vid.removeAttribute('src');   // 清 src 才会真正停止缓冲，只 hidden 不够
      vid.load();
      img.removeAttribute('hidden');
      if (img.getAttribute('src') !== it.url) {
        tip.textContent = '加载中…';
        tip.removeAttribute('hidden');
        img.setAttribute('src', it.url);
        // 命中缓存时浏览器不会派发 load 事件（网格里的缩略图早就把这张拉过了），
        // 不校对的话「加载中…」会一直挂着。这里补一次判定。
        const settle = () => { if (img.complete && img.naturalWidth > 0) tip.setAttribute('hidden', ''); };
        settle();
        setTimeout(settle, 60);
      }
    }
    // 预载下一张：翻页时不至于先看到空白（视频不预载 —— 视频首帧要 Range 拉一段，代价不成比例）
    if (!single) {
      const nextIt = list[(i + 1) % list.length];
      if (nextIt && nextIt.url !== it.url && !isVideo(nextIt)) { const pre = new Image(); pre.src = nextIt.url; }
    }
    q('[data-errmeta]').textContent = it.url;
  };

  const fail = () => {
    tip.setAttribute('hidden', '');
    errBox.removeAttribute('hidden');
  };
  img.addEventListener('load', () => tip.setAttribute('hidden', ''));
  img.addEventListener('error', fail);
  // 视频：loadeddata 之前撤占位；错误（格式不支持 / 文件没了）同样给可见提示
  vid.addEventListener('loadeddata', () => tip.setAttribute('hidden', ''));
  vid.addEventListener('error', fail);

  const step = (d) => { i = (i + d + list.length) % list.length; show(); };
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (single) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // 关掉浮层必须停掉视频：只 remove 节点的话，部分浏览器会把已经缓冲的片段继续播完
    vid.pause();
    vid.removeAttribute('src');
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevOverflow;
    el.remove();
    if (opt.onClose) opt.onClose();
  };

  q('[data-close]').addEventListener('click', close);
  const pv = q('[data-prev]'); if (pv) pv.addEventListener('click', () => step(-1));
  const nx = q('[data-next]'); if (nx) nx.addEventListener('click', () => step(1));

  // 复制地址：非 https 环境（内网 http）没有 clipboard API，退化为直接显示地址
  const cp = q('[data-copy]');
  if (cp) cp.addEventListener('click', async () => {
    const u = list[i].url;
    try { await navigator.clipboard.writeText(u); toast('已复制：' + u); } catch (e) { toast(u); }
  });

  const dn = q('[data-down]');
  if (dn) dn.addEventListener('click', () => downloadUrl(list[i]));

  const pk = q('[data-pickbtn]');
  if (pk) pk.addEventListener('click', () => { const it = list[i]; close(); opt.onPick(it); });

  // 加载失败时的兜底出口：至少让人能拿到地址，而不是只看到一个「失败」
  const nw = q('[data-new]');
  if (nw) nw.addEventListener('click', () => { try { window.open(list[i].url, '_blank', 'noopener'); } catch (e) { /* 弹窗被拦也不影响其它操作 */ } });

  const dl = q('[data-del]');
  if (dl) dl.addEventListener('click', async () => {
    const ok = await opt.onDelete(list[i]);
    if (!ok) return;
    list.splice(i, 1);
    if (!list.length) { close(); return; }
    if (i >= list.length) i = 0;            // 删的是最后一张 → 回绕，而不是越界取到 undefined
    show();
  });

  /*
   * 点空白处关闭。
   * 判定必须用「点到的**元素**是不是媒体本身」，不能用容器（早先写成 `.lb-view`）——
   * `.lb-view` 是铺满整个舞台的 flex 容器，图片四周的留白全都在它里面，
   * 于是"点空白关不掉、只有点最外圈几像素才关"，等于这个功能形同虚设。
   * 现在：点在图片 / 视频上不关（凑近看细节时最容易误触），其余任何位置一律关闭。
   */
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) return;
    if (t.closest && (t.closest('.lb-nav') || t.closest('.lb-h') || t.closest('.lb-f') || t.closest('.lb-err'))) return;
    close();
  });

  document.addEventListener('keydown', onKey, true);
  (document.getElementById('layer') || document.body).appendChild(el);
  show();

  return { close: close };
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
            '<div class="media-it">' +
              '<div class="mt"><img src="' + esc(up.url) + '" alt=""></div>' +
              '<div class="inf"><div class="nm">' + esc(f.name) + '</div>' +
              '<div class="meta">' + up.width + '×' + up.height + '</div></div></div>');
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
        const d = await API.get('/api/media/list', { q, sort, page: 1, size: 60, kind: 'image' });
        root.querySelector('[data-stat]').textContent = `共 ${d.stat.count} 张 · 占用 ${(d.stat.bytes / 1024 / 1024).toFixed(1)}MB`;
        root.querySelector('[data-liblist]').innerHTML = d.list.length
          ? d.list.map((it, i) =>
            '<div class="media-it" data-pick="' + esc(it.url) + '">' +
              '<div class="mt"><img src="' + esc(it.url) + '" alt="">' +
                '<button class="zoombtn" data-zoom="' + i + '" title="查看大图">' +
                  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" ' +
                  'stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.2"/>' +
                  '<path d="M10.2 10.2 13.5 13.5M7 5.2v3.6M5.2 7h3.6"/></svg></button>' +
              '</div>' +
              '<div class="inf"><div class="nm" title="' + esc(it.orig || it.name) + '">' + esc(it.orig || it.name) + '</div>' +
              '<div class="meta">' + it.width + '×' + it.height + (it.sizeText ? ' · ' + it.sizeText : '') + '</div></div>' +
            '</div>').join('')
          : '<div class="empty-state">素材库里还没有图片（视频素材请在「素材库」页面管理）</div>';
        // 这里点卡片 = 选图（选图是这个弹层的主操作），所以「看大图」单独做成角标按钮，
        // 且点它时 stopPropagation —— 否则看一眼大图就把图选上了，一次误触要手动取消。
        root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = b.closest('.media-it');
          lightbox({
            list: d.list,
            index: Number(b.getAttribute('data-zoom')) || 0,
            pickText: '使用这张',
            onPick: (it) => {
              add(it.url);
              if (card) card.classList.add('sel');
            }
          });
        }));
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

/*
 * 侧栏图标：原来用的是 ▤ ▦ ☺ ▣ ☰ ✦ ◈ ▨ ✎ ⚙ 这些字符，
 * 依赖系统字体里有没有对应字形 —— 实测「店铺装修」的 ✎ 在 Windows 上被字体回退成了「↘」，
 * 同一排里还有实心/空心/线框三种风格，看着像拼凑的。
 * 这里改成内联 SVG（16×16，stroke=currentColor），统一线性风格且不依赖字体。
 */
const ICONS = {
  dashboard: '<rect x="2.4" y="2.4" width="4.9" height="4.9" rx="1.1"/><rect x="8.7" y="2.4" width="4.9" height="4.9" rx="1.1"/>' +
    '<rect x="2.4" y="8.7" width="4.9" height="4.9" rx="1.1"/><rect x="8.7" y="8.7" width="4.9" height="4.9" rx="1.1"/>',
  orders: '<path d="M3.2 2.4h9.6v11.2l-1.7-1.2-1.6 1.2-1.5-1.2-1.6 1.2-1.6-1.2-1.6 1.2z"/>' +
    '<path d="M5.6 6.2h4.8M5.6 8.8h3.1"/>',
  customers: '<circle cx="8" cy="5.6" r="2.5"/><path d="M3.1 13.6c0-2.5 2.2-4.1 4.9-4.1s4.9 1.6 4.9 4.1"/>',
  goods: '<path d="M8 1.9 13.7 5v6L8 14.1 2.3 11V5z"/><path d="M2.6 5.2 8 8.2l5.4-3M8 8.2v5.7"/>',
  categories: '<path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h10.8"/>',
  comments: '<path d="M13.6 8.4c0 2.5-2.5 4.5-5.6 4.5-.7 0-1.4-.1-2-.3L2.9 14l.9-2.4C3.1 10.7 2.4 9.6 2.4 8.4 2.4 5.9 4.9 3.9 8 3.9s5.6 2 5.6 4.5z"/>',
  marketing: '<path d="M2.4 6.4h2.3L10 3.5v9L4.7 9.6H2.4z"/><path d="M5.6 9.6v2.2a1.2 1.2 0 0 0 2.4 0v-1.3"/>' +
    '<path d="M12 6.3a2.5 2.5 0 0 1 0 3.4"/>',
  media: '<rect x="2.4" y="3" width="11.2" height="10" rx="1.5"/><circle cx="5.9" cy="6.4" r="1.1"/>' +
    '<path d="M2.7 11.1 6.1 8.2l2.3 2 1.9-1.6 2.9 2.5"/>',
  decorate: '<path d="M11.3 2.4 13.6 4.7 6.2 12.1l-2.9.7.7-2.9z"/><path d="M9.7 4 12 6.3"/>',
  settings: '<circle cx="8" cy="8" r="2.1"/>' +
    '<path d="M8 2.1v1.5M8 12.4v1.5M13.9 8h-1.5M3.6 8H2.1M12.2 3.8l-1.1 1.1M4.9 11.1l-1.1 1.1M12.2 12.2l-1.1-1.1M4.9 4.9 3.8 3.8"/>'
};

/** 生成一个侧栏图标；名字不在表里就返回空串，不会画出一个方框里带问号的破图 */
function navIcon(name) {
  const p = ICONS[name];
  if (!p) return '';
  return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

const NAV = [
  { group: '经营' },
  { key: 'dashboard', text: '数据概览', ico: 'dashboard' },
  { key: 'orders', text: '订单管理', ico: 'orders' },
  { key: 'customers', text: '客户管理', ico: 'customers' },
  { group: '商品' },
  { key: 'goods', text: '商品管理', ico: 'goods' },
  { key: 'categories', text: '分类管理', ico: 'categories' },
  { key: 'comments', text: '评价管理', ico: 'comments' },
  { group: '营销与内容' },
  { key: 'marketing', text: '优惠券', ico: 'marketing' },
  { key: 'media', text: '素材库', ico: 'media' },
  { key: 'decorate', text: '店铺装修', ico: 'decorate' },
  { group: '系统' },
  { key: 'settings', text: '店铺设置', ico: 'settings' }
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
        '<span class="ico">' + navIcon(n.ico) + '</span><span>' + esc(n.text) + '</span>' +
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
    body.innerHTML = '<div class="empty-state"><span class="spinner"></span>加载中…</div>';
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

    /*
     * 柱状图：原来所有柱子都走 Math.max(3, …)，GMV=0 的那天也会画出一根 3px 的红色短线，
     * 浮在图表底部看着像误画的横线。现在 0 值改画一根浅灰的「零值刻度」，与真柱子明确区分；
     * 整段区间全是 0 时直接不画图，给一句空态，避免 7 根灰线让人以为页面坏了。
     */
    const totalGmv = d.trend.reduce((s, x) => s + x.gmv, 0);
    const max = Math.max.apply(null, d.trend.map((x) => x.gmv).concat([1]));
    const bars = d.trend.map((x) => {
      const has = x.gmv > 0;
      const tip = esc(x.label) + '：GMV ' + money(x.gmv) + '，订单 ' + x.orders + ' 笔';
      return '<div class="b" title="' + tip + '">' +
        (has
          ? '<div class="bar" style="height:' + Math.max(4, Math.round(x.gmv / max * 138)) + 'px">' +
            '<span class="val">' + wan(x.gmv) + '</span></div>'
          : '<div class="bar zero" title="' + esc(x.label) + '：当日无成交"></div>') +
        '<div class="lb">' + esc(x.label) + '</div></div>';
    }).join('');
    const chartHtml = totalGmv === 0
      ? '<div class="chart-empty">近 ' + days + ' 天还没有已付款订单，暂时没有趋势可画</div>'
      : '<div class="bars">' + bars + '</div>';

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
      '</div><div class="card-b">' + chartHtml +
      '<div class="sub" style="margin-top:8px">近 ' + days + ' 天累计 GMV ' + money(totalGmv) +
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
