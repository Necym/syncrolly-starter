import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import { type CreatorSupporterOverview, type ProgramSummary } from '@syncrolly/core';
import {
  approveConversationRequest,
  deleteDirectConversation,
  enrollStudentInProgram,
  getCreatorSupporterOverview,
  getConversationDetails,
  markConversationRead,
  removeStudentFromProgram,
  respondToScheduledCallInvitation,
  sendMessage,
  updateInquirySubmissionStatus
} from '@syncrolly/data';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPreferredRole, useMobileSession } from '../../lib/session';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading the conversation.';
}

function formatSubmissionCardTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatCallInvitationTimeRange(startsAt: string, endsAt: string): string {
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);

  return `${startDate.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })} - ${endDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })}`;
}

function getCallInvitationStatusLabel(status: 'pending' | 'accepted' | 'declined') {
  if (status === 'accepted') {
    return 'Accepted';
  }

  if (status === 'declined') {
    return 'Declined';
  }

  return 'Pending';
}

type ThreadMenuMode = 'menu' | 'enroll' | 'unenroll';

const DM_COLORS = {
  backgroundTop: '#0b1326',
  backgroundBottom: '#0b1326',
  chrome: 'rgba(11, 19, 38, 0.86)',
  chromeBorder: 'rgba(255,255,255,0.08)',
  chromeShadow: 'rgba(0, 0, 0, 0.30)',
  incomingBubble: '#2d3449',
  incomingBorder: 'rgba(255,255,255,0.06)',
  incomingOutlineStart: 'rgba(77, 142, 255, 0.9)',
  incomingOutlineEnd: 'rgba(87, 27, 193, 0.9)',
  incomingShadow: 'rgba(0, 0, 0, 0.24)',
  outgoingStart: '#4d8eff',
  outgoingEnd: '#571bc1',
  outgoingShadow: 'rgba(87, 27, 193, 0.32)',
  meta: '#98a3bc',
  icon: '#72a0ff',
  accent: '#4d8eff',
  accentSoft: 'rgba(77, 142, 255, 0.16)',
  cardTopGlow: 'rgba(255,255,255,0.10)',
  cardPanelTop: 'rgba(27, 38, 63, 0.98)',
  cardPanelBottom: 'rgba(15, 24, 43, 0.98)',
  cardPanelBorder: 'rgba(255,255,255,0.06)'
} as const;

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string | string[] }>();
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const pendingAutoScrollRef = useRef(true);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedThreadId = Array.isArray(threadId) ? threadId[0] : threadId;
  const viewerRole = getPreferredRole(user);
  const [draft, setDraft] = useState('');
  const [composerHeight, setComposerHeight] = useState(72);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [respondingCallId, setRespondingCallId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversation, setConversation] = useState<Awaited<ReturnType<typeof getConversationDetails>>>(null);
  const [threadMenuMode, setThreadMenuMode] = useState<ThreadMenuMode | null>(null);
  const [participantOverview, setParticipantOverview] = useState<CreatorSupporterOverview | null>(null);
  const [loadingParticipantOverview, setLoadingParticipantOverview] = useState(false);
  const [mutatingProgramId, setMutatingProgramId] = useState<string | null>(null);

  useEffect(() => {
    setAvatarFailed(false);
  }, [conversation?.participantAvatar]);

  useEffect(() => {
    const frameEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardFrame = Keyboard.addListener(frameEvent, (event) => {
      const nextLift =
        Platform.OS === 'ios'
          ? Math.max(Dimensions.get('window').height - event.endCoordinates.screenY, 0)
          : Math.max(event.endCoordinates.height, 0);

      setKeyboardLift(nextLift);
      scrollToLatest(false);
    });

    const handleKeyboardHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardLift(0);
    });

    return () => {
      handleKeyboardFrame.remove();
      handleKeyboardHide.remove();
    };
  }, []);

  async function loadConversation(options?: { showLoader?: boolean }) {
    if (!supabase || !user || !resolvedThreadId) {
      return;
    }

    const showLoader = options?.showLoader ?? conversation == null;

    if (showLoader) {
      setLoadingConversation(true);
    }

    setFeedback(null);

    try {
      const nextConversation = await getConversationDetails(supabase, resolvedThreadId, user.id);
      setConversation(nextConversation);
      pendingAutoScrollRef.current = true;

      const lastMessage = nextConversation?.messages[nextConversation.messages.length - 1];

      if (lastMessage) {
        await markConversationRead(supabase, {
          conversationId: resolvedThreadId,
          userId: user.id,
          readAt: lastMessage.createdAt
        });
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      if (showLoader) {
        setLoadingConversation(false);
      }
    }
  }

  async function loadParticipantOverview(options?: { showLoader?: boolean }) {
    if (!supabase || !user || !conversation || viewerRole !== 'creator') {
      return null;
    }

    if (options?.showLoader ?? true) {
      setLoadingParticipantOverview(true);
    }

    try {
      const nextOverview = await getCreatorSupporterOverview(supabase, user.id, conversation.participantId);
      setParticipantOverview(nextOverview);
      return nextOverview;
    } catch (error) {
      setFeedback(getErrorMessage(error));
      return null;
    } finally {
      if (options?.showLoader ?? true) {
        setLoadingParticipantOverview(false);
      }
    }
  }

  function handleOpenParticipantProfile() {
    if (!conversation) {
      return;
    }

    router.push({
      pathname: '/profile/[profileId]',
      params: {
        profileId: conversation.participantId
      }
    });
  }

  useEffect(() => {
    if (!user || !resolvedThreadId || !supabase) {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      setConversation(null);
      setParticipantOverview(null);
      return;
    }

    setParticipantOverview(null);
    void loadConversation({ showLoader: true });
  }, [resolvedThreadId, supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !resolvedThreadId) {
      return;
    }

    const staleChannelPrefix = `realtime:thread-live:${resolvedThreadId}:${user.id}`;

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic.startsWith(staleChannelPrefix)) {
        void supabase.removeChannel(existingChannel);
      }
    }

    const scheduleThreadRefresh = () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
      }

      realtimeRefreshTimeoutRef.current = setTimeout(() => {
        realtimeRefreshTimeoutRef.current = null;
        void loadConversation({ showLoader: false });
      }, 150);
    };

    const channel = supabase
      .channel(`thread-live:${resolvedThreadId}:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${resolvedThreadId}`
        },
        () => {
          scheduleThreadRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${resolvedThreadId}`
        },
        (payload) => {
          const senderId =
            typeof payload.new === 'object' &&
            payload.new !== null &&
            'sender_id' in payload.new &&
            typeof (payload.new as { sender_id?: unknown }).sender_id === 'string'
              ? (payload.new as { sender_id: string }).sender_id
              : null;

          if (senderId === user.id) {
            return;
          }

          scheduleThreadRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scheduled_calls',
          filter: `conversation_id=eq.${resolvedThreadId}`
        },
        () => {
          scheduleThreadRefresh();
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [resolvedThreadId, supabase, user?.id]);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  }

  async function handleSend() {
    if (!supabase || !user || !conversation) {
      return;
    }

    const nextText = draft.trim();

    if (!nextText || !conversation.canSendMessage) {
      return;
    }

    setSending(true);
    setFeedback(null);
    pendingAutoScrollRef.current = true;

    try {
      if (conversation.canApproveRequest) {
        await approveConversationRequest(supabase, {
          conversationId: conversation.id
        });
      }

      await sendMessage(supabase, {
        conversationId: conversation.id,
        senderId: user.id,
        body: nextText
      });

      setDraft('');
      await loadConversation({ showLoader: false });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function handleApproveRequest() {
    if (!supabase || !conversation?.canApproveRequest) {
      return;
    }

    setApprovingRequest(true);
    setFeedback(null);

    try {
      await approveConversationRequest(supabase, {
        conversationId: conversation.id
      });

      await loadConversation({ showLoader: false });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setApprovingRequest(false);
    }
  }

  async function handleRespondToCallInvitation(callId: string, nextStatus: 'accepted' | 'declined') {
    if (!supabase) {
      return;
    }

    setRespondingCallId(callId);
    setFeedback(null);

    try {
      await respondToScheduledCallInvitation(supabase, {
        callId,
        nextStatus
      });

      await loadConversation({ showLoader: false });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setRespondingCallId(null);
    }
  }

  function promptDeleteConversation() {
    if (!conversation || deletingConversation) {
      return;
    }

    setThreadMenuMode(null);

    Alert.alert(
      'Delete thread?',
      'This will remove the direct message feed. If the other person reaches out again, they will need to follow your current DM flow from scratch.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDeleteConversation();
          }
        }
      ]
    );
  }

  async function openThreadMenu() {
    if (!conversation || viewerRole !== 'creator') {
      return;
    }

    setThreadMenuMode('menu');

    if (!participantOverview) {
      await loadParticipantOverview();
    }
  }

  function closeThreadMenu() {
    if (mutatingProgramId || loadingParticipantOverview) {
      return;
    }

    setThreadMenuMode(null);
  }

  function handleOpenPersonRecord() {
    if (!conversation) {
      return;
    }

    setThreadMenuMode(null);
    router.push({
      pathname: '/inquiry-person/[supporterId]',
      params: {
        supporterId: conversation.participantId
      }
    });
  }

  function handleScheduleFromMenu() {
    if (!conversation) {
      return;
    }

    setThreadMenuMode(null);
    router.push({
      pathname: '/(tabs)/clients',
      params: {
        openCreate: '1',
        submissionId: participantOverview?.submissions[0]?.id,
        attendeeId: conversation.participantId,
        attendeeName: conversation.participantName,
        conversationId: conversation.id,
        title: `${conversation.participantName.split(' ')[0] || 'Client'} intro call`
      }
    });
  }

  function handleOpenEnrollPicker() {
    setThreadMenuMode('enroll');
  }

  function handleOpenUnenrollPicker() {
    setThreadMenuMode('unenroll');
  }

  async function handleEnrollProgram(program: ProgramSummary) {
    if (!supabase || !conversation || !user) {
      return;
    }

    setMutatingProgramId(program.id);
    setFeedback(null);

    try {
      await enrollStudentInProgram(supabase, {
        programId: program.id,
        studentId: conversation.participantId
      });

      if (participantOverview?.submissions[0]) {
        await updateInquirySubmissionStatus(supabase, {
          submissionId: participantOverview.submissions[0].id,
          status: 'enrolled'
        });
      }

      await loadParticipantOverview({ showLoader: false });
      setThreadMenuMode(null);
      setFeedback(`${conversation.participantName} is now enrolled in ${program.title}.`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setMutatingProgramId(null);
    }
  }

  async function handleUnenrollProgram(enrollmentId: string, title: string) {
    if (!supabase || !conversation) {
      return;
    }

    setMutatingProgramId(enrollmentId);
    setFeedback(null);

    try {
      await removeStudentFromProgram(supabase, {
        enrollmentId
      });

      await loadParticipantOverview({ showLoader: false });
      setThreadMenuMode(null);
      setFeedback(`${conversation.participantName} was removed from ${title}.`);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setMutatingProgramId(null);
    }
  }

  async function handleDeleteConversation() {
    if (!supabase || !conversation || deletingConversation) {
      return;
    }

    setDeletingConversation(true);
    setFeedback(null);

    try {
      await deleteDirectConversation(supabase, {
        conversationId: conversation.id
      });

      router.replace('/');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setDeletingConversation(false);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={DM_COLORS.icon} />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Supabase isn&apos;t configured</Text>
            <Text style={styles.emptyBody}>Add the mobile environment keys, then restart Expo.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || (loadingConversation && !conversation)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={DM_COLORS.icon} />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color={DM_COLORS.icon} />
            <Text style={styles.emptyBody}>Loading conversation…</Text>
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
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={DM_COLORS.icon} />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sign in first</Text>
            <Text style={styles.emptyBody}>This conversation is tied to your real Syncrolly account.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!conversation) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={DM_COLORS.icon} />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Conversation not found</Text>
            <Text style={styles.emptyBody}>
              {feedback ?? 'Go back to the inbox and start a new message from there.'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const activityLabel = conversation.activityLabel;
  const presenceColor = conversation.participantPresence === 'online' ? '#10b981' : '#667085';
  const showAvatarImage = Boolean(conversation.participantAvatar && !avatarFailed);
  const requestBannerTitle = conversation.canApproveRequest
    ? 'Message request'
    : conversation.canSendMessage
      ? 'Send your first request'
      : 'Pending approval';
  const requestBannerBody = conversation.canApproveRequest
    ? 'Approve this request to move the conversation into the active inbox, or reply to approve it automatically.'
    : conversation.canSendMessage
      ? 'This creator gates access. Your first message will be sent as a request for approval.'
      : 'Your request has been sent. You can send more messages after the creator approves the conversation.';
  const composerPlaceholder = !conversation.canSendMessage
    ? 'Waiting for creator approval...'
    : conversation.status === 'request'
      ? 'Send your request...'
      : 'Message...';
  const enrolledProgramIds = new Set((participantOverview?.enrolledPrograms ?? []).map((program) => program.programId));
  const enrollablePrograms = (participantOverview?.creatorPrograms ?? []).filter(
    (program) => !enrolledProgramIds.has(program.id)
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <LinearGradient
          colors={[DM_COLORS.backgroundTop, DM_COLORS.backgroundBottom]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={21} color={DM_COLORS.icon} />
          </Pressable>

          <Pressable onPress={handleOpenParticipantProfile} style={styles.headerIdentity}>
            <View style={[styles.headerAvatar, { borderColor: `${conversation.participantAccentColor}33` }]}>
              {showAvatarImage ? (
                <Image
                  source={{ uri: conversation.participantAvatar }}
                  style={styles.headerAvatarImage}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <Text style={[styles.headerAvatarText, { color: conversation.participantAccentColor }]}>
                  {conversation.participantInitials}
                </Text>
              )}
              <View style={[styles.headerPresenceDot, { backgroundColor: presenceColor }]} />
            </View>

            <View style={styles.headerCopy}>
              <Text style={styles.headerName}>{conversation.participantName}</Text>
              <Text style={styles.headerMeta}>{activityLabel}</Text>
            </View>
          </Pressable>

          {viewerRole === 'creator' ? (
            <Pressable style={styles.iconButton} onPress={() => void openThreadMenu()}>
              {deletingConversation ? (
                <ActivityIndicator size="small" color={DM_COLORS.icon} />
              ) : (
                <Ionicons name="ellipsis-vertical" size={19} color={DM_COLORS.icon} />
              )}
            </Pressable>
          ) : (
            <View style={styles.iconButtonPlaceholder} />
          )}
        </View>

        <View style={styles.threadShell}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={[
              styles.messagesContent,
              { paddingBottom: composerHeight + keyboardLift + Math.max(insets.bottom, 12) + 18 }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="always"
            onContentSizeChange={() => {
              if (pendingAutoScrollRef.current) {
                pendingAutoScrollRef.current = false;
                scrollToLatest(false);
              }
            }}
          >
            {conversation.status === 'request' ? (
              <LinearGradient
                colors={[DM_COLORS.outgoingStart, DM_COLORS.outgoingEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.requestBannerFrame}
              >
                <View style={styles.requestBanner}>
                  <View style={styles.specialCardTopGlow} />
                  <View style={styles.requestBannerHeader}>
                    <View style={styles.requestBadge}>
                      <Ionicons name="mail-open-outline" size={12} color={DM_COLORS.icon} />
                      <Text style={styles.requestBadgeText}>{conversation.statusLabel}</Text>
                    </View>

                    {conversation.canApproveRequest ? (
                      <Pressable
                        style={[styles.requestApproveButton, approvingRequest && styles.requestApproveButtonDisabled]}
                        onPress={handleApproveRequest}
                        disabled={approvingRequest}
                      >
                        {approvingRequest ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.requestApproveButtonText}>Approve</Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>

                  <Text style={styles.requestBannerTitle}>{requestBannerTitle}</Text>
                  <Text style={styles.requestBannerBody}>{requestBannerBody}</Text>
                </View>
              </LinearGradient>
            ) : null}

            {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

            {conversation.messages.map((message) => {
              const scheduledCallInvitationCard = message.scheduledCallInvitationCard;

              return (
              <View key={message.id} style={styles.messageBlock}>
                {message.dayLabel ? (
                  <View style={styles.dayPillWrap}>
                  <View style={styles.dayPill}>
                      <Text style={styles.dayPillText}>{message.dayLabel}</Text>
                  </View>
                </View>
              ) : null}

                <View
                  style={[styles.messageRow, message.isFromCreator ? styles.messageRowOutgoing : styles.messageRowIncoming]}
                >
                  {message.kind === 'inquiry_submission' && message.inquirySubmissionCard ? (
                    <View
                      style={[
                        styles.specialMessageFrame,
                        message.isFromCreator ? styles.specialMessageFrameOutgoing : styles.specialMessageFrameIncoming
                      ]}
                    >
                      <LinearGradient
                        colors={[DM_COLORS.outgoingStart, DM_COLORS.outgoingEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.specialCardGradientFrame,
                          message.isFromCreator ? styles.specialCardGradientFrameOutgoing : styles.specialCardGradientFrameIncoming
                        ]}
                      >
                        {message.isFromCreator ? (
                          <>
                            <View style={styles.specialCardTopGlow} />
                            <View style={styles.inquiryCard}>
                              <View style={styles.inquiryCardHeader}>
                                <View style={styles.inquiryCardBadge}>
                                  <Ionicons name="document-text-outline" size={12} color={DM_COLORS.icon} />
                                  <Text style={styles.inquiryCardBadgeText}>Form intake</Text>
                                </View>
                                <Text style={styles.inquiryCardMeta}>
                                  {formatSubmissionCardTime(message.inquirySubmissionCard.submittedAt)}
                                </Text>
                              </View>

                              <Text style={styles.inquiryCardTitle}>{message.inquirySubmissionCard.formTitle}</Text>
                              <Text style={styles.inquiryCardBody}>
                                {message.inquirySubmissionCard.supporterName} answered your inquiry form.
                              </Text>

                              <View style={styles.inquiryAnswerStack}>
                                {message.inquirySubmissionCard.answers.map((answer, index) => (
                                  <View key={`${message.id}-${index}`} style={styles.inquiryAnswerRow}>
                                    <Text style={styles.inquiryAnswerLabel}>Question {index + 1}</Text>
                                    <Text style={styles.inquiryAnswerPrompt}>{answer.questionPrompt}</Text>
                                    <Text style={styles.inquiryAnswerValue}>{answer.answerText}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          </>
                        ) : (
                          <View style={[styles.specialCardPanel, styles.specialCardPanelIncoming]}>
                            <View style={styles.specialCardTopGlow} />
                            <View style={styles.inquiryCard}>
                              <View style={styles.inquiryCardHeader}>
                                <View style={styles.inquiryCardBadge}>
                                  <Ionicons name="document-text-outline" size={12} color={DM_COLORS.icon} />
                                  <Text style={styles.inquiryCardBadgeText}>Form intake</Text>
                                </View>
                                <Text style={styles.inquiryCardMeta}>
                                  {formatSubmissionCardTime(message.inquirySubmissionCard.submittedAt)}
                                </Text>
                              </View>

                              <Text style={styles.inquiryCardTitle}>{message.inquirySubmissionCard.formTitle}</Text>
                              <Text style={styles.inquiryCardBody}>
                                {message.inquirySubmissionCard.supporterName} answered your inquiry form.
                              </Text>

                              <View style={styles.inquiryAnswerStack}>
                                {message.inquirySubmissionCard.answers.map((answer, index) => (
                                  <View key={`${message.id}-${index}`} style={styles.inquiryAnswerRow}>
                                    <Text style={styles.inquiryAnswerLabel}>Question {index + 1}</Text>
                                    <Text style={styles.inquiryAnswerPrompt}>{answer.questionPrompt}</Text>
                                    <Text style={styles.inquiryAnswerValue}>{answer.answerText}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )}
                      </LinearGradient>
                    </View>
                  ) : message.kind === 'scheduled_call_invitation' && scheduledCallInvitationCard ? (
                    <View
                      style={[
                        styles.specialMessageFrame,
                        message.isFromCreator ? styles.specialMessageFrameOutgoing : styles.specialMessageFrameIncoming
                      ]}
                    >
                      <LinearGradient
                        colors={[DM_COLORS.outgoingStart, DM_COLORS.outgoingEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.specialCardGradientFrame,
                          message.isFromCreator ? styles.specialCardGradientFrameOutgoing : styles.specialCardGradientFrameIncoming
                        ]}
                      >
                        {message.isFromCreator ? (
                          <>
                            <View style={styles.specialCardTopGlow} />
                            <View style={styles.callInvitationCard}>
                              <View style={styles.callInvitationHeader}>
                                <View style={styles.callInvitationBadge}>
                                  <Ionicons name="calendar-outline" size={12} color={DM_COLORS.icon} />
                                  <Text style={styles.callInvitationBadgeText}>Call invite</Text>
                                </View>

                                <View
                                  style={[
                                    styles.callInvitationStatusPill,
                                    scheduledCallInvitationCard.status === 'accepted'
                                      ? styles.callInvitationStatusAccepted
                                      : scheduledCallInvitationCard.status === 'declined'
                                        ? styles.callInvitationStatusDeclined
                                        : styles.callInvitationStatusPending
                                  ]}
                                >
                                  <Text style={styles.callInvitationStatusText}>
                                    {getCallInvitationStatusLabel(scheduledCallInvitationCard.status)}
                                  </Text>
                                </View>
                              </View>

                              <Text style={styles.callInvitationTitle}>{scheduledCallInvitationCard.title}</Text>
                              <Text style={styles.callInvitationMeta}>
                                {formatCallInvitationTimeRange(
                                  scheduledCallInvitationCard.startsAt,
                                  scheduledCallInvitationCard.endsAt
                                )}
                              </Text>

                              {scheduledCallInvitationCard.attendeeProfileId === user.id &&
                              scheduledCallInvitationCard.status === 'pending' ? (
                                <View style={styles.callInvitationActions}>
                                  <Pressable
                                    style={[
                                      styles.callInvitationGhostButton,
                                      respondingCallId === scheduledCallInvitationCard.callId && styles.callInvitationButtonDisabled
                                    ]}
                                    onPress={() =>
                                      void handleRespondToCallInvitation(scheduledCallInvitationCard.callId, 'declined')
                                    }
                                    disabled={respondingCallId === scheduledCallInvitationCard.callId}
                                  >
                                    <Text style={styles.callInvitationGhostButtonText}>Decline</Text>
                                  </Pressable>

                                  <Pressable
                                    style={[
                                      styles.callInvitationPrimaryButton,
                                      respondingCallId === scheduledCallInvitationCard.callId && styles.callInvitationButtonDisabled
                                    ]}
                                    onPress={() =>
                                      void handleRespondToCallInvitation(scheduledCallInvitationCard.callId, 'accepted')
                                    }
                                    disabled={respondingCallId === scheduledCallInvitationCard.callId}
                                  >
                                    {respondingCallId === scheduledCallInvitationCard.callId ? (
                                      <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                      <Text style={styles.callInvitationPrimaryButtonText}>Accept</Text>
                                    )}
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          </>
                        ) : (
                          <View style={[styles.specialCardPanel, styles.specialCardPanelIncoming]}>
                            <View style={styles.specialCardTopGlow} />
                            <View style={styles.callInvitationCard}>
                              <View style={styles.callInvitationHeader}>
                                <View style={styles.callInvitationBadge}>
                                  <Ionicons name="calendar-outline" size={12} color={DM_COLORS.icon} />
                                  <Text style={styles.callInvitationBadgeText}>Call invite</Text>
                                </View>

                                <View
                                  style={[
                                    styles.callInvitationStatusPill,
                                    scheduledCallInvitationCard.status === 'accepted'
                                      ? styles.callInvitationStatusAccepted
                                      : scheduledCallInvitationCard.status === 'declined'
                                        ? styles.callInvitationStatusDeclined
                                        : styles.callInvitationStatusPending
                                  ]}
                                >
                                  <Text style={styles.callInvitationStatusText}>
                                    {getCallInvitationStatusLabel(scheduledCallInvitationCard.status)}
                                  </Text>
                                </View>
                              </View>

                              <Text style={styles.callInvitationTitle}>{scheduledCallInvitationCard.title}</Text>
                              <Text style={styles.callInvitationMeta}>
                                {formatCallInvitationTimeRange(
                                  scheduledCallInvitationCard.startsAt,
                                  scheduledCallInvitationCard.endsAt
                                )}
                              </Text>

                              {scheduledCallInvitationCard.attendeeProfileId === user.id &&
                              scheduledCallInvitationCard.status === 'pending' ? (
                                <View style={styles.callInvitationActions}>
                                  <Pressable
                                    style={[
                                      styles.callInvitationGhostButton,
                                      respondingCallId === scheduledCallInvitationCard.callId && styles.callInvitationButtonDisabled
                                    ]}
                                    onPress={() =>
                                      void handleRespondToCallInvitation(scheduledCallInvitationCard.callId, 'declined')
                                    }
                                    disabled={respondingCallId === scheduledCallInvitationCard.callId}
                                  >
                                    <Text style={styles.callInvitationGhostButtonText}>Decline</Text>
                                  </Pressable>

                                  <Pressable
                                    style={[
                                      styles.callInvitationPrimaryButton,
                                      respondingCallId === scheduledCallInvitationCard.callId && styles.callInvitationButtonDisabled
                                    ]}
                                    onPress={() =>
                                      void handleRespondToCallInvitation(scheduledCallInvitationCard.callId, 'accepted')
                                    }
                                    disabled={respondingCallId === scheduledCallInvitationCard.callId}
                                  >
                                    {respondingCallId === scheduledCallInvitationCard.callId ? (
                                      <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                      <Text style={styles.callInvitationPrimaryButtonText}>Accept</Text>
                                    )}
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        )}
                      </LinearGradient>
                    </View>
                  ) : message.isFromCreator ? (
                    <LinearGradient
                      colors={[DM_COLORS.outgoingStart, DM_COLORS.outgoingEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.messageBubble, styles.messageBubbleOutgoing]}
                    >
                      <Text style={[styles.messageText, styles.messageTextOutgoing]}>
                        {message.text}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <LinearGradient
                      colors={[DM_COLORS.incomingOutlineStart, DM_COLORS.incomingOutlineEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.messageBubbleCard, styles.messageBubbleIncomingFrame]}
                    >
                      <View style={[styles.messageBubble, styles.messageBubbleIncoming]}>
                        <Text
                          style={[
                            styles.messageText,
                            styles.messageTextIncoming
                          ]}
                        >
                          {message.text}
                        </Text>
                      </View>
                    </LinearGradient>
                  )}

                  <View style={[styles.messageMetaRow, message.isFromCreator && styles.messageMetaRowOutgoing]}>
                    <Text style={styles.messageMetaText}>{message.timeLabel}</Text>
                    {message.isFromCreator ? (
                      <Ionicons name="checkmark-done" size={12} color="rgba(74, 99, 255, 0.6)" />
                    ) : null}
                  </View>
                </View>
              </View>
            );
            })}
          </ScrollView>

          <View
            style={[
              styles.composerShell,
              {
                bottom: keyboardLift,
                paddingBottom: keyboardLift > 0 ? 12 : Math.max(insets.bottom, 12)
              }
            ]}
            onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
          >
            <View style={styles.composerCard}>
              <Pressable style={styles.mediaButton}>
                <Ionicons name="add-circle" size={22} color={DM_COLORS.meta} />
              </Pressable>

              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={composerPlaceholder}
                placeholderTextColor="rgba(114, 119, 132, 0.7)"
                style={[styles.composerInput, !conversation.canSendMessage && styles.composerInputDisabled]}
                onFocus={() => scrollToLatest(false)}
                editable={conversation.canSendMessage}
              />

              <Pressable style={styles.mediaButton}>
                <Ionicons name="mic" size={18} color={DM_COLORS.meta} />
              </Pressable>

              <LinearGradient
                colors={[DM_COLORS.outgoingStart, DM_COLORS.outgoingEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.sendButton,
                  (!draft.trim() || sending || !conversation.canSendMessage) && styles.sendButtonDisabled
                ]}
              >
                <Pressable
                  style={styles.sendButtonPressable}
                  onPress={handleSend}
                  disabled={!draft.trim() || sending || !conversation.canSendMessage}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                  )}
                </Pressable>
              </LinearGradient>
            </View>
          </View>
        </View>

        <Modal
          visible={Boolean(threadMenuMode)}
          transparent
          animationType="fade"
          onRequestClose={closeThreadMenu}
        >
          <View style={styles.actionSheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeThreadMenu} />

            <View style={styles.actionSheetCard}>
              {threadMenuMode === 'menu' ? (
                <>
                  <View style={styles.actionSheetHeader}>
                    <Text style={styles.actionSheetTitle}>Conversation actions</Text>
                    <Text style={styles.actionSheetBody}>{conversation.participantName}</Text>
                  </View>

                  {loadingParticipantOverview ? (
                    <View style={styles.actionSheetLoadingRow}>
                      <ActivityIndicator size="small" color={DM_COLORS.icon} />
                      <Text style={styles.actionSheetLoadingText}>Loading person actions...</Text>
                    </View>
                  ) : null}

                  <Pressable style={styles.actionSheetRow} onPress={handleOpenPersonRecord}>
                    <Ionicons name="person-circle-outline" size={18} color="#e7edff" />
                    <Text style={styles.actionSheetRowText}>View person record</Text>
                  </Pressable>

                  <Pressable style={styles.actionSheetRow} onPress={handleScheduleFromMenu}>
                    <Ionicons name="calendar-outline" size={18} color="#e7edff" />
                    <Text style={styles.actionSheetRowText}>Schedule call</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionSheetRow, !enrollablePrograms.length && styles.actionSheetRowDisabled]}
                    onPress={handleOpenEnrollPicker}
                    disabled={!enrollablePrograms.length}
                  >
                    <Ionicons name="school-outline" size={18} color="#e7edff" />
                    <Text style={styles.actionSheetRowText}>Enroll in program</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.actionSheetRow,
                      !(participantOverview?.enrolledPrograms.length) && styles.actionSheetRowDisabled
                    ]}
                    onPress={handleOpenUnenrollPicker}
                    disabled={!(participantOverview?.enrolledPrograms.length)}
                  >
                    <Ionicons name="remove-circle-outline" size={18} color="#e7edff" />
                    <Text style={styles.actionSheetRowText}>Remove from program</Text>
                  </Pressable>

                  <Pressable style={[styles.actionSheetRow, styles.actionSheetDangerRow]} onPress={promptDeleteConversation}>
                    <Ionicons name="trash-outline" size={18} color="#b42318" />
                    <Text style={styles.actionSheetDangerText}>Delete thread</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.actionSheetHeader}>
                    <Text style={styles.actionSheetTitle}>
                      {threadMenuMode === 'enroll' ? 'Enroll in a program' : 'Remove from a program'}
                    </Text>
                    <Text style={styles.actionSheetBody}>{conversation.participantName}</Text>
                  </View>

                  <ScrollView style={styles.actionSheetList} showsVerticalScrollIndicator={false}>
                    {threadMenuMode === 'enroll'
                      ? enrollablePrograms.map((program) => (
                          <Pressable
                            key={program.id}
                            style={[styles.programActionRow, mutatingProgramId === program.id && styles.actionSheetRowDisabled]}
                            onPress={() => void handleEnrollProgram(program)}
                            disabled={Boolean(mutatingProgramId)}
                          >
                            <View style={styles.programActionCopy}>
                              <Text style={styles.programActionTitle}>{program.title}</Text>
                              <Text style={styles.programActionMeta}>
                                {program.lessonCount} lessons • {program.enrolledCount} learners
                              </Text>
                            </View>
                            {mutatingProgramId === program.id ? (
                              <ActivityIndicator size="small" color={DM_COLORS.icon} />
                            ) : (
                              <Ionicons name="add-circle-outline" size={18} color={DM_COLORS.icon} />
                            )}
                          </Pressable>
                        ))
                      : participantOverview?.enrolledPrograms.map((program) => (
                          <Pressable
                            key={program.enrollmentId}
                            style={[
                              styles.programActionRow,
                              mutatingProgramId === program.enrollmentId && styles.actionSheetRowDisabled
                            ]}
                            onPress={() => void handleUnenrollProgram(program.enrollmentId, program.title)}
                            disabled={Boolean(mutatingProgramId)}
                          >
                            <View style={styles.programActionCopy}>
                              <Text style={styles.programActionTitle}>{program.title}</Text>
                              <Text style={styles.programActionMeta}>
                                {program.completedLessons} of {Math.max(program.lessonCount, 1)} lessons complete
                              </Text>
                            </View>
                            {mutatingProgramId === program.enrollmentId ? (
                              <ActivityIndicator size="small" color={DM_COLORS.icon} />
                            ) : (
                              <Ionicons name="remove-circle-outline" size={18} color="#b42318" />
                            )}
                          </Pressable>
                        ))}

                    {threadMenuMode === 'enroll' && !enrollablePrograms.length ? (
                      <Text style={styles.actionSheetEmptyText}>They already have access to every program.</Text>
                    ) : null}
                    {threadMenuMode === 'unenroll' && !participantOverview?.enrolledPrograms.length ? (
                      <Text style={styles.actionSheetEmptyText}>They are not enrolled in any programs yet.</Text>
                    ) : null}
                  </ScrollView>

                  <Pressable style={styles.actionSheetCancelButton} onPress={() => setThreadMenuMode('menu')}>
                    <Text style={styles.actionSheetCancelText}>Back</Text>
                  </Pressable>
                </>
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
    backgroundColor: DM_COLORS.backgroundTop
  },
  screen: {
    flex: 1,
    backgroundColor: DM_COLORS.backgroundBottom
  },
  threadShell: {
    flex: 1
  },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DM_COLORS.chrome,
    borderBottomWidth: 1,
    borderBottomColor: DM_COLORS.chromeBorder,
    shadowColor: DM_COLORS.chromeShadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 6
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  iconButtonPlaceholder: {
    width: 38,
    height: 38
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.28)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 3
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%'
  },
  headerAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  headerPresenceDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: DM_COLORS.backgroundTop
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  headerName: {
    color: '#f1f5ff',
    fontSize: 16,
    fontWeight: '700'
  },
  headerMeta: {
    color: DM_COLORS.meta,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  },
  scrollView: {
    flex: 1
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 14
  },
  requestBanner: {
    borderRadius: 19,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    backgroundColor: DM_COLORS.incomingBubble
  },
  requestBannerFrame: {
    borderRadius: 20,
    padding: 1,
    shadowColor: DM_COLORS.outgoingShadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4
  },
  specialCardGradientFrame: {
    borderRadius: 20,
    padding: 1,
    shadowColor: DM_COLORS.outgoingShadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4
  },
  specialCardGradientFrameIncoming: {
    borderTopLeftRadius: 8
  },
  specialCardGradientFrameOutgoing: {
    borderTopRightRadius: 8
  },
  specialCardPanel: {
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: DM_COLORS.incomingBubble
  },
  specialCardPanelIncoming: {
    borderTopLeftRadius: 7
  },
  specialCardTopGlow: {
    height: 1,
    backgroundColor: DM_COLORS.cardTopGlow
  },
  requestBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  requestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: DM_COLORS.accentSoft
  },
  requestBadgeText: {
    color: '#8eb8ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase'
  },
  requestBannerTitle: {
    color: '#e8eeff',
    fontSize: 15,
    fontWeight: '700'
  },
  requestBannerBody: {
    color: '#b4bfd4',
    fontSize: 13,
    lineHeight: 20
  },
  requestApproveButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DM_COLORS.accent
  },
  requestApproveButtonDisabled: {
    opacity: 0.7
  },
  requestApproveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  feedbackText: {
    color: '#8eb8ff',
    fontSize: 13,
    lineHeight: 20
  },
  messageBlock: {
    gap: 8
  },
  dayPillWrap: {
    alignItems: 'center',
    marginBottom: 4
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(45, 52, 73, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  dayPillText: {
    color: DM_COLORS.meta,
    fontSize: 11,
    fontWeight: '700'
  },
  messageRow: {
    maxWidth: '84%'
  },
  messageRowIncoming: {
    alignSelf: 'flex-start'
  },
  messageRowOutgoing: {
    alignSelf: 'flex-end'
  },
  messageBubble: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  messageBubbleCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
    borderRadius: 20
  },
  messageBubbleIncomingFrame: {
    borderRadius: 22,
    borderTopLeftRadius: 8,
    padding: 1,
    shadowColor: DM_COLORS.incomingShadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 3
  },
  specialMessageFrame: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0
  },
  specialMessageFrameIncoming: {
    borderTopLeftRadius: 8
  },
  specialMessageFrameOutgoing: {
    borderTopRightRadius: 8
  },
  messageBubbleIncoming: {
    backgroundColor: DM_COLORS.incomingBubble,
    borderRadius: 21,
    borderTopLeftRadius: 7,
    borderWidth: 0
  },
  messageBubbleOutgoing: {
    borderTopRightRadius: 8,
    shadowColor: DM_COLORS.outgoingShadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4
  },
  messageText: {
    fontSize: 15,
    lineHeight: 25
  },
  messageTextIncoming: {
    color: '#e2e8f9',
    fontWeight: '500'
  },
  messageTextOutgoing: {
    color: '#ffffff',
    fontWeight: '500'
  },
  inquiryCard: {
    minWidth: 264,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'transparent'
  },
  inquiryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  inquiryCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: DM_COLORS.accentSoft,
    justifyContent: 'center'
  },
  inquiryCardBadgeText: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  inquiryCardMeta: {
    color: '#98a3bc',
    fontSize: 11,
    fontWeight: '600'
  },
  inquiryCardTitle: {
    color: '#e7edff',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  inquiryCardBody: {
    color: '#b4bfd4',
    fontSize: 13,
    lineHeight: 20
  },
  inquiryAnswerStack: {
    gap: 10
  },
  inquiryAnswerRow: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  inquiryAnswerLabel: {
    color: '#98a3bc',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  inquiryAnswerPrompt: {
    color: '#e7edff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  inquiryAnswerValue: {
    color: '#b4bfd4',
    fontSize: 13,
    lineHeight: 20
  },
  callInvitationCard: {
    minWidth: 228,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'transparent'
  },
  callInvitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  callInvitationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 22,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: DM_COLORS.accentSoft,
    justifyContent: 'center'
  },
  callInvitationBadgeText: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  callInvitationStatusPill: {
    minHeight: 22,
    paddingHorizontal: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  callInvitationStatusPending: {
    backgroundColor: 'rgba(45, 52, 73, 0.94)'
  },
  callInvitationStatusAccepted: {
    backgroundColor: 'rgba(16, 185, 129, 0.20)'
  },
  callInvitationStatusDeclined: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)'
  },
  callInvitationStatusText: {
    color: '#dce5ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase'
  },
  callInvitationTitle: {
    color: '#e7edff',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800'
  },
  callInvitationMeta: {
    color: '#b4bfd4',
    fontSize: 12,
    lineHeight: 18
  },
  callInvitationActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2
  },
  callInvitationGhostButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(45, 52, 73, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  callInvitationGhostButtonText: {
    color: '#e7edff',
    fontSize: 12,
    fontWeight: '700'
  },
  callInvitationPrimaryButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    backgroundColor: DM_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DM_COLORS.outgoingShadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 4
  },
  callInvitationPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  callInvitationButtonDisabled: {
    opacity: 0.72
  },
  messageMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4
  },
  messageMetaRowOutgoing: {
    justifyContent: 'flex-end'
  },
  messageMetaText: {
    color: DM_COLORS.meta,
    fontSize: 11,
    fontWeight: '600'
  },
  composerShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    zIndex: 10
  },
  composerCard: {
    minHeight: 58,
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: DM_COLORS.chrome,
    borderWidth: 1,
    borderColor: DM_COLORS.chromeBorder,
    shadowColor: DM_COLORS.chromeShadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 8
  },
  mediaButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 8,
    color: '#dae2fd',
    fontSize: 15
  },
  composerInputDisabled: {
    color: '#667085'
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DM_COLORS.outgoingShadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 4
  },
  sendButtonPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButtonDisabled: {
    opacity: 0.48
  },
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 8, 20, 0.54)',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 18
  },
  actionSheetCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(17, 27, 46, 0.98)',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    maxHeight: '72%'
  },
  actionSheetHeader: {
    gap: 4,
    marginBottom: 10
  },
  actionSheetTitle: {
    color: '#e7edff',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  actionSheetBody: {
    color: '#b4bfd4',
    fontSize: 13,
    lineHeight: 19
  },
  actionSheetLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10
  },
  actionSheetLoadingText: {
    color: '#b4bfd4',
    fontSize: 13
  },
  actionSheetRow: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(45, 52, 73, 0.88)',
    marginTop: 8
  },
  actionSheetRowDisabled: {
    opacity: 0.5
  },
  actionSheetRowText: {
    color: '#e7edff',
    fontSize: 14,
    fontWeight: '700'
  },
  actionSheetDangerRow: {
    backgroundColor: 'rgba(127, 29, 29, 0.28)'
  },
  actionSheetDangerText: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '700'
  },
  actionSheetList: {
    flexGrow: 0
  },
  programActionRow: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(45, 52, 73, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8
  },
  programActionCopy: {
    flex: 1,
    gap: 3
  },
  programActionTitle: {
    color: '#e7edff',
    fontSize: 14,
    fontWeight: '800'
  },
  programActionMeta: {
    color: '#b4bfd4',
    fontSize: 12,
    lineHeight: 18
  },
  actionSheetEmptyText: {
    color: '#b4bfd4',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10
  },
  actionSheetCancelButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(45, 52, 73, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12
  },
  actionSheetCancelText: {
    color: '#e7edff',
    fontSize: 14,
    fontWeight: '800'
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10
  },
  emptyTitle: {
    color: '#e7edff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  emptyBody: {
    color: '#b4bfd4',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22
  }
});
