@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3000'"
"C:\Users\Voyager\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server\app.js
pause
