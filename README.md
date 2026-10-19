# 莱克企业商城小程序

> 对标 LEXY 莱克官方旗舰店微信小程序（有赞微商城 SaaS 实例）的**前端展示层复刻 + 自建后端 + 可视化运营后台**。

---

## 一句话说明

小程序端 11 个页面（5 个 tab 页 + 购物车 / 分类 / 自定义页 + 商品与资讯分包）、自建**零第三方依赖** Node 后端（92 个接口点位）、三个浏览器可视化后台（店铺装修台 / 后台控制台 / 接口调试台）。

---

## 目录结构

| 路径 | 内容 |
|---|---|
| `miniprogram/` | 小程序前端工程（原生小程序，导入微信开发者工具即可运行） |
| `server/` | 自建后端：纯 Node 内置模块，`node server/index.js` 直接启动 |
| `server/public/admin/` | **店铺装修台**：逐个页面改前端，发布写回 `miniprogram/config/replica.js` |
| `server/public/console/` | **后台控制台**：商品 / 分类 / 订单 / 客户 / 优惠券 / 评价 / 素材 / 设置 / 装修 |
| `server/public/debug.html` | **接口调试台**：点位树、一键填参、全链路联调、响应高亮 |
| `企业商城小程序-技术方案.md` | 技术方案（架构、页面清单、接口契约、上线清单） |
| `小程序项目档案.md` | 项目总档案（当前阶段、待办、变更日志，每轮交付前更新） |
| `小程序预览.html` | 静态预览快照（不读装修台数据，仅作效果参考） |

---

## 快速开始

### 1. 启动后端

```bash
node server/index.js
# 换端口：PORT=8080 node server/index.js
```

> **更省事的起法（推荐）**：直接**双击仓库根目录的 `start-admin.cmd`**。
> 它用 `start` 把服务起在一个**独立窗口**里（`DEBUG_PAGE=on` / `ADMIN_PAGE=on`），
> 并自带「已在跑就只开浏览器、不重复起第二个」的检测，起来后自动打开装修台。
> **小程序模拟器整页空白（只剩顶栏、零报错）最常见的原因就是本机服务没在跑** ——
> 模拟器档位自动选 `local`（`http://127.0.0.1:3000`），服务一停，首页那 11 个全是图片/视频的区块就全挂。
> 5 秒自查：浏览器打开 <http://127.0.0.1:3000/api/health>，能返回 `{"status":"up",…}` 就是正常的。
> ⚠️ 用 AI 助手的后台任务方式起服务，进程会随会话被回收（实测撑不过 3 分钟），**要长期联调就双击这个 .cmd**。

首次启动会自动在 `server/data/` 生成数据文件（由 `server/lib/seed.js` 迁移），无需手动准备。

### 2. 打开三个后台

| 后台 | 地址 | 用途 |
|---|---|---|
| 后台控制台 | http://127.0.0.1:3000/console | 商品、订单、客户、券、评价、设置 |
| 店铺装修台 | http://127.0.0.1:3000/admin | 逐页面装修，发布写回前端数据源 |
| 接口调试台 | http://127.0.0.1:3000/debug | 逐点位调试、一键全链路 |

> 三者共用一个总开关 `DEBUG_PAGE`：未设置时跟随环境（非 production 开、production 关）。

### 3. 导入小程序

微信开发者工具 → 导入项目 → 选择本仓库根目录（`project.config.json` 所在层级）→ AppID 填自己的（仓库内为占位值）。

前端默认连本机后端 `http://127.0.0.1:3000`；把 `miniprogram/utils/constants.js` 的 `ENV` 改为 `mock` 可**无后端**离线跑通演示页面。

---

## 已经实现

**小程序端**

- 5 个 tab 页（首页 / 莱克 / 资讯 / 产品 / 我的）按对标源页面复刻
- 资讯 8 个板块 → 23 个内容页
- 商品分包（列表 / 详情）、资讯分包
- 购物车、分类、自定义页面（活动落地页 / 投放页）
- 首页 / 自定义页 / 我的 共用一套「区块流」渲染（`miniprogram/utils/blocks.js`，59 种区块类型，全量对标有赞组件库）

**后端（110 个业务点位 + 2 个运维点位，实际数量以 `GET /api/health` 的 `routes` 为准）**

