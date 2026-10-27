import type { Client } from 'discord.js';
import { store } from '../storage/store.js';
import { GithubApi } from '../github/api.js';
import { LocalGit } from '../git/local-git.js';
import { buildV2Container } from '../discord/v2-components.js';
import { V2Sender } from '../discord/v2-sender.js';
import { config } from '../config.js';

export class AutoGetService {
  private timer: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private isChecking = false;

  public setClient(client: Client): void {
    this.client = client;
  }

  public start(): void {
    const intervalMinutes = config.defaultAutoGetIntervalMinutes || 5;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[AutoGetService] Starting periodic AutoGet checker every ${intervalMinutes}m.`);

    setTimeout(() => this.checkAllAutoGetRepos(), 30_000);

    this.timer = setInterval(() => {
      this.checkAllAutoGetRepos();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async checkAllAutoGetRepos(): Promise<void> {
    if (this.isChecking || !this.client) return;
    this.isChecking = true;

    try {
      const tasks = store.getAutoGetTasks();
      for (const task of tasks) {
        try {
          await this.checkSingleTask(task);
        } catch (err) {
          console.error(`[AutoGetService] Error checking AutoGet task ${task.id}:`, err);
        }
      }
    } finally {
      this.isChecking = false;
    }
  }

  private async checkSingleTask(task: ReturnType<typeof store.getAutoGetTasks>[number]): Promise<void> {
    if (!this.client) return;

    const latestCommit = await GithubApi.getLatestCommit(task.owner, task.repo);
    if (!latestCommit) return;

    if (task.lastCommitSha && task.lastCommitSha !== latestCommit.sha) {
      console.log(`[AutoGetService] Remote change detected for ${task.id}. Pulling into ${task.localPath}...`);

      const authenticatedUrl = GithubApi.getAuthenticatedGitUrl(task.owner, task.repo);
      const pullResult = await LocalGit.cloneOrPull(authenticatedUrl, task.localPath);

      if (pullResult.success) {
        store.updateAutoGetTask(task.id, {
          lastCommitSha: latestCommit.sha,
          lastCheckedTime: new Date().toISOString(),
        });

        const updateNotify = buildV2Container({
          sections: [
            `## AutoGet: Local Repository Updated\n` +
            `**Repository:** [${task.owner}/${task.repo}](${task.repoUrl})\n` +
            `**Local Path:** \`${task.localPath}\`\n` +
            `**Pulled Commit:** [\`${latestCommit.shortSha}\`](${latestCommit.htmlUrl}) - ${latestCommit.message}\n` +
            `**Author:** ${latestCommit.author}\n` +
            `**Time:** ${new Date().toLocaleTimeString()}`,
          ],
        });

        await V2Sender.sendToChannel(this.client, task.channelId, updateNotify);
      } else {
        console.error(`[AutoGetService] Failed to pull ${task.id}:`, pullResult.error);
      }
    } else if (!task.lastCommitSha) {
      
      store.updateAutoGetTask(task.id, {
        lastCommitSha: latestCommit.sha,
        lastCheckedTime: new Date().toISOString(),
      });
    }
  }
}

export const autoGetService = new AutoGetService();
