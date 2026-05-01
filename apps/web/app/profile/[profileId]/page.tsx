'use client';

import { type CreatorProfileOfferItem, type CreatorProfilePageBlock, type ProfilePost, type ViewerProfile } from '@syncrolly/core';
import { createDirectConversation, getPublicProfile, listProfilePosts } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getEffectiveCreatorPageBlocks } from '../../../lib/profilePageBuilder';
import { useWebSession } from '../../../lib/session';
import { getErrorMessage } from '../../ui';

const HERO_BACKGROUND =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBuPVYyWYZYvBzUblD0mlmy50TQIxMRVuzihsonWvFaUqepoC-Qefoy-HDZ01Av0BmBcLIT5kagzIMMIIwsyALP-3-KwH3SEdjyY952VpVbFDBikP5wQWEZrHTowi_2ukZb8kNbqK4ty2kwp7KBppgf-ohmB3xbwYfHzJMusItPfRG1j0RLHuiGpoKTiseRem5P0SX-HpajsX51hHV52jQYCQeL50WGKyWyKXJKe2dn1PRqbdCGXgMvc0hfmj1uGwE_ITatrHTLSwet';
const FALLBACK_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAR90Injhiln6FyNNzNfn1uOJbbP6hmJiGuK-Lfn4S4fU9e_LHENyi_b8_sbdZ0yRSr0lUd9JuPVHvsmKyc-OwJmW2HgvjjuR7SBrpPeIIB3B9R8qj1G6YsJ8oIZgR3VMPeXO700D9RifS6UlpAd2sdcbr62-_A-2xRltOmgjcE5q6Ahq340b98MBPP1GCqHrZWexb0SBGrMGuOqaUdba-H6F_G9nn7bliuHSCaYacawEO-zYzafV_Tk428qCeroXwrFgHwhDWpHvbN';
const VIDEO_THUMBNAIL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDdKX6TJolxkWNrHt8IZgn7c22t7bmFwnglLdnZpmWWKlviHtifsXPK0CDuBJtj_5SUc4XNEKTBI0C3ohWx_r0rJiKB3Q0GR1S0R9g4TULnbhmq6N6Gk4_DJxjiyuWEK2FSFkqoqxfrYY0TgffaDw35wr8DS75rv0eR_sXOezKjgjH7MmcboNfORNigw6U7gCaIcvs65GHOb28GzZ8W_g11SSLlbkJ1IyVoNePj01tBDfG0TVAc7_JvozURpY_0iDcsPXvYUvcLz25H';
const OFFER_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCWiu8uglbJ7CIeNVQc2-XkRP2_agNnWsYBXuspSPE_yLz9A7pWxjHdj-z9-Q4ZJvheFcw9cayfnPOjO3JwLXuXSP6GkeNi2245IHnbyCBjibdXShG6g43-zu3TDbdcLFQL5ZrcoPv831X09BZrMkdvFN1FIHkZzjbRB3gisO7YGL5-u5s51h_YKV168i0CZre2nyb8kl3Bm9AYPfWXTFyy-iYeWzGwx3yPvK0UF3I1arpglWpfW2m4FiweYkFaO61IULENUOFbWrPr',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB2IgsXpPZ_dukIW0q235jEqnOJzK0Wnrh4jsefmgwkwL7DzR4b32B3KnzPcG1G7xtbOmSJdkJJ1ZPrsc1VG0y45sokp8ZxeefwQTReM-67Mz4jWzL2-TTUHPQ2W7-IqKDQJNIkqgZnDOpqPxb-_LiAbeCiAO4YEm6HlgNGMlLQx0ycxezkxg4PKsYZ-ACq9zhg9E5t00syjdO2ifIvYaTT1O0rFs6jT_ECvJK6ZUtSvYd26RwU7f02VI0YiEDeZhJYbTRvgOwH4bTn',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAMY-caS19ZOxe2mkcHLVtiJ-CqxZzzpTtFJ36pFgTwcfHLfy7pz9erBklFBjsDKCT3dzmyA3x4OJzBXwDqtRam8LCV8DEjqXF_vTQfgQAxHhCZTsW5FaV2K_Itmj1FDZKvj16X2gzZgaSeWE5v3Lb5WP9NTuRRjN7Ro6ByCkUqSmXtFfzNLB-8oEmP_NFKJrDzpcGQGuHsyX2NIzIOG5FbFxKS6v8y3aiNY2CP4RDLcQVpUrLfKIKgIPjvpaHr6xmebpmVyxSVsW9i'
];
const POST_PREVIEW_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDIlvi04lmxgNEcG9mS7njFjCEYjjMzUr6eFe4jL1hhw8iq0q2oIHarqUEr11oTSf0chSun9_ovUPc32yGL9BwsXtoerMvmVnCDfAQAO5kEbCLAEdLQAcDJ4XoP_8Fq_LIN6-RlPu6oU6ZtjlL3M4GqPi9wsoFdRqqwyOLC-ZA8wwpi4v0MXT-9p7wxYmGKdZni3UTPVbh8V5r7sudGXvhGS1vn8mCgmAuMK9gi4_Y1MtTcWb0oBaDG8BrMjKVu-7mv_mQSgcFpSRaT';

