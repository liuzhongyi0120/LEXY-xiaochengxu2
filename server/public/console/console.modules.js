/**
 * 后台控制台 · 业务模块
 * 商品 / 分类 / 订单 / 客户 / 优惠券 / 评价 / 素材库 / 店铺装修
 *
 * 依赖 console.core.js 提供的：API、esc、money、fmtTime、toast、openModal、confirmBox、pagerHtml、bindPager、pickImage
 */

/* ============================== 公共小工具 ============================== */

/** 分类扁平化（用于下拉）：一级分类 + 缩进的二级 */
function categoryOptions(categories, includeAll) {
  const out = includeAll ? [{ id: '', name: '全部分类' }] : [];
  (categories || []).forEach((c) => {
    out.push({ id: c.id, name: c.name });
    (c.children || []).forEach((x) => out.push({ id: x.id, name: '　└ ' + x.name }));
  });
  return out;
}

function optionsHtml(list, value) {
  return list.map((o) => '<option value="' + esc(o.id) + '"' + (String(o.id) === String(value == null ? '' : value) ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('');
}

/** 防抖：输入框用 */
function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms || 300);
  };
}

/** 表格空行 */
const emptyRow = (cols, text) => '<tr><td colspan="' + cols + '" class="empty">' + esc(text || '暂无数据') + '</td></tr>';

/* ============================== 视图：商品管理 ============================== */

