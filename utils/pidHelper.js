/**
 * Stitch-Opt Process PID and Logging Helper
 * 
 * This helper utility runs child processes (like nodemon or next), writes their PIDs
 * to a trackable file inside `.pids/`, and clean-deletes the PID file upon termination.
 * If '--log' is passed, it writes server output to timestamped files under 'logs/'.
 * On Windows, it tree-kills the process tree to ensure no orphaned background processes.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Parse CLI arguments
const args = process.argv.slice(2);
let name = 'app';
let enableLogging = false;
let commandArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name') {
    name = args[++i];
  } else if (args[i] === '--log') {
    enableLogging = true;
  } else if (args[i] === '--') {
    commandArgs = args.slice(i + 1);
    break;
  }
}

if (commandArgs.length === 0) {
  console.error('[PID Helper] Error: No command specified. Usage: node pidHelper.js --name <name> [--log] -- <command> [args...]');
  process.exit(1);
}

// Define paths
const pidDir = path.join(__dirname, '..', '.pids');
if (!fs.existsSync(pidDir)) {
  fs.mkdirSync(pidDir, { recursive: true });
}
const pidFile = path.join(pidDir, `${name}.pid`);

const cmd = commandArgs[0];
const cmdArgs = commandArgs.slice(1);

console.log(`[PID Helper] Starting "${name}" -> ${cmd} ${cmdArgs.join(' ')}`);

// Set up I/O and logging
let childStdio = 'inherit';
let logStream = null;

if (enableLogging) {
  childStdio = 'pipe';
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Create filename safe ISO timestamp
  const timestamp = new Date().toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .split('.')[0];
  const logFile = path.join(logsDir, `${name}_${timestamp}.log`);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  console.log(`[PID Helper] Logging output to ${logFile}`);
}

// Spawn child process with color support preserved
const child = spawn(cmd, cmdArgs, {
  shell: true,
  stdio: childStdio,
  env: { ...process.env, FORCE_COLOR: '1' }
});

// Write process PID to file
fs.writeFileSync(pidFile, child.pid.toString(), 'utf8');
console.log(`[PID Helper] Saved PID ${child.pid} to ${pidFile}`);

if (enableLogging) {
  // Route streams to both stdout/stderr and log file
  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(data);
  });
  
  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    logStream.write(data);
  });
}

let isCleaning = false;
function cleanup() {
  if (isCleaning) return;
  isCleaning = true;
  
  console.log(`\n[PID Helper] Stopping "${name}" (PID: ${child.pid})...`);
  
  // Safely delete PID file
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      console.log(`[PID Helper] Removed PID file ${pidFile}`);
    }
  } catch (err) {
    console.error(`[PID Helper] Error deleting PID file: ${err.message}`);
  }
  
  // Clean up child process and its descendants
  try {
    if (child && !child.killed) {
      if (process.platform === 'win32') {
        // Windows Tree Kill to terminate nodemon/next and all nested node worker nodes
        spawn('taskkill', ['/f', '/t', '/pid', child.pid.toString()], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    }
  } catch (err) {
    // Suppress errors if process was already dead
  }
  
  if (logStream) {
    logStream.end();
  }
}

// Hook lifecycle listeners
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit();
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit();
});
process.on('SIGHUP', () => {
  cleanup();
  process.exit();
});
process.on('uncaughtException', (err) => {
  console.error(`[PID Helper] Uncaught exception inside helper: ${err.stack}`);
  cleanup();
  process.exit(1);
});

// Bubble up closure exit code
child.on('close', (code) => {
  console.log(`[PID Helper] Process "${name}" shut down with exit code ${code}`);
  cleanup();
  process.exit(code || 0);
});
