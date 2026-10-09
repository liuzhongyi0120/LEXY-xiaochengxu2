/**
 * 新增 8 种装修区块的端到端冒烟（临时自定义页，跑完自动删除，零残留）
 *
 * 覆盖链路：
 *   建临时页 → 存草稿（8 种新区块全带上）→ 看 schema 校验是否放行
 *   → 发布（写进 replica.CUSTOM_PAGES）→ 回读 replica.js 校验字段逐项落地
 *   → 用小程序端的 normalizeBlocks 过一遍，确认派生字段（rpx / 百分比）算得出来
 *   → 删除临时页，并把 replica.js 复原
 *
 * 为什么要有这一条：
 *   「后台能配」和「真机上有东西」是两件事。schema 放行不等于 emit 写得出、
 *   更不等于小程序端 normalize 认得。这三段任意一段断了，都是运营配完看不到东西。
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const REPLICA = join(ROOT, 'miniprogram', 'config', 'replica.js');
const blocksMod = require(join(ROOT, 'miniprogram', 'utils', 'blocks.js'));

const KEY = 'zzprobenewblocks';
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n      ↳ ' + detail : '')); }
}

/** 管理员令牌（启动时填充）。`/api/decorate/*` 全部要管理员身份，没有它整轮都会 401。 */
let ADMIN = '';

/** 换取管理员会话：ADMIN_TOKEN → ADMIN_PASSWORD → 非生产默认 admin */
async function fetchAdminToken() {
  const env = String(process.env.ADMIN_TOKEN || '').trim();
  if (env) {
    const r = await fetch(BASE + '/api/admin/session', { headers: { Authorization: 'Bearer ' + env } });
    const j = await r.json().catch(() => null);
    if (j && j.code === 0) return env;
  }
  const pwds = [process.env.ADMIN_PASSWORD, process.env.NODE_ENV === 'production' ? '' : 'admin'].filter(Boolean);
  for (const password of pwds) {
    const r = await fetch(BASE + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    const j = await r.json().catch(() => null);
    if (j && j.code === 0 && j.data && j.data.token) return j.data.token;
  }
  return '';
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + ADMIN },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  return json;
}

/**
 * 在沙箱里执行 replica.js 并取回 module.exports。
 *
 * 注意：不能把 module.exports 那段「剪掉」再跑 —— 剪掉后 exports 就是空对象，
 * 会误报成「页面数据丢了」。整份源码（含 module.exports）一起执行才对。
 */
function loadReplica(src) {
  const sandbox = { module: { exports: {} }, exports: {}, console };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'replica.js' }).runInContext(sandbox);
  return sandbox.module.exports;
}

