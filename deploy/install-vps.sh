#!/usr/bin/env bash
# VPS 一次性安装 frps + nginx（Debian/Ubuntu）
# 用法：sudo bash install-vps.sh
# 不会写入任何密码；请事先准备好 frp token

set -euo pipefail

FRP_VERSION="${FRP_VERSION:-0.69.1}"
FRP_TOKEN="${FRP_TOKEN:-}"

if [[ -z "$FRP_TOKEN" ]]; then
  echo "请设置环境变量 FRP_TOKEN，例如："
  echo "  sudo FRP_TOKEN='your-strong-token' bash install-vps.sh"
  exit 1
fi

echo "[1/5] 安装 nginx..."
apt-get update -y
apt-get install -y nginx curl unzip

echo "[2/5] 安装 frps ${FRP_VERSION}..."
cd /tmp
ARCHIVE="frp_${FRP_VERSION}_linux_amd64"
curl -fsSL -o frp.tgz "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${ARCHIVE}.tar.gz"
tar -xzf frp.tgz
install -m 755 "${ARCHIVE}/frps" /usr/local/bin/frps
mkdir -p /etc/frp

cat > /etc/frp/frps.toml <<EOF
bindPort = 7000
auth.method = "token"
auth.token = "${FRP_TOKEN}"
allowPorts = [{ start = 4725, end = 4725 }]
EOF

cat > /etc/systemd/system/frps.service <<'EOF'
[Unit]
Description=frp server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/frps -c /etc/frp/frps.toml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable frps
systemctl restart frps

echo "[3/5] 配置 nginx..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "${SCRIPT_DIR}/nginx-inventory.conf" /etc/nginx/sites-available/jade-inventory
ln -sf /etc/nginx/sites-available/jade-inventory /etc/nginx/sites-enabled/jade-inventory
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "[4/5] 防火墙（如已启用 ufw）..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 7000/tcp || true
fi

echo "[5/5] 完成"
echo "frps: systemctl status frps"
echo "nginx: systemctl status nginx"
echo "请将相同 FRP_TOKEN 填入本机 deploy/frpc.toml"
