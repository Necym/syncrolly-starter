'use client';

import {
  type CreatorProfileCtaActionType,
  type CreatorProfileOfferIcon,
  type CreatorProfileOfferItem,
  type CreatorProfilePageBlock,
  type DmIntakePolicy,
  type ViewerProfile
} from '@syncrolly/core';
import {
  getViewerProfile,
  saveCreatorProfile,
  saveSupporterProfile,
  uploadProfileMedia,
  uploadProfilePageAsset
} from '@syncrolly/data';
import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildStarterCreatorPageBlocks,
  createCtaBlock,
  createMediaPostsBlock,
  createOffersBlock,
  createVideoBlock,
  getEffectiveCreatorPageBlocks
} from '../../../lib/profilePageBuilder';
import { PROFILE_PAGE_OFFER_ICON_OPTIONS, getProfilePageOfferIconLabel } from '../../../lib/profilePageOfferIcons';
import { getDefaultDisplayName, useWebSession } from '../../../lib/session';
import { Icon, getErrorMessage } from '../../ui';

type DmAccess = 'free' | 'subscriber_only' | 'paid_only';
type UploadingMediaKind = 'avatar' | 'cover' | null;
type PageBlockType = CreatorProfilePageBlock['type'];

function getInitials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.trim().toLowerCase();
  return extension || 'jpg';
}

function getBlockLabel(type: PageBlockType) {
  if (type === 'video') {
    return 'Video';
  }

  if (type === 'offers') {
    return 'Offers';
  }

  if (type === 'cta') {
    return 'CTA';
  }

  return 'Media Posts';
}

function getCtaActionLabel(value: CreatorProfileCtaActionType) {
  if (value === 'direct_message') {
    return 'Direct Message';
  }

  if (value === 'form') {
    return 'Form';
  }

  if (value === 'booking') {
    return 'Booking';
  }

  return 'External Link';
}

