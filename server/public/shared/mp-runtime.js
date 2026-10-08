/* =========================================================================
 * 无头小程序运行时（预览页专用）
 *
 * 目标：在浏览器里把**真机的页面 JS** 跑起来拿到 data，交给 mp-wxml 编译真机 WXML、
 *       mp-wxss 套上真机 WXSS —— 三件套都是真机的，预览就不可能与真机走样。
 *
 * 做法：
 *   1. 模块加载器：按小程序规则解析 require 的相对路径，源码从 /mp-src/… 取。
 *      为了能同步 require（CommonJS 语义），先把可达的 .js 全部静态扫描 + 预取。
 *   2. 宿主桩：Page / Component / Behavior / App / getApp / wx.*
 *      - wx.request → 用浏览器的 fetch 真发请求（打的是预览服务自己）
 *      - wx.getStorageSync / setStorageSync → localStorage（前缀隔离）
 *      - 其余 wx.* 一律 no-op，保证页面 JS 不会因为调不到 API 而抛错
 *   3. 数据装配：执行 onLoad(query)，并把 setData 回调里发起的异步请求等干净
 *   4. BASE_URL 改成预览页源站：utils/constants.js 里写死的是 127.0.0.1:3000，
 *      预览页可能从别的 host:port 打开，改掉才能保证图片与接口都打在同一个源上。
 * ========================================================================= */
