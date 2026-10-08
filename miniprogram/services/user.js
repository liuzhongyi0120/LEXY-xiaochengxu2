const { get, post } = require('../utils/request');

/** 用户信息 */
function fetchProfile() {
  return get('/api/user/profile');
}

/**
 * 更新昵称 / 头像（授权后回填）
 * @param {object} payload { nickname?, avatar? }
 */
function updateProfile(payload) {
  return post('/api/user/profile', payload);
}

/**
 * 绑定手机号
 * @param {object} payload { code }  getPhoneNumber 回调里的 code
 */
function bindPhone(payload) {
  return post('/api/user/phone', payload);
}

/** 续期登录态 */
function refreshToken() {
  return post('/api/auth/refresh');
}

module.exports = { fetchProfile, updateProfile, bindPhone, refreshToken };
