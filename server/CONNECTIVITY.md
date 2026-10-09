# 后端点位连通性报告

> 生成时间：2026/10/9 14:26:17　｜　目标服务：`http://127.0.0.1:3000`
> 生成方式：`node server/tools/check-all.mjs`（真实 HTTP 请求，非静态扫描）

## 一、总览

| 指标 | 值 |
|---|---|
| 已注册点位 | 91 |
| 已实测点位 | 91 |
| 未覆盖点位 | 0 |
| 实测请求/断言 | 419 |
| 通过 | 419 |
| 失败 | 0 |
| 服务健康检查 | up |
| 微信能力模式 | 登录 mock / 支付 mock |

## 二、点位明细

| # | 方法 | 路径 / 断言 | HTTP | 业务码 | 结果 | 说明 |
|---|---|---|---|---|---|---|
| 1 | GET | `/api/health` | 200 | 0 | ✅ | ok |
| 2 | GET | `/api/routes` | 200 | 0 | ✅ | ok |
| 3 | GET | `/api/user/profile` | 401 | 401 | ✅ | 预期失败：未登录 401　要求 HTTP 401 + code 401 |
| 4 | — | `未登录访问受保护点位返回 401` | PASS | 0 | ✅ | 断言 |
| 5 | — | `401 时响应体不含业务数据` | PASS | 0 | ✅ | 断言 |
| 6 | POST | `/api/auth/login` | 200 | 0 | ✅ | ok |
| 7 | GET | `/api/home` | 200 | 0 | ✅ | ok |
| 8 | GET | `/api/goods/categories` | 200 | 0 | ✅ | ok |
| 9 | GET | `/api/goods/list` | 200 | 0 | ✅ | ok |
| 10 | GET | `/api/goods/list` | 200 | 0 | ✅ | ok |
| 11 | GET | `/api/goods/list` | 200 | 0 | ✅ | ok |
| 12 | GET | `/api/goods/detail` | 200 | 0 | ✅ | ok |
| 13 | GET | `/api/goods/comments` | 200 | 0 | ✅ | ok |
| 14 | GET | `/api/user/profile` | 200 | 0 | ✅ | ok |
| 15 | POST | `/api/user/profile` | 200 | 0 | ✅ | ok |
| 16 | POST | `/api/user/phone` | 200 | 0 | ✅ | ok |
| 17 | POST | `/api/auth/refresh` | 200 | 0 | ✅ | ok |
| 18 | GET | `/api/cart/list` | 200 | 0 | ✅ | ok |
| 19 | GET | `/api/address/list` | 200 | 0 | ✅ | ok |
| 20 | GET | `/api/coupon/list` | 200 | 0 | ✅ | ok |
| 21 | GET | `/api/coupon/list` | 200 | 0 | ✅ | ok |
| 22 | GET | `/api/coupon/list` | 200 | 0 | ✅ | ok |
| 23 | GET | `/api/address/list` | 200 | 0 | ✅ | ok |
| 24 | POST | `/api/address/save` | 200 | 0 | ✅ | ok |
| 25 | GET | `/api/address/list` | 200 | 0 | ✅ | ok |
| 26 | GET | `/api/address/detail` | 200 | 0 | ✅ | ok |
| 27 | POST | `/api/address/setDefault` | 200 | 0 | ✅ | ok |
| 28 | POST | `/api/cart/add` | 200 | 0 | ✅ | ok |
| 29 | GET | `/api/cart/list` | 200 | 0 | ✅ | ok |
| 30 | PUT | `/api/cart/update` | 200 | 0 | ✅ | ok |
| 31 | POST | `/api/cart/selectAll` | 200 | 0 | ✅ | ok |
| 32 | GET | `/api/coupon/available` | 200 | 0 | ✅ | ok |
| 33 | POST | `/api/coupon/receive` | 200 | 0 | ✅ | ok |
| 34 | POST | `/api/coupon/receive` | 200 | 2000 | ✅ | 预期失败：重复领券被拦截　要求 HTTP 200 + code 2000 |
| 35 | GET | `/api/coupon/list` | 200 | 0 | ✅ | ok |
| 36 | POST | `/api/order/precreate` | 200 | 0 | ✅ | ok |
| 37 | — | `下单返回支付参数` | PASS | 0 | ✅ | 断言 |
| 38 | GET | `/api/order/detail` | 200 | 0 | ✅ | ok |
| 39 | GET | `/api/order/list` | 200 | 0 | ✅ | ok |
| 40 | GET | `/api/order/count` | 200 | 0 | ✅ | ok |
| 41 | POST | `/api/pay/query` | 200 | 0 | ✅ | ok |
| 42 | POST | `/api/pay/mock-success` | 200 | 0 | ✅ | ok |
| 43 | POST | `/api/pay/query` | 200 | 0 | ✅ | ok |
| 44 | — | `支付后订单转为待发货` | PASS | 0 | ✅ | 断言 |
| 45 | POST | `/api/order/ship` | 200 | 0 | ✅ | ok |
| 46 | POST | `/api/order/confirm` | 200 | 0 | ✅ | ok |
| 47 | GET | `/api/order/detail` | 200 | 0 | ✅ | ok |
| 48 | — | `确认收货后订单完成` | PASS | 0 | ✅ | 断言 |
| 49 | POST | `/api/order/precreate` | 200 | 0 | ✅ | ok |
| 50 | — | `立即购买下单成功` | PASS | 0 | ✅ | 断言 |
| 51 | — | `下单后实时库存扣减 1 件` | PASS | 0 | ✅ | 断言 |
| 52 | POST | `/api/order/cancel` | 200 | 0 | ✅ | ok |
| 53 | — | `取消订单后库存回滚` | PASS | 0 | ✅ | 断言 |
| 54 | POST | `/api/order/cancel` | 200 | 2000 | ✅ | 预期失败：重复取消被拦截　要求 HTTP 200 + code 2000 |
| 55 | POST | `/api/order/precreate` | 200 | 0 | ✅ | ok |
| 56 | POST | `/api/pay/notify` | 200 | 0 | ✅ | ok |
| 57 | — | `支付回调返回 SUCCESS` | PASS | 0 | ✅ | 断言 |
| 58 | POST | `/api/pay/notify` | 200 | 0 | ✅ | ok |
| 59 | — | `重复回调幂等（duplicated=true）` | PASS | 0 | ✅ | 断言 |
| 60 | POST | `/api/favorite/toggle` | 200 | 0 | ✅ | ok |
| 61 | GET | `/api/favorite/list` | 200 | 0 | ✅ | ok |
| 62 | POST | `/api/footprint/add` | 200 | 0 | ✅ | ok |
| 63 | GET | `/api/footprint/list` | 200 | 0 | ✅ | ok |
| 64 | POST | `/api/cart/add` | 200 | 2000 | ✅ | 预期失败：超量加购被拦截　要求 HTTP 200 + code 2000 |
| 65 | — | `超量加购返回业务码 2000` | PASS | 0 | ✅ | 断言 |
| 66 | GET | `/api/goods/detail` | 404 | 404 | ✅ | 预期失败：商品不存在　要求 HTTP 404 + code 404 |
| 67 | — | `不存在的商品返回业务码 404` | PASS | 0 | ✅ | 断言 |
| 68 | GET | `/api/not/exist` | 404 | 404 | ✅ | 预期失败：未注册路径　要求 HTTP 404 + code 404 |
| 69 | — | `未注册路径返回 HTTP 404` | PASS | 0 | ✅ | 断言 |
| 70 | DELETE | `/api/cart/remove` | 200 | 0 | ✅ | ok |
| 71 | DELETE | `/api/footprint/clear` | 200 | 0 | ✅ | ok |
| 72 | POST | `/api/address/delete` | 200 | 0 | ✅ | ok |
| 73 | POST | `/api/order/precreate` | 200 | 2000 | ✅ | 预期失败：无收货地址　要求 HTTP 200 + code 2000 |
| 74 | — | `无收货地址时下单被拦截` | PASS | 0 | ✅ | 断言 |
| 75 | POST | `/api/auth/logout` | 200 | 0 | ✅ | ok |
| 76 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 77 | — | `装修页面列表 = 5 个内置页面 + 1 个全局配置项（店铺导航，nav 标记）` | PASS | 0 | ✅ | 断言 |
| 78 | GET | `/api/decorate/lib` | 200 | 0 | ✅ | ok |
| 79 | — | `装修组件库三 tab 数量正确（常用 10 / 基础 54 / 高级实测 2）` | PASS | 0 | ✅ | 断言 |
| 80 | — | `装修组件库已接入 19 种组件，且每个都带 SVG 图标` | PASS | 0 | ✅ | 断言 |
| 81 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 82 | — | `装修首页详情：schema + 区块数据 + 已发布数据` | PASS | 0 | ✅ | 断言 |
| 83 | GET | `/api/decorate/page` | 404 | 404 | ✅ | 预期失败：未知页面　要求 HTTP 404 + code 404 |
| 84 | — | `装修未知页面返回 404` | PASS | 0 | ✅ | 断言 |
| 85 | POST | `/api/decorate/draft` | 200 | 0 | ✅ | ok |
| 86 | — | `装修草稿保存成功` | PASS | 0 | ✅ | 断言 |
| 87 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 88 | — | `草稿与已发布一致时 diff 为 0` | PASS | 0 | ✅ | 断言 |
| 89 | POST | `/api/decorate/discard` | 200 | 0 | ✅ | ok |
| 90 | POST | `/api/decorate/publish` | 200 | 2000 | ✅ | 预期失败：无草稿发布被拦截　要求 HTTP 200 + code 2000 |
| 91 | POST | `/api/decorate/rollback` | 404 | 404 | ✅ | 预期失败：版本不存在　要求 HTTP 404 + code 404 |
| 92 | GET | `/api/decorate/stats` | 200 | 0 | ✅ | ok |
| 93 | — | `装修统计返回目标文件路径` | PASS | 0 | ✅ | 断言 |
| 94 | GET | `/api/decorate/templates` | 200 | 0 | ✅ | ok |
| 95 | — | `装修模板点位返回 2 个模板 + 20 个配额上限` | PASS | 0 | ✅ | 断言 |
| 96 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 97 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 98 | POST | `/api/decorate/page/create` | 200 | 0 | ✅ | ok |
| 99 | — | `新建自定义页面成功并返回小程序路径` | PASS | 0 | ✅ | 断言 |
| 100 | — | `新建后未发布，replica.js 里还没有 CUSTOM_PAGES` | PASS | 0 | ✅ | 断言 |
| 101 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 102 | — | `自定义页在列表里被标记（类型 / 归属 / 数据来源）` | PASS | 0 | ✅ | 断言 |
| 103 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 104 | — | `自定义页的字段结构 = 页面区块 + 页面设置（与首页同构）` | PASS | 0 | ✅ | 断言 |
| 105 | POST | `/api/decorate/draft` | 200 | 1001 | ✅ | 预期失败：自定义页沿用首页的区块校验　要求 HTTP 200 + code 1001 |
| 106 | — | `自定义页沿用首页的区块校验规则` | PASS | 0 | ✅ | 断言 |
| 107 | POST | `/api/decorate/draft` | 200 | 0 | ✅ | ok |
| 108 | POST | `/api/decorate/publish` | 200 | 0 | ✅ | ok |
| 109 | — | `自定义页发布成功` | PASS | 0 | ✅ | 断言 |
| 110 | — | `发布后 replica.js 写入 CUSTOM_PAGES 与页面数据` | PASS | 0 | ✅ | 断言 |
| 111 | — | `replica.js 的导出清单包含 CUSTOM_PAGES` | PASS | 0 | ✅ | 断言 |
| 112 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 113 | — | `发布后该页草稿已清空` | PASS | 0 | ✅ | 断言 |
| 114 | POST | `/api/decorate/page/rename` | 200 | 0 | ✅ | ok |
| 115 | — | `自定义页改名（页面标识迁移）成功` | PASS | 0 | ✅ | 断言 |
| 116 | — | `改名后 replica.js 的键名同步、旧键消失` | PASS | 0 | ✅ | 断言 |
| 117 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 118 | — | `改名后已发布内容不丢` | PASS | 0 | ✅ | 断言 |
| 119 | POST | `/api/decorate/page/delete` | 200 | 2000 | ✅ | 预期失败：内置页不可删除　要求 HTTP 200 + code 2000 |
| 120 | — | `内置页面不可删除` | PASS | 0 | ✅ | 断言 |
| 121 | POST | `/api/decorate/page/rename` | 200 | 2000 | ✅ | 预期失败：内置页不可改名　要求 HTTP 200 + code 2000 |
| 122 | — | `内置页面不可改名` | PASS | 0 | ✅ | 断言 |
| 123 | POST | `/api/decorate/page/create` | 200 | 1001 | ✅ | 预期失败：保留标识　要求 HTTP 200 + code 1001 |
| 124 | — | `与内置页重名的标识被拒绝` | PASS | 0 | ✅ | 断言 |
| 125 | POST | `/api/decorate/page/create` | 200 | 2000 | ✅ | 预期失败：页面名称重复　要求 HTTP 200 + code 2000 |
| 126 | — | `页面名称重复被拒绝` | PASS | 0 | ✅ | 断言 |
| 127 | POST | `/api/decorate/page/delete` | 200 | 0 | ✅ | ok |
| 128 | — | `删除自定义页面成功` | PASS | 0 | ✅ | 断言 |
| 129 | — | `删除后 replica.js 里 CUSTOM_PAGES 整段消失、无残留数据` | PASS | 0 | ✅ | 断言 |
| 130 | — | `删除后仍保留 6 个内置装修字段` | PASS | 0 | ✅ | 断言 |
| 131 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 132 | — | `自检未改变自定义页数量（可重复运行）` | PASS | 0 | ✅ | 断言 |
| 133 | — | `装修台含「新建页面」入口与自定义页改名 / 删除操作` | PASS | 0 | ✅ | 断言 |
| 134 | — | `装修台列表区分内置页 / 自定义页` | PASS | 0 | ✅ | 断言 |
| 135 | — | `固定结构页收起组件库并给出说明（不支持加组件就不给入口）` | PASS | 0 | ✅ | 断言 |
| 136 | — | `小程序端通用自定义页存在，且复用 utils/blocks 的区块渲染` | PASS | 0 | ✅ | 断言 |
| 137 | — | `小程序端自定义页的区块渲染与首页同源（首页也已改用 utils/blocks）` | PASS | 0 | ✅ | 断言 |
| 138 | — | `素材引用检查同时覆盖 商品库 / 已发布页面 / 装修草稿（漏一处就会误删在用图）` | PASS | 0 | ✅ | 断言 |
| 139 | — | `商品图文详情按商品自身数据生成，占位内容仅作最后回落` | PASS | 0 | ✅ | 断言 |
| 140 | — | `评价数据源是持久化的 db.comments，不再由 seed 按 mock 商品生成` | PASS | 0 | ✅ | 断言 |
| 141 | — | `后台评价列表复用 catalog.commentsOf()（评价来源只此一处实现）` | PASS | 0 | ✅ | 断言 |
| 142 | — | `删除商品时连带清理其评价与商家回复（否则留下幽灵评价）` | PASS | 0 | ✅ | 断言 |
| 143 | — | `store 的空库结构包含 comments（老数据文件缺字段时按此自愈）` | PASS | 0 | ✅ | 断言 |
| 144 | — | `自检用固定 code 登录（不再每轮新建客户，客户数稳定）` | PASS | 0 | ✅ | 断言 |
| 145 | — | `自检的库存探针商品取自商品库在售首件（写死 id 会在商品被删后静默失效）` | PASS | 0 | ✅ | 断言 |
| 146 | POST | `/api/media/upload` | 200 | 0 | ✅ | ok |
| 147 | — | `素材上传返回相对路径与真实尺寸（2×2）` | PASS | 0 | ✅ | 断言 |
| 148 | — | `上传的素材可通过 /uploads/ 直接访问（小程序端读的就是它）` | PASS | 0 | ✅ | 断言 |
| 149 | GET | `/api/media/list` | 200 | 0 | ✅ | ok |
| 150 | — | `素材库列表返回统计（张数 / 占用 / 单张上限）` | PASS | 0 | ✅ | 断言 |
| 151 | POST | `/api/media/upload` | 200 | 1001 | ✅ | 预期失败：伪装图片被拒　要求 HTTP 200 + code 1001 |
| 152 | — | `伪装成 png 的文本被拒（按文件头校验）` | PASS | 0 | ✅ | 断言 |
| 153 | POST | `/api/media/delete` | 200 | 1001 | ✅ | 预期失败：路径穿越被拦　要求 HTTP 200 + code 1001 |
| 154 | — | `素材删除接口拦住 ../ 穿越` | PASS | 0 | ✅ | 断言 |
| 155 | POST | `/api/media/delete` | 200 | 0 | ✅ | ok |
| 156 | — | `素材删除成功（自检产生的文件已回收）` | PASS | 0 | ✅ | 断言 |
| 157 | POST | `/api/media/delete` | 200 | 2000 | ✅ | 预期失败：商品图删除被拒　要求 HTTP 200 + code 2000 |
| 158 | — | `商品库在用的图片，素材管理删除时被拒绝且点名「商品库」引用` | PASS | 0 | ✅ | 断言 |
| 159 | — | `商品图文详情：配了 detailImages 就按商品自身数据渲染（不再回落开发期占位文案）` | PASS | 0 | ✅ | 断言 |
| 160 | POST | `/api/media/upload` | 200 | 0 | ✅ | ok |
| 161 | — | `上传时可直接指定归属文件夹（?folder=，文件夹不存在会自动创建）` | PASS | 0 | ✅ | 断言 |
| 162 | — | `按文件夹筛选只返回该文件夹的素材` | PASS | 0 | ✅ | 断言 |
| 163 | — | `未分组筛选（folder=__none__）不含已归类的素材` | PASS | 0 | ✅ | 断言 |
| 164 | — | `素材库列表返回各文件夹计数与未分组张数` | PASS | 0 | ✅ | 断言 |
| 165 | POST | `/api/media/move` | 200 | 0 | ✅ | ok |
| 166 | — | `批量移动素材到另一个文件夹（目标不存在时自动创建）` | PASS | 0 | ✅ | 断言 |
| 167 | POST | `/api/media/folder` | 200 | 2000 | ✅ | 预期失败：改名撞名被拒　要求 HTTP 200 + code 2000 |
| 168 | — | `文件夹改名撞到已存在的名字时被拒绝（否则两个文件夹会被静默合并）` | PASS | 0 | ✅ | 断言 |
| 169 | POST | `/api/media/folder` | 200 | 0 | ✅ | ok |
| 170 | — | `文件夹改名后里面的素材一起跟着改（不会出现「文件夹还在但里面空了」）` | PASS | 0 | ✅ | 断言 |
| 171 | POST | `/api/media/folder` | 200 | 0 | ✅ | ok |
| 172 | — | `删除文件夹只删分类：素材回到未分组而不是被删掉` | PASS | 0 | ✅ | 断言 |
| 173 | POST | `/api/media/folder` | 200 | 1001 | ✅ | 预期失败：非法文件夹名被拒　要求 HTTP 200 + code 1001 |
| 174 | — | `文件夹名含斜杠 / .. 被拒（文件夹是逻辑分类，不产生真实目录）` | PASS | 0 | ✅ | 断言 |
| 175 | — | `自检结束后没有残留的自检文件夹` | PASS | 0 | ✅ | 断言 |
| 176 | — | `自检结束后素材库数量与初始一致（无残留）` | PASS | 0 | ✅ | 断言 |
| 177 | POST | `/api/media/upload` | 200 | 0 | ✅ | ok |
| 178 | — | `视频按 ftyp 魔数被识别为 video/mp4（认文件头，不认扩展名）` | PASS | 0 | ✅ | 断言 |
| 179 | — | `mp4 能读出时长与分辨率（moov→mvhd 拿时长、trak→tkhd 拿宽高）` | PASS | 0 | ✅ | 断言 |
| 180 | — | `/uploads/ 直接访问视频返回 video/mp4 且带 Accept-Ranges` | PASS | 0 | ✅ | 断言 |
| 181 | — | `视频支持 Range 请求（206 + Content-Range）—— 不支持的话小程序 / iOS 直接不播` | PASS | 0 | ✅ | 断言 |
| 182 | — | `kind=video 只返回视频、kind=image 只返回图片（顶栏分档靠它）` | PASS | 0 | ✅ | 断言 |
| 183 | — | `列表统计区分图片 / 视频上限（图片 5MB、视频 50MB）` | PASS | 0 | ✅ | 断言 |
| 184 | POST | `/api/media/upload` | 200 | 1001 | ✅ | 预期失败：伪装视频被拒　要求 HTTP 200 + code 1001 |
| 185 | — | `伪装成 mp4 的文本同样被拒（视频也是按魔数判定）` | PASS | 0 | ✅ | 断言 |
| 186 | — | `视频自检素材已回收（未留下测试视频）` | PASS | 0 | ✅ | 断言 |
| 187 | — | `小程序全部 json 可解析` | PASS | 0 | ✅ | 断言 |
| 188 | — | `usingComponents 字段类型合法（须为对象，写 true 会让模拟器启动失败）` | PASS | 0 | ✅ | 断言 |
| 189 | — | `app.json 无开发者工具不识别的顶层字段` | PASS | 0 | ✅ | 断言 |
| 190 | — | `app.json 声明的页面文件齐全（.js + .wxml）` | PASS | 0 | ✅ | 断言 |
| 191 | — | `tabBar 每个 pagePath 都在 pages 声明里` | PASS | 0 | ✅ | 断言 |
| 192 | — | `sitemapLocation 指向的文件存在` | PASS | 0 | ✅ | 断言 |
| 193 | — | `project.config.json 已填真实 AppID（非占位符）` | PASS | 0 | ✅ | 断言 |
| 194 | — | `小程序 wxml 的 class 引用都在正确作用域内有定义（组件不吃 app.wxss 的 class）` | PASS | 0 | ✅ | 断言 |
| 195 | — | `小程序 hover-class 全部有对应样式（否则是「点了没反应」的哑点击态）` | PASS | 0 | ✅ | 断言 |
| 196 | — | `小程序 var(--token) 引用的令牌全部有定义（漏定义＝该处颜色静默失效）` | PASS | 0 | ✅ | 断言 |
| 197 | — | `装修里每个带跳转的元素，其点击处理都真的走了 openLink（否则真机点了没反应）` | PASS | 0 | ✅ | 断言 |
| 198 | — | `小程序 utils/link.js 的 tabBar 白名单与 app.json 完全一致（漂移＝点 tab 入口失效）` | PASS | 0 | ✅ | 断言 |
| 199 | — | `装修区块的图片/可点元素都能配跳转（缺哪个区块就是「这张图点了没反应」）` | PASS | 0 | ✅ | 断言 |
| 200 | — | `装修 schema 里所有跳转字段都是 link 类型（回退成 text 就等于让运营手敲路径）` | PASS | 0 | ✅ | 断言 |
| 201 | GET | `/api/decorate/link-options` | 200 | 0 | ✅ | ok |
| 202 | — | `GET /api/decorate/link-options 返回可用的跳转目标清单（内置 5 个 tab 页齐全）` | PASS | 0 | ✅ | 断言 |
| 203 | — | `图片广告 images 的结构升级无损且幂等（字符串数组 → { image, link }）` | PASS | 0 | ✅ | 断言 |
| 204 | — | `小程序端 normalizeBlock 同时兼容轮播图的老/新结构（否则老数据首屏白屏）` | PASS | 0 | ✅ | 断言 |
| 205 | — | `装修组件库「基础组件」= 有赞实测 10 组 / 54 个（分组名与数量逐组对齐）` | PASS | 0 | ✅ | 断言 |
| 206 | — | `组件库标记「已接入」的每一项都在 schema 里有真实区块类型（防「假装可用」）` | PASS | 0 | ✅ | 断言 |
| 207 | — | `未接入的组件必须写清「为什么不能接入」（只挂角标不写原因＝运营无从判断）` | PASS | 0 | ✅ | 断言 |
| 208 | — | `每个区块类型的图标键都能在 ICONS 里找到（否则装修台左侧渲染成空白格）` | PASS | 0 | ✅ | 断言 |
| 209 | — | `新增 8 种区块的字段完整性（对照有赞面板逐字段核对，缺字段＝属性面板少一项）` | PASS | 0 | ✅ | 断言 |
| 210 | — | `小程序 templates/blocks.wxml 覆盖全部 19 种区块类型（少一种就是「配了不显示」）` | PASS | 0 | ✅ | 断言 |
| 211 | — | `装修台预览覆盖全部 19 种区块类型，且每种都有中文角标名` | PASS | 0 | ✅ | 断言 |
| 212 | — | `装修台左侧按 lib.groups 分组渲染，且未接入项会展示具体原因` | PASS | 0 | ✅ | 断言 |
| 213 | — | `数据文件的重命名/删除统一走 lib/atomicFile（裸 fs 调用会在 Windows 上偶发 EPERM）` | PASS | 0 | ✅ | 断言 |
| 214 | — | `瞬态错误（EPERM/EBUSY/EACCES）会自动重试，恢复后成功（不能一次失败就放弃）` | PASS | 0 | ✅ | 断言 |
| 215 | — | `非瞬态错误（ENOENT 等）立即抛出、只尝试 1 次` | PASS | 0 | ✅ | 断言 |
| 216 | — | `瞬态错误重试耗尽后仍抛出（不静默当作成功），且带上真实错误码` | PASS | 0 | ✅ | 断言 |
| 217 | — | `writeFileAtomic 采用「写 .tmp → rename 替换」的原子写（防断电写坏数据文件）` | PASS | 0 | ✅ | 断言 |
| 218 | GET | `/api/admin/dashboard` | 200 | 0 | ✅ | ok |
| 219 | — | `后台 · 数据概览返回今日/累计 KPI、待办、趋势、Top 商品` | PASS | 0 | ✅ | 断言 |
| 220 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 221 | — | `后台 · 商品列表返回全量商品（含下架）+ 分类 + 预警线` | PASS | 0 | ✅ | 断言 |
| 222 | GET | `/api/admin/goods/detail` | 200 | 0 | ✅ | ok |
| 223 | — | `后台 · 商品详情返回编辑态商品 + 分类选项` | PASS | 0 | ✅ | 断言 |
| 224 | GET | `/api/admin/category/list` | 200 | 0 | ✅ | ok |
| 225 | — | `后台 · 分类树带每个分类的商品数` | PASS | 0 | ✅ | 断言 |
| 226 | GET | `/api/admin/order/list` | 200 | 0 | ✅ | ok |
| 227 | — | `后台 · 订单列表返回各状态计数与客户信息` | PASS | 0 | ✅ | 断言 |
| 228 | GET | `/api/admin/order/detail` | 200 | 0 | ✅ | ok |
| 229 | — | `后台 · 订单详情返回商品明细、收货地址、金额与物流位` | PASS | 0 | ✅ | 断言 |
| 230 | GET | `/api/admin/order/export` | 200 | 0 | ✅ | ok |
| 231 | — | `后台 · 订单导出 CSV（带 BOM，Excel 打开不乱码）` | PASS | 0 | ✅ | 断言 |
| 232 | POST | `/api/admin/order/ship` | 200 | 0 | ✅ | ok |
| 233 | — | `后台 · 发货接口对不存在的订单给出失败明细（不会误标为已发货）` | PASS | 0 | ✅ | 断言 |
| 234 | POST | `/api/admin/order/remark` | 200 | 0 | ✅ | ok |
| 235 | — | `后台 · 商家备注可写可读，且自检结束时已还原` | PASS | 0 | ✅ | 断言 |
| 236 | POST | `/api/admin/order/close` | 200 | 2000 | ✅ | 预期失败：已支付订单不可关闭　要求 HTTP 200 + code 2000 |
| 237 | — | `后台 · 关闭订单只允许未付款（已支付订单被拦下）` | PASS | 0 | ✅ | 断言 |
| 238 | GET | `/api/admin/customer/list` | 200 | 0 | ✅ | ok |
| 239 | — | `后台 · 客户列表返回消费汇总、分层与标签池` | PASS | 0 | ✅ | 断言 |
| 240 | GET | `/api/admin/customer/detail` | 200 | 0 | ✅ | ok |
| 241 | — | `后台 · 客户详情返回消费统计、订单、地址、券与资产` | PASS | 0 | ✅ | 断言 |
| 242 | GET | `/api/admin/comment/list` | 200 | 0 | ✅ | ok |
| 243 | — | `后台 · 评价列表带商品名与商家回复字段` | PASS | 0 | ✅ | 断言 |
| 244 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 245 | — | `后台 · 评价只挂在商品库真实存在的商品上（无「幽灵评价」）` | PASS | 0 | ✅ | 断言 |
| 246 | GET | `/api/admin/coupon/list` | 200 | 0 | ✅ | ok |
| 247 | — | `后台 · 优惠券模板列表带领取/核销统计` | PASS | 0 | ✅ | 断言 |
| 248 | GET | `/api/admin/coupon/detail` | 200 | 0 | ✅ | ok |
| 249 | — | `后台 · 单个优惠券模板详情可读` | PASS | 0 | ✅ | 断言 |
| 250 | GET | `/api/admin/coupon/detail` | 404 | 404 | ✅ | 预期失败：优惠券不存在　要求 HTTP 404 + code 404 |
| 251 | — | `后台 · 读取不存在的优惠券模板返回 404` | PASS | 0 | ✅ | 断言 |
| 252 | GET | `/api/admin/settings` | 200 | 0 | ✅ | ok |
| 253 | — | `后台 · 店铺设置返回当前值与默认值` | PASS | 0 | ✅ | 断言 |
| 254 | POST | `/api/admin/category/save` | 200 | 0 | ✅ | ok |
| 255 | — | `后台 · 新建一级分类成功` | PASS | 0 | ✅ | 断言 |
| 256 | POST | `/api/admin/goods/save` | 200 | 0 | ✅ | ok |
| 257 | — | `后台 · 新建商品成功（含 2 个 SKU）` | PASS | 0 | ✅ | 断言 |
| 258 | GET | `/api/admin/goods/detail` | 200 | 0 | ✅ | ok |
| 259 | POST | `/api/admin/goods/save` | 200 | 0 | ✅ | ok |
| 260 | GET | `/api/goods/detail` | 200 | 0 | ✅ | ok |
| 261 | — | `后台 · 商品详情长图落库后，小程序端详情按商品自身数据出图（不再回落占位内容）` | PASS | 0 | ✅ | 断言 |
| 262 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 263 | — | `后台 · 新建商品可按关键词搜回，SKU 数为 2` | PASS | 0 | ✅ | 断言 |
| 264 | POST | `/api/admin/goods/stock` | 200 | 0 | ✅ | ok |
| 265 | GET | `/api/goods/detail` | 200 | 0 | ✅ | ok |
| 266 | — | `后台 · 改库存后小程序端读取同一值（库存真源唯一，无二次真源）` | PASS | 0 | ✅ | 断言 |
| 267 | POST | `/api/admin/goods/status` | 200 | 0 | ✅ | ok |
| 268 | GET | `/api/goods/list` | 200 | 0 | ✅ | ok |
| 269 | — | `后台 · 下架后小程序端列表立即不再返回该商品` | PASS | 0 | ✅ | 断言 |
| 270 | POST | `/api/admin/goods/status` | 200 | 0 | ✅ | ok |
| 271 | — | `后台 · 重新上架成功` | PASS | 0 | ✅ | 断言 |
| 272 | POST | `/api/admin/coupon/save` | 200 | 0 | ✅ | ok |
| 273 | — | `后台 · 新建优惠券模板成功` | PASS | 0 | ✅ | 断言 |
| 274 | POST | `/api/admin/coupon/status` | 200 | 0 | ✅ | ok |
| 275 | POST | `/api/coupon/receive` | 200 | 2000 | ✅ | 预期失败：券已停止发放　要求 HTTP 200 + code 2000 |
| 276 | — | `后台 · 暂停券后小程序端不可再领取（状态穿透到 C 端）` | PASS | 0 | ✅ | 断言 |
| 277 | POST | `/api/admin/coupon/delete` | 200 | 0 | ✅ | ok |
| 278 | — | `后台 · 删除未被领取的券模板成功（已领取则拒绝）` | PASS | 0 | ✅ | 断言 |
| 279 | POST | `/api/admin/goods/delete` | 200 | 0 | ✅ | ok |
| 280 | — | `后台 · 删除自检商品成功` | PASS | 0 | ✅ | 断言 |
| 281 | POST | `/api/admin/category/delete` | 200 | 0 | ✅ | ok |
| 282 | — | `后台 · 删除自检分类成功（分类下有商品时会被拒绝）` | PASS | 0 | ✅ | 断言 |
| 283 | POST | `/api/admin/goods/delete` | 404 | 404 | ✅ | 预期失败：商品不存在　要求 HTTP 404 + code 404 |
| 284 | — | `后台 · 删除不存在的商品返回 404` | PASS | 0 | ✅ | 断言 |
| 285 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 286 | — | `后台 · 自建自删后商品库数量回到初始（自检零残留）` | PASS | 0 | ✅ | 断言 |
| 287 | POST | `/api/admin/settings/save` | 200 | 0 | ✅ | ok |
| 288 | GET | `/api/admin/settings` | 200 | 0 | ✅ | ok |
| 289 | GET | `/api/admin/settings` | 200 | 0 | ✅ | ok |
| 290 | — | `后台 · 店铺设置可写可读，且自检结束时已还原原值` | PASS | 0 | ✅ | 断言 |
| 291 | POST | `/api/admin/customer/tag` | 200 | 0 | ✅ | ok |
| 292 | POST | `/api/admin/customer/tag` | 200 | 0 | ✅ | ok |
| 293 | — | `后台 · 客户打标签可用，且自检结束时已还原` | PASS | 0 | ✅ | 断言 |
| 294 | POST | `/api/admin/comment/reply` | 200 | 0 | ✅ | ok |
| 295 | — | `后台 · 回复评价可用（仅挑无回复的评价，测完立即清空）` | PASS | 0 | ✅ | 断言 |
| 296 | GET | `/api/admin/order/list` | 200 | 0 | ✅ | ok |
| 297 | GET | `/api/admin/customer/list` | 200 | 0 | ✅ | ok |
| 298 | — | `后台 · 自检全程未改变真实用户数据规模（订单数 / 客户数一致）` | PASS | 0 | ✅ | 断言 |
| 299 | — | `后台页面内的静态引用在「无尾斜杠 URL」下全部可达（防相对路径 404 白屏）` | PASS | 0 | ✅ | 断言 |
| 300 | — | `后台页面路由可访问且返回 HTML（/console · /admin · /debug · /preview）` | PASS | 0 | ✅ | 断言 |
| 301 | — | `后台控制台、装修台与预览渲染三件套文件齐全` | PASS | 0 | ✅ | 断言 |
| 302 | — | `console.css 里没有裸 .thumb 规则（必须收窄为 img.thumb，否则会命中卡片容器）` | PASS | 0 | ✅ | 断言 |
| 303 | — | `console.css 里存在 img.thumb 规则（表格小方图的 42px 样式有明确归属）` | PASS | 0 | ✅ | 断言 |
| 304 | — | `素材卡片模板用 .mt 作缩略图容器（不回退到 .thumb）` | PASS | 0 | ✅ | 断言 |
| 305 | — | `素材卡片结构 = 缩略图区(.mt) → 信息区(.inf：.nm + .meta) → 操作行(.ft)` | PASS | 0 | ✅ | 断言 |
| 306 | — | `卡片操作行是图标按钮且三个动作齐全（复制链接 / 下载 / 删除）` | PASS | 0 | ✅ | 断言 |
| 307 | — | `已废弃的 .ops2（三枚中文文字按钮）不再出现在 CSS / JS（避免留下死样式）` | PASS | 0 | ✅ | 断言 |
| 308 | — | `采集器（pickImage）也走 .mt 缩略图区（两条链路共用同一套卡片样式）` | PASS | 0 | ✅ | 断言 |
| 309 | — | `console.css 里没有裸 .lb 规则（唯一允许的是图表图例 `.bars .lb`）` | PASS | 0 | ✅ | 断言 |
| 310 | — | `lightbox 根规则带作用域（必须写成 `#layer > .lbx`，否则会再次命中图表图例）` | PASS | 0 | ✅ | 断言 |
| 311 | — | `lightbox 的子规则全部挂在 .lbx 之下（.lb-h / .lb-view / .lb-f … 不得裸用）` | PASS | 0 | ✅ | 断言 |
| 312 | — | `lightbox 根元素的类名是 lbx（JS 里不得回退到裸 lb）` | PASS | 0 | ✅ | 断言 |
| 313 | — | `图表图例样式有明确归属（`.bars .lb` 存在，说明撞车对象仍在且被隔离）` | PASS | 0 | ✅ | 断言 |
| 314 | — | `页面遮挡哨兵脚本存在（真浏览器兜底，防「撞车式黑屏」复发）` | PASS | 0 | ✅ | 断言 |
| 315 | — | `装修台预览走共享渲染核心 pv-render.js，admin.js 里没有第二份实现` | PASS | 0 | ✅ | 断言 |
| 316 | — | `预览页只能编译真机源码（页面 JS + WXML + WXSS），不得有第二份 HTML 近似` | PASS | 0 | ✅ | 断言 |
| 317 | — | `预览页加载了真机渲染三件套（WXSS 转译 · WXML 编译 · 无头运行时），顺序固定` | PASS | 0 | ✅ | 断言 |
| 318 | — | `预览页不叠加装修台样式表（两套基础规则打架 = 预览又不可信了）` | PASS | 0 | ✅ | 断言 |
| 319 | — | `预览页手机屏是 page{} 的落点（.mp-root），否则真机根节点的设计令牌无处生效` | PASS | 0 | ✅ | 断言 |
| 320 | — | `预览页读的是线上内容（replica.js），不去读装修草稿` | PASS | 0 | ✅ | 断言 |
| 321 | — | `/mp-src 源码路由：文本类型放行、非文本拒绝、路径穿越一律 400` | PASS | 0 | ✅ | 断言 |
| 322 | — | `/mp-src 与装修后台同受 DEBUG_PAGE 开关约束（关掉管理页时源码也不能裸奔）` | PASS | 0 | ✅ | 断言 |
| 323 | — | `装修台的产品页预览与真机口径一致（列数 / 选中态 / 左栏宽 / 图片高 / 字号）` | PASS | 0 | ✅ | 断言 |
| 324 | — | `六类编辑装饰全部受 edit 开关控制（漏一处，预览页就会露出真机上没有的角标）` | PASS | 0 | ✅ | 断言 |
| 325 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 326 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 327 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 328 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 329 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 330 | — | `真实已发布数据渲染：展示态无编辑装饰、编辑态保留装饰（两态确实不同）` | PASS | 0 | ✅ | 断言 |
| 331 | — | `店铺导航的候选页面与 app.json 的 tabBar.list 完全一致（微信限制：tabBar 页面必须静态声明）` | PASS | 0 | ✅ | 断言 |
| 332 | — | `app.json 开启自定义 tabBar 且 list 仍完整声明（微信要求 list 必填，缺了直接启动失败）` | PASS | 0 | ✅ | 断言 |
| 333 | — | `导航项数与文案上限锁定微信口径（2~5 项 · 文案 ≤5 字）` | PASS | 0 | ✅ | 断言 |
| 334 | — | `app.json 的 tabBar 配色与 schema 默认值一致（custom:true 后不生效，但它是「初始外观」的说明）` | PASS | 0 | ✅ | 断言 |
| 335 | — | `custom-tab-bar 四件套齐全（目录名与文件名都是微信写死的，不可自定义）` | PASS | 0 | ✅ | 断言 |
| 336 | — | `custom-tab-bar/index.json 声明为组件` | PASS | 0 | ✅ | 断言 |
| 337 | — | `每个 tab 页的 json 都声明了 usingComponents（漏写真机上底部导航整个不渲染，且不报错）` | PASS | 0 | ✅ | 断言 |
| 338 | — | `5 个 tab 页都在 onShow 里同步底部导航高亮（组件实例每页一份，漏一个 = 切过去还高亮着上一个）` | PASS | 0 | ✅ | 断言 |
| 339 | — | `tab 页不自己调 getTabBar()（同步逻辑收敛在 utils/tabbar.js 一处实现）` | PASS | 0 | ✅ | 断言 |
| 340 | — | `高亮按页面路径匹配、未命中置 -1（装修台可改顺序，用序号必然错位；宁可不亮也不错亮）` | PASS | 0 | ✅ | 断言 |
| 341 | — | `点击导航项时不立刻在组件里改高亮（否则与目标页 onShow 的同步打架 → 高亮闪烁）` | PASS | 0 | ✅ | 断言 |
| 342 | — | `底部导航兜底值三处一致（后端 schema / 小程序组件 / 预览渲染 pv-tabbar.js）` | PASS | 0 | ✅ | 断言 |
| 343 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 344 | — | `「店铺导航」以全局配置项出现在装修台列表（belongs=全局设置 · source=replica.TABBAR · nav 标记）` | PASS | 0 | ✅ | 断言 |
| 345 | — | `店铺导航是全局配置，不被当成第 6 个页面混进页面列表（仅 nav 标记一项）` | PASS | 0 | ✅ | 断言 |
| 346 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 347 | — | `店铺导航的字段结构 = 图标样式 / 导航项 / 配色组（由 schema 自动推导，后台表单不硬编码）` | PASS | 0 | ✅ | 断言 |
| 348 | — | `导航项的「跳转页面」是下拉选择，选项恰为 app.json 的 5 个 tabBar 页面` | PASS | 0 | ✅ | 断言 |
| 349 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 350 | POST | `/api/decorate/draft` | 200 | 1001 | ✅ | 预期失败：跳转页面必须是 app.json 里声明过的 tabBar 页面　要求 HTTP 200 + code 1001 |
| 351 | — | `导航项挑了非 tabBar 页面时被拦（否则真机上点了没反应，而开发者工具不报错）` | PASS | 0 | ✅ | 断言 |
| 352 | POST | `/api/decorate/draft` | 200 | 1001 | ✅ | 预期失败：底部导航至少 2 项　要求 HTTP 200 + code 1001 |
| 353 | — | `导航项只有 1 项时被拦（微信要求 2~5 项）` | PASS | 0 | ✅ | 断言 |
| 354 | POST | `/api/decorate/draft` | 200 | 1001 | ✅ | 预期失败：底部导航最多 5 项　要求 HTTP 200 + code 1001 |
| 355 | — | `导航项超过 5 项时被拦（微信要求 2~5 项）` | PASS | 0 | ✅ | 断言 |
| 356 | POST | `/api/decorate/draft` | 200 | 1001 | ✅ | 预期失败：同一个页面只能出现一次　要求 HTTP 200 + code 1001 |
| 357 | — | `同一页面配两次被拦（否则运营配了 4 项、真机只显示 3 项，且两处指向同一页 —— 静默少一项最难查）` | PASS | 0 | ✅ | 断言 |
| 358 | POST | `/api/decorate/draft` | 200 | 0 | ✅ | ok |
| 359 | — | `导航草稿可保存（顺序可改、文案可留空、色值大小写随意）` | PASS | 0 | ✅ | 断言 |
| 360 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 361 | — | `导航改动进入「待发布」状态并给出变更清单` | PASS | 0 | ✅ | 断言 |
| 362 | — | `发布前归一化：去重 / 文案截 5 字 / 空文案回落页面名 / 色值转大写 / 幂等` | PASS | 0 | ✅ | 断言 |
| 363 | POST | `/api/decorate/discard` | 200 | 0 | ✅ | ok |
| 364 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 365 | — | `导航草稿已丢弃，自检对环境零影响（可重复运行）` | PASS | 0 | ✅ | 断言 |
| 366 | — | `发布器把 TABBAR 写进 replica.js 并列入导出清单（未发布过导航时整段省略，向后兼容）` | PASS | 0 | ✅ | 断言 |
| 367 | — | `装修台与 /preview 的底部导航共用唯一实现 pv-tabbar.js（拒绝第二份手抄）` | PASS | 0 | ✅ | 断言 |
| 368 | — | `装修台手机壳与 /preview 都留有底部导航容器（#phTabbar），由 PvTabbar 接管` | PASS | 0 | ✅ | 断言 |
| 369 | — | `装修台已删掉写死的文字导航条，底部导航改为独立可配置入口（列表上方 navCard）` | PASS | 0 | ✅ | 断言 |
| 370 | — | `库存净影响归零：自检消耗的 SKU 库存已补回（可重复运行）` | PASS | 0 | ✅ | 断言 |
| 371 | — | `联调示例里每个 key 都命中已注册点位（无写错路径的静默失效）` | PASS | 0 | ✅ | 断言 |
| 372 | — | `每个点位都带联调示例（调试台可一键填参）` | PASS | 0 | ✅ | 断言 |
| 373 | — | `前端 services 引用的点位后端均已实现（无断链）` | PASS | 0 | ✅ | 断言 |
| 374 | — | `安全开关 · DEBUG_PAGE 判定矩阵全部符合预期（含 off / 拼错值 / 大小写）` | PASS | 0 | ✅ | 断言 |
| 375 | — | `安全开关 · 识别「未知取值」以便启动时告警（避免静默按关闭处理）` | PASS | 0 | ✅ | 断言 |
| 376 | — | `管理接口前缀（admin / decorate / media）单点维护，页面与接口同受一个开关约束` | PASS | 0 | ✅ | 断言 |
| 377 | — | `管理接口有两道门：先页面开关（关掉即 403），再管理员身份与角色` | PASS | 0 | ✅ | 断言 |
| 378 | — | `安全开关 · 生产环境缺 JWT_SECRET 时拒绝启动（不靠人看日志）` | PASS | 0 | ✅ | 断言 |
| 379 | — | `持久化兜底 · 三处存储层都有「解析成功后再验是否为对象」的守卫` | PASS | 0 | ✅ | 断言 |
| 380 | — | `持久化兜底 · isPlainObject 对 null / 数组 / 数字 均判为「非对象」` | PASS | 0 | ✅ | 断言 |
| 381 | GET | `/api/admin/dashboard` | 401 | 401 | ✅ | 预期失败：匿名访问管理接口　要求 HTTP 401 + code 401 |
| 382 | — | `08 · 匿名访问 /api/admin/dashboard 被拒（401 / code 401）` | PASS | 0 | ✅ | 断言 |
| 383 | POST | `/api/admin/goods/delete` | 401 | 401 | ✅ | 预期失败：匿名调用高危写点位　要求 HTTP 401 + code 401 |
| 384 | — | `08 · 匿名调用高危写点位（删商品）被拒（401 / code 401）` | PASS | 0 | ✅ | 断言 |
| 385 | GET | `/api/admin/dashboard` | 401 | 401 | ✅ | 预期失败：小程序用户令牌不能当管理员令牌　要求 HTTP 401 + code 401 |
| 386 | — | `08 · 小程序用户令牌不能冒充管理员令牌（401，而不是「有 token 就放行」）` | PASS | 0 | ✅ | 断言 |
| 387 | — | `08 · 匿名请求全部被拦之后，商品与店铺设置数据一处都没变（拒的是操作，不只是响应）` | PASS | 0 | ✅ | 断言 |
| 388 | GET | `/api/admin/session` | 200 | 0 | ✅ | ok |
| 389 | — | `08 · 管理员会话自述角色与名称（后台据此决定是否弹登录框）` | PASS | 0 | ✅ | 断言 |
| 390 | POST | `/api/admin/login` | 403 | 403 | ✅ | 预期失败：管理员口令错误　要求 HTTP 403 + code 403 |
| 391 | — | `08 · 管理员口令错误被拒（403 / code 403）` | PASS | 0 | ✅ | 断言 |
| 392 | — | `08 · 口令错误时响应体不含任何令牌（不能靠错误信息拿到身份）` | PASS | 0 | ✅ | 断言 |
| 393 | — | `08 · 口令错误 1 次后重新登录仍可用（退避阈值是 5 次，未误伤正常运营）` | PASS | 0 | ✅ | 断言 |
| 394 | GET | `/api/goods/list` | 200 | 0 | ✅ | ok |
| 395 | — | `01 · 公开商品列表每条都带 id + cover（装修「商品」区块读的就是这两个字段）` | PASS | 0 | ✅ | 断言 |
| 396 | — | `07 · cover 是可用地址（http(s) 绝对地址或 /uploads/ 相对路径），没有裸文件名 / undefined / null` | PASS | 0 | ✅ | 断言 |
| 397 | GET | `/api/goods/detail` | 200 | 0 | ✅ | ok |
| 398 | — | `01 · 列表给的 id 能被商品详情命中（区块存的 goodsId 与接口 id 是同一个口径）` | PASS | 0 | ✅ | 断言 |
| 399 | — | `01 / 07 · 装修字段名（goodsId / image）与接口字段名（id / cover）的适配只有 services/goods.js 一处，且统一过素材地址` | PASS | 0 | ✅ | 断言 |
| 400 | GET | `/api/decorate/page/refs` | 200 | 0 | ✅ | ok |
| 401 | — | `11 · 页面引用清单点位可达（改标识 / 删除前先查「谁在引用我」）` | PASS | 0 | ✅ | 断言 |
| 402 | GET | `/api/decorate/page/refs` | 404 | 404 | ✅ | 预期失败：未知页面　要求 HTTP 404 + code 404 |
| 403 | — | `11 · 引用清单查不存在的页面返回 404（不静默返回空清单）` | PASS | 0 | ✅ | 断言 |
| 404 | POST | `/api/admin/settings/save` | 200 | 1001 | ✅ | 预期失败：店铺名称由装修台维护　要求 HTTP 200 + code 1001 |
| 405 | — | `10 · 通过店铺设置接口改「店铺名称」被明确拒绝（code 1001，不是静默忽略）` | PASS | 0 | ✅ | 断言 |
| 406 | POST | `/api/admin/settings/save` | 200 | 1001 | ✅ | 预期失败：店铺 Logo 由装修台维护　要求 HTTP 200 + code 1001 |
| 407 | — | `10 · 通过店铺设置接口改「店铺 Logo」同样被拒（code 1001）` | PASS | 0 | ✅ | 断言 |
| 408 | — | `10 · 两次被拒之后店铺设置未发生任何变化（拒绝发生在写入之前）` | PASS | 0 | ✅ | 断言 |
| 409 | POST | `/api/address/save` | 400 | 1001 | ✅ | 预期失败：非法 JSON 请求体　要求 HTTP 400 + code 1001 |
| 410 | — | `14 · 非法 JSON 请求体返回 400 / code 1001（不再静默变成空对象）` | PASS | 0 | ✅ | 断言 |
| 411 | POST | `/api/address/save` | 400 | 1001 | ✅ | 预期失败：合法 JSON 但不是对象（数组）　要求 HTTP 400 + code 1001 |
| 412 | — | `14 · 合法 JSON 但不是对象（数组）同样 400 / code 1001` | PASS | 0 | ✅ | 断言 |
| 413 | POST | `/api/address/save` | 400 | 1001 | ✅ | 预期失败：合法 JSON 但不是对象（数字）　要求 HTTP 400 + code 1001 |
| 414 | — | `14 · 合法 JSON 但不是对象（数字）同样 400 / code 1001` | PASS | 0 | ✅ | 断言 |
| 415 | POST | `/api/address/save` | 200 | 0 | ✅ | ok |
| 416 | — | `14 · 形如数字的文本字段原样保留（detail=010010 读回仍是字符串，未变成 10010）` | PASS | 0 | ✅ | 断言 |
| 417 | — | `14 · 三条被拒请求一条都没写进数据（地址数回到原值）` | PASS | 0 | ✅ | 断言 |
| 418 | — | `15 · 判定函数：服务端异常（HTTP 5xx / code 5000）在任何情况下都不得被判为通过` | PASS | 0 | ✅ | 断言 |
| 419 | — | `自检汇总口径 = 全部断言的终值（覆盖度与失败数均在最后现算，不漏报本节之后的断言）` | PASS | 0 | ✅ | 断言 |

