

export const IS_COMPONENTS_V2 = 1 << 15; 

export enum ComponentType {
  ACTION_ROW = 1,
  BUTTON = 2,
  STRING_SELECT = 3,
  TEXT_INPUT = 4,
  USER_SELECT = 5,
  ROLE_SELECT = 6,
  MENTIONABLE_SELECT = 7,
  CHANNEL_SELECT = 8,
  SECTION = 9,
  TEXT_DISPLAY = 10,
  THUMBNAIL = 11,
  MEDIA_GALLERY = 12,
  FILE = 13,
  SEPARATOR = 14,
  CONTAINER = 17,
}

export enum ButtonStyle {
  PRIMARY = 1,
  SECONDARY = 2,
  SUCCESS = 3,
  DANGER = 4,
  LINK = 5,
}

export interface V2Thumbnail {
  type: ComponentType.THUMBNAIL;
  media: {
    url: string;
  };
  description?: string;
}

export interface V2TextDisplay {
  type: ComponentType.TEXT_DISPLAY;
  content: string;
}

export interface V2Button {
  type: ComponentType.BUTTON;
  style: ButtonStyle;
  label: string;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  emoji?: {
    name?: string;
    id?: string;
    animated?: boolean;
  };
}

export interface V2Section {
  type: ComponentType.SECTION;
  components: V2TextDisplay[];
  accessory?: V2Thumbnail | V2Button;
}

export interface V2ActionRow {
  type: ComponentType.ACTION_ROW;
  components: V2Button[];
}

export interface V2MediaGalleryItem {
  media: {
    url: string;
  };
  description?: string;
}

export interface V2MediaGallery {
  type: ComponentType.MEDIA_GALLERY;
  items: V2MediaGalleryItem[];
}

export type V2InnerComponent = V2Section | V2TextDisplay | V2ActionRow | V2MediaGallery;

export interface V2Container {
  type: ComponentType.CONTAINER;
  components: V2InnerComponent[];
  
}

export interface V2MessagePayload {
  flags: number;
  components: [V2Container];
}

export interface V2SectionConfig {
  text: string;
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  accessoryButton?: {
    label: string;
    style: ButtonStyle;
    customId?: string;
    url?: string;
  };
}

export interface V2ButtonConfig {
  label: string;
  style?: ButtonStyle;
  customId?: string;
  url?: string;
  disabled?: boolean;
}

export interface BuildV2Options {
  sections: (string | V2SectionConfig)[];
  buttons?: V2ButtonConfig[];
  mediaUrls?: string[];
}

export function createV2Section(config: string | V2SectionConfig): V2Section | V2TextDisplay {
  if (typeof config === 'string') {
    return {
      type: ComponentType.TEXT_DISPLAY,
      content: config,
    };
  }

  if (config.thumbnailUrl) {
    return {
      type: ComponentType.SECTION,
      components: [
        {
          type: ComponentType.TEXT_DISPLAY,
          content: config.text,
        },
      ],
      accessory: {
        type: ComponentType.THUMBNAIL,
        media: {
          url: config.thumbnailUrl,
        },
        description: config.thumbnailAlt || 'Thumbnail',
      },
    };
  }

  if (config.accessoryButton) {
    return {
      type: ComponentType.SECTION,
      components: [
        {
          type: ComponentType.TEXT_DISPLAY,
          content: config.text,
        },
      ],
      accessory: {
        type: ComponentType.BUTTON,
        label: config.accessoryButton.label,
        style: config.accessoryButton.style,
        custom_id: config.accessoryButton.customId,
        url: config.accessoryButton.url,
      },
    };
  }

  return {
    type: ComponentType.TEXT_DISPLAY,
    content: config.text,
  };
}

export function createV2ActionRow(buttons: V2ButtonConfig[]): V2ActionRow {
  return {
    type: ComponentType.ACTION_ROW,
    components: buttons.map((b) => ({
      type: ComponentType.BUTTON,
      style: b.style ?? ButtonStyle.PRIMARY,
      label: b.label,
      custom_id: b.customId,
      url: b.url,
      disabled: b.disabled ?? false,
    })),
  };
}

export function buildV2Container(options: BuildV2Options): V2MessagePayload {
  const innerComponents: V2InnerComponent[] = [];

  for (const s of options.sections) {
    innerComponents.push(createV2Section(s));
  }

  if (options.mediaUrls && options.mediaUrls.length > 0) {
    innerComponents.push({
      type: ComponentType.MEDIA_GALLERY,
      items: options.mediaUrls.map((url) => ({
        media: { url },
      })),
    });
  }

  if (options.buttons && options.buttons.length > 0) {
    innerComponents.push(createV2ActionRow(options.buttons));
  }

  const container: V2Container = {
    type: ComponentType.CONTAINER,
    components: innerComponents,
  };

  return {
    flags: IS_COMPONENTS_V2,
    components: [container],
  };
}
