import type {
  CreatorProfileCtaActionType,
  CreatorProfileCtaBlock,
  CreatorProfileOfferItem,
  CreatorProfileOffersBlock,
  CreatorProfileMediaPostsBlock,
  CreatorProfilePageBlock,
  CreatorProfileVideoBlock,
  DmIntakePolicy
} from '@syncrolly/core';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createVideoBlock(): CreatorProfileVideoBlock {
  return {
    id: createId('video'),
    type: 'video',
    title: 'Introduction',
    description: 'Add a short introduction video that explains who you help, what you offer, and what the next step should be.',
    videoUrl: '',
    thumbnailUrl: ''
  };
}

function createOfferItem(
  title: string,
  description: string,
  icon: CreatorProfileOfferItem['icon'] = 'sparkles-outline'
): CreatorProfileOfferItem {
  return {
    id: createId('offer'),
    title,
    description,
    icon
  };
}

export function createOffersBlock(): CreatorProfileOffersBlock {
  return {
    id: createId('offers'),
    type: 'offers',
    eyebrow: "What's included",
    title: 'Offerings',
    items: [
      createOfferItem('1:1 mentorship', 'Personal guidance tailored to the goal you are working toward.', 'call-outline'),
      createOfferItem('Follow-ups', 'Ongoing feedback so progress does not stall between sessions.', 'trending-up-outline'),
      createOfferItem('Community access', 'A shared space for accountability, questions, and wins.', 'people-outline')
    ]
  };
}

export function createCtaBlock(actionType: CreatorProfileCtaActionType = 'form'): CreatorProfileCtaBlock {
  return {
    id: createId('cta'),
    type: 'cta',
    title: 'Ready to take the next step?',
    description:
      actionType === 'form'
        ? "Share where you are right now and I'll review the best next move."
        : actionType === 'booking'
          ? "Book a call directly and we'll hold a spot for a focused conversation."
          : 'Use the button below to open the next step in your journey.',
    buttonLabel: actionType === 'form' ? 'Apply now' : actionType === 'booking' ? 'Book a call' : 'Open link',
    actionType,
    target: ''
  };
}

export function createMediaPostsBlock(): CreatorProfileMediaPostsBlock {
  return {
    id: createId('media-posts'),
    type: 'media_posts',
    eyebrow: 'Recent media',
    title: 'Media Posts',
    description: 'Share visuals, quick updates, and recent moments from your work.'
  };
}

export function buildStarterCreatorPageBlocks(dmIntakePolicy: DmIntakePolicy): CreatorProfilePageBlock[] {
  return [
    createVideoBlock(),
    createOffersBlock(),
    createCtaBlock(dmIntakePolicy === 'form' ? 'form' : 'booking')
  ];
}

export function getEffectiveCreatorPageBlocks(
  blocks: CreatorProfilePageBlock[] | undefined,
  dmIntakePolicy: DmIntakePolicy
): CreatorProfilePageBlock[] {
  if (blocks?.length) {
    return blocks;
  }

  return buildStarterCreatorPageBlocks(dmIntakePolicy);
}
