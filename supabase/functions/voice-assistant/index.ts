import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

type ThreadStatus = 'active' | 'request' | 'flagged';
type UserRole = 'creator' | 'supporter';
type FormQuestionType = 'multiple_choice' | 'short_text' | 'long_text';
type InquiryFormSubmissionStatus = 'pending' | 'opened';

type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: UserRole;
        };
      };
      inquiry_forms: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          intro: string;
          created_at: string;
          updated_at: string;
        };
      };
      inquiry_form_questions: {
        Row: {
          id: string;
          form_id: string;
          position: number;
          type: FormQuestionType;
          prompt: string;
          placeholder: string;
          created_at: string;
          updated_at: string;
        };
      };
      inquiry_form_submissions: {
        Row: {
          id: string;
          form_id: string;
          creator_id: string;
          supporter_id: string;
          supporter_display_name: string | null;
          supporter_avatar_url: string | null;
          status: InquiryFormSubmissionStatus;
          conversation_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      inquiry_form_answers: {
        Row: {
          id: string;
          submission_id: string;
          question_id: string;
          selected_option_id: string | null;
          answer_text: string;
          created_at: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          subject: string;
          status: ThreadStatus;
          last_message_at: string | null;
          created_at: string;
        };
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          user_id: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
      };
    };
  };
};

type AdminClient = SupabaseClient<Database>;

type VoiceAssistantPayload = {
  audioBase64?: string;
  audioMimeType?: string;
  fileName?: string;
};

type TranscriptionResponse = {
  text?: string;
};

type OpenAiResponseOutputItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: OpenAiResponseOutputItem[];
};

type RecentConversationSummary = {
  conversationId: string;
  participantName: string;
  participantRole: UserRole | 'unknown';
  status: ThreadStatus;
  subject: string;
  lastMessageAt: string | null;
  messages: Array<{
    senderName: string;
    senderRole: UserRole | 'unknown';
    text: string;
    createdAt: string;
  }>;
};

type ConversationThreadDetail = {
  conversationId: string;
  participantName: string;
  participantRole: UserRole | 'unknown';
  status: ThreadStatus;
  subject: string;
  messages: Array<{
    senderName: string;
    senderRole: UserRole | 'unknown';
    text: string;
    createdAt: string;
  }>;
};

type InquiryFormSubmissionSummary = {
  submissionId: string;
  formId: string;
  formTitle: string;
  supporterId: string;
  supporterName: string;
  status: InquiryFormSubmissionStatus;
  submittedAt: string;
  conversationId: string | null;
  answers: Array<{
    questionPrompt: string;
    answerText: string;
  }>;
};

type InquiryFormSubmissionDetail = InquiryFormSubmissionSummary & {
  updatedAt: string;
  formIntro: string;
};

type ToolCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const INQUIRY_SUBMISSION_MESSAGE_PREFIX = '__SYNCROLLY_INQUIRY_SUBMISSION__';

const conversationTools = [
  {
    type: 'function',
    name: 'get_recent_conversations',
    description:
      "Load the user's most recent conversations with participant names and a small set of latest messages. Use this when the user asks what people have been asking lately, wants an inbox summary, asks who needs a reply, or references recent conversations generally.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10
        },
        messages_per_conversation: {
          type: 'integer',
          minimum: 1,
          maximum: 8
        }
      },
      additionalProperties: false,
      required: ['limit', 'messages_per_conversation']
    }
  },
  {
    type: 'function',
    name: 'search_conversations',
    description:
      'Search recent conversations by participant name, subject, or message text. Use this when the user asks about a specific person, topic, keyword, or campaign inside their inbox.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 8
        },
        messages_per_conversation: {
          type: 'integer',
          minimum: 1,
          maximum: 8
        }
      },
      additionalProperties: false,
      required: ['query', 'limit', 'messages_per_conversation']
    }
  },
  {
    type: 'function',
    name: 'get_thread_messages',
    description:
      'Load more messages from a specific conversation after you already know its conversationId. Use this when the user asks for a deeper summary of one thread.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20
        }
      },
      additionalProperties: false,
      required: ['conversation_id', 'limit']
    }
  }
] as const;

