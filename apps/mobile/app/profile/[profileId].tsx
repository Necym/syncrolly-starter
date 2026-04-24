import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import {
  type CreatorProfileCtaBlock,
  type CreatorProfileMediaPostsBlock,
  type CreatorProfileOffersBlock,
  type CreatorProfilePageBlock,
  type CreatorProfileVideoBlock,
  type DmIntakePolicy,
  type ProfilePost,
  type ViewerProfile
} from '@syncrolly/core';
import {
  createDirectConversation,
  deleteProfilePost,
  getPublicProfile,
  getViewerProfile,
  listProfilePosts,
  toggleProfilePostLike
} from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getEffectiveCreatorPageBlocks } from '../../lib/profilePageBuilder';
import { useMobileSession } from '../../lib/session';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong while loading this profile.';
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

function getCreatorPrimaryAction(dmIntakePolicy: DmIntakePolicy, dmFeeUsd?: number) {
  if (dmIntakePolicy === 'direct_message') {
    return 'Message me';
  }

  if (dmIntakePolicy === 'form') {
    return 'Fill form';
  }

  if (dmIntakePolicy === 'paid_fee') {
    return `Pay $${dmFeeUsd ?? 25}`;
  }

  return 'Book a call';
}

function CoverFallback() {
  return (
    <LinearGradient
      colors={['#11182a', '#0b1326', '#060e20']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

function splitEditorialHeadline(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return {
      leading: 'Curating the',
      trailing: 'Digital Aesthetic.'
    };
  }

  const words = normalized.split(/\s+/);

  if (words.length <= 2) {
    return {
      leading: normalized,
      trailing: ''
    };
  }

  const splitIndex = Math.min(2, Math.max(1, Math.ceil(words.length / 2) - 1));

  return {
    leading: words.slice(0, splitIndex).join(' '),
    trailing: words.slice(splitIndex).join(' ')
  };
}

function shouldShowEditorialHeadline(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return true;
  }

  const compact = normalized.toLowerCase().replace(/[.!?,]/g, '');
  const greetingSet = new Set(['hi', 'hello', 'hey', 'yo', 'sup']);

  if (greetingSet.has(compact)) {
    return false;
  }

  return normalized.split(/\s+/).length > 1 || normalized.length > 6;
}

function CreatorHero({
  profile
}: {
  profile: ViewerProfile;
}) {
  const showAvatar = Boolean(profile.avatarUrl);
  const niche = profile.creatorProfile?.niche?.trim() || 'Creative direction';
  const headline = profile.creatorProfile?.headline?.trim() || 'Curating the Digital Aesthetic.';
  const bio = profile.bio.trim() || 'A curated creator page built to introduce your work with clarity and taste.';
  const editorialHeadline = splitEditorialHeadline(headline);
  const showEditorialHeadline = shouldShowEditorialHeadline(headline);

  return (
    <View style={[styles.heroShell, !showEditorialHeadline && styles.heroShellCompact]}>
      <View style={styles.heroMediaFrame}>
        {profile.coverImageUrl ? <Image source={{ uri: profile.coverImageUrl }} style={styles.heroCoverImage} /> : <CoverFallback />}
        <LinearGradient
          colors={['rgba(6,14,32,0.04)', 'rgba(11,19,38,0.72)', '#0b1326']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroFade, !showEditorialHeadline && styles.heroFadeCompact]}
        />
        <View style={styles.heroSoftVeil} />
      </View>

      <View style={[styles.heroBody, !showEditorialHeadline && styles.heroBodyCompact]}>
        <View style={[styles.heroIdentityRow, !showEditorialHeadline && styles.heroIdentityRowCompact]}>
          <View style={styles.heroIdentityCopy}>
            <Text style={styles.heroName}>{profile.displayName}</Text>
            <Text style={styles.heroEyebrow}>{niche}</Text>
          </View>

          <View style={styles.heroPortraitCard}>
            {showAvatar ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.heroPortraitImage} />
            ) : (
              <View style={[styles.heroPortraitImage, { backgroundColor: `${profile.accentColor}18` }]}>
                <Text style={[styles.heroAvatarFallback, { color: profile.accentColor }]}>{getInitials(profile.displayName)}</Text>
              </View>
            )}
          </View>
        </View>

        {showEditorialHeadline ? <Text style={styles.heroEditorialLine}>{editorialHeadline.leading}</Text> : null}
        {showEditorialHeadline && editorialHeadline.trailing ? (
          <Text style={styles.heroEditorialAccent}>{editorialHeadline.trailing}</Text>
        ) : null}
        <Text style={styles.heroBio}>{bio}</Text>
      </View>
    </View>
  );
}