App.views.goods = {
  async render(body, state) {
    const d = await API.get('/api/admin/goods/list', {
      keyword: state.keyword, categoryId: state.categoryId, status: state.status,
      lowStock: state.lowStock, sort: state.sort, page: state.page || 1, size: 20
    });
    const cats = d.categories;
    const catName = (id) => {
      let name = id;
      cats.forEach((c) => {
        if (c.id === id) name = c.name;
        (c.children || []).forEach((x) => { if (x.id === id) name = c.name + ' / ' + x.name; });
      });
      return name || '未分类';
    };

    body.innerHTML =
      '<div class="card"><div class="filter">' +
        '<input type="text" class="w220" placeholder="搜索商品名称 / ID" data-kw value="' + esc(state.keyword || '') + '">' +
        '<select class="w150" data-cat>' + optionsHtml(categoryOptions(cats, true), state.categoryId) + '</select>' +
        '<select class="w120" data-status>' +
          ['', 'on_sale', 'off_sale'].map((v) => '<option value="' + v + '"' + (state.status === v ? ' selected' : '') + '>' + ({ '': '全部状态', on_sale: '在售中', off_sale: '已下架' }[v]) + '</option>').join('') +
        '</select>' +
        '<select class="w120" data-sort>' +
          [['', '默认排序'], ['sales', '销量优先'], ['price_desc', '价格高→低'], ['price_asc', '价格低→高'], ['stock_asc', '库存少→多']]
            .map(([v, t]) => '<option value="' + v + '"' + (state.sort === v ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select>' +
        '<label class="ck"><input type="checkbox" data-low' + (state.lowStock === '1' ? ' checked' : '') + '>仅看库存预警</label>' +
        '<div class="grow" style="flex:1"></div>' +
        '<button class="btn" data-up>批量上架</button>' +
        '<button class="btn" data-down>批量下架</button>' +
        '<button class="btn primary" data-new>+ 新建商品</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th style="width:34px"><input type="checkbox" data-all></th>' +
        '<th>商品</th><th>分类</th><th class="num">价格</th><th class="num">库存</th><th class="num">销量</th><th>状态</th><th style="width:210px">操作</th>' +
      '</tr></thead><tbody>' +
      (d.list.length ? d.list.map((g) =>
        '<tr data-id="' + esc(g.id) + '">' +
          '<td><input type="checkbox" data-ck="' + esc(g.id) + '"></td>' +
          '<td><div class="cell-main"><img class="thumb" src="' + esc(g.cover) + '" alt="">' +
            '<div class="tt"><b>' + esc(g.name) + '</b><span>ID ' + esc(g.id) + ' · ' + (g.tags || []).map((t) => '<span class="tag ghost">' + esc(t) + '</span>').join(' ') + '</span></div></div></td>' +
          '<td class="sub">' + esc(catName(g.categoryId)) + '</td>' +
          '<td class="num money">' + (g.priceMax && g.priceMax !== g.price ? money(g.price) + '~' + fen2yuan(g.priceMax) : money(g.price)) + '</td>' +
          '<td class="num">' + (g.stock <= 10 ? '<span class="tag warn">' + g.stock + '</span>' : g.stock) + '</td>' +
          '<td class="num sub">' + g.sales + '</td>' +
          '<td>' + (g.status === 'on_sale' ? '<span class="tag on">在售</span>' : '<span class="tag off">已下架</span>') + '</td>' +
          '<td class="nowrap">' +
            '<button class="btn text sm" data-edit="' + esc(g.id) + '">编辑</button>' +
            '<button class="btn text sm" data-stock="' + esc(g.id) + '">改库存</button>' +
            '<button class="btn text sm" data-toggle="' + esc(g.id) + '" data-to="' + (g.status === 'on_sale' ? 'off_sale' : 'on_sale') + '">' + (g.status === 'on_sale' ? '下架' : '上架') + '</button>' +
            '<button class="btn text sm red" data-del="' + esc(g.id) + '">删除</button>' +
          '</td>' +
        '</tr>').join('') : emptyRow(8, '没有匹配的商品')) +
      '</tbody></table></div>' + pagerHtml(d.total, d.page, d.size) + '</div>';

    /* --- 筛选 --- */
    const reload = () => App.render();
    body.querySelector('[data-kw]').addEventListener('input', debounce((e) => { state.keyword = e.target.value.trim(); state.page = 1; reload(); }, 350));
    body.querySelector('[data-cat]').addEventListener('change', (e) => { state.categoryId = e.target.value; state.page = 1; reload(); });
    body.querySelector('[data-status]').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; reload(); });
    body.querySelector('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; reload(); });
    body.querySelector('[data-low]').addEventListener('change', (e) => { state.lowStock = e.target.checked ? '1' : ''; state.page = 1; reload(); });
    bindPager(body, state, reload);

    /* --- 勾选 --- */
    const checked = () => Array.from(body.querySelectorAll('[data-ck]:checked')).map((el) => el.getAttribute('data-ck'));
    body.querySelector('[data-all]').addEventListener('change', (e) => {
      body.querySelectorAll('[data-ck]').forEach((el) => { el.checked = e.target.checked; });
    });

    const batchStatus = async (status) => {
      const ids = checked();
      if (!ids.length) return toast('请先勾选商品', true);
      try {
        const r = await API.post('/api/admin/goods/status', { ids, status });
        toast((status === 'on_sale' ? '已上架 ' : '已下架 ') + r.changed.length + ' 个商品');
        App.refreshBadges();
        reload();
      } catch (e) { toast(e.message, true); }
    };
    body.querySelector('[data-up]').addEventListener('click', () => batchStatus('on_sale'));
    body.querySelector('[data-down]').addEventListener('click', () => batchStatus('off_sale'));

    /* --- 行内操作 --- */
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => this.openEditor(b.getAttribute('data-edit'))));
    body.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => this.openEditor(null)));
    body.querySelectorAll('[data-stock]').forEach((b) => b.addEventListener('click', () => this.openStock(b.getAttribute('data-stock'))));
    body.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.post('/api/admin/goods/status', { ids: [b.getAttribute('data-toggle')], status: b.getAttribute('data-to') });
        toast('状态已更新');
        App.refreshBadges();
        reload();
      } catch (e) { toast(e.message, true); }
    }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-del');
      if (!(await confirmBox('删除商品 <b>' + esc(id) + '</b>？<br><span class="sub">有订单记录的商品不能删除，只能下架。</span>', '删除'))) return;
      try {
        await API.post('/api/admin/goods/delete', { id });
        toast('已删除');
        reload();
      } catch (e) { toast(e.message, true); }
    }));
  },

  /** 快速改库存 */
  async openStock(id) {
    const d = await API.get('/api/admin/goods/detail', { id });
    const g = d.goods;
    const m = openModal({
      title: '改库存 · ' + g.name,
      html: '<div class="table-wrap"><table class="sku-tb"><thead><tr><th>规格</th><th style="width:130px">当前库存</th><th style="width:130px">改为</th></tr></thead><tbody>' +
        g.skus.map((s) => '<tr><td>' + esc(s.specs && s.specs.length ? s.specs.join(' / ') : '默认规格') + '</td>' +
          '<td>' + s.stock + '</td>' +
          '<td><input type="number" min="0" data-sku="' + esc(s.skuId) + '" value="' + s.stock + '"></td></tr>').join('') +
        '</tbody></table></div><div class="sub" style="margin-top:8px">库存是下单扣减的唯一依据，改完小程序端立刻生效。</div>',
      footer: '<div class="grow"></div><button class="btn" data-close>取消</button><button class="btn primary" data-ok>保存</button>'
    });
    m.root.querySelector('[data-ok]').addEventListener('click', async () => {
      const items = Array.from(m.root.querySelectorAll('[data-sku]')).map((el) => ({ skuId: el.getAttribute('data-sku'), value: Number(el.value || 0) }));
      try {
        await API.post('/api/admin/goods/stock', { items, mode: 'set' });
        m.close();
        toast('库存已更新');
        App.refreshBadges();
        App.render();
      } catch (e) { toast(e.message, true); }
    });
  },

  /** 新建 / 编辑商品 */
  async openEditor(id) {
    const d = await API.get('/api/admin/goods/detail', id ? { id } : {});
    const g = Object.assign({
      id: '', name: '', subtitle: '', categoryId: '', tags: [], cover: '', images: [], detailImages: [],
      description: '', status: 'on_sale', skus: [{ specs: [], price: 0, originalPrice: 0, stock: 0, image: '' }]
    }, d.goods || {});
    const cats = d.categories;
    let skus = JSON.parse(JSON.stringify(g.skus || []));
    let images = (g.images || []).slice();
    let detailImages = (g.detailImages || []).slice();
    let cover = g.cover || '';

    const m = openModal({
      title: id ? '编辑商品 · ' + g.name : '新建商品',
      width: 'wide',
      html:
        '<div class="form-row"><div class="lbl">商品名称</div><div class="ctl"><input type="text" style="flex:1" data-f="name" value="' + esc(g.name) + '" placeholder="必填，例如：莱克立式吸尘器 · 轻量长续航系列"></div></div>' +
        '<div class="form-row"><div class="lbl">副标题</div><div class="ctl"><input type="text" style="flex:1" data-f="subtitle" value="' + esc(g.subtitle || '') + '" placeholder="卖点一句话，列表页展示"></div></div>' +
        '<div class="form-row"><div class="lbl">分类</div><div class="ctl">' +
          '<select data-f="categoryId">' + optionsHtml(categoryOptions(cats, false), g.categoryId) + '</select>' +
          '<select data-f="status"><option value="on_sale"' + (g.status !== 'off_sale' ? ' selected' : '') + '>上架销售</option><option value="off_sale"' + (g.status === 'off_sale' ? ' selected' : '') + '>暂不上架</option></select>' +
          '<span class="tip">分类在「分类管理」里维护</span></div></div>' +
        '<div class="form-row"><div class="lbl">卖点标签</div><div class="ctl"><input type="text" style="flex:1" data-f="tags" value="' + esc((g.tags || []).join(',')) + '" placeholder="逗号分隔，如：新品,热销（最多 6 个）"></div></div>' +

        '<div class="form-row"><div class="lbl">商品主图</div><div class="ctl"><div class="img-list" data-cover></div>' +
          '<span class="tip">列表与详情页的第一张图，建议 1:1 或 4:3</span></div></div>' +
        '<div class="form-row"><div class="lbl">商品图集</div><div class="ctl"><div class="img-list" data-images></div>' +
          '<span class="tip">最多 12 张，第一张默认作为主图；支持拖拽/粘贴上传</span></div></div>' +

        '<div class="form-row"><div class="lbl">详情长图</div><div class="ctl"><div class="img-list" data-detailimgs></div>' +
          '<span class="tip">最多 20 张，按顺序拼在详情页「商品详情」区（建议 750 宽长图）；留空则显示默认占位内容</span></div></div>' +

        '<div class="form-row"><div class="lbl">图文描述</div><div class="ctl"><textarea rows="3" style="flex:1" data-f="description" placeholder="商品卖点描述">' + esc(g.description || '') + '</textarea></div></div>' +

        '<div class="form-row"><div class="lbl">规格 / 库存</div><div class="ctl" style="display:block">' +
          '<table class="sku-tb"><thead><tr>' +
            '<th style="width:34%">规格（逗号分隔）</th><th style="width:19%">售价(元)</th><th style="width:19%">划线价(元)</th><th style="width:15%">库存</th><th style="width:13%"></th>' +
          '</tr></thead><tbody data-skus></tbody></table>' +
          '<div class="btn-group" style="margin-top:8px"><button class="btn sm" data-addsku>+ 添加规格</button>' +
          '<span class="sub" style="align-self:center">单规格商品只保留一行，规格留空即可</span></div>' +
        '</div></div>',

      footer: '<span class="grow sub">保存后小程序端立即生效（商品接口直接读这份数据）</span>' +
        '<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存商品</button>'
    });
    const root = m.root;

    /* 图片槽位 */
    const renderCover = () => {
      root.querySelector('[data-cover]').innerHTML =
        (cover ? '<div class="img-slot filled" style="background-image:url(' + esc(cover) + ')"><button class="del" data-rmcover>×</button></div>' : '') +
        '<div class="img-slot add" data-pickcover title="选择主图">+</div>';
      root.querySelector('[data-pickcover]').addEventListener('click', async () => {
        const r = await pickImage({ value: cover ? [cover] : [] });
        if (r) { cover = r[0] || ''; renderCover(); }
      });
      const rm = root.querySelector('[data-rmcover]');
      if (rm) rm.addEventListener('click', () => { cover = ''; renderCover(); });
    };
    const renderImages = () => {
      root.querySelector('[data-images]').innerHTML =
        images.map((u, i) => '<div class="img-slot filled" style="background-image:url(' + esc(u) + ')"><button class="del" data-rm="' + i + '">×</button><span class="lv">' + (i + 1) + '</span></div>').join('') +
        '<div class="img-slot add" data-pickimgs title="添加图片">+</div>';
      root.querySelector('[data-pickimgs]').addEventListener('click', async () => {
        const r = await pickImage({ multi: true, max: 12, value: images });
        if (r) { images = r.slice(0, 12); renderImages(); }
      });
      root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
        images.splice(Number(b.getAttribute('data-rm')), 1);
        renderImages();
      }));
    };
    /* 详情长图：与图集同一套交互，但顺序即展示顺序（长条形，槽位内完整显示） */
    const renderDetailImages = () => {
      root.querySelector('[data-detailimgs]').innerHTML =
        detailImages.map((u, i) => '<div class="img-slot filled tall" style="background-image:url(' + esc(u) + ')"><button class="del" data-rmd="' + i + '">×</button><span class="lv">' + (i + 1) + '</span></div>').join('') +
        '<div class="img-slot add" data-pickdetail title="添加详情长图">+</div>';
      root.querySelector('[data-pickdetail]').addEventListener('click', async () => {
        const r = await pickImage({ multi: true, max: 20, value: detailImages });
        if (r) { detailImages = r.slice(0, 20); renderDetailImages(); }
      });
      root.querySelectorAll('[data-rmd]').forEach((b) => b.addEventListener('click', () => {
        detailImages.splice(Number(b.getAttribute('data-rmd')), 1);
        renderDetailImages();
      }));
    };

    /* SKU 行 */
    const renderSkus = () => {
      root.querySelector('[data-skus]').innerHTML = skus.map((s, i) =>
        '<tr>' +
          '<td><input type="text" data-sk="specs" data-i="' + i + '" value="' + esc((s.specs || []).join(' / ')) + '" placeholder="如：星空灰 / 标准版"></td>' +
          '<td><input type="number" data-sk="price" data-i="' + i + '" value="' + fen2yuan(s.price) + '" min="0" step="0.01"></td>' +
          '<td><input type="number" data-sk="originalPrice" data-i="' + i + '" value="' + fen2yuan(s.originalPrice) + '" min="0" step="0.01"></td>' +
          '<td><input type="number" data-sk="stock" data-i="' + i + '" value="' + (s.stock || 0) + '" min="0"></td>' +
          '<td><button class="btn text sm red" data-delsku="' + i + '">删</button></td>' +
        '</tr>').join('');
      root.querySelectorAll('[data-sk]').forEach((el) => el.addEventListener('input', () => {
        const i = Number(el.getAttribute('data-i'));
        const k = el.getAttribute('data-sk');
        if (k === 'specs') skus[i].specs = el.value.split(/[/,，、]/).map((x) => x.trim()).filter(Boolean);
        else if (k === 'stock') skus[i].stock = Number(el.value || 0);
        else skus[i][k] = Math.round(Number(el.value || 0) * 100);
      }));
      root.querySelectorAll('[data-delsku]').forEach((b) => b.addEventListener('click', () => {
        if (skus.length <= 1) return toast('至少保留一行规格', true);
        skus.splice(Number(b.getAttribute('data-delsku')), 1);
        renderSkus();
      }));
    };
    root.querySelector('[data-addsku]').addEventListener('click', () => {
      const last = skus[skus.length - 1] || { price: 0, stock: 0 };
      skus.push({ specs: [], price: last.price, originalPrice: last.originalPrice, stock: 0, image: '' });
      renderSkus();
    });

    renderCover(); renderImages(); renderDetailImages(); renderSkus();

    root.querySelector('[data-save]').addEventListener('click', async () => {
      const f = (k) => { const el = root.querySelector('[data-f="' + k + '"]'); return el ? el.value : ''; };
      const payload = {
        id: g.id || undefined,
        name: f('name').trim(),
        subtitle: f('subtitle').trim(),
        categoryId: f('categoryId'),
        status: f('status'),
        tags: f('tags').split(/[,，]/).map((x) => x.trim()).filter(Boolean),
        description: f('description'),
        cover: cover || images[0] || '',
        images: images.length ? images : (cover ? [cover] : []),
        detailImages: detailImages,
        skus: skus.map((s) => ({ skuId: s.skuId, specs: s.specs, price: s.price, originalPrice: s.originalPrice, stock: s.stock, image: s.image || '' }))
      };
      if (!payload.name) return toast('请填写商品名称', true);
      if (!payload.categoryId) return toast('请选择商品分类', true);
      try {
        const r = await API.post('/api/admin/goods/save', payload);
        m.close();
        toast(r.isNew ? '商品已创建' : '商品已保存');
        App.refreshBadges();
        App.render();
      } catch (e) { toast(e.message, true); }
    });
  }
};

/* ============================== 视图：分类管理 ============================== */

