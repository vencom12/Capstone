@echo off
:: =================================================================================
:: Stitch-Opt Legacy Version Developer Launcher (Express Backend ONLY)
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
title Stitch-Opt Legacy System (Port 5001)
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
echo   STITCH-OPT LEGACY SYSTEM LAUNCHER (Express Backend: Port 5001)
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

:: Cleanup by Port listeners as double safeguard
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5001" ^| find "LISTENING"') do (
    tasklist /FI "PID eq %%a" 2>nul | findstr /I "node.exe cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo [CLEANUP] Killing active process PID %%a listening on legacy Port 5001...
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
            echo [ERROR] Cannot run backend without dependencies. Exiting.
            pause
            exit /b 1
        )
        set RUN_INSTALL=true
    )
)

if "!RUN_INSTALL!"=="true" (
    echo [INFO] Starting dependency installation...
    echo [INSTALL] Running npm install at root...
    call npm install
)

:: ---------------------------------------------------------------------------------
:: Step 3: Spin Up Legacy Express Server in a Dedicated Named Console
:: ---------------------------------------------------------------------------------
echo [INFO] Launching Legacy Express Backend...
echo [INFO] A dedicated window will open. Close or exit it to terminate server.

:: Build launching parameters
set BACKEND_FLAGS=--name backend
if "!ENABLE_LOGGING!"=="true" (
    set BACKEND_FLAGS=!BACKEND_FLAGS! --log
)

:: Launch backend
start "Stitch-Opt Legacy Server" node utils/pidHelper.js !BACKEND_FLAGS! -- npm run dev

:: ---------------------------------------------------------------------------------
:: Step 4: Health Check Loop
:: ---------------------------------------------------------------------------------
echo [INFO] Waiting for legacy server to initialize before opening browser...

echo [HEALTH] Verifying Legacy Backend (http://localhost:5001)...
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

:: ---------------------------------------------------------------------------------
:: Step 5: Launch Clients
:: ---------------------------------------------------------------------------------
echo [INFO] Opening Google Chrome to Legacy Portals...
start chrome "http://localhost:5001" "http://localhost:5001/api/dev/login/admin" "http://localhost:5001/api/dev/login/employee" "http://localhost:5001/api/dev/login/customer"

echo ===================================================================
echo   SYSTEM LAUNCH COMPLETED SUCCESSFULLY
echo   - To stop server: Close the dedicated Stitch-Opt Legacy Server window.
echo   - Closing this launcher window will not affect the running server.
echo ===================================================================
pause
