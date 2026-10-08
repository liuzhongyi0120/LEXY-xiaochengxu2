# 后端点位连通性报告

> 生成时间：2026/10/8 11:08:54　｜　目标服务：`http://127.0.0.1:3000`
> 生成方式：`node server/tools/check-all.mjs`（真实 HTTP 请求，非静态扫描）

## 一、总览

| 指标 | 值 |
|---|---|
| 已注册点位 | 85 |
| 已实测点位 | 85 |
| 未覆盖点位 | 0 |
| 实测请求/断言 | 242 |
| 通过 | 242 |
| 失败 | 0 |
| 服务健康检查 | up |
| 微信能力模式 | 登录 mock / 支付 mock |

## 二、点位明细

| # | 方法 | 路径 / 断言 | HTTP | 业务码 | 结果 | 说明 |
|---|---|---|---|---|---|---|
| 1 | GET | `/api/health` | 200 | 0 | ✅ | ok |
| 2 | GET | `/api/routes` | 200 | 0 | ✅ | ok |
| 3 | GET | `/api/user/profile` | 401 | 401 | ✅ | 预期失败：未登录 401 |
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
| 23 | POST | `/api/address/save` | 200 | 0 | ✅ | ok |
| 24 | GET | `/api/address/list` | 200 | 0 | ✅ | ok |
| 25 | GET | `/api/address/detail` | 200 | 0 | ✅ | ok |
| 26 | POST | `/api/address/setDefault` | 200 | 0 | ✅ | ok |
| 27 | POST | `/api/cart/add` | 200 | 0 | ✅ | ok |
| 28 | GET | `/api/cart/list` | 200 | 0 | ✅ | ok |
| 29 | PUT | `/api/cart/update` | 200 | 0 | ✅ | ok |
| 30 | POST | `/api/cart/selectAll` | 200 | 0 | ✅ | ok |
| 31 | GET | `/api/coupon/available` | 200 | 0 | ✅ | ok |
| 32 | POST | `/api/coupon/receive` | 200 | 0 | ✅ | ok |
| 33 | POST | `/api/coupon/receive` | 200 | 2000 | ✅ | 预期失败：重复领券被拦截 |
| 34 | GET | `/api/coupon/list` | 200 | 0 | ✅ | ok |
| 35 | POST | `/api/order/precreate` | 200 | 0 | ✅ | ok |
| 36 | — | `下单返回支付参数` | PASS | 0 | ✅ | 断言 |
| 37 | GET | `/api/order/detail` | 200 | 0 | ✅ | ok |
| 38 | GET | `/api/order/list` | 200 | 0 | ✅ | ok |
| 39 | GET | `/api/order/count` | 200 | 0 | ✅ | ok |
| 40 | POST | `/api/pay/query` | 200 | 0 | ✅ | ok |
| 41 | POST | `/api/pay/mock-success` | 200 | 0 | ✅ | ok |
| 42 | POST | `/api/pay/query` | 200 | 0 | ✅ | ok |
| 43 | — | `支付后订单转为待发货` | PASS | 0 | ✅ | 断言 |
| 44 | POST | `/api/order/ship` | 200 | 0 | ✅ | ok |
| 45 | POST | `/api/order/confirm` | 200 | 0 | ✅ | ok |
| 46 | GET | `/api/order/detail` | 200 | 0 | ✅ | ok |
| 47 | — | `确认收货后订单完成` | PASS | 0 | ✅ | 断言 |
| 48 | POST | `/api/order/precreate` | 200 | 0 | ✅ | ok |
| 49 | — | `立即购买下单成功` | PASS | 0 | ✅ | 断言 |
| 50 | — | `下单后实时库存扣减 1 件` | PASS | 0 | ✅ | 断言 |
| 51 | POST | `/api/order/cancel` | 200 | 0 | ✅ | ok |
| 52 | — | `取消订单后库存回滚` | PASS | 0 | ✅ | 断言 |
| 53 | POST | `/api/order/cancel` | 200 | 2000 | ✅ | 预期失败：重复取消被拦截 |
| 54 | POST | `/api/order/precreate` | 200 | 0 | ✅ | ok |
| 55 | POST | `/api/pay/notify` | 200 | 0 | ✅ | ok |
| 56 | — | `支付回调返回 SUCCESS` | PASS | 0 | ✅ | 断言 |
| 57 | POST | `/api/pay/notify` | 200 | 0 | ✅ | ok |
| 58 | — | `重复回调幂等（duplicated=true）` | PASS | 0 | ✅ | 断言 |
| 59 | POST | `/api/favorite/toggle` | 200 | 0 | ✅ | ok |
| 60 | GET | `/api/favorite/list` | 200 | 0 | ✅ | ok |
| 61 | POST | `/api/footprint/add` | 200 | 0 | ✅ | ok |
| 62 | GET | `/api/footprint/list` | 200 | 0 | ✅ | ok |
| 63 | POST | `/api/cart/add` | 200 | 2000 | ✅ | 预期失败：超量加购被拦截 |
| 64 | — | `超量加购返回业务码 2000` | PASS | 0 | ✅ | 断言 |
| 65 | GET | `/api/goods/detail` | 404 | 404 | ✅ | 预期失败：商品不存在 |
| 66 | — | `不存在的商品返回业务码 404` | PASS | 0 | ✅ | 断言 |
| 67 | GET | `/api/not/exist` | 404 | 404 | ✅ | 预期失败：未注册路径 |
| 68 | — | `未注册路径返回 HTTP 404` | PASS | 0 | ✅ | 断言 |
| 69 | DELETE | `/api/cart/remove` | 200 | 0 | ✅ | ok |
| 70 | DELETE | `/api/footprint/clear` | 200 | 0 | ✅ | ok |
| 71 | POST | `/api/address/delete` | 200 | 0 | ✅ | ok |
| 72 | POST | `/api/order/precreate` | 200 | 2000 | ✅ | 预期失败：无收货地址 |
| 73 | — | `无收货地址时下单被拦截` | PASS | 0 | ✅ | 断言 |
| 74 | POST | `/api/auth/logout` | 200 | 0 | ✅ | ok |
| 75 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 76 | — | `装修页面列表返回 5 个页面` | PASS | 0 | ✅ | 断言 |
| 77 | GET | `/api/decorate/lib` | 200 | 0 | ✅ | ok |
| 78 | — | `装修组件库三 tab 数量正确（常用 10 / 基础 53 / 高级 19）` | PASS | 0 | ✅ | 断言 |
| 79 | — | `装修组件库已接入 11 种组件，且每个都带 SVG 图标` | PASS | 0 | ✅ | 断言 |
| 80 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 81 | — | `装修首页详情：schema + 区块数据 + 已发布数据` | PASS | 0 | ✅ | 断言 |
| 82 | GET | `/api/decorate/page` | 404 | 404 | ✅ | 预期失败：未知页面 404 |
| 83 | — | `装修未知页面返回 404` | PASS | 0 | ✅ | 断言 |
| 84 | POST | `/api/decorate/draft` | 200 | 0 | ✅ | ok |
| 85 | — | `装修草稿保存成功` | PASS | 0 | ✅ | 断言 |
| 86 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 87 | — | `草稿与已发布一致时 diff 为 0` | PASS | 0 | ✅ | 断言 |
| 88 | POST | `/api/decorate/discard` | 200 | 0 | ✅ | ok |
| 89 | POST | `/api/decorate/publish` | 200 | 2000 | ✅ | 预期失败：无草稿发布被拦截 |
| 90 | POST | `/api/decorate/rollback` | 200 | 2000 | ✅ | 预期失败：版本不存在 |
| 91 | GET | `/api/decorate/stats` | 200 | 0 | ✅ | ok |
| 92 | — | `装修统计返回目标文件路径` | PASS | 0 | ✅ | 断言 |
| 93 | GET | `/api/decorate/templates` | 200 | 0 | ✅ | ok |
| 94 | — | `装修模板点位返回 2 个模板 + 20 个配额上限` | PASS | 0 | ✅ | 断言 |
| 95 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 96 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 97 | POST | `/api/decorate/page/create` | 200 | 0 | ✅ | ok |
| 98 | — | `新建自定义页面成功并返回小程序路径` | PASS | 0 | ✅ | 断言 |
| 99 | — | `新建后未发布，replica.js 里还没有 CUSTOM_PAGES` | PASS | 0 | ✅ | 断言 |
| 100 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 101 | — | `自定义页在列表里被标记（类型 / 归属 / 数据来源）` | PASS | 0 | ✅ | 断言 |
| 102 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 103 | — | `自定义页的字段结构 = 页面区块 + 页面设置（与首页同构）` | PASS | 0 | ✅ | 断言 |
| 104 | POST | `/api/decorate/draft` | 200 | 1001 | ✅ | 预期失败：自定义页沿用首页的区块校验 |
| 105 | — | `自定义页沿用首页的区块校验规则` | PASS | 0 | ✅ | 断言 |
| 106 | POST | `/api/decorate/draft` | 200 | 0 | ✅ | ok |
| 107 | POST | `/api/decorate/publish` | 200 | 0 | ✅ | ok |
| 108 | — | `自定义页发布成功` | PASS | 0 | ✅ | 断言 |
| 109 | — | `发布后 replica.js 写入 CUSTOM_PAGES 与页面数据` | PASS | 0 | ✅ | 断言 |
| 110 | — | `replica.js 的导出清单包含 CUSTOM_PAGES` | PASS | 0 | ✅ | 断言 |
| 111 | GET | `/api/decorate/diff` | 200 | 0 | ✅ | ok |
| 112 | — | `发布后该页草稿已清空` | PASS | 0 | ✅ | 断言 |
| 113 | POST | `/api/decorate/page/rename` | 200 | 0 | ✅ | ok |
| 114 | — | `自定义页改名（页面标识迁移）成功` | PASS | 0 | ✅ | 断言 |
| 115 | — | `改名后 replica.js 的键名同步、旧键消失` | PASS | 0 | ✅ | 断言 |
| 116 | GET | `/api/decorate/page` | 200 | 0 | ✅ | ok |
| 117 | — | `改名后已发布内容不丢` | PASS | 0 | ✅ | 断言 |
| 118 | POST | `/api/decorate/page/delete` | 200 | 2000 | ✅ | 预期失败：内置页不可删除 |
| 119 | — | `内置页面不可删除` | PASS | 0 | ✅ | 断言 |
| 120 | POST | `/api/decorate/page/rename` | 200 | 1001 | ✅ | 预期失败：内置页不可改名 |
| 121 | — | `内置页面不可改名` | PASS | 0 | ✅ | 断言 |
| 122 | POST | `/api/decorate/page/create` | 200 | 1001 | ✅ | 预期失败：保留标识 |
| 123 | — | `与内置页重名的标识被拒绝` | PASS | 0 | ✅ | 断言 |
| 124 | POST | `/api/decorate/page/create` | 200 | 1001 | ✅ | 预期失败：页面名称重复 |
| 125 | — | `页面名称重复被拒绝` | PASS | 0 | ✅ | 断言 |
| 126 | POST | `/api/decorate/page/delete` | 200 | 0 | ✅ | ok |
| 127 | — | `删除自定义页面成功` | PASS | 0 | ✅ | 断言 |
| 128 | — | `删除后 replica.js 里 CUSTOM_PAGES 整段消失、无残留数据` | PASS | 0 | ✅ | 断言 |
| 129 | — | `删除后仍保留 6 个内置装修字段` | PASS | 0 | ✅ | 断言 |
| 130 | GET | `/api/decorate/pages` | 200 | 0 | ✅ | ok |
| 131 | — | `自检未改变自定义页数量（可重复运行）` | PASS | 0 | ✅ | 断言 |
| 132 | — | `装修台含「新建页面」入口与自定义页改名 / 删除操作` | PASS | 0 | ✅ | 断言 |
| 133 | — | `装修台列表区分内置页 / 自定义页` | PASS | 0 | ✅ | 断言 |
| 134 | — | `小程序端通用自定义页存在，且复用 utils/blocks 的区块渲染` | PASS | 0 | ✅ | 断言 |
| 135 | — | `小程序端自定义页的区块渲染与首页同源（首页也已改用 utils/blocks）` | PASS | 0 | ✅ | 断言 |
| 136 | POST | `/api/media/upload` | 200 | 0 | ✅ | ok |
| 137 | — | `素材上传返回相对路径与真实尺寸（2×2）` | PASS | 0 | ✅ | 断言 |
| 138 | — | `上传的素材可通过 /uploads/ 直接访问（小程序端读的就是它）` | PASS | 0 | ✅ | 断言 |
| 139 | GET | `/api/media/list` | 200 | 0 | ✅ | ok |
| 140 | — | `素材库列表返回统计（张数 / 占用 / 单张上限）` | PASS | 0 | ✅ | 断言 |
| 141 | POST | `/api/media/upload` | 200 | 1001 | ✅ | 预期失败：伪装图片被拒 |
| 142 | — | `伪装成 png 的文本被拒（按文件头校验）` | PASS | 0 | ✅ | 断言 |
| 143 | POST | `/api/media/delete` | 200 | 1001 | ✅ | 预期失败：路径穿越被拦 |
| 144 | — | `素材删除接口拦住 ../ 穿越` | PASS | 0 | ✅ | 断言 |
| 145 | POST | `/api/media/delete` | 200 | 0 | ✅ | ok |
| 146 | — | `素材删除成功（自检产生的文件已回收）` | PASS | 0 | ✅ | 断言 |
| 147 | — | `自检结束后素材库数量与初始一致（无残留）` | PASS | 0 | ✅ | 断言 |
| 148 | — | `小程序全部 json 可解析` | PASS | 0 | ✅ | 断言 |
| 149 | — | `usingComponents 字段类型合法（须为对象，写 true 会让模拟器启动失败）` | PASS | 0 | ✅ | 断言 |
| 150 | — | `app.json 无开发者工具不识别的顶层字段` | PASS | 0 | ✅ | 断言 |
| 151 | — | `app.json 声明的页面文件齐全（.js + .wxml）` | PASS | 0 | ✅ | 断言 |
| 152 | — | `tabBar 每个 pagePath 都在 pages 声明里` | PASS | 0 | ✅ | 断言 |
| 153 | — | `sitemapLocation 指向的文件存在` | PASS | 0 | ✅ | 断言 |
| 154 | — | `project.config.json 已填真实 AppID（非占位符）` | PASS | 0 | ✅ | 断言 |
| 155 | GET | `/api/admin/dashboard` | 200 | 0 | ✅ | ok |
| 156 | — | `后台 · 数据概览返回今日/累计 KPI、待办、趋势、Top 商品` | PASS | 0 | ✅ | 断言 |
| 157 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 158 | — | `后台 · 商品列表返回全量商品（含下架）+ 分类 + 预警线` | PASS | 0 | ✅ | 断言 |
| 159 | GET | `/api/admin/goods/detail` | 200 | 0 | ✅ | ok |
| 160 | — | `后台 · 商品详情返回编辑态商品 + 分类选项` | PASS | 0 | ✅ | 断言 |
| 161 | GET | `/api/admin/category/list` | 200 | 0 | ✅ | ok |
| 162 | — | `后台 · 分类树带每个分类的商品数` | PASS | 0 | ✅ | 断言 |
| 163 | GET | `/api/admin/order/list` | 200 | 0 | ✅ | ok |
| 164 | — | `后台 · 订单列表返回各状态计数与客户信息` | PASS | 0 | ✅ | 断言 |
| 165 | GET | `/api/admin/order/detail` | 200 | 0 | ✅ | ok |
| 166 | — | `后台 · 订单详情返回商品明细、收货地址、金额与物流位` | PASS | 0 | ✅ | 断言 |
| 167 | GET | `/api/admin/order/export` | 200 | 0 | ✅ | ok |
| 168 | — | `后台 · 订单导出 CSV（带 BOM，Excel 打开不乱码）` | PASS | 0 | ✅ | 断言 |
| 169 | POST | `/api/admin/order/ship` | 200 | 0 | ✅ | ok |
| 170 | — | `后台 · 发货接口对不存在的订单给出失败明细（不会误标为已发货）` | PASS | 0 | ✅ | 断言 |
| 171 | POST | `/api/admin/order/remark` | 200 | 0 | ✅ | ok |
| 172 | — | `后台 · 商家备注可写可读，且自检结束时已还原` | PASS | 0 | ✅ | 断言 |
| 173 | POST | `/api/admin/order/close` | 200 | 2000 | ✅ | 预期失败：已支付订单不可关闭 |
| 174 | — | `后台 · 关闭订单只允许未付款（已支付订单被拦下）` | PASS | 0 | ✅ | 断言 |
| 175 | GET | `/api/admin/customer/list` | 200 | 0 | ✅ | ok |
| 176 | — | `后台 · 客户列表返回消费汇总、分层与标签池` | PASS | 0 | ✅ | 断言 |
| 177 | GET | `/api/admin/customer/detail` | 200 | 0 | ✅ | ok |
| 178 | — | `后台 · 客户详情返回消费统计、订单、地址、券与资产` | PASS | 0 | ✅ | 断言 |
| 179 | GET | `/api/admin/comment/list` | 200 | 0 | ✅ | ok |
| 180 | — | `后台 · 评价列表带商品名与商家回复字段` | PASS | 0 | ✅ | 断言 |
| 181 | GET | `/api/admin/coupon/list` | 200 | 0 | ✅ | ok |
| 182 | — | `后台 · 优惠券模板列表带领取/核销统计` | PASS | 0 | ✅ | 断言 |
| 183 | GET | `/api/admin/coupon/detail` | 200 | 0 | ✅ | ok |
| 184 | — | `后台 · 单个优惠券模板详情可读` | PASS | 0 | ✅ | 断言 |
| 185 | GET | `/api/admin/coupon/detail` | 404 | 404 | ✅ | 预期失败：优惠券不存在 |
| 186 | — | `后台 · 读取不存在的优惠券模板返回 404` | PASS | 0 | ✅ | 断言 |
| 187 | GET | `/api/admin/settings` | 200 | 0 | ✅ | ok |
| 188 | — | `后台 · 店铺设置返回当前值与默认值` | PASS | 0 | ✅ | 断言 |
| 189 | POST | `/api/admin/category/save` | 200 | 0 | ✅ | ok |
| 190 | — | `后台 · 新建一级分类成功` | PASS | 0 | ✅ | 断言 |
| 191 | POST | `/api/admin/goods/save` | 200 | 0 | ✅ | ok |
| 192 | — | `后台 · 新建商品成功（含 2 个 SKU）` | PASS | 0 | ✅ | 断言 |
| 193 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 194 | — | `后台 · 新建商品可按关键词搜回，SKU 数为 2` | PASS | 0 | ✅ | 断言 |
| 195 | POST | `/api/admin/goods/stock` | 200 | 0 | ✅ | ok |
| 196 | GET | `/api/goods/detail` | 200 | 0 | ✅ | ok |
| 197 | — | `后台 · 改库存后小程序端读取同一值（库存真源唯一，无二次真源）` | PASS | 0 | ✅ | 断言 |
| 198 | POST | `/api/admin/goods/status` | 200 | 0 | ✅ | ok |
| 199 | GET | `/api/goods/list` | 200 | 0 | ✅ | ok |
| 200 | — | `后台 · 下架后小程序端列表立即不再返回该商品` | PASS | 0 | ✅ | 断言 |
| 201 | POST | `/api/admin/goods/status` | 200 | 0 | ✅ | ok |
| 202 | — | `后台 · 重新上架成功` | PASS | 0 | ✅ | 断言 |
| 203 | POST | `/api/admin/coupon/save` | 200 | 0 | ✅ | ok |
| 204 | — | `后台 · 新建优惠券模板成功` | PASS | 0 | ✅ | 断言 |
| 205 | POST | `/api/admin/coupon/status` | 200 | 0 | ✅ | ok |
| 206 | POST | `/api/coupon/receive` | 200 | 2000 | ✅ | 预期失败：券已停止发放 |
| 207 | — | `后台 · 暂停券后小程序端不可再领取（状态穿透到 C 端）` | PASS | 0 | ✅ | 断言 |
| 208 | POST | `/api/admin/coupon/delete` | 200 | 0 | ✅ | ok |
| 209 | — | `后台 · 删除未被领取的券模板成功（已领取则拒绝）` | PASS | 0 | ✅ | 断言 |
| 210 | POST | `/api/admin/goods/delete` | 200 | 0 | ✅ | ok |
| 211 | — | `后台 · 删除自检商品成功` | PASS | 0 | ✅ | 断言 |
| 212 | POST | `/api/admin/category/delete` | 200 | 0 | ✅ | ok |
| 213 | — | `后台 · 删除自检分类成功（分类下有商品时会被拒绝）` | PASS | 0 | ✅ | 断言 |
| 214 | POST | `/api/admin/goods/delete` | 404 | 404 | ✅ | 预期失败：商品不存在 |
| 215 | — | `后台 · 删除不存在的商品返回 404` | PASS | 0 | ✅ | 断言 |
| 216 | GET | `/api/admin/goods/list` | 200 | 0 | ✅ | ok |
| 217 | — | `后台 · 自建自删后商品库数量回到初始（自检零残留）` | PASS | 0 | ✅ | 断言 |
| 218 | POST | `/api/admin/settings/save` | 200 | 0 | ✅ | ok |
| 219 | GET | `/api/admin/settings` | 200 | 0 | ✅ | ok |
| 220 | GET | `/api/admin/settings` | 200 | 0 | ✅ | ok |
| 221 | — | `后台 · 店铺设置可写可读，且自检结束时已还原原值` | PASS | 0 | ✅ | 断言 |
| 222 | POST | `/api/admin/customer/tag` | 200 | 0 | ✅ | ok |
| 223 | POST | `/api/admin/customer/tag` | 200 | 0 | ✅ | ok |
| 224 | — | `后台 · 客户打标签可用，且自检结束时已还原` | PASS | 0 | ✅ | 断言 |
| 225 | POST | `/api/admin/comment/reply` | 200 | 0 | ✅ | ok |
| 226 | — | `后台 · 回复评价可用（仅挑无回复的评价，测完立即清空）` | PASS | 0 | ✅ | 断言 |
| 227 | GET | `/api/admin/order/list` | 200 | 0 | ✅ | ok |
| 228 | GET | `/api/admin/customer/list` | 200 | 0 | ✅ | ok |
| 229 | — | `后台 · 自检全程未改变真实用户数据规模（订单数 / 客户数一致）` | PASS | 0 | ✅ | 断言 |
| 230 | — | `后台页面内的静态引用在「无尾斜杠 URL」下全部可达（防相对路径 404 白屏）` | PASS | 0 | ✅ | 断言 |
| 231 | — | `后台页面路由可访问且返回 HTML（/console · /admin · /debug）` | PASS | 0 | ✅ | 断言 |
| 232 | — | `后台控制台与装修台必需文件齐全` | PASS | 0 | ✅ | 断言 |
| 233 | — | `库存净影响归零：自检消耗的 SKU 库存已补回（可重复运行）` | PASS | 0 | ✅ | 断言 |
| 234 | — | `联调示例里每个 key 都命中已注册点位（无写错路径的静默失效）` | PASS | 0 | ✅ | 断言 |
| 235 | — | `每个点位都带联调示例（调试台可一键填参）` | PASS | 0 | ✅ | 断言 |
| 236 | — | `前端 services 引用的点位后端均已实现（无断链）` | PASS | 0 | ✅ | 断言 |
| 237 | — | `安全开关 · DEBUG_PAGE 判定矩阵全部符合预期（含 off / 拼错值 / 大小写）` | PASS | 0 | ✅ | 断言 |
| 238 | — | `安全开关 · 识别「未知取值」以便启动时告警（避免静默按关闭处理）` | PASS | 0 | ✅ | 断言 |
| 239 | — | `安全开关 · 管理接口（admin/decorate/media）与页面同受一个开关约束` | PASS | 0 | ✅ | 断言 |
| 240 | — | `安全开关 · 生产环境缺 JWT_SECRET 时拒绝启动（不靠人看日志）` | PASS | 0 | ✅ | 断言 |
| 241 | — | `持久化兜底 · 三处存储层都有「解析成功后再验是否为对象」的守卫` | PASS | 0 | ✅ | 断言 |
| 242 | — | `持久化兜底 · isPlainObject 对 null / 数组 / 数字 均判为「非对象」` | PASS | 0 | ✅ | 断言 |

