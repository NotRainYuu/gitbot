import type { Client } from 'discord.js';
import { syncService } from './sync-service.js';
import { trackService } from './track-service.js';
import { autoGetService } from './autoget-service.js';
import { cfWakeKeeper } from './cf-wakekeeper.js';

export class Scheduler {
  public static init(client: Client): void {
    syncService.setClient(client);
    trackService.setClient(client);
    autoGetService.setClient(client);

    syncService.start();
    trackService.start();
    autoGetService.start();
    cfWakeKeeper.start();

    console.log('[Scheduler] All background services and timers initialized successfully.');
  }

  public static shutdown(): void {
    syncService.stop();
    trackService.stop();
    autoGetService.stop();
    cfWakeKeeper.stop();
    console.log('[Scheduler] All background services stopped.');
  }
}
