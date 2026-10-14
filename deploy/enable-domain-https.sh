#!/usr/bin/env bash
#
# 莱克企业商城小程序 · 给「已备案域名」挂上 HTTPS 反代
# （幂等 / 可单独回滚 / **不碰同机别人的 nginx 配置**）
#
# 用法（在服务器上，root）：
#   DOMAIN=mall.lexy.cn bash /opt/lexy-mall/deploy/enable-domain-https.sh
#   邮箱可覆盖：ACME_EMAIL=you@corp.com DOMAIN=... bash ...
#
# ── 为什么需要它 ────────────────────────────────────────────────────────
# 微信小程序「服务器域名」**不接受 IP**，必须是**已 ICP 备案的域名** + 受信任 HTTPS 证书。
# 现有 BASE_URL 是 https://14.103.50.137/mall-api —— 开发者工具关掉域名校验能跑，
# 但**正式版真机必被拒**（审核也会失败）。本脚本负责「域名 → 证书 → 反代」这一段。
#
# ── 它做什么（三步，每步都能单独回滚） ─────────────────────────────────
#   1. 建 /var/www/lexy-acme + 80 端口 server 块
#      （给 Let's Encrypt 做 HTTP-01 校验用；该域名其余 http 请求 301 到 https）
#   2. certbot 签一张**该域名**的证书（webroot 方式）
#      —— **绝不碰** 443 上那张 14.103.50.137 的 IP 证书，也不碰 stopwatch-cert-renew.timer
#   3. 建 443 server 块，直接反代 127.0.0.1:3000（带 client_max_body_size 60m）
#
# ── 为什么自己写独立文件，而不是改 lexy-official-site ───────────────────
# 那台机器是**团队共用机**（quality-platform / kingclean-* / video-canvas / postgres 都跑在上面）。
# 新增**独立配置文件 + symlink**，出错只需删 symlink，不会动到任何人的配置、也不会改默认 server。
#
# ⚠️ symlink 名**刻意以 zz- 开头**（zz-lexy-mall-domain-443）—— 不是随手起的，别改回去：
#   nginx 的 443 默认 server = 「配置加载时**第一个 listen 443** 的块」（这机器上没人显式写 default_server）。
#   sites-enabled 按**文件名字母序**加载：名字若叫 lexy-mall-domain-443，会排在 stopwatch-lab **之前**，
#   于是**抢走 443 默认 server** —— 裸 IP 访问（浏览器/curl 用 IP 时**不发 SNI**）会落到本块，
#   拿到 mall.lexy.cn 证书（IP 链路当场 ERR_TLS_CERT_ALTNAME_INVALID），
#   而且 stopwatch-lab 里那条 `location / → 127.0.0.1:80` 的 catch-all（/stopwatch/v1/* 等）**全变 404**。
#   实测过：2026-10-14 首次上线即踩此坑，秒表接口与 IP 链路同时坏。
#   排在最后 ⇒ 默认 server 仍是 stopwatch-lab；而 SNI=mall.lexy.cn 的请求**按 server_name 精确匹配**，
#   与加载顺序无关 —— 两头都对。**理由不成立前不要改这个名字。**
#
# ⚠️ 前置条件（脚本自己校验，**拿不准就退出**，不猜）：
#   · 域名 A 记录已指向本机公网 IP —— 否则 HTTP-01 必失败
#   · 域名已完成 ICP 备案 —— 微信侧要求（本脚本不查备案状态，那是你自己确认的事）
#
# 回滚（任一步出错都安全）：
#   rm -f /etc/nginx/sites-enabled/lexy-mall-domain-80 /etc/nginx/sites-enabled/zz-lexy-mall-domain-443
#   nginx -t && systemctl reload nginx
#   （证书留着无害，下次重跑直接复用。）
#
set -euo pipefail

DOMAIN="${DOMAIN:-mall.lexy.cn}"
ACME_EMAIL="${ACME_EMAIL:-lexy@kingclean.com}"
UPSTREAM="${UPSTREAM:-http://127.0.0.1:3000}"
WEBROOT="/var/www/lexy-acme"
AVAIL=/etc/nginx/sites-available
ENAB=/etc/nginx/sites-enabled
F80="$AVAIL/lexy-mall-domain-80"
F443="$AVAIL/lexy-mall-domain-443"
# symlink 名刻意与文件名不同：必须排在 stopwatch-lab **之后**（原因见文件头注释）。
# 80 端口不需要这招 —— 那台的 `default` 块已显式写了 `listen 80 default_server`，不受顺序影响。
L443="$ENAB/zz-lexy-mall-domain-443"
LIVE="/etc/letsencrypt/live/$DOMAIN"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行"

