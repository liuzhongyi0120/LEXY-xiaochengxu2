const { fetchCategories } = require('../../services/goods');
const { ROUTES } = require('../../utils/constants');

Page({
  data: {
    loading: true,
    categories: [],
    activeIndex: 0
  },

  onLoad() {
    this.loadCategories();
  },

  onPullDownRefresh() {
    this.loadCategories().then(() => wx.stopPullDownRefresh());
  },

  loadCategories() {
    this.setData({ loading: true });

    return fetchCategories()
      .then((list) => {
        this.setData({ categories: list || [], activeIndex: 0, loading: false });
      })
      .catch((err) => {
        console.error('[category] 分类加载失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /* ----------------------- 交互 ----------------------- */

  onTapTop(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.activeIndex) return;
    this.setData({ activeIndex: index });
  },

  /** 进入某个分类的商品列表（一级 / 二级通用） */
  onTapCategory(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `${ROUTES.GOODS_LIST}?categoryId=${id}` });
  }
});
