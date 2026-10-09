# 部署材料（deploy/）

这个目录是**部署包的一部分**——它会被原样拷到服务器 `/opt/lexy-mall/deploy/`，
所以里面的文件必须是**能在服务器上直接执行**的，不要放只在开发机有意义的东西。

| 文件 | 作用 |
|---|---|
| `setup-server.sh` | 服务器初始化（幂等，可反复跑）：检测/复用 Node → 生成 `/opt/lexy-mall/.env`（随机 `JWT_SECRET`，已存在则不覆盖）→ 安装并启动 systemd 服务 `lexy-mall` → 本机健康检查 |
| `lexy-mall.service` | systemd 单元：开机自启 + 崩溃 3 秒重拉 + 最小权限（只允许写 `/opt/lexy-mall` 与 `/var/log`） |
| `nginx-mall-api.conf` | 要插进 nginx 的 `location ^~ /mall-api/` 片段（反代到本机 3000） |
| `enable-nginx-mall.sh` | 把上面那段插进 `sites-available/lexy-official-site`（先带时间戳备份 → 插入 → `nginx -t` → reload → 本机 http/https 双探针）。幂等，重复执行会跳过 |
| `.build/` | 打包产物 `lexy-backend.tar.gz`，**不入 Git**（每次部署重新打） |

完整部署步骤、机器信息、端口/证书链路、回滚方式见 `../server/README.md` 的「八、已部署实例（腾讯云 CVM）」。

> ⚠️ **重新部署前必读：管理端鉴权（整改报告 08）**
>
> 新版本给 `/api/admin/*`、`/api/decorate/*`、`/api/media/*` 共 49 个运营点位加了**管理员令牌校验**。
> 生产环境的 `.env` 里**没有** `ADMIN_PASSWORD` / `ADMIN_TOKENS`，所以：
>
> | 场景 | 结果 |
> |---|---|
> | `DEBUG_PAGE=off`（当前线上配置） | `ADMIN_PAGE` 回落为关 → 四个管理页面与 49 个管理接口**一律 403**，服务正常启动。**线上行为与现在完全一样，不会有任何变化** |
> | `ADMIN_PAGE=1` 但没配 `ADMIN_PASSWORD` | **服务拒绝启动**（`[fatal] ... 未配置任何管理员凭证`）。这是有意为之：宁可起不来，也不要「后台开着但谁都能进」 |
> | `ADMIN_PAGE=1` 且 `NODE_ENV=production` 且用的是默认口令 `admin` | 同样**拒绝启动** |
>
> 结论：**只要不动 `DEBUG_PAGE`，重新部署是安全的**。想启用远程运营后台，先按下面「配置管理员登录」加凭证，再开 `ADMIN_PAGE=1`。
> 部署后跑一次 `node .tooling/probe-deployed.mjs` 确认「管理页面与接口在公网确实被拒」。

## 配置管理员登录（ADMIN_PASSWORD / ADMIN_TOKENS）

`/admin`、`/console` 与 49 个管理接口需要的管理员身份，来源是下面两项之一（可同时配）：

```bash
ENV=/opt/lexy-mall/.env
cp -a "$ENV" "$ENV.bak.$(date +%Y%m%d-%H%M%S)"

# ① 口令登录：换到的是「超级管理员」会话（12 小时有效）
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 18)" >> "$ENV"     # 或用你记得住的强口令

# ② 分角色长期令牌（JSON）：给脚本 / 不同的人发不同权限，可只读
printf 'ADMIN_TOKENS=%s\n' '{"<至少8位的令牌>":{"role":"operator","name":"运营A"}}' >> "$ENV"

chmod 600 "$ENV"
systemctl restart lexy-mall
tail -8 /var/log/lexy-mall.log     # 应出现「管理员凭证 已配置（长期令牌 N 条）」
```

