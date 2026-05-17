@echo off
:: =================================================================================
:: Stitch-Opt Safe Fallback Minimal Launcher (Backend + Frontend)
:: 
:: Optimizations & Features:
:: 1. Minimal launcher: Only starts backend and frontend servers in dedicated windows.
:: 2. Does NOT open the web browser.
:: 3. Does NOT run installs automatically.
:: 4. Performs robust port-cleanup and tree-kill on start.
:: 5. Supports the optional '--log' flag to enable file logging under logs/.
:: =================================================================================
title Stitch-Opt Safe Fallback Launcher
cd /d %~dp0

:: Enable local variables expansion
setlocal enabledelayedexpansion

:: Parse Command Line Arguments
set ENABLE_LOGGING=false

for %%x in (%*) do (
    if "%%x"=="--log" (
        set ENABLE_LOGGING=true
    )
)

echo ===================================================================
echo   STITCH-OPT SAFE FALLBACK LAUNCHER (Minimal Server Spin-Up)
echo ===================================================================
if "!ENABLE_LOGGING!"=="true" (
    echo [CONFIG] Server file logging enabled - writing to logs directory.
) else (
    echo [CONFIG] Console-only logging. Use '--log' flag to enable file logging.
)

:: ---------------------------------------------------------------------------------
:: Step 1: Clean up existing server processes
:: ---------------------------------------------------------------------------------
echo [INFO] Cleaning up existing processes on ports 3000 and 5001...

if exist ".pids\servers.pid" (
    set /p SV_PID=<.pids\servers.pid
    tasklist /FI "PID eq !SV_PID!" 2>nul | findstr /I "node.exe cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo [CLEANUP] Found residual servers process - PID: !SV_PID!. Tree-killing...
        taskkill /f /t /pid !SV_PID! 2>nul
    ) else (
        echo [CLEANUP] Stale servers PID !SV_PID! does not belong to Node/CMD. Skipping to prevent system hang.
    )
    del .pids\servers.pid 2>nul
)
if exist ".pids\backend.pid" (
    set /p BK_PID=<.pids\backend.pid
    tasklist /FI "PID eq !BK_PID!" 2>nul | findstr /I "node.exe cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo [CLEANUP] Found residual backend process - PID: !BK_PID!. Tree-killing...
        taskkill /f /t /pid !BK_PID! 2>nul
    ) else (
        echo [CLEANUP] Stale backend PID !BK_PID! does not belong to Node/CMD. Skipping to prevent system hang.
    )
    del .pids\backend.pid 2>nul
)
if exist ".pids\frontend.pid" (
    set /p FT_PID=<.pids\frontend.pid
    tasklist /FI "PID eq !FT_PID!" 2>nul | findstr /I "node.exe cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo [CLEANUP] Found residual frontend process - PID: !FT_PID!. Tree-killing...
        taskkill /f /t /pid !FT_PID! 2>nul
    ) else (
        echo [CLEANUP] Stale frontend PID !FT_PID! does not belong to Node/CMD. Skipping to prevent system hang.
    )
    del .pids\frontend.pid 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    tasklist /FI "PID eq %%a" 2>nul | findstr /I "node.exe cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo [CLEANUP] Killing active process PID %%a listening on frontend Port 3000...
        taskkill /f /t /pid %%a 2>nul
    )
)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5001" ^| find "LISTENING"') do (
    tasklist /FI "PID eq %%a" 2>nul | findstr /I "node.exe cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo [CLEANUP] Killing active process PID %%a listening on backend Port 5001...
        taskkill /f /t /pid %%a 2>nul
    )
)

:: ---------------------------------------------------------------------------------
:: Step 2: Spin Up Development Servers in a Single Consolidated Console
:: ---------------------------------------------------------------------------------
echo [INFO] Starting Backend and Frontend Servers concurrently...
echo [INFO] A single consolidated window will open. Close it to stop both servers.

set LAUNCH_FLAGS=--name servers
if "!ENABLE_LOGGING!"=="true" (
    set LAUNCH_FLAGS=!LAUNCH_FLAGS! --log
)

start "Stitch-Opt Dev Servers" node utils/pidHelper.js !LAUNCH_FLAGS! -- npm run framework

echo ===================================================================
echo   SERVERS LAUNCHED IN MINIMAL MODE
echo   - Frontend: http://localhost:3000
echo   - Backend:  http://localhost:5001
echo   - To stop: Close the consolidated server window.
echo ===================================================================
pause
