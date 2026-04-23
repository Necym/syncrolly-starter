import type {
  CreatorSupporterOverview,
  CreatorSupporterProgramSnapshot,
  CreatorProfilePageBlock,
  CreateProgramInput,
  CreateProgramLessonInput,
  CreateScheduledCallInput,
  DeleteScheduledCallInput,
  DirectoryProfile,
  EnrollStudentInProgramInput,
  InstagramAccountConnection,
  InstagramLeadDetail,
  InstagramLeadMessage,
  InstagramLeadStatus,
  InstagramLeadSummary,
  InquiryForm,
  InquiryFormDraftQuestion,
  InquiryFormSubmission,
  InquiryFormSubmissionAnswer,
  MarkProgramLessonCompleteInput,
  ProgramDetail,
  ProgramLearner,
  ProgramLesson,
  ProgramSummary,
  SaveProgramLessonProgressInput,
  SendInstagramButtonReplyInput,
  ScheduledCall,
  RescheduleScheduledCallInput,
  SaveInquiryFormInput,
  ProfilePost,
  SaveCreatorProfileInput,
  SaveSupporterProfileInput,
  SubmitInquiryFormInput,
  UpdateProgramInput,
  VoiceAssistantTurn,
  VoiceAssistantTurnInput,
  ViewerProfile
} from '@syncrolly/core';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient
} from '@supabase/supabase-js';
import {
  formatRelativeTime,
  mapConversationDetail,
  mapInboxThreadSummary,
  mapViewerProfile,
  parseScheduledCallInvitationMessage
} from './mappers';
import type { Database, PublicRow } from './database.types';
import { normalizeCreatorProfilePageBlocks } from './profilePageBlocks';

type SyncrollySupabaseClient = SupabaseClient<Database>;
type ProfileRow = PublicRow<'profiles'>;
type MessageRow = PublicRow<'messages'>;
type InquiryFormRow = PublicRow<'inquiry_forms'>;
type InquiryFormQuestionRow = PublicRow<'inquiry_form_questions'>;
type InquiryFormQuestionOptionRow = PublicRow<'inquiry_form_question_options'>;
type InquiryFormSubmissionRow = PublicRow<'inquiry_form_submissions'>;
type InquiryFormAnswerRow = PublicRow<'inquiry_form_answers'>;
type ProfilePostRow = PublicRow<'profile_posts'>;
type ProfilePostLikeRow = PublicRow<'profile_post_likes'>;
type InstagramAccountConnectionRow = PublicRow<'instagram_account_connections'>;
type InstagramLeadRow = PublicRow<'instagram_leads'>;
type InstagramLeadMessageRow = PublicRow<'instagram_lead_messages'>;
type ProgramRow = PublicRow<'programs'>;
type ProgramLessonRow = PublicRow<'program_lessons'>;
type ProgramEnrollmentRow = PublicRow<'program_enrollments'>;
type LessonProgressRow = PublicRow<'lesson_progress'>;
type ScheduledCallRow = PublicRow<'scheduled_calls'>;
type ScheduledCallStatus = Database['public']['Enums']['scheduled_call_status'];

const SCHEDULED_CALL_INVITATION_MESSAGE_PREFIX = '__SYNCROLLY_SCHEDULED_CALL__';

function requireData<T>(data: T | null, message: string): T {
  if (data == null) {
    throw new Error(message);
  }

  return data;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sortMessagesAscending(messages: MessageRow[]): MessageRow[] {
  return [...messages].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
}

function mapPostsForAuthor(
  posts: ProfilePostRow[],
  author: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  },
  options?: {
    likeRows?: ProfilePostLikeRow[];
    viewerId?: string;
  }
): ProfilePost[] {
  const likeRowsByPostId = new Map<string, ProfilePostLikeRow[]>();

  for (const likeRow of options?.likeRows ?? []) {
    const current = likeRowsByPostId.get(likeRow.post_id) ?? [];
    current.push(likeRow);
    likeRowsByPostId.set(likeRow.post_id, current);
  }

  return posts.map((post) => ({
    ...(function () {
      const postLikeRows = likeRowsByPostId.get(post.id) ?? [];

      return {
        likeCount: postLikeRows.length,
        likedByViewer: Boolean(options?.viewerId && postLikeRows.some((row) => row.user_id === options.viewerId))
      };
    })(),
    id: post.id,
    authorId: author.id,
    authorName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    body: post.body,
    imageUrl: post.image_url ?? undefined,
    createdAt: post.created_at,
    relativeTime: formatRelativeTime(post.created_at)
  }));
}

