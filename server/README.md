# 莱克企业商城小程序 · 自建后端

零第三方依赖（仅 Node 内置模块），`node server/index.js` 即可启动。

---

## 一、启动

```bash
# 在工程根目录
node server/index.js

# 换端口
PORT=8080 node server/index.js
```

启动后：

```
监听地址   http://127.0.0.1:3000
后台控制台 http://127.0.0.1:3000/console
店铺装修台 http://127.0.0.1:3000/admin
接口调试台 http://127.0.0.1:3000/debug
点位总数   85 个（业务 83 + 运维 2，其中需登录 32 个）
数据文件   server/data/db.json        （用户业务数据：订单 / 用户 / 购物车 / 券 / 地址 …）
资产文件   server/data/catalog.json   （运营资产：商品 / 分类 / 券模板 / 店铺设置）
素材目录   server/data/uploads/       （对外访问 /uploads/…，单张上限 5MB）
```

> ⚠️ 页面资源一律用**绝对路径**（`/console/console.core.js`）。页面路由 `/console`、`/admin` 都没有尾斜杠，
> 写 `./console.core.js` 会被解析成 `/console.core.js` → 404 → 脚本整段不执行、页面一片空白。
> 这条已由自检的「页面静态引用可达性」断言兜住。

### 接口调试台（/debug）

浏览器打开 `http://127.0.0.1:3000/debug`（或直接访问根路径 `/` 自动跳转），即可可视化调试全部点位：

- **点位树**：按业务域分组、可搜索，方法徽标着色，🔒 标记需登录，「联调」标记辅助点位；清单从 `GET /api/routes` 实时拉取，后端加点位这里自动出现
- **一键填参**：每个点位的示例参数维护在 `server/routes/samples.js`，随点位清单一起下发，选中即自动填入
- **变量池**：示例参数支持 `{{goodsId}}` 等占位符；登录、保存地址、加购、下单成功后自动回填真实 ID，链路参数不用手动复制
- **一键全链路**：登录 → 地址 → 加购 → 勾选 → 下单 → 模拟支付 → 查单 → 发货 → 确认收货，9 步逐步显示结果与耗时
- **响应区**：HTTP 状态 / 业务码 / 耗时 / 体积，JSON 语法高亮，支持复制响应与等价 cURL
- **请求历史**：最近 40 条，点击回填参数
- **风控演示**：清登录态后请求受保护点位，可直接看到 401 分支的返回

> 线上部署请设置 `DEBUG_PAGE=off`（或 `NODE_ENV=production`）。
> 它关闭的**不只是页面**——`/debug`、`/admin`、`/console` 三个页面**与** `/api/admin/*`、`/api/decorate/*`、`/api/media/*` 三类运营管理接口会**同进同退**，全部返回 403。
> 取值：`1`/`on`/`true`/`yes` 开启；`0`/`off`/`false`/`no` 关闭；**拼错的值按关闭处理**（安全开关失败必须往安全侧倒）。
> 例外：`/uploads/…` 静态图片不受开关影响（那是小程序线上内容，必须始终可访问）。

### 店铺装修台（/admin）

对标有赞「店铺装修」编辑器（`store.youzan.com/v4/deco/decorate#/edit/<id>`），**逐个页面可视化修改小程序前端**。

#### 页面管理（对标有赞「店铺页面」列表）

列表页有两种页面：

| 类型 | 来源 | 可否删除 | 说明 |
|---|---|---|---|
| **内置页**（5 个） | `replica.js` 的固定字段 | 不可 | 首页 / 莱克 / 资讯 / 产品 / 我的，与 `app.json`、tabBar 一一对应 |
| **自定义页**（≤20 个） | 装修台「+ 新建页面」 | 可 | 数据写入 `replica.CUSTOM_PAGES[key]`，小程序端经 `pages/custom/index?key=标识` 访问，用于活动落地页 / 投放页 |

新建自定义页的规则：

- **页面名称**：必填、≤30 字、同店铺内不可重名
- **页面标识**：选填（留空自动生成 `p1`、`p2`…）；2~24 位小写字母 / 数字 / 连字符，字母开头；与内置页重名会被拒绝
- **初始内容**：空白页 / 复制首页（复制的是当前已发布的首页区块，改副本不影响首页）
- **先不写 replica.js**：新建只建后台条目，装修完点「立即发布」才下发到小程序 —— 防止手滑建个空页面就把线上覆盖
- 改「页面标识」会连带迁移草稿、版本快照与 `replica.CUSTOM_PAGES` 的键名（旧访问地址随即失效）
- 删除会连带清理草稿与版本记录，并**立即重新生成 `replica.js`** 去掉该页 —— 否则小程序端还会按旧 key 打开一个「幽灵页」

#### 编辑器四区布局（与有赞一一对应）

| 区域 | 有赞对应 | 本项目实现 |
|---|---|---|
| 左一 · 组件库 | `.coms-lib-header-tab` 三 tab | 常用组件（10）/ 基础组件（**54**，按有赞真实 **10 个分组**展示）/ 高级组件（店铺侧装了什么就有什么），每项内联 SVG 图标 |
| 左二 · 页面布局 | `.preview-page-manager-wrapper` | 组件大纲：拖拽排序、上移下移、复制、删除；底部「页面设置」入口 |
| 中间 · 手机预览 | 跨域 iframe 预览 | 机型可选（320 / 375 / 414），真实素材渲染，点选区块联动，选中时浮出圆形操作条 |
| 右侧 · 属性面板 | `.decorate-editor-wrap` | 完全由 schema 驱动，见下表 |

#### 属性面板控件体系（对标有赞控件）