角色三级：`viewer` 只读 / `operator` 日常运营 / `owner` 高危（删素材、生成代码、删商品分类券、改店铺设置）。

启用远程后台（**想清楚再做**）：

```bash
printf 'ADMIN_PAGE=1\n' >> "$ENV" && chmod 600 "$ENV" && systemctl restart lexy-mall
```

> 打开 `ADMIN_PAGE=1` 等于把管理后台开到公网。**至少**要配合 nginx 限制来源 IP / VPN，
> 登录态只挡得住匿名，挡不住凭证泄漏。另外装修台的「生成代码」写的是服务器上的
> `miniprogram/config/replica.js`，**对线上小程序没有任何影响** —— 线上生效仍然靠发新版本。

## 配置真实微信登录（WX_APPID / WX_SECRET）

`setup-server.sh` 生成的 `.env` 里**没有**微信密钥，此时后端走本地模拟登录：
同一个 `code` 稳定映射同一个 openid，但**每个新 code 都是新账号**（`md5(code)` 派生），
小程序端一旦清缓存 / token 过期就会变成新用户，购物车与订单不连续。

在微信公众平台「开发管理 → 开发设置」生成 AppSecret 后（**只显示一次**），执行：

```bash
ENV=/opt/lexy-mall/.env
cp -a "$ENV" "$ENV.bak.$(date +%Y%m%d-%H%M%S)"          # 先备份，secret 写错可秒回滚
grep -vE '^(WX_APPID|WX_SECRET)=' "$ENV" > "$ENV.tmp"
printf 'WX_APPID=<小程序AppID>\nWX_SECRET=<小程序密钥>\n' >> "$ENV.tmp"
mv "$ENV.tmp" "$ENV" && chmod 600 "$ENV"
systemctl restart lexy-mall
tail -6 /var/log/lexy-mall.log     # 应出现「微信能力  登录=真实接口」
```

验证是否真的生效——**用一个无效 code 打登录接口**，返回微信官方错误才算走通：

```bash
curl -s -X POST https://127.0.0.1/mall-api/api/auth/login \
  -H 'Content-Type: application/json' -d '{"code":"invalid_probe_code_123"}'
# 期望：{"code":2000,"msg":"微信登录失败：invalid code, rid: 6ac8491d-...",...}
# 若返回 token 成功，说明仍是 mock，密钥没被读到
```

注意两点：

- **测试 code 不要用纯数字**（如 `"000000"`）。HTTP 层会把纯数字字符串归一成 number，
  `0` 是 falsy，会先撞上「缺少登录凭证 code」而不是真实登录链路，白排查一轮。
- 切换后**旧的 mock 账号不再被识别**（数据仍在 `db.json`，只是不再被任何 openid 指向）。
  JWT_SECRET 没换，所以手里已有的 token 在过期前仍可用；一旦重新登录就是全新账号。
- 配了密钥后 `getPhoneNumber` 也会走**真实接口**，需要小程序侧开通「手机号快速验证」权限（认证 + 按次计费）。
  未开通时点「绑定手机号」会报错，**不影响**登录与下单。支付不受影响：未配商户号时仍走沙箱，
  配合 `.env` 里的 `ALLOW_MOCK_PAY=1` 可完整跑通下单→支付→发货→收货。

## 同步业务数据到线上（改了商品 / 素材 / 装修**必须**做）

小程序端 `miniprogram/utils/constants.js` 的 `ENV = 'server'`，读的是**云服务器**的数据
（`https://14.103.50.137/mall-api`）。所以：

> **本机改了商品 / 素材 / 装修 ≠ 线上生效。**

第 29 批的真实事故：本机导入了 49 个有赞商品，服务器上仍是 **1 个**（部署前的旧商品），
现象是**产品页 51 个型号里只有 S10 系列能点开**——因为恰好只有它（`g1003972`）在服务器上存在，
其余 50 个一律进「该商品已下架或不存在」。代码翻了半天，根因是数据没上线。