function mapInstagramAccountConnection(row: InstagramAccountConnectionRow): InstagramAccountConnection {
  return {
    id: row.id,
    creatorId: row.creator_id,
    instagramUserId: row.instagram_user_id,
    instagramUsername: row.instagram_username ?? undefined,
    instagramProfilePictureUrl: row.instagram_profile_picture_url ?? undefined,
    status: row.status,
    lastSyncedAt: row.last_synced_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInstagramLeadSummary(row: InstagramLeadRow): InstagramLeadSummary {
  return {
    id: row.id,
    creatorId: row.creator_id,
    connectionId: row.connection_id,
    instagramThreadKey: row.instagram_thread_key,
    instagramScopedUserId: row.instagram_scoped_user_id,
    instagramUsername: row.instagram_username ?? undefined,
    displayName: row.display_name,
    profilePictureUrl: row.profile_picture_url ?? undefined,
    leadStatus: row.lead_status,
    lastMessageText: row.last_message_text,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInstagramLeadMessage(row: InstagramLeadMessageRow): InstagramLeadMessage {
  const rawPayload =
    typeof row.raw_payload === 'object' && row.raw_payload !== null
      ? (row.raw_payload as Record<string, unknown>)
      : null;
  const messageAttachment =
    rawPayload &&
    typeof rawPayload.message === 'object' &&
    rawPayload.message !== null &&
    typeof (rawPayload.message as { attachment?: unknown }).attachment === 'object' &&
    (rawPayload.message as { attachment: Record<string, unknown> }).attachment !== null
      ? ((rawPayload.message as { attachment: Record<string, unknown> }).attachment as Record<string, unknown>)
      : null;
  const templatePayload =
    messageAttachment &&
    typeof messageAttachment.payload === 'object' &&
    messageAttachment.payload !== null
      ? (messageAttachment.payload as Record<string, unknown>)
      : null;
  const firstButton =
    templatePayload && Array.isArray(templatePayload.buttons) && templatePayload.buttons.length > 0
      ? templatePayload.buttons[0]
      : null;
  const buttonRecord =
    typeof firstButton === 'object' && firstButton !== null ? (firstButton as Record<string, unknown>) : null;

  return {
    id: row.id,
    leadId: row.lead_id,
    connectionId: row.connection_id,
    metaMessageId: row.meta_message_id ?? undefined,
    direction: row.direction,
    messageType: row.message_type,
    textBody: row.text_body,
    buttonTitle: typeof buttonRecord?.title === 'string' ? buttonRecord.title : undefined,
    buttonUrl: typeof buttonRecord?.url === 'string' ? buttonRecord.url : undefined,
    sentAt: row.sent_at,
    createdAt: row.created_at
  };
}

function toCreatorProfilePageBlocksJson(blocks: CreatorProfilePageBlock[] | undefined) {
  return (blocks ?? []) as unknown as Database['public']['Tables']['creator_profiles']['Update']['page_blocks'];
}

function toProgressPercent(completedCount: number, totalCount: number) {
  if (!totalCount) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}

function getLessonProgressPercent(progressRow?: LessonProgressRow) {
  if (!progressRow) {
    return 0;
  }

  if (progressRow.completed_at) {
    return 100;
  }

  return Math.min(Math.max(progressRow.progress_percent ?? 0, 0), 100);
}

function mapProgramLessons(lessons: ProgramLessonRow[], progressByLessonId: Map<string, LessonProgressRow>): ProgramLesson[] {
  return lessons.map((lesson) => ({
    ...(function () {
      const progressRow = progressByLessonId.get(lesson.id);
      const progressPercent = getLessonProgressPercent(progressRow);

      return {
        progressPercent,
        lastPositionSeconds: progressRow?.last_position_seconds ?? 0,
        isCompleted: progressPercent >= 100
      };
    })(),
    id: lesson.id,
    programId: lesson.program_id,
    title: lesson.title,
    summary: lesson.summary,
    videoUrl: lesson.video_url ?? undefined,
    durationLabel: lesson.duration_label ?? undefined,
    position: lesson.position,
    createdAt: lesson.created_at,
    updatedAt: lesson.updated_at
  }));
}

function mapProgramLearners(input: {
  enrollments: ProgramEnrollmentRow[];
  profiles: ProfileRow[];
  lessons: ProgramLessonRow[];
  progressRows: LessonProgressRow[];
}): ProgramLearner[] {
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const lessonIds = new Set(input.lessons.map((lesson) => lesson.id));
  const lessonCount = input.lessons.length;
  const progressByStudentId = new Map<string, LessonProgressRow[]>();

  for (const progressRow of input.progressRows) {
    if (!lessonIds.has(progressRow.lesson_id)) {
      continue;
    }

    const current = progressByStudentId.get(progressRow.student_id) ?? [];
    current.push(progressRow);
    progressByStudentId.set(progressRow.student_id, current);
  }

  return [...input.enrollments]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((enrollment) => {
      const profile = profilesById.get(enrollment.student_id);
      const learnerProgress = progressByStudentId.get(enrollment.student_id) ?? [];
      const completedLessons = learnerProgress.filter((row) => getLessonProgressPercent(row) >= 100).length;
      const progressPercent = lessonCount
        ? Math.round(learnerProgress.reduce((total, row) => total + getLessonProgressPercent(row), 0) / lessonCount)
        : 0;
      const lastActivityAt = learnerProgress.reduce<string | undefined>((latest, row) => {
        if (!latest) {
          return row.updated_at;
        }

        return new Date(row.updated_at).getTime() > new Date(latest).getTime() ? row.updated_at : latest;
      }, undefined);

      return {
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        displayName: profile?.display_name ?? 'Learner',
        avatarUrl: profile?.avatar_url ?? undefined,
        accentColor: profile?.accent_color ?? undefined,
        enrolledAt: enrollment.created_at,
        progressPercent,
        completedLessons,
        lessonCount,
        lastActivityAt
      };
    });
}

function mapCreatorSupporterProgramSnapshots(
  programs: ProgramDetail[],
  supporterId: string
): CreatorSupporterProgramSnapshot[] {
  return programs
    .flatMap((program) => {
      const learner = program.learners.find((entry) => entry.studentId === supporterId);

      if (!learner) {
        return [];
      }

      return [
        {
          enrollmentId: learner.enrollmentId,
          programId: program.id,
          title: program.title,
          thumbnailUrl: program.thumbnailUrl,
          progressPercent: learner.progressPercent,
          completedLessons: learner.completedLessons,
          lessonCount: learner.lessonCount,
          lastActivityAt: learner.lastActivityAt,
          enrolledAt: learner.enrolledAt
        }
      ];
    })
    .sort((left, right) => {
      const leftTime = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : new Date(left.enrolledAt).getTime();
      const rightTime = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : new Date(right.enrolledAt).getTime();
      return rightTime - leftTime;
    });
}

function mapProgramSummaryRows(input: {
  programs: ProgramRow[];
  creatorProfiles: ProfileRow[];
  lessons: ProgramLessonRow[];
  enrollments: ProgramEnrollmentRow[];
  progressRows: LessonProgressRow[];
  role: 'creator' | 'supporter';
}): ProgramSummary[] {
  const creatorProfilesById = new Map(input.creatorProfiles.map((profile) => [profile.id, profile]));
  const progressByLessonId = new Map(input.progressRows.map((progress) => [progress.lesson_id, progress]));
  const lessonsByProgramId = new Map<string, ProgramLessonRow[]>();
  const enrollmentsByProgramId = new Map<string, number>();

  for (const lesson of input.lessons) {
    const current = lessonsByProgramId.get(lesson.program_id) ?? [];
    current.push(lesson);
    lessonsByProgramId.set(lesson.program_id, current);
  }

  for (const enrollment of input.enrollments) {
    enrollmentsByProgramId.set(enrollment.program_id, (enrollmentsByProgramId.get(enrollment.program_id) ?? 0) + 1);
  }

  return input.programs.map((program) => {
    const programLessons = [...(lessonsByProgramId.get(program.id) ?? [])].sort((left, right) => left.position - right.position);
    const lessonCount = programLessons.length;
    const completedLessons = input.role === 'supporter'
      ? programLessons.filter((lesson) => Boolean(progressByLessonId.get(lesson.id)?.completed_at)).length
      : programLessons.filter((lesson) => Boolean(lesson.video_url)).length;
    const progressPercent =
      input.role === 'supporter'
        ? lessonCount
          ? Math.round(
              programLessons.reduce((total, lesson) => total + getLessonProgressPercent(progressByLessonId.get(lesson.id)), 0) /
                lessonCount
            )
          : 0
        : toProgressPercent(completedLessons, lessonCount);
    const nextLesson =
      input.role === 'supporter'
        ? programLessons.find((lesson) => getLessonProgressPercent(progressByLessonId.get(lesson.id)) < 100) ?? programLessons[0]
        : programLessons.find((lesson) => !lesson.video_url) ?? programLessons[programLessons.length - 1];

    return {
      id: program.id,
      creatorId: program.creator_id,
      creatorName: creatorProfilesById.get(program.creator_id)?.display_name ?? 'Creator',
      title: program.title,
      subtitle: program.subtitle,
      description: program.description,
      thumbnailUrl: program.thumbnail_url ?? undefined,
      lessonCount,
      enrolledCount: enrollmentsByProgramId.get(program.id) ?? 0,
      completedLessons,
      progressPercent,
      nextLessonTitle: nextLesson?.title,
      createdAt: program.created_at,
      updatedAt: program.updated_at
    };
  });
}

function mapScheduledCalls(
  calls: ScheduledCallRow[],
  relatedProfiles: ProfileRow[],
  viewerId: string
): ScheduledCall[] {
  const profilesById = new Map(relatedProfiles.map((profile) => [profile.id, profile]));

  return calls.map((call) => {
    const ownerProfile = profilesById.get(call.owner_id);
    const attendeeProfile = call.attendee_profile_id ? profilesById.get(call.attendee_profile_id) : undefined;
    const isOwner = call.owner_id === viewerId;
    const counterpartProfile = isOwner ? attendeeProfile : ownerProfile;

    return {
      id: call.id,
      ownerId: call.owner_id,
      attendeeProfileId: call.attendee_profile_id ?? undefined,
      conversationId: call.conversation_id ?? undefined,
      title: call.title,
      startsAt: call.starts_at,
      endsAt: call.ends_at,
      status: call.status,
      respondedAt: call.responded_at ?? undefined,
      isOwner,
      counterpartProfileId: counterpartProfile?.id,
      counterpartName: counterpartProfile?.display_name,
      counterpartAvatarUrl: counterpartProfile?.avatar_url ?? undefined,
      counterpartAccentColor: counterpartProfile?.accent_color,
      createdAt: call.created_at,
      updatedAt: call.updated_at
    };
  });
}

function buildScheduledCallInvitationMessageBody(call: {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: ScheduledCallStatus;
  ownerId: string;
  attendeeProfileId?: string | null;
  conversationId?: string | null;
}) {
  return `${SCHEDULED_CALL_INVITATION_MESSAGE_PREFIX}${JSON.stringify({
    callId: call.id,
    title: call.title,
    startsAt: call.startsAt,
    endsAt: call.endsAt,
    status: call.status,
    ownerId: call.ownerId,
    attendeeProfileId: call.attendeeProfileId ?? undefined,
    conversationId: call.conversationId ?? undefined
  })}`;
}

async function loadScheduledCallById(
  client: SyncrollySupabaseClient,
  callId: string,
  viewerId: string
): Promise<ScheduledCall> {
  const { data: scheduledCall, error: scheduledCallError } = await client
    .from('scheduled_calls')
    .select('*')
    .eq('id', callId)
    .single();

  if (scheduledCallError) throw scheduledCallError;

  const relatedProfileIds = unique(
    [scheduledCall.owner_id, scheduledCall.attendee_profile_id].filter((profileId): profileId is string => Boolean(profileId))
  );

  const { data: relatedProfiles, error: attendeeProfileError } = relatedProfileIds.length
    ? await client.from('profiles').select('*').in('id', relatedProfileIds)
    : { data: [] as ProfileRow[], error: null };

  if (attendeeProfileError) throw attendeeProfileError;

  return mapScheduledCalls([scheduledCall], relatedProfiles ?? [], viewerId)[0];
}

async function loadScheduledCallRowById(client: SyncrollySupabaseClient, callId: string) {
  const { data: scheduledCall, error } = await client.from('scheduled_calls').select('*').eq('id', callId).maybeSingle();

  if (error) throw error;

  return scheduledCall;
}

async function hasViewerScheduledCallConflict(
  client: SyncrollySupabaseClient,
  viewerId: string,
  startsAt: string,
  endsAt: string,
  excludeCallId?: string
) {
  let query = client
    .from('scheduled_calls')
    .select('id', { count: 'exact', head: true })
    .or(`owner_id.eq.${viewerId},attendee_profile_id.eq.${viewerId}`)
    .neq('status', 'declined')
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt);

  if (excludeCallId) {
    query = query.neq('id', excludeCallId);
  }

  const { count, error } = await query;

  if (error) throw error;

  return (count ?? 0) > 0;
}

async function fallbackRescheduleScheduledCall(
  client: SyncrollySupabaseClient,
  viewerId: string,
  input: RescheduleScheduledCallInput
): Promise<ScheduledCall> {
  const existingCall = await loadScheduledCallRowById(client, input.callId);

  if (!existingCall || existingCall.status === 'declined') {
    throw new Error('Call not found or already removed.');
  }

  if (existingCall.owner_id !== viewerId) {
    throw new Error(getScheduledCallActionMigrationMessage('reschedule'));
  }

  if (await hasViewerScheduledCallConflict(client, viewerId, input.startsAt, input.endsAt, input.callId)) {
    throw new Error('Time conflict: you already have another call in that slot.');
  }

  const { error } = await client
    .from('scheduled_calls')
    .update({
      title: input.title.trim(),
      starts_at: input.startsAt,
      ends_at: input.endsAt
    })
    .eq('id', input.callId)
    .neq('status', 'declined')
    .select('id')
    .single();

  if (error) throw error;

  return loadScheduledCallById(client, input.callId, viewerId);
}

async function fallbackDeleteScheduledCall(
  client: SyncrollySupabaseClient,
  viewerId: string,
  input: DeleteScheduledCallInput
) {
  const existingCall = await loadScheduledCallRowById(client, input.callId);

  if (!existingCall || existingCall.status === 'declined') {
    throw new Error('Call not found or already removed.');
  }

  if (existingCall.owner_id !== viewerId) {
    throw new Error(getScheduledCallActionMigrationMessage('delete'));
  }

  const { data, error } = await client
    .from('scheduled_calls')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString()
    })
    .eq('id', input.callId)
    .neq('status', 'declined')
    .select('id')
    .single();

  if (error) throw error;

  return data.id;
}

function mapInquiryForm(
  form: InquiryFormRow,
  questions: InquiryFormQuestionRow[],
  options: InquiryFormQuestionOptionRow[]
): InquiryForm {
  const optionsByQuestionId = new Map<string, InquiryFormQuestionOptionRow[]>();

  for (const option of options) {
    const current = optionsByQuestionId.get(option.question_id) ?? [];
    current.push(option);
    optionsByQuestionId.set(option.question_id, current);
  }

  return {
    id: form.id,
    creatorId: form.creator_id,
    title: form.title,
    intro: form.intro,
    createdAt: form.created_at,
    updatedAt: form.updated_at,
    questions: [...questions]
      .sort((left, right) => left.position - right.position)
      .map((question) => ({
        id: question.id,
        formId: question.form_id,
        position: question.position,
        type: question.type,
        prompt: question.prompt,
        placeholder: question.placeholder,
        options: [...(optionsByQuestionId.get(question.id) ?? [])]
          .sort((left, right) => left.position - right.position)
          .map((option) => ({
            id: option.id,
            label: option.label,
            position: option.position
          }))
      }))
  };
}

function mapDraftQuestionsForRpc(questions: InquiryFormDraftQuestion[]) {
  return questions.map((question) => ({
    type: question.type,
    prompt: question.prompt.trim(),
    placeholder: question.placeholder,
    options:
      question.type === 'multiple_choice'
        ? question.options.map((option) => option.trim()).filter(Boolean).slice(0, 4)
        : []
  }));
}

function getErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return '';
}