| 控件 | 有赞对应 | 用途 |
|---|---|---|
| `template` | `.select-template-item` | 展示形态选择器，带 SVG 缩略图（如图片广告 4 种形态） |
| `radiobutton` | `.deco-radio-button-group` | 描边按钮组（方角 / 圆角） |
| `switch` | 开关 | 布尔项（自动播放 / 视频声音 / 循环） |
| `slider` | `.zent-slider` | 数值（高度 / 切换速度 / 页面边距），滑块 + 数值框双向联动 |
| `color` | 取色器 | 颜色选择 + hex 输入 + 重置 |
| `select` / `number` / `text` / `textarea` | 原生控件 | 常规字段 |
| `image` | 图片选择 | 点「选择图片」打开三 tab 选择器：**本地上传 / 素材库 / 外链地址**；缩略图支持「点击放大」「拖拽本地图片直接上传替换」「清空」 |
| `link` | 链接选择器 | 跳转目标：回显「人能看懂的名字 + 真实路径」，可点「选择链接」从**页面（内置 5 + 自定义）/ 商品（商品库）/ 资讯栏目**里挑（带搜索），也可直接手填路径、`tel:` 或 `https://`。留空即不跳转 |
| `list` | 列表管理 | 卡片式列表项，支持上移 / 下移 / 复制 / 删除，受 `max` 上限约束 |
| `readonly` | 只读展示 | 不可编辑的键值（如内容页标识） |
| `group` + `collapsed` | `.deco-control-group__label` | 可折叠分组（如视频的「播放设置 4 项」「更多设置 2 项」） |
| `union` | 组件类型联合 | 首页区块 **19** 种类型的字段联合体 |

#### 已接入的 19 种组件

**第一批（11 种）**：图片广告（4 种展示形态）/ 单张图片 / 视频 / 标题文本 / 辅助分割 / 公告 / 图文导航 / 魔方 / 热区切图 / 店铺信息 / 商品。

**第二批（8 种，2026-10-08 全量拆解有赞 `edit/142448593` 后补齐）**：

| 组件 | 关键能力（字段严格对齐有赞面板） |
|---|---|
| 富文本 | HTML 图文混排，`<script>`/`onerror`/`javascript:` 一律过滤；「全屏显示」控制是否忽略页面边距 |
| 商品搜索 | 占位文字 / 输入搜索 或 整块跳转 / 正常 或 吸顶 / 方形或圆角 / 文本居左居中 / 框体高度 / 扫一扫 / 背景·框体·文字三色 → 点击进商品列表页并自动聚焦（`?focus=1`） |
| 电梯导航 | 横向滚动 或 下拉展示；标签 4 种风格（背景 / 圆框 / 方框 / 下划线）；每个标签配「定位到区块」（填区块序号，与有赞「只能定位到本组件下方」同义）→ 小程序端 `wx.pageScrollTo({ selector: '#blk-N' })` |
| 进入店铺 | 文案 / 对齐 / 文字色 / 按钮底色 / 方角圆角 / 点击跳转 |
| 语音 | 微信对话气泡样式；时长控气泡宽（160+duration×24，夹在 220~520rpx）；居左居右；头像可回落到店铺 logo；「暂停后从头开始 / 从暂停位置开始」→ `InnerAudioContext` |
| 在线客服 | `<button open-type="contact">` 唤起微信客服 |
| 内容卡片 | 专题图文卡片列表（一行一个 / 两列）；图片比例 1:1 / 4:3 / 16:9；卡片样式 投影·无边白底·无边透明底；笔记标签 / 阅读数 / 点赞数 / 查看更多 |
| 购买按钮 | 固定吸底下单按钮（一页只支持一个）；商品 ID / 文案 / 字号 / 左右·底边距 / 按钮高宽·角度 / 跟随店铺风格或自定义配色 / 背景开关与背景高度 |

组件库中未接入的组件（基础 **35** 个）会**灰显并标注「未接入」**，鼠标悬停与点击都会给出**具体原因**（如「商品分组：需要『商品分组』这一数据维度，本后台商品库暂无分组字段」），不做「假装可用」。

#### 元素跳转（每个图片 / 可点元素都能配跳转）

装修里**凡是有图或能点的元素**都能配跳转目标，落点经四段链路：`schema` 字段 → 后台控件 / 弹层 → `replica.js` 存字符串 → 小程序 `openLink` 执行。

| 位置 | 跳转粒度 |
|---|---|
| 图片广告（4 种形态） | **每张图各自独立**（`images: [{ image, link }]`，列表项右侧 🔗 按钮单独设置） |
| 单张图片 / 标题文本 / 公告 / 店铺信息 | 整块一个 |
| 图文导航 / 魔方 | **每个图标格各自独立**（`items[].link`） |
| 热区切图 | **每个热区各自独立**（`areas[].link`） |
| 莱克页 / 产品页 | 系列主图、分组头图各一个；系列商品图、型号卡片**每张独立**（产品页型号卡片可直跳商品详情） |

跳转值只存一个字符串，支持四类：小程序页面路径（如 `/pages/news/news`）、商品详情路径（如 `/packageGoods/detail/detail?id=g1001`）、`tel:13800000000`（拨号）、`https://…`（复制链接）。后台弹层负责把它翻译成人看得懂的名字，运营不必背路径。

**两个必须知道的约束**（已由自检断言锁死，改坏会 FAIL）：

1. **tabBar 页面必须用 `wx.switchTab`**：用 `wx.navigateTo` 打开首页 / 莱克 / 资讯 / 产品 / 我的会**直接失败且不报错**，真机表现就是「点了没反应」。收敛在 `miniprogram/utils/link.js` 一份实现里，白名单与 `app.json` 的 `tabBar.list` 由自检比对。
2. **`images` 结构升级是幂等的**：轮播图片从「地址字符串数组」升为 `[{ image, link }]`，`schema.upgradeBlock()` 跑两遍结果一致；小程序端 `normalizeBlock()` **同时吃老新两种结构**，因为运营没点发布时 `replica.js` 还是旧数据，不兼容就是首屏白屏。`test-emit.mjs` 的无损校验基准也已过同一个升级函数。

#### 草稿 - 发布模型

- 编辑只改草稿（存 `server/data/decorate/state.json`），**绝不触碰正在运行的小程序**
- 点「立即发布」才写回 `miniprogram/config/replica.js`：发布前自动备份（保留 20 份）、`vm.Script` 语法校验 + 回读校验双重兜底，任一失败自动回滚原文件
- 「查看变更」逐字段 diff（新增 / 删除 / 修改）；「版本历史」最近 20 个版本，可恢复为草稿或恢复并发布

#### 两个已修复的真实缺陷（均有回归测试锁定）

