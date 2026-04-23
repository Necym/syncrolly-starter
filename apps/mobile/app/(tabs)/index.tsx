import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { theme } from '@syncrolly/config';
import {
  hasCompletedProfile,
  type DirectoryProfile,
  type InboxThreadSummary,
  type InstagramAccountConnection,
  type InstagramLeadSummary,
  type InquiryFormSubmission,
  type UserRole,
  type ViewerProfile
} from '@syncrolly/core';
import {
  createDirectConversation,
  getViewerProfile,
  getInstagramAccountConnection,
  listInboxThreads,
  listInstagramLeads,
  listCreatorInquiryFormSubmissions,
  openInquirySubmissionConversation,
  saveCreatorProfile,
  saveSupporterProfile,
  startInstagramOAuth,
  searchProfiles
} from '@syncrolly/data';
import { usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDefaultDisplayName, getPreferredRole, useMobileSession } from '../../lib/session';

WebBrowser.maybeCompleteAuthSession();

type AuthMode = 'sign-in' | 'sign-up';
type DmAccess = 'free' | 'subscriber_only' | 'paid_only';
type InboxTab = 'all' | 'unread' | 'forms' | 'instagram' | 'other';

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

function matchesSearch(thread: InboxThreadSummary, searchValue: string): boolean {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    thread.participantName.toLowerCase().includes(normalizedSearch) ||
    thread.subject.toLowerCase().includes(normalizedSearch) ||
    thread.preview.toLowerCase().includes(normalizedSearch)
  );
}

function matchesSubmissionSearch(submission: InquiryFormSubmission, searchValue: string): boolean {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    submission.supporterName.toLowerCase().includes(normalizedSearch) ||
    submission.answers.some(
      (answer) =>
        answer.questionPrompt.toLowerCase().includes(normalizedSearch) ||
        answer.answerText.toLowerCase().includes(normalizedSearch)
    )
  );
}

function matchesInstagramLeadSearch(lead: InstagramLeadSummary, searchValue: string): boolean {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    lead.displayName.toLowerCase().includes(normalizedSearch) ||
    (lead.instagramUsername ?? '').toLowerCase().includes(normalizedSearch) ||
    lead.lastMessageText.toLowerCase().includes(normalizedSearch)
  );
}

function getInitials(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'S';
}

function getRequestLabel(viewerRole: UserRole | undefined): string {
  return viewerRole === 'creator' ? 'Message request' : 'Pending approval';
}

