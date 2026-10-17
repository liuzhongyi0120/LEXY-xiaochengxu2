/**
 * 账号与安全（packageUser）
 *
 * 只放**真的能执行**的动作，每个动作都对应一个已存在且已联通的接口：
 *   · 昵称      → `POST /api/user/profile`
 *   · 手机号    → `POST /api/user/phone`（微信 getPhoneNumber 的 code）
 *   · 退出登录  → 清本地令牌（服务端 JWT 无状态，见 `utils/auth.js`）
 *
 * ⚠️ 头像**只读**：微信的 `chooseAvatar` 给的是本地临时路径（`wxfile://`），
 * 要真正换头像必须有一个「小程序用户可上传文件」的接口，而本项目目前的
 * 上传点位 `/api/media/upload` 属于**管理端**（要管理员令牌，写的是素材库）。
 * 所以这里如实标注「头像来自微信授权」，而不是做一个「选了头像、看着像成功了、
 * 重进又变回去」的假功能（那是比没有更糟的体验）。
 */

const { fetchProfile, updateProfile, bindPhone } = require('../../services/user');
const { ROUTES } = require('../../utils/constants');
const { resolveAssets } = require('../../utils/asset');
const { logout } = require('../../utils/auth');

Page({
  data: {
    loading: true,
    logged: false,
    /*
     * 加载失败 ≠ 未登录（审查 F25）。
     * 旧实现对任何异常都设 logged:false，模板随即显示「登录后管理账号」——
     * 断网、服务 500 也被当成「要重新登录」，用户会一遍遍去登录却始终进不去，
     * 而且完全看不出其实是网络问题。现在单独开一个状态：失败时给「重试」。
     */
    loadFailed: false,
    loadFailedMsg: '',
    avatar: '',
    /** 已保存的昵称（用于判断是否有改动） */
    nickname: '',
    /** 输入框里的值 */
    nicknameInput: '',
    phoneMasked: '',
    hasPhone: false,
    saving: false,
    dirty: false
  },

  onLoad() {
    this.loadProfile();
  },

  loadProfile() {
    this.setData({ loading: true, loadFailed: false, loadFailedMsg: '' });
    return fetchProfile()
      .then((p) => {
        const nickname = (p && p.nickname) || '';
        const phone = (p && p.phone) || '';
        this.setData({
          loading: false,
          logged: true,
          avatar: resolveAssets((p && p.avatar) || ''),
          nickname,
          nicknameInput: nickname,
          phoneMasked: maskPhone(phone),
          hasPhone: !!phone,
          dirty: false
        });
      })
      .catch((err) => {
        console.error('[account] 资料加载失败', err);
        /*
         * 只有「确实没授权 / 令牌失效」才把人送去登录。
         * 公共 request 封装已经在 401 时打了 `needLogin` 标记（见 utils/request.js），
         * 这里直接用它，不再把网络与服务端错误也归成「未登录」。
         */
        const needLogin = !!(err && err.needLogin);
        this.setData({
          loading: false,
          logged: false,
          loadFailed: !needLogin,
          loadFailedMsg: needLogin ? '' : ((err && err.message) || '资料加载失败')
        });
      });
  },

  onRetryLoad() {
    if (this.data.loading) return;
    this.loadProfile();
  },

  onGoLogin() {
    wx.switchTab({ url: ROUTES.MINE });
  },

  /* ------------------------------ 昵称 ------------------------------ */

  onInputNickname(e) {
    const v = e.detail.value;
    this.setData({ nicknameInput: v, dirty: v.trim() !== this.data.nickname });
  },

  onSaveNickname() {
    const name = String(this.data.nicknameInput || '').trim();
    if (!name) return wx.showToast({ title: '昵称不能为空', icon: 'none' });
    if (name === this.data.nickname) return wx.showToast({ title: '昵称没有变化', icon: 'none' });
    if (this.data.saving) return;

    this.setData({ saving: true });
    updateProfile({ nickname: name })
      .then((p) => {
        const saved = (p && p.nickname) || name;
        this.setData({ saving: false, nickname: saved, nicknameInput: saved, dirty: false });
        wx.showToast({ title: '已保存', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  },

  /* ------------------------------ 手机号 ------------------------------ */

  /**
   * 微信返回的 code 交给服务端换真实号码（服务端持 session_key，前端不接触）。
   * 用户拒绝授权时 detail 里没有 code，这里要**如实提示**而不是静默什么都不做。
   */
  onGetPhone(e) {
    const code = e && e.detail && e.detail.code;
    if (!code) {
      wx.showToast({ title: '未授权手机号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '绑定中', mask: true });
    bindPhone({ code })
      .then((res) => {
        wx.hideLoading();
        const phone = (res && res.phone) || '';
        this.setData({ hasPhone: !!phone, phoneMasked: maskPhone(phone) });
        wx.showToast({ title: '绑定成功', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '绑定失败', icon: 'none' });
      });
  },

  /* ------------------------------ 跳转与退出 ------------------------------ */

  onGoMemberCode() {
    wx.navigateTo({ url: ROUTES.MEMBER_CODE });
  },

  onTapLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后购物车与订单需要重新登录才能查看。',
      confirmText: '退出登录',
      confirmColor: '#EE0A24',
      success: (r) => {
        if (!r.confirm) return;
        logout();
        wx.showToast({ title: '已退出登录', icon: 'none' });
        setTimeout(() => wx.switchTab({ url: ROUTES.MINE }), 600);
      }
    });
  }
});

/** 手机号掩码：11 位保留前 3 后 4 */
function maskPhone(phone) {
  const s = String(phone || '');
  if (!s) return '';
  if (s.length === 11) return `${s.slice(0, 3)}****${s.slice(-4)}`;
  if (s.length <= 2) return '*'.repeat(s.length);
  return `${s.slice(0, 1)}****${s.slice(-1)}`;
}
