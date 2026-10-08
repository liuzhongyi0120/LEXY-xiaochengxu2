const { fetchList } = require('../../services/goods');
const { STORAGE, ROUTES } = require('../../utils/constants');

const PAGE_SIZE = 10;
const MAX_HISTORY = 10;

Page({
  data: {
    /* 查询条件 */
    keyword: '',
    inputValue: '',
    categoryId: '',
    sort: 'default',
    priceAsc: true,

    /* 列表数据 */
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,

    /* 搜索相关 */
    focus: false,
    showHistory: false,
    searchHistory: [],

    sortOptions: [
      { key: 'default', label: '综合' },
      { key: 'sales', label: '销量' },
      { key: 'price', label: '价格' }
    ]
  },

  onLoad(options) {
    const categoryId = options.categoryId || '';
    const keyword = options.keyword || '';
    const sort = options.sort || 'default';

    this.setData({
      categoryId,
      keyword,
      inputValue: keyword,
      sort,
      focus: options.focus === '1',
      searchHistory: wx.getStorageSync(STORAGE.SEARCH_HISTORY) || []
    });

    this.loadList(1);
  },

  onPullDownRefresh() {
    this.loadList(1);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadList(this.data.page + 1);
    }
  },

  /* ----------------------- 数据 ----------------------- */

  loadList(page) {
    const isFirst = page === 1;

    this.setData(isFirst ? { loading: true } : { loadingMore: true });

    const params = {
      page,
      size: PAGE_SIZE,
      sort: this.data.sort
    };
    if (this.data.categoryId) params.categoryId = this.data.categoryId;
    if (this.data.keyword) params.keyword = this.data.keyword;
    if (this.data.sort === 'price') {
      params.sort = this.data.priceAsc ? 'price_asc' : 'price_desc';
    }

    return fetchList(params)
      .then((res) => {
        this.setData({
          list: isFirst ? res.list : this.data.list.concat(res.list),
          page,
          hasMore: res.hasMore,
          loading: false,
          loadingMore: false
        });
      })
      .catch((err) => {
        console.error('[list] 商品列表加载失败', err);
        this.setData({ loading: false, loadingMore: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      })
      .then(() => wx.stopPullDownRefresh());
  },

  /* ----------------------- 搜索 ----------------------- */

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onInputFocus() {
    if (!this.data.inputValue) {
      this.setData({ showHistory: true });
    }
  },

  onSearchConfirm() {
    const keyword = this.data.inputValue.trim();
    this.setData({ keyword, showHistory: false });
    if (keyword) this.saveHistory(keyword);
    this.loadList(1);
  },

  onTapHistory(e) {
    const { word } = e.currentTarget.dataset;
    this.setData({ inputValue: word, keyword: word, showHistory: false });
    this.loadList(1);
  },

  onClearInput() {
    this.setData({ inputValue: '', keyword: '', showHistory: true });
  },

  onCancel() {
    // 从搜索态返回上一页；若已是首屏则清空条件
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      this.setData({ inputValue: '', keyword: '', showHistory: false });
      this.loadList(1);
    }
  },

  saveHistory(keyword) {
    const history = this.data.searchHistory.filter((item) => item !== keyword);
    history.unshift(keyword);
    const limited = history.slice(0, MAX_HISTORY);
    wx.setStorageSync(STORAGE.SEARCH_HISTORY, limited);
    this.setData({ searchHistory: limited });
  },

  onClearHistory() {
    wx.removeStorageSync(STORAGE.SEARCH_HISTORY);
    this.setData({ searchHistory: [] });
  },

  /* ----------------------- 排序 ----------------------- */

  onTapSort(e) {
    const { key } = e.currentTarget.dataset;

    if (key === 'price') {
      // 已在价格排序时，点击切换升降序
      if (this.data.sort === 'price') {
        this.setData({ priceAsc: !this.data.priceAsc });
      } else {
        this.setData({ sort: 'price', priceAsc: true });
      }
    } else {
      if (this.data.sort === key) return;
      this.setData({ sort: key });
    }

    this.loadList(1);
  },

  /* ----------------------- 跳转 ----------------------- */

  onTapGoods(e) {
    const { id } = e.detail;
    wx.navigateTo({ url: `${ROUTES.GOODS_DETAIL}?id=${id}` });
  },

  onResetFilter() {
    this.setData({ keyword: '', inputValue: '', categoryId: '', sort: 'default' });
    this.loadList(1);
  }
});