function isMissingDirectConversationRpc(error: unknown): boolean {
  const errorCode = getErrorCode(error);
  const errorText = getErrorText(error);

  return (
    errorCode === 'PGRST202' ||
    errorCode === '42883' ||
    errorText.includes('get_or_create_direct_conversation')
  );
}

function isMissingScheduledCallActionRpc(
  error: unknown,
  rpcName: 'reschedule_scheduled_call' | 'cancel_scheduled_call'
): boolean {
  const errorCode = getErrorCode(error);
  const errorText = getErrorText(error);

  return errorCode === 'PGRST202' || errorCode === '42883' || errorText.includes(rpcName);
}

function getScheduledCallActionMigrationMessage(action: 'reschedule' | 'delete'): string {
  return `Run supabase/migrations/20260417_scheduled_call_actions.sql and supabase/migrations/20260417_scheduled_call_conflicts.sql in the Supabase SQL editor, then try to ${action} the call again.`;
}

function isConversationInsertRlsError(error: unknown): boolean {
  const errorCode = getErrorCode(error);
  const errorText = getErrorText(error).toLowerCase();

  return (
    errorCode === '42501' &&
    errorText.includes('row-level security') &&
    errorText.includes('conversations')
  );
}

function getDirectConversationMigrationMessage(): string {
  return 'Run supabase/migrations/20260416_direct_conversation_rpc.sql in the Supabase SQL editor, then try New Message again.';
}

function isMessageRequestGateError(error: unknown): boolean {
  const errorCode = getErrorCode(error);
  const errorText = getErrorText(error).toLowerCase();

  return (
    errorCode === '42501' &&
    errorText.includes('row-level security') &&
    errorText.includes('messages')
  );
}

function getMessageRequestGateMessage(): string {
  return 'This request is waiting for creator approval before you can send another message.';
}

function isDmPolicyGateError(error: unknown): boolean {
  const errorText = getErrorText(error).toLowerCase();

  return (
    errorText.includes('requires an inquiry form before a new dm can start') ||
    errorText.includes('requires a paid unlock before a new dm can start')
  );
}

function getDmPolicyGateMessage(error: unknown): string {
  const errorText = getErrorText(error).toLowerCase();

  if (errorText.includes('paid unlock')) {
    return 'This creator requires a paid unlock before a new DM can start.';
  }

  return 'This creator requires an inquiry form before a new DM can start.';
}

async function getFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;

    if (response instanceof Response) {
      try {
        const json = (await response.json()) as { error?: unknown; message?: unknown };
        const message =
          typeof json.error === 'string'
            ? json.error
            : typeof json.message === 'string'
              ? json.message
              : null;

        if (message) {
          return message;
        }
      } catch {
        try {
          const text = await response.text();

          if (text.trim()) {
            return text.trim();
          }
        } catch {
          return error.message;
        }
      }
    }

    return error.message;
  }

  if (error instanceof FunctionsRelayError) {
    return 'Supabase could not reach the Edge Function. Deploy voice-assistant and try again.';
  }

  if (error instanceof FunctionsFetchError) {
    return 'The app could not reach the voice assistant function. Check your internet connection and Supabase project status.';
  }

  return null;
}

async function notifyMessageRecipients(
  client: SyncrollySupabaseClient,
  input: {
    messageId: string;
  }
) {
  try {
    const { error } = await client.functions.invoke('notify-new-message', {
      body: {
        messageId: input.messageId
      }
    });

    if (error) {
      console.warn('Push notification dispatch failed', error);
    }
  } catch (error) {
    console.warn('Push notification dispatch failed', error);
  }
}

export async function getViewerProfile(
  client: SyncrollySupabaseClient,
  userId: string
): Promise<ViewerProfile | null> {
  const [
    { data: profile, error: profileError },
    { data: creatorProfile, error: creatorError },
    { data: supporterProfile, error: supporterError }
  ] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('creator_profiles').select('*').eq('user_id', userId).maybeSingle(),
    client.from('supporter_profiles').select('*').eq('user_id', userId).maybeSingle()
  ]);

  if (profileError) throw profileError;
  if (creatorError) throw creatorError;
  if (supporterError) throw supporterError;
  if (!profile) return null;

  return mapViewerProfile({
    profile,
    creatorProfile,
    supporterProfile
  });
}

export async function getPublicProfile(
  client: SyncrollySupabaseClient,
  userId: string
): Promise<ViewerProfile | null> {
  const { data, error } = await client.rpc('get_public_profile', {
    profile_user_id: userId
  });

  if (error) throw error;

  const profile = data?.[0];

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    role: profile.role,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined,
    coverImageUrl: profile.cover_image_url ?? undefined,
    bio: profile.bio,
    accentColor: profile.accent_color,
    presence: profile.presence,
    creatorProfile:
      profile.role === 'creator'
        ? {
            userId: profile.id,
            niche: profile.niche ?? '',
            headline: profile.headline ?? '',
            dmAccess: profile.dm_access ?? 'subscriber_only',
            dmIntakePolicy: profile.dm_intake_policy ?? 'direct_message',
            dmFeeUsd: profile.dm_fee_usd ?? 25,
            pageBlocks: normalizeCreatorProfilePageBlocks(profile.page_blocks)
          }
        : undefined,
    supporterProfile: undefined
  };
}

export async function saveCreatorProfile(
  client: SyncrollySupabaseClient,
  input: SaveCreatorProfileInput
): Promise<ViewerProfile> {
  const profileUpsert: Database['public']['Tables']['profiles']['Insert'] = {
    id: input.userId,
    role: 'creator',
    display_name: input.displayName
  };

  if (typeof input.avatarUrl !== 'undefined') {
    profileUpsert.avatar_url = input.avatarUrl;
  }

  if (typeof input.coverImageUrl !== 'undefined') {
    profileUpsert.cover_image_url = input.coverImageUrl;
  }

  if (typeof input.bio !== 'undefined') {
    profileUpsert.bio = input.bio;
  }

  if (typeof input.accentColor !== 'undefined') {
    profileUpsert.accent_color = input.accentColor;
  }

  if (typeof input.presence !== 'undefined') {
    profileUpsert.presence = input.presence;
  }

  const { error: profileError } = await client
    .from('profiles')
    .upsert(profileUpsert, {
      onConflict: 'id'
    });

  if (profileError) throw profileError;

  const creatorUpsertWithBlocks = {
    user_id: input.userId,
    niche: input.niche,
    headline: input.headline,
    dm_access: input.dmAccess,
    dm_intake_policy: input.dmIntakePolicy,
    dm_fee_usd: input.dmFeeUsd,
    page_blocks: toCreatorProfilePageBlocksJson(input.pageBlocks)
  };

  const creatorUpsertWithoutBlocks = {
    user_id: input.userId,
    niche: input.niche,
    headline: input.headline,
    dm_access: input.dmAccess,
    dm_intake_policy: input.dmIntakePolicy,
    dm_fee_usd: input.dmFeeUsd
  };

  let creatorError: { message: string } | null = null;

  {
    const { error } = await client.from('creator_profiles').upsert(creatorUpsertWithBlocks);
    creatorError = error;
  }

  if (creatorError?.message?.toLowerCase().includes('page_blocks')) {
    const { error } = await client.from('creator_profiles').upsert(creatorUpsertWithoutBlocks);
    creatorError = error;
  }

  if (creatorError) throw creatorError;

  return requireData(await getViewerProfile(client, input.userId), 'Creator profile could not be reloaded.');
}

