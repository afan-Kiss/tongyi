@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo 正在停止本系统相关进程...

powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*supervisor.js*' } | ForEach-Object { Write-Host ('结束 supervisor PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4725 " ^| findstr "LISTENING"') do (
  echo 结束 4725 端口进程 PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

ping -n 3 127.0.0.1 >nul

echo 已尝试释放端口。现在可重新运行 start.bat

if not "%1"=="silent" pause
