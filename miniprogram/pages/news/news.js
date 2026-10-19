const { syncTabBar } = require('../../utils/tabbar');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { retryUrl } = require('../../utils/imgRetry');

Page({
  /** 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知） */
  onShow() {
    syncTabBar(this);
  },

  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.news && replica.PAGE_META.news.bg) || '#ffffff',
    news: resolveAssets(replica.NEWS)
  },

  /**
   * 8 个栏目在源页面各自链到一个独立微页面。
   * 真实内容已抓取并归一化到 packageNews/data.js，这里跳转到通用内容页渲染。
   */
  onTapItem(e) {
    const { key } = e.currentTarget.dataset;
    if (key) {
      wx.navigateTo({
        url: '/packageNews/detail/detail?key=' + key,
        fail: () => wx.showToast({ title: '打开失败，请重试', icon: 'none' })
      });
      return;
    }
    const { image } = e.currentTarget.dataset;
    if (image) wx.previewImage({ urls: [image] });
  },

  onImgError(e) {
    const { group, index } = e.currentTarget.dataset;
    const list = (this.data.news && this.data.news[group]) || [];
    const cur = (list[index] && list[index].image) || '';
    /* 失败先换地址重试一次；仍失败才落空占位（微信会缓存坏图 URL，同地址不再请求） */
    const next = retryUrl(cur);
    const path = group === 'big' ? `news.big[${index}]` : `news.small[${index}]`;
    if (next) {
      this.setData({ [path + '.image']: next });
      return;
    }
    this.setData({ [path + '.failed']: true });
  },

  onShareAppMessage() {
    return {
      title: '了解莱克',
      path: '/pages/news/news',
      imageUrl: this.data.news.big[0].image
    };
  }
});
