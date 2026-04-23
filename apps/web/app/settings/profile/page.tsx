'use client';

import { hasCompletedProfile, type ViewerProfile } from '@syncrolly/core';
import { getViewerProfile, saveCreatorProfile, saveSupporterProfile } from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getDefaultDisplayName, useWebSession } from '../../../lib/session';
import { BrandMark, Icon, getErrorMessage } from '../../ui';

type DmAccess = 'free' | 'subscriber_only' | 'paid_only';

export default function SettingsProfilePage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [niche, setNiche] = useState('');
  const [headline, setHeadline] = useState('');
  const [dmAccess, setDmAccess] = useState<DmAccess>('subscriber_only');

  async function loadProfile() {
    if (!supabase || !user) {
      return;
    }

    setLoadingProfile(true);

    try {
      const profile = await getViewerProfile(supabase, user.id);
      setViewerProfile(profile);
      setDisplayName(profile?.displayName ?? getDefaultDisplayName(user));
      setNiche(profile?.creatorProfile?.niche ?? '');
      setHeadline(profile?.creatorProfile?.headline ?? '');
      setDmAccess(profile?.creatorProfile?.dmAccess ?? 'subscriber_only');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setViewerProfile(null);
      return;
    }

    void loadProfile();
  }, [supabase, user?.id]);

  async function handleSave() {
    if (!supabase || !user || !viewerProfile) {
      return;
    }

    const nextDisplayName = displayName.trim();

    if (!nextDisplayName) {
      setFeedback('Display name is required.');
      return;
    }

    setSavingProfile(true);
    setFeedback(null);

    try {
      const nextProfile =
        viewerProfile.role === 'creator'
          ? await saveCreatorProfile(supabase, {
              userId: user.id,
              displayName: nextDisplayName,
              niche: niche.trim(),
              headline: headline.trim(),
              dmAccess,
              dmIntakePolicy: viewerProfile.creatorProfile?.dmIntakePolicy ?? 'direct_message',
              dmFeeUsd: viewerProfile.creatorProfile?.dmFeeUsd ?? 25
            })
          : await saveSupporterProfile(supabase, {
              userId: user.id,
              displayName: nextDisplayName,
              accessLevel: viewerProfile.supporterProfile?.accessLevel ?? 'free',
              totalSpend: viewerProfile.supporterProfile?.totalSpend ?? 0
            });

      setViewerProfile(nextProfile);
      setFeedback('Profile saved.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    setFeedback(null);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      router.replace('/');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  function handleBack() {
    router.push('/settings');
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
            <div className="brand brand-compact">
              <BrandMark />
              <span className="brand-name">Synchrolly</span>
            </div>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Profile</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to load the real profile.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading your profile...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !viewerProfile) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Profile</h1>
            <p className="stage-body">Sign in from the inbox page to create and save your real profile.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="thread-page">
      <header className="thread-topbar-shell">
        <div className="thread-topbar">
          <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
            <Icon name="back" />
          </button>
          <div className="brand brand-compact">
            <BrandMark />
            <span className="brand-name">Synchrolly</span>
          </div>
        </div>
      </header>

      <main className="profile-main">
        <section className="profile-shell">
          <div className="profile-hero">
            <div className="profile-avatar-frame">
              {viewerProfile.avatarUrl ? (
                <img src={viewerProfile.avatarUrl} alt={viewerProfile.displayName} className="profile-avatar-image" />
              ) : (
                <span className="profile-avatar-text">{viewerProfile.displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <h1 className="profile-name">{viewerProfile.displayName}</h1>
            <p className="profile-role-badge">{viewerProfile.role === 'creator' ? 'Creator account' : 'Supporter account'}</p>
            <p className="profile-body">
              {hasCompletedProfile(viewerProfile)
                ? 'This profile is now backed by your real Supabase account.'
                : 'Finish onboarding from the inbox page, then come back here to edit your details.'}
            </p>
          </div>

          <label className="detail-card">
            <span className="field-label">Display name</span>
            <input className="text-input" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>

          {viewerProfile.role === 'creator' ? (
            <>
              <label className="detail-card">
                <span className="field-label">Niche</span>
                <input className="text-input" type="text" value={niche} onChange={(event) => setNiche(event.target.value)} />
              </label>

              <label className="detail-card">
                <span className="field-label">Headline</span>
                <textarea
                  className="text-input multiline-input"
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                />
              </label>

              <div className="detail-card">
                <span className="field-label">DM access</span>
                <div className="option-row">
                  {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => {
                    const isSelected = dmAccess === value;
                    const label = value === 'free' ? 'Everyone' : value === 'subscriber_only' ? 'Subscribers' : 'Paid only';

                    return (
                      <button
                        key={value}
                        type="button"
                        className={`option-chip${isSelected ? ' active' : ''}`}
                        onClick={() => setDmAccess(value)}
                      >
                        <span className={`option-chip-text${isSelected ? ' active' : ''}`}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="detail-card">
              <span className="field-label">Access level</span>
              <p className="detail-value">{viewerProfile.supporterProfile?.accessLevel ?? 'free'}</p>
            </div>
          )}

          {feedback ? <p className="feedback-text">{feedback}</p> : null}

          <button type="button" className="primary-action" onClick={handleSave} disabled={savingProfile}>
            {savingProfile ? <span className="button-spinner" aria-hidden="true" /> : null}
            <span>Save Changes</span>
          </button>

          <button type="button" className="secondary-action" onClick={handleSignOut}>
            <span>Sign Out</span>
          </button>
        </section>
      </main>
    </div>
  );
}