export async function saveSupporterProfile(
  client: SyncrollySupabaseClient,
  input: SaveSupporterProfileInput
): Promise<ViewerProfile> {
  const profileUpsert: Database['public']['Tables']['profiles']['Insert'] = {
    id: input.userId,
    role: 'supporter',
    display_name: input.displayName
  };

  if (typeof input.avatarUrl !== 'undefined') {
    profileUpsert.avatar_url = input.avatarUrl;
  }

  if (typeof input.coverImageUrl !== 'undefined') {
    profileUpsert.cover_image_url = input.coverImageUrl;
  }

  if (typeof input.bio !== 'undefined') {
    profileUpsert.bio = input.bio;
  }

  if (typeof input.accentColor !== 'undefined') {
    profileUpsert.accent_color = input.accentColor;
  }

  if (typeof input.presence !== 'undefined') {
    profileUpsert.presence = input.presence;
  }

  const [{ error: profileError }, { error: supporterError }] = await Promise.all([
    client
      .from('profiles')
      .upsert(profileUpsert, {
        onConflict: 'id'
      }),
    client.from('supporter_profiles').upsert({
      user_id: input.userId,
      access_level: input.accessLevel,
      total_spend: input.totalSpend
    })
  ]);

  if (profileError) throw profileError;
  if (supporterError) throw supporterError;

  return requireData(await getViewerProfile(client, input.userId), 'Supporter profile could not be reloaded.');
}

export async function listInboxThreads(client: SyncrollySupabaseClient, viewerId: string) {
  const { data: memberships, error: membershipsError } = await client
    .from('conversation_participants')
    .select('*')
    .eq('user_id', viewerId);

  if (membershipsError) throw membershipsError;
  if (!memberships?.length) return [];

  const conversationIds = memberships.map((membership) => membership.conversation_id);

  const [
    { data: conversations, error: conversationsError },
    { data: participantRows, error: participantsError },
    { data: messages, error: messagesError }
  ] = await Promise.all([
    client.from('conversations').select('*').in('id', conversationIds),
    client.from('conversation_participants').select('*').in('conversation_id', conversationIds),
    client.from('messages').select('*').in('conversation_id', conversationIds).order('created_at', { ascending: false })
  ]);

  if (conversationsError) throw conversationsError;
  if (participantsError) throw participantsError;
  if (messagesError) throw messagesError;

  const counterpartIds = unique(
    (participantRows ?? [])
      .filter((row) => row.user_id !== viewerId)
      .map((row) => row.user_id)
  );

  const [{ data: profiles, error: profilesError }, { data: supporterProfiles, error: supporterProfilesError }] = await Promise.all([
    counterpartIds.length
      ? client.from('profiles').select('*').in('id', counterpartIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    counterpartIds.length
      ? client.from('supporter_profiles').select('*').in('user_id', counterpartIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (profilesError) throw profilesError;
  if (supporterProfilesError) throw supporterProfilesError;

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const supporterProfilesById = new Map((supporterProfiles ?? []).map((profile) => [profile.user_id, profile]));
  const membershipsByConversationId = new Map(memberships.map((membership) => [membership.conversation_id, membership]));
  const latestMessageByConversationId = new Map<string, MessageRow>();

  for (const message of messages ?? []) {
    if (!latestMessageByConversationId.has(message.conversation_id)) {
      latestMessageByConversationId.set(message.conversation_id, message);
    }
  }

  return (conversations ?? [])
    .map((conversation) => {
      const counterpartMembership = participantRows?.find(
        (row) => row.conversation_id === conversation.id && row.user_id !== viewerId
      );
      const counterpart = counterpartMembership ? profilesById.get(counterpartMembership.user_id) : undefined;

      if (!counterpart) {
        return null;
      }

      return mapInboxThreadSummary({
        conversation,
        counterpart,
        counterpartSupporterProfile: supporterProfilesById.get(counterpart.id),
        lastMessage: latestMessageByConversationId.get(conversation.id),
        membership: membershipsByConversationId.get(conversation.id)
      });
    })
    .filter((thread): thread is NonNullable<typeof thread> => thread !== null)
    .sort((left, right) => {
      const leftTime = latestMessageByConversationId.get(left.id)?.created_at ?? '';
      const rightTime = latestMessageByConversationId.get(right.id)?.created_at ?? '';
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
}

export async function getConversationDetails(
  client: SyncrollySupabaseClient,
  conversationId: string,
  viewerId: string
) {
  const [
    { data: conversation, error: conversationError },
    { data: participantRows, error: participantsError },
    { data: messages, error: messagesError },
    { data: viewerProfile, error: viewerProfileError }
  ] = await Promise.all([
    client.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
    client.from('conversation_participants').select('*').eq('conversation_id', conversationId),
    client.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
    client.from('profiles').select('*').eq('id', viewerId).maybeSingle()
  ]);

  if (conversationError) throw conversationError;
  if (participantsError) throw participantsError;
  if (messagesError) throw messagesError;
  if (viewerProfileError) throw viewerProfileError;
  if (!conversation) return null;
  if (!viewerProfile) return null;

  const counterpartMembership = participantRows?.find((row) => row.user_id !== viewerId);

  if (!counterpartMembership) {
    return null;
  }

  const { data: counterpart, error: counterpartError } = await client
    .from('profiles')
    .select('*')
    .eq('id', counterpartMembership.user_id)
    .maybeSingle();

  if (counterpartError) throw counterpartError;
  if (!counterpart) return null;

  const scheduledCallInvitationPayloads = (messages ?? [])
    .map((message) => parseScheduledCallInvitationMessage(message.body))
    .filter((card): card is NonNullable<typeof card> => card !== null);
  const scheduledCallIds = unique(scheduledCallInvitationPayloads.map((card) => card.callId));

  const { data: scheduledCallRows, error: scheduledCallsError } = scheduledCallIds.length
    ? await client.from('scheduled_calls').select('*').in('id', scheduledCallIds)
    : { data: [] as ScheduledCallRow[], error: null };

  if (scheduledCallsError) throw scheduledCallsError;

  const scheduledCallProfileIds = unique(
    (scheduledCallRows ?? []).flatMap((call) =>
      [call.owner_id, call.attendee_profile_id].filter((id): id is string => Boolean(id))
    )
  );

  const { data: scheduledCallProfiles, error: scheduledCallProfilesError } = scheduledCallProfileIds.length
    ? await client.from('profiles').select('*').in('id', scheduledCallProfileIds)
    : { data: [] as ProfileRow[], error: null };

  if (scheduledCallProfilesError) throw scheduledCallProfilesError;

  const scheduledCallInvitationsByCallId = new Map(
    mapScheduledCalls(scheduledCallRows ?? [], scheduledCallProfiles ?? [], viewerId).map((call) => [
      call.id,
      {
        callId: call.id,
        title: call.title,
        startsAt: call.startsAt,
        endsAt: call.endsAt,
        status: call.status,
        conversationId: call.conversationId,
        ownerId: call.ownerId,
        attendeeProfileId: call.attendeeProfileId
      }
    ])
  );

  return mapConversationDetail({
    conversation,
    counterpart,
    messages: sortMessagesAscending(messages ?? []),
    viewerId,
    viewerRole: viewerProfile.role,
    scheduledCallInvitationsByCallId
  });
}

export async function sendMessage(
  client: SyncrollySupabaseClient,
  input: {
    conversationId: string;
    senderId: string;
    body: string;
  }
) {
  const trimmedBody = input.body.trim();

  if (!trimmedBody) {
    throw new Error('Message body cannot be empty.');
  }

  const { data: insertedMessage, error: insertError } = await client
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: trimmedBody
    })
    .select('*')
    .single();

  if (insertError) {
    if (isMessageRequestGateError(insertError)) {
      throw new Error(getMessageRequestGateMessage());
    }

    throw insertError;
  }

  const { error: updateReadError } = await client
    .from('conversation_participants')
    .update({
      last_read_at: insertedMessage.created_at
    })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.senderId);

  if (updateReadError) throw updateReadError;

  await notifyMessageRecipients(client, {
    messageId: insertedMessage.id
  });

  return insertedMessage;
}

export async function createDirectConversation(
  client: SyncrollySupabaseClient,
  input: {
    createdBy: string;
    counterpartUserId: string;
    subject?: string;
    status?: Database['public']['Tables']['conversations']['Row']['status'];
  }
) {
  const { data: conversationId, error: rpcError } = await client.rpc('get_or_create_direct_conversation', {
    target_user_id: input.counterpartUserId,
    conversation_subject: input.subject ?? ''
  });

  if (rpcError) {
    if (isMissingDirectConversationRpc(rpcError)) {
      return createDirectConversationFallback(client, input);
    }

    if (isDmPolicyGateError(rpcError)) {
      throw new Error(getDmPolicyGateMessage(rpcError));
    }

    throw rpcError;
  }

  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (conversationError) throw conversationError;

  return conversation;
}

async function createDirectConversationFallback(
  client: SyncrollySupabaseClient,
  input: {
    createdBy: string;
    counterpartUserId: string;
    subject?: string;
    status?: Database['public']['Tables']['conversations']['Row']['status'];
  }
) {
  const { data: viewerMemberships, error: viewerMembershipsError } = await client
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', input.createdBy);

  if (viewerMembershipsError) {
    throw viewerMembershipsError;
  }

  const candidateConversationIds = viewerMemberships?.map((membership) => membership.conversation_id) ?? [];

  if (candidateConversationIds.length) {
    const { data: counterpartMemberships, error: counterpartMembershipsError } = await client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', input.counterpartUserId)
      .in('conversation_id', candidateConversationIds);

    if (counterpartMembershipsError) {
      throw counterpartMembershipsError;
    }

    const sharedConversationIds = counterpartMemberships?.map((membership) => membership.conversation_id) ?? [];

    if (sharedConversationIds.length) {
      const { data: sharedParticipants, error: sharedParticipantsError } = await client
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', sharedConversationIds);

      if (sharedParticipantsError) {
        throw sharedParticipantsError;
      }

      const firstDirectConversationId = sharedConversationIds.find((conversationId) => {
        const participants = sharedParticipants?.filter((row) => row.conversation_id === conversationId) ?? [];
        return participants.length === 2;
      });

      if (firstDirectConversationId) {
        const { data: existingConversation, error: existingConversationError } = await client
          .from('conversations')
          .select('*')
          .eq('id', firstDirectConversationId)
          .single();

        if (existingConversationError) {
          throw existingConversationError;
        }

        return existingConversation;
      }
    }
  }

  const { data: newConversation, error: newConversationError } = await client
    .from('conversations')
    .insert({
      created_by: input.createdBy,
      subject: input.subject ?? '',
      status: input.status ?? 'active'
    })
    .select('*')
    .single();

  if (newConversationError) {
    if (isConversationInsertRlsError(newConversationError)) {
      throw new Error(getDirectConversationMigrationMessage());
    }

    throw newConversationError;
  }

  const { error: participantInsertError } = await client.from('conversation_participants').insert([
    {
      conversation_id: newConversation.id,
      user_id: input.createdBy
    },
    {
      conversation_id: newConversation.id,
      user_id: input.counterpartUserId
    }
  ]);

  if (participantInsertError) {
    throw participantInsertError;
  }

  return newConversation;
}

export async function deleteDirectConversation(
  client: SyncrollySupabaseClient,
  input: {
    conversationId: string;
  }
) {
  const { data, error } = await client.rpc('delete_direct_conversation', {
    conversation_uuid: input.conversationId
  });

  if (error) throw error;

  return data;
}

export async function markConversationRead(
  client: SyncrollySupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    readAt?: string;
  }
) {
  const { error } = await client
    .from('conversation_participants')
    .update({
      last_read_at: input.readAt ?? new Date().toISOString()
    })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId);

  if (error) throw error;
}

export async function approveConversationRequest(
  client: SyncrollySupabaseClient,
  input: {
    conversationId: string;
  }
) {
  const { data, error } = await client.rpc('approve_conversation_request', {
    conversation_uuid: input.conversationId
  });

  if (error) throw error;

  return data;
}

export async function searchProfiles(
  client: SyncrollySupabaseClient,
  searchTerm: string
): Promise<DirectoryProfile[]> {
  const { data, error } = await client.rpc('search_profiles', {
    search_term: searchTerm.trim()
  });

  if (error) throw error;

  return (data ?? []).map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined,
    accentColor: profile.accent_color,
    presence: profile.presence,
    role: profile.role
  }));
}