const formSubmissionTools = [
  {
    type: 'function',
    name: 'get_recent_form_submissions',
    description:
      "Load the creator's most recent inquiry form submissions with supporter names and a small set of answers. Use this when the user asks about pending forms, recent inquiries, monetization leads, coaching requests, brand opportunities, or what supporters have been asking through forms.",
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10
        },
        answers_per_submission: {
          type: 'integer',
          minimum: 1,
          maximum: 6
        },
        status_filter: {
          type: 'string',
          enum: ['pending', 'opened', 'all']
        }
      },
      additionalProperties: false,
      required: ['limit', 'answers_per_submission', 'status_filter']
    }
  },
  {
    type: 'function',
    name: 'search_form_submissions',
    description:
      'Search inquiry form submissions by supporter name, form title, question prompt, or answer text. Use this when the user asks about a specific lead, topic, offer, budget, coaching request, or brand inquiry from forms.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 8
        },
        answers_per_submission: {
          type: 'integer',
          minimum: 1,
          maximum: 6
        },
        status_filter: {
          type: 'string',
          enum: ['pending', 'opened', 'all']
        }
      },
      additionalProperties: false,
      required: ['query', 'limit', 'answers_per_submission', 'status_filter']
    }
  },
  {
    type: 'function',
    name: 'get_form_submission_details',
    description:
      'Load the full answers for a specific inquiry form submission after you already know its submissionId. Use this when the user asks for a deeper summary of one lead or wants the exact answers from a specific form.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        submission_id: {
          type: 'string'
        }
      },
      additionalProperties: false,
      required: ['submission_id']
    }
  }
] as const;

const assistantTools = [...conversationTools, ...formSubmissionTools] as const;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function getBase64Bytes(base64Value: string): Uint8Array {
  const sanitizedBase64 = base64Value.includes(',') ? base64Value.split(',').pop() ?? '' : base64Value;
  const binaryString = atob(sanitizedBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binaryString += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binaryString);
}

function normalizeFileName(fileName: string | undefined, mimeType: string | undefined): string {
  const trimmed = fileName?.trim();

  if (trimmed) {
    return trimmed;
  }

  if (mimeType === 'audio/wav') {
    return 'voice-note.wav';
  }

  if (mimeType === 'audio/webm') {
    return 'voice-note.webm';
  }

  return 'voice-note.m4a';
}

function buildAssistantPrompt(profile: Database['public']['Tables']['profiles']['Row'] | null) {
  const roleContext =
    profile?.role === 'creator'
      ? 'The user is a social media creator using Syncrolly to monetize their following through premium conversations, paid content, coaching, teaching, subscriptions, collaborations, and digital offers.'
      : 'The user is a supporter using Syncrolly to reach creators professionally and clearly.';

  const nameContext = profile?.display_name?.trim()
    ? `The current user is ${profile.display_name.trim()}.`
    : 'The current user is using Syncrolly.';

  return [
    'You are Syncrolly AI, a concise voice assistant inside a creator messaging app.',
    nameContext,
    roleContext,
    'The user is authenticated inside their own account and has authorized you to access their own conversations and form submissions through the provided tools.',
    'If a relevant inbox or form tool is available, use it instead of saying you cannot access private or personal information.',
    'Be warm, practical, and direct.',
    'Prefer 2 to 4 short sentences.',
    'Focus on messaging, creator business, monetization, content ideas, audience communication, coaching, and professional follow-up.',
    'When the user is a creator, think like an inbox, sales, and relationship copilot.',
    'Prioritize lead quality, urgency, monetization intent, next steps, and who deserves a reply first.',
    'Do not use markdown, bullet points, or long disclaimers.',
    'If the user asks about their inbox, recent conversations, what people are asking, who to reply to, a specific participant, or message patterns, call the appropriate conversation tool before answering.',
    'If the user asks about inquiry forms, pending submissions, creator leads, supporter requests, or monetization opportunities from forms, call the appropriate form tool before answering.',
    'Do not pretend to know inbox details without tool results.',
    'Do not pretend to know form submission details without tool results.',
    'After using tools, synthesize the results naturally instead of reading raw data back.'
  ].join(' ');
}

function shouldPrefetchConversationContext(transcript: string) {
  const normalized = transcript.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return [
    'inbox',
    'message',
    'messages',
    'dm',
    'dms',
    'conversation',
    'conversations',
    'thread',
    'threads',
    'reply',
    'replies',
    'who messaged',
    'who reached out',
    'recent conversation',
    'recent message',
    'people asking'
  ].some((keyword) => normalized.includes(keyword));
}

