import type {
  CreatorProfileOfferIcon,
  CreatorProfileCtaActionType,
  CreatorProfileOfferItem,
  CreatorProfilePageBlock
} from '@syncrolly/core';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getNonEmptyString(value: unknown, fallback: string): string {
  const normalized = getString(value).trim();
  return normalized || fallback;
}

function getActionType(value: unknown): CreatorProfileCtaActionType {
  if (value === 'external_url') {
    return 'external_url';
  }

  if (value === 'booking') {
    return 'booking';
  }

  return 'form';
}

function getOfferIcon(value: unknown): CreatorProfileOfferIcon {
  const supportedIcons: CreatorProfileOfferIcon[] = [
    'call-outline',
    'desktop-outline',
    'chatbubble-ellipses-outline',
    'people-outline',
    'trending-up-outline',
    'videocam-outline',
    'school-outline',
    'sparkles-outline',
    'rocket-outline'
  ];

  return supportedIcons.includes(value as CreatorProfileOfferIcon)
    ? (value as CreatorProfileOfferIcon)
    : 'sparkles-outline';
}

function sanitizeOfferItems(value: unknown, fallbackSeed: string): CreatorProfileOfferItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        id: getNonEmptyString(item.id, `${fallbackSeed}-item-${index + 1}`),
        title: getString(item.title).trim(),
        description: getString(item.description).trim(),
        icon: getOfferIcon(item.icon)
      };
    })
    .filter((item): item is CreatorProfileOfferItem => Boolean(item && (item.title || item.description)));
}

export function normalizeCreatorProfilePageBlocks(value: unknown): CreatorProfilePageBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((block, index) => {
      if (!isRecord(block)) {
        return null;
      }

      const type = getString(block.type);
      const id = getNonEmptyString(block.id, `block-${index + 1}`);

      if (type === 'video') {
        return {
          id,
          type: 'video',
          title: getString(block.title).trim(),
          description: getString(block.description).trim(),
          videoUrl: getString(block.videoUrl).trim(),
          thumbnailUrl: getString(block.thumbnailUrl).trim() || undefined
        } satisfies CreatorProfilePageBlock;
      }

      if (type === 'offers') {
        return {
          id,
          type: 'offers',
          eyebrow: getString(block.eyebrow).trim() || undefined,
          title: getString(block.title).trim(),
          items: sanitizeOfferItems(block.items, id)
        } satisfies CreatorProfilePageBlock;
      }

      if (type === 'cta') {
        return {
          id,
          type: 'cta',
          title: getString(block.title).trim(),
          description: getString(block.description).trim(),
          buttonLabel: getString(block.buttonLabel).trim(),
          actionType: getActionType(block.actionType),
          target: getString(block.target).trim()
        } satisfies CreatorProfilePageBlock;
      }

      if (type === 'media_posts') {
        return {
          id,
          type: 'media_posts',
          eyebrow: getString(block.eyebrow).trim() || undefined,
          title: getString(block.title).trim(),
          description: getString(block.description).trim()
        } satisfies CreatorProfilePageBlock;
      }

      return null;
    })
    .filter((block): block is CreatorProfilePageBlock => Boolean(block));
}
