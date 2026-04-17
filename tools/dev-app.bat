@echo off
setlocal

cd /d "%~dp0\.."
node scripts/sync-dev-themes.mjs
if errorlevel 1 exit /b %errorlevel%
call npm run dev
