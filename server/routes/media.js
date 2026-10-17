/**
 * 素材库路由（图片 / 视频本地上传 + 文件夹分类）
 *
 *   POST /api/media/upload   上传素材（multipart/form-data 支持多个；也兼容 JSON + base64/dataURL）
 *                            ?folder=页面名 可直接归入文件夹
 *   GET  /api/media/list     素材库列表（搜索 / 排序 / 分页 / 按文件夹或 kind 筛选 + 计数）
 *   POST /api/media/delete   删除素材（**先进回收站**，被页面引用时需 force=1）
 *   GET  /api/media/trash    回收站清单（可恢复 / 到期可清除）
 *   POST /api/media/restore  从回收站恢复（URL 不变）
 *   POST /api/media/purge    彻底清除一个回收站素材（保留期内需 force=1）
 *   POST /api/media/trash/sweep 清理回收站（只清到期且无引用的，逐条说明依据）
 *   POST /api/media/folder   文件夹管理（op=create|rename|remove）
 *   POST /api/media/move     批量把素材移动到文件夹（folder 留空 = 移回未分组）
 *
 * 落盘：server/data/uploads/<yyyyMM>/…，对外通过 /uploads/… 访问（见 index.js 静态服务）。
 *
 * 文件夹是**逻辑分类**：只写索引里的 folder 字段，不产生真实目录 —— 因为图片 URL
 * 已经写进 replica.js / catalog.json，挪动物理文件会让线上图全裂。
 *
 * 体积分档：图片 5MB / 视频 50MB（见 lib/media.js 的 MAX_BYTES / MAX_VIDEO_BYTES）。
 * 注意反向代理也要放开：nginx 的 client_max_body_size 默认 1MB，不改的话视频必然 413。
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
    desc: '上传素材到本地素材库（multipart 支持多个；?folder= 指定归属文件夹；返回相对路径 /uploads/… 与尺寸、时长）',
    async handler(ctx) {
      const items = await media.collect(ctx.req);
      /*
       * forceNew=1（query）：明确要留一份新的物理副本，**跳过同内容复用**。
       * 自检脚本每次都要造一份「新的、可删的」素材，如果走复用，
       * 它删掉的会是素材库里已有的那一张（审查 F18 才引入的这个语义变化）。
       */
      const forceNew = !!Number(ctx.params.forceNew || ctx.query.forceNew || 0);
      if (forceNew) items.forEach((it) => { it.forceNew = true; });
      return media.upload(items, ctx.params.folder);
    }
  },

  {
    method: 'GET',
    path: '/api/media/list',
    auth: false,
    desc: '素材库列表（q 搜索原始名/路径；kind=image|video 分档；folder 筛选，__none__ 表示未分组、不传表示全部；sort=new|old|big|small；page/size 分页；返回 folders 与 kinds 计数、容量统计）',
    async handler(ctx) {
      const p = ctx.params;
      return media.list({
        q: p.q,
        type: p.type,
        kind: p.kind,
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
    desc: '删除素材（先做引用检查：当前数据 + 保留期内的历史版本；被用到时返回引用处清单并拒绝，传 force=1 才删；删除后进回收站，30 天内可恢复）',
    async handler(ctx) {
      if (!ctx.params.name) throw new BizError('缺少素材名 name（形如 202610/20261007-ab12cd.png）', ERR.PARAM);
      return media.remove(ctx.params.name, !!Number(ctx.params.force));
    }
  },

  /*
   * 回收站三件套（审查 F17）。
   *
   * 以前「删除」= 直接从盘上抹掉：运营换掉首页大图并重新生成代码后，旧图在新数据里
   * 已经没有引用，一点删除就再也找不回来 —— 而用户手机上已上传的小程序包用的还是旧版本，
   * 回滚时同样失图。现在删除只是**移出 uploads**（URL 立刻 404，下架当场生效），
   * 文件在回收站里留 30 天，可原样恢复（恢复后 URL 不变，页面不用改）。
   */
  {
    method: 'GET',
    path: '/api/media/trash',
    auth: false,
    desc: '回收站清单（进站时间 / 已几天 / 还剩几天可恢复 / 删除时的引用快照）；到期后才允许彻底清除',
    async handler() {
      return media.trashList();
    }
  },

  {
    method: 'POST',
    path: '/api/media/restore',
    auth: false,
    desc: '从回收站恢复素材（URL 与删除前完全一致，页面与商品不用改）；素材库已有同名素材时拒绝',
    async handler(ctx) {
      if (!ctx.params.name) throw new BizError('缺少素材名 name', ERR.PARAM);
      return media.restore(ctx.params.name);
    }
  },

  {
    method: 'POST',
    path: '/api/media/purge',
    auth: false,
    desc: '彻底清除回收站里的一个素材（保留期内需 force=1；清除后不可恢复，需 owner）',
    async handler(ctx) {
      if (!ctx.params.name) throw new BizError('缺少素材名 name', ERR.PARAM);
      return media.purge(ctx.params.name, !!Number(ctx.params.force));
    }
  },

  {
    method: 'POST',
    path: '/api/media/trash/sweep',
    auth: false,
    desc: '清理回收站：只清「保留期已过且无引用」的条目，返回每一条被清/被留的依据（force=1 时跳过引用复查）',
    async handler(ctx) {
      return media.sweepTrash({ force: !!Number(ctx.params.force) });
    }
  },

  /*
   * 重复素材治理（审查 F18）
   *
   * 素材库 1312MiB 里有 274 份完全重复的副本（约占 174.8MiB）——
   * 同一张图被不同人、不同批次反复上传，文件名与目录都不一样，**只有内容一样**，
   * 所以只能按内容哈希判定，不能按文件名。
   * 新增上传已自动复用（同内容不再落第二份盘）；存量靠这两条接口扫出来再合并。
   */
  {
    method: 'GET',
    path: '/api/media/duplicates',
    auth: false,
    desc: '重复素材分组：按内容哈希聚类，给出建议保留的那份、副本清单与白占的空间；unhashed>0 表示还有素材没算过哈希，需先调用扫描',
    async handler() {
      return media.duplicates();
    }
  },

  {
    method: 'POST',
    path: '/api/media/hash-scan',
    auth: false,
    desc: '给还没算过内容哈希的素材补算哈希（分批，limit 默认 120、上限 400）。存量素材体积大，一次全读会卡死请求，所以由后台反复调用直到 remain=0',
    async handler(ctx) {
      return media.scanHashes(ctx.params.limit);
    }
  },

  {
    method: 'POST',
    path: '/api/media/merge',
    auth: false,
    desc: '合并重复副本：把 names 各处引用全部改指到 keep（商品库 / 已发布 / 草稿三处一起改），副本进回收站（30 天内可恢复，不是物理删除）。需 owner',
    async handler(ctx) {
      if (!ctx.params.keep) throw new BizError('缺少要保留的素材 keep', ERR.PARAM);
      return media.merge({ keep: ctx.params.keep, names: ctx.params.names });
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
