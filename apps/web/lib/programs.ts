'use client';

import type { ProgramSummary, UserRole } from '@syncrolly/core';

const programGradients = [
  ['#101828', '#1d4ed8', '#7dd3fc'],
  ['#1f2937', '#b91c1c', '#fda4af'],
  ['#312e81', '#7c3aed', '#c4b5fd'],
  ['#14532d', '#15803d', '#86efac'],
  ['#3f1d2e', '#d946ef', '#f9a8d4']
] as const;

export function getProgramFallbackGradient(seed: string): readonly [string, string, string] {
  const value = Array.from(seed || 'program').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return programGradients[value % programGradients.length];
}

export function truncateProgramText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

export function buildProgramFeedUpdates(programs: ProgramSummary[], role: UserRole) {
  if (!programs.length) {
    return [];
  }

  if (role === 'creator') {
    return programs.slice(0, 3).map((program, index) => ({
      id: `${program.id}-creator-update`,
      eyebrow: index === 0 ? 'Program' : index === 1 ? 'Enrollment' : 'Action',
      title:
        index === 0
          ? `${program.title} is live`
          : index === 1
            ? `${program.enrolledCount} students can access ${program.title}`
            : `Add the next lesson for ${program.title}`,
      body:
        index === 0
          ? program.subtitle || 'Your program is ready for lessons, enrollments, and supporter access.'
          : index === 1
            ? `The current next step is ${program.nextLessonTitle ?? 'your first lesson'}.`
            : 'Keep the experience lightweight: one clear lesson, one short video, one next action.',
      timeLabel: index === 0 ? 'Now' : index === 1 ? 'Live' : 'Next'
    }));
  }

  return programs.slice(0, 3).map((program, index) => ({
    id: `${program.id}-supporter-update`,
    eyebrow: index === 0 ? 'Continue' : index === 1 ? 'Program' : 'Progress',
    title: index === 0 ? `Continue ${program.title}` : `${program.title} is available in your library`,
    body:
      index === 2
        ? `${program.completedLessons} of ${program.lessonCount} lessons completed so far.`
        : `Next up: ${program.nextLessonTitle ?? 'Start lesson 1'}.`,
    timeLabel: index === 0 ? 'Today' : index === 1 ? 'Ready' : `${program.progressPercent}%`
  }));
}
