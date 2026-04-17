@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [Yulora] Node.js is required but was not found in PATH.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [Yulora] npm.cmd is required but was not found in PATH.
  exit /b 1
)

cd /d "%~dp0\.."
call npm.cmd run package:win
exit /b %errorlevel%