| 分组 | 说明 |
|---|---|
| 鉴权与用户 | 登录、刷新、退出、资料、手机号 |
| 商品与首页 | 首页聚合、分类、列表、详情、评价 |
| 购物车 | 列表 / 增 / 改 / 删 / 全选 |
| 交易 | 预下单 / 列表 / 详情 / 计数 / 取消 / 确认 / 发货 |
| 支付 | 回调 / 查询 / 模拟支付 |
| 用户资产 | 地址、优惠券、收藏、足迹 |
| 店铺装修 | 页面列表 / 组件库 / 详情 / 草稿 / 变更 / 发布 / 回滚 / 统计 / 模板 / 新建·改名·删除自定义页 |
| 素材库 | 上传 / 列表 / 删除（魔数校验 + 引用检查）/ **回收站**（恢复 · 彻底清除 · 到期清理）/ **重复治理**（重复分组 · 哈希扫描 · 合并引用） |
| 后台控制台 | 28 个运营管理点位 |
| 运维 | 健康检查、点位清单 |

**店铺装修台的关键设计**

- **内置页 vs 自定义页双轨制**：内置 5 页的真源是 `replica.js` 的固定字段；自定义页的真源是独立的 `custom-pages.json` 注册表（因为它刚建好还没发布时 `replica.js` 里根本没有它）
- 自定义页统一为「区块流」`{ blocks, meta }`，复用首页的 59 种区块，属性面板 / 区块树 / 手机预览 / 小程序端渲染全部直接复用
- 上限 20 个；标识 2~24 位小写字母·数字·连字符、字母开头、唯一，21 个保留字拦截
- 发布走四步：组装全量数据 → 生成 `replica.js` → 语法校验 → 备份 + 原子写 + 回读校验（任一步失败自动回滚）

---

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `JWT_SECRET` | 登录态签名密钥（**上线必配**） | 开发默认值；`NODE_ENV=production` 且未设置时**拒绝启动** |
| `JWT_TTL` | token 有效期（秒） | `604800` |
| `WX_APPID` / `WX_SECRET` | 小程序 AppID / Secret | 未配时登录走本地模拟 |
| `WX_MCH_ID` / `WX_PAY_KEY` | 微信支付商户号 / 密钥 | 未配时支付走沙箱参数 |
| `ALLOW_MOCK_PAY` | 是否开放模拟支付点位 | 非 production 且未配商户号时开启 |
| `DEBUG_PAGE` | 管理后台总开关（3 个页面 + 3 类管理接口一起开关） | 非 production 开、production 关 |
| `ADMIN_PAGE` | 运营后台页面与接口开关（与 `DEBUG_PAGE` 分开，避免「关了页面、接口还开着」） | 跟随 `DEBUG_PAGE` |
| `ADMIN_PASSWORD` | 共享口令（登录即 owner） | 未设置时开发默认口令会打警告 |
| `ADMIN_TOKENS` | 长期令牌（`token:角色`，逗号分隔） | 空 |
| `TRUST_PROXY` | `1` 时才按 `X-Forwarded-For` 取来源 IP（否则只认 socket 地址，防伪造限流绕过） | 空 |
| `WX_ALLOW_MOCK_LOGIN` | `NODE_ENV=production` 且未配 AppID 时，显式 `1` 才允许模拟登录（否则拒绝启动） | 空 |
| `MALL_DATA_DIR` | 把运行时数据整体挪到别的目录（**回归测试专用**，见下方「回归自检」） | `server/data` |
| `NODE_ENV` | 环境标识 | — |

> 密钥类配置**只从环境变量读取**，代码与文档零明文。

---

## 回归自检

三条命令，用途不同，**发布门槛是第一条**：

| 命令 | 覆盖 | 说明 |
|---|---|---|
| `node server/tools/regress.mjs` | 语法门 + 鉴权 / 角色矩阵 + 素材生命周期（F17）+ 重复治理（F18） | **确定性非交易回归**：自带临时端口与临时数据目录（`MALL_DATA_DIR`），跑完核对 `server/data` 与 `replica.js` 指纹未变；加 `--full` 追加跑点位连通性 |
| `node .tooling/test-admin-auth.mjs` | 管理端鉴权与角色 | 单独跑时用，已包含在上面那条里 |
| `node server/tools/check-all.mjs` | 全量点位连通性 + 静态契约断言 | 需要 `3000` 端口已有服务在跑；跑在真实数据上，因此**不作为「未改动真实数据」的证明** |

