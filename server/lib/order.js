/**
 * 交易域逻辑：预下单、订单查询、取消、确认收货、支付回调
 *
 * 关键规则（安全相关，服务端唯一权威）：
 *   - 下单金额一律以服务端商品库 + 实时库存重新计算，前端传值仅作展示
 *   - 下单即锁库存，取消/超时释放
 *   - 支付回调幂等：同一 transactionId 只处理一次
 */

const { genId, genOrderNo, now, paginate } = require('./util');
const { BizError, ERR } = require('./http');
const catalog = require('./catalog');
const cartLib = require('./cart');
const users = require('./users');
const wechat = require('./wechat');

/** 订单状态机 */
const STATUS = {
  PENDING_PAY: 'pending_pay',
  PENDING_SHIP: 'pending_ship',
  SHIPPED: 'shipped',
  FINISHED: 'finished',
  CANCELLED: 'cancelled'
};

const STATUS_TEXT = {
  pending_pay: '待付款',
  pending_ship: '待发货',
  shipped: '待收货',
  finished: '已完成',
  cancelled: '已取消'
};

/** 运费规则：满 199 元免运费，否则 15 元 */
const FREIGHT_FREE_THRESHOLD = 19900;
const FREIGHT_FEE = 1500;

/** 待支付超时时间：30 分钟 */
const PAY_TIMEOUT = 30 * 60 * 1000;

function decorate(order) {
  return Object.assign({}, order, {
    statusText: STATUS_TEXT[order.status] || order.status,
    // 前端展示用的元单位字符串，避免各端重复换算
    payAmountYuan: (order.amounts.payAmount / 100).toFixed(2),
    goodsAmountYuan: (order.amounts.goodsAmount / 100).toFixed(2)
  });
}

/** 计算优惠金额；返回 { couponAmount, coupon } */
function calcCoupon(db, userId, couponId, goodsList, goodsAmount) {
  if (!couponId) return { couponAmount: 0, coupon: null };

  const list = db.coupons[userId] || [];
  users.refreshCouponStatus(list);
  const coupon = list.find((c) => c.couponId === couponId);
  if (!coupon) throw new BizError('优惠券不存在', ERR.NOT_FOUND, 404);
  if (coupon.status !== 'available') throw new BizError('该优惠券已使用或已过期', ERR.BIZ);
  if (goodsAmount < coupon.threshold) {
    throw new BizError(`未满 ${(coupon.threshold / 100).toFixed(0)} 元，无法使用该券`, ERR.BIZ);
  }
  // 限分类券：订单中需包含该分类商品
  if (coupon.categoryId) {
    const matched = goodsList.some((g) => g.categoryId === coupon.categoryId);
    if (!matched) throw new BizError(`该券仅限指定分类商品使用`, ERR.BIZ);
  }

  const couponAmount =
    coupon.type === 'percent'
      ? Math.max(0, goodsAmount - Math.floor((goodsAmount * coupon.value) / 100))
      : Math.min(coupon.value, goodsAmount);

  return { couponAmount, coupon };
}

/**
 * 预下单
 * @param {object} payload { items:[{goodsId,skuId,quantity}] | fromCart:true, addressId, couponId, remark }
 */
