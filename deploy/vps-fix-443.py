#!/usr/bin/env python3
"""释放 443 给 nginx（停用冲突的 x-ui/xray）"""
import os
import sys
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "154.83.91.109")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
DOMAIN = os.environ.get("VPS_DOMAIN", "churuku.duckdns.org")


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

    run(client, "systemctl stop x-ui 2>/dev/null || true")
    run(client, "systemctl disable x-ui 2>/dev/null || true")
    run(client, "pkill -9 -f xray-linux-amd64 2>/dev/null || true")
    run(client, "pkill -9 -f x-ui 2>/dev/null || true")
    time.sleep(2)
    run(client, "ss -tlnp | grep -E ':80|:443' || echo 'ports check'")
    code = run(client, "nginx -t && systemctl restart nginx")
    if code != 0:
        run(client, "journalctl -u nginx --no-pager -n 20")
        return code
    time.sleep(1)
    run(client, "ss -tlnp | grep -E ':80|:443'")
    run(
        client,
        f'curl -skI https://127.0.0.1/inventory -H "Host: {DOMAIN}" | head -12',
    )
    run(client, f"curl -skI https://{DOMAIN}/inventory | head -12")
    run(client, "systemctl status nginx --no-pager | head -15")
    run(client, "systemctl status frps --no-pager | head -10")
    client.close()
    print("\n443 已交给 nginx，HTTPS 应可用。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
