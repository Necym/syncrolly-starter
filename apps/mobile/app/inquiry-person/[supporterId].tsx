import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type CreatorSupporterOverview, type InquiryFormSubmission, type ProgramSummary } from '@syncrolly/core';
import {
  enrollStudentInProgram,
  getCreatorSupporterOverview,
  openInquirySubmissionConversation,
  updateInquirySubmissionStatus
} from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileSession } from '../../lib/session';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading this person.';
}

function getStatusLabel(status: InquiryFormSubmission['status']) {
  if (status === 'qualified') {
    return 'Qualified';
  }

  if (status === 'booked') {
    return 'Booked';
  }

  if (status === 'enrolled') {
    return 'Enrolled';
  }

  return status === 'pending' ? 'Pending' : 'Opened';
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatShortDate(value?: string) {
  if (!value) {
    return 'No activity yet';
  }

  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
}

export default function InquiryPersonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ supporterId?: string | string[] }>();
  const supporterId = Array.isArray(params.supporterId) ? params.supporterId[0] : params.supporterId;
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();

  const [overview, setOverview] = useState<CreatorSupporterOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<InquiryFormSubmission['status'] | null>(null);
  const [enrollmentPickerVisible, setEnrollmentPickerVisible] = useState(false);
  const [enrollingProgramId, setEnrollingProgramId] = useState<string | null>(null);

  const loadOverview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!supabase || !user || !supporterId) {
        setLoading(false);
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const nextOverview = await getCreatorSupporterOverview(supabase, user.id, supporterId);
        setOverview(nextOverview);
        setFeedback(null);
      } catch (error) {
        setFeedback(getErrorMessage(error));
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [supabase, supporterId, user]
  );

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview])
  );

  const latestSubmission = overview?.submissions[0] ?? null;
  const enrolledProgramIds = useMemo(
    () => new Set((overview?.enrolledPrograms ?? []).map((program) => program.programId)),
    [overview?.enrolledPrograms]
  );
  const enrollablePrograms = useMemo(
    () => (overview?.creatorPrograms ?? []).filter((program) => !enrolledProgramIds.has(program.id)),
    [enrolledProgramIds, overview?.creatorPrograms]
  );

  function patchLatestSubmission(updater: (submission: InquiryFormSubmission) => InquiryFormSubmission) {
    setOverview((current) => {
      if (!current || !current.submissions.length) {
        return current;
      }

      const nextSubmissions = current.submissions.map((submission, index) => (index === 0 ? updater(submission) : submission));

      return {
        ...current,
        latestStatus: nextSubmissions[0].status,
        conversationId: nextSubmissions[0].conversationId,
        submissions: nextSubmissions
      };
    });
  }

  async function ensureConversationId() {
    if (!supabase) {
      return null;
    }

    if (overview?.conversationId) {
      return overview.conversationId;
    }

    if (!latestSubmission) {
      return null;
    }

    const conversationId = await openInquirySubmissionConversation(supabase, {
      submissionId: latestSubmission.id
    });

    patchLatestSubmission((submission) => ({
      ...submission,
      conversationId,
      status: submission.status === 'pending' ? 'opened' : submission.status
    }));

    return conversationId;
  }

  async function handleOpenConversation() {
    if (!supabase || !overview) {
      return;
    }

    setOpeningConversation(true);
    setFeedback(null);

    try {
      const conversationId = await ensureConversationId();

      if (!conversationId) {
        throw new Error('No conversation could be opened for this person yet.');
      }

      router.push({
        pathname: '/thread/[threadId]',
        params: {
          threadId: conversationId
        }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setOpeningConversation(false);
    }
  }

  async function handleScheduleCall() {
    if (!overview) {
      return;
    }

    setFeedback(null);

    try {
      const conversationId = await ensureConversationId();

      router.push({
        pathname: '/(tabs)/clients',
        params: {
          openCreate: '1',
          submissionId: latestSubmission?.id,
          attendeeId: overview.supporterId,
          attendeeName: overview.supporterName,
          conversationId: conversationId ?? undefined,
          title: `${overview.supporterName.split(' ')[0] || 'Client'} intro call`
        }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  async function handleStatusChange(status: InquiryFormSubmission['status']) {
    if (!supabase || !latestSubmission) {
      return;
    }

    setStatusUpdating(status);
    setFeedback(null);

    try {
      await updateInquirySubmissionStatus(supabase, {
        submissionId: latestSubmission.id,
        status
      });

      patchLatestSubmission((submission) => ({
        ...submission,
        status
      }));
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setStatusUpdating(null);
    }
  }

  async function handleEnroll(program: ProgramSummary) {
    if (!supabase || !overview) {
      return;
    }

    setEnrollingProgramId(program.id);
    setFeedback(null);

    try {
      await enrollStudentInProgram(supabase, {
        programId: program.id,
        studentId: overview.supporterId
      });

      if (latestSubmission) {
        await updateInquirySubmissionStatus(supabase, {
          submissionId: latestSubmission.id,
          status: 'enrolled'
        });
      }

      setEnrollmentPickerVisible(false);
      await loadOverview({ silent: true });
      setFeedback(`${overview.supporterName} is now enrolled in ${program.title}.`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setEnrollingProgramId(null);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Person record</Text>
          <Text style={styles.emptyBody}>Add your Supabase keys in `apps/mobile/.env` to view supporter records.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.emptyBody}>Loading this person...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyBody}>Sign in to review submissions, calls, and enrolled programs.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!overview) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Person not found</Text>
          <Text style={styles.emptyBody}>This supporter does not have a linked inquiry submission yet.</Text>
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
          <View style={styles.backgroundGlowPrimary} />
          <View style={styles.backgroundGlowSecondary} />
        </View>

        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Pipeline</Text>
            <Text style={styles.headerTitle}>Person record</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIdentity}>
                {overview.supporterAvatarUrl ? (
                  <Image source={{ uri: overview.supporterAvatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{getInitials(overview.supporterName)}</Text>
                  </View>
                )}

                <View style={styles.heroCopy}>
                  <Text style={styles.heroName}>{overview.supporterName}</Text>
                  <Text style={styles.heroMeta}>
                    {overview.submissions.length} submission{overview.submissions.length === 1 ? '' : 's'} •{' '}
                    {overview.scheduledCalls.length} call{overview.scheduledCalls.length === 1 ? '' : 's'} •{' '}
                    {overview.enrolledPrograms.length} program{overview.enrolledPrograms.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>

              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{getStatusLabel(overview.latestStatus)}</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryActionButton} onPress={() => void handleOpenConversation()}>
                {openingConversation ? (
                  <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                ) : (
                  <Text style={styles.secondaryActionText}>
                    {overview.conversationId ? 'Open DM' : 'Reply in DM'}
                  </Text>
                )}
              </Pressable>

              <Pressable style={styles.secondaryActionButton} onPress={() => void handleScheduleCall()}>
                <Text style={styles.secondaryActionText}>Schedule call</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryActionButton, !enrollablePrograms.length && styles.actionButtonDisabled]}
                onPress={() => setEnrollmentPickerVisible(true)}
                disabled={!enrollablePrograms.length}
              >
                <Text style={styles.primaryActionText}>Enroll</Text>
              </Pressable>
            </View>

            <View style={styles.stageRow}>
              {(['qualified', 'booked', 'enrolled'] as InquiryFormSubmission['status'][]).map((status) => {
                const isActive = overview.latestStatus === status;

                return (
                  <Pressable
                    key={status}
                    style={[styles.stageChip, isActive && styles.stageChipActive, !latestSubmission && styles.actionButtonDisabled]}
                    onPress={() => void handleStatusChange(status)}
                    disabled={!latestSubmission || isActive || Boolean(statusUpdating)}
                  >
                    {statusUpdating === status ? (
                      <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                    ) : (
                      <Text style={[styles.stageChipText, isActive && styles.stageChipTextActive]}>
                        {getStatusLabel(status)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Latest inquiry</Text>
            <Text style={styles.sectionTitle}>Most recent submission</Text>
            {latestSubmission ? (
              <>
                <Text style={styles.sectionMeta}>Submitted {formatTimestamp(latestSubmission.createdAt)}</Text>

                <View style={styles.answerStack}>
                  {latestSubmission.answers.map((answer, index) => (
                    <View key={answer.id} style={styles.answerRow}>
                      <Text style={styles.answerLabel}>Question {index + 1}</Text>
                      <Text style={styles.answerPrompt}>{answer.questionPrompt}</Text>
                      <Text style={styles.answerValue}>{answer.answerText}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.emptySectionText}>
                No form submission is linked yet. You can still schedule calls and manage program access from here.
              </Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Calls</Text>
            <Text style={styles.sectionTitle}>Scheduled conversations</Text>

            {overview.scheduledCalls.length ? (
              <View style={styles.callStack}>
                {overview.scheduledCalls.map((call) => (
                  <View key={call.id} style={styles.callRow}>
                    <View style={styles.callCopy}>
                      <Text style={styles.callTitle}>{call.title}</Text>
                      <Text style={styles.callMeta}>{formatTimestamp(call.startsAt)}</Text>
                    </View>

                    <View style={styles.callStatusBadge}>
                      <Text style={styles.callStatusText}>{call.status === 'accepted' ? 'Accepted' : 'Pending'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptySectionText}>No calls scheduled yet. Use the booking action above to set one up.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Programs</Text>
            <Text style={styles.sectionTitle}>Enrollment and progress</Text>

            {overview.enrolledPrograms.length ? (
              <View style={styles.programStack}>
                {overview.enrolledPrograms.map((program) => (
                  <Pressable
                    key={program.enrollmentId}
                    style={styles.programRow}
                    onPress={() =>
                      router.push({
                        pathname: '/program-studio-editor',
                        params: {
                          programId: program.programId
                        }
                      })
                    }
                  >
                    {program.thumbnailUrl ? (
                      <Image source={{ uri: program.thumbnailUrl }} style={styles.programThumbnail} />
                    ) : (
                      <LinearGradient
                        colors={['#b7c8f8', '#8eb2ff']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.programThumbnailFallback}
                      >
                        <Ionicons name="play-circle" size={16} color="#ffffff" />
                      </LinearGradient>
                    )}

                    <View style={styles.programCopy}>
                      <View style={styles.programTopRow}>
                        <Text style={styles.programTitle}>{program.title}</Text>
                        <Text style={styles.programPercent}>{program.progressPercent}%</Text>
                      </View>
                      <Text style={styles.programMeta}>
                        {program.completedLessons} of {Math.max(program.lessonCount, 1)} lessons complete • Last active {formatShortDate(program.lastActivityAt)}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.max(program.progressPercent, 4)}%` }]} />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.emptySectionText}>Not enrolled in any programs yet.</Text>
            )}
          </View>
        </ScrollView>

        <Modal
          visible={enrollmentPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!enrollingProgramId) {
              setEnrollmentPickerVisible(false);
            }
          }}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (!enrollingProgramId) {
                  setEnrollmentPickerVisible(false);
                }
              }}
            />

            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.sectionEyebrow}>Enroll</Text>
                  <Text style={styles.sectionTitle}>Add to a program</Text>
                  <Text style={styles.sectionMeta}>Choose where {overview.supporterName} should start next.</Text>
                </View>

                <Pressable
                  style={styles.modalCloseButton}
                  onPress={() => {
                    if (!enrollingProgramId) {
                      setEnrollmentPickerVisible(false);
                    }
                  }}
                  disabled={Boolean(enrollingProgramId)}
                >
                  <Ionicons name="close" size={18} color="#6b7280" />
                </Pressable>
              </View>

              {enrollablePrograms.length ? (
                <ScrollView style={styles.modalProgramList} showsVerticalScrollIndicator={false}>
                  {enrollablePrograms.map((program) => (
                    <Pressable
                      key={program.id}
                      style={[styles.modalProgramCard, enrollingProgramId === program.id && styles.actionButtonDisabled]}
                      onPress={() => void handleEnroll(program)}
                      disabled={Boolean(enrollingProgramId)}
                    >
                      <View style={styles.modalProgramCopy}>
                        <Text style={styles.modalProgramTitle}>{program.title}</Text>
                        <Text style={styles.modalProgramMeta}>
                          {program.lessonCount} lessons • {program.enrolledCount} learners
                        </Text>
                      </View>

                      {enrollingProgramId === program.id ? (
                        <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                      ) : (
                        <Ionicons name="arrow-forward" size={16} color={theme.colors.primaryStrong} />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.emptySectionText}>They already have access to every available program.</Text>
              )}
            </View>
          </View>
        </Modal>
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
  backgroundBase: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundGlowPrimary: {
    position: 'absolute',
    width: 280,
    height: 280,
    top: 94,
    right: -88,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.12)'
  },
  backgroundGlowSecondary: {
    position: 'absolute',
    width: 220,
    height: 220,
    bottom: 120,
    left: -68,
    borderRadius: 999,
    backgroundColor: 'rgba(120, 93, 255, 0.12)'
  },
  header: {
    minHeight: 68,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCopy: {
    flex: 1,
    gap: 2
  },
  headerEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.85,
    textTransform: 'uppercase'
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 132,
    gap: 16
  },
  heroCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 16,
    shadowColor: '#050910',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  heroIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 16
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#0f1625',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  heroCopy: {
    flex: 1,
    gap: 4
  },
  heroName: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  heroMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  statusBadge: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  secondaryActionText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  primaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  actionButtonDisabled: {
    opacity: 0.56
  },
  stageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  stageChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stageChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: 'rgba(77, 142, 255, 0.34)'
  },
  stageChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  stageChipTextActive: {
    color: theme.colors.textPrimary
  },
  feedbackText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  sectionCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 8,
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  sectionEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.85,
    textTransform: 'uppercase'
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  sectionMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  answerStack: {
    gap: 12,
    marginTop: 8
  },
  answerRow: {
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(114, 119, 132, 0.12)'
  },
  answerLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  answerPrompt: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700'
  },
  answerValue: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  callStack: {
    gap: 10,
    marginTop: 8
  },
  callRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  callCopy: {
    flex: 1,
    gap: 3
  },
  callTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  callMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12
  },
  callStatusBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  callStatusText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  programStack: {
    gap: 10,
    marginTop: 8
  },
  programRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  programThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 16
  },
  programThumbnailFallback: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  programCopy: {
    flex: 1,
    gap: 4
  },
  programTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  programTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  programPercent: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800'
  },
  programMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  emptySectionText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  modalCard: {
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    maxHeight: '76%'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 2
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalProgramList: {
    flexGrow: 0
  },
  modalProgramCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10
  },
  modalProgramCopy: {
    flex: 1,
    gap: 3
  },
  modalProgramTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  modalProgramMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
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
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center'
  }
});
