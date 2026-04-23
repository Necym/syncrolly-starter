'use client';

import { type DmIntakePolicy, type ProfilePost, type ViewerProfile } from '@syncrolly/core';
import { createDirectConversation, getPublicProfile, listProfilePosts } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWebSession } from '../../../lib/session';
import { BottomNav, BrandMark, Icon, getErrorMessage } from '../../ui';

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function getDmAccessLabel(value: 'free' | 'subscriber_only' | 'paid_only' | undefined): string {
  if (value === 'free') {
    return 'Everyone';
  }

  if (value === 'subscriber_only') {
    return 'Subscribers';
  }

  return 'Paid only';
}

function getDmIntakePolicyLabel(value: DmIntakePolicy | undefined, feeUsd?: number): string {
  if (value === 'form') {
    return 'Inquiry form';
  }

  if (value === 'paid_fee') {
    return `Paid fee${feeUsd ? ` ($${feeUsd})` : ''}`;
  }

  return 'Direct message';
}

function CoverPlaceholder() {
  return (
    <div className="public-profile-cover-placeholder" aria-hidden="true">
      <div className="public-profile-cover-glow" />
      <div className="public-profile-cover-orb" />
      <div className="public-profile-cover-rim" />
      <div className="public-profile-cover-band" />
    </div>
  );
}

function PostCard({ post }: { post: ProfilePost }) {
  return (
    <article className="public-post-card">
      <div className="public-post-header">
        <div className="public-post-avatar-frame">
          {post.authorAvatarUrl ? (
            <img src={post.authorAvatarUrl} alt={post.authorName} className="public-post-avatar" />
          ) : (
            <span className="public-post-avatar-fallback">{getInitials(post.authorName)}</span>
          )}
        </div>

        <div className="public-post-meta">
          <h3>{post.authorName}</h3>
          <p>{post.relativeTime}</p>
        </div>
      </div>

      {post.body ? <p className="public-post-body">{post.body}</p> : null}
      {post.imageUrl ? <img src={post.imageUrl} alt="" className="public-post-image" /> : null}
    </article>
  );
}