(function (root) {
  'use strict';

  var SRC_PREFIX = '/mp-src';

  /** 模块缓存：绝对路径 → module */
  var MODULES = {};
  /** 源码缓存：绝对路径 → 源码文本 */
  var SOURCES = {};

  /** 类型：'/js' 源码、'/wxml'、'/wxss'、'/json' */
  function clientUrl(absPath) {
    return SRC_PREFIX + absPath;
  }

  function normalize(p) {
    var parts = String(p).split('/');
    var out = [];
    parts.forEach(function (s) {
      if (!s || s === '.') return;
      if (s === '..') out.pop();
      else out.push(s);
    });
    return '/' + out.join('/');
  }

  function ensureExt(p) {
    return /\.[a-z0-9]+$/i.test(p) ? p : p + '.js';
  }

  /** 解析 require 的目标（只支持相对路径与根路径，本项目没用到 npm 包） */
  function resolveSpec(fromAbs, spec) {
    if (spec.charAt(0) === '/') return ensureExt(spec);
    if (spec.charAt(0) === '.') {
      var dir = fromAbs.slice(0, fromAbs.lastIndexOf('/'));
      return ensureExt(normalize(dir + '/' + spec));
    }
    return null;
  }

  /* ------------------------------ 取源码 ------------------------------ */

  var TEXT_PROMISE = {};

  function fetchText(absPath) {
    if (SOURCES[absPath] !== undefined) return Promise.resolve(SOURCES[absPath]);
    if (!TEXT_PROMISE[absPath]) {
      TEXT_PROMISE[absPath] = fetch(clientUrl(absPath), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (t) { SOURCES[absPath] = t; return t; })
        .catch(function () { SOURCES[absPath] = ''; return ''; });
    }
    return TEXT_PROMISE[absPath];
  }

  /** 源码里出现的 require 目标（静态扫描，够本项目用；不做 AST 分析） */
  function scanRequires(src) {
    var out = [];
    var re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    var m;
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  }

  /**
   * 预取入口模块可达的全部 .js
   *
   * 必须预取的原因：小程序里 require 是同步的，而浏览器取源码是异步的。
   * 先把整棵依赖树拉齐，之后 require 才能同步返回。
   */
  function preload(entryAbs, onProgress) {
    var seen = {};
    var queue = [entryAbs];

    function step() {
      if (!queue.length) return Promise.resolve();
      var cur = queue.shift();
      if (seen[cur]) return step();
      seen[cur] = 1;
      return fetchText(cur).then(function (src) {
        scanRequires(src).forEach(function (spec) {
          var abs = resolveSpec(cur, spec);
          if (abs && !seen[abs] && sources_has(abs)) queue.push(abs);
        });
        if (onProgress) onProgress(cur);
        return step();
      });
    }

    // 只跟随已知存在的路径：utils / config / services / mock / pages / components 下的文件
    function sources_has(abs) {
      return /^\/(pages|utils|config|services|mock|components|packageGoods|packageOrder|packageNews|packageUser)\//.test(abs);
    }

    return step();
  }

  /**
   * 预取页面 WXML 及其 include 链
   *
   * `<include src="../../templates/blocks.wxml" />` 是首页与自定义页共用区块模板的机制，
   * 渲染时必须**同步**拿到被包含文件的内容，所以先按 include 链把它拉齐。
   */
  function preloadWxml(absPath, seen) {
    seen = seen || {};
    if (seen[absPath]) return Promise.resolve();
    seen[absPath] = 1;
    return fetchText(absPath).then(function (t) {
      if (!t) return undefined;
      var specs = [];
      var re = /<(?:include|import)\s+src=["']([^"']+)["']/g;
      var m;
      while ((m = re.exec(t))) specs.push(m[1]);
      return specs.reduce(function (p, s) {
        var target = resolveSpec(absPath, s);
        if (!target || seen[target]) return p;
        return p.then(function () { return preloadWxml(target, seen); });
      }, Promise.resolve());
    });
  }

  /* ------------------------------ 类型捕获槽 ------------------------------ */

  /**
   * 模块执行期间 `Page()` / `Component()` / `App()` 把配置写到这里，
   * 模块执行结束立刻转存到 `module.__mpCapture`（见 runModule 里的说明：
   * 模块有缓存，第二次渲染不会再执行 factory，只有挂在 module 上才拿得到）。
   */
  var CAPTURE = null;

  /* ------------------------------ wx 桩 ------------------------------ */

  var STORE_PREFIX = 'mp-preview:';

  /** 待完成的异步任务数：用来判断「数据装配完了没」 */
  var PENDING = 0;

  function track(p) {
    PENDING += 1;
    var done = function () { PENDING -= 1; };
    p.then(done, done);
    return p;
  }

  function makeWx() {
    var api = {
      request: function (opt) {
        if (!opt || !opt.url) return;
        var url = String(opt.url);
        // 统一打到预览页所在的源上（constants.js 里写死的是 127.0.0.1:3000）
        var path = url.replace(/^https?:\/\/[^/]+/, '');
        var method = (opt.method || 'GET').toUpperCase();
        track(fetch(path, {
          method: method,
          headers: opt.header || {},
          body: method === 'GET' ? undefined : (typeof opt.data === 'string' ? opt.data : JSON.stringify(opt.data || {}))
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (opt.success) opt.success({ statusCode: r.status, data: data });
            return data;
          });
        }).catch(function (e) {
          if (opt.fail) opt.fail({ errMsg: String(e && e.message) });
        }).then(function () {
          if (opt.complete) opt.complete({});
        }));
      },
      getStorageSync: function (k) {
        var v = localStorage.getItem(STORE_PREFIX + k);
        if (v === null) return '';
        try { return JSON.parse(v); } catch (e) { return v; }
      },
      setStorageSync: function (k, v) {
        localStorage.setItem(STORE_PREFIX + k, JSON.stringify(v));
      },
      removeStorageSync: function (k) { localStorage.removeItem(STORE_PREFIX + k); },
      setNavigationBarTitle: function () {},
      setNavigationBarColor: function () {},
      showToast: function () {},
      hideToast: function () {},
      showLoading: function () {},
      hideLoading: function () {},
      previewImage: function () {},
      navigateTo: function () {},
      switchTab: function () {},
      redirectTo: function () {},
      navigateBack: function () {},
      stopPullDownRefresh: function () {},
      login: function (o) { if (o && o.fail) o.fail({ errMsg: 'preview: wx.login 不可用' }); },
      createInnerAudioContext: function () {
        return {
          src: '', autoplay: false, loop: false,
          play: function () {}, pause: function () {}, stop: function () {},
          destroy: function () {}, seek: function () {},
          onPlay: function () {}, onError: function () {}, onCanplay: function () {}, onEnded: function () {}
        };
      },
      getSystemInfoSync: function () {
        return { windowWidth: 375, windowHeight: 718, pixelRatio: 2, platform: 'devtools' };
      }
    };
    // 其余 wx.* 一律返回 no-op，避免页面 JS 因为调不到 API 直接抛错
    return new Proxy(api, {
      get: function (t, k) {
        if (k in t) return t[k];
        return function () {};
      }
    });
  }

  /* ------------------------------ 模块加载 ------------------------------ */

  var wxStub = makeWx();
  var appStub = { globalData: {} };

  /**
   * 执行一个模块（源码已在 SOURCES 里）
   *
   * ⚠️ 捕获结果必须**挂在 module 上**，不能只放在全局捕获槽里：
   *   模块有缓存，第二次渲染时 factory 不会再跑一遍，`Page()` 也就不会被再次调用。
   *   早先只依赖全局槽，结果「换个页面再切回来」就报「没有注册 Page()」。
   */
  function runModule(absPath) {
    if (MODULES[absPath]) return MODULES[absPath];
    var mod = { exports: {} };
    MODULES[absPath] = mod;

    var src = SOURCES[absPath] || '';
    var localRequire = function (spec) {
      var abs = resolveSpec(absPath, spec);
      if (!abs) throw new Error('预览运行时不支持加载 npm 包：' + spec);
      if (!MODULES[abs]) {
        if (SOURCES[abs] === undefined) throw new Error('模块未预取：' + abs);
        runModule(abs);
      }
      return MODULES[abs].exports;
    };

    var factory = new Function(
      'module', 'exports', 'require', 'wx', 'getApp', 'App', 'Page', 'Component', 'Behavior', 'getCurrentPages',
      src + '\n//# sourceURL=' + clientUrl(absPath)
    );
    CAPTURE = null;
    factory(
      mod, mod.exports, localRequire, wxStub, function () { return appStub; },
      function (c) { CAPTURE = { kind: 'app', config: c || {} }; },
      function (c) { CAPTURE = { kind: 'page', config: c || {} }; },
      function (c) { CAPTURE = { kind: 'component', config: c || {} }; },
      function (c) { return c || {}; },
      function () { return []; }
    );
    if (CAPTURE) {
      mod.__mpCapture = CAPTURE;
      CAPTURE = null;
    }

    /* 关键：把接口基址指向预览页源站。
       真机联调时 constants.js 写的是 127.0.0.1:3000，预览页若从别的 host 打开，
       不改的话图片与接口都会打错地方（表现为图片全裂、商品区块空白）。 */
    if (absPath === '/utils/constants.js') {
      mod.exports.BASE_URL = location.origin;
    }
    return mod;
  }

  /* ------------------------------ 页面实例 ------------------------------ */

  function setByPath(obj, path, value) {
    var keys = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(function (s) { return s !== ''; });
    var t = obj;
    for (var i = 0; i < keys.length - 1; i += 1) {
      var k = keys[i];
      if (t[k] == null) t[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      t = t[k];
    }
    t[keys[keys.length - 1]] = value;
  }

  function clone(v) {
    try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (e) { return v; }
  }

  /**
   * 等「数据装配」稳定
   *
   * onLoad 里常见写法是 setData(..., () => this.loadGoodsBlocks())，商品数据要走网络；
   * 只有等在途请求清零才算装配完成，否则预览会缺商品区块。
   */
  function settle(maxMs) {
    var deadline = Date.now() + (maxMs || 6000);
    return new Promise(function (resolve) {
      (function poll() {
        if (PENDING <= 0 || Date.now() > deadline) return resolve();
        setTimeout(poll, 60);
      })();
    });
  }

  function createInstance(config, query) {
    var inst = Object.assign({}, config);
    inst.data = clone(config.data || {}) || {};
    inst.setData = function (obj, cb) {
      if (!obj) { if (cb) cb(); return; }
      Object.keys(obj).forEach(function (k) {
        if (/[.\[]/.test(k)) setByPath(inst.data, k, obj[k]);
        else inst.data[k] = obj[k];
      });
      if (cb) { try { cb(); } catch (e) { console.warn('[mp-runtime] setData 回调异常', e); } }
    };
    inst.selectComponent = function () { return null; };
    inst.selectAllComponents = function () { return []; };
    inst.triggerEvent = function () {};
    inst.route = query && query.__route__ ? query.__route__ : '';
    return inst;
  }

  /**
   * 渲染一个真实页面
   * @param {string} pagePath  形如 '/pages/product/product'
   * @param {object} query     页面参数（自定义页用 { key }）
   * @returns {Promise<{html, css, data, logs, error}>}
   */
  function renderPage(pagePath, query, renderOpts) {
    var abs = ensureExt(pagePath);
    var logs = [];

    return preload(abs).then(function () {
      return preloadWxml(abs.replace(/\.js$/, '.wxml'));
    }).then(function () {
      if (!SOURCES[abs]) throw new Error('页面源码不存在：' + abs);
      var mod = runModule(abs);
      var captured = mod.__mpCapture;
      var config = (captured && captured.kind === 'page') ? captured.config : mod.exports;
      if (!config || !config.data) throw new Error('页面 ' + abs + ' 没有注册 Page()');

      var inst = createInstance(config, query);
      if (typeof inst.onLoad === 'function') inst.onLoad(query || {});

      return settle().then(function () {
        return buildHtml(abs, inst.data, query, renderOpts, logs);
      });
    });
  }

  /** 页面 json（usingComponents） */
  function loadPageJson(abs) {
    var jsonPath = abs.replace(/\.js$/, '.json');
    return fetchText(jsonPath).then(function (t) {
      if (!t) return {};
      try { return JSON.parse(t); } catch (e) { return {}; }
    });
  }

  /** 自定义组件：模板 + 样式 + 属性默认值 */
  function loadComponent(name) {
    var base = '/components/' + name + '/' + name;
    return Promise.all([fetchText(base + '.wxml'), fetchText(base + '.js'), fetchText(base + '.wxss')])
      .then(function (r) {
        var props = {};
        if (r[1]) {
          var saved = CAPTURE;
          try {
            var mod = { exports: {} };
            new Function('module', 'exports', 'require', 'wx', 'Component', 'Behavior', 'getApp',
              r[1] + '\n//# sourceURL=' + clientUrl(base + '.js')
            )(mod, mod.exports, function () { return {}; }, wxStub,
              function (c) { CAPTURE = { kind: 'component', config: c || {} }; },
              function (c) { return c || {}; }, function () { return appStub; });
            var cfg = (CAPTURE && CAPTURE.kind === 'component') ? CAPTURE.config : {};
            CAPTURE = saved;
            var p = cfg.properties || {};
            Object.keys(p).forEach(function (k) {
              props[k] = (p[k] && typeof p[k] === 'object' && 'value' in p[k]) ? p[k].value : p[k];
            });
          } catch (e) {
            console.warn('[mp-runtime] 组件 JS 解析失败：' + name, e);
          }
        }
        return { name: name, nodes: root.MpWxml.parse(r[0] || ''), props: props, wxss: r[2] || '' };
      });
  }

  /** 把 WXML 里的 include 目标变成节点数组 */
  function makeIncludeResolver(fromAbs, cache) {
    return function (src) {
      if (!src) return null;
      var abs = resolveSpec(fromAbs, src);
      if (!abs) return null;
      if (cache[abs] === undefined) {
        // 预取阶段已经拉过（include 的目标不一定是 .js，单独再抓一次）
        var txt = SOURCES[abs];
        if (txt === undefined) {
          // 同步取不到就退化为注释，下次渲染时已被 fetchText 填上
          fetchText(abs);
          cache[abs] = null;
          return null;
        }
        cache[abs] = root.MpWxml.parse(txt);
      }
      return cache[abs];
    };
  }

  /** 组装 HTML */
  function buildHtml(abs, data, query, renderOpts, logs) {
    var wxmlPath = abs.replace(/\.js$/, '.wxml');
    var wxssPath = abs.replace(/\.js$/, '.wxss');
    var includeCache = {};

    return Promise.all([fetchText(wxmlPath), loadPageJson(abs)]).then(function (r) {
      var wxml = r[0];
      var pageJson = r[1] || {};
      if (!wxml) throw new Error('页面模板不存在：' + wxmlPath);

      var using = pageJson.usingComponents || {};
      var names = Object.keys(using);
      return Promise.all(names.map(function (n) {
        // 组件路径形如 /components/empty-state/empty-state
        return loadComponent(n).then(function (c) { return [n, c]; });
      })).then(function (pairs) {
        var components = {};
        var compCss = [];
        pairs.forEach(function (p) { components[p[0]] = p[1]; if (p[1].wxss) compCss.push(p[1].wxss); });

        var opts = {
          components: components,
          include: makeIncludeResolver(abs, includeCache),
          swiperIndex: (renderOpts && renderOpts.swiperIndex) || 0
        };
        var html = root.MpWxml.render(root.MpWxml.parse(wxml), root.MpWxml.makeScope(data), opts);

        return loadWxss(abs, compCss).then(function (css) {
          return { html: html, css: css, data: data, logs: logs };
        });
      });
    });
  }

  /** 收集并编译页面样式：app.wxss（含 @import）→ 页面 wxss → 组件 wxss */
  function loadWxss(abs, extraCss) {
    var pageWxss = abs.replace(/\.js$/, '.wxss');
    var queue = ['/app.wxss', pageWxss];
    var seen = {};
    var chunks = [];

    function step() {
      if (!queue.length) return Promise.resolve(chunks);
      var p = queue.shift();
      if (seen[p]) return step();
      seen[p] = 1;
      return fetchText(p).then(function (t) {
        if (!t) return step();
        root.MpWxss.parseImports(t).forEach(function (imp) {
          var target = imp.charAt(0) === '/' ? imp : normalize(p.slice(0, p.lastIndexOf('/')) + '/' + imp);
          if (!seen[target]) queue.push(target);
        });
        chunks.push(root.MpWxss.stripImports(t));
        return step();
      });
    }

    return step().then(function (all) {
      if (extraCss) extraCss.forEach(function (c) { all.push(c); });
      return root.MpWxss.compile(all.join('\n'), '.mp-root') + '\n' + root.MpWxss.runtimeCss('.mp-root');
    });
  }

  /**
   * 读一个模块的导出。
   * 预览页要拿 replica.TABBAR 渲染底部导航，走的就是这里 ——
   * 与 renderPage 共用同一套源码缓存与依赖预取，不另起一套加载逻辑。
   */
  function loadModule(absPath) {
    var abs = normalize(ensureExt(absPath));
    return preload(abs).then(function () {
      return runModule(abs).exports;
    });
  }

  root.MpRuntime = {
    fetchText: fetchText,
    preload: preload,
    renderPage: renderPage,
    loadModule: loadModule,
    loadComponent: loadComponent,
    normalize: normalize,
    clearCache: function () { MODULES = {}; SOURCES = {}; TEXT_PROMISE = {}; }
  };
})(typeof window !== 'undefined' ? window : this);