export default function InboxScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [pendingFormSubmissions, setPendingFormSubmissions] = useState<InquiryFormSubmission[]>([]);
  const [instagramConnection, setInstagramConnection] = useState<InstagramAccountConnection | null>(null);
  const [instagramLeads, setInstagramLeads] = useState<InstagramLeadSummary[]>([]);
  const [loadingView, setLoadingView] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [inboxTab, setInboxTab] = useState<InboxTab>('all');
  const [connectingInstagram, setConnectingInstagram] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authRole, setAuthRole] = useState<UserRole>('creator');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileRole, setProfileRole] = useState<UserRole>('creator');
  const [profileNiche, setProfileNiche] = useState('');
  const [profileHeadline, setProfileHeadline] = useState('');
  const [profileDmAccess, setProfileDmAccess] = useState<DmAccess>('subscriber_only');
  const [profileSaving, setProfileSaving] = useState(false);

  const [composeVisible, setComposeVisible] = useState(false);
  const [composeSearch, setComposeSearch] = useState('');
  const [composeResults, setComposeResults] = useState<DirectoryProfile[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  const [creatingConversationId, setCreatingConversationId] = useState<string | null>(null);
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);
  const [expandedFormSubmissionIds, setExpandedFormSubmissionIds] = useState<string[]>([]);
  const loadRequestIdRef = useRef(0);
  const threadIdsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allAcceptedThreads = threads.filter((thread) => thread.status !== 'request');
  const unreadAcceptedThreads = allAcceptedThreads.filter((thread) => thread.unread);
  const otherThreads = threads.filter((thread) => thread.status === 'request');
  const visibleAllThreads = allAcceptedThreads.filter((thread) => matchesSearch(thread, searchValue));
  const visibleUnreadThreads = unreadAcceptedThreads.filter((thread) => matchesSearch(thread, searchValue));
  const visiblePendingFormSubmissions = pendingFormSubmissions.filter((submission) =>
    matchesSubmissionSearch(submission, searchValue)
  );
  const visibleInstagramLeads = instagramLeads.filter((lead) => matchesInstagramLeadSearch(lead, searchValue));
  const visibleOtherThreads = otherThreads.filter((thread) => matchesSearch(thread, searchValue));
  const profileComplete = hasCompletedProfile(viewerProfile);

  function scheduleInboxRefresh(delayMs = 120) {
    if (!user) {
      return;
    }

    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      void loadViewerState(user.id);
    }, delayMs);
  }

  async function loadViewerState(currentUserId: string) {
    if (!supabase) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoadingView(true);

    try {
      const nextProfile = await getViewerProfile(supabase, currentUserId);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      let nextThreads: InboxThreadSummary[] = [];
      let nextPendingFormSubmissions: InquiryFormSubmission[] = [];
      let nextInstagramConnection: InstagramAccountConnection | null = null;
      let nextInstagramLeads: InstagramLeadSummary[] = [];
      if (hasCompletedProfile(nextProfile)) {
        const [loadedThreads, loadedPendingFormSubmissions, loadedInstagramConnection, loadedInstagramLeads] =
          await Promise.all([
          listInboxThreads(supabase, currentUserId),
          nextProfile.role === 'creator'
            ? listCreatorInquiryFormSubmissions(supabase, currentUserId, { status: 'pending' })
            : Promise.resolve([] as InquiryFormSubmission[]),
          getInstagramAccountConnection(supabase, currentUserId),
          listInstagramLeads(supabase, currentUserId)
        ]);

        nextThreads = loadedThreads;
        nextPendingFormSubmissions = loadedPendingFormSubmissions;
        nextInstagramConnection = loadedInstagramConnection;
        nextInstagramLeads = loadedInstagramLeads;

        if (loadRequestIdRef.current !== requestId) {
          return;
        }
      }

      setViewerProfile(nextProfile);
      setThreads(nextThreads);
      setPendingFormSubmissions(nextPendingFormSubmissions);
      setInstagramConnection(nextInstagramConnection);
      setInstagramLeads(nextInstagramLeads);
      setFeedback(null);
    } catch (error) {
      if (loadRequestIdRef.current === requestId) {
        setFeedback(getErrorMessage(error));
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoadingView(false);
      }
    }
  }

  useEffect(() => {
    if (!user) {
      threadIdsRef.current = new Set();

      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      loadRequestIdRef.current += 1;
      setLoadingView(false);
      setViewerProfile(null);
      setThreads([]);
      setPendingFormSubmissions([]);
      setInstagramConnection(null);
      setInstagramLeads([]);
      return;
    }

    void loadViewerState(user.id);
  }, [pathname, supabase, user?.id]);

  useEffect(() => {
    threadIdsRef.current = new Set(threads.map((thread) => thread.id));
  }, [threads]);

  useEffect(() => {
    if (!user) {
      setAuthDisplayName('');
      setAuthRole('creator');
      return;
    }

    setAuthDisplayName((current) => current || getDefaultDisplayName(user));
    setAuthRole(getPreferredRole(user));
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setProfileDisplayName('');
      setProfileRole('creator');
      setProfileNiche('');
      setProfileHeadline('');
      setProfileDmAccess('subscriber_only');
      return;
    }

    setProfileDisplayName(viewerProfile?.displayName ?? getDefaultDisplayName(user));
    setProfileRole(viewerProfile?.role ?? getPreferredRole(user));
    setProfileNiche(viewerProfile?.creatorProfile?.niche ?? '');
    setProfileHeadline(viewerProfile?.creatorProfile?.headline ?? '');
    setProfileDmAccess(viewerProfile?.creatorProfile?.dmAccess ?? 'subscriber_only');
  }, [user?.id, viewerProfile]);

  useEffect(() => {
    if (!composeVisible || !supabase || !user) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setComposeLoading(true);

      searchProfiles(supabase, composeSearch)
        .then((results) => {
          setComposeResults(results.filter((profile) => profile.id !== user.id));
        })
        .catch((error) => {
          setFeedback(getErrorMessage(error));
        })
        .finally(() => {
          setComposeLoading(false);
        });
    }, 180);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [composeSearch, composeVisible, supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !profileComplete) {
      return;
    }

    const staleChannelPrefix = 'realtime:inbox-live:';

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic.startsWith(staleChannelPrefix)) {
        void supabase.removeChannel(existingChannel);
      }
    }

    const channel = supabase
      .channel(`inbox-live:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          const nextConversationId =
            typeof payload.new === 'object' &&
            payload.new !== null &&
            'id' in payload.new &&
            typeof (payload.new as { id?: unknown }).id === 'string'
              ? (payload.new as { id: string }).id
              : null;

          if (!nextConversationId || !threadIdsRef.current.has(nextConversationId)) {
            return;
          }

          scheduleInboxRefresh(80);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const nextConversationId =
            typeof payload.new === 'object' &&
            payload.new !== null &&
            'conversation_id' in payload.new &&
            typeof (payload.new as { conversation_id?: unknown }).conversation_id === 'string'
              ? (payload.new as { conversation_id: string }).conversation_id
              : null;

          if (!nextConversationId || !threadIdsRef.current.has(nextConversationId)) {
            return;
          }

          // Message inserts should feel nearly immediate in the inbox queue.
          scheduleInboxRefresh(35);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh(60);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inquiry_form_submissions',
          filter: `creator_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh(60);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_calls',
          filter: `owner_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh(45);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_calls',
          filter: `attendee_profile_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh(45);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instagram_account_connections',
          filter: `creator_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh(45);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instagram_leads',
          filter: `creator_id=eq.${user.id}`
        },
        () => {
          scheduleInboxRefresh(35);
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
  }, [profileComplete, supabase, user?.id]);

  async function handleAuthSubmit() {
    if (!supabase) {
      return;
    }

    if (!email.trim() || !password.trim()) {
      setFeedback('Enter your email and password.');
      return;
    }

    setAuthSubmitting(true);
    setFeedback(null);

    try {
      if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          throw error;
        }
      } else {
        const displayName = authDisplayName.trim() || email.split('@')[0];
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
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
          setPassword('');
          setFeedback('Account created. Check your email to confirm your sign-in.');
        } else {
          setFeedback('Account created. Finish your profile to start messaging.');
        }
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleCompleteProfile() {
    if (!supabase || !user) {
      return;
    }

    const displayName = profileDisplayName.trim();

    if (!displayName) {
      setFeedback('Choose a display name first.');
      return;
    }

    if (profileRole === 'creator' && !profileNiche.trim()) {
      setFeedback('Add your niche so followers know what you do.');
      return;
    }

    setProfileSaving(true);
    setFeedback(null);

    try {
      if (profileRole === 'creator') {
        await saveCreatorProfile(supabase, {
          userId: user.id,
          displayName,
          niche: profileNiche.trim(),
          headline: profileHeadline.trim(),
          dmAccess: profileDmAccess,
          dmIntakePolicy: 'direct_message',
          dmFeeUsd: 25
        });
      } else {
        await saveSupporterProfile(supabase, {
          userId: user.id,
          displayName,
          accessLevel: viewerProfile?.supporterProfile?.accessLevel ?? 'free',
          totalSpend: viewerProfile?.supporterProfile?.totalSpend ?? 0
        });
      }

      await loadViewerState(user.id);
      router.replace('/');
      setFeedback(null);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleStartConversation(profile: DirectoryProfile) {
    if (profile.role === 'creator') {
      openProfile(profile.id);
      return;
    }

    if (!supabase || !user) {
      return;
    }

    setCreatingConversationId(profile.id);
    setFeedback(null);

    try {
      const conversation = await createDirectConversation(supabase, {
        createdBy: user.id,
        counterpartUserId: profile.id,
        subject: 'Direct message'
      });

      setComposeVisible(false);
      setComposeSearch('');
      setComposeResults([]);
      setThreads(await listInboxThreads(supabase, user.id));
      router.push({
        pathname: '/thread/[threadId]',
        params: { threadId: conversation.id }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setCreatingConversationId(null);
    }
  }

  async function handleOpenInquirySubmission(submission: InquiryFormSubmission) {
    if (!supabase || !user) {
      return;
    }

    setOpeningSubmissionId(submission.id);
    setFeedback(null);

    try {
      const conversationId = await openInquirySubmissionConversation(supabase, {
        submissionId: submission.id
      });

      await loadViewerState(user.id);
      setInboxTab('all');
      router.push({
        pathname: '/thread/[threadId]',
        params: { threadId: conversationId }
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setOpeningSubmissionId(null);
    }
  }

  async function handleConnectInstagram() {
    if (!supabase || !user) {
      return;
    }

    setConnectingInstagram(true);
    setFeedback(null);

    try {
      const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
      const redirectUri = isExpoGo
        ? 'browser://instagram-oauth-complete'
        : 'syncrolly://instagram-oauth-complete';
      const connectUrl = await startInstagramOAuth(supabase, {
        redirectUri
      });

      const waitForConnection = async () => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const nextConnection = await getInstagramAccountConnection(supabase, user.id);

          if (nextConnection) {
            await loadViewerState(user.id);
            return true;
          }

          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        await loadViewerState(user.id);
        return false;
      };

      if (isExpoGo) {
        await WebBrowser.openBrowserAsync(connectUrl);
        const connected = await waitForConnection();

        if (connected) {
          setFeedback('Instagram connected.');
          setInboxTab('instagram');
        } else {
          setFeedback(
            'Finish Instagram in Safari, then come back here. The browser will show the final result, and this tab will refresh once the connection saves.'
          );
        }

        return;
      }

      const authResult = await WebBrowser.openAuthSessionAsync(connectUrl, redirectUri);

      if (authResult.type === 'success' && authResult.url) {
        await ExpoLinking.openURL(authResult.url);
        const connected = await waitForConnection();

        if (connected) {
          setFeedback('Instagram connected.');
          setInboxTab('instagram');
        }
        return;
      }

      const connected = await waitForConnection();

      if (connected) {
        setFeedback('Instagram connected.');
        setInboxTab('instagram');
        return;
      }

      if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
        setFeedback('Instagram connect was canceled.');
      } else if (isExpoGo) {
        setFeedback('Instagram connect may finish in the browser while using Expo Go. If it does, reload the app after allowing access.');
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setConnectingInstagram(false);
    }
  }

  function toggleFormSubmissionExpanded(submissionId: string) {
    setExpandedFormSubmissionIds((current) =>
      current.includes(submissionId)
        ? current.filter((id) => id !== submissionId)
        : [...current, submissionId]
    );
  }

  function openThread(threadId: string) {
    router.push({
      pathname: '/thread/[threadId]',
      params: { threadId }
    });
  }

  function openProfile(profileId: string) {
    setComposeVisible(false);
    router.push({
      pathname: '/profile/[profileId]',
      params: { profileId }
    });
  }

  function openInstagramLead(leadId: string) {
    router.push({
      pathname: '/instagram-lead/[leadId]',
      params: { leadId }
    });
  }

  function renderThreadRow(thread: InboxThreadSummary, index: number, totalCount: number) {
    const isLast = index === totalCount - 1;

    return (
      <View
        key={thread.id}
        style={[styles.threadItem, thread.unread ? styles.threadItemUnread : styles.threadItemRead]}
      >
        <Pressable onPress={() => openProfile(thread.participantId)} style={styles.avatarWrap}>
          <View style={styles.avatarFrame}>
            {thread.participantAvatar ? (
              <Image source={{ uri: thread.participantAvatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{thread.participantInitials}</Text>
              </View>
            )}
          </View>

          {thread.unread ? <View style={styles.unreadDot} /> : null}
        </Pressable>

        <Pressable
          onPress={() => openThread(thread.id)}
          style={[styles.threadBody, !thread.unread && !isLast && styles.threadBodyDivider]}
        >
          <View style={styles.threadTopRow}>
            <View style={styles.threadTitleWrap}>
              <Text style={[styles.threadName, thread.unread && styles.threadNameUnread]} numberOfLines={1}>
                {thread.participantName}
              </Text>
              {thread.status === 'request' ? (
                <View style={styles.threadStatusBadge}>
                  <Text style={styles.threadStatusBadgeText}>{getRequestLabel(viewerProfile?.role)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.threadTime, thread.unread && styles.threadTimeUnread]}>{thread.relativeTime}</Text>
          </View>

          <Text
            numberOfLines={1}
            style={[styles.threadPreview, thread.unread ? styles.threadPreviewUnread : styles.threadPreviewRead]}
          >
            {thread.preview}
          </Text>
        </Pressable>
      </View>
    );
  }

  function renderFormsTab() {
    if (!visiblePendingFormSubmissions.length) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>No pending forms</Text>
          <Text style={styles.emptyCardBody}>Form submissions waiting for review will show up here.</Text>
        </View>
      );
    }

    return (
      <View style={styles.threadSection}>
        {visiblePendingFormSubmissions.map((submission) => {
          const isOpening = openingSubmissionId === submission.id;
          const isExpanded = expandedFormSubmissionIds.includes(submission.id);

          return (
            <View key={submission.id} style={styles.formThreadCard}>
              <View style={styles.formThreadHeader}>
                <View style={styles.formThreadIdentity}>
                  <View style={styles.formThreadAvatar}>
                    {submission.supporterAvatarUrl ? (
                      <Image source={{ uri: submission.supporterAvatarUrl }} style={styles.formThreadAvatarImage} />
                    ) : (
                      <Text style={styles.formThreadAvatarText}>{getInitials(submission.supporterName)}</Text>
                    )}
                  </View>

                  <View style={styles.formThreadCopy}>
                    <Text style={styles.formThreadName}>{submission.supporterName}</Text>
                  </View>
                </View>

                <View style={styles.formThreadActions}>
                  <Pressable
                    style={styles.formThreadDisclosure}
                    onPress={() => toggleFormSubmissionExpanded(submission.id)}
                  >
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={theme.colors.onSurfaceVariant}
                    />
                  </Pressable>

                  <Pressable
                    style={[styles.formThreadAction, isOpening && styles.formThreadActionDisabled]}
                    onPress={() => void handleOpenInquirySubmission(submission)}
                    disabled={isOpening}
                  >
                    <LinearGradient colors={theme.gradients.brand} style={styles.formThreadActionGradient}>
                      {isOpening ? (
                        <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                      ) : (
                        <Text style={styles.formThreadActionText}>Reply</Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>

              {isExpanded ? (
                <View style={styles.formThreadAnswers}>
                  {submission.answers.map((answer, index) => (
                    <View key={answer.id} style={styles.formThreadAnswerRow}>
                      <Text style={styles.formThreadAnswerLabel}>Question {index + 1}</Text>
                      <Text style={styles.formThreadAnswerPrompt}>{answer.questionPrompt}</Text>
                      <Text style={styles.formThreadAnswerValue}>{answer.answerText}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  function renderInstagramTab() {
    if (viewerProfile?.role !== 'creator' && !instagramConnection) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>Instagram leads are creator-only</Text>
          <Text style={styles.emptyCardBody}>This lane is reserved for creator accounts that connect Instagram.</Text>
        </View>
      );
    }

    if (!instagramConnection) {
      return (
        <View style={styles.emptyCard}>
          <View style={styles.instagramEmptyIconWrap}>
            <Ionicons name="logo-instagram" size={24} color={theme.colors.accent} />
          </View>
          <Text style={styles.emptyCardTitle}>Connect Instagram</Text>
          <Text style={styles.emptyCardBody}>
            Instagram leads stay separate from your native Syncrolly DMs. Connect your account to start receiving them here.
          </Text>
          <Pressable
              style={[styles.primaryActionButton, connectingInstagram && styles.primaryActionButtonDisabled]}
              onPress={() => void handleConnectInstagram()}
              disabled={connectingInstagram}
            >
              <LinearGradient colors={theme.gradients.brand} style={styles.primaryActionButtonGradient}>
                <Text style={styles.primaryActionButtonText}>
                  {connectingInstagram ? 'Opening Instagram...' : 'Connect Instagram'}
                </Text>
              </LinearGradient>
            </Pressable>
        </View>
      );
    }

    if (!visibleInstagramLeads.length) {
      return (
        <View style={styles.emptyCard}>
          <View style={styles.instagramEmptyTopRow}>
            <View>
              <Text style={styles.emptyCardTitle}>Instagram connected</Text>
              <Text style={styles.emptyCardBody}>
                {instagramConnection.instagramUsername
                  ? `Connected as @${instagramConnection.instagramUsername}.`
                  : 'Your Instagram account is connected.'}
              </Text>
            </View>
            <View style={styles.instagramConnectedBadge}>
              <Text style={styles.instagramConnectedBadgeText}>{instagramConnection.status}</Text>
            </View>
          </View>
          <Text style={styles.emptyCardBody}>New inbound Instagram leads will show up here as soon as Instagram delivers them to the webhook.</Text>
          <Pressable style={styles.secondaryActionButton} onPress={() => void handleConnectInstagram()}>
            <Text style={styles.secondaryActionButtonText}>Reconnect</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.threadSection}>
        {visibleInstagramLeads.map((lead, index) => {
          const isLast = index === visibleInstagramLeads.length - 1;
          const avatarInitials = getInitials(lead.displayName || lead.instagramUsername || 'Instagram');
          const previewText = lead.instagramUsername
            ? `${lead.instagramUsername.startsWith('@') ? lead.instagramUsername : `@${lead.instagramUsername}`} · ${
                lead.lastMessageText || 'New Instagram lead'
              }`
            : lead.lastMessageText || 'New Instagram lead';

          return (
            <Pressable
              key={lead.id}
              onPress={() => openInstagramLead(lead.id)}
              style={[styles.threadItem, lead.unreadCount > 0 ? styles.threadItemUnread : styles.threadItemRead]}
            >
              <View style={styles.avatarWrap}>
                <View style={styles.avatarFrame}>
                  {lead.profilePictureUrl ? (
                    <Image source={{ uri: lead.profilePictureUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{avatarInitials}</Text>
                    </View>
                  )}
                </View>

                {lead.unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
              </View>

              <View style={[styles.threadBody, lead.unreadCount === 0 && !isLast && styles.threadBodyDivider]}>
                <View style={styles.threadTopRow}>
                  <View style={styles.threadTitleWrap}>
                    <Text style={[styles.threadName, lead.unreadCount > 0 && styles.threadNameUnread]} numberOfLines={1}>
                      {lead.displayName}
                    </Text>
                    <View style={styles.threadStatusBadge}>
                      <Text style={styles.threadStatusBadgeText}>{lead.leadStatus}</Text>
                    </View>
                  </View>
                  <Text style={[styles.threadTime, lead.unreadCount > 0 && styles.threadTimeUnread]}>
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric'
                    }).format(new Date(lead.lastMessageAt))}
                  </Text>
                </View>

                <Text
                  numberOfLines={1}
                  style={[styles.threadPreview, lead.unreadCount > 0 ? styles.threadPreviewUnread : styles.threadPreviewRead]}
                >
                  {previewText}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderThreadTab(
    currentThreads: InboxThreadSummary[],
    emptyTitle: string,
    emptyBody: string
  ) {
    if (!currentThreads.length) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyCardBody}>{emptyBody}</Text>
        </View>
      );
    }

    return (
      <View style={styles.threadSection}>
        {currentThreads.map((thread, index) => renderThreadRow(thread, index, currentThreads.length))}
      </View>
    );
  }

  function renderInboxTabContent() {
    switch (inboxTab) {
      case 'unread':
        return renderThreadTab(
          visibleUnreadThreads,
          'No unread messages',
          'Unread accepted conversations and replies will show up here.'
        );
      case 'forms':
        return renderFormsTab();
      case 'instagram':
        return renderInstagramTab();
      case 'other':
        return renderThreadTab(
          visibleOtherThreads,
          'Nothing in other',
          'Requests and other conversation states will show up here.'
        );
      case 'all':
      default:
        return renderThreadTab(
          visibleAllThreads,
          'No conversations yet',
          'Start a new thread and we will save every message to Supabase from here on out.'
        );
    }
  }

  function renderHeader() {
    return null;
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.screen}>
          {renderHeader()}
          <View style={styles.centerStage}>
            <Text style={styles.stageTitle}>Supabase isn&apos;t configured yet</Text>
            <Text style={styles.stageBody}>
              Add the project URL and publishable key in `apps/mobile/.env`, then restart Expo.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingView) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.screen}>
          {renderHeader()}
          <View style={styles.centerStage}>
            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
            <Text style={styles.stageBody}>Syncing your workspace…</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.screen}>
          {renderHeader()}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.authContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.authHero}>
              <Text style={styles.authEyebrow}>Direct access for creator businesses</Text>
              <Text style={styles.authTitle}>Sign in to your inbox</Text>
              <Text style={styles.authBody}>
                Use your creator or supporter account to access real conversations, saved profiles, and the shared
                web/mobile data layer.
              </Text>
            </View>

            <View style={styles.authCard}>
              <View style={styles.authTabs}>
                <Pressable
                  style={[styles.authTab, authMode === 'sign-in' && styles.authTabActive]}
                  onPress={() => setAuthMode('sign-in')}
                >
                  <Text style={[styles.authTabText, authMode === 'sign-in' && styles.authTabTextActive]}>Sign In</Text>
                </Pressable>
                <Pressable
                  style={[styles.authTab, authMode === 'sign-up' && styles.authTabActive]}
                  onPress={() => setAuthMode('sign-up')}
                >
                  <Text style={[styles.authTabText, authMode === 'sign-up' && styles.authTabTextActive]}>Create Account</Text>
                </Pressable>
              </View>

              <LabeledField label="Email">
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                />
              </LabeledField>

              <LabeledField label="Password">
                <TextInput
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                />
              </LabeledField>

              {authMode === 'sign-up' ? (
                <>
                  <LabeledField label="Display name">
                    <TextInput
                      placeholder="Your name or brand"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.textInput}
                      value={authDisplayName}
                      onChangeText={setAuthDisplayName}
                    />
                  </LabeledField>

                  <RolePicker role={authRole} onChange={setAuthRole} />
                </>
              ) : null}

              {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

              <Pressable
                style={[styles.primaryAction, authSubmitting && styles.primaryActionDisabled]}
                onPress={handleAuthSubmit}
                disabled={authSubmitting}
              >
                <LinearGradient colors={theme.gradients.brand} style={styles.primaryActionGradient}>
                  {authSubmitting ? (
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryActionText}>
                      {authMode === 'sign-in' ? 'Sign In' : 'Create Account'}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasCompletedProfile(viewerProfile)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.screen}>
          {renderHeader()}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.authContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.authHero}>
              <Text style={styles.authEyebrow}>Profile setup</Text>
              <Text style={styles.authTitle}>Finish your account</Text>
              <Text style={styles.authBody}>
                Choose how you show up in Syncrolly so the inbox, profile, and new-message search all use real data.
              </Text>
            </View>

            <View style={styles.authCard}>
              <RolePicker role={profileRole} onChange={setProfileRole} />

              <LabeledField label="Display name">
                <TextInput
                  placeholder="Your name or brand"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.textInput}
                  value={profileDisplayName}
                  onChangeText={setProfileDisplayName}
                />
              </LabeledField>

              {profileRole === 'creator' ? (
                <>
                  <LabeledField label="Niche">
                    <TextInput
                      placeholder="Fitness, sales, wellness..."
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.textInput}
                      value={profileNiche}
                      onChangeText={setProfileNiche}
                    />
                  </LabeledField>

                  <LabeledField label="Headline">
                    <TextInput
                      placeholder="Tell people what you help them achieve"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.textInput, styles.multilineInput]}
                      value={profileHeadline}
                      onChangeText={setProfileHeadline}
                      multiline
                    />
                  </LabeledField>

                  <View style={styles.optionGroup}>
                    <Text style={styles.fieldLabel}>Who can message you?</Text>
                    <View style={styles.optionRow}>
                      {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => {
                        const isSelected = profileDmAccess === value;
                        const label = value === 'free' ? 'Everyone' : value === 'subscriber_only' ? 'Subscribers' : 'Paid only';

                        return (
                          <Pressable
                            key={value}
                            style={[styles.optionChip, isSelected && styles.optionChipActive]}
                            onPress={() => setProfileDmAccess(value)}
                          >
                            <Text style={[styles.optionChipText, isSelected && styles.optionChipTextActive]}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.supporterNote}>
                  <Text style={styles.supporterNoteTitle}>Supporter profile</Text>
                  <Text style={styles.supporterNoteBody}>
                    Your access level starts as free by default. We can connect subscriptions and purchases later.
                  </Text>
                </View>
              )}

              {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

              <Pressable
                style={[styles.primaryAction, profileSaving && styles.primaryActionDisabled]}
                onPress={handleCompleteProfile}
                disabled={profileSaving}
              >
                <LinearGradient colors={theme.gradients.brand} style={styles.primaryActionGradient}>
                  {profileSaving ? (
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryActionText}>Save Profile</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        {renderHeader()}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topControlsRow}>
            <View style={[styles.searchWrap, styles.searchWrapFlex]}>
              <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <TextInput
                value={searchValue}
                onChangeText={setSearchValue}
                  placeholder={
                    inboxTab === 'forms'
                      ? 'Search forms...'
                      : inboxTab === 'instagram'
                        ? 'Search Instagram leads...'
                      : inboxTab === 'unread'
                        ? 'Search unread...'
                        : inboxTab === 'other'
                          ? 'Search other...'
                          : 'Search conversations...'
                }
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
              />
            </View>

            <Pressable style={styles.composeIconButton} onPress={() => setComposeVisible(true)}>
              <LinearGradient colors={theme.gradients.brand} style={styles.composeIconButtonGradient}>
                <Ionicons name="create-outline" size={18} color={theme.colors.onPrimary} />
              </LinearGradient>
            </Pressable>
          </View>

            <View style={styles.inboxTabsRow}>
              {([
                { key: 'all' as const, label: 'All' },
                {
                  key: 'unread' as const,
                  label: unreadAcceptedThreads.length ? `Unread (${unreadAcceptedThreads.length})` : 'Unread'
                },
                { key: 'forms' as const, label: 'Forms' },
                {
                  key: 'instagram' as const,
                  label: instagramLeads.length ? `Instagram (${instagramLeads.length})` : 'Instagram'
                },
                { key: 'other' as const, label: 'Other' }
              ]).map((item) => {
                const isActive = inboxTab === item.key;

              return (
                <Pressable key={item.key} style={styles.inboxTabButton} onPress={() => setInboxTab(item.key)}>
                  <Text style={[styles.inboxTabText, isActive && styles.inboxTabTextActive]}>{item.label}</Text>
                  {isActive ? <View style={styles.inboxTabUnderline} /> : null}
                </Pressable>
              );
            })}
          </View>

          {feedback ? <Text style={styles.feedbackInline}>{feedback}</Text> : null}

          <View style={styles.threadList}>{renderInboxTabContent()}</View>
        </ScrollView>

        <Modal visible={composeVisible} transparent animationType="fade" onRequestClose={() => setComposeVisible(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setComposeVisible(false)} />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Message</Text>
                <Pressable style={styles.modalCloseButton} onPress={() => setComposeVisible(false)}>
                  <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
                <TextInput
                  value={composeSearch}
                  onChangeText={setComposeSearch}
                  placeholder="Find a creator or supporter"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.searchInput}
                />
              </View>

              <ScrollView style={styles.modalResults} showsVerticalScrollIndicator={false}>
                {composeLoading ? (
                  <View style={styles.modalState}>
                    <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                  </View>
                ) : composeResults.length ? (
                  composeResults.map((profile) => {
                    const isCreating = creatingConversationId === profile.id;

                    return (
                      <View key={profile.id} style={styles.resultRow}>
                        <Pressable
                          style={styles.resultIdentity}
                          onPress={() => openProfile(profile.id)}
                          disabled={isCreating}
                        >
                        <View style={[styles.resultAvatar, { backgroundColor: `${profile.accentColor}18` }]}>
                          {profile.avatarUrl ? (
                            <Image source={{ uri: profile.avatarUrl }} style={styles.resultAvatarImage} />
                          ) : (
                            <Text style={[styles.resultAvatarText, { color: profile.accentColor }]}>
                              {profile.displayName.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>

                        <View style={styles.resultCopy}>
                          <Text style={styles.resultName}>{profile.displayName}</Text>
                          <Text style={styles.resultMeta}>
                            {profile.role === 'creator' ? 'Creator' : 'Supporter'} · {profile.presence}
                          </Text>
                        </View>

                        </Pressable>

                        <Pressable
                          style={[styles.resultAction, isCreating && styles.resultActionDisabled]}
                          onPress={() => handleStartConversation(profile)}
                          disabled={isCreating}
                        >
                          {isCreating ? (
                            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                          ) : (
                            <Text style={styles.resultActionText}>
                              {profile.role === 'creator' ? 'View' : 'Message'}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.modalState}>
                    <Text style={styles.modalStateText}>Search for another user to start a real conversation.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function LabeledField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function RolePicker({
  role,
  onChange
}: {
  role: UserRole;
  onChange: (role: UserRole) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.fieldLabel}>I am joining as a…</Text>
      <View style={styles.optionRow}>
        {(['creator', 'supporter'] as const).map((value) => {
          const isSelected = role === value;

          return (
            <Pressable
              key={value}
              style={[styles.optionChip, isSelected && styles.optionChipActive]}
              onPress={() => onChange(value)}
            >
              <Text style={[styles.optionChipText, isSelected && styles.optionChipTextActive]}>
                {value === 'creator' ? 'Creator' : 'Supporter'}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  topBar: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: theme.colors.primaryStrong,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryStrong,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 3
  },
  brandMarkSheen: {
    position: 'absolute',
    width: 30,
    height: 16,
    top: -4,
    left: -2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    transform: [{ rotate: '-18deg' }]
  },
  brandMarkDot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#8bd2ff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)'
  },
  brandMarkGlyph: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.75,
    marginTop: -1
  },
  brandName: {
    color: theme.colors.primaryStrong,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.45
  },
  settingsButton: {
    padding: 8,
    borderRadius: 999
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 110
  },
  authContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 18
  },
  authHero: {
    gap: 10,
    paddingTop: 8
  },
  authEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  authTitle: {
    color: theme.colors.textPrimary,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.6
  },
  authBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 23
  },
  authCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 18,
    gap: 16,
    shadowColor: '#101828',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 2
  },
  authTabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 4
  },
  authTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authTabActive: {
    backgroundColor: theme.colors.surfaceContainerLowest
  },
  authTabText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  },
  authTabTextActive: {
    color: theme.colors.primaryStrong
  },
  fieldGroup: {
    gap: 8
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  textInput: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  multilineInput: {
    minHeight: 88,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top'
  },
  optionGroup: {
    gap: 8
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  optionChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d8dcef',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerLowest
  },
  optionChipActive: {
    borderColor: theme.colors.primaryStrong,
    backgroundColor: '#eff4ff'
  },
  optionChipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  optionChipTextActive: {
    color: theme.colors.primaryStrong
  },
  supporterNote: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHigh,
    gap: 6
  },
  supporterNoteTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  supporterNoteBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  feedbackText: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    lineHeight: 20
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: 14,
    overflow: 'hidden'
  },
  primaryActionDisabled: {
    opacity: 0.7
  },
  primaryActionGradient: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 5
  },
  primaryActionText: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12
  },
  stageTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center'
  },
  stageBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  searchWrapFlex: {
    flex: 1
  },
  composeIconButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden'
  },
  composeIconButtonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5
    },
    elevation: 3
  },
  inboxTabsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 20,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineSoft
  },
  inboxTabButton: {
    position: 'relative',
    paddingTop: 2,
    paddingBottom: 12
  },
  inboxTabText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '700'
  },
  inboxTabTextActive: {
    color: theme.colors.primaryStrong
  },
  inboxTabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  searchWrap: {
    height: 44,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: theme.colors.textPrimary,
    fontSize: 14
  },
  feedbackInline: {
    marginTop: 12,
    color: theme.colors.primaryStrong,
    fontSize: 13,
    lineHeight: 20
  },
  threadList: {
    gap: 4,
    marginTop: 18
  },
  threadSection: {
    gap: 4
  },
  threadSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  threadSectionTitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  threadSectionCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: theme.colors.primarySoft
  },
  threadSectionCountText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800'
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 12,
    borderRadius: 12
  },
  threadItemUnread: {
    backgroundColor: theme.colors.surfaceContainerLow
  },
  threadItemRead: {
    backgroundColor: 'transparent'
  },
  avatarWrap: {
    width: 48,
    position: 'relative'
  },
  avatarFrame: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarFallbackText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  unreadDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    right: -3,
    bottom: -2,
    borderRadius: 7,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.surfaceContainerLowest
  },
  threadBody: {
    flex: 1,
    minWidth: 0
  },
  threadBodyDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineSoft,
    paddingBottom: 12
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2
  },
  threadTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  threadName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '500'
  },
  threadNameUnread: {
    fontWeight: '700'
  },
  threadStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft
  },
  threadStatusBadgeText: {
    color: theme.colors.primaryStrong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase'
  },
  threadTime: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '400'
  },
  threadTimeUnread: {
    color: theme.colors.primary,
    fontWeight: '700'
  },
  threadPreview: {
    fontSize: 14,
    lineHeight: 20
  },
  threadPreviewUnread: {
    color: theme.colors.onSurfaceVariant,
    fontWeight: '600'
  },
  threadPreviewRead: {
    color: theme.colors.textSecondary,
    fontWeight: '400'
  },
  formThreadCard: {
    gap: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  formThreadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  formThreadIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  formThreadAvatar: {
    width: 46,
    height: 46,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center'
  },
  formThreadAvatarImage: {
    width: '100%',
    height: '100%'
  },
  formThreadAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  formThreadCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  formThreadName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  formThreadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  formThreadDisclosure: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  formThreadAction: {
    minWidth: 78,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden'
  },
  formThreadActionDisabled: {
    opacity: 0.7
  },
  formThreadActionGradient: {
    minWidth: 78,
    height: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10
  },
  formThreadActionText: {
    color: theme.colors.onPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  formThreadAnswers: {
    gap: 10
  },
  formThreadAnswerRow: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineSoft
  },
  formThreadAnswerLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  formThreadAnswerPrompt: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  formThreadAnswerValue: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  instagramEmptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSoft
  },
  instagramEmptyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  instagramConnectedBadge: {
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  instagramConnectedBadgeText: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize'
  },
  primaryActionButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 12,
    overflow: 'hidden'
  },
  primaryActionButtonDisabled: {
    opacity: 0.7
  },
  primaryActionButtonGradient: {
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12
  },
  primaryActionButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
  secondaryActionButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryActionButtonText: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800'
  },
  instagramLeadCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 12
  },
  instagramLeadCardDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainerLow
  },
  instagramLeadAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  instagramLeadUnreadDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    right: -1,
    top: -1,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    borderWidth: 2,
    borderColor: theme.colors.surfaceContainerLowest
  },
  instagramLeadBody: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  instagramLeadTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10
  },
  instagramLeadTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  instagramLeadName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '500'
  },
  instagramLeadNameUnread: {
    fontWeight: '700'
  },
  instagramLeadStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.accentSoft
  },
  instagramLeadStatusBadgeText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'capitalize'
  },
  instagramLeadMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  instagramLeadMetaText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  instagramLeadUnreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 7,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  instagramLeadUnreadBadgeText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '800'
  },
  emptyCard: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  emptyCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  emptyCardBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    maxHeight: '72%',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalResults: {
    minHeight: 180
  },
  modalState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  modalStateText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center'
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12
  },
  resultIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  resultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultAvatarImage: {
    width: '100%',
    height: '100%'
  },
  resultAvatarText: {
    fontSize: 16,
    fontWeight: '800'
  },
  resultCopy: {
    flex: 1,
    minWidth: 0
  },
  resultName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  resultMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  resultAction: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultActionDisabled: {
    opacity: 0.7
  },
  resultActionText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800'
  }
});

