'use client';

import type { ProgramSummary } from '@syncrolly/core';
import { createProgram, listPrograms } from '@syncrolly/data';
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

  if (!isConfigured || !supabase) {
    return (
      <main className="program-studio-page">
        <div className="program-studio-empty">
          <p>Program Studio</p>
          <h1>Connect Supabase to build programs.</h1>
          <span>Add your web Supabase keys, then this screen will create real programs using the shared app data layer.</span>
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

  return (
    <main className="program-studio-page">
      <div className="program-studio-orb program-studio-orb-one" />
      <div className="program-studio-orb program-studio-orb-two" />

      <header className="program-studio-topbar">
        <button type="button" className="program-studio-back" onClick={() => router.push('/settings')}>
          <Icon name="back" />
          <span>Settings</span>
        </button>
        <div className="program-studio-topbar-actions">
          <button type="button" className="program-studio-ghost-button" onClick={() => router.push('/')}>
            Messages
          </button>
          {isCreator ? (
            <button type="button" className="program-studio-primary-button" onClick={handleCreateProgram} disabled={creatingProgram}>
              <Icon name="compose" />
              <span>{creatingProgram ? 'Creating' : 'New program'}</span>
            </button>
          ) : null}
        </div>
      </header>

      <section className="program-studio-hero">
        <div>
          <p>{isCreator ? 'Program studio' : 'Learning library'}</p>
          <h1>{isCreator ? 'Turn your expertise into a structured product.' : 'Continue the programs you joined.'}</h1>
          <span>
            {isCreator
              ? 'Build lessons, enroll supporters, and keep your education products beside messages, forms, and profile tools.'
              : 'Your creator-led programs, modules, and lesson progress stay synced with the mobile app.'}
          </span>
        </div>

        <div className="program-studio-metrics" aria-label="Program metrics">
          <MetricCard label="Programs" value={formatNumber(metrics.programs)} />
          <MetricCard label="Lessons" value={formatNumber(metrics.lessons)} />
          <MetricCard label={isCreator ? 'Learners' : 'Progress'} value={isCreator ? formatNumber(metrics.learners) : `${metrics.completion}%`} />
        </div>
      </section>

      {feedback ? <div className={`program-studio-notice ${feedback.tone}`}>{feedback.message}</div> : null}

      <section className="program-studio-layout">
        <div className="program-studio-main">
          <div className="program-studio-section-heading">
            <span>{isCreator ? 'Your programs' : 'Available programs'}</span>
            <p>{isCreator ? 'Open a program to edit structure and review learners.' : 'Pick up from the next unfinished lesson.'}</p>
          </div>

          {loadingPrograms ? (
            <ProgramStudioSkeleton />
          ) : programs.length ? (
            <div className="program-studio-grid">
              {programs.map((program) => (
                <ProgramCard key={program.id} program={program} onOpen={() => router.push(`/program/${program.id}`)} />
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

        <aside className="program-studio-rail">
          <div className="program-studio-rail-block">
            <p>Parity focus</p>
            <strong>Mobile data, web-native canvas.</strong>
            <span>This screen reads and writes the same program tables as the app while using the dark Synced-In visual system.</span>
          </div>
          <div className="program-studio-rail-list">
            <span>Structure modules</span>
            <span>Add lessons</span>
            <span>Track learner progress</span>
          </div>
        </aside>
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

function ProgramCard({ program, onOpen }: { program: ProgramSummary; onOpen: () => void }) {
  const gradient = getProgramFallbackGradient(program.title);
  const progress = Math.max(0, Math.min(100, program.progressPercent));

  return (
    <button type="button" className="program-studio-card" onClick={onOpen}>
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
