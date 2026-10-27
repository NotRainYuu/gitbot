import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config, validateConfig } from '../config.js';

validateConfig();

export const commands = [
  new SlashCommandBuilder()
    .setName('github')
    .setDescription('GitHub automation and monitoring companion')
    .addSubcommand((sub) =>
      sub
        .setName('sync')
        .setDescription('Backup and auto-sync a local directory to a private GitHub repository')
        .addStringOption((opt) =>
          opt
            .setName('path')
            .setDescription('Local directory path on the companion host machine')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('track')
        .setDescription('Monitor a remote repository for commits and releases every 30 minutes')
        .addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription('GitHub repository URL or owner/repo')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('autoget')
        .setDescription('Auto-pull updates from a remote repository into a local directory')
        .addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription('GitHub repository URL or owner/repo')
            .setRequired(true)
        )
    ),
].map((cmd) => cmd.toJSON());

export async function deployCommands(): Promise<void> {
  if (!config.discordToken || !config.clientId) {
    console.error('[Deploy] Cannot deploy commands: DISCORD_TOKEN or CLIENT_ID is missing.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  try {
    console.log('[Deploy] Started refreshing application (/) commands...');

    if (config.guildId) {
      
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );
      console.log(`[Deploy] Successfully registered commands to Guild ID: ${config.guildId}`);
    } else {
      
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commands,
      });
      console.log('[Deploy] Successfully registered application (/) commands globally.');
    }
  } catch (error) {
    console.error('[Deploy] Error deploying commands:', error);
  }
}

if (process.argv[1]?.includes('deploy-commands')) {
  deployCommands();
}
