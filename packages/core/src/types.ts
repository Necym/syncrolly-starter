export type UserRole = 'creator' | 'supporter';
export type AccessLevel = 'free' | 'subscriber' | 'paid' | 'vip';
export type ThreadStatus = 'active' | 'request' | 'flagged';
export type UserPresence = 'online' | 'away' | 'offline';
export type InboxThreadFilter = 'all' | 'vip' | 'paid' | 'requests';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
  accentColor?: string;
  presence?: UserPresence;
}

export interface CreatorProfile {
  userId: string;
  niche: string;
  headline: string;
  dmAccess: 'free' | 'subscriber_only' | 'paid_only';
}

export interface SupporterProfile {
  userId: string;
  accessLevel: AccessLevel;
  totalSpend: number;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  timeLabel: string;
  dayLabel?: string;
  isFromCreator: boolean;
}

export interface Thread {
  id: string;
  creatorId: string;
  supporterId: string;
  accessLevel: AccessLevel;
  status: ThreadStatus;
  subject: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  lastMessageLabel?: string;
  unread: boolean;
}

export interface BookingRequest {
  id: string;
  creatorId: string;
  supporterId: string;
  type: 'Quick Call' | 'Consultation' | 'Coaching Session';
  requestedAt: string;
  note?: string;
}

export interface InboxThreadSummary {
  id: string;
  participantId: string;
  participantName: string;
  participantInitials: string;
  participantAvatar?: string;
  participantAccentColor: string;
  participantPresence: UserPresence;
  accessLevel: AccessLevel;
  accessLabel: string;
  status: ThreadStatus;
  statusLabel: string;
  subject: string;
  preview: string;
  relativeTime: string;
  unread: boolean;
  totalSpend: number;
}

export interface ConversationDetail {
  id: string;
  participantId: string;
  participantName: string;
  participantInitials: string;
  participantAvatar?: string;
  participantAccentColor: string;
  participantPresence: UserPresence;
  relativeTime: string;
  activityLabel: string;
  messages: ConversationMessage[];
}

export interface ViewerProfile {
  id: string;
  role: UserRole;
  displayName: string;
  avatarUrl?: string;
  accentColor: string;
  presence: UserPresence;
  creatorProfile?: CreatorProfile;
  supporterProfile?: SupporterProfile;
}

export interface SaveCreatorProfileInput {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  accentColor?: string;
  presence?: UserPresence;
  niche: string;
  headline: string;
  dmAccess: CreatorProfile['dmAccess'];
}

export interface SaveSupporterProfileInput {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  accentColor?: string;
  presence?: UserPresence;
  accessLevel: SupporterProfile['accessLevel'];
  totalSpend: number;
}

export interface DirectoryProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  accentColor: string;
  presence: UserPresence;
  role: UserRole;
}
