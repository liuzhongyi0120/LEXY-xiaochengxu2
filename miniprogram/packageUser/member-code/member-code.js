/**
 * 会员码（packageUser）
 *
 * ⚠️ 这一页**如实展示账号标识，不伪造会员等级**。
 *
 * 有赞的「会员码」背后是一整套会员体系（等级 / 积分 / 储值 / 权益卡），
 * 扫码即调出会员档案。我们自建商城目前**只有账号**（`db.users` 里的 userId），
 * 没有等级与积分（「我的」页的个人资产因此统一显示「—」）。
 *
 * 所以这里做的是：
 *   · 展示**真实存在**的账号标识（userId）与昵称 / 头像 / 已绑定手机号；
 *   · 页面顶部与底部各写一处说明，讲清它是账号标识、会员体系未开通；
 *   · **不画假二维码、不编会员等级** —— 一个扫出来是乱码的「会员码」
 *     比一个说明清楚的账号编号糟得多。
 *
 * 手机号只展示掩码（138****5127 一类）：这一页会被出示给别人看，
 * 完整号码没有任何展示必要。
 */

const { fetchProfile } = require('../../services/user');
const { ROUTES } = require('../../utils/constants');
const { resolveAssets } = require('../../utils/asset');

Page({
  data: {
    loading: true,
    logged: false,
    /** 账号标识（真实 userId，不做任何美化改写） */
    code: '',
    /** 分组展示：每 4 位一组，方便口头报读 */
    codeGroups: [],
    nickname: '',
    avatar: '',
    phoneMasked: '',
    /** 底部说明（真话，不写「敬请期待」这类空话） */
    notes: [
      '本编号是本店账号的唯一标识，客服核对订单与售后时可用',
      '会员等级、积分与储值体系尚未开通，本页不展示这些信息'
    ]
  },

  onLoad() {
    this.loadProfile();
  },

  onShow() {
    if (this._loaded) this.loadProfile();
    this._loaded = true;
  },

  loadProfile() {
    this.setData({ loading: true });
    return fetchProfile()
      .then((p) => {
        const code = String((p && p.userId) || '');
        this.setData({
          loading: false,
          logged: !!code,
          code,
          codeGroups: groupCode(code),
          nickname: (p && p.nickname) || '微信用户',
          avatar: resolveAssets((p && p.avatar) || ''),
          phoneMasked: maskPhone(p && p.phone)
        });
      })
      .catch((err) => {
        console.error('[member-code] 资料加载失败', err);
        this.setData({ loading: false, logged: false });
      });
  },

  onGoLogin() {
    wx.switchTab({ url: ROUTES.MINE });
  },

  onGoAccount() {
    wx.navigateTo({ url: ROUTES.ACCOUNT });
  },

  /** 复制账号编号：出示给客服时对方要能直接粘贴核对 */
  onCopyCode() {
    if (!this.data.code) return;
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '账号编号已复制', icon: 'none' })
    });
  }
});

/** 每 4 个字符一组（下划线也参与分组，保证分组后仍能还原） */
function groupCode(code) {
  if (!code) return [];
  const out = [];
  for (let i = 0; i < code.length; i += 4) out.push(code.slice(i, i + 4));
  return out;
}

/** 手机号掩码：11 位保留前 3 后 4；其它长度只保留首尾 */
function maskPhone(phone) {
  const s = String(phone || '');
  if (!s) return '';
  if (s.length === 11) return `${s.slice(0, 3)}****${s.slice(-4)}`;
  if (s.length <= 2) return '*'.repeat(s.length);
  return `${s.slice(0, 1)}****${s.slice(-1)}`;
}
