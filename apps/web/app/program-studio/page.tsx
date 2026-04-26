'use client';

import type { ProgramSummary } from '@syncrolly/core';
import { createProgram, deleteProgram, listPrograms } from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProgramFallbackGradient, truncateProgramText } from '../../lib/programs';
import { getPreferredRole, useWebSession } from '../../lib/session';
import { Icon, getErrorMessage } from '../ui';

type NoticeState = {
  tone: 'error' | 'success';
  message: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value);
}

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

export default function ProgramStudioPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const role = getPreferredRole(user);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [creatingProgram, setCreatingProgram] = useState(false);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);

  const loadPrograms = useCallback(async () => {
    if (!supabase || !user) {
      setPrograms([]);
      setLoadingPrograms(false);
      return;
    }

    setLoadingPrograms(true);

    try {
      const nextPrograms = await listPrograms(supabase, user.id, role);
      setPrograms(nextPrograms);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Programs could not be loaded.')
      });
    } finally {
      setLoadingPrograms(false);
    }
  }, [role, supabase, user]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const metrics = useMemo(
    () => ({
      programs: programs.length,
      lessons: programs.reduce((total, program) => total + program.lessonCount, 0),
      learners: programs.reduce((total, program) => total + program.enrolledCount, 0),
      completion: programs.length
        ? Math.round(programs.reduce((total, program) => total + program.progressPercent, 0) / programs.length)
        : 0
    }),
    [programs]
  );

  async function handleCreateProgram() {
    if (!supabase || !user || creatingProgram || role !== 'creator') {
      return;
    }

    setCreatingProgram(true);
    setFeedback(null);

    try {
      const createdProgram = await createProgram(supabase, {
        creatorId: user.id,
        title: 'Untitled Program',
        subtitle: 'New learning path',
        description: 'Outline what students will learn, then add modules and lessons.'
      });

      router.push(`/program/${createdProgram.id}`);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Program could not be created.')
      });
    } finally {
      setCreatingProgram(false);
    }
  }

  async function handleDeleteProgram(program: ProgramSummary) {
    if (!supabase || !user || deletingProgramId || role !== 'creator') {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete "${program.title}"? This removes its modules, lessons, enrollments, and progress.`
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingProgramId(program.id);
    setFeedback(null);

    try {
      await deleteProgram(supabase, {
        programId: program.id,
        creatorId: user.id
      });
      setPrograms((current) => current.filter((item) => item.id !== program.id));
      setFeedback({
        tone: 'success',
        message: 'Program deleted.'
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Program could not be deleted.')
      });
    } finally {
      setDeletingProgramId(null);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <main className="program-studio-page">
        <div className="program-studio-empty">
          <p>Program Studio</p>
          <h1>Connect Supabase to build programs.</h1>
          <span>Add your web Supabase keys, then this screen will create real programs.</span>
        </div>
      </main>
    );
  }

  if (sessionLoading) {
    return (
      <main className="program-studio-page">
        <ProgramStudioSkeleton />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="program-studio-page">
        <div className="program-studio-empty">
          <p>Program Studio</p>
          <h1>Sign in to continue.</h1>
          <span>Creators can build programs and supporters can continue lessons from here.</span>
        </div>
      </main>
    );
  }

  const isCreator = role === 'creator';
  const displayInitial = user.email?.charAt(0).toUpperCase() ?? 'S';
  const navItems = [
    { label: 'Messages', active: false, onClick: () => router.push('/') },
    { label: 'Feed', active: false, onClick: () => router.push('/') },
    { label: 'Profile', active: false, onClick: () => router.push('/settings/profile') },
    { label: 'Settings', active: false, onClick: () => router.push('/settings') },
    { label: 'Calendar', active: false, onClick: () => router.push('/') }
  ];

  return (
    <main className="program-studio-page">
      <div className="program-studio-orb program-studio-orb-one" />
      <div className="program-studio-orb program-studio-orb-two" />

      <header className="shell-header program-studio-shell-header">
        <div className="shell-header-inner shell-header-inner-wide">
          <button type="button" className="desktop-app-brand" onClick={() => router.push('/')} aria-label="Synced-In home">
            <span className="desktop-app-brand-content">
              <img src="/synced-in-logo.png" alt="" className="welcome-brand-logo" aria-hidden="true" />
              <span>Synced-In</span>
            </span>
          </button>

          <nav className="desktop-header-nav" aria-label="Primary">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`desktop-header-link${item.active ? ' active' : ''}`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shell-header-actions">
            <div className="desktop-header-utility">
              <button className="desktop-header-icon-button" type="button" aria-label="Notifications">
                <Icon name="notifications" />
              </button>
            </div>
            <button
              type="button"
              className="desktop-header-profile-button"
              aria-label="Open account settings"
              onClick={() => router.push('/settings')}
            >
              <div className="desktop-header-avatar-frame">
                <span className="desktop-header-avatar-text">{displayInitial}</span>
              </div>
            </button>
          </div>
        </div>
      </header>

      <section className="program-studio-hero">
        <div>
          <p>{isCreator ? 'Program studio' : 'Learning library'}</p>
          <h1>{isCreator ? 'Build programs your audience can finish.' : 'Continue your programs.'}</h1>
          <span>
            {isCreator
              ? 'Create polished learning paths with modules, lessons, thumbnails, and learner progress in one place.'
              : 'Jump back into the lessons and resources your creators have shared with you.'}
          </span>
        </div>

        <div className="program-studio-metrics" aria-label="Program metrics">
          <MetricCard label="Programs" value={formatNumber(metrics.programs)} />
          <MetricCard label="Lessons" value={formatNumber(metrics.lessons)} />
          <MetricCard label={isCreator ? 'Learners' : 'Progress'} value={isCreator ? formatNumber(metrics.learners) : `${metrics.completion}%`} />
        </div>
      </section>

      {feedback ? <div className={`program-studio-notice ${feedback.tone}`}>{feedback.message}</div> : null}

      <section className="program-studio-layout clean">
        <div className="program-studio-main">
          <div className="program-studio-section-heading">
            <div>
              <span>{isCreator ? 'Your programs' : 'Available programs'}</span>
              <p>{isCreator ? 'Open a program to refine details, modules, lessons, and learners.' : 'Pick up from your next unfinished lesson.'}</p>
            </div>
            {isCreator ? (
              <button type="button" className="program-studio-primary-button" onClick={handleCreateProgram} disabled={creatingProgram}>
                <Icon name="compose" />
                <span>{creatingProgram ? 'Creating' : 'New program'}</span>
              </button>
            ) : null}
          </div>

          {loadingPrograms ? (
            <ProgramStudioSkeleton />
          ) : programs.length ? (
            <div className="program-studio-grid">
              {programs.map((program) => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  canDelete={isCreator}
                  deleting={deletingProgramId === program.id}
                  onDelete={() => handleDeleteProgram(program)}
                  onOpen={() => router.push(`/program/${program.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="program-studio-empty-panel">
              <p>{isCreator ? 'No programs yet' : 'No programs available'}</p>
              <span>
                {isCreator
                  ? 'Create your first program, then add modules, lessons, and learner access.'
                  : 'When a creator enrolls you in a program, it will appear here.'}
              </span>
              {isCreator ? (
                <button type="button" className="program-studio-primary-button" onClick={handleCreateProgram} disabled={creatingProgram}>
                  <Icon name="compose" />
                  <span>{creatingProgram ? 'Creating' : 'Create program'}</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="program-studio-metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProgramCard({
  program,
  canDelete,
  deleting,
  onDelete,
  onOpen
}: {
  program: ProgramSummary;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const gradient = getProgramFallbackGradient(program.title);
  const progress = Math.max(0, Math.min(100, program.progressPercent));

  return (
    <article className="program-studio-card">
      {canDelete ? (
        <button type="button" className="program-studio-card-delete" onClick={onDelete} disabled={deleting}>
          {deleting ? 'Deleting' : 'Delete'}
        </button>
      ) : null}

      <button type="button" className="program-studio-card-open" onClick={onOpen}>
        <div className="program-studio-card-art">
          {program.thumbnailUrl ? (
            <img src={program.thumbnailUrl} alt="" />
          ) : (
            <div
              className="program-studio-card-gradient"
              style={{
                background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`
              }}
            >
              <span>{getInitials(program.title)}</span>
            </div>
          )}
        </div>

        <div className="program-studio-card-copy">
          <div className="program-studio-card-meta">
            <span>{program.subtitle || 'Program'}</span>
            <small>{program.lessonCount} lessons</small>
          </div>
          <h2>{program.title}</h2>
          <p>{truncateProgramText(program.description || program.subtitle || 'No description yet.', 150)}</p>
        </div>

        <div className="program-studio-card-footer">
          <span>{program.enrolledCount} learners</span>
          <div className="program-studio-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
          <strong>{progress}%</strong>
        </div>
      </button>
    </article>
  );
}

function ProgramStudioSkeleton() {
  return (
    <div className="program-studio-skeleton">
      <div />
      <div />
      <div />
    </div>
  );
}
