@echo off
cd /d "%~dp0"

echo.
echo ========================================================
echo   Push to GitHub - Ling Shan AI Tour Guide
echo ========================================================
echo.

git add "启动数字人.bat"
git add "停止服务.bat"
git add "队友体验指南.md"
git add "start.bat"
git add ".gitignore"
git add ".env.example"
git add "提交到GitHub.bat"

git commit -m "add one-click launcher: double-click to run everything

- startup script auto-checks env, installs deps, starts services, opens browser
- stop script to kill all services
- user guide for non-programmers
- update .gitignore to exclude node_modules and frontend-dist
- remove node_modules and frontend-dist from git tracking"

echo.
echo Pushing to GitHub...
echo.

git push origin master

echo.
echo Done! Now anyone can clone and double-click to run.
echo.
pause
