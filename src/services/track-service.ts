import type { Client } from 'discord.js';
import { store } from '../storage/store.js';
import { GithubApi } from '../github/api.js';
import { buildV2Container } from '../discord/v2-components.js';
import { V2Sender } from '../discord/v2-sender.js';
import { config } from '../config.js';

export class TrackService {
  private timer: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private isChecking = false;

  public setClient(client: Client): void {
    this.client = client;
  }

  public start(): void {
    const intervalMinutes = config.defaultTrackIntervalMinutes || 30;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[TrackService] Starting 30-minute periodic tracker for remote repositories.`);

    setTimeout(() => this.checkAllTrackedRepos(), 15_000);

    this.timer = setInterval(() => {
      this.checkAllTrackedRepos();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async checkAllTrackedRepos(): Promise<void> {
    if (this.isChecking || !this.client) return;
    this.isChecking = true;

    try {
      const tasks = store.getTrackTasks();
      for (const task of tasks) {
        try {
          await this.checkSingleRepo(task);
        } catch (err) {
          console.error(`[TrackService] Error checking repository ${task.id}:`, err);
        }
      }
    } finally {
      this.isChecking = false;
    }
  }

  private async checkSingleRepo(task: ReturnType<typeof store.getTrackTasks>[number]): Promise<void> {
    if (!this.client) return;

    const latestCommit = await GithubApi.getLatestCommit(task.owner, task.repo);
    if (latestCommit) {
      if (task.lastCommitSha && task.lastCommitSha !== latestCommit.sha) {
        console.log(`[TrackService] New commit detected for ${task.id}: ${latestCommit.shortSha}`);

        const commitPayload = buildV2Container({
          sections: [
            `## Repo was updated.\n` +
            `**Repository:** [${task.owner}/${task.repo}](${task.repoUrl})\n` +
            `**Commit:** [\`${latestCommit.shortSha}\`](${latestCommit.htmlUrl}) - ${latestCommit.message}\n` +
            `**Author:** ${latestCommit.author}\n` +
            `**Date:** ${new Date(latestCommit.date).toLocaleString()}`,
          ],
        });

        await V2Sender.sendToChannel(this.client, task.channelId, commitPayload);
      }

      store.updateTrackTask(task.id, {
        lastCommitSha: latestCommit.sha,
        lastCheckedTime: new Date().toISOString(),
      });
    }

    const latestRelease = await GithubApi.getLatestRelease(task.owner, task.repo);
    if (latestRelease) {
      if (task.lastReleaseId && String(task.lastReleaseId) !== String(latestRelease.id)) {
        console.log(`[TrackService] New release detected for ${task.id}: ${latestRelease.tagName}`);

        const releasePayload = buildV2Container({
          sections: [
            `## A release has being pushed.\n` +
            `**Repository:** [${task.owner}/${task.repo}](${task.repoUrl})\n` +
            `**Release:** [${latestRelease.name || latestRelease.tagName}](${latestRelease.htmlUrl})\n` +
            `**Tag:** \`${latestRelease.tagName}\`\n` +
            `**Published:** ${new Date(latestRelease.publishedAt).toLocaleString()}`,
          ],
        });

        await V2Sender.sendToChannel(this.client, task.channelId, releasePayload);
      }

      store.updateTrackTask(task.id, {
        lastReleaseId: latestRelease.id,
        lastCheckedTime: new Date().toISOString(),
      });
    }
  }
}

export const trackService = new TrackService();
