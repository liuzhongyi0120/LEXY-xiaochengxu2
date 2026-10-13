/**
 * 关于我们（packageUser）
 *
 * 只展示**有真源**的信息，每个字段都写清它来自哪里：
 *   · 店铺名称 / 头像 / 标语 → 装修台（`replica.SHOP`，由「生成代码」写回小程序）
 *   · 客服电话 / 服务时间 / 服务承诺 → `GET /api/shop/settings`（运营参数）
 *   · 版本号 → `wx.getAccountInfoSync()`
 *
 * ⚠️ 刻意**不展示运费规则**：`catalog.settings` 里有 `freightFree` / `defaultFreight`
 * 两个字段（当前都是 0），但真正生效的运费规则在服务端下单逻辑里是常量
 * （满 199 元免运费，否则 15 元，见 `server/lib/order.js`）。
 * 两处不一致时，展示 settings 里的那个就会写成「运费 0 元」——
 * 与用户实际下单看到的金额矛盾。这种「有字段但没接上」的值宁可不展示。
 */

const replica = require('../../config/replica');
const { fetchSettings } = require('../../services/shop');
const { resolveAssets } = require('../../utils/asset');

const SHOP = resolveAssets(replica.SHOP || {});

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
    shop: SHOP,
    version: appVersion(),
    loading: true,
    /** 运营参数取不到时整块不展示，而不是显示空行 */
    hasSettings: false,
    servicePhone: '',
    serviceHours: '',
    notice: ''
  },

  onLoad() {
    this.loadSettings();
  },

  loadSettings() {
    fetchSettings()
      .then((s) => {
        const phone = String((s && s.servicePhone) || '');
        this.setData({
          loading: false,
          hasSettings: !!(phone || s.serviceHours || s.notice),
          servicePhone: phone,
          serviceHours: (s && s.serviceHours) || '',
          notice: (s && s.notice) || ''
        });
      })
      .catch((err) => {
        // 运营参数取不到不影响本页主体（店铺信息来自 replica），不弹错误
        console.error('[about] 运营参数加载失败', err);
        this.setData({ loading: false, hasSettings: false });
      });
  },

  /** 拨打客服电话：号码来自运营参数，没配就不给按钮（不编造号码） */
  onCallService() {
    if (!this.data.servicePhone) return;
    wx.makePhoneCall({
      phoneNumber: this.data.servicePhone,
      fail: () => wx.showToast({ title: '拨号已取消', icon: 'none' })
    });
  },

  onCopyPhone() {
    if (!this.data.servicePhone) return;
    wx.setClipboardData({
      data: this.data.servicePhone,
      success: () => wx.showToast({ title: '客服电话已复制', icon: 'none' })
    });
  }
});