App.views.categories = {
  async render(body) {
    const d = await API.get('/api/admin/category/list');
    const rows = [];
    d.list.forEach((c) => {
      rows.push({ id: c.id, name: c.name, icon: c.icon, count: c.goodsCount, level: 0, children: (c.children || []).length });
      (c.children || []).forEach((x) => rows.push({ id: x.id, name: x.name, count: x.goodsCount, level: 1, parentName: c.name }));
    });

    body.innerHTML =
      '<div class="card"><div class="card-h"><h2>商品分类</h2><div class="grow"></div>' +
        '<span class="hint">分类决定小程序端「分类」页与商品筛选</span>' +
        '<button class="btn primary" data-new>+ 新建一级分类</button></div>' +
      '<div class="table-wrap"><table class="tb"><thead><tr><th>分类名称</th><th style="width:110px">层级</th><th class="num" style="width:100px">商品数</th><th style="width:220px">操作</th></tr></thead><tbody>' +
      (rows.length ? rows.map((r) =>
        '<tr><td style="padding-left:' + (14 + r.level * 26) + 'px">' +
          (r.level ? '<span class="sub">└ </span>' : '') + '<b style="font-weight:' + (r.level ? 400 : 600) + '">' + esc(r.name) + '</b>' +
          (r.icon ? ' <img src="' + esc(r.icon) + '" style="width:16px;height:16px;border-radius:3px;vertical-align:-3px" alt="">' : '') +
          '</td>' +
          '<td>' + (r.level ? '<span class="tag ghost">二级</span>' : '<span class="tag blue">一级</span>') + '</td>' +
          '<td class="num">' + r.count + '</td>' +
          '<td class="nowrap">' +
            (r.level ? '' : '<button class="btn text sm" data-addchild="' + esc(r.id) + '">加子分类</button>') +
            '<button class="btn text sm" data-rename="' + esc(r.id) + '" data-name="' + esc(r.name) + '">改名</button>' +
            '<button class="btn text sm red" data-del="' + esc(r.id) + '" data-name="' + esc(r.name) + '">删除</button>' +
          '</td></tr>').join('') : emptyRow(4)) +
      '</tbody></table></div></div>' +
      '<div class="sub">提示：分类下有商品时不能删除，请先把商品移到其他分类。</div>';

    const editor = (opt) => {
      const m = openModal({
        title: opt.title,
        width: 'narrow',
        html: '<div class="form-row"><div class="lbl">分类名称</div><div class="ctl"><input type="text" style="flex:1" data-n value="' + esc(opt.name || '') + '" placeholder="如：清洁电器"></div></div>' +
          (opt.parentName ? '<div class="form-row"><div class="lbl">上级分类</div><div class="ctl sub">' + esc(opt.parentName) + '</div></div>' : '') +
          '<div class="form-row"><div class="lbl">分类图标</div><div class="ctl"><input type="text" style="flex:1" data-icon value="' + esc(opt.icon || '') + '" placeholder="可选，图片地址"><button class="btn" data-pick>选图</button></div></div>',
        footer: '<button class="btn" data-close>取消</button><button class="btn primary" data-ok>保存</button>'
      });
      m.root.querySelector('[data-pick]').addEventListener('click', async () => {
        const r = await pickImage({});
        if (r && r.length) m.root.querySelector('[data-icon]').value = r[0];
      });
      m.root.querySelector('[data-ok]').addEventListener('click', async () => {
        const name = m.root.querySelector('[data-n]').value.trim();
        if (!name) return toast('请填写分类名称', true);
        try {
          await API.post('/api/admin/category/save', { id: opt.id, parentId: opt.parentId, name, icon: m.root.querySelector('[data-icon]').value.trim() });
          m.close();
          toast('已保存');
          App.render();
        } catch (e) { toast(e.message, true); }
      });
    };

    body.querySelector('[data-new]').addEventListener('click', () => editor({ title: '新建一级分类' }));
    body.querySelectorAll('[data-addchild]').forEach((b) => b.addEventListener('click', () => editor({
      title: '新建子分类', parentId: b.getAttribute('data-addchild'), parentName: '（' + d.list.find((c) => c.id === b.getAttribute('data-addchild')).name + '）'
    })));
    body.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', () => {
      const row = rows.find((r) => r.id === b.getAttribute('data-rename'));
      editor({ title: '重命名分类', id: row.id, name: row.name });
    }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('删除分类 <b>' + esc(b.getAttribute('data-name')) + '</b>？', '删除'))) return;
      try {
        await API.post('/api/admin/category/delete', { id: b.getAttribute('data-del') });
        toast('已删除');
        App.render();
      } catch (e) { toast(e.message, true); }
    }));
  }
};

/* ============================== 视图：订单管理 ============================== */

