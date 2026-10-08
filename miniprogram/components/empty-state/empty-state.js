Component({
  options: {
    // 允许外部通过 class 覆盖样式
    addGlobalClass: false
  },

  properties: {
    /** 提示文案 */
    text: { type: String, value: '暂无数据' },
    /** 按钮文案，为空则不显示按钮 */
    buttonText: { type: String, value: '' },
    /** 图标，留空时使用内置的纯 CSS 图形 */
    icon: { type: String, value: '' }
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
