/**
 * 素材库路由（图片本地上传）
 *
 *   POST /api/media/upload   上传图片（multipart/form-data 支持多张；也兼容 JSON + base64/dataURL）
 *   GET  /api/media/list     素材库列表（搜索 / 排序 / 分页 + 用量统计）
 *   POST /api/media/delete   删除素材（被页面引用时需 force=1）
 *
 * 落盘：server/data/uploads/<yyyyMM>/…，对外通过 /uploads/… 访问（见 index.js 静态服务）。
 *
 * 说明：与「装修后台」同属运营管理功能，当前无管理端账号体系故未开 JWT 鉴权；
 * 正式环境请在网关层加访问控制，避免任意人上传文件占用磁盘（见 README「上线前必做」）。
 */

const media = require('../lib/media');
const { BizError, ERR } = require('../lib/http');

module.exports = [
  {
    method: 'POST',
    path: '/api/media/upload',
    auth: false,
    raw: true, // 声明按原始流读取，跳过入口的 JSON body 解析（见 index.js）
    desc: '上传图片到本地素材库（multipart 支持多张；返回相对路径 /uploads/… 与 w×h 尺寸）',
    async handler(ctx) {
      const items = await media.collect(ctx.req);
      return media.upload(items);
    }
  },

  {
    method: 'GET',
    path: '/api/media/list',
    auth: false,
    desc: '素材库列表（q 搜索原始名/路径，sort=new|old|big|small，page/size 分页，附用量与容量统计）',
    async handler(ctx) {
      const p = ctx.params;
      return media.list({
        q: p.q,
        type: p.type,
        sort: p.sort,
        page: p.page,
        size: p.size
      });
    }
  },

  {
    method: 'POST',
    path: '/api/media/delete',
    auth: false,
    desc: '删除素材（先做引用检查：被页面内容用到时返回引用处数并拒绝，传 force=1 才强删）',
    async handler(ctx) {
      if (!ctx.params.name) throw new BizError('缺少素材名 name（形如 202610/20261007-ab12cd.png）', ERR.PARAM);
      return media.remove(ctx.params.name, !!Number(ctx.params.force));
    }
  }
];
