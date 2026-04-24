'use client';

import type { ProgramDetail, ProgramLesson } from '@syncrolly/core';
import {
  createProgramLesson,
  createProgramModule,
  getProgramDetails,
  markProgramLessonComplete,
  updateProgram
} from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProgramFallbackGradient, truncateProgramText } from '../../../lib/programs';
import { getPreferredRole, useWebSession } from '../../../lib/session';
import { Icon, getErrorMessage } from '../../ui';

type NoticeState = {
  tone: 'error' | 'success';
  message: string;
};

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return 'P';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function getLessonAssetLabel(lesson: ProgramLesson) {
  if (lesson.durationLabel?.trim()) {
    return lesson.durationLabel.trim();
  }

  if (!lesson.videoUrl) {
    return 'Draft lesson';
  }

  const lowerUrl = lesson.videoUrl.toLowerCase();

  if (lowerUrl.includes('.pdf')) {
    return 'PDF document';
  }

  if (lowerUrl.includes('.doc')) {
    return 'Document';
  }

  return 'Video lesson';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

export default function ProgramDetailPage() {
  const router = useRouter();
  const params = useParams<{ programId?: string }>();
  const programId = params.programId ?? '';
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const role = getPreferredRole(user);
  const isCreator = role === 'creator';
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);
  const [savingProgram, setSavingProgram] = useState(false);
  const [addingModule, setAddingModule] = useState(false);
  const [addingLesson, setAddingLesson] = useState(false);
  const [completingLessonId, setCompletingLessonId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleSummary, setModuleSummary] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonSummary, setLessonSummary] = useState('');
  const [lessonDuration, setLessonDuration] = useState('');
  const [lessonAssetUrl, setLessonAssetUrl] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');

  const syncProgramState = useCallback((nextProgram: ProgramDetail | null) => {
    setProgram(nextProgram);
    setDraftTitle(nextProgram?.title ?? '');
    setDraftSubtitle(nextProgram?.subtitle ?? '');
    setDraftDescription(nextProgram?.description ?? '');
    setSelectedModuleId((current) => current || nextProgram?.modules[0]?.id || '');
  }, []);

  const loadProgram = useCallback(async () => {
    if (!supabase || !user || !programId) {
      syncProgramState(null);
      return;
    }

    setLoadingProgram(true);

    try {
      const nextProgram = await getProgramDetails(supabase, user.id, role, programId);
      syncProgramState(nextProgram);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Program could not be loaded.')
      });
    } finally {
      setLoadingProgram(false);
    }
  }, [programId, role, supabase, syncProgramState, user]);

  useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  const gradient = useMemo(() => getProgramFallbackGradient(program?.title ?? 'program'), [program?.title]);
  const nextLesson = useMemo(() => program?.lessons.find((lesson) => !lesson.isCompleted) ?? null, [program]);
  const progress = Math.max(0, Math.min(100, program?.progressPercent ?? 0));

  async function handleSaveProgram() {
    if (!supabase || !user || !program || savingProgram || !isCreator) {
      return;
    }

    setSavingProgram(true);
    setFeedback(null);

    try {
      const updatedProgram = await updateProgram(supabase, {
        programId: program.id,
        creatorId: user.id,
        title: draftTitle,
        subtitle: draftSubtitle,
        description: draftDescription,
        thumbnailUrl: program.thumbnailUrl
      });

      syncProgramState(updatedProgram);
      setFeedback({
        tone: 'success',
        message: 'Program overview saved.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Program could not be saved.')
      });
    } finally {
      setSavingProgram(false);
    }
  }

  async function handleAddModule() {
    if (!supabase || !program || addingModule || !isCreator) {
      return;
    }

    setAddingModule(true);
    setFeedback(null);

    try {
      await createProgramModule(supabase, {
        programId: program.id,
        title: moduleTitle,
        summary: moduleSummary
      });
      setModuleTitle('');
      setModuleSummary('');
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: 'Module added.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Module could not be added.')
      });
    } finally {
      setAddingModule(false);
    }
  }

  async function handleAddLesson() {
    if (!supabase || !program || addingLesson || !isCreator) {
      return;
    }

    setAddingLesson(true);
    setFeedback(null);

    try {
      await createProgramLesson(supabase, {
        programId: program.id,
        moduleId: selectedModuleId || program.modules[0]?.id,
        title: lessonTitle,
        summary: lessonSummary,
        durationLabel: lessonDuration,
        videoUrl: lessonAssetUrl
      });
      setLessonTitle('');
      setLessonSummary('');
      setLessonDuration('');
      setLessonAssetUrl('');
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: 'Lesson added.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Lesson could not be added.')
      });
    } finally {
      setAddingLesson(false);
    }
  }

  async function handleCompleteLesson(lessonId: string) {
    if (!supabase || !user || completingLessonId || isCreator) {
      return;
    }

    setCompletingLessonId(lessonId);
    setFeedback(null);

    try {
      await markProgramLessonComplete(supabase, {
        lessonId,
        studentId: user.id
      });
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: 'Lesson marked complete.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Lesson progress could not be saved.')
      });
    } finally {
      setCompletingLessonId(null);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <main className="program-detail-page">
        <div className="program-studio-empty">
          <p>Program</p>
          <h1>Connect Supabase to view programs.</h1>
        </div>
      </main>
    );
  }

  if (sessionLoading || loadingProgram) {
    return (
      <main className="program-detail-page">
        <div className="program-studio-skeleton">
          <div />
          <div />
          <div />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="program-detail-page">
        <div className="program-studio-empty">
          <p>Program</p>
          <h1>Sign in to view this program.</h1>
        </div>
      </main>
    );
  }

  if (!program) {
    return (
      <main className="program-detail-page">
        <div className="program-studio-empty">
          <p>Program</p>
          <h1>Program not found.</h1>
          <button type="button" className="program-studio-primary-button" onClick={() => router.push('/program-studio')}>
            Back to Program Studio
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="program-detail-page">
      <div className="program-studio-orb program-studio-orb-one" />
      <div className="program-studio-orb program-studio-orb-two" />

      <header className="program-studio-topbar">
        <button type="button" className="program-studio-back" onClick={() => router.push('/program-studio')}>
          <Icon name="back" />
          <span>Program Studio</span>
        </button>
        <button type="button" className="program-studio-ghost-button" onClick={() => router.push('/')}>
          Messages
        </button>
      </header>

      <section className="program-detail-hero">
        <div className="program-detail-art">
          {program.thumbnailUrl ? (
            <img src={program.thumbnailUrl} alt="" />
          ) : (
            <div
              className="program-detail-gradient"
              style={{
                background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`
              }}
            >
              <span>{getInitials(program.title)}</span>
            </div>
          )}
        </div>

        <div className="program-detail-hero-copy">
          <p>{isCreator ? 'Creator program' : program.creatorName}</p>
          <h1>{program.title}</h1>
          <span>{program.subtitle || truncateProgramText(program.description || 'Structured lessons for supporters.', 180)}</span>
          <div className="program-detail-stat-row">
            <MetricPill label="Modules" value={String(program.moduleCount)} />
            <MetricPill label="Lessons" value={String(program.lessonCount)} />
            <MetricPill label={isCreator ? 'Learners' : 'Progress'} value={isCreator ? String(program.enrolledCount) : `${progress}%`} />
          </div>
        </div>

        <div className="program-detail-progress-card">
          <span>{isCreator ? 'Live structure' : 'Your progress'}</span>
          <strong>{progress}%</strong>
          <div className="program-studio-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
          <p>{nextLesson ? `Next: ${nextLesson.title}` : program.lessonCount ? 'All lessons complete.' : 'Add the first lesson to begin.'}</p>
        </div>
      </section>

      {feedback ? <div className={`program-studio-notice ${feedback.tone}`}>{feedback.message}</div> : null}

      <section className="program-detail-layout">
        <div className="program-detail-main">
          <div className="program-studio-section-heading">
            <span>Curriculum</span>
            <p>{program.description || 'No program description yet.'}</p>
          </div>

          <div className="program-detail-module-list">
            {program.modules.map((module, index) => (
              <article key={module.id} className="program-detail-module">
                <div className="program-detail-module-header">
                  <span>Module {index + 1}</span>
                  <strong>{module.title}</strong>
                  {module.summary ? <p>{module.summary}</p> : null}
                </div>

                {module.lessons.length ? (
                  <div className="program-detail-lesson-list">
                    {module.lessons.map((lesson) => (
                      <div key={lesson.id} className={`program-detail-lesson${lesson.isCompleted ? ' completed' : ''}`}>
                        <div className="program-detail-lesson-index">{lesson.isCompleted ? '✓' : lesson.position + 1}</div>
                        <div className="program-detail-lesson-copy">
                          <strong>{lesson.title}</strong>
                          <span>{lesson.summary || getLessonAssetLabel(lesson)}</span>
                          <small>{getLessonAssetLabel(lesson)}</small>
                        </div>
                        {!isCreator && !lesson.isCompleted ? (
                          <button
                            type="button"
                            className="program-detail-complete-button"
                            onClick={() => handleCompleteLesson(lesson.id)}
                            disabled={completingLessonId === lesson.id}
                          >
                            {completingLessonId === lesson.id ? 'Saving' : 'Complete'}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="program-detail-empty-module">No lessons in this module yet.</div>
                )}
              </article>
            ))}
          </div>
        </div>

        <aside className="program-detail-rail">
          {isCreator ? (
            <>
              <section className="program-detail-control-panel">
                <p>Program overview</p>
                <label>
                  Title
                  <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                </label>
                <label>
                  Subtitle
                  <input value={draftSubtitle} onChange={(event) => setDraftSubtitle(event.target.value)} />
                </label>
                <label>
                  Description
                  <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={5} />
                </label>
                <button type="button" className="program-studio-primary-button" onClick={handleSaveProgram} disabled={savingProgram}>
                  {savingProgram ? 'Saving' : 'Save overview'}
                </button>
              </section>

              <section className="program-detail-control-panel">
                <p>Add module</p>
                <label>
                  Module title
                  <input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="Foundations" />
                </label>
                <label>
                  Summary
                  <textarea value={moduleSummary} onChange={(event) => setModuleSummary(event.target.value)} rows={3} />
                </label>
                <button type="button" className="program-studio-ghost-button" onClick={handleAddModule} disabled={addingModule}>
                  {addingModule ? 'Adding' : 'Add module'}
                </button>
              </section>

              <section className="program-detail-control-panel">
                <p>Add lesson</p>
                <label>
                  Module
                  <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>
                    {program.modules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Lesson title
                  <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="Lesson title" />
                </label>
                <label>
                  Summary
                  <textarea value={lessonSummary} onChange={(event) => setLessonSummary(event.target.value)} rows={3} />
                </label>
                <label>
                  Duration
                  <input value={lessonDuration} onChange={(event) => setLessonDuration(event.target.value)} placeholder="8 min" />
                </label>
                <label>
                  Asset URL
                  <input value={lessonAssetUrl} onChange={(event) => setLessonAssetUrl(event.target.value)} placeholder="Video or document URL" />
                </label>
                <button type="button" className="program-studio-primary-button" onClick={handleAddLesson} disabled={addingLesson}>
                  {addingLesson ? 'Adding' : 'Add lesson'}
                </button>
              </section>

              <section className="program-detail-control-panel">
                <p>Learners</p>
                {program.learners.length ? (
                  <div className="program-detail-learner-list">
                    {program.learners.map((learner) => (
                      <div key={learner.enrollmentId} className="program-detail-learner-row">
                        <span>{getInitials(learner.displayName)}</span>
                        <div>
                          <strong>{learner.displayName}</strong>
                          <small>
                            {learner.progressPercent}% complete · enrolled {formatDate(learner.enrolledAt)}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="program-detail-muted">No learners enrolled yet.</span>
                )}
              </section>
            </>
          ) : (
            <section className="program-detail-control-panel">
              <p>Learning path</p>
              <strong>{nextLesson ? nextLesson.title : 'You are caught up'}</strong>
              <span className="program-detail-muted">
                {nextLesson ? nextLesson.summary || getLessonAssetLabel(nextLesson) : 'Every available lesson has been completed.'}
              </span>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="program-detail-stat-pill">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
