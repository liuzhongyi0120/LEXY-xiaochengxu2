/**
 * 素材库路由（图片本地上传 + 文件夹分类）
 *
 *   POST /api/media/upload   上传图片（multipart/form-data 支持多张；也兼容 JSON + base64/dataURL）
 *                            ?folder=页面名 可直接归入文件夹
 *   GET  /api/media/list     素材库列表（搜索 / 排序 / 分页 / 按文件夹筛选 + 各文件夹计数）
 *   POST /api/media/delete   删除素材（被页面引用时需 force=1）
 *   POST /api/media/folder   文件夹管理（op=create|rename|remove）
 *   POST /api/media/move     批量把素材移动到文件夹（folder 留空 = 移回未分组）
 *
 * 落盘：server/data/uploads/<yyyyMM>/…，对外通过 /uploads/… 访问（见 index.js 静态服务）。
 *
 * 文件夹是**逻辑分类**：只写索引里的 folder 字段，不产生真实目录 —— 因为图片 URL
 * 已经写进 replica.js / catalog.json，挪动物理文件会让线上图全裂。
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
    desc: '上传图片到本地素材库（multipart 支持多张；?folder= 指定归属文件夹；返回相对路径 /uploads/… 与 w×h 尺寸）',
    async handler(ctx) {
      const items = await media.collect(ctx.req);
      return media.upload(items, ctx.params.folder);
    }
  },

  {
    method: 'GET',
    path: '/api/media/list',
    auth: false,
    desc: '素材库列表（q 搜索原始名/路径；folder 筛选，__none__ 表示未分组、不传表示全部；sort=new|old|big|small；page/size 分页；返回 folders 计数与容量统计）',
    async handler(ctx) {
      const p = ctx.params;
      return media.list({
        q: p.q,
        type: p.type,
        folder: p.folder,
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
  },

  {
    method: 'POST',
    path: '/api/media/folder',
    auth: false,
    desc: '素材文件夹管理：op=create（name）/ rename（from,to）/ remove（name；只删分类，素材回到未分组）',
    async handler(ctx) {
      const p = ctx.params;
      const op = String(p.op || 'create').toLowerCase();
      if (op === 'create' || op === 'add') return media.folderCreate(p.name);
      if (op === 'rename') return media.folderRename(p.from, p.to);
      if (op === 'remove' || op === 'delete') return media.folderRemove(p.name);
      throw new BizError('未知的 op：' + p.op + '（支持 create / rename / remove）', ERR.PARAM);
    }
  },

  {
    method: 'POST',
    path: '/api/media/move',
    auth: false,
    desc: '批量移动素材到文件夹（names 传数组或逗号分隔字符串；folder 省略或留空 = 移回未分组；目标文件夹不存在会自动创建）',
    async handler(ctx) {
      const p = ctx.params;
      let names = p.names;
      if (typeof names === 'string') names = names.split(',');
      if (!Array.isArray(names) || !names.length) {
        throw new BizError('缺少 names（素材名数组，或逗号分隔的字符串）', ERR.PARAM);
      }
      return media.move(names, p.folder);
    }
  }
];
