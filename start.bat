@echo off
echo ============================================
echo   Kachuful - Start
echo ============================================
echo.
echo [1] Dev mode  (client on :3000, server on :3001)
echo [2] Prod mode (everything on :3001, run build.bat first)
echo.
set /p choice="Choose [1/2]: "

if "%choice%"=="2" goto prod

:dev
echo.
echo Starting dev servers...
start "Kachuful Server" cmd /k "cd /d %~dp0server && node index.js"
timeout /t 2 /nobreak >nul
start "Kachuful Client" cmd /k "cd /d %~dp0client && npm start"
echo Opened at http://localhost:3000
goto end

:prod
echo.
echo Starting production server...
start "Kachuful" cmd /k "cd /d %~dp0server && node index.js"
echo Opened at http://localhost:3001
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001"

:end
echo.
pause
