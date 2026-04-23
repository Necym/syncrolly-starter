import type { FormQuestionType, InquiryForm, InquiryFormDraft, InquiryFormDraftQuestion } from '@syncrolly/core';

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultOptions(): string[] {
  return ['Option 1', 'Option 2'];
}

export function createQuestion(type: FormQuestionType): InquiryFormDraftQuestion {
  if (type === 'multiple_choice') {
    return {
      id: createId(),
      type,
      prompt: 'What should we ask here?',
      placeholder: '',
      options: getDefaultOptions()
    };
  }

  if (type === 'short_text') {
    return {
      id: createId(),
      type,
      prompt: 'Add a short response question',
      placeholder: 'Type a short answer',
      options: []
    };
  }

  return {
    id: createId(),
    type,
    prompt: 'Add a long-form response question',
    placeholder: 'Share more detail here',
    options: []
  };
}

export function getDefaultFormDraft(): InquiryFormDraft {
  return {
    title: 'Curated Inquiry',
    intro: 'A thoughtful intake before the conversation starts.',
    questions: [
      {
        id: createId(),
        type: 'multiple_choice',
        prompt: 'What are you hoping to shape together?',
        placeholder: '',
        options: ['Creator profile refresh', 'Editorial site redesign', 'Client booking flow']
      },
      {
        id: createId(),
        type: 'multiple_choice',
        prompt: 'When do you want to get this moving?',
        placeholder: '',
        options: ['Immediately', 'Within 30 days', 'This quarter']
      },
      {
        id: createId(),
        type: 'multiple_choice',
        prompt: 'What budget range feels realistic?',
        placeholder: '',
        options: ['Under $1k', '$1k-$5k', '$5k-$15k']
      },
      {
        id: createId(),
        type: 'long_text',
        prompt: 'What would a great outcome feel like?',
        placeholder: 'We want a profile and booking flow that feels premium, converts better, and qualifies leads.',
        options: []
      }
    ],
    updatedAt: new Date().toISOString()
  };
}

function normalizeQuestion(
  input: Partial<InquiryFormDraftQuestion> | null | undefined,
  index: number
): InquiryFormDraftQuestion {
  const type: FormQuestionType =
    input?.type === 'multiple_choice' || input?.type === 'short_text' || input?.type === 'long_text'
      ? input.type
      : 'multiple_choice';

  const prompt =
    typeof input?.prompt === 'string' && input.prompt.trim()
      ? input.prompt.trim()
      : `Question ${index + 1}`;

  const placeholder =
    typeof input?.placeholder === 'string'
      ? input.placeholder
      : type === 'short_text'
        ? 'Type a short answer'
        : type === 'long_text'
          ? 'Share more detail here'
          : '';

  const rawOptions = Array.isArray(input?.options)
    ? input.options.filter((value): value is string => typeof value === 'string').map((value) => value.trim())
    : [];

  const options = type === 'multiple_choice'
    ? rawOptions.filter(Boolean).slice(0, 4)
    : [];

  return {
    id: typeof input?.id === 'string' && input.id ? input.id : createId(),
    type,
    prompt,
    placeholder,
    options: type === 'multiple_choice'
      ? (options.length >= 2 ? options : getDefaultOptions())
      : []
  };
}

export function normalizeFormDraft(input: Partial<InquiryFormDraft> | null | undefined): InquiryFormDraft {
  const fallbackDraft = getDefaultFormDraft();
  const rawQuestions = Array.isArray(input?.questions) ? input.questions : fallbackDraft.questions;
  const questions = rawQuestions.map((question, index) => normalizeQuestion(question, index));

  return {
    id: typeof input?.id === 'string' ? input.id : undefined,
    title:
      typeof input?.title === 'string' && input.title.trim()
        ? input.title.trim()
        : fallbackDraft.title,
    intro:
      typeof input?.intro === 'string' && input.intro.trim()
        ? input.intro.trim()
        : fallbackDraft.intro,
    questions: questions.length ? questions : fallbackDraft.questions,
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : new Date().toISOString()
  };
}

export function getDraftFromInquiryForm(form: InquiryForm): InquiryFormDraft {
  return normalizeFormDraft({
    id: form.id,
    title: form.title,
    intro: form.intro,
    updatedAt: form.updatedAt,
    questions: form.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      placeholder: question.placeholder,
      options: question.options.map((option) => option.label)
    }))
  });
}
