'use client';

import {
  hasCompletedProfile,
  type DirectoryProfile,
  type InboxThreadSummary,
  type UserRole,
  type ViewerProfile
} from '@syncrolly/core';
import {
  createDirectConversation,
  getViewerProfile,
  listInboxThreads,
  saveCreatorProfile,
  saveSupporterProfile,
  searchProfiles
} from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { getDefaultDisplayName, getPreferredRole, useWebSession } from '../lib/session';
import { BottomNav, BrandMark, Icon, getErrorMessage } from './ui';

type AuthMode = 'sign-in' | 'sign-up';
type DmAccess = 'free' | 'subscriber_only' | 'paid_only';

function matchesSearch(thread: InboxThreadSummary, searchValue: string): boolean {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    thread.participantName.toLowerCase().includes(normalizedSearch) ||
    thread.subject.toLowerCase().includes(normalizedSearch) ||
    thread.preview.toLowerCase().includes(normalizedSearch)
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [loadingView, setLoadingView] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);

  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authRole, setAuthRole] = useState<UserRole>('creator');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileRole, setProfileRole] = useState<UserRole>('creator');
  const [profileNiche, setProfileNiche] = useState('');
  const [profileHeadline, setProfileHeadline] = useState('');
  const [profileDmAccess, setProfileDmAccess] = useState<DmAccess>('subscriber_only');
  const [profileSaving, setProfileSaving] = useState(false);

  const [composeVisible, setComposeVisible] = useState(false);
  const [composeSearch, setComposeSearch] = useState('');
  const [composeResults, setComposeResults] = useState<DirectoryProfile[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  const [creatingConversationId, setCreatingConversationId] = useState<string | null>(null);

  const loadRequestIdRef = useRef(0);
  const threadIdsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileComplete = hasCompletedProfile(viewerProfile);
  const visibleThreads = threads.filter((thread) => matchesSearch(thread, deferredSearchValue));

  function scheduleInboxRefresh() {
    if (!user) {
      return;
    }

    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      void loadViewerState(user.id);
    }, 180);
  }

  async function loadViewerState(currentUserId: string) {
    if (!supabase) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoadingView(true);

    try {
      const nextProfile = await getViewerProfile(supabase, currentUserId);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      let nextThreads: InboxThreadSummary[] = [];
      if (hasCompletedProfile(nextProfile)) {
        nextThreads = await listInboxThreads(supabase, currentUserId);

        if (loadRequestIdRef.current !== requestId) {
          return;
        }
      }

      setViewerProfile(nextProfile);
      setThreads(nextThreads);
      setFeedback(null);
    } catch (error) {
      if (loadRequestIdRef.current === requestId) {
        setFeedback(getErrorMessage(error));
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoadingView(false);
      }
    }
  }

  useEffect(() => {
    if (!user) {
      threadIdsRef.current = new Set();

      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      loadRequestIdRef.current += 1;
      setLoadingView(false);
      setViewerProfile(null);
      setThreads([]);
      return;
    }

    void loadViewerState(user.id);
  }, [supabase, user?.id]);

  useEffect(() => {
    threadIdsRef.current = new Set(threads.map((thread) => thread.id));
  }, [threads]);

  useEffect(() => {
    if (!user) {
      setAuthDisplayName('');
      setAuthRole('creator');
      return;
    }

    setAuthDisplayName((current) => current || getDefaultDisplayName(user));
    setAuthRole(getPreferredRole(user));
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setProfileDisplayName('');
      setProfileRole('creator');
      setProfileNiche('');
      setProfileHeadline('');
      setProfileDmAccess('subscriber_only');
      return;
    }

    setProfileDisplayName(viewerProfile?.displayName ?? getDefaultDisplayName(user));
    setProfileRole(viewerProfile?.role ?? getPreferredRole(user));
    setProfileNiche(viewerProfile?.creatorProfile?.niche ?? '');
    setProfileHeadline(viewerProfile?.creatorProfile?.headline ?? '');
    setProfileDmAccess(viewerProfile?.creatorProfile?.dmAccess ?? 'subscriber_only');
  }, [user?.id, viewerProfile]);

  useEffect(() => {
    if (!composeVisible || !supabase || !user) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setComposeLoading(true);

      searchProfiles(supabase, composeSearch)
        .then((results) => {
          setComposeResults(results);
        })
        .catch((error) => {
          setFeedback(getErrorMessage(error));
        })
        .finally(() => {
          setComposeLoading(false);
        });
    }, 180);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [composeSearch, composeVisible, supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !profileComplete) {
      return;
    }

    const channel = supabase
      .channel(`web-inbox-live:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const nextConversationId =
            typeof payload.new === 'object' &&
            payload.new !== null &&
            'conversation_id' in payload.new &&
            typeof (payload.new as { conversation_id?: unknown }).conversation_id === 'string'
              ? (payload.new as { conversation_id: string }).conversation_id
              : null;

          if (!nextConversationId || !threadIdsRef.current.has(nextConversationId)) {
            return;
          }

          scheduleInboxRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh();
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [profileComplete, supabase, user?.id]);

  async function handleAuthSubmit() {
    if (!supabase) {
      return;
    }

    if (!email.trim() || !password.trim()) {
      setFeedback('Enter your email and password.');
      return;
    }

    setAuthSubmitting(true);
    setFeedback(null);

    try {
      if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          throw error;
        }
      } else {
        const displayName = authDisplayName.trim() || email.split('@')[0];
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName,
              role: authRole
            }
          }
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          setAuthMode('sign-in');
          setPassword('');
          setFeedback('Account created. Check your email to confirm your sign-in.');
        } else {
          setFeedback('Account created. Finish your profile to start messaging.');
        }
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleCompleteProfile() {
    if (!supabase || !user) {
      return;
    }

    const displayName = profileDisplayName.trim();

    if (!displayName) {
      setFeedback('Choose a display name first.');
      return;
    }

    if (profileRole === 'creator' && !profileNiche.trim()) {
      setFeedback('Add your niche so followers know what you do.');
      return;
    }

    setProfileSaving(true);
    setFeedback(null);

    try {
      if (profileRole === 'creator') {
        await saveCreatorProfile(supabase, {
          userId: user.id,
          displayName,
          niche: profileNiche.trim(),
          headline: profileHeadline.trim(),
          dmAccess: profileDmAccess
        });
      } else {
        await saveSupporterProfile(supabase, {
          userId: user.id,
          displayName,
          accessLevel: viewerProfile?.supporterProfile?.accessLevel ?? 'free',
          totalSpend: viewerProfile?.supporterProfile?.totalSpend ?? 0
        });
      }

      await loadViewerState(user.id);
      router.replace('/');
      setFeedback(null);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleStartConversation(profile: DirectoryProfile) {
    if (!supabase || !user) {
      return;
    }

    setCreatingConversationId(profile.id);
    setFeedback(null);

    try {
      const conversation = await createDirectConversation(supabase, {
        createdBy: user.id,
        counterpartUserId: profile.id,
        subject: profile.role === 'creator' ? 'Creator outreach' : 'Direct message'
      });

      setComposeVisible(false);
      setComposeSearch('');
      setComposeResults([]);
      setThreads(await listInboxThreads(supabase, user.id));
      router.push(`/thread/${conversation.id}`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setCreatingConversationId(null);
    }
  }

  function renderHeader() {
    return (
      <header className="shell-header">
        <div className="shell-header-inner">
          <div className="brand">
            <BrandMark />
            <span className="brand-name">Synchrolly</span>
          </div>

          <button
            className="settings-button"
            type="button"
            aria-label="Settings"
            onClick={() => {
              if (user) {
                router.push('/settings');
              }
            }}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
    );
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Supabase isn&apos;t configured yet</h1>
            <p className="stage-body">Add the project URL and publishable key in `apps/web/.env.local`, then restart Next.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingView) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Syncing your workspace...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="auth-shell">
          <div className="auth-content">
            <section className="auth-hero">
              <p className="auth-eyebrow">Direct access for creator businesses</p>
              <h1 className="auth-title">Sign in to your inbox</h1>
              <p className="auth-body">
                Use your creator or supporter account to access real conversations, saved profiles, and the shared
                web/mobile data layer.
              </p>
            </section>

            <section className="auth-card">
              <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  className={`auth-tab${authMode === 'sign-in' ? ' active' : ''}`}
                  onClick={() => setAuthMode('sign-in')}
                >
                  <span className={`auth-tab-text${authMode === 'sign-in' ? ' active' : ''}`}>Sign In</span>
                </button>
                <button
                  type="button"
                  className={`auth-tab${authMode === 'sign-up' ? ' active' : ''}`}
                  onClick={() => setAuthMode('sign-up')}
                >
                  <span className={`auth-tab-text${authMode === 'sign-up' ? ' active' : ''}`}>Create Account</span>
                </button>
              </div>

              <LabeledField label="Email">
                <input
                  className="text-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </LabeledField>

              <LabeledField label="Password">
                <input
                  className="text-input"
                  type="password"
                  autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                />
              </LabeledField>

              {authMode === 'sign-up' ? (
                <>
                  <LabeledField label="Display name">
                    <input
                      className="text-input"
                      type="text"
                      value={authDisplayName}
                      onChange={(event) => setAuthDisplayName(event.target.value)}
                      placeholder="Your name or brand"
                    />
                  </LabeledField>

                  <RolePicker role={authRole} onChange={setAuthRole} />
                </>
              ) : null}

              {feedback ? <p className="feedback-text">{feedback}</p> : null}

              <button
                type="button"
                className="primary-action"
                onClick={handleAuthSubmit}
                disabled={authSubmitting}
              >
                {authSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
                <span>{authMode === 'sign-in' ? 'Sign In' : 'Create Account'}</span>
              </button>
            </section>
          </div>
        </main>
      </div>
    );
  }

  if (!profileComplete) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="auth-shell">
          <div className="auth-content">
            <section className="auth-hero">
              <p className="auth-eyebrow">Profile setup</p>
              <h1 className="auth-title">Finish your account</h1>
              <p className="auth-body">
                Choose how you show up in Syncrolly so the inbox, profile, and new-message search all use real data.
              </p>
            </section>

            <section className="auth-card">
              <RolePicker role={profileRole} onChange={setProfileRole} />

              <LabeledField label="Display name">
                <input
                  className="text-input"
                  type="text"
                  value={profileDisplayName}
                  onChange={(event) => setProfileDisplayName(event.target.value)}
                  placeholder="Your name or brand"
                />
              </LabeledField>

              {profileRole === 'creator' ? (
                <>
                  <LabeledField label="Niche">
                    <input
                      className="text-input"
                      type="text"
                      value={profileNiche}
                      onChange={(event) => setProfileNiche(event.target.value)}
                      placeholder="Fitness, sales, wellness..."
                    />
                  </LabeledField>

                  <LabeledField label="Headline">
                    <textarea
                      className="text-input multiline-input"
                      value={profileHeadline}
                      onChange={(event) => setProfileHeadline(event.target.value)}
                      placeholder="Tell people what you help them achieve"
                    />
                  </LabeledField>

                  <div className="option-group">
                    <p className="field-label">Who can message you?</p>
                    <div className="option-row">
                      {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => {
                        const isSelected = profileDmAccess === value;
                        const label = value === 'free' ? 'Everyone' : value === 'subscriber_only' ? 'Subscribers' : 'Paid only';

                        return (
                          <button
                            key={value}
                            type="button"
                            className={`option-chip${isSelected ? ' active' : ''}`}
                            onClick={() => setProfileDmAccess(value)}
                          >
                            <span className={`option-chip-text${isSelected ? ' active' : ''}`}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="supporter-note">
                  <h2 className="supporter-note-title">Supporter profile</h2>
                  <p className="supporter-note-body">
                    Your access level starts as free by default. We can connect subscriptions and purchases later.
                  </p>
                </div>
              )}

              {feedback ? <p className="feedback-text">{feedback}</p> : null}

              <button
                type="button"
                className="primary-action"
                onClick={handleCompleteProfile}
                disabled={profileSaving}
              >
                {profileSaving ? <span className="button-spinner" aria-hidden="true" /> : null}
                <span>Save Profile</span>
              </button>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="syncrolly-page">
      {renderHeader()}

      <main className="page-main">
        <div className="page-heading-row">
          <h1 className="page-title">Inbox</h1>

          <button type="button" className="compose-button" onClick={() => setComposeVisible(true)}>
            <Icon name="compose" />
            <span>New Message</span>
          </button>
        </div>

        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search conversations..."
          />
        </label>

        {feedback ? <p className="feedback-inline">{feedback}</p> : null}

        <section className="thread-list" aria-label="Conversation list">
          {visibleThreads.length ? (
            visibleThreads.map((thread, index) => {
              const isLast = index === visibleThreads.length - 1;

              return (
                <button
                  key={thread.id}
                  type="button"
                  className={`thread-row ${thread.unread ? 'unread' : 'read'}`}
                  onClick={() => router.push(`/thread/${thread.id}`)}
                >
                  <div className="thread-avatar-wrap">
                    <div className="thread-avatar-frame">
                      {thread.participantAvatar ? (
                        <img src={thread.participantAvatar} alt={thread.participantName} className="thread-avatar" />
                      ) : (
                        <div className="thread-avatar-fallback">
                          <span>{thread.participantInitials}</span>
                        </div>
                      )}
                    </div>
                    {thread.unread ? <span className="thread-dot" /> : null}
                  </div>

                  <div className={`thread-copy ${!thread.unread && !isLast ? 'thread-copy-divider' : ''}`}>
                    <div className="thread-top-row">
                      <h2 className={`thread-name ${thread.unread ? 'unread' : ''}`}>{thread.participantName}</h2>
                      <span className={`thread-time ${thread.unread ? 'unread' : ''}`}>{thread.relativeTime}</span>
                    </div>

                    <p className={`thread-preview ${thread.unread ? 'unread' : 'read'}`}>{thread.preview}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="empty-card">
              <h2 className="empty-card-title">No conversations yet</h2>
              <p className="empty-card-body">Start a new thread and we&apos;ll save every message to Supabase from here on out.</p>
            </div>
          )}
        </section>
      </main>

      {composeVisible ? (
        <div className="modal-backdrop" role="presentation">
          <button type="button" className="modal-backdrop-button" aria-label="Close new message" onClick={() => setComposeVisible(false)} />
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-message-title">
            <div className="modal-header">
              <h2 className="modal-title" id="new-message-title">
                New Message
              </h2>
              <button type="button" className="modal-close-button" onClick={() => setComposeVisible(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>

            <label className="search-field">
              <Icon name="search" />
              <input
                type="search"
                value={composeSearch}
                onChange={(event) => setComposeSearch(event.target.value)}
                placeholder="Find a creator or supporter"
              />
            </label>

            <div className="modal-results">
              {composeLoading ? (
                <div className="modal-state">
                  <div className="spinner" aria-hidden="true" />
                </div>
              ) : composeResults.length ? (
                composeResults.map((profile) => {
                  const isCreating = creatingConversationId === profile.id;

                  return (
                    <button
                      key={profile.id}
                      type="button"
                      className="result-row"
                      onClick={() => handleStartConversation(profile)}
                      disabled={isCreating}
                    >
                      <div className="result-avatar" style={{ backgroundColor: `${profile.accentColor}18` }}>
                        <span className="result-avatar-text" style={{ color: profile.accentColor }}>
                          {profile.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      <div className="result-copy">
                        <p className="result-name">{profile.displayName}</p>
                        <p className="result-meta">
                          {profile.role === 'creator' ? 'Creator' : 'Supporter'} - {profile.presence}
                        </p>
                      </div>

                      {isCreating ? <span className="button-spinner button-spinner-dark" aria-hidden="true" /> : <span className="result-chevron">›</span>}
                    </button>
                  );
                })
              ) : (
                <div className="modal-state">
                  <p className="modal-state-text">Search for another user to start a real conversation.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav activeKey="inbox" />
    </div>
  );
}

function LabeledField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function RolePicker({
  role,
  onChange
}: {
  role: UserRole;
  onChange: (role: UserRole) => void;
}) {
  return (
    <div className="option-group">
      <p className="field-label">I am joining as a...</p>
      <div className="option-row">
        {(['creator', 'supporter'] as const).map((value) => {
          const isSelected = role === value;

          return (
            <button
              key={value}
              type="button"
              className={`option-chip${isSelected ? ' active' : ''}`}
              onClick={() => onChange(value)}
            >
              <span className={`option-chip-text${isSelected ? ' active' : ''}`}>
                {value === 'creator' ? 'Creator' : 'Supporter'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
