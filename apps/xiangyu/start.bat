@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title 祥钰系统

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node 18+
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [提示] 首次运行，正在安装依赖…
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败
    pause
    exit /b 1
  )
)

if not exist "config.json" (
  if exist "config.example.json" (
    echo [提示] 正在从 config.example.json 生成 config.json
    copy /Y "config.example.json" "config.json" >nul
  )
)

echo.
echo  ========================================
echo   祥钰系统 - 一键启动
echo.
echo   只需运行本窗口，勿重复打开其它启动脚本
echo   Web 4726  +  Bridge 4727  +  frpc
echo   关闭本窗口即停止全部服务
echo  ========================================
echo.

node scripts/supervisor.js
echo.
echo 服务已停止
pause
