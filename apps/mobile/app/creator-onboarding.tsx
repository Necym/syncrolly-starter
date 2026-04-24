import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import {
  type CreatorProfileCtaActionType,
  type CreatorProfileOfferItem,
  type CreatorProfilePageBlock,
  type DmIntakePolicy,
  type ViewerProfile
} from '@syncrolly/core';
import { getViewerProfile, saveCreatorProfile } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createCtaBlock,
  createMediaPostsBlock,
  createOffersBlock,
  createVideoBlock
} from '../lib/profilePageBuilder';
import { getDefaultDisplayName, useMobileSession } from '../lib/session';

type IconName = ComponentProps<typeof Ionicons>['name'];
type CreatorKind = 'fitness_coach' | 'influencer' | 'consultant' | 'educator' | 'artist' | 'community';
type CreatorGoal = 'dms' | 'calls' | 'forms' | 'programs' | 'media' | 'external';
type ContactMode = 'direct_message' | 'form' | 'booking';

type KindTemplate = {
  title: string;
  shortLabel: string;
  description: string;
  icon: IconName;
  niche: string;
  headline: string;
  bio: string;
  defaultGoals: CreatorGoal[];
  includeVideo: boolean;
  includeOffers: boolean;
  includeMediaPosts: boolean;
  contactMode: ContactMode;
  offerTitle: string;
  offers: Array<Pick<CreatorProfileOfferItem, 'title' | 'description' | 'icon'>>;
  mediaDescription: string;
};

type GeneratedSetup = {
  niche: string;
  headline: string;
  bio: string;
  dmAccess: 'free' | 'subscriber_only' | 'paid_only';
  dmIntakePolicy: DmIntakePolicy;
  dmFeeUsd: number;
  pageBlocks: CreatorProfilePageBlock[];
  summary: string[];
};

