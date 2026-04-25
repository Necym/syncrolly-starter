'use client';

import { appSections } from '@syncrolly/config';

export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

export function BrandMark() {
  return <img src="/synced-in-logo.png" alt="" className="brand-mark brand-mark-image" aria-hidden="true" />;
}

export function BottomNav({ activeKey = 'inbox' }: { activeKey?: string }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {appSections.map((section) => {
        const isActive = section.key === activeKey;

        return (
          <button key={section.key} type="button" className={`nav-item${isActive ? ' active' : ''}`}>
            <Icon name={section.key} filled={isActive} />
            <span>{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Icon({
  name,
  filled = false
}: {
  name:
    | 'notifications'
    | 'settings'
    | 'search'
    | 'compose'
    | 'feed'
    | 'inbox'
    | 'stats'
    | 'profile'
    | 'back'
    | 'close'
    | 'send'
    | 'camera'
    | 'image'
    | 'more';
  filled?: boolean;
}) {
  if (name === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8.25 9.15a3.75 3.75 0 1 1 7.5 0v2.1c0 .73.2 1.44.58 2.06l.8 1.33c.42.7-.08 1.61-.9 1.61H7.77c-.82 0-1.32-.91-.9-1.61l.8-1.33c.38-.62.58-1.33.58-2.06z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.2 18.2a1.9 1.9 0 0 0 3.6 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === 'settings') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 7.25h8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="16.5" cy="7.25" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M10.5 12h8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="7.5" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M5 16.75h8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="16.5" cy="16.75" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'compose') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 18.5V20h1.5L18 7.5 16.5 6 4 18.5Zm14.7-12.3 1.6-1.6a1.2 1.2 0 0 0 0-1.7l-.9-.9a1.2 1.2 0 0 0-1.7 0L16.1 3.6l2.6 2.6Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (name === 'back') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M14.5 5.5 8 12l6.5 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === 'close') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'send') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 20 21 12 3 4l3.8 8L3 20Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'camera') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 7.5h8l1 1.5H20a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 9h3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="13.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (name === 'image') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="9" cy="10" r="1.2" fill="currentColor" />
        <path
          d="m6.5 16 3.6-3.8 2.9 2.8 1.8-1.8 2.7 2.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === 'more') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="6" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="18" r="1.5" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'feed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (name === 'inbox') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M7 9.5c1.4 1.2 3.2 2.2 5 2.2s3.6-1 5-2.2"
          fill="none"
          stroke={filled ? '#ffffff' : 'currentColor'}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === 'stats') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="6" y="11" width="3" height="6" rx="1" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
        <rect x="10.5" y="7.5" width="3" height="9.5" rx="1" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
        <rect x="15" y="4.5" width="3" height="12.5" rx="1" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.7" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.2 19c1.4-2.8 4-4.2 6.8-4.2S17.4 16.2 18.8 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