export async function listScheduledCalls(
  client: SyncrollySupabaseClient,
  viewerId: string,
  options?: {
    startsAt?: string;
    endsAt?: string;
  }
): Promise<ScheduledCall[]> {
  let query = client
    .from('scheduled_calls')
    .select('*')
    .or(`owner_id.eq.${viewerId},attendee_profile_id.eq.${viewerId}`)
    .order('starts_at', { ascending: true });

  if (options?.startsAt) {
    query = query.gte('starts_at', options.startsAt);
  }

  if (options?.endsAt) {
    query = query.lt('starts_at', options.endsAt);
  }

  const { data: calls, error: callsError } = await query;

  if (callsError) throw callsError;
  if (!calls?.length) return [];

  const visibleCalls = calls.filter((call) =>
    call.owner_id === viewerId ? call.status !== 'declined' : call.status === 'accepted'
  );

  if (!visibleCalls.length) return [];

  const relatedProfileIds = unique(
    visibleCalls.flatMap((call) =>
      [call.owner_id, call.attendee_profile_id].filter((profileId): profileId is string => Boolean(profileId))
    )
  );

  const { data: relatedProfiles, error: attendeeProfilesError } = relatedProfileIds.length
    ? await client.from('profiles').select('*').in('id', relatedProfileIds)
    : { data: [] as ProfileRow[], error: null };

  if (attendeeProfilesError) throw attendeeProfilesError;

  return mapScheduledCalls(visibleCalls, relatedProfiles ?? [], viewerId);
}

export async function createScheduledCall(
  client: SyncrollySupabaseClient,
  input: CreateScheduledCallInput
): Promise<ScheduledCall> {
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle) {
    throw new Error('Call title cannot be empty.');
  }

  const { data: insertedCallId, error: insertError } = await client.rpc('create_scheduled_call', {
    next_attendee_profile_id: input.attendeeProfileId ?? null,
    next_conversation_id: input.conversationId ?? null,
    next_title: trimmedTitle,
    next_starts_at: input.startsAt,
    next_ends_at: input.endsAt
  });

  if (insertError) throw insertError;

  const insertedCall = await loadScheduledCallById(client, insertedCallId, input.ownerId);

  if (input.conversationId && input.senderId) {
    try {
      await sendMessage(client, {
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: buildScheduledCallInvitationMessageBody({
          id: insertedCall.id,
          title: insertedCall.title,
          startsAt: insertedCall.startsAt,
          endsAt: insertedCall.endsAt,
          status: insertedCall.status,
          ownerId: insertedCall.ownerId,
          attendeeProfileId: insertedCall.attendeeProfileId,
          conversationId: insertedCall.conversationId
        })
      });
    } catch (error) {
      await client.from('scheduled_calls').delete().eq('id', insertedCall.id);
      throw error;
    }
  }

  return insertedCall;
}

export async function respondToScheduledCallInvitation(
  client: SyncrollySupabaseClient,
  input: {
    callId: string;
    nextStatus: Extract<ScheduledCallStatus, 'accepted' | 'declined'>;
  }
) {
  const { data, error } = await client.rpc('respond_to_scheduled_call_invitation', {
    call_uuid: input.callId,
    next_status: input.nextStatus
  });

  if (error) throw error;

  return data;
}

export async function rescheduleScheduledCall(
  client: SyncrollySupabaseClient,
  viewerId: string,
  input: RescheduleScheduledCallInput
): Promise<ScheduledCall> {
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle) {
    throw new Error('Call title cannot be empty.');
  }

  const { data, error } = await client.rpc('reschedule_scheduled_call', {
    call_uuid: input.callId,
    next_title: trimmedTitle,
    next_starts_at: input.startsAt,
    next_ends_at: input.endsAt
  });

  if (error) {
    if (isMissingScheduledCallActionRpc(error, 'reschedule_scheduled_call')) {
      return fallbackRescheduleScheduledCall(client, viewerId, input);
    }

    throw error;
  }

  return loadScheduledCallById(client, data, viewerId);
}

export async function deleteScheduledCall(
  client: SyncrollySupabaseClient,
  viewerId: string,
  input: DeleteScheduledCallInput
) {
  const { data, error } = await client.rpc('cancel_scheduled_call', {
    call_uuid: input.callId
  });

  if (error) {
    if (isMissingScheduledCallActionRpc(error, 'cancel_scheduled_call')) {
      return fallbackDeleteScheduledCall(client, viewerId, input);
    }

    throw error;
  }

  return data;
}

async function uploadOwnedMedia(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
    bucketId: 'avatars' | 'program-media';
    objectPrefix: string;
  }
) {
  const normalizedExtension = input.fileExtension?.replace(/^\./, '').trim().toLowerCase() || 'jpg';
  const objectPath = `${input.userId}/${input.objectPrefix}-${Date.now()}.${normalizedExtension}`;

  const { error: uploadError } = await client.storage.from(input.bucketId).upload(objectPath, input.fileData, {
    contentType: input.contentType,
    upsert: false
  });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = client.storage.from(input.bucketId).getPublicUrl(objectPath);

  return publicUrl;
}

export async function uploadProfileMedia(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
    mediaKind?: 'avatar' | 'cover' | 'post';
  }
) {
  const mediaKind = input.mediaKind ?? 'avatar';

  return uploadOwnedMedia(client, {
    userId: input.userId,
    fileData: input.fileData,
    contentType: input.contentType,
    fileExtension: input.fileExtension,
    bucketId: 'avatars',
    objectPrefix: mediaKind
  });
}

export async function uploadProfileAvatar(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
  }
) {
  return uploadProfileMedia(client, {
    ...input,
    mediaKind: 'avatar'
  });
}

