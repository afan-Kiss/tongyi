@echo off

chcp 65001 >nul

cd /d "%~dp0"



echo ========================================

echo  FRP 内网穿透 — 一键准备

echo ========================================



if not exist frpc.toml (

  if exist frpc.example.toml (

    copy /Y frpc.example.toml frpc.toml >nul

    echo [已生成] frpc.toml — 请用记事本打开，把 auth.token 改成与 VPS 一致的密钥

  ) else (

    echo [错误] 缺少 frpc.example.toml

    pause

    exit /b 1

  )

) else (

  echo [跳过] frpc.toml 已存在

)



if not exist frpc\frpc.exe (

  echo [下载] 正在下载 frpc.exe ...

  powershell -NoProfile -ExecutionPolicy Bypass -Command ^

    "$dir='%~dp0frpc'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; ^

     $zip=Join-Path $env:TEMP 'frp_win.zip'; ^

     Invoke-WebRequest -Uri 'https://github.com/fatedier/frp/releases/download/v0.69.1/frp_0.69.1_windows_amd64.zip' -OutFile $zip; ^

     Expand-Archive -Path $zip -DestinationPath (Join-Path $env:TEMP 'frp_extract') -Force; ^

     Copy-Item (Join-Path $env:TEMP 'frp_extract\frp_0.69.1_windows_amd64\frpc.exe') $dir -Force"

  if not exist frpc\frpc.exe (

    echo [错误] 下载失败，请手动将 frpc.exe 放到 deploy\frpc\ 目录

    echo https://github.com/fatedier/frp/releases

    pause

    exit /b 1

  )

  echo [完成] frpc.exe 已就绪

) else (

  echo [跳过] frpc.exe 已存在

)



echo.

echo 下一步：

echo  1. VPS 上运行 deploy\install-vps.sh（仅需一次）

echo  2. 编辑 deploy\frpc.toml 填写与服务器相同的 token

echo  3. 重启 start.bat，日志里出现 [frpc] 即表示隧道已连接

echo  4. 外网访问 http://你的VPS_IP:4725 （无需域名）

echo.

pause

