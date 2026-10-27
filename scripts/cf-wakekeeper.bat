@echo off
title Cloudflare Worker Keep-Alive Watchdog
chcp 65001 >nul
cd /d "%~dp0\.."
echo Launching Cloudflare Worker Watchdog Console...
node scripts/cf-wakekeeper.js
pause
