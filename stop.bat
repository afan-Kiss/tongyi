@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo 正在停止本系统相关进程...

powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*supervisor.js*' -or $_.CommandLine -like '*bridge-relay.js*' } | ForEach-Object { Write-Host ('结束 node PID ' + $_.ProcessId + ' ' + ($_.CommandLine -replace '.*\\','')); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

for %%P in (1212 1213 1214 1215 1216 1217 1218) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    echo 结束 %%P 端口进程 PID %%a
    taskkill /F /PID %%a >nul 2>&1
  )
)

ping -n 3 127.0.0.1 >nul

echo 已尝试释放端口。现在可重新运行 start.bat

if not "%1"=="silent" pause