export async function uploadProgramThumbnail(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
  }
) {
  return uploadOwnedMedia(client, {
    userId: input.userId,
    fileData: input.fileData,
    contentType: input.contentType,
    fileExtension: input.fileExtension,
    bucketId: 'program-media',
    objectPrefix: 'thumbnail'
  });
}

export async function uploadProfilePageAsset(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
    assetKind: 'video' | 'thumbnail';
  }
) {
  return uploadOwnedMedia(client, {
    userId: input.userId,
    fileData: input.fileData,
    contentType: input.contentType,
    fileExtension: input.fileExtension,
    bucketId: 'program-media',
    objectPrefix: input.assetKind === 'video' ? 'profile-video' : 'profile-thumbnail'
  });
}

export async function uploadProgramLessonAsset(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
  }
) {
  return uploadOwnedMedia(client, {
    userId: input.userId,
    fileData: input.fileData,
    contentType: input.contentType,
    fileExtension: input.fileExtension,
    bucketId: 'program-media',
    objectPrefix: 'lesson-asset'
  });
}

export async function uploadProgramLessonVideo(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    fileData: ArrayBuffer;
    contentType: string;
    fileExtension?: string;
  }
) {
  return uploadProgramLessonAsset(client, input);
}

export async function createProfilePost(
  client: SyncrollySupabaseClient,
  input: {
    userId: string;
    body: string;
    imageUrl?: string;
  }
) {
  const trimmedBody = input.body.trim();

  if (!trimmedBody && !input.imageUrl) {
    throw new Error('Write something or attach an image before posting.');
  }

  const { data, error } = await client
    .from('profile_posts')
    .insert({
      user_id: input.userId,
      body: trimmedBody,
      image_url: input.imageUrl ?? null
    })
    .select('*')
    .single();

  if (error) throw error;

  return data;
}

export async function listProfilePosts(
  client: SyncrollySupabaseClient,
  userId: string,
  options?: {
    authorProfile?: Pick<ViewerProfile, 'id' | 'displayName' | 'avatarUrl'>;
    viewerId?: string;
  }
) {
  const { data: posts, error: postsError } = await client
    .from('profile_posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (postsError) throw postsError;

  const postIds = (posts ?? []).map((post) => post.id);
  const { data: likeRows, error: likeRowsError } = postIds.length
    ? await client.from('profile_post_likes').select('*').in('post_id', postIds)
    : { data: [] as ProfilePostLikeRow[], error: null };

  if (options?.authorProfile) {
    return mapPostsForAuthor(posts ?? [], {
      id: options.authorProfile.id,
      displayName: options.authorProfile.displayName,
      avatarUrl: options.authorProfile.avatarUrl
    }, {
      likeRows: likeRowsError ? [] : likeRows ?? [],
      viewerId: options.viewerId
    });
  }

  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return [];

  return mapPostsForAuthor(posts ?? [], {
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined
  }, {
    likeRows: likeRowsError ? [] : likeRows ?? [],
    viewerId: options?.viewerId
  });
}

export async function toggleProfilePostLike(
  client: SyncrollySupabaseClient,
  input: {
    postId: string;
    userId: string;
  }
) {
  const { data: existingLike, error: existingLikeError } = await client
    .from('profile_post_likes')
    .select('*')
    .eq('post_id', input.postId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingLikeError) throw existingLikeError;

  if (existingLike) {
    const { error: deleteError } = await client
      .from('profile_post_likes')
      .delete()
      .eq('post_id', input.postId)
      .eq('user_id', input.userId);

    if (deleteError) throw deleteError;

    return { liked: false };
  }

  const { error: insertError } = await client
    .from('profile_post_likes')
    .insert({
      post_id: input.postId,
      user_id: input.userId
    });

  if (insertError) throw insertError;

  return { liked: true };
}

export async function getInstagramAccountConnection(
  client: SyncrollySupabaseClient,
  creatorId: string
): Promise<InstagramAccountConnection | null> {
  const { data, error } = await client
    .from('instagram_account_connections')
    .select('*')
    .eq('creator_id', creatorId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapInstagramAccountConnection(data);
}

export async function listInstagramLeads(
  client: SyncrollySupabaseClient,
  creatorId: string
): Promise<InstagramLeadSummary[]> {
  const { data, error } = await client
    .from('instagram_leads')
    .select('*')
    .eq('creator_id', creatorId)
    .order('last_message_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapInstagramLeadSummary);
}

export async function getInstagramLeadDetail(
  client: SyncrollySupabaseClient,
  creatorId: string,
  leadId: string
): Promise<InstagramLeadDetail | null> {
  const { data: lead, error: leadError } = await client
    .from('instagram_leads')
    .select('*')
    .eq('id', leadId)
    .eq('creator_id', creatorId)
    .maybeSingle();

  if (leadError) throw leadError;
  if (!lead) return null;

  const { data: messages, error: messagesError } = await client
    .from('instagram_lead_messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: true });

  if (messagesError) throw messagesError;

  const mappedMessages = (messages ?? []).map(mapInstagramLeadMessage);

  if (!mappedMessages.length && lead.last_message_text.trim()) {
    mappedMessages.push({
      id: `lead-last-message-${lead.id}`,
      leadId: lead.id,
      connectionId: lead.connection_id,
      direction: 'inbound',
      messageType: 'text',
      textBody: lead.last_message_text,
      sentAt: lead.last_message_at,
      createdAt: lead.updated_at
    });
  }

  return {
    ...mapInstagramLeadSummary(lead),
    messages: mappedMessages
  };
}

export async function markInstagramLeadRead(
  client: SyncrollySupabaseClient,
  creatorId: string,
  leadId: string
) {
  const { error } = await client
    .from('instagram_leads')
    .update({
      unread_count: 0
    })
    .eq('id', leadId)
    .eq('creator_id', creatorId);

  if (error) throw error;
}

export async function updateInstagramLeadStatus(
  client: SyncrollySupabaseClient,
  creatorId: string,
  leadId: string,
  nextStatus: InstagramLeadStatus
) {
  const { error } = await client
    .from('instagram_leads')
    .update({
      lead_status: nextStatus
    })
    .eq('id', leadId)
    .eq('creator_id', creatorId);

  if (error) throw error;
}

export async function startInstagramOAuth(
  client: SyncrollySupabaseClient,
  input: {
    redirectUri: string;
  }
): Promise<string> {
  const { data, error } = await client.functions.invoke<{ connectUrl?: string }>('instagram-oauth-start', {
    body: {
      redirectUri: input.redirectUri
    }
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const message = await getFunctionErrorMessage(error);
      throw new Error(message ?? 'Instagram connect failed.');
    }

    if (error instanceof FunctionsRelayError) {
      throw new Error('Supabase could not reach the Instagram connect function.');
    }

    if (error instanceof FunctionsFetchError) {
      throw new Error('The app could not reach the Instagram connect function.');
    }

    throw error;
  }

  const connectUrl = typeof data?.connectUrl === 'string' ? data.connectUrl : null;

  if (!connectUrl) {
    throw new Error('Instagram connect URL was not returned.');
  }

  return connectUrl;
}

export async function sendInstagramButtonReply(
  client: SyncrollySupabaseClient,
  input: SendInstagramButtonReplyInput
): Promise<InstagramLeadMessage> {
  const { data, error } = await client.functions.invoke<{ message?: InstagramLeadMessageRow }>('instagram-send-button-reply', {
    body: {
      leadId: input.leadId,
      text: input.text ?? '',
      buttonTitle: input.buttonTitle,
      buttonUrl: input.buttonUrl
    }
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const message = await getFunctionErrorMessage(error);
      throw new Error(message ?? 'Instagram reply failed.');
    }

    if (error instanceof FunctionsRelayError) {
      throw new Error('Supabase could not reach the Instagram reply function.');
    }

    if (error instanceof FunctionsFetchError) {
      throw new Error('The app could not reach the Instagram reply function.');
    }

    throw error;
  }

  if (!data?.message) {
    throw new Error('Instagram reply was sent, but no saved message was returned.');
  }

  return mapInstagramLeadMessage(data.message);
}

async function loadProgramsForViewer(
  client: SyncrollySupabaseClient,
  viewerId: string,
  role: 'creator' | 'supporter'
) {
  if (role === 'creator') {
    const { data, error } = await client.from('programs').select('*').eq('creator_id', viewerId).order('created_at', {
      ascending: false
    });

    if (error) throw error;

    return data ?? [];
  }

  const { data: enrollments, error: enrollmentError } = await client
    .from('program_enrollments')
    .select('*')
    .eq('student_id', viewerId)
    .order('created_at', { ascending: false });

  if (enrollmentError) throw enrollmentError;
  if (!enrollments?.length) return [];

  const programIds = enrollments.map((enrollment) => enrollment.program_id);
  const { data: programs, error: programsError } = await client.from('programs').select('*').in('id', programIds);

  if (programsError) throw programsError;

  return programs ?? [];
}

async function loadProgramSupportRows(
  client: SyncrollySupabaseClient,
  programs: ProgramRow[],
  viewerId: string,
  role: 'creator' | 'supporter'
) {
  if (!programs.length) {
    return {
      creatorProfiles: [] as ProfileRow[],
      lessons: [] as ProgramLessonRow[],
      enrollments: [] as ProgramEnrollmentRow[],
      progressRows: [] as LessonProgressRow[]
    };
  }

  const programIds = programs.map((program) => program.id);

  const [
    { data: creatorProfiles, error: creatorProfilesError },
    { data: lessons, error: lessonsError },
    { data: enrollments, error: enrollmentsError }
  ] = await Promise.all([
    client.from('profiles').select('*').in('id', unique(programs.map((program) => program.creator_id))),
    client.from('program_lessons').select('*').in('program_id', programIds).order('position', { ascending: true }),
    client.from('program_enrollments').select('*').in('program_id', programIds)
  ]);

  if (creatorProfilesError) throw creatorProfilesError;
  if (lessonsError) throw lessonsError;
  if (enrollmentsError) throw enrollmentsError;

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: progressRows, error: progressError } =
    role === 'supporter' && lessonIds.length
      ? await client.from('lesson_progress').select('*').eq('student_id', viewerId).in('lesson_id', lessonIds)
      : { data: [] as LessonProgressRow[], error: null };

  if (progressError) throw progressError;

  return {
    creatorProfiles: creatorProfiles ?? [],
    lessons: lessons ?? [],
    enrollments: enrollments ?? [],
    progressRows: progressRows ?? []
  };
}

export async function listPrograms(
  client: SyncrollySupabaseClient,
  viewerId: string,
  role: 'creator' | 'supporter'
): Promise<ProgramSummary[]> {
  const programs = await loadProgramsForViewer(client, viewerId, role);
  const supportRows = await loadProgramSupportRows(client, programs, viewerId, role);

  return mapProgramSummaryRows({
    programs,
    creatorProfiles: supportRows.creatorProfiles,
    lessons: supportRows.lessons,
    enrollments: supportRows.enrollments,
    progressRows: supportRows.progressRows,
    role
  });
}

export async function getProgramDetails(
  client: SyncrollySupabaseClient,
  viewerId: string,
  role: 'creator' | 'supporter',
  programId: string
): Promise<ProgramDetail | null> {
  const { data: program, error: programError } = await client.from('programs').select('*').eq('id', programId).maybeSingle();

  if (programError) throw programError;
  if (!program) return null;

  const supportRows = await loadProgramSupportRows(client, [program], viewerId, role);
  const summary = mapProgramSummaryRows({
    programs: [program],
    creatorProfiles: supportRows.creatorProfiles,
    lessons: supportRows.lessons,
    enrollments: supportRows.enrollments,
    progressRows: supportRows.progressRows,
    role
  })[0];

  const progressByLessonId = new Map(supportRows.progressRows.map((progress) => [progress.lesson_id, progress]));
  const programLessons = supportRows.lessons
    .filter((lesson) => lesson.program_id === program.id)
    .sort((left, right) => left.position - right.position);
  const programEnrollments = supportRows.enrollments.filter((enrollment) => enrollment.program_id === program.id);
  const learnerIds = unique(programEnrollments.map((enrollment) => enrollment.student_id));
  const { data: learnerProfiles, error: learnerProfilesError } =
    role === 'creator' && learnerIds.length
      ? await client.from('profiles').select('*').in('id', learnerIds)
      : { data: [] as ProfileRow[], error: null };

  if (learnerProfilesError) throw learnerProfilesError;

  const { data: learnerProgressRows, error: learnerProgressError } =
    role === 'creator' && learnerIds.length && programLessons.length
      ? await client.from('lesson_progress').select('*').in('student_id', learnerIds).in('lesson_id', programLessons.map((lesson) => lesson.id))
      : { data: [] as LessonProgressRow[], error: null };

  if (learnerProgressError) throw learnerProgressError;

  return {
    ...summary,
    lessons: mapProgramLessons(programLessons, progressByLessonId),
    learners:
      role === 'creator'
        ? mapProgramLearners({
            enrollments: programEnrollments,
            profiles: learnerProfiles ?? [],
            lessons: programLessons,
            progressRows: learnerProgressRows ?? []
          })
        : []
  };
}

export async function createProgram(
  client: SyncrollySupabaseClient,
  input: CreateProgramInput
): Promise<ProgramDetail> {
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle) {
    throw new Error('Program title is required.');
  }

  const { data, error } = await client
    .from('programs')
    .insert({
      creator_id: input.creatorId,
      title: trimmedTitle,
      subtitle: input.subtitle?.trim() ?? '',
      description: input.description?.trim() ?? '',
      thumbnail_url: input.thumbnailUrl ?? null
    })
    .select('*')
    .single();

  if (error) throw error;

  return requireData(
    await getProgramDetails(client, input.creatorId, 'creator', data.id),
    'Program could not be reloaded after saving.'
  );
}

export async function updateProgram(
  client: SyncrollySupabaseClient,
  input: UpdateProgramInput
): Promise<ProgramDetail> {
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle) {
    throw new Error('Program title is required.');
  }

  const { error } = await client
    .from('programs')
    .update({
      title: trimmedTitle,
      subtitle: input.subtitle?.trim() ?? '',
      description: input.description?.trim() ?? '',
      thumbnail_url: input.thumbnailUrl ?? null
    })
    .eq('id', input.programId)
    .eq('creator_id', input.creatorId);

  if (error) throw error;

  return requireData(
    await getProgramDetails(client, input.creatorId, 'creator', input.programId),
    'Program could not be reloaded after saving.'
  );
}

export async function createProgramLesson(
  client: SyncrollySupabaseClient,
  input: CreateProgramLessonInput
): Promise<ProgramLesson> {
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle) {
    throw new Error('Lesson title is required.');
  }

  const { data: latestLesson, error: latestLessonError } = await client
    .from('program_lessons')
    .select('position')
    .eq('program_id', input.programId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestLessonError) throw latestLessonError;

  const nextPosition = (latestLesson?.position ?? 0) + 1;
  const { data, error } = await client
    .from('program_lessons')
    .insert({
      program_id: input.programId,
      title: trimmedTitle,
      summary: input.summary?.trim() ?? '',
      video_url: input.videoUrl?.trim() || null,
      duration_label: input.durationLabel?.trim() || null,
      position: nextPosition
    })
    .select('*')
    .single();

  if (error) throw error;

  return mapProgramLessons([data], new Map())[0];
}

