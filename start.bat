@echo off
rem ---------------------------------------------------------------------------
rem  WebApp_V1 - Windows launcher (run.sh's counterpart).
rem
rem    start.bat                 build and serve   (http://localhost:3000)
rem    start.bat dev             dev server
rem    start.bat --port 8080     pick a port
rem    start.bat --host          bind 0.0.0.0 (reachable from the LAN)
rem    start.bat setup           install and prepare only
rem    start.bat --help          full option list (in Korean)
rem
rem  The real work lives in start.ps1. This file stays ASCII on purpose:
rem  cmd.exe reads .bat in the OEM code page, so UTF-8 Korean would come out as
rem  mojibake here. PowerShell reads UTF-8 correctly, so the messages live there.
rem ---------------------------------------------------------------------------
setlocal

rem Double-clicked from Explorer? Then cmd.exe owns the window and closes it the
rem moment we return - an error would flash by unread. Two signals say so: this
rem file's name is in cmd's own command line (a console session shows just
rem "cmd.exe"), and Explorer passes no arguments.
rem
rem Only pause on FAILURE. A successful run ends when the user stops the server
rem with Ctrl+C, and they have been watching it the whole time; pausing then only
rem adds a keypress. Failure is the case where the window must stay put.
set "MAYBE_EXPLORER="
if "%~1"=="" echo %cmdcmdline% | find /i "%~nx0" >nul 2>&1 && set "MAYBE_EXPLORER=1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "CODE=%ERRORLEVEL%"

if defined MAYBE_EXPLORER if not "%CODE%"=="0" pause
exit /b %CODE%