# curl 是本脚本的探测工具（公网 IP、结尾三个探针）。缺了就装 —— 它没有 certbot 那种
# 「装出第二份、和既有体系打架」的风险。
if ! command -v curl >/dev/null 2>&1; then
  log "安装 curl（探测用）"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl
fi

# ────────────────────────────────────────────────── 0. 域名格式 + 本机 IP
echo "$DOMAIN" | grep -qE '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' \
  || die "DOMAIN 格式不对：$DOMAIN"

log "探测本机公网 IP"
PUBIP=""
for u in https://api.ipify.org https://ifconfig.me/ip http://ip.3322.net; do
  PUBIP="$(curl -fsS -m 6 "$u" 2>/dev/null | tr -d '[:space:]' || true)"
  case "$PUBIP" in
    *[!0-9.]*|'') PUBIP="" ;;
    *) break ;;
  esac
done
[ -n "$PUBIP" ] || die "探测不到本机公网 IP（三个源都不通）。可手工指定：PUBIP=1.2.3.4 bash $0"
log "本机公网 IP = $PUBIP"

# ────────────────────────────────────────────────── 1. certbot（前置条件：先把工具确认好，再去碰 DNS）
#
# ⚠️ 这台机器上 certbot **不在 PATH 里**：实测它是 Python venv 装的，位于
#    /opt/certbot-venv/bin/certbot，由 stopwatch-cert-renew.timer 每 30 分钟调一次续期。
#    所以必须**逐个候选路径探测**（不能用 `command -v`，也不能一上来 apt 装）——
#    apt-get install certbot 会装出**第二个** certbot，与既有 /etc/letsencrypt/renewal 体系打架。
CERTBOT=""
for c in /opt/certbot-venv/bin/certbot /snap/bin/certbot /usr/local/bin/certbot /usr/bin/certbot; do
  if [ -x "$c" ]; then CERTBOT="$c"; break; fi
done
if [ -z "$CERTBOT" ]; then
  CERTBOT="$(command -v certbot 2>/dev/null || true)"
fi
[ -n "$CERTBOT" ] || die "这台机器上找不到 certbot。**不要用 apt 装**（会与既有体系冲突）。
     建议按机器惯例装到独立 venv，例如：
       python3 -m venv /opt/lexy-certbot-venv && /opt/lexy-certbot-venv/bin/pip install certbot
     装好后重跑本脚本即可。"
log "certbot = $CERTBOT（$("$CERTBOT" --version 2>&1 | awk '{print $2}')）"

# ────────────────────────────────────────────────── 2. DNS 是否已指向本机
log "校验 $DOMAIN 的 A 记录"
RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
if [ -z "${RESOLVED// /}" ]; then
  die "$DOMAIN 解析不到任何 A 记录。请先在域名控制台加：A 记录 $DOMAIN → $PUBIP（等生效后再跑本脚本）
     加记录的地方：lexy.cn 的 NS 是 ns1/ns2.ename.net（易名中国），公司 DNS 管理权限在 IT/网络组手里。"
fi
log "当前解析到：$RESOLVED"
if ! echo " $RESOLVED " | grep -q " $PUBIP "; then
  die "$DOMAIN 没有解析到本机 $PUBIP（当前 $RESOLVED）。
     要么加 A 记录，要么换成已指向本机的域名。**不跳过**：HTTP-01 校验必然失败，签不出证书。"
fi
log "DNS 已指向本机 ✓"

# ────────────────────────────────────────────────── 3. 80 端口块（HTTP-01 用）
log "写 80 端口 server 块 → $F80"
mkdir -p "$WEBROOT/.well-known/acme-challenge"
cat > "$F80" <<EOF
# 由 /opt/lexy-mall/deploy/enable-domain-https.sh 生成（$STAMP）—— 请勿手工编辑
# 作用：给 Let's Encrypt 做 HTTP-01 校验；其余 http 请求 301 到 https。
# 回滚：rm -f $ENAB/lexy-mall-domain-80 && nginx -t && systemctl reload nginx
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;

  # certbot webroot 校验目录（只有这个前缀走静态文件，其余一律跳 https）
  location ^~ /.well-known/acme-challenge/ {
    root $WEBROOT;
    default_type text/plain;
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}
EOF

ln -sfn "$F80" "$ENAB/lexy-mall-domain-80"
nginx -t || { rm -f "$ENAB/lexy-mall-domain-80"; die "nginx 配置校验失败，已撤销 80 块（未 reload）"; }
systemctl reload nginx
log "80 块已生效"

# ────────────────────────────────────────────────── 4. 签证书
if [ -f "$LIVE/fullchain.pem" ]; then
  log "证书已存在（$LIVE），跳过签发（续期由 certbot 定时器负责）"
