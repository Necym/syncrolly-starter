import type { AccessLevel, CreatorProfile, ViewerProfile } from './types';

export function canMessageCreator(dmAccess: CreatorProfile['dmAccess'], accessLevel: AccessLevel): boolean {
  if (dmAccess === 'free') return true;
  if (dmAccess === 'subscriber_only') return accessLevel !== 'free';
  return accessLevel === 'paid' || accessLevel === 'vip';
}

export function priorityScore(accessLevel: AccessLevel, totalSpend: number): number {
  const base = {
    free: 10,
    subscriber: 40,
    paid: 70,
    vip: 100
  }[accessLevel];

  return base + Math.min(totalSpend / 10, 50);
}

export function hasCompletedProfile(profile: ViewerProfile | null | undefined): profile is ViewerProfile {
  if (!profile) {
    return false;
  }

  if (profile.role === 'creator') {
    return Boolean(profile.creatorProfile);
  }

  return Boolean(profile.supporterProfile);
}