App.views.orders = {
  async render(body, state) {
    const d = await API.get('/api/admin/order/list', {
      status: state.status || 'all', keyword: state.keyword,
      from: state.from, to: state.to, sort: state.sort, page: state.page || 1, size: 20
    });
    const tabs = [['all', '全部'], ['pending_pay', '待付款'], ['pending_ship', '待发货'], ['shipped', '待收货'], ['finished', '已完成'], ['cancelled', '已取消']];

    body.innerHTML =
      '<div class="card"><div class="filter" style="gap:4px">' +
        tabs.map(([k, t]) => '<button class="btn sm' + ((state.status || 'all') === k ? ' primary' : '') + '" data-tab="' + k + '">' + t +
          ' <span class="sub">' + (d.counts[k] || 0) + '</span></button>').join('') +
      '</div>' +
      '<div class="filter">' +
        '<input type="text" class="w220" placeholder="订单号 / 收货人 / 手机号 / 商品名" data-kw value="' + esc(state.keyword || '') + '">' +
        '<div class="field"><label>下单时间</label><input type="date" data-from value="' + esc(state.from ? new Date(Number(state.from)).toISOString().slice(0, 10) : '') + '">' +
        '<span class="sub">~</span><input type="date" data-to value="' + esc(state.to ? new Date(Number(state.to)).toISOString().slice(0, 10) : '') + '"></div>' +
        '<select class="w120" data-sort><option value="">下单时间</option><option value="amount"' + (state.sort === 'amount' ? ' selected' : '') + '>金额高→低</option></select>' +
        '<div style="flex:1"></div>' +
        '<button class="btn" data-ship>批量发货</button>' +
        '<button class="btn" data-export>导出 CSV</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th style="width:34px"><input type="checkbox" data-all></th>' +
        '<th>订单号</th><th>客户</th><th>商品</th><th class="num">实付</th><th>状态</th><th>下单时间</th><th style="width:200px">操作</th>' +
      '</tr></thead><tbody>' +
      (d.list.length ? d.list.map((o) =>
        '<tr>' +
          '<td>' + (o.status === 'pending_ship' ? '<input type="checkbox" data-ck="' + esc(o.orderId) + '">' : '') + '</td>' +
          '<td class="nowrap">' + esc(o.orderNo) + (o.merchantRemark ? ' <span class="tag ghost" title="' + esc(o.merchantRemark) + '">备注</span>' : '') + '</td>' +
          '<td><div class="cell-main"><img class="avatar" src="' + esc(o.customer.avatar || o.items[0] && o.items[0].image || '') + '" alt="">' +
            '<div class="tt"><b>' + esc(o.customer.name || o.customer.nickname || '—') + '</b><span>' + esc(o.customer.phone || '') + '</span></div></div></td>' +
          '<td class="sub">' + esc((o.items[0] && o.items[0].name || '').slice(0, 14)) + (o.itemCount > 1 ? ' 等 ' + o.itemCount + ' 件' : '') + '</td>' +
          '<td class="num money red">' + money(o.payAmount) + '</td>' +
          '<td>' + (statusTag[o.status] || o.status) + '</td>' +
          '<td class="sub nowrap">' + fmtTime(o.createdAt) + '</td>' +
          '<td class="nowrap">' +
            '<button class="btn text sm" data-detail="' + esc(o.orderId) + '">详情</button>' +
            (o.status === 'pending_ship' ? '<button class="btn text sm" data-ship1="' + esc(o.orderId) + '">发货</button>' : '') +
            '<button class="btn text sm" data-remark="' + esc(o.orderId) + '">备注</button>' +
            (o.status === 'pending_pay' ? '<button class="btn text sm red" data-close1="' + esc(o.orderId) + '">关闭</button>' : '') +
          '</td></tr>').join('') : emptyRow(8, '没有匹配的订单')) +
      '</tbody></table></div>' + pagerHtml(d.total, d.page, d.size) + '</div>';

    const reload = () => App.render();
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.status = b.getAttribute('data-tab'); state.page = 1; reload(); }));
    body.querySelector('[data-kw]').addEventListener('input', debounce((e) => { state.keyword = e.target.value.trim(); state.page = 1; reload(); }, 350));
    body.querySelector('[data-from]').addEventListener('change', (e) => { state.from = e.target.value ? new Date(e.target.value + 'T00:00:00').getTime() : ''; state.page = 1; reload(); });
    body.querySelector('[data-to]').addEventListener('change', (e) => { state.to = e.target.value ? new Date(e.target.value + 'T23:59:59').getTime() : ''; state.page = 1; reload(); });
    body.querySelector('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; reload(); });
    bindPager(body, state, reload);

    body.querySelector('[data-all]').addEventListener('change', (e) => {
      body.querySelectorAll('[data-ck]').forEach((el) => { el.checked = e.target.checked; });
    });
    body.querySelector('[data-ship]').addEventListener('click', () => {
      const ids = Array.from(body.querySelectorAll('[data-ck]:checked')).map((el) => el.getAttribute('data-ck'));
      if (!ids.length) return toast('请先勾选「待发货」订单', true);
      this.openShip(ids);
    });
    body.querySelector('[data-export]').addEventListener('click', async () => {
      try {
        const r = await API.get('/api/admin/order/export', { status: state.status, keyword: state.keyword, from: state.from, to: state.to });
        const blob = new Blob([r.content], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = r.filename;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('已导出 ' + r.rows + ' 条订单');
      } catch (e) { toast(e.message, true); }
    });
    body.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => this.openDetail(b.getAttribute('data-detail'))));
    body.querySelectorAll('[data-ship1]').forEach((b) => b.addEventListener('click', () => this.openShip([b.getAttribute('data-ship1')])));
    body.querySelectorAll('[data-remark]').forEach((b) => b.addEventListener('click', () => this.openRemark(b.getAttribute('data-remark'))));
    body.querySelectorAll('[data-close1]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('关闭该订单？<br><span class="sub">将回滚库存并退还客户使用的优惠券。</span>', '关闭订单'))) return;
      try {
        await API.post('/api/admin/order/close', { orderId: b.getAttribute('data-close1') });
        toast('订单已关闭');
        App.refreshBadges();
        reload();
      } catch (e) { toast(e.message, true); }
    }));
  },

  /** 发货弹窗（单条 / 批量） */
  openShip(orderIds) {
    const m = openModal({
      title: orderIds.length > 1 ? '批量发货（' + orderIds.length + ' 单）' : '订单发货',
      width: 'narrow',
      html: '<div class="form-row"><div class="lbl">物流公司</div><div class="ctl">' +
          '<select data-co>' + ['顺丰速运', '京东物流', '中通快递', '圆通速递', '韵达快递', '邮政EMS'].map((c) => '<option>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="form-row"><div class="lbl">物流单号</div><div class="ctl"><input type="text" style="flex:1" data-no placeholder="留空则自动生成演示单号"></div></div>' +
        '<div class="sub">发货后客户会收到「商家已发货」的物流节点，状态变为待收货。</div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" data-ok>确认发货</button>'
    });
    m.root.querySelector('[data-ok]').addEventListener('click', async () => {
      try {
        const r = await API.post('/api/admin/order/ship', {
          orderIds,
          company: m.root.querySelector('[data-co]').value,
          no: m.root.querySelector('[data-no]').value.trim()
        });
        m.close();
        if (r.failed.length) toast(r.message + '：' + r.failed.map((f) => f.reason).join('；'), true);
        else toast(r.message);
        App.refreshBadges();
        App.render();
      } catch (e) { toast(e.message, true); }
    });
  },

  /** 商家备注 */
  async openRemark(orderId) {
    const d = await API.get('/api/admin/order/detail', { orderId });
    const m = openModal({
      title: '商家备注 · ' + d.orderNo,
      width: 'narrow',
      html: '<textarea rows="4" style="width:100%" data-t placeholder="仅后台可见，例如：客户要求周末送达">' + esc(d.merchantRemark || '') + '</textarea>',
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" data-ok>保存</button>'
    });
    m.root.querySelector('[data-ok]').addEventListener('click', async () => {
      try {
        await API.post('/api/admin/order/remark', { orderId, remark: m.root.querySelector('[data-t]').value });
        m.close();
        toast('备注已保存');
        App.render();
      } catch (e) { toast(e.message, true); }
    });
  },

  /** 订单详情 */
  async openDetail(orderId) {
    const d = await API.get('/api/admin/order/detail', { orderId });
    const a = d.address || {};
    const money_row = (k, v, cls) => '<div style="display:flex;justify-content:space-between;padding:3px 0"><span class="sub">' + k + '</span><span class="' + (cls || '') + '">' + v + '</span></div>';
    const m = openModal({
      title: '订单详情 · ' + d.orderNo,
      width: 'wide',
      html:
        '<div class="grid c2" style="gap:14px">' +
          '<div><h3 style="margin:0 0 8px;font-size:13px">商品</h3>' +
            (d.items || []).map((it) =>
              '<div class="cell-main" style="padding:7px 0;border-bottom:1px dashed #f0f2f5">' +
                '<img class="thumb" src="' + esc(it.image) + '" alt="">' +
                '<div class="tt" style="flex:1"><b>' + esc(it.name) + '</b><span>' + esc(it.specText || '') + ' × ' + it.quantity + '</span></div>' +
                '<div class="money">' + money(it.price * it.quantity) + '</div>' +
              '</div>').join('') +
            '<div style="margin-top:10px">' +
              money_row('商品金额', money(d.amounts.goodsAmount)) +
              money_row('优惠抵扣', '- ' + money(d.amounts.couponAmount)) +
              money_row('运费', money(d.amounts.freightAmount)) +
              '<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line);margin-top:4px"><span>实付</span><span class="money red" style="font-size:15px">' + money(d.amounts.payAmount) + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<h3 style="margin:0 0 8px;font-size:13px">状态与物流</h3>' +
            '<div>' + (statusTag[d.status] || d.status) + ' <span class="sub">下单 ' + fmtTime(d.createdAt) + '</span></div>' +
            '<div style="margin:8px 0;padding-left:12px;border-left:2px solid var(--line)">' +
              (d.logistics || []).map((l) => '<div style="padding:3px 0"><span class="sub">' + fmtTime(l.at) + '</span> ' + esc(l.text) + '</div>').join('') +
            '</div>' +
            '<h3 style="margin:12px 0 8px;font-size:13px">收货信息</h3>' +
            '<div>' + esc(a.name || '') + ' <span class="sub">' + esc(a.phone || '') + '</span></div>' +
            '<div class="sub">' + esc([a.province, a.city, a.district, a.detail].filter(Boolean).join(' ')) + '</div>' +
            '<h3 style="margin:12px 0 8px;font-size:13px">客户</h3>' +
            '<div class="cell-main"><img class="avatar" src="' + esc(d.customer.avatar || '') + '" alt="">' +
              '<div class="tt"><b>' + esc(d.customer.nickname || d.customer.userId) + '</b><span>累计 ' + d.customer.orderCount + ' 单 · 消费 ' + money(d.customer.paidAmount) + '</span></div></div>' +
            (d.merchantRemark ? '<div style="margin-top:10px" class="tag warn">商家备注：' + esc(d.merchantRemark) + '</div>' : '') +
          '</div>' +
        '</div>',
      footer: '<span class="grow"></span>' +
        '<button class="btn" data-remark>备注</button>' +
        (d.status === 'pending_pay' ? '<button class="btn danger" data-close1>关闭订单</button>' : '') +
        (d.status === 'pending_ship' ? '<button class="btn primary" data-ship1>发货</button>' : '') +
        '<button class="btn" data-close>关闭</button>'
    });
    const r1 = m.root.querySelector('[data-ship1]');
    if (r1) r1.addEventListener('click', () => { m.close(); this.openShip([orderId]); });
    const r2 = m.root.querySelector('[data-close1]');
    if (r2) r2.addEventListener('click', async () => {
      if (!(await confirmBox('关闭该订单？将回滚库存并退还优惠券。', '关闭订单'))) return;
      try {
        await API.post('/api/admin/order/close', { orderId });
        m.close();
        toast('订单已关闭');
        App.refreshBadges();
        App.render();
      } catch (e) { toast(e.message, true); }
    });
    m.root.querySelector('[data-remark]').addEventListener('click', () => { m.close(); this.openRemark(orderId); });
  }
};

/* ============================== 视图：客户管理 ============================== */

