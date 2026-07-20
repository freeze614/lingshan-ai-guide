@echo off
cd /d "%~dp0"
echo ========================================================
echo   LingShan AI Digital Human Tour Guide
echo ========================================================
echo.

:: ---- First run: install if needed ----
cd backend
if not exist "node_modules" (
    echo [Setup] Installing backend dependencies...
    call npm install
)
cd ..

cd frontend
if not exist "node_modules" (
    echo [Setup] Installing frontend dependencies...
    call npm install
)
cd ..

if not exist "frontend-dist" (
    echo [Setup] Building frontend...
    cd frontend
    call npm run build
    cd ..
)

python -c "import edge_tts" >nul 2>&1
if errorlevel 1 (
    echo [Setup] Installing Python packages...
    pip install edge-tts chromadb sentence-transformers -q
)

:: ---- Start services ----
echo.
echo Starting services...
start "TTS" /min cmd /c "cd backend && python scripts/tts_server.py"
echo [OK] TTS (port 8001)
start "Vector" /min cmd /c "cd backend && python services/vector_service.py"
echo [OK] Vector search (port 8002)
timeout /t 5 /nobreak >nul
start "LingShan" cmd /c "cd backend && npm run dev"
echo [OK] Main server (port 8000)...
timeout /t 6 /nobreak >nul

echo.
echo Opening browser...
start http://localhost:8000
echo Ready! http://localhost:8000
echo Admin: http://localhost:8000/admin/login (admin / lingshan2026)
pause