> 为什么不能只跑点位连通性：本轮最严重的几个缺陷（令牌原型键绕过、用户名重用提权、
> 旧表单覆盖新库存）**都不是「接口不通」**，而是跨模块语义错误 —— 点位全绿也照样存在。
> 所以 `regress.mjs` 把每个已修缺陷的复现转成了断言，并要求「真实数据指纹不变」。

---

## 素材兼容：为什么真机上一律用 jpg 而不是 webp

装修上传与抓站下来的素材大量是 `.webp`（本项目 530 张 / 20.7 MB），而**小程序端统一改指同名 jpg**：

| 现象 | 证据 |
|---|---|
| iPhone 上大片图片是占位色块 | 服务端日志显示图片**下载完整**（状态码 200、发送字节 = 磁盘字节），却走 `binderror` ⇒ 文件拿到了、解不开 |
| 改完代码重新编译，手机上**还是白的** | 素材响应头原本是 `Cache-Control: max-age=604800`（7 天），坏结果被 iOS 缓存住，7 天内根本不再向服务器请求 —— 新代码压根没机会跑到 |

两层分别对付掉了：

1. **不让 iOS 碰 webp**：`python server/tools/webp-to-jpg.py` 给每个 `.webp` 生成一份同名 `.jpg`
   （幂等，已存在则跳过；依赖 `pip install pillow`）。`miniprogram/utils/asset.js` 的
   `safeImgPath()` 统一把 `/uploads/….webp` 改指到 `.jpg` —— 外链与站内路径不受影响。
   附带收益：扩展名变了 ⇒ URL 变了 ⇒ 那 7 天的坏缓存自然失效。实际增量 45 MB（530 张）。
2. **缓存期从 7 天降到 1 小时**（`server/index.js` 的静态素材响应头），以后再调图不会被长期粘住。

> ⚠️ 新上传的 webp 要再跑一次脚本才会有 jpg 版本，建议以后直接传 jpg / png。
> 删除素材时 `media.js` 会把 webp 与它的 jpg 副本一并移进回收站（恢复同理），不会留孤儿。

---

## 备份与恢复演练

要备份的只有 `server/data/` 一个目录（外加 `miniprogram/config/replica.js`，它由装修台生成）：

| 内容 | 位置 | 说明 |
|---|---|---|
| 商品 / 订单 / 用户 / 运营参数 | `server/data/catalog.json`、`server/data/db.json` | 业务数据主体 |
| 装修草稿与版本快照 | `server/data/decorate/state.json` | 回滚历史在里面 |
| 已发布内容的历史版本 | `server/data/decorate/backup/replica.<ts>.js` | 发布自动生成，也是素材引用保护（F17）的依据 |
| 素材 | `server/data/uploads/`（含 `index.json`） | 删素材先进 `server/data/uploads_trash/`，30 天后才清 |
| 成员账号 | `server/data/admin/members.json` | 只有 scrypt 哈希，不含明文口令 |
| 审计日志 | `server/data/audit/audit-<日期>.jsonl` | 按天滚动，保留 30 天 |

**演练步骤（建议每季度一次，别只写「可以恢复」）**：

1. 停服务 → `cp -a server/data /tmp/data-bak-<日期>` 与 `cp miniprogram/config/replica.js /tmp/`；
2. 另起一份：`MALL_DATA_DIR=/tmp/drill node server/index.js`（**不碰生产目录**），用它验证备份能起来；
3. 逐项核对：商品数（`GET /api/admin/goods/list`）、装修页面（`GET /api/decorate/pages`）、
   成员（`GET /api/admin/members`）、素材（`GET /api/media/list` 与 `GET /api/media/trash`）；
4. 装修回滚走 `POST /api/decorate/rollback`（版本快照在 `state.json` 里），
   误删素材走 `POST /api/media/restore`（URL 不变，页面不用改）；
5. 记录「恢复了什么、哪一项对不上」，演练结论写进交付记录 —— 没演练过的备份不算备份。

---

## 上线前必做

**先跑一遍体检**：`node .tooling/preflight-wechat.mjs` —— 只读脚本，真读文件 + 真发请求，退出码 `1` 表示有阻塞项。
分级的可执行清单见 [`微信上传前检查清单.md`](./微信上传前检查清单.md)；后端细节见 `server/README.md`。

### 一、代码之外的前置条件（不办完，传了也白传）

