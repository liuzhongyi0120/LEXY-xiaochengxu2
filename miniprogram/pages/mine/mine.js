const { syncTabBar } = require('../../utils/tabbar');
const { isLogged } = require('../../utils/auth');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');

Page({
  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.mine && replica.PAGE_META.mine.bg) || '#ffffff',
    logged: false,
    shop: resolveAssets(replica.SHOP),

    /** 订单状态入口，key 与后端订单状态约定保持一致 */
    orderTabs: [
      { key: 'PENDING_PAY', label: '待付款' },
      { key: 'PENDING_SHIP', label: '待发货' },
      { key: 'SHIPPED', label: '待收货' },
      { key: 'FINISHED', label: '已完成' }
    ],

    /** 资产入口（有赞个人中心标准配置） */
    assets: [
      { key: 'coupon', label: '优惠券' },
      { key: 'point', label: '积分' },
      { key: 'balance', label: '余额' },
      { key: 'member', label: '会员卡' }
    ],

    tools: [
      { key: 'address', label: '收货地址', icon: '址' },
      { key: 'favorite', label: '我的收藏', icon: '藏' },
      { key: 'coupon', label: '优惠券', icon: '券' },
      { key: 'footprint', label: '浏览记录', icon: '迹' },
      { key: 'service', label: '联系客服', icon: '服' },
      { key: 'about', label: '关于我们', icon: '关' }
    ]
  },

  onShow() {
    this.setData({ logged: isLogged() });
    // 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知）
    syncTabBar(this);
  },

  /* ----------------------- 交互 ----------------------- */

  onTapLogin() {
    wx.showToast({ title: '登录态已自动获取，无需手动登录', icon: 'none' });
  },

  onTapOrder(e) {
    const { status } = e.currentTarget.dataset;
    // 订单列表页在下一批交付，届时替换为：
    // wx.navigateTo({ url: `/packageOrder/list/list?status=${status}` });
    wx.showToast({ title: '订单中心开发中', icon: 'none' });
  },

  onTapAsset(e) {
    const { key } = e.currentTarget.dataset;
    const names = { coupon: '优惠券', point: '积分', balance: '余额', member: '会员卡' };
    wx.showToast({ title: `${names[key] || '该功能'}开发中`, icon: 'none' });
  },

  onTapTool(e) {
    const { key } = e.currentTarget.dataset;
    // 各功能页在后续批次交付，此处先给出明确提示，避免死链
    const pending = {
      address: '地址管理',
      favorite: '收藏列表',
      coupon: '优惠券',
      footprint: '浏览记录',
      service: '在线客服',
      about: '关于我们'
    };
    wx.showToast({ title: `${pending[key] || '该功能'}开发中`, icon: 'none' });
  },

  onTapService() {
    // 接入微信客服能力后，改为 open-type="contact" 的 button
    wx.showToast({ title: '在线客服开发中', icon: 'none' });
  }
});
