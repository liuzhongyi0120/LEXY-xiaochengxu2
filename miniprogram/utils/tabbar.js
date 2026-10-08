/**
 * 自定义 tabBar 的选中态同步
 *
 * 背景：app.json 开了 tabBar.custom 后，底部导航由 custom-tab-bar 组件渲染，
 * 而该组件的实例是**每个 tab 页各一份** —— 切页时微信不会帮你改高亮。
 * 每个 tab 页都必须在 onShow 里主动通知一次。
 *
 * 这件事必须收敛成一个函数，不能各页面手写：
 * 漏掉任何一个页面，就会出现「切过去了还高亮着上一个」，
 * 而且这种 bug 只在切到那个特定页面时才复现，很容易漏测。
 *
 * 用法：
 *   const { syncTabBar } = require('../../utils/tabbar');
 *   Page({ onShow() { syncTabBar(this); } })
 */

/**
 * 把当前页面的高亮同步给自定义 tabBar。
 * @param {object} page 页面实例（传 this）
 */
function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return;

  let bar = null;
  try {
    bar = page.getTabBar();
  } catch (e) {
    return;
  }
  if (!bar || typeof bar.setActive !== 'function') return;

  // page.route 不带开头的斜杠（pages/index/index），配置里存的是 /pages/index/index
  const route = page.route || page.__route__ || '';
  if (!route) return;
  bar.setActive('/' + route);
}

module.exports = { syncTabBar };
