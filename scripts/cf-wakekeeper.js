#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

let workerUrl = process.env.CF_WORKER_URL?.trim() || '';
let intervalSeconds = Number(process.env.CF_WORKER_PING_INTERVAL_SECONDS) || 120;

let totalPings = 0;
let successCount = 0;
let failCount = 0;
let lastLatency = 0;
let lastStatus = 'WAITING';
let lastStatusCode = 0;
let lastError = '';
let secondsUntilNextPing = intervalSeconds;
let startTime = Date.now();

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m\x1b[37m',
  bgGreen: '\x1b[42m\x1b[30m',
  bgRed: '\x1b[41m\x1b[37m',
};

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / (1000 * 60)) % 60;
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs > 0 ? `${hrs}h ` : ''}${min}m ${sec}s`;
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f');
}

function renderUI() {
  clearScreen();
  const uptime = formatDuration(Date.now() - startTime);

  let statusBadge = `${c.yellow}[ WAITING ]${c.reset}`;
  if (lastStatus === 'ONLINE') {
    statusBadge = `${c.bgGreen} ONLINE (Active/Awake) ${c.reset}`;
  } else if (lastStatus === 'WAKING_UP') {
    statusBadge = `${c.bgBlue} WAKING UP (Sending pulse...) ${c.reset}`;
  } else if (lastStatus === 'OFFLINE') {
    statusBadge = `${c.bgRed} OFFLINE (Unresponsive) ${c.reset}`;
  }

  const successRate = totalPings > 0 ? ((successCount / totalPings) * 100).toFixed(1) : '100.0';

  console.log(`${c.bold}${c.magenta}========================================================================${c.reset}`);
  console.log(`${c.bold}${c.magenta}   ⚡ Cloudflare Worker Keep-Alive & Wake Watchdog Console ⚡${c.reset}`);
  console.log(`${c.bold}${c.magenta}========================================================================${c.reset}`);
  console.log(`${c.bold}Target URL:${c.reset} ${workerUrl ? `${c.green}${workerUrl}${c.reset}` : `${c.yellow}Not Configured (Press [U] to set)${c.reset}`}`);
  console.log(`${c.bold}Status:${c.reset} ${statusBadge}   ${c.bold}HTTP Code:${c.reset} ${lastStatusCode || '--'}   ${c.bold}Latency:${c.reset} ${lastLatency ? `${lastLatency}ms` : '--'}`);
  console.log(`${c.bold}Cycle:${c.reset} Every ${intervalSeconds}s (prevents cold boot timeout)`);
  console.log(`${c.bold}Metrics:${c.reset} Pulses: ${totalPings} | Success: ${successCount} | Failed: ${failCount} (Rate: ${successRate}%)`);
  console.log(`${c.bold}Uptime:${c.reset} ${uptime}`);

  if (lastError) {
    console.log(`${c.red}⚠ Last Warning: ${lastError}${c.reset}`);
  }

  console.log(`${c.gray}------------------------------------------------------------------------${c.reset}`);

  const minStr = String(Math.floor(secondsUntilNextPing / 60)).padStart(2, '0');
  const secStr = String(secondsUntilNextPing % 60).padStart(2, '0');
  console.log(`${c.bold}Next wake pulse countdown:${c.reset} ${c.yellow}${minStr}:${secStr}${c.reset}`);

  console.log(`${c.gray}------------------------------------------------------------------------${c.reset}`);
  console.log(`${c.dim}Shortcuts: [W] Send pulse now  |  [U] Update URL  |  [Q] Exit watchdog${c.reset}`);
}

async function sendWakePulse() {
  if (!workerUrl) {
    lastError = 'CF_WORKER_URL is empty';
    lastStatus = 'OFFLINE';
    return;
  }

  lastStatus = 'WAKING_UP';
  renderUI();

  const start = Date.now();
  totalPings++;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(workerUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'GitBot-KeepAlive-Pulse/1.0',
        'X-Wake-Ping': 'true',
        'X-Keep-Alive-Pulse': 'true',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    lastLatency = Date.now() - start;
    lastStatusCode = res.status;

    if (res.ok || res.status < 500) {
      lastStatus = 'ONLINE';
      successCount++;
      lastError = '';
    } else {
      lastStatus = 'OFFLINE';
      failCount++;
      lastError = `Server responded with HTTP ${res.status}`;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    lastLatency = Date.now() - start;
    lastStatusCode = 0;
    lastStatus = 'OFFLINE';
    failCount++;
    lastError = err.name === 'AbortError' ? 'Request timed out (10s)' : err.message;
  }

  secondsUntilNextPing = intervalSeconds;
  renderUI();
}

function promptUpdateUrl() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  process.stdin.setRawMode?.(false);
  rl.question(`${c.cyan}Enter Cloudflare Worker URL (e.g. https://your-worker.workers.dev): ${c.reset}`, (input) => {
    const trimmed = input.trim();
    if (trimmed) {
      workerUrl = trimmed;
      lastError = '';
      sendWakePulse();
    }
    rl.close();
    setupKeyboardListeners();
    renderUI();
  });
}

function setupKeyboardListeners() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.removeAllListeners('data');
    process.stdin.on('data', (key) => {
      if (key === 'q' || key === 'Q' || key === '\u0003') {
        clearScreen();
        console.log(`${c.green}Cloudflare Worker watchdog exited.${c.reset}`);
        process.exit(0);
      } else if (key === 'w' || key === 'W') {
        sendWakePulse();
      } else if (key === 'u' || key === 'U') {
        promptUpdateUrl();
      }
    });
  }
}

async function start() {
  setupKeyboardListeners();
  await sendWakePulse();

  setInterval(() => {
    secondsUntilNextPing--;
    if (secondsUntilNextPing <= 0) {
      sendWakePulse();
    } else {
      renderUI();
    }
  }, 1000);
}

start();
