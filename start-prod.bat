@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%"

where npm >nul 2>nul
if errorlevel 1 (
  echo [x] 没找到 npm，请先安装 Node.js 18+
  pause
  exit /b 1
)

if not exist "node_modules" call npm install --registry=https://registry.npmmirror.com

echo 构建前端...
call npm run build
if errorlevel 1 (
  echo [x] 构建失败
  pause
  exit /b 1
)

echo 启动单端口模式 http://127.0.0.1:3001 ...
start "Portfolio :3001" cmd /k "npm run start"
timeout /t 4 >nul
start http://127.0.0.1:3001/
pause
