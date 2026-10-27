import dotenv from 'dotenv';
dotenv.config();

import { GithubApi } from '../src/github/api.js';
import { Client, GatewayIntentBits } from 'discord.js';

async function testCredentials() {
  console.log('--- 1. Testing GitHub API ---');
  const user = await GithubApi.getAuthenticatedUser();
  if (user) {
    console.log(`[GitHub SUCCESS] Authenticated as: ${user.login} (${user.name})`);
  } else {
    console.log('[GitHub ERROR] Failed to authenticate with GITHUB_TOKEN.');
  }

  console.log('\n--- 2. Testing Discord Gateway Login ---');
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`[Discord SUCCESS] Logged in as: ${client.user?.tag} (${client.user?.id})`);
    client.destroy();
  } catch (err: any) {
    console.log('[Discord ERROR]:', err.message);
  }
}

testCredentials();
