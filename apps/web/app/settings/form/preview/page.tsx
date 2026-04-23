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
  const [visibleQuestionCount, setVisibleQuestionCount] = useState(1);
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
        setVisibleQuestionCount(1);
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

  function revealNext(questionIndex: number) {
    setVisibleQuestionCount((current) => Math.max(current, Math.min(draft.questions.length, questionIndex + 2)));
  }

  function handleAnswer(question: InquiryFormDraftQuestion, questionIndex: number, value: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: value
    }));

    if (isAnswerComplete(question, value)) {
      revealNext(questionIndex);
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
    <div className="thread-page">
      <header className="settings-menu-header form-tools-header">
        <div className="settings-menu-header-inner form-tools-header-inner">
          <button type="button" className="icon-button" onClick={() => router.push('/settings/form')} aria-label="Go back">
            <Icon name="back" />
          </button>

          <div className="brand brand-wordmark settings-menu-brand">
            <BrandMark />
          </div>

          <button type="button" className="settings-link-chip" onClick={() => router.push('/settings/form/builder')}>
            Builder
          </button>
        </div>
      </header>

      <main className="public-form-main">
        <div className="public-form-shell">
          <aside className="public-form-sidebar">
            <span className="public-form-kicker">Curated Inquiry</span>
            <h1>{draft.title}</h1>
            <p className="public-form-intro">{draft.intro || 'A thoughtful intake before the conversation starts.'}</p>

            <div className="public-form-creator-chip">
              <div className="public-form-creator-avatar">Y</div>
              <div className="public-form-creator-copy">
                <strong>Your creator form</strong>
                <span>Desktop preview</span>
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

              <p>{answeredCount} of {draft.questions.length} questions answered</p>
            </div>
          </aside>

          <section className="public-form-flow">
            {draft.questions.map((question, index) => {
              if (index >= visibleQuestionCount) {
                return null;
              }

              const answer = answers[question.id] ?? '';
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
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`public-form-option${answer === option ? ' selected' : ''}`}
                          onClick={() => handleAnswer(question, index, option)}
                        >
                          <span>{option}</span>
                        </button>
                      ))}
                    </div>
                  ) : question.type === 'short_text' ? (
                    <input
                      className="public-form-input"
                      type="text"
                      value={answer}
                      onChange={(event) => handleAnswer(question, index, event.target.value)}
                      placeholder={question.placeholder || 'Type a short answer'}
                    />
                  ) : (
                    <textarea
                      className="public-form-textarea"
                      value={answer}
                      onChange={(event) => handleAnswer(question, index, event.target.value)}
                      placeholder={question.placeholder || 'Share more detail here'}
                      rows={6}
                    />
                  )}
                </article>
              );
            })}

            {visibleQuestionCount >= draft.questions.length ? (
              <section className="public-form-summary-card">
                <span className="public-form-question-step">Summary</span>
                <h2>Your selections</h2>

                <div className="public-form-summary-list">
                  {draft.questions.map((question, index) => (
                    <div key={question.id} className="public-form-summary-row">
                      <span>Question {index + 1}</span>
                      <strong>{question.prompt}</strong>
                      <p>{answers[question.id]?.trim() || 'Waiting for a response'}</p>
                    </div>
                  ))}
                </div>

                {feedback ? <p className="feedback-inline public-profile-feedback">{feedback}</p> : null}

                <div className="public-form-submit-row">
                  <button type="button" className="public-profile-primary-button" onClick={() => router.push('/settings/form/builder')}>
                    Back to builder
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
