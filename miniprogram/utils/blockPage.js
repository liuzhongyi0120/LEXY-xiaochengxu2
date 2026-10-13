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
const { loadGoodsData, TOOL_META, statDef } = require('./blocks');
const { ROUTES } = require('./constants');
const { login, logout } = require('./auth');
const shopSvc = require('../services/shop');

const GOODS_LIST = '/packageGoods/list/list';
const GOODS_DETAIL = '/packageGoods/detail/detail';

/**
 * 「必备工具」里**真能跳**的工具 → 页面路径。
 * 与 `TOOL_META` 的 `real` 标记配套：`real: true` 的工具必须要么在这张表里有真实页面，
 * 要么在下面的 `TOOL_NON_NAV` 里声明用哪种非跳转方式落地 —— 自检会逐个对账。
 * ⚠️ 路径必须是 app.json 里真实存在的页面。写「将来会有」的地址 = 一次转圈失败，
 *    比明确告诉用户「这项没有」更糟（这正是 2026-10-13 这一批要修的问题）。
 */
const TOOL_ROUTE = {
  cart: ROUTES.CART,
  memberCode: ROUTES.MEMBER_CODE,
  deliveryAddress: ROUTES.ADDRESS_LIST,
  accountSettings: ROUTES.ACCOUNT,
  about: ROUTES.ABOUT,
  favorite: ROUTES.FAVORITE,
  footprint: ROUTES.FOOTPRINT
};

/**
 * 不靠 `navigateTo` 落地的工具 —— 值说明用哪种方式。
 *   contact —— 「客服聊天」在 templates/blocks.wxml 里就是 `<button open-type="contact">`，
 *              微信自己拉客服会话，本体不走这里（这里只是「有意不跳转」的登记处）；
 *   phone   —— 「拨打商家电话」要先去后台取客服号码，再 wx.makePhoneCall（见 callMerchant）。
 * 这两个是真能用的，只是不用「跳页面」这种形式 —— 不能因为没有路径就当成「未接入」。
 */
const TOOL_NON_NAV = {
  customerServiceChat: 'contact',
  merchantsCall: 'phone'
};

/**
 * 依赖型入口的**如实说明**。
 *
 * 以前这些入口点下去只弹一句「该功能开发中」：用户既不知道是谁的问题、也不知道该去哪儿，
 * 体验上等同于「点了没反应」。现在统一落到 `packageUser/coming` 页，把「缺哪套底座」讲清楚。
 * 说明文案只有这一处定义（入口侧）—— 「功能未开放」页本身不堆任何 if-else。
 */
const NOT_READY = {
  taskCenter: { name: '任务中心', desc: '任务中心依赖「会员任务 / 成长值」体系：有赞侧由会员中台按签到、下单、分享等行为派发积分与奖励。本店没有这套数据源，做不出真实的进度与奖励发放。' },
  gifts: { name: '赠品', desc: '赠品依赖「满赠 / 加赠」营销活动：赠品要挂在一场活动上、按订单门槛自动加进订单。本店的营销中台尚未接入，无法真实发放。' },
  cashBack: { name: '返现', desc: '返现依赖会员资金账户：下单后按比例把钱返还到可在店内消费的余额。本店没有会员钱包，无法真实返还。' },
  fxCenter: { name: '分销员中心', desc: '分销员中心依赖分销体系（推广关系、佣金计算、提现）。本店未开通分销，没有推广关系与佣金数据可展示。' },
  offlineStore: { name: '线下门店', desc: '线下门店依赖门店档案与就近库存（门店列表、地址、营业时间）。本店没有门店数据源。' },
  purchaseColumnAndContent: { name: '课程', desc: '课程依赖知识付费底座（专栏、章节、购买凭证）。本店没有该业务。' },
  paidContentCertificate: { name: '证书', desc: '证书依赖知识付费底座（完成课程后发证）。本店没有该业务。' },
  paidContentExamination: { name: '考试', desc: '考试依赖知识付费底座（题库与判卷）。本店没有该业务。' },
  exchangeGiftCard: { name: '兑换礼品卡', desc: '礼品卡兑换依赖礼品卡账户体系（卡密、余额、核销）。本店没有该业务。' },
  paidContentExerciseBook: { name: '作业本', desc: '作业本依赖知识付费底座（作业提交与批改）。本店没有该业务。' },
  blankLine: { name: '留白', desc: '「留白」在有赞里是一个纯占位插件：它不产生任何内容，只在小程序里撑出一块空白。本店用「辅助空白」区块表达同一件事（装修台可添加），所以这一项不单独落地。' },
  exhibitionReserve: { name: '活动预订', desc: '活动预订依赖预约中台（场次、名额、到店核销）。本店没有该业务。' },
  restaurantReserve: { name: '预约订座', desc: '预约订座依赖餐饮预约底座（桌位、时段、到店核销）。本店是家电商城，没有该业务。' },
  referralRewards: { name: '邀请有礼', desc: '邀请有礼依赖分销 / 邀请关系链（邀请人与被邀请人的奖励结算）。本店未开通分销。' },
  refund: { name: '退款 / 售后', desc: '本店订单状态机只有「待付款 / 待发货 / 待收货 / 已完成 / 已取消」，**没有退款态**：申请退款要由客服在后台核对后人工处理。所以在个人中心里做一个「退款/售后」列表会永远查不到数据，不如把真实路径讲清楚 —— 需要退款请通过「客服聊天」联系我们。' }
};

