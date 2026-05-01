'use client';

import { type CreatorProfileCtaBlock, type CreatorProfilePageBlock, type DmIntakePolicy, type ProfilePost, type ViewerProfile } from '@syncrolly/core';
import { createDirectConversation, getPublicProfile, listProfilePosts } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getEffectiveCreatorPageBlocks } from '../../../lib/profilePageBuilder';
import { getProfilePageOfferIconLabel } from '../../../lib/profilePageOfferIcons';
import { useWebSession } from '../../../lib/session';
import { BrandMark, Icon, getErrorMessage } from '../../ui';

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

function getDmIntakePolicyShortLabel(value: DmIntakePolicy | undefined): string {
  if (value === 'form') {
    return 'Form';
  }

  if (value === 'paid_fee') {
    return 'Paid';
  }

  return 'Direct';
}

function formatProfileHandle(profile: ViewerProfile): string {
  const base =
    profile.role === 'creator'
      ? profile.creatorProfile?.niche?.trim() || profile.displayName
      : profile.displayName;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `@${slug || 'synced_in'}`;
}

function formatHandleFromText(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `@${slug || 'synced_in'}`;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 8.2a2.7 2.7 0 1 0-2.55-3.58A2.7 2.7 0 0 0 18 8.2ZM6 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Zm12 5.1a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="m8.4 11.2 7.2-4.1M8.4 12.8l7.2 4.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
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
    <article className="atelier-post-card">
      <div className="atelier-post-avatar">
        {post.authorAvatarUrl ? (
          <img src={post.authorAvatarUrl} alt={post.authorName} />
        ) : (
          <span>{getInitials(post.authorName)}</span>
        )}
      </div>

      <div className="atelier-post-copy">
        <div className="atelier-post-meta">
          <strong>{post.authorName}</strong>
          <span>{formatHandleFromText(post.authorName)}</span>
          <span>{post.relativeTime}</span>
        </div>
        {post.body ? <p>{post.body}</p> : null}
        {post.imageUrl ? <img src={post.imageUrl} alt="" className="atelier-post-media" /> : null}
      </div>
    </article>
  );
}

function AtelierVideoBlock({ block }: { block?: Extract<CreatorProfilePageBlock, { type: 'video' }> }) {
  return (
    <section className="atelier-video-section atelier-reveal">
      <div className="atelier-video-frame">
        {block?.videoUrl ? (
          <video controls poster={block.thumbnailUrl} src={block.videoUrl} />
        ) : block?.thumbnailUrl ? (
          <img src={block.thumbnailUrl} alt="" />
        ) : (
          <div className="atelier-video-placeholder">
            <span>Video introduction</span>
          </div>
        )}
      </div>
    </section>
  );
}