const CREATOR_KINDS: Record<CreatorKind, KindTemplate> = {
  fitness_coach: {
    title: 'Fitness coach',
    shortLabel: 'Fitness',
    description: 'Coaching, accountability, programs, and client transformations.',
    icon: 'barbell-outline',
    niche: 'Fitness coach',
    headline: 'Build strength with a plan that fits your life.',
    bio: 'I help people train with structure, stay consistent, and turn effort into visible progress.',
    defaultGoals: ['forms', 'calls', 'programs', 'media'],
    includeVideo: true,
    includeOffers: true,
    includeMediaPosts: true,
    contactMode: 'form',
    offerTitle: 'Ways to train with me',
    offers: [
      {
        title: '1:1 coaching',
        description: 'Personalized programming, form feedback, and direct accountability.',
        icon: 'call-outline'
      },
      {
        title: 'Training programs',
        description: 'Structured lessons and workouts clients can follow from the app.',
        icon: 'school-outline'
      },
      {
        title: 'Progress check-ins',
        description: 'Regular reviews so clients know what to adjust next.',
        icon: 'trending-up-outline'
      }
    ],
    mediaDescription: 'Share training clips, client wins, quick tips, and recent moments from your work.'
  },
  influencer: {
    title: 'Creator or influencer',
    shortLabel: 'Influencer',
    description: 'Content-first profile with posts, audience access, and direct connection.',
    icon: 'sparkles-outline',
    niche: 'Digital creator',
    headline: 'A closer look at what I am building.',
    bio: 'I share ideas, visuals, and behind-the-scenes moments for people who want to follow the work more closely.',
    defaultGoals: ['dms', 'media', 'external'],
    includeVideo: false,
    includeOffers: false,
    includeMediaPosts: true,
    contactMode: 'direct_message',
    offerTitle: 'Ways to connect',
    offers: [
      {
        title: 'DM access',
        description: 'A direct way for followers, brands, and collaborators to reach you.',
        icon: 'chatbubble-ellipses-outline'
      },
      {
        title: 'Brand inquiries',
        description: 'A simple path for people to share collaboration context.',
        icon: 'rocket-outline'
      }
    ],
    mediaDescription: 'Share visuals, quick updates, launches, and moments your audience should see first.'
  },
  consultant: {
    title: 'Consultant',
    shortLabel: 'Consulting',
    description: 'Premium positioning, intake, offers, and booked calls.',
    icon: 'briefcase-outline',
    niche: 'Consultant',
    headline: 'Focused guidance for the next decision.',
    bio: 'I help clients clarify the problem, choose the right next move, and make progress without unnecessary complexity.',
    defaultGoals: ['forms', 'calls'],
    includeVideo: true,
    includeOffers: true,
    includeMediaPosts: false,
    contactMode: 'form',
    offerTitle: 'How I can help',
    offers: [
      {
        title: 'Strategy session',
        description: 'A focused call to diagnose the bottleneck and define the next step.',
        icon: 'call-outline'
      },
      {
        title: 'Implementation review',
        description: 'Detailed feedback on what to improve before you move forward.',
        icon: 'desktop-outline'
      },
      {
        title: 'Ongoing advisory',
        description: 'Regular guidance for decisions, execution, and accountability.',
        icon: 'trending-up-outline'
      }
    ],
    mediaDescription: 'Share client insights, frameworks, and useful notes from your work.'
  },
  educator: {
    title: 'Educator',
    shortLabel: 'Education',
    description: 'Lessons, programs, learning paths, and student progress.',
    icon: 'school-outline',
    niche: 'Educator',
    headline: 'Learn the skill with structure and support.',
    bio: 'I create clear lessons and practical guidance so students can learn faster and stay on track.',
    defaultGoals: ['programs', 'forms', 'dms'],
    includeVideo: true,
    includeOffers: true,
    includeMediaPosts: false,
    contactMode: 'form',
    offerTitle: 'Learning paths',
    offers: [
      {
        title: 'Guided program',
        description: 'A structured curriculum with lessons students can complete in order.',
        icon: 'school-outline'
      },
      {
        title: 'Student feedback',
        description: 'Support and review so learners know where to focus next.',
        icon: 'chatbubble-ellipses-outline'
      },
      {
        title: 'Live support',
        description: 'Calls or check-ins for students who need a more personal path.',
        icon: 'videocam-outline'
      }
    ],
    mediaDescription: 'Share study notes, examples, student wins, and lesson previews.'
  },
  artist: {
    title: 'Artist or maker',
    shortLabel: 'Artist',
    description: 'Portfolio-style profile with media, story, and inquiry path.',
    icon: 'color-palette-outline',
    niche: 'Artist',
    headline: 'Selected work, process, and new pieces.',
    bio: 'I share the work, the process behind it, and the best ways to follow or inquire about new projects.',
    defaultGoals: ['media', 'dms', 'external'],
    includeVideo: false,
    includeOffers: false,
    includeMediaPosts: true,
    contactMode: 'direct_message',
    offerTitle: 'Available work',
    offers: [
      {
        title: 'Commissions',
        description: 'Custom work for people who want something specific.',
        icon: 'sparkles-outline'
      },
      {
        title: 'Studio updates',
        description: 'Recent pieces, process notes, and availability.',
        icon: 'sparkles-outline'
      }
    ],
    mediaDescription: 'Share work-in-progress, finished pieces, process details, and studio updates.'
  },
  community: {
    title: 'Community builder',
    shortLabel: 'Community',
    description: 'Audience, access, group value, and clear next steps.',
    icon: 'people-outline',
    niche: 'Community builder',
    headline: 'Join the people building this with me.',
    bio: 'I bring people together around shared goals, useful conversations, and consistent progress.',
    defaultGoals: ['dms', 'forms', 'media'],
    includeVideo: true,
    includeOffers: true,
    includeMediaPosts: true,
    contactMode: 'form',
    offerTitle: 'What members get',
    offers: [
      {
        title: 'Community access',
        description: 'A shared space for questions, wins, and accountability.',
        icon: 'people-outline'
      },
      {
        title: 'Live sessions',
        description: 'Focused conversations, workshops, or office hours.',
        icon: 'videocam-outline'
      },
      {
        title: 'Momentum prompts',
        description: 'Regular nudges and ideas that keep members moving.',
        icon: 'rocket-outline'
      }
    ],
    mediaDescription: 'Share community moments, member wins, updates, and prompts.'
  }
};

