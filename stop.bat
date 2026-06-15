@echo off

chcp 65001 >nul

cd /d "%~dp0"



echo 正在停止本系统相关 Node 进程（4725 端口）...



for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4725 " ^| findstr "LISTENING"') do (

  echo 结束 PID %%a

  taskkill /F /PID %%a >nul 2>&1

)



timeout /t 2 /nobreak >nul

echo 已尝试释放端口。现在可重新运行 start.bat

pause