function AtelierOfferings({ block }: { block?: Extract<CreatorProfilePageBlock, { type: 'offers' }> }) {
  if (!block) {
    return null;
  }

  return (
    <section className="atelier-offerings-section">
      <div className="atelier-section-heading atelier-reveal">
        <h2>{block.title || 'Select Offerings'}</h2>
        {block.eyebrow ? <p>{block.eyebrow}</p> : null}
      </div>

      <div className="atelier-offering-grid">
        {block.items.slice(0, 3).map((item, index) => (
          <article key={item.id} className="atelier-offering-card atelier-reveal" style={{ animationDelay: `${100 + index * 100}ms` }}>
            <div className="atelier-offering-icon">{getProfilePageOfferIconLabel(item.icon)}</div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span>{index === 0 ? 'Explore details' : index === 1 ? 'View case studies' : 'Join waitlist'} {'->'}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function AtelierCta({
  block,
  onPress,
  loading
}: {
  block?: Extract<CreatorProfilePageBlock, { type: 'cta' }>;
  onPress: (block: CreatorProfileCtaBlock) => void;
  loading: boolean;
}) {
  if (!block) {
    return null;
  }

  return (
    <section className="atelier-cta-section">
      <div className="atelier-cta-card atelier-reveal">
        <div>
          <span>Next step</span>
          <h2>{block.title || 'Ready to elevate your presence?'}</h2>
          {block.description ? <p>{block.description}</p> : null}
        </div>
        <button type="button" onClick={() => onPress(block)} disabled={loading}>
          {loading ? 'Opening...' : block.buttonLabel || 'Apply Now'}
        </button>
      </div>
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

  async function handleShareProfile() {
    if (!profile || typeof window === 'undefined') {
      return;
    }

    const shareUrl = window.location.href;
    const shareTitle = `${profile.displayName} on Synced-In`;
    const shareText = profile.bio.trim() || 'View this Synced-In creator profile.';

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setFeedback('Profile link copied.');
        return;
      }

      setFeedback(shareUrl);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setFeedback('Could not share this profile right now.');
      }
    }
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
      setFeedback('Booking from public web profiles is coming next.');
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
            <p className="stage-body">Public creator profiles on web use your authenticated Synced-In account.</p>
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
      ? profile.creatorProfile?.headline?.trim() || 'Creator on Synced-In'
      : 'Supporter on Synced-In';
  const resolvedBio = profile.bio.trim() || 'This user has not added a bio yet.';
  const profileHandle = formatProfileHandle(profile);
  const showAvatarImage = Boolean(profile.avatarUrl && !avatarFailed);
  const creatorPageBlocks =
    profile.role === 'creator'
      ? getEffectiveCreatorPageBlocks(profile.creatorProfile?.pageBlocks, creatorDmPolicy)
      : [];
  const videoBlock = creatorPageBlocks.find((block) => block.type === 'video') as
    | Extract<CreatorProfilePageBlock, { type: 'video' }>
    | undefined;
  const offeringsBlock = creatorPageBlocks.find((block) => block.type === 'offers') as
    | Extract<CreatorProfilePageBlock, { type: 'offers' }>
    | undefined;
  const ctaBlock = creatorPageBlocks.find((block) => block.type === 'cta') as
    | Extract<CreatorProfilePageBlock, { type: 'cta' }>
    | undefined;
  return (
    <div className="atelier-profile-page">
      <main className="atelier-profile-main">
        <section className="atelier-profile-header">
          <div className="atelier-cover atelier-reveal">
            {profile.coverImageUrl ? (
              <img src={profile.coverImageUrl} alt={profile.displayName} />
            ) : (
              <CoverPlaceholder />
            )}
          </div>

          <div className="atelier-profile-info atelier-reveal atelier-delay-200">
            <div className="atelier-profile-identity">
              <div className="atelier-avatar">
                {showAvatarImage ? (
                  <img src={profile.avatarUrl} alt={profile.displayName} onError={() => setAvatarFailed(true)} />
                ) : (
                  <span>{getInitials(profile.displayName)}</span>
                )}
              </div>

              <div className="atelier-profile-copy">
                <p className="atelier-kicker">{profileTag}</p>
                <h1>{profile.displayName}</h1>
                <p className="atelier-handle">{profileHandle}</p>
                <p className="atelier-subtitle">{subtitle}</p>
                <p className="atelier-bio">{resolvedBio}</p>
              </div>
            </div>

            <div className="atelier-profile-actions">
              <button type="button" className="atelier-primary-button" onClick={handlePrimaryAction} disabled={startingConversation}>
                {startingConversation ? 'Opening...' : primaryActionLabel}
              </button>

              {showSecondaryFormButton ? (
                <button type="button" className="atelier-secondary-button" onClick={handleOpenInquiryForm}>
                  Form
                </button>
              ) : null}

              <button type="button" className="atelier-share-button" onClick={handleShareProfile} aria-label="Share profile">
                <ShareIcon />
              </button>
            </div>
          </div>

          <div className="atelier-stats atelier-reveal atelier-delay-300">
            <div>
              <span>{posts.length}</span>
              <p>Posts</p>
            </div>
            <div>
              <span>{profile.role === 'creator' ? getDmAccessLabel(profile.creatorProfile?.dmAccess) : 'Member'}</span>
              <p>{profile.role === 'creator' ? 'Message access' : 'Profile'}</p>
            </div>
            <div>
              <span>{profile.role === 'creator' ? getDmIntakePolicyShortLabel(profile.creatorProfile?.dmIntakePolicy) : profile.presence}</span>
              <p>{profile.role === 'creator' ? 'Intake' : 'Presence'}</p>
            </div>
          </div>

          {feedback ? <p className="feedback-inline atelier-feedback">{feedback}</p> : null}
        </section>

        <AtelierVideoBlock block={videoBlock} />

        <AtelierOfferings block={offeringsBlock} />

        <AtelierCta block={ctaBlock} onPress={handleCreatorCtaPress} loading={startingConversation} />

        <section className="atelier-posts-section">
          <div className="atelier-posts-header atelier-reveal">
            <h2>Recent Posts</h2>
            {posts.length ? (
              <button type="button">
                View all
              </button>
            ) : null}
          </div>

          <div className="atelier-post-list">
            {posts.length ? (
              posts.slice(0, 3).map((post, index) => (
                <div key={post.id} className="atelier-reveal" style={{ animationDelay: `${index * 100}ms` }}>
                  <PostCard post={post} />
                </div>
              ))
            ) : (
              <article className="atelier-empty-posts atelier-reveal">
                <h3>No posts yet</h3>
                <p>This creator has not shared any public updates yet.</p>
              </article>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
