import type { Client } from 'discord.js';
import { LocalGit } from '../git/local-git.js';
import { store } from '../storage/store.js';
import { GithubApi } from '../github/api.js';
import { buildV2Container } from '../discord/v2-components.js';
import { V2Sender } from '../discord/v2-sender.js';

export class SyncService {
  private timer: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private isRunning = false;

  public setClient(client: Client): void {
    this.client = client;
  }

  public start(): void {
    this.restartTimer();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public restartTimer(): void {
    this.stop();

    const syncConfig = store.getSync();
    if (!syncConfig || syncConfig.status !== 'active') {
      return;
    }

    const intervalMs = Math.max(1, syncConfig.intervalMinutes) * 60 * 1000;
    console.log(`[SyncService] Active sync task found. Scheduling periodic checks every ${syncConfig.intervalMinutes}m.`);

    this.timer = setInterval(() => {
      this.runPeriodicCheck();
    }, intervalMs);
  }

  public async runPeriodicCheck(): Promise<void> {
    if (this.isRunning) return;
    const syncConfig = store.getSync();
    if (!syncConfig || syncConfig.status !== 'active' || !this.client) {
      return;
    }

    this.isRunning = true;
    try {
      const syncResult = await LocalGit.checkAndSync(syncConfig.localPath);

      if (syncResult.hasChanges) {
        console.log(`[SyncService] Detected local updates in ${syncConfig.localPath}. Pushed commit ${syncResult.commitSha}`);

        store.updateSync({
          lastCommitSha: syncResult.commitSha,
          lastSyncTime: new Date().toISOString(),
        });

        const notifyPayload = buildV2Container({
          sections: [
            `## Synced successfully\n` +
            `**Repository:** [${syncConfig.repoName}](${syncConfig.repoUrl})\n` +
            `**Commit:** \`${syncResult.commitSha || 'latest'}\`\n` +
            `**Files Updated:** ${syncResult.filesChanged || 'Multiple'}\n` +
            `**Time:** ${new Date().toLocaleTimeString()}`,
          ],
        });

        await V2Sender.sendToChannel(this.client, syncConfig.channelId, notifyPayload);
      } else {
        
      }
    } catch (err) {
      console.error('[SyncService] Error during periodic check:', err);
    } finally {
      this.isRunning = false;
    }
  }

  public async triggerManualSync(): Promise<{ success: boolean; message: string; details?: string }> {
    const syncConfig = store.getSync();
    if (!syncConfig) {
      return {
        success: false,
        message: 'No active sync task is configured on this host. Use `/github sync <Path>` first.',
      };
    }

    try {
      const result = await LocalGit.checkAndSync(syncConfig.localPath);
      if (result.hasChanges) {
        store.updateSync({
          lastCommitSha: result.commitSha,
          lastSyncTime: new Date().toISOString(),
        });

        return {
          success: true,
          message: 'Code synced',
          details: `Pushed new commit \`${result.commitSha}\` (${result.filesChanged} files updated).`,
        };
      } else {
        return {
          success: true,
          message: 'Code synced',
          details: 'Repository is already up to date with remote.',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'Sync failed',
        details: err.message || 'Unknown error during manual sync',
      };
    }
  }
}

export const syncService = new SyncService();
