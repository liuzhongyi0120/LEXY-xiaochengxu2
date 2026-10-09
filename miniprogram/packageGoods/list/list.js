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
    /** 接口返回的筛选结果总数（不是已加载条数 —— 分页时两者不同） */
    total: 0,
    /** 首页加载失败：与「筛选后确实没有商品」区分开，否则断网会显示成「没有找到相关商品」 */
    loadFailed: false,
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

    /*
     * 排序：链接可能直接带 price_asc / price_desc（例如产品页「按价格从低到高」入口）。
     * 必须把它翻译成「价格按钮 + 升降序箭头」的内部状态，否则会出现
     * 「列表确实按价格排了，按钮却显示综合、箭头还是双向」的自相矛盾界面。
     */
    let sort = options.sort || 'default';
    let priceAsc = true;
    if (sort === 'price_asc') { sort = 'price'; priceAsc = true; }
    else if (sort === 'price_desc') { sort = 'price'; priceAsc = false; }
    else if (['default', 'sales', 'price'].indexOf(sort) < 0) sort = 'default';

    this.setData({
      categoryId,
      keyword,
      inputValue: keyword,
      sort,
      priceAsc,
      focus: options.focus === '1',
      searchHistory: wx.getStorageSync(STORAGE.SEARCH_HISTORY) || []
    });

    this.loadList(1);
  },

  onPullDownRefresh() {
    this.loadList(1);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.loadList(this.data.page + 1);
    }
  },

  /* ----------------------- 数据 ----------------------- */

  /**
   * 加载列表。
   *
   * 请求版本（this._seq）：搜索词 / 分类 / 排序一变就开一个新版本，
   * 响应回来时版本对不上就直接丢弃。没有这层保护时，慢网下「先搜 old、再搜 new」
   * 如果 old 后返回，用户看到的就是「搜索框写着 new、列表却是 old」——
   * 而 fast 网络下永远复现不出来。
   *
   * 分页请求沿用当前版本号，因此条件变更后仍在飞的旧「下一页」也会被丢弃，
   * 不会把上一个筛选条件的结果追加进新列表。
   */
  loadList(page) {
    const isFirst = page === 1;
    if (isFirst) this._seq = (this._seq || 0) + 1;
    const seq = this._seq || 1;

    this.setData(isFirst ? { loading: true, loadingMore: false } : { loadingMore: true });

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
        if (seq !== this._seq) return; // 过期响应：条件已变，整份丢弃
        this.setData({
          list: isFirst ? res.list : this.data.list.concat(res.list),
          page,
          total: Number(res.total) || 0,
          hasMore: res.hasMore,
          loadFailed: false,
          loading: false,
          loadingMore: false
        });
      })
      .catch((err) => {
        if (seq !== this._seq) return;
        console.error('[list] 商品列表加载失败', err);
        // 首屏失败要给出可点击的重试入口；翻页失败只提示，已有内容保持不动
        this.setData(isFirst
          ? { loading: false, loadingMore: false, loadFailed: true, list: [], total: 0 }
          : { loading: false, loadingMore: false });
        if (!isFirst) wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      })
      .then(() => wx.stopPullDownRefresh());
  },

  /** 首屏加载失败后原地重试（不需要退出小程序） */
  onRetryLoad() {
    this.loadList(1);
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
    this.setData({ keyword: '', inputValue: '', categoryId: '', sort: 'default', loadFailed: false, total: 0 });
    this.loadList(1);
  }
});
