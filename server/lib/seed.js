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

/** 评价种子：按商品生成稳定的演示评价 */
const COMMENT_AUTHORS = ['莱**', '碧**', '小*', 'A**', '用**户', 'j***n', '星**', '老**'];
const COMMENT_TEXTS = [
  { score: 5, text: '收到货就用了，做工扎实，噪音比想象中小，家里人都满意。' },
  { score: 5, text: '包装完好，物流很快。使用一周体验很好，值得推荐。' },
  { score: 4, text: '整体不错，细节还能再优化一点，总体符合预期。' },
  { score: 5, text: '客服响应及时，讲解清楚，安装按说明来很简单。' },
  { score: 4, text: '性价比可以，功能齐全，日常够用。' },
  { score: 5, text: '第二次购买了，老品牌品质稳定。' }
];

const COMMENTS = {};
GOODS.forEach((goods) => {
  const count = goods.commentCount || 0;
  const list = [];
  const n = Math.min(12, Math.max(3, Math.round(count / 40)));
  for (let i = 0; i < n; i += 1) {
    const tpl = COMMENT_TEXTS[i % COMMENT_TEXTS.length];
    const author = COMMENT_AUTHORS[i % COMMENT_AUTHORS.length];
    list.push({
      commentId: `cm_${goods.id}_${i + 1}`,
      goodsId: goods.id,
      author,
      avatar: '',
      score: tpl.score,
      content: tpl.text,
      images: i % 3 === 0 ? [goods.cover] : [],
      specText: (goods.skus[i % goods.skus.length] || {}).specs.join(' / '),
      createdAt: Date.now() - (i + 1) * 86400000 * 3
    });
  }
  COMMENTS[goods.id] = list;
});

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
  COMMENTS,
  COUPON_TEMPLATES,
  WELCOME_COUPONS
};
