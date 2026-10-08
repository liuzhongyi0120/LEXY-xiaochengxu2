/**
 * 用户资产路由
 *   地址：/api/address/list | detail | save | delete | setDefault
 *   优惠券：/api/coupon/list | receive | available
 *   收藏：/api/favorite/list | toggle
 *   足迹：/api/footprint/list | add | clear
 */

const { genId, now, paginate } = require('../lib/util');
const { BizError, ERR } = require('../lib/http');
const users = require('../lib/users');
const catalog = require('../lib/catalog');
const catalogStore = require('../lib/catalogStore');

/* ----------------------------- 地址 ----------------------------- */

function addressList(db, userId) {
  if (!db.addresses[userId]) db.addresses[userId] = [];
  const list = db.addresses[userId].slice().sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  return { list, total: list.length };
}

function addressSave(db, userId, p) {
  const { addressId, name, phone, province, city, district, detail, isDefault } = p;
  if (!name || !phone || !detail) throw new BizError('收货人、手机号、详细地址不能为空', ERR.PARAM);
  if (!/^1[3-9]\d{9}$/.test(String(phone))) throw new BizError('手机号格式不正确', ERR.PARAM);

  if (!db.addresses[userId]) db.addresses[userId] = [];
  const list = db.addresses[userId];

  let addr = addressId ? list.find((a) => a.addressId === addressId) : null;
  if (addressId && !addr) throw new BizError('地址不存在', ERR.NOT_FOUND, 404);

  if (!addr) {
    addr = { addressId: genId('ad'), createdAt: now() };
    list.push(addr);
    // 第一条地址自动设为默认
    if (list.length === 1) addr.isDefault = true;
  }

  Object.assign(addr, {
    name: String(name).slice(0, 20),
    phone: String(phone),
    province: province || '',
    city: city || '',
    district: district || '',
    detail: String(detail).slice(0, 120),
    updatedAt: now()
  });

  if (isDefault) {
    list.forEach((a) => { a.isDefault = a.addressId === addr.addressId; });
  }
  return addr;
}

function addressDelete(db, userId, addressId) {
  if (!addressId) throw new BizError('缺少 addressId', ERR.PARAM);
  if (!db.addresses[userId]) db.addresses[userId] = [];
  const list = db.addresses[userId];
  const idx = list.findIndex((a) => a.addressId === addressId);
  if (idx === -1) throw new BizError('地址不存在', ERR.NOT_FOUND, 404);

  const [removed] = list.splice(idx, 1);
  // 删掉默认地址后，把第一条补为默认
  if (removed.isDefault && list.length) list[0].isDefault = true;
  return { addressId, deleted: true, total: list.length };
}

function addressSetDefault(db, userId, addressId) {
  const list = (db.addresses[userId] || []);
  const addr = list.find((a) => a.addressId === addressId);
  if (!addr) throw new BizError('地址不存在', ERR.NOT_FOUND, 404);
  list.forEach((a) => { a.isDefault = a.addressId === addressId; });
  return addr;
}

/* ----------------------------- 优惠券 ----------------------------- */

function couponList(db, userId, status) {
  const list = users.refreshCouponStatus(db.coupons[userId] || []);
  const filtered = status && status !== 'all' ? list.filter((c) => c.status === status) : list;
  const sorted = filtered.slice().sort((a, b) => b.receivedAt - a.receivedAt);
  const counts = {
    available: list.filter((c) => c.status === 'available').length,
    used: list.filter((c) => c.status === 'used').length,
    expired: list.filter((c) => c.status === 'expired').length
  };
  return { list: sorted, total: sorted.length, counts };
}

function couponReceive(db, userId, templateId) {
  const tpl = catalogStore.get().couponTemplates.find((c) => c.templateId === templateId);
  if (!tpl) throw new BizError('优惠券不存在', ERR.NOT_FOUND, 404);
  if ((tpl.status || 'active') !== 'active') throw new BizError('该券已停止发放', ERR.BIZ);

  if (!db.coupons[userId]) db.coupons[userId] = [];
  const owned = db.coupons[userId].filter((c) => c.templateId === templateId && c.status === 'available');
  if (owned.length >= 1) throw new BizError('该券已领取，请勿重复领取', ERR.BIZ);

  const coupon = users.buildUserCoupon(tpl, { reason: '主动领取' });
  db.coupons[userId].push(coupon);
  return coupon;
}

/** 下单页可用券：按订单金额与分类过滤，并标记是否可用 */
function couponAvailable(db, userId, goodsAmount, categoryIds) {
  const list = users.refreshCouponStatus(db.coupons[userId] || [])
    .filter((c) => c.status === 'available');
  const cats = Array.isArray(categoryIds) ? categoryIds : [];
  const amount = Number(goodsAmount) || 0;

  return list.map((c) => {
    let usable = amount >= c.threshold;
    let reason = usable ? '' : `还差 ${((c.threshold - amount) / 100).toFixed(2)} 元可用`;
    if (usable && c.categoryId && cats.length && cats.indexOf(c.categoryId) === -1) {
      usable = false;
      reason = '仅限指定分类商品';
    }
    const discount =
      c.type === 'percent' ? Math.max(0, amount - Math.floor((amount * c.value) / 100)) : Math.min(c.value, amount);
    return Object.assign({}, c, { usable, reason, discount: usable ? discount : 0 });
  }).sort((a, b) => (b.usable ? 1 : 0) - (a.usable ? 1 : 0) || b.discount - a.discount);
}

