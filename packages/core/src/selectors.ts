import { messages, supporterProfiles, threads, users } from './mockData';
import type {
  AccessLevel,
  ConversationDetail,
  ConversationMessage,
  InboxThreadFilter,
  InboxThreadSummary,
  ThreadStatus,
  UserPresence
} from './types';

const accessLabels: Record<AccessLevel, string> = {
  free: 'Free',
  subscriber: 'Subscriber',
  paid: 'Paid',
  vip: 'VIP'
};

const statusLabels: Record<ThreadStatus, string> = {
  active: 'Active',
  request: 'Request',
  flagged: 'Flagged'
};

const presenceFallback: UserPresence = 'offline';
const accentFallback = '#5f6b7c';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function formatRelativeTime(value: string, now: Date = new Date()): string {
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

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDayLabel(value: string, now: Date = new Date()): string {
  const target = new Date(value);
  const today = new Date(now);

  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffInDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(target);
}

export const inboxThreadSummaries: InboxThreadSummary[] = [...threads]
  .sort((left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime())
  .map((thread) => {
    const participant = users.find((user) => user.id === thread.supporterId);
    const profile = supporterProfiles.find((item) => item.userId === thread.supporterId);

    return {
      id: thread.id,
      participantId: thread.supporterId,
      participantName: participant?.name ?? 'Unknown supporter',
      participantInitials: getInitials(participant?.name ?? 'Unknown supporter'),
      participantAvatar: participant?.avatar,
      participantAccentColor: participant?.accentColor ?? accentFallback,
      participantPresence: participant?.presence ?? presenceFallback,
      accessLevel: thread.accessLevel,
      accessLabel: accessLabels[thread.accessLevel],
      status: thread.status,
      statusLabel: statusLabels[thread.status],
      subject: thread.subject,
      preview: thread.lastMessagePreview,
      relativeTime: thread.lastMessageLabel ?? formatRelativeTime(thread.lastMessageAt),
      unread: thread.unread,
      totalSpend: profile?.totalSpend ?? 0
    };
  });

export function matchesInboxThreadFilter(
  thread: InboxThreadSummary,
  filter: InboxThreadFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'vip') return thread.accessLevel === 'vip';
  if (filter === 'paid') return thread.accessLevel === 'paid' || thread.accessLevel === 'vip';

  return thread.status === 'request';
}

export function countInboxThreads(
  filter: InboxThreadFilter,
  items: InboxThreadSummary[] = inboxThreadSummaries
): number {
  return items.filter((thread) => matchesInboxThreadFilter(thread, filter)).length;
}

export function queryInboxThreads({
  filter = 'all',
  search = '',
  items = inboxThreadSummaries
}: {
  filter?: InboxThreadFilter;
  search?: string;
  items?: InboxThreadSummary[];
} = {}): InboxThreadSummary[] {
  const normalizedSearch = search.trim().toLowerCase();

  return items.filter((thread) => {
    const matchesFilter = matchesInboxThreadFilter(thread, filter);

    if (!normalizedSearch) {
      return matchesFilter;
    }

    const matchesSearch =
      thread.participantName.toLowerCase().includes(normalizedSearch) ||
      thread.subject.toLowerCase().includes(normalizedSearch) ||
      thread.preview.toLowerCase().includes(normalizedSearch) ||
      thread.accessLabel.toLowerCase().includes(normalizedSearch);

    return matchesFilter && matchesSearch;
  });
}

export function getConversationByThreadId(
  threadId: string,
  now: Date = new Date()
): ConversationDetail | undefined {
  const summary = inboxThreadSummaries.find((thread) => thread.id === threadId);
  const thread = threads.find((item) => item.id === threadId);

  if (!summary || !thread) {
    return undefined;
  }

  let previousDayLabel: string | undefined;

  const conversationMessages: ConversationMessage[] = messages
    .filter((message) => message.threadId === threadId)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((message) => {
      const dayLabel = formatDayLabel(message.createdAt, now);
      const shouldShowDayLabel = dayLabel !== previousDayLabel;

      previousDayLabel = dayLabel;

      return {
        id: message.id,
        senderId: message.senderId,
        text: message.text,
        createdAt: message.createdAt,
        timeLabel: formatMessageTime(message.createdAt),
        dayLabel: shouldShowDayLabel ? dayLabel : undefined,
        isFromCreator: message.senderId === thread.creatorId,
        kind: 'text'
      };
    });

  const activityPrefix = summary.participantPresence === 'online' ? 'Active' : 'Last active';
  const canApproveRequest = thread.status === 'request';
  const viewerHasSentMessage = conversationMessages.some((message) => message.senderId === thread.creatorId);

  return {
    id: summary.id,
    participantId: summary.participantId,
    participantName: summary.participantName,
    participantInitials: summary.participantInitials,
    participantAvatar: summary.participantAvatar,
    participantAccentColor: summary.participantAccentColor,
    participantPresence: summary.participantPresence,
    status: thread.status,
    statusLabel: statusLabels[thread.status],
    relativeTime: summary.relativeTime,
    activityLabel: `${activityPrefix} ${summary.relativeTime}`,
    canSendMessage: thread.status !== 'request' || !viewerHasSentMessage,
    canApproveRequest,
    messages: conversationMessages
  };
}
