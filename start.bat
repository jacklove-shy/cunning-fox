@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%"

where npm >nul 2>nul
if errorlevel 1 (
  echo [x] 没找到 npm，请先安装 Node.js 18+ 并确保在 PATH 里
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] 首次运行，安装依赖（用国内镜像，约 1-2 分钟）...
  call npm install --registry=https://registry.npmmirror.com
)

echo [2/2] 启动前后端...
start "Portfolio-API :3001" cmd /k "npm run dev:api"
start "Portfolio-WEB :5173" cmd /k "npm run dev:web"
timeout /t 5 >nul
start http://127.0.0.1:5173/

echo.
echo 前端 http://127.0.0.1:5173   接口 http://127.0.0.1:3001/api
echo 关闭两个控制台窗口即停止服务。
pause