export default function SettingsProfilePage() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [bio, setBio] = useState('');
  const [niche, setNiche] = useState('');
  const [headline, setHeadline] = useState('');
  const [dmAccess, setDmAccess] = useState<DmAccess>('subscriber_only');
  const [dmIntakePolicy, setDmIntakePolicy] = useState<DmIntakePolicy>('direct_message');
  const [dmFeeUsd, setDmFeeUsd] = useState('25');
  const [pageBlocks, setPageBlocks] = useState<CreatorProfilePageBlock[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState<UploadingMediaKind>(null);
  const [uploadingBlockAsset, setUploadingBlockAsset] = useState<string | null>(null);

  const isCreatorProfile = viewerProfile?.role === 'creator';
  const compactPolicyLabel = dmIntakePolicy === 'form' ? 'Form first' : dmIntakePolicy === 'paid_fee' ? `$${dmFeeUsd}` : 'Direct';
  const publicProfileHref = user ? `/profile/${user.id}` : '/';
  const previewBlocks = useMemo(
    () => (isCreatorProfile ? getEffectiveCreatorPageBlocks(pageBlocks, dmIntakePolicy) : []),
    [dmIntakePolicy, isCreatorProfile, pageBlocks]
  );

  async function loadProfile() {
    if (!supabase || !user) {
      return;
    }

    setLoadingProfile(true);
    setFeedback(null);

    try {
      const profile = await getViewerProfile(supabase, user.id);
      const nextPolicy = profile?.creatorProfile?.dmIntakePolicy ?? 'direct_message';

      setViewerProfile(profile);
      setDisplayName(profile?.displayName ?? getDefaultDisplayName(user));
      setAvatarUrl(profile?.avatarUrl ?? '');
      setCoverImageUrl(profile?.coverImageUrl ?? '');
      setBio(profile?.bio ?? '');
      setNiche(profile?.creatorProfile?.niche ?? '');
      setHeadline(profile?.creatorProfile?.headline ?? '');
      setDmAccess(profile?.creatorProfile?.dmAccess ?? 'subscriber_only');
      setDmIntakePolicy(nextPolicy);
      setDmFeeUsd(String(profile?.creatorProfile?.dmFeeUsd ?? 25));
      setPageBlocks(
        profile?.role === 'creator'
          ? getEffectiveCreatorPageBlocks(profile.creatorProfile?.pageBlocks, nextPolicy)
          : []
      );
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

  function updatePageBlock(blockId: string, updater: (block: CreatorProfilePageBlock) => CreatorProfilePageBlock) {
    setPageBlocks((currentBlocks) => currentBlocks.map((block) => (block.id === blockId ? updater(block) : block)));
  }

  function movePageBlock(blockId: string, direction: -1 | 1) {
    setPageBlocks((currentBlocks) => {
      const currentIndex = currentBlocks.findIndex((block) => block.id === blockId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentBlocks.length) {
        return currentBlocks;
      }

      const nextBlocks = [...currentBlocks];
      const [movedBlock] = nextBlocks.splice(currentIndex, 1);
      nextBlocks.splice(nextIndex, 0, movedBlock);
      return nextBlocks;
    });
  }

  function addPageBlock(type: PageBlockType) {
    const nextBlock =
      type === 'video'
        ? createVideoBlock()
        : type === 'offers'
          ? createOffersBlock()
          : type === 'cta'
            ? createCtaBlock(dmIntakePolicy === 'form' ? 'form' : 'direct_message')
            : createMediaPostsBlock();

    setPageBlocks((currentBlocks) => [...currentBlocks, nextBlock]);
  }

  function removePageBlock(blockId: string) {
    setPageBlocks((currentBlocks) => currentBlocks.filter((block) => block.id !== blockId));
  }

  function addOfferItem(blockId: string) {
    updatePageBlock(blockId, (block) => {
      if (block.type !== 'offers') {
        return block;
      }

      return {
        ...block,
        items: [
          ...block.items,
          {
            id: `offer-${Math.random().toString(36).slice(2, 10)}`,
            title: 'New offer',
            description: 'Describe what someone gets here.',
            icon: 'sparkles-outline'
          }
        ]
      };
    });
  }

  function updateOfferItem(
    blockId: string,
    itemId: string,
    updater: (item: CreatorProfileOfferItem) => CreatorProfileOfferItem
  ) {
    updatePageBlock(blockId, (block) => {
      if (block.type !== 'offers') {
        return block;
      }

      return {
        ...block,
        items: block.items.map((item) => (item.id === itemId ? updater(item) : item))
      };
    });
  }

  function removeOfferItem(blockId: string, itemId: string) {
    updatePageBlock(blockId, (block) => {
      if (block.type !== 'offers') {
        return block;
      }

      return {
        ...block,
        items: block.items.filter((item) => item.id !== itemId)
      };
    });
  }

  async function handleProfileMediaUpload(event: ChangeEvent<HTMLInputElement>, mediaKind: 'avatar' | 'cover') {
    if (!supabase || !user) {
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setUploadingMedia(mediaKind);
    setFeedback(null);

    try {
      const publicUrl = await uploadProfileMedia(supabase, {
        userId: user.id,
        fileData: await file.arrayBuffer(),
        contentType: file.type || 'application/octet-stream',
        fileExtension: getFileExtension(file.name),
        mediaKind
      });

      if (mediaKind === 'avatar') {
        setAvatarUrl(publicUrl);
      } else {
        setCoverImageUrl(publicUrl);
      }
    } catch (error) {
      setFeedback(getErrorMessage(error, 'That upload did not finish. Please try another file.'));
    } finally {
      setUploadingMedia(null);
    }
  }

  async function handlePageAssetUpload(
    event: ChangeEvent<HTMLInputElement>,
    blockId: string,
    assetKind: 'video' | 'thumbnail'
  ) {
    if (!supabase || !user) {
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setUploadingBlockAsset(`${blockId}:${assetKind}`);
    setFeedback(null);

    try {
      const publicUrl = await uploadProfilePageAsset(supabase, {
        userId: user.id,
        fileData: await file.arrayBuffer(),
        contentType: file.type || 'application/octet-stream',
        fileExtension: getFileExtension(file.name),
        assetKind
      });

      updatePageBlock(blockId, (block) => {
        if (block.type !== 'video') {
          return block;
        }

        return assetKind === 'video' ? { ...block, videoUrl: publicUrl } : { ...block, thumbnailUrl: publicUrl };
      });
    } catch (error) {
      setFeedback(getErrorMessage(error, 'That asset did not finish uploading. Please try another file.'));
    } finally {
      setUploadingBlockAsset(null);
    }
  }

  async function handleSave() {
    if (!supabase || !user || !viewerProfile) {
      return;
    }

    const nextDisplayName = displayName.trim();
    const nextFee = Math.max(1, Math.round(Number(dmFeeUsd) || 25));

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
              avatarUrl: avatarUrl.trim() || undefined,
              coverImageUrl: coverImageUrl.trim() || undefined,
              bio: bio.trim(),
              accentColor: viewerProfile.accentColor,
              presence: viewerProfile.presence,
              niche: niche.trim(),
              headline: headline.trim(),
              dmAccess,
              dmIntakePolicy,
              dmFeeUsd: nextFee,
              pageBlocks
            })
          : await saveSupporterProfile(supabase, {
              userId: user.id,
              displayName: nextDisplayName,
              avatarUrl: avatarUrl.trim() || undefined,
              coverImageUrl: coverImageUrl.trim() || undefined,
              bio: bio.trim(),
              accentColor: viewerProfile.accentColor,
              presence: viewerProfile.presence,
              accessLevel: viewerProfile.supporterProfile?.accessLevel ?? 'free',
              totalSpend: viewerProfile.supporterProfile?.totalSpend ?? 0
            });

      setViewerProfile(nextProfile);
      setDmFeeUsd(String(nextProfile.creatorProfile?.dmFeeUsd ?? nextFee));
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
        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Profile Studio</h1>
            <p className="stage-body">Add your Supabase keys in `apps/web/.env.local` to load the real profile.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <div className="thread-page">
        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading your profile studio...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !viewerProfile) {
    return (
      <div className="thread-page">
        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Profile Studio</h1>
            <p className="stage-body">Sign in from the inbox page to create and save your real profile.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="profile-studio-page">
      <header className="profile-studio-topbar">
        <button type="button" className="profile-studio-back" onClick={handleBack} aria-label="Go back">
          <Icon name="back" />
        </button>

        <div className="profile-studio-title-copy">
          <p>{isCreatorProfile ? 'Creator Studio' : 'Profile'}</p>
          <h1>{isCreatorProfile ? 'Profile Studio' : 'Account Profile'}</h1>
        </div>

        <div className="profile-studio-topbar-actions">
          {isCreatorProfile ? (
            <button type="button" className="profile-studio-ghost-button" onClick={() => router.push(publicProfileHref)}>
              View public page
            </button>
          ) : null}
          <button type="button" className="profile-studio-save-button" onClick={handleSave} disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      <main className="profile-studio-main">
        <section className="profile-studio-layout">
          <aside className="profile-studio-rail profile-studio-left-rail">
            <div className="profile-studio-rail-section">
              <span className="profile-studio-eyebrow">Identity</span>
              <label className="profile-studio-field">
                <span>Name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>

              <label className="profile-studio-field">
                <span>Bio</span>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
              </label>

              {isCreatorProfile ? (
                <>
                  <label className="profile-studio-field">
                    <span>Niche</span>
                    <input value={niche} onChange={(event) => setNiche(event.target.value)} />
                  </label>

                  <label className="profile-studio-field">
                    <span>Headline</span>
                    <textarea value={headline} onChange={(event) => setHeadline(event.target.value)} />
                  </label>
                </>
              ) : null}
            </div>

            <div className="profile-studio-rail-section">
              <span className="profile-studio-eyebrow">Media</span>
              <div className="profile-studio-upload-row">
                <label className="profile-studio-upload-button">
                  {uploadingMedia === 'avatar' ? 'Uploading...' : 'Avatar'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleProfileMediaUpload(event, 'avatar')}
                  />
                </label>
                <label className="profile-studio-upload-button">
                  {uploadingMedia === 'cover' ? 'Uploading...' : 'Cover'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleProfileMediaUpload(event, 'cover')}
                  />
                </label>
              </div>
            </div>

            {isCreatorProfile ? (
              <div className="profile-studio-rail-section">
                <span className="profile-studio-eyebrow">DM Rules</span>

                <div className="profile-studio-chip-row">
                  {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`profile-studio-chip${dmAccess === value ? ' active' : ''}`}
                      onClick={() => setDmAccess(value)}
                    >
                      {value === 'free' ? 'Everyone' : value === 'subscriber_only' ? 'Subscribers' : 'Paid'}
                    </button>
                  ))}
                </div>

                <div className="profile-studio-chip-row">
                  {(['direct_message', 'form', 'paid_fee'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`profile-studio-chip${dmIntakePolicy === value ? ' active' : ''}`}
                      onClick={() => setDmIntakePolicy(value)}
                    >
                      {value === 'direct_message' ? 'Direct' : value === 'form' ? 'Form' : 'Fee'}
                    </button>
                  ))}
                </div>

                {dmIntakePolicy === 'paid_fee' ? (
                  <label className="profile-studio-field compact">
                    <span>Fee USD</span>
                    <input inputMode="numeric" value={dmFeeUsd} onChange={(event) => setDmFeeUsd(event.target.value)} />
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="profile-studio-rail-section">
                <span className="profile-studio-eyebrow">Supporter</span>
                <p className="profile-studio-muted">Access level: {viewerProfile.supporterProfile?.accessLevel ?? 'free'}</p>
              </div>
            )}

            {feedback ? <p className="profile-studio-feedback">{feedback}</p> : null}
            <button type="button" className="profile-studio-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </aside>

          <section className="profile-studio-canvas">
            <div className="profile-studio-preview-shell">
              <div className="profile-studio-cover-preview">
                {coverImageUrl ? <img src={coverImageUrl} alt="" /> : null}
                <div className="profile-studio-cover-fade" />
              </div>

              <div className="profile-studio-preview-identity">
                <div className="profile-studio-avatar-preview">
                  {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{getInitials(displayName)}</span>}
                </div>
                <div>
                  <p>{niche || (isCreatorProfile ? 'Creator profile' : 'Supporter profile')}</p>
                  <h2>{displayName || 'Untitled profile'}</h2>
                  <span>{headline || compactPolicyLabel}</span>
                </div>
              </div>

              {bio ? <p className="profile-studio-preview-bio">{bio}</p> : null}

              {isCreatorProfile ? (
                <div className="profile-studio-preview-blocks">
                  {previewBlocks.map((block) => (
                    <StudioPreviewBlock key={block.id} block={block} />
                  ))}
                </div>
              ) : (
                <div className="profile-studio-preview-empty">
                  <strong>Supporter profile</strong>
                  <p>Your public creator page tools unlock when this account is set as a creator.</p>
                </div>
              )}
            </div>
          </section>

          {isCreatorProfile ? (
            <aside className="profile-studio-rail profile-studio-right-rail">
              <div className="profile-studio-rail-section">
                <div className="profile-studio-rail-heading">
                  <span className="profile-studio-eyebrow">Page Blocks</span>
                  <button
                    type="button"
                    className="profile-studio-link-button"
                    onClick={() => setPageBlocks(buildStarterCreatorPageBlocks(dmIntakePolicy))}
                  >
                    Reset
                  </button>
                </div>

                <div className="profile-studio-add-row">
                  {(['video', 'offers', 'cta', 'media_posts'] as PageBlockType[]).map((type) => (
                    <button key={type} type="button" onClick={() => addPageBlock(type)}>
                      + {getBlockLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="profile-studio-block-stack">
                {pageBlocks.map((block, index) => (
                  <section key={block.id} className="profile-studio-block-editor">
                    <div className="profile-studio-block-header">
                      <div>
                        <span>{getBlockLabel(block.type)}</span>
                        <strong>{index + 1}. {getBlockPreviewTitle(block)}</strong>
                      </div>
                      <div className="profile-studio-block-actions">
                        <button type="button" onClick={() => movePageBlock(block.id, -1)} disabled={index === 0}>
                          Up
                        </button>
                        <button type="button" onClick={() => movePageBlock(block.id, 1)} disabled={index === pageBlocks.length - 1}>
                          Down
                        </button>
                        <button type="button" onClick={() => removePageBlock(block.id)}>
                          Remove
                        </button>
                      </div>
                    </div>

                    <BlockEditor
                      block={block}
                      uploadingBlockAsset={uploadingBlockAsset}
                      onUpdate={(updater) => updatePageBlock(block.id, updater)}
                      onUploadAsset={(event, assetKind) => void handlePageAssetUpload(event, block.id, assetKind)}
                      onAddOffer={() => addOfferItem(block.id)}
                      onUpdateOffer={(itemId, updater) => updateOfferItem(block.id, itemId, updater)}
                      onRemoveOffer={(itemId) => removeOfferItem(block.id, itemId)}
                    />
                  </section>
                ))}
              </div>
            </aside>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function getBlockPreviewTitle(block: CreatorProfilePageBlock) {
  if (block.type === 'offers') {
    return block.title || 'Offerings';
  }

  if (block.type === 'media_posts') {
    return block.title || 'Media Posts';
  }

  return block.title || getBlockLabel(block.type);
}

function StudioPreviewBlock({ block }: { block: CreatorProfilePageBlock }) {
  if (block.type === 'video') {
    return (
      <article className="profile-studio-preview-video">
        <div className="profile-studio-preview-video-media">
          {block.thumbnailUrl ? <img src={block.thumbnailUrl} alt="" /> : <span>Video</span>}
        </div>
        <div>
          <h3>{block.title || 'Introduction'}</h3>
          <p>{block.description}</p>
        </div>
      </article>
    );
  }

  if (block.type === 'offers') {
    return (
      <article className="profile-studio-preview-section">
        <span>{block.eyebrow || "What's included"}</span>
        <h3>{block.title || 'Offerings'}</h3>
        <div className="profile-studio-preview-offers">
          {block.items.slice(0, 3).map((item) => (
            <div key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === 'cta') {
    return (
      <article className="profile-studio-preview-cta">
        <div>
          <h3>{block.title}</h3>
          <p>{block.description}</p>
        </div>
        <span>{block.buttonLabel}</span>
      </article>
    );
  }

  return (
    <article className="profile-studio-preview-section">
      <span>{block.eyebrow || 'Recent media'}</span>
      <h3>{block.title || 'Media Posts'}</h3>
      <p>{block.description}</p>
      <div className="profile-studio-preview-media-grid">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function BlockEditor({
  block,
  uploadingBlockAsset,
  onUpdate,
  onUploadAsset,
  onAddOffer,
  onUpdateOffer,
  onRemoveOffer
}: {
  block: CreatorProfilePageBlock;
  uploadingBlockAsset: string | null;
  onUpdate: (updater: (block: CreatorProfilePageBlock) => CreatorProfilePageBlock) => void;
  onUploadAsset: (event: ChangeEvent<HTMLInputElement>, assetKind: 'video' | 'thumbnail') => void;
  onAddOffer: () => void;
  onUpdateOffer: (itemId: string, updater: (item: CreatorProfileOfferItem) => CreatorProfileOfferItem) => void;
  onRemoveOffer: (itemId: string) => void;
}) {
  if (block.type === 'video') {
    return (
      <div className="profile-studio-block-fields">
        <EditorField label="Title" value={block.title} onChange={(value) => onUpdate((current) => current.type === 'video' ? { ...current, title: value } : current)} />
        <EditorField label="Description" value={block.description} multiline onChange={(value) => onUpdate((current) => current.type === 'video' ? { ...current, description: value } : current)} />
        <EditorField label="Video URL" value={block.videoUrl} onChange={(value) => onUpdate((current) => current.type === 'video' ? { ...current, videoUrl: value } : current)} />
        <EditorField label="Thumbnail URL" value={block.thumbnailUrl ?? ''} onChange={(value) => onUpdate((current) => current.type === 'video' ? { ...current, thumbnailUrl: value } : current)} />
        <div className="profile-studio-upload-row">
          <label className="profile-studio-upload-button">
            {uploadingBlockAsset === `${block.id}:video` ? 'Uploading...' : 'Upload video'}
            <input type="file" accept="video/*" onChange={(event) => onUploadAsset(event, 'video')} />
          </label>
          <label className="profile-studio-upload-button">
            {uploadingBlockAsset === `${block.id}:thumbnail` ? 'Uploading...' : 'Upload thumbnail'}
            <input type="file" accept="image/*" onChange={(event) => onUploadAsset(event, 'thumbnail')} />
          </label>
        </div>
      </div>
    );
  }

  if (block.type === 'offers') {
    return (
      <div className="profile-studio-block-fields">
        <EditorField label="Eyebrow" value={block.eyebrow ?? ''} onChange={(value) => onUpdate((current) => current.type === 'offers' ? { ...current, eyebrow: value } : current)} />
        <EditorField label="Title" value={block.title} onChange={(value) => onUpdate((current) => current.type === 'offers' ? { ...current, title: value } : current)} />

        <div className="profile-studio-offer-stack">
          {block.items.map((item) => (
            <div key={item.id} className="profile-studio-offer-editor">
              <div className="profile-studio-offer-editor-header">
                <span>{getProfilePageOfferIconLabel(item.icon)}</span>
                <button type="button" onClick={() => onRemoveOffer(item.id)}>
                  Remove
                </button>
              </div>
              <EditorField label="Offer title" value={item.title} onChange={(value) => onUpdateOffer(item.id, (current) => ({ ...current, title: value }))} />
              <EditorField label="Offer description" value={item.description} multiline onChange={(value) => onUpdateOffer(item.id, (current) => ({ ...current, description: value }))} />
              <label className="profile-studio-field compact">
                <span>Icon</span>
                <select
                  value={item.icon}
                  onChange={(event) =>
                    onUpdateOffer(item.id, (current) => ({
                      ...current,
                      icon: event.target.value as CreatorProfileOfferIcon
                    }))
                  }
                >
                  {PROFILE_PAGE_OFFER_ICON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>

        <button type="button" className="profile-studio-add-inline" onClick={onAddOffer}>
          + Add offer
        </button>
      </div>
    );
  }

  if (block.type === 'cta') {
    return (
      <div className="profile-studio-block-fields">
        <EditorField label="Title" value={block.title} onChange={(value) => onUpdate((current) => current.type === 'cta' ? { ...current, title: value } : current)} />
        <EditorField label="Description" value={block.description} multiline onChange={(value) => onUpdate((current) => current.type === 'cta' ? { ...current, description: value } : current)} />
        <EditorField label="Button label" value={block.buttonLabel} onChange={(value) => onUpdate((current) => current.type === 'cta' ? { ...current, buttonLabel: value } : current)} />
        <label className="profile-studio-field compact">
          <span>Action</span>
          <select
            value={block.actionType}
            onChange={(event) =>
              onUpdate((current) =>
                current.type === 'cta'
                  ? { ...current, actionType: event.target.value as CreatorProfileCtaActionType }
                  : current
              )
            }
          >
            {(['direct_message', 'form', 'booking', 'external_url'] as const).map((value) => (
              <option key={value} value={value}>
                {getCtaActionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <EditorField label="Target URL or note" value={block.target} onChange={(value) => onUpdate((current) => current.type === 'cta' ? { ...current, target: value } : current)} />
      </div>
    );
  }

  return (
    <div className="profile-studio-block-fields">
      <EditorField label="Eyebrow" value={block.eyebrow ?? ''} onChange={(value) => onUpdate((current) => current.type === 'media_posts' ? { ...current, eyebrow: value } : current)} />
      <EditorField label="Title" value={block.title} onChange={(value) => onUpdate((current) => current.type === 'media_posts' ? { ...current, title: value } : current)} />
      <EditorField label="Description" value={block.description} multiline onChange={(value) => onUpdate((current) => current.type === 'media_posts' ? { ...current, description: value } : current)} />
    </div>
  );
}

function EditorField({
  label,
  value,
  multiline,
  onChange
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="profile-studio-field compact">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}
