#!/usr/bin/env bash
#
# 莱克企业商城小程序 · 服务器初始化脚本
# 目标环境：腾讯云 CVM / Ubuntu 22.04 / 以 root 执行 / **可重复执行**（幂等）
#
# 用法：
#   tar -xzf lexy-backend.tar.gz -C /opt/lexy-mall     # 解开部署包（含本脚本）
#   bash /opt/lexy-mall/deploy/setup-server.sh
#
# 它做四件事：
#   1. 装 Node（官方二进制解压到 /usr/local，零依赖项目不需要 npm install）
#   2. 生成 /opt/lexy-mall/.env（含随机 JWT_SECRET；已存在则不覆盖）
#   3. 安装并启动 systemd 服务 lexy-mall（开机自启 + 崩溃自动重拉）
#   4. 本机健康检查
#
# 安全默认值（为什么这么设，见 server/README.md「上线前必做」）：
#   NODE_ENV=production  → 强制要求 JWT_SECRET，否则进程直接拒绝启动；
#                          同时关闭 /admin /console /debug 三个页面与 49 个管理接口
#   DEBUG_PAGE=off       → 显式再关一次（双保险，防止有人误改 NODE_ENV）
#   ADMIN_PAGE           → 未设置时**回落 DEBUG_PAGE**（这里=关）。
#                          想开远程运营后台要显式 ADMIN_PAGE=1，**且必须先配 ADMIN_PASSWORD 或 ADMIN_TOKENS**，
#                          否则进程拒绝启动（故意如此：宁可起不来，也不要「后台开着但谁都能进」）
#   ALLOW_MOCK_PAY=1     → 测试期保留「模拟支付」，否则下单后无法完成付款链路
#                          （正式接入微信支付后，把这一行删掉即可）
#
set -euo pipefail

APP_DIR="/opt/lexy-mall"
NODE_VER="${NODE_VER:-v20.18.1}"
MIRROR="${MIRROR:-https://mirrors.aliyun.com/nodejs-release}"
LOG="/var/log/lexy-mall.log"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行（sudo bash $0）"

# ---------------------------------------------------------------- 1. Node
log "检查 Node 运行时"
# ⚠️ 只判断「有没有」，**不比对具体版本**。
#   目标服务器 14.103.50.137 上本来就装着 Node v22.14.0
#   （/usr/local/bin/node 是指向 /opt/node-v22.14.0 的符号链接），而且机器上还跑着
#   别的 Node 服务。旧写法是「版本 != NODE_VER 就重装」，会把这个符号链接原地覆盖成
#   真实文件 —— 等于为了装自己的东西改坏同机别人在用的运行时，绝不能这么干。
#   本项目后端零第三方依赖，Node 18+ 都能跑，复用它就行。
if [ -x /usr/local/bin/node ]; then
  log "复用已装 Node $(/usr/local/bin/node -v)（不覆盖，避免影响同机其它服务）"
else
  command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
  TARBALL="node-$NODE_VER-linux-$ARCH.tar.xz"
  TMP="$(mktemp -d)"
  log "下载 Node $NODE_VER（$ARCH）"
  # 三个源依次兜底：国内 CVM 访问 nodejs.org 常超时，但镜像偶尔会缺版本
  OK=""
  for base in "https://mirrors.aliyun.com/nodejs-release" "https://npmmirror.com/mirrors/node" "https://nodejs.org/dist"; do
    printf '    尝试 %s/... ' "$base"
    if curl -fsSL --connect-timeout 10 --max-time 600 "$base/$NODE_VER/$TARBALL" -o "$TMP/node.tar.xz"; then
      echo "成功"; OK=1; break
    fi
    echo "失败"
  done
  [ -n "$OK" ] || die "三个源都下载失败，请检查服务器出网"
  tar -xJf "$TMP/node.tar.xz" -C /usr/local --strip-components=1
  rm -rf "$TMP"
fi
printf 'node  %s\n' "$(/usr/local/bin/node -v)"

# ------------------------------------------------------------ 2. 目录/.env
log "准备目录与环境变量"
mkdir -p "$APP_DIR" "$APP_DIR/server/data"
install -d -m 755 /var/log

ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  log "已存在 $ENV_FILE（不覆盖，避免换掉 JWT_SECRET 让所有人掉登录态）"
else
  SECRET="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
