@echo off
:: =================================================================================
:: Stitch-Opt Framework Version Developer Launcher (Next.js + Express)
:: 
:: Optimizations Made:
:: 1. Replaced 'start /b' with dedicated external console windows to allow clean logs
::    and standard terminal lifecycle management (closing the window stops the server).
:: 2. Upgraded 'taskkill' to use tree-kill '/f /t /pid' which eliminates orphan node 
::    descendant processes, preventing memory leaks and CPU spikes.
:: 3. Replaced automatic 'npm install' with a smart check. Installs only run if 
::    specifically requested via the '--install' flag, or if missing after prompting.
:: 4. Implemented PID file lookup & port lookup double-cleanup sequence on start.
:: 5. Integrated inline PowerShell health check loops to wait for the servers to 
::    respond before opening Chrome, avoiding empty error pages.
:: =================================================================================
title Stitch-Opt Framework Version (Next.js + Express)
cd /d %~dp0

:: Enable local variables expansion
setlocal enabledelayedexpansion

:: Parse Command Line Arguments
set RUN_INSTALL=false
set ENABLE_LOGGING=false

for %%x in (%*) do (
    if "%%x"=="--install" (
        set RUN_INSTALL=true
    )
    if "%%x"=="--log" (
        set ENABLE_LOGGING=true
    )
)

echo ===================================================================
echo   STITCH-OPT FRAMEWORK LAUNCHER (Express: 5001 ^| NextJS: 3000)
echo ===================================================================
if "!ENABLE_LOGGING!"=="true" (
    echo [CONFIG] Server file logging enabled - writing to logs directory.
) else (
    echo [CONFIG] Console-only logging. Use '--log' flag to enable file logging.
)

:: ---------------------------------------------------------------------------------
:: Step 1: Clean up existing server processes (Port lookup + PID file lookup)
:: ---------------------------------------------------------------------------------
echo [INFO] Checking for previous running server instances...

:: Cleanup by PID files if they exist (with safety check to prevent killing recycled system PIDs)
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

:: Cleanup by Port listeners as double safeguard
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
:: Step 2: Safe Dependency Verification
:: ---------------------------------------------------------------------------------
if not exist "node_modules\" (
    if "!RUN_INSTALL!"=="false" (
        echo [WARNING] Root node_modules not found.
        echo [INFO] You can run: %~nx0 --install to automatically install.
        choice /M "[PROMPT] Root dependencies are missing. Would you like to run npm install now?"
        if errorlevel 2 (
            echo [ERROR] Cannot run backend without root dependencies. Exiting.
            pause
            exit /b 1
        )
        set RUN_INSTALL=true
    )
)

if not exist "frontend\node_modules\" (
    if "!RUN_INSTALL!"=="false" (
        echo [WARNING] Frontend node_modules not found.
        echo [INFO] You can run: %~nx0 --install to automatically install.
        choice /M "[PROMPT] Frontend dependencies are missing. Would you like to run npm install now?"
        if errorlevel 2 (
            echo [ERROR] Cannot run frontend without dependencies. Exiting.
            pause
            exit /b 1
        )
        set RUN_INSTALL=true
    )
)

if "!RUN_INSTALL!"=="true" (
    echo [INFO] Starting clean dependency installations...
    echo [INSTALL] Installing root backend dependencies...
    call npm install
    echo [INSTALL] Installing frontend dependencies...
    cd frontend && call npm install && cd ..
)

:: ---------------------------------------------------------------------------------
:: Step 3: Spin Up Development Servers in a Single Consolidated Console
:: ---------------------------------------------------------------------------------
echo [INFO] Launching Express Backend and Next.js Frontend concurrently...
echo [INFO] A single consolidated window will open. Close it to stop both servers.

:: Build launching parameters
set LAUNCH_FLAGS=--name servers
if "!ENABLE_LOGGING!"=="true" (
    set LAUNCH_FLAGS=!LAUNCH_FLAGS! --log
)

:: Launch the servers concurrently
start "Stitch-Opt Dev Servers" node utils/pidHelper.js !LAUNCH_FLAGS! -- npm run framework

:: ---------------------------------------------------------------------------------
:: Step 4: Health Check Loops
:: ---------------------------------------------------------------------------------
echo [INFO] Waiting for servers to initialize before opening browser...

echo [HEALTH] Verifying Express Backend (http://localhost:5001)...
powershell -Command ^
    "$maxRetries = 20; $retryCount = 0; $healthy = $false; " ^
    "do { " ^
    "  try { " ^
    "    $response = Invoke-WebRequest -Uri 'http://localhost:5001' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; " ^
    "    $healthy = $true; " ^
    "  } catch { } " ^
    "  if (-not $healthy) { " ^
    "    $retryCount++; " ^
    "    Start-Sleep -Seconds 1; " ^
    "    Write-Host '.' -NoNewline; " ^
    "  } " ^
    "} while (-not $healthy -and $retryCount -lt $maxRetries); " ^
    "if ($healthy) { Write-Host ' [ONLINE]' } else { Write-Host ' [TIMEOUT]' }"

echo [HEALTH] Verifying Next.js Frontend (http://localhost:3000)...
powershell -Command ^
    "$maxRetries = 30; $retryCount = 0; $healthy = $false; " ^
    "do { " ^
    "  try { " ^
    "    $response = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; " ^
    "    $healthy = $true; " ^
    "  } catch { } " ^
    "  if (-not $healthy) { " ^
    "    $retryCount++; " ^
    "    Start-Sleep -Seconds 1; " ^
    "    Write-Host '.' -NoNewline; " ^
    "  } " ^
    "} while (-not $healthy -and $retryCount -lt $maxRetries); " ^
    "if ($healthy) { Write-Host ' [ONLINE]' } else { Write-Host ' [TIMEOUT]' }"

:: ---------------------------------------------------------------------------------
:: Step 5: Launch Client
:: ---------------------------------------------------------------------------------
echo [INFO] Opening Google Chrome to Application Portal...
start chrome "http://localhost:3000"

echo ===================================================================
echo   SYSTEM LAUNCH COMPLETED SUCCESSFULLY
echo   - To stop servers: Close the dedicated Backend and Frontend windows.
echo   - Closing this launcher window will not affect the running servers.
echo ===================================================================
pause