1. **`PAGE_META` 会丢页**：`PAGE_META` 是跨 5 个页面的**聚合字段**。原实现按页累加时若某页 `meta` 为 `undefined`（例如回滚到还没有该字段的旧快照），
   `Object.assign({}, out.PAGE_META, { home: undefined })` 会把已写好的 `home` 覆盖成 `undefined`，JSON 序列化后该键直接消失 → 前端读不到该页背景色。
   修复：`schema.setPageMeta()` 缺值时回落该页默认值；`store.assemble()` 在一页写入后**补齐全部 5 页**。回归测试 `.tooling/test-pagemeta.mjs`（13 项）。
2. **弹层一直显示**：`.modal{display:flex}` 这条作者样式优先级高于 UA 样式表的 `[hidden]{display:none}`，
   导致带 `hidden` 属性的弹层永远盖在页面上。修复：`admin.css` 开头加 `[hidden] { display: none !important; }` 全局兜底。

#### 安全性设计

发布器经过**无损性验证**——把当前数据走一遍「提取 → 生成 → 回读」，与原文件逐字段哈希一致（`.tooling/test-emit.mjs`，7 个字段全 `✓`），因此发布等价于把数据原样写回；前端 5 个页面本就由 `replica.js` 驱动，发布后小程序重新编译即可看到新内容，无需改代码。

#### 自动化测试脚本

| 脚本 | 覆盖 |
|---|---|
| `.tooling/test-emit.mjs` | 生成器无损性（7 字段哈希一致 + 语法校验） |
| `.tooling/test-pagemeta.mjs` | `PAGE_META` 丢键回归 + emit 端到端（13 项） |
| `.tooling/test-publish-e2e.mjs` | 真实 HTTP 全链路：改草稿 → diff → 发布 → 核对 replica.js → 回滚还原（18 项） |
| `.tooling/test-media.mjs` | 素材库全链路：上传 → 落盘核对 → 静态访问 → 列表 → 引用检查 → 删除 → 越权/穿越拦截（48 项） |
| `.tooling/probe-custom.cjs` | 自定义页 lib 层全生命周期（40 项，篡改数据文件后自动复原） |
| `.tooling/probe-custom-http.cjs` | 自定义页 HTTP 层（36 项） |
| `.tooling/probe-link-publish.mjs` | 装修跳转字段发布链路：给莱克页 / 产品页配跳转 → 存草稿 → 发布 → 核对 `replica.js` 真的写入且其余字段无损 → 改回原值再发布，最后比对数据指纹与基线一致（43 项，全程走公开接口、不残留草稿） |
| `.tooling/probe-unlink-race.mjs` | 素材「上传 → 立刻删除」瞬态错误压力测试（默认 15 轮，用于验证 `atomicFile` 的重试是否够用） |
| `.tooling/probe-resilience.cjs` | 持久化层韧性：三份数据文件被改成 `null`/`123`/`"abc"`/`[]` 时**备份 + 重建而非崩掉**（18 项，全程备份复原并逐字节校验） |
| `.tooling/probe-newblocks.cjs` | 新增 8 种区块端到端：建临时页 → 存草稿 → 发布 → 回读 `replica.js` 逐字段核对 → 小程序端 `normalizeBlocks` 派生字段（rpx / 撑高比例 / 映射）→ 删页复原（17 项，零残留） |
| `.tooling/yz-extract.mjs` | 有赞装修编辑器组件面板抓取（逐个「加一个 → 抓面板 → 立刻删一个」，产物 `.tooling/_yz-panels.json` 为 54 个组件的中文面板字段原文） |
| `node server/tools/check-all.mjs` | 全量点位连通性自检（86 点位 / 274 断言，含装修、自定义页面全生命周期、素材库、后台控制台往返、安全开关判定矩阵、持久化兜底守卫、**数据落盘原子写与瞬态重试**、**WXSS 作用域与设计令牌静态校验**、**装修跳转链路校验**、**组件库全量对账 + 19 种区块端到端覆盖**、**商品库图片的删除保护与商品图文详情**；含小程序配置与页面资源可达性静态校验） |

**装修相关点位（14 个，`/api/decorate/*`）**：页面列表 / 组件库清单 / 页面详情 / 保存草稿 / 丢弃草稿 / 查看变更 / 发布 / 回滚 / 统计 / 可选跳转目标清单 / 模板与配额 / 新建自定义页 / 改页面信息 / 删自定义页。这些点位未开启 JWT 鉴权（当前无管理端账号体系），**正式环境请在网关层加访问控制**；设置 `DEBUG_PAGE=off` 也能把它们连同页面一起关掉（但网关层鉴权仍是首选，因为那个开关是「全开或全关」，做不到按角色细分）。

**后台控制台点位（28 个，`/api/admin/*`）**：数据概览 / 商品 6 / 分类 3 / 订单 6 / 客户 3 / 优惠券 5 / 评价 2 / 店铺设置 2。同样免登录，**上线必须加访问控制**（见「上线前必做」）。

---

### 后台控制台（/console）

对标有赞的店铺后台，一页管完日常运营：**上架商品、看订单、发货、看客户、发券、回评、改店铺设置**。

浏览器打开 `http://127.0.0.1:3000/console`。纯浏览器端零依赖实现（`console.core.js` + `console.modules.js` + `console.css`），不引入任何框架或 CDN。

**左侧导航（10 个模块）**

| 模块 | 能做什么 |
|---|---|
| 数据概览 | 今日 / 近 7 日 / 近 30 日 / 累计 GMV 与订单数、待办（待发货 · 待付款 · 库存预警）、7 日趋势柱图、Top 5 商品、最近订单 |
| 商品管理 | 列表（关键词 / 分类 / 上下架 / 库存预警 / 排序 / 分页）、批量上下架、批量改库存、新建与编辑（多 SKU 表格 + 图片槽位）、删除 |
| 分类管理 | 一级 / 二级分类增删改，显示每个分类下的商品数 |
| 订单管理 | 状态分栏 + 时间范围 + 关键词检索、批量发货、商家备注、关闭未付款订单、CSV 导出、订单详情（商品明细 / 收货地址 / 金额 / 物流 / 客户画像） |
| 客户管理 | 客户列表（分层：新客 / 活跃 / VIP，可按标签与消费排序）、客户详情（消费统计 / 订单 / 地址 / 券 / 收藏足迹）、打标签 |
| 优惠券 | 券模板列表（领取数 / 核销数）、新建与编辑（满减 / 折扣）、启用与暂停、删除 |
| 评价管理 | 评价列表（按商品 / 评分 / 关键词筛选）、商家回复（可清空回复） |
| 素材库 | 复用 `/api/media/*`：上传（点击 / 拖拽 / 粘贴）、搜索、排序、复制地址、删除 |
| 店铺设置 | 店铺名 / Logo / 客服电话 / 服务时间 / 公告 / 包邮开关 / 默认运费 / 自动确认收货天数 / 支付超时分钟数 |
| 店铺装修 | 内嵌 `/admin` 装修台，一个入口切换「装修」与「运营」 |

