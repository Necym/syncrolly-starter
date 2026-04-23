import {
  getConversationDetails,
  getViewerProfile,
  listCreatorInquiryFormSubmissions,
  listInboxThreads
} from '@syncrolly/data';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';

type ToolRequestBody = {
  toolName?: unknown;
  args?: Record<string, unknown>;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const nextValue =
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;

  return Math.min(max, Math.max(min, nextValue));
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error: 'You must be signed in to load realtime inbox context.'
      },
      { status: 401 }
    );
  }

  const viewerProfile = await getViewerProfile(supabase, user.id);

  if (!viewerProfile) {
    return NextResponse.json(
      {
        error: 'Viewer profile not found.'
      },
      { status: 404 }
    );
  }

  let payload: ToolRequestBody;

  try {
    payload = (await request.json()) as ToolRequestBody;
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON body.'
      },
      { status: 400 }
    );
  }

  const toolName = typeof payload.toolName === 'string' ? payload.toolName : '';
  const args = payload.args ?? {};

  try {
    if (toolName === 'get_recent_conversations') {
      const limit = clampInteger(args.limit, 4, 1, 6);
      const messagesPerConversation = clampInteger(args.messages_per_conversation, 3, 1, 5);

      const threads = await listInboxThreads(supabase, user.id);
      const selectedThreads = threads.slice(0, limit);

      const conversationDetails = await Promise.all(
        selectedThreads.map((thread) => getConversationDetails(supabase, thread.id, user.id))
      );

      return NextResponse.json({
        conversations: selectedThreads.map((thread, index) => {
          const detail = conversationDetails[index];

          return {
            conversationId: thread.id,
            participantName: thread.participantName,
            accessLabel: thread.accessLabel,
            status: thread.status,
            statusLabel: thread.statusLabel,
            unread: thread.unread,
            relativeTime: thread.relativeTime,
            preview: thread.preview,
            messages:
              detail?.messages
                .slice(-messagesPerConversation)
                .map((message) => ({
                  senderName: message.isFromCreator ? (viewerProfile.role === 'creator' ? 'You' : detail.participantName) : detail.participantName,
                  text: message.inquirySubmissionCard
                    ? `${message.inquirySubmissionCard.supporterName} submitted ${message.inquirySubmissionCard.formTitle}. ${message.inquirySubmissionCard.answers
                        .slice(0, 2)
                        .map((answer) => `${answer.questionPrompt}: ${answer.answerText}`)
                        .join(' | ')}`
                    : message.text,
                  createdAt: message.createdAt
                })) ?? []
          };
        })
      });
    }

    if (toolName === 'get_thread_messages') {
      const conversationId = typeof args.conversation_id === 'string' ? args.conversation_id.trim() : '';
      const limit = clampInteger(args.limit, 8, 1, 12);

      if (!conversationId) {
        return NextResponse.json(
          {
            error: 'conversation_id is required.'
          },
          { status: 400 }
        );
      }

      const detail = await getConversationDetails(supabase, conversationId, user.id);

      if (!detail) {
        return NextResponse.json(
          {
            error: 'Conversation not found.'
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        conversation: {
          conversationId: detail.id,
          participantName: detail.participantName,
          status: detail.status,
          statusLabel: detail.statusLabel,
          relativeTime: detail.relativeTime,
          activityLabel: detail.activityLabel,
          messages: detail.messages.slice(-limit).map((message) => ({
            senderName: message.isFromCreator ? (viewerProfile.role === 'creator' ? 'You' : detail.participantName) : detail.participantName,
            text: message.inquirySubmissionCard
              ? `${message.inquirySubmissionCard.supporterName} submitted ${message.inquirySubmissionCard.formTitle}. ${message.inquirySubmissionCard.answers
                  .slice(0, 3)
                  .map((answer) => `${answer.questionPrompt}: ${answer.answerText}`)
                  .join(' | ')}`
              : message.text,
            createdAt: message.createdAt
          }))
        }
      });
    }

    if (toolName === 'get_recent_form_submissions') {
      if (viewerProfile.role !== 'creator') {
        return NextResponse.json({
          submissions: [],
          note: 'Form submission tools are only available to creator accounts.'
        });
      }

      const limit = clampInteger(args.limit, 4, 1, 6);
      const answersPerSubmission = clampInteger(args.answers_per_submission, 3, 1, 5);
      const statusFilter =
        args.status_filter === 'pending' || args.status_filter === 'opened'
          ? args.status_filter
          : undefined;

      const submissions = await listCreatorInquiryFormSubmissions(supabase, user.id, {
        status: statusFilter
      });

      return NextResponse.json({
        submissions: submissions.slice(0, limit).map((submission) => ({
          submissionId: submission.id,
          supporterName: submission.supporterName,
          supporterId: submission.supporterId,
          submittedAt: submission.createdAt,
          status: submission.status,
          conversationId: submission.conversationId,
          answers: submission.answers.slice(0, answersPerSubmission).map((answer) => ({
            questionPrompt: answer.questionPrompt,
            answerText: answer.answerText
          }))
        }))
      });
    }

    if (toolName === 'get_form_submission_details') {
      if (viewerProfile.role !== 'creator') {
        return NextResponse.json(
          {
            error: 'Form submission tools are only available to creator accounts.'
          },
          { status: 403 }
        );
      }

      const submissionId = typeof args.submission_id === 'string' ? args.submission_id.trim() : '';

      if (!submissionId) {
        return NextResponse.json(
          {
            error: 'submission_id is required.'
          },
          { status: 400 }
        );
      }

      const submissions = await listCreatorInquiryFormSubmissions(supabase, user.id);
      const submission = submissions.find((entry) => entry.id === submissionId);

      if (!submission) {
        return NextResponse.json(
          {
            error: 'Submission not found.'
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        submission: {
          submissionId: submission.id,
          supporterName: submission.supporterName,
          supporterId: submission.supporterId,
          submittedAt: submission.createdAt,
          status: submission.status,
          conversationId: submission.conversationId,
          answers: submission.answers.map((answer) => ({
            questionPrompt: answer.questionPrompt,
            answerText: answer.answerText
          }))
        }
      });
    }

    return NextResponse.json(
      {
        error: 'Unsupported realtime tool.'
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load realtime context.'
      },
      { status: 500 }
    );
  }
}