function precreate(db, userId, payload) {
  const { addressId, couponId, remark = '', fromCart } = payload;

  /* 1) 组装商品行：支持「购物车结算」与「立即购买」两种来源 */
  let rawItems = [];
  if (fromCart) {
    const cartItems = cartLib.itemsOf(db, userId).filter((i) => i.selected);
    if (!cartItems.length) throw new BizError('请先选择要结算的商品', ERR.BIZ);
    rawItems = cartItems.map((i) => ({
      goodsId: i.goodsId,
      skuId: i.skuId,
      quantity: i.quantity
    }));
  } else {
    rawItems = Array.isArray(payload.items) ? payload.items : [];
  }
  if (!rawItems.length) throw new BizError('订单商品不能为空', ERR.PARAM);

  /* 2) 收货地址快照 */
  const addrList = db.addresses[userId] || [];
  const address = addressId
    ? addrList.find((a) => a.addressId === addressId)
    : addrList.find((a) => a.isDefault) || addrList[0];
  if (!address) throw new BizError('请先选择收货地址', ERR.BIZ);

  /* 3) 服务端重新计算金额 + 校验并锁定库存 */
  const items = [];
  let goodsAmount = 0;
  const goodsRefs = [];

  rawItems.forEach((raw) => {
    const goods = catalog.findGoods(raw.goodsId);
    const sku = catalog.findSku(goods, raw.skuId);
    const qty = Math.max(1, Number(raw.quantity) || 1);
    const stock = cartLib.stockOf(db, sku);
    if (qty > stock) throw new BizError(`「${goods.name}」库存不足，仅剩 ${stock} 件`, ERR.BIZ);

    goodsAmount += sku.price * qty;
    goodsRefs.push(goods);
    items.push({
      goodsId: goods.id,
      skuId: sku.skuId,
      name: goods.name,
      specText: sku.specs.join(' / '),
      image: goods.cover,
      price: sku.price,
      quantity: qty
    });
  });

  /* 4) 优惠券核算 */
  const { couponAmount, coupon } = calcCoupon(db, userId, couponId, goodsRefs, goodsAmount);

  /* 5) 运费 */
  const freightAmount = goodsAmount >= FREIGHT_FREE_THRESHOLD ? 0 : FREIGHT_FEE;

  /* 6) 应付金额（最低 1 分，微信支付不支持 0 元单） */
  const payAmount = Math.max(1, goodsAmount - couponAmount + freightAmount);

  /* 7) 扣库存（下单即锁） */
  items.forEach((it) => {
    db.stocks[it.skuId] = cartLib.stockOf(db, { skuId: it.skuId, stock: 0 }) - it.quantity;
  });

  /* 8) 生成订单 */
  const t = now();
  const order = {
    orderId: genId('od'),
    orderNo: genOrderNo(),
    userId,
    status: STATUS.PENDING_PAY,
    items,
    address: {
      name: address.name,
      phone: address.phone,
      province: address.province,
      city: address.city,
      district: address.district,
      detail: address.detail
    },
    amounts: { goodsAmount, couponAmount, freightAmount, payAmount },
    couponId: coupon ? coupon.couponId : '',
    remark,
    fromCart: !!fromCart,
    createdAt: t,
    payExpireAt: t + PAY_TIMEOUT,
    paidAt: 0,
    shippedAt: 0,
    finishedAt: 0,
    cancelledAt: 0,
    transactionId: '',
    logistics: []
  };
  db.orders.push(order);

  /* 9) 核销优惠券 + 清购物车已结算项 */
  if (coupon) {
    coupon.status = 'used';
    coupon.usedAt = t;
    coupon.orderId = order.orderId;
  }
  if (fromCart) {
    cartLib.removeBySkuIds(db, userId, items.map((i) => i.skuId));
  }

  return { orderId: order.orderId, orderNo: order.orderNo, amounts: order.amounts, couponAmount };
}

/** 统一下单：拿订单信息向微信换支付参数 */
async function buildPayment(db, userId, orderId) {
  const order = findOrder(db, userId, orderId);
  if (order.status !== STATUS.PENDING_PAY) throw new BizError('订单当前状态不可支付', ERR.BIZ);
  if (order.payExpireAt && order.payExpireAt < now()) {
    throw new BizError('订单已超时，请重新下单', ERR.BIZ);
  }
  const user = users.requireUser(db, userId);
  const payment = await wechat.unifiedOrder({
    openid: user.openid,
    orderNo: order.orderNo,
    amountFen: order.amounts.payAmount,
    description: order.items.map((i) => i.name).join('、').slice(0, 60)
  });
  return { orderId: order.orderId, orderNo: order.orderNo, amountFen: order.amounts.payAmount, payment };
}

function findOrder(db, userId, orderId) {
  const order = db.orders.find((o) => o.orderId === orderId && o.userId === userId);
  if (!order) throw new BizError('订单不存在', ERR.NOT_FOUND, 404);
  return order;
}

function list(db, userId, { status, page, size }) {
  let arr = db.orders.filter((o) => o.userId === userId);
  if (status && status !== 'all') {
    arr = arr.filter((o) => o.status === status);
  }
  arr = arr.slice().sort((a, b) => b.createdAt - a.createdAt);

  // 顺带刷新超时未支付订单，避免前端看到过期仍显示「待付款」
  arr.forEach((o) => expireIfTimeout(db, o));

  const result = paginate(arr, page, size);
  return Object.assign({}, result, { list: result.list.map(decorate) });
}

/** 各状态数量，用于「我的」页角标 */
function countByStatus(db, userId) {
  const counts = { pending_pay: 0, pending_ship: 0, shipped: 0, finished: 0, cancelled: 0 };
  db.orders.filter((o) => o.userId === userId).forEach((o) => {
    expireIfTimeout(db, o);
    counts[o.status] = (counts[o.status] || 0) + 1;
  });
  return counts;
}

