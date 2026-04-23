'use client';

import { type FormQuestionType, type InquiryFormDraft, type InquiryFormDraftQuestion } from '@syncrolly/core';
import { getCreatorInquiryForm, saveCreatorInquiryForm } from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createQuestion, getDefaultFormDraft, getDraftFromInquiryForm, normalizeFormDraft } from '../../../../lib/formBuilder';
import { useWebSession } from '../../../../lib/session';
import { BrandMark, Icon, getErrorMessage } from '../../../ui';

function getQuestionTypeLabel(type: FormQuestionType): string {
  if (type === 'multiple_choice') {
    return 'Multiple choice';
  }

  if (type === 'short_text') {
    return 'Short text';
  }

  return 'Long form';
}

function getQuestionTypeHint(type: FormQuestionType): string {
  if (type === 'multiple_choice') {
    return 'Choose up to four options for this prompt.';
  }

  if (type === 'short_text') {
    return 'Single-line response. Best for quick factual answers.';
  }

  return 'Larger text area for thoughtful responses.';
}

export default function FormBuilderPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [draft, setDraft] = useState<InquiryFormDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

        setDraft(savedForm ? getDraftFromInquiryForm(savedForm) : getDefaultFormDraft());
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

  function updateDraft(updater: (current: InquiryFormDraft) => InquiryFormDraft) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return updater(current);
    });
  }

  function updateQuestion(questionId: string, updater: (question: InquiryFormDraftQuestion) => InquiryFormDraftQuestion) {
    updateDraft((current) => ({
      ...current,
      questions: current.questions.map((question) => (question.id === questionId ? updater(question) : question))
    }));
  }

  function handleQuestionTypeChange(questionId: string, type: FormQuestionType) {
    updateQuestion(questionId, (question) => ({
      ...question,
      type,
      placeholder:
        type === 'multiple_choice'
          ? ''
          : type === 'short_text'
            ? question.placeholder || 'Type a short answer'
            : question.placeholder || 'Share more detail here',
      options:
        type === 'multiple_choice'
          ? (question.options.length ? question.options.slice(0, 4) : ['Option 1', 'Option 2'])
          : []
    }));
  }

  function handleAddQuestion(type: FormQuestionType) {
    updateDraft((current) => ({
      ...current,
      questions: [...current.questions, createQuestion(type)]
    }));
  }

  function handleRemoveQuestion(questionId: string) {
    updateDraft((current) => ({
      ...current,
      questions: current.questions.length <= 1 ? current.questions : current.questions.filter((question) => question.id !== questionId)
    }));
  }

  function handleAddOption(questionId: string) {
    updateQuestion(questionId, (question) => ({
      ...question,
      options: question.options.length >= 4 ? question.options : [...question.options, `Option ${question.options.length + 1}`]
    }));
  }

  function handleRemoveOption(questionId: string, optionIndex: number) {
    updateQuestion(questionId, (question) => ({
      ...question,
      options:
        question.options.length <= 2 ? question.options : question.options.filter((_, index) => index !== optionIndex)
    }));
  }

  async function handleSave() {
    if (!draft || !supabase || !user || saving) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const normalizedDraft = normalizeFormDraft(draft);
      const savedForm = await saveCreatorInquiryForm(supabase, {
        creatorId: user.id,
        title: normalizedDraft.title,
        intro: normalizedDraft.intro,
        questions: normalizedDraft.questions
      });

      setDraft(getDraftFromInquiryForm(savedForm));
      setFeedback('Form saved to Supabase.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSaving(false);
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
            <h1 className="stage-title">Build form</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to build real forms.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loading || !draft) {
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
            <p className="stage-body">Loading form builder...</p>
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
            <h1 className="stage-title">Build form</h1>
            <p className="stage-body">Sign in to build and save inquiry forms.</p>
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

          <button type="button" className="settings-link-chip" onClick={() => router.push('/settings/form/preview')}>
            Preview
          </button>
        </div>
      </header>

      <main className="form-builder-main">
        <div className="form-builder-shell">
          <section className="form-builder-intro-card">
            <span className="public-form-kicker">Form Tools</span>
            <h1>Build inquiry form</h1>
            <p>
              This saves the creator&apos;s live form in Supabase, so preview and submissions use the same source of truth.
            </p>
          </section>

          <section className="form-builder-meta-card">
            <label className="form-builder-field">
              <span>Form title</span>
              <input
                className="form-builder-input"
                type="text"
                value={draft.title}
                onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Curated Inquiry"
              />
            </label>

            <label className="form-builder-field">
              <span>Intro</span>
              <textarea
                className="form-builder-textarea intro"
                value={draft.intro}
                onChange={(event) => updateDraft((current) => ({ ...current, intro: event.target.value }))}
                placeholder="Set the tone before the first question."
                rows={4}
              />
            </label>
          </section>

          <section className="form-builder-stack">
            {draft.questions.map((question, index) => (
              <article key={question.id} className="form-builder-question-card">
                <div className="form-builder-question-header">
                  <div className="form-builder-question-meta">
                    <span>Question {index + 1}</span>
                    <p>{getQuestionTypeHint(question.type)}</p>
                  </div>

                  <button
                    type="button"
                    className={`form-builder-icon-button${draft.questions.length <= 1 ? ' disabled' : ''}`}
                    onClick={() => handleRemoveQuestion(question.id)}
                    disabled={draft.questions.length <= 1}
                  >
                    <Icon name="close" />
                  </button>
                </div>

                <input
                  className="form-builder-prompt-input"
                  type="text"
                  value={question.prompt}
                  onChange={(event) => {
                    updateQuestion(question.id, (current) => ({
                      ...current,
                      prompt: event.target.value
                    }));
                  }}
                  placeholder="Question prompt"
                />

                <div className="form-builder-type-row">
                  {(['multiple_choice', 'short_text', 'long_text'] as const).map((type) => {
                    const isSelected = question.type === type;

                    return (
                      <button
                        key={type}
                        type="button"
                        className={`form-builder-type-chip${isSelected ? ' active' : ''}`}
                        onClick={() => handleQuestionTypeChange(question.id, type)}
                      >
                        {getQuestionTypeLabel(type)}
                      </button>
                    );
                  })}
                </div>

                {question.type === 'multiple_choice' ? (
                  <div className="form-builder-option-stack">
                    {question.options.map((option, optionIndex) => (
                      <div key={`${question.id}-${optionIndex}`} className="form-builder-option-row">
                        <input
                          className="form-builder-input"
                          type="text"
                          value={option}
                          onChange={(event) => {
                            updateQuestion(question.id, (current) => ({
                              ...current,
                              options: current.options.map((currentOption, currentIndex) =>
                                currentIndex === optionIndex ? event.target.value : currentOption
                              )
                            }));
                          }}
                          placeholder={`Option ${optionIndex + 1}`}
                        />

                        <button
                          type="button"
                          className={`form-builder-icon-button${question.options.length <= 2 ? ' disabled' : ''}`}
                          onClick={() => handleRemoveOption(question.id, optionIndex)}
                          disabled={question.options.length <= 2}
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className={`form-builder-add-option${question.options.length >= 4 ? ' disabled' : ''}`}
                      onClick={() => handleAddOption(question.id)}
                      disabled={question.options.length >= 4}
                    >
                      {question.options.length >= 4 ? 'Maximum options reached' : 'Add option'}
                    </button>
                  </div>
                ) : (
                  <textarea
                    className="form-builder-textarea"
                    value={question.placeholder}
                    onChange={(event) => {
                      updateQuestion(question.id, (current) => ({
                        ...current,
                        placeholder: event.target.value
                      }));
                    }}
                    placeholder={question.type === 'short_text' ? 'Short answer placeholder' : 'Long-form placeholder'}
                    rows={question.type === 'long_text' ? 4 : 2}
                  />
                )}
              </article>
            ))}
          </section>

          <section className="form-builder-add-card">
            <h2>Add question</h2>
            <p>Drop in another step whenever you want to expand the form.</p>

            <div className="form-builder-add-row">
              {(['multiple_choice', 'short_text', 'long_text'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="form-builder-add-button"
                  onClick={() => handleAddQuestion(type)}
                >
                  {getQuestionTypeLabel(type)}
                </button>
              ))}
            </div>
          </section>

          {feedback ? <p className="feedback-text">{feedback}</p> : null}

          <button type="button" className="primary-action form-builder-save-button" onClick={handleSave} disabled={saving}>
            {saving ? <span className="button-spinner" aria-hidden="true" /> : null}
            <span>Save form</span>
          </button>
        </div>
      </main>
    </div>
  );
}