else
  log "向 Let's Encrypt 申请证书：$DOMAIN"
  # --deploy-hook 会写进**这张证书自己的** renewal conf（只对它生效），不碰共享的
  # certbot 配置。机器既有 stopwatch-cert-renew.timer 跑的是 `certbot renew`，
  # 它会遍历 /etc/letsencrypt/renewal/ 下所有配置 → 我们这张也会被自动续期，
  # 续完由这个 hook 校验并 reload nginx。
  if ! "$CERTBOT" certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
       --email "$ACME_EMAIL" --agree-tos --no-eff-email \
       --non-interactive --keep-until-expiring \
       --deploy-hook "nginx -t && systemctl reload nginx"; then
    die "签发失败。常见原因：
     · 80 端口从公网不可达（腾讯云安全组 / 云防火墙要放行 80）
     · A 记录刚改、还没生效（等 1~10 分钟再跑，本脚本可重复执行）
     · 同一域名本周申请次数超限（Let's Encrypt 5 次/周）
     80 块已留着，修好后重跑本脚本即可。"
  fi
  log "证书已签发 ✓"
fi

# ────────────────────────────────────────────────── 5. 443 端口块（HTTPS 反代）
# nginx ≥ 1.25.1 用 `http2 on;`，更早版本必须写在 listen 里（写错直接 nginx -t 报错）
NV="$(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ "$(printf '%s\n1.25.1\n' "$NV" | sort -V | head -1)" = "1.25.1" ]; then
  LISTEN443="  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;"
else
  LISTEN443="  listen 443 ssl http2;
  listen [::]:443 ssl http2;"
fi
log "nginx $NV → 按该版本语法写 443 块"

log "写 443 端口 server 块 → $F443"
cat > "$F443" <<EOF
# 由 /opt/lexy-mall/deploy/enable-domain-https.sh 生成（$STAMP）—— 请勿手工编辑
# 作用：小程序唯一的正式入口 https://$DOMAIN/mall-api/… → 127.0.0.1:3000
#
# 为什么直接反代 3000、而不是绕 80 上的 lexy-official-site：
#   少一跳、少一个依赖；这个块只服务本域名，别人的站点配置怎么改都影响不到它。
#   注意 /mall-api/ 会命中 proxy_pass 末尾的 “/” → 前缀被替换掉：
#     /mall-api/api/health      → /api/health
#     /mall-api/uploads/x.png   → /uploads/x.png
#   所以小程序端 BASE_URL 必须带 /mall-api 这一段（与 IP 链路完全一致）。
#
# 回滚：rm -f $ENAB/zz-lexy-mall-domain-443 && nginx -t && systemctl reload nginx
server {
$LISTEN443
  server_name $DOMAIN;

  ssl_certificate     $LIVE/fullchain.pem;
  ssl_certificate_key $LIVE/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers off;
  # 有意不写 ssl_session_cache：那台机器上别的站点已定义过同名缓存，撞名字会 nginx -t 失败。

  add_header X-Content-Type-Options nosniff always;

  # 必须 ≥ 后端 media.js 的视频上限（50MB）+ multipart 开销，否则素材上传 413
  client_max_body_size 60m;

  location ^~ /mall-api/ {
    proxy_pass $UPSTREAM/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    client_max_body_size 60m;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;
  }

  # 根路径给个人话的说明，避免审核/运营点进来看到 404 以为服务挂了
  location = / {
    default_type application/json;
    return 200 '{"service":"lexy-mall-api","ok":true,"tip":"小程序后端接口，正式入口 /mall-api/"}';
  }

  location / { return 404; }
}
EOF

# 清掉历史/错误命名的 symlink —— 名字排在 stopwatch-lab 之前会抢走 443 默认 server（见文件头注释）
rm -f "$ENAB/lexy-mall-domain-443"
ln -sfn "$F443" "$L443"
nginx -t || { rm -f "$L443"; die "nginx 配置校验失败，已撤销 443 块（原服务未受影响）"; }
systemctl reload nginx
log "443 块已生效"

# ────────────────────────────────────────────────── 6. 续期保障（**不新增全局钩子**）
#
# 这台机器已有 stopwatch-cert-renew.timer（每 30 分钟）跑：
#   /opt/certbot-venv/bin/certbot renew --quiet --deploy-hook /usr/local/sbin/stopwatch-cert-deploy
# `certbot renew` 会遍历 /etc/letsencrypt/renewal/ 下**所有**配置，所以我们这张证书到期前
# 会被它一并续期；续完由第 4 步写进我们自己 renewal conf 的 deploy-hook 负责 reload nginx。
#
# 刻意**不往 /etc/letsencrypt/renewal-hooks/ 放全局脚本**：那是共享资源，会波及别人的业务。
# 这一节只「核实」，不改动别人的东西。
RENEWAL_CONF="/etc/letsencrypt/renewal/$DOMAIN.conf"
if [ -f "$RENEWAL_CONF" ] && grep -q 'reload nginx' "$RENEWAL_CONF"; then
  log "续期钩子已写进 $RENEWAL_CONF ✓（到期自动续 + 自动 reload nginx）"
