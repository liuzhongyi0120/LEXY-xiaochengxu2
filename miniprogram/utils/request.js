const { BASE_URL, IS_MOCK, CODE, STORAGE } = require('./constants');
const mock = require('../mock/index');

const TIMEOUT = 15000;

function buildHeader(auth = true) {
  const header = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = wx.getStorageSync(STORAGE.TOKEN);
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }
  }
  return header;
}

/**
 * 统一网络请求封装
 * @param {string} url 以 / 开头的接口路径
 * @param {string} method GET | POST | PUT | DELETE
 * @param {object} data 请求体 / query 参数
 * @param {object} options { auth?: boolean, loading?: boolean, loadingText?: string }
 * @returns {Promise<any>} resolve 的是业务 data 字段，业务失败时 reject
 *
 * 与服务端契约（server/lib/http.js）：
 *   - 成功 { code: 0, msg: 'ok', data: {...} }
 *   - 失败 { code: <非0>, msg: '<可展示提示>', data: null }，HTTP 状态码通常仍为 200
 *   - 未登录 / token 失效：HTTP 401 + code 401
 */
function request(url, method = 'GET', data = {}, options = {}) {
  const { loading = false, loadingText = '加载中', auth = true } = options;

  if (loading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  // mock 环境：走本地演示数据，接口签名与真实环境完全一致
  if (IS_MOCK) {
    return mock.handle(url, method, data).then(
      (res) => {
        if (loading) wx.hideLoading();
        return res;
      },
      (err) => {
        if (loading) wx.hideLoading();
        throw err;
      }
    );
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method: method.toUpperCase(),
      data,
      header: buildHeader(auth),
      timeout: TIMEOUT,
      success(res) {
        const { statusCode, data: body } = res;

        // 登录态失效：清除本地 token，交由调用方决定是否重新登录
        if (statusCode === 401 || (body && body.code === CODE.UNAUTHORIZED)) {
          wx.removeStorageSync(STORAGE.TOKEN);
          const err = new Error((body && body.msg) || '登录态已失效，请重新登录');
          err.code = CODE.UNAUTHORIZED;
          err.needLogin = true;
          reject(err);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          const err = new Error(`服务异常（HTTP ${statusCode}）`);
          err.code = statusCode;
          reject(err);
          return;
        }

        if (!body || body.code !== CODE.OK) {
          const err = new Error((body && body.msg) || '请求失败');
          err.code = body ? body.code : -1;
          reject(err);
          return;
        }

        resolve(body.data);
      },
      fail(err) {
        const e = new Error(err.errMsg || '网络异常，请稍后重试');
        e.code = -1;
        reject(e);
      },
      complete() {
        if (loading) wx.hideLoading();
      }
    });
  });
}

const get = (url, data, options) => request(url, 'GET', data, options);
const post = (url, data, options) => request(url, 'POST', data, options);
const put = (url, data, options) => request(url, 'PUT', data, options);
const del = (url, data, options) => request(url, 'DELETE', data, options);

module.exports = { request, get, post, put, del };
