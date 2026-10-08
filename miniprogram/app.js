const { login, getToken } = require('./utils/auth');

App({
  globalData: {
    userId: '',
    systemInfo: null,
    // 购物车角标数量，各页面通过 app.updateCartBadge() 更新
    cartCount: 0
  },

  onLaunch() {
    this.collectSystemInfo();

    // 静默登录：失败不阻断浏览，下单前会再次校验登录态
    if (!getToken()) {
      login()
        .then((res) => {
          this.globalData.userId = res.userId;
        })
        .catch((err) => {
          console.warn('[app] 静默登录失败，将在下单前重试', err);
        });
    }
  },

  /**
   * 采集屏幕信息，供自定义导航栏与安全区适配使用。
   * 优先使用 wx.getWindowInfo；旧基础库回退到 wx.getSystemInfoSync。
   */
  collectSystemInfo() {
    try {
      const info = typeof wx.getWindowInfo === 'function'
        ? wx.getWindowInfo()
        : wx.getSystemInfoSync();
      this.globalData.systemInfo = info;
    } catch (err) {
      console.warn('[app] 获取系统信息失败', err);
    }
  },

  /**
   * 更新购物车角标
   *
   * 当前 tabBar 为「首页 / 莱克 / 资讯 / 产品 / 我的」，购物车不是 tab 页，
   * 无法使用 tabBar 角标，改为记录到 globalData 供购物车页与商品详情页读取。
   * 如后续把购物车加回 tabBar，可在此恢复 wx.setTabBarBadge。
   *
   * @param {number} count 购物车商品总件数
   */
  updateCartBadge(count) {
    this.globalData.cartCount = count || 0;
  }
});
