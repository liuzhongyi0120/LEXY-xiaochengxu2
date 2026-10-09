/**
 * 通用自定义页面
 *
 * 装修台「店铺页面 → + 新建页面」建出来的页面都跑在这一个页面上，
 * 通过 query.key 区分（小程序 pages 是编译期固定的，没法动态加页面）。
 * 数据来自 replica.CUSTOM_PAGES[key]，结构是 { name, blocks, meta }，
 * 与首页的区块完全同构，所以渲染逻辑直接复用 utils/blocks.js。
 *
 * 打开方式：/pages/custom/index?key=页面标识
 *
 * 旧标识兼容：运营在装修台改过标识的页面，旧地址（已经分享到聊天/朋友圈、印在二维码里、
 * 被其他页面链接引用）会落在 replica.CUSTOM_PAGE_ALIASES 里，这里查到就转到新标识。
 * 不这么做的话，运营改个名字就会让一批已经发出去的链接变成空白页。
 */

const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, applyShopAvatar } = require('../../utils/blocks');
const { blockPageBehavior } = require('../../utils/blockPage');

/** 店铺头像可能是后台上传的 /uploads/… 相对路径，必须过一遍素材地址解析（首页同理） */
const SHOP = resolveAssets(replica.SHOP || {});

const CUSTOM_PAGES = replica.CUSTOM_PAGES || {};
/** 旧标识 → 新标识（装修台改标识时登记，随发布写进 replica） */
const ALIASES = replica.CUSTOM_PAGE_ALIASES || {};

Page(Object.assign({}, blockPageBehavior, {
  data: {
    key: '',
    title: '',
    meta: { bg: '#F5F6F8' },
    blocks: [],
    missing: false
  },

  onLoad(query) {
    const asked = (query && query.key) || '';
    // r=1 表示这是别名跳转过来的第二次进入：再找不到就只能认「页面不存在」，避免来回跳
    const redirected = !!(query && query._r);

    // 旧标识：转到新标识（redirectTo 换掉页面栈里的地址，分享出去的就是新地址）
    if (!CUSTOM_PAGES[asked] && ALIASES[asked] && !redirected) {
      wx.redirectTo({ url: '/pages/custom/index?key=' + ALIASES[asked] + '&_r=1' });
      return;
    }

    const page = CUSTOM_PAGES[asked];

    // 找不到页面：多半是运营建了页面但还没点「生成代码」，或标识填错了
    if (!page) {
      this.setData({ key: asked, missing: true, title: '页面不存在' });
      wx.setNavigationBarTitle({ title: '页面不存在' });
      return;
    }

    const blocks = applyShopAvatar(normalizeBlocks(page.blocks || []), SHOP.avatar || '');
    this.setData({
      key: asked,
      title: page.name || '活动页',
      meta: page.meta || { bg: '#F5F6F8' },
      blocks: blocks
    }, () => {
      // 商品区块要实时数据，装修时存的是快照（与首页共用同一份实现）
      this.loadGoodsBlocks();
    });

    wx.setNavigationBarTitle({ title: page.name || '活动页' });
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
      title: this.data.title || 'LEXY莱克',
      path: '/pages/custom/index?key=' + this.data.key,
      imageUrl: img
    };
  }
}));
