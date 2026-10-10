/**
 * 装修区块页面的公共行为（首页 pages/index 与自定义页 pages/custom 共用）
 *
 * 为什么要抽出来：这两个页面的区块渲染早就收敛到 templates/blocks.wxml 一份了，
 * 但事件处理还是一人抄了一份 —— 每次新增区块类型，两边的 onXxx 都要各写一遍，
 * 漏写哪边就是「那边点了没反应」。这里把区块事件收成一份，
 * 页面只要 `Page(Object.assign({}, blockPageBehavior, { 自己的 data/onLoad }))` 即可。
 *
 * ⚠️ 跳转一律走 utils/link.js 的 openLink（tab 页必须 switchTab）；
 *    区块事件相关的字段名（data-link / data-index / data-goods…）改动时，
 *    必须同步 templates/blocks.wxml。
 */

const { openLink } = require('./link');
const { loadGoodsData } = require('./blocks');

const GOODS_LIST = '/packageGoods/list/list';
const GOODS_DETAIL = '/packageGoods/detail/detail';

const blockPageBehavior = {
  /**
   * 商品区块的实时数据（装修里存的是快照，价格库存会过期）。
   * 首页与自定义页共用这一份实现 —— 两边各写一遍的话，改了一处漏一处就会出现
   * 「首页商品点得动、活动页点不动」这类只在某个页面复现的问题。
   */
  loadGoodsBlocks() {
    return loadGoodsData(this.data.blocks || []).then((next) => {
      if (next && Object.keys(next).length) this.setData(next);
      return next;
    });
  },

  /**
   * 点商品区块的失败占位重试。
   * 之所以做成点击重试而不是只提示「加载失败」：小程序 tab 页切走再回来走的是 onShow，
   * onLoad 不会重跑，「重进页面」其实恢复不了。
   */
  onRetryGoods() {
    wx.showLoading({ title: '重新加载中', mask: true });
    return this.loadGoodsBlocks().then(() => wx.hideLoading(), () => wx.hideLoading());
  },

  /** 图片加载失败兜底，避免出现破图 */
  onImgError(e) {
    const { index } = e.currentTarget.dataset;
    if (index === undefined) return;
    this.setData({ ['blocks[' + index + '].failed']: true });
  },

  /** 商品区块内单张商品图加载失败，降级为色块 */
  onGoodsImgError(e) {
    const { b, g } = e.currentTarget.dataset;
    if (b === undefined || g === undefined) return;
    this.setData({ ['blocks[' + b + '].goods[' + g + '].failed']: true });
  },

  /** 通用跳转：标题 / 公告 / 导航 / 魔方 / 热区 / 单图 / 轮播每一张 / 店铺信息 / 内容卡片 */
  onTapBlock(e) {
    openLink(e.currentTarget.dataset.link, { failText: '页面暂未开放' });
  },

  /** 商品卡片 → 商品详情 */
  onTapGoods(e) {
    const id = e.currentTarget.dataset.goods;
    if (!id) return;
    wx.navigateTo({ url: GOODS_DETAIL + '?id=' + id, fail: () => wx.showToast({ title: '商品详情页开发中', icon: 'none' }) });
  },

  /** 双层轮播：主图切换 */
  onDoubleChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ ['blocks[' + index + '].dCur']: e.detail.current });
  },

  /** 双层轮播：点缩略图切主图 */
  onPickThumb(e) {
    const { block, i } = e.currentTarget.dataset;
    this.setData({ ['blocks[' + block + '].dCur']: Number(i) });
  },

  /**
   * 商品搜索：默认进商品列表页搜索，「整块跳转」模式则直接跳配置的链接。
   * 列表页会带 keyword 打开并自动聚焦输入框。
   */
  onSearchTap(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.mode === 'link') {
      openLink(ds.link, { failText: '页面暂未开放' });
      return;
    }
    // 「店铺热搜」点某个词 → 带着关键词进列表页直接搜（有赞同义）
    const kw = String(ds.w || '').trim();
    const q = kw ? ('keyword=' + encodeURIComponent(kw)) : 'focus=1';
    wx.navigateTo({
      url: GOODS_LIST + '?' + q,
      fail: () => wx.showToast({ title: '商品列表页开发中', icon: 'none' })
    });
  },

  /**
   * 「商品分组」切换分组。
   *
   * 分组的商品在 loadGoodsData 里**一次性全取回来了**（存在 `blocks[i].groupTabs`），
   * 所以这里只改当前下标，不再打接口 —— 列表页横滑分组时最忌讳「点一次打一次」。
   */
  onTapGroupTab(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.b === undefined || ds.gi === undefined) return;
    this.setData({ ['blocks[' + ds.b + '].active']: Number(ds.gi) || 0 });
  },

  /** 扫一扫 → 拿条码/文字去商品列表页搜（与有赞「扫商品条码」同义） */
  onScanTap() {
    wx.scanCode({
      success: (res) => {
        const kw = encodeURIComponent(res.result || res.path || '');
        if (!kw) return;
        wx.navigateTo({ url: GOODS_LIST + '?keyword=' + kw, fail: () => {} });
      },
      fail: () => {}
    });
  },

  /**
   * 电梯导航：滚动到目标区块。
   *
   * 目标存的是「区块序号（1 开始）」——与有赞「只能定位到本组件下方的组件」一致。
   * 小程序用 pageScrollTo 的 selector 模式即可，不需要自己算 scrollTop。
   */
  onElevatorTap(e) {
    const { i, target } = e.currentTarget.dataset;
    const blockIdx = e.currentTarget.dataset.blk;
    if (blockIdx === undefined) return;
    this.setData({ ['blocks[' + blockIdx + '].activeIndex']: Number(i) });
    const t = Number(target);
    if (!t || t < 1) return;
    wx.pageScrollTo({ selector: '#blk-' + (t - 1), duration: 300, fail: () => {} });
  },

  /** 语音：点击播放 / 暂停（同一时间只播一条） */
  onAudioTap(e) {
    const idx = e.currentTarget.dataset.blk;
    if (idx === undefined) return;
    const b = (this.data.blocks || [])[idx];
    if (!b || !b.src) {
      wx.showToast({ title: '未配置音频地址', icon: 'none' });
      return;
    }

    const same = !!this._audio && this._audioIdx === idx;

    // 再点同一条 → 暂停，按钮态必须同步回 ▶（否则气泡一直显示暂停图标）
    if (same && this._audioPlaying) {
      this._audio.pausedAt = this._audio.currentTime || 0;
      this._audio.pause();
      this._audioPlaying = false;
      this.setData({ ['blocks[' + idx + '].audioPlaying']: false });
      return;
    }

    // 切到另一条语音：先销毁上一条，并把上一条的按钮态归位，避免「上一个气泡仍在播放」的假象
    if (this._audio && !same) {
      const prev = this._audioIdx;
      this._audio.destroy();
      this._audio = null;
      this._audioIdx = null;
      if (prev !== null && prev !== undefined) {
        this.setData({ ['blocks[' + prev + '].audioPlaying']: false });
      }
    }

    let ctx = same ? this._audio : null;
    if (!ctx) {
      ctx = wx.createInnerAudioContext();
      ctx.src = b.src;
      this._audio = ctx;
      this._audioIdx = idx;
      ctx.onEnded(() => {
        this._audioPlaying = false;
        this.setData({ ['blocks[' + idx + '].audioPlaying']: false });
      });
      ctx.onError(() => {
        this._audioPlaying = false;
        this.setData({ ['blocks[' + idx + '].audioPlaying']: false });
        wx.showToast({ title: '语音播放失败', icon: 'none' });
      });
    }
    // 「暂停后从暂停位置开始」才带 startTime；「暂停后从头开始」显式归零
    ctx.startTime = b.resume === 'resume' ? (ctx.pausedAt || 0) : 0;
    this._audioPlaying = true;
    this.setData({ ['blocks[' + idx + '].audioPlaying']: true });
    ctx.play();
  },

  /** 购买按钮（吸底）→ 商品详情页下单 */
  onBuyBarTap(e) {
    const id = e.currentTarget.dataset.goods;
    if (!id) {
      wx.showToast({ title: '未配置商品', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: GOODS_DETAIL + '?id=' + id, fail: () => wx.showToast({ title: '商品详情页开发中', icon: 'none' }) });
  },

  /* ------------------------- 品牌分类（对标有赞「品牌分类E」） ------------------------- */

  /**
   * 点左侧品牌开关，切换右栏内容。
   * 只改本页 data（activeBrand），**不动装修数据** —— 有赞同口径：
   * 预览时选中哪个品牌属于浏览态，不该被发布出去。
   */
  onBrandTap(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.blk === undefined || ds.bi === undefined) return;
    const i = Number(ds.bi);
    if (this.data['blocks[' + ds.blk + '].activeBrand'] === i) return;
    this.setData({ ['blocks[' + ds.blk + '].activeBrand']: i });
  },

  /** 滑屏切换模式：左右滑动右栏内容（与点左侧导航等价） */
  onBrandSwipe(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.blk === undefined) return;
    const i = Number(e.detail && e.detail.current);
    if (isNaN(i)) return;
    this.setData({ ['blocks[' + ds.blk + '].activeBrand']: i });
  },

  /**
   * 分类图点击。
   * 「整体跳转」时整格都能点（由外层的 onTapBlock 负责），这里只处理「热区跳转」；
   * 用 bindtap 而不是 catchtap —— catch 会掐断冒泡，整体跳转那一格就再也点不动了。
   */
  onBrandPicTap(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.hot && ds.link) openLink(ds.link, { failText: '页面暂未开放' });
  },

  /** 分类图加载失败 → 留灰底，不显示破图 */
  onBrandImgError(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.blk === undefined || ds.bi === undefined) return;
    this.setData({
      ['blocks[' + ds.blk + '].brands[' + ds.bi + '].panels[' + ds.pi + '].items[' + ds.ii + '].failed']: true
    });
  },

  /** 离开页面时释放音频，避免后台还在响 */
  onUnloadBlockAudio() {
    if (this._audio) {
      this._audio.destroy();
      this._audio = null;
      this._audioIdx = null;
      this._audioPlaying = false;
    }
  }
};

module.exports = { blockPageBehavior };
