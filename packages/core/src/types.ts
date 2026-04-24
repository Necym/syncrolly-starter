export type UserRole = 'creator' | 'supporter';
export type AccessLevel = 'free' | 'subscriber' | 'paid' | 'vip';
export type ThreadStatus = 'active' | 'request' | 'flagged';
export type UserPresence = 'online' | 'away' | 'offline';
export type InboxThreadFilter = 'all' | 'vip' | 'paid' | 'requests';
export type DmIntakePolicy = 'direct_message' | 'form' | 'paid_fee';
export type CreatorProfilePageBlockType = 'video' | 'offers' | 'cta' | 'media_posts';
export type CreatorProfileCtaActionType = 'direct_message' | 'form' | 'booking' | 'external_url';
export type CreatorProfileOfferIcon =
  | 'call-outline'
  | 'desktop-outline'
  | 'chatbubble-ellipses-outline'
  | 'people-outline'
  | 'trending-up-outline'
  | 'videocam-outline'
  | 'school-outline'
  | 'sparkles-outline'
  | 'rocket-outline';
export type InquiryFormSubmissionStatus = 'pending' | 'opened' | 'qualified' | 'booked' | 'enrolled';
export type ScheduledCallStatus = 'pending' | 'accepted' | 'declined';
export type ConversationMessageKind = 'text' | 'inquiry_submission' | 'scheduled_call_invitation';
export type InstagramConnectionStatus = 'active' | 'expired' | 'revoked' | 'needs_reauth';
export type InstagramLeadStatus = 'new' | 'replied' | 'qualified' | 'archived';
export type InstagramMessageDirection = 'inbound' | 'outbound';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
  accentColor?: string;
  presence?: UserPresence;
}

export interface CreatorProfileVideoBlock {
  id: string;
  type: 'video';
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl?: string;
}

export interface CreatorProfileOfferItem {
  id: string;
  title: string;
  description: string;
  icon: CreatorProfileOfferIcon;
}

export interface CreatorProfileOffersBlock {
  id: string;
  type: 'offers';
  eyebrow?: string;
  title: string;
  items: CreatorProfileOfferItem[];
}

export interface CreatorProfileCtaBlock {
  id: string;
  type: 'cta';
  title: string;
  description: string;
  buttonLabel: string;
  actionType: CreatorProfileCtaActionType;
  target: string;
}

export interface CreatorProfileMediaPostsBlock {
  id: string;
  type: 'media_posts';
  eyebrow?: string;
  title: string;
  description: string;
}

export type CreatorProfilePageBlock =
  | CreatorProfileVideoBlock
  | CreatorProfileOffersBlock
  | CreatorProfileCtaBlock
  | CreatorProfileMediaPostsBlock;

export interface CreatorProfile {
  userId: string;
  niche: string;
  headline: string;
  dmAccess: 'free' | 'subscriber_only' | 'paid_only';
  dmIntakePolicy: DmIntakePolicy;
  dmFeeUsd: number;
  pageBlocks: CreatorProfilePageBlock[];
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
  kind: ConversationMessageKind;
  inquirySubmissionCard?: InquirySubmissionMessageCard;
  scheduledCallInvitationCard?: ScheduledCallInvitationCard;
}

export interface InquirySubmissionMessageCardAnswer {
  questionPrompt: string;
  answerText: string;
}

export interface InquirySubmissionMessageCard {
  submissionId: string;
  formTitle: string;
  supporterName: string;
  submittedAt: string;
  answers: InquirySubmissionMessageCardAnswer[];
}

export interface ScheduledCallInvitationCard {
  callId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: ScheduledCallStatus;
  conversationId?: string;
  ownerId: string;
  attendeeProfileId?: string;
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
  status: ThreadStatus;
  statusLabel: string;
  relativeTime: string;
  activityLabel: string;
  canSendMessage: boolean;
  canApproveRequest: boolean;
  messages: ConversationMessage[];
}

export interface ViewerProfile {
  id: string;
  role: UserRole;
  displayName: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  bio: string;
  accentColor: string;
  presence: UserPresence;
  creatorProfile?: CreatorProfile;
  supporterProfile?: SupporterProfile;
}

export interface SaveCreatorProfileInput {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  bio?: string;
  accentColor?: string;
  presence?: UserPresence;
  niche: string;
  headline: string;
  dmAccess: CreatorProfile['dmAccess'];
  dmIntakePolicy: CreatorProfile['dmIntakePolicy'];
  dmFeeUsd: CreatorProfile['dmFeeUsd'];
  pageBlocks?: CreatorProfilePageBlock[];
}

