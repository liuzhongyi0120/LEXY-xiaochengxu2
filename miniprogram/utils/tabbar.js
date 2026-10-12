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
 *   // tab 页（微信自动挂 tabBar）
 *   Page({ onShow() { syncTabBar(this); } })
 *   // 自定义页（导航是页面自己手动挂的，必须传完整路径）
 *   Page({ onShow() { syncTabBar(this, '/pages/custom/index?key=' + this.data.key); } })
 */

/**
 * 把当前页面的高亮同步给自定义 tabBar。
 *
 * 两条取组件实例的路，按页面类型自动选：
 *   · tab 页（首页 / 莱克 / 资讯 / 产品 / 我的）—— 微信自动挂载，用 page.getTabBar()
 *   · 自定义页 —— 它不在 tabBar.list 里，微信不会给它挂 tabBar，
 *     导航是页面自己在 wxml 里手动挂的（id="tabbar"），只能用 selectComponent 取。
 *
 * @param {object} page 页面实例（传 this）
 * @param {string} [path] 要高亮的导航项路径。自定义页必须传完整路径
 *                        （/pages/custom/index?key=xxx）—— 用 route 只会得到
 *                        /pages/custom/index，匹配不上任何一项，底部就全不高亮。
 */
function syncTabBar(page, path) {
  if (!page) return;

  const target = path || ('/' + (page.route || page.__route__ || ''));
  if (target === '/') return;

  let bar = null;
  if (typeof page.getTabBar === 'function') {
    try {
      bar = page.getTabBar();
    } catch (e) {
      bar = null;
    }
  }
  if (!bar && typeof page.selectComponent === 'function') {
    bar = page.selectComponent('#tabbar');
  }
  if (!bar || typeof bar.setActive !== 'function') return;

  bar.setActive(target);
}

module.exports = { syncTabBar };
