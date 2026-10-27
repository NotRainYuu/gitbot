import crypto from 'node:crypto';
import type { Message, ButtonInteraction, Client, Guild } from 'discord.js';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { buildV2Container, ButtonStyle } from './v2-components.js';
import { V2Sender } from './v2-sender.js';
import { LocalGit } from '../git/local-git.js';
import { GithubApi } from '../github/api.js';
import { store } from '../storage/store.js';
import { syncService } from '../services/sync-service.js';

export type SessionType = 'SYNC' | 'AUTOGET';

export type SyncStep =
  | 'FOLDER_FOUND'
  | 'AWAIT_REPO_NAME'
  | 'AWAIT_INTERVAL'
  | 'COMPLETED'
  | 'CANCELLED';

export type AutoGetStep =
  | 'AWAIT_LOCAL_PATH'
  | 'COMPLETED'
  | 'CANCELLED';

export interface BaseSession {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  createdAt: number;
}

export interface SyncSession extends BaseSession {
  type: 'SYNC';
  step: SyncStep;
  localPath: string;
  repoName?: string;
  repoUrl?: string;
  intervalMinutes?: number;
}

export interface AutoGetSession extends BaseSession {
  type: 'AUTOGET';
  step: AutoGetStep;
  owner: string;
  repo: string;
  repoUrl: string;
  localPath?: string;
}

export type ConversationSession = SyncSession | AutoGetSession;

export class ConversationManager {
  private sessions = new Map<string, ConversationSession>();
  
  private activeUserChannels = new Map<string, string>();
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; 

