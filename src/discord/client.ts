import {
  Client,
  GatewayIntentBits,
  Partials,
  type ChatInputCommandInteraction,
  type Message,
} from 'discord.js';
import { config } from '../config.js';
import { buildV2Container, ButtonStyle } from './v2-components.js';
import { V2Sender } from './v2-sender.js';
import { LocalGit } from '../git/local-git.js';
import { GithubApi } from '../github/api.js';
import { conversationManager } from './conversation.js';
import { syncService } from '../services/sync-service.js';
import { store } from '../storage/store.js';
import { Scheduler } from '../services/scheduler.js';

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once('ready', async () => {
    console.log(`\x1b[32m[Discord]\x1b[0m Bot logged in as ${client.user?.tag} (${client.user?.id})`);

    const ghUser = await GithubApi.getAuthenticatedUser();
    if (ghUser) {
      console.log(`\x1b[32m[GitHub]\x1b[0m Authenticated as @${ghUser.login} (${ghUser.name})`);
    } else {
      console.warn(`\x1b[33m[GitHub Warning]\x1b[0m Unable to authenticate GitHub token. Check GITHUB_TOKEN in .env`);
    }

    Scheduler.init(client);
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(client, interaction);
      } else if (interaction.isButton()) {
        const handled = await conversationManager.handleButtonInteraction(client, interaction);
        if (!handled) {
          
        }
      }
    } catch (err) {
      console.error('[Interaction Error]:', err);
    }
  });

  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    const content = message.content.trim();

    if (content.toLowerCase() === config.prefix.toLowerCase() || content.toLowerCase() === '.sync') {
      await handlePrefixSync(client, message);
      return;
    }

    await conversationManager.handleTextMessage(client, message);
  });

  return client;
}

