/**
 * 「我的」（个人中心）
 *
 * 2026-10-10 起改为**装修区块流页面**（对标有赞「个人中心装修」）：
 * 整页由 replica.MINE_BLOCKS 驱动，区块渲染与首页 / 自定义页共用
 * `templates/blocks.wxml` + `utils/blocks.js` + `utils/blockPage.js`。
 *
 * ⚠️ 改造时**必须保留的真实能力**（不能因为「装修了就变成纯静态页」）：
 *   · 登录 / 退出登录（真的调后端，成功后回填昵称头像）
 *   · 联系客服（WXML 里 `<button open-type="contact">`）
 *   · 订单入口跳转、关于我们、版本号
 *   这些是「页面能力」，不随装修数据变化 —— 装修台改的是版式与文案。
 */

const { syncTabBar } = require('../../utils/tabbar');
const { isLogged, login, logout } = require('../../utils/auth');
const { fetchProfile } = require('../../services/user');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, applyShopAvatar, applyUserProfile } = require('../../utils/blocks');
const { blockPageBehavior } = require('../../utils/blockPage');

/** 店铺头像可能是后台上传的 /uploads/… 相对路径，必须过一遍素材地址解析（首页同理） */
const SHOP = resolveAssets(replica.SHOP || {});
/** 页面设置（装修台「页面设置」可改背景色） */
const META = (replica.PAGE_META && replica.PAGE_META.mine) || { bg: '#FFFFFF' };
/** 区块数据只在启动时读一次（replica 是编译期常量，运行中不会变） */
const RAW_BLOCKS = replica.MINE_BLOCKS || [];

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

Page(Object.assign({}, blockPageBehavior, {
  data: {
    meta: META,
    /** 店铺信息（装修后台维护，来自 replica.SHOP） */
    shop: SHOP,
    /** 页面区块（来自 replica.MINE_BLOCKS，装修台「我的」页发布后写入） */
    blocks: [],
    logged: false,
    /** 正在登录：防连点，同时让按钮显示「登录中…」 */
    logging: false,
    version: appVersion()
  },

  onLoad() {
    const logged = isLogged();
    const blocks = applyShopAvatar(normalizeBlocks(RAW_BLOCKS), SHOP.avatar || '');
    // 昵称 / 头像属于「人」的运行态，不在装修数据里，由页面回填到个人信息区块
    applyUserProfile(blocks, { logged: logged });
    this.setData({ meta: META, shop: SHOP, blocks: blocks, logged: logged }, () => {
      // 商品区块要实时数据，装修时存的是快照（与首页共用同一份实现）
      this.loadGoodsBlocks();
    });
    if (logged) this.loadProfile();
  },

  onShow() {
    const logged = isLogged();
    if (logged !== this.data.logged) {
      this.setData({ logged: logged });
      this.syncUser({ logged: logged });
    }
    if (logged) this.loadProfile();
    // 切页时同步底部导航高亮（自定义 tabBar 的实例每页一份，必须由页面主动通知）
    syncTabBar(this);
  },

  /** 离开页面时释放语音播放器（区块事件见 utils/blockPage.js） */
  onUnload() {
    this.onUnloadBlockAudio();
  },

  /**
   * 把「人」的信息同步进个人信息区块（可能有 0 ~ 1 个）。
   * 装修数据里的个人信息只有外观，昵称头像必须走这里 —— 否则「登录成功了头像还是空的」。
   */
  syncUser(user) {
    const patch = {};
    (this.data.blocks || []).forEach((b, i) => {
      if (b && b.type === 'uc_profile') {
        patch['blocks[' + i + '].user'] = {
          logged: !!user.logged,
          nickname: user.nickname || '',
          avatar: user.avatar || ''
        };
      }
    });
    if (Object.keys(patch).length) this.setData(patch);
  },

  /** 拉取个人资料（昵称/头像）。失败不弹提示：这是纯展示信息，不该打断用户 */
  loadProfile() {
    return fetchProfile()
      .then((p) => {
        this.syncUser({
          logged: true,
          nickname: (p && p.nickname) || '',
          avatar: resolveAssets((p && p.avatar) || '')
        });
      })
      .catch(() => {});
  },

  /* ----------------------- 交互（区块事件见 utils/blockPage.js） ----------------------- */

  /**
   * 登录：真的去登录并刷新页面状态。
   * 之前这里只弹一句「登录态已自动获取」—— 静默登录失败时用户没有任何恢复入口。
   * 失败给「重试」，成功立刻回填昵称头像。
   */
  onTapUcLogin() {
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
          success: (r) => { if (r.confirm) this.onTapUcLogin(); }
        });
      });
  },

  onTapUcLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后购物车与订单需要重新登录才能查看',
      success: (r) => {
        if (!r.confirm) return;
        logout();
        this.setData({ logged: false });
        this.syncUser({ logged: false });
        wx.showToast({ title: '已退出登录', icon: 'none' });
      }
    });
  },

  /**
   * 订单状态入口（「我的订单」区块 + 「全部订单」）。
   * 订单列表页（packageOrder 分包）不在本期交付范围，先如实提示 ——
   * 页面交付后把这里换成 `wx.navigateTo({ url: '/packageOrder/list/list?status=' + status })` 即可。
   */
  onTapOrderStatus(status) {
    if (!status) return;
    wx.showToast({ title: '订单中心开发中', icon: 'none' });
  },

  /** 账号与安全：本期只有「退出登录」这一件真实可做的事，不编造页面 */
  onTapAccountSettings() {
    if (!this.data.logged) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return this.onTapUcLogin();
    }
    wx.showModal({
      title: '账号与安全',
      content: '当前账号已登录。退出后购物车与订单需要重新登录才能查看。',
      confirmText: '退出登录',
      cancelText: '取消',
      success: (r) => { if (r.confirm) this.onTapUcLogout(); }
    });
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
}));
