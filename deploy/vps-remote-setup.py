#!/usr/bin/env python3
"""一次性远程配置 VPS：frps + nginx + certbot HTTPS"""
from __future__ import annotations

import os
import secrets
import sys
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "154.83.91.109")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
DOMAIN = os.environ.get("VPS_DOMAIN", "churuku.duckdns.org")
DEPLOY_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(DEPLOY_DIR, ".frp-token")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("STDERR:", err.rstrip())
    return code, out, err


def upload_sftp(client: paramiko.SSHClient, local: str, remote: str) -> None:
    with open(local, "rb") as f:
        data = f.read().replace(b"\r\n", b"\n")
    sftp = client.open_sftp()
    try:
        with sftp.file(remote, "w") as rf:
            rf.write(data)
    finally:
        sftp.close()
    print(f"uploaded {local} -> {remote}")


def main() -> int:
    if not PASSWORD:
        print("请设置环境变量 VPS_PASSWORD", file=sys.stderr)
        return 1

    token = os.environ.get("FRP_TOKEN", "").strip()
    if not token and os.path.isfile(TOKEN_FILE):
        token = open(TOKEN_FILE, encoding="utf-8").read().strip()
    if not token:
        token = secrets.token_urlsafe(32)
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(token)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"连接 {HOST} ...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    run(client, "uname -a")
    run(client, "mkdir -p /root/jade-deploy")

    upload_sftp(client, os.path.join(DEPLOY_DIR, "install-vps.sh"), "/root/jade-deploy/install-vps.sh")
    upload_sftp(client, os.path.join(DEPLOY_DIR, "nginx-inventory.conf"), "/root/jade-deploy/nginx-inventory.conf")

    code, _, _ = run(
        client,
        f"chmod +x /root/jade-deploy/install-vps.sh && FRP_TOKEN='{token}' bash /root/jade-deploy/install-vps.sh",
        timeout=900,
    )
    if code != 0:
        print("install-vps.sh 失败", file=sys.stderr)
        return code

    # certbot HTTPS
    run(client, "apt-get install -y certbot python3-certbot-nginx", timeout=900)
    code, out, err = run(
        client,
        f"certbot --nginx -d {DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect",
        timeout=900,
    )
    if code != 0:
        print("certbot 可能失败（请确认 duckdns 已指向本 VPS）", file=sys.stderr)
        print(out + err)

    run(client, "systemctl status frps --no-pager | head -20")
    run(client, "systemctl status nginx --no-pager | head -20")
    run(client, "ss -tlnp | grep -E ':80|:443|:4725|:7000' || true")

    # 写本机 frpc.toml
    frpc_path = os.path.join(DEPLOY_DIR, "frpc.toml")
    frpc_content = f"""# 自动生成 — 与 VPS frps 配对
serverAddr = "{HOST}"
serverPort = 7000

auth.method = "token"
auth.token = "{token}"

[[proxies]]
name = "jade-inventory-web"
type = "tcp"
localIP = "127.0.0.1"
localPort = 4725
remotePort = 4725
"""
    with open(frpc_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(frpc_content)
    print(f"\n已写入 {frpc_path}")

    client.close()
    print("\nVPS 配置完成。请在本机重启 start.bat 连接 frpc。")
    print(f"外网地址: https://{DOMAIN}/inventory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