async function handleSlashCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName, options, guildId, channelId } = interaction;

  if (commandName !== 'github') return;
  if (!interaction.guild) {
    const dmErr = buildV2Container({
      sections: ['## Server Only\nThis command must be run inside a Discord server.'],
    });
    await V2Sender.replyInteraction(client, interaction, dmErr, true);
    return;
  }

  const subcommand = options.getSubcommand();

  if (subcommand === 'sync') {
    const rawPath = options.getString('path', true);
    const validation = LocalGit.validatePath(rawPath);

    if (!validation.valid) {
      const notFoundPayload = buildV2Container({
        sections: [
          `## Folder not found!\n` +
          `The specified path does not exist or is not a valid directory on the local machine:\n` +
          `\`${validation.resolvedPath}\`\n\n` +
          `*Please verify the local path and try again.*`,
        ],
      });
      await V2Sender.replyInteraction(client, interaction, notFoundPayload, true);
      return;
    }

    const session = conversationManager.createSyncSession(
      interaction.user.id,
      guildId!,
      channelId,
      validation.resolvedPath
    );

    const foundPayload = buildV2Container({
      sections: [
        `## Folder has found!\n` +
        `**Local Path:** \`${validation.resolvedPath}\`\n` +
        `**Git Status:** ${validation.isGitRepo ? 'Existing Git repository detected' : 'Clean folder ready for Git initialization'}\n\n` +
        `Click **Next** to proceed with creating a private GitHub repository, or **Cancel** to abort.`,
      ],
      buttons: [
        {
          label: 'Next',
          style: ButtonStyle.PRIMARY,
          customId: `sync:next:${session.id}`,
        },
        {
          label: 'Cancel',
          style: ButtonStyle.DANGER,
          customId: `sync:cancel:${session.id}`,
        },
      ],
    });

    await V2Sender.replyInteraction(client, interaction, foundPayload);
    return;
  }

  if (subcommand === 'track') {
    const rawUrl = options.getString('url', true);
    const parsed = GithubApi.parseUrl(rawUrl);

    if (!parsed) {
      const invalidUrlPayload = buildV2Container({
        sections: [
          `## Invalid GitHub URL\n` +
          `Please provide a valid GitHub repository URL or \`owner/repo\` shorthand.\n` +
          `Example: \`https://github.com/torvalds/linux\` or \`facebook/react\``,
        ],
      });
      await V2Sender.replyInteraction(client, interaction, invalidUrlPayload, true);
      return;
    }

    const repoInfo = await GithubApi.getRepo(parsed.owner, parsed.repo);
    if (!repoInfo) {
      const repoNotFoundPayload = buildV2Container({
        sections: [
          `## Repository Not Accessible\n` +
          `Could not access \`${parsed.owner}/${parsed.repo}\` on GitHub.\n` +
          `Please ensure the repository exists and your GITHUB_TOKEN has permission to view it.`,
        ],
      });
      await V2Sender.replyInteraction(client, interaction, repoNotFoundPayload, true);
      return;
    }

    const channelName = `${repoInfo.repo}-track`;
    const trackChannel = await conversationManager.getOrCreateChannel(
      interaction.guild!,
      channelName,
      `Tracking commits and releases for ${repoInfo.fullName}`
    );

    const latestCommit = await GithubApi.getLatestCommit(repoInfo.owner, repoInfo.repo);
    const latestRelease = await GithubApi.getLatestRelease(repoInfo.owner, repoInfo.repo);

    store.addTrackTask({
      id: `${repoInfo.owner}/${repoInfo.repo}`,
      repoUrl: repoInfo.htmlUrl,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      channelId: trackChannel.id,
      guildId: guildId!,
      lastCommitSha: latestCommit?.sha || null,
      lastReleaseId: latestRelease?.id || null,
      lastCheckedTime: new Date().toISOString(),
    });

    const trackChannelNotice = buildV2Container({
      sections: [
        `## Tracking Started\n` +
        `**Repository:** [${repoInfo.fullName}](${repoInfo.htmlUrl})\n` +
        `**Default Branch:** \`${repoInfo.defaultBranch}\`\n` +
        `**Current Commit:** \`${latestCommit?.shortSha || 'None'}\`\n` +
        `**Current Release:** \`${latestRelease?.tagName || 'None'}\`\n\n` +
        `*This channel will be notified every 30 minutes when new commits or releases are published.*`,
      ],
    });
    await V2Sender.sendToChannel(client, trackChannel.id, trackChannelNotice);

    const replyPayload = buildV2Container({
      sections: [
        `## Tracking Configured!\n` +
        `Now tracking repository [${repoInfo.fullName}](${repoInfo.htmlUrl}).\n` +
        `Dedicated channel: <#${trackChannel.id}>\n` +
        `Updates will be checked automatically every **30 minutes**.`,
      ],
    });
    await V2Sender.replyInteraction(client, interaction, replyPayload);
    return;
  }

  if (subcommand === 'autoget') {
    const rawUrl = options.getString('url', true);
    const parsed = GithubApi.parseUrl(rawUrl);

    if (!parsed) {
      const invalidUrlPayload = buildV2Container({
        sections: [
          `## Invalid GitHub URL\n` +
          `Please provide a valid GitHub repository URL or \`owner/repo\` shorthand.\n` +
          `Example: \`https://github.com/owner/repo\``,
        ],
      });
      await V2Sender.replyInteraction(client, interaction, invalidUrlPayload, true);
      return;
    }

    const repoInfo = await GithubApi.getRepo(parsed.owner, parsed.repo);
    if (!repoInfo) {
      const repoNotFoundPayload = buildV2Container({
        sections: [
          `## Repository Not Accessible\n` +
          `Could not access \`${parsed.owner}/${parsed.repo}\` on GitHub.`,
        ],
      });
      await V2Sender.replyInteraction(client, interaction, repoNotFoundPayload, true);
      return;
    }

    const session = conversationManager.createAutoGetSession(
      interaction.user.id,
      guildId!,
      channelId,
      repoInfo.owner,
      repoInfo.repo,
      repoInfo.htmlUrl
    );

    const promptPayload = buildV2Container({
      sections: [
        `### Repo found\n` +
        `which path do you want to auto get to\n\n` +
        `Target Repository: [${repoInfo.fullName}](${repoInfo.htmlUrl})\n` +
        `Please send the local folder path on the companion host as a message in this channel.`,
      ],
      buttons: [
        {
          label: 'Cancel',
          style: ButtonStyle.DANGER,
          customId: `autoget:cancel:${session.id}`,
        },
      ],
    });

    await V2Sender.replyInteraction(client, interaction, promptPayload);
    return;
  }
}

async function handlePrefixSync(client: Client, message: Message): Promise<void> {
  const result = await syncService.triggerManualSync();

  if (result.success) {
    const successPayload = buildV2Container({
      sections: [
        `## Code synced\n` +
        `${result.details || 'All latest changes have been synced with GitHub.'}`,
      ],
    });
    await V2Sender.sendToChannel(client, message.channelId, successPayload);
  } else {
    const failPayload = buildV2Container({
      sections: [
        `## Sync Failed\n` +
        `${result.message}\n` +
        `${result.details ? `> ${result.details}` : ''}`,
      ],
    });
    await V2Sender.sendToChannel(client, message.channelId, failPayload);
  }
}
