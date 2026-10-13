/**
 * 新增 / 编辑收货地址（packageUser）
 *
 * 校验在**两端都做**，但以服务端为准：服务端 `/api/address/save` 会拒绝
 * 空收货人、非法手机号（`^1[3-9]\d{9}$`）。前端这份校验只是为了「不用等一次往返」，
 * 所以文案与服务端保持一致 —— 两边说法不一致时用户会以为是两个不同的错误。
 *
 * 省市区用原生 `<picker mode="region">`：不用自己维护一份省市区数据，
 * 也不会因为数据过期（撤县设区之类）而产生选不到的地址。
 */

const { fetchDetail, save } = require('../../../services/address');

/** 与服务端同一口径的手机号规则（见 server/routes/asset.js 的 addressSave） */
const PHONE_RE = /^1[3-9]\d{9}$/;

Page({
  data: {
    addressId: '',
    /** 编辑态与新增态的标题不同，标题在 js 里定，避免 WXML 里写三元 */
    title: '新增地址',
    form: {
      name: '',
      phone: '',
      region: [],
      regionText: '',
      detail: '',
      isDefault: false
    },
    saving: false,
    loading: false
  },

  onLoad(options) {
    const addressId = (options && options.addressId) || '';
    if (!addressId) return;
    this.setData({ addressId, title: '编辑地址', loading: true });
    fetchDetail(addressId)
      .then((a) => {
        if (!a) throw new Error('地址不存在');
        const region = [a.province, a.city, a.district].filter(Boolean);
        this.setData({
          loading: false,
          form: {
            name: a.name || '',
            phone: a.phone || '',
            region,
            regionText: region.join(' '),
            detail: a.detail || '',
            isDefault: !!a.isDefault
          }
        });
        wx.setNavigationBarTitle({ title: '编辑地址' });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showModal({
          title: '地址加载失败',
          content: (err && err.message) || '请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack()
        });
      });
  },

  /* ------------------------------ 表单 ------------------------------ */

  onInputName(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onInputPhone(e) {
    this.setData({ 'form.phone': e.detail.value });
  },

  onInputDetail(e) {
    this.setData({ 'form.detail': e.detail.value });
  },

  /** picker mode="region" 的 value 是 [省, 市, 区] */
  onPickRegion(e) {
    const region = e.detail.value || [];
    this.setData({
      'form.region': region,
      'form.regionText': region.filter(Boolean).join(' ')
    });
  },

  onToggleDefault(e) {
    this.setData({ 'form.isDefault': !!e.detail.value });
  },

  /* ------------------------------ 保存 ------------------------------ */

  onSubmit() {
    if (this.data.saving) return;
    const f = this.data.form;

    if (!String(f.name).trim()) return this.warn('请填写收货人');
    if (!PHONE_RE.test(String(f.phone))) return this.warn('手机号格式不正确');
    if (!f.region.length) return this.warn('请选择所在地区');
    if (!String(f.detail).trim()) return this.warn('请填写详细地址');

    this.setData({ saving: true });
    save({
      addressId: this.data.addressId || undefined,
      name: String(f.name).trim(),
      phone: String(f.phone),
      province: f.region[0] || '',
      city: f.region[1] || '',
      district: f.region[2] || '',
      detail: String(f.detail).trim(),
      isDefault: !!f.isDefault
    })
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: '已保存', icon: 'success' });
        // 列表页在 onShow 里会重新拉取，返回即可看到最新数据
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  },

  warn(title) {
    wx.showToast({ title, icon: 'none' });
  }
});
