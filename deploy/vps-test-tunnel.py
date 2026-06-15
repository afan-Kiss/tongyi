#!/usr/bin/env python3
import os, paramiko
HOST, USER = "154.83.91.109", "root"
PWD = os.environ.get("VPS_PASSWORD", "")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PWD, timeout=30)
for c in [
    "curl -sI http://127.0.0.1:4725/inventory | head -5",
    "curl -sI http://127.0.0.1/inventory | head -5",
    "ps aux | grep xray | grep -v grep",
    "systemctl list-unit-files | grep -i xray || true",
]:
    print("\n>>>", c)
    _, o, e = client.exec_command(c)
    print(o.read().decode())
client.close()
