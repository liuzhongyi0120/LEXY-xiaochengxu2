/**
 * 自绘导航栏（页面级「风格选择：标准 / 沉浸式」用）
 *
 * 存在的原因：微信没有「按数据决定这一页要不要标题栏」的接口。
 * `navigationStyle: custom` 只能写在页面 .json 里（编译期固定），
 * 一写上原生标题栏就整页消失 —— 所以标准模式那条白底黑字的标题栏也得自己画回来。
 *
 * 两条模式的差别（对标有赞装修后台「风格设置」）：
 *   标准   —— 常驻显示（白底黑字），页面内容从它下方开始（由页面给 .page 加 padding-top）
 *   沉浸式 —— 透明且不可见，内容从屏幕最顶端铺满；上划过阈值后浮现（页面把 solid 置 true）
 *
 * ⚠️ 本组件在 /preview 里**不展开**：预览的手机壳已经有 .phone-bar（状态栏 + 标题 + 胶囊），
 *    由 chrome 层按同样的 mode 切换呈现（见 mp-runtime 的 CHROME_RENDERED 与 preview.js），
 *    再展开一次就是两条标题栏。
 */
const { navMetrics } = require('../../utils/navbar');

Component({
  properties: {
    title: { type: String, value: '' },
    /** standard | immersive */
    mode: { type: String, value: 'standard' },
    /** 标题栏底色（标准默认白 —— 与原生导航栏一致） */
    bg: { type: String, value: '#FFFFFF' },
    color: { type: String, value: '#000000' },
    showBack: { type: Boolean, value: false },
    /** 沉浸式下是否已「上划浮现」 */
    solid: { type: Boolean, value: false }
  },

  data: {
    /* 尺寸必须实测：状态栏高与胶囊位置各机型都不同（见 utils/navbar.js） */
    m: null,
    /*
     * 是否沉浸式。**刻意算在 JS 里、不在模板里比字符串**：
     * 模板若写 `class="{{mode === 'immersive' ? ' nb-immersive' : ''}}"`，
     * 自检的 class 作用域核对会把比较用的 `'immersive'` 也当成一个类名，报「未定义」——
     * 它分不出「类名字面量」和「拿来比较的字面量」（见 nav-bar.wxml 顶部注释）。
     * 属性监听器在初始赋值时也会跑一次，所以首帧就是对的。
     */
    immersive: false
  },

  observers: {
    mode(mode) {
      const immersive = String(mode) === 'immersive';
      if (immersive !== this.data.immersive) this.setData({ immersive });
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        m: navMetrics(),
        immersive: String(this.data.mode) === 'immersive'
      });
    }
  },

  methods: {
    /** 返回上一页；已是栈底（tab 页）则回首页，避免点了没反应 */
    onBack() {
      try {
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({ url: '/pages/index/index' });
        }
      } catch (err) {
        wx.switchTab({ url: '/pages/index/index' });
      }
    }
  }
});