function formatProfileHandle(profile: ViewerProfile): string {
  const base =
    profile.role === 'creator'
      ? profile.creatorProfile?.niche?.trim() || profile.displayName
      : profile.displayName;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '');

  return `@${slug || 'syncedin'}`;
}

function formatHandleFromText(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '');

  return `@${slug || 'syncedin'}`;
}

function getOfferIconName(icon: CreatorProfileOfferItem['icon']): string {
  switch (icon) {
    case 'call-outline':
      return 'architecture';
    case 'trending-up-outline':
      return 'timeline';
    case 'people-outline':
      return 'groups';
    case 'school-outline':
      return 'menu_book';
    case 'desktop-outline':
      return 'shield_lock';
    case 'chatbubble-ellipses-outline':
      return 'forum';
    case 'videocam-outline':
      return 'play_circle';
    case 'rocket-outline':
      return 'rocket_launch';
    default:
      return 'auto_awesome';
  }
}

function ProfileTopBar({ scrolled }: { scrolled: boolean }) {
  return (
    <nav className={`welcome-nav aura-profile-topbar${scrolled ? ' aura-profile-topbar-scrolled' : ''}`}>
      <div className="welcome-nav-inner">
        <a className="welcome-brand" href="/" aria-label="Synced-In home">
          <img src="/synced-in-logo.png" alt="" className="welcome-brand-logo" aria-hidden="true" />
          <span>Synced-In</span>
        </a>

        <div className="welcome-nav-links" aria-label="Profile page navigation">
          <a href="/#solutions">Solutions</a>
          <a href="/#platform">Platform</a>
          <a href="/#pricing">Pricing</a>
          <a href="/#about">About</a>
        </div>

        <div className="welcome-nav-actions">
          <a className="welcome-login-button" href="/">
            Login
          </a>
          <a className="welcome-small-cta" href="/">
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}

function ServiceCard({ item, index }: { item: CreatorProfileOfferItem; index: number }) {
  return (
    <article className={`aura-glass-panel aura-service-card aura-hover-lift aura-reveal aura-delay-${index + 1}`}>
      {index === 1 ? <div className="aura-card-accent" /> : null}
      <div className="aura-service-image">
        <div />
        <img src={OFFER_IMAGES[index % OFFER_IMAGES.length]} alt="" />
      </div>
      <div className="aura-service-body">
        <div className="aura-service-icon">
          <span className="material-symbols-outlined">{getOfferIconName(item.icon)}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <a href="#aura-updates">
          Explore Offering
          <span className="material-symbols-outlined">arrow_forward</span>
        </a>
      </div>
    </article>
  );
}

function UpdateCard({ post, index, profile }: { post: ProfilePost; index: number; profile: ViewerProfile }) {
  const avatarUrl = post.authorAvatarUrl || profile.avatarUrl || FALLBACK_AVATAR;
  const previewImage = post.imageUrl || (index === 1 ? POST_PREVIEW_IMAGE : undefined);

  return (
    <article className="aura-glass-panel aura-update-card aura-hover-lift">
      <div className="aura-update-row">
        <img src={avatarUrl} alt={post.authorName} />
        <div className="aura-update-content">
          <div className="aura-update-meta">
            <strong>{post.authorName}</strong>
            <span className="material-symbols-outlined aura-verified">verified</span>
            <span>{formatHandleFromText(post.authorName)} · {post.relativeTime}</span>
          </div>

          {post.body ? <p>{post.body}</p> : null}

          {previewImage ? (
            <div className="aura-link-preview">
              <img src={previewImage} alt="" />
              <div>
                <h4>{index === 1 ? 'The Enterprise AI Integration Framework (2024)' : 'Latest creator update'}</h4>
                <p>{index === 1 ? 'A comprehensive guide to deploying AI in zero-trust corporate environments.' : 'A new visual update from this creator.'}</p>
              </div>
            </div>
          ) : null}

          <div className="aura-update-actions">
            <span>
              <span className="material-symbols-outlined">chat_bubble</span>
              0
            </span>
            <span>
              <span className="material-symbols-outlined">repeat</span>
              0
            </span>
            <span>
              <span className="material-symbols-outlined">favorite</span>
              {post.likeCount}
            </span>
          </div>
        </div>
      </div>
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
  const [topbarScrolled, setTopbarScrolled] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.avatarUrl]);

  useEffect(() => {
    function updateTopbar() {
      setTopbarScrolled(window.scrollY > 50);
    }

    updateTopbar();
    window.addEventListener('scroll', updateTopbar, { passive: true });
    return () => window.removeEventListener('scroll', updateTopbar);
  }, []);

  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>('.aura-reveal'));

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
      { rootMargin: '0px 0px -100px' }
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

  function handlePortfolioClick() {
    document.getElementById('aura-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="aura-profile-page">
        <ProfileTopBar scrolled={topbarScrolled} />
        <main className="aura-state-page">
          <h1>Profile</h1>
          <p>Add your Supabase keys in `apps/web/.env.local` to load public profiles on desktop.</p>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <div className="aura-profile-page">
        <ProfileTopBar scrolled={topbarScrolled} />
        <main className="aura-state-page">
          <div className="spinner" aria-hidden="true" />
          <p>Loading profile...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="aura-profile-page">
        <ProfileTopBar scrolled={topbarScrolled} />
        <main className="aura-state-page">
          <h1>Sign in to continue</h1>
          <p>Public creator profiles on web use your authenticated Synced-In account.</p>
        </main>
      </div>
    );
  }

  if (!resolvedProfileId || !profile) {
    return (
      <div className="aura-profile-page">
        <ProfileTopBar scrolled={topbarScrolled} />
        <main className="aura-state-page">
          <h1>Profile not found</h1>
          <p>{feedback ?? 'This public profile is not available right now.'}</p>
        </main>
      </div>
    );
  }

  const profileTag = profile.role === 'creator' ? profile.creatorProfile?.niche?.trim() || 'Creator' : 'Supporter';
  const subtitle =
    profile.role === 'creator'
      ? profile.creatorProfile?.headline?.trim() || 'Digital Strategist & Enterprise Architect'
      : 'Synced-In supporter';
  const resolvedBio =
    profile.bio.trim() ||
    'Empowering modern creators through focused offers, direct relationships, and intuitive client experiences.';
  const profileHandle = formatProfileHandle(profile);
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
  const offeringItems = offeringsBlock?.items.slice(0, 3) ?? [];

  return (
    <div className="aura-profile-page">
      <ProfileTopBar scrolled={topbarScrolled} />

      <main className="aura-profile-main" id="aura-profile-top">
        <section className="aura-hero">
          <div className="aura-hero-background">
            <img src={HERO_BACKGROUND} alt="" />
            <div className="aura-hero-gradient-top" />
            <div className="aura-hero-gradient-side" />
          </div>

          <div className="aura-hero-content aura-animate-fade-in-up">
            <div className="aura-avatar-shell">
              <div />
              <img src={avatarUrl} alt={profile.displayName} onError={() => setAvatarFailed(true)} />
            </div>

            <p className="aura-kicker">{profileTag}</p>
            <h1>{profile.displayName}</h1>
            <h2>{subtitle}</h2>
            <p>{resolvedBio}</p>
            <span className="aura-profile-handle">{profileHandle}</span>

            <div className="aura-hero-actions">
              <button type="button" className="aura-primary-button" onClick={handlePrimaryAction} disabled={startingConversation}>
                <span className="material-symbols-outlined">mail</span>
                {startingConversation ? 'Opening...' : 'Send Message'}
              </button>
              <button type="button" className="aura-secondary-button" onClick={handlePortfolioClick}>
                View Portfolio
              </button>
            </div>

            {feedback ? <p className="aura-feedback">{feedback}</p> : null}
          </div>

          <a href="#aura-video" className="aura-scroll-indicator" aria-label="Scroll to video introduction">
            <span className="material-symbols-outlined">keyboard_arrow_down</span>
          </a>
        </section>

        <section className="aura-video-section" id="aura-video">
          <div className="aura-section-inner aura-reveal">
            <div className="aura-section-heading">
              <span>Vision</span>
              <h2>The Architecture of Tomorrow</h2>
            </div>

            <button
              type="button"
              className="aura-video-frame aura-hover-lift"
              onClick={() => {
                if (videoBlock?.videoUrl) {
                  window.open(videoBlock.videoUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <img src={VIDEO_THUMBNAIL} alt={videoBlock?.title || 'Professional presenting data'} />
              <div className="aura-video-overlay" />
              <span className="aura-play-button">
                <span />
                <span className="material-symbols-outlined">play_arrow</span>
              </span>
            </button>
          </div>
        </section>

        <section className="aura-services-section" id="aura-services">
          <div className="aura-services-glow" />
          <div className="aura-section-inner">
            <div className="aura-section-heading aura-reveal">
              <span>Expertise</span>
              <h2>Premium Services</h2>
            </div>

            <div className="aura-services-grid">
              {offeringItems.map((item, index) => (
                <ServiceCard key={item.id} item={item} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section className="aura-updates-section" id="aura-updates">
          <div className="aura-updates-inner aura-reveal">
            <div className="aura-updates-heading">
              <h2>Recent Updates</h2>
              {posts.length ? (
                <button type="button">
                  View all <span className="material-symbols-outlined">open_in_new</span>
                </button>
              ) : null}
            </div>

            <div className="aura-updates-list">
              {posts.length ? (
                posts.slice(0, 2).map((post, index) => (
                  <UpdateCard key={post.id} post={post} index={index} profile={profile} />
                ))
              ) : (
                <article className="aura-glass-panel aura-update-card">
                  <div className="aura-update-empty">
                    <h3>No recent updates yet</h3>
                    <p>This creator has not shared public updates yet.</p>
                  </div>
                </article>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
