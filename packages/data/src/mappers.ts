import type {
  ConversationDetail,
  ConversationMessage,
  CreatorProfile,
  InquirySubmissionMessageCard,
  InboxThreadSummary,
  ProfilePost,
  ScheduledCallInvitationCard,
  SupporterProfile,
  UserRole,
  UserPresence,
  ViewerProfile
} from '@syncrolly/core';
import type { Database, PublicRow } from './database.types';
import { normalizeCreatorProfilePageBlocks } from './profilePageBlocks';

type ProfileRow = PublicRow<'profiles'>;
type CreatorProfileRow = PublicRow<'creator_profiles'>;
type SupporterProfileRow = PublicRow<'supporter_profiles'>;
type ConversationRow = PublicRow<'conversations'>;
type MessageRow = PublicRow<'messages'>;
type ParticipantRow = PublicRow<'conversation_participants'>;
type ProfilePostRow = PublicRow<'profile_posts'>;

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

const INQUIRY_SUBMISSION_MESSAGE_PREFIX = '__SYNCROLLY_INQUIRY_SUBMISSION__';
const SCHEDULED_CALL_INVITATION_MESSAGE_PREFIX = '__SYNCROLLY_SCHEDULED_CALL__';

function parseInquirySubmissionMessage(body: string): InquirySubmissionMessageCard | null {
  if (!body.startsWith(INQUIRY_SUBMISSION_MESSAGE_PREFIX)) {
    return null;
  }

  const payloadText = body.slice(INQUIRY_SUBMISSION_MESSAGE_PREFIX.length);

  try {
    const parsed = JSON.parse(payloadText) as {
      submissionId?: unknown;
      formTitle?: unknown;
      supporterName?: unknown;
      submittedAt?: unknown;
      answers?: unknown;
    };

    if (
      typeof parsed.submissionId !== 'string' ||
      typeof parsed.formTitle !== 'string' ||
      typeof parsed.supporterName !== 'string' ||
      typeof parsed.submittedAt !== 'string'
    ) {
      return null;
    }

    const answers = Array.isArray(parsed.answers)
      ? parsed.answers
          .map((answer) => {
            if (
              typeof answer !== 'object' ||
              answer === null ||
              typeof (answer as { questionPrompt?: unknown }).questionPrompt !== 'string' ||
              typeof (answer as { answerText?: unknown }).answerText !== 'string'
            ) {
              return null;
            }

            return {
              questionPrompt: (answer as { questionPrompt: string }).questionPrompt,
              answerText: (answer as { answerText: string }).answerText
            };
          })
          .filter((answer): answer is InquirySubmissionMessageCard['answers'][number] => answer !== null)
      : [];

    return {
      submissionId: parsed.submissionId,
      formTitle: parsed.formTitle,
      supporterName: parsed.supporterName,
      submittedAt: parsed.submittedAt,
      answers
    };
  } catch {
    return null;
  }
}

export function parseScheduledCallInvitationMessage(body: string): ScheduledCallInvitationCard | null {
  if (!body.startsWith(SCHEDULED_CALL_INVITATION_MESSAGE_PREFIX)) {
    return null;
  }

  const payloadText = body.slice(SCHEDULED_CALL_INVITATION_MESSAGE_PREFIX.length);

  try {
    const parsed = JSON.parse(payloadText) as {
      callId?: unknown;
      title?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      status?: unknown;
      ownerId?: unknown;
      attendeeProfileId?: unknown;
      conversationId?: unknown;
    };

    if (
      typeof parsed.callId !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.startsAt !== 'string' ||
      typeof parsed.endsAt !== 'string' ||
      typeof parsed.ownerId !== 'string'
    ) {
      return null;
    }

    return {
      callId: parsed.callId,
      title: parsed.title,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      status:
        parsed.status === 'accepted' || parsed.status === 'declined' || parsed.status === 'pending'
          ? parsed.status
          : 'pending',
      ownerId: parsed.ownerId,
      attendeeProfileId: typeof parsed.attendeeProfileId === 'string' ? parsed.attendeeProfileId : undefined,
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : undefined
    };
  } catch {
    return null;
  }
}

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
        dmAccess: creatorProfile.dm_access,
        dmIntakePolicy: creatorProfile.dm_intake_policy,
        dmFeeUsd: creatorProfile.dm_fee_usd,
        pageBlocks: normalizeCreatorProfilePageBlocks(creatorProfile.page_blocks)
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
    coverImageUrl: profile.cover_image_url ?? undefined,
    bio: profile.bio,
    accentColor: profile.accent_color,
    presence: profile.presence,
    creatorProfile: mappedCreatorProfile,
    supporterProfile: mappedSupporterProfile
  };
}