1. **已 ICP 备案的域名 + 受信任 HTTPS 证书**。把 `miniprogram/utils/constants.js` 的 `BASE_URL_MAP.server`
   从 IP 换成域名 —— 微信「服务器域名」**不支持 IP / localhost**，正式版 `wx.request` 会被直接拒。
   （图片走相对路径 `/uploads/…`，换域名不用动数据）
2. **小程序自身完成工信部备案**（2023-09-01 起强制：先备案才能提审发布；含 12381 短信核验 + 管局终审）
   ＋ **微信认证**（企业 300 元/年，备案与支付/客服/手机号的前提）
3. 微信后台配 **`request` 合法域名**（每个类型**每月最多改 5 次**，想清楚再改）
4. **《用户隐私保护指引》逐项申报**（2023-10-17 起未申报的隐私接口会被直接禁用）。本项目命中的有：
   `wx.setClipboardData`（读取你的剪切板）、`type="nickname"`（昵称头像）、`open-type="getPhoneNumber"`（手机号）。
   ⚠️ **`wx.scanCode` 不需要申报** —— 微信官方《小程序用户隐私保护指引内容介绍》的接口↔信息类型
   **对照表里没有 scanCode**（它不索取 `scope.camera`），早前文档里「按摄像头口径申报」的说法**是错的，已撤回**。
   逐条填法见 **`deploy/隐私保护指引-填报单.md`**
5. **服务类目与资质**（家用电器自营等，类目与业务不符会直接驳回）、**微信客服人员绑定**（6 处 `open-type="contact"`）

### 二、服务器端

6. `JWT_SECRET`（生产未设置会拒绝启动）
7. **管理员凭证 `ADMIN_PASSWORD`（或 `ADMIN_TOKENS`）**：`/api/admin/*` `/api/decorate/*` `/api/media/*`
   共 69 个运营管理点位**已全部要求管理员令牌**，并按 `viewer` / `operator` / `owner` 三级角色细分
   （删除与「生成代码」等不可逆动作收紧到 `owner`）。生产未配置任何管理员凭证时服务拒绝启动。
   `DEBUG_PAGE=off` 是另一道防线（页面与接口一起 403），**不能替代登录态**；网关层限来源仍建议保留
8. 配置 `WX_APPID` / `WX_SECRET` / `WX_MCH_ID` / `WX_PAY_KEY`，补微信支付 v3 证书签名
9. 关闭模拟支付（`ALLOW_MOCK_PAY=0` 或 `NODE_ENV=production`）—— 否则真机 `wx.requestPayment` **必然失败**
10. 支付回调地址配为 `https://<域名>/api/pay/notify`
11. `server/data/` 纳入备份与容量监控（素材建议后续迁对象存储 / CDN）；存储切 MySQL / Redis
12. 商品数据接入真实商品库（替换 `server/lib/seed.js` 迁移源即可）；登录接口加频次限制

### 三、上传当天

13. **素材先同步上线**：`node .tooling/sync-incremental.mjs --only=server/data/uploads --apply`
    —— 装修台上传的图片**物理文件只落本机、不进 git**，不推 = 小程序整页「图片加载失败」
    （**且装修台手机预览必然正常**，只有开发者工具/真机才暴露；本项目已因此重犯过一次）
14. `node .tooling/sync-incremental.mjs --verify` 确认线上与本机零差异
15. 装修台「生成代码」后**仍需上传并发布小程序新版本**才在真机生效

---

## 说明

- `server/data/`（运行时数据：联调用户 / 订单 / 素材）与 `.workbuddy/`（AI 助手工作上下文）已由 `.gitignore` **整体排除**。
- `.tooling/` 采用「**整体排除 + 逐个放行**」：测试与探针**脚本本身入库**（`*.mjs` / `*.cjs`，以及图标资产的两个可复跑
  Python 入口与它们的输入字体），截图（`_ui-shots/`）、抓取原图（`assets-src/`）、数据备份等大件不入库
  —— 脚本不进仓库，等于交付里没有可重复执行的验证入口。
- 本仓库此前存放的是 PRD 文档（两份 docx 及 md/html 源文件），替换前的状态已归档在 `archive/prd-docs-2026-10-07` 分支，可随时取回。
- 研发侧的回归脚本（生成器无损性、装修发布全链路、素材库全链路等）不在本仓库内，按需另行提供。
