/**
 * 后台管理域逻辑：数据概览、订单管理、客户管理、评价管理
 *
 * 说明：
 *   - 全部基于 `store.db`（用户业务数据）与 `catalog` 的只读视图做聚合，不改动小程序侧契约
 *   - 金额一律「分」，时间一律毫秒时间戳
 *   - 发货/关闭订单复用 `lib/order.js` 的既有实现，保证与小程序侧状态机完全一致
 */

const catalog = require('./catalog');
const orderLib = require('./order');
const catalogStore = require('./catalogStore');
const { COMMENTS } = require('./seed');
const { paginate, toInt, clone, now } = require('./util');
const { BizError, ERR } = require('./http');

const ORDER_STATUS = ['pending_pay', 'pending_ship', 'shipped', 'finished', 'cancelled'];
const STATUS_TEXT = {
  pending_pay: '待付款',
  pending_ship: '待发货',
  shipped: '待收货',
  finished: '已完成',
  cancelled: '已取消'
};

/* ----------------------------- 时间工具 ----------------------------- */

function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 近 n 天的日期轴（含今天），返回 [{ date, start, end, label }] */
function lastDays(n, from = Date.now()) {
  const out = [];
  const base = dayStart(from);
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = base - i * 86400000;
    out.push({
      start,
      end: start + 86400000,
      label: new Date(start).toISOString().slice(5, 10)
    });
  }
  return out;
}

function isPaid(o) {
  return !!o.paidAt && o.status !== 'cancelled';
}

/* ----------------------------- 数据概览 ----------------------------- */

function dashboard(db, { days = 7 } = {}) {
  const orders = db.orders || [];
  const today = dayStart(Date.now());
  const yesterday = today - 86400000;
  const weekAgo = today - 6 * 86400000;
  const monthAgo = today - 29 * 86400000;

  const sumPay = (list) => list.filter(isPaid).reduce((s, o) => s + toInt(o.amounts && o.amounts.payAmount), 0);
  const paidCount = (list) => list.filter(isPaid).length;
  const avg = (total, n) => (n ? Math.round(total / n) : 0);

  const inRange = (from, to) => orders.filter((o) => toInt(o.createdAt) >= from && (!to || toInt(o.createdAt) < to));

  const todayOrders = inRange(today);
  const yesterdayOrders = inRange(yesterday, today);
  const weekOrders = inRange(weekAgo);
  const monthOrders = inRange(monthAgo);

  const todayPay = sumPay(todayOrders);
  const yesterdayPay = sumPay(yesterdayOrders);

  const trend = lastDays(days).map((d) => {
    const list = orders.filter((o) => toInt(o.createdAt) >= d.start && toInt(o.createdAt) < d.end);
    const paid = list.filter(isPaid);
    return {
      label: d.label,
      date: d.start,
      orders: list.length,
      paidOrders: paid.length,
      gmv: sumPay(list)
    };
  });

  // Top 商品：按订单内销量汇总（已支付订单）
  const salesMap = {};
  orders.filter(isPaid).forEach((o) => {
    (o.items || []).forEach((it) => {
      const cur = salesMap[it.goodsId] || (salesMap[it.goodsId] = { goodsId: it.goodsId, name: it.name, qty: 0, amount: 0 });
      cur.qty += toInt(it.quantity);
      cur.amount += toInt(it.price) * toInt(it.quantity);
    });
  });
  const topGoods = Object.keys(salesMap)
    .map((k) => salesMap[k])
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const statusCount = ORDER_STATUS.reduce((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s).length;
    return acc;
  }, {});

  const goodsAll = catalogStore.get().goods;
  const lowStock = goodsAll
    .map((g) => catalog.withLiveStock(g))
    .filter((g) => g.stock <= catalog.LOW_STOCK)
    .map((g) => ({ id: g.id, name: g.name, stock: g.stock, status: g.status }))
    .sort((a, b) => a.stock - b.stock);

  const customers = db.users || [];
  const newCustomersToday = customers.filter((u) => toInt(u.createdAt) >= today).length;

  const recentOrders = orders.slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6)
    .map((o) => ({
      orderId: o.orderId,
      orderNo: o.orderNo,
      status: o.status,
      statusText: STATUS_TEXT[o.status] || o.status,
      payAmount: toInt(o.amounts && o.amounts.payAmount),
      createdAt: o.createdAt,
      itemCount: (o.items || []).reduce((s, it) => s + toInt(it.quantity), 0),
      firstItem: (o.items || [])[0] ? (o.items[0].name || '') : '',
      customer: (o.address && o.address.name) || ''
    }));

  return {
    updatedAt: Date.now(),
    today: {
      gmv: todayPay,
      orders: todayOrders.length,
      paidOrders: paidCount(todayOrders),
      avgOrder: avg(todayPay, paidCount(todayOrders)),
      newCustomers: newCustomersToday,
      gmvCompare: todayPay - yesterdayPay // 与昨日同时段口径（整日）对比
    },
    yesterday: { gmv: yesterdayPay, orders: yesterdayOrders.length },
    week: { gmv: sumPay(weekOrders), orders: weekOrders.length, paidOrders: paidCount(weekOrders) },
    month: { gmv: sumPay(monthOrders), orders: monthOrders.length, paidOrders: paidCount(monthOrders) },
    total: {
      gmv: sumPay(orders),
      orders: orders.length,
      paidOrders: paidCount(orders),
      avgOrder: avg(sumPay(orders), paidCount(orders)),
      customers: customers.length,
      goods: goodsAll.length,
      onSale: goodsAll.filter((g) => g.status === 'on_sale').length
    },
    todo: {
      pendingShip: statusCount.pending_ship,
      pendingPay: statusCount.pending_pay,
      lowStock: lowStock.length
    },
    statusCount,
    trend,
    topGoods,
    lowStockList: lowStock.slice(0, 8),
    recentOrders
  };
}

