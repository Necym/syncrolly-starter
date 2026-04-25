'use client';

import type { ProgramDetail, ProgramLesson, ProgramModule } from '@syncrolly/core';
import {
  createProgramLesson,
  createProgramModule,
  deleteProgramLesson,
  deleteProgramModule,
  getProgramDetails,
  markProgramLessonComplete,
  reorderProgramLesson,
  reorderProgramModule,
  updateProgram,
  updateProgramLesson,
  updateProgramModule,
  uploadProgramThumbnail
} from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProgramFallbackGradient } from '../../../lib/programs';
import { getPreferredRole, useWebSession } from '../../../lib/session';
import { Icon, getErrorMessage } from '../../ui';

type NoticeState = {
  tone: 'error' | 'success';
  message: string;
};

type ModuleDrafts = Record<
  string,
  {
    title: string;
    summary: string;
  }
>;

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

function getLessonKind(lesson: ProgramLesson) {
  const lowerUrl = lesson.videoUrl?.toLowerCase() ?? '';

  if (!lowerUrl) {
    return 'Draft';
  }

  if (lowerUrl.includes('.pdf') || lowerUrl.includes('.doc')) {
    return 'Reading';
  }

  return 'Video';
}

function getLessonMeta(lesson: ProgramLesson) {
  return `${getLessonKind(lesson)} - ${getLessonAssetLabel(lesson)}`;
}

function getProgramDurationSummary(program: ProgramDetail) {
  if (!program.lessonCount) {
    return 'Add lessons';
  }

  const durationLabels = program.lessons.map((lesson) => lesson.durationLabel?.trim()).filter(Boolean);

  if (!durationLabels.length) {
    return `${program.moduleCount} modules - ${program.lessonCount} lessons`;
  }

  return durationLabels.length === program.lessonCount
    ? durationLabels.join(' + ')
    : `${durationLabels.join(' + ')} + ${program.lessonCount - durationLabels.length} drafts`;
}