function shouldPrefetchFormContext(transcript: string) {
  const normalized = transcript.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return [
    'form',
    'forms',
    'submission',
    'submissions',
    'inquiry',
    'inquiries',
    'lead',
    'leads',
    'application',
    'applications',
    'brand deal',
    'coaching request',
    'budget',
    'filled out'
  ].some((keyword) => normalized.includes(keyword));
}

function buildPrefetchedContextPrompt(
  sections: Array<{
    label: string;
    payload: unknown;
  }>
) {
  if (!sections.length) {
    return null;
  }

  return [
    'Authenticated creator inbox context is included below.',
    'Use it naturally in your answer instead of claiming you cannot access private messages or submissions.',
    ...sections.map((section) => `${section.label}: ${JSON.stringify(section.payload)}`)
  ].join(' ');
}

function parseInquirySubmissionMessage(body: string) {
  if (!body.startsWith(INQUIRY_SUBMISSION_MESSAGE_PREFIX)) {
    return null;
  }

  const payloadText = body.slice(INQUIRY_SUBMISSION_MESSAGE_PREFIX.length);

  try {
    const parsed = JSON.parse(payloadText) as {
      formTitle?: unknown;
      supporterName?: unknown;
      answers?: unknown;
    };

    if (typeof parsed.formTitle !== 'string' || typeof parsed.supporterName !== 'string') {
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
          .filter(
            (
              answer
            ): answer is {
              questionPrompt: string;
              answerText: string;
            } => answer !== null
          )
      : [];

    return {
      formTitle: parsed.formTitle,
      supporterName: parsed.supporterName,
      answers
    };
  } catch {
    return null;
  }
}

function formatMessageTextForAssistant(body: string): string {
  const inquirySubmission = parseInquirySubmissionMessage(body);

  if (!inquirySubmission) {
    return body;
  }

  const answerSummary = inquirySubmission.answers
    .slice(0, 3)
    .map((answer) => `${answer.questionPrompt}: ${answer.answerText}`)
    .join(' | ');

  if (!answerSummary) {
    return `${inquirySubmission.supporterName} submitted the ${inquirySubmission.formTitle} inquiry form.`;
  }

  return `${inquirySubmission.supporterName} submitted the ${inquirySubmission.formTitle} inquiry form. ${answerSummary}`;
}

function extractResponseText(response: ResponsesApiResponse): string {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const outputItem of response.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === 'output_text' && typeof contentItem.text === 'string' && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  return '';
}

async function parseError(response: Response): Promise<string> {
  const fallback = `Upstream request failed with status ${response.status}.`;

  try {
    const json = (await response.json()) as { error?: { message?: string }; message?: string };
    return json.error?.message ?? json.message ?? fallback;
  } catch {
    return fallback;
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const nextValue =
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;

  return Math.min(max, Math.max(min, nextValue));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sortConversationsByRecentActivity(
  conversations: Database['public']['Tables']['conversations']['Row'][]
) {
  return [...conversations].sort((left, right) => {
    const leftTime = left.last_message_at ?? left.created_at;
    const rightTime = right.last_message_at ?? right.created_at;
    return new Date(rightTime).getTime() - new Date(leftTime).getTime();
  });
}

function sortMessagesAscending(messages: Database['public']['Tables']['messages']['Row'][]) {
  return [...messages].sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

function sortFormAnswersByQuestionPosition(
  answers: Database['public']['Tables']['inquiry_form_answers']['Row'][],
  questionsById: Map<string, Database['public']['Tables']['inquiry_form_questions']['Row']>
) {
  return [...answers].sort((left, right) => {
    const leftPosition = questionsById.get(left.question_id)?.position ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = questionsById.get(right.question_id)?.position ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function normalizeStatusFilter(value: unknown): InquiryFormSubmissionStatus | 'all' {
  return value === 'pending' || value === 'opened' || value === 'all' ? value : 'all';
}

async function getViewerMembershipConversationIds(
  adminClient: AdminClient,
  viewerId: string
) {
  const { data, error } = await adminClient
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', viewerId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.conversation_id);
}

async function getProfilesById(
  adminClient: AdminClient,
  ids: string[]
) {
  if (!ids.length) {
    return new Map<string, Database['public']['Tables']['profiles']['Row']>();
  }

  const { data, error } = await adminClient.from('profiles').select('*').in('id', ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

async function getRecentConversationSummaries(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  limit: number,
  messagesPerConversation: number
): Promise<RecentConversationSummary[]> {
  const membershipConversationIds = await getViewerMembershipConversationIds(adminClient, viewerId);

  if (!membershipConversationIds.length) {
    return [];
  }

  const { data: conversations, error: conversationsError } = await adminClient
    .from('conversations')
    .select('*')
    .in('id', membershipConversationIds);

  if (conversationsError) {
    throw new Error(conversationsError.message);
  }

  const selectedConversations = sortConversationsByRecentActivity(conversations ?? []).slice(0, limit);
  const selectedConversationIds = selectedConversations.map((conversation) => conversation.id);

  if (!selectedConversationIds.length) {
    return [];
  }

  const { data: participantRows, error: participantsError } = await adminClient
    .from('conversation_participants')
    .select('*')
    .in('conversation_id', selectedConversationIds);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const counterpartIds = unique(
    (participantRows ?? [])
      .filter((row) => row.user_id !== viewerId)
      .map((row) => row.user_id)
  );

  const profilesById = await getProfilesById(adminClient, unique([viewerId, ...counterpartIds]));

  const messageResults = await Promise.all(
    selectedConversationIds.map(async (conversationId) => {
      const { data, error } = await adminClient
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(messagesPerConversation);

      if (error) {
        throw new Error(error.message);
      }

      return {
        conversationId,
        messages: sortMessagesAscending(data ?? [])
      };
    })
  );

  const messagesByConversationId = new Map(
    messageResults.map((result) => [result.conversationId, result.messages])
  );

  return selectedConversations.map((conversation) => {
    const counterpartMembership = participantRows?.find(
      (row) => row.conversation_id === conversation.id && row.user_id !== viewerId
    );
    const counterpartProfile = counterpartMembership
      ? profilesById.get(counterpartMembership.user_id)
      : null;

    return {
      conversationId: conversation.id,
      participantName: counterpartProfile?.display_name ?? 'Unknown participant',
      participantRole: counterpartProfile?.role ?? 'unknown',
      status: conversation.status,
      subject: conversation.subject ?? '',
      lastMessageAt: conversation.last_message_at,
      messages: (messagesByConversationId.get(conversation.id) ?? []).map((message) => {
        const senderProfile =
          message.sender_id === viewerId ? viewerProfile : profilesById.get(message.sender_id) ?? null;

        return {
          senderName: message.sender_id === viewerId ? 'You' : senderProfile?.display_name ?? 'Unknown sender',
          senderRole: senderProfile?.role ?? 'unknown',
          text: formatMessageTextForAssistant(message.body),
          createdAt: message.created_at
        };
      })
    };
  });
}

async function getThreadMessages(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  conversationId: string,
  limit: number
): Promise<ConversationThreadDetail> {
  const [{ data: participantRows, error: participantsError }, { data: conversation, error: conversationError }] =
    await Promise.all([
      adminClient
        .from('conversation_participants')
        .select('*')
        .eq('conversation_id', conversationId),
      adminClient
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle()
    ]);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  if (conversationError) {
    throw new Error(conversationError.message);
  }

  if (!conversation) {
    throw new Error('Conversation not found.');
  }

  const isParticipant = (participantRows ?? []).some((row) => row.user_id === viewerId);

  if (!isParticipant) {
    throw new Error('You do not have access to that conversation.');
  }

  const counterpartIds = unique(
    (participantRows ?? [])
      .filter((row) => row.user_id !== viewerId)
      .map((row) => row.user_id)
  );
  const profilesById = await getProfilesById(adminClient, unique([viewerId, ...counterpartIds]));

  const { data: messages, error: messagesError } = await adminClient
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  const counterpartProfile = counterpartIds.length ? profilesById.get(counterpartIds[0]) ?? null : null;

  return {
    conversationId,
    participantName: counterpartProfile?.display_name ?? 'Unknown participant',
    participantRole: counterpartProfile?.role ?? 'unknown',
    status: conversation.status,
    subject: conversation.subject ?? '',
    messages: sortMessagesAscending(messages ?? []).map((message) => {
      const senderProfile =
        message.sender_id === viewerId ? viewerProfile : profilesById.get(message.sender_id) ?? null;

      return {
        senderName: message.sender_id === viewerId ? 'You' : senderProfile?.display_name ?? 'Unknown sender',
        senderRole: senderProfile?.role ?? 'unknown',
        text: formatMessageTextForAssistant(message.body),
        createdAt: message.created_at
      };
    })
  };
}

async function getRecentFormSubmissionSummaries(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  limit: number,
  answersPerSubmission: number,
  statusFilter: InquiryFormSubmissionStatus | 'all'
): Promise<InquiryFormSubmissionSummary[]> {
  if (viewerProfile?.role !== 'creator') {
    return [];
  }

  let query = adminClient
    .from('inquiry_form_submissions')
    .select('*')
    .eq('creator_id', viewerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: submissions, error: submissionsError } = await query;

  if (submissionsError) {
    throw new Error(submissionsError.message);
  }

  const selectedSubmissions = submissions ?? [];

  if (!selectedSubmissions.length) {
    return [];
  }

  const formIds = unique(selectedSubmissions.map((submission) => submission.form_id));
  const submissionIds = selectedSubmissions.map((submission) => submission.id);

  const [{ data: forms, error: formsError }, { data: answers, error: answersError }] =
    await Promise.all([
      adminClient.from('inquiry_forms').select('*').in('id', formIds),
      adminClient.from('inquiry_form_answers').select('*').in('submission_id', submissionIds)
    ]);

  if (formsError) {
    throw new Error(formsError.message);
  }

  if (answersError) {
    throw new Error(answersError.message);
  }

  const questionIds = unique((answers ?? []).map((answer) => answer.question_id));
  const formsById = new Map((forms ?? []).map((form) => [form.id, form]));

  const questionsById = questionIds.length
    ? await (async () => {
        const { data: questions, error: questionsError } = await adminClient
          .from('inquiry_form_questions')
          .select('*')
          .in('id', questionIds);

        if (questionsError) {
          throw new Error(questionsError.message);
        }

        return new Map((questions ?? []).map((question) => [question.id, question]));
      })()
    : new Map<string, Database['public']['Tables']['inquiry_form_questions']['Row']>();

  const answersBySubmissionId = new Map<string, Database['public']['Tables']['inquiry_form_answers']['Row'][]>();

  for (const answer of answers ?? []) {
    const existingAnswers = answersBySubmissionId.get(answer.submission_id) ?? [];
    existingAnswers.push(answer);
    answersBySubmissionId.set(answer.submission_id, existingAnswers);
  }

  return selectedSubmissions.map((submission) => {
    const form = formsById.get(submission.form_id);
    const sortedAnswers = sortFormAnswersByQuestionPosition(
      answersBySubmissionId.get(submission.id) ?? [],
      questionsById
    );

    return {
      submissionId: submission.id,
      formId: submission.form_id,
      formTitle: form?.title ?? 'Curated Inquiry',
      supporterId: submission.supporter_id,
      supporterName: submission.supporter_display_name?.trim() || 'Syncrolly user',
      status: submission.status,
      submittedAt: submission.created_at,
      conversationId: submission.conversation_id,
      answers: sortedAnswers.slice(0, answersPerSubmission).map((answer) => ({
        questionPrompt: questionsById.get(answer.question_id)?.prompt ?? 'Question',
        answerText: answer.answer_text
      }))
    };
  });
}

async function searchRecentFormSubmissions(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  query: string,
  limit: number,
  answersPerSubmission: number,
  statusFilter: InquiryFormSubmissionStatus | 'all'
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery || viewerProfile?.role !== 'creator') {
    return [];
  }

  const recentSubmissions = await getRecentFormSubmissionSummaries(
    adminClient,
    viewerId,
    viewerProfile,
    Math.max(limit * 2, 12),
    Math.max(answersPerSubmission, 4),
    statusFilter
  );

  return recentSubmissions
    .filter((submission) => {
      if (submission.supporterName.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      if (submission.formTitle.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      return submission.answers.some(
        (answer) =>
          answer.questionPrompt.toLowerCase().includes(normalizedQuery) ||
          answer.answerText.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, limit)
    .map((submission) => ({
      ...submission,
      answers: submission.answers.slice(0, answersPerSubmission)
    }));
}

async function getFormSubmissionDetails(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  submissionId: string
): Promise<InquiryFormSubmissionDetail> {
  if (viewerProfile?.role !== 'creator') {
    throw new Error('Form inbox tools are only available to creator accounts right now.');
  }

  const { data: submission, error: submissionError } = await adminClient
    .from('inquiry_form_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('creator_id', viewerId)
    .maybeSingle();

  if (submissionError) {
    throw new Error(submissionError.message);
  }

  if (!submission) {
    throw new Error('Form submission not found.');
  }

  const [{ data: form, error: formError }, { data: answers, error: answersError }] = await Promise.all([
    adminClient.from('inquiry_forms').select('*').eq('id', submission.form_id).maybeSingle(),
    adminClient.from('inquiry_form_answers').select('*').eq('submission_id', submission.id)
  ]);

  if (formError) {
    throw new Error(formError.message);
  }

  if (answersError) {
    throw new Error(answersError.message);
  }

  const questionIds = unique((answers ?? []).map((answer) => answer.question_id));
  const questionsById = questionIds.length
    ? await (async () => {
        const { data: questions, error: questionsError } = await adminClient
          .from('inquiry_form_questions')
          .select('*')
          .in('id', questionIds);

        if (questionsError) {
          throw new Error(questionsError.message);
        }

        return new Map((questions ?? []).map((question) => [question.id, question]));
      })()
    : new Map<string, Database['public']['Tables']['inquiry_form_questions']['Row']>();

  const sortedAnswers = sortFormAnswersByQuestionPosition(answers ?? [], questionsById);

  return {
    submissionId: submission.id,
    formId: submission.form_id,
    formTitle: form?.title ?? 'Curated Inquiry',
    formIntro: form?.intro ?? '',
    supporterId: submission.supporter_id,
    supporterName: submission.supporter_display_name?.trim() || 'Syncrolly user',
    status: submission.status,
    submittedAt: submission.created_at,
    updatedAt: submission.updated_at,
    conversationId: submission.conversation_id,
    answers: sortedAnswers.map((answer) => ({
      questionPrompt: questionsById.get(answer.question_id)?.prompt ?? 'Question',
      answerText: answer.answer_text
    }))
  };
}

async function searchRecentConversations(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  query: string,
  limit: number,
  messagesPerConversation: number
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const recentConversations = await getRecentConversationSummaries(
    adminClient,
    viewerId,
    viewerProfile,
    Math.max(limit * 2, 12),
    messagesPerConversation
  );

  return recentConversations
    .filter((conversation) => {
      if (conversation.participantName.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      if (conversation.subject.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      return conversation.messages.some((message) => message.text.toLowerCase().includes(normalizedQuery));
    })
    .slice(0, limit);
}

async function createModelResponse(
  openAiApiKey: string,
  body: Record<string, unknown>
): Promise<ResponsesApiResponse> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ResponsesApiResponse;
}

function extractToolCalls(response: ResponsesApiResponse): ToolCall[] {
  return (response.output ?? [])
    .filter((item) => item.type === 'function_call' && item.call_id && item.name && item.arguments)
    .map((item) => {
      let parsedArguments: Record<string, unknown> = {};

      try {
        parsedArguments =
          typeof item.arguments === 'string' && item.arguments.trim()
            ? (JSON.parse(item.arguments) as Record<string, unknown>)
            : {};
      } catch {
        parsedArguments = {};
      }

      return {
        callId: item.call_id as string,
        name: item.name as string,
        arguments: parsedArguments
      };
    });
}

async function executeAssistantTool(
  adminClient: AdminClient,
  viewerId: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  toolCall: ToolCall
) {
  if (toolCall.name === 'get_recent_conversations') {
    const limit = clampInteger(toolCall.arguments.limit, 5, 1, 10);
    const messagesPerConversation = clampInteger(
      toolCall.arguments.messages_per_conversation,
      4,
      1,
      8
    );

    return {
      requestedTool: toolCall.name,
      conversations: await getRecentConversationSummaries(
        adminClient,
        viewerId,
        viewerProfile,
        limit,
        messagesPerConversation
      )
    };
  }

  if (toolCall.name === 'search_conversations') {
    const query =
      typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query.trim() : '';
    const limit = clampInteger(toolCall.arguments.limit, 5, 1, 8);
    const messagesPerConversation = clampInteger(
      toolCall.arguments.messages_per_conversation,
      4,
      1,
      8
    );

    if (!query) {
      return {
        requestedTool: toolCall.name,
        error: 'query is required.'
      };
    }

    return {
      requestedTool: toolCall.name,
      query,
      conversations: await searchRecentConversations(
        adminClient,
        viewerId,
        viewerProfile,
        query,
        limit,
        messagesPerConversation
      )
    };
  }

  if (toolCall.name === 'get_thread_messages') {
    const conversationId =
      typeof toolCall.arguments.conversation_id === 'string'
        ? toolCall.arguments.conversation_id.trim()
        : '';
    const limit = clampInteger(toolCall.arguments.limit, 12, 1, 20);

    if (!conversationId) {
      return {
        requestedTool: toolCall.name,
        error: 'conversation_id is required.'
      };
    }

    return {
      requestedTool: toolCall.name,
      conversation: await getThreadMessages(
        adminClient,
        viewerId,
        viewerProfile,
        conversationId,
        limit
      )
    };
  }

  if (toolCall.name === 'get_recent_form_submissions') {
    const limit = clampInteger(toolCall.arguments.limit, 5, 1, 10);
    const answersPerSubmission = clampInteger(
      toolCall.arguments.answers_per_submission,
      3,
      1,
      6
    );
    const statusFilter = normalizeStatusFilter(toolCall.arguments.status_filter);

    if (viewerProfile?.role !== 'creator') {
      return {
        requestedTool: toolCall.name,
        error: 'Form inbox tools are only available to creator accounts right now.'
      };
    }

    return {
      requestedTool: toolCall.name,
      statusFilter,
      submissions: await getRecentFormSubmissionSummaries(
        adminClient,
        viewerId,
        viewerProfile,
        limit,
        answersPerSubmission,
        statusFilter
      )
    };
  }

  if (toolCall.name === 'search_form_submissions') {
    const query =
      typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query.trim() : '';
    const limit = clampInteger(toolCall.arguments.limit, 5, 1, 8);
    const answersPerSubmission = clampInteger(
      toolCall.arguments.answers_per_submission,
      3,
      1,
      6
    );
    const statusFilter = normalizeStatusFilter(toolCall.arguments.status_filter);

    if (!query) {
      return {
        requestedTool: toolCall.name,
        error: 'query is required.'
      };
    }

    if (viewerProfile?.role !== 'creator') {
      return {
        requestedTool: toolCall.name,
        error: 'Form inbox tools are only available to creator accounts right now.'
      };
    }

    return {
      requestedTool: toolCall.name,
      query,
      statusFilter,
      submissions: await searchRecentFormSubmissions(
        adminClient,
        viewerId,
        viewerProfile,
        query,
        limit,
        answersPerSubmission,
        statusFilter
      )
    };
  }

  if (toolCall.name === 'get_form_submission_details') {
    const submissionId =
      typeof toolCall.arguments.submission_id === 'string'
        ? toolCall.arguments.submission_id.trim()
        : '';

    if (!submissionId) {
      return {
        requestedTool: toolCall.name,
        error: 'submission_id is required.'
      };
    }

    return {
      requestedTool: toolCall.name,
      submission: await getFormSubmissionDetails(
        adminClient,
        viewerId,
        viewerProfile,
        submissionId
      )
    };
  }

  return {
    requestedTool: toolCall.name,
    error: 'Unsupported tool.'
  };
}

async function generateAssistantReply(
  openAiApiKey: string,
  transcript: string,
  viewerProfile: Database['public']['Tables']['profiles']['Row'] | null,
  adminClient: AdminClient,
  viewerId: string
) {
  const prefetchedSections: Array<{
    label: string;
    payload: unknown;
  }> = [];

  if (shouldPrefetchConversationContext(transcript)) {
    prefetchedSections.push({
      label: 'Recent conversations',
      payload: await executeAssistantTool(adminClient, viewerId, viewerProfile, {
        callId: 'prefetch_recent_conversations',
        name: 'get_recent_conversations',
        arguments: {
          limit: 5,
          messages_per_conversation: 4
        }
      })
    });
  }

  if (viewerProfile?.role === 'creator' && shouldPrefetchFormContext(transcript)) {
    prefetchedSections.push({
      label: 'Recent form submissions',
      payload: await executeAssistantTool(adminClient, viewerId, viewerProfile, {
        callId: 'prefetch_recent_form_submissions',
        name: 'get_recent_form_submissions',
        arguments: {
          limit: 5,
          answers_per_submission: 3,
          status_filter: 'all'
        }
      })
    });
  }

  const prefetchedContextPrompt = buildPrefetchedContextPrompt(prefetchedSections);

  let inputItems: Array<Record<string, unknown>> = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: buildAssistantPrompt(viewerProfile)
        }
      ]
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: transcript
        }
      ]
    }
  ];

  if (prefetchedContextPrompt) {
    inputItems.push({
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: prefetchedContextPrompt
        }
      ]
    });
  }

  for (let step = 0; step < 4; step += 1) {
    const responseResult = await createModelResponse(openAiApiKey, {
      model: 'gpt-4.1-mini',
      input: inputItems,
      tools: assistantTools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      store: false,
      max_output_tokens: 220,
      text: {
        verbosity: 'medium'
      }
    });

    const toolCalls = extractToolCalls(responseResult);

    if (!toolCalls.length) {
      const replyText = extractResponseText(responseResult);

      if (!replyText) {
        throw new Error('The assistant response did not include any text.');
      }

      return replyText;
    }

    inputItems = [
      ...inputItems,
      ...((responseResult.output as Array<Record<string, unknown>> | undefined) ?? [])
    ];

    for (const toolCall of toolCalls) {
      const toolOutput = await executeAssistantTool(adminClient, viewerId, viewerProfile, toolCall);
      inputItems.push({
        type: 'function_call_output',
        call_id: toolCall.callId,
        output: JSON.stringify(toolOutput)
      });
    }
  }

  throw new Error('The assistant needed too many tool steps. Please try asking in a shorter way.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      error: 'Method not allowed.'
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publishableKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const authHeader = request.headers.get('Authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    return jsonResponse(500, {
      error: 'Supabase Edge Function environment is not configured.'
    });
  }

  if (!openAiApiKey) {
    return jsonResponse(500, {
      error: 'OPENAI_API_KEY is missing from the Supabase Edge Function environment.'
    });
  }

  if (!accessToken) {
    return jsonResponse(401, {
      error: 'Missing authorization token.'
    });
  }

  const verificationClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: userData,
    error: userError
  } = await verificationClient.auth.getUser(accessToken);

  const viewerId = typeof userData?.user?.id === 'string' ? userData.user.id : null;

  if (userError || !viewerId) {
    return jsonResponse(401, {
      error: 'Unauthorized.'
    });
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  let payload: VoiceAssistantPayload;

  try {
    payload = (await request.json()) as VoiceAssistantPayload;
  } catch {
    return jsonResponse(400, {
      error: 'Invalid JSON body.'
    });
  }

  if (!payload.audioBase64?.trim()) {
    return jsonResponse(400, {
      error: 'audioBase64 is required.'
    });
  }

  const audioMimeType = payload.audioMimeType?.trim() || 'audio/mp4';
  const audioFileName = normalizeFileName(payload.fileName, audioMimeType);

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', viewerId)
    .maybeSingle();

  if (profileError) {
    return jsonResponse(500, {
      error: profileError.message
    });
  }

  const transcriptionForm = new FormData();
  const audioBytes = getBase64Bytes(payload.audioBase64);
  const audioFile = new File([audioBytes], audioFileName, {
    type: audioMimeType
  });

  transcriptionForm.append('file', audioFile);
  transcriptionForm.append('model', 'gpt-4o-mini-transcribe');
  transcriptionForm.append('response_format', 'json');

  const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: transcriptionForm
  });

  if (!transcriptionResponse.ok) {
    return jsonResponse(502, {
      error: await parseError(transcriptionResponse)
    });
  }

  const transcriptionResult = (await transcriptionResponse.json()) as TranscriptionResponse;
  const transcript = transcriptionResult.text?.trim();

  if (!transcript) {
    return jsonResponse(502, {
      error: 'The transcription response did not include any text.'
    });
  }

  let replyText: string;

  try {
    replyText = await generateAssistantReply(openAiApiKey, transcript, profile ?? null, adminClient, viewerId);
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : 'The assistant could not generate a reply.'
    });
  }

  const speechResponse = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'coral',
      input: replyText,
      instructions: 'Speak warmly, clearly, and professionally. Sound like a calm AI product assistant.',
      response_format: 'mp3'
    })
  });

  if (!speechResponse.ok) {
    return jsonResponse(502, {
      error: await parseError(speechResponse)
    });
  }

  const speechBytes = new Uint8Array(await speechResponse.arrayBuffer());

  return jsonResponse(200, {
    transcript,
    replyText,
    audioBase64: bytesToBase64(speechBytes),
    audioMimeType: 'audio/mpeg'
  });
});