/* ----------------------------- 订单管理 ----------------------------- */

function matchKeyword(o, kw) {
  if (!kw) return true;
  const k = kw.toLowerCase();
  return String(o.orderNo).toLowerCase().indexOf(k) > -1 ||
    String(o.orderId).toLowerCase().indexOf(k) > -1 ||
    ((o.address && o.address.name) || '').indexOf(kw) > -1 ||
    ((o.address && o.address.phone) || '').indexOf(kw) > -1 ||
    (o.items || []).some((it) => String(it.name).toLowerCase().indexOf(k) > -1);
}

function orderList(db, { status, keyword, from, to, page, size, sort }) {
  let list = (db.orders || []).slice();
  if (status && status !== 'all') list = list.filter((o) => o.status === status);
  if (keyword) list = list.filter((o) => matchKeyword(o, keyword));
  if (from) list = list.filter((o) => toInt(o.createdAt) >= toInt(from));
  if (to) list = list.filter((o) => toInt(o.createdAt) <= toInt(to));

  const userMap = {};
  (db.users || []).forEach((u) => { userMap[u.userId] = u; });

  list.sort((a, b) => (sort === 'amount' ? toInt(b.amounts.payAmount) - toInt(a.amounts.payAmount) : b.createdAt - a.createdAt));

  const counts = { all: (db.orders || []).length };
  ORDER_STATUS.forEach((s) => { counts[s] = (db.orders || []).filter((o) => o.status === s).length; });

  const result = paginate(list, page, size);
  return Object.assign({}, result, {
    counts,
    list: result.list.map((o) => {
      const u = userMap[o.userId] || {};
      return {
        orderId: o.orderId,
        orderNo: o.orderNo,
        status: o.status,
        statusText: STATUS_TEXT[o.status] || o.status,
        createdAt: o.createdAt,
        paidAt: o.paidAt || 0,
        shippedAt: o.shippedAt || 0,
        finishedAt: o.finishedAt || 0,
        payAmount: toInt(o.amounts && o.amounts.payAmount),
        goodsAmount: toInt(o.amounts && o.amounts.goodsAmount),
        couponAmount: toInt(o.amounts && o.amounts.couponAmount),
        itemCount: (o.items || []).reduce((s, it) => s + toInt(it.quantity), 0),
        items: (o.items || []).slice(0, 3),
        customer: {
          userId: o.userId,
          nickname: u.nickname || '',
          avatar: u.avatar || '',
          name: (o.address && o.address.name) || '',
          phone: (o.address && o.address.phone) || ''
        },
        express: o.express || null,
        merchantRemark: o.merchantRemark || ''
      };
    })
  });
}

function findOrder(db, orderId) {
  const o = (db.orders || []).find((x) => x.orderId === orderId);
  if (!o) throw new BizError('订单不存在', ERR.NOT_FOUND, 404);
  return o;
}

