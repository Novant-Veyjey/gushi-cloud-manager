@echo off
chcp 65001 >nul
title GUSHI-CLOUD-LAUNCHER
echo ==========================================================
echo   Gu Shi Cloud Manager - one click start
echo   backend  :3000     browser preview  :5173
echo ==========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$r = (Resolve-Path '%~dp0..\..').Path; $b = $r + '\server'; Write-Host ('[1/2] backend  : ' + $b); Start-Process node -ArgumentList 'server/app.js' -WorkingDirectory $b; Start-Sleep -Seconds 2; $m = $r + '\miniapp'; if (-not (Test-Path ($m + '\dist-h5\index.html'))) { Write-Host 'first run: building h5 (about 30s)...'; Start-Process npm -ArgumentList 'run','build:h5' -WorkingDirectory $m -Wait -NoNewWindow }; Write-Host '[2/2] preview  : ' + $m; Start-Process node -ArgumentList 'scripts/serve-h5.js' -WorkingDirectory $m; Start-Sleep -Seconds 3; Start-Process 'http://localhost:5173'; Write-Host 'done: backend :3000 , preview :5173'"

echo.
echo Two windows must stay open - closing them stops the services.
echo   - this PC : http://localhost:5173
echo   - same wifi phone : http://^<use ipconfig IPv4^>:5173
echo   - phone on PC hotspot : http://192.168.137.1:5173
echo.
pause