一键同步（推荐）：

```bash
node .tooling/deploy-data.mjs             # 打包 → 传输 → 解包 → 重启 → 验证（全流程）
node .tooling/deploy-data.mjs --dry       # 只算体量、打印将要做的事，不连服务器
node .tooling/deploy-data.mjs --verify    # 只跑线上验证（秒级，最常用）
```

`--verify` 做的是**与小程序同路径的验证**，不只查连通：商品数与本机比对、
**逐个型号打 `/api/goods/detail` 确认真的能打开**、抽查商品主图（用 `Range` 探测，
因为静态服务**不处理 HEAD**，用 HEAD 会得到相反的结论）、健康检查里的点位数。

### 两件必须成对做的事

| 步骤 | 不做会怎样 |
|---|---|
| 传数据（`catalog.json` + `uploads/` + `decorate/`） | 线上还是旧内容 |
| **`systemctl restart lexy-mall`** | `server/lib/catalogStore.js` 有**进程内内存缓存**（`let cache`）。只覆盖文件不重启，下一次任何写操作都会把旧数据原样盖回来 —— 现象是「传完了，刷新还是旧的」。`uploads/` 与 `media.js` 无缓存，但 catalog 有 |

`server/data/db.json`（用户 / 购物车 / 订单 / 库存）**有意不同步**：生产环境全新自举
（`emptyDb()` + 从 `catalog.json` 初始化 `stocks`），避免把本机的联调用户与测试订单带上线。
所以线上用户数据与本机**本来就是两套**，别拿线上订单数去推断本机状态。

### 排查口诀

**「本机有、线上没有」的一切症状，先跑 `--verify` 再怀疑代码。**
线上点开是空白 / 「商品已下架」/ 图片裂，八成是数据没同步或没重启，不是接口写错了。

### 日常改动用增量同步（秒级，推荐）

全量 `deploy-data.mjs` 每次都打包整份 `server/` + `miniprogram/`（≈319 MB，按实测上行
1.15 MB/s 约 **5 分钟**）。日常只改一两个文件时没必要付这个成本，用增量同步：

```bash
node .tooling/sync-incremental.mjs           # 试跑：列出两端差异与体量，不改任何东西
node .tooling/sync-incremental.mjs --apply   # 执行：打包差异 → 传输 → 停服解包 → 起服 → 验证
node .tooling/sync-incremental.mjs --prune   # 额外删除「线上有、本机没有」的文件（默认不删）
node .tooling/sync-incremental.mjs --verify  # 只验证线上，不做比对
```

它按**内容哈希（md5）**比对两端 1700+ 个文件（约 2 秒），只传真正变化的文件。
实测改 1 个文件：打包 0.1s + 传输 0.8s，全流程约 **5 秒**。
排除规则与 `deploy-data.mjs` 的 `tar --exclude` **逐条对应**（`db.json`、`*.bak.*`、
`project.private.config.json`），两边改一处必须同时改另一处，否则会出现
「全量传了、增量没传」的幽灵差异。

**默认不删任何东西**：线上「本机没有」的文件不一定是垃圾 —— 可能是运营在线上后台上传的素材、
或运行时生成的。要清理得显式加 `--prune`，删除清单会完整打印出来。

### 铁律：本地是唯一真源，线上只读

商品 / 素材 / 装修 / 代码**一律在本地改**，再用上面两个脚本推上线。
**不要在服务器上手动 `vim` 改文件**：

| 原因 | 具体 |
|---|---|
| 线上没有版本控制 | `/opt/lexy-mall` 不是 git 仓库，改错没有回滚点、也没有 diff |
| 它是台共享生产机 | 同机还跑着 kingclean-test / postgresql / nginx / fail2ban，磁盘仅剩 ~5.7G（已用 85%） |
| 质量闭环全在本地 | 91 点位 419 断言自检、非交易回归、装修台浏览器验收、`/preview` 五页图片体检 |
| 小程序代码**没法在线预览** | 微信开发者工具只能跑在开发机，在服务器上改小程序等于闭眼改 |
| 会被下次同步覆盖 | 服务器上的手改不在本机，`--apply` 会把它盖回去 —— 表现为「改着改着就回退了」 |

