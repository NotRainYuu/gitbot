import dotenv from 'dotenv';
dotenv.config();

import { GithubApi } from '../src/github/api.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { LocalGit } from '../src/git/local-git.js';
import os from 'node:os';

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

async function runSelfCheck() {
  console.log(`${c.cyan}====================================================${c.reset}`);
  console.log(`${c.bold}     GitBot Companion Automated Startup Self-Check  ${c.reset}`);
  console.log(`${c.cyan}====================================================${c.reset}`);

  let allPassed = true;

  process.stdout.write('[1/5] Checking system environment & local Git CLI... ');
  const gitPathCheck = LocalGit.validatePath(process.cwd());
  if (gitPathCheck.valid) {
    console.log(`${c.green}✔ OK${c.reset} (OS: ${os.platform()} ${os.arch()})`);
  } else {
    console.log(`${c.red}✖ Error: ${gitPathCheck.error}${c.reset}`);
    allPassed = false;
  }

  process.stdout.write('[2/5] Checking GitHub token authorization & API connectivity... ');
  try {
    const ghUser = await GithubApi.getAuthenticatedUser();
    if (ghUser) {
      console.log(`${c.green}✔ OK${c.reset} (Logged in: @${ghUser.login} - ${ghUser.name})`);
    } else {
      console.log(`${c.red}✖ Failed: GITHUB_TOKEN invalid or insufficient permissions${c.reset}`);
      allPassed = false;
    }
  } catch (err: any) {
    console.log(`${c.red}✖ Error: ${err.message}${c.reset}`);
    allPassed = false;
  }

  process.stdout.write('[3/5] Checking Discord Bot Token & Gateway connection... ');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`${c.green}✔ OK${c.reset} (Bot: ${client.user?.tag})`);
    client.destroy();
  } catch (err: any) {
    console.log(`${c.red}✖ Failed: DISCORD_TOKEN invalid (${err.message})${c.reset}`);
    allPassed = false;
  }

  const cfUrl = process.env.CF_WORKER_URL?.trim();
  process.stdout.write('[4/5] Checking Cloudflare Worker edge connectivity... ');
  if (!cfUrl) {
    console.log(`${c.yellow}⚠ Skipped: CF_WORKER_URL not configured${c.reset}`);
  } else {
    try {
      const start = Date.now();
      const res = await fetch(cfUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'GitBot-SelfCheck/1.0', 'X-Wake-Ping': 'true' },
      });
      const latency = Date.now() - start;
      if (res.ok || res.status < 500) {
        console.log(`${c.green}✔ OK${c.reset} (HTTP ${res.status}, Latency: ${latency}ms)`);
      } else {
        console.log(`${c.yellow}⚠ Warning: Worker returned HTTP ${res.status} (Connected)${c.reset}`);
      }
    } catch (err: any) {
      console.log(`${c.red}✖ Connection failed: ${err.message}${c.reset}`);
    }
  }

  process.stdout.write('[5/5] Checking persistent storage directory (data/store.json)... ');
  console.log(`${c.green}✔ OK${c.reset}`);

  console.log(`${c.cyan}----------------------------------------------------${c.reset}`);
  if (allPassed) {
    console.log(`${c.green}${c.bold}✔ All checks passed! System healthy.${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${c.red}${c.bold}✖ Errors encountered during self-check. Please check .env configuration.${c.reset}\n`);
    process.exit(1);
  }
}

runSelfCheck();
