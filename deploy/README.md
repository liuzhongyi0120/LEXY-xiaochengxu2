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
