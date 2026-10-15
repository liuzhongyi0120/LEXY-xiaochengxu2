/**
 * 店铺笔记 · 详情页
 *
 * 数据来自 `replica.SHOPNOTES[id]`（装修台「+ 新建笔记」→ 装修 → 生成代码 才下发）。
 * 版式与有赞店铺笔记详情一致（取证见 `deploy/有赞店铺笔记装修页-取证.md` 第三节）：
 *
 *   店长区（笔记头部）：标题 + 发布时间 +（进店按钮）
 *   笔记正文：富文本，固定不可删
 *   笔记组件：可自由增删排序的组件流（只放有赞笔记那 7 个组件）
 *
 * 打开方式：`/packageNews/note/note?id=<笔记编号>`
 *
 * ⚠️ 与自定义页（pages/custom）的分工：
 *   自定义页整页就是一个组件流，没有固定区域；笔记有**固定头部 + 固定正文**，
 *   只有第三段是可拼的 —— 所以不能复用 pages/custom，必须是独立页面。
 *
 * ⚠️ 「浏览量 / 点赞数 / 推荐商品」三个开关**不渲染任何东西**：
 *   自建商城没有笔记计数器与推荐引擎（装修台字段提示里已写明）。
 *   宁可什么都不显示，也不显示一个编出来的「0 浏览 / 0 赞」。
 */

const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, applyShopAvatar, sanitizeRich } = require('../../utils/blocks');
const { blockPageBehavior } = require('../../utils/blockPage');
const { formatTime } = require('../../utils/format');
const { px2rpx } = require('../../utils/units');

/** 店铺信息（店长区要显示店铺头像与名字，头像可能是后台上传的相对路径） */
const SHOP = resolveAssets(replica.SHOP || {});
/** 全部笔记：{ '<id>': { title, body, header, blocks, … } } */
const SHOPNOTES = replica.SHOPNOTES || {};

/** 头部 6 个显示开关的缺省值（与 shopnotes.HEADER_DEFAULT 同口径：全部默认显示） */
const HEADER_FALLBACK = {
  showTitle: true, showPublishTime: true, showBrowseCount: true,
  showThumbsUpCount: true, showEnterShop: true, showRecommendItems: true
};
/** 正文「不全屏」时的左右内边距（375 基准 12px → 24rpx），与首页富文本区块的页面边距同量级 */
const BODY_PAD_RPX = px2rpx(12);

Page(Object.assign({}, blockPageBehavior, {
  data: {
    id: '',
    missing: false,
    note: {
      title: '',
      summary: '',
      tags: [],
      covers: [],
      coverMode: 'multi',
      showGoodsCard: false,
      publishText: '',
      bodyNodes: '',
      bodyBg: '#ffffff',
      bodyPadRpx: 0,
      showTitle: true,
      showPublishTime: true,
      showEnterShop: true,
      shopName: '',
      shopAvatar: ''
    },
    blocks: []
  },

  onLoad(query) {
    const id = (query && query.id) || '';
    const raw = SHOPNOTES[id];

    // 找不到：多半是运营建了笔记但还没点「生成代码」，或链接里的编号过期了
    if (!raw) {
      this.setData({ id: id, missing: true });
      wx.setNavigationBarTitle({ title: '笔记不存在' });
      return;
    }

    const h = Object.assign({}, HEADER_FALLBACK, raw.header || {});
    const b = raw.body || {};
    // 「全屏显示」= 占满整宽（忽略页面边距），与首页富文本区块同一口径
    const full = String(b.full === undefined ? '1' : b.full) === '1';

    const tags = String(h.tags || '')
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    this.setData({
      id: id,
      missing: false,
      note: {
        title: h.title || '',
        summary: h.summary || '',
        tags: tags,
        // 封面/摘要/标签是**笔记列表**的展示素材；详情页只把它们带进 data 供分享卡片用
        covers: (h.covers || []).map((c) => resolveAssets(c)).filter(Boolean),
        coverMode: h.coverMode === 'single' ? 'single' : 'multi',
        showGoodsCard: !!h.showGoodsCard,
        publishText: formatTime(raw.publishedAt).slice(0, 10),
        bodyNodes: sanitizeRich(b.html || ''),
        bodyBg: b.bg || '#ffffff',
        bodyPadRpx: full ? 0 : BODY_PAD_RPX,
        showTitle: h.showTitle !== false,
        showPublishTime: h.showPublishTime !== false,
        showEnterShop: h.showEnterShop !== false,
        shopName: SHOP.name || 'LEXY莱克',
        shopAvatar: SHOP.avatar || ''
      },
      blocks: applyShopAvatar(normalizeBlocks(raw.blocks || []), SHOP.avatar || '')
    }, () => {
      // 商品组件要实时价格/库存（装修时存的是快照），与首页 / 自定义页共用同一份实现
      this.loadGoodsBlocks();
    });

    wx.setNavigationBarTitle({ title: h.title || '店铺笔记' });
  },

  /** 离开页面时释放语音播放器（区块事件见 utils/blockPage.js） */
  onUnload() {
    this.onUnloadBlockAudio();
  },

  /** 店长区「进店」：回首页（tabBar 页必须 switchTab，navigateTo 会失败） */
  onEnterShop() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    const n = this.data.note || {};
    const first = (this.data.blocks || [])[0] || {};
    const first0 = (first.images || [])[0];
    // 分享图优先用封面（封面本来就是笔记的对外形象），没有才回落到第一张区块图
    const img = (n.covers || [])[0] || (first0 && first0.image) || first.src || '';
    return {
      title: n.title || 'LEXY莱克 · 店铺笔记',
      path: '/packageNews/note/note?id=' + this.data.id,
      imageUrl: img
    };
  },

  onShareTimeline() {
    const n = this.data.note || {};
    return {
      title: n.title || 'LEXY莱克 · 店铺笔记',
      query: 'id=' + this.data.id,
      imageUrl: (n.covers || [])[0] || ''
    };
  }
}));
