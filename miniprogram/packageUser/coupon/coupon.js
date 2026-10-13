/**
 * 我的优惠券（packageUser）
 *
 * 数据源 `GET /api/coupon/list?status=available|used|expired|all`，
 * 响应里带 `counts` —— 三个页签的角标都用它，**不在前端自己数**：
 * 前端只持有当前页签的数据，自己数出来的角标在切页签后会变，
 * 而服务端的 counts 始终是全部券的分档数量。
 *
 * 券面额展示要区分两种类型（与下单页可用券口径一致）：
 *   discount —— 满减券：threshold=门槛（分），value=减免额（分）
 *   percent  —— 折扣券：value=折扣百分比（95 → 9.5 折）
 * 把 percent 当满减渲染会出现「满 0 减 95」这种荒唐文案。
 */

const { fetchList } = require('../../services/coupon');
const { ROUTES } = require('../../utils/constants');
const { money, formatTime } = require('../../utils/format');

const TABS = [
  { key: 'available', label: '可使用' },
  { key: 'used', label: '已使用' },
  { key: 'expired', label: '已过期' }
];

Page({
  data: {
    tabs: TABS,
    status: 'available',
    counts: {},
    list: [],
    loading: true,
    loadFailed: false,
    needLogin: false
  },

  onLoad(options) {
    const s = String((options && options.status) || 'available');
    this.setData({ status: TABS.some((t) => t.key === s) ? s : 'available' });
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  loadList() {
    this.setData({ loading: true });
    return fetchList(this.data.status)
      .then((res) => {
        this.setData({
          list: (res.list || []).map(decorateCoupon),
          counts: res.counts || {},
          loading: false,
          loadFailed: false,
          needLogin: false
        });
      })
      .catch((err) => {
        console.error('[coupon] 加载失败', err);
        this.setData({ loading: false, loadFailed: true, needLogin: !!err.needLogin, list: [] });
      });
  },

  onRetryLoad() {
    this.loadList();
  },

  onGoLogin() {
    wx.switchTab({ url: ROUTES.MINE });
  },

  onTapTab(e) {
    const key = String((e.currentTarget.dataset || {}).key || 'available');
    if (key === this.data.status) return;
    this.setData({ status: key, list: [] });
    this.loadList();
  },

  onTapUse() {
    wx.switchTab({ url: ROUTES.INDEX });
  }
});

/** 券 → 视图模型（面额与门槛的分支只在这里做一次） */
function decorateCoupon(c) {
  const thresholdYuan = Number(c.threshold) / 100;
  let face = '';
  let faceUnit = '';
  let rule = '';

  if (c.type === 'percent') {
    // 95 → 9.5 折（去掉多余的 .0）
    face = String((Number(c.value) / 10).toFixed(1)).replace(/\.0$/, '');
    faceUnit = '折';
    rule = '全场通用折扣';
  } else {
    face = money(c.value).replace(/\.00$/, '');
    faceUnit = '元';
    rule = thresholdYuan > 0 ? `满 ${thresholdYuan.toFixed(0)} 元可用` : '无门槛';
  }

  const statusText = { available: '可使用', used: '已使用', expired: '已过期' }[c.status] || '';
  const expireText = c.expireAt ? `有效期至 ${formatTime(c.expireAt).slice(0, 10)}` : '长期有效';

  return {
    couponId: c.couponId,
    name: c.name || '优惠券',
    face,
    faceUnit,
    rule,
    scope: c.scope || '全场通用',
    status: c.status,
    statusText,
    expireText,
    reason: c.reason || '',
    /** 失效券与可用券视觉上必须一眼可分（灰化 + 印章） */
    disabled: c.status !== 'available',
    showStamp: c.status === 'used' || c.status === 'expired'
  };
}