**唯一例外**：线上紧急故障可以直接改一行救火，但**必须立刻把改动带回本地并提交 git**，
否则下次同步会覆盖它，而且你也不知道线上跑的是哪个版本。

### 要不要让运营在线上直接改？

线上运营后台默认**关闭**（`/admin`、`/console` 返回 403「设置 `ADMIN_PAGE=1` 可临时开启」，
`/preview` 同受 `DEBUG_PAGE`）。确实需要线上直接编辑时，用 **SSH 隧道**而不是开放公网：

```bash
ssh -i ~/.ssh/id_ed25519 -L 3000:127.0.0.1:3000 root@14.103.50.137 -N
# 然后本地浏览器打开 http://127.0.0.1:3000/admin
```

⚠️ 一旦这样做，**必须同时把「真源」改成线上**（本地不再往线上推数据）。
两边都能改就会出现分叉 —— 第 31 批就出现过「同一商品本机库存 100 / 线上 10」。

## 上传体积：三处上限必须同向放宽

素材库支持视频后，单次上传的体积受**三个地方**限制，任何一处没跟上都会失败，且现象各不相同：

| 位置 | 当前值 | 没跟上的现象 |
|---|---|---|
| nginx `client_max_body_size`（`nginx-mall-api.conf`） | **60m** | 直接 413，而且**后端日志里什么都没有** —— 请求根本没到后端（这是最难查的一种） |
| `server/lib/media.js` 的 `MAX_VIDEO_BYTES` | **50MB** | 接口报「视频过大」，但文件已经完整传上来了，白等一场 |
| `server/lib/media.js` 的 `MAX_BODY`（请求体） | **64MB** | 同上，报的措辞是「单次上传上限」 |

单位不同是有意的：nginx 写 `60m`，后端写字节数。改的时候**三个值一起改**。

`enable-nginx-mall.sh` 在重跑时会**把 `location ^~ /mall-api/` 整段替换成最新片段**（先带时间戳备份），
所以改完 `nginx-mall-api.conf` 只要重跑一次部署脚本，服务器上那份旧参数就会自动同步 ——
不用登机器手工 sed（手工改过的地方，下次重跑就会被片段纠正回来）。

## 三条容易踩的坑（都真实踩过）

1. **打包必须带上 `miniprogram/`**。`server/lib/seed.js` 在模块加载期就 `require('../../miniprogram/mock/data')`，
   只拷 `server/` 会让进程起来即 `MODULE_NOT_FOUND` 退出——现象是 systemd 里反复 `status=1/FAILURE`，
   而 `journalctl -u lexy-mall` 看不到应用报错（因为 stdout 被 `StandardOutput=append:` 重定向到 `/var/log/lexy-mall.log` 了）。
   **排查第一步永远是 `tail -50 /var/log/lexy-mall.log`。**
2. **不要覆盖服务器上已有的 Node**。目标机器 `/usr/local/bin/node` 是指向 `/opt/node-v22.14.0` 的符号链接，
   且同机还跑着别的 Node 服务。脚本里若按「版本不等就重装」判断，会把符号链接覆盖成真实文件，
   等于为了装自己的东西改坏别人的运行时。现在的写法是**只判断有没有、有就复用**。
3. **不要用 `ssh host 'bash -s' <<EOF` 去跑交互式命令**（如 `certbot`）。`bash -s` 的 stdin 就是脚本本身，
   子进程读 stdin 会把**剩下的脚本整段吃掉**，表现为「输出莫名截断、后续命令没执行」。
   这类命令要单独发一次，并加 `</dev/null`。
