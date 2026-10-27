@echo off
title GitBot Companion - Setup and Self-Check
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo           🚀 GitBot Companion Initial Setup and Diagnostics
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Node.js was not found. Please install Node.js (https://nodejs.org/)
    pause
    exit /b 1
)

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Git was not found. Please install Git (https://git-scm.com/)
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [Step 1/4] First run detected. Installing dependencies (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [Error] Failed to install dependencies. Check network connection.
        pause
        exit /b 1
    )
) else (
    echo [Step 1/4] Dependencies verified.
)

if not exist ".env" (
    echo [Warning] .env configuration file not found!
    if exist ".env.example" (
        copy .env.example .env >nul
        echo Created .env from .env.example. Please open .env, fill in tokens, and rerun this script.
    )
    pause
    exit /b 1
)

echo [Step 2/4] Compiling TypeScript code...
call npm run build >nul 2>nul
if %errorlevel% neq 0 (
    echo [Warning] Compilation returned warnings. Falling back to tsx on-the-fly mode.
)

echo.
echo [Step 3/4] Running automated self-check diagnostics...
call npx tsx scripts/self-check.ts
if %errorlevel% neq 0 (
    echo [Self-Check Failed] Please review the errors above and update your .env file.
    pause
    exit /b 1
)

echo [Step 4/4] Synchronizing Discord Slash Commands...
call npm run deploy-commands >nul 2>nul
echo ✔ Discord Slash Commands registered successfully.
echo.

echo ======================================================================
echo                      Setup Complete! Ready to Launch
echo ======================================================================
echo Select execution mode:
echo   [1] Interactive Terminal Mode (Real-time logs, recommended for debugging)
echo   [2] Silent Background Daemon Mode (Hidden background task)
echo   [3] Cloudflare Worker Keep-Alive Console (cf-wakekeeper)
echo.
set /p choice="Enter option [1/2/3] (default 1): "

if "%choice%"=="2" (
    echo.
    echo Launching GitBot Companion in background daemon mode...
    call npm run start:silent
    echo.
    echo ✔ Service launched successfully in background! Logs written to data\companion.log
    echo Tip: Run scripts\stop-background.bat anytime to stop background instances.
    echo.
    pause
    exit /b 0
)

if "%choice%"=="3" (
    echo.
    echo Launching Cloudflare Worker Watchdog Console...
    call scripts\cf-wakekeeper.bat
    exit /b 0
)

echo.
echo Launching service in foreground mode...
echo (Press Ctrl+C to terminate)
echo.
call npm start
pause
