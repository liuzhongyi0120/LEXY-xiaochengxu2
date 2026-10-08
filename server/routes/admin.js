/**
 * 后台管理路由（控制台 /console 专用）
 *
 * 分为：数据概览 / 商品 / 分类 / 订单 / 客户 / 营销 / 评价 / 店铺设置
 *
 * ⚠️ 与装修、素材点位一样，本组点位**免登录**（联调期方便），
 *    上线必须在网关层统一加访问控制，见 README「上线前必做」。
 */

const admin = require('../lib/admin');
const catalog = require('../lib/catalog');
const catalogStore = require('../lib/catalogStore');
const { BizError, ERR } = require('../lib/http');

const T = '后台管理';

module.exports = [
  /* ---------------------------- 数据概览 ---------------------------- */
  {
    method: 'GET',
    path: '/api/admin/dashboard',
    auth: false,
    desc: `数据概览（今日/近7日/累计 GMV、订单、客户、库存预警、趋势、Top 商品）`,
    note: T,
    async handler(ctx) {
      return admin.dashboard(ctx.db, ctx.params);
    }
  },

  /* ----------------------------- 商品 ----------------------------- */
  {
    method: 'GET',
    path: '/api/admin/goods/list',
    auth: false,
    desc: '商品列表（含已下架；状态/分类/关键词/库存预警/排序/分页）',
    note: T,
    async handler(ctx) {
      const r = catalog.adminListGoods(ctx.params);
      return Object.assign({}, r, {
        categories: catalog.categories(),
        lowStockLine: catalog.LOW_STOCK
      });
    }
  },
  {
    method: 'GET',
    path: '/api/admin/goods/detail',
    auth: false,
    desc: '商品详情（编辑态，含下架商品）',
    note: T,
    async handler(ctx) {
      return {
        goods: catalog.adminGoodsDetail(ctx.params.id),
        categories: catalog.categories()
      };
    }
  },
  {
    method: 'POST',
    path: '/api/admin/goods/save',
    auth: false,
    desc: '新建 / 编辑商品（含 SKU、价格、库存、图片、上下架）',
    note: T,
    async handler(ctx) {
      return catalog.saveGoods(ctx.params);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/goods/status',
    auth: false,
    desc: '批量上架 / 下架',
    note: T,
    async handler(ctx) {
      return catalog.setGoodsStatus(ctx.params.ids, ctx.params.status);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/goods/stock',
    auth: false,
    desc: '批量改库存（mode=set 覆盖 / delta 增减）',
    note: T,
    async handler(ctx) {
      return catalog.setStock({ items: ctx.params.items, mode: ctx.params.mode });
    }
  },
  {
    method: 'POST',
    path: '/api/admin/goods/delete',
    auth: false,
    desc: '删除商品（有订单记录时拒绝，建议改为下架）',
    note: T,
    async handler(ctx) {
      return catalog.deleteGoods(ctx.params.id);
    }
  },

  /* ----------------------------- 分类 ----------------------------- */
  {
    method: 'GET',
    path: '/api/admin/category/list',
    auth: false,
    desc: '分类树（含每个分类的商品数）',
    note: T,
    async handler(ctx) {
      const goods = catalogStore.get().goods;
      const count = {};
      goods.forEach((g) => { count[g.categoryId] = (count[g.categoryId] || 0) + 1; });
      const tree = catalog.categories().map((c) => Object.assign({}, c, {
        goodsCount: count[c.id] || 0,
        children: (c.children || []).map((x) => Object.assign({}, x, { goodsCount: count[x.id] || 0 }))
      }));
      return { list: tree };
    }
  },
  {
    method: 'POST',
    path: '/api/admin/category/save',
    auth: false,
    desc: '新建 / 重命名分类（parentId 为空则建一级分类）',
    note: T,
    async handler(ctx) {
      return catalog.saveCategory(ctx.params);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/category/delete',
    auth: false,
    desc: '删除分类（分类下有商品时拒绝）',
    note: T,
    async handler(ctx) {
      return catalog.deleteCategory(ctx.params.id);
    }
  },

  /* ----------------------------- 订单 ----------------------------- */
  {
    method: 'GET',
    path: '/api/admin/order/list',
    auth: false,
    desc: '订单列表（状态/关键词/时间范围/排序/分页 + 各状态计数）',
    note: T,
    async handler(ctx) {
      return admin.orderList(ctx.db, ctx.params);
    }
  },
  {
    method: 'GET',
    path: '/api/admin/order/detail',
    auth: false,
    desc: '订单详情（客户信息、金额、物流、券、备注）',
    note: T,
    async handler(ctx) {
      return admin.orderDetail(ctx.db, ctx.params.orderId);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/order/ship',
    auth: false,
    desc: '发货（支持批量；可填物流公司与单号）',
    note: T,
    async handler(ctx) {
      const r = admin.shipOrders(ctx.db, ctx.params);
      return Object.assign(r, { message: `成功发货 ${r.shipped} 单${r.failed.length ? `，失败 ${r.failed.length} 单` : ''}` });
    }
  },
  {
    method: 'POST',
    path: '/api/admin/order/remark',
    auth: false,
    desc: '商家备注（仅后台可见）',
    note: T,
    async handler(ctx) {
      return admin.setMerchantRemark(ctx.db, ctx.params);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/order/close',
    auth: false,
    desc: '关闭未付款订单（回滚库存 + 退还券）',
    note: T,
    async handler(ctx) {
      return admin.closeOrder(ctx.db, ctx.params.orderId);
    }
  },
  {
    method: 'GET',
    path: '/api/admin/order/export',
    auth: false,
    desc: '导出订单 CSV（返回文本，前端转 Blob 下载）',
    note: T,
    async handler(ctx) {
      return admin.orderExport(ctx.db, ctx.params);
    }
  },

  /* ----------------------------- 客户 ----------------------------- */
  {
    method: 'GET',
    path: '/api/admin/customer/list',
    auth: false,
    desc: '客户列表（关键词/分层/标签/排序/分页 + 汇总）',
    note: T,
    async handler(ctx) {
      return admin.customerList(ctx.db, ctx.params);
    }
  },
  {
    method: 'GET',
    path: '/api/admin/customer/detail',
    auth: false,
    desc: '客户详情（消费统计、订单、地址、券、资产）',
    note: T,
    async handler(ctx) {
      return admin.customerDetail(ctx.db, ctx.params.userId);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/customer/tag',
    auth: false,
    desc: '客户打标签（append=true 追加，否则覆盖）',
    note: T,
    async handler(ctx) {
      return admin.setCustomerTags(ctx.db, ctx.params);
    }
  },

  /* ----------------------------- 营销 ----------------------------- */
  {
    method: 'GET',
    path: '/api/admin/coupon/list',
    auth: false,
    desc: '优惠券模板列表（含领取 / 核销统计）',
    note: T,
    async handler() {
      return { list: catalog.adminCouponList(), categories: catalog.categories() };
    }
  },
  {
    method: 'GET',
    path: '/api/admin/coupon/detail',
    auth: false,
    desc: '单个优惠券模板',
    note: T,
    async handler(ctx) {
      const t = catalog.couponTemplates().find((x) => x.templateId === ctx.params.templateId);
      if (!t) throw new BizError('优惠券不存在', ERR.NOT_FOUND, 404);
      return t;
    }
  },
  {
    method: 'POST',
    path: '/api/admin/coupon/save',
    auth: false,
    desc: '新建 / 编辑优惠券模板',
    note: T,
    async handler(ctx) {
      return catalog.saveCouponTemplate(ctx.params);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/coupon/status',
    auth: false,
    desc: '启用 / 暂停优惠券（暂停后小程序端不可再领）',
    note: T,
    async handler(ctx) {
      return catalog.setCouponTemplateStatus(ctx.params.templateId, ctx.params.status);
    }
  },
  {
    method: 'POST',
    path: '/api/admin/coupon/delete',
    auth: false,
    desc: '删除优惠券模板（已被领取过则拒绝）',
    note: T,
    async handler(ctx) {
      return catalog.deleteCouponTemplate(ctx.params.templateId);
    }
  },

  /* ----------------------------- 评价 ----------------------------- */
  {
    method: 'GET',
    path: '/api/admin/comment/list',
    auth: false,
    desc: '评价列表（可按商品/评分/关键词筛选，含商家回复）',
    note: T,
    async handler(ctx) {
      const r = admin.allComments(ctx.db, ctx.params);
      const goods = catalogStore.get().goods.map((g) => ({ id: g.id, name: g.name }));
      return Object.assign({}, r, { goods });
    }
  },
  {
    method: 'POST',
    path: '/api/admin/comment/reply',
    auth: false,
    desc: '回复评价（text 传空字符串则删除回复）',
    note: T,
    async handler(ctx) {
      const r = admin.replyComment(ctx.db, ctx.params);
      return r;
    }
  },

  /* --------------------------- 店铺设置 --------------------------- */
  {
    method: 'GET',
    path: '/api/admin/settings',
    auth: false,
    desc: '店铺设置（店铺名/Logo/客服电话/公告/运费/自动确认收货等）',
    note: T,
    async handler() {
      return {
        settings: catalog.settings(),
        defaults: catalogStore.DEFAULT_SETTINGS,
        goodsCount: catalogStore.get().goods.length,
        categoryCount: catalogStore.get().categories.length,
        couponCount: catalogStore.get().couponTemplates.length
      };
    }
  },
  {
    method: 'POST',
    path: '/api/admin/settings/save',
    auth: false,
    desc: '保存店铺设置',
    note: T,
    async handler(ctx) {
      return catalog.saveSettings(ctx.params);
    }
  }
];