App.views.customers = {
  async render(body, state) {
    const d = await API.get('/api/admin/customer/list', {
      keyword: state.keyword, level: state.level, tag: state.tag, sort: state.sort, page: state.page || 1, size: 20
    });
    const s = d.summary;
    body.innerHTML =
      '<div class="grid c4" style="margin-bottom:14px">' +
        '<div class="kpi"><div class="k">客户总数</div><div class="v">' + s.total + '</div><div class="d">有下单 ' + s.withOrder + ' · 未下单 ' + s.noOrder + '</div></div>' +
        '<div class="kpi"><div class="k">消费总额</div><div class="v">' + wan(s.amount) + '</div><div class="d">按已付款订单统计</div></div>' +
        '<div class="kpi"><div class="k">客单价</div><div class="v">' + money(s.avgAmount) + '</div><div class="d">消费总额 ÷ 下单客户数</div></div>' +
        '<div class="kpi"><div class="k">复购客户</div><div class="v">' + d.list.filter((c) => c.paidCount > 1).length + '</div><div class="d">当前页内付款 ≥ 2 次的客户</div></div>' +
      '</div>' +
      '<div class="card"><div class="filter">' +
        '<input type="text" class="w220" placeholder="昵称 / 手机号 / 用户 ID" data-kw value="' + esc(state.keyword || '') + '">' +
        '<select class="w120" data-level>' +
          [['', '全部客户'], ['vip', '高价值（≥3000元）'], ['active', '近 30 天活跃'], ['new', '未下单']]
            .map(([v, t]) => '<option value="' + v + '"' + (state.level === v ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select>' +
        (d.tags.length ? '<select class="w120" data-tag><option value="">全部标签</option>' + d.tags.map((t) => '<option value="' + esc(t) + '"' + (state.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' : '') +
        '<select class="w150" data-sort>' +
          [['', '注册时间新→旧'], ['amount', '消费额高→低'], ['orders', '订单数多→少'], ['recent', '最近下单']]
            .map(([v, t]) => '<option value="' + v + '"' + (state.sort === v ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th>客户</th><th>手机号</th><th class="num">订单数</th><th class="num">消费金额</th><th>最近下单</th><th>标签</th><th>注册时间</th><th style="width:80px">操作</th>' +
      '</tr></thead><tbody>' +
      (d.list.length ? d.list.map((c) =>
        '<tr>' +
          '<td><div class="cell-main"><img class="avatar" src="' + esc(c.avatar) + '" alt="">' +
            '<div class="tt"><b>' + esc(c.nickname || '匿名用户') + '</b><span>' + esc(c.userId) + '</span></div></div></td>' +
          '<td>' + esc(c.phone || '—') + '</td>' +
          '<td class="num">' + c.orderCount + (c.paidCount !== c.orderCount ? ' <span class="sub">(付' + c.paidCount + ')</span>' : '') + '</td>' +
          '<td class="num money">' + money(c.paidAmount) + '</td>' +
          '<td class="sub">' + (c.lastOrderAt ? fromNow(c.lastOrderAt) : '—') + '</td>' +
          '<td>' + ((c.tags || []).length ? c.tags.map((t) => '<span class="tag blue">' + esc(t) + '</span>').join(' ') : '<span class="sub">—</span>') + '</td>' +
          '<td class="sub">' + fmtTime(c.createdAt, false) + '</td>' +
          '<td><button class="btn text sm" data-detail="' + esc(c.userId) + '">详情</button></td>' +
        '</tr>').join('') : emptyRow(8, '没有匹配的客户')) +
      '</tbody></table></div>' + pagerHtml(d.total, d.page, d.size) + '</div>';

    const reload = () => App.render();
    body.querySelector('[data-kw]').addEventListener('input', debounce((e) => { state.keyword = e.target.value.trim(); state.page = 1; reload(); }, 350));
    body.querySelector('[data-level]').addEventListener('change', (e) => { state.level = e.target.value; state.page = 1; reload(); });
    const tagSel = body.querySelector('[data-tag]');
    if (tagSel) tagSel.addEventListener('change', (e) => { state.tag = e.target.value; state.page = 1; reload(); });
    body.querySelector('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; reload(); });
    bindPager(body, state, reload);
    body.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => this.openDetail(b.getAttribute('data-detail'))));
  },

  async openDetail(userId) {
    const d = await API.get('/api/admin/customer/detail', { userId });
    const m = openModal({
      title: '客户详情 · ' + (d.nickname || userId),
      width: 'wide',
      html:
        '<div class="grid c4" style="margin-bottom:14px">' +
          '<div class="kpi"><div class="k">消费金额</div><div class="v" style="font-size:18px">' + money(d.paidAmount) + '</div><div class="d">已付款 ' + d.paidCount + ' 单</div></div>' +
          '<div class="kpi"><div class="k">订单数</div><div class="v" style="font-size:18px">' + d.orderCount + '</div><div class="d">最近 ' + (d.lastOrderAt ? fromNow(d.lastOrderAt) : '—') + '</div></div>' +
          '<div class="kpi"><div class="k">可用券</div><div class="v" style="font-size:18px">' + d.couponCount + '</div><div class="d">共领 ' + d.coupons.length + ' 张</div></div>' +
          '<div class="kpi"><div class="k">资产</div><div class="v" style="font-size:18px">' + d.favoriteCount + '/' + d.footprintCount + '</div><div class="d">收藏 / 浏览</div></div>' +
        '</div>' +
        '<div class="form-row"><div class="lbl">标签</div><div class="ctl"><input type="text" style="flex:1" data-tags value="' + esc((d.tags || []).join(',')) + '" placeholder="逗号分隔，如：高价值,母婴"><span class="sub">最多 10 个</span></div></div>' +
        '<div class="form-row"><div class="lbl">联系方式</div><div class="ctl"><span>' + esc(d.phone || '未绑定手机号') + '</span><span class="sub">注册于 ' + fmtTime(d.createdAt) + ' · 最近登录 ' + fromNow(d.lastLoginAt) + '</span></div></div>' +
        '<h3 style="margin:14px 0 6px;font-size:13px">收货地址（' + d.addresses.length + '）</h3>' +
        (d.addresses.length ? d.addresses.map((a) =>
          '<div style="padding:6px 0;border-bottom:1px dashed #f0f2f5">' + esc(a.name) + ' <span class="sub">' + esc(a.phone) + '</span>' +
          (a.isDefault ? ' <span class="tag red">默认</span>' : '') +
          '<div class="sub">' + esc([a.province, a.city, a.district, a.detail].filter(Boolean).join(' ')) + '</div></div>').join('')
          : '<div class="sub">暂无地址</div>') +
        '<h3 style="margin:14px 0 6px;font-size:13px">订单记录（' + d.orders.length + '）</h3>' +
        '<div class="table-wrap"><table class="tb"><thead><tr><th>订单号</th><th class="num">金额</th><th>状态</th><th>下单时间</th><th></th></tr></thead><tbody>' +
        (d.orders.length ? d.orders.slice(0, 12).map((o) =>
          '<tr><td class="nowrap">' + esc(o.orderNo) + '</td><td class="num money">' + money(o.payAmount) + '</td>' +
          '<td>' + (statusTag[o.status] || o.status) + '</td><td class="sub">' + fmtTime(o.createdAt) + '</td>' +
          '<td><button class="btn text sm" data-order="' + esc(o.orderId) + '">查看</button></td></tr>').join('') : emptyRow(5, '暂无订单')) +
        '</tbody></table></div>' +
        '<h3 style="margin:14px 0 6px;font-size:13px">优惠券</h3>' +
        '<div>' + (d.coupons.length ? d.coupons.map((c) =>
          '<span class="tag' + (c.status === 'available' ? ' red' : ' ghost') + '">' + esc(c.name) + '（' + ({ available: '可用', used: '已用', expired: '过期' }[c.status] || c.status) + '）</span>').join(' ') : '<span class="sub">暂无</span>') + '</div>',
      footer: '<button class="btn primary" data-save>保存标签</button><button class="btn" data-close>关闭</button>'
    });
    m.root.querySelector('[data-save]').addEventListener('click', async () => {
      const tags = m.root.querySelector('[data-tags]').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      try {
        await API.post('/api/admin/customer/tag', { userId, tags });
        m.close();
        toast('标签已更新');
        App.render();
      } catch (e) { toast(e.message, true); }
    });
    m.root.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
      m.close();
      App.views.orders.openDetail(b.getAttribute('data-order'));
    }));
  }
};

/* ============================== 视图：优惠券 ============================== */

App.views.marketing = {
  async render(body) {
    const d = await API.get('/api/admin/coupon/list');
    const typeText = (t) => (t.type === 'percent' ? (t.value / 10) + ' 折' : '减 ' + fen2yuan(t.value) + ' 元');
    body.innerHTML =
      '<div class="card"><div class="card-h"><h2>优惠券</h2><div class="grow"></div>' +
        '<span class="hint">暂停后小程序端不可再领，已领的券仍可使用</span>' +
        '<button class="btn primary" data-new>+ 新建优惠券</button></div>' +
      '<div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th>券名称</th><th>类型</th><th>使用门槛</th><th>有效期</th><th>适用范围</th><th class="num">已领</th><th class="num">已核销</th><th>状态</th><th style="width:190px">操作</th>' +
      '</tr></thead><tbody>' +
      (d.list.length ? d.list.map((t) =>
        '<tr>' +
          '<td><b>' + esc(t.name) + '</b><div class="sub">' + esc(t.templateId) + '</div></td>' +
          '<td>' + (t.type === 'percent' ? '<span class="tag blue">折扣券</span>' : '<span class="tag red">满减券</span>') + '</td>' +
          '<td>' + (t.threshold ? '满 ' + fen2yuan(t.threshold) + ' 元' : '无门槛') + '<div class="sub">' + typeText(t) + '</div></td>' +
          '<td>领取后 ' + t.days + ' 天</td>' +
          '<td class="sub">' + esc(t.scope || '') + '</td>' +
          '<td class="num">' + t.stat.received + '</td>' +
          '<td class="num">' + t.stat.used + '</td>' +
          '<td>' + ((t.status || 'active') === 'active' ? '<span class="tag on">发放中</span>' : '<span class="tag off">已暂停</span>') + '</td>' +
          '<td class="nowrap">' +
            '<button class="btn text sm" data-edit="' + esc(t.templateId) + '">编辑</button>' +
            '<button class="btn text sm" data-toggle="' + esc(t.templateId) + '" data-to="' + ((t.status || 'active') === 'active' ? 'paused' : 'active') + '">' + ((t.status || 'active') === 'active' ? '暂停' : '启用') + '</button>' +
            '<button class="btn text sm red" data-del="' + esc(t.templateId) + '">删除</button>' +
          '</td></tr>').join('') : emptyRow(9, '还没有优惠券')) +
      '</tbody></table></div></div>';

    const editor = (t) => {
      const isNew = !t;
      const v = t || { name: '', type: 'discount', threshold: 0, value: 0, scope: '全场通用', days: 30, status: 'active' };
      const m = openModal({
        title: isNew ? '新建优惠券' : '编辑优惠券',
        html:
          '<div class="form-row"><div class="lbl">券名称</div><div class="ctl"><input type="text" style="flex:1" data-f="name" value="' + esc(v.name) + '" placeholder="如：新人礼 · 满 1000 减 100"></div></div>' +
          '<div class="form-row"><div class="lbl">类型</div><div class="ctl"><select data-f="type">' +
            '<option value="discount"' + (v.type === 'discount' ? ' selected' : '') + '>满减券（减固定金额）</option>' +
            '<option value="percent"' + (v.type === 'percent' ? ' selected' : '') + '>折扣券（如 95 = 95 折）</option></select></div></div>' +
          '<div class="form-row"><div class="lbl">使用门槛</div><div class="ctl"><input type="number" class="w90" data-f="threshold" value="' + fen2yuan(v.threshold) + '"><span class="sub">元（0 = 无门槛）</span></div></div>' +
          '<div class="form-row"><div class="lbl">优惠额度</div><div class="ctl"><input type="number" class="w90" data-f="value" value="' + (v.type === 'percent' ? v.value : fen2yuan(v.value)) + '">' +
            '<span class="sub" data-vtip>' + (v.type === 'percent' ? '填 50~99，95 表示 95 折' : '单位：元') + '</span></div></div>' +
          '<div class="form-row"><div class="lbl">适用范围</div><div class="ctl"><input type="text" style="flex:1" data-f="scope" value="' + esc(v.scope || '全场通用') + '"></div></div>' +
          '<div class="form-row"><div class="lbl">有效期</div><div class="ctl"><input type="number" class="w90" data-f="days" value="' + v.days + '"><span class="sub">天（自领取日起）</span></div></div>' +
          '<div class="form-row"><div class="lbl">状态</div><div class="ctl"><select data-f="status">' +
            '<option value="active"' + ((v.status || 'active') === 'active' ? ' selected' : '') + '>发放中</option>' +
            '<option value="paused"' + (v.status === 'paused' ? ' selected' : '') + '>暂停</option></select></div></div>',
        footer: '<button class="btn" data-close>取消</button><button class="btn primary" data-ok>保存</button>'
      });
      m.root.querySelector('[data-f="type"]').addEventListener('change', (e) => {
        m.root.querySelector('[data-vtip]').textContent = e.target.value === 'percent' ? '填 50~99，95 表示 95 折' : '单位：元';
      });
      m.root.querySelector('[data-ok]').addEventListener('click', async () => {
        const f = (k) => m.root.querySelector('[data-f="' + k + '"]').value;
        const type = f('type');
        const payload = {
          templateId: isNew ? undefined : v.templateId,
          name: f('name').trim(),
          type,
          threshold: Math.round(Number(f('threshold') || 0) * 100),
          value: type === 'percent' ? Number(f('value') || 0) : Math.round(Number(f('value') || 0) * 100),
          scope: f('scope').trim(),
          days: Number(f('days') || 30),
          status: f('status')
        };
        if (!payload.name) return toast('请填写券名称', true);
        try {
          await API.post('/api/admin/coupon/save', payload);
          m.close();
          toast('已保存');
          App.render();
        } catch (e) { toast(e.message, true); }
      });
    };

    body.querySelector('[data-new]').addEventListener('click', () => editor(null));
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      editor(d.list.find((x) => x.templateId === b.getAttribute('data-edit')));
    }));
    body.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.post('/api/admin/coupon/status', { templateId: b.getAttribute('data-toggle'), status: b.getAttribute('data-to') });
        toast('状态已更新');
        App.render();
      } catch (e) { toast(e.message, true); }
    }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('删除该优惠券？<br><span class="sub">已被客户领取过的券不能删除，只能暂停。</span>', '删除'))) return;
      try {
        await API.post('/api/admin/coupon/delete', { templateId: b.getAttribute('data-del') });
        toast('已删除');
        App.render();
      } catch (e) { toast(e.message, true); }
    }));
  }
};

