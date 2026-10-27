import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

export interface AppConfig {
  discordToken: string;
  clientId: string;
  guildId?: string; 
  githubToken: string;
  prefix: string;
  defaultTrackIntervalMinutes: number;
  defaultAutoGetIntervalMinutes: number;
  cfWorkerUrl?: string;
  cfWorkerPingIntervalSeconds: number;
  cfWorkerAutoWakeup: boolean;
}

export const config: AppConfig = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || undefined,
  githubToken: process.env.GITHUB_TOKEN || '',
  prefix: process.env.PREFIX || '.sync',
  defaultTrackIntervalMinutes: Number(process.env.TRACK_INTERVAL_MINUTES) || 30,
  defaultAutoGetIntervalMinutes: Number(process.env.AUTOGET_INTERVAL_MINUTES) || 5,
  cfWorkerUrl: process.env.CF_WORKER_URL?.trim() || undefined,
  cfWorkerPingIntervalSeconds: Number(process.env.CF_WORKER_PING_INTERVAL_SECONDS) || 120, 
  cfWorkerAutoWakeup: process.env.CF_WORKER_AUTO_WAKEUP !== 'false',
};

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('CLIENT_ID');
  if (!config.githubToken) missing.push('GITHUB_TOKEN');

  if (missing.length > 0) {
    console.error(`\x1b[31m[Config Error] Missing required environment variables:\x1b[0m ${missing.join(', ')}`);
    console.error(`Please configure them in your .env file. See .env.example for details.`);
  }
}
