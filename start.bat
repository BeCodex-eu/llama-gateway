@echo off
setlocal

set "ROOT=%~dp0"
for %%I in ("%ROOT%.") do set "ROOT=%%~fI"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\start.ps1"
exit /b %ERRORLEVEL%