@echo off
title Stopping all services...

echo.
echo   Stopping all Ling Shan AI Guide services...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
    echo   [OK] Main server stopped (port 8000)
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001.*LISTENING" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
    echo   [OK] TTS service stopped (port 8001)
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8002.*LISTENING" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
    echo   [OK] Vector search stopped (port 8002)
)

echo.
echo   All services stopped.
echo.
pause
