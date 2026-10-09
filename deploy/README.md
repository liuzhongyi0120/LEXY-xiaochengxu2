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
