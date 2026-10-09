/**
 * 后台管理路由（控制台 /console 专用）
 *
 * 分为：会话 / 数据概览 / 商品 / 分类 / 订单 / 客户 / 营销 / 评价 / 店铺设置
 *
 * ⚠️ 本组点位**全部要求管理员令牌**，由 server/index.js 统一拦截
 *    （见 lib/adminAuth.js 的角色规则）——
 *    早前它们都是 auth:false，只靠 DEBUG_PAGE 总开关保护，等于「开关一开人人可改」。
 *    这里不再逐个写 auth:true，因为管理员鉴权走的是独立通道（admin 标记的令牌），
 *    与小程序用户登录态互不通用；集中拦截也能保证「新增点位默认受保护」。
 *
 * 角色：GET 只需 viewer；日常写操作 operator；
 *      删商品 / 删分类 / 删券 / 改店铺设置 / 删素材与素材夹 / 发布或回滚装修 需 owner。
 */

const admin = require('../lib/admin');
const adminAuth = require('../lib/adminAuth');
const catalog = require('../lib/catalog');
const catalogStore = require('../lib/catalogStore');
const decorate = require('../decorate/store');
const { BizError, ERR } = require('../lib/http');

const T = '后台管理';

module.exports = [
  /* ---------------------------- 会话 ---------------------------- */
  {
    method: 'POST',
    path: '/api/admin/login',
    auth: false,
    desc: '管理员登录（口令换会话令牌；生产环境需先设置 ADMIN_PASSWORD）',
    note: T,
    async handler(ctx) {
      const token = adminAuth.login(ctx.params.password);
      return { token, role: 'owner', roleLabel: adminAuth.ROLE_LABEL.owner, ttl: adminAuth.ADMIN_TTL };
    }
  },
  {
    method: 'GET',
    path: '/api/admin/session',
    auth: false, // 已由 index.js 的管理员鉴权拦截，这里只做「我是谁」的回显
    desc: '当前管理员会话（角色与名称；用于后台启动时判断是否需要登录）',
    note: T,
    async handler(ctx) {
      const s = adminAuth.read(ctx.req);
      if (!s) throw new BizError('未登录管理员', ERR.UNAUTHORIZED, 401);
      return { role: s.role, roleLabel: adminAuth.ROLE_LABEL[s.role], name: s.name, source: s.source };
    }
  },

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
    path: '/api/admin/goods/sales',
    auth: false,
    desc: '批量改销量（mode=set 覆盖 / delta 增减）—— 销量只随支付累加、无自动回滚，用它修正',
    note: T,
    async handler(ctx) {
      return catalog.setSales({ items: ctx.params.items, mode: ctx.params.mode });
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
    desc: '运营参数（客服电话/公告/运费/自动确认等，存 catalog.json）+ 小程序端展示信息（店铺名称/头像/标语，只读，真源为装修台 replica.SHOP）+ 资产数量',
    note: T,
    async handler() {
      /*
       * 店铺名称与 Logo 在这里**只读**。
       *
       * 历史上控制台把它们存进 catalog.settings 并提示「用于我的页与分享卡片」，
       * 但小程序端读的是 replica.SHOP —— 两套数据源，后台说保存成功、前端永远是旧值。
       * 现在统一口径：唯一真源是装修台「店铺信息」，本页只负责如实展示它，
       * 顺便把「装修台里改了但还没生成代码」的差异也摆出来，避免又出现「以为改了」。
       */
      const R = decorate.readReplica();
      const pub = R.SHOP || {};
      const home = decorate.getPage('home');
      const draftShop = (home && home.hasDraft && home.data && home.data.shop) || null;
      const changed = draftShop
        ? ['name', 'avatar', 'slogan'].some((k) => JSON.stringify(draftShop[k]) !== JSON.stringify(pub[k]))
        : false;

      return {
        settings: catalog.settings(),
        defaults: catalogStore.DEFAULT_SETTINGS,
        shop: {
          source: '装修台「店铺信息」→ replica.SHOP',
          published: { name: pub.name || '', avatar: pub.avatar || '', slogan: pub.slogan || '' },
          draft: changed
            ? { name: draftShop.name || '', avatar: draftShop.avatar || '', slogan: draftShop.slogan || '' }
            : null
        },
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
    desc: '保存运营参数（不含店铺名称/Logo —— 那两个字段的唯一数据源是装修台 replica.SHOP，传了会被明确拒绝）',
    note: T,
    async handler(ctx) {
      return catalog.saveSettings(ctx.params);
    }
  }
];
