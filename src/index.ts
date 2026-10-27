import { validateConfig, config } from './config.js';
import { createDiscordClient } from './discord/client.js';
import { Scheduler } from './services/scheduler.js';

console.log('====================================================');
console.log('   GitBot Companion - Discord & Git Automation      ');
console.log('   Discord Components V2 Protocol Native Engine     ');
console.log('====================================================');

validateConfig();

const client = createDiscordClient();

client.login(config.discordToken).catch((err) => {
  console.error('\x1b[31m[Fatal Error] Failed to login to Discord:\x1b[0m', err.message);
  process.exit(1);
});

function handleShutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal}. Shutting down services cleanly...`);
  Scheduler.shutdown();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection at]:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});
