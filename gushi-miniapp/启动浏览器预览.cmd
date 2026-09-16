@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  Gu Shi Cloud Manager - Browser Preview
echo ============================================
echo.

if not exist "dist-h5\index.html" (
  echo [1/3] dist-h5 not found, building browser version...
  call npm run build:h5
) else (
  echo [1/3] dist-h5 ready.
)

echo.
echo [2/3] Starting preview server on http://localhost:5173
echo       Keep this window open. Close it to stop the preview.
echo.
start "gushi-preview-5173" cmd /k "cd /d "%~dp0" && npm run preview:h5"

timeout /t 4 /nobreak >nul

echo [3/3] Opening browser...
start "" "http://localhost:5173"

echo.
echo Reminder: the backend must be running too (port 3000),
echo otherwise the page will show a connection error.
echo Demo account: demo / demo123456
echo.
pause
