const { syncTabBar } = require('../../utils/tabbar');
const { isLogged, login, logout } = require('../../utils/auth');
const { fetchProfile } = require('../../services/user');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');

/** 小程序版本号（关于我们里展示；取不到时回落常量，不抛错） */
function appVersion() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    const v = info && info.miniProgram && info.miniProgram.version;
    return v || '开发版';
  } catch (e) {
    return '开发版';
  }
}

Page({
  data: {
    /** 页面背景色（装修后台「页面设置」可改，对应 replica.PAGE_META） */
    pageBg: (replica.PAGE_META && replica.PAGE_META.mine && replica.PAGE_META.mine.bg) || '#ffffff',
    logged: false,
    /** 正在登录：防连点，同时让按钮显示「登录中…」 */
    logging: false,
    /** 店铺信息（装修后台维护，来自 replica.SHOP） */
    shop: resolveAssets(replica.SHOP),

    /*
     * 个人资料与店铺信息**分开**。
     * 之前头像是店铺 logo（shop.avatar）、昵称是写死的「微信用户」——
     * 那是把「店」的标识当成「人」的标识在用，用户会以为自己的头像是莱克的 logo。
     */
    profile: { nickname: '', avatar: '' },

    /** 订单状态入口，key 与后端订单状态约定保持一致（订单/付款不在本轮整改范围内） */
    orderTabs: [
      { key: 'PENDING_PAY', label: '待付款' },
      { key: 'PENDING_SHIP', label: '待发货' },
      { key: 'SHIPPED', label: '待收货' },
      { key: 'FINISHED', label: '已完成' }
    ],

    /*
     * 常用功能：只保留**本期真实可用**的入口。
     *
     * 收货地址 / 我的收藏 / 优惠券 / 浏览记录此前都是「开发中」提示 ——
     * 点了等于没点。对应的页面（packageUser 分包）尚未交付，所以本期隐藏，
     * 页面交付后把 key 加回这个数组并把 onTapTool 里补上跳转即可。
     * 积分 / 余额 / 会员卡（原来的「资产」卡）同理，不在本期范围。
     * 「联系客服」直接用 <button open-type="contact"> 落在 WXML 里（微信客服会话），
     * 所以不出现在这个数组里。
     */
    tools: [
      { key: 'about', label: '关于我们', icon: '关' }
    ],

    version: appVersion()
  },

  onShow() {
    const logged = isLogged();
    this.setData({ logged });
    if (logged) this.loadProfile();
    // 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知）
    syncTabBar(this);
  },

  /** 拉取个人资料（昵称/头像）。失败不弹提示：这是纯展示信息，不该打断用户 */
  loadProfile() {
    return fetchProfile()
      .then((p) => {
        this.setData({
          profile: {
            nickname: (p && p.nickname) || '',
            avatar: (p && p.avatar) || ''
          }
        });
      })
      .catch(() => {});
  },

  /* ----------------------- 交互 ----------------------- */

  /**
   * 登录：真的去登录并刷新页面状态。
   * 之前这里只弹一句「登录态已自动获取」—— 静默登录失败时用户没有任何恢复入口。
   * 失败给「重试」，成功立刻回填昵称头像。
   */
  onTapLogin() {
    if (this.data.logging) return;
    this.setData({ logging: true });
    wx.showLoading({ title: '登录中', mask: true });

    login(true)
      .then(() => {
        wx.hideLoading();
        this.setData({ logged: true, logging: false });
        wx.showToast({ title: '登录成功', icon: 'success' });
        return this.loadProfile();
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ logged: false, logging: false });
        wx.showModal({
          title: '登录失败',
          content: (err && err.message) || '网络异常，请稍后重试',
          confirmText: '重试',
          cancelText: '取消',
          success: (r) => { if (r.confirm) this.onTapLogin(); }
        });
      });
  },

  onTapLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后购物车与订单需要重新登录才能查看',
      success: (r) => {
        if (!r.confirm) return;
        logout();
        this.setData({ logged: false, profile: { nickname: '', avatar: '' } });
        wx.showToast({ title: '已退出登录', icon: 'none' });
      }
    });
  },

  onTapOrder(e) {
    const { status } = e.currentTarget.dataset;
    // 订单列表页在下一批交付，届时替换为：
    // wx.navigateTo({ url: `/packageOrder/list/list?status=${status}` });
    wx.showToast({ title: '订单中心开发中', icon: 'none' });
  },

  onTapTool(e) {
    const { key } = e.currentTarget.dataset;
    if (key === 'about') return this.onTapAbout();
    wx.showToast({ title: '该功能开发中', icon: 'none' });
  },

  /** 关于我们：只展示**真实存在**的信息，不编造 */
  onTapAbout() {
    const shop = this.data.shop || {};
    wx.showModal({
      title: '关于我们',
      content: [
        shop.name || 'LEXY莱克',
        shop.slogan || '',
        '',
        '版本：' + this.data.version,
        '正品保障 · 全国联保'
      ].filter((x) => x !== null && x !== undefined).join('\n'),
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