const GOAL_OPTIONS: Array<{
  key: CreatorGoal;
  title: string;
  description: string;
  icon: IconName;
}> = [
  {
    key: 'dms',
    title: 'Receive DMs',
    description: 'Let people start a direct conversation.',
    icon: 'chatbubble-ellipses-outline'
  },
  {
    key: 'calls',
    title: 'Book calls',
    description: 'Use your profile to start scheduling.',
    icon: 'calendar-outline'
  },
  {
    key: 'forms',
    title: 'Qualify leads',
    description: 'Ask questions before you reply or enroll.',
    icon: 'document-text-outline'
  },
  {
    key: 'programs',
    title: 'Sell programs',
    description: 'Create lessons and track learner progress.',
    icon: 'school-outline'
  },
  {
    key: 'media',
    title: 'Post media',
    description: 'Share updates, pictures, and recent work.',
    icon: 'images-outline'
  },
  {
    key: 'external',
    title: 'Send to a link',
    description: 'Keep a path for websites, shops, or offers.',
    icon: 'link-outline'
  }
];

const CONTACT_OPTIONS: Array<{
  key: ContactMode;
  title: string;
  description: string;
  icon: IconName;
}> = [
  {
    key: 'direct_message',
    title: 'Open DM',
    description: 'Best for creators who want low-friction messages.',
    icon: 'chatbubble-outline'
  },
  {
    key: 'form',
    title: 'Form first',
    description: 'Best when you need context before replying.',
    icon: 'clipboard-outline'
  },
  {
    key: 'booking',
    title: 'Book a call',
    description: 'Best for consultations and high-touch services.',
    icon: 'calendar-outline'
  }
];

const STEPS = ['Identity', 'Goals', 'Blocks', 'Messaging', 'Review'] as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong while saving your setup.';
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function getContactAction(contactMode: ContactMode): CreatorProfileCtaActionType {
  if (contactMode === 'booking') {
    return 'booking';
  }

  if (contactMode === 'form') {
    return 'form';
  }

  return 'direct_message';
}

function getContactPolicy(contactMode: ContactMode): {
  dmAccess: GeneratedSetup['dmAccess'];
  dmIntakePolicy: DmIntakePolicy;
} {
  if (contactMode === 'form') {
    return {
      dmAccess: 'subscriber_only',
      dmIntakePolicy: 'form'
    };
  }

  return {
    dmAccess: 'free',
    dmIntakePolicy: 'direct_message'
  };
}

