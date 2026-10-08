const { post } = require('./request');
const { STORAGE } = require('./constants');

// 并发去重：多个页面同时触发登录时只发一次请求
let loginPromise = null;

/**
 * 静默登录
 * 流程：wx.login 拿 code → 服务端 code2Session 换 openid → 下发业务 token
 * 注意：session_key 由服务端保管，前端不接触、不落地
 */
function login(force = false) {
  if (loginPromise && !force) return loginPromise;

  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success(successRes) {
        const { code } = successRes;
        if (!code) {
          loginPromise = null;
          reject(new Error('获取登录凭证失败'));
          return;
        }

        post('/api/auth/login', { code }, { auth: false })
          .then((data) => {
            wx.setStorageSync(STORAGE.TOKEN, data.token);
            wx.setStorageSync(STORAGE.USER_ID, data.userId);
            resolve(data);
          })
          .catch((err) => {
            loginPromise = null; // 失败后允许重试
            reject(err);
          });
      },
      fail(err) {
        loginPromise = null;
        reject(new Error(err.errMsg || '微信登录失败'));
      }
    });
  });

  return loginPromise;
}

/** 读取本地 token */
function getToken() {
  return wx.getStorageSync(STORAGE.TOKEN) || '';
}

/** 是否已登录 */
function isLogged() {
  return !!getToken();
}

/** 退出登录，清除本地登录态 */
function logout() {
  wx.removeStorageSync(STORAGE.TOKEN);
  wx.removeStorageSync(STORAGE.USER_ID);
  loginPromise = null;
}

/**
 * 确保已登录：未登录时先登录再执行后续动作
 * 用于下单、支付等必须登录的操作
 * @returns {Promise<void>}
 */
function ensureLogin() {
  if (isLogged()) return Promise.resolve();
  return login(true).then(() => undefined);
}

module.exports = {
  login,
  getToken,
  isLogged,
  logout,
  ensureLogin
};