export default function PublicProfilePage() {
  const params = useParams<{ profileId: string }>();
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const resolvedProfileId = params?.profileId;
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.avatarUrl]);

  useEffect(() => {
    if (!user || !resolvedProfileId) {
      return;
    }

    if (resolvedProfileId === user.id) {
      router.replace('/settings/profile');
    }
  }, [resolvedProfileId, router, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !resolvedProfileId || resolvedProfileId === user.id) {
      return;
    }

    const currentSupabase = supabase;
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setFeedback(null);

      try {
        const nextProfile = await getPublicProfile(currentSupabase, resolvedProfileId);

        if (!nextProfile || cancelled) {
          if (!cancelled) {
            setProfile(null);
            setPosts([]);
          }
          return;
        }

        const nextPosts = await listProfilePosts(currentSupabase, resolvedProfileId, {
          authorProfile: {
            id: nextProfile.id,
            displayName: nextProfile.displayName,
            avatarUrl: nextProfile.avatarUrl
          }
        });

        if (cancelled) {
          return;
        }

        setProfile(nextProfile);
        setPosts(nextPosts);
      } catch (error) {
        if (!cancelled) {
          setFeedback(getErrorMessage(error, 'Something went wrong while loading this profile.'));
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [resolvedProfileId, supabase, user?.id]);

  async function handleStartConversation() {
    if (!supabase || !user || !profile) {
      return;
    }

    setStartingConversation(true);
    setFeedback(null);

    try {
      const conversation = await createDirectConversation(supabase, {
        createdBy: user.id,
        counterpartUserId: profile.id,
        subject: profile.role === 'creator' ? 'Creator outreach' : 'Direct message'
      });

      router.push(`/thread/${conversation.id}`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setStartingConversation(false);
    }
  }

  function handleOpenInquiryForm() {
    if (!profile) {
      return;
    }

    router.push(`/profile/${profile.id}/form`);
  }

  function handlePrimaryAction() {
    if (!profile || profile.role !== 'creator') {
      void handleStartConversation();
      return;
    }

    const dmIntakePolicy = profile.creatorProfile?.dmIntakePolicy ?? 'direct_message';

    if (dmIntakePolicy === 'form') {
      handleOpenInquiryForm();
      return;
    }

    if (dmIntakePolicy === 'paid_fee') {
      setFeedback(
        `Messaging ${profile.displayName} requires a paid unlock of $${profile.creatorProfile?.dmFeeUsd ?? 25}. Checkout is the next desktop flow to wire in.`
      );
      return;
    }

    void handleStartConversation();
  }

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>

            <div className="brand brand-wordmark">
              <BrandMark />
            </div>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Profile</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to load public profiles on desktop.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading profile...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Sign in to continue</h1>
            <p className="stage-body">Public creator profiles on web use your authenticated Syncrolly account.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!resolvedProfileId || !profile) {
    return (
      <div className="thread-page">
        <header className="public-route-header-shell">
          <div className="public-route-header">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Profile not found</h1>
            <p className="stage-body">{feedback ?? 'This public profile is not available right now.'}</p>
          </div>
        </main>
      </div>
    );
  }

  const creatorDmPolicy = profile.creatorProfile?.dmIntakePolicy ?? 'direct_message';
  const primaryActionLabel =
    profile.role === 'creator'
      ? creatorDmPolicy === 'form'
        ? 'Fill form'
        : creatorDmPolicy === 'paid_fee'
          ? `Pay $${profile.creatorProfile?.dmFeeUsd ?? 25}`
          : 'Message'
      : 'Message';
  const showSecondaryFormButton = profile.role === 'creator' && creatorDmPolicy === 'direct_message';
  const profileTag =
    profile.role === 'creator' ? profile.creatorProfile?.niche?.trim() || 'Creator profile' : 'Supporter profile';
  const subtitle =
    profile.role === 'creator'
      ? profile.creatorProfile?.headline?.trim() || 'Creator on Syncrolly'
      : 'Supporter on Syncrolly';
  const resolvedBio = profile.bio.trim() || 'This user has not added a bio yet.';
  const showAvatarImage = Boolean(profile.avatarUrl && !avatarFailed);

  return (
    <div className="thread-page">
      <header className="public-route-header-shell">
        <div className="public-route-header">
          <div className="public-route-header-left">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>

            <div className="brand brand-wordmark">
              <BrandMark />
            </div>
          </div>

          <button type="button" className="public-route-link" onClick={() => router.push('/')}>
            Back to inbox
          </button>
        </div>
      </header>

      <main className="public-profile-main">
        <div className="public-profile-shell">
          <section className="public-profile-hero">
            <div className="public-profile-cover">
              {profile.coverImageUrl ? (
                <img src={profile.coverImageUrl} alt={profile.displayName} className="public-profile-cover-image" />
              ) : (
                <CoverPlaceholder />
              )}
              <div className="public-profile-cover-fade" />
            </div>

            <div className="public-profile-hero-body">
              <div className="public-profile-avatar-row">
                <div className="public-profile-avatar-frame">
                  {showAvatarImage ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="public-profile-avatar-image"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <span className="public-profile-avatar-fallback">{getInitials(profile.displayName)}</span>
                  )}
                </div>
              </div>

              <div className="public-profile-identity">
                <p className="public-profile-kicker">{profileTag}</p>
                <h1>{profile.displayName}</h1>
                <p className="public-profile-subtitle">{subtitle}</p>
              </div>

              <p className="public-profile-bio">{resolvedBio}</p>

              <div className="public-profile-stats">
                <div className="public-profile-stat-card">
                  <span className="public-profile-stat-value">{posts.length}</span>
                  <span className="public-profile-stat-label">Posts</span>
                </div>
                <div className="public-profile-stat-card">
                  <span className="public-profile-stat-value">
                    {profile.role === 'creator' ? getDmAccessLabel(profile.creatorProfile?.dmAccess) : 'Member'}
                  </span>
                  <span className="public-profile-stat-label">{profile.role === 'creator' ? 'DM access' : 'Profile'}</span>
                </div>
                <div className="public-profile-stat-card">
                  <span className="public-profile-stat-value">
                    {profile.role === 'creator'
                      ? getDmIntakePolicyLabel(profile.creatorProfile?.dmIntakePolicy, profile.creatorProfile?.dmFeeUsd)
                      : profile.presence}
                  </span>
                  <span className="public-profile-stat-label">{profile.role === 'creator' ? 'Intake' : 'Presence'}</span>
                </div>
              </div>

              <div className="public-profile-action-row">
                <button
                  type="button"
                  className="public-profile-primary-button"
                  onClick={handlePrimaryAction}
                  disabled={startingConversation}
                >
                  {startingConversation ? <span className="button-spinner" aria-hidden="true" /> : null}
                  <span>{startingConversation ? 'Opening...' : primaryActionLabel}</span>
                </button>

                {showSecondaryFormButton ? (
                  <button type="button" className="public-profile-secondary-button" onClick={handleOpenInquiryForm}>
                    Fill form instead
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {feedback ? <p className="feedback-inline public-profile-feedback">{feedback}</p> : null}

          <section className="public-profile-grid">
            <div className="public-profile-side-stack">
              <article className="public-profile-detail-card">
                <span className="public-profile-section-label">Profile</span>
                <div className="public-profile-detail-list">
                  <p>Role: {profile.role === 'creator' ? 'Creator' : 'Supporter'}</p>
                  <p>Presence: {profile.presence}</p>
                  {profile.role === 'creator' ? (
                    <>
                      <p>Message access: {getDmAccessLabel(profile.creatorProfile?.dmAccess)}</p>
                      <p>
                        DM policy:{' '}
                        {getDmIntakePolicyLabel(profile.creatorProfile?.dmIntakePolicy, profile.creatorProfile?.dmFeeUsd)}
                      </p>
                    </>
                  ) : null}
                </div>
              </article>

              {profile.role === 'creator' && profile.creatorProfile ? (
                <article className="public-profile-detail-card">
                  <span className="public-profile-section-label">Creator Focus</span>
                  <p className="public-profile-section-body">
                    {profile.creatorProfile.niche || profile.creatorProfile.headline || 'No creator focus added yet.'}
                  </p>
                </article>
              ) : null}
            </div>

            <section className="public-profile-posts">
              <div className="public-profile-posts-header">
                <span className="public-profile-section-label">Latest Posts</span>
                <h2>Recent updates</h2>
              </div>

              {posts.length ? (
                <div className="public-profile-post-list">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <article className="public-profile-empty-posts">
                  <h3>No posts yet</h3>
                  <p>This profile has not shared any public updates yet.</p>
                </article>
              )}
            </section>
          </section>
        </div>
      </main>

      <BottomNav activeKey="inbox" />
    </div>
  );
}
