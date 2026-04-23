import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type ProgramSummary } from '@syncrolly/core';
import { listPrograms } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InlineNotice, { type InlineNoticeTone } from '../../components/InlineNotice';
import SkeletonBlock from '../../components/SkeletonBlock';
import { buildProgramFeedUpdates, getProgramFallbackGradient } from '../../lib/programs';
import { getPreferredRole, useMobileSession } from '../../lib/session';

type FeedTab = 'home' | 'programs';
type NoticeState = {
  tone: InlineNoticeTone;
  message: string;
};

function GradientActionButton({
  children,
  contentStyle,
  onPress,
  style
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.gradientButtonShell, style]}>
      <LinearGradient
        colors={theme.gradients.brand}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.gradientButtonFill, contentStyle]}
      >
        {children}
      </LinearGradient>
    </Pressable>
  );
}

const EDITORIAL_SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif'
});

export default function FeedScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const role = getPreferredRole(user);
  const [activeTab, setActiveTab] = useState<FeedTab>('home');
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);

  const featuredProgram = programs[0] ?? null;
  const updates = useMemo(() => buildProgramFeedUpdates(programs, role), [programs, role]);
  const totalStudents = programs.reduce((sum, program) => sum + program.enrolledCount, 0);

  useEffect(() => {
    if (!supabase || !user) {
      setPrograms([]);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isActive = true;

    async function loadScreen() {
      setLoadingPrograms(true);

      try {
        const nextPrograms = await listPrograms(currentSupabase, currentUser.id, role);

        if (!isActive) {
          return;
        }

        setPrograms(nextPrograms);
        setFeedback(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setFeedback({
          tone: 'error',
          message: getErrorMessage(error)
        });
      } finally {
        if (isActive) {
          setLoadingPrograms(false);
        }
      }
    }

    void loadScreen();

    return () => {
      isActive = false;
    };
  }, [pathname, role, supabase, user?.id]);

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Feed</Text>
          <Text style={styles.centerBody}>Add your Supabase keys in `apps/mobile/.env` to load the real learning feed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingPrograms) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <FeedLoadingState />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Feed</Text>
          <Text style={styles.centerBody}>Sign in from Inbox to access programs and continue learning.</Text>
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
            colors={['#060e20', '#0b1326', '#131b2e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.backgroundBase}
          />
          <View style={styles.backgroundGlowTop} />
          <View style={styles.backgroundGlowBottom} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>{role === 'creator' ? 'Creator feed' : 'Learning feed'}</Text>
              <Text style={styles.headerTitle}>Feed</Text>
              <Text style={styles.headerBody}>
                {role === 'creator'
                  ? 'Create real programs, add lessons in order, and enroll students from your pipeline.'
                  : 'Home keeps the next step simple. Programs shows everything you have access to.'}
              </Text>
            </View>

            {role === 'creator' ? (
              <GradientActionButton contentStyle={styles.studioButtonInner} onPress={() => router.push('/program-studio')} style={styles.studioButton}>
                <Ionicons name="sparkles-outline" size={16} color="#ffffff" />
                <Text style={styles.studioButtonText}>Studio</Text>
              </GradientActionButton>
            ) : null}
          </View>

          <View style={styles.tabRow}>
            {(['home', 'programs'] as const).map((tab) => {
              const isActive = activeTab === tab;

              return (
                <Pressable key={tab} accessibilityRole="button" onPress={() => setActiveTab(tab)} style={styles.tabChip}>
                  {isActive ? (
                    <LinearGradient
                      colors={theme.gradients.brand}
                      end={{ x: 1, y: 1 }}
                      start={{ x: 0, y: 0 }}
                      style={styles.tabChipActiveFill}
                    >
                      <Text style={[styles.tabChipText, styles.tabChipTextActive]}>{tab === 'home' ? 'Home' : 'Programs'}</Text>
                    </LinearGradient>
                  ) : (
                    <Text style={styles.tabChipText}>{tab === 'home' ? 'Home' : 'Programs'}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {feedback ? <InlineNotice tone={feedback.tone} message={feedback.message} /> : null}

          {activeTab === 'home' ? (
            <>
              {role === 'supporter' && featuredProgram ? (
                <ContinueMomentumCard program={featuredProgram} onPress={() => openProgram(router, featuredProgram.id)} />
              ) : null}

              {featuredProgram ? (
                <Pressable onPress={() => openProgram(router, featuredProgram.id)}>
                  <ProgramHeroCard
                    program={featuredProgram}
                    role={role}
                    onPrimaryPress={() =>
                      role === 'creator' ? router.push('/program-studio') : openProgram(router, featuredProgram.id)
                    }
                  />
                </Pressable>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>{role === 'creator' ? 'No programs yet' : 'No program access yet'}</Text>
                  <Text style={styles.emptyBody}>
                    {role === 'creator'
                      ? 'Create your first program with title, subtitle, description, thumbnail, and ordered lessons.'
                      : 'Once a creator enrolls you in a program, it will appear here automatically.'}
                  </Text>
                  {role === 'creator' ? (
                    <GradientActionButton onPress={() => router.push('/program-studio')} style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Open studio</Text>
                    </GradientActionButton>
                  ) : null}
                </View>
              )}

              <View style={styles.metricsRow}>
                <MetricCard
                  value={`${programs.length}`}
                  label={role === 'creator' ? 'Programs managed' : 'Programs unlocked'}
                  tone="blue"
                />
                <MetricCard value={`${updates.length}`} label="Fresh updates" tone="rose" />
                <MetricCard
                  value={role === 'creator' ? `${totalStudents}` : `${featuredProgram?.progressPercent ?? 0}%`}
                  label={role === 'creator' ? 'Students enrolled' : 'Current progress'}
                  tone="green"
                />
              </View>

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>General Updates</Text>
                  <Text style={styles.sectionTitle}>Keep the feed human</Text>
                </View>
              </View>

              {updates.length ? (
                <View style={styles.updateList}>
                  {updates.map((update) => (
                    <View key={update.id} style={styles.updateCard}>
                      <View style={styles.updateTopRow}>
                        <Text style={styles.updateEyebrow}>{update.eyebrow}</Text>
                        <Text style={styles.updateTime}>{update.timeLabel}</Text>
                      </View>
                      <Text style={styles.updateTitle}>{update.title}</Text>
                      <Text style={styles.updateBody}>{update.body}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nothing new yet</Text>
                  <Text style={styles.emptyBody}>
                    {role === 'creator'
                      ? 'Program activity will show up here once you create content and start enrolling students.'
                      : 'Once you have an active program, the feed will surface what to do next.'}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {role === 'creator' ? (
                <>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>Programs</Text>
                      <Text style={styles.sectionTitle}>What you manage</Text>
                    </View>

                    <GradientActionButton contentStyle={styles.inlineStudioButtonInner} onPress={() => router.push('/program-studio')} style={styles.inlineStudioButton}>
                      <Text style={styles.inlineStudioButtonText}>Studio</Text>
                    </GradientActionButton>
                  </View>

                  {programs.length ? (
                    <View style={styles.programList}>
                      {programs.map((program) => (
                        <ProgramCard key={program.id} program={program} role={role} onPress={() => openProgram(router, program.id)} />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>No programs created</Text>
                      <Text style={styles.emptyBody}>
                        Build your first program in Studio, then add lessons and enroll students.
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.programsHero}>
                    <Text style={styles.programsHeroTitle}>My Programs</Text>
                    <Text style={styles.programsHeroBody}>
                      Continue your journey. Your curated curriculum awaits your return.
                    </Text>
                  </View>

                  {programs.length ? (
                    <View style={styles.learnerProgramList}>
                      {programs.map((program) => (
                        <LearnerProgramCard key={program.id} program={program} onPress={() => openProgram(router, program.id)} />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>No programs available</Text>
                      <Text style={styles.emptyBody}>Programs will appear here once a creator enrolls you.</Text>
                    </View>
                  )}

                  <Pressable style={styles.discoveryCard} onPress={() => setActiveTab('home')}>
                    <View style={styles.discoveryGlow} />
                    <Text style={styles.discoveryTitle}>Broaden Your Expertise</Text>
                    <Text style={styles.discoveryBody}>
                      Explore more lessons, fresh formats, and future program drops from creators you follow.
                    </Text>
                    <LinearGradient colors={theme.gradients.brand} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.discoveryButton}>
                      <Text style={styles.discoveryButtonText}>Browse Library</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function openProgram(router: ReturnType<typeof useRouter>, programId: string) {
  router.push({
    pathname: '/program/[programId]',
    params: {
      programId
    }
  });
}

function ProgramHeroCard({
  program,
  role,
  onPrimaryPress
}: {
  program: ProgramSummary;
  role: 'creator' | 'supporter';
  onPrimaryPress: () => void;
}) {
  const gradientColors = getProgramFallbackGradient(program.id);

  return (
    <View style={styles.heroWrapper}>
      {program.thumbnailUrl ? (
        <View style={styles.heroMediaFrame}>
          <Image source={{ uri: program.thumbnailUrl }} style={styles.heroMediaImage} />
          <View style={styles.heroMediaOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>{role === 'creator' ? 'Program Studio' : 'Continue learning'}</Text>
            <Text style={styles.heroTitle}>{program.title}</Text>
            <Text style={styles.heroBody}>
              {role === 'creator'
                ? `Next up: ${program.nextLessonTitle ?? 'Add your first lesson'}`
                : `${program.completedLessons} of ${program.lessonCount} complete. Next: ${program.nextLessonTitle ?? 'Start lesson 1'}`}
            </Text>
          <View style={styles.heroActionRow}>
              <GradientActionButton onPress={onPrimaryPress} style={styles.heroActionButton}>
                <Text style={styles.heroActionButtonText}>{role === 'creator' ? 'Open studio' : 'Continue'}</Text>
              </GradientActionButton>
          </View>
          </View>
        </View>
      ) : (
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>
              {role === 'creator' ? `${program.enrolledCount} enrolled` : `${program.progressPercent}% complete`}
            </Text>
          </View>
          <Text style={styles.heroEyebrow}>{role === 'creator' ? 'Program Studio' : 'Continue learning'}</Text>
          <Text style={styles.heroTitle}>{program.title}</Text>
          <Text style={styles.heroBody}>
            {role === 'creator'
              ? 'Create, sequence, and ship bite-sized lessons without turning the app into a huge LMS.'
              : `Next up: ${program.nextLessonTitle ?? 'Start lesson 1'}`}
          </Text>
          <View style={styles.heroActionRow}>
            <GradientActionButton onPress={onPrimaryPress} style={styles.heroActionButton}>
              <Text style={styles.heroActionButtonText}>{role === 'creator' ? 'Open studio' : 'Continue'}</Text>
            </GradientActionButton>
          </View>
        </LinearGradient>
      )}
    </View>
  );
}

function ContinueMomentumCard({
  program,
  onPress
}: {
  program: ProgramSummary;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.continueCard, pressed && styles.programCardPressed]}>
      <View style={styles.continueCardCopy}>
        <Text style={styles.continueCardEyebrow}>Up Next</Text>
        <Text style={styles.continueCardTitle}>{program.nextLessonTitle ?? 'Return to lesson 1'}</Text>
        <Text style={styles.continueCardBody}>
          {program.progressPercent}% complete in {program.title}
        </Text>
      </View>

      <View style={styles.continueCardMeta}>
        <View style={styles.continueProgressMini}>
          <View style={[styles.continueProgressFillMini, { width: `${Math.max(program.progressPercent, 8)}%` }]} />
        </View>
        <Ionicons name="arrow-forward" size={18} color={theme.colors.primaryStrong} />
      </View>
    </Pressable>
  );
}

function ProgramCard({
  program,
  role,
  onPress
}: {
  program: ProgramSummary;
  role: 'creator' | 'supporter';
  onPress: () => void;
}) {
  const gradientColors = getProgramFallbackGradient(program.title);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.programCard, pressed && styles.programCardPressed]}>
      {program.thumbnailUrl ? (
        <Image source={{ uri: program.thumbnailUrl }} style={styles.programThumbImage} />
      ) : (
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.programThumbFallback}>
          <Text style={styles.programThumbFallbackText}>{program.title}</Text>
        </LinearGradient>
      )}

      <View style={styles.programCopy}>
        <View style={styles.programMetaRow}>
          <Text style={styles.programMetaText}>{program.lessonCount} lessons</Text>
          <Text style={styles.programMetaText}>{role === 'creator' ? `${program.enrolledCount} enrolled` : `${program.progressPercent}% complete`}</Text>
        </View>

        <Text style={styles.programTitle}>{program.title}</Text>
        {program.subtitle ? <Text style={styles.programSubtitle}>{program.subtitle}</Text> : null}
        <Text style={styles.programBody} numberOfLines={3}>
          {program.description || 'No description yet.'}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(program.progressPercent, 6)}%` }]} />
        </View>

        <View style={styles.programFooter}>
          <Text style={styles.programNextText}>
            {role === 'creator' ? `Next: ${program.nextLessonTitle ?? 'Add first lesson'}` : `Continue: ${program.nextLessonTitle ?? 'Start lesson 1'}`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#8b93a3" />
        </View>
      </View>
    </Pressable>
  );
}

function MetricCard({
  value,
  label,
  tone
}: {
  value: string;
  label: string;
  tone: 'blue' | 'rose' | 'green';
}) {
  const toneStyles = {
    blue: {
      backgroundColor: 'rgba(77, 142, 255, 0.14)',
      valueColor: theme.colors.primaryStrong
    },
    rose: {
      backgroundColor: 'rgba(87, 27, 193, 0.18)',
      valueColor: '#b794ff'
    },
    green: {
      backgroundColor: 'rgba(89, 213, 160, 0.16)',
      valueColor: theme.colors.success
    }
  } as const;

  return (
    <View style={[styles.metricCard, { backgroundColor: toneStyles[tone].backgroundColor, borderColor: 'rgba(255,255,255,0.08)' }]}>
      <Text style={[styles.metricValue, { color: toneStyles[tone].valueColor }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function LearnerProgramCard({
  program,
  onPress
}: {
  program: ProgramSummary;
  onPress: () => void;
}) {
  const gradientColors = getProgramFallbackGradient(program.title);
  const nextLessonNumber = Math.min(program.completedLessons + 1, Math.max(program.lessonCount, 1));
  const eyebrow = program.subtitle?.trim() ? program.subtitle.trim().toUpperCase() : 'PROGRAM';
  const actionLabel = program.progressPercent > 0 ? 'Resume Program' : 'Continue';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.learnerProgramCard, pressed && styles.programCardPressed]}>
      {program.thumbnailUrl ? (
        <Image source={{ uri: program.thumbnailUrl }} style={styles.learnerProgramImage} />
      ) : (
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.learnerProgramFallback}>
          <Text style={styles.learnerProgramFallbackText}>{program.title}</Text>
        </LinearGradient>
      )}

      <View style={styles.learnerProgramCopy}>
        <View style={styles.learnerProgramMetaRow}>
          <Text style={styles.learnerProgramEyebrow}>{eyebrow}</Text>
          <View style={styles.learnerProgramMetaChip}>
            <Text style={styles.learnerProgramMetaChipText}>
              Lesson {nextLessonNumber} of {Math.max(program.lessonCount, 1)}
            </Text>
          </View>
        </View>

        <Text style={styles.learnerProgramTitle}>{program.title}</Text>
        <Text style={styles.learnerProgramBody} numberOfLines={3}>
          {truncateText(program.description || program.subtitle || 'Continue through the next lesson in your program.', 120)}
        </Text>

        <View style={styles.learnerProgressWrap}>
          <View style={styles.learnerProgressLabelRow}>
            <Text style={styles.learnerProgressLabel}>Progress</Text>
            <Text style={styles.learnerProgressValue}>{program.progressPercent}% Complete</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(program.progressPercent, 4)}%` }]} />
          </View>
        </View>

        <LinearGradient
          colors={theme.gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.learnerProgramButton}
        >
          <Text style={styles.learnerProgramButtonText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color="#ffffff" />
        </LinearGradient>
      </View>
    </Pressable>
  );
}

function FeedLoadingState() {
  return (
    <View style={styles.loadingShell}>
      <View style={styles.loadingHeaderBlock}>
        <SkeletonBlock width={108} height={12} />
        <SkeletonBlock width="52%" height={34} radius={14} style={styles.loadingHeaderTitle} />
        <SkeletonBlock width="82%" height={16} />
      </View>

      <SkeletonBlock height={212} radius={30} />

      <View style={styles.loadingMetricRow}>
        <SkeletonBlock style={styles.loadingMetricCard} height={96} radius={26} />
        <SkeletonBlock style={styles.loadingMetricCard} height={96} radius={26} />
        <SkeletonBlock style={styles.loadingMetricCard} height={96} radius={26} />
      </View>

      <View style={styles.loadingList}>
        <SkeletonBlock height={118} radius={24} />
        <SkeletonBlock height={118} radius={24} />
        <SkeletonBlock height={118} radius={24} />
      </View>
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return 'Something went wrong. Please try again.';
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
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
  backgroundBase: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundGlowTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: 56,
    right: -92,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.10)'
  },
  backgroundGlowBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    bottom: 80,
    left: -110,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.10)'
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    gap: 18
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16
  },
  headerCopy: {
    flex: 1
  },
  headerEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  headerTitle: {
    marginTop: 6,
    color: theme.colors.textPrimary,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  headerBody: {
    marginTop: 8,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 320
  },
  programsHero: {
    gap: 8,
    paddingTop: 2,
    paddingBottom: 4
  },
  programsHeroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 33,
    lineHeight: 40,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  programsHeroBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 320
  },
  studioButton: {
    borderRadius: 999,
    overflow: 'hidden'
  },
  studioButtonInner: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  studioButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10
  },
  tabChip: {
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabChipActiveFill: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabChipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800'
  },
  tabChipTextActive: {
    color: '#ffffff'
  },
  loadingShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 18
  },
  loadingHeaderBlock: {
    gap: 10
  },
  loadingHeaderTitle: {
    marginTop: 2
  },
  loadingMetricRow: {
    flexDirection: 'row',
    gap: 12
  },
  loadingMetricCard: {
    flex: 1
  },
  loadingList: {
    gap: 14
  },
  continueCard: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#050910',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 12
    },
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  continueCardCopy: {
    flex: 1,
    gap: 4
  },
  continueCardEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: theme.colors.primaryStrong
  },
  continueCardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: theme.colors.textPrimary
  },
  continueCardBody: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary
  },
  continueCardMeta: {
    width: 92,
    alignItems: 'flex-end',
    gap: 10
  },
  continueProgressMini: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  continueProgressFillMini: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  heroWrapper: {
    borderRadius: 28,
    overflow: 'hidden'
  },
  heroMediaFrame: {
    minHeight: 260,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end'
  },
  heroMediaImage: {
    ...StyleSheet.absoluteFillObject
  },
  heroMediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 16, 28, 0.42)'
  },
  heroContent: {
    padding: 22,
    gap: 12
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    gap: 12
  },
  heroPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  heroPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  heroBody: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 310
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4
  },
  heroActionButton: {
    borderRadius: 14,
    overflow: 'hidden'
  },
  heroActionButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10
  },
  metricCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'space-between',
    borderWidth: 1
  },
  metricValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  metricLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12
  },
  sectionEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  sectionTitle: {
    marginTop: 4,
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  updateList: {
    gap: 12
  },
  updateCard: {
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    gap: 8,
    shadowColor: '#050910',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 12
    },
    elevation: 3
  },
  updateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  updateEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  updateTime: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  updateTitle: {
    color: theme.colors.textPrimary,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800'
  },
  updateBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  inlineStudioButton: {
    borderRadius: 999,
    overflow: 'hidden'
  },
  inlineStudioButtonInner: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  inlineStudioButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  programList: {
    gap: 16
  },
  learnerProgramList: {
    gap: 18
  },
  programCard: {
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  programCardPressed: {
    opacity: 0.94
  },
  learnerProgramCard: {
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  learnerProgramImage: {
    width: '100%',
    height: 168
  },
  learnerProgramFallback: {
    width: '100%',
    height: 168,
    justifyContent: 'flex-end',
    padding: 18
  },
  learnerProgramFallbackText: {
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  learnerProgramCopy: {
    padding: 16,
    gap: 12
  },
  learnerProgramMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  learnerProgramEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    flex: 1
  },
  learnerProgramMetaChip: {
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  learnerProgramMetaChipText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700'
  },
  learnerProgramTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  learnerProgramBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  learnerProgressWrap: {
    gap: 8
  },
  learnerProgressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  learnerProgressLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  learnerProgressValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  learnerProgramButton: {
    minHeight: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
    shadowColor: 'rgba(0,86,210,0.32)',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 5
  },
  learnerProgramButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  programThumbImage: {
    width: '100%',
    height: 168
  },
  programThumbFallback: {
    width: '100%',
    height: 168,
    justifyContent: 'flex-end',
    padding: 18
  },
  programThumbFallbackText: {
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  programCopy: {
    padding: 18,
    gap: 10
  },
  programMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  programMetaText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  programTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  programSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  programBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  programFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  programNextText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1
  },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    gap: 10
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    overflow: 'hidden'
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  discoveryCard: {
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 10,
    overflow: 'hidden',
    marginTop: 6
  },
  discoveryGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    right: -80,
    top: -90,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.12)'
  },
  discoveryTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF,
    maxWidth: 260
  },
  discoveryBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 280
  },
  discoveryButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#050910',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4
  },
  discoveryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  gradientButtonShell: {
    overflow: 'hidden'
  },
  gradientButtonFill: {
    width: '100%',
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10
  },
  centerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  centerBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center'
  }
});

