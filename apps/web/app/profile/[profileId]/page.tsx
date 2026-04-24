'use client';

import { type CreatorProfileCtaBlock, type CreatorProfilePageBlock, type DmIntakePolicy, type ProfilePost, type ViewerProfile } from '@syncrolly/core';
import { createDirectConversation, getPublicProfile, listProfilePosts } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getEffectiveCreatorPageBlocks } from '../../../lib/profilePageBuilder';
import { getProfilePageOfferIconLabel } from '../../../lib/profilePageOfferIcons';
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

function PublicProfileBlock({
  block,
  posts,
  onCtaPress,
  ctaLoading
}: {
  block: CreatorProfilePageBlock;
  posts: ProfilePost[];
  onCtaPress: (block: CreatorProfileCtaBlock) => void;
  ctaLoading: boolean;
}) {
  if (block.type === 'video') {
    return (
      <section className="public-profile-block public-profile-video-block">
        <div className="public-profile-block-copy">
          <span className="public-profile-section-label">Start here</span>
          <h2>{block.title || 'Introduction'}</h2>
          {block.description ? <p>{block.description}</p> : null}
        </div>

        <div className="public-profile-video-frame">
          {block.videoUrl ? (
            <video controls poster={block.thumbnailUrl} src={block.videoUrl} />
          ) : block.thumbnailUrl ? (
            <img src={block.thumbnailUrl} alt="" />
          ) : (
            <div className="public-profile-video-placeholder">
              <span>Video introduction</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (block.type === 'offers') {
    return (
      <section className="public-profile-block public-profile-offers-block">
        <div className="public-profile-block-copy">
          <span className="public-profile-section-label">{block.eyebrow || "What's included"}</span>
          <h2>{block.title || 'Offerings'}</h2>
        </div>

        <div className="public-profile-offer-grid">
          {block.items.map((item) => (
            <article key={item.id} className="public-profile-offer-item">
              <span>{getProfilePageOfferIconLabel(item.icon)}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'cta') {
    return (
      <section className="public-profile-block public-profile-cta-block">
        <div className="public-profile-block-copy">
          <span className="public-profile-section-label">Next step</span>
          <h2>{block.title || 'Ready to begin?'}</h2>
          {block.description ? <p>{block.description}</p> : null}
        </div>

        <button type="button" className="public-profile-primary-button" onClick={() => onCtaPress(block)} disabled={ctaLoading}>
          {ctaLoading ? 'Opening...' : block.buttonLabel || 'Start'}
        </button>
      </section>
    );
  }

  return (
    <section className="public-profile-block public-profile-media-block">
      <div className="public-profile-block-copy">
        <span className="public-profile-section-label">{block.eyebrow || 'Recent media'}</span>
        <h2>{block.title || 'Media Posts'}</h2>
        {block.description ? <p>{block.description}</p> : null}
      </div>

      {posts.length ? (
        <div className="public-profile-media-grid">
          {posts.slice(0, 4).map((post) => (
            <article key={post.id} className="public-profile-media-tile">
              {post.imageUrl ? <img src={post.imageUrl} alt="" /> : null}
              <p>{post.body || post.relativeTime}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="public-profile-media-empty">No media posts yet.</div>
      )}
    </section>
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
    if (!supabase || !user || !resolvedProfileId) {
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

  function handleCreatorCtaPress(block: CreatorProfileCtaBlock) {
    if (block.actionType === 'form') {
      handleOpenInquiryForm();
      return;
    }

    if (block.actionType === 'external_url') {
      if (block.target.trim()) {
        window.open(block.target.trim(), '_blank', 'noopener,noreferrer');
        return;
      }

      setFeedback('This link is not configured yet.');
      return;
    }

    if (block.actionType === 'booking') {
      setFeedback('Booking from public web profiles is next in the parity pass.');
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
  const creatorPageBlocks =
    profile.role === 'creator'
      ? getEffectiveCreatorPageBlocks(profile.creatorProfile?.pageBlocks, creatorDmPolicy)
      : [];
  const hasMediaPostsBlock = creatorPageBlocks.some((block) => block.type === 'media_posts');

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

          {creatorPageBlocks.length ? (
            <section className="public-profile-block-stack">
              {creatorPageBlocks.map((block) => (
                <PublicProfileBlock
                  key={block.id}
                  block={block}
                  posts={posts}
                  onCtaPress={handleCreatorCtaPress}
                  ctaLoading={startingConversation}
                />
              ))}
            </section>
          ) : null}

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
                <h2>{hasMediaPostsBlock ? 'More updates' : 'Recent updates'}</h2>
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