## 三、覆盖结论

**全部已注册点位均已被实测触达，无遗漏。**

## 五、前后端点位一致性

| 指标 | 值 |
|---|---|
| 前端 services 引用的点位 | 33 |
| 前端引用但后端未实现（断链） | 0 |
| 后端已注册但前端未引用 | 57 |

前端 services 引用的全部点位均已在后端实现，无断链。

后端已注册但前端 services 未引用（属后台 / 微信服务器侧点位，正常）：

- `GET /api/health` 健康检查（运维点位）
- `GET /api/routes` 点位清单（运维点位）
- `POST /api/auth/login` 微信登录（code 换 token）
- `POST /api/auth/logout` 退出登录（服务端无状态，前端清 token 即可）
- `POST /api/order/ship` 发货（联调辅助）
- `POST /api/pay/notify` 微信支付结果回调（验签 + 幂等）
- `POST /api/pay/mock-success` 联调：模拟支付成功（走与真实回调完全相同的处理路径）
- `GET /api/decorate/pages` 装修页面列表（页面名称/归属/状态/区块数/草稿/更新时间）+ 自定义页配额 + 新建模板 + 组件库清单
- `GET /api/decorate/lib` 组件库清单（常用/基础/高级三组，含已接入标记与内联 SVG 图标）
- `GET /api/decorate/page` 单页面装修数据（含字段 schema、已发布数据、草稿、版本历史）
- `GET /api/decorate/templates` 新建页面可选的模板清单 + 自定义页配额（已用 / 上限）
- `POST /api/decorate/page/create` 新建自定义页面。只建后台条目（先不写 replica.js），装修完点「生成代码」才下发到小程序
- `GET /api/decorate/page/refs` 站内引用清单：哪些页面 / 底部导航的哪个字段跳到了这个自定义页（改名与删除前先看它）
- `POST /api/decorate/page/rename` 改自定义页面的名称 / 备注 / 页面标识；改标识会迁移草稿、版本快照与 replica 键名，并保留旧标识别名
- `POST /api/decorate/page/delete` 删除自定义页面：连带清理草稿与版本记录并重新生成 replica.js；被站内引用时须 force=1（内置页不可删）
- `POST /api/decorate/draft` 保存草稿（不影响线上，发布后才生效）
- `POST /api/decorate/discard` 丢弃草稿，恢复为已发布数据
- `GET /api/decorate/diff` 查看草稿相对已发布数据的变更清单
- `POST /api/decorate/publish` 生成代码：写回 miniprogram/config/replica.js（生成前自动备份 + 语法与回读双重校验）。不等于线上生效，仍需上传并发布小程序新版本
- `POST /api/decorate/rollback` 回滚到历史版本（默认仅恢复为草稿，mode=publish 时直接发布）
- `GET /api/decorate/stats` 装修数据统计（草稿数、版本数、数据文件体积、目标文件路径）
- `GET /api/decorate/link-options` 可选跳转目标清单：小程序页面（内置 + 自定义）/ 商品（后端商品库）/ 资讯栏目（replica.NEWS）
- `POST /api/media/upload` 上传素材到本地素材库（multipart 支持多个；?folder= 指定归属文件夹；返回相对路径 /uploads/… 与尺寸、时长）
- `GET /api/media/list` 素材库列表（q 搜索原始名/路径；kind=image|video 分档；folder 筛选，__none__ 表示未分组、不传表示全部；sort=new|old|big|small；page/size 分页；返回 folders 与 kinds 计数、容量统计）
- `POST /api/media/delete` 删除素材（先做引用检查：被页面内容用到时返回引用处数并拒绝，传 force=1 才强删）
- `POST /api/media/folder` 素材文件夹管理：op=create（name）/ rename（from,to）/ remove（name；只删分类，素材回到未分组）
- `POST /api/media/move` 批量移动素材到文件夹（names 传数组或逗号分隔字符串；folder 省略或留空 = 移回未分组；目标文件夹不存在会自动创建）
- `POST /api/admin/login` 管理员登录（口令换会话令牌；生产环境需先设置 ADMIN_PASSWORD）
- `GET /api/admin/session` 当前管理员会话（角色与名称；用于后台启动时判断是否需要登录）
- `GET /api/admin/dashboard` 数据概览（今日/近7日/累计 GMV、订单、客户、库存预警、趋势、Top 商品）
- `GET /api/admin/goods/list` 商品列表（含已下架；状态/分类/关键词/库存预警/排序/分页）
- `GET /api/admin/goods/detail` 商品详情（编辑态，含下架商品）
- `POST /api/admin/goods/save` 新建 / 编辑商品（含 SKU、价格、库存、图片、上下架）
- `POST /api/admin/goods/status` 批量上架 / 下架
- `POST /api/admin/goods/stock` 批量改库存（mode=set 覆盖 / delta 增减）
- `POST /api/admin/goods/delete` 删除商品（有订单记录时拒绝，建议改为下架）
- `GET /api/admin/category/list` 分类树（含每个分类的商品数）
- `POST /api/admin/category/save` 新建 / 重命名分类（parentId 为空则建一级分类）
- `POST /api/admin/category/delete` 删除分类（分类下有商品时拒绝）
- `GET /api/admin/order/list` 订单列表（状态/关键词/时间范围/排序/分页 + 各状态计数）
- `GET /api/admin/order/detail` 订单详情（客户信息、金额、物流、券、备注）
- `POST /api/admin/order/ship` 发货（支持批量；可填物流公司与单号）
- `POST /api/admin/order/remark` 商家备注（仅后台可见）
- `POST /api/admin/order/close` 关闭未付款订单（回滚库存 + 退还券）
- `GET /api/admin/order/export` 导出订单 CSV（返回文本，前端转 Blob 下载）
- `GET /api/admin/customer/list` 客户列表（关键词/分层/标签/排序/分页 + 汇总）
- `GET /api/admin/customer/detail` 客户详情（消费统计、订单、地址、券、资产）
- `POST /api/admin/customer/tag` 客户打标签（append=true 追加，否则覆盖）
- `GET /api/admin/coupon/list` 优惠券模板列表（含领取 / 核销统计）
- `GET /api/admin/coupon/detail` 单个优惠券模板
- `POST /api/admin/coupon/save` 新建 / 编辑优惠券模板
- `POST /api/admin/coupon/status` 启用 / 暂停优惠券（暂停后小程序端不可再领）
- `POST /api/admin/coupon/delete` 删除优惠券模板（已被领取过则拒绝）
- `GET /api/admin/comment/list` 评价列表（可按商品/评分/关键词筛选，含商家回复）
- `POST /api/admin/comment/reply` 回复评价（text 传空字符串则删除回复）
- `GET /api/admin/settings` 运营参数（客服电话/公告/运费/自动确认等，存 catalog.json）+ 小程序端展示信息（店铺名称/头像/标语，只读，真源为装修台 replica.SHOP）+ 资产数量
- `POST /api/admin/settings/save` 保存运营参数（不含店铺名称/Logo —— 那两个字段的唯一数据源是装修台 replica.SHOP，传了会被明确拒绝）
