/**
 * 联调示例参数表
 *
 * 用途：由 GET /api/routes 随点位清单一起下发，供后端调试台（/debug）自动填参。
 * 这样「点位定义」与「示例参数」同源维护，不会出现文档与实现脱节。
 *
 * 约定：
 *   - key 为 `METHOD /path`
 *   - query  —— 走 URL query（GET 类点位）
 *   - body   —— 走请求体 JSON（POST / PUT / DELETE 类点位）
 *   - note   —— 调试台展示的提示
 *   - 值支持 {{变量}} 占位，调试台用「变量池」替换后再发送
 *     （变量池会在登录、保存地址、加购、下单后自动回填真实值）
 */

module.exports = {
  /* ----------------------------- 鉴权与用户 ----------------------------- */
  'POST /api/auth/login': {
    note: '未配置微信 AppID 时走本地模拟：任意 code 均可登录；同一个 code 稳定映射为同一个账号，便于反复调试同一份数据',
    body: { code: 'debug_code_001' }
  },
  'POST /api/auth/refresh': {
    note: '携带旧 token 换取新 token，前端可在过期前静默续期',
    body: {}
  },
  'GET /api/user/profile': { note: '需登录；返回昵称 / 头像 / 手机号 / 券数量等' },
  'POST /api/user/profile': {
    note: '授权后回填昵称与头像',
    body: { nickname: '莱克调试用户', avatar: 'https://placehold.co/200x200/FDECEE/C8102E/png?text=LEXY' }
  },
  'POST /api/user/phone': {
    note: '对应 getPhoneNumber 返回的 code；本地模拟模式下任意 code 都会生成一个演示手机号',
    body: { code: 'debug_phone_code' }
  },
  'POST /api/auth/logout': { note: '服务端 JWT 无状态，前端清 token 即可；此点位用于打通链路', body: {} },

  /* ----------------------------- 首页与商品 ----------------------------- */
  'GET /api/home': { note: '首页聚合：轮播 + 分类入口 + 推荐商品' },
  'GET /api/goods/categories': { note: '分类树，含二级分类' },
  'GET /api/goods/list': {
    note: 'sort 可选：default / sales（销量）/ price_asc / price_desc / new；categoryId 支持一级或二级',
    query: { categoryId: 'c101', keyword: '', sort: 'default', page: 1, size: 10 }
  },
  'GET /api/goods/detail': { note: '商品详情：SKU 矩阵 + 图文详情 + 推荐', query: { id: '{{goodsId}}' } },
  'GET /api/goods/comments': { note: '评价列表，分页', query: { goodsId: '{{goodsId}}', page: 1, size: 5 } },

  /* ----------------------------- 购物车 ----------------------------- */
  'GET /api/cart/list': { note: '服务端购物车，返回已勾选合计' },
  'POST /api/cart/add': {
    note: '会校验库存；同一 SKU 重复加购为累加数量',
    body: { goodsId: '{{goodsId}}', skuId: '{{skuId}}', quantity: 1 }
  },
  'PUT /api/cart/update': {
    note: '改数量或勾选状态；cartItemId 由「加入购物车」响应返回',
    body: { cartItemId: '{{cartItemId}}', quantity: 2, selected: true }
  },
  'DELETE /api/cart/remove': { note: '批量移除，body 传数组（与小程序端一致）', body: { cartItemIds: ['{{cartItemId}}'] } },
  'POST /api/cart/selectAll': { note: '全选 / 全不选', body: { selected: true } },

  /* ----------------------------- 交易 ----------------------------- */
  'POST /api/order/precreate': {
    note: '金额由服务端重算，前端传值不生效。两种来源：① items 立即购买 ② fromCart:true 结算购物车已勾选项。下单即锁库存',
    body: { fromCart: true, addressId: '{{addressId}}', couponId: '', remark: '调试下单' }
  },
  'GET /api/order/list': {
    note: 'status 可选：pending_pay / pending_ship / shipped / finished / cancelled，留空为全部',
    query: { status: '', page: 1, size: 10 }
  },
  'GET /api/order/detail': { note: '含商品行、金额明细、物流节点、券使用情况', query: { orderId: '{{orderId}}' } },
  'GET /api/order/count': { note: '各状态数量，供「我的」页角标' },
  'POST /api/order/cancel': { note: '仅待付款可取消；会回滚库存并退还优惠券', body: { orderId: '{{orderId}}' } },
  'POST /api/order/confirm': { note: '确认收货，仅已发货订单可操作', body: { orderId: '{{orderId}}' } },
  'POST /api/order/ship': {
    note: '发货（联调辅助点位，真实环境由后台或 ERP 触发）',
    body: { orderId: '{{orderId}}', company: '顺丰速运', no: 'SF1234567890' }
  },

  /* ----------------------------- 支付 ----------------------------- */
  'POST /api/pay/notify': {
    note: '微信支付异步回调，微信服务器调用。未配置商户号时验签走模拟（恒通过）；payAmountFen 传 0 表示不校验金额',
    body: { orderNo: '{{orderNo}}', transactionId: 'debug_tx_001', payAmountFen: 0 }
  },
  'POST /api/pay/query': { note: '支付结果页轮询用', body: { orderId: '{{orderId}}' } },
  'POST /api/pay/mock-success': {
    note: '联调专用：模拟支付成功。走的是与真实回调完全相同的处理路径（含幂等），可重复调用验证 duplicated',
    body: { orderId: '{{orderId}}' }
  },

  /* ----------------------------- 地址 ----------------------------- */
  'GET /api/address/list': { note: '按默认地址优先排序' },
  'GET /api/address/detail': { note: '地址详情', query: { addressId: '{{addressId}}' } },
  'POST /api/address/save': {
    note: '不传 addressId 为新增，传则为编辑；第一条地址自动设为默认',
    body: {
      name: '张三',
      phone: '13800000000',
      province: '江苏省',
      city: '苏州市',
      district: '姑苏区',
      detail: '示例路 1 号 101 室',
      isDefault: true
    }
  },
  'POST /api/address/delete': { note: '删除后若删的是默认地址，自动把第一条补为默认', body: { addressId: '{{addressId}}' } },
  'POST /api/address/setDefault': { note: '设为默认地址', body: { addressId: '{{addressId}}' } },

  /* ----------------------------- 优惠券 ----------------------------- */
  'GET /api/coupon/list': {
    note: 'status 可选：available / used / expired，留空为全部',
    query: { status: 'available' }
  },
  'GET /api/coupon/available': {
    note: '下单页可用券试算：goodsAmount 单位分，categoryIds 传订单商品所属分类',
    query: { goodsAmount: 249900, categoryIds: 'c101' }
  },
  'POST /api/coupon/receive': {
    note: '券模板：ct_new_100（满1000减100）/ ct_500_300（满3000减300）/ ct_bq_200（碧云泉专享）/ ct_95（全场95折）；同一模板不可重复领',
    body: { templateId: 'ct_new_100' }
  },

  /* ----------------------------- 收藏与足迹 ----------------------------- */
  'GET /api/favorite/list': { note: '我的收藏，分页', query: { page: 1, size: 10 } },
  'POST /api/favorite/toggle': { note: '再次调用即取消收藏', body: { goodsId: '{{goodsId}}' } },
  'GET /api/footprint/list': { note: '浏览记录，分页', query: { page: 1, size: 10 } },
  'POST /api/footprint/add': { note: '记录一条浏览，同一商品只保留最近一次', body: { goodsId: '{{goodsId}}' } },
  'DELETE /api/footprint/clear': { note: '清空当前用户的浏览记录', body: {} },

  /* ----------------------------- 素材库（图片本地上传 + 文件夹分类） ----------------------------- */
  'POST /api/media/upload': {
    note: '上传图片到本地素材库。后台装修页用 multipart 表单（可多选）；此处为 JSON + base64 的等价调用，示例是一张 2×2 的 PNG，直接发送即可落盘。落盘位置 server/data/uploads/，对外访问 /uploads/…。可用 query 的 folder 指定归属文件夹（不存在会自动创建）。仅支持 PNG/JPG/WebP/GIF，单张上限 5MB，SVG 因安全原因拒收',
    query: { folder: '' },
    body: {
      name: 'debug-2x2.png',
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGM4IaDHAMUAFEYDE2QuiKkAAAAASUVORK5CYII='
    }
  },
  'GET /api/media/list': {
    note: '素材库列表：q 按原始文件名/相对路径搜索；folder 按文件夹筛选（传 __none__ 看未分组、不传看全部）；sort 可选 new（默认）/old/big/small；page、size 分页（size 上限 200）。返回 folders 各文件夹计数、ungrouped 未分组张数与 stat 容量统计',
    query: { q: '', folder: '', sort: 'new', page: 1, size: 24 }
  },
  'POST /api/media/delete': {
    note: '删除素材。默认先做引用检查：被 replica.js 或草稿引用时返回引用处数并拒绝；确认要删再传 force=1',
    body: { name: '{{mediaName}}', force: 0 }
  },
  'POST /api/media/folder': {
    note: '素材文件夹管理（纯逻辑分类，不产生真实目录）。op=create 建（name）；op=rename 改名（from→to，里面的素材一起跟着改）；op=remove 删（name，只删分类、素材回到未分组，**不会删素材**）',
    body: { op: 'create', name: '示例文件夹' }
  },
  'POST /api/media/move': {
    note: '批量把素材移动到文件夹。names 传素材名数组（或逗号分隔字符串）；folder 省略或留空 = 移回未分组；目标文件夹不存在会自动创建',
    body: { names: ['{{mediaName}}'], folder: '首页' }
  },

  /* ---------------- 后台控制台 / 装修台（/console、/admin 专用） ----------------
   * ⚠️ 除 /api/admin/login 外，本组点位**都要求管理员令牌**（见 lib/adminAuth.js）。
   *    调试台里请先调用 login 拿到 token，再把它填到「请求头 → Authorization: Bearer <token>」。 */
  'POST /api/admin/login': {
    note: '管理员登录：口令换会话令牌。生产环境需先设置 ADMIN_PASSWORD；连续 5 次错误会退避 60 秒。返回 { token, role, roleLabel, ttl }',
    body: { password: 'admin' }
  },
  'GET /api/admin/session': {
    note: '当前管理员会话（我是谁）：返回 { role, roleLabel, name, source }；未带管理员令牌返回 401',
    query: {}
  },
  'GET /api/admin/dashboard': {
    note: '数据概览。days 控制趋势天数（默认 7）。返回今日/昨日/近7日/近30日/累计 GMV 与订单数、待办（待发货 / 待付款 / 库存预警）、各状态计数、Top 商品、库存预警榜、最近订单',
    query: { days: 7 }
  },

  /* ---- 商品 ---- */
  'GET /api/admin/goods/list': {
    note: '后台商品列表（含已下架）。keyword 搜名称 / ID / 副标题；status 可选 on_sale / off_sale；categoryId 支持一级或二级；lowStock=1 只看库存预警；sort 可选 newest_admin / price_asc / price_desc / stock_asc / sales',
    query: { keyword: '', status: '', categoryId: '', lowStock: 0, sort: 'newest_admin', page: 1, size: 20 }
  },
  'GET /api/admin/goods/detail': {
    note: '商品编辑态详情（含下架商品），同时返回分类选项',
    query: { id: '{{goodsId}}' }
  },
  'POST /api/admin/goods/save': {
    note: '新建 / 编辑商品：不传 id 即新建。price / originalPrice 单位「分」；skus 给空数组时会按 basePrice 自动生成一个规格。返回 { id, isNew }',
    body: {
      name: '联调示例商品',
      categoryId: 'c101',
      subtitle: '副标题',
      tags: ['新品'],
      images: [],
      description: '图文详情',
      skus: [{ specs: ['标准装'], price: 19900, originalPrice: 29900, stock: 50 }]
    }
  },
  'POST /api/admin/goods/status': {
    note: '批量上下架。status 可选 on_sale / off_sale',
    body: { ids: ['{{goodsId}}'], status: 'off_sale' }
  },
  'POST /api/admin/goods/stock': {
    note: '批量改库存：mode=set 覆盖 / delta 增减；items 里 value 是数量（delta 时可为负）',
    body: { items: [{ skuId: '{{skuId}}', value: 66 }], mode: 'set' }
  },
  'POST /api/admin/goods/delete': {
    note: '删除商品。被订单引用时拒绝（这种情况建议改为下架）',
    body: { id: '{{goodsId}}' }
  },

  /* ---- 分类 ---- */
  'GET /api/admin/category/list': { note: '后台分类树，含每个分类的商品数' },
  'POST /api/admin/category/save': {
    note: '新建（不传 id）/ 重命名（传 id）分类；parentId 非空则建二级分类',
    body: { name: '联调示例分类', parentId: '' }
  },
  'POST /api/admin/category/delete': {
    note: '删除分类。分类下还有商品时会被拒绝',
    body: { id: '{{categoryId}}' }
  },

  /* ---- 订单 ---- */
  'GET /api/admin/order/list': {
    note: '后台订单列表。status 可选 all / pending_pay / pending_ship / pending_receive / finished / cancelled；keyword 搜订单号 / 收货人 / 电话 / 商品名；from、to 为毫秒时间戳；sort 可选 newest / amount',
    query: { status: 'all', keyword: '', from: '', to: '', sort: 'newest', page: 1, size: 20 }
  },
  'GET /api/admin/order/detail': {
    note: '订单详情：商品明细、收货地址、金额、物流（logistics）、客户画像、用券明细',
    query: { orderId: '{{orderId}}' }
  },
  'POST /api/admin/order/ship': {
    note: '批量发货。逐单返回成功 / 失败明细：不可发货的订单（状态不符或不存在）只进 failed，不会被误标为已发货',
    body: { orderIds: ['{{orderId}}'], company: '顺丰速运', no: 'SF1234567890' }
  },
  'POST /api/admin/order/remark': {
    note: '商家备注（仅后台可见）。remark 传空字符串即清空',
    body: { orderId: '{{orderId}}', remark: '客户要求周末送达' }
  },
  'POST /api/admin/order/close': {
    note: '关闭订单。仅允许未付款订单，会回滚库存并退还已用券',
    body: { orderId: '{{orderId}}' }
  },
  'GET /api/admin/order/export': {
    note: '导出订单 CSV（返回文本，前端包成 Blob 下载）。带 UTF-8 BOM，Excel 打开不乱码；筛选参数与订单列表一致',
    query: { status: 'all', keyword: '', from: '', to: '' }
  },

  /* ---- 客户 ---- */
  'GET /api/admin/customer/list': {
    note: '客户列表。keyword 搜昵称 / 手机号 / 用户 ID；level 可选 new（未成交）/ active（近 30 天有单）/ vip（累计消费 ≥ 3000 元）；tag 按标签过滤；sort 可选 newest / amount / orders / recent',
    query: { keyword: '', level: '', tag: '', sort: 'newest', page: 1, size: 20 }
  },
  'GET /api/admin/customer/detail': {
    note: '客户详情：消费统计（orderCount / paidCount / paidAmount）、订单、地址、券、收藏与足迹数（字段是扁平的，没有 stat 包裹）',
    query: { userId: '{{userId}}' }
  },
  'POST /api/admin/customer/tag': {
    note: '打标签：append=true 追加（自动去重，上限 10 个），否则整体覆盖',
    body: { userId: '{{userId}}', tags: ['高潜'], append: true }
  },

  /* ---- 优惠券 ---- */
  'GET /api/admin/coupon/list': { note: '券模板列表，含领取数 / 核销数统计' },
  'GET /api/admin/coupon/detail': { note: '单个券模板', query: { templateId: 'ct_500_300' } },
  'POST /api/admin/coupon/save': {
    note: '新建 / 编辑券模板。type=discount 为满减（value 单位分）；type=percent 为折扣（value 传 50~99，如 95 表示 95 折）',
    body: { name: '满 2000 减 200', type: 'discount', threshold: 200000, value: 20000, scope: '全场通用', days: 30 }
  },
  'POST /api/admin/coupon/status': {
    note: '启用 / 暂停券。暂停后小程序端不可再领取，已领到的仍可使用（状态会穿透到 C 端领券校验）',
    body: { templateId: '{{templateId}}', status: 'paused' }
  },
  'POST /api/admin/coupon/delete': {
    note: '删除券模板。已被用户领取过则拒绝（避免历史券失去定义）',
    body: { templateId: '{{templateId}}' }
  },

  /* ---- 评价 ---- */
  'GET /api/admin/comment/list': {
    note: '评价列表（含商家回复）。goodsId 按商品过滤；score 按评分；keyword 搜内容 / 昵称；page、size 分页',
    query: { goodsId: '', score: '', keyword: '', page: 1, size: 20 }
  },
  'POST /api/admin/comment/reply': {
    note: '回复评价。text 传空字符串即删除回复',
    body: { commentId: '{{commentId}}', text: '感谢支持，已为您登记' }
  },

  /* ---- 店铺设置 ---- */
  'GET /api/admin/settings': { note: '店铺设置当前值 + 默认值 + 商品 / 分类 / 券模板数量' },
  'POST /api/admin/settings/save': {
    note: '保存店铺设置（只覆盖传入的字段）：shopName / logo / servicePhone / serviceHours / notice / freightFree / defaultFreight / autoConfirmDays / payExpireMinutes',
    body: {
      shopName: 'LEXY 莱克官方旗舰店',
      servicePhone: '400-828-0000',
      freightFree: 1,
      defaultFreight: 0,
      autoConfirmDays: 7,
      payExpireMinutes: 30
    }
  },

  /* ----------------------- 装修后台（/admin 专用，免登录） ----------------------- */
  'GET /api/decorate/pages': {
    note: '装修页面列表 + 组件库清单。页面 key 共 5 个：home（首页）/ lexy（莱克）/ news（资讯）/ product（产品）/ mine（我的）'
  },
  'GET /api/decorate/lib': {
    note: '组件库清单（常用 10 / 基础 53 / 高级 19，含「已接入」标记与内联 SVG 图标）'
  },
  'GET /api/decorate/page': {
    note: '单页面装修数据：字段 schema + 已发布数据 + 草稿 + 版本历史',
    query: { key: 'home' }
  },
  'POST /api/decorate/draft': {
    note: '保存草稿（不影响线上，发布后才生效）。data 传完整区块数组；传空数组则用当前已发布数据填充',
    body: { key: 'home', data: [] }
  },
  'POST /api/decorate/discard': {
    note: '丢弃草稿，恢复为已发布数据',
    body: { key: 'home' }
  },
  'GET /api/decorate/diff': {
    note: '查看草稿相对已发布数据的变更清单',
    query: { key: 'home' }
  },
  'POST /api/decorate/publish': {
    note: '发布：写回 miniprogram/config/replica.js。发布前自动备份，并对产物做语法与回读双重校验，校验不过则拒绝发布',
    body: { key: 'home', note: '联调发布' }
  },
  'POST /api/decorate/rollback': {
    note: '回滚到历史版本。versionId 取自 /api/decorate/page 的 versions；mode=publish 时直接发布，否则仅恢复为草稿',
    body: { key: 'home', versionId: '{{versionId}}', mode: 'draft' }
  },
  'GET /api/decorate/stats': {
    note: '装修数据统计（草稿数、版本数、数据文件体积、目标文件路径）'
  },
  'GET /api/decorate/link-options': {
    note: '装修台「选择链接」弹层的候选清单：小程序页面（内置 5 个 tab 页 + 分类/购物车/全部商品 + 自定义页）、商品（后端商品库）、资讯栏目（replica.NEWS）'
  },
  'GET /api/decorate/templates': {
    note: '新建页面可选的模板（空白页 / 复制首页）+ 自定义页配额（已用 / 上限 20）'
  },
  'POST /api/decorate/page/create': {
    note: '新建自定义页面。只建后台条目，不写 replica.js；装修完点「发布」才下发到小程序，小程序端路径 pages/custom/index?key=标识',
    body: { name: '2026 春季新品', key: 'spring2026', note: '投放落地页', template: 'blank' }
  },
  'GET /api/decorate/page/refs': {
    note: '站内引用清单：哪些页面 / 底部导航的哪个字段跳到了这个自定义页。改名或删除前先看它，别让入口变成空白页',
    query: { key: '{{pageKey}}' }
  },
  'POST /api/decorate/page/rename': {
    note: '改自定义页面的名称 / 备注 / 页面标识。改标识会迁移草稿、版本快照与 replica 键名，并把旧标识登记为别名（旧分享链接继续可用）；返回值里带回仍指向旧标识的引用清单',
    body: { key: '{{pageKey}}', name: '2026 春季新品（改版）', newKey: 'spring2026-v2', note: '' }
  },
  'POST /api/decorate/page/delete': {
    note: '删除自定义页面：连带清理草稿与版本记录并重新生成 replica.js。页面被站内引用时会拒绝，须带 force=1 才删',
    body: { key: '{{pageKey}}' }
  },

  /* ------------------------------- 运维 ------------------------------- */
  'GET /api/health': {
    note: '健康检查：服务状态、已注册点位数、微信能力（登录 / 支付是真机还是 mock）'
  },
  'GET /api/routes': {
    note: '点位清单（含示例参数与说明，调试台与联调自检都靠它下发）'
  }
};
