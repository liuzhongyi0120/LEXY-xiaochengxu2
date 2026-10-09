/**
 * 店铺装修后台路由
 *
 *   GET  /api/decorate/pages              页面列表（对标有赞「店铺页面」列表）
 *   GET  /api/decorate/page               单页面详情：schema + 已发布数据 + 草稿 + 版本
 *   POST /api/decorate/draft              保存草稿
 *   POST /api/decorate/discard            丢弃草稿（还原为已发布）
 *   GET  /api/decorate/diff               草稿 vs 已发布的变更清单
 *   POST /api/decorate/publish            发布（写回 miniprogram/config/replica.js）
 *   POST /api/decorate/rollback           回滚到历史版本
 *   GET  /api/decorate/stats              装修数据统计
 *   GET  /api/decorate/link-options       可选跳转目标清单（页面 / 商品 / 资讯栏目）
 *
 *   ── 自定义页面（对标有赞「新建页面」，数据写入 replica.CUSTOM_PAGES）──
 *   GET  /api/decorate/templates          新建模板清单 + 配额
 *   GET  /api/decorate/page/refs          站内引用清单（哪些页面的哪个字段跳到了这个自定义页）
 *   POST /api/decorate/page/create        新建自定义页面
 *   POST /api/decorate/page/rename        改名称 / 备注 / 页面标识（改标识会登记旧标识别名）
 *   POST /api/decorate/page/delete        删除自定义页面（被引用时须 force 才删）
 *
 * 说明：装修后台属于运营管理功能，**全部要求管理员身份与角色**：
 *   - 由 `server/index.js` 统一拦截（见 lib/adminAuth.js），这里不再逐个标注；
 *   - 读操作 viewer 即可；存草稿 / 改数据 operator；发布、回滚、新建/改名/删除页面属高危，须 owner。
 *   - 页面开关另由 ADMIN_PAGE 控制（关掉时这些点位一律 403）。
 */

const decorate = require('../decorate/store');
const schema = require('../decorate/schema');
const catalogStore = require('../lib/catalogStore');
const { diff } = require('../decorate/diff');
const { BizError, ERR } = require('../lib/http');

function needKey(p) {
  if (!p.key) throw new BizError('缺少页面标识 key', ERR.PARAM);
  return p.key;
}