/* ============================== 视图：评价管理 ============================== */

App.views.comments = {
  async render(body, state) {
    const d = await API.get('/api/admin/comment/list', {
      goodsId: state.goodsId, score: state.score, keyword: state.keyword, page: state.page || 1, size: 15
    });
    body.innerHTML =
      '<div class="card"><div class="filter">' +
        '<select class="w150" data-goods><option value="">全部商品</option>' + d.goods.map((g) => '<option value="' + esc(g.id) + '"' + (state.goodsId === g.id ? ' selected' : '') + '>' + esc(g.name.slice(0, 16)) + '</option>').join('') + '</select>' +
        '<select class="w120" data-score><option value="">全部评分</option>' + [5, 4, 3, 2, 1].map((s) => '<option value="' + s + '"' + (String(state.score) === String(s) ? ' selected' : '') + '>' + s + ' 星</option>').join('') + '</select>' +
        '<input type="text" class="w220" placeholder="搜索评价内容 / 用户" data-kw value="' + esc(state.keyword || '') + '">' +
        '<div style="flex:1"></div><span class="sub">共 ' + d.total + ' 条评价</span>' +
      '</div>' +
      '<div class="card-b">' + (d.list.length ? d.list.map((c) =>
        '<div style="padding:12px 0;border-bottom:1px dashed #f0f2f5" data-c="' + esc(c.commentId) + '">' +
          '<div style="display:flex;gap:10px;align-items:center">' +
            '<img class="avatar" src="' + esc(c.avatar || '') + '" alt="">' +
            '<b>' + esc(c.author) + '</b>' +
            '<span class="tag warn">' + '★'.repeat(c.score) + '</span>' +
            '<span class="sub">' + esc(c.goodsName) + ' · ' + esc(c.specText || '') + '</span>' +
            '<div style="flex:1"></div><span class="sub">' + fmtTime(c.createdAt) + '</span>' +
          '</div>' +
          '<div style="margin:8px 0 0 40px">' + esc(c.content) + '</div>' +
          (c.images && c.images.length ? '<div class="img-list" style="margin:8px 0 0 40px">' + c.images.map((u) => '<div class="img-slot filled" style="background-image:url(' + esc(u) + ')"></div>').join('') + '</div>' : '') +
          (c.reply ? '<div style="margin:8px 0 0 40px;background:#fafbfc;border-left:3px solid var(--primary);padding:7px 10px;border-radius:0 6px 6px 0">' +
            '<b style="color:var(--primary)">商家回复</b> <span class="sub">' + fmtTime(c.reply.at) + '</span><div>' + esc(c.reply.text) + '</div></div>' : '') +
          '<div style="margin:8px 0 0 40px"><button class="btn text sm" data-reply="' + esc(c.commentId) + '">' + (c.reply ? '修改回复' : '回复') + '</button>' +
          (c.reply ? '<button class="btn text sm red" data-delreply="' + esc(c.commentId) + '">删除回复</button>' : '') + '</div>' +
        '</div>').join('') : '<div class="empty-state">没有匹配的评价</div>') + '</div>' +
      pagerHtml(d.total, d.page, d.size) + '</div>';

    const reload = () => App.render();
    body.querySelector('[data-goods]').addEventListener('change', (e) => { state.goodsId = e.target.value; state.page = 1; reload(); });
    body.querySelector('[data-score]').addEventListener('change', (e) => { state.score = e.target.value; state.page = 1; reload(); });
    body.querySelector('[data-kw]').addEventListener('input', debounce((e) => { state.keyword = e.target.value.trim(); state.page = 1; reload(); }, 350));
    bindPager(body, state, reload);

    body.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-reply');
      const cur = d.list.find((x) => x.commentId === id);
      const m = openModal({
        title: '回复评价',
        width: 'narrow',
        html: '<div class="sub" style="margin-bottom:8px">' + esc(cur ? cur.content : '') + '</div>' +
          '<textarea rows="4" style="width:100%" data-t placeholder="回复内容，客户可在评价下看到（最多 300 字）">' + esc(cur && cur.reply ? cur.reply.text : '') + '</textarea>',
        footer: '<button class="btn" data-close>取消</button><button class="btn primary" data-ok>发布回复</button>'
      });
      m.root.querySelector('[data-ok]').addEventListener('click', async () => {
        try {
          await API.post('/api/admin/comment/reply', { commentId: id, text: m.root.querySelector('[data-t]').value });
          m.close();
          toast('回复已发布');
          App.render();
        } catch (e) { toast(e.message, true); }
      });
    }));
    body.querySelectorAll('[data-delreply]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.post('/api/admin/comment/reply', { commentId: b.getAttribute('data-delreply'), text: '' });
        toast('回复已删除');
        App.render();
      } catch (e) { toast(e.message, true); }
    }));
  }
};

/* ============================== 视图：素材库 ============================== */

/* 卡片上的两个角标图标。用内联 SVG 而不是 ‹🔍✓› 这类字符：
 * 字符要靠系统字体里的字形，Windows 上曾被回退成奇怪的符号（见 core 里 ICONS 的注释）。 */
const MEDIA_ZOOM_ICO = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.5 13.5M7 5.2v3.6M5.2 7h3.6"/></svg>';
const MEDIA_CHECK_ICO = '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" ' +
  'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3.2 8.4 6.3 11.5 12.8 4.9"/></svg>';
/* 卡片底部操作行的三个图标（复制链接 / 下载 / 删除）。
 * 为什么从「文字按钮」改成「图标」：40 张卡片 × 3 个中文按钮 = 一整片字，
 * 网格被字糊住反而看不出图；图标 26px + title 提示，入口仍在（**常驻不藏 hover**），
 * 视觉上安静得多。 */
const MEDIA_COPY_ICO = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1.6"/><path d="M10.4 3.4H4.2a1.6 1.6 0 0 0-1.6 1.6v6.2"/></svg>';
const MEDIA_DOWN_ICO = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8 2.6v7.6M4.6 7l3.4 3.4L11.4 7M2.8 13.2h10.4"/></svg>';
const MEDIA_TRASH_ICO = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2.8 4.4h10.4M6.4 4.4V3a.6.6 0 0 1 .6-.6h2a.6.6 0 0 1 .6.6v1.4M4.2 4.4l.7 8.2a.9.9 0 0 0 .9.8h4.4a.9.9 0 0 0 .9-.8l.7-8.2"/>' +
  '<path d="M6.7 7.2v3.6M9.3 7.2v3.6"/></svg>';
const MEDIA_PLAY_ICO = '<svg viewBox="0 0 16 16" width="9" height="9" fill="currentColor" aria-hidden="true">' +
  '<path d="M4.6 3.3 12.2 8l-7.6 4.7z"/></svg>';

/**
 * 素材库：左侧文件夹（**逻辑分类**）+ 右侧网格（点图放大预览、勾选圈多选、批量移动）
 *
 * 四个刻意的设计，都是踩过坑之后的结论：
 *   ① `state.sel` 存**素材名**而不是 DOM 下标 —— 翻页 / 切文件夹后选择不会错位到别的图；
 *   ② 点勾选圈只切 class，绝不重绘整个网格 —— 重绘会重建 <img>，
 *      所有缩略图重新发请求（画面闪白）、搜索框失焦；
 *   ③ **点击图片 = 放大预览，多选走左上角的勾选圈**（Ctrl/⌘+点击卡片同效）。
 *      早先「点一下就是选中」太容易误触 —— 想凑近看清一张图，结果把它选上了，
 *      接着点「移动到」就把它挪走了。两种意图形不同、入口也要分开。
 *   ④ 文件夹只存在于索引里（不产生真实目录）—— 图片 URL 已写进 replica.js / catalog.json，
 *      挪动磁盘文件会让线上图直接裂掉。所以「删文件夹」也不删素材，只把素材退回未分组。
 */
