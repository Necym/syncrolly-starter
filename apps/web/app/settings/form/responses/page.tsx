'use client';

import { type InquiryFormSubmission } from '@syncrolly/core';
import { listCreatorInquiryFormSubmissions, openInquirySubmissionConversation } from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWebSession } from '../../../../lib/session';
import { BrandMark, Icon, getErrorMessage } from '../../../ui';

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function formatSubmissionTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export default function FormResponsesPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [responses, setResponses] = useState<InquiryFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let mounted = true;

    async function loadResponses() {
      setLoading(true);
      setFeedback(null);

      try {
        const nextResponses = await listCreatorInquiryFormSubmissions(currentSupabase, currentUser.id);

        if (!mounted) {
          return;
        }

        setResponses(nextResponses);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setFeedback(getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadResponses();

    return () => {
      mounted = false;
    };
  }, [supabase, user?.id]);

  async function handleOpenSubmission(submission: InquiryFormSubmission) {
    if (!supabase || !user) {
      return;
    }

    setOpeningSubmissionId(submission.id);
    setFeedback(null);

    try {
      const conversationId =
        submission.conversationId ??
        (await openInquirySubmissionConversation(supabase, {
          submissionId: submission.id
        }));

      router.push(`/thread/${conversationId}`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setOpeningSubmissionId(null);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="thread-page">
        <header className="settings-menu-header form-tools-header">
          <div className="settings-menu-header-inner form-tools-header-inner">
            <button type="button" className="icon-button" onClick={() => router.push('/settings/form')} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Form responses</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to view saved form responses.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loading) {
    return (
      <div className="thread-page">
        <header className="settings-menu-header form-tools-header">
          <div className="settings-menu-header-inner form-tools-header-inner">
            <button type="button" className="icon-button" onClick={() => router.push('/settings/form')} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading form responses...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="thread-page">
        <header className="settings-menu-header form-tools-header">
          <div className="settings-menu-header-inner form-tools-header-inner">
            <button type="button" className="icon-button" onClick={() => router.push('/settings/form')} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Form responses</h1>
            <p className="stage-body">Sign in to view creator inquiry responses.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="thread-page">
      <header className="settings-menu-header form-tools-header">
        <div className="settings-menu-header-inner form-tools-header-inner">
          <button type="button" className="icon-button" onClick={() => router.push('/settings/form')} aria-label="Go back">
            <Icon name="back" />
          </button>

          <div className="brand brand-wordmark settings-menu-brand">
            <BrandMark />
          </div>

          <div className="settings-menu-spacer" />
        </div>
      </header>

      <main className="form-responses-main">
        <div className="form-responses-shell">
          <section className="form-tools-hero">
            <span className="public-form-kicker">Form Tools</span>
            <h1>Form responses</h1>
            <p>Every response here is saved in Supabase and tied to the supporter who submitted it.</p>
          </section>

          {feedback ? <p className="feedback-text">{feedback}</p> : null}

          {responses.length ? (
            <div className="form-responses-stack">
              {responses.map((submission) => (
                <article key={submission.id} className="form-response-card">
                  <div className="form-response-header">
                    <div className="form-response-identity">
                      <div className="form-response-avatar">
                        {submission.supporterAvatarUrl ? (
                          <img src={submission.supporterAvatarUrl} alt={submission.supporterName} className="form-response-avatar-image" />
                        ) : (
                          <span>{getInitials(submission.supporterName)}</span>
                        )}
                      </div>

                      <div className="form-response-copy">
                        <h2>{submission.supporterName}</h2>
                        <p>{formatSubmissionTime(submission.createdAt)}</p>
                      </div>
                    </div>

                    <span className="form-response-badge">{submission.status === 'pending' ? 'Pending' : 'Opened'}</span>
                  </div>

                  <div className="form-response-answer-stack">
                    {submission.answers.map((answer, index) => (
                      <div key={answer.id} className="form-response-answer-row">
                        <span>Question {index + 1}</span>
                        <strong>{answer.questionPrompt}</strong>
                        <p>{answer.answerText}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="public-profile-primary-button form-response-button"
                    onClick={() => void handleOpenSubmission(submission)}
                    disabled={openingSubmissionId === submission.id}
                  >
                    {openingSubmissionId === submission.id ? <span className="button-spinner" aria-hidden="true" /> : null}
                    <span>{submission.status === 'pending' ? 'Reply in DM' : 'Open DM'}</span>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <article className="public-profile-empty-posts">
              <h3>No replies yet</h3>
              <p>Once supporters submit your inquiry form, their answers will show up here.</p>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
