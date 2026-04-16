import type {
  ConversationDetail,
  ConversationMessage,
  CreatorProfile,
  InboxThreadSummary,
  SupporterProfile,
  UserPresence,
  ViewerProfile
} from '@syncrolly/core';
import type { Database, PublicRow } from './database.types';

type ProfileRow = PublicRow<'profiles'>;
type CreatorProfileRow = PublicRow<'creator_profiles'>;
type SupporterProfileRow = PublicRow<'supporter_profiles'>;
type ConversationRow = PublicRow<'conversations'>;
type MessageRow = PublicRow<'messages'>;
type ParticipantRow = PublicRow<'conversation_participants'>;

const accessLabels: Record<Database['public']['Enums']['access_level'], string> = {
  free: 'Free',
  subscriber: 'Subscriber',
  paid: 'Paid',
  vip: 'VIP'
};

const statusLabels: Record<Database['public']['Enums']['thread_status'], string> = {
  active: 'Active',
  request: 'Request',
  flagged: 'Flagged'
};

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function formatRelativeTime(value: string, now: Date = new Date()): string {
  const target = new Date(value);
  const diffInMinutes = Math.max(0, Math.floor((now.getTime() - target.getTime()) / 60000));

  if (diffInMinutes < 1) return 'now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
  if (diffInMinutes < 2880) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(target);
}

export function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

export function formatDayLabel(value: string, now: Date = new Date()): string {
  const target = new Date(value);
  const today = new Date(now);

  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffInDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(target);
}

export function mapViewerProfile({
  profile,
  creatorProfile,
  supporterProfile
}: {
  profile: ProfileRow;
  creatorProfile?: CreatorProfileRow | null;
  supporterProfile?: SupporterProfileRow | null;
}): ViewerProfile {
  const mappedCreatorProfile: CreatorProfile | undefined = creatorProfile
    ? {
        userId: creatorProfile.user_id,
        niche: creatorProfile.niche,
        headline: creatorProfile.headline,
        dmAccess: creatorProfile.dm_access
      }
    : undefined;

  const mappedSupporterProfile: SupporterProfile | undefined = supporterProfile
    ? {
        userId: supporterProfile.user_id,
        accessLevel: supporterProfile.access_level,
        totalSpend: supporterProfile.total_spend
      }
    : undefined;

  return {
    id: profile.id,
    role: profile.role,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined,
    accentColor: profile.accent_color,
    presence: profile.presence,
    creatorProfile: mappedCreatorProfile,
    supporterProfile: mappedSupporterProfile
  };
}

export function mapConversationMessage({
  message,
  viewerId,
  previousDayLabel,
  now = new Date()
}: {
  message: MessageRow;
  viewerId: string;
  previousDayLabel?: string;
  now?: Date;
}): ConversationMessage {
  const dayLabel = formatDayLabel(message.created_at, now);

  return {
    id: message.id,
    senderId: message.sender_id,
    text: message.body,
    createdAt: message.created_at,
    timeLabel: formatMessageTime(message.created_at),
    dayLabel: previousDayLabel === dayLabel ? undefined : dayLabel,
    isFromCreator: message.sender_id === viewerId
  };
}

export function mapInboxThreadSummary({
  conversation,
  counterpart,
  counterpartSupporterProfile,
  lastMessage,
  membership,
  now = new Date()
}: {
  conversation: ConversationRow;
  counterpart: ProfileRow;
  counterpartSupporterProfile?: SupporterProfileRow | null;
  lastMessage?: MessageRow;
  membership?: ParticipantRow;
  now?: Date;
}): InboxThreadSummary {
  const accessLevel = counterpartSupporterProfile?.access_level ?? 'free';
  const hasUnreadMessage =
    lastMessage != null &&
    (!membership?.last_read_at || new Date(lastMessage.created_at).getTime() > new Date(membership.last_read_at).getTime());
  const unread =
    hasUnreadMessage &&
    lastMessage.sender_id !== membership?.user_id;

  return {
    id: conversation.id,
    participantId: counterpart.id,
    participantName: counterpart.display_name,
    participantInitials: getInitials(counterpart.display_name),
    participantAvatar: counterpart.avatar_url ?? undefined,
    participantAccentColor: counterpart.accent_color,
    participantPresence: counterpart.presence as UserPresence,
    accessLevel,
    accessLabel: accessLabels[accessLevel],
    status: conversation.status,
    statusLabel: statusLabels[conversation.status],
    subject: conversation.subject,
    preview: lastMessage?.body ?? 'No messages yet',
    relativeTime: lastMessage ? formatRelativeTime(lastMessage.created_at, now) : 'now',
    unread,
    totalSpend: counterpartSupporterProfile?.total_spend ?? 0
  };
}

export function mapConversationDetail({
  conversation,
  counterpart,
  messages,
  viewerId,
  now = new Date()
}: {
  conversation: ConversationRow;
  counterpart: ProfileRow;
  messages: MessageRow[];
  viewerId: string;
  now?: Date;
}): ConversationDetail {
  let previousDayLabel: string | undefined;

  const mappedMessages = messages.map((message) => {
    const nextMessage = mapConversationMessage({
      message,
      viewerId,
      previousDayLabel,
      now
    });

    previousDayLabel = nextMessage.dayLabel ?? previousDayLabel;
    return nextMessage;
  });

  const latestMessage = messages[messages.length - 1];
  const relativeTime = latestMessage ? formatRelativeTime(latestMessage.created_at, now) : 'now';
  const activityPrefix = counterpart.presence === 'online' ? 'Active' : 'Last active';

  return {
    id: conversation.id,
    participantId: counterpart.id,
    participantName: counterpart.display_name,
    participantInitials: getInitials(counterpart.display_name),
    participantAvatar: counterpart.avatar_url ?? undefined,
    participantAccentColor: counterpart.accent_color,
    participantPresence: counterpart.presence as UserPresence,
    relativeTime,
    activityLabel: `${activityPrefix} ${relativeTime}`,
    messages: mappedMessages
  };
}