export async function updateProgramLesson(
  client: SyncrollySupabaseClient,
  input: {
    lessonId: string;
    title: string;
    summary?: string;
    videoUrl?: string;
    durationLabel?: string;
  }
): Promise<ProgramLesson> {
  const trimmedTitle = input.title.trim();

  if (!trimmedTitle) {
    throw new Error('Lesson title is required.');
  }

  const { data, error } = await client
    .from('program_lessons')
    .update({
      title: trimmedTitle,
      summary: input.summary?.trim() ?? '',
      video_url: input.videoUrl?.trim() || null,
      duration_label: input.durationLabel?.trim() || null
    })
    .eq('id', input.lessonId)
    .select('*')
    .single();

  if (error) throw error;

  return mapProgramLessons([data], new Map())[0];
}

export async function deleteProgramLesson(
  client: SyncrollySupabaseClient,
  input: {
    lessonId: string;
  }
) {
  const { error } = await client.from('program_lessons').delete().eq('id', input.lessonId);

  if (error) throw error;
}

export async function reorderProgramLesson(
  client: SyncrollySupabaseClient,
  input: {
    lessonId: string;
    swapLessonId: string;
    currentPosition: number;
    targetPosition: number;
  }
) {
  const temporaryPosition = Math.max(input.currentPosition, input.targetPosition) + 1000;

  const { error: moveOutError } = await client
    .from('program_lessons')
    .update({ position: temporaryPosition })
    .eq('id', input.lessonId);

  if (moveOutError) throw moveOutError;

  const { error: swapError } = await client
    .from('program_lessons')
    .update({ position: input.currentPosition })
    .eq('id', input.swapLessonId);

  if (swapError) throw swapError;

  const { error: moveBackError } = await client
    .from('program_lessons')
    .update({ position: input.targetPosition })
    .eq('id', input.lessonId);

  if (moveBackError) throw moveBackError;
}

export async function enrollStudentInProgram(
  client: SyncrollySupabaseClient,
  input: EnrollStudentInProgramInput
) {
  const { data, error } = await client
    .from('program_enrollments')
    .insert({
      program_id: input.programId,
      student_id: input.studentId
    })
    .select('*')
    .single();

  if (error) throw error;

  return data;
}

export async function removeStudentFromProgram(
  client: SyncrollySupabaseClient,
  input: {
    enrollmentId: string;
  }
) {
  const { error } = await client.from('program_enrollments').delete().eq('id', input.enrollmentId);

  if (error) throw error;
}

export async function markProgramLessonComplete(
  client: SyncrollySupabaseClient,
  input: MarkProgramLessonCompleteInput
) {
  const { data, error } = await client.rpc('record_lesson_progress', {
    target_lesson_id: input.lessonId,
    target_completed_at: new Date().toISOString()
  });

  if (error) throw error;

  return data;
}

export async function saveProgramLessonProgress(
  client: SyncrollySupabaseClient,
  input: SaveProgramLessonProgressInput
) {
  const { data, error } = await client.rpc('save_lesson_progress', {
    target_lesson_id: input.lessonId,
    target_progress_percent: input.progressPercent,
    target_last_position_seconds: input.lastPositionSeconds,
    mark_complete: input.progressPercent >= 100
  });

  if (error) throw error;

  return data;
}