## 三、覆盖结论

**全部已注册点位均已被实测触达，无遗漏。**

## 五、前后端点位一致性

| 指标 | 值 |
|---|---|
| 前端 services 引用的点位 | 33 |
| 前端引用但后端未实现（断链） | 0 |
| 后端已注册但前端未引用 | 51 |

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
- `POST /api/decorate/page/create` 新建自定义页面。只建后台条目（先不写 replica.js），装修完点「发布」才下发到小程序
- `POST /api/decorate/page/rename` 改自定义页面的名称 / 备注 / 页面标识；改标识会连带迁移草稿、版本快照与 replica 里的键名
- `POST /api/decorate/page/delete` 删除自定义页面：连带清理草稿与版本记录，并重新生成 replica.js 去掉该页（内置页不可删）
- `POST /api/decorate/draft` 保存草稿（不影响线上，发布后才生效）
- `POST /api/decorate/discard` 丢弃草稿，恢复为已发布数据
- `GET /api/decorate/diff` 查看草稿相对已发布数据的变更清单
- `POST /api/decorate/publish` 发布：写回 miniprogram/config/replica.js（发布前自动备份 + 语法与回读双重校验）
- `POST /api/decorate/rollback` 回滚到历史版本（默认仅恢复为草稿，mode=publish 时直接发布）
- `GET /api/decorate/stats` 装修数据统计（草稿数、版本数、数据文件体积、目标文件路径）
- `POST /api/media/upload` 上传图片到本地素材库（multipart 支持多张；返回相对路径 /uploads/… 与 w×h 尺寸）
- `GET /api/media/list` 素材库列表（q 搜索原始名/路径，sort=new|old|big|small，page/size 分页，附用量与容量统计）
- `POST /api/media/delete` 删除素材（先做引用检查：被页面内容用到时返回引用处数并拒绝，传 force=1 才强删）
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
- `GET /api/admin/settings` 店铺设置（店铺名/Logo/客服电话/公告/运费/自动确认收货等）
- `POST /api/admin/settings/save` 保存店铺设置
