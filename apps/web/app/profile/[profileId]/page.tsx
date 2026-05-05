'use client';

import { type CreatorProfileOfferItem, type CreatorProfilePageBlock, type ProfilePost, type ViewerProfile } from '@syncrolly/core';
import { createDirectConversation, getPublicProfile, listProfilePosts } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { getEffectiveCreatorPageBlocks } from '../../../lib/profilePageBuilder';
import { useWebSession } from '../../../lib/session';
import { getErrorMessage } from '../../ui';

const FALLBACK_AVATAR =
  'https://images.pexels.com/photos/3778603/pexels-photo-3778603.jpeg?auto=compress&cs=tinysrgb&w=600';
const FALLBACK_COVER =
  'https://images.pexels.com/photos/1933900/pexels-photo-1933900.jpeg?auto=compress&cs=tinysrgb&w=1600';
const VIDEO_THUMBNAIL =
  'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1200';
const POST_PREVIEW_IMAGE =
  'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1200';
const OFFER_IMAGES = [
  'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800',
  'https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=800',
  'https://images.pexels.com/photos/3184357/pexels-photo-3184357.jpeg?auto=compress&cs=tinysrgb&w=800',
  'https://images.pexels.com/photos/3183198/pexels-photo-3183198.jpeg?auto=compress&cs=tinysrgb&w=800'
];

type NovaIconName =
  | 'mail'
  | 'sparkles'
  | 'play'
  | 'arrow'
  | 'heart'
  | 'comment'
  | 'repeat'
  | 'verified'
  | 'bolt'
  | 'grid'
  | 'users'
  | 'star'
  | 'calendar'
  | 'target'
  | 'book'
  | 'shield'
  | 'rocket'
  | 'chat'
  | 'forum'
  | 'timeline';

