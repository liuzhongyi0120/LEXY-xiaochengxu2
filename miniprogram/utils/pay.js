/**
 * 拉起支付（**唯一一份实现**）
 *
 * 为什么必须只写一份：订单列表、订单详情、支付结果页三处都有「去付款」。
 * 各写一遍必然出现「列表里点得动、详情里点不动」这类只在某个入口复现的问题 ——
 * 与本项目「跳转只此一份（utils/link.js）」同一个理由。
 *
 * 两种环境的分支**不能靠猜**：
 *   `POST /api/order/prepay` 的响应里带 `sandbox`，由服务端按「是否配置了商户号」给出。
 *   sandbox=true 时 `unifiedOrder` 返回的是结构完整但**签名无效**的参数，
 *   `wx.requestPayment` 必然失败 —— 这时如实告诉用户「当前是联调环境」并提供
 *   「模拟支付成功」（服务端走与真实支付回调**完全相同**的处理路径），
 *   而不是让用户对着一个永远失败的支付面板反复点。
 *   配置真实商户号后 sandbox 自动为 false，模拟入口自动消失。
 *
 * @param {string} orderId
 * @returns {Promise<{paid:boolean, mock:boolean, cancelled:boolean}>}
 *   paid      —— 是否已支付成功
 *   mock      —— 是否走的联调模拟
 *   cancelled —— 用户在支付面板上主动取消（不是错误，不要弹报错）
 */

const { prepay, mockPay } = require('../services/order');

function payOrder(orderId) {
  return prepay(orderId).then((res) => {
    if (res.sandbox) return sandboxConfirm(orderId, res);

    return new Promise((resolve, reject) => {
      wx.requestPayment(
        Object.assign({}, res.payment, {
          success: () => resolve({ paid: true, mock: false, cancelled: false }),
          fail: (err) => {
            const msg = (err && err.errMsg) || '';
            // 「用户取消」不是故障：不弹报错，让页面自己决定怎么表现
            if (/cancel/i.test(msg)) {
              resolve({ paid: false, mock: false, cancelled: true });
              return;
            }
            reject(new Error(msg || '支付未完成'));
          }
        })
      );
    });
  });
}

/** 联调环境：明确告知 + 让用户自己确认，绝不在后台静默把订单改成已支付 */
function sandboxConfirm(orderId, res) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '联调环境',
      content:
        '当前后端未配置微信商户号，无法拉起真实支付。\n' +
        '可以「模拟支付成功」——服务端会走与真实支付回调相同的处理路径，' +
        '订单状态、库存与销量都会真实变更。',
      confirmText: '模拟支付',
      cancelText: '取消',
      success: (r) => {
        if (!r.confirm) {
          resolve({ paid: false, mock: false, cancelled: true });
          return;
        }
        wx.showLoading({ title: '支付中', mask: true });
        mockPay(orderId)
          .then(() => {
            wx.hideLoading();
            resolve({ paid: true, mock: true, cancelled: false });
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '模拟支付失败', icon: 'none' });
            resolve({ paid: false, mock: false, cancelled: false });
          });
      }
    });
  });
}

module.exports = { payOrder };
