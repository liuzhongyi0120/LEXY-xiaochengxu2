/**
 * 用户域逻辑：账号查找/创建、登录态、欢迎券发放
 */

const { genId, now } = require('./util');
const catalogStore = require('./catalogStore');
const { WELCOME_COUPONS } = require('./seed');
const { BizError, ERR } = require('./http');

/** 券模板从 catalogStore 读（后台新建的券小程序端立刻可领） */
const couponTemplates = () => catalogStore.get().couponTemplates;

/** 按 openid 找用户 */
function findByOpenid(db, openid) {
  return db.users.find((u) => u.openid === openid) || null;
}

/** 按 userId 找用户 */
function findById(db, userId) {
  return db.users.find((u) => u.userId === userId) || null;
}

/** 取用户，不存在则抛业务错误 */
function requireUser(db, userId) {
  const user = findById(db, userId);
  if (!user) throw new BizError('用户不存在', ERR.UNAUTHORIZED, 401);
  return user;
}

/** 对外暴露的用户视图（不返回 openid 等敏感字段） */
function toProfile(user) {
  return {
    userId: user.userId,
    nickname: user.nickname || '微信用户',
    avatar: user.avatar || '',
    phone: user.phone || '',
    createdAt: user.createdAt
  };
}

/** 生成一张用户券 */
function buildUserCoupon(template, extra = {}) {
  const t = now();
  return Object.assign(
    {
      couponId: genId('cp'),
      templateId: template.templateId,
      name: template.name,
      type: template.type,
      threshold: template.threshold,
      value: template.value,
      scope: template.scope,
      categoryId: template.categoryId || '',
      status: 'available', // available | used | expired
      receivedAt: t,
      expireAt: t + template.days * 86400000,
      usedAt: 0,
      orderId: ''
    },
    extra
  );
}

/** 发欢迎券 */
function grantWelcomeCoupons(db, userId) {
  if (!db.coupons[userId]) db.coupons[userId] = [];
  WELCOME_COUPONS.forEach((tid) => {
    const tpl = couponTemplates().find((c) => c.templateId === tid);
    if (tpl) db.coupons[userId].push(buildUserCoupon(tpl, { reason: '新用户注册礼' }));
  });
  return db.coupons[userId];
}

/**
 * 登录时确保用户存在：不存在则创建并发放欢迎券
 * @returns {{ user: object, isNew: boolean }}
 */
function ensureUser(db, openid) {
  const exist = findByOpenid(db, openid);
  if (exist) {
    exist.lastLoginAt = now();
    return { user: exist, isNew: false };
  }

  const user = {
    userId: genId('u'),
    openid,
    nickname: '微信用户',
    avatar: '',
    phone: '',
    createdAt: now(),
    lastLoginAt: now()
  };
  db.users.push(user);
  grantWelcomeCoupons(db, user.userId);
  return { user, isNew: true };
}

/** 把已过期的券标记为 expired（惰性清理，读取时执行） */
function refreshCouponStatus(list) {
  const t = now();
  list.forEach((c) => {
    if (c.status === 'available' && c.expireAt && c.expireAt < t) {
      c.status = 'expired';
    }
  });
  return list;
}

module.exports = {
  findByOpenid,
  findById,
  requireUser,
  toProfile,
  buildUserCoupon,
  grantWelcomeCoupons,
  ensureUser,
  refreshCouponStatus
};