**几个关键设计**

- **商品库是可写持久化的**：商品原本来自 `miniprogram/mock/data.js` 的只读种子，现已落到 `server/data/catalog.json`，
  与用户业务数据（`db.json`）**分库**。后台改价 / 改库存 / 上下架，小程序端下次请求即生效。
- **库存真源唯一**：`db.stocks[skuId]` 是唯一真源（下单扣减、取消回滚都写它）。商品自带的 `stock` 只是初始值，
  读取时统一由 `withLiveStock()` 覆盖 —— 后台改库存、小程序下单、订单取消三者永远对得上。
- **券模板状态穿透到 C 端**：后台把券暂停后，小程序端领券接口会直接拒绝，不是只有后台列表变个颜色。
- **商品图文详情按商品自身数据渲染**：`detail()` 的 `detailBlocks` 由 `buildDetailBlocks(goods)` 生成
  （`description` 文字 + `detailImages` 长图，最多 20 张），只有两者都为空时才回落开发期占位内容 ——
  否则从有赞搬来的真实商品，详情区会一直显示「本页为开发阶段演示内容」。
- **商品图也受素材删除保护**：素材的「是否被引用」同时扫 **商品库 / 已发布 `replica.js` / 装修草稿**三处。
  曾漏掉商品库，商品图在素材管理里显示「未引用」，运营一点删除就把在用的商品图删没了。
- **分步写回**：订单发货物逐单返回成功 / 失败明细，状态不符的订单只进 `failed` 数组，不会被误标为已发货。

---

### 素材库 · 图片本地上传（/api/media/*）

装修后台里的图片可以**直接从本地上传**，不再依赖外链。零第三方依赖：`multipart/form-data` 由 `server/lib/media.js` 自行解析（无需 multer），同时也支持 JSON + base64 / dataURL。

**点位（3 个，全部免登录，与装修台同属运营管理功能）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/media/upload` | 上传图片。multipart 支持一次多张；返回相对路径 `/uploads/…`、真实尺寸 `w×h`、体积；单张失败不影响其它（返回 `failedList`） |
| GET | `/api/media/list` | 素材库列表：`q` 搜索原始名/路径、`sort=new\|old\|big\|small`、`page/size` 分页，附 `stat`（张数 / 总占用 / 单张上限） |
| POST | `/api/media/delete` | 删除素材。**先做引用检查**：被商品库（`catalog.json`）、已发布页面（`replica.js`）或装修草稿引用时返回引用处数并拒绝，传 `force=1` 才强删 |

**落盘与访问**

```
server/data/uploads/<yyyyMM>/<yyyymmdd>-<随机6位>.<ext>   ← 文件
server/data/uploads/index.json                            ← 原始文件名 / 尺寸 / 上传时间
GET /uploads/<yyyyMM>/<文件名>                            ← 对外访问（带 ETag，7 天缓存）
```

`/uploads/` 的静态服务**不受 `DEBUG_PAGE` 开关影响**——上传的图片是小程序线上的正式内容，关掉管理页面也必须能访问。

**为什么存相对路径而不是绝对 URL**

上传返回的是 `/uploads/202610/xxx.png` 这样的**相对路径**，不写死域名。好处是上线换服务器 / 换域名时，历史数据里的图片地址完全不用动，
小程序端只改 `miniprogram/utils/constants.js` 的 `BASE_URL` 一处即可全部跟随（解析逻辑在 `miniprogram/utils/asset.js` 的 `resolveAssets()`，
5 个 tab 页的 `data` 装配时统一过一遍）。外链（如历史数据里的有赞 CDN 图）与 `/pages/xx` 站内路径原样保留，不受影响。

**上传安全策略**

| 项 | 策略 |
|---|---|
| 类型校验 | 读**文件头魔数**判定真实类型，不信任 `content-type` 与扩展名（把 .exe 改名成 .png 也传不上来） |
| 放行格式 | PNG / JPG / WebP / GIF 四种位图 |
| SVG | **拒收**。同源下 SVG 可执行脚本，直链打开即构成存储型 XSS（`/uploads` 与 `/admin` 同源） |
| 单张上限 | 5MB（超限拒绝，磁盘不留垃圾文件） |
| 超长文件名 | 落盘名由服务端生成（时间 + 随机段），原始名仅存索引用于检索 |
| 路径穿越 | 删除接口只允许删索引内条目；静态服务拦截 `..`、反斜杠、编码后的穿越 |
| 磁盘清理 | 索引中文件已丢失的条目在列表时自动剔除（索引自愈） |

**后台使用方式**（`/admin` → 任意图片字段）

- 「选择图片」打开三 tab 选择器：**本地上传**（拖拽 / 点选 / 截图后 Ctrl+V 粘贴，带真实上传进度）/ **素材库**（搜索、排序、缩略图多选、卡片内删除）/ **外链地址**（粘 CDN 链接，兼容历史数据）
- 图片列表里的「+ 新增」同样走该选择器，可**一次多选批量加入**，每项还有「⟳ 替换」按钮
- 把本地图片**直接拖到图片缩略图上**即可上传并替换
- 预览区的轮播指示点可点击翻页，用来确认刚加进去的图在第几张

> **上线前必须处理**：`/api/media/upload` 是文件写入接口，当前无鉴权。正式环境务必在网关层加访问控制（或独立域名 + 签名），否则任何人都能往服务器写文件、占满磁盘。

小程序端把 `miniprogram/utils/constants.js` 的 `ENV` 设为 `local` 即可联调（已默认设为 `local`）。

> **联调必做**：微信开发者工具 → 详情 → 本地设置 → 勾选
> 「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」。
> 原因：小程序正式环境只允许 HTTPS，本机调试走 http 必须临时关闭校验。
> 真机调试时把 `local` 的地址换成本机局域网 IP（如 `http://192.168.0.10:3000`），手机与电脑需同网段。

