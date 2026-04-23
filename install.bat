@echo off
echo ============================================
echo   Kachuful - Installing Dependencies
echo ============================================
echo.

echo [1/2] Installing server dependencies...
cd server
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Server install failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Installing client dependencies...
cd client
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Client install failed!
    pause
    exit /b 1
)
cd ..

echo.
echo ============================================
echo   Done! Run START.bat to launch the game.
echo ============================================
pause