function NovaIcon({ name, className = '' }: { name: NovaIconName; className?: string }) {
  const icons: Record<NovaIconName, ReactNode> = {
    mail: (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
        <path d="m5 15 .8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z" />
      </>
    ),
    play: <path d="M9 6.5 18 12l-9 5.5v-11Z" fill="currentColor" stroke="none" />,
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    heart: (
      <path d="M12 20s-7-4.4-8.7-9.1C2.1 7.4 4.4 5 7.1 5c1.6 0 3 .8 3.9 2 .9-1.2 2.3-2 3.9-2 2.7 0 5 2.4 3.8 5.9C19 15.6 12 20 12 20Z" />
    ),
    comment: (
      <>
        <path d="M5 6.5h14v9H9l-4 3v-12Z" />
      </>
    ),
    repeat: (
      <>
        <path d="M17 2.5 21 6l-4 3.5" />
        <path d="M3 11V9a3 3 0 0 1 3-3h15" />
        <path d="m7 21.5-4-3.5 4-3.5" />
        <path d="M21 13v2a3 3 0 0 1-3 3H3" />
      </>
    ),
    verified: (
      <>
        <path d="m12 2 2.2 2 3-.3.8 2.9 2.6 1.5-1.2 2.8 1.2 2.8-2.6 1.5-.8 2.9-3-.3-2.2 2-2.2-2-3 .3-.8-2.9-2.6-1.5 1.2-2.8-1.2-2.8L6 6.6l.8-2.9 3 .3L12 2Z" />
        <path d="m8.5 12.1 2.2 2.2 4.8-5" />
      </>
    ),
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    grid: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.6" />
        <rect x="13" y="4" width="7" height="7" rx="1.6" />
        <rect x="4" y="13" width="7" height="7" rx="1.6" />
        <rect x="13" y="13" width="7" height="7" rx="1.6" />
      </>
    ),
    users: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M15.5 10a2.5 2.5 0 1 0 0-5" />
        <path d="M3.5 19c.8-3.2 2.8-5 5.5-5s4.7 1.8 5.5 5" />
        <path d="M14.5 14.4c2.2.4 3.7 2 4.3 4.6" />
      </>
    ),
    star: <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" />,
    calendar: (
      <>
        <rect x="4" y="5.5" width="16" height="15" rx="2" />
        <path d="M4 10h16" />
        <path d="M8 3v5M16 3v5" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5c3 0 5 .6 8 2.3v11c-3-1.7-5-2.3-8-2.3v-11Z" />
        <path d="M20 5.5c-3 0-5 .6-8 2.3v11c3-1.7 5-2.3 8-2.3v-11Z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6l8-3Z" />
      </>
    ),
    rocket: (
      <>
        <path d="M14 4c3.5.4 5.6 2.5 6 6l-5.8 5.8-6-6L14 4Z" />
        <path d="m8.2 9.8-3.7 1.1 2.8 2.8" />
        <path d="m14.2 15.8-1.1 3.7-2.8-2.8" />
      </>
    ),
    chat: (
      <>
        <path d="M5 6.5h14v9H9l-4 3v-12Z" />
      </>
    ),
    forum: (
      <>
        <path d="M4 5h12v8H8l-4 3V5Z" />
        <path d="M9 14h7l4 3V8h-3" />
      </>
    ),
    timeline: (
      <>
        <path d="M4 17 9 11l4 4 7-9" />
        <path d="M4 20h16" />
      </>
    )
  };

  return (
    <svg className={`nova-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function formatHandle(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '');

  return `@${slug || 'syncedin'}`;
}

function getOfferIconName(icon: CreatorProfileOfferItem['icon']): NovaIconName {
  switch (icon) {
    case 'call-outline':
      return 'calendar';
    case 'trending-up-outline':
      return 'timeline';
    case 'people-outline':
      return 'users';
    case 'school-outline':
      return 'book';
    case 'desktop-outline':
      return 'shield';
    case 'chatbubble-ellipses-outline':
      return 'forum';
    case 'videocam-outline':
      return 'play';
    case 'rocket-outline':
      return 'rocket';
    default:
      return 'sparkles';
  }
}

function NovaTopBar({ scrolled }: { scrolled: boolean }) {
  return (
    <nav className={`nova-topbar${scrolled ? ' nova-topbar-scrolled' : ''}`}>
      <div className="nova-topbar-inner">
        <a className="nova-brand" href="/" aria-label="Synced-In home">
          <img src="/synced-in-logo.png" alt="" className="nova-brand-logo" aria-hidden="true" />
          <span>Synced-In</span>
        </a>

        <div className="nova-topbar-links">
          <a href="/#solutions">Solutions</a>
          <a href="/#platform">Platform</a>
          <a href="/#pricing">Pricing</a>
        </div>

        <div className="nova-topbar-actions">
          <a className="nova-topbar-login" href="/">
            Login
          </a>
          <a className="nova-topbar-cta" href="/">
            Get Started
          </a>
        </div>
      </div>
    </nav>
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
  const [topbarScrolled, setTopbarScrolled] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.avatarUrl]);

  useEffect(() => {
    function updateTopbar() {
      setTopbarScrolled(window.scrollY > 40);
    }

    updateTopbar();
    window.addEventListener('scroll', updateTopbar, { passive: true });
    return () => window.removeEventListener('scroll', updateTopbar);
  }, []);

  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>('.nova-reveal'));

    if (!revealNodes.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { rootMargin: '0px 0px -80px' }
    );

    revealNodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [profile?.id, posts.length]);

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

  if (!isConfigured || !supabase) {
    return (
      <div className="nova-page">
        <NovaTopBar scrolled={topbarScrolled} />
        <main className="nova-state-page">
          <h1>Profile</h1>
          <p>Add your Supabase keys in `apps/web/.env.local` to load public profiles on desktop.</p>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <div className="nova-page">
        <NovaTopBar scrolled={topbarScrolled} />
        <main className="nova-state-page">
          <div className="spinner" aria-hidden="true" />
          <p>Loading profile...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="nova-page">
        <NovaTopBar scrolled={topbarScrolled} />
        <main className="nova-state-page">
          <h1>Sign in to continue</h1>
          <p>Public creator profiles on web use your authenticated Synced-In account.</p>
        </main>
      </div>
    );
  }

  if (!resolvedProfileId || !profile) {
    return (
      <div className="nova-page">
        <NovaTopBar scrolled={topbarScrolled} />
        <main className="nova-state-page">
          <h1>Profile not found</h1>
          <p>{feedback ?? 'This public profile is not available right now.'}</p>
        </main>
      </div>
    );
  }

  const profileTag = profile.role === 'creator' ? profile.creatorProfile?.niche?.trim() || 'Creator' : 'Supporter';
  const subtitle =
    profile.role === 'creator'
      ? profile.creatorProfile?.headline?.trim() || 'Digital Strategist & Creator Operator'
      : 'Synced-In supporter';
  const resolvedBio =
    profile.bio.trim() ||
    'Empowering modern creators through focused offers, direct relationships, and intuitive client experiences.';
  const profileHandle = formatHandle(
    profile.role === 'creator' ? profile.creatorProfile?.niche || profile.displayName : profile.displayName
  );
  const avatarUrl = profile.avatarUrl && !avatarFailed ? profile.avatarUrl : FALLBACK_AVATAR;
  const creatorDmPolicy = profile.role === 'creator' ? profile.creatorProfile?.dmIntakePolicy ?? 'direct_message' : 'direct_message';
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
  const offeringItems = offeringsBlock?.items.slice(0, 6) ?? [];

  const displayNameTokens = profile.displayName.trim().split(/\s+/);
  const displayNameLead = displayNameTokens.length > 1 ? displayNameTokens.slice(0, -1).join(' ') : '';
  const displayNameTail = displayNameTokens[displayNameTokens.length - 1] ?? profile.displayName;

  const primaryActionLabel =
    profile.role === 'creator' && creatorDmPolicy === 'form'
      ? 'Open Intake Form'
      : profile.role === 'creator' && creatorDmPolicy === 'paid_fee'
        ? `Unlock Message · $${profile.creatorProfile?.dmFeeUsd ?? 25}`
        : 'Send Message';

  const offeringsCount = offeringItems.length;
  const postsCount = posts.length;
  const likesCount = posts.reduce((sum, post) => sum + post.likeCount, 0);

  return (
    <div className="nova-page">
      <NovaTopBar scrolled={topbarScrolled} />

      <main className="nova-main">
        <section className="nova-hero">
          <div className="nova-hero-glow nova-hero-glow-blue" />
          <div className="nova-hero-glow nova-hero-glow-purple" />
          <div className="nova-hero-grid-overlay" aria-hidden="true" />

          <div className="nova-hero-inner">
            <div className="nova-hero-left nova-reveal">
              <div className="nova-badge">
                <span />
                <strong>{profile.role === 'creator' ? 'Verified Creator' : 'Synced-In Member'}</strong>
              </div>

              <p className="nova-kicker">{profileTag}</p>

              <h1 className="nova-hero-title">
                {displayNameLead ? <>{displayNameLead} </> : null}
                <span className="nova-gradient-text">{displayNameTail}</span>
              </h1>

              <h2 className="nova-hero-subtitle">{subtitle}</h2>
              <p className="nova-hero-bio">{resolvedBio}</p>

              <div className="nova-handle-pill">
                <NovaIcon name="bolt" />
                <span>{profileHandle}</span>
              </div>

              <div className="nova-hero-actions">
                <button
                  type="button"
                  className="nova-primary-cta"
                  onClick={handlePrimaryAction}
                  disabled={startingConversation}
                >
                  <NovaIcon name="mail" />
                  {startingConversation ? 'Opening...' : primaryActionLabel}
                  <span aria-hidden="true" className="nova-cta-arrow">→</span>
                </button>
                <a className="nova-secondary-cta" href="#nova-offerings">
                  <NovaIcon name="grid" />
                  View Offerings
                </a>
              </div>

              {feedback ? <p className="nova-feedback">{feedback}</p> : null}

              <div className="nova-stat-strip" aria-label="Profile stats">
                <div className="nova-stat">
                  <div className="nova-stat-value">
                    <span className="nova-gradient-text">{offeringsCount || 0}</span>
                  </div>
                  <div className="nova-stat-label">Offerings</div>
                </div>
                <div className="nova-stat">
                  <div className="nova-stat-value">
                    <span className="nova-gradient-text">{postsCount}</span>
                  </div>
                  <div className="nova-stat-label">Updates</div>
                </div>
                <div className="nova-stat">
                  <div className="nova-stat-value nova-stat-value-green">{likesCount}</div>
                  <div className="nova-stat-label">Engagements</div>
                </div>
              </div>
            </div>

            <aside className="nova-hero-right nova-reveal nova-delay-1" aria-label="Creator identity card">
              <div className="nova-identity-card">
                <div className="nova-identity-cover">
                  <img src={FALLBACK_COVER} alt="" />
                  <div className="nova-identity-cover-overlay" />
                  <div className="nova-identity-cover-grid" aria-hidden="true" />
                </div>

                <div className="nova-identity-body">
                  <div className="nova-identity-avatar">
                    <div className="nova-identity-avatar-ring" />
                    <img src={avatarUrl} alt={profile.displayName} onError={() => setAvatarFailed(true)} />
                    <span className="nova-identity-verified" aria-hidden="true">
                      <NovaIcon name="verified" />
                    </span>
                  </div>

                  <div className="nova-identity-copy">
                    <strong>{profile.displayName}</strong>
                    <span>{profileHandle}</span>
                  </div>

                  <div className="nova-identity-meta">
                    <div>
                      <NovaIcon name="target" />
                      <span>{profileTag}</span>
                    </div>
                    <div>
                      <NovaIcon name="users" />
                      <span>{profile.role === 'creator' ? 'Open to new work' : 'Active supporter'}</span>
                    </div>
                    <div>
                      <NovaIcon name="star" />
                      <span>Top-rated on Synced-In</span>
                    </div>
                  </div>

                  <div className="nova-identity-cta-row">
                    <button
                      type="button"
                      className="nova-identity-cta"
                      onClick={handlePrimaryAction}
                      disabled={startingConversation}
                    >
                      <NovaIcon name="mail" />
                      {startingConversation ? 'Opening...' : 'Reach out'}
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {videoBlock ? (
          <section className="nova-section nova-section-video" id="nova-video">
            <div className="nova-section-inner nova-reveal">
              <header className="nova-section-header">
                <span className="nova-section-eyebrow">Signature</span>
                <h2>
                  Step inside the <span className="nova-gradient-text">vision</span>
                </h2>
                <p>{videoBlock.title || 'A short film about the work, values, and craft behind this profile.'}</p>
              </header>

              <button
                type="button"
                className="nova-video-frame"
                onClick={() => {
                  if (videoBlock?.videoUrl) {
                    window.open(videoBlock.videoUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                <img src={VIDEO_THUMBNAIL} alt={videoBlock?.title || 'Video preview'} />
                <div className="nova-video-overlay" />
                <span className="nova-video-play">
                  <span className="nova-video-play-ring" />
                  <NovaIcon name="play" />
                </span>
                <div className="nova-video-badge">
                  <span />
                  <strong>Featured</strong>
                </div>
              </button>
            </div>
          </section>
        ) : null}

        {offeringItems.length ? (
          <section className="nova-section nova-section-offerings" id="nova-offerings">
            <div className="nova-offerings-glow" aria-hidden="true" />
            <div className="nova-section-inner">
              <header className="nova-section-header nova-reveal">
                <span className="nova-section-eyebrow">Offerings</span>
                <h2>
                  Ways to <span className="nova-gradient-text">work together</span>
                </h2>
                <p>Pick the path that fits. Each offering is delivered end-to-end inside Synced-In.</p>
              </header>

              <div className="nova-offerings-grid">
                {offeringItems.map((item, index) => {
                  const tones = ['blue', 'purple', 'green'] as const;
                  const tone = tones[index % tones.length];

                  return (
                    <article
                      key={item.id}
                      className={`nova-offering-card nova-offering-${tone} nova-reveal nova-delay-${(index % 3) + 1}`}
                    >
                      <div className="nova-offering-corner" aria-hidden="true" />
                      <div className="nova-offering-image">
                        <img src={OFFER_IMAGES[index % OFFER_IMAGES.length]} alt="" />
                        <div className="nova-offering-image-fade" />
                      </div>

                      <div className="nova-offering-body">
                        <div className="nova-offering-icon">
                          <NovaIcon name={getOfferIconName(item.icon)} />
                        </div>
                        <div className="nova-offering-index">
                          {String(index + 1).padStart(2, '0')}
                        </div>

                        <h3>{item.title}</h3>
                        <p>{item.description}</p>

                        <button
                          type="button"
                          className="nova-offering-link"
                          onClick={handlePrimaryAction}
                        >
                          <span>Inquire</span>
                          <NovaIcon name="arrow" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section className="nova-section nova-section-pulse" id="nova-pulse">
          <div className="nova-section-inner nova-reveal">
            <header className="nova-section-header nova-section-header-split">
              <div>
                <span className="nova-section-eyebrow">Pulse</span>
                <h2>
                  Recent <span className="nova-gradient-text">updates</span>
                </h2>
              </div>
              <p>Fresh thoughts, launches, and wins posted directly from the Synced-In app.</p>
            </header>

            {posts.length ? (
              <div className="nova-pulse-list">
                {posts.slice(0, 4).map((post, index) => (
                  <article key={post.id} className={`nova-pulse-card nova-reveal nova-delay-${(index % 3) + 1}`}>
                    <div className="nova-pulse-spine" />
                    <div className="nova-pulse-avatar">
                      <img src={post.authorAvatarUrl || profile.avatarUrl || FALLBACK_AVATAR} alt={post.authorName} />
                    </div>

                    <div className="nova-pulse-body">
                      <header>
                        <strong>{post.authorName}</strong>
                        <NovaIcon name="verified" className="nova-pulse-check" />
                        <span className="nova-pulse-meta">
                          {formatHandle(post.authorName)} · {post.relativeTime}
                        </span>
                      </header>

                      {post.body ? <p className="nova-pulse-text">{post.body}</p> : null}

                      {post.imageUrl || index === 1 ? (
                        <div className="nova-pulse-attachment">
                          <img src={post.imageUrl || POST_PREVIEW_IMAGE} alt="" />
                          <div className="nova-pulse-attachment-copy">
                            <strong>{index === 1 ? 'The Creator Operations Playbook' : 'Latest drop'}</strong>
                            <span>Tap to preview · Updates weekly</span>
                          </div>
                        </div>
                      ) : null}

                      <footer className="nova-pulse-actions">
                        <span>
                          <NovaIcon name="comment" />
                          <em>0</em>
                        </span>
                        <span>
                          <NovaIcon name="repeat" />
                          <em>0</em>
                        </span>
                        <span className="nova-pulse-heart">
                          <NovaIcon name="heart" />
                          <em>{post.likeCount}</em>
                        </span>
                      </footer>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="nova-pulse-empty">
                <NovaIcon name="sparkles" />
                <h3>No updates posted yet</h3>
                <p>When {profile.displayName} shares something new, it will show up here in real time.</p>
              </div>
            )}
          </div>
        </section>

        <section className="nova-cta-banner">
          <div className="nova-cta-inner nova-reveal">
            <div className="nova-cta-glow" aria-hidden="true" />
            <p className="nova-section-eyebrow">Next step</p>
            <h2>
              Ready to start a <span className="nova-gradient-text">conversation?</span>
            </h2>
            <p className="nova-cta-body">
              {profile.role === 'creator'
                ? `${profile.displayName} reads every message through Synced-In. Skip the inbox chaos and book real time.`
                : `Say hello and continue the conversation with ${profile.displayName} directly on Synced-In.`}
            </p>
            <div className="nova-hero-actions">
              <button
                type="button"
                className="nova-primary-cta"
                onClick={handlePrimaryAction}
                disabled={startingConversation}
              >
                <NovaIcon name="mail" />
                {startingConversation ? 'Opening...' : primaryActionLabel}
                <span aria-hidden="true" className="nova-cta-arrow">→</span>
              </button>
              {profile.role === 'creator' && creatorDmPolicy !== 'form' ? (
                <button type="button" className="nova-secondary-cta" onClick={handleOpenInquiryForm}>
                  <NovaIcon name="chat" />
                  Fill out intake
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
