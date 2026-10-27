@echo off
setlocal
cd /d "%~dp0\.."
echo Starting GitBot Companion in silent background mode...
wscript.exe //B "%~dp0run-silent.vbs"
echo GitBot Companion daemon launched silently. Check data\companion.log for logs.