/** 忽略「最后发布 <时间戳>」注释后再比对（每次发布都会刷新这行，纯时间噪声） */
function stable(src) {
  return src.replace(/\/\* 本文件由「店铺装修后台」生成[\s\S]*?\*\//, '/* <generated-at> */');
}
/** 只比对数据体（导出对象），避免注释时间戳造成假失败 */
function dataHash(src) {
  return createHash('sha1').update(JSON.stringify(loadReplica(src))).digest('hex').slice(0, 12);
}

/** 8 种区块各一份「字段填满」的样本，用来确认没有一个字段会在链路里丢 */
const BLOCKS = [
  {
    type: 'rich_text',
    html: '<p>莱克 <b>洗地机</b> 到店</p><img src="/uploads/202610/a.png" />',
    bg: '#FFFFFF', full: '1', pageMargin: 12
  },
  {
    type: 'search',
    placeholder: '搜洗地机', mode: 'input', sticky: 'sticky', shape: 'round',
    textAlign: 'center', boxHeight: 40, scan: true,
    bg: '#FFFFFF', boxBg: '#F5F6F8', color: '#999999',
    link: '/pages/lexy/lexy', pageMargin: 12
  },
  {
    type: 'elevator',
    mode: 'scroll', styleType: 'theme', tagStyle: 'round',
    items: [{ text: '热销', target: 3 }, { text: '新品', target: 5 }],
    color: '#323233', activeColor: '#C8102E', bg: '#FFFFFF', pageMargin: 0
  },
  {
    type: 'enter_shop',
    text: '进入店铺', align: 'center', color: '#323233', bg: '#FFFFFF',
    radius: 'round', link: '/pages/index/index', bgOut: '', pageMargin: 12
  },
  {
    type: 'audio',
    src: '/uploads/202610/v.mp3', duration: 12, text: '听听看', avatar: '',
    useShopLogo: true, side: 'left', resume: 'restart', pageMargin: 16
  },
  {
    type: 'service',
    text: '在线咨询', align: 'center', color: '#FFFFFF', bg: '#07C160',
    radius: 'round', bgOut: '', pageMargin: 12
  },
  {
    type: 'content_card',
    title: '专题推荐', cols: '2', ratio: '0.75',
    items: [
      { image: '/uploads/202610/c1.png', title: '卡一', desc: '说明一', link: '/pages/news/news' },
      { image: '/uploads/202610/c2.png', title: '卡二', desc: '', link: '' }
    ],
    style: 'shadow', radius: 'round', showTag: true, showRead: false, showLike: true,
    more: true, moreText: '看更多', link: '/pages/product/product', pageMargin: 12
  },
  {
    type: 'buy_bar',
    goodsId: 'g1001', text: '立即抢购', fontSize: 16, align: 'center', theme: 'custom',
    btnBg: '#C8102E', padX: 16, padB: 14, btnH: 48, btnR: 4,
    bgOn: true, bg: '#FFFFFF', bgH: 76
  },
  {
    // 品牌分类（对标有赞「高级组件 · 品牌分类E」）：
    // 三层数据（品牌 → 小组 → 条目）各来两份，样式三组 + 扩展设置逐项填满，
    // 用来确认「有赞面板 62 个字段」没有任何一个在链路里丢掉。
    type: 'brand_category',
    brands: [
      {
        title: '莱克',
        panels: [
          {
            title: '热卖推荐', link: '/pages/product/product', layout: '3',
            items: [
              { image: '/uploads/202610/b1.png', title: '洗地机', desc: '无线手持', link: '/packageGoods/detail/detail?id=g1', linkMode: 'whole' },
              { image: '/uploads/202610/b2.png', title: '吸尘器', desc: '', link: '/packageGoods/detail/detail?id=g2', linkMode: 'hot' }
            ]
          },
          {
            title: '', link: '', layout: 'nav',
            items: [{ image: '/uploads/202610/b3.png', title: 'S10 系列', desc: '', link: '', linkMode: 'whole' }]
          }
        ]
      },
      {
        title: '碧云泉',
        panels: [{ title: '净饮机', link: '', layout: '2', items: [{ image: '/uploads/202610/b4.png', title: 'C5pro3', desc: '', link: '', linkMode: 'whole' }] }]
      }
    ],
    bgImage: '/uploads/202610/bgbg.png', bgTopLink: '/pages/news/news', bgTopGap: 12,
    switchMode: 'slide', navWidth: 30, contentPadX: 8,
    navStyle: 'E', navBg: '#F1F1F1', navColor: '#505050', navColorActive: '#FFFFFF', navBgActive: '#C8102E',
    navBgIdle: '#F9F9F9', navBorderColor: '#DDDDDD', navBorderLine: '#EEEEEE',
    navHeight: 50, navMargin: 2, navBorderH: 12, navBorderW: 2, navFontSize: 16,
    navWeight: '300', navWeightActive: '450', navAlign: 'left',
    itemShadow: 'normal', itemBorderColor: '#EEEEEE', itemTitleColor: '#323233',
    itemGapX: 6, itemGapY: 8, itemRadius: 8, itemTitleSize: 13, itemTitleWeight: '400', itemTitleAlign: 'left',
    panelTitleColor: '#C8102E', panelTitleSize: 18, panelTitleWeight: '700', panelTitleAlign: 'center',
    panelTitleGapX: 4, panelTitleGapY: 6, panelGap: 16, contentPadBottom: 10,
    effect: 'up', effectSpeed: 1.5, effectDelay: 0.3,
    navLogo: '/uploads/202610/logo.png', link: '/pages/index/index', searchMode: 'show',
    bg: '#FFFFFF', moduleBgImage: '/uploads/202610/modbg.png', moduleBgFill: 'contain',
    reserveTabbar: true, navSticky: 'top'
  }
];

(async () => {
  ADMIN = await fetchAdminToken();
  if (!ADMIN) {
    console.error('拿不到管理员会话：请设置 ADMIN_PASSWORD 或 ADMIN_TOKEN 后重跑');
    process.exitCode = 1;
    return;
  }
  const before = readFileSync(REPLICA, 'utf8');
  const beforeHash = dataHash(before);

  // 前置清理：上一次异常退出可能留下临时页
  const pre = await api('GET', '/api/decorate/pages');
  for (const p of ((pre.data && pre.data.list) || []).filter((x) => x.custom && x.key.indexOf(KEY) === 0)) {
    await api('POST', '/api/decorate/page/delete', { key: p.key });
  }

  const made = await api('POST', '/api/decorate/page/create', {
    name: '新区块冒烟', key: KEY, note: 'probe-newblocks', template: 'blank'
  });
  ok('临时自定义页创建成功', made.code === 0, JSON.stringify(made).slice(0, 200));

  try {
    /* ---------- 1) schema 校验放行 ---------- */
    const draft = await api('POST', '/api/decorate/draft', {
      key: KEY,
      data: { blocks: BLOCKS, meta: { bg: '#FFFFFF' } }
    });
    ok('9 种新区块全部通过 schema 校验（草稿保存成功）',
      draft.code === 0, JSON.stringify(draft).slice(0, 300));

    /* ---------- 2) 发布 → 写进 replica.CUSTOM_PAGES ---------- */
    const pub = await api('POST', '/api/decorate/publish', { key: KEY, note: '新区块冒烟' });
    ok('发布成功', pub.code === 0 && /^v\d+$/.test((pub.data && pub.data.versionId) || ''),
      JSON.stringify(pub).slice(0, 300));

    const after = readFileSync(REPLICA, 'utf8');
    ok('replica.js 写入了临时页', after.indexOf(KEY) >= 0);

    /* ---------- 3) 回读 replica.js，逐字段确认没有丢 ---------- */
    const replica = loadReplica(after);
    const page = (replica.CUSTOM_PAGES || {})[KEY];
    ok('回读 replica.js 能拿到该页数据', !!page, Object.keys(replica.CUSTOM_PAGES || {}).join(','));
    const got = (page && page.blocks) || [];
    ok('回读区块数 = 9', got.length === 9, `实际 ${got.length}`);
    ok('回读区块类型顺序正确',
      got.map((b) => b.type).join(',') === BLOCKS.map((b) => b.type).join(','),
      got.map((b) => b.type).join(','));

    const spot = [
      ['rich_text.html 保留完整 HTML（含标签）', got[0] && got[0].html,
        '<p>莱克 <b>洗地机</b> 到店</p><img src="/uploads/202610/a.png" />'],
      ['search.placeholder', got[1] && got[1].placeholder, '搜洗地机'],
      ['search.mode（不能与区块 type 撞名）', got[1] && got[1].mode, 'input'],
      ['elevator.items[1].target', got[2] && got[2].items && got[2].items[1] && got[2].items[1].target, 5],
      ['enter_shop.radius', got[3] && got[3].radius, 'round'],
      ['audio.duration', got[4] && got[4].duration, 12],
      ['service.bg', got[5] && got[5].bg, '#07C160'],
      ['content_card.ratio', got[6] && got[6].ratio, '0.75'],
      ['content_card.items[1].title', got[6] && got[6].items && got[6].items[1] && got[6].items[1].title, '卡二'],
      ['buy_bar.goodsId', got[7] && got[7].goodsId, 'g1001'],
      ['buy_bar.btnBg', got[7] && got[7].btnBg, '#C8102E'],
      // 品牌分类：三层数据 + 三组样式 + 扩展设置都要原样回来
      ['brand_category.brands[0].title', got[8] && got[8].brands && got[8].brands[0] && got[8].brands[0].title, '莱克'],
      ['brand_category.brands[0].panels[0].layout', got[8] && got[8].brands[0].panels[0].layout, '3'],
      ['brand_category.brands[0].panels[0].items[1].linkMode', got[8] && got[8].brands[0].panels[0].items[1].linkMode, 'hot'],
      ['brand_category.brands[0].panels[0].items[0].desc', got[8] && got[8].brands[0].panels[0].items[0].desc, '无线手持'],
      ['brand_category.brands[0].panels[1].layout（导航模式）', got[8] && got[8].brands[0].panels[1].layout, 'nav'],
      ['brand_category.brands[1].title', got[8] && got[8].brands[1] && got[8].brands[1].title, '碧云泉'],
      ['brand_category.navStyle', got[8] && got[8].navStyle, 'E'],
      ['brand_category.navWidth', got[8] && got[8].navWidth, 30],
      ['brand_category.navBorderColor（样式设置·左侧导航）', got[8] && got[8].navBorderColor, '#DDDDDD'],
      ['brand_category.itemTitleAlign（样式设置·右侧内容）', got[8] && got[8].itemTitleAlign, 'left'],
      ['brand_category.effect', got[8] && got[8].effect, 'up'],
      ['brand_category.moduleBgFill（扩展设置）', got[8] && got[8].moduleBgFill, 'contain'],
      ['brand_category.searchMode（扩展设置）', got[8] && got[8].searchMode, 'show']
    ];
    // 字符串字段按「包含」比对（html 那种长文本不该要求全等），其余字段要求全等
    const eq = (v, want) => (String(want).length > 6
      ? String(v).indexOf(String(want)) >= 0
      : String(v) === String(want));
    const lost = spot.filter(([n, v, want]) => !eq(v, want)).map(([n, v, want]) => `${n}: ${v} ≠ ${want}`);
    ok('关键字段在「草稿 → 发布 → 回读」后逐项一致（无丢字段）',
      lost.length === 0, lost.join(' | '));

    /* ---------- 4) 小程序端 normalize 能派生出版式字段 ---------- */
    const nb = blocksMod.normalizeBlocks(JSON.parse(JSON.stringify(got)));
    ok('小程序 normalizeBlocks 认全部 9 种新区块',
      nb.length === 9 && nb.every((b) => !!b.type), nb.map((b) => b.type).join(','));
    const derived = [
      ['rich_text.nodes 已生成', typeof nb[0].nodes === 'string' && nb[0].nodes.indexOf('洗地机') >= 0],
      ['rich_text 脚本被过滤', nb[0].nodes.indexOf('script') < 0 && nb[0].nodes.indexOf('onerror') < 0],
      ['search.hRpx = boxHeight×2', nb[1].hRpx === 80],
      ['search.align 映射到 flex', nb[1].align === 'center'],
      ['elevator.dropdown = false（横向滚动）', nb[2].dropdown === false],
      ['elevator.items 过滤空文字', nb[2].items.length === 2],
      ['enter_shop.justify 映射正确', nb[3].justify === 'center'],
      ['audio.widthRpx 在 220~520 之间', nb[4].widthRpx >= 220 && nb[4].widthRpx <= 520],
      ['audio.right = false（居左）', nb[4].right === false],
      ['service.round = true', nb[5].round === true],
      ['content_card.cellW = 50（两列）', nb[6].cellW === 50],
      ['content_card.padTopPct ≈ 133.33（4:3）', Math.abs(nb[6].padTopPct - 133.33) < 0.05],
      ['content_card.cardClass = shadow', nb[6].cardClass === 'shadow'],
      ['buy_bar.btnBgFinal 走自定义色', nb[7].btnBgFinal === '#C8102E'],
      ['buy_bar.btnHRpx = btnH×2', nb[7].btnHRpx === 96],
      ['buy_bar.bgHRpx = bgH×2', nb[7].bgHRpx === 152],
      ['buy_bar.text 默认兜底存在', !!nb[7].text],
      // 品牌分类：单位换算（×2）、样式风格摊平、网格宽度、动画延迟
      ['brand_category.navWidthPct = 30', nb[8].navWidthPct === 30],
      ['brand_category.navHRpx = 100（50×2）', nb[8].navHRpx === 100],
      ['brand_category.navIndHRpx = 24 / navIndWRpx = 4', nb[8].navIndHRpx === 24 && nb[8].navIndWRpx === 4],
      ['brand_category 风格 E：内高 = 高-20、圆角 = 内高一半', nb[8].navInnerHRpx === 80 && nb[8].navRadiusRpx === 40],
      ['brand_category 风格 E：有底色块 + 上下各留 10rpx', nb[8].navBand === true && nb[8].navPadYRpx === 10],
      ['brand_category 间距换算（gapX 6→半 6 / gapY 8→16 / panelGap 16→32）',
        nb[8].itemHalfGapRpx === 6 && nb[8].itemGapYRpx === 16 && nb[8].panelGapRpx === 32],
      ['brand_category 内距换算（padX 8→16 / padB 10→20 / bgTopGap 12→24）',
        nb[8].padXRpx === 16 && nb[8].padBRpx === 20 && nb[8].bgTopGapRpx === 24],
      ['brand_category 字号换算（标题 13→26 / 小组标题 18→36）',
        nb[8].itemFsRpx === 26 && nb[8].panelTitleFsRpx === 36],
      ['brand_category 左栏对齐映射（left → flex-start）', nb[8].navJustify === 'flex-start'],
      ['brand_category 缓动：class=anim-up / 时长 1500ms / 间隔 300ms',
        nb[8].effectClass === 'anim-up' && nb[8].effectDurMs === 1500 && nb[8].effectDelayMs === 300],
      ['brand_category 逐条动画延迟 = 序号 × 间隔',
        nb[8].brands[0].panels[0].items[0].delayMs === 0 && nb[8].brands[0].panels[0].items[1].delayMs === 300],
      ['brand_category 网格列宽（3 列 → 33.33 / 2 列 → 50）',
        Math.abs(nb[8].brands[0].panels[0].cellW - 33.33) < 0.01 && nb[8].brands[1].panels[0].cellW === 50],
      ['brand_category 导航模式标记（layout=nav）', nb[8].brands[0].panels[1].isNav === true],
      ['brand_category 左栏文案列表 = 品牌名', nb[8].navs.join(',') === '莱克,碧云泉'],
      ['brand_category 模块背景图填充映射（contain + 不平铺）',
        nb[8].modBgStyle.indexOf('contain') >= 0 && nb[8].modBgStyle.indexOf('no-repeat') >= 0],
      ['brand_category 图片 / Logo 已解析为可访问地址',
        nb[8].brands[0].panels[0].items[0].image.indexOf('/uploads/202610/b1.png') >= 0 &&
        nb[8].navLogo.indexOf('/uploads/202610/logo.png') >= 0]
    ];
    const bad = derived.filter(([, c]) => !c).map(([n]) => n);
    ok('小程序端派生字段（rpx / 百分比 / 映射）全部算得出',
      bad.length === 0, bad.join(' | '));

    ok('applyShopAvatar 把店铺头像回填给未设头像的语音区块', (() => {
      const withAv = blocksMod.applyShopAvatar(JSON.parse(JSON.stringify(nb)), '/uploads/logo.png');
      return withAv[4].avatar === '/uploads/logo.png';
    })());

    ok('sanitizeRich 会剥掉 <script> / onerror / javascript:', (() => {
      const s = blocksMod.sanitizeRich('<p onclick="x()">a</p><script>bad()</script><a href="javascript:y()">b</a>');
      return s.indexOf('<script') < 0 && s.indexOf('onclick') < 0 && s.indexOf('javascript:') < 0;
    })());

    /* ---------- 4b) 卡片图片撑高比例：三种比例都要是对的数（4:3 → 133.33%） ---------- */
    const ratioCase = (r) => blocksMod.normalizeBlock({ type: 'content_card', ratio: r }, 0).padTopPct;
    const ratioWant = [['1', 100], ['0.75', 133.33], ['0.5625', 177.78]];
    const ratioBad = ratioWant.filter(([r, want]) => Math.abs(ratioCase(r) - want) > 0.02)
      .map(([r, want]) => `${r} → ${ratioCase(r)}（应为 ${want}）`);
    ok('内容卡片图片撑高比例正确（1:1→100 / 4:3→133.33 / 16:9→177.78）',
      ratioBad.length === 0, ratioBad.join(' | '));

    /* ---------- 4c) 品牌分类：5 种标题风格 + 收敛与过滤 ----------
     * 「风格」是有赞这套组件最容易只做一半的地方 —— 后台能选 5 种、真机上 5 种长得一样，
     * 属于「看着能配、其实没生效」。所以这里把每种风格的关键派生值逐个锁死。 */
    const bcat = (patch) => blocksMod.normalizeBlock(Object.assign({ type: 'brand_category' }, patch), 0);
    // 统一导航尺寸：高 45→90rpx、边框高 10→20rpx、间距 1→2rpx
    const styleBase = { navHeight: 45, navMargin: 1, navBorderH: 10, navBorderW: 1, navFontSize: 15 };
    const styleWant = [
      // 风格, 内高, 上下内距, 圆角, 是否有底色块
      ['A', 110, 1, 0, true],   // 比 B~D 高出「选中边框高度」20rpx
      ['B', 90, 0, 0, false],
      ['C', 90, 0, 0, false],
      ['D', 90, 0, 0, false],
      ['E', 70, 10, 35, true]   // 胶囊：上下各留 10rpx，圆角 = 内高一半
    ];
    const styleBad = styleWant.filter(([s, inner, pad, radius, band]) => {
      const x = bcat(Object.assign({ navStyle: s }, styleBase));
      return x.navInnerHRpx !== inner || x.navPadYRpx !== pad ||
        x.navRadiusRpx !== radius || x.navBand !== band;
    }).map(([s, inner, pad, radius, band]) => {
      const x = bcat(Object.assign({ navStyle: s }, styleBase));
      return `${s} → 内高${x.navInnerHRpx}(应${inner})/上下${x.navPadYRpx}(应${pad})/圆角${x.navRadiusRpx}(应${radius})/底色块${x.navBand}(应${band})`;
    });
    ok('品牌分类 5 种标题风格各自正确（A 比 B~D 高一截、E 是胶囊）',
      styleBad.length === 0, styleBad.join(' | '));

    ok('品牌分类风格标记 C / D 互斥（样式靠 class 分叉，标错就是「选了没变化」）', (() => {
      const c = bcat(Object.assign({ navStyle: 'C' }, styleBase));
      const d = bcat(Object.assign({ navStyle: 'D' }, styleBase));
      return c.navIsC === true && c.navIsD === false && d.navIsD === true && d.navIsC === false;
    })());

    ok('品牌分类非法值一律收敛（风格→C / 缓动→关闭 / 布局→2 列 / 列数上限 4）', (() => {
      const x = bcat({
        navStyle: 'Z', effect: 'nope',
        brands: [{ title: 'A', panels: [{ layout: 'x', items: [{ title: 't' }] }, { layout: '9', items: [{ title: 't' }] }] }]
      });
      return x.navStyle === 'C' && x.effect === 'none' && x.effectClass === '' &&
        x.brands[0].panels[0].cellW === 50 && x.brands[0].panels[1].cellW === 25;
    })());

    ok('品牌分类的上限与过滤（品牌 ≤11、条目 ≤60、无标题品牌与空条目一律剔除）', (() => {
      const many = Array.from({ length: 15 }, (_, i) => ({ title: 'B' + i, panels: [] }));
      const x = bcat({ brands: [{ title: '', panels: [] }].concat(many, [null]) });
      const y = bcat({ brands: [{ title: 'A', panels: [{ items: Array.from({ length: 80 }, (_, i) => ({ title: 't' + i })) }] }] });
      const z = bcat({ brands: [{ title: 'A', panels: [{ items: [{ image: '' }, { title: '' }, { title: 'ok' }] }] }] });
      return x.brands.length === 11 && y.brands[0].panels[0].items.length === 60 &&
        z.brands[0].panels[0].items.length === 1 && z.brands[0].panels[0].items[0].title === 'ok';
    })());

    ok('品牌分类空数据时不炸模板（brands / navs 都是空数组，模板走空态分支）', (() => {
      const x = bcat({});
      return Array.isArray(x.brands) && x.brands.length === 0 && Array.isArray(x.navs) && x.navs.length === 0 &&
        x.activeBrand === 0;
    })());
  } finally {
    /* ---------- 5) 清理：删页面 + 复原 replica.js ---------- */
    const del = await api('POST', '/api/decorate/page/delete', { key: KEY });
    ok('临时自定义页删除成功', del.code === 0, JSON.stringify(del).slice(0, 200));
    const restored = readFileSync(REPLICA, 'utf8');
    ok('删除后 replica.js 里已无临时页残留', restored.indexOf(KEY) < 0);
    // 数据体哈希一致即「零残留」；注释里的「最后发布 <时间戳>」每轮都会变，属正常
    ok('删除后 replica.js 的数据体与冒烟前完全一致（零残留）',
      dataHash(restored) === beforeHash, `before=${beforeHash} after=${dataHash(restored)}`);
    ok('replica.js 除「生成时间」注释外逐字节复原',
      stable(restored) === stable(before));
  }

  console.log('\n──────────────────────────────');
  console.log(`${pass}/${pass + fail} 通过`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：', e);
  process.exit(1);
});