---

## 二、环境变量

| 变量 | 说明 | 不配置时 |
|---|---|---|
| `PORT` | 监听端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `JWT_SECRET` | JWT 签名密钥（**上线必配**） | 开发默认值，启动日志会告警 |
| `JWT_TTL` | token 有效期（秒） | `604800`（7 天） |
| `WX_APPID` / `WX_SECRET` | 小程序 AppID / Secret | 登录、手机号走**本地模拟** |
| `WX_MCH_ID` / `WX_PAY_KEY` | 微信支付商户号 / API 密钥 | 支付走**沙箱参数** |
| `ALLOW_MOCK_PAY` | 是否开放模拟支付点位 | 非 production 且未配商户号时默认开启 |
| `DEBUG_PAGE` | 管理后台总开关：`/debug` `/admin` `/console` 三个页面 **+ `/api/admin/*` `/api/decorate/*` `/api/media/*` 三类管理接口** 一起开或关 | 未设置时跟随环境：非 production 开、production 关；`0`/`off`/`false`/`no` 关，其它值一律按关处理 |
| `JWT_SECRET` | 登录态签名密钥 | 开发期有默认值；**`NODE_ENV=production` 且未设置时进程直接拒绝启动**（默认密钥是公开的，会让任何人伪造登录态） |

**双模式设计**：未配置微信参数时，`code2Session` 与支付下单走本地模拟实现，
保证开发期「每个点位都能联络通畅」，无需等待商户号与证书审批；配置后自动切换真实接口。

---

## 三、点位清单

用 `GET /api/routes` 可随时拉取完整清单。运维点位：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（含微信能力模式、点位总数） |
| GET | `/api/routes` | 点位清单（联调期核对用） |

### 鉴权与用户（6）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/login` | 否 | `{code}` → `{token, userId, isNew, profile}` |
| POST | `/api/auth/refresh` | 是 | 续期 token |
| POST | `/api/auth/logout` | 是 | 退出（服务端无状态） |
| GET | `/api/user/profile` | 是 | 用户信息 |
| POST | `/api/user/profile` | 是 | 更新昵称 / 头像 |
| POST | `/api/user/phone` | 是 | 绑定手机号 |

### 商品与首页（5）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/home` | 否 | 首页聚合（轮播 / 分类入口 / 推荐） |
| GET | `/api/goods/categories` | 否 | 分类树（含二级） |
| GET | `/api/goods/list` | 否 | 列表：`categoryId, keyword, sort, page, size` |
| GET | `/api/goods/detail` | 否 | 详情：SKU 矩阵 + 图文 + 推荐 |
| GET | `/api/goods/comments` | 否 | 评价列表（含平均分、好评率） |

### 购物车（5）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/cart/list` | 是 | 列表 |
| POST | `/api/cart/add` | 是 | 加购（校验库存） |
| PUT | `/api/cart/update` | 是 | 改数量 / 勾选 |
| DELETE | `/api/cart/remove` | 是 | 批量移除 |
| POST | `/api/cart/selectAll` | 是 | 全选 / 全不选 |

### 交易（7）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/order/precreate` | 是 | 预下单（重算金额 + 锁库存 + 核销券 + 返回支付参数） |
| GET | `/api/order/list` | 是 | 订单列表（按状态筛选、分页） |
| GET | `/api/order/detail` | 是 | 订单详情（含物流节点） |
| GET | `/api/order/count` | 是 | 各状态数量（角标） |
| POST | `/api/order/cancel` | 是 | 取消未支付单（回滚库存 + 退还券） |
| POST | `/api/order/confirm` | 是 | 确认收货 |
| POST | `/api/order/ship` | 是 | 发货（联调辅助，真实环境由后台 / ERP 触发） |

### 支付（3）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/pay/notify` | 否 | 微信支付结果回调（**微信服务器调用**，验签 + 幂等） |
| POST | `/api/pay/query` | 是 | 查询支付结果（结果页轮询） |
| POST | `/api/pay/mock-success` | 是 | 联调：模拟支付成功（走与真实回调**完全相同**的处理路径） |

### 用户资产（13）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/address/list` | 是 | 地址列表 |
| GET | `/api/address/detail` | 是 | 地址详情 |
| POST | `/api/address/save` | 是 | 新增 / 编辑（第一条自动设默认） |
| POST | `/api/address/delete` | 是 | 删除（删默认后自动补位） |
| POST | `/api/address/setDefault` | 是 | 设为默认 |
| GET | `/api/coupon/list` | 是 | 我的券（`status: available/used/expired`） |
| GET | `/api/coupon/available` | 是 | 下单页可用券（服务端判定可用性 + 抵扣额） |
| POST | `/api/coupon/receive` | 是 | 领券 |
| GET | `/api/favorite/list` | 是 | 收藏列表 |
| POST | `/api/favorite/toggle` | 是 | 收藏 / 取消 |
| GET | `/api/footprint/list` | 是 | 浏览记录 |
| POST | `/api/footprint/add` | 是 | 记录浏览 |
| DELETE | `/api/footprint/clear` | 是 | 清空浏览记录 |

### 店铺装修（14）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/decorate/pages` | 否 | 页面列表（含组件库清单、自定义页配额与新建模板） |
| GET | `/api/decorate/templates` | 否 | 新建模板清单 + 自定义页配额（已用 / 上限 20） |
| POST | `/api/decorate/page/create` | 否 | 新建自定义页面（只建后台条目，发布后才下发小程序） |
| POST | `/api/decorate/page/rename` | 否 | 改自定义页名称 / 备注 / 标识（标识变更会迁移草稿、版本与 replica 键名） |
| POST | `/api/decorate/page/delete` | 否 | 删除自定义页面（清草稿与版本，并重新生成 `replica.js`） |
| GET | `/api/decorate/lib` | 否 | 组件库清单（常用 / 基础 / 高级三 tab，含 SVG 图标；基础组件另带 `groups` 真实分组、每项 `ok` 是否已接入与 `why` 未接入原因） |
| GET | `/api/decorate/page` | 否 | 单页详情（schema + 已发布 + 草稿 + 版本） |
| POST | `/api/decorate/draft` | 否 | 保存草稿 |
| POST | `/api/decorate/discard` | 否 | 丢弃草稿 |
| GET | `/api/decorate/diff` | 否 | 草稿 vs 已发布变更清单 |
| POST | `/api/decorate/publish` | 否 | 发布（写回 `replica.js`，双重校验 + 失败回滚） |
| POST | `/api/decorate/rollback` | 否 | 回滚历史版本（`mode=publish` 可直接发布） |
| GET | `/api/decorate/stats` | 否 | 装修数据统计 |
| GET | `/api/decorate/link-options` | 否 | 可选跳转目标清单（小程序页面 / 商品 / 资讯栏目），供装修台「选择链接」弹层使用 |