function orderDetail(db, orderId) {
  const o = clone(findOrder(db, orderId));
  const u = (db.users || []).find((x) => x.userId === o.userId) || {};
  const paid = isPaid(o);
  const cost = toInt(o.amounts && o.amounts.payAmount);
  return Object.assign(o, {
    statusText: STATUS_TEXT[o.status] || o.status,
    customer: {
      userId: o.userId,
      nickname: u.nickname || '',
      avatar: u.avatar || '',
      phone: u.phone || '',
      orderCount: (db.orders || []).filter((x) => x.userId === o.userId).length,
      paidAmount: (db.orders || []).filter((x) => x.userId === o.userId && isPaid(x))
        .reduce((s, x) => s + toInt(x.amounts && x.amounts.payAmount), 0)
    },
    paid,
    paidAmount: paid ? cost : 0,
    userCoupons: (db.coupons[o.userId] || []).map((c) => ({ couponId: c.couponId, name: c.name, status: c.status }))
  });
}

/** 批量发货 */
function shipOrders(db, { orderIds, company, no }) {
  const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
  if (!ids.length) throw new BizError('请选择要发货的订单', ERR.PARAM);
  const ok = [];
  const failed = [];
  ids.forEach((id) => {
    const o = (db.orders || []).find((x) => x.orderId === id);
    if (!o) { failed.push({ orderId: id, reason: '订单不存在' }); return; }
    try {
      orderLib.ship(db, o.userId, id, company || '顺丰速运', no || '');
      if (company) o.express = { company, no: no || '' };
      ok.push(id);
    } catch (e) {
      failed.push({ orderId: id, reason: e.message });
    }
  });
  return { shipped: ok.length, orderIds: ok, failed };
}

function setMerchantRemark(db, { orderId, remark }) {
  const o = findOrder(db, orderId);
  o.merchantRemark = String(remark || '').slice(0, 200);
  o.merchantRemarkAt = now();
  return { orderId, merchantRemark: o.merchantRemark };
}

/** 关闭订单（仅未付款） */
function closeOrder(db, orderId) {
  const o = findOrder(db, orderId);
  orderLib.cancel(db, o.userId, orderId); // 内部会校验状态、回滚库存、退还券
  return { orderId, status: 'cancelled' };
}

/** 订单导出（CSV 文本，前端做成 Blob 下载） */
function orderExport(db, params) {
  const all = orderList(db, Object.assign({}, params, { page: 1, size: 100000 }));
  const head = ['订单号', '状态', '下单时间', '支付时间', '收货人', '电话', '商品数', '商品金额(元)', '优惠(元)', '实付(元)', '物流'];
  const rows = all.list.map((o) => [
    o.orderNo,
    o.statusText,
    new Date(o.createdAt).toLocaleString('zh-CN'),
    o.paidAt ? new Date(o.paidAt).toLocaleString('zh-CN') : '',
    o.customer.name,
    o.customer.phone,
    o.itemCount,
    (o.goodsAmount / 100).toFixed(2),
    (o.couponAmount / 100).toFixed(2),
    (o.payAmount / 100).toFixed(2),
    o.express ? `${o.express.company} ${o.express.no}` : ''
  ]);
  const csv = [head].concat(rows).map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return {
    filename: `订单导出_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}.csv`,
    rows: rows.length,
    content: '\uFEFF' + csv // BOM：Excel 打开不乱码
  };
}

/* ----------------------------- 客户管理 ----------------------------- */

function customerAgg(db) {
  const map = {};
  (db.users || []).forEach((u) => {
    map[u.userId] = {
      userId: u.userId,
      nickname: u.nickname || '',
      avatar: u.avatar || '',
      phone: u.phone || '',
      tags: u.tags || [],
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt || 0,
      orderCount: 0,
      paidCount: 0,
      paidAmount: 0,
      lastOrderAt: 0,
      couponCount: (db.coupons[u.userId] || []).filter((c) => c.status === 'available').length,
      favoriteCount: (db.favorites[u.userId] || []).length,
      footprintCount: (db.footprints[u.userId] || []).length,
      addressCount: (db.addresses[u.userId] || []).length
    };
  });
  (db.orders || []).forEach((o) => {
    const c = map[o.userId];
    if (!c) return;
    c.orderCount += 1;
    if (isPaid(o)) {
      c.paidCount += 1;
      c.paidAmount += toInt(o.amounts && o.amounts.payAmount);
    }
    if (toInt(o.createdAt) > c.lastOrderAt) c.lastOrderAt = toInt(o.createdAt);
  });
  return map;
}

