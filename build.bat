@echo off
echo ============================================
echo   Kachuful - Build for Production
echo ============================================
echo.

echo [1/3] Building React client...
cd client
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: React build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Copying build into server/public...
if exist server\public (
    rmdir /s /q server\public
)
xcopy /e /i /q client\build server\public

echo.
echo [3/3] Done!
echo.
echo To run locally:   node server/index.js
echo To deploy:        push the /server folder (includes /public)
echo                   set PORT env var on your host
echo ============================================
pause
