const { syncTabBar } = require('../../utils/tabbar');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, applyShopAvatar } = require('../../utils/blocks');
const { blockPageBehavior } = require('../../utils/blockPage');
const { navState, isImmersive } = require('../../utils/navbar');

Page(Object.assign({}, blockPageBehavior, {
  /** 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知） */
  onShow() {
    syncTabBar(this);
  },

  data: {
    shop: resolveAssets(replica.SHOP),
    meta: (replica.PAGE_META && replica.PAGE_META.home) || { bg: '#F5F6F8', desc: '' },
    blocks: [],
    /*
     * 自绘导航栏参数（页面 .json 里写了 navigationStyle: custom，标题栏必须由 nav-bar 画）。
     * 标题取店铺名：原生导航栏原本显示的就是它（navigationBarTitleText: "LEXY莱克"）。
     */
    nav: null
  },

  onLoad() {
    const blocks = applyShopAvatar(
      normalizeBlocks(replica.HOME_BLOCKS || []),
      (this.data.shop && this.data.shop.avatar) || ''
    );
    this.setData({
      blocks,
      nav: navState(this.data.meta, (this.data.shop && this.data.shop.name) || 'LEXY莱克')
    }, () => this.loadGoodsBlocks());
  },

  /**
   * 沉浸式：上划过阈值后标题栏才浮现（对标有赞「上划时标题栏才浮现」）。
   * 阈值取整条标题栏的高度 —— 划过一整条再出现，避免刚动一点标题栏就跳出来挡内容。
   * 标准模式标题栏常驻，不需要处理（这里直接 return，省掉一次 setData）。
   */
  onPageScroll(e) {
    const nav = this.data.nav;
    if (!nav || !isImmersive(nav.mode)) return;
    const solid = (e && e.scrollTop || 0) > (nav.total || 64);
    if (solid === nav.solid) return;
    this.setData({ 'nav.solid': solid });
  },

  /** 离开页面时释放语音播放器（区块事件见 utils/blockPage.js） */
  onUnload() {
    this.onUnloadBlockAudio();
  },

  onShareAppMessage() {
    const first = (this.data.blocks || [])[0] || {};
    // images 的元素是 { image, link } 对象（每张图可单独设跳转），取图要 .image
    const first0 = (first.images || [])[0];
    const img = (first0 && first0.image) || first.src || '';
    return {
      title: (this.data.shop && this.data.shop.name) || 'LEXY莱克',
      path: '/pages/index/index',
      imageUrl: img
    };
  }
}));
