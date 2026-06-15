#!/usr/bin/env python3
import os, paramiko
HOST, USER = "154.83.91.109", "root"
PWD = os.environ.get("VPS_PASSWORD", "")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PWD, timeout=30)
cmds = [
    "systemctl list-units --type=service | grep -E 'xray|nginx|frps' || true",
    "curl -sI http://127.0.0.1/ | head -5 || true",
    "curl -sI http://churuku.duckdns.org/ | head -8 || true",
    "ss -tlnp | grep -E ':80|:443|:4725|:7000'",
    "cat /etc/nginx/sites-enabled/jade-inventory",
]
for c in cmds:
    print("\n>>>", c)
    _, o, e = client.exec_command(c)
    print(o.read().decode())
    err = e.read().decode()
    if err.strip(): print("ERR", err)
client.close()