### 素材库（3）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/media/upload` | 否 | 上传图片（multipart 多张 / JSON base64），返回相对路径与尺寸 |
| GET | `/api/media/list` | 否 | 素材列表：`q` / `sort` / `page` / `size` + 用量统计 |
| POST | `/api/media/delete` | 否 | 删除素材（被页面引用时需 `force=1`） |

### 后台控制台（28）

供后台控制台 `server/public/console` 使用，全部免登录（`auth: false`）。

| 分组 | 方法 · 路径 | 说明 |
|---|---|---|
| 概览 | GET `/api/admin/dashboard` | 今日 / 近 7 日 / 近 30 日 / 累计 GMV、待办、状态计数、趋势、Top 商品、库存预警、最近订单 |
| 商品 | GET `/api/admin/goods/list` | 全量商品（含下架）：关键词 / 分类 / 状态 / 库存预警 / 排序 / 分页 |
| | GET `/api/admin/goods/detail` | 编辑态商品（含下架）+ 分类选项 |
| | POST `/api/admin/goods/save` | 新建 / 编辑商品（含 SKU、价格、库存、图片） |
| | POST `/api/admin/goods/status` | 批量上架 / 下架 |
| | POST `/api/admin/goods/stock` | 批量改库存（`set` 覆盖 / `delta` 增减） |
| | POST `/api/admin/goods/delete` | 删除商品（被订单引用时拒绝，建议改为下架） |
| 分类 | GET `/api/admin/category/list` | 分类树 + 每个分类的商品数 |
| | POST `/api/admin/category/save` | 新建 / 重命名分类 |
| | POST `/api/admin/category/delete` | 删除分类（分类下有商品时拒绝） |
| 订单 | GET `/api/admin/order/list` | 状态 / 关键词 / 时间范围 / 排序 / 分页 + 各状态计数 |
| | GET `/api/admin/order/detail` | 商品明细、地址、金额、物流、客户画像、用券 |
| | POST `/api/admin/order/ship` | 批量发货，逐单返回成功 / 失败明细 |
| | POST `/api/admin/order/remark` | 商家备注（仅后台可见，空串即清空） |
| | POST `/api/admin/order/close` | 关闭未付款订单（回滚库存 + 退还券） |
| | GET `/api/admin/order/export` | 导出订单 CSV（带 BOM） |
| 客户 | GET `/api/admin/customer/list` | 客户列表（分层 / 标签 / 排序 / 分页 + 汇总） |
| | GET `/api/admin/customer/detail` | 消费统计、订单、地址、券、收藏 / 足迹 |
| | POST `/api/admin/customer/tag` | 打标签（`append` 追加，否则覆盖） |
| 优惠券 | GET `/api/admin/coupon/list` | 券模板列表 + 领取 / 核销统计 |
| | GET `/api/admin/coupon/detail` | 单个券模板 |
| | POST `/api/admin/coupon/save` | 新建 / 编辑券模板（满减 / 折扣） |
| | POST `/api/admin/coupon/status` | 启用 / 暂停（暂停后 C 端不可再领） |
| | POST `/api/admin/coupon/delete` | 删除券模板（被领取过则拒绝） |
| 评价 | GET `/api/admin/comment/list` | 评价列表（按商品 / 评分 / 关键词筛选，含商家回复） |
| | POST `/api/admin/comment/reply` | 回复评价（`text` 传空串即删除回复） |
| 设置 | GET `/api/admin/settings` | 店铺设置当前值 + 默认值 + 资产数量 |
| | POST `/api/admin/settings/save` | 保存店铺设置 |

> 装修 14 个 + 素材 3 个 + 后台 28 个免登录点位均属运营管理功能，**上线必须在网关层加访问控制**（见「上线前必做」）。设置 `DEBUG_PAGE=off` 可把它们连同三个管理页面一起关掉（返回 403），但那是「全有或全无」，替代不了按角色的登录态鉴权。

---

## 四、核心约定

### 响应结构

```json
{ "code": 0, "msg": "ok", "data": {} }        // 成功
{ "code": 2000, "msg": "库存不足", "data": null }  // 业务失败（HTTP 通常仍为 200）
{ "code": 401, "msg": "登录态已失效，请重新登录", "data": null }  // HTTP 401
```

业务码：`0` 成功 ｜ `1001` 参数错误 ｜ `401` 未登录 ｜ `403` 无权限 ｜ `404` 不存在 ｜ `2000` 通用业务失败 ｜ `5000` 服务端异常

### 金额

**全站统一用「分」为单位的整数**传输与存储，仅渲染时除 100。前端 `utils/format.js` 的 `money()` / `splitPrice()` 负责换算。

### 装修区块的尺寸单位（易踩坑）

装修数据里 `height` 与其它尺寸字段**单位不同**，混用会让真机上「图片特别大、被切边」：

| 字段 | 单位 | 小程序端 | 后台预览（375 宽画布） |
|---|---|---|---|
| `height`（轮播 / 视频 / 辅助分割 / 热区） | **rpx**（750 宽基准） | 直接用 | `÷ 2` |
| `pageMargin` / `paddingY` / `iconSize` / `gap` / `imageGap` | **px**（375 宽基准） | `× 2` | 原样使用 |