function VideoBlockCard({
  block,
  onPress
}: {
  block: CreatorProfileVideoBlock;
  onPress: () => void;
}) {
  return (
    <View style={styles.videoSectionCard}>
      <Text style={styles.videoQuoteMark}>”</Text>
      <Text style={styles.videoSectionTitle}>{block.title || 'The Atelier Philosophy'}</Text>
      {block.description ? <Text style={styles.videoSectionBody}>{block.description}</Text> : null}

      <Pressable style={styles.videoPreviewCard} onPress={onPress}>
        {block.thumbnailUrl ? (
          <Image source={{ uri: block.thumbnailUrl }} style={styles.videoPreviewImage} />
        ) : (
          <LinearGradient
            colors={['#3e3128', '#8f6a4d', '#4b4038']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.videoPreviewFallback}
          />
        )}

        <LinearGradient colors={theme.gradients.brand} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.videoPlayButton}>
          <Ionicons name="play" size={20} color={theme.colors.onPrimary} />
        </LinearGradient>

        <View style={styles.videoLabelPill}>
          <Text style={styles.videoLabelPillText}>Watch introduction</Text>
        </View>
      </Pressable>
    </View>
  );
}

function OffersBlockCard({
  block
}: {
  block: CreatorProfileOffersBlock;
}) {
  return (
    <View style={styles.offersPanel}>
      <Text style={styles.offersEyebrow}>{block.eyebrow || 'Curation services'}</Text>
      <Text style={styles.offersTitle}>{block.title || 'Offerings'}</Text>

      <View style={styles.offerList}>
        {block.items.map((item) => (
          <View key={item.id} style={styles.offerRow}>
            <View style={styles.offerIconWrap}>
              <Ionicons name={item.icon} size={14} color={theme.colors.textPrimary} />
            </View>

            <View style={styles.offerCopy}>
              <Text style={styles.offerTitle}>{item.title || 'Offer title'}</Text>
              <Text style={styles.offerDescription}>{item.description || 'Describe what is included.'}</Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </View>
        ))}
      </View>
    </View>
  );
}