/* ----------------------------- 收藏 ----------------------------- */

function favoriteToggle(db, userId, goodsId) {
  if (!goodsId) throw new BizError('缺少 goodsId', ERR.PARAM);
  catalog.findGoods(goodsId); // 校验商品存在

  if (!db.favorites[userId]) db.favorites[userId] = [];
  const list = db.favorites[userId];
  const idx = list.indexOf(goodsId);
  let favorited;
  if (idx === -1) {
    list.unshift(goodsId);
    favorited = true;
  } else {
    list.splice(idx, 1);
    favorited = false;
  }
  return { goodsId, favorited, total: list.length };
}

function favoriteList(db, userId, page, size) {
  const ids = db.favorites[userId] || [];
  const goods = ids
    .map((id) => {
      try {
        return catalog.toListItem(catalog.findGoods(id));
      } catch (e) {
        return null; // 商品已下架则跳过
      }
    })
    .filter(Boolean);
  const result = paginate(goods, page, size);
  return Object.assign({}, result, { ids });
}

/* ----------------------------- 足迹 ----------------------------- */

const FOOTPRINT_MAX = 100;

function footprintAdd(db, userId, goodsId) {
  if (!goodsId) throw new BizError('缺少 goodsId', ERR.PARAM);
  catalog.findGoods(goodsId);
  if (!db.footprints[userId]) db.footprints[userId] = [];

  const list = db.footprints[userId].filter((f) => f.goodsId !== goodsId);
  list.unshift({ goodsId, at: now() });
  db.footprints[userId] = list.slice(0, FOOTPRINT_MAX);
  return { goodsId, total: db.footprints[userId].length };
}

function footprintList(db, userId, page, size) {
  const raw = db.footprints[userId] || [];
  const mapped = raw
    .map((f) => {
      try {
        return Object.assign({ at: f.at }, catalog.toListItem(catalog.findGoods(f.goodsId)));
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
  const result = paginate(mapped, page, size);
  return Object.assign({}, result, { total: mapped.length });
}

function footprintClear(db, userId) {
  db.footprints[userId] = [];
  return { cleared: true };
}

/* ----------------------------- 导出 ----------------------------- */

module.exports = [
  { method: 'GET', path: '/api/address/list', auth: true, desc: '地址列表',
    async handler(ctx) { return addressList(ctx.db, ctx.userId); } },
  { method: 'GET', path: '/api/address/detail', auth: true, desc: '地址详情',
    async handler(ctx) {
      const list = (ctx.db.addresses[ctx.userId] || []);
      const addr = list.find((a) => a.addressId === ctx.params.addressId);
      if (!addr) throw new BizError('地址不存在', ERR.NOT_FOUND, 404);
      return addr;
    } },
  { method: 'POST', path: '/api/address/save', auth: true, desc: '新增 / 编辑地址',
    async handler(ctx) { return addressSave(ctx.db, ctx.userId, ctx.params); } },
  { method: 'POST', path: '/api/address/delete', auth: true, desc: '删除地址',
    async handler(ctx) { return addressDelete(ctx.db, ctx.userId, ctx.params.addressId); } },
  { method: 'POST', path: '/api/address/setDefault', auth: true, desc: '设为默认地址',
    async handler(ctx) { return addressSetDefault(ctx.db, ctx.userId, ctx.params.addressId); } },

  { method: 'GET', path: '/api/coupon/list', auth: true, desc: '我的优惠券',
    async handler(ctx) { return couponList(ctx.db, ctx.userId, ctx.params.status); } },
  { method: 'GET', path: '/api/coupon/available', auth: true, desc: '下单页可用券',
    async handler(ctx) {
      const ids = Array.isArray(ctx.params.categoryIds) ? ctx.params.categoryIds : [];
      return { list: couponAvailable(ctx.db, ctx.userId, ctx.params.goodsAmount, ids) };
    } },
  { method: 'POST', path: '/api/coupon/receive', auth: true, desc: '领取优惠券',
    async handler(ctx) { return couponReceive(ctx.db, ctx.userId, ctx.params.templateId); } },

  { method: 'GET', path: '/api/favorite/list', auth: true, desc: '我的收藏',
    async handler(ctx) { return favoriteList(ctx.db, ctx.userId, ctx.params.page, ctx.params.size); } },
  { method: 'POST', path: '/api/favorite/toggle', auth: true, desc: '收藏 / 取消收藏',
    async handler(ctx) { return favoriteToggle(ctx.db, ctx.userId, ctx.params.goodsId); } },

  { method: 'GET', path: '/api/footprint/list', auth: true, desc: '浏览记录',
    async handler(ctx) { return footprintList(ctx.db, ctx.userId, ctx.params.page, ctx.params.size); } },
  { method: 'POST', path: '/api/footprint/add', auth: true, desc: '记录浏览',
    async handler(ctx) { return footprintAdd(ctx.db, ctx.userId, ctx.params.goodsId); } },
  { method: 'DELETE', path: '/api/footprint/clear', auth: true, desc: '清空浏览记录',
    async handler(ctx) { return footprintClear(ctx.db, ctx.userId); } }
];
