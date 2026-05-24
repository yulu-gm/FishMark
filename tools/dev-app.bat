@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [dev-app] Node.js is required but was not found in PATH.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [dev-app] npm.cmd is required but was not found in PATH.
  pause
  exit /b 1
)

cd /d "%~dp0\.."

set "PACKAGE_LOCK=package-lock.json"
set "INSTALLED_LOCK=node_modules\.package-lock.json"

node -e "const fs=require('node:fs');const lock=process.env.PACKAGE_LOCK;const installed=process.env.INSTALLED_LOCK;process.exit(!fs.existsSync(installed)||fs.statSync(installed).mtimeMs<fs.statSync(lock).mtimeMs?1:0)"
if errorlevel 1 (
  echo [dev-app] Installing exact dependencies from package-lock.json...
  call npm.cmd ci
  if errorlevel 1 (
    echo.
    echo [dev-app] npm ci failed with exit code %errorlevel%.
    pause
    exit /b %errorlevel%
  )
) else (
  echo [dev-app] Dependencies are up to date.
)

node scripts/sync-dev-themes.mjs
if errorlevel 1 (
  echo.
  echo [dev-app] dev theme sync failed with exit code %errorlevel%.
  pause
  exit /b %errorlevel%
)

call npm run dev
set EXITCODE=%errorlevel%

echo.
echo [dev-app] process exited with code %EXITCODE%.
pause
exit /b %EXITCODE%
