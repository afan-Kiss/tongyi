#!/usr/bin/env python3
"""只读诊断 VPS，不修改 443 / x-ui"""
import os
import sys
import paramiko

HOST = os.environ.get("VPS_HOST", "154.83.91.109")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")

CMDS = [
    "ss -tlnp | grep -E ':80|:443|:4725|:7000|:8443' || true",
    "systemctl is-active nginx frps x-ui 2>/dev/null || true",
    "curl -sI -m 5 http://127.0.0.1:4725/inventory | head -5",
    "curl -sI -m 5 http://127.0.0.1/ | head -5 || true",
    "ls -la /etc/letsencrypt/live/churuku.duckdns.org/ 2>/dev/null || echo no-cert",
    "cat /etc/nginx/sites-enabled/jade-inventory 2>/dev/null | head -80",
]


def main() -> int:
    if not PASSWORD:
        print("请设置 VPS_PASSWORD", file=sys.stderr)
        return 1
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    for cmd in CMDS:
        print("\n>>>", cmd)
        _, stdout, stderr = client.exec_command(cmd, timeout=30)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        if out.strip():
            print(out.rstrip())
        if err.strip():
            print("ERR:", err.rstrip())
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
