@echo off
chcp 65001 >nul
cd /d "%~dp0..\..\server"
title gushi-cloud-backend-3000

echo ============================================
echo  Gu Shi Cloud Manager - Backend (port 3000)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18+ first.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Backend dependencies not found, installing...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting backend: http://localhost:3000
echo Keep this window open. Press Ctrl+C or close it to stop.
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:3000'"
node server\app.js

echo.
echo Backend stopped.
pause