function customerList(db, { keyword, level, tag, sort, page, size }) {
  const agg = customerAgg(db);
  let list = Object.keys(agg).map((k) => agg[k]);

  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter((c) =>
      String(c.nickname).toLowerCase().indexOf(k) > -1 ||
      String(c.phone).indexOf(keyword) > -1 ||
      String(c.userId).toLowerCase().indexOf(k) > -1);
  }
  if (tag) list = list.filter((c) => (c.tags || []).indexOf(tag) > -1);
  if (level === 'new') list = list.filter((c) => c.paidCount === 0);
  if (level === 'vip') list = list.filter((c) => c.paidAmount >= 300000);
  if (level === 'active') list = list.filter((c) => c.lastOrderAt >= dayStart(Date.now()) - 29 * 86400000);

  switch (sort) {
    case 'amount': list.sort((a, b) => b.paidAmount - a.paidAmount); break;
    case 'orders': list.sort((a, b) => b.paidCount - a.paidCount); break;
    case 'recent': list.sort((a, b) => b.lastOrderAt - a.lastOrderAt); break;
    default: list.sort((a, b) => b.createdAt - a.createdAt);
  }

  const total = list.length;
  const sum = list.reduce((s, c) => s + c.paidAmount, 0);
  const result = paginate(list, page, size);
  return Object.assign({}, result, {
    summary: {
      total,
      withOrder: list.filter((c) => c.paidCount > 0).length,
      noOrder: list.filter((c) => c.paidCount === 0).length,
      amount: sum,
      avgAmount: total ? Math.round(sum / Math.max(1, list.filter((c) => c.paidCount > 0).length)) : 0
    },
    tags: [...new Set([].concat(...Object.keys(agg).map((k) => agg[k].tags || [])))]
  });
}

function customerDetail(db, userId) {
  const agg = customerAgg(db)[userId];
  if (!agg) throw new BizError('客户不存在', ERR.NOT_FOUND, 404);
  const orders = (db.orders || []).filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => ({
      orderId: o.orderId,
      orderNo: o.orderNo,
      status: o.status,
      statusText: STATUS_TEXT[o.status] || o.status,
      payAmount: toInt(o.amounts && o.amounts.payAmount),
      createdAt: o.createdAt,
      itemCount: (o.items || []).reduce((s, it) => s + toInt(it.quantity), 0)
    }));
  return Object.assign({}, clone(agg), {
    addresses: clone(db.addresses[userId] || []),
    coupons: clone(db.coupons[userId] || []),
    orders
  });
}

/** 打标签（全量覆盖 + 支持追加） */
function setCustomerTags(db, { userId, tags, append }) {
  const u = (db.users || []).find((x) => x.userId === userId);
  if (!u) throw new BizError('客户不存在', ERR.NOT_FOUND, 404);
  const next = append
    ? [...new Set([].concat(u.tags || [], (tags || []).map((t) => String(t).trim()).filter(Boolean)))].slice(0, 10)
    : (tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 10);
  u.tags = next;
  return { userId, tags: next };
}

/* ----------------------------- 评价管理 ----------------------------- */

function allComments(db, { goodsId, keyword, score, page, size }) {
  const goodsMap = {};
  catalogStore.get().goods.forEach((g) => { goodsMap[g.id] = g; });
  let list = [];
  Object.keys(COMMENTS).forEach((gid) => {
    if (goodsId && gid !== goodsId) return;
    COMMENTS[gid].forEach((c) => {
      list.push(Object.assign({}, c, {
        goodsName: (goodsMap[gid] && goodsMap[gid].name) || gid,
        reply: (db.commentReplies || {})[c.commentId] || null
      }));
    });
  });
  if (score) list = list.filter((c) => String(c.score) === String(score));
  if (keyword) list = list.filter((c) => String(c.content).indexOf(keyword) > -1 || String(c.author).indexOf(keyword) > -1);
  list.sort((a, b) => b.createdAt - a.createdAt);
  return paginate(list, page, size);
}

function replyComment(db, { commentId, text }) {
  if (!commentId) throw new BizError('缺少评价 ID', ERR.PARAM);
  if (!db.commentReplies) db.commentReplies = {};
  const t = String(text || '').trim();
  if (!t) {
    delete db.commentReplies[commentId];
    return { commentId, reply: null };
  }
  db.commentReplies[commentId] = { text: t.slice(0, 300), at: now() };
  return { commentId, reply: db.commentReplies[commentId] };
}

module.exports = {
  ORDER_STATUS,
  STATUS_TEXT,
  dashboard,
  orderList,
  orderDetail,
  shipOrders,
  setMerchantRemark,
  closeOrder,
  orderExport,
  customerList,
  customerDetail,
  setCustomerTags,
  allComments,
  replyComment
};