module.exports = [
  {
    method: 'GET',
    path: '/api/decorate/pages',
    auth: false,
    desc: '装修页面列表（页面名称/归属/状态/区块数/草稿/更新时间）+ 自定义页配额 + 新建模板 + 组件库清单',
    async handler() {
      return {
        list: decorate.listPages(),
        stats: decorate.stats(),
        custom: decorate.customStats(),
        templates: decorate.templates(),
        lib: schema.componentLib()
      };
    }
  },

  {
    method: 'GET',
    path: '/api/decorate/lib',
    auth: false,
    desc: '组件库清单（常用/基础/高级三组，含已接入标记与内联 SVG 图标）',
    async handler() {
      return schema.componentLib();
    }
  },

  {
    method: 'GET',
    path: '/api/decorate/page',
    auth: false,
    desc: '单页面装修数据（含字段 schema、已发布数据、草稿、版本历史）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      const page = decorate.getPage(key);
      if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
      return page;
    }
  },

  /* ---------------- 自定义页面（装修台「新建页面」） ---------------- */

  {
    method: 'GET',
    path: '/api/decorate/templates',
    auth: false,
    desc: '新建页面可选的模板清单 + 自定义页配额（已用 / 上限）',
    async handler() {
      return { list: decorate.templates(), custom: decorate.customStats() };
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/page/create',
    auth: false,
    desc: '新建自定义页面。只建后台条目（先不写 replica.js），装修完点「生成代码」才下发到小程序',
    async handler(ctx) {
      /*
       * ⚠️ 这里刻意**不兜 try/catch 把异常统一转成业务失败**。
       *    store / customPages 现在自己抛 BizError（参数类 1001、配额与重名类 2000、找不到 404），
       *    再兜一层会把三类东西一起压成同一个码：
       *      · 真正的服务端异常（生成 replica.js 失败、回读校验失败）→ 被伪装成「运营填错了」；
       *      · 精确的业务码与提示 → 被覆盖成笼统的 1001；
       *      · 自检的失败用例 → 拿到非零码就算「预期拦截成功」，等于把 bug 洗白。
       */
      return decorate.createCustomPage({
        name: ctx.params.name,
        key: ctx.params.key,
        note: ctx.params.note,
        template: ctx.params.template
      });
    }
  },

  {
    method: 'GET',
    path: '/api/decorate/page/refs',
    auth: false,
    desc: '站内引用清单：哪些页面 / 底部导航的哪个字段跳到了这个自定义页（改名与删除前先看它）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      const page = schema.get(key);
      if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
      if (!page.custom) {
        // 内置页的地址是 app.json 里编译期固定的，不存在「被自定义地址引用」的问题
        return { key: key, name: page.name, custom: false, refs: [], count: 0 };
      }
      const refs = decorate.referencesOf(key);
      return { key: key, name: page.name, custom: true, refs: refs, count: refs.length };
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/page/rename',
    auth: false,
    desc: '改自定义页面的名称 / 备注 / 页面标识；改标识会迁移草稿、版本快照与 replica 键名，并保留旧标识别名',
    async handler(ctx) {
      const key = needKey(ctx.params);
      // 同 page/create：不兜 catch，让 store 抛出的 BizError（含 5000 的服务端异常）如实上报
      return decorate.updateCustomPage(key, {
        name: ctx.params.name,
        note: ctx.params.note,
        key: ctx.params.newKey
      });
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/page/delete',
    auth: false,
    desc: '删除自定义页面：连带清理草稿与版本记录并重新生成 replica.js；被站内引用时须 force=1（内置页不可删）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      // 业务失败（内置页不可删 / 被引用需 force / 页面不存在）已由 store 抛成 BizError，
      // 这里**不能再兜一个 try/catch 全量转成业务失败** ——
      // 编译 replica.js 失败、回读校验失败这类真·服务端异常会被一起吞成 HTTP 200，
      // 既丢掉了「已自动回滚」的真实原因，也让自检的失败被当成「预期拦截」。
      return decorate.removeCustomPage(key, { force: ctx.params.force });
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/draft',
    auth: false,
    desc: '保存草稿（不影响线上，发布后才生效）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      if (!ctx.params.data || typeof ctx.params.data !== 'object') {
        throw new BizError('缺少页面数据 data', ERR.PARAM);
      }
      // 同 page/create：不兜 catch（「数据校验未通过」已是 1001，其余异常必须如实上报）
      return decorate.saveDraft(key, ctx.params.data);
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/discard',
    auth: false,
    desc: '丢弃草稿，恢复为已发布数据',
    async handler(ctx) {
      return decorate.discardDraft(needKey(ctx.params));
    }
  },

  {
    method: 'GET',
    path: '/api/decorate/diff',
    auth: false,
    desc: '查看草稿相对已发布数据的变更清单',
    async handler(ctx) {
      const key = needKey(ctx.params);
      const page = decorate.getPage(key);
      if (!page) throw new BizError('页面不存在：' + key, ERR.NOT_FOUND, 404);
      if (!page.hasDraft) return { hasDraft: false, list: [], total: 0, note: '当前没有草稿，页面与线上一致' };
      const d = diff(page.published, page.data);
      return Object.assign({ hasDraft: true }, d);
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/publish',
    auth: false,
    // ⚠️ 名称按实际行为写：它只是「生成代码」，不是「上线」。详见 README「先看清发布到底发布了什么」。
    desc: '生成代码：写回 miniprogram/config/replica.js（生成前自动备份 + 语法与回读双重校验）。不等于线上生效，仍需上传并发布小程序新版本',
    async handler(ctx) {
      const key = needKey(ctx.params);
      // 「没有草稿」是 2000，「数据校验未通过」是 1001；
      // 生成/回读 replica.js 失败是真正的服务端异常（5000），不能被压成业务失败 ——
      // 运营看到「服务开小差」才知道该找技术，而不是反复重试。
      return decorate.publish(key, ctx.params.note);
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/rollback',
    auth: false,
    desc: '回滚到历史版本（默认仅恢复为草稿，mode=publish 时直接发布）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      if (!ctx.params.versionId) throw new BizError('缺少版本号 versionId', ERR.PARAM);
      // 版本不存在是 404（store 里已是 BizError），不要在这里降级成 2000；
      // 也绝不把回滚过程中的服务端异常转成「业务失败」。
      return decorate.rollback(key, ctx.params.versionId, ctx.params.mode);
    }
  },

  {
    method: 'GET',
    path: '/api/decorate/stats',
    auth: false,
    desc: '装修数据统计（草稿数、版本数、数据文件体积、目标文件路径）',
    async handler() {
      return decorate.stats();
    }
  },

  {
    method: 'GET',
    path: '/api/decorate/link-options',
    auth: false,
    desc: '可选跳转目标清单：小程序页面（内置 + 自定义）/ 商品（后端商品库）/ 资讯栏目（replica.NEWS）',
    async handler() {
      return schema.linkOptions(decorate.readReplica(), catalogStore);
    }
  }
];
