/**
 * 跳转链接 · 统一落地实现
 *
 * 装修后台里每个图片 / 元素配的「跳转链接」存的是一个字符串，本文件是它**唯一**的消费方。
 * 收敛成一份的理由：tabBar 页面必须用 `wx.switchTab`，用 `navigateTo` 会直接失败；
 * 如果各页面各写一套 navigateTo，点首页 tab 上的入口就会静默无反应。
 *
 * 支持的形态（与装修台「选择链接」弹层的四个 tab 一一对应）：
 *   /pages/index/index                    内置 tab 页   → switchTab
 *   /packageGoods/detail/detail?id=g1001  商品详情      → navigateTo
 *   /packageNews/detail/detail?key=about  资讯内容页    → navigateTo
 *   /pages/custom/index?key=xxx           自定义页      → navigateTo
 *   https://…                             网页链接      → 小程序内打不开，复制到剪贴板
 *   tel:400-828-2233                      电话          → 调起系统拨号
 *
 * ⚠️ TAB_PAGES 必须与 app.json 的 tabBar.list 完全一致（自检 check-all 有断言盯着）。
 */

const TAB_PAGES = [
  '/pages/index/index',
  '/pages/lexy/lexy',
  '/pages/news/news',
  '/pages/product/product',
  '/pages/mine/mine'
];

/** 取出路径部分（去掉 ?query 与 hash），并补齐前导斜杠 */
function pathOf(url) {
  const s = String(url === undefined || url === null ? '' : url).trim();
  if (!s) return '';
  const p = s.split('?')[0].split('#')[0];
  return p.charAt(0) === '/' ? p : '/' + p;
}

/** 是不是底部导航页（tabBar 页面只能 switchTab 打开，且不能再带参数） */
function isTab(url) {
  return TAB_PAGES.indexOf(pathOf(url)) >= 0;
}

/**
 * 打开装修里配置的跳转链接。
 *
 * @param {string} link 装修数据里的 link 字段
 * @param {object} [opt] { failText } 跳转失败时的提示文案
 * @returns {boolean} 是否发生了跳转动作（空链接返回 false，方便调用方决定要不要做兜底）
 */
function openLink(link, opt) {
  const o = opt || {};
  const s = String(link === undefined || link === null ? '' : link).trim();
  if (!s) return false;

  // 网页链接：小程序内无法直接打开，复制给用户（与装修台弹层里的提示一致）
  if (/^https?:\/\//i.test(s)) {
    wx.setClipboardData({
      data: s,
      success: () => wx.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' })
    });
    return true;
  }

  if (s.indexOf('tel:') === 0) {
    const phoneNumber = s.slice(4).trim();
    if (!phoneNumber) return false;
    wx.makePhoneCall({ phoneNumber, fail: () => { /* 用户取消拨号，静默 */ } });
    return true;
  }

  const url = s.charAt(0) === '/' ? s : '/' + s;
  const fail = () => wx.showToast({ title: o.failText || '页面暂未开放', icon: 'none' });

  if (isTab(url)) wx.switchTab({ url: pathOf(url), fail });
  else wx.navigateTo({ url, fail });
  return true;
}

module.exports = { openLink, isTab, pathOf, TAB_PAGES };
