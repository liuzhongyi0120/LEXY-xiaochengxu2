const { splitPrice, strikePrice, shortNumber } = require('../../utils/format');

Component({
  properties: {
    /** 商品摘要对象，字段与 /api/goods/list 返回项一致 */
    goods: {
      type: Object,
      value: {},
      observer(goods) {
        if (!goods || !goods.id) return;
        this.setData({
          priceParts: splitPrice(goods.price),
          /* 划线价：后端在没填时会把它派生成「等于售价」，所以由 strikePrice 统一判「该不该显示」 */
          originalText: strikePrice(goods.originalPrice, goods.price),
          salesText: shortNumber(goods.sales),
          fallbackText: String(goods.name || '').replace(/[·\s]/g, '').slice(0, 4),
          imgError: false
        });
      }
    },
    /** 是否展示「新品 / 热销」标签 */
    showTags: { type: Boolean, value: true }
  },

  data: {
    priceParts: { int: '0', dec: '.00' },
    originalText: '',
    salesText: '0',
    fallbackText: '',
    imgError: false
  },

  methods: {
    /** 图片加载失败时降级为色块，避免出现破图 */
    onImgError() {
      this.setData({ imgError: true });
    },

    onTap() {
      this.triggerEvent('tap', { id: this.data.goods.id });
    }
  }
});