export interface SaveSupporterProfileInput {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  bio?: string;
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

export interface ScheduledCall {
  id: string;
  ownerId: string;
  attendeeProfileId?: string;
  conversationId?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: ScheduledCallStatus;
  respondedAt?: string;
  isOwner: boolean;
  counterpartProfileId?: string;
  counterpartName?: string;
  counterpartAvatarUrl?: string;
  counterpartAccentColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledCallInput {
  ownerId: string;
  attendeeProfileId?: string;
  conversationId?: string;
  senderId?: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface RescheduleScheduledCallInput {
  callId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface DeleteScheduledCallInput {
  callId: string;
}

export interface ProfilePost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  body: string;
  imageUrl?: string;
  likeCount: number;
  likedByViewer: boolean;
  createdAt: string;
  relativeTime: string;
}

export interface InstagramAccountConnection {
  id: string;
  creatorId: string;
  instagramUserId: string;
  instagramUsername?: string;
  instagramProfilePictureUrl?: string;
  status: InstagramConnectionStatus;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramLeadSummary {
  id: string;
  creatorId: string;
  connectionId: string;
  instagramThreadKey: string;
  instagramScopedUserId: string;
  instagramUsername?: string;
  displayName: string;
  profilePictureUrl?: string;
  leadStatus: InstagramLeadStatus;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramLeadMessage {
  id: string;
  leadId: string;
  connectionId: string;
  metaMessageId?: string;
  direction: InstagramMessageDirection;
  messageType: string;
  textBody: string;
  buttonTitle?: string;
  buttonUrl?: string;
  sentAt: string;
  createdAt: string;
}

export interface SendInstagramButtonReplyInput {
  leadId: string;
  text?: string;
  buttonTitle: string;
  buttonUrl: string;
}

export interface InstagramLeadDetail extends InstagramLeadSummary {
  messages: InstagramLeadMessage[];
}

export interface ProgramLesson {
  id: string;
  programId: string;
  moduleId: string;
  title: string;
  summary: string;
  videoUrl?: string;
  durationLabel?: string;
  position: number;
  isCompleted: boolean;
  progressPercent: number;
  lastPositionSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramModule {
  id: string;
  programId: string;
  title: string;
  summary: string;
  position: number;
  lessonCount: number;
  completedLessons: number;
  progressPercent: number;
  lessons: ProgramLesson[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgramSummary {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  subtitle: string;
  description: string;
  thumbnailUrl?: string;
  moduleCount: number;
  lessonCount: number;
  enrolledCount: number;
  completedLessons: number;
  progressPercent: number;
  nextLessonTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramLearner {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  avatarUrl?: string;
  accentColor?: string;
  enrolledAt: string;
  progressPercent: number;
  completedLessons: number;
  lessonCount: number;
  lastActivityAt?: string;
}

export interface ProgramDetail extends ProgramSummary {
  modules: ProgramModule[];
  lessons: ProgramLesson[];
  learners: ProgramLearner[];
}

export interface CreateProgramInput {
  creatorId: string;
  title: string;
  subtitle?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface UpdateProgramInput {
  programId: string;
  creatorId: string;
  title: string;
  subtitle?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface CreateProgramLessonInput {
  programId: string;
  moduleId?: string;
  title: string;
  summary?: string;
  videoUrl?: string;
  durationLabel?: string;
}

export interface CreateProgramModuleInput {
  programId: string;
  title: string;
  summary?: string;
}

export interface UpdateProgramModuleInput {
  moduleId: string;
  title: string;
  summary?: string;
}

export interface EnrollStudentInProgramInput {
  programId: string;
  studentId: string;
}

export interface MarkProgramLessonCompleteInput {
  lessonId: string;
  studentId: string;
}

export interface SaveProgramLessonProgressInput {
  lessonId: string;
  studentId: string;
  progressPercent: number;
  lastPositionSeconds: number;
}

export type FormQuestionType = 'multiple_choice' | 'short_text' | 'long_text';

export interface InquiryFormDraftQuestion {
  id: string;
  type: FormQuestionType;
  prompt: string;
  placeholder: string;
  options: string[];
}

export interface InquiryFormDraft {
  id?: string;
  title: string;
  intro: string;
  questions: InquiryFormDraftQuestion[];
  updatedAt?: string;
}

export interface InquiryFormQuestionOption {
  id: string;
  label: string;
  position: number;
}

export interface InquiryFormQuestion {
  id: string;
  formId: string;
  position: number;
  type: FormQuestionType;
  prompt: string;
  placeholder: string;
  options: InquiryFormQuestionOption[];
}

export interface InquiryForm {
  id: string;
  creatorId: string;
  title: string;
  intro: string;
  questions: InquiryFormQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveInquiryFormInput {
  creatorId: string;
  title: string;
  intro: string;
  questions: InquiryFormDraftQuestion[];
}

export interface InquiryFormSubmissionAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  answerText?: string;
}

export interface SubmitInquiryFormInput {
  formId: string;
  answers: InquiryFormSubmissionAnswerInput[];
}

export interface InquiryFormSubmissionAnswer {
  id: string;
  questionId: string;
  questionPrompt: string;
  questionType: FormQuestionType;
  selectedOptionId?: string;
  answerText: string;
}

export interface InquiryFormSubmission {
  id: string;
  formId: string;
  creatorId: string;
  supporterId: string;
  supporterName: string;
  supporterAvatarUrl?: string;
  createdAt: string;
  status: InquiryFormSubmissionStatus;
  conversationId?: string;
  answers: InquiryFormSubmissionAnswer[];
}

export interface CreatorSupporterProgramSnapshot {
  enrollmentId: string;
  programId: string;
  title: string;
  thumbnailUrl?: string;
  progressPercent: number;
  completedLessons: number;
  lessonCount: number;
  lastActivityAt?: string;
  enrolledAt: string;
}

export interface CreatorSupporterOverview {
  supporterId: string;
  supporterName: string;
  supporterAvatarUrl?: string;
  latestStatus: InquiryFormSubmissionStatus;
  conversationId?: string;
  submissions: InquiryFormSubmission[];
  scheduledCalls: ScheduledCall[];
  creatorPrograms: ProgramSummary[];
  enrolledPrograms: CreatorSupporterProgramSnapshot[];
}

export interface VoiceAssistantTurnInput {
  audioBase64: string;
  audioMimeType: string;
  fileName: string;
}

export interface VoiceAssistantTurn {
  transcript: string;
  replyText: string;
  audioBase64: string;
  audioMimeType: string;
}
