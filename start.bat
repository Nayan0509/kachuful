@echo off
echo ============================================
echo   Kachuful - Starting Game
echo ============================================
echo.
echo Starting server on http://localhost:3001
echo Starting client on http://localhost:3000
echo.
echo Close this window to stop both servers.
echo ============================================

:: Start server in a new window
start "Kachuful Server" cmd /k "cd /d %~dp0server && node index.js"

:: Wait a moment for server to boot
timeout /t 2 /nobreak >nul

:: Start client in a new window
start "Kachuful Client" cmd /k "cd /d %~dp0client && npm start"

echo.
echo Both windows opened. Game will launch in your browser shortly.
echo.
pause
