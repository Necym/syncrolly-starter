import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import {
  type CreatorProfileCtaActionType,
  type CreatorProfileOfferIcon,
  type CreatorProfileOfferItem,
  type CreatorProfilePageBlock,
  type DmIntakePolicy,
  type ProfilePost,
  type ViewerProfile
} from '@syncrolly/core';
import {
  createProfilePost,
  deleteProfilePost,
  getViewerProfile,
  listProfilePosts,
  saveCreatorProfile,
  saveSupporterProfile,
  unregisterPushDevice,
  uploadProfileMedia,
  uploadProfilePageAsset
} from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type ViewStyle,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AmbientBackground from '../../components/AmbientBackground';
import {
  buildStarterCreatorPageBlocks,
  createCtaBlock,
  createMediaPostsBlock,
  createOffersBlock,
  createVideoBlock,
  getEffectiveCreatorPageBlocks
} from '../../lib/profilePageBuilder';
import {
  type PendingUploadImage,
  base64ToArrayBuffer,
  fileUriToArrayBuffer,
  pickImageForUpload,
  pickVideoForUpload
} from '../../lib/media';
import {
  getProfilePageOfferIconLabel,
  PROFILE_PAGE_OFFER_ICON_OPTIONS
} from '../../lib/profilePageOfferIcons';
import { clearPushRegistration, getSavedPushRegistration } from '../../lib/pushRegistration';
import { getDefaultDisplayName, getPreferredRole, useMobileSession } from '../../lib/session';

type DmAccess = 'free' | 'subscriber_only' | 'paid_only';
type AuthMode = 'sign-in' | 'sign-up';
type OfferIconPickerTarget = {
  blockId: string;
  itemId: string;
} | null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function getDmAccessLabel(value: DmAccess): string {
  if (value === 'free') {
    return 'Everyone';
  }

  if (value === 'subscriber_only') {
    return 'Subscribers';
  }

  return 'Paid only';
}

function getDmIntakePolicyLabel(value: DmIntakePolicy): string {
  if (value === 'form') {
    return 'Fill form';
  }

  if (value === 'paid_fee') {
    return 'Pay fee';
  }

  return 'Direct DM';
}

function getSupporterAccessLabel(value: string | undefined): string {
  if (!value) {
    return 'Free';
  }

  if (value === 'vip') {
    return 'VIP';
  }

  if (value === 'paid') {
    return 'Paid';
  }

  if (value === 'subscriber') {
    return 'Subscriber';
  }

  return 'Free';
}

function getInitials(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return 'S';
  }

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function getCtaLabelPresets(actionType: CreatorProfileCtaActionType) {
  if (actionType === 'direct_message') {
    return ['Message me', 'DM me', 'Start chat'];
  }

  if (actionType === 'form') {
    return ['Apply now', 'Start intake', 'Send inquiry'];
  }

  if (actionType === 'booking') {
    return ['Book a call', 'Reserve a spot', 'Schedule now'];
  }

  return ['Open details', 'Visit site', 'View offer'];
}

function isMissingProgramMediaBucketError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('bucket not found') || message.includes('program-media');
}

function CoverPlaceholder() {
  return (
    <View style={styles.coverPlaceholder}>
      <LinearGradient
        colors={['#1c1b1f', '#121114']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.coverBackdrop}
      />
      <LinearGradient
        colors={['rgba(200, 82, 101, 0.96)', 'rgba(96, 39, 48, 0.92)', 'rgba(22, 18, 20, 0.12)']}
        end={{ x: 0.92, y: 0.86 }}
        locations={[0.08, 0.58, 1]}
        start={{ x: 0.14, y: 0.18 }}
        style={styles.coverOrb}
      />
    </View>
  );
}

function ProfileStat({
  value,
  label
}: {
  value: string;
  label: string;
}) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function GhostCard({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.ghostCard}>
      <Text style={styles.ghostCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function GradientButton({
  children,
  disabled,
  contentStyle,
  fullWidth = true,
  onPress,
  style
}: {
  children: ReactNode;
  disabled?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.gradientButtonShell, style, disabled && styles.gradientButtonDisabled]}>
      <LinearGradient
        colors={theme.gradients.brand}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[fullWidth ? styles.gradientButtonFill : styles.gradientButtonFillAuto, contentStyle]}
      >
        {children}
      </LinearGradient>
    </Pressable>
  );
}

