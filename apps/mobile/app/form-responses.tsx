import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type InquiryFormSubmission, type ProgramSummary } from '@syncrolly/core';
import {
  deleteInquirySubmission,
  enrollStudentInProgram,
  listCreatorInquiryFormSubmissions,
  listPrograms,
  openInquirySubmissionConversation,
  updateInquirySubmissionStatus
} from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileSession } from '../lib/session';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading form responses.';
}

function isDuplicateEnrollmentError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('program_enrollments_program_student_key') || message.includes('duplicate key');
}

function getSubmissionStatusLabel(status: InquiryFormSubmission['status']) {
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

function formatSubmissionTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

type SubmissionFilter = 'all' | InquiryFormSubmission['status'];

function getFilterLabel(filter: SubmissionFilter) {
  if (filter === 'all') {
    return 'All';
  }

  return getSubmissionStatusLabel(filter);
}

function SubmissionCard({
  submission,
  opening,
  scheduling,
  statusUpdating,
  deleting,
  hasPrograms,
  onViewDetails,
  onOpen,
  onSchedule,
  onEnroll,
  onStatusChange,
  onDelete
}: {
  submission: InquiryFormSubmission;
  opening: boolean;
  scheduling: boolean;
  statusUpdating: boolean;
  deleting: boolean;
  hasPrograms: boolean;
  onViewDetails: () => void;
  onOpen: () => void;
  onSchedule: () => void;
  onEnroll: () => void;
  onStatusChange: (status: InquiryFormSubmission['status']) => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.submissionCard}>
      <View style={styles.submissionHeader}>
        <Pressable style={styles.submissionIdentity} onPress={onViewDetails}>
          <View style={styles.avatarFrame}>
            {submission.supporterAvatarUrl ? (
              <Image source={{ uri: submission.supporterAvatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarFallback}>{getInitials(submission.supporterName)}</Text>
            )}
          </View>

          <View style={styles.submissionCopy}>
            <Text style={styles.supporterName}>{submission.supporterName}</Text>
            <Text style={styles.supporterMeta}>{formatSubmissionTime(submission.createdAt)}</Text>
          </View>
        </Pressable>

        <View style={styles.submissionHeaderActions}>
          <View style={styles.responseBadge}>
            <Text style={styles.responseBadgeText}>{getSubmissionStatusLabel(submission.status)}</Text>
          </View>
          <Pressable style={styles.detailIconButton} onPress={onViewDetails}>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.answerStack}>
        {submission.answers.map((answer, index) => (
          <View key={answer.id} style={styles.answerRow}>
            <Text style={styles.answerLabel}>Question {index + 1}</Text>
            <Text style={styles.answerPrompt}>{answer.questionPrompt}</Text>
            <Text style={styles.answerValue}>{answer.answerText}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.secondaryActionButton, (opening || scheduling || deleting) && styles.actionButtonDisabled]}
          onPress={onOpen}
          disabled={opening || scheduling || deleting}
        >
          {opening ? (
            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          ) : (
            <Text style={styles.secondaryActionButtonText}>
              {submission.status === 'pending' ? 'Reply in DM' : 'Open DM'}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryActionButton, (opening || scheduling || deleting) && styles.actionButtonDisabled]}
          onPress={onSchedule}
          disabled={opening || scheduling || deleting}
        >
          {scheduling ? (
            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          ) : (
            <Text style={styles.secondaryActionButtonText}>Schedule call</Text>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.primaryActionButton,
            (!hasPrograms || deleting || statusUpdating) && styles.primaryActionButtonDisabled
          ]}
          onPress={onEnroll}
          disabled={!hasPrograms || deleting || statusUpdating}
        >
          <LinearGradient
            colors={theme.gradients.brand}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.primaryActionButtonFill}
          >
            <Text style={styles.primaryActionButtonText}>Enroll</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        {(['qualified', 'booked', 'enrolled'] as InquiryFormSubmission['status'][]).map((status) => {
          const isActive = submission.status === status;

          return (
            <Pressable
              key={status}
              style={[
                styles.statusChip,
                isActive && styles.statusChipActive,
                (statusUpdating || deleting) && styles.actionButtonDisabled
              ]}
              onPress={() => onStatusChange(status)}
              disabled={isActive || statusUpdating || deleting}
            >
              <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                {getSubmissionStatusLabel(status)}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          style={[styles.deleteChip, deleting && styles.actionButtonDisabled]}
          onPress={onDelete}
          disabled={deleting || statusUpdating}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#b42318" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={13} color="#b42318" />
              <Text style={styles.deleteChipText}>Delete</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function FormResponsesScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [responses, setResponses] = useState<InquiryFormSubmission[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SubmissionFilter>('all');
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);
  const [schedulingSubmissionId, setSchedulingSubmissionId] = useState<string | null>(null);
  const [statusSubmissionId, setStatusSubmissionId] = useState<string | null>(null);
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null);
  const [enrollmentSubmission, setEnrollmentSubmission] = useState<InquiryFormSubmission | null>(null);
  const [enrollingProgramId, setEnrollingProgramId] = useState<string | null>(null);
  const visibleResponses = useMemo(
    () =>
      activeFilter === 'all'
        ? responses
        : responses.filter((submission) => submission.status === activeFilter),
    [activeFilter, responses]
  );

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isMounted = true;

    async function loadResponses() {
      setLoading(true);
      setFeedback(null);

      try {
        const [nextResponses, nextPrograms] = await Promise.all([
          listCreatorInquiryFormSubmissions(currentSupabase, currentUser.id),
          listPrograms(currentSupabase, currentUser.id, 'creator')
        ]);

        if (!isMounted) {
          return;
        }

        setResponses(nextResponses);
        setPrograms(nextPrograms);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setFeedback(getErrorMessage(error));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadResponses();

    return () => {
      isMounted = false;
    };
  }, [supabase, user?.id]);

  function patchSubmission(submissionId: string, updater: (submission: InquiryFormSubmission) => InquiryFormSubmission) {
    setResponses((current) => current.map((submission) => (
      submission.id === submissionId ? updater(submission) : submission
    )));
  }

  function removeSubmission(submissionId: string) {
    setResponses((current) => current.filter((submission) => submission.id !== submissionId));
  }

  async function handleOpenSubmission(submission: InquiryFormSubmission) {
    if (!supabase || !user) {
      return;
    }

    setOpeningSubmissionId(submission.id);
    setFeedback(null);

    try {
      const conversationId =
        submission.conversationId ??
        (await openInquirySubmissionConversation(supabase, {
          submissionId: submission.id
        }));

      patchSubmission(submission.id, (current) => ({
        ...current,
        status: current.status === 'pending' ? 'opened' : current.status,
        conversationId
      }));

      router.push({
        pathname: '/thread/[threadId]',
        params: {
          threadId: conversationId
        }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setOpeningSubmissionId(null);
    }
  }

  async function handleScheduleSubmission(submission: InquiryFormSubmission) {
    if (!supabase || !user) {
      return;
    }

    setSchedulingSubmissionId(submission.id);
    setFeedback(null);

    try {
      const conversationId =
        submission.conversationId ??
        (await openInquirySubmissionConversation(supabase, {
          submissionId: submission.id
        }));

      router.push({
        pathname: '/(tabs)/clients',
        params: {
          openCreate: '1',
          submissionId: submission.id,
          attendeeId: submission.supporterId,
          attendeeName: submission.supporterName,
          conversationId,
          title: `${submission.supporterName.split(' ')[0] || 'Client'} intro call`
        }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSchedulingSubmissionId(null);
    }
  }

  async function handleEnrollInProgram(program: ProgramSummary) {
    if (!supabase || !enrollmentSubmission) {
      return;
    }

    setEnrollingProgramId(program.id);
    setFeedback(null);

    try {
      await enrollStudentInProgram(supabase, {
        programId: program.id,
        studentId: enrollmentSubmission.supporterId
      });

      await updateInquirySubmissionStatus(supabase, {
        submissionId: enrollmentSubmission.id,
        status: 'enrolled'
      });

      patchSubmission(enrollmentSubmission.id, (current) => ({
        ...current,
        status: 'enrolled'
      }));

      setEnrollmentSubmission(null);
      setFeedback(`${enrollmentSubmission.supporterName} is now enrolled in ${program.title}.`);
    } catch (error) {
      if (isDuplicateEnrollmentError(error)) {
        try {
          await updateInquirySubmissionStatus(supabase, {
            submissionId: enrollmentSubmission.id,
            status: 'enrolled'
          });
          patchSubmission(enrollmentSubmission.id, (current) => ({
            ...current,
            status: 'enrolled'
          }));
        } catch {
          // Keep the success-ish feedback even if the secondary status update fails.
        }
        setEnrollmentSubmission(null);
        setFeedback(`${enrollmentSubmission.supporterName} is already enrolled in ${program.title}.`);
      } else {
        setFeedback(getErrorMessage(error));
      }
    } finally {
      setEnrollingProgramId(null);
    }
  }

  async function handleStatusChange(submission: InquiryFormSubmission, status: InquiryFormSubmission['status']) {
    if (!supabase) {
      return;
    }

    setStatusSubmissionId(submission.id);
    setFeedback(null);

    try {
      await updateInquirySubmissionStatus(supabase, {
        submissionId: submission.id,
        status
      });

      patchSubmission(submission.id, (current) => ({
        ...current,
        status
      }));
      setFeedback(`${submission.supporterName} is now marked ${getSubmissionStatusLabel(status).toLowerCase()}.`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setStatusSubmissionId(null);
    }
  }

  function handleDeleteSubmission(submission: InquiryFormSubmission) {
    if (!supabase || deletingSubmissionId) {
      return;
    }

    Alert.alert('Delete submission?', 'This removes the saved inquiry response entry for this creator.', [
      {
        text: 'Keep',
        style: 'cancel'
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDeleteSubmission(submission);
        }
      }
    ]);
  }

  async function confirmDeleteSubmission(submission: InquiryFormSubmission) {
    if (!supabase) {
      return;
    }

    setDeletingSubmissionId(submission.id);
    setFeedback(null);

    try {
      await deleteInquirySubmission(supabase, {
        submissionId: submission.id
      });

      removeSubmission(submission.id);
      setFeedback(`Deleted ${submission.supporterName}'s inquiry submission.`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setDeletingSubmissionId(null);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyBody}>Add your Supabase keys in `apps/mobile/.env` to view saved form responses.</Text>
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
          <Text style={styles.emptyBody}>Loading form responses...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyBody}>Sign in to view creator inquiry responses.</Text>
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
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.backgroundBase}
          />
          <View style={styles.backgroundOrbPrimary} />
          <View style={styles.backgroundOrbSecondary} />
        </View>

        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Form Tools</Text>
            <Text style={styles.headerTitle}>Form responses</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Inquiry submissions</Text>
            <Text style={styles.heroBody}>
              Every response here is saved in Supabase and tied to the supporter who submitted it. From here you can reply, book a call, or enroll them in a program.
            </Text>
          </View>

          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

          {responses.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(['all', 'pending', 'opened', 'qualified', 'booked', 'enrolled'] as SubmissionFilter[]).map(
                (filter) => {
                  const isActive = activeFilter === filter;

                  return (
                    <Pressable
                      key={filter}
                      style={[styles.filterChip, isActive && styles.filterChipActive]}
                      onPress={() => setActiveFilter(filter)}
                    >
                      <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                        {getFilterLabel(filter)}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </ScrollView>
          ) : null}

          {visibleResponses.length ? (
            visibleResponses.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                opening={openingSubmissionId === submission.id}
                scheduling={schedulingSubmissionId === submission.id}
                statusUpdating={statusSubmissionId === submission.id}
                deleting={deletingSubmissionId === submission.id}
                hasPrograms={programs.length > 0}
                onViewDetails={() =>
                  router.push({
                    pathname: '/inquiry-person/[supporterId]',
                    params: {
                      supporterId: submission.supporterId
                    }
                  })
                }
                onOpen={() => void handleOpenSubmission(submission)}
                onSchedule={() => void handleScheduleSubmission(submission)}
                onEnroll={() => setEnrollmentSubmission(submission)}
                onStatusChange={(status) => void handleStatusChange(submission, status)}
                onDelete={() => handleDeleteSubmission(submission)}
              />
            ))
          ) : responses.length ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nothing in this filter</Text>
              <Text style={styles.emptyBody}>
                Try another stage to see more inquiry submissions.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No replies yet</Text>
              <Text style={styles.emptyBody}>
                Once supporters submit your inquiry form, their answers will show up here.
              </Text>
            </View>
          )}
        </ScrollView>

        <Modal
          visible={Boolean(enrollmentSubmission)}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!enrollingProgramId) {
              setEnrollmentSubmission(null);
            }
          }}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (!enrollingProgramId) {
                  setEnrollmentSubmission(null);
                }
              }}
            />

            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalEyebrow}>Learner</Text>
                  <Text style={styles.modalTitle}>Enroll in a program</Text>
                  <Text style={styles.modalBody}>
                    {enrollmentSubmission
                      ? `Choose where ${enrollmentSubmission.supporterName} should start.`
                      : 'Choose a program.'}
                  </Text>
                </View>

                <Pressable
                  style={styles.modalCloseButton}
                  onPress={() => {
                    if (!enrollingProgramId) {
                      setEnrollmentSubmission(null);
                    }
                  }}
                  disabled={Boolean(enrollingProgramId)}
                >
                  <Ionicons name="close" size={18} color="#6b7280" />
                </Pressable>
              </View>

              {programs.length ? (
                <ScrollView style={styles.modalProgramList} showsVerticalScrollIndicator={false}>
                  {programs.map((program) => (
                    <Pressable
                      key={program.id}
                      style={[
                        styles.programOptionCard,
                        enrollingProgramId === program.id && styles.programOptionCardDisabled
                      ]}
                      onPress={() => void handleEnrollInProgram(program)}
                      disabled={Boolean(enrollingProgramId)}
                    >
                      <View style={styles.programOptionCopy}>
                        <Text style={styles.programOptionTitle}>{program.title}</Text>
                        <Text style={styles.programOptionMeta}>
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
                <View style={styles.emptyEnrollState}>
                  <Text style={styles.emptyTitle}>No programs yet</Text>
                  <Text style={styles.emptyBody}>
                    Create a program first, then you can enroll supporters directly from form responses.
                  </Text>
                  <Pressable
                    style={styles.replyButton}
                    onPress={() => {
                      setEnrollmentSubmission(null);
                      router.push('/program-studio');
                    }}
                  >
                    <LinearGradient
                      colors={theme.gradients.brand}
                      end={{ x: 1, y: 1 }}
                      start={{ x: 0, y: 0 }}
                      style={styles.replyButtonFill}
                    >
                      <Text style={styles.replyButtonText}>Open studio</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
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
  backgroundOrbPrimary: {
    position: 'absolute',
    width: 280,
    height: 280,
    top: 96,
    right: -84,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.16)'
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    width: 220,
    height: 220,
    bottom: 120,
    left: -64,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.16)'
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
    backgroundColor: 'rgba(19,27,46,0.96)',
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
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 8
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  heroBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  filterRow: {
    gap: 8,
    paddingRight: 18
  },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: 'rgba(77, 142, 255, 0.34)'
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800'
  },
  filterChipTextActive: {
    color: theme.colors.textPrimary
  },
  feedbackText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  submissionCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 16,
    shadowColor: 'rgba(2, 6, 23, 0.42)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  submissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  submissionIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  submissionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  avatarFrame: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f1625',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarFallback: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  submissionCopy: {
    flex: 1,
    gap: 3
  },
  supporterName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800'
  },
  supporterMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12
  },
  responseBadge: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(77, 142, 255, 0.26)',
    backgroundColor: 'rgba(77, 142, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  responseBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  detailIconButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  replyButton: {
    marginTop: 4,
    minHeight: 42,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  replyButtonFill: {
    width: '100%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center'
  },
  replyButtonDisabled: {
    opacity: 0.7
  },
  replyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  secondaryActionButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  primaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  primaryActionButtonFill: {
    width: '100%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  primaryActionButtonDisabled: {
    opacity: 0.55
  },
  primaryActionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  actionButtonDisabled: {
    opacity: 0.72
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  statusChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: 'rgba(77, 142, 255, 0.34)'
  },
  statusChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  statusChipTextActive: {
    color: theme.colors.textPrimary
  },
  deleteChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 155, 155, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 155, 155, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  deleteChipText: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700'
  },
  answerStack: {
    gap: 12
  },
  answerRow: {
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineSoft
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.64)',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  modalCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(19,27,46,0.98)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    maxHeight: '76%',
    shadowColor: 'rgba(2, 6, 23, 0.48)',
    shadowOpacity: 1,
    shadowRadius: 32,
    shadowOffset: {
      width: 0,
      height: 18
    },
    elevation: 10
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
  modalEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.85,
    textTransform: 'uppercase'
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  modalBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalProgramList: {
    flexGrow: 0
  },
  programOptionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10
  },
  programOptionCardDisabled: {
    opacity: 0.72
  },
  programOptionCopy: {
    flex: 1,
    gap: 4
  },
  programOptionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  programOptionMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13
  },
  emptyEnrollState: {
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 18,
    gap: 10
  },
  emptyCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 8
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: theme.typography.headline,
    textAlign: 'center'
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center'
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28
  }
});