else
  warn "没在 $RENEWAL_CONF 里看到 reload nginx 的钩子 —— 证书续期后 nginx 可能仍用旧证书"
  warn "手工在 $RENEWAL_CONF 的 [renewalparams] 段补一行即可："
  warn "    renew_hook = nginx -t && systemctl reload nginx"
fi

if systemctl list-timers --all 2>/dev/null | grep -qiE 'certbot|stopwatch-cert-renew'; then
  log "续期定时器在跑 ✓ $(systemctl list-timers --all 2>/dev/null | grep -iE 'certbot|stopwatch-cert-renew' | head -1 | awk '{print $1, $2, $3}')"
else
  warn "没找到任何续期定时器 —— 加一条 cron 兜底（用上面探测到的 certbot 绝对路径）"
  cat > /etc/cron.d/lexy-cert-renew <<EOF
# 每天 03:17 与 15:17 尝试续期（certbot 自身只在临期 30 天内才真正续）
17 3,15 * * * root $CERTBOT renew -q --deploy-hook "nginx -t && systemctl reload nginx"
EOF
  log "已写 /etc/cron.d/lexy-cert-renew"
fi

# ────────────────────────────────────────────────── 7. 本机探针（不依赖公网 DNS）
#
# ⚠️ 先等 443 真的切过来。`systemctl reload nginx` 是**异步**的：它发完 HUP 就返回，
#    master 这时才去解析新配置、拉起新 worker；在这个窗口里**旧 worker 仍在接受连接**，
#    于是立刻探测会拿到**旧配置**（那张 14.103.50.137 的 IP 证书）→ curl 报
#      curl: (60) SSL: no alternative certificate subject name matches target host name
#    本轮实测踩到：脚本内探针报红、30 秒后手工复测全绿（HTTP 200 / ssl_verify=0）。
#    这种「假红」最坑人 —— 会让人以为证书签错了，跑去删配置重签。
#    判据：不是看「nginx -t 通过」，而是看 **443 上是否已经在回报本域名的证书**。
log "等待 443 生效（reload 异步，旧 worker 会短暂用旧配置应答）"
wait_cert() {
  for _ in $(seq 1 15); do
    subj="$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null \
             | openssl x509 -noout -subject 2>/dev/null || true)"
    case "$subj" in *"$DOMAIN"*) return 0 ;; esac
    sleep 1
  done
  return 1
}
if wait_cert; then
  log "443 已在回报 $DOMAIN 的证书 ✓"
else
  warn "等 15 秒仍没看到 $DOMAIN 的证书 —— 下面的探针可能仍报 SNI 不匹配"
  warn "（多半还是 reload 竞态，直接重跑本脚本即可；证书已签好，重跑不会重复申请）"
fi

log "探针 1/3：走本机解析的 HTTPS 请求（--resolve，绕开公网 DNS 缓存）"
curl -fsS -m 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/mall-api/api/health"
echo

log "探针 2/3：证书里真的写着这个域名吗"
openssl x509 -in "$LIVE/fullchain.pem" -noout -checkend 86400 >/dev/null \
  || warn "证书 24 小时内到期，检查续期"
openssl x509 -in "$LIVE/fullchain.pem" -noout -ext subjectAltName | tail -1

log "探针 3/3：上传目录（图片/视频）也能通过新域名取到"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/mall-api/uploads/")"
echo "GET /mall-api/uploads/ → HTTP $CODE（403/404 都算正常，能连通即可）"

cat <<EOF

────────────────────────────────────────────────────────────────
✓ 服务器侧完成。小程序端改一行即可：

    miniprogram/utils/constants.js
      const ENV = 'server';
      server: 'https://$DOMAIN/mall-api',

  本机一键改（改完自动体检）：
      node .tooling/switch-env.mjs --url=https://$DOMAIN/mall-api

  微信公众平台还要配一次（只此一处）：
      开发管理 → 开发设置 → 服务器域名 → request 合法域名
      新增：https://$DOMAIN

  回滚：
      rm -f $ENAB/lexy-mall-domain-80 $ENAB/zz-lexy-mall-domain-443 \\
        && nginx -t && systemctl reload nginx
      （IP 链路 https://14.103.50.137/mall-api 全程没动，随时可切回去。）
────────────────────────────────────────────────────────────────
EOF