function buildGeneratedSetup(input: {
  creatorKind: CreatorKind;
  creatorDescription: string;
  goals: CreatorGoal[];
  includeVideo: boolean;
  includeOffers: boolean;
  includeMediaPosts: boolean;
  contactMode: ContactMode;
}): GeneratedSetup {
  const template = CREATOR_KINDS[input.creatorKind];
  const niche = input.creatorDescription.trim() || template.niche;
  const contactAction = getContactAction(input.contactMode);
  const contactPolicy = getContactPolicy(input.contactMode);
  const blocks: CreatorProfilePageBlock[] = [];
  const shouldPrioritizeMedia = input.creatorKind === 'influencer' || input.creatorKind === 'artist';

  if (input.includeVideo) {
    blocks.push({
      ...createVideoBlock(),
      title: 'Start here',
      description: `A short intro video can explain who you help, what you share, and why people should ${contactAction === 'form' ? 'apply' : contactAction === 'booking' ? 'book' : 'message you'}.`
    });
  }

  if (input.includeMediaPosts && shouldPrioritizeMedia) {
    blocks.push({
      ...createMediaPostsBlock(),
      title: 'Recent work',
      description: template.mediaDescription
    });
  }

  if (input.includeOffers) {
    const offerBlock = createOffersBlock();
    blocks.push({
      ...offerBlock,
      eyebrow: input.goals.includes('programs') ? 'What you can access' : "What's available",
      title: template.offerTitle,
      items: template.offers.map((offer, index) => ({
        id: `${offerBlock.id}-generated-${index + 1}`,
        title: offer.title,
        description: offer.description,
        icon: offer.icon
      }))
    });
  }

  if (input.includeMediaPosts && !shouldPrioritizeMedia) {
    blocks.push({
      ...createMediaPostsBlock(),
      title: 'Recent updates',
      description: template.mediaDescription
    });
  }

  const ctaBlock = createCtaBlock(contactAction);
  blocks.push({
    ...ctaBlock,
    title:
      contactAction === 'form'
        ? 'Tell me what you need'
        : contactAction === 'booking'
          ? 'Book a focused call'
          : 'Want to connect?',
    description:
      contactAction === 'form'
        ? 'Answer a few questions so I can understand where you are and what would help most.'
        : contactAction === 'booking'
          ? 'Pick a time and we will use the conversation to decide the best next step.'
          : 'Send a message and I will point you toward the right next step.',
    buttonLabel:
      contactAction === 'form'
        ? 'Apply now'
        : contactAction === 'booking'
          ? 'Book a call'
          : 'Message me',
    actionType: contactAction
  });

  return {
    niche,
    headline: template.headline,
    bio: template.bio,
    dmAccess: contactPolicy.dmAccess,
    dmIntakePolicy: contactPolicy.dmIntakePolicy,
    dmFeeUsd: 25,
    pageBlocks: blocks,
    summary: [
      `${template.shortLabel} profile`,
      `${blocks.length} page blocks`,
      contactAction === 'form'
        ? 'Form required before outreach'
        : contactAction === 'booking'
          ? 'Call booking CTA'
          : 'Direct DM CTA'
    ]
  };
}

function OptionCard({
  active,
  description,
  icon,
  onPress,
  title
}: {
  active: boolean;
  description: string;
  icon: IconName;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.optionCard, active && styles.optionCardActive]}>
      <View style={[styles.optionIcon, active && styles.optionIconActive]}>
        <Ionicons name={icon} size={18} color={active ? '#ffffff' : theme.colors.textSecondary} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={18}
        color={active ? theme.colors.primaryStrong : theme.colors.textMuted}
      />
    </Pressable>
  );
}

function ToggleRow({
  active,
  description,
  icon,
  onPress,
  title
}: {
  active: boolean;
  description: string;
  icon: IconName;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.toggleRow}>
      <View style={styles.toggleIconWrap}>
        <Ionicons name={icon} size={17} color={theme.colors.textPrimary} />
      </View>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <View style={[styles.toggleSwitch, active && styles.toggleSwitchActive]}>
        <View style={[styles.toggleKnob, active && styles.toggleKnobActive]} />
      </View>
    </Pressable>
  );
}

function BlockPreview({ block }: { block: CreatorProfilePageBlock }) {
  const icon: IconName =
    block.type === 'video'
      ? 'play-circle-outline'
      : block.type === 'offers'
        ? 'grid-outline'
        : block.type === 'media_posts'
          ? 'images-outline'
          : 'arrow-forward-circle-outline';
  const title =
    block.type === 'video'
      ? block.title
      : block.type === 'offers'
        ? block.title
        : block.type === 'media_posts'
          ? block.title
          : block.buttonLabel;
  const description =
    block.type === 'offers'
      ? `${block.items.length} offer${block.items.length === 1 ? '' : 's'}`
      : block.type === 'cta'
        ? block.description
        : block.description;

  return (
    <View style={styles.blockPreview}>
      <View style={styles.blockPreviewIcon}>
        <Ionicons name={icon} size={16} color={theme.colors.textPrimary} />
      </View>
      <View style={styles.blockPreviewCopy}>
        <Text style={styles.blockPreviewTitle}>{title || 'Untitled block'}</Text>
        <Text numberOfLines={2} style={styles.blockPreviewDescription}>{description || block.type}</Text>
      </View>
    </View>
  );
}

