#!/usr/bin/env python3
"""释放 443 并申请 HTTPS 证书"""
import os, paramiko, time
HOST, USER = "154.83.91.109", "root"
PWD = os.environ.get("VPS_PASSWORD", "")
DOMAIN = "churuku.duckdns.org"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=600):
    print("\n>>>", cmd)
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode()
    err = e.read().decode()
    code = o.channel.recv_exit_status()
    if out.strip(): print(out.rstrip())
    if err.strip(): print("STDERR:", err.rstrip())
    return code

run("systemctl stop xray 2>/dev/null || true")
run("systemctl disable xray 2>/dev/null || true")
run("pkill -f xray-linux-amd64 2>/dev/null || true")
time.sleep(2)
run("ss -tlnp | grep ':443' || echo '443 free'")
code = run(
    f"certbot --nginx -d {DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect --force-renewal",
    timeout=300,
)
if code != 0:
    run(f"certbot certonly --webroot -w /var/www/html -d {DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email || true")
run("nginx -t && systemctl reload nginx")
run("curl -sI https://churuku.duckdns.org/ | head -8 || true")
run("ss -tlnp | grep -E ':80|:443|:4725'")
client.close()
print("done, certbot code", code)
