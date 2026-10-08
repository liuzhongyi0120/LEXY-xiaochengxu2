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
 *
 *   ── 自定义页面（对标有赞「新建页面」，数据写入 replica.CUSTOM_PAGES）──
 *   GET  /api/decorate/templates          新建模板清单 + 配额
 *   POST /api/decorate/page/create        新建自定义页面
 *   POST /api/decorate/page/rename        改名称 / 备注 / 页面标识
 *   POST /api/decorate/page/delete        删除自定义页面
 *
 * 说明：装修后台属于运营管理功能。本项目当前无管理端账号体系，
 * 故这些点位未开启 JWT 鉴权；正式环境请在网关层加访问控制（见 README「上线前必做」）。
 */

const decorate = require('../decorate/store');
const schema = require('../decorate/schema');
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
    desc: '新建自定义页面。只建后台条目（先不写 replica.js），装修完点「发布」才下发到小程序',
    async handler(ctx) {
      try {
        return decorate.createCustomPage({
          name: ctx.params.name,
          key: ctx.params.key,
          note: ctx.params.note,
          template: ctx.params.template
        });
      } catch (e) {
        throw new BizError(e.message, ERR.PARAM);
      }
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/page/rename',
    auth: false,
    desc: '改自定义页面的名称 / 备注 / 页面标识；改标识会连带迁移草稿、版本快照与 replica 里的键名',
    async handler(ctx) {
      const key = needKey(ctx.params);
      try {
        return decorate.updateCustomPage(key, {
          name: ctx.params.name,
          note: ctx.params.note,
          key: ctx.params.newKey
        });
      } catch (e) {
        throw new BizError(e.message, ERR.PARAM);
      }
    }
  },

  {
    method: 'POST',
    path: '/api/decorate/page/delete',
    auth: false,
    desc: '删除自定义页面：连带清理草稿与版本记录，并重新生成 replica.js 去掉该页（内置页不可删）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      try {
        return decorate.removeCustomPage(key);
      } catch (e) {
        throw new BizError(e.message, ERR.BIZ);
      }
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
      try {
        return decorate.saveDraft(key, ctx.params.data);
      } catch (e) {
        throw new BizError(e.message, ERR.PARAM);
      }
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
    desc: '发布：写回 miniprogram/config/replica.js（发布前自动备份 + 语法与回读双重校验）',
    async handler(ctx) {
      const key = needKey(ctx.params);
      try {
        return decorate.publish(key, ctx.params.note);
      } catch (e) {
        throw new BizError(e.message, ERR.BIZ);
      }
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
      try {
        return decorate.rollback(key, ctx.params.versionId, ctx.params.mode);
      } catch (e) {
        throw new BizError(e.message, ERR.BIZ);
      }
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
  }
];