export function mapProfilePost({
  post,
  author,
  now = new Date()
}: {
  post: ProfilePostRow;
  author: ProfileRow;
  now?: Date;
}): ProfilePost {
  return {
    likeCount: 0,
    likedByViewer: false,
    id: post.id,
    authorId: author.id,
    authorName: author.display_name,
    authorAvatarUrl: author.avatar_url ?? undefined,
    body: post.body,
    imageUrl: post.image_url ?? undefined,
    createdAt: post.created_at,
    relativeTime: formatRelativeTime(post.created_at, now)
  };
}

export function mapConversationMessage({
  message,
  viewerId,
  previousDayLabel,
  scheduledCallInvitationsByCallId,
  now = new Date()
}: {
  message: MessageRow;
  viewerId: string;
  previousDayLabel?: string;
  scheduledCallInvitationsByCallId?: Map<string, ScheduledCallInvitationCard>;
  now?: Date;
}): ConversationMessage {
  const dayLabel = formatDayLabel(message.created_at, now);
  const inquirySubmissionCard = parseInquirySubmissionMessage(message.body);
  const parsedScheduledCallInvitationCard = parseScheduledCallInvitationMessage(message.body);
  const scheduledCallInvitationCard = parsedScheduledCallInvitationCard
    ? scheduledCallInvitationsByCallId?.get(parsedScheduledCallInvitationCard.callId) ?? parsedScheduledCallInvitationCard
    : undefined;

  return {
    id: message.id,
    senderId: message.sender_id,
    text: inquirySubmissionCard
      ? 'Inquiry form submission'
      : scheduledCallInvitationCard
        ? 'Call invitation'
        : message.body,
    createdAt: message.created_at,
    timeLabel: formatMessageTime(message.created_at),
    dayLabel: previousDayLabel === dayLabel ? undefined : dayLabel,
    isFromCreator: message.sender_id === viewerId,
    kind: inquirySubmissionCard ? 'inquiry_submission' : scheduledCallInvitationCard ? 'scheduled_call_invitation' : 'text',
    inquirySubmissionCard: inquirySubmissionCard ?? undefined,
    scheduledCallInvitationCard
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
    preview:
      lastMessage == null
        ? 'No messages yet'
        : parseInquirySubmissionMessage(lastMessage.body)
          ? 'Inquiry form submission'
          : parseScheduledCallInvitationMessage(lastMessage.body)
            ? 'Call invitation'
          : lastMessage.body,
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
  viewerRole,
  scheduledCallInvitationsByCallId,
  now = new Date()
}: {
  conversation: ConversationRow;
  counterpart: ProfileRow;
  messages: MessageRow[];
  viewerId: string;
  viewerRole: UserRole;
  scheduledCallInvitationsByCallId?: Map<string, ScheduledCallInvitationCard>;
  now?: Date;
}): ConversationDetail {
  let previousDayLabel: string | undefined;

  const mappedMessages = messages.map((message) => {
    const nextMessage = mapConversationMessage({
      message,
      viewerId,
      previousDayLabel,
      scheduledCallInvitationsByCallId,
      now
    });

    previousDayLabel = nextMessage.dayLabel ?? previousDayLabel;
    return nextMessage;
  });

  const latestMessage = messages[messages.length - 1];
  const relativeTime = latestMessage ? formatRelativeTime(latestMessage.created_at, now) : 'now';
  const activityPrefix = counterpart.presence === 'online' ? 'Active' : 'Last active';
  const viewerHasSentMessage = messages.some((message) => message.sender_id === viewerId);
  const canApproveRequest = conversation.status === 'request' && viewerRole === 'creator';
  const canSendMessage =
    conversation.status !== 'request' || viewerRole === 'creator' || !viewerHasSentMessage;

  return {
    id: conversation.id,
    participantId: counterpart.id,
    participantName: counterpart.display_name,
    participantInitials: getInitials(counterpart.display_name),
    participantAvatar: counterpart.avatar_url ?? undefined,
    participantAccentColor: counterpart.accent_color,
    participantPresence: counterpart.presence as UserPresence,
    status: conversation.status,
    statusLabel: statusLabels[conversation.status],
    relativeTime,
    activityLabel: `${activityPrefix} ${relativeTime}`,
    canSendMessage,
    canApproveRequest,
    messages: mappedMessages
  };
}