- 为什么 `height` 是 rpx：它取自真实页面里图片的渲染高度，设计稿基准是 750 宽。例如首屏海报在 375 宽下渲染 661px → 存 `1322`。
- 单图区块（`image`）用 `mode="widthFix"`，高度由图片原比例决定，`height` 字段不参与渲染。
- 换算函数只此一份：`miniprogram/utils/units.js`（`px2rpx` / `heightRpx`），回归测试 `.tooling/test-layout.mjs`。
- 区块渲染也只此一份：`miniprogram/utils/blocks.js`（`normalizeBlock` / `normalizeBlocks` / `loadGoodsData`）。首页与装修台新建的自定义页共用它，避免两边各写一套后逐渐走样。

### 数据落盘：一律走 `lib/atomicFile.js`

所有数据文件（`db.json` / `catalog.json` / `state.json` / `custom-pages.json` / `replica.js` / 素材 `index.json`）都采用**「写 `.tmp` → `rename` 替换」的原子写**，防止进程中断留下半个文件。

但在 Windows 上 `rename` / `unlink` 会**偶发**抛 `EPERM` —— 目标文件恰好被实时杀毒扫描、或被上一轮的读句柄瞬时占用都会触发。实测：连续 15 轮「上传素材 → 立刻删除」必现一次 `EPERM: rename 'index.json.tmp' -> 'index.json'`。

所以落盘与删除**统一走 `server/lib/atomicFile.js`**：

| 函数 | 作用 |
|---|---|
| `writeFileAtomic(file, text)` | 原子写（`.tmp` → `rename`） |
| `unlinkSync(file)` | 带重试删除；文件本就不在时返回 `false` |
| `renameSync(from, to)` | 带重试重命名（备份损坏文件也用它） |
| `retrySync(fn, label, opt)` | 失败重试；**只对 `EPERM` / `EACCES` / `EBUSY` 这类瞬态错误重试** |

两条不可动摇的原则（已由自检 15.77 段的 5 条断言锁死）：

1. **瞬态错误必须重试**（重试几十毫秒即可成功）；**非瞬态错误（`ENOENT` / 参数错误）立即抛出、只尝试一次** —— 否则真 bug 会被伪装成「偶发失败」而永远查不出。
2. **绝不把落盘失败当成功**。这里踩过一个代价不小的坑：`media.remove` 曾把 `unlink` 的异常静默吞掉后照样删索引并返回 `deleted: true`，结果**索引里没了、磁盘上还在、`/uploads/…` 仍返回 200** —— 运营以为图已下架，实际内容还在被访问。**下架失效比删除失败危险得多**，因此现在失败就整体失败，把真实错误码（`EPERM` / `EBUSY`）带回给调用方。

### 鉴权

```
Authorization: Bearer <token>
```

JWT（HS256），默认 7 天。token 失效时返回 HTTP 401 + `code: 401`，前端清 token 后重新静默登录。

### 安全红线

- `AppSecret` / 商户密钥 / JWT 密钥**只从环境变量读**，代码与文档零明文
- 下单金额一律由服务端重新计算，前端传值仅作展示
- 下单即锁库存，取消 / 超时释放
- 支付回调验签 + 幂等（同一 `transactionId` 只处理一次）

---

## 五、数据存储

当前为 **JSON 文件存储**（原子写 + 50ms 合并落盘），适合开发联调与单机小流量。
原子写与删除的实现与重试策略见 `server/lib/atomicFile.js`（见上文「数据落盘」）。

存储已收敛在 `server/lib/store.js`（业务数据）与 `server/lib/catalogStore.js`（运营资产）两层，
**切换到 MySQL / Redis 只需替换这两处实现，路由代码零改动**。

| 类别 | 位置 | 说明 |
|---|---|---|
| 运营资产（可写） | `server/data/catalog.json` | 商品、分类、券模板、店铺设置。首次启动自动从 `server/lib/seed.js`（复用前端 mock 数据）迁移，之后以此文件为准 |
| 用户业务数据（可写） | `server/data/db.json` | 用户、购物车、订单、地址、券、收藏、足迹、库存（`stocks`）、支付日志、商家回复 |
| 装修数据（可写） | `server/data/decorate/` | `state.json`（各页面草稿 + 版本历史）、`custom-pages.json`（自定义页面注册表与已发布数据） |
| 上传素材 | `server/data/uploads/` | 图片文件 + `index.json` 元数据 |

**为什么把商品拆到 `catalog.json`**

商品是「运营资产」，订单是「业务流水」，两者的变更频率、备份策略、回滚诉求都不同。分库后后台改商品不会触碰订单数据，
恢复订单也不会覆盖商品配置。`db.stocks[skuId]` 仍保持为**库存唯一真源**，商品自带的 `stock` 只是初始值。

**⚠️ 落盘文件的容错写法（踩过的坑）**

三处存储层（`lib/store.js` / `lib/catalogStore.js` / `decorate/customPages.js`）的 `load()` 遵循同一条规则：

1. **只有「文件真的不可用」才走「备份为 `.broken.<时间戳>` + 重建」**，其它异常一律向上抛；
2. 「不可用」包含两种情况：
   - `JSON.parse` 抛错（文件被写坏）；
   - **解析成功但内容不是对象** —— `null` / `123` / `"abc"` / `[]` 都是合法 JSON 却不是对象，
     直接当配置用会在 `db[k]` 处抛 `TypeError`，而且是**每次调用都崩、无法自愈**。
     判断收敛在 `lib/util.js` 的 `isPlainObject()`，三处共用；`probe-resilience.cjs` 用真实文件覆盖了这个矩阵。

反例：`try { JSON.parse(raw) } catch { 备份 + 清库重建 }` —— 这个写法会把**代码 bug**（甚至内存里的脏数据）也当成
「文件损坏」，直接把用户数据清空。本项目已因此丢过一次 `db.json`（15 个用户 / 36 个订单被清），
后靠 `.broken.*` 备份恢复。收窄后已加回归断言（见 `check-all.mjs` 第 19 节 + `probe-resilience.cjs`）。

---

## 六、连通性自检

```bash
# 先起服务，另开一个终端
node server/tools/check-all.mjs
```

