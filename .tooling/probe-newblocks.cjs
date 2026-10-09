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

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
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
  }
];

(async () => {
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
    ok('8 种新区块全部通过 schema 校验（草稿保存成功）',
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
    ok('回读区块数 = 8', got.length === 8, `实际 ${got.length}`);
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
      ['buy_bar.btnBg', got[7] && got[7].btnBg, '#C8102E']
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
    ok('小程序 normalizeBlocks 认全部 8 种新区块',
      nb.length === 8 && nb.every((b) => !!b.type), nb.map((b) => b.type).join(','));
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
      ['buy_bar.text 默认兜底存在', !!nb[7].text]
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
