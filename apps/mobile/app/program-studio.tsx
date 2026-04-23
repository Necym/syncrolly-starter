import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type ProgramSummary } from '@syncrolly/core';
import { listPrograms } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InlineNotice, { type InlineNoticeTone } from '../components/InlineNotice';
import SkeletonBlock from '../components/SkeletonBlock';
import { getProgramFallbackGradient } from '../lib/programs';
import { getPreferredRole, useMobileSession } from '../lib/session';

type NoticeState = {
  tone: InlineNoticeTone;
  message: string;
};

const EDITORIAL_SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif'
});

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

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

export default function ProgramStudioListScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const role = getPreferredRole(user);

  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);

  const loadPrograms = useCallback(async () => {
    if (!supabase || !user || role !== 'creator') {
      setPrograms([]);
      setLoadingPrograms(false);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;

    setLoadingPrograms(true);

    try {
      const nextPrograms = await listPrograms(currentSupabase, currentUser.id, 'creator');
      setPrograms(nextPrograms);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setLoadingPrograms(false);
    }
  }, [role, supabase, user]);

  useFocusEffect(
    useCallback(() => {
      void loadPrograms();
    }, [loadPrograms])
  );

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program Studio</Text>
          <Text style={styles.centerBody}>Add your Supabase keys in `apps/mobile/.env` to create real programs.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingPrograms) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <ProgramStudioListLoadingState />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program Studio</Text>
          <Text style={styles.centerBody}>Sign in to create programs, lessons, and enrollments.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'creator') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program Studio</Text>
          <Text style={styles.centerBody}>This space is for creators. Students will see their programs inside Feed.</Text>
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
            colors={['#08101f', '#0b1326', '#111a2f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.backgroundBase}
          />
          <View style={styles.backgroundGlowTop} />
          <View style={styles.backgroundGlowBottom} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.editorialHero}>
            <Text style={styles.editorialEyebrow}>Program studio</Text>
            <Text style={styles.editorialTitle}>Choose a program to edit</Text>
            <Text style={styles.editorialBody}>
              Create a new program or open an existing one. Once you enter a program, that is where description, structure, and learners live.
            </Text>
          </View>

          {feedback ? <InlineNotice tone={feedback.tone} message={feedback.message} /> : null}

          <Pressable
            onPress={() => router.push('/program-studio-editor')}
            style={({ pressed }) => [styles.newProgramCard, pressed && styles.cardPressed]}
          >
            <View style={styles.newProgramCardIcon}>
              <Ionicons name="add" size={20} color={theme.colors.primaryStrong} />
            </View>
            <View style={styles.newProgramCardCopy}>
              <Text style={styles.newProgramCardTitle}>Create a new program</Text>
              <Text style={styles.newProgramCardBody}>Start from a blank draft, then add the description, lessons, and learners inside the editor.</Text>
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Programs</Text>
              <Text style={styles.sectionTitle}>Your programs</Text>
            </View>
          </View>

          {programs.length ? (
            <View style={styles.programList}>
              {programs.map((program) => (
                <StudioProgramCard
                  key={program.id}
                  program={program}
                  onPress={() =>
                    router.push({
                      pathname: '/program-studio-editor',
                      params: {
                        programId: program.id
                      }
                    })
                  }
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No programs yet</Text>
              <Text style={styles.emptyBody}>Create your first program to start building lessons and enrolling learners.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function StudioProgramCard({
  program,
  onPress
}: {
  program: ProgramSummary;
  onPress: () => void;
}) {
  const gradientColors = getProgramFallbackGradient(program.title);
  const eyebrow = program.subtitle?.trim() ? program.subtitle.trim().toUpperCase() : 'PROGRAM';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.programCard, pressed && styles.cardPressed]}>
      {program.thumbnailUrl ? (
        <Image source={{ uri: program.thumbnailUrl }} style={styles.programImage} />
      ) : (
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.programFallback}>
          <Text style={styles.programFallbackText}>{program.title}</Text>
        </LinearGradient>
      )}

      <View style={styles.programCopy}>
        <View style={styles.programMetaRow}>
          <Text style={styles.programEyebrow}>{eyebrow}</Text>
          <View style={styles.programMetaChip}>
            <Text style={styles.programMetaChipText}>{program.lessonCount} lessons</Text>
          </View>
        </View>

        <Text style={styles.programTitle}>{program.title}</Text>
        <Text style={styles.programBody} numberOfLines={3}>
          {truncateText(program.description || program.subtitle || 'No description yet.', 120)}
        </Text>

        <View style={styles.programDetailRow}>
          <Text style={styles.programDetailLabel}>Learners</Text>
          <Text style={styles.programDetailValue}>{program.enrolledCount}</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(program.progressPercent, 4)}%` }]} />
        </View>

        <View style={styles.programFooter}>
          <Text style={styles.programFooterText}>{program.nextLessonTitle ? `Next: ${program.nextLessonTitle}` : 'Open editor'}</Text>
          <Ionicons name="chevron-forward" size={16} color="#8b93a3" />
        </View>
      </View>
    </Pressable>
  );
}

function ProgramStudioListLoadingState() {
  return (
    <View style={styles.loadingShell}>
      <View style={styles.loadingHeaderBlock}>
        <SkeletonBlock width={42} height={42} radius={21} />
        <SkeletonBlock width={120} height={12} />
        <SkeletonBlock width="56%" height={40} radius={14} />
        <SkeletonBlock width="84%" height={16} />
      </View>

      <SkeletonBlock height={118} radius={24} />
      <SkeletonBlock height={320} radius={26} />
      <SkeletonBlock height={320} radius={26} />
    </View>
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
    backgroundColor: 'rgba(77, 142, 255, 0.16)'
  },
  backgroundGlowBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    bottom: 80,
    left: -110,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.16)'
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    gap: 18
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start'
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(19,27,46,0.98)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorialHero: {
    gap: 10,
    paddingTop: 2
  },
  editorialEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.05,
    textTransform: 'uppercase'
  },
  editorialTitle: {
    color: theme.colors.textPrimary,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  editorialBody: {
    maxWidth: 330,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24
  },
  newProgramCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.outlineSoft,
    backgroundColor: 'rgba(19,27,46,0.84)',
    padding: 18,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center'
  },
  newProgramCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  newProgramCardCopy: {
    flex: 1,
    gap: 4
  },
  newProgramCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700'
  },
  newProgramCardBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
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
  programList: {
    gap: 16
  },
  programCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(19,27,46,0.98)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    overflow: 'hidden',
    shadowColor: '#050910',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  cardPressed: {
    opacity: 0.95
  },
  programImage: {
    width: '100%',
    height: 168
  },
  programFallback: {
    width: '100%',
    height: 168,
    justifyContent: 'flex-end',
    padding: 18
  },
  programFallbackText: {
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  programCopy: {
    padding: 16,
    gap: 12
  },
  programMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  programEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    flex: 1
  },
  programMetaChip: {
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  programMetaChipText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700'
  },
  programTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  programBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  programDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  programDetailLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  programDetailValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  programFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  programFooterText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1
  },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 18,
    gap: 10
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  loadingShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 18
  },
  loadingHeaderBlock: {
    gap: 10
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

