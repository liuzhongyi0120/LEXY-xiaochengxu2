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
const { isLogged } = require('../../utils/auth');
const { fetchProfile } = require('../../services/user');
const couponSvc = require('../../services/coupon');
const { ROUTES } = require('../../utils/constants');
const replica = require('../../config/replica');
const { resolveAssets } = require('../../utils/asset');
const { normalizeBlocks, applyShopAvatar, applyUserProfile, applyStatValues } = require('../../utils/blocks');
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
      // 资产数值要等 blocks 真正落进 data 之后才回填（applyStatValues 读 this.data.blocks）
      this.loadStatValues();
    });
    if (logged) this.loadProfile();
  },

  onShow() {
    const logged = isLogged();
    if (logged !== this.data.logged) {
      this.setData({ logged: logged });
      this.syncUser({ logged: logged });
    }
    if (logged) {
      this.loadProfile();
      this.loadStatValues();
    }
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

  /*
   * 登录 / 退出登录的**实现在 utils/blockPage.js**（个人信息区块是三个页面共用的模板，
   * 处理器放在共用行为里才不会出现「别的页面上绑了没实现」）。
   * 这里只提供两个钩子被它调用：loadProfile（登录后拉昵称头像）、syncUser（把「人」写回区块）。
   */

  /**
   * 订单状态入口（「我的订单」区块 + 「全部订单」）。
   *
   * 状态映射（大写入口 → 后端口径）收在订单列表页的 `ENTRY_STATUS` 一处，
   * 这里只负责把 key 原样带过去 —— 「退款 / 售后」由 `blockPage.js` 的 onTapUcOrder
   * 拦下来落「功能未开放」页（本店订单状态机没有退款态）。
   */
  onTapOrderStatus(status) {
    const key = String(status || 'ALL').toUpperCase();
    wx.navigateTo({
      url: ROUTES.ORDER_LIST + '?status=' + encodeURIComponent(key),
      fail: () => wx.showToast({ title: '订单列表打开失败，请重试', icon: 'none' })
    });
  },

  /** 关于我们 / 账号与安全已经是独立页面（packageUser 分包），跳转表见 utils/blockPage.js */

  /* --------------------- 个人资产的真实数值（只有优惠券有底座） --------------------- */

  /**
   * 把个人资产里**有真实数据源**的项回填成真实数值（目前只有「优惠券」）。
   *
   * 未登录时接口要令牌、拿不到数：`—` 表示「未知」，不是「0 张」——
   * 两者混在一起会让用户以为自己的券没了。
   * 失败静默：这是锦上添花的数字，不该因为它弹错误打断用户。
   */
  loadStatValues() {
    if (!isLogged()) {
      // 退出登录后必须复位成 `—`，否则会把上一个账号的券数留给下一个人看
      this.syncStatValues({ coupon: '—' });
      return Promise.resolve();
    }
    return couponSvc.fetchList('all')
      .then((res) => {
        const counts = (res && res.counts) || {};
        this.syncStatValues({ coupon: Number(counts.available) || 0 });
      })
      .catch(() => {});
  },

  /** 把数值写进个人资产区块（可能 0 ~ 1 个区块；与 syncUser 同一模式） */
  syncStatValues(values) {
    const next = applyStatValues(this.data.blocks || [], values);
    this.setData({ blocks: next });
  }
}));
