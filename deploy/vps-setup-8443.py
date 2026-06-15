#!/usr/bin/env python3
"""
在 VPS 8443 提供 HTTPS 反代到 FRP 4725；80 提供 HTTP。
不修改 443，不停止 x-ui / xray。
"""
import os
import sys
import paramiko

HOST = os.environ.get("VPS_HOST", "154.83.91.109")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
DOMAIN = os.environ.get("VPS_DOMAIN", "churuku.duckdns.org")

NGINX_CONF = f"""# 出入库 — 不占 443（x-ui 翻墙专用）
# HTTP
server {{
    listen 80;
    server_name {DOMAIN};

    client_max_body_size 100m;

    location /.well-known/acme-challenge/ {{
        root /var/www/html;
    }}

    location / {{
        proxy_pass http://127.0.0.1:4725;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }}
}}

# HTTPS on 8443（手机拍照需 HTTPS，与 x-ui 443 共存）
server {{
    listen 8443 ssl http2;
    server_name {DOMAIN};

    ssl_certificate /etc/letsencrypt/live/{DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 100m;

    location / {{
        proxy_pass http://127.0.0.1:4725;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }}
}}
"""


def run(client, cmd: str, timeout: int = 120) -> int:
    print(f"\n>>> {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("STDERR:", err.rstrip())
    return code


def main() -> int:
    if not PASSWORD:
        print("请设置 VPS_PASSWORD", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    # 确保证书存在
    run(client, f"test -f /etc/letsencrypt/live/{DOMAIN}/fullchain.pem || echo NEED_CERT")
    run(client, "mkdir -p /var/www/html/.well-known/acme-challenge")
    run(
        client,
        f"test -f /etc/letsencrypt/live/{DOMAIN}/fullchain.pem || "
        f"certbot certonly --webroot -w /var/www/html -d {DOMAIN} "
        "--non-interactive --agree-tos --register-unsafely-without-email",
        timeout=300,
    )

    sftp = client.open_sftp()
    with sftp.file("/etc/nginx/sites-available/jade-inventory", "w") as f:
        f.write(NGINX_CONF)
    sftp.close()

    run(client, "ln -sf /etc/nginx/sites-available/jade-inventory /etc/nginx/sites-enabled/jade-inventory")
    run(client, "rm -f /etc/nginx/sites-enabled/default")
    code = run(client, "nginx -t")
    if code != 0:
        client.close()
        return code

    run(client, "systemctl enable nginx")
    run(client, "systemctl restart nginx")
    run(client, "ufw allow 80/tcp 2>/dev/null; ufw allow 8443/tcp 2>/dev/null; ufw allow 4725/tcp 2>/dev/null; true")
    run(client, "ss -tlnp | grep -E ':80|:443|:8443|:4725' || true")
    run(client, "systemctl is-active nginx x-ui frps")
    run(client, f"curl -skI https://127.0.0.1:8443/inventory -H 'Host: {DOMAIN}' | head -8")
    run(client, f"curl -sI http://127.0.0.1/inventory -H 'Host: {DOMAIN}' | head -8")
    client.close()

    print("\n=== 外网地址 ===")
    print(f"HTTPS（推荐手机）: https://{DOMAIN}:8443/inventory")
    print(f"HTTP:            http://{DOMAIN}/inventory")
    print(f"直连 FRP:        http://{HOST}:4725/inventory")
    print("443 / x-ui 未改动")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
