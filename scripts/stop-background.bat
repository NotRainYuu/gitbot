@echo off
setlocal
echo Stopping any running GitBot Companion Node processes...
wmic process where "CommandLine like '%%src/index.ts%%'" call terminate 2>nul
wmic process where "CommandLine like '%%gitbot%%'" call terminate 2>nul
echo GitBot Companion processes terminated.