/** 兜底说明：新加了清单项却忘了写说明时，也不能显示空白 */
const NOT_READY_FALLBACK = '这一项依赖本店尚未接入的业务底座（会员 / 营销 / 分销 / 门店 / 知识付费等），接入后会自动开放。';

/** 统一落到「功能未开放」页：把「点了没反应」变成「点了告诉你为什么没有」 */
function goComing(name, desc) {
  const url = ROUTES.COMING
    + '?name=' + encodeURIComponent(name || '功能未开放')
    + '&desc=' + encodeURIComponent(desc || NOT_READY_FALLBACK);
  wx.navigateTo({ url: url, fail: () => wx.showToast({ title: (name || '该功能') + '暂未开放', icon: 'none' }) });
}

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

  /* ------------------------- 选项卡分类（对标有赞三方扩展「选项卡Z4」） ------------------------- */

  /**
   * 点顶部选项卡，切换下方图文内容。
   *
   * 只改本页 data（activeTab），**不动装修数据** —— 与「品牌分类」的 activeBrand 同口径：
   * 打开时停在哪个页签属于浏览态，不该被发布出去。
   * 目标下标与当前一致时直接 return，避免无意义的 setData（列表很长，setData 会白重渲一次）。
   */
  onTabCateTap(e) {
    const ds = e.currentTarget.dataset || {};
    if (ds.blk === undefined || ds.ti === undefined) return;
    const i = Number(ds.ti);
    if (isNaN(i)) return;
    if (Number(this.data['blocks[' + ds.blk + '].activeTab']) === i) return;
    this.setData({ ['blocks[' + ds.blk + '].activeTab']: i });
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
  },

  /* ------------------------- 个人中心（「我的」页）区块 ------------------------- */

  /**
   * 个人信息区块的登录 / 退出登录（默认实现，页面可覆盖）。
   *
   * 为什么默认实现放在这里、而不是只放在「我的」页：
   *   `templates/blocks.wxml` 是 index / custom / mine **三个页面共用**的，
   *   `uc_profile` 区块目前只出现在「我的」页。只把处理器写在「我的」页的话，
   *   别的页面一旦渲染个人信息区块就是**绑了没实现** —— 小程序对这种死绑定是静默的
   *   （不报错、点了没反应），正是这一批要修的问题。自检 15.80 会把
   *   「include 进来的模板里每个绑定都必须在宿主页面解析得到」当硬约束查。
   *   页面可以提供 `loadProfile` / `syncUser` 接管后续（「我的」页就是这么做的：
   *   登录成功后要拉昵称头像，并把自己那份 data 同步进区块）。
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
        if (typeof this.loadProfile === 'function') return this.loadProfile();
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
        if (typeof this.syncUser === 'function') this.syncUser({ logged: false });
        wx.showToast({ title: '已退出登录', icon: 'none' });
      }
    });
  },

  /**
   * 「我的订单」点某个状态入口（含「全部订单」）。
   *
   * 区块里的 key 是**大写**（ALL / PENDING_PAY / PENDING_SHIP / SHIPPED / FINISHED），
   * 与后端口径（小写）的映射收在**订单列表页**的 `ENTRY_STATUS` 里一份 ——
   * 这里只把原样 key 传过去，不重复维护第二张映射表（两处必然会有一天对不上）。
   *
   * 「退款 / 售后」不走列表页：本店订单状态机没有退款态（见 NOT_READY.refund），
   * 列表页做一个永远查不到数据的页签等于骗人。
   */
  onTapUcOrder(e) {
    const key = String((e.currentTarget.dataset || {}).status || 'ALL').toUpperCase();
    if (key === 'REFUND') return goComing(NOT_READY.refund.name, NOT_READY.refund.desc);
    if (typeof this.onTapOrderStatus === 'function') return this.onTapOrderStatus(key);
    wx.navigateTo({
      url: ROUTES.ORDER_LIST + '?status=' + encodeURIComponent(key),
      fail: () => wx.showToast({ title: '订单列表打开失败，请重试', icon: 'none' })
    });
  },

  /**
   * 「个人资产」点某一项（余额 / 积分 / 权益卡 / 优惠券 / 钱包 / 礼品卡 / 提货卡）。
   *
   * 7 项里只有「优惠券」有真实底座（后端 /api/coupon/* + `packageUser/coupon` 页面），
   * 落点在 `blocks.js` 的 `UC_STAT_DEFS[].route`（唯一一份）里标着 —— 有就真跳，
   * 没有就落「功能未开放」页，把缺的那套资产体系讲清楚。
   */
  onTapUcStat(e) {
    const ds = e.currentTarget.dataset || {};
    const key = String(ds.key || '');
    if (!key) return;
    const def = statDef(key) || { label: key, route: '', dep: '' };
    if (def.route) {
      wx.navigateTo({ url: def.route, fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }) });
      return;
    }
    const label = def.label || '该项资产';
    goComing(label, '「' + label + '」依赖' + (def.dep || '会员资产数据')
      + '：本店尚未开通这套会员资产底座，所以这里没有真实数值可展示（不是接口失败，是确实没有这项业务）。接入后会显示可用的' + label + '。');
  },

  /**
   * 「必备工具」点某一项。
   *
   * 三条落地路径，缺一不可（`real: true` 的工具必须命中前两条之一，自检会对账）：
   *   ① `TOOL_NON_NAV`：客服聊天（wxml 的 open-type 按钮）/ 拨打商家电话（取号码后拨号）；
   *   ② `TOOL_ROUTE`  + `real`：真实页面，navigateTo；
   *   ③ 其余：`real:false` 的依赖型入口 → 落「功能未开放」页，把缺什么讲清楚。
   * 以前 ③ 只弹一句「该功能开发中」，用户不知道是谁的问题 —— 与「点了没反应」没区别。
   */
  onTapToolItem(e) {
    const ds = e.currentTarget.dataset || {};
    const key = String(ds.key || '');
    if (!key) return;
    const meta = TOOL_META[key] || { real: false };

    if (TOOL_NON_NAV[key] === 'phone') return this.callMerchant();
    // contact 由 wxml 的 <button open-type="contact"> 自己完成，走到这里说明是异常路径，静默返回
    if (TOOL_NON_NAV[key]) return;

    if (meta.real && TOOL_ROUTE[key]) {
      wx.navigateTo({
        url: TOOL_ROUTE[key],
        fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' })
      });
      return;
    }
    const info = NOT_READY[key] || {};
    goComing(String(ds.label || '').trim() || info.name || key, info.desc);
  },

  /**
   * 「拨打商家电话」：号码取自后台「运营参数」的客服电话
   * （`GET /api/shop/settings`，公开只读）。取不到号码时说清去哪儿配，不能让按钮点了没反应。
   */
  callMerchant() {
    wx.showLoading({ title: '正在获取号码', mask: true });
    return shopSvc.fetchSettings()
      .then((s) => {
        wx.hideLoading();
        const phone = String((s && s.servicePhone) || '').trim();
        if (!phone) {
          goComing('拨打商家电话', '后台「运营参数」里还没有配置客服电话，所以这里拨不出去。请让运营在装修台「店铺设置 · 运营参数」里填上客服电话后即可使用；也可以先用「客服聊天」联系我们。');
          return;
        }
        wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '号码获取失败，请重试', icon: 'none' });
      });
  }
};

module.exports = { blockPageBehavior, TOOL_ROUTE, TOOL_NON_NAV, NOT_READY };
