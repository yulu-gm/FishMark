@echo off
setlocal

cd /d "%~dp0"

if not exist node_modules (
    echo [dev-test-workbench] node_modules missing, running npm install...
    call npm install
    if errorlevel 1 (
        echo.
        echo [dev-test-workbench] npm install failed with exit code %errorlevel%.
        pause
        exit /b %errorlevel%
    )
)

call npm run dev:test-workbench
set EXITCODE=%errorlevel%

echo.
echo [dev-test-workbench] process exited with code %EXITCODE%.
pause
exit /b %EXITCODE%