脚本会逐点位发起**真实 HTTP 请求**（不是静态扫描），跑完整业务闭环
（登录 → 地址 → 加购 → 下单 → 支付 → 发货 → 收货 → 取消 → 回滚），
覆盖风控分支（401 / 库存不足 / 重复领券 / 重复取消 / 无地址下单 / 未注册路径），
并实测**店铺装修点位**（页面列表 / 详情 / 草稿往返 / diff / 无草稿发布拦截 / 未知版本回滚拦截），
以及**自定义页面全生命周期**（新建 → 存草稿 → 发布写入 `replica.CUSTOM_PAGES` → 改名迁移键名 → 删除复原，收尾保证可重复运行）、
**素材库点位**（上传 → 落盘 → `/uploads/` 静态访问 → 列表统计 → 伪装图片被拒 → 路径穿越被拦 → 删除回收，全程自清理）与
**后台控制台 28 个点位**（数据概览 / 商品 / 分类 / 订单 / 客户 / 优惠券 / 评价 / 设置），
最后比对「已注册点位」与「已实测点位」列出遗漏。

**自检的数据安全约定**（后台点位涉及写操作，全部按这个来）：

- 只读巡检为主；必须写的三处（SKU 库存 / 店铺设置 / 客户标签）**先存原值，测完立即还原**
- 商品与分类走「新建 → 用 → 删」，收尾比对商品总数确认零残留
- 评价回复只挑**本来就没有回复**的评价，做完「回复 → 清空」
- 收尾断言「订单数 / 客户数与开跑时一致」，确保没动真实业务数据
- 自检会真实下单（支付 → 发货 → 收货这条链路不取消），所以**开跑前把库存补到安全水位、跑完把净消耗补回**，
  保证可重复运行（历史自检曾把 `g1001-01` 跑到只剩 1 件，导致 2 件加购直接被库存校验拦下）

除点位实测外，还有三组**静态校验**：

| 校验 | 抓什么 |
|---|---|
| 小程序配置文件 | json 可解析 / `usingComponents` 类型 / `app.json` 顶层字段白名单 / 页面 `.js`+`.wxml` 齐全 / tabBar 命中 pages / AppID 非占位符 —— 专抓「只有开发者工具才会报」的错误 |
| 后台页面资源可达性 | 按**无尾斜杠 URL** 真实解析每个页面 HTML 里的 `src`/`href` 并请求一次 —— 专抓「相对路径 404 → 脚本不执行 → 页面白屏」 |
| 示例参数一致性 | `samples.js` 每个 key 都命中已注册点位（防写错路径静默失效），且每个点位都有示例（防加点位忘写示例） |

外加一组**装修链条对账**（`check-all.mjs` 第 15.78 节），把四个环节串起来比对，任一处漏接都会红：

| 环节 | 断言 |
|---|---|
| 有赞实测清单 | 基础组件 = **10 组 / 54 个**，分组名与每组数量逐组对齐（数据来自真实浏览器抓取，见 `.tooling/_yz-panels.json`） |
| schema 区块类型 | 标记「已接入」的每一项都必须在 `HOME_BLOCK_KINDS` 里有真实类型（防「假装可用」）；未接入的必须带 `why`；每个类型都能找到图标键 |
| 小程序渲染 | `templates/blocks.wxml` 必须覆盖**全部 19 种**区块类型（少一种就是「后台配了、真机空白」）；8 种新组件的字段完整性逐字段点名 |
| 装修台预览 | `admin.js` 的预览分支同样覆盖 19 种，且每种都有中文角标名；左侧按 `lib.groups` 分组、未接入项展示原因 |

> 这套对账是有来历的：新增 8 种区块时，预览里的「内容卡片」图片撑高比例被算成 `1.33%`（正确是 `133.33%`），
> 后台看起来卡片被压成一条线。这个错**只会在真人肉眼看预览时发现**，所以 `.tooling/probe-newblocks.cjs`
> 把三种比例（1:1 / 4:3 / 16:9）的数值直接断言锁死了。

输出：控制台表格 + `server/CONNECTIVITY.md` 报告。

---

## 七、上线前必做

1. **设置 `JWT_SECRET`**：`NODE_ENV=production` 且未设置时服务会**拒绝启动**（不是只打一行警告）。开发默认密钥 `dev-only-secret-change-me` 是公开的，带它上线等于所有人可伪造任意用户登录态。生成方式：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. 配置 `WX_APPID` / `WX_SECRET` / `WX_MCH_ID` / `WX_PAY_KEY`，并补微信支付 v3 证书签名（`lib/wechat.js` 的 `unifiedOrder` 已标注接入点）
3. 关闭模拟支付：`ALLOW_MOCK_PAY=0` 或 `NODE_ENV=production`（同时会关闭三个管理页面与三类管理接口）
4. **装修后台 + 素材库 + 后台控制台加访问控制**：`/api/decorate/*`（14 个）、`/api/media/*`（3 个）、`/api/admin/*`（28 个）均未做鉴权。风险最高的是 `/api/media/upload`（文件写入，无鉴权时任何人都能往服务器写文件占满磁盘）、`/api/admin/goods/*` 与 `/api/admin/settings/save`（可直接改商品与店铺配置）。**兜底手段**：设 `DEBUG_PAGE=off`（或 `NODE_ENV=production`），三个管理页面与这三类接口会一起返回 403 —— 已由自检的「安全开关」断言锁定，不会再出现「页面关了、接口还开着」的假关闭。**但这只是兜底**：它是全开/全关，无法按角色区分，正式环境仍应在网关层限制来源 / 加登录态。
5. **素材目录纳入备份与容量监控**：`server/data/uploads/`（与 `db.json`、`catalog.json` 同处 `server/data`，一个目录即可整体备份；建议加磁盘水位告警，并考虑后续迁移到对象存储 / CDN）
6. 域名备案 + HTTPS 证书，小程序后台配置 `request` 合法域名（**同时要把上传图片的域名加进 `downloadFile` 合法域名**，否则小程序端显示不出素材库的图）
7. 存储切到 MySQL / Redis（`lib/store.js` 业务数据 + `lib/catalogStore.js` 运营资产）
8. 支付回调地址在小程序后台配置为 `https://<域名>/api/pay/notify`
9. 商品数据接入真实商品库：`catalog.json` 首次由 `lib/seed.js` 迁移生成，接入 ERP / 商品中心后替换该迁移源即可（后台已在用它，切换时不需改路由）
10. 登录接口加频次限制：`/api/auth/login` 目前无失败次数 / 速率限制，可被无限尝试；建议在网关层或 `lib/auth.js` 加滑动窗口限流