function detail(db, userId, orderId) {
  const order = findOrder(db, userId, orderId);
  expireIfTimeout(db, order);
  return decorate(order);
}

/** 取消订单并回滚库存 + 退回优惠券 */
function cancel(db, userId, orderId) {
  const order = findOrder(db, userId, orderId);
  if (order.status === STATUS.CANCELLED) throw new BizError('订单已取消', ERR.BIZ);
  if (order.status !== STATUS.PENDING_PAY) throw new BizError('已支付订单请联系客服处理', ERR.BIZ);

  order.status = STATUS.CANCELLED;
  order.cancelledAt = now();
  rollback(db, order);
  return decorate(order);
}

/** 确认收货 */
function confirm(db, userId, orderId) {
  const order = findOrder(db, userId, orderId);
  if (order.status !== STATUS.SHIPPED) throw new BizError('订单当前状态不可确认收货', ERR.BIZ);
  order.status = STATUS.FINISHED;
  order.finishedAt = now();
  order.logistics.push({ text: '交易完成，感谢您的购买', at: order.finishedAt });
  return decorate(order);
}

/** 库存回滚 + 优惠券返还 */
function rollback(db, order) {
  order.items.forEach((it) => {
    db.stocks[it.skuId] = cartLib.stockOf(db, { skuId: it.skuId, stock: 0 }) + it.quantity;
  });
  if (order.couponId) {
    const coupon = (db.coupons[order.userId] || []).find((c) => c.couponId === order.couponId);
    if (coupon && coupon.status === 'used') {
      coupon.status = 'available';
      coupon.usedAt = 0;
      coupon.orderId = '';
    }
  }
}

/** 超时未支付 → 自动取消 */
function expireIfTimeout(db, order) {
  if (order.status !== STATUS.PENDING_PAY) return order;
  if (!order.payExpireAt || order.payExpireAt > now()) return order;
  order.status = STATUS.CANCELLED;
  order.cancelledAt = now();
  order.cancelReason = '超时未支付，系统自动取消';
  rollback(db, order);
  return order;
}

/**
 * 支付成功处理（由 /api/pay/notify 调用）
 * 幂等：同一 transactionId 重复回调只生效一次
 */
function markPaid(db, { orderNo, transactionId, payAmountFen }) {
  const dup = db.payLogs.find((l) => l.transactionId === transactionId);
  if (dup) return { order: decorate(db.orders.find((o) => o.orderNo === orderNo)), duplicated: true };

  const order = db.orders.find((o) => o.orderNo === orderNo);
  if (!order) throw new BizError('订单不存在', ERR.NOT_FOUND, 404);

  db.payLogs.push({ transactionId, orderNo, payAmountFen, at: now() });

  if (order.status !== STATUS.PENDING_PAY) {
    return { order: decorate(order), duplicated: true };
  }
  if (payAmountFen !== undefined && Number(payAmountFen) !== order.amounts.payAmount) {
    throw new BizError('回调金额与订单金额不一致', ERR.BIZ);
  }

  order.status = STATUS.PENDING_SHIP;
  order.paidAt = now();
  order.transactionId = transactionId;
  order.logistics = [
    { text: '支付成功，等待商家发货', at: order.paidAt }
  ];
  // 累加销量（商品可能已下架，容错处理）
  order.items.forEach((it) => catalog.bumpSales(it.goodsId, it.quantity));
  return { order: decorate(order), duplicated: false };
}

/** 联调辅助：把订单标记为已发货（真实环境由 ERP/后台触发） */
function ship(db, userId, orderId, company = '顺丰速运', no = '') {
  const order = findOrder(db, userId, orderId);
  if (order.status !== STATUS.PENDING_SHIP) throw new BizError('订单当前状态不可发货', ERR.BIZ);
  order.status = STATUS.SHIPPED;
  order.shippedAt = now();
  order.logistics = (order.logistics || []).concat([
    { text: `商家已发货（${company} ${no || 'SF' + order.orderNo.slice(-10)}）`, at: order.shippedAt }
  ]);
  return decorate(order);
}

module.exports = {
  STATUS,
  STATUS_TEXT,
  decorate,
  precreate,
  buildPayment,
  findOrder,
  list,
  detail,
  cancel,
  confirm,
  markPaid,
  ship,
  countByStatus,
  expireIfTimeout
};
