/**
 * 数据根目录的唯一解析处。
 *
 * 默认是 `server/data`（db.json / catalog.json / uploads / decorate 都在其下）。
 *
 * 设 `MALL_DATA_DIR` 可把它整体挪到任意目录 —— 存在的意义是**非交易回归测试**：
 * 那些测试要跑真实的业务函数（保存商品、删分类、发布装修…），
 * 在真实数据文件上跑会改坏商品库与订单。有了这个开关，测试指向一个临时目录，
 * 跑完整链路也不碰 `server/data` 里任何一个字节。
 *
 * ⚠️ 各存储模块都必须从这里取目录，不要再各自 `path.join(__dirname, '..', 'data')` ——
 *    漏一处就会出现「db 落到临时目录、catalog 还写真实文件」这种半隔离状态，
 *    比完全不隔离更危险（以为安全了，其实没有）。
 */

const nodePath = require('node:path');

const ROOT = process.env.MALL_DATA_DIR
  ? nodePath.resolve(process.env.MALL_DATA_DIR)
  : nodePath.join(__dirname, '..', 'data');

/** 是否运行在隔离数据目录下（测试用；可据此在日志里提示） */
const IS_ISOLATED = !!process.env.MALL_DATA_DIR;

/** 拼数据目录下的相对路径 */
function resolve() {
  return nodePath.join.apply(nodePath, [ROOT].concat(Array.prototype.slice.call(arguments)));
}

module.exports = { ROOT, IS_ISOLATED, resolve };
