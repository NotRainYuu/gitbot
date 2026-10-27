import {
  type Client,
  type Interaction,
  Routes,
} from 'discord.js';
import type { V2MessagePayload } from './v2-components.js';

export class V2Sender {
  
  public static async replyInteraction(
    client: Client,
    interaction: Interaction,
    payload: V2MessagePayload,
    ephemeral = false
  ): Promise<any> {
    const data = {
      ...payload,
      flags: payload.flags | (ephemeral ? 64 : 0),
    };

    if ('deferred' in interaction && interaction.deferred) {
      
      return client.rest.patch(
        Routes.webhookMessage(client.user!.id, interaction.token, '@original'),
        { body: data }
      );
    }

    if ('replied' in interaction && interaction.replied) {
      
      return client.rest.post(
        Routes.webhook(client.user!.id, interaction.token),
        { body: data }
      );
    }

    return client.rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data,
        },
      }
    );
  }

  public static async updateInteraction(
    client: Client,
    interaction: Interaction,
    payload: V2MessagePayload
  ): Promise<any> {
    if ('deferred' in interaction && interaction.deferred) {
      return client.rest.patch(
        Routes.webhookMessage(client.user!.id, interaction.token, '@original'),
        { body: payload }
      );
    }

    if ('replied' in interaction && interaction.replied) {
      return client.rest.patch(
        Routes.webhookMessage(client.user!.id, interaction.token, '@original'),
        { body: payload }
      );
    }

    return client.rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 7,
          data: payload,
        },
      }
    );
  }

  public static async sendToChannel(
    client: Client,
    channelId: string,
    payload: V2MessagePayload
  ): Promise<any> {
    return client.rest.post(Routes.channelMessages(channelId), {
      body: payload,
    });
  }

  public static async editChannelMessage(
    client: Client,
    channelId: string,
    messageId: string,
    payload: V2MessagePayload
  ): Promise<any> {
    return client.rest.patch(Routes.channelMessage(channelId, messageId), {
      body: payload,
    });
  }
}