# 莱克企业商城小程序 · 后端环境变量（本文件不要进 Git）
NODE_ENV=production
JWT_SECRET=$SECRET
DEBUG_PAGE=off
# 测试期保留模拟支付；接入微信支付后删掉这一行
ALLOW_MOCK_PAY=1
PORT=3000
HOST=0.0.0.0

# ---------------------------------------------------------------
# 管理端鉴权（整改报告 08）：/admin /console 与 49 个管理接口都要管理员令牌。
# 目前 ADMIN_PAGE 未设置 → 回落 DEBUG_PAGE=off → 管理页面与接口全部 403，
# 与加鉴权之前的行为完全一致（安全，但不是"可用"）。
#
# 要启用远程运营后台，取消注释下面三行并改成自己的强口令，然后重启：
#   ADMIN_PASSWORD='改成你的强口令'      # 换到「超级管理员」会话（12 小时）
#   ADMIN_PAGE=1                        # 打开 /admin 与 /console
#
# 也可以只发分角色长期令牌（JSON，适合脚本 / 不同的人）：
#   ADMIN_TOKENS='{"至少8位的令牌":{"role":"operator","name":"运营A"}}'
#   角色：viewer 只读 / operator 日常运营 / owner 高危（删素材、生成代码、改店铺设置）
#
# ⚠️ ADMIN_PAGE=1 而没配 ADMIN_PASSWORD / ADMIN_TOKENS 时，进程会**拒绝启动**（有意为之）。
# ⚠️ 打开 ADMIN_PAGE 等于把后台开到公网，请同时在 nginx 层限制来源 IP。
# ---------------------------------------------------------------
EOF
  chmod 600 "$ENV_FILE"
  log "已生成 $ENV_FILE（JWT_SECRET 随机 32 字节，已 chmod 600）"
fi

# 管理端鉴权自检（报告 08）：只提示，不改配置。
# 分两种情形说清楚，避免运维看到「后台打不开」就以为部署失败。
if ! grep -qE '^(ADMIN_PASSWORD|ADMIN_TOKENS)=' "$ENV_FILE"; then
  if grep -qE '^ADMIN_PAGE=(1|on|true|yes)$' "$ENV_FILE"; then
    log "❌ $ENV_FILE 开了 ADMIN_PAGE 但没配管理员凭证 —— 服务会拒绝启动。"
    log "   请加 ADMIN_PASSWORD='你的强口令'（或 ADMIN_TOKENS），再重新执行本脚本。"
    exit 1
  fi
  log "提示：未配置管理员凭证，且管理后台保持关闭（DEBUG_PAGE=off）"
  log "      → /admin、/console 与 49 个管理接口一律 403，属预期行为，不是部署失败。"
  log "      需要远程运营后台时，见 .env 里的「管理端鉴权」注释块。"
fi

# -------------------------------------------------------------- 3. systemd
log "安装 systemd 服务"
[ -f "$APP_DIR/deploy/lexy-mall.service" ] || die "缺少 $APP_DIR/deploy/lexy-mall.service（部署包不完整）"
install -m 644 "$APP_DIR/deploy/lexy-mall.service" /etc/systemd/system/lexy-mall.service
systemctl daemon-reload
systemctl enable lexy-mall >/dev/null 2>&1 || true
systemctl restart lexy-mall
sleep 2

# --------------------------------------------------------- 4. 健康检查
log "健康检查"
if systemctl is-active --quiet lexy-mall; then
  echo "服务状态：active（已开机自启）"
else
  echo "服务状态：INACTIVE —— 最近日志："
  journalctl -u lexy-mall -n 30 --no-pager || tail -30 "$LOG"
  die "服务未起来"
fi
PORT_V="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
PORT_V="${PORT_V:-3000}"
printf '本机探针 http://127.0.0.1:%s/api/health → ' "$PORT_V"
curl -fsS "http://127.0.0.1:$PORT_V/api/health" || die "健康接口不通"
echo
printf '\n\033[1;32m完成。\033[0m常用命令：\n'
printf '  systemctl status lexy-mall      查看状态\n'
printf '  systemctl restart lexy-mall     重启\n'
printf '  tail -f %s        看日志\n' "$LOG"