function getModuleDurationSummary(module: ProgramModule) {
  if (!module.lessons.length) {
    return 'No lessons yet';
  }

  const durationLabels = module.lessons.map((lesson) => lesson.durationLabel?.trim()).filter(Boolean);

  if (!durationLabels.length) {
    return 'Duration unset';
  }

  return durationLabels.length === module.lessonCount
    ? durationLabels.join(' + ')
    : `${durationLabels.join(' + ')} + ${module.lessonCount - durationLabels.length} drafts`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function getFileExtension(file: File) {
  const extension = file.name.split('.').pop()?.trim();

  if (extension) {
    return extension.toLowerCase();
  }

  if (file.type.includes('png')) {
    return 'png';
  }

  if (file.type.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

export default function ProgramDetailPage() {
  const router = useRouter();
  const params = useParams<{ programId?: string }>();
  const programId = params.programId ?? '';
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const role = getPreferredRole(user);
  const isCreator = role === 'creator';
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);
  const [savingProgram, setSavingProgram] = useState(false);
  const [addingModule, setAddingModule] = useState(false);
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null);
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);
  const [movingModuleId, setMovingModuleId] = useState<string | null>(null);
  const [addingLesson, setAddingLesson] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [movingLessonId, setMovingLessonId] = useState<string | null>(null);
  const [completingLessonId, setCompletingLessonId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftThumbnailUrl, setDraftThumbnailUrl] = useState('');
  const [pendingThumbnailFile, setPendingThumbnailFile] = useState<File | null>(null);
  const [pendingThumbnailPreview, setPendingThumbnailPreview] = useState('');
  const [moduleDrafts, setModuleDrafts] = useState<ModuleDrafts>({});
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(() => new Set());
  const [showAddModule, setShowAddModule] = useState(false);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleSummary, setModuleSummary] = useState('');
  const [activeLessonComposerModuleId, setActiveLessonComposerModuleId] = useState('');
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
    setDraftThumbnailUrl(nextProgram?.thumbnailUrl ?? '');
    setPendingThumbnailFile(null);
    setPendingThumbnailPreview('');
    setSelectedModuleId((current) => current || nextProgram?.modules[0]?.id || '');
    setModuleDrafts(
      Object.fromEntries(
        (nextProgram?.modules ?? []).map((module) => [
          module.id,
          {
            title: module.title,
            summary: module.summary
          }
        ])
      )
    );
    setExpandedModuleIds((current) => {
      const moduleIds = new Set((nextProgram?.modules ?? []).map((module) => module.id));
      const nextExpanded = new Set([...current].filter((moduleId) => moduleIds.has(moduleId)));

      if (!nextExpanded.size && nextProgram?.modules[0]) {
        nextExpanded.add(nextProgram.modules[0].id);
      }

      return nextExpanded;
    });
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

  useEffect(() => {
    return () => {
      if (pendingThumbnailPreview) {
        URL.revokeObjectURL(pendingThumbnailPreview);
      }
    };
  }, [pendingThumbnailPreview]);

  const gradient = useMemo(() => getProgramFallbackGradient(program?.title ?? 'program'), [program?.title]);
  const progress = Math.max(0, Math.min(100, program?.progressPercent ?? 0));
  const thumbnailPreview = pendingThumbnailPreview || draftThumbnailUrl || program?.thumbnailUrl || '';

  function clearLessonComposer() {
    setEditingLessonId(null);
    setActiveLessonComposerModuleId('');
    setLessonTitle('');
    setLessonSummary('');
    setLessonDuration('');
    setLessonAssetUrl('');
  }

  async function handleSaveProgram() {
    if (!supabase || !user || !program || savingProgram || !isCreator) {
      return;
    }

    setSavingProgram(true);
    setFeedback(null);

    try {
      let nextThumbnailUrl = draftThumbnailUrl.trim() || undefined;

      if (pendingThumbnailFile) {
        nextThumbnailUrl = await uploadProgramThumbnail(supabase, {
          userId: user.id,
          fileData: await pendingThumbnailFile.arrayBuffer(),
          contentType: pendingThumbnailFile.type || 'image/jpeg',
          fileExtension: getFileExtension(pendingThumbnailFile)
        });
      }

      const updatedProgram = await updateProgram(supabase, {
        programId: program.id,
        creatorId: user.id,
        title: draftTitle,
        subtitle: draftSubtitle,
        description: draftDescription,
        thumbnailUrl: nextThumbnailUrl
      });

      syncProgramState(updatedProgram);
      setFeedback({
        tone: 'success',
        message: 'Program details saved.'
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

  function handleThumbnailFileChange(file: File | null) {
    if (!file) {
      return;
    }

    if (pendingThumbnailPreview) {
      URL.revokeObjectURL(pendingThumbnailPreview);
    }

    setPendingThumbnailFile(file);
    setPendingThumbnailPreview(URL.createObjectURL(file));
  }

  function handleRemoveThumbnail() {
    if (pendingThumbnailPreview) {
      URL.revokeObjectURL(pendingThumbnailPreview);
    }

    setPendingThumbnailFile(null);
    setPendingThumbnailPreview('');
    setDraftThumbnailUrl('');

    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = '';
    }
  }

  async function handleAddModule() {
    if (!supabase || !program || addingModule || !isCreator) {
      return;
    }

    setAddingModule(true);
    setFeedback(null);

    try {
      const createdModule = await createProgramModule(supabase, {
        programId: program.id,
        title: moduleTitle,
        summary: moduleSummary
      });
      setModuleTitle('');
      setModuleSummary('');
      setShowAddModule(false);
      setExpandedModuleIds((current) => new Set(current).add(createdModule.id));
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

  async function handleSaveModule(module: ProgramModule) {
    if (!supabase || !isCreator || savingModuleId) {
      return;
    }

    const draft = moduleDrafts[module.id] ?? {
      title: module.title,
      summary: module.summary
    };

    setSavingModuleId(module.id);
    setFeedback(null);

    try {
      await updateProgramModule(supabase, {
        moduleId: module.id,
        title: draft.title,
        summary: draft.summary
      });
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: 'Module updated.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Module could not be updated.')
      });
    } finally {
      setSavingModuleId(null);
    }
  }

  async function handleDeleteModule(module: ProgramModule) {
    if (!supabase || !program || !isCreator || deletingModuleId) {
      return;
    }

    if (!window.confirm(`Delete "${module.title}" and its lessons?`)) {
      return;
    }

    setDeletingModuleId(module.id);
    setFeedback(null);

    try {
      await deleteProgramModule(supabase, {
        programId: program.id,
        moduleId: module.id
      });
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: 'Module deleted.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Module could not be deleted.')
      });
    } finally {
      setDeletingModuleId(null);
    }
  }

  async function handleMoveModule(module: ProgramModule, direction: -1 | 1) {
    if (!supabase || !program || !isCreator || movingModuleId) {
      return;
    }

    const modules = [...program.modules].sort((left, right) => left.position - right.position);
    const moduleIndex = modules.findIndex((candidate) => candidate.id === module.id);
    const swapModule = modules[moduleIndex + direction];

    if (!swapModule) {
      return;
    }

    setMovingModuleId(module.id);
    setFeedback(null);

    try {
      await reorderProgramModule(supabase, {
        moduleId: module.id,
        swapModuleId: swapModule.id,
        currentPosition: module.position,
        targetPosition: swapModule.position
      });
      await loadProgram();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Module order could not be updated.')
      });
    } finally {
      setMovingModuleId(null);
    }
  }

  function handleOpenLessonComposer(moduleId: string) {
    setEditingLessonId(null);
    setSelectedModuleId(moduleId);
    setActiveLessonComposerModuleId(moduleId);
    setLessonTitle('');
    setLessonSummary('');
    setLessonDuration('');
    setLessonAssetUrl('');
  }

  function handleEditLesson(lesson: ProgramLesson) {
    setEditingLessonId(lesson.id);
    setSelectedModuleId(lesson.moduleId);
    setActiveLessonComposerModuleId(lesson.moduleId);
    setLessonTitle(lesson.title);
    setLessonSummary(lesson.summary);
    setLessonDuration(lesson.durationLabel ?? '');
    setLessonAssetUrl(lesson.videoUrl ?? '');
  }

  async function handleSaveLesson() {
    if (!supabase || !program || addingLesson || !isCreator) {
      return;
    }

    setAddingLesson(true);
    setFeedback(null);

    try {
      if (editingLessonId) {
        await updateProgramLesson(supabase, {
          lessonId: editingLessonId,
          moduleId: selectedModuleId || activeLessonComposerModuleId || program.modules[0]?.id,
          title: lessonTitle,
          summary: lessonSummary,
          durationLabel: lessonDuration,
          videoUrl: lessonAssetUrl
        });
      } else {
        await createProgramLesson(supabase, {
          programId: program.id,
          moduleId: selectedModuleId || activeLessonComposerModuleId || program.modules[0]?.id,
          title: lessonTitle,
          summary: lessonSummary,
          durationLabel: lessonDuration,
          videoUrl: lessonAssetUrl
        });
      }

      clearLessonComposer();
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: editingLessonId ? 'Lesson updated.' : 'Lesson added.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, editingLessonId ? 'Lesson could not be updated.' : 'Lesson could not be added.')
      });
    } finally {
      setAddingLesson(false);
    }
  }

  async function handleDeleteLesson(lesson: ProgramLesson) {
    if (!supabase || !isCreator || deletingLessonId) {
      return;
    }

    if (!window.confirm(`Delete "${lesson.title}"?`)) {
      return;
    }

    setDeletingLessonId(lesson.id);
    setFeedback(null);

    try {
      await deleteProgramLesson(supabase, {
        lessonId: lesson.id
      });
      if (editingLessonId === lesson.id) {
        clearLessonComposer();
      }
      await loadProgram();
      setFeedback({
        tone: 'success',
        message: 'Lesson deleted.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Lesson could not be deleted.')
      });
    } finally {
      setDeletingLessonId(null);
    }
  }

  async function handleMoveLesson(module: ProgramModule, lesson: ProgramLesson, direction: -1 | 1) {
    if (!supabase || !isCreator || movingLessonId) {
      return;
    }

    const lessons = [...module.lessons].sort((left, right) => left.position - right.position);
    const lessonIndex = lessons.findIndex((candidate) => candidate.id === lesson.id);
    const swapLesson = lessons[lessonIndex + direction];

    if (!swapLesson) {
      return;
    }

    setMovingLessonId(lesson.id);
    setFeedback(null);

    try {
      await reorderProgramLesson(supabase, {
        lessonId: lesson.id,
        swapLessonId: swapLesson.id,
        currentPosition: lesson.position,
        targetPosition: swapLesson.position
      });
      await loadProgram();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Lesson order could not be updated.')
      });
    } finally {
      setMovingLessonId(null);
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
      <main className="program-detail-page program-builder-page">
        <div className="program-studio-empty">
          <p>Program</p>
          <h1>Connect Supabase to view programs.</h1>
        </div>
      </main>
    );
  }

  if (sessionLoading || loadingProgram) {
    return (
      <main className="program-detail-page program-builder-page">
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
      <main className="program-detail-page program-builder-page">
        <div className="program-studio-empty">
          <p>Program</p>
          <h1>Sign in to view this program.</h1>
        </div>
      </main>
    );
  }

  if (!program) {
    return (
      <main className="program-detail-page program-builder-page">
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
    <main className="program-detail-page program-builder-page">
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

      <section className="program-builder-heading">
        <div>
          <h1>{isCreator ? 'Program Builder' : program.title}</h1>
          <p>{isCreator ? 'Design and structure your educational content.' : program.subtitle || 'Continue your program.'}</p>
        </div>
        {isCreator ? (
          <div className="program-builder-heading-actions">
            <button type="button" className="program-builder-secondary-button" onClick={handleSaveProgram} disabled={savingProgram}>
              {savingProgram ? 'Saving' : 'Save Draft'}
            </button>
            <button type="button" className="program-builder-primary-button" onClick={handleSaveProgram} disabled={savingProgram}>
              {savingProgram ? 'Publishing' : 'Publish'}
            </button>
          </div>
        ) : null}
      </section>

      {feedback ? <div className={`program-studio-notice ${feedback.tone}`}>{feedback.message}</div> : null}

      <section className="program-builder-grid">
        <aside className="program-builder-card program-builder-details-card">
          <div className="program-builder-card-title">
            <span className="program-builder-title-icon">i</span>
            <h2>Program Details</h2>
          </div>

          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/*"
            className="program-builder-file-input"
            onChange={(event) => handleThumbnailFileChange(event.target.files?.[0] ?? null)}
          />

          <div className="program-builder-thumbnail">
            <div className="program-builder-thumbnail-preview">
              {thumbnailPreview ? (
                <img src={thumbnailPreview} alt="" />
              ) : (
                <div
                  className="program-builder-thumbnail-gradient"
                  style={{
                    background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`
                  }}
                >
                  <span>{getInitials(program.title)}</span>
                </div>
              )}
            </div>
            {isCreator ? (
              <div className="program-builder-thumbnail-actions">
                <button type="button" onClick={() => thumbnailInputRef.current?.click()}>
                  Change thumbnail
                </button>
                <button type="button" onClick={handleRemoveThumbnail}>
                  Use gradient
                </button>
              </div>
            ) : null}
          </div>

          <label className="program-builder-field">
            Program Name
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={!isCreator} />
          </label>

          <label className="program-builder-field">
            Subtitle
            <input value={draftSubtitle} onChange={(event) => setDraftSubtitle(event.target.value)} disabled={!isCreator} />
          </label>

          <label className="program-builder-field">
            Description
            <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={6} disabled={!isCreator} />
          </label>

          <div className="program-builder-detail-divider" />

          <div className="program-builder-duration-row">
            <span>Estimated Duration</span>
            <strong>{getProgramDurationSummary(program)}</strong>
          </div>

          {!isCreator ? (
            <div className="program-builder-progress-card">
              <span>Your progress</span>
              <strong>{progress}%</strong>
              <div className="program-studio-progress">
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
        </aside>

        <section className="program-builder-card program-builder-curriculum-card">
          <div className="program-builder-curriculum-header">
            <div className="program-builder-card-title">
              <span className="program-builder-title-icon grid">#</span>
              <h2>Modular Curriculum</h2>
            </div>
            {isCreator ? (
              <button type="button" className="program-builder-add-module-button" onClick={() => setShowAddModule((current) => !current)}>
                <span>+</span>
                Add Module
              </button>
            ) : null}
          </div>

          {showAddModule && isCreator ? (
            <div className="program-builder-add-module-panel">
              <label className="program-builder-field">
                Module title
                <input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="Strategic foundations" />
              </label>
              <label className="program-builder-field">
                Module summary
                <textarea value={moduleSummary} onChange={(event) => setModuleSummary(event.target.value)} rows={3} />
              </label>
              <div className="program-builder-inline-actions">
                <button type="button" className="program-builder-secondary-button" onClick={() => setShowAddModule(false)}>
                  Cancel
                </button>
                <button type="button" className="program-builder-primary-button" onClick={handleAddModule} disabled={addingModule}>
                  {addingModule ? 'Adding' : 'Add Module'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="program-builder-module-list">
            {program.modules.map((module, moduleIndex) => {
              const isExpanded = expandedModuleIds.has(module.id);
              const moduleDraft = moduleDrafts[module.id] ?? {
                title: module.title,
                summary: module.summary
              };

              return (
                <article key={module.id} className={`program-builder-module-card${isExpanded ? ' expanded' : ''}`}>
                  <div className="program-builder-module-header">
                    <span className="program-builder-drag-handle">::</span>
                    <button
                      type="button"
                      className="program-builder-expand-button"
                      onClick={() =>
                        setExpandedModuleIds((current) => {
                          const nextExpanded = new Set(current);

                          if (nextExpanded.has(module.id)) {
                            nextExpanded.delete(module.id);
                          } else {
                            nextExpanded.add(module.id);
                          }

                          return nextExpanded;
                        })
                      }
                      aria-label={isExpanded ? 'Collapse module' : 'Expand module'}
                    >
                      {isExpanded ? 'v' : '>'}
                    </button>
                    <div className="program-builder-module-title">
                      {isCreator ? (
                        <div className="program-builder-module-title-edit">
                          <span>Module {moduleIndex + 1}:</span>
                          <input
                            value={moduleDraft.title}
                            onChange={(event) =>
                              setModuleDrafts((current) => ({
                                ...current,
                                [module.id]: {
                                  ...moduleDraft,
                                  title: event.target.value
                                }
                              }))
                            }
                          />
                        </div>
                      ) : (
                        <strong>
                          Module {moduleIndex + 1}: {module.title}
                        </strong>
                      )}
                      {!isExpanded ? <small>{module.lessonCount} lessons - {getModuleDurationSummary(module)}</small> : null}
                    </div>
                    {isCreator ? (
                      <div className="program-builder-module-actions">
                        <button type="button" onClick={() => handleMoveModule(module, -1)} disabled={moduleIndex === 0 || movingModuleId === module.id}>
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveModule(module, 1)}
                          disabled={moduleIndex === program.modules.length - 1 || movingModuleId === module.id}
                        >
                          Down
                        </button>
                        <button type="button" onClick={() => handleSaveModule(module)} disabled={savingModuleId === module.id}>
                          {savingModuleId === module.id ? 'Saving' : 'Save'}
                        </button>
                        <button type="button" onClick={() => handleDeleteModule(module)} disabled={deletingModuleId === module.id}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="program-builder-module-body">
                      {isCreator ? (
                        <label className="program-builder-field compact">
                          Module summary
                          <textarea
                            value={moduleDraft.summary}
                            onChange={(event) =>
                              setModuleDrafts((current) => ({
                                ...current,
                                [module.id]: {
                                  ...moduleDraft,
                                  summary: event.target.value
                                }
                              }))
                            }
                            rows={2}
                            placeholder="What this module helps the learner accomplish."
                          />
                        </label>
                      ) : module.summary ? (
                        <p className="program-builder-module-summary">{module.summary}</p>
                      ) : null}

                      <div className="program-builder-lesson-list">
                        {module.lessons.map((lesson, lessonIndex) => (
                          <div key={lesson.id} className={`program-builder-lesson-row${lesson.isCompleted ? ' completed' : ''}`}>
                            <span className="program-builder-lesson-drag">::</span>
                            <span
                              className={`program-builder-lesson-icon ${getLessonKind(lesson) === 'Reading' ? 'reading' : 'video'}`}
                              aria-hidden="true"
                            />
                            <div className="program-builder-lesson-copy">
                              <strong>{lesson.title}</strong>
                              <small>{getLessonMeta(lesson)}</small>
                              {lesson.summary ? <p>{lesson.summary}</p> : null}
                            </div>
                            {isCreator ? (
                              <div className="program-builder-lesson-actions">
                                <button
                                  type="button"
                                  onClick={() => handleMoveLesson(module, lesson, -1)}
                                  disabled={lessonIndex === 0 || movingLessonId === lesson.id}
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLesson(module, lesson, 1)}
                                  disabled={lessonIndex === module.lessons.length - 1 || movingLessonId === lesson.id}
                                >
                                  Down
                                </button>
                                <button type="button" onClick={() => handleEditLesson(lesson)}>
                                  Edit
                                </button>
                                <button type="button" onClick={() => handleDeleteLesson(lesson)} disabled={deletingLessonId === lesson.id}>
                                  Delete
                                </button>
                              </div>
                            ) : !lesson.isCompleted ? (
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

                      {activeLessonComposerModuleId === module.id && isCreator ? (
                        <div className="program-builder-lesson-composer">
                          <label className="program-builder-field">
                            Module
                            <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>
                              {program.modules.map((nextModule) => (
                                <option key={nextModule.id} value={nextModule.id}>
                                  {nextModule.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="program-builder-field">
                            Lesson title
                            <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="Visionary thinking" />
                          </label>
                          <label className="program-builder-field">
                            Summary
                            <textarea value={lessonSummary} onChange={(event) => setLessonSummary(event.target.value)} rows={3} />
                          </label>
                          <div className="program-builder-two-fields">
                            <label className="program-builder-field">
                              Duration
                              <input value={lessonDuration} onChange={(event) => setLessonDuration(event.target.value)} placeholder="12:45" />
                            </label>
                            <label className="program-builder-field">
                              Asset URL
                              <input value={lessonAssetUrl} onChange={(event) => setLessonAssetUrl(event.target.value)} placeholder="Video or document URL" />
                            </label>
                          </div>
                          <div className="program-builder-inline-actions">
                            <button type="button" className="program-builder-secondary-button" onClick={clearLessonComposer}>
                              Cancel
                            </button>
                            <button type="button" className="program-builder-primary-button" onClick={handleSaveLesson} disabled={addingLesson}>
                              {addingLesson ? 'Saving' : editingLessonId ? 'Save Lesson' : 'Add Lesson'}
                            </button>
                          </div>
                        </div>
                      ) : isCreator ? (
                        <button type="button" className="program-builder-add-lesson-row" onClick={() => handleOpenLessonComposer(module.id)}>
                          + Add Lesson
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {isCreator && program.learners.length ? (
            <div className="program-builder-learners">
              <span>Learners</span>
              {program.learners.slice(0, 4).map((learner) => (
                <div key={learner.enrollmentId} className="program-builder-learner-row">
                  <strong>{learner.displayName}</strong>
                  <small>
                    {learner.progressPercent}% complete - enrolled {formatDate(learner.enrolledAt)}
                  </small>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
