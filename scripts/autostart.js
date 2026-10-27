#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const appName = 'GitBotCompanion';

const platform = os.platform(); 

function log(msg) {
  console.log(`\x1b[36m[Autostart Manager]\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32m✔ ${msg}\x1b[0m`);
}

function error(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
}

function installWindows() {
  const vbsPath = path.join(projectRoot, 'scripts', 'run-silent.vbs');
  if (!fs.existsSync(vbsPath)) {
    throw new Error(`run-silent.vbs not found at ${vbsPath}`);
  }

  const command = `wscript.exe //B "${vbsPath}"`;
  const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /t REG_SZ /d "${command.replace(/"/g, '\\"')}" /f`;

  execSync(regCommand, { stdio: 'pipe' });
  success(`Registered in Windows Startup Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\${appName}`);
  log(`Command: ${command}`);
}

function uninstallWindows() {
  try {
    const regCommand = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /f`;
    execSync(regCommand, { stdio: 'pipe' });
    success(`Removed "${appName}" from Windows Startup Registry.`);
  } catch {
    log(`"${appName}" was not found in Windows Startup Registry.`);
  }
}

function statusWindows() {
  try {
    const regCommand = `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}"`;
    const out = execSync(regCommand, { encoding: 'utf-8', stdio: 'pipe' });
    success(`Autostart is ENABLED on Windows:`);
    console.log(out.trim());
  } catch {
    log(`Autostart is currently DISABLED on Windows.`);
  }
}

function installLinux() {
  const serviceDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  fs.mkdirSync(serviceDir, { recursive: true });

  const nodePath = process.execPath;
  const entryScript = path.join(projectRoot, 'src', 'index.ts');
  const serviceFile = path.join(serviceDir, 'gitbot.service');

  const content = `[Unit]
Description=GitBot Companion Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=${projectRoot}
ExecStart=${nodePath} --experimental-strip-types ${entryScript}
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;

  fs.writeFileSync(serviceFile, content, 'utf-8');
  execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
  execSync('systemctl --user enable gitbot.service', { stdio: 'pipe' });
  execSync('systemctl --user start gitbot.service', { stdio: 'pipe' });

  success(`Installed and started systemd user service: ${serviceFile}`);
}

function uninstallLinux() {
  try {
    execSync('systemctl --user stop gitbot.service', { stdio: 'pipe' });
    execSync('systemctl --user disable gitbot.service', { stdio: 'pipe' });
    const serviceFile = path.join(os.homedir(), '.config', 'systemd', 'user', 'gitbot.service');
    if (fs.existsSync(serviceFile)) fs.unlinkSync(serviceFile);
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    success('Removed systemd user service.');
  } catch (err) {
    error(`Failed to uninstall Linux service: ${err.message}`);
  }
}

function statusLinux() {
  try {
    const out = execSync('systemctl --user status gitbot.service', { encoding: 'utf-8' });
    console.log(out);
  } catch (err) {
    log('systemd service is inactive or not installed.');
  }
}

function installMacOS() {
  const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  fs.mkdirSync(agentsDir, { recursive: true });

  const plistPath = path.join(agentsDir, 'com.antigravity.gitbot.plist');
  const nodePath = process.execPath;
  const entryScript = path.join(projectRoot, 'src', 'index.ts');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.antigravity.gitbot</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>--experimental-strip-types</string>
        <string>${entryScript}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${projectRoot}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${projectRoot}/data/companion.log</string>
    <key>StandardErrorPath</key>
    <string>${projectRoot}/data/companion.err</string>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plist, 'utf-8');
  execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
  success(`Installed macOS LaunchAgent: ${plistPath}`);
}

function uninstallMacOS() {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.antigravity.gitbot.plist');
  if (fs.existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
      fs.unlinkSync(plistPath);
      success('Unloaded and removed macOS LaunchAgent.');
    } catch (err) {
      error(`Failed to unload macOS LaunchAgent: ${err.message}`);
    }
  } else {
    log('macOS LaunchAgent not found.');
  }
}

function statusMacOS() {
  try {
    const out = execSync('launchctl list | grep com.antigravity.gitbot', { encoding: 'utf-8' });
    success('macOS LaunchAgent is running:\n' + out.trim());
  } catch {
    log('macOS LaunchAgent is not currently running.');
  }
}

const action = process.argv[2] || '--status';

try {
  log(`Detected platform: ${platform}`);

  if (action === '--install' || action === '-i') {
    if (platform === 'win32') installWindows();
    else if (platform === 'linux') installLinux();
    else if (platform === 'darwin') installMacOS();
    else error(`Unsupported platform: ${platform}`);
  } else if (action === '--uninstall' || action === '-u') {
    if (platform === 'win32') uninstallWindows();
    else if (platform === 'linux') uninstallLinux();
    else if (platform === 'darwin') uninstallMacOS();
    else error(`Unsupported platform: ${platform}`);
  } else if (action === '--status' || action === '-s') {
    if (platform === 'win32') statusWindows();
    else if (platform === 'linux') statusLinux();
    else if (platform === 'darwin') statusMacOS();
    else error(`Unsupported platform: ${platform}`);
  } else {
    console.log(`
Usage: node scripts/autostart.js [option]

Options:
  --install, -i      Register the service to start automatically on system boot
  --uninstall, -u    Remove autostart registration
  --status, -s       Check current autostart status
`);
  }
} catch (err) {
  error(`Execution failed: ${err.message}`);
  process.exit(1);
}