export default function CreatorOnboardingScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [creatorKind, setCreatorKind] = useState<CreatorKind>('fitness_coach');
  const [creatorDescription, setCreatorDescription] = useState(CREATOR_KINDS.fitness_coach.niche);
  const [goals, setGoals] = useState<CreatorGoal[]>(CREATOR_KINDS.fitness_coach.defaultGoals);
  const [includeVideo, setIncludeVideo] = useState(CREATOR_KINDS.fitness_coach.includeVideo);
  const [includeOffers, setIncludeOffers] = useState(CREATOR_KINDS.fitness_coach.includeOffers);
  const [includeMediaPosts, setIncludeMediaPosts] = useState(CREATOR_KINDS.fitness_coach.includeMediaPosts);
  const [contactMode, setContactMode] = useState<ContactMode>(CREATOR_KINDS.fitness_coach.contactMode);

  const generatedSetup = useMemo(
    () =>
      buildGeneratedSetup({
        creatorKind,
        creatorDescription,
        goals,
        includeVideo,
        includeOffers,
        includeMediaPosts,
        contactMode
      }),
    [contactMode, creatorDescription, creatorKind, goals, includeMediaPosts, includeOffers, includeVideo]
  );

  useEffect(() => {
    if (!supabase || !user) {
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isActive = true;

    async function loadProfile() {
      setLoadingProfile(true);
      setFeedback(null);

      try {
        const nextProfile = await getViewerProfile(currentSupabase, currentUser.id);

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);

        const savedNiche = nextProfile?.creatorProfile?.niche?.trim();
        if (savedNiche) {
          setCreatorDescription(savedNiche);
        }
      } catch (error) {
        if (isActive) {
          setFeedback(getErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [supabase, user?.id]);

  function applyTemplate(nextKind: CreatorKind) {
    const template = CREATOR_KINDS[nextKind];
    setCreatorKind(nextKind);
    setCreatorDescription(template.niche);
    setGoals(template.defaultGoals);
    setIncludeVideo(template.includeVideo);
    setIncludeOffers(template.includeOffers);
    setIncludeMediaPosts(template.includeMediaPosts);
    setContactMode(template.contactMode);
  }

  function goNext() {
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    if (stepIndex === 0) {
      router.back();
      return;
    }

    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function handleApplySetup() {
    if (!supabase || !user || saving) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const displayName = profile?.displayName || getDefaultDisplayName(user) || 'Syncrolly Creator';

      await saveCreatorProfile(supabase, {
        userId: user.id,
        displayName,
        bio: generatedSetup.bio,
        niche: generatedSetup.niche,
        headline: generatedSetup.headline,
        dmAccess: generatedSetup.dmAccess,
        dmIntakePolicy: generatedSetup.dmIntakePolicy,
        dmFeeUsd: generatedSetup.dmFeeUsd,
        pageBlocks: generatedSetup.pageBlocks
      });

      router.replace({
        pathname: '/(tabs)/settings',
        params: {
          setupApplied: String(Date.now())
        }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function renderStep() {
    if (stepIndex === 0) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepEyebrow}>Step 1</Text>
          <Text style={styles.stepTitle}>What kind of creator are you?</Text>
          <Text style={styles.stepBody}>This shapes the blocks, copy, and suggested messaging path we generate.</Text>

          <View style={styles.optionGrid}>
            {(Object.keys(CREATOR_KINDS) as CreatorKind[]).map((key) => {
              const item = CREATOR_KINDS[key];

              return (
                <OptionCard
                  key={key}
                  active={creatorKind === key}
                  description={item.description}
                  icon={item.icon}
                  onPress={() => applyTemplate(key)}
                  title={item.title}
                />
              );
            })}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>How should your profile describe you?</Text>
            <TextInput
              value={creatorDescription}
              onChangeText={setCreatorDescription}
              placeholder="Fitness coach, social media creator, creative consultant..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.textInput}
            />
          </View>
        </View>
      );
    }

    if (stepIndex === 1) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepEyebrow}>Step 2</Text>
          <Text style={styles.stepTitle}>What should the page help you do?</Text>
          <Text style={styles.stepBody}>Pick everything that matters. This does not lock you in.</Text>

          <View style={styles.optionGrid}>
            {GOAL_OPTIONS.map((goal) => (
              <OptionCard
                key={goal.key}
                active={goals.includes(goal.key)}
                description={goal.description}
                icon={goal.icon}
                onPress={() => setGoals((current) => toggleValue(current, goal.key))}
                title={goal.title}
              />
            ))}
          </View>
        </View>
      );
    }

    if (stepIndex === 2) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepEyebrow}>Step 3</Text>
          <Text style={styles.stepTitle}>Which blocks should we include?</Text>
          <Text style={styles.stepBody}>We only create the blocks that fit how you actually work.</Text>

          <View style={styles.toggleStack}>
            <ToggleRow
              active={includeVideo}
              description="Adds a video block with space for an intro video and thumbnail."
              icon="videocam-outline"
              onPress={() => setIncludeVideo((current) => !current)}
              title="Intro video"
            />
            <ToggleRow
              active={includeOffers}
              description="Adds service, coaching, access, or package rows."
              icon="grid-outline"
              onPress={() => setIncludeOffers((current) => !current)}
              title="Offerings"
            />
            <ToggleRow
              active={includeMediaPosts}
              description="Adds a media timeline for posts, images, and updates."
              icon="images-outline"
              onPress={() => setIncludeMediaPosts((current) => !current)}
              title="Media posts"
            />
          </View>
        </View>
      );
    }

    if (stepIndex === 3) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepEyebrow}>Step 4</Text>
          <Text style={styles.stepTitle}>How should people contact you?</Text>
          <Text style={styles.stepBody}>This sets the main CTA and the messaging path. Payments can come later without blocking this setup.</Text>

          <View style={styles.optionGrid}>
            {CONTACT_OPTIONS.map((option) => (
              <OptionCard
                key={option.key}
                active={contactMode === option.key}
                description={option.description}
                icon={option.icon}
                onPress={() => setContactMode(option.key)}
                title={option.title}
              />
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stepCard}>
        <Text style={styles.stepEyebrow}>Step 5</Text>
        <Text style={styles.stepTitle}>Review the generated setup</Text>
        <Text style={styles.stepBody}>This will update your creator profile, messaging settings, and page blocks.</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryNiche}>{generatedSetup.niche}</Text>
          <Text style={styles.summaryHeadline}>{generatedSetup.headline}</Text>
          <Text style={styles.summaryBio}>{generatedSetup.bio}</Text>

          <View style={styles.summaryPillRow}>
            {generatedSetup.summary.map((item) => (
              <View key={item} style={styles.summaryPill}>
                <Text style={styles.summaryPillText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.blockPreviewList}>
          {generatedSetup.pageBlocks.map((block) => (
            <BlockPreview key={block.id} block={block} />
          ))}
        </View>
      </View>
    );
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Creator setup</Text>
          <Text style={styles.centerBody}>Add your Supabase keys in `apps/mobile/.env` to save creator setup.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.centerBody}>Loading creator setup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Creator setup</Text>
          <Text style={styles.centerBody}>Sign in first, then come back to generate your creator profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={['#060e20', '#0b1326', '#161f36']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.backgroundGlowTop} />
          <View style={styles.backgroundGlowBottom} />
        </View>

        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.headerIconButton}>
            <Ionicons name={stepIndex === 0 ? 'close' : 'arrow-back'} size={20} color={theme.colors.textPrimary} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Creator Setup Studio</Text>
            <Text style={styles.headerTitle}>Generate your profile</Text>
          </View>
          <View style={styles.headerIconButton} />
        </View>

        <View style={styles.progressTrack}>
          {STEPS.map((step, index) => {
            const isActive = index <= stepIndex;

            return (
              <View key={step} style={styles.progressItem}>
                <View style={[styles.progressDot, isActive && styles.progressDotActive]} />
                <Text style={[styles.progressLabel, isActive && styles.progressLabelActive]}>{step}</Text>
              </View>
            );
          })}
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {renderStep()}
          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={goBack} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{stepIndex === 0 ? 'Cancel' : 'Back'}</Text>
          </Pressable>

          <Pressable
            disabled={saving}
            onPress={stepIndex === STEPS.length - 1 ? () => void handleApplySetup() : goNext}
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          >
            <LinearGradient
              colors={theme.gradients.brand}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.primaryButtonFill}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{stepIndex === STEPS.length - 1 ? 'Apply setup' : 'Continue'}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
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
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: 54,
    right: -96,
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.18)'
  },
  backgroundGlowBottom: {
    position: 'absolute',
    left: -120,
    bottom: 74,
    width: 270,
    height: 270,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.20)'
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10
  },
  centerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  centerBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center'
  },
  header: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineSoft
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 2
  },
  headerEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  progressTrack: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8
  },
  progressItem: {
    flex: 1,
    gap: 6
  },
  progressDot: {
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  progressDotActive: {
    backgroundColor: theme.colors.primaryStrong
  },
  progressLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center'
  },
  progressLabelActive: {
    color: theme.colors.textSecondary
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 116
  },
  stepCard: {
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 18,
    gap: 14,
    shadowColor: '#050910',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  stepEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase'
  },
  stepTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  stepBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  optionGrid: {
    gap: 10
  },
  optionCard: {
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  optionCardActive: {
    borderColor: 'rgba(77, 142, 255, 0.62)',
    backgroundColor: 'rgba(77, 142, 255, 0.12)'
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  optionIconActive: {
    backgroundColor: theme.colors.primaryStrong
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  optionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  optionDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  inputGroup: {
    gap: 8
  },
  inputLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9
  },
  textInput: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  toggleStack: {
    gap: 10
  },
  toggleRow: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  toggleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toggleCopy: {
    flex: 1,
    gap: 2
  },
  toggleTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  toggleDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  toggleSwitch: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    padding: 3,
    justifyContent: 'center'
  },
  toggleSwitchActive: {
    backgroundColor: theme.colors.primaryStrong
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: theme.colors.textMuted
  },
  toggleKnobActive: {
    marginLeft: 18,
    backgroundColor: '#ffffff'
  },
  summaryCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 16,
    gap: 9
  },
  summaryNiche: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase'
  },
  summaryHeadline: {
    color: theme.colors.textPrimary,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  summaryBio: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  summaryPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4
  },
  summaryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  summaryPillText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700'
  },
  blockPreviewList: {
    gap: 10
  },
  blockPreview: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  blockPreviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  blockPreviewCopy: {
    flex: 1,
    gap: 2
  },
  blockPreviewTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  blockPreviewDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },
  feedbackText: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineSoft,
    backgroundColor: 'rgba(11,19,38,0.94)',
    flexDirection: 'row',
    gap: 10
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '800'
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    overflow: 'hidden'
  },
  primaryButtonDisabled: {
    opacity: 0.72
  },
  primaryButtonFill: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900'
  }
});
