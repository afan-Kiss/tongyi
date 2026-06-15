@echo off
cd /d "%~dp0"
if not exist frpc.toml (
  echo 请先复制 frpc.example.toml 为 frpc.toml 并填写 token
  pause
  exit /b 1
)
if not exist frpc\frpc.exe (
  echo 请下载 frp 并将 frpc.exe 放到 deploy\frpc\ 目录
  echo https://github.com/fatedier/frp/releases
  pause
  exit /b 1
)
frpc\frpc.exe -c frpc.toml