async function loadInquiryFormByRow(
  client: SyncrollySupabaseClient,
  form: InquiryFormRow
): Promise<InquiryForm> {
  const { data: questions, error: questionsError } = await client
    .from('inquiry_form_questions')
    .select('*')
    .eq('form_id', form.id)
    .order('position', { ascending: true });

  if (questionsError) throw questionsError;

  const questionIds = (questions ?? []).map((question) => question.id);

  const { data: options, error: optionsError } = questionIds.length
    ? await client
        .from('inquiry_form_question_options')
        .select('*')
        .in('question_id', questionIds)
        .order('position', { ascending: true })
    : { data: [] as InquiryFormQuestionOptionRow[], error: null };

  if (optionsError) throw optionsError;

  return mapInquiryForm(form, questions ?? [], options ?? []);
}

export async function getCreatorInquiryForm(
  client: SyncrollySupabaseClient,
  creatorId: string
): Promise<InquiryForm | null> {
  const { data: form, error } = await client
    .from('inquiry_forms')
    .select('*')
    .eq('creator_id', creatorId)
    .maybeSingle();

  if (error) throw error;
  if (!form) return null;

  return loadInquiryFormByRow(client, form);
}

export async function saveCreatorInquiryForm(
  client: SyncrollySupabaseClient,
  input: SaveInquiryFormInput
): Promise<InquiryForm> {
  const { error } = await client.rpc('save_inquiry_form', {
    form_title: input.title.trim(),
    form_intro: input.intro.trim(),
    form_questions: mapDraftQuestionsForRpc(input.questions)
  });

  if (error) throw error;

  return requireData(
    await getCreatorInquiryForm(client, input.creatorId),
    'Inquiry form could not be reloaded after saving.'
  );
}

export async function submitInquiryForm(
  client: SyncrollySupabaseClient,
  input: SubmitInquiryFormInput
): Promise<string> {
  const { data, error } = await client.rpc('submit_inquiry_form', {
    target_form_id: input.formId,
    submission_answers: input.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId ?? null,
      answerText: answer.answerText ?? ''
    }))
  });

  if (error) throw error;

  return data;
}

export async function listCreatorInquiryFormSubmissions(
  client: SyncrollySupabaseClient,
  creatorId: string,
  options?: {
    status?: InquiryFormSubmission['status'];
  }
): Promise<InquiryFormSubmission[]> {
  let submissionsQuery = client
    .from('inquiry_form_submissions')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });

  if (options?.status) {
    submissionsQuery = submissionsQuery.eq('status', options.status);
  }

  const { data: submissions, error: submissionsError } = await submissionsQuery;

  if (submissionsError) throw submissionsError;
  if (!submissions?.length) return [];

  const submissionIds = submissions.map((submission) => submission.id);
  const { data: answers, error: answersError } = await client
    .from('inquiry_form_answers')
    .select('*')
    .in('submission_id', submissionIds);

  if (answersError) throw answersError;

  const questionIds = unique((answers ?? []).map((answer) => answer.question_id));

  const { data: questions, error: questionsError } = questionIds.length
    ? await client.from('inquiry_form_questions').select('*').in('id', questionIds)
    : { data: [] as InquiryFormQuestionRow[], error: null };

  if (questionsError) throw questionsError;

  const questionById = new Map((questions ?? []).map((question) => [question.id, question]));
  const answersBySubmissionId = new Map<string, InquiryFormAnswerRow[]>();

  for (const answer of answers ?? []) {
    const current = answersBySubmissionId.get(answer.submission_id) ?? [];
    current.push(answer);
    answersBySubmissionId.set(answer.submission_id, current);
  }

  return submissions.map((submission) => {
    const submissionAnswers = [...(answersBySubmissionId.get(submission.id) ?? [])]
      .sort((left, right) => {
        const leftQuestion = questionById.get(left.question_id);
        const rightQuestion = questionById.get(right.question_id);
        return (leftQuestion?.position ?? 0) - (rightQuestion?.position ?? 0);
      })
      .map<InquiryFormSubmissionAnswer>((answer) => {
        const question = questionById.get(answer.question_id);

        return {
          id: answer.id,
          questionId: answer.question_id,
          questionPrompt: question?.prompt ?? 'Question',
          questionType: question?.type ?? 'short_text',
          selectedOptionId: answer.selected_option_id ?? undefined,
          answerText: answer.answer_text
        };
      });

    return {
      id: submission.id,
      formId: submission.form_id,
      creatorId: submission.creator_id,
      supporterId: submission.supporter_id,
      supporterName: submission.supporter_display_name ?? 'Syncrolly user',
      supporterAvatarUrl: submission.supporter_avatar_url ?? undefined,
      createdAt: submission.created_at,
      status: submission.status,
      conversationId: submission.conversation_id ?? undefined,
      answers: submissionAnswers
    };
  });
}

export async function getCreatorSupporterOverview(
  client: SyncrollySupabaseClient,
  creatorId: string,
  supporterId: string
): Promise<CreatorSupporterOverview | null> {
  const [submissions, scheduledCalls, creatorPrograms] = await Promise.all([
    listCreatorInquiryFormSubmissions(client, creatorId),
    listScheduledCalls(client, creatorId),
    listPrograms(client, creatorId, 'creator')
  ]);

  const supporterSubmissions = submissions.filter((submission) => submission.supporterId === supporterId);

  if (!supporterSubmissions.length) {
    return null;
  }

  const supporterCalls = scheduledCalls
    .filter((call) => call.attendeeProfileId === supporterId || call.counterpartProfileId === supporterId)
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());
  const { data: supporterProfile, error: supporterProfileError } = await client
    .from('profiles')
    .select('*')
    .eq('id', supporterId)
    .maybeSingle();

  if (supporterProfileError) throw supporterProfileError;

  const programDetails = await Promise.all(
    creatorPrograms
      .filter((program) => program.enrolledCount > 0)
      .map((program) => getProgramDetails(client, creatorId, 'creator', program.id))
  );

  const latestSubmission = supporterSubmissions[0] ?? null;
  const enrolledPrograms = mapCreatorSupporterProgramSnapshots(
    programDetails.filter((program): program is ProgramDetail => Boolean(program)),
    supporterId
  );

  if (!latestSubmission && !supporterProfile && !supporterCalls.length && !enrolledPrograms.length) {
    return null;
  }

  const latestStatus = latestSubmission
    ? latestSubmission.status
    : enrolledPrograms.length
      ? 'enrolled'
      : supporterCalls.length
        ? 'booked'
        : 'opened';

  return {
    supporterId,
    supporterName: latestSubmission?.supporterName ?? supporterProfile?.display_name ?? 'Syncrolly user',
    supporterAvatarUrl: latestSubmission?.supporterAvatarUrl ?? supporterProfile?.avatar_url ?? undefined,
    latestStatus,
    conversationId: latestSubmission?.conversationId ?? supporterCalls[0]?.conversationId,
    submissions: supporterSubmissions,
    scheduledCalls: supporterCalls,
    creatorPrograms,
    enrolledPrograms
  };
}

export async function openInquirySubmissionConversation(
  client: SyncrollySupabaseClient,
  input: {
    submissionId: string;
  }
): Promise<string> {
  const { data, error } = await client.rpc('open_inquiry_submission_conversation', {
    submission_uuid: input.submissionId
  });

  if (error) throw error;

  return data;
}

export async function updateInquirySubmissionStatus(
  client: SyncrollySupabaseClient,
  input: {
    submissionId: string;
    status: InquiryFormSubmission['status'];
  }
) {
  const { data, error } = await client.rpc('update_inquiry_submission_status', {
    submission_uuid: input.submissionId,
    next_status: input.status
  });

  if (error) throw error;

  return data;
}

export async function deleteInquirySubmission(
  client: SyncrollySupabaseClient,
  input: {
    submissionId: string;
  }
) {
  const { data, error } = await client.rpc('delete_inquiry_submission', {
    submission_uuid: input.submissionId
  });

  if (error) throw error;

  return data;
}

export async function registerPushDevice(
  client: SyncrollySupabaseClient,
  input: {
    expoPushToken: string;
    platform: 'ios' | 'android' | 'web' | 'unknown';
    deviceName?: string;
    deviceModel?: string;
  }
) {
  const { data, error } = await client.rpc('register_push_device', {
    expo_push_token: input.expoPushToken,
    device_platform: input.platform,
    device_name: input.deviceName ?? undefined,
    device_model: input.deviceModel ?? undefined
  });

  if (error) throw error;

  return data;
}

export async function unregisterPushDevice(
  client: SyncrollySupabaseClient,
  input: {
    expoPushToken: string;
  }
) {
  const { error } = await client.rpc('unregister_push_device', {
    expo_push_token: input.expoPushToken
  });

  if (error) throw error;
}

export async function requestVoiceAssistantTurn(
  client: SyncrollySupabaseClient,
  input: VoiceAssistantTurnInput
): Promise<VoiceAssistantTurn> {
  const { data, error } = await client.functions.invoke<VoiceAssistantTurn>('voice-assistant', {
    body: {
      audioBase64: input.audioBase64,
      audioMimeType: input.audioMimeType,
      fileName: input.fileName
    }
  });

  if (error) {
    const functionErrorMessage = await getFunctionErrorMessage(error);

    if (functionErrorMessage) {
      throw new Error(functionErrorMessage);
    }

    throw error;
  }

  return requireData(data, 'The voice assistant did not return a response.');
}
