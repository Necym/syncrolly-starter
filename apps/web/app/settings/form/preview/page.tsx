'use client';

import { type InquiryFormDraftQuestion } from '@syncrolly/core';
import { getCreatorInquiryForm } from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getDefaultFormDraft, getDraftFromInquiryForm } from '../../../../lib/formBuilder';
import { useWebSession } from '../../../../lib/session';
import { BrandMark, Icon, getErrorMessage } from '../../../ui';

type AnswerState = Record<string, string>;

function getQuestionHelper(question: InquiryFormDraftQuestion): string {
  if (question.type === 'multiple_choice') {
    return 'Choose one option to keep moving.';
  }

  if (question.type === 'short_text') {
    return 'A quick one-line answer is enough here.';
  }

  return 'Share a bit more detail so the creator has good context.';
}

function isAnswerComplete(question: InquiryFormDraftQuestion, answer: string | undefined): boolean {
  const trimmed = answer?.trim() ?? '';

  if (question.type === 'multiple_choice') {
    return Boolean(trimmed);
  }

  if (question.type === 'short_text') {
    return trimmed.length >= 2;
  }

  return trimmed.length >= 12;
}

export default function FormPreviewPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [draft, setDraft] = useState(getDefaultFormDraft());
  const [answers, setAnswers] = useState<AnswerState>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let mounted = true;

    async function loadDraft() {
      setLoading(true);
      setFeedback(null);

      try {
        const savedForm = await getCreatorInquiryForm(currentSupabase, currentUser.id);

        if (!mounted) {
          return;
        }

        if (savedForm) {
          setDraft(getDraftFromInquiryForm(savedForm));
        } else {
          setDraft(getDefaultFormDraft());
          setFeedback('No saved form yet. You are previewing the starter layout until you save one.');
        }

        setAnswers({});
        setActiveQuestionIndex(0);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setDraft(getDefaultFormDraft());
        setFeedback(getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadDraft();

    return () => {
      mounted = false;
    };
  }, [supabase, user?.id]);

  const answeredCount = useMemo(() => {
    return draft.questions.reduce((count, question) => (
      isAnswerComplete(question, answers[question.id]) ? count + 1 : count
    ), 0);
  }, [answers, draft.questions]);

  const progressPercent = draft.questions.length ? Math.round((answeredCount / draft.questions.length) * 100) : 0;
  const isReviewStep = activeQuestionIndex >= draft.questions.length;
  const currentQuestion = draft.questions[activeQuestionIndex] ?? null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] ?? '' : '';
  const currentQuestionComplete = currentQuestion ? isAnswerComplete(currentQuestion, currentAnswer) : answeredCount === draft.questions.length;
  const stepPercent = draft.questions.length
    ? isReviewStep
      ? 100
      : Math.round(((activeQuestionIndex + 1) / draft.questions.length) * 100)
    : 0;

  function handleAnswer(question: InquiryFormDraftQuestion, value: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: value
    }));
  }

  function handlePreviousQuestion() {
    setActiveQuestionIndex((current) => Math.max(0, current - 1));
  }

  function handleContinueQuestion() {
    if (!currentQuestionComplete) {
      return;
    }

    setActiveQuestionIndex((current) => Math.min(draft.questions.length, current + 1));
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
            <h1 className="stage-title">Preview form</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to preview your inquiry form.</p>
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
            <p className="stage-body">Loading form preview...</p>
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
            <h1 className="stage-title">Preview form</h1>
            <p className="stage-body">Sign in to preview the creator inquiry flow.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="quiz-page">
      <header className="quiz-topbar">
        <div className="quiz-topbar-inner">
          <button type="button" className="quiz-brand" onClick={() => router.push('/settings/form')}>
            <BrandMark />
            <span>Synced-In</span>
          </button>

          <nav className="quiz-nav" aria-label="Form preview sections">
            <button type="button" onClick={() => router.push('/settings/form')}>
              Form
            </button>
            <span className="active">Preview</span>
            <button type="button" onClick={() => router.push('/settings/form/responses')}>
              Responses
            </button>
          </nav>

          <div className="quiz-topbar-actions">
            <button type="button" className="quiz-secondary-button compact" onClick={() => router.push('/settings/form/builder')}>
              Builder
            </button>
          </div>
        </div>
      </header>

      <main className="quiz-main">
        <div className="quiz-glow" aria-hidden="true" />
        <section className="quiz-stage">
          <div className="quiz-progress-header">
            <div className="quiz-progress-meta">
              <span>{isReviewStep ? 'Final review' : `Question ${activeQuestionIndex + 1} of ${draft.questions.length}`}</span>
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
                <h1>Your selections</h1>
                <p>Preview the answer card a supporter will review before sending. {progressPercent}% complete.</p>
              </div>

              <div className="quiz-summary-list">
                {draft.questions.map((question, index) => (
                  <div key={question.id} className="quiz-summary-row">
                    <span>Question {index + 1}</span>
                    <strong>{question.prompt}</strong>
                    <p>{answers[question.id]?.trim() || 'Waiting for a response'}</p>
                  </div>
                ))}
              </div>

              {feedback ? <p className="feedback-inline quiz-feedback">{feedback}</p> : null}
            </section>
          ) : currentQuestion ? (
            <section className="quiz-question-panel" key={currentQuestion.id}>
              <div className="quiz-question-copy">
                <span className="quiz-kicker">{draft.title}</span>
                <h1>{currentQuestion.prompt}</h1>
                <p>{currentQuestion.placeholder || draft.intro || getQuestionHelper(currentQuestion)}</p>
              </div>

              {currentQuestion.type === 'multiple_choice' ? (
                <div className="quiz-option-stack">
                  {currentQuestion.options.map((option) => {
                    const isSelected = currentAnswer === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        className={`quiz-option${isSelected ? ' selected' : ''}`}
                        onClick={() => handleAnswer(currentQuestion, option)}
                      >
                        <span>{option}</span>
                        {isSelected ? <span className="quiz-option-check" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : currentQuestion.type === 'short_text' ? (
                <input
                  className="quiz-input"
                  type="text"
                  value={currentAnswer}
                  onChange={(event) => handleAnswer(currentQuestion, event.target.value)}
                  placeholder={currentQuestion.placeholder || 'Type a short answer'}
                />
              ) : (
                <textarea
                  className="quiz-textarea"
                  value={currentAnswer}
                  onChange={(event) => handleAnswer(currentQuestion, event.target.value)}
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
              disabled={activeQuestionIndex === 0}
            >
              <span aria-hidden="true">&lt;-</span>
              Previous
            </button>

            {isReviewStep ? (
              <button type="button" className="quiz-continue-button" onClick={() => router.push('/settings/form/builder')}>
                Back to builder
                <span aria-hidden="true">-&gt;</span>
              </button>
            ) : (
              <button
                type="button"
                className="quiz-continue-button"
                onClick={handleContinueQuestion}
                disabled={!currentQuestionComplete}
              >
                Continue
                <span aria-hidden="true">-&gt;</span>
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
