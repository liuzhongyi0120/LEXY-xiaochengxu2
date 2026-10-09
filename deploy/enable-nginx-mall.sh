#!/usr/bin/env bash
#
# 把 /mall-api/ 反代挂到这台服务器已有的 nginx 上（幂等、可回滚）。
#
#   bash /opt/lexy-mall/deploy/enable-nginx-mall.sh
#
# 为什么挂在 80 的站点、而不是 443：
#   443 那个 server 块（sites-enabled/stopwatch-lab）的 `location /` 会把**所有**未匹配
#   请求 proxy 到 127.0.0.1:80。所以只要挂在 80，https://<ip>/mall-api/... 就自动可用，
#   不用去动 stopwatch 的 443 配置 —— 少改一个文件少一份风险。
#
# 为什么必须备份：
#   lexy-official-site 是团队的生产站点配置（quality-platform / kingclean-* / video-canvas
#   等一堆业务都靠它），机器上也留有几十个历史 .bak。改前一律先 cp -a 带时间戳备份。
#
# 回滚：cp -a <bak 文件> /etc/nginx/sites-available/lexy-official-site && systemctl reload nginx
#
set -euo pipefail

SITE=/etc/nginx/sites-available/lexy-official-site
SNIP=/opt/lexy-mall/deploy/nginx-mall-api.conf
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行"
[ -f "$SITE" ] || die "找不到 $SITE"
[ -f "$SNIP" ] || die "找不到 $SNIP（部署包不完整）"

if grep -q 'location \^~ /mall-api/' "$SITE"; then
  # 已存在：把整段反代块**替换成当前片段**。
  # 只判断「有没有」是不够的 —— 片段里的参数（client_max_body_size / 超时）会随版本变，
  # 若只跳过，重跑部署就永远同步不到服务器上那份旧配置。
  # 用大括号配平找到块的范围，避免误伤相邻 location。
  cp -a "$SITE" "$SITE.bak-mall-api-$STAMP"
  awk -v snipfile="$SNIP" '
    BEGIN { while ((getline l < snipfile) > 0) snip = snip l "\n"; }
    /location \^~ \/mall-api\// { inblk = 1; depth = 0 }
    inblk {
      depth += gsub(/\{/, "{")
      depth -= gsub(/\}/, "}")
      if (depth <= 0) { inblk = 0; printf "%s", snip }
      next
    }
    { print }
  ' "$SITE" > "$SITE.new"
  mv "$SITE.new" "$SITE"
  log "已用最新片段替换原有 /mall-api/ 反代块（备份 → $SITE.bak-mall-api-$STAMP）"

  # 替换是否真的发生了：片段里的关键参数必须能在站点配置里找到
  WANT_BODY="$(grep -oE 'client_max_body_size [0-9]+m;' "$SNIP" | head -1)"
  if [ -n "$WANT_BODY" ] && ! grep -qF "$WANT_BODY" "$SITE"; then
    die "替换后仍未找到「$WANT_BODY」，配置不正常（备份在原处可回滚）"
  fi
else
  cp -a "$SITE" "$SITE.bak-mall-api-$STAMP"
  log "已备份 → $SITE.bak-mall-api-$STAMP"

  # 插到最后一个 catch-all `location / {` 之前。
  # 前缀型 location 本来就按「最长匹配」生效，位置不是必须的，但放在 catch-all 前更易读。
  LINE="$(grep -n '^[[:space:]]*location / {' "$SITE" | tail -1 | cut -d: -f1)"
  [ -n "$LINE" ] || die "找不到 catch-all「location / {」，中止（不猜、不乱插）"

  { head -n "$((LINE - 1))" "$SITE"; cat "$SNIP"; tail -n +"$LINE" "$SITE"; } > "$SITE.new"
  mv "$SITE.new" "$SITE"
  log "已插入到第 $LINE 行之前"
fi

log "nginx 配置校验"
nginx -t || die "校验失败，**未 reload**（原配置未生效、备份在原地可回滚）"

log "reload nginx"
systemctl reload nginx
sleep 1

log "本机验证（HTTP）"
curl -fsS -m 10 http://127.0.0.1/mall-api/api/health || die "HTTP 探针不通"
echo

log "本机验证（HTTPS，走 443 → 80 的转发）"
curl -fsS -m 10 -k https://127.0.0.1/mall-api/api/health || die "HTTPS 探针不通"
echo

log "完成。小程序端 BASE_URL 用： https://14.103.50.137/mall-api"
