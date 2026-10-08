/**
 * 鉴权与用户路由
 *   POST /api/auth/login     微信登录（code2Session → 下发业务 token）
 *   POST /api/auth/refresh   续期 token
 *   GET  /api/user/profile   用户信息
 *   POST /api/user/phone     绑定手机号
 */

const auth = require('../lib/auth');
const wechat = require('../lib/wechat');
const users = require('../lib/users');
const { BizError, ERR } = require('../lib/http');

module.exports = [
  {
    method: 'POST',
    path: '/api/auth/login',
    auth: false,
    desc: '微信登录（code 换 token）',
    async handler(ctx) {
      const { code } = ctx.params;
      if (!code) throw new BizError('缺少登录凭证 code', ERR.PARAM);

      let session;
      try {
        session = await wechat.code2Session(code);
      } catch (e) {
        throw new BizError(e.message || '微信登录失败', ERR.BIZ);
      }

      const { user, isNew } = users.ensureUser(ctx.db, session.openid);
      const token = auth.sign({ userId: user.userId });

      return {
        token,
        userId: user.userId,
        isNew,
        expiresIn: auth.TTL,
        profile: users.toProfile(user)
      };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/refresh',
    auth: true,
    desc: '续期登录态',
    async handler(ctx) {
      const user = users.requireUser(ctx.db, ctx.userId);
      return { token: auth.sign({ userId: user.userId }), expiresIn: auth.TTL };
    }
  },

  {
    method: 'GET',
    path: '/api/user/profile',
    auth: true,
    desc: '用户信息',
    async handler(ctx) {
      const user = users.requireUser(ctx.db, ctx.userId);
      return users.toProfile(user);
    }
  },

  {
    method: 'POST',
    path: '/api/user/profile',
    auth: true,
    desc: '更新昵称/头像（授权后回填）',
    async handler(ctx) {
      const user = users.requireUser(ctx.db, ctx.userId);
      const { nickname, avatar } = ctx.params;
      if (nickname) user.nickname = String(nickname).slice(0, 30);
      if (avatar) user.avatar = String(avatar);
      return users.toProfile(user);
    }
  },

  {
    method: 'POST',
    path: '/api/user/phone',
    auth: true,
    desc: '绑定手机号（getPhoneNumber 的 code）',
    async handler(ctx) {
      const user = users.requireUser(ctx.db, ctx.userId);
      const { code, phone } = ctx.params;
      if (!code && !phone) throw new BizError('缺少手机号凭证', ERR.PARAM);

      const real = code ? await wechat.getPhoneNumber(code, phone || '') : phone;
      if (!/^1[3-9]\d{9}$/.test(String(real))) throw new BizError('手机号格式不正确', ERR.PARAM);

      user.phone = String(real);
      return { phone: user.phone };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/logout',
    auth: true,
    desc: '退出登录（服务端无状态，前端清 token 即可）',
    async handler() {
      return { ok: true };
    }
  }
];
