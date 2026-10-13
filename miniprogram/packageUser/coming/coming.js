/**
 * 功能未开放（packageUser）
 *
 * 这一页存在的唯一理由：**「点了没反应」比「点了告诉你为什么没有」糟得多**。
 *
 * 「我的」页里有几个入口（任务中心 / 赠品 / 分销员中心 / 线下门店 / 退款售后 …）
 * 依赖本店还没有的业务底座，按项目口径**不假装可用**。以前它们点下去只弹一句
 * 「该功能开发中」，用户不知道是谁的问题、也不知道该去哪儿；
 * 现在统一落到这一页，把**具体依赖什么**写清楚。
 *
 * `name` 与 `desc` 由入口侧（`utils/blockPage.js` 的 NOT_READY 表）带过来 ——
 * 原因只有一处定义，避免页面里再堆一套 if-else。
 */

Page({
  data: {
    name: '',
    desc: '',
    /** 兜底说明：入口没带 desc 时也不能显示空白 */
    fallback: '这一项依赖的业务数据尚未接入，接入后会自动开放。'
  },

  onLoad(options) {
    const o = options || {};
    this.setData({
      name: String(o.name || '').trim(),
      desc: String(o.desc || '').trim()
    });
    wx.setNavigationBarTitle({ title: this.data.name || '功能未开放' });
  },

  onBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  },

  onGoMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  }
});
