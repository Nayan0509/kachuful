@echo off
echo Stopping Kachuful servers...
taskkill /FI "WINDOWTITLE eq Kachuful Server*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Kachuful Client*" /T /F >nul 2>&1
echo Done.
pause
