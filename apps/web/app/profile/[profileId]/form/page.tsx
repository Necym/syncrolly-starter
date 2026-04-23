'use client';

import { type InquiryForm, type InquiryFormQuestion, type ViewerProfile } from '@syncrolly/core';
import { getCreatorInquiryForm, getPublicProfile, submitInquiryForm } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useWebSession } from '../../../../lib/session';
import { BottomNav, BrandMark, Icon, getErrorMessage } from '../../../ui';

type AnswerState = Record<
  string,
  {
    value: string;
    optionId?: string;
  }
>;

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

function getQuestionHelper(question: InquiryFormQuestion): string {
  if (question.type === 'multiple_choice') {
    return 'Choose one option to keep the inquiry moving.';
  }

  if (question.type === 'short_text') {
    return 'A quick one-line answer is enough here.';
  }

  return 'Share a little more context so the creator knows what matters most.';
}

function isAnswerComplete(question: InquiryFormQuestion, answer: { value: string; optionId?: string } | undefined): boolean {
  const trimmedValue = answer?.value.trim() ?? '';

  if (question.type === 'multiple_choice') {
    return Boolean(answer?.optionId);
  }

  if (question.type === 'short_text') {
    return trimmedValue.length >= 2;
  }

  return trimmedValue.length >= 12;
}

function getAnswerValue(answer: { value: string; optionId?: string } | undefined): string {
  return answer?.value.trim() ?? '';
}