  constructor() {
    
    setInterval(() => this.cleanupExpiredSessions(), 60_000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.SESSION_TIMEOUT_MS) {
        this.activeUserChannels.delete(`${session.channelId}:${session.userId}`);
        this.sessions.delete(id);
      }
    }
  }

  public createSyncSession(
    userId: string,
    guildId: string,
    channelId: string,
    localPath: string
  ): SyncSession {
    const id = crypto.randomUUID();
    const session: SyncSession = {
      id,
      type: 'SYNC',
      step: 'FOLDER_FOUND',
      userId,
      guildId,
      channelId,
      localPath,
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    this.activeUserChannels.set(`${channelId}:${userId}`, id);
    return session;
  }

  public createAutoGetSession(
    userId: string,
    guildId: string,
    channelId: string,
    owner: string,
    repo: string,
    repoUrl: string
  ): AutoGetSession {
    const id = crypto.randomUUID();
    const session: AutoGetSession = {
      id,
      type: 'AUTOGET',
      step: 'AWAIT_LOCAL_PATH',
      userId,
      guildId,
      channelId,
      owner,
      repo,
      repoUrl,
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    this.activeUserChannels.set(`${channelId}:${userId}`, id);
    return session;
  }

  public getSession(id: string): ConversationSession | undefined {
    return this.sessions.get(id);
  }

  public getSessionByUserChannel(channelId: string, userId: string): ConversationSession | undefined {
    const sessionId = this.activeUserChannels.get(`${channelId}:${userId}`);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  public deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      this.activeUserChannels.delete(`${session.channelId}:${session.userId}`);
      this.sessions.delete(id);
    }
  }

  public async getOrCreateChannel(
    guild: Guild,
    channelName: string,
    topic?: string
  ): Promise<any> {
    const sanitizedName = channelName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').substring(0, 95);
    const existing = guild.channels.cache.find(
      (c) => c.name === sanitizedName && c.type === ChannelType.GuildText
    );

    if (existing) {
      return existing;
    }

    return guild.channels.create({
      name: sanitizedName,
      type: ChannelType.GuildText,
      topic: topic || 'Automated channel created by GitBot Companion',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ],
    });
  }

  public async handleButtonInteraction(
    client: Client,
    interaction: ButtonInteraction
  ): Promise<boolean> {
    const customId = interaction.customId;
    if (!customId.startsWith('sync:') && !customId.startsWith('autoget:')) {
      return false;
    }

    const [, action, sessionId] = customId.split(':');
    const session = this.getSession(sessionId);

    if (!session) {
      const expiredPayload = buildV2Container({
        sections: ['## Session Expired\nThis setup session has timed out. Please initiate the command again.'],
      });
      await V2Sender.updateInteraction(client, interaction, expiredPayload);
      return true;
    }

    if (session.userId !== interaction.user.id) {
      const unauthorizedPayload = buildV2Container({
        sections: ['## Unauthorized\nYou did not initiate this configuration session.'],
      });
      await V2Sender.replyInteraction(client, interaction, unauthorizedPayload, true);
      return true;
    }

    if (action === 'cancel') {
      this.deleteSession(sessionId);
      const cancelPayload = buildV2Container({
        sections: ['## Operation Cancelled\nThe setup operation has been cancelled.'],
      });
      await V2Sender.updateInteraction(client, interaction, cancelPayload);
      return true;
    }

    if (session.type === 'SYNC' && action === 'next' && session.step === 'FOLDER_FOUND') {
      session.step = 'AWAIT_REPO_NAME';

      const promptPayload = buildV2Container({
        sections: [
          '## Pick a name for the repo that will be crated\n' +
          'Please send a text message in this channel with your desired **Private Repository** name on GitHub.',
        ],
        buttons: [
          {
            label: 'Cancel',
            style: ButtonStyle.DANGER,
            customId: `sync:cancel:${sessionId}`,
          },
        ],
      });

      await V2Sender.updateInteraction(client, interaction, promptPayload);
      return true;
    }

    return false;
  }

  public async handleTextMessage(client: Client, message: Message): Promise<boolean> {
    const session = this.getSessionByUserChannel(message.channelId, message.author.id);
    if (!session) return false;

    if (session.type === 'SYNC') {
      
      if (session.step === 'AWAIT_REPO_NAME') {
        const repoName = message.content.trim();
        if (!repoName || repoName.length < 2) {
          const errPayload = buildV2Container({
            sections: ['## Invalid Repository Name\nPlease provide a valid repository name (at least 2 characters).'],
            buttons: [
              {
                label: 'Cancel',
                style: ButtonStyle.DANGER,
                customId: `sync:cancel:${session.id}`,
              },
            ],
          });
          await V2Sender.sendToChannel(client, message.channelId, errPayload);
          return true;
        }

        const creatingPayload = buildV2Container({
          sections: [`Creating private repository \`${repoName}\` on GitHub...`],
        });
        await V2Sender.sendToChannel(client, message.channelId, creatingPayload);

        const createRes = await GithubApi.createPrivateRepo(repoName);
        if (!createRes.success || !createRes.repo) {
          const failPayload = buildV2Container({
            sections: [
              `## Repository Creation Failed\n` +
              `GitHub returned an error:\n> ${createRes.error || 'Unknown error'}\n\n` +
              `Please send a different repository name or click Cancel.`,
            ],
            buttons: [
              {
                label: 'Cancel',
                style: ButtonStyle.DANGER,
                customId: `sync:cancel:${session.id}`,
              },
            ],
          });
          await V2Sender.sendToChannel(client, message.channelId, failPayload);
          return true;
        }

        session.repoName = createRes.repo.repo;
        session.repoUrl = createRes.repo.htmlUrl;
        session.step = 'AWAIT_INTERVAL';

        const intervalPrompt = buildV2Container({
          sections: [
            '## Set a time for auto sync\n' +
            `Private repository [${createRes.repo.fullName}](${createRes.repo.htmlUrl}) created successfully!\n\n` +
            'Please enter the sync interval in **minutes** (positive integer, e.g. `5`, `10`, `30`):',
          ],
          buttons: [
            {
              label: 'Cancel',
              style: ButtonStyle.DANGER,
              customId: `sync:cancel:${session.id}`,
            },
          ],
        });

        await V2Sender.sendToChannel(client, message.channelId, intervalPrompt);
        return true;
      }

      if (session.step === 'AWAIT_INTERVAL') {
        const intervalNum = parseInt(message.content.trim(), 10);
        if (isNaN(intervalNum) || intervalNum <= 0) {
          const errPayload = buildV2Container({
            sections: ['## Invalid Interval\nPlease enter a valid positive integer for minutes (e.g. `5`, `15`, `60`).'],
            buttons: [
              {
                label: 'Cancel',
                style: ButtonStyle.DANGER,
                customId: `sync:cancel:${session.id}`,
              },
            ],
          });
          await V2Sender.sendToChannel(client, message.channelId, errPayload);
          return true;
        }

        session.intervalMinutes = intervalNum;

        const guild = message.guild;
        if (!guild) {
          this.deleteSession(session.id);
          return true;
        }

        const initializingPayload = buildV2Container({
          sections: ['Initializing local Git repository, linking remote, and running initial backup...'],
        });
        await V2Sender.sendToChannel(client, message.channelId, initializingPayload);

        const syncChannel = await this.getOrCreateChannel(
          guild,
          'github-sync',
          'Automated local Git backup channel'
        );

        const authenticatedUrl = GithubApi.getAuthenticatedGitUrl(
          (await GithubApi.getAuthenticatedUser())?.login || '',
          session.repoName!
        );

        const initRes = await LocalGit.initAndInitialPush(session.localPath, authenticatedUrl);

        if (!initRes.success) {
          const failPayload = buildV2Container({
            sections: [
              `## Initial Backup Failed\n` +
              `Git command failed:\n\`\`\`\n${initRes.error}\n\`\`\`\n` +
              `Please ensure the local directory has proper permissions and Git is installed.`,
            ],
          });
          await V2Sender.sendToChannel(client, message.channelId, failPayload);
          this.deleteSession(session.id);
          return true;
        }

        store.setSync({
          localPath: session.localPath,
          repoName: session.repoName!,
          repoUrl: session.repoUrl!,
          intervalMinutes: session.intervalMinutes,
          channelId: syncChannel.id,
          guildId: guild.id,
          lastCommitSha: initRes.commitSha || null,
          lastSyncTime: new Date().toISOString(),
          status: 'active',
        });

        syncService.restartTimer();

        const syncChannelNotify = buildV2Container({
          sections: [
            `## Initial Backup Complete!\n` +
            `**Repository:** [${session.repoName}](${session.repoUrl}) (Private)\n` +
            `**Local Path:** \`${session.localPath}\`\n` +
            `**Sync Interval:** Every \`${session.intervalMinutes}\` minute(s)\n` +
            `**Initial Commit:** \`${initRes.commitSha || 'Initial'}\`\n\n` +
            `*Local file updates will automatically be committed and pushed to GitHub.*`,
          ],
        });
        await V2Sender.sendToChannel(client, syncChannel.id, syncChannelNotify);

        const completionPayload = buildV2Container({
          sections: [
            `## Setup Successfully Completed!\n` +
            `Sync channel configured: <#${syncChannel.id}>\n` +
            `Auto-sync is running every **${session.intervalMinutes}** minutes.`,
          ],
        });
        await V2Sender.sendToChannel(client, message.channelId, completionPayload);

        this.deleteSession(session.id);
        return true;
      }
    }

    if (session.type === 'AUTOGET') {
      if (session.step === 'AWAIT_LOCAL_PATH') {
        const inputPath = message.content.trim();
        const pathValidation = LocalGit.validatePath(inputPath);

        let targetPath = pathValidation.resolvedPath;

        const guild = message.guild;
        if (!guild) {
          this.deleteSession(session.id);
          return true;
        }

        const workingPayload = buildV2Container({
          sections: [`Setting up local directory and performing initial clone/pull...`],
        });
        await V2Sender.sendToChannel(client, message.channelId, workingPayload);

        const channelName = `${session.repo}-get`;
        const getChannel = await this.getOrCreateChannel(
          guild,
          channelName,
          `AutoGet synchronization for ${session.owner}/${session.repo}`
        );

        const authenticatedUrl = GithubApi.getAuthenticatedGitUrl(
          session.owner,
          session.repo
        );

        const cloneRes = await LocalGit.cloneOrPull(authenticatedUrl, targetPath);

        if (!cloneRes.success) {
          const failPayload = buildV2Container({
            sections: [
              `## AutoGet Initial Setup Failed\n` +
              `Git error:\n\`\`\`\n${cloneRes.error}\n\`\`\`\n` +
              `Please check write permissions for \`${targetPath}\` and try again.`,
            ],
            buttons: [
              {
                label: 'Cancel',
                style: ButtonStyle.DANGER,
                customId: `autoget:cancel:${session.id}`,
              },
            ],
          });
          await V2Sender.sendToChannel(client, message.channelId, failPayload);
          return true;
        }

        store.addAutoGetTask({
          id: `${session.owner}/${session.repo}`,
          repoUrl: session.repoUrl,
          owner: session.owner,
          repo: session.repo,
          localPath: targetPath,
          channelId: getChannel.id,
          guildId: guild.id,
          lastCommitSha: cloneRes.commitSha || null,
          lastCheckedTime: new Date().toISOString(),
        });

        const channelNotify = buildV2Container({
          sections: [
            `## AutoGet Initialized\n` +
            `**Repository:** [${session.owner}/${session.repo}](${session.repoUrl})\n` +
            `**Local Path:** \`${targetPath}\`\n` +
            `**Action:** ${cloneRes.action === 'cloned' ? 'Cloned repository' : 'Pulled existing repository'}\n` +
            `**Commit SHA:** \`${cloneRes.commitSha || 'latest'}\`\n\n` +
            `*Remote repository updates will automatically be pulled to this local directory.*`,
          ],
        });
        await V2Sender.sendToChannel(client, getChannel.id, channelNotify);

        const successPayload = buildV2Container({
          sections: [
            `## AutoGet Setup Completed!\n` +
            `Dedicated channel created: <#${getChannel.id}>\n` +
            `Remote changes will automatically pull into: \`${targetPath}\``,
          ],
        });
        await V2Sender.sendToChannel(client, message.channelId, successPayload);

        this.deleteSession(session.id);
        return true;
      }
    }

    return false;
  }
}

export const conversationManager = new ConversationManager();