function MediaPostsBlockCard({
  block,
  posts,
  canManagePosts,
  deletingPostId,
  onDeletePost,
  onToggleLike
}: {
  block: CreatorProfileMediaPostsBlock;
  posts: ProfilePost[];
  canManagePosts?: boolean;
  deletingPostId?: string | null;
  onDeletePost?: (postId: string) => void;
  onToggleLike: (postId: string) => void;
}) {
  return (
    <View style={styles.mediaPostsPanel}>
      <Text style={styles.mediaPostsEyebrow}>{block.eyebrow || 'Recent media'}</Text>
      <Text style={styles.mediaPostsTitle}>{block.title || 'Media Posts'}</Text>
      {block.description ? <Text style={styles.mediaPostsBody}>{block.description}</Text> : null}

      <View style={styles.mediaPostsList}>
        {posts.length ? (
          posts.map((post) => (
            <View key={post.id} style={styles.mediaPostCard}>
              {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={styles.mediaPostImage} /> : null}

              <View style={styles.mediaPostContent}>
                {post.body ? <Text style={styles.mediaPostCaption}>{post.body}</Text> : null}

                <View style={styles.mediaPostFooter}>
                  <View style={styles.mediaPostFooterActions}>
                    <Pressable style={styles.mediaPostLikeButton} onPress={() => onToggleLike(post.id)}>
                      <Ionicons
                        name={post.likedByViewer ? 'heart' : 'heart-outline'}
                        size={15}
                        color={post.likedByViewer ? '#e2547b' : theme.colors.textMuted}
                      />
                      <Text style={styles.mediaPostLikeCount}>{post.likeCount}</Text>
                    </Pressable>

                    {canManagePosts ? (
                      <Pressable
                        disabled={deletingPostId === post.id}
                        hitSlop={8}
                        onPress={() => onDeletePost?.(post.id)}
                        style={styles.mediaPostDeleteButton}
                      >
                        {deletingPostId === post.id ? (
                          <ActivityIndicator size="small" color="#f87171" />
                        ) : (
                          <Ionicons name="trash-outline" size={14} color="#f87171" />
                        )}
                      </Pressable>
                    ) : null}
                  </View>

                  <Text style={styles.mediaPostTimestamp}>{post.relativeTime}</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.mediaPostEmptyState}>
            <Text style={styles.mediaPostEmptyTitle}>No posts yet</Text>
            <Text style={styles.mediaPostEmptyBody}>This timeline will fill in as new media posts are published.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CtaBlockCard({
  block,
  onPress
}: {
  block: CreatorProfileCtaBlock;
  onPress: () => void;
}) {
  return (
    <View style={styles.ctaPanel}>
      {block.title ? <Text style={styles.ctaPanelTitle}>{block.title}</Text> : null}
      {block.description ? <Text style={styles.ctaPanelBody}>{block.description}</Text> : null}

      <Pressable style={styles.ctaButton} onPress={onPress}>
        <LinearGradient
          colors={theme.gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaButtonInner}
        >
          <Text style={styles.ctaButtonText}>{block.buttonLabel || 'Apply now'}</Text>
        </LinearGradient>
      </Pressable>

      <Text style={styles.ctaFootnote}>Limited availability</Text>
    </View>
  );
}

function SocialProofCard({
  profile
}: {
  profile: ViewerProfile;
}) {
  const initials = getInitials(profile.displayName);

  return (
    <View style={styles.socialProofCard}>
      <View style={styles.socialProofAvatars}>
        <View style={[styles.socialProofAvatar, { backgroundColor: 'rgba(77, 142, 255, 0.28)' }]}>
          <Text style={[styles.socialProofAvatarText, { color: theme.colors.primaryStrong }]}>{initials}</Text>
        </View>
        <View style={[styles.socialProofAvatar, styles.socialProofAvatarOffset, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
          <Text style={[styles.socialProofAvatarText, { color: '#ffffff' }]}>S</Text>
        </View>
        <View style={[styles.socialProofAvatar, styles.socialProofAvatarOffsetLarge, { backgroundColor: 'rgba(87, 27, 193, 0.26)' }]}>
          <Text style={[styles.socialProofAvatarText, { color: theme.colors.textPrimary }]}>C</Text>
        </View>
      </View>

      <Text style={styles.socialProofText}>
        <Text style={styles.socialProofNumber}>120+</Text> creators already joined.
      </Text>
    </View>
  );
}

function SupporterProfileCard({
  profile,
  onPressMessage
}: {
  profile: ViewerProfile;
  onPressMessage: () => void;
}) {
  return (
    <View style={styles.supporterCard}>
      <View style={styles.supporterAvatarWrap}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.supporterAvatarImage} />
        ) : (
          <View style={[styles.supporterAvatarImage, { backgroundColor: `${profile.accentColor}1f` }]}>
            <Text style={[styles.supporterAvatarFallback, { color: profile.accentColor }]}>{getInitials(profile.displayName)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.supporterTitle}>{profile.displayName}</Text>
      <Text style={styles.supporterBody}>{profile.bio.trim() || 'Supporter on Syncrolly.'}</Text>

      <Pressable style={styles.ctaButton} onPress={onPressMessage}>
        <LinearGradient
          colors={theme.gradients.brand}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.ctaButtonInner, styles.supporterMessageButton]}
        >
          <Text style={styles.ctaButtonText}>Message</Text>
          <Ionicons name="arrow-forward" size={16} color="#ffffff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function PublicProfileScreen() {
  const { profileId, preview } = useLocalSearchParams<{ profileId: string | string[]; preview?: string | string[] }>();
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const resolvedProfileId = Array.isArray(profileId) ? profileId[0] : profileId;
  const resolvedPreview = Array.isArray(preview) ? preview[0] : preview;
  const isPreviewMode = resolvedPreview === '1';
  const effectiveProfileId = isPreviewMode && user ? user.id : resolvedProfileId;
  const isOwnProfile = Boolean(user && effectiveProfileId && user.id === effectiveProfileId);
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([]);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [startingConversation, setStartingConversation] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !effectiveProfileId) {
      return;
    }

    const currentSupabase = supabase;
    let isActive = true;

    async function loadProfile() {
      setLoadingScreen(true);
      setFeedback(null);

      try {
        const nextProfile =
          isOwnProfile && user
            ? await getViewerProfile(currentSupabase, effectiveProfileId)
            : await getPublicProfile(currentSupabase, effectiveProfileId);

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);

        if (!nextProfile) {
          setProfilePosts([]);
          return;
        }

        try {
          const nextPosts = await listProfilePosts(currentSupabase, effectiveProfileId, {
            authorProfile: {
              id: nextProfile.id,
              displayName: nextProfile.displayName,
              avatarUrl: nextProfile.avatarUrl
            },
            viewerId: user?.id
          });

          if (!isActive) {
            return;
          }

          setProfilePosts(nextPosts);
        } catch (postError) {
          if (!isActive) {
            return;
          }

          setProfilePosts([]);
          console.warn('Profile posts could not be loaded', postError);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setFeedback(getErrorMessage(error));
      } finally {
        if (isActive) {
          setLoadingScreen(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [effectiveProfileId, isOwnProfile, supabase, user?.id]);

  async function handleTogglePostLike(postId: string) {
    if (!supabase || !user || !profile) {
      return;
    }

    const previousPosts = profilePosts;

    setProfilePosts((current) =>
      current.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        const nextLiked = !post.likedByViewer;

        return {
          ...post,
          likedByViewer: nextLiked,
          likeCount: Math.max(0, post.likeCount + (nextLiked ? 1 : -1))
        };
      })
    );

    try {
      await toggleProfilePostLike(supabase, {
        postId,
        userId: user.id
      });
    } catch (error) {
      setProfilePosts(previousPosts);
      setFeedback(getErrorMessage(error));
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
    if (!supabase || !user || !isOwnProfile) {
      return;
    }

    const previousPosts = profilePosts;

    setDeletingPostId(postId);
    setFeedback(null);
    setProfilePosts((current) => current.filter((post) => post.id !== postId));

    try {
      await deleteProfilePost(supabase, {
        postId,
        userId: user.id
      });
    } catch (error) {
      setProfilePosts(previousPosts);
      setFeedback(getErrorMessage(error));
    } finally {
      setDeletingPostId(null);
    }
  }

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

      router.push({
        pathname: '/thread/[threadId]',
        params: {
          threadId: conversation.id
        }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setStartingConversation(false);
    }
  }

  async function handleStartBooking() {
    if (!supabase || !user || !profile || profile.role !== 'creator') {
      setFeedback('Sign in to Syncrolly to book a call.');
      return;
    }

    setStartingConversation(true);
    setFeedback(null);

    try {
      const conversation = await createDirectConversation(supabase, {
        createdBy: user.id,
        counterpartUserId: profile.id,
        subject: 'Call booking'
      });

      router.push({
        pathname: '/(tabs)/clients',
        params: {
          openCreate: '1',
          attendeeId: profile.id,
          attendeeName: profile.displayName,
          conversationId: conversation.id,
          title: `${profile.displayName.split(' ')[0] || 'Creator'} intro call`
        }
      });
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

    router.push({
      pathname: '/inquiry-preview',
      params: {
        creatorId: profile.id
      }
    });
  }

  async function handleOpenExternalLink(target: string) {
    try {
      await Linking.openURL(target);
    } catch {
      setFeedback('That link could not be opened.');
    }
  }

  function handleVideoPress(block: CreatorProfileVideoBlock) {
    if (!block.videoUrl.trim()) {
      setFeedback('This video is not linked yet.');
      return;
    }

    void handleOpenExternalLink(block.videoUrl.trim());
  }

  function handleCreatorCtaPress(block: CreatorProfileCtaBlock) {
    if (!profile || profile.role !== 'creator') {
      return;
    }

    if (block.actionType === 'external_url') {
      if (!block.target.trim()) {
        setFeedback('This button does not have a link yet.');
        return;
      }

      void handleOpenExternalLink(block.target.trim());
      return;
    }

    if (block.actionType === 'booking') {
      void handleStartBooking();
      return;
    }

    if (block.actionType === 'direct_message') {
      if (profile.creatorProfile?.dmIntakePolicy === 'paid_fee') {
        setFeedback(
          `Messaging ${profile.displayName} requires a paid unlock of $${profile.creatorProfile.dmFeeUsd}. Checkout is the next flow to wire in.`
        );
        return;
      }

      void handleStartConversation();
      return;
    }

    handleOpenInquiryForm();
  }

  const creatorDmPolicy = profile?.creatorProfile?.dmIntakePolicy ?? 'direct_message';
  const creatorBlocks = useMemo(
    () =>
      profile?.role === 'creator'
        ? getEffectiveCreatorPageBlocks(profile.creatorProfile?.pageBlocks, creatorDmPolicy)
        : [],
    [creatorDmPolicy, profile]
  );

  const renderedCreatorBlocks = creatorBlocks.filter((block) => {
    if (block.type === 'video') {
      return Boolean(block.title.trim() || block.description.trim() || block.videoUrl.trim() || block.thumbnailUrl?.trim());
    }

    if (block.type === 'offers') {
      return Boolean(block.title.trim() || block.items.length);
    }

    if (block.type === 'media_posts') {
      return Boolean(block.title.trim() || block.description.trim() || profilePosts.length);
    }

    return Boolean(block.title.trim() || block.description.trim() || block.buttonLabel.trim());
  });

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Profile</Text>
          <Text style={styles.emptyBody}>Add your Supabase keys in `apps/mobile/.env` to load public profiles.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingScreen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.emptyBody}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!effectiveProfileId || !profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Profile not found</Text>
            <Text style={styles.emptyBody}>{feedback ?? 'This profile is not available right now.'}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {profile.role === 'creator' ? (
            <>
              <CreatorHero profile={profile} />

              {renderedCreatorBlocks.map((block) => {
                if (block.type === 'video') {
                  return <VideoBlockCard key={block.id} block={block} onPress={() => handleVideoPress(block)} />;
                }

                if (block.type === 'offers') {
                  return <OffersBlockCard key={block.id} block={block} />;
                }

                if (block.type === 'media_posts') {
                  return (
                    <MediaPostsBlockCard
                      key={block.id}
                      block={block}
                      posts={profilePosts}
                      canManagePosts={isOwnProfile}
                      deletingPostId={deletingPostId}
                      onDeletePost={handleConfirmDeletePost}
                      onToggleLike={(postId) => void handleTogglePostLike(postId)}
                    />
                  );
                }

                return <CtaBlockCard key={block.id} block={block} onPress={() => handleCreatorCtaPress(block)} />;
              })}

              {!renderedCreatorBlocks.some((block) => block.type === 'cta') ? (
                <CtaBlockCard
                  block={{
                    id: 'fallback-cta',
                    type: 'cta',
                    title: 'Take the next step',
                    description:
                      creatorDmPolicy === 'form'
                        ? 'Share where you are and I will review the best next move.'
                        : creatorDmPolicy === 'paid_fee'
                          ? 'Paid message unlock is planned, but checkout still needs to be wired in.'
                          : 'Send a direct message and I will point you toward the right next step.',
                    buttonLabel: getCreatorPrimaryAction(creatorDmPolicy, profile.creatorProfile?.dmFeeUsd),
                    actionType: creatorDmPolicy === 'form' ? 'form' : 'direct_message',
                    target: ''
                  }}
                  onPress={() => {
                    if (creatorDmPolicy === 'form') {
                      handleOpenInquiryForm();
                    } else if (creatorDmPolicy === 'paid_fee') {
                      setFeedback(
                        `Messaging ${profile.displayName} requires a paid unlock of $${profile.creatorProfile?.dmFeeUsd ?? 25}. Checkout is the next flow to wire in.`
                      );
                    } else {
                      void handleStartConversation();
                    }
                  }}
                />
              ) : null}

              <SocialProofCard profile={profile} />
            </>
          ) : (
            <SupporterProfileCard profile={profile} onPressMessage={() => void handleStartConversation()} />
          )}

          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
          {startingConversation ? <Text style={styles.feedbackText}>Opening conversation...</Text> : null}
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
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 6
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050910',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4
  },
  container: {
    flex: 1
  },
  content: {
    paddingBottom: 120,
    gap: 26
  },
  heroShell: {
    height: 462,
    position: 'relative',
    overflow: 'hidden'
  },
  heroShellCompact: {
    height: 176
  },
  heroMediaFrame: {
    height: '100%',
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceContainerLow
  },
  heroCoverImage: {
    width: '100%',
    height: '100%',
    opacity: 0.36
  },
  heroFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 200
  },
  heroFadeCompact: {
    height: 82
  },
  heroSoftVeil: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(6,14,32,0.16)'
  },
  heroIdentityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 4
  },
  heroIdentityRowCompact: {
    marginBottom: 2
  },
  heroIdentityCopy: {
    flex: 1,
    gap: 1,
    paddingBottom: 4
  },
  heroPortraitCard: {
    width: 84,
    height: 84,
    padding: 4,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#050910',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 5
  },
  heroPortraitImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroBody: {
    position: 'absolute',
    left: 20,
    right: 28,
    bottom: 28,
    gap: 6
  },
  heroBodyCompact: {
    top: 16,
    bottom: undefined,
    gap: 3
  },
  heroAvatarFallback: {
    fontSize: 24,
    fontWeight: '800'
  },
  heroEyebrow: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  heroName: {
    color: theme.colors.textPrimary,
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  heroEditorialLine: {
    color: theme.colors.textPrimary,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    fontFamily: 'Georgia'
  },
  heroEditorialAccent: {
    color: theme.colors.primaryStrong,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    fontFamily: 'Georgia',
    fontStyle: 'italic'
  },
  heroBio: {
    marginTop: 2,
    maxWidth: 280,
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21
  },
  videoSectionCard: {
    marginHorizontal: 18,
    marginTop: 2,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 10,
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  videoQuoteMark: {
    position: 'absolute',
    top: 14,
    right: 18,
    color: 'rgba(218,226,253,0.12)',
    fontSize: 76,
    fontWeight: '700',
    fontFamily: 'Georgia'
  },
  videoSectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    fontFamily: 'Georgia',
    maxWidth: 210
  },
  videoSectionBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  videoPreviewCard: {
    marginTop: 10,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerLow
  },
  videoPreviewImage: {
    ...StyleSheet.absoluteFillObject
  },
  videoPreviewFallback: {
    ...StyleSheet.absoluteFillObject
  },
  videoPlayButton: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050910',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 4
  },
  videoLabelPill: {
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
  videoLabelPillText: {
    color: theme.colors.textPrimary,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9
  },
  offersPanel: {
    marginHorizontal: 18,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 16
  },
  offersEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
    textTransform: 'uppercase'
  },
  offersTitle: {
    marginTop: -2,
    color: theme.colors.textPrimary,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    fontFamily: 'Georgia'
  },
  offerList: {
    gap: 12
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  offerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 4,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerCopy: {
    flex: 1,
    gap: 3
  },
  offerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  offerDescription: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16
  },
  mediaPostsPanel: {
    marginHorizontal: 18,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 14
  },
  mediaPostsEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
    textTransform: 'uppercase'
  },
  mediaPostsTitle: {
    marginTop: -2,
    color: theme.colors.textPrimary,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    fontFamily: 'Georgia'
  },
  mediaPostsBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  mediaPostsList: {
    gap: 12
  },
  mediaPostCard: {
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  mediaPostImage: {
    width: '100%',
    height: 212,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  mediaPostContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12
  },
  mediaPostCaption: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 22
  },
  mediaPostFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  mediaPostFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  mediaPostLikeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  mediaPostDeleteButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mediaPostLikeCount: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  mediaPostTimestamp: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600'
  },
  mediaPostEmptyState: {
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6
  },
  mediaPostEmptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  mediaPostEmptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  ctaPanel: {
    marginHorizontal: 18,
    marginTop: -10,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8
  },
  ctaPanelTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700'
  },
  ctaPanelBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  ctaButton: {
    minHeight: 48,
    borderRadius: 4,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    overflow: 'hidden'
  },
  ctaButtonInner: {
    minHeight: 48,
    borderRadius: 4,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050910',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 4
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  ctaFootnote: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  socialProofCard: {
    marginHorizontal: 18,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  socialProofAvatars: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  socialProofAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center'
  },
  socialProofAvatarOffset: {
    marginLeft: -8
  },
  socialProofAvatarOffsetLarge: {
    marginLeft: -8
  },
  socialProofAvatarText: {
    fontSize: 10,
    fontWeight: '800'
  },
  socialProofText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  socialProofNumber: {
    color: theme.colors.primaryStrong,
    fontWeight: '800'
  },
  supporterCard: {
    marginHorizontal: 18,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 22,
    gap: 12,
    alignItems: 'flex-start',
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  supporterAvatarWrap: {
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceContainerLow,
    padding: 4
  },
  supporterAvatarImage: {
    width: 82,
    height: 82,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  supporterAvatarFallback: {
    fontSize: 28,
    fontWeight: '800'
  },
  supporterTitle: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    fontFamily: 'Georgia'
  },
  supporterBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  supporterMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  feedbackText: {
    marginHorizontal: 18,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
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
    fontSize: 24,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center'
  }
});

