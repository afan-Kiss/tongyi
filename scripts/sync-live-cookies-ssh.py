#!/usr/bin/env python3
"""SSH 到主播分析服务器导出 Cookie，并写入本地辅助出库 config.json"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("SSH_PASS", "")
ROOT = Path(__file__).resolve().parents[1]
EXPORT_JS = ROOT / "scripts" / "export-live-cookies-server.js"
REMOTE_JS = "/www/wwwroot/zhubo-analysis/apps/server/export-live-cookies-server.js"
OUTBOUND_PATHS = [
    ROOT.parent / "辅助出库软件" / "config.json",
    ROOT.parent / "辅助出库软件" / "dist" / "config.json",
]


def merge_accounts(remote: list[dict], existing: list[dict]) -> list[dict]:
    by_name = {str(a.get("name", "")).strip(): a for a in existing}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    merged = []
    for idx, remote_row in enumerate(remote):
        name = str(remote_row.get("name", "")).strip()
        cookie = str(remote_row.get("cookie", "")).strip()
        if not name or len(cookie) < 80:
            raise RuntimeError(f"直播号「{name or '(无名)'}」Cookie 无效")
        prev = by_name.get(name)
        merged.append(
            {
                "id": (prev or {}).get("id") or remote_row.get("id") or f"remote-{idx}",
                "name": name,
                "cookie": cookie,
                "enabled": remote_row.get("enabled", True) is not False,
                "is_default": (prev or {}).get("is_default", idx == 0),
                "last_test_status": "",
                "last_test_message": "",
                "last_test_at": now,
                "created_at": (prev or {}).get("created_at") or now,
                "updated_at": now,
            }
        )
    return merged


def main() -> None:
    if not PASSWORD:
        print("缺少 SSH_PASS 环境变量", file=sys.stderr)
        sys.exit(1)
    if not EXPORT_JS.is_file():
        print(f"未找到 {EXPORT_JS}", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    try:
        sftp = client.open_sftp()
        sftp.put(str(EXPORT_JS), REMOTE_JS)
        sftp.close()

        cmd = f"cd /www/wwwroot/zhubo-analysis/apps/server && node {REMOTE_JS}"
        _, stdout, stderr = client.exec_command(cmd, timeout=120)
        out = stdout.read().decode("utf-8", errors="replace").strip()
        err = stderr.read().decode("utf-8", errors="replace").strip()
        code = stdout.channel.recv_exit_status()
        if code != 0:
            print(err or out or f"远程导出失败 exit={code}", file=sys.stderr)
            sys.exit(code)

        remote = json.loads(out)
        if not isinstance(remote, list) or not remote:
            print("服务器未返回直播号", file=sys.stderr)
            sys.exit(1)

        existing: list[dict] = []
        for p in OUTBOUND_PATHS:
            if p.is_file():
                existing = json.loads(p.read_text(encoding="utf-8")).get("xhs_accounts") or []
                break

        merged = merge_accounts(remote, existing)
        written = []
        for p in OUTBOUND_PATHS:
            if not p.is_file():
                continue
            cfg = json.loads(p.read_text(encoding="utf-8"))
            cfg["xhs_accounts"] = merged
            cfg["xhs_accounts_managed"] = True
            default = next((a for a in merged if a.get("is_default")), merged[0])
            cfg["xhs_cookie"] = default["cookie"]
            p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            written.append(str(p))

        if not written:
            print("未找到本地 config.json", file=sys.stderr)
            sys.exit(1)

        print(f"已从服务器同步 {len(merged)} 个店铺 Cookie:")
        for a in merged:
            print(f"  - {a['name']} ({len(a['cookie'])} 字符)")
        for p in written:
            print(f"  → {p}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