function PostCard({
  post
}: {
  post: ProfilePost;
}) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.postIdentity}>
          <View style={styles.postAvatarFrame}>
            {post.authorAvatarUrl ? (
              <Image source={{ uri: post.authorAvatarUrl }} style={styles.postAvatarImage} />
            ) : (
              <Text style={styles.postAvatarFallback}>{getInitials(post.authorName)}</Text>
            )}
          </View>

          <View style={styles.postHeaderCopy}>
            <Text style={styles.postAuthorName}>{post.authorName}</Text>
            <Text style={styles.postTimestamp}>{post.relativeTime}</Text>
          </View>
        </View>

        <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
      </View>

      {post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}

      {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={styles.postImage} /> : null}

      <View style={styles.postActionRow}>
        <View style={styles.postActionGroup}>
          <Ionicons name="heart-outline" size={19} color={theme.colors.textSecondary} />
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textSecondary} />
        </View>

        <Ionicons name="share-social-outline" size={19} color={theme.colors.textSecondary} />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ setupApplied?: string | string[] }>();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const setupApplied = Array.isArray(params.setupApplied) ? params.setupApplied[0] : params.setupApplied;
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPageAssetKey, setUploadingPageAssetKey] = useState<string | null>(null);
  const [creatingPost, setCreatingPost] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [offerIconPickerTarget, setOfferIconPickerTarget] = useState<OfferIconPickerTarget>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRole, setAuthRole] = useState<'creator' | 'supporter'>('creator');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [niche, setNiche] = useState('');
  const [headline, setHeadline] = useState('');
  const [dmAccess, setDmAccess] = useState<DmAccess>('subscriber_only');
  const [dmIntakePolicy, setDmIntakePolicy] = useState<DmIntakePolicy>('direct_message');
  const [dmFeeUsd, setDmFeeUsd] = useState('25');
  const [pageBlocks, setPageBlocks] = useState<CreatorProfilePageBlock[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);

  const [postBody, setPostBody] = useState('');
  const [pendingPostImage, setPendingPostImage] = useState<PendingUploadImage | null>(null);

  const isProfileOwner = Boolean(user && viewerProfile && user.id === viewerProfile.id);
  const isCreatorProfile = viewerProfile?.role === 'creator';
  const isBusy = savingProfile || uploadingAvatar || uploadingCover || Boolean(uploadingPageAssetKey);
  const firstMediaPostsBlockId = pageBlocks.find((block) => block.type === 'media_posts')?.id;

  function syncFormState(profile: ViewerProfile, fallbackName: string) {
    setDisplayName(profile.displayName || fallbackName);
    setBio(profile.bio ?? '');
    setNiche(profile.creatorProfile?.niche ?? '');
    setHeadline(profile.creatorProfile?.headline ?? '');
    setDmAccess(profile.creatorProfile?.dmAccess ?? 'subscriber_only');
    setDmIntakePolicy(profile.creatorProfile?.dmIntakePolicy ?? 'direct_message');
    setDmFeeUsd(String(profile.creatorProfile?.dmFeeUsd ?? 25));
    const nextPageBlocks =
      profile.role === 'creator'
        ? getEffectiveCreatorPageBlocks(
            profile.creatorProfile?.pageBlocks,
            profile.creatorProfile?.dmIntakePolicy ?? 'direct_message'
          )
        : [];
    setPageBlocks(nextPageBlocks);
  }

  async function loadScreen() {
    if (!supabase || !user) {
      return;
    }

    setLoadingScreen(true);

    try {
      const profile = await getViewerProfile(supabase, user.id);

      if (profile) {
        setViewerProfile(profile);
        syncFormState(profile, getDefaultDisplayName(user));
      } else {
        const preferredRole = getPreferredRole(user);
        const fallbackName = getDefaultDisplayName(user) || 'Syncrolly User';
        const bootstrappedProfile =
          preferredRole === 'creator'
            ? await saveCreatorProfile(supabase, {
                userId: user.id,
                displayName: fallbackName,
                bio: '',
                niche: '',
                headline: '',
                dmAccess: 'subscriber_only',
                dmIntakePolicy: 'direct_message',
                dmFeeUsd: 25,
                pageBlocks: buildStarterCreatorPageBlocks('direct_message')
              })
            : await saveSupporterProfile(supabase, {
                userId: user.id,
                displayName: fallbackName,
                bio: '',
                accessLevel: 'free',
                totalSpend: 0
              });

        setViewerProfile(bootstrappedProfile);
        syncFormState(bootstrappedProfile, fallbackName);
      }

      try {
        const profilePosts = await listProfilePosts(supabase, user.id);
        setPosts(profilePosts);
      } catch (postError) {
        setPosts([]);
        console.warn('Profile posts could not be loaded', postError);
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setLoadingScreen(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setViewerProfile(null);
      setPosts([]);
      return;
    }

    void loadScreen();
  }, [setupApplied, supabase, user?.id]);

  async function persistProfileChanges(overrides?: {
    avatarUrl?: string;
    coverImageUrl?: string;
  }) {
    if (!supabase || !user || !viewerProfile) {
      return null;
    }

    const nextDisplayName =
      displayName.trim() || viewerProfile.displayName || (user ? getDefaultDisplayName(user) : 'Syncrolly User');
    const nextBio = bio.trim();
    const nextDmFeeUsd = Math.max(1, Number.parseInt(dmFeeUsd.trim() || '25', 10) || 25);

    const nextProfile =
      viewerProfile.role === 'creator'
        ? await saveCreatorProfile(supabase, {
            userId: user.id,
            displayName: nextDisplayName,
            avatarUrl: typeof overrides?.avatarUrl !== 'undefined' ? overrides.avatarUrl : undefined,
            coverImageUrl: typeof overrides?.coverImageUrl !== 'undefined' ? overrides.coverImageUrl : undefined,
            bio: nextBio,
            niche: niche.trim(),
            headline: headline.trim(),
            dmAccess,
            dmIntakePolicy,
            dmFeeUsd: nextDmFeeUsd,
            pageBlocks
          })
        : await saveSupporterProfile(supabase, {
            userId: user.id,
            displayName: nextDisplayName,
            avatarUrl: typeof overrides?.avatarUrl !== 'undefined' ? overrides.avatarUrl : undefined,
            coverImageUrl: typeof overrides?.coverImageUrl !== 'undefined' ? overrides.coverImageUrl : undefined,
            bio: nextBio,
            accessLevel: viewerProfile.supporterProfile?.accessLevel ?? 'free',
            totalSpend: viewerProfile.supporterProfile?.totalSpend ?? 0
          });

    setViewerProfile(nextProfile);
    syncFormState(nextProfile, getDefaultDisplayName(user));
    return nextProfile;
  }

  function addPageBlock(type: CreatorProfilePageBlock['type']) {
    const nextBlock =
      type === 'video'
        ? createVideoBlock()
        : type === 'offers'
          ? createOffersBlock()
          : type === 'media_posts'
            ? createMediaPostsBlock()
            : createCtaBlock();

    setPageBlocks((current) => [...current, nextBlock]);
  }

  function updatePageBlock(blockId: string, updater: (block: CreatorProfilePageBlock) => CreatorProfilePageBlock) {
    setPageBlocks((current) => current.map((block) => (block.id === blockId ? updater(block) : block)));
  }

  function movePageBlock(blockId: string, direction: 'up' | 'down') {
    setPageBlocks((current) => {
      const index = current.findIndex((block) => block.id === blockId);

      if (index < 0) {
        return current;
      }

      const nextIndex = direction === 'up' ? index - 1 : index + 1;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextBlocks = [...current];
      const [movedBlock] = nextBlocks.splice(index, 1);
      nextBlocks.splice(nextIndex, 0, movedBlock);
      return nextBlocks;
    });
  }

  function removePageBlock(blockId: string) {
    setPageBlocks((current) => current.filter((block) => block.id !== blockId));
  }

  function addOfferItem(blockId: string) {
    updatePageBlock(blockId, (block) =>
      block.type === 'offers'
        ? {
            ...block,
            items: [
              ...block.items,
              {
                id: `offer-${Math.random().toString(36).slice(2, 10)}`,
                title: '',
                description: '',
                icon: 'sparkles-outline'
              }
            ]
          }
        : block
    );
  }

  function updateOfferItem(blockId: string, itemId: string, field: keyof CreatorProfileOfferItem, value: string) {
    updatePageBlock(blockId, (block) =>
      block.type === 'offers'
        ? {
            ...block,
            items: block.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
          }
        : block
    );
  }

  function updateOfferItemIcon(blockId: string, itemId: string, icon: CreatorProfileOfferIcon) {
    updatePageBlock(blockId, (block) =>
      block.type === 'offers'
        ? {
            ...block,
            items: block.items.map((item) => (item.id === itemId ? { ...item, icon } : item))
          }
        : block
    );
  }

  function removeOfferItem(blockId: string, itemId: string) {
    updatePageBlock(blockId, (block) =>
      block.type === 'offers'
        ? {
            ...block,
            items: block.items.filter((item) => item.id !== itemId)
          }
        : block
    );
  }

  async function handleProfileAuthSubmit() {
    if (!supabase) {
      return;
    }

    if (!authEmail.trim() || !authPassword.trim()) {
      setFeedback('Enter your email and password first.');
      return;
    }

    setAuthSubmitting(true);
    setFeedback(null);

    try {
      if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword
        });

        if (error) {
          throw error;
        }

        setAuthPassword('');
        return;
      }

      const displayName = authDisplayName.trim() || authEmail.trim().split('@')[0] || 'Syncrolly User';
      const { data, error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
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
        setAuthPassword('');
        setFeedback('Account created. Check your email, then sign in here.');
        return;
      }

      setAuthPassword('');
      setFeedback('Account created. Your profile studio is ready.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSaveProfile() {
    if (!viewerProfile) {
      return;
    }

    if (!displayName.trim()) {
      setFeedback('Display name is required.');
      return;
    }

    setSavingProfile(true);
    setFeedback(null);

    try {
      await persistProfileChanges();
      setEditingName(false);
      setEditingBio(false);
      setFeedback('Profile updated.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleInlineProfileCommit(field: 'name' | 'bio') {
    if (!viewerProfile || savingProfile) {
      if (field === 'name') {
        setEditingName(false);
      } else {
        setEditingBio(false);
      }
      return;
    }

    const nextDisplayName = displayName.trim() || viewerProfile.displayName || getDefaultDisplayName(user);
    const nextBio = bio.trim();
    const nameChanged = nextDisplayName !== viewerProfile.displayName;
    const bioChanged = nextBio !== (viewerProfile.bio ?? '');

    if (field === 'name') {
      setEditingName(false);
      if (!nameChanged) {
        return;
      }
    } else {
      setEditingBio(false);
      if (!bioChanged) {
        return;
      }
    }

    setSavingProfile(true);
    setFeedback(null);

    try {
      await persistProfileChanges();
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChooseAvatar() {
    if (!supabase || !user || !viewerProfile) {
      return;
    }

    setUploadingAvatar(true);
    setFeedback(null);

    try {
      const pickedImage = await pickImageForUpload({
        aspect: [1, 1],
        quality: 0.8
      });

      if (!pickedImage) {
        return;
      }

      const avatarUrl = await uploadProfileMedia(supabase, {
        userId: user.id,
        fileData: base64ToArrayBuffer(pickedImage.base64),
        contentType: pickedImage.contentType,
        fileExtension: pickedImage.fileExtension,
        mediaKind: 'avatar'
      });

      await persistProfileChanges({
        avatarUrl
      });
      setFeedback('Profile photo updated.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChooseCover() {
    if (!supabase || !user || !viewerProfile) {
      return;
    }

    setUploadingCover(true);
    setFeedback(null);

    try {
      const pickedImage = await pickImageForUpload({
        aspect: [16, 7],
        quality: 0.78
      });

      if (!pickedImage) {
        return;
      }

      const coverImageUrl = await uploadProfileMedia(supabase, {
        userId: user.id,
        fileData: base64ToArrayBuffer(pickedImage.base64),
        contentType: pickedImage.contentType,
        fileExtension: pickedImage.fileExtension,
        mediaKind: 'cover'
      });

      await persistProfileChanges({
        coverImageUrl
      });
      setFeedback('Cover image updated.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setUploadingCover(false);
    }
  }

  async function handlePickPostImage() {
    setFeedback(null);

    try {
      const pickedImage = await pickImageForUpload({
        aspect: [4, 3],
        quality: 0.84
      });

      if (!pickedImage) {
        return;
      }

      setPendingPostImage(pickedImage);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  async function handleUploadPageVideoAsset(blockId: string, assetKind: 'video' | 'thumbnail') {
    if (!supabase || !user) {
      return;
    }

    const uploadKey = `${blockId}:${assetKind}`;
    setUploadingPageAssetKey(uploadKey);
    setFeedback(null);

    try {
      if (assetKind === 'video') {
        const pickedVideo = await pickVideoForUpload();

        if (!pickedVideo) {
          return;
        }

        const uploadedVideoUrl = await uploadProfilePageAsset(supabase, {
          userId: user.id,
          fileData: await fileUriToArrayBuffer(pickedVideo.uri),
          contentType: pickedVideo.contentType,
          fileExtension: pickedVideo.fileExtension,
          assetKind: 'video'
        });

        updatePageBlock(blockId, (block) =>
          block.type === 'video'
            ? {
                ...block,
                videoUrl: uploadedVideoUrl
              }
            : block
        );
        setFeedback('Video uploaded. Save profile to publish it.');
        return;
      }

      const pickedThumbnail = await pickImageForUpload({
        aspect: [16, 9],
        quality: 0.84
      });

      if (!pickedThumbnail) {
        return;
      }

      const uploadedThumbnailUrl = await uploadProfilePageAsset(supabase, {
        userId: user.id,
        fileData: base64ToArrayBuffer(pickedThumbnail.base64),
        contentType: pickedThumbnail.contentType,
        fileExtension: pickedThumbnail.fileExtension,
        assetKind: 'thumbnail'
      });

      updatePageBlock(blockId, (block) =>
        block.type === 'video'
          ? {
              ...block,
              thumbnailUrl: uploadedThumbnailUrl
            }
          : block
      );
      setFeedback('Thumbnail uploaded. Save profile to publish it.');
    } catch (error) {
      setFeedback(
        isMissingProgramMediaBucketError(error)
          ? 'The upload failed because the program-media bucket is missing in Supabase.'
          : getErrorMessage(error)
      );
    } finally {
      setUploadingPageAssetKey((current) => (current === uploadKey ? null : current));
    }
  }

  async function handlePublishPost() {
    if (!supabase || !user || !viewerProfile) {
      return;
    }

    if (!postBody.trim() && !pendingPostImage) {
      setFeedback('Write something or attach an image before posting.');
      return;
    }

    setCreatingPost(true);
    setFeedback(null);

    try {
      let imageUrl: string | undefined;

      if (pendingPostImage) {
        imageUrl = await uploadProfileMedia(supabase, {
          userId: user.id,
          fileData: base64ToArrayBuffer(pendingPostImage.base64),
          contentType: pendingPostImage.contentType,
          fileExtension: pendingPostImage.fileExtension,
          mediaKind: 'post'
        });
      }

      await createProfilePost(supabase, {
        userId: user.id,
        body: postBody.trim(),
        imageUrl
      });

      const nextPosts = await listProfilePosts(supabase, user.id);
      setPosts(nextPosts);
      setPostBody('');
      setPendingPostImage(null);
      setFeedback('Post published.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setCreatingPost(false);
    }
  }

  function handleConfirmDeletePost(postId: string) {
    Alert.alert('Remove post?', 'This will remove the media post from your profile.', [
      {
        text: 'Cancel',
        style: 'cancel'
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void handleDeletePost(postId)
      }
    ]);
  }

  async function handleDeletePost(postId: string) {
    if (!supabase || !user || !isProfileOwner) {
      return;
    }

    const previousPosts = posts;

    setDeletingPostId(postId);
    setFeedback(null);
    setPosts((current) => current.filter((post) => post.id !== postId));

    try {
      await deleteProfilePost(supabase, {
        postId,
        userId: user.id
      });
      setFeedback('Post removed.');
    } catch (error) {
      setPosts(previousPosts);
      setFeedback(getErrorMessage(error));
    } finally {
      setDeletingPostId(null);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    setFeedback(null);

    try {
      const savedRegistration = await getSavedPushRegistration();

      if (savedRegistration && user && savedRegistration.userId === user.id) {
        await unregisterPushDevice(supabase, {
          expoPushToken: savedRegistration.expoPushToken
        });

        await clearPushRegistration();
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  const selectedOfferIconValue = (() => {
    if (!offerIconPickerTarget) {
      return null;
    }

    const offersBlock = pageBlocks.find(
      (block): block is Extract<CreatorProfilePageBlock, { type: 'offers' }> =>
        block.id === offerIconPickerTarget.blockId && block.type === 'offers'
    );

    return offersBlock?.items.find((item) => item.id === offerIconPickerTarget.itemId)?.icon ?? null;
  })();

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <AmbientBackground />
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Profile</Text>
            <Text style={styles.emptyBody}>Add your Supabase keys in `apps/mobile/.env` to load the real profile.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingScreen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <AmbientBackground />
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
            <Text style={styles.emptyBody}>Loading your creator studio...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <AmbientBackground />
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Profile</Text>
            <Text style={styles.emptyBody}>
              Sign in to Syncrolly to create and manage your profile. You can do it right here.
            </Text>
            <View style={styles.authCard}>
            <View style={styles.authModeRow}>
              <Pressable
                onPress={() => setAuthMode('sign-in')}
                style={[styles.chip, authMode === 'sign-in' && styles.chipActive]}
              >
                <Text style={[styles.chipText, authMode === 'sign-in' && styles.chipTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable
                onPress={() => setAuthMode('sign-up')}
                style={[styles.chip, authMode === 'sign-up' && styles.chipActive]}
              >
                <Text style={[styles.chipText, authMode === 'sign-up' && styles.chipTextActive]}>
                  Create account
                </Text>
              </Pressable>
            </View>

            {authMode === 'sign-up' ? (
              <>
                <TextInput
                  autoCorrect={false}
                  onChangeText={setAuthDisplayName}
                  placeholder="Display name"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.authInput}
                  value={authDisplayName}
                />
                <View style={styles.authRoleRow}>
                  <Pressable
                    onPress={() => setAuthRole('creator')}
                    style={[styles.chip, authRole === 'creator' && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, authRole === 'creator' && styles.chipTextActive]}>Creator</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAuthRole('supporter')}
                    style={[styles.chip, authRole === 'supporter' && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, authRole === 'supporter' && styles.chipTextActive]}>
                      Supporter
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setAuthEmail}
              placeholder="Email"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.authInput}
              value={authEmail}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setAuthPassword}
              placeholder="Password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              style={styles.authInput}
              value={authPassword}
            />
            <GradientButton
              disabled={authSubmitting}
              onPress={handleProfileAuthSubmit}
              style={[styles.saveButton, styles.authSubmitButton]}
              contentStyle={styles.authSubmitButtonInner}
            >
              {authSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {authMode === 'sign-in' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </GradientButton>
          </View>
            {feedback ? <Text style={styles.emptyStateFeedback}>{feedback}</Text> : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!viewerProfile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <AmbientBackground />
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Profile</Text>
            <Text style={styles.emptyBody}>
              We found your Syncrolly account, but this profile screen did not finish loading your profile yet.
            </Text>
            <GradientButton
              onPress={() => void loadScreen()}
              style={[styles.saveButton, styles.authSubmitButton]}
              contentStyle={styles.authSubmitButtonInner}
            >
              <Text style={styles.saveButtonText}>Retry profile setup</Text>
            </GradientButton>
            {feedback ? <Text style={styles.emptyStateFeedback}>{feedback}</Text> : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const postsStatValue = `${posts.length}`;
  const secondaryStatValue = isCreatorProfile
    ? `${pageBlocks.length}`
    : getSupporterAccessLabel(viewerProfile.supporterProfile?.accessLevel);
  const secondaryStatLabel = isCreatorProfile ? 'Blocks' : 'Access';
  const profileTag = isCreatorProfile ? niche.trim() || 'Creator profile' : 'Supporter profile';
  const resolvedBio = bio.trim() || 'Add a short bio that tells people what you are building.';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.screen}>
        <AmbientBackground />

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileShell}>
          <Pressable
            disabled={!isProfileOwner || uploadingCover}
            onPress={isProfileOwner ? handleChooseCover : undefined}
            style={styles.coverSection}
          >
            {viewerProfile.coverImageUrl ? (
              <Image source={{ uri: viewerProfile.coverImageUrl }} style={styles.coverImage} />
            ) : (
              <CoverPlaceholder />
            )}

            <LinearGradient
              colors={['rgba(6, 14, 32, 0)', 'rgba(11, 19, 38, 0.74)', '#0b1326']}
              end={{ x: 0.5, y: 1 }}
              locations={[0.38, 0.82, 1]}
              pointerEvents="none"
              start={{ x: 0.5, y: 0 }}
              style={styles.coverFade}
            />

            {uploadingCover ? (
              <View pointerEvents="none" style={styles.coverLoading}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            ) : null}
          </Pressable>

          <View style={styles.profileBody}>
            <View style={styles.profileHeaderRow}>
              <Pressable
                disabled={!isProfileOwner || uploadingAvatar}
                onPress={isProfileOwner ? handleChooseAvatar : undefined}
                style={styles.avatarRow}
              >
                <View style={[styles.avatarFrame, uploadingAvatar && styles.avatarFrameUploading]}>
                  {viewerProfile.avatarUrl ? (
                    <Image source={{ uri: viewerProfile.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarFallback}>{getInitials(displayName || viewerProfile.displayName)}</Text>
                  )}
                </View>

                {uploadingAvatar ? (
                  <View pointerEvents="none" style={styles.avatarLoading}>
                    <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                  </View>
                ) : null}
              </Pressable>

              <View style={styles.profileIdentity}>
                <Text style={styles.profileTag}>{profileTag}</Text>

                <View style={styles.nameRow}>
                  {editingName && isProfileOwner ? (
                    <TextInput
                      autoFocus
                      blurOnSubmit
                      onBlur={() => {
                        void handleInlineProfileCommit('name');
                      }}
                      onSubmitEditing={() => {
                        void handleInlineProfileCommit('name');
                      }}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Display name"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.nameInput}
                    />
                  ) : (
                    <Pressable
                      disabled={!isProfileOwner}
                      onPress={() => {
                        if (!isProfileOwner) {
                          return;
                        }

                        setEditingBio(false);
                        setEditingName(true);
                      }}
                      style={styles.inlineEditTarget}
                    >
                      <Text style={styles.profileName}>{displayName || viewerProfile.displayName}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.bioRow}>
              {editingBio && isProfileOwner ? (
                <TextInput
                  autoFocus
                  multiline
                  onBlur={() => {
                    void handleInlineProfileCommit('bio');
                  }}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Add your bio"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.bioInput}
                />
              ) : (
                <Pressable
                  disabled={!isProfileOwner}
                  onPress={() => {
                    if (!isProfileOwner) {
                      return;
                    }

                    setEditingName(false);
                    setEditingBio(true);
                  }}
                  style={styles.inlineEditTarget}
                >
                  <Text style={styles.profileBio}>{resolvedBio}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.statsRow}>
              <ProfileStat value={postsStatValue} label="Posts" />
              <ProfileStat value={secondaryStatValue} label={secondaryStatLabel} />
            </View>
          </View>
        </View>

        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

        {!isCreatorProfile ? (
          <GhostCard title="Account">
            <Text style={styles.accountValue}>Access level: {getSupporterAccessLabel(viewerProfile.supporterProfile?.accessLevel)}</Text>
            <Text style={styles.accountValue}>Total spend: ${viewerProfile.supporterProfile?.totalSpend ?? 0}</Text>
          </GhostCard>
        ) : null}

        {isCreatorProfile ? (
          <GhostCard title="Profile Page Builder">
            <Text style={styles.builderIntro}>
              Build the mobile landing page your leads see first. This structure is saved so we can mirror it on web later.
            </Text>

            <Pressable style={styles.setupStudioCard} onPress={() => router.push('/creator-onboarding')}>
              <View style={styles.setupStudioIconWrap}>
                <Ionicons name="sparkles-outline" size={18} color="#ffffff" />
              </View>
              <View style={styles.setupStudioCopy}>
                <Text style={styles.setupStudioTitle}>Creator Setup Studio</Text>
                <Text style={styles.setupStudioBody}>Answer a few questions and generate your profile blocks, CTA, and messaging settings.</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.textSecondary} />
            </Pressable>

            <View style={styles.builderAddRow}>
              <GradientButton fullWidth={false} style={styles.builderAddButton} contentStyle={styles.builderAddButtonInner} onPress={() => addPageBlock('video')}>
                <Ionicons name="play-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.builderAddButtonText}>Video</Text>
              </GradientButton>
              <GradientButton fullWidth={false} style={styles.builderAddButton} contentStyle={styles.builderAddButtonInner} onPress={() => addPageBlock('offers')}>
                <Ionicons name="grid-outline" size={16} color="#ffffff" />
                <Text style={styles.builderAddButtonText}>Offers</Text>
              </GradientButton>
              <GradientButton fullWidth={false} style={styles.builderAddButton} contentStyle={styles.builderAddButtonInner} onPress={() => addPageBlock('cta')}>
                <Ionicons name="arrow-forward-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.builderAddButtonText}>CTA</Text>
              </GradientButton>
              <GradientButton fullWidth={false} style={styles.builderAddButton} contentStyle={styles.builderAddButtonInner} onPress={() => addPageBlock('media_posts')}>
                <Ionicons name="images-outline" size={16} color="#ffffff" />
                <Text style={styles.builderAddButtonText}>Media posts</Text>
              </GradientButton>
            </View>

            <View style={styles.builderBlockList}>
              {pageBlocks.map((block, index) => {
                return (
                  <View key={block.id} style={styles.builderBlockCard}>
                    <View style={styles.builderBlockToolbar}>
                      <View style={styles.builderBlockActions}>
                        <Pressable
                          style={styles.builderIconButton}
                          onPress={() => movePageBlock(block.id, 'up')}
                          disabled={index === 0}
                        >
                          <Ionicons
                            name="arrow-up"
                            size={15}
                            color={index === 0 ? '#b3bbca' : theme.colors.primaryStrong}
                          />
                        </Pressable>
                        <Pressable
                          style={styles.builderIconButton}
                          onPress={() => movePageBlock(block.id, 'down')}
                          disabled={index === pageBlocks.length - 1}
                        >
                          <Ionicons
                            name="arrow-down"
                            size={15}
                            color={index === pageBlocks.length - 1 ? '#b3bbca' : theme.colors.primaryStrong}
                          />
                        </Pressable>
                        <Pressable style={styles.builderIconButton} onPress={() => removePageBlock(block.id)}>
                          <Ionicons name="trash-outline" size={15} color="#d14343" />
                        </Pressable>
                      </View>
                    </View>

                    {block.type === 'video' ? (
                        <View style={styles.builderLiveVideoCard}>
                      <TextInput
                        value={block.title}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'video' ? { ...current, title: value } : current)
                        }
                        placeholder="Introduction"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.builderLiveVideoTitleInput}
                      />
                      <TextInput
                        value={block.description}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'video' ? { ...current, description: value } : current)
                        }
                        placeholder="Explain what this video helps the viewer understand."
                        placeholderTextColor="#7b8596"
                        multiline
                        style={styles.builderLiveBodyInput}
                      />

                      <View style={styles.builderLiveVideoPreview}>
                        {block.thumbnailUrl ? (
                          <Image source={{ uri: block.thumbnailUrl }} style={styles.builderLiveVideoPreviewImage} />
                        ) : (
                          <LinearGradient
                            colors={['#3e3128', '#8f6a4d', '#4b4038']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.builderLiveVideoPreviewImage}
                          />
                        )}

                        <View style={styles.builderLiveVideoPlayButton}>
                          <Ionicons name="play" size={18} color={theme.colors.primaryStrong} />
                        </View>
                      </View>

                      <View style={styles.builderMediaUploadRow}>
                        <Pressable
                          style={[
                            styles.builderUploadButton,
                            uploadingPageAssetKey === `${block.id}:video` && styles.builderUploadButtonDisabled
                          ]}
                          onPress={() => void handleUploadPageVideoAsset(block.id, 'video')}
                          disabled={uploadingPageAssetKey !== null}
                        >
                          {uploadingPageAssetKey === `${block.id}:video` ? (
                            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                          ) : (
                            <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.primaryStrong} />
                          )}
                          <Text style={styles.builderUploadButtonText}>Video</Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.builderUploadButton,
                            uploadingPageAssetKey === `${block.id}:thumbnail` && styles.builderUploadButtonDisabled
                          ]}
                          onPress={() => void handleUploadPageVideoAsset(block.id, 'thumbnail')}
                          disabled={uploadingPageAssetKey !== null}
                        >
                          {uploadingPageAssetKey === `${block.id}:thumbnail` ? (
                            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                          ) : (
                            <Ionicons name="image-outline" size={16} color={theme.colors.primaryStrong} />
                          )}
                          <Text style={styles.builderUploadButtonText}>Thumbnail</Text>
                        </Pressable>
                      </View>
                        </View>
                      ) : null}

                    {block.type === 'offers' ? (
                        <View style={styles.builderLiveOffersPanel}>
                      <TextInput
                        value={block.eyebrow ?? ''}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'offers' ? { ...current, eyebrow: value } : current)
                        }
                        placeholder="Curation services"
                        placeholderTextColor={theme.colors.primaryStrong}
                        style={styles.builderLiveOffersEyebrowInput}
                      />
                      <TextInput
                        value={block.title}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'offers' ? { ...current, title: value } : current)
                        }
                        placeholder="Offerings"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.builderLiveOffersTitleInput}
                      />

                      <View style={styles.offerBuilderList}>
                        {block.items.map((item) => (
                          <View key={item.id} style={styles.builderLiveOfferRow}>
                            <Pressable
                              style={styles.builderLiveOfferIconButton}
                              onPress={() => setOfferIconPickerTarget({ blockId: block.id, itemId: item.id })}
                            >
                              <Ionicons name={item.icon} size={16} color={theme.colors.primaryStrong} />
                            </Pressable>

                            <View style={styles.builderLiveOfferCopy}>
                              <TextInput
                                value={item.title}
                                onChangeText={(value) => updateOfferItem(block.id, item.id, 'title', value)}
                                placeholder="Offer title"
                                placeholderTextColor={theme.colors.textMuted}
                                style={styles.builderLiveOfferTitleInput}
                              />
                              <TextInput
                                value={item.description}
                                onChangeText={(value) => updateOfferItem(block.id, item.id, 'description', value)}
                                placeholder="Describe what is included."
                                placeholderTextColor={theme.colors.textMuted}
                                multiline
                                style={styles.builderLiveOfferDescriptionInput}
                              />
                            </View>

                            <View style={styles.builderLiveOfferActions}>
                              <Pressable
                                hitSlop={8}
                                onPress={() => setOfferIconPickerTarget({ blockId: block.id, itemId: item.id })}
                              >
                                <Text style={styles.builderLiveOfferIconLabel}>{getProfilePageOfferIconLabel(item.icon)}</Text>
                              </Pressable>
                              <Pressable hitSlop={8} onPress={() => removeOfferItem(block.id, item.id)}>
                                <Ionicons name="close" size={16} color="#9aa3b2" />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>

                      <Pressable style={styles.builderTextAction} onPress={() => addOfferItem(block.id)}>
                        <Text style={styles.builderTextActionText}>Add offer</Text>
                      </Pressable>
                        </View>
                    ) : null}

                    {block.type === 'media_posts' ? (
                        <View style={styles.builderLivePostsPanel}>
                      <TextInput
                        value={block.eyebrow ?? ''}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'media_posts' ? { ...current, eyebrow: value } : current)
                        }
                        placeholder="Recent media"
                        placeholderTextColor={theme.colors.primaryStrong}
                        style={styles.builderLivePostsEyebrowInput}
                      />
                      <TextInput
                        value={block.title}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'media_posts' ? { ...current, title: value } : current)
                        }
                        placeholder="Media Posts"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.builderLivePostsTitleInput}
                      />
                      <TextInput
                        value={block.description}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'media_posts' ? { ...current, description: value } : current)
                        }
                        placeholder="Introduce the kind of posts people will find here."
                        placeholderTextColor={theme.colors.textMuted}
                        multiline
                        style={styles.builderLiveBodyInput}
                      />

                      {isProfileOwner && firstMediaPostsBlockId === block.id ? (
                        <View style={styles.builderMediaComposerCard}>
                          <TextInput
                            value={postBody}
                            onChangeText={setPostBody}
                            placeholder="What's on your mind?"
                            placeholderTextColor="#7a8190"
                            multiline
                            style={styles.builderMediaComposerInput}
                          />

                          {pendingPostImage ? (
                            <View style={styles.pendingImageWrap}>
                              <Image source={{ uri: pendingPostImage.previewUri }} style={styles.pendingImagePreview} />
                              <Pressable onPress={() => setPendingPostImage(null)} style={styles.pendingImageRemove}>
                                <Ionicons name="close" size={16} color="#ffffff" />
                              </Pressable>
                            </View>
                          ) : null}

                          <View style={styles.builderMediaComposerActions}>
                            <Pressable onPress={handlePickPostImage} style={styles.builderTextAction}>
                              <Text style={styles.builderTextActionText}>
                                {pendingPostImage ? 'Change image' : 'Add image'}
                              </Text>
                            </Pressable>

                            <GradientButton
                              style={styles.postButton}
                              contentStyle={styles.postButtonInner}
                              onPress={handlePublishPost}
                              disabled={creatingPost}
                            >
                              {creatingPost ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                              ) : (
                                <Text style={styles.postButtonText}>Post</Text>
                              )}
                            </GradientButton>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.builderMediaPostsList}>
                        {posts.length ? (
                          posts.slice(0, 2).map((post) => (
                            <View key={post.id} style={styles.builderMediaPostCard}>
                              {post.imageUrl ? (
                                <Image source={{ uri: post.imageUrl }} style={styles.builderMediaPostImage} />
                              ) : null}

                              <View style={styles.builderMediaPostBody}>
                                {post.body ? (
                                  <Text style={styles.builderMediaPostCaption} numberOfLines={3}>
                                    {post.body}
                                  </Text>
                                ) : null}

                                <View style={styles.builderMediaPostMetaRow}>
                                  <View style={styles.builderMediaPostMetaActions}>
                                    <View style={styles.builderMediaPostLikePill}>
                                      <Ionicons
                                        name={post.likedByViewer ? 'heart' : 'heart-outline'}
                                        size={13}
                                        color={post.likedByViewer ? '#e2547b' : theme.colors.textMuted}
                                      />
                                      <Text style={styles.builderMediaPostLikeText}>{post.likeCount}</Text>
                                    </View>

                                    <Pressable
                                      disabled={deletingPostId === post.id}
                                      hitSlop={8}
                                      onPress={() => handleConfirmDeletePost(post.id)}
                                      style={styles.builderMediaPostDeleteButton}
                                    >
                                      {deletingPostId === post.id ? (
                                        <ActivityIndicator size="small" color="#f87171" />
                                      ) : (
                                        <Ionicons name="trash-outline" size={14} color="#f87171" />
                                      )}
                                    </Pressable>
                                  </View>
                                  <Text style={styles.builderMediaPostTimestamp}>{post.relativeTime}</Text>
                                </View>
                              </View>
                            </View>
                          ))
                        ) : (
                          <View style={styles.builderMediaPostEmptyState}>
                            <Text style={styles.builderMediaPostEmptyTitle}>No media posts yet</Text>
                            <Text style={styles.builderMediaPostEmptyBody}>
                              {isProfileOwner && firstMediaPostsBlockId === block.id
                                ? 'Use the composer above and your posts will land in this timeline.'
                                : 'Your published posts will land in this timeline.'}
                            </Text>
                          </View>
                        )}
                      </View>
                        </View>
                    ) : null}

                    {block.type === 'cta' ? (
                        <View style={styles.builderLiveCtaPanel}>
                      <TextInput
                        value={block.title}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'cta' ? { ...current, title: value } : current)
                        }
                        placeholder="Ready to take the next step?"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.builderLiveCtaTitleInput}
                      />
                      <TextInput
                        value={block.description}
                        onChangeText={(value) =>
                          updatePageBlock(block.id, (current) => current.type === 'cta' ? { ...current, description: value } : current)
                        }
                        placeholder="Tell them what happens after they tap."
                        placeholderTextColor={theme.colors.textMuted}
                        multiline
                        style={styles.builderLiveBodyInput}
                      />

                      <View style={styles.chipRow}>
                        {(['direct_message', 'form', 'booking', 'external_url'] as CreatorProfileCtaActionType[]).map((value) => {
                          const isSelected = block.actionType === value;

                          return (
                            <Pressable
                              key={value}
                              style={[styles.chip, isSelected && styles.chipActive]}
                              onPress={() =>
                                updatePageBlock(block.id, (current) =>
                                  current.type === 'cta' ? { ...current, actionType: value } : current
                                )
                              }
                            >
                              <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                                {value === 'direct_message'
                                  ? 'DM'
                                  : value === 'form'
                                    ? 'Form'
                                    : value === 'booking'
                                      ? 'Book a call'
                                      : 'External link'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <View style={styles.builderPresetRow}>
                        {getCtaLabelPresets(block.actionType).map((value) => (
                          <Pressable
                            key={value}
                            style={styles.builderPresetChip}
                            onPress={() =>
                              updatePageBlock(block.id, (current) =>
                                current.type === 'cta' ? { ...current, buttonLabel: value } : current
                              )
                            }
                          >
                            <Text style={styles.builderPresetChipText}>{value}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {block.actionType === 'external_url' ? (
                        <TextInput
                          value={block.target}
                          onChangeText={(value) =>
                            updatePageBlock(block.id, (current) => current.type === 'cta' ? { ...current, target: value } : current)
                          }
                          placeholder="https://your-link.com"
                          placeholderTextColor={theme.colors.textMuted}
                          autoCapitalize="none"
                          style={styles.detailInput}
                        />
                      ) : (
                        <Text style={styles.builderHelpText}>
                          {block.actionType === 'direct_message'
                            ? 'This button will open a native Syncrolly DM.'
                            : block.actionType === 'form'
                              ? 'This button will open your inquiry form inside Syncrolly.'
                              : 'This button will start a direct booking flow inside Syncrolly.'}
                        </Text>
                      )}

                      <LinearGradient
                        colors={theme.gradients.brand}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.builderLiveCtaButton}
                      >
                        <TextInput
                          value={block.buttonLabel}
                          onChangeText={(value) =>
                            updatePageBlock(block.id, (current) => current.type === 'cta' ? { ...current, buttonLabel: value } : current)
                          }
                          placeholder="Apply now"
                          placeholderTextColor="rgba(255,255,255,0.72)"
                          style={styles.builderLiveCtaButtonInput}
                        />
                      </LinearGradient>
                        </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </GhostCard>
        ) : null}

        <Modal
          visible={Boolean(offerIconPickerTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => setOfferIconPickerTarget(null)}
        >
          <Pressable style={styles.iconPickerBackdrop} onPress={() => setOfferIconPickerTarget(null)}>
            <Pressable style={styles.iconPickerSheet} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.iconPickerTitle}>Choose an icon</Text>
              <Text style={styles.iconPickerBody}>
                Pick the visual cue that best matches this offer.
              </Text>

              <View style={styles.iconPickerGrid}>
                {PROFILE_PAGE_OFFER_ICON_OPTIONS.map((option) => {
                  const isSelected = option.value === selectedOfferIconValue;

                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.iconPickerOption, isSelected && styles.iconPickerOptionActive]}
                      onPress={() => {
                        if (!offerIconPickerTarget) {
                          return;
                        }

                        updateOfferItemIcon(offerIconPickerTarget.blockId, offerIconPickerTarget.itemId, option.value);
                        setOfferIconPickerTarget(null);
                      }}
                    >
                      <View style={[styles.iconPickerOptionIcon, isSelected && styles.iconPickerOptionIconActive]}>
                        <Ionicons
                          name={option.value}
                          size={18}
                          color={isSelected ? '#ffffff' : theme.colors.primaryStrong}
                        />
                      </View>
                      <Text style={[styles.iconPickerOptionLabel, isSelected && styles.iconPickerOptionLabelActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {isProfileOwner ? (
          <View style={styles.profileActionStack}>
            <View style={styles.profilePrimaryActions}>
              <Pressable
                style={styles.previewButton}
                onPress={() =>
                  router.push({
                    pathname: '/profile/[profileId]',
                    params: {
                      profileId: viewerProfile.id,
                      preview: '1'
                    }
                  })
                }
              >
                <Text style={styles.previewButtonText}>Preview page</Text>
              </Pressable>

              <GradientButton
                style={[styles.saveButton, styles.saveButtonExpanded]}
                contentStyle={styles.saveButtonInner}
                onPress={handleSaveProfile}
                disabled={isBusy}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save profile</Text>
                )}
              </GradientButton>
            </View>

            <Pressable hitSlop={8} onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutButtonText}>Sign out</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  container: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 120,
    gap: 18
  },
  profileShell: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 12
    },
    elevation: 6
  },
  coverSection: {
    height: 146,
    position: 'relative',
    backgroundColor: '#151418'
  },
  coverImage: {
    width: '100%',
    height: '100%'
  },
  coverPlaceholder: {
    flex: 1,
    backgroundColor: '#171619',
    overflow: 'hidden'
  },
  coverBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  coverOrb: {
    position: 'absolute',
    width: 336,
    height: 336,
    left: 8,
    top: -138,
    borderRadius: 999,
    transform: [{ rotate: '-12deg' }, { scaleX: 1.08 }, { scaleY: 0.94 }]
  },
  coverFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 84
  },
  coverLoading: {
    position: 'absolute',
    right: 12,
    bottom: 12
  },
  profileBody: {
    position: 'relative',
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingBottom: 20
  },
  profileHeaderRow: {
    marginTop: -52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12
  },
  avatarRow: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileIdentity: {
    flex: 1,
    paddingBottom: 6
  },
  avatarFrame: {
    width: 84,
    height: 84,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f1625',
    borderWidth: 2,
    borderColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050607',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 8
  },
  avatarFrameUploading: {
    opacity: 0.72
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarFallback: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800'
  },
  avatarLoading: {
    position: 'absolute',
    right: 0,
    bottom: 0
  },
  profileTag: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  nameRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  profileName: {
    flex: 1,
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  nameInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    color: theme.colors.textPrimary,
    fontSize: 21,
    fontWeight: '700'
  },
  bioRow: {
    marginTop: 6
  },
  inlineEditTarget: {
    flex: 1
  },
  profileBio: {
    flex: 1,
    color: theme.colors.onSurfaceVariant,
    fontSize: 15,
    lineHeight: 22
  },
  bioInput: {
    flex: 1,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top'
  },
  statsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 28
  },
  profileStat: {
    gap: 2
  },
  profileStatValue: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  profileStatLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  feedbackText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  composerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: 16,
    gap: 14
  },
  composerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  composerAvatarFrame: {
    width: 42,
    height: 42,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f1625',
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerAvatarImage: {
    width: '100%',
    height: '100%'
  },
  composerAvatarFallback: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16
  },
  composerInput: {
    flex: 1,
    minHeight: 78,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top'
  },
  pendingImageWrap: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    position: 'relative'
  },
  pendingImagePreview: {
    width: '100%',
    height: 180
  },
  pendingImageRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(25, 28, 33, 0.72)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  composerActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  composerIconButton: {
    paddingVertical: 6,
    paddingHorizontal: 4
  },
  postButton: {
    borderRadius: theme.radii.sm,
    overflow: 'hidden'
  },
  postButtonInner: {
    minWidth: 72,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  postButtonDisabled: {
    opacity: 0.72
  },
  postButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  postsSection: {
    gap: 14
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  postCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    overflow: 'hidden'
  },
  postHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  postIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  postAvatarFrame: {
    width: 42,
    height: 42,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f1625',
    alignItems: 'center',
    justifyContent: 'center'
  },
  postAvatarImage: {
    width: '100%',
    height: '100%'
  },
  postAvatarFallback: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  },
  postHeaderCopy: {
    gap: 2
  },
  postAuthorName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  postTimestamp: {
    color: theme.colors.textSecondary,
    fontSize: 12
  },
  postBody: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 28
  },
  postImage: {
    width: '100%',
    height: 240,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  postActionRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  postActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  ghostCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radii.md,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  ghostCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  fieldCaption: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  detailInput: {
    minHeight: 46,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipActive: {
    backgroundColor: theme.colors.primarySoft
  },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  chipTextActive: {
    color: theme.colors.textPrimary
  },
  accountValue: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22
  },
  builderIntro: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  setupStudioCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  setupStudioIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  setupStudioCopy: {
    flex: 1,
    gap: 3
  },
  setupStudioTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  setupStudioBody: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  builderAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  builderDragHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  builderAddButton: {
    minHeight: 36,
    borderRadius: 14,
    overflow: 'hidden',
    alignSelf: 'flex-start'
  },
  builderAddButtonInner: {
    minHeight: 36,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  builderAddButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  builderBlockList: {
    minHeight: 10
  },
  builderDragListContent: {
    paddingBottom: 2
  },
  builderBlockSpacer: {
    height: 14
  },
  builderBlockCard: {
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  builderBlockCardDragging: {
    opacity: 0.96,
    transform: [{ scale: 1.01 }]
  },
  builderBlockToolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4
  },
  builderBlockToolbarLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  builderDragHandle: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderDragHandleActive: {
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  builderBlockHeader: {
    flex: 1,
    gap: 4
  },
  builderBlockEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  builderBlockSummary: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  builderBlockActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  builderBlockIndex: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center'
  },
  builderIconButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderMediaUploadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  builderUploadButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  builderUploadButtonDisabled: {
    opacity: 0.7
  },
  builderUploadButtonText: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800'
  },
  offerBuilderList: {
    gap: 10
  },
  builderLiveVideoCard: {
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 12,
    shadowColor: '#050910',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  builderLiveVideoTitleInput: {
    color: theme.colors.textPrimary,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    fontFamily: 'Georgia',
    paddingVertical: 0
  },
  builderLiveBodyInput: {
    minHeight: 68,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    paddingVertical: 0,
    textAlignVertical: 'top'
  },
  builderLiveVideoPreview: {
    marginTop: 4,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  builderLiveVideoPreviewImage: {
    ...StyleSheet.absoluteFillObject
  },
  builderLiveVideoPlayButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(11,19,38,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderLiveVideoPreviewPill: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(11,19,38,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  builderLiveVideoPreviewPillText: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9
  },
  builderLiveOffersPanel: {
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 16
  },
  builderLiveOffersEyebrowInput: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    paddingVertical: 0
  },
  builderLiveOffersTitleInput: {
    color: theme.colors.textPrimary,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    fontFamily: 'Georgia',
    paddingVertical: 0
  },
  builderLiveOfferRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  builderLiveOfferIconButton: {
    width: 34,
    height: 34,
    borderRadius: 4,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderLiveOfferCopy: {
    flex: 1,
    gap: 4
  },
  builderLiveOfferTitleInput: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 0
  },
  builderLiveOfferDescriptionInput: {
    minHeight: 36,
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    paddingVertical: 0,
    textAlignVertical: 'top'
  },
  builderLiveOfferActions: {
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 2
  },
  builderLiveOfferIconLabel: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  builderLivePostsPanel: {
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 14
  },
  builderLivePostsEyebrowInput: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    paddingVertical: 0
  },
  builderLivePostsTitleInput: {
    color: theme.colors.textPrimary,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    fontFamily: 'Georgia',
    paddingVertical: 0
  },
  builderMediaComposerCard: {
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12
  },
  builderMediaComposerInput: {
    minHeight: 76,
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 0,
    textAlignVertical: 'top'
  },
  builderMediaComposerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  builderMediaPostsList: {
    gap: 12
  },
  builderMediaPostCard: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  builderMediaPostImage: {
    width: '100%',
    height: 168,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  builderMediaPostBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10
  },
  builderMediaPostCaption: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 21
  },
  builderMediaPostMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  builderMediaPostMetaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  builderMediaPostLikePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  builderMediaPostDeleteButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderMediaPostLikeText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  builderMediaPostTimestamp: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600'
  },
  builderMediaPostEmptyState: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderStyle: 'dashed',
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6
  },
  builderMediaPostEmptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  builderMediaPostEmptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  builderLiveCtaPanel: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  builderLiveCtaTitleInput: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    paddingVertical: 0
  },
  builderLiveCtaButton: {
    minHeight: 48,
    borderRadius: 4,
    paddingHorizontal: 18,
    justifyContent: 'center'
  },
  builderLiveCtaButtonInput: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    paddingVertical: 0,
    textAlign: 'center'
  },
  builderTextAction: {
    alignSelf: 'flex-start',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderTextActionText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800'
  },
  builderHelpText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  builderPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  builderPresetChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  builderPresetChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  iconPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 6, 12, 0.68)',
    justifyContent: 'flex-end',
    padding: 20
  },
  iconPickerSheet: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#050910',
    shadowOpacity: 1,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 16
    },
    elevation: 6
  },
  iconPickerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  iconPickerBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  iconPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  iconPickerOption: {
    width: '30%',
    minWidth: 92,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8
  },
  iconPickerOptionActive: {
    backgroundColor: theme.colors.primarySoft
  },
  iconPickerOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconPickerOptionIconActive: {
    backgroundColor: theme.colors.primaryStrong
  },
  iconPickerOptionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  iconPickerOptionLabelActive: {
    color: theme.colors.textPrimary
  },
  gradientButtonShell: {
    overflow: 'hidden'
  },
  gradientButtonFill: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  gradientButtonFillAuto: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start'
  },
  gradientButtonDisabled: {
    opacity: 0.7
  },
  saveButton: {
    borderRadius: theme.radii.md,
    overflow: 'hidden'
  },
  saveButtonInner: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonExpanded: {
    flex: 1
  },
  saveButtonDisabled: {
    opacity: 0.7
  },
  profileActionStack: {
    gap: 10
  },
  profilePrimaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  previewButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewButtonText: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800'
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  toolsButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  signOutButton: {
    alignSelf: 'center',
    paddingVertical: 4
  },
  signOutButtonText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 6, 12, 0.68)',
    justifyContent: 'flex-end',
    padding: 20
  },
  modalSheet: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#050910',
    shadowOpacity: 1,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 16
    },
    elevation: 6
  },
  modalSheetLabel: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 16
  },
  modalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalOptionCopy: {
    flex: 1,
    gap: 2
  },
  modalOptionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  modalOptionBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  emptyPostsCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radii.md,
    padding: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  emptyPostsTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  emptyPostsBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  authCard: {
    width: '100%',
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radii.md,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  authModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  authRoleRow: {
    flexDirection: 'row',
    gap: 10
  },
  authInput: {
    minHeight: 46,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  authSubmitButton: {
    width: '100%'
  },
  authSubmitButtonInner: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyStateFeedback: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center'
  }
});

