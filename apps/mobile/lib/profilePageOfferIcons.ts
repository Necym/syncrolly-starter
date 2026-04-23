import type { CreatorProfileOfferIcon } from '@syncrolly/core';

export const PROFILE_PAGE_OFFER_ICON_OPTIONS: Array<{
  value: CreatorProfileOfferIcon;
  label: string;
}> = [
  { value: 'call-outline', label: 'Call' },
  { value: 'desktop-outline', label: 'Monitor' },
  { value: 'chatbubble-ellipses-outline', label: 'Chat' },
  { value: 'people-outline', label: 'Community' },
  { value: 'trending-up-outline', label: 'Growth' },
  { value: 'videocam-outline', label: 'Video' },
  { value: 'school-outline', label: 'Learning' },
  { value: 'sparkles-outline', label: 'Premium' },
  { value: 'rocket-outline', label: 'Boost' }
];

export function getProfilePageOfferIconLabel(icon: CreatorProfileOfferIcon) {
  return PROFILE_PAGE_OFFER_ICON_OPTIONS.find((option) => option.value === icon)?.label ?? 'Icon';
}
