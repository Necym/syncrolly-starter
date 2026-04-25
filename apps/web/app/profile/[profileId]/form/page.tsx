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
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
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
        setActiveQuestionIndex(0);
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
  const isReviewStep = Boolean(form && activeQuestionIndex >= form.questions.length);
  const currentQuestion = form?.questions[activeQuestionIndex] ?? null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const currentQuestionComplete = currentQuestion ? isAnswerComplete(currentQuestion, currentAnswer) : allQuestionsComplete;
  const stepPercent = form?.questions.length
    ? isReviewStep
      ? 100
      : Math.round(((activeQuestionIndex + 1) / form.questions.length) * 100)
    : 0;

  function handleChoiceAnswer(question: InquiryFormQuestion, optionId: string, label: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        value: label,
        optionId
      }
    }));
  }

  function handleTextAnswer(question: InquiryFormQuestion, value: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        value
      }
    }));
  }

  function handlePreviousQuestion() {
    if (!form) {
      return;
    }

    setActiveQuestionIndex((current) => Math.max(0, current - 1));
  }

  function handleContinueQuestion() {
    if (!form || !currentQuestionComplete) {
      return;
    }

    setActiveQuestionIndex((current) => Math.min(form.questions.length, current + 1));
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
            <p className="stage-body">You need a Synced-In account to submit a creator inquiry on desktop.</p>
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
      <div className="quiz-page">
        <header className="quiz-topbar">
          <div className="quiz-topbar-inner">
            <button type="button" className="quiz-brand" onClick={handleBack}>
              <BrandMark />
              <span>Synced-In</span>
            </button>

            <nav className="quiz-nav" aria-label="Inquiry sections">
              <span>Profile</span>
              <span className="active">Inquiry</span>
              <span>Messages</span>
            </nav>

            <div className="quiz-topbar-actions">
              <button type="button" className="quiz-icon-button" aria-label="Notifications">
                <Icon name="notifications" />
              </button>
              <div className="quiz-avatar">{getInitials(profile.displayName)}</div>
            </div>
          </div>
        </header>

        <main className="quiz-main">
          <div className="quiz-glow" aria-hidden="true" />
          <section className="quiz-success-card">
            <span className="quiz-kicker">Inquiry sent</span>
            <div>
              <h1>Almost there.</h1>
              <p>
                {feedback ??
                  `${profile.displayName} can now review your answers from their Forms tab and decide whether to open a DM.`}
              </p>
            </div>

            <div className="quiz-success-actions">
              <button type="button" className="quiz-continue-button" onClick={() => router.push('/')}>
                Back to inbox
              </button>
              <button type="button" className="quiz-secondary-button" onClick={handleBack}>
                Back to profile
              </button>
            </div>
          </section>
        </main>

        <BottomNav activeKey="inbox" />
      </div>
    );
  }

  return (
    <div className="quiz-page">
      <header className="quiz-topbar">
        <div className="quiz-topbar-inner">
          <button type="button" className="quiz-brand" onClick={handleBack}>
            <BrandMark />
            <span>Synced-In</span>
          </button>

          <nav className="quiz-nav" aria-label="Inquiry sections">
            <button type="button" onClick={() => router.push(`/profile/${resolvedProfileId}`)}>
              Profile
            </button>
            <span className="active">Inquiry</span>
            <button type="button" onClick={() => router.push('/')}>
              Messages
            </button>
          </nav>

          <div className="quiz-topbar-actions">
            <button type="button" className="quiz-icon-button" aria-label="Notifications">
              <Icon name="notifications" />
            </button>
            <div className="quiz-avatar">{getInitials(profile.displayName)}</div>
          </div>
        </div>
      </header>

      <main className="quiz-main">
        <div className="quiz-glow" aria-hidden="true" />
        <section className="quiz-stage">
          <div className="quiz-progress-header">
            <div className="quiz-progress-meta">
              <span>
                {isReviewStep ? 'Final review' : `Question ${activeQuestionIndex + 1} of ${form.questions.length}`}
              </span>
              <span>{stepPercent}% Completed</span>
            </div>

            <div className="quiz-progress-track">
              <div className="quiz-progress-fill" style={{ width: `${stepPercent}%` }} />
            </div>
          </div>

          {isReviewStep ? (
            <section className="quiz-summary-card">
              <span className="quiz-kicker">Summary</span>
              <div className="quiz-question-copy">
                <h1>Your answers</h1>
                <p>
                  Review what {profile.displayName} will see before you send this inquiry. {progressPercent}% of the
                  form is complete.
                </p>
              </div>

              <div className="quiz-summary-list">
                {form.questions.map((question, index) => (
                  <div key={question.id} className="quiz-summary-row">
                    <span>Question {index + 1}</span>
                    <strong>{question.prompt}</strong>
                    <p>{getAnswerValue(answers[question.id]) || 'Waiting for a response'}</p>
                  </div>
                ))}
              </div>

              {feedback ? <p className="feedback-inline quiz-feedback">{feedback}</p> : null}
            </section>
          ) : currentQuestion ? (
            <section className="quiz-question-panel" key={currentQuestion.id}>
              <div className="quiz-question-copy">
                <span className="quiz-kicker">{form.title}</span>
                <h1>{currentQuestion.prompt}</h1>
                <p>{currentQuestion.placeholder || form.intro || getQuestionHelper(currentQuestion)}</p>
              </div>

              {currentQuestion.type === 'multiple_choice' ? (
                <div className="quiz-option-stack">
                  {currentQuestion.options.map((option) => {
                    const isSelected = currentAnswer?.optionId === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`quiz-option${isSelected ? ' selected' : ''}`}
                        onClick={() => handleChoiceAnswer(currentQuestion, option.id, option.label)}
                      >
                        <span>{option.label}</span>
                        {isSelected ? <span className="quiz-option-check" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : currentQuestion.type === 'short_text' ? (
                <input
                  className="quiz-input"
                  type="text"
                  value={currentAnswer?.value ?? ''}
                  onChange={(event) => handleTextAnswer(currentQuestion, event.target.value)}
                  placeholder={currentQuestion.placeholder || 'Type a short answer'}
                />
              ) : (
                <textarea
                  className="quiz-textarea"
                  value={currentAnswer?.value ?? ''}
                  onChange={(event) => handleTextAnswer(currentQuestion, event.target.value)}
                  placeholder={currentQuestion.placeholder || 'Share more detail here'}
                  rows={7}
                />
              )}
            </section>
          ) : null}

          <div className="quiz-footer">
            <button
              type="button"
              className="quiz-previous-button"
              onClick={handlePreviousQuestion}
              disabled={activeQuestionIndex === 0 || submitting}
            >
              <span aria-hidden="true">&lt;-</span>
              Previous
            </button>

            {isReviewStep ? (
              <button
                type="button"
                className="quiz-continue-button"
                onClick={() => void handleSubmit()}
                disabled={!allQuestionsComplete || submitting}
              >
                {submitting ? <span className="button-spinner" aria-hidden="true" /> : null}
                <span>{submitting ? 'Sending...' : 'Send inquiry'}</span>
                <span aria-hidden="true">-&gt;</span>
              </button>
            ) : (
              <button
                type="button"
                className="quiz-continue-button"
                onClick={handleContinueQuestion}
                disabled={!currentQuestionComplete || submitting}
              >
                Continue
                <span aria-hidden="true">-&gt;</span>
              </button>
            )}
          </div>
        </section>
      </main>

      <BottomNav activeKey="inbox" />
    </div>
  );
}
