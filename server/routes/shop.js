/**
 * 店铺域路由（小程序端公开只读）
 *   GET /api/shop/settings  运营参数（客服电话 / 服务时间 / 公告 / 运费规则 / 自动确认天数）
 *
 * 为什么要有这个点位：
 *   「关于我们」「联系客服」「订单详情（自动确认收货天数）」这几处都需要运营参数，
 *   而运营参数一直只挂在 `/api/admin/settings` 上（管理端令牌 + 角色）。
 *   小程序端为了拿一个客服电话去调管理接口，既要不到（403）、又等于把后台往公网方向推。
 *
 * ⚠️ 只读、且**只读运营参数**：
 *   店铺名称 / Logo / 标语**不在本点位返回**。它们的唯一数据源是装修台（`replica.SHOP`，
 *   由「生成代码」写回小程序），这里再返回一份就会重演「后台说保存成功、前端永远是旧值」
 *   的两套数据源问题（见 `/api/admin/settings` 里的同一段说明）。
 */

const catalog = require('../lib/catalog');

/**
 * 小程序端可见的字段白名单。
 *
 * 用白名单而不是「把 settings 整个丢出去」：`catalog.settings()` 现在恰好全是可公开字段，
 * 但它是后台的存储对象 —— 以后往里加「内部结算价」这类字段时，
 * 用黑名单/整体透传就会**静默泄露**，而白名单只会「新字段没露出来」（安全方向是对的）。
 */
const PUBLIC_KEYS = [
  'servicePhone',
  'serviceHours',
  'notice',
  'freightFree',
  'defaultFreight',
  'autoConfirmDays',
  'payExpireMinutes'
];

module.exports = [
  {
    method: 'GET',
    path: '/api/shop/settings',
    auth: false,
    desc: '运营参数（客服电话/服务时间/公告/运费规则/自动确认天数；不含店铺名称与 Logo —— 那两个的唯一数据源是装修台）',
    async handler() {
      const s = catalog.settings() || {};
      const out = {};
      PUBLIC_KEYS.forEach((k) => {
        if (s[k] !== undefined) out[k] = s[k];
      });
      return out;
    }
  }
];