App.views.media = {
  async render(body, state) {
    const d = await API.get('/api/media/list', {
      q: state.q,
      sort: state.sort,
      folder: state.folder,
      kind: state.kind,
      page: state.page || 1,
      size: 40
    });
    if (!Array.isArray(state.sel)) state.sel = [];

    const FOLDER_NONE = '__none__';
    const cur = state.folder || '';
    const isRealFolder = !!cur && cur !== FOLDER_NONE;

    const sideIt = (value, text, count, on, editable) =>
      '<div class="media-side-it' + (on ? ' on' : '') + '" data-folder="' + esc(value) + '">' +
        '<span class="nf">' + esc(text) + '</span><b>' + count + '</b>' +
        (editable
          ? '<span class="nf-op" data-rnf="' + esc(value) + '" title="重命名文件夹">✎</span>' +
            '<span class="nf-op" data-df="' + esc(value) + '" title="删除文件夹（里面的素材回到未分组，不会删图）">✕</span>'
          : '') +
      '</div>';

    const side =
      '<div class="media-side">' +
        '<div class="media-side-h">文件夹</div>' +
        sideIt('', '全部素材', d.all, cur === '') +
        sideIt(FOLDER_NONE, '未分组', d.ungrouped, cur === FOLDER_NONE) +
        (d.folders.length ? '<div class="media-side-sep"></div>' : '') +
        d.folders.map((f) => sideIt(f.name, f.name, f.count, cur === f.name, true)).join('') +
        '<button class="btn sm block" data-newfolder style="margin-top:10px">+ 新建文件夹</button>' +
      '</div>';

    const whereText = cur === '' ? '未分组' : (cur === FOLDER_NONE ? '未分组' : '文件夹「' + cur + '」');

    /* 顶部「全部 / 图片 / 视频」分档。计数取自整个素材库（不受当前筛选影响），
     * 否则一进视频档，「全部」的数字就跟着变了。 */
    const kinds = d.kinds || { all: 0, image: 0, video: 0 };
    const kindTab = (v, text, n) =>
      '<button class="mk' + ((state.kind || '') === v ? ' on' : '') + '" data-kindt="' + v + '">' +
        esc(text) + '<b>' + n + '</b></button>';
    const tabs =
      '<div class="media-kinds">' +
        kindTab('', '全部', kinds.all) +
        kindTab('image', '图片', kinds.image) +
        kindTab('video', '视频', kinds.video) +
        '<span class="grow"></span>' +
        '<span class="hint">图片 ≤ ' + (d.stat.maxBytes / 1024 / 1024) + 'MB · 视频 ≤ ' + (d.stat.maxVideoBytes / 1024 / 1024) +
        'MB（超过 ' + (d.stat.videoWarnBytes / 1024 / 1024) + 'MB 的视频小程序端加载会慢）</span>' +
      '</div>';

    /*
     * 卡片：**图片在上、信息在下**（对标有赞素材中心的排版）。
     * 三块各司其职：.mt 正方形缩略图区（图/视频同形状）→ .inf 信息（文件名最多两行 +
     * 尺寸/体积/时长）→ .ft 常驻操作行（图标：复制链接 / 下载 / 删除）。
     * ⚠️ 缩略图区的类名必须叫 .mt，不能叫 .thumb —— `.thumb{width:42px;height:42px}`
     * 是表格小方图的样式，套到卡片上会把缩略图缩成 42px 的小图并溢出压住文件名。
     */
    const cell = (it, i) => {
      const isVideo = it.kind === 'video';
      const meta = [];
      if (it.width && it.height) meta.push(it.width + '×' + it.height);
      if (it.sizeText) meta.push(it.sizeText);
      if (isVideo && it.durationText) meta.push('时长 ' + it.durationText);
      const nm = it.orig || it.name;
      return '<div class="media-it zoom' + (state.sel.indexOf(it.name) > -1 ? ' sel' : '') +
          '" data-pick="' + esc(it.name) + '" data-i="' + i + '" data-kind="' + (isVideo ? 'video' : 'image') + '">' +
        '<div class="mt">' +
          (isVideo
            // muted + preload=metadata：只要首帧，不要出声、不要整段下载
            ? '<video src="' + esc(it.url) + '" muted preload="metadata" playsinline></video>'
            : '<img src="' + esc(it.url) + '" alt="" loading="eager">') +
          '<span class="zoomtip">' + MEDIA_ZOOM_ICO + (isVideo ? '播放' : '查看大图') + '</span>' +
          (isVideo ? '<span class="vbadge">' + MEDIA_PLAY_ICO + esc(it.durationText || '视频') + '</span>' : '') +
          '<span class="pickbox" data-check="' + esc(it.name) + '" title="选择这个（也可 Ctrl / ⌘ + 点击卡片）">' + MEDIA_CHECK_ICO + '</span>' +
        '</div>' +
        '<div class="inf">' +
          '<div class="nm" title="' + esc(nm) + '">' + esc(nm) + '</div>' +
          '<div class="meta">' + esc(meta.join(' · ')) + '</div>' +
        '</div>' +
        '<div class="ft">' +
          '<button data-copy="' + esc(it.url) + '" title="复制素材地址">' + MEDIA_COPY_ICO + '</button>' +
          '<button data-down="' + esc(it.name) + '" title="下载到本地">' + MEDIA_DOWN_ICO + '</button>' +
          '<button data-del="' + esc(it.name) + '" title="删除素材">' + MEDIA_TRASH_ICO + '</button>' +
        '</div>' +
      '</div>';
    };

    const grid = d.list.length
      ? d.list.map(cell).join('')
      : '<div class="empty-state">' +
          (state.kind === 'video'
            ? '还没有视频素材 —— 把 MP4 / MOV / WebM 拖到上面的上传区即可'
            : '这个范围里还没有素材') +
          /* 分档与文件夹是 AND：空的时候要说清「是哪两个条件叠起来才空的」，
             否则用户会以为素材丢了（明明刚才还在） */
          ((cur && cur !== FOLDER_NONE)
            ? '（当前筛选：文件夹「' + esc(cur) + '」' + (state.kind ? ' + ' + (state.kind === 'video' ? '视频' : '图片') : '') + '）'
            : '') +
        '</div>';
    const moveOpts = '<option value="">移动到…</option>' +
      '<option value="' + FOLDER_NONE + '">未分组</option>' +
      d.folders.map((f) => '<option value="' + esc(f.name) + '">' + esc(f.name) + '</option>').join('') +
      '<option value="__new__">+ 新建文件夹并移入…</option>';

    body.innerHTML =
      '<div class="card"><div class="card-h"><h2>素材库</h2><div class="grow"></div>' +
        '<span class="hint">共 ' + kinds.all + ' 个素材（图片 ' + kinds.image + ' · 视频 ' + kinds.video + '） · 占用 ' +
        (d.stat.bytes / 1024 / 1024).toFixed(1) + 'MB</span></div>' +
      tabs +
      '<div class="card-b media-wrap">' + side +
        '<div class="media-main">' +
          '<div class="upzone" data-zone style="margin-bottom:12px"><b>点击选择素材</b>，或把文件拖到这里，也可直接 Ctrl+V 粘贴<br>' +
            '<span class="sub">上传后归入：' + esc(whereText) +
              (isRealFolder ? '' : '（想直接归到某个文件夹，先点左侧文件夹名再上传）') +
            ' · 支持 ' + esc(d.stat.acceptText) + ' · 服务端按文件头校验真实类型</span>' +
            '<input type="file" accept="' + esc(d.stat.acceptAttr) + '" multiple hidden data-file></div>' +
          '<div class="filter media-bar">' +
            '<input type="text" class="w160" placeholder="搜索文件名…" data-q value="' + esc(state.q || '') + '">' +
            '<select class="w120" data-sort>' +
              [['new', '最新上传'], ['old', '最早上传'], ['big', '文件最大'], ['small', '文件最小']]
                .map(([v, t]) => '<option value="' + v + '"' + (state.sort === v ? ' selected' : '') + '>' + t + '</option>').join('') +
            '</select>' +
            '<div class="grow"></div>' +
            '<span class="selbar" data-actbar' + (state.sel.length ? '' : ' hidden') + '>' +
              '已选 <b data-selcnt>' + state.sel.length + '</b> 张' +
              '<select class="w160" data-moveto>' + moveOpts + '</select>' +
              '<button class="btn sm" data-selall>全选本页</button>' +
              '<button class="btn sm" data-selnone>清空选择</button>' +
            '</span>' +
          '</div>' +
          '<div class="media-grid" data-grid>' + grid + '</div>' +
          '<div class="media-hint">点图片 / 视频即打开预览（预览里 ← / → 翻页、<b>Esc 或点空白处关闭</b>、可复制地址 / 下载 / 删除）；' +
            '要批量操作，勾选缩略图左上角的圆圈（或按住 Ctrl / ⌘ 再点卡片）。</div>' +
        '</div>' +
      '</div>' + pagerHtml(d.total, d.page, d.size) + '</div>';

    const reload = () => App.render();
    // 只更新「已选 N 张」与操作条显隐 —— 不重绘网格（见文件头注释 ②）
    const markSel = () => {
      const n = body.querySelector('[data-selcnt]');
      if (n) n.textContent = state.sel.length;
      const bar = body.querySelector('[data-actbar]');
      if (bar) { if (state.sel.length) bar.removeAttribute('hidden'); else bar.setAttribute('hidden', ''); }
    };

    /* ---- 删除一张素材（网格的 ✕ 与预览层里的删除共用同一套确认逻辑） ----
     * 抽成函数是因为它在两处被调用：只有一份「引用检查 → 强制确认」才不会两边走偏。 */
    const deleteMedia = async (p) => {
      if (!(await confirmBox('删除该素材？<br><span class="sub">若图片正被页面或商品引用，需要再次确认强制删除。</span>', '删除'))) return false;
      try {
        await API.post('/api/media/delete', { name: p });
        toast('已删除');
        return true;
      } catch (err) {
        if (String(err.message).indexOf('引用') > -1) {
          const force = await confirmBox('该素材正被引用：<br><span class="sub">' + esc(err.message) + '</span>', '仍然删除');
          if (!force) return false;
          try {
            await API.post('/api/media/delete', { name: p, force: 1 });
            toast('已强制删除');
            return true;
          } catch (e2) { toast(e2.message, true); return false; }
        }
        toast(err.message, true);
        return false;
      }
    };

    /* ---- 放大预览 ----
     * 把**当前这一页的列表**整体交给浮层，←/→ 翻的就是「你正在看的这个筛选结果」，
     * 顺序与网格严格一致（浮层自己再发一次请求就可能因为分页/排序不同而对不上）。 */
    const openLightbox = (index) => lightbox({
      list: d.list,
      index: index,
      onDelete: async (it) => {
        const done = await deleteMedia(it.name);
        if (done) {
          state.sel = state.sel.filter((x) => x !== it.name);
          reload();          // 网格同步刷新；浮层挂在 #layer 上，不受 body 重绘影响
        }
        return done;
      }
    });

    /* ---- 切文件夹 ---- */
    body.querySelectorAll('[data-folder]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-rnf') || e.target.hasAttribute('data-df')) return;
        state.folder = el.getAttribute('data-folder') || undefined;
        state.page = 1;
        state.sel = [];
        reload();
      });
    });

    /* ---- 文件夹：新建 / 重命名 / 删除 ---- */
    body.querySelector('[data-newfolder]').addEventListener('click', async () => {
      const name = await promptBox('新建文件夹', '', '例如：首页、莱克、双十一素材');
      if (!name) return;
      try {
        await API.post('/api/media/folder', { op: 'create', name: name });
        toast('已新建文件夹：' + name);
        reload();
      } catch (e) { toast(e.message, true); }
    });

    body.querySelectorAll('[data-rnf]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const from = b.getAttribute('data-rnf');
      const to = await promptBox('重命名文件夹', from, '新的文件夹名');
      if (!to || to === from) return;
      try {
        const r = await API.post('/api/media/folder', { op: 'rename', from: from, to: to });
        const moved = (r.renamed && r.renamed.moved) || 0;
        toast('已改名为「' + to + '」' + (moved ? '，' + moved + ' 张素材一起跟着改' : ''));
        if (state.folder === from) state.folder = to;
        reload();
      } catch (err) { toast(err.message, true); }
    }));

    body.querySelectorAll('[data-df]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = b.getAttribute('data-df');
      const sure = await confirmBox(
        '删除文件夹「' + esc(name) + '」？<br><span class="sub">只删除这个分类，里面的素材会回到「未分组」，<b>不会删除图片本身</b>。</span>',
        '删除文件夹'
      );
      if (!sure) return;
      try {
        const r = await API.post('/api/media/folder', { op: 'remove', name: name });
        toast('已删除文件夹，' + (r.movedToUngrouped || 0) + ' 张素材回到未分组');
        if (state.folder === name) state.folder = undefined;
        reload();
      } catch (err) { toast(err.message, true); }
    }));

    /* ---- 点素材卡片：勾选圈 / Ctrl(⌘)+点击 → 多选；其余 → 放大预览 ----
     * 原来的「点一下就是选中」太容易误触（想看清楚反而被选上），
     * 改成：点图看大图，多选走左上角常驻的勾选圈。两种操作各有明确入口。 */
    body.querySelectorAll('[data-pick]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-copy]') || e.target.closest('[data-del]')) return;
        const name = el.getAttribute('data-pick');
        if (e.target.closest('[data-check]') || e.ctrlKey || e.metaKey) {
          const at = state.sel.indexOf(name);
          if (at > -1) { state.sel.splice(at, 1); el.classList.remove('sel'); }
          else { state.sel.push(name); el.classList.add('sel'); }
          markSel();
          return;
        }
        openLightbox(Number(el.getAttribute('data-i')) || 0);
      });
    });

    body.querySelector('[data-selall]').addEventListener('click', () => {
      d.list.forEach((it) => { if (state.sel.indexOf(it.name) === -1) state.sel.push(it.name); });
      body.querySelectorAll('[data-pick]').forEach((el) => el.classList.add('sel'));
      markSel();
    });

    body.querySelector('[data-selnone]').addEventListener('click', () => {
      state.sel = [];
      body.querySelectorAll('[data-pick]').forEach((el) => el.classList.remove('sel'));
      markSel();
    });

    /* ---- 批量移动到文件夹 ---- */
    body.querySelector('[data-moveto]').addEventListener('change', async (e) => {
      const v = e.target.value;
      e.target.value = '';
      if (!v) return;
      let folder = v;
      if (v === '__new__') {
        const name = await promptBox('新建文件夹并移入', '', '文件夹名，例如：首页');
        if (!name) return;
        folder = name;
      }
      const target = folder === FOLDER_NONE ? '' : folder;
      const stop = loading('移动中…');
      try {
        const r = await API.post('/api/media/move', { names: state.sel.slice(), folder: target });
        toast('已移动 ' + r.moved + ' 张到「' + (target || '未分组') + '」');
        state.sel = [];
        reload();
      } catch (err) { toast(err.message, true); } finally { stop(); }
    });

    /* ---- 搜索 / 排序 / 分页 ---- */
    body.querySelector('[data-q]').addEventListener('input', debounce((e) => {
      state.q = e.target.value.trim();
      state.page = 1;
      reload();
    }, 350));
    body.querySelector('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; reload(); });
    bindPager(body, state, reload);

    /* ---- 上传（图片 + 视频；归入当前打开的文件夹） ----
     * 这里只做「把明显无关的文件（zip、exe…）挡在门外」的粗筛：
     * 真实类型一律由服务端按文件头判定 —— 前端 MIME 是客户端说了算的，不可信。
     * 有些系统给的 f.type 是空串（尤其 .mov），所以再用扩展名兜一层。 */
    const uploadFolder = isRealFolder ? cur : '';
    const upload = async (files) => {
      const list = Array.from(files || []).filter((f) => {
        const t = String(f.type || '');
        if (t.indexOf('image/') === 0 || t.indexOf('video/') === 0) return true;
        return /\.(png|jpe?g|webp|gif|mp4|m4v|mov|webm)$/i.test(f.name || '');
      });
      if (!list.length) return;
      const stop = loading('上传中…');
      let ok = 0;
      let warn = '';
      try {
        for (const f of list) {
          const fd = new FormData();
          fd.append('file', f, f.name);
          const url = '/api/media/upload' + (uploadFolder ? '?folder=' + encodeURIComponent(uploadFolder) : '');
          const res = await fetch(url, { method: 'POST', body: fd });
          const json = await res.json();
          if (json.code === 0) {
            ok += 1;
            if (json.data && json.data.warn) warn = json.data.warn;
          } else toast(f.name + '：' + json.msg, true);
        }
        toast('上传成功 ' + ok + ' 个素材' + (uploadFolder ? '（已归入「' + uploadFolder + '」）' : ''));
        if (warn) toast(warn, true);   // 体积偏大的视频：照收，但把话说清楚
        reload();
      } finally { stop(); }
    };

    const zone = body.querySelector('[data-zone]');
    zone.addEventListener('click', () => body.querySelector('[data-file]').click());
    body.querySelector('[data-file]').addEventListener('change', (e) => upload(e.target.files));
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('on'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('on'); }));
    zone.addEventListener('drop', (e) => upload(e.dataTransfer.files));
    body.addEventListener('paste', (e) => { if (e.clipboardData && e.clipboardData.files.length) upload(e.clipboardData.files); });

    /* ---- 单张：复制地址 / 下载 / 删除 ---- */
    body.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = b.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(url);
        toast('已复制：' + url);
      } catch (err) { toast(url); }
    }));

    body.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const it = d.list.find((x) => x.name === b.getAttribute('data-down'));
      if (it) downloadUrl(it);   // 与预览浮层里的「下载」共用一份实现
    }));

    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const p = b.getAttribute('data-del');
      if (await deleteMedia(p)) {
        state.sel = state.sel.filter((x) => x !== p);
        reload();
      }
    }));

    /* ---- 顶部分档：全部 / 图片 / 视频 ---- */
    body.querySelectorAll('[data-kindt]').forEach((b) => b.addEventListener('click', () => {
      state.kind = b.getAttribute('data-kindt') || undefined;
      state.page = 1;
      state.sel = [];
      reload();
    }));
  }
};

/* ============================== 视图：店铺装修（内嵌装修台） ============================== */

App.views.decorate = {
  async render(body) {
    body.innerHTML =
      '<div class="card" style="margin-bottom:10px"><div class="card-h"><h2>店铺装修</h2><div class="grow"></div>' +
        '<span class="hint">可视化编辑小程序页面，改完点「发布」写回 replica.js</span>' +
        '<a class="btn" href="/admin" target="_blank">在新窗口打开 ↗</a></div>' +
      '<div class="card-b" style="padding:0"><div class="frame-wrap"><iframe src="/admin" title="店铺装修台"></iframe></div></div></div>';
  }
};