export default function PublicInquiryFormPage() {
  const params = useParams<{ profileId: string }>();
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const resolvedProfileId = params?.profileId;
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [form, setForm] = useState<InquiryForm | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [visibleQuestionCount, setVisibleQuestionCount] = useState(1);
  const [loadingForm, setLoadingForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !resolvedProfileId) {
      return;
    }

    if (resolvedProfileId === user.id) {
      router.replace('/settings/form/preview');
    }
  }, [resolvedProfileId, router, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !resolvedProfileId || resolvedProfileId === user.id) {
      return;
    }

    const currentSupabase = supabase;
    let cancelled = false;

    async function loadForm() {
      setLoadingForm(true);
      setFeedback(null);

      try {
        const [nextProfile, nextForm] = await Promise.all([
          getPublicProfile(currentSupabase, resolvedProfileId),
          getCreatorInquiryForm(currentSupabase, resolvedProfileId)
        ]);

        if (cancelled) {
          return;
        }

        setProfile(nextProfile);
        setForm(nextForm);
        setAnswers({});
        setSubmitted(false);
        setVisibleQuestionCount(1);
      } catch (error) {
        if (!cancelled) {
          setFeedback(getErrorMessage(error, 'Something went wrong while loading this inquiry form.'));
        }
      } finally {
        if (!cancelled) {
          setLoadingForm(false);
        }
      }
    }

    void loadForm();

    return () => {
      cancelled = true;
    };
  }, [resolvedProfileId, supabase, user?.id]);

  const answeredCount = useMemo(() => {
    if (!form) {
      return 0;
    }

    return form.questions.reduce((count, question) => {
      return isAnswerComplete(question, answers[question.id]) ? count + 1 : count;
    }, 0);
  }, [answers, form]);

  const progressPercent = form?.questions.length ? Math.round((answeredCount / form.questions.length) * 100) : 0;
  const allQuestionsComplete = Boolean(form?.questions.length && answeredCount === form.questions.length);

  function revealNext(questionIndex: number) {
    setVisibleQuestionCount((current) => {
      const nextCount = Math.min((form?.questions.length ?? 0), questionIndex + 2);
      return Math.max(current, nextCount);
    });
  }

  function handleChoiceAnswer(question: InquiryFormQuestion, questionIndex: number, optionId: string, label: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        value: label,
        optionId
      }
    }));

    revealNext(questionIndex);
  }

  function handleTextAnswer(question: InquiryFormQuestion, questionIndex: number, value: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        value
      }
    }));

    if (isAnswerComplete(question, { value })) {
      revealNext(questionIndex);
    }
  }

  async function handleSubmit() {
    if (!supabase || !user || !form || !allQuestionsComplete) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await submitInquiryForm(supabase, {
        formId: form.id,
        answers: form.questions.map((question) => ({
          questionId: question.id,
          selectedOptionId: question.type === 'multiple_choice' ? answers[question.id]?.optionId : undefined,
          answerText: question.type === 'multiple_choice' ? undefined : getAnswerValue(answers[question.id])
        }))
      });

      setSubmitted(true);
      setFeedback('Inquiry sent. The creator can review it from their Forms tab and reply from there.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (resolvedProfileId) {
      router.push(`/profile/${resolvedProfileId}`);
      return;
    }

    router.push('/');
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>

            <div className="brand brand-wordmark">
              <BrandMark />
            </div>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Inquiry form</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to test the desktop form flow.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingForm) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading inquiry form...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Sign in to continue</h1>
            <p className="stage-body">You need a Syncrolly account to submit a creator inquiry on desktop.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!resolvedProfileId || !profile || profile.role !== 'creator' || !form) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Form unavailable</h1>
            <p className="stage-body">
              {feedback ?? 'This creator has not published a web inquiry form yet.'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="public-form-main">
          <div className="public-form-shell success">
            <section className="public-form-success-card">
              <span className="public-form-kicker">Inquiry sent</span>
              <h1>Almost there.</h1>
              <p>
                {feedback ??
                  `${profile.displayName} can now review your answers from their Forms tab and decide whether to open a DM.`}
              </p>

              <div className="public-form-success-actions">
                <button type="button" className="public-profile-primary-button" onClick={() => router.push('/')}>
                  Back to inbox
                </button>
                <button type="button" className="public-profile-secondary-button" onClick={handleBack}>
                  Back to profile
                </button>
              </div>
            </section>
          </div>
        </main>

        <BottomNav activeKey="inbox" />
      </div>
    );
  }

  return (
    <div className="thread-page">
      <header className="public-route-header-shell">
        <div className="public-route-header">
          <div className="public-route-header-left">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>

            <div className="brand brand-wordmark">
              <BrandMark />
            </div>
          </div>

          <button type="button" className="public-route-link" onClick={() => router.push(`/profile/${resolvedProfileId}`)}>
            View profile
          </button>
        </div>
      </header>

      <main className="public-form-main">
        <div className="public-form-shell">
          <aside className="public-form-sidebar">
            <span className="public-form-kicker">Curated Inquiry</span>
            <h1>{form.title}</h1>
            <p className="public-form-intro">{form.intro || 'A thoughtful intake before the conversation starts.'}</p>

            <div className="public-form-creator-chip">
              <div className="public-form-creator-avatar">{getInitials(profile.displayName)}</div>
              <div className="public-form-creator-copy">
                <strong>{profile.displayName}</strong>
                <span>{profile.creatorProfile?.headline || profile.creatorProfile?.niche || 'Creator'}</span>
              </div>
            </div>

            <div className="public-form-progress-card">
              <div className="public-form-progress-header">
                <span>Progress</span>
                <strong>{progressPercent}%</strong>
              </div>

              <div className="public-form-progress-track">
                <div className="public-form-progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>

              <p>{answeredCount} of {form.questions.length} questions answered</p>
            </div>
          </aside>

          <section className="public-form-flow">
            {form.questions.map((question, index) => {
              if (index >= visibleQuestionCount) {
                return null;
              }

              const answer = answers[question.id];
              const isComplete = isAnswerComplete(question, answer);

              return (
                <article key={question.id} className={`public-form-question-card${isComplete ? ' complete' : ''}`}>
                  <div className="public-form-question-header">
                    <span className="public-form-question-step">Question {index + 1}</span>
                    <h2>{question.prompt}</h2>
                    <p>{getQuestionHelper(question)}</p>
                  </div>

                  {question.type === 'multiple_choice' ? (
                    <div className="public-form-options">
                      {question.options.map((option) => {
                        const isSelected = answer?.optionId === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`public-form-option${isSelected ? ' selected' : ''}`}
                            onClick={() => handleChoiceAnswer(question, index, option.id, option.label)}
                          >
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : question.type === 'short_text' ? (
                    <input
                      className="public-form-input"
                      type="text"
                      value={answer?.value ?? ''}
                      onChange={(event) => handleTextAnswer(question, index, event.target.value)}
                      placeholder={question.placeholder || 'Type a short answer'}
                    />
                  ) : (
                    <textarea
                      className="public-form-textarea"
                      value={answer?.value ?? ''}
                      onChange={(event) => handleTextAnswer(question, index, event.target.value)}
                      placeholder={question.placeholder || 'Share more detail here'}
                      rows={6}
                    />
                  )}
                </article>
              );
            })}

            {visibleQuestionCount >= form.questions.length ? (
              <section className="public-form-summary-card">
                <span className="public-form-question-step">Summary</span>
                <h2>Your answers</h2>

                <div className="public-form-summary-list">
                  {form.questions.map((question, index) => (
                    <div key={question.id} className="public-form-summary-row">
                      <span>Question {index + 1}</span>
                      <strong>{question.prompt}</strong>
                      <p>{getAnswerValue(answers[question.id]) || 'Waiting for a response'}</p>
                    </div>
                  ))}
                </div>

                {feedback ? <p className="feedback-inline public-profile-feedback">{feedback}</p> : null}

                <div className="public-form-submit-row">
                  <button
                    type="button"
                    className="public-profile-primary-button"
                    onClick={() => void handleSubmit()}
                    disabled={!allQuestionsComplete || submitting}
                  >
                    {submitting ? <span className="button-spinner" aria-hidden="true" /> : null}
                    <span>{submitting ? 'Sending...' : 'Send inquiry'}</span>
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </main>

      <BottomNav activeKey="inbox" />
    </div>
  );
}
