/**
 * 种子数据（只读侧）
 *
 * 商品 / 分类 / 轮播直接复用 `miniprogram/mock/data.js`，保证：
 *   - 前端 mock 环境与后端真实环境返回的商品完全一致，切换 ENV 时页面不会「变样」
 *   - 真实上线时把本文件替换为「商品中心 / ERP 同步」即可，接口契约不变
 *
 * ⚠️ 商品名称、价格、库存为开发期数据，上线前须替换为官方商品库。
 */

const mockData = require('../../miniprogram/mock/data');

const CATEGORIES = mockData.CATEGORIES;
const BANNERS = mockData.BANNERS;
const GOODS = mockData.GOODS;
const DETAIL_BLOCKS = mockData.DETAIL_BLOCKS;

/**
 * 评价（COMMENTS）**不在这里生成**
 *
 * 评价是 UGC、属于用户业务数据，持久化在 `server/data/db.json` 的 `comments` 字段
 * （读写在 `lib/catalog.js` 的 `commentsOf()`）。早期这里按小程序端 mock 商品凭空生成
 * 演示评价，商品库接入真实商品后，后台评价管理里全是商品库里已不存在的商品的评价，
 * 且只能靠改代码才能清 —— 已移除。
 */

/**
 * 优惠券模板：真实环境由营销后台配置
 * type: discount（满减） / percent（折扣）
 */
const COUPON_TEMPLATES = [
  {
    templateId: 'ct_new_100',
    name: '新人礼 · 满 1000 减 100',
    type: 'discount',
    threshold: 100000,
    value: 10000,
    scope: '全场通用',
    days: 30
  },
  {
    templateId: 'ct_500_300',
    name: '大额券 · 满 3000 减 300',
    type: 'discount',
    threshold: 300000,
    value: 30000,
    scope: '全场通用',
    days: 15
  },
  {
    templateId: 'ct_bq_200',
    name: '碧云泉专享 · 满 2000 减 200',
    type: 'discount',
    threshold: 200000,
    value: 20000,
    scope: '仅限健康饮水分类',
    categoryId: 'c2',
    days: 20
  },
  {
    templateId: 'ct_95',
    name: '全场 95 折券',
    type: 'percent',
    threshold: 0,
    value: 95,
    scope: '全场通用',
    days: 7
  }
];

/** 为新建用户自动发放的券 */
const WELCOME_COUPONS = ['ct_new_100', 'ct_95'];

module.exports = {
  CATEGORIES,
  BANNERS,
  GOODS,
  DETAIL_BLOCKS,
  COUPON_TEMPLATES,
  WELCOME_COUPONS
};
