@echo off

chcp 65001 >nul

cd /d "%~dp0"



echo ========================================

echo  和田玉手镯管理系统

echo  出库入库(4725) + 祥钰打包拍照(内置 apps/xiangyu)

echo ========================================



where node >nul 2>&1

if errorlevel 1 (

  echo [错误] 未找到 Node.js 18+

  pause

  exit /b 1

)



if not exist node_modules call npm install



if not exist apps\server\.env copy apps\server\.env.example apps\server\.env >nul



if not exist apps\xiangyu\config.json (

  if exist apps\xiangyu\config.example.json (

    copy /Y apps\xiangyu\config.example.json apps\xiangyu\config.json >nul

    echo [提示] 已生成 apps\xiangyu\config.json

  ) else (

    echo [错误] 缺少 apps/xiangyu 模块

    pause

    exit /b 1

  )

)



netstat -ano | findstr ":4725 " | findstr "LISTENING" >nul 2>&1

if not errorlevel 1 (

  echo.

  echo [提示] 检测到 4725 端口占用，正在自动停止旧进程...

  call "%~dp0stop.bat" silent

  echo.

)



cd apps\server

set DATABASE_URL=file:../data/app.db



call npx prisma migrate deploy --schema=prisma/schema.prisma

if errorlevel 1 (

  echo [错误] 数据库迁移失败

  cd ..\..

  pause

  exit /b 1

)



set PRISMA_CLIENT=..\..\node_modules\.prisma\client\query_engine-windows.dll.node

if not exist "%PRISMA_CLIENT%" (

  echo [提示] 首次生成 Prisma Client...

  call npx prisma generate --schema=prisma/schema.prisma

) else (

  echo [跳过] Prisma Client 已存在

)



if errorlevel 1 (

  if exist "%PRISMA_CLIENT%" (

    echo [警告] prisma generate 失败但 Client 已存在，继续启动...

  ) else (

    echo [错误] prisma generate 失败，请先关闭所有后端窗口后重试

    cd ..\..

    pause

    exit /b 1

  )

)



cd ..\..



if exist agents\excel-bridge\requirements.txt (

  pushd agents\excel-bridge

  if not exist .venv python -m venv .venv

  call .venv\Scripts\activate.bat

  pip install -r requirements.txt -q

  popd

)



if exist agents\print-agent\requirements.txt (

  pushd agents\print-agent

  if not exist .venv python -m venv .venv

  call .venv\Scripts\activate.bat

  pip install -r requirements.txt -q

  popd

)



set NODE_OPTIONS=--max-old-space-size=4096

call npm run build

if errorlevel 1 (

  echo [错误] 构建失败

  pause

  exit /b 1

)



echo.

echo 启动前请打开 Excel 库存表

echo 本机: http://127.0.0.1:4725/inventory

echo.

echo [提示] 关闭本窗口即停止全部服务

echo.



set NODE_ENV=production

rem 运行时也给 Node 4GB 堆，避免长时间运行后 OOM
set NODE_OPTIONS=--max-old-space-size=4096

rem 允许手机访问拍照 HTTPS 端口（4730，与主服务同进程）
netsh advfirewall firewall add rule name="Jade Mobile Camera HTTPS" dir=in action=allow protocol=TCP localport=4730 >nul 2>&1

call npm run start:all



echo.

echo [已停止] 服务已退出

pause

