const { splitPrice, shortNumber } = require('../../utils/format');

Component({
  properties: {
    /** 弹层显隐 */
    visible: { type: Boolean, value: false },
    /** 商品对象，需包含 specs / skus / price / stock / cover / name */
    goods: { type: Object, value: null },
    /** cart = 仅加入购物车；buy = 仅立即购买；both = 双按钮 */
    mode: { type: String, value: 'both' }
  },

  data: {
    selectedValues: [],
    specState: [],
    currentSku: null,
    selectedText: '',
    priceParts: { int: '0', dec: '.00' },
    quantity: 1,
    maxQuantity: 1,
    disabled: true,
    tips: '',
    salesText: '0'
  },

  observers: {
    goods(goods) {
      if (goods && goods.specs && goods.specs.length) {
        this.reset(goods);
      }
    }
  },

  methods: {
    /** 重置选择状态：单一取值的规格自动选中 */
    reset(goods) {
      const specs = goods.specs || [];
      const selectedValues = specs.map((spec) => (spec.values.length === 1 ? spec.values[0] : ''));

      this.setData(
        {
          selectedValues,
          quantity: 1,
          salesText: shortNumber(goods.sales)
        },
        () => this.refresh()
      );
    },

    /** 重新计算规格可选态、当前 SKU、价格与库存 */
    refresh() {
      const { goods, selectedValues, quantity } = this.data;
      if (!goods || !goods.specs) return;

      const { specs, skus = [] } = goods;

      const specState = specs.map((spec, specIndex) => ({
        name: spec.name,
        values: spec.values.map((value) => ({
          value,
          active: selectedValues[specIndex] === value,
          available: this.isValueAvailable(specIndex, value, selectedValues, skus)
        }))
      }));

      const currentSku = this.matchSku(selectedValues, skus);
      const price = currentSku ? currentSku.price : goods.price;
      const stock = currentSku ? currentSku.stock : goods.stock || 0;

      const maxQuantity = Math.max(1, Math.min(stock || 1, 99));
      const missingIndex = specs.findIndex((spec, index) => !selectedValues[index]);

      // 已选规格文本，如「星空灰 / 标准版」
      const selectedText = specs
        .map((spec, index) => selectedValues[index])
        .filter(Boolean)
        .join(' / ');

      let tips;
      if (missingIndex > -1) {
        tips = `请选择 ${specs[missingIndex].name}`;
      } else if (stock <= 0) {
        tips = '该规格暂时缺货';
      } else {
        tips = `库存 ${stock} 件`;
      }

      this.setData({
        specState,
        currentSku,
        selectedText,
        priceParts: splitPrice(price),
        maxQuantity,
        quantity: Math.min(quantity, maxQuantity),
        disabled: !currentSku || stock <= 0,
        tips
      });
    },

    /**
     * 判断某规格值是否可选：
     * 把该维度换成待判定值、其余维度沿用当前已选，若存在可用 SKU 则视为可选。
     */
    isValueAvailable(specIndex, value, selectedValues, skus) {
      const probe = selectedValues.slice();
      probe[specIndex] = value;

      return skus.some((sku) => {
        if (sku.stock <= 0) return false;
        return sku.specs.every((skuValue, index) => {
          const selected = probe[index];
          return !selected || selected === skuValue;
        });
      });
    },

    /** 规格全部选满后匹配唯一 SKU */
    matchSku(selectedValues, skus) {
      if (selectedValues.some((value) => !value)) return null;
      return (
        skus.find((sku) =>
          sku.specs.every((skuValue, index) => skuValue === selectedValues[index])
        ) || null
      );
    },

    /* ----------------------- 交互 ----------------------- */

    onClose() {
      this.triggerEvent('close');
    },

    onSelectValue(e) {
      const { specIndex, value, available } = e.currentTarget.dataset;
      if (!available) return;

      const selectedValues = this.data.selectedValues.slice();
      // 再次点击已选中的值 → 取消选择
      selectedValues[specIndex] = selectedValues[specIndex] === value ? '' : value;

      this.setData({ selectedValues }, () => this.refresh());
    },

    onQuantityChange(e) {
      const { delta } = e.currentTarget.dataset;
      const next = this.data.quantity + Number(delta);
      if (next < 1 || next > this.data.maxQuantity) return;
      this.setData({ quantity: next });
    },

    onInputQuantity(e) {
      const raw = Number(e.detail.value) || 1;
      const clamped = Math.max(1, Math.min(raw, this.data.maxQuantity));
      this.setData({ quantity: clamped });
    },

    onConfirm(e) {
      const { action } = e.currentTarget.dataset;
      if (this.data.disabled || !this.data.currentSku) return;

      this.triggerEvent('confirm', {
        action: action || 'cart',
        sku: this.data.currentSku,
        quantity: this.data.quantity
      });
    },

    /** 阻止弹层背景滚动穿透 */
    noop() {}
  }
});
