'use client';

import {
  hasCompletedProfile,
  type ConversationDetail,
  type ConversationMessage,
  type DirectoryProfile,
  type InboxThreadSummary,
  type InstagramAccountConnection,
  type InstagramLeadSummary,
  type InquiryFormSubmission,
  type UserRole,
  type ViewerProfile
} from '@syncrolly/core';
import {
  approveConversationRequest,
  createDirectConversation,
  getConversationDetails,
  getInstagramAccountConnection,
  getPublicProfile,
  getViewerProfile,
  listCreatorInquiryFormSubmissions,
  listInboxThreads,
  listInstagramLeads,
  markConversationRead,
  openInquirySubmissionConversation,
  saveCreatorProfile,
  saveSupporterProfile,
  startInstagramOAuth,
  searchProfiles,
  sendMessage
} from '@syncrolly/data';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { getDefaultDisplayName, getPreferredRole, useWebSession } from '../lib/session';
import { BottomNav, Icon, getErrorMessage } from './ui';

type AuthMode = 'sign-in' | 'sign-up';
type DmAccess = 'free' | 'subscriber_only' | 'paid_only';
type InboxTab = 'all' | 'unread' | 'forms' | 'instagram' | 'other';

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

function getRequestLabel(viewerRole: UserRole | undefined): string {
  return viewerRole === 'creator' ? 'Message request' : 'Pending approval';
}

function getInitials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function formatTimeline(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return 'Recently';
  }
}

function formatSubmissionCardTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return 'Recently';
  }
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageFallback() {
  return (
    <main className="center-stage-page">
      <div className="center-stage">
        <div className="spinner" aria-hidden="true" />
        <p className="stage-body">Loading messages...</p>
      </div>
    </main>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [pendingFormSubmissions, setPendingFormSubmissions] = useState<InquiryFormSubmission[]>([]);
  const [instagramConnection, setInstagramConnection] = useState<InstagramAccountConnection | null>(null);
  const [instagramLeads, setInstagramLeads] = useState<InstagramLeadSummary[]>([]);
  const [loadingView, setLoadingView] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [instagramDebug, setInstagramDebug] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
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

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [selectedParticipantProfile, setSelectedParticipantProfile] = useState<ViewerProfile | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingParticipantProfile, setLoadingParticipantProfile] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(false);
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);
  const [expandedFormSubmissionIds, setExpandedFormSubmissionIds] = useState<string[]>([]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [participantAvatarFailed, setParticipantAvatarFailed] = useState(false);
  const preserveFeedbackRef = useRef(false);

  const loadRequestIdRef = useRef(0);
  const threadIdsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollPanelRef = useRef<HTMLDivElement>(null);
  const pendingAutoScrollRef = useRef(true);

  const profileComplete = hasCompletedProfile(viewerProfile);
  const allAcceptedThreads = threads.filter((thread) => thread.status !== 'request');
  const unreadAcceptedThreads = allAcceptedThreads.filter((thread) => thread.unread);
  const otherThreads = threads.filter((thread) => thread.status === 'request');
  const visibleAllThreads = allAcceptedThreads.filter((thread) => matchesSearch(thread, deferredSearchValue));
  const visibleUnreadThreads = unreadAcceptedThreads.filter((thread) => matchesSearch(thread, deferredSearchValue));
  const visibleOtherThreads = otherThreads.filter((thread) => matchesSearch(thread, deferredSearchValue));
  const visiblePendingFormSubmissions = pendingFormSubmissions.filter((submission) =>
    matchesSubmissionSearch(submission, deferredSearchValue)
  );
  const visibleInstagramLeads = instagramLeads.filter((lead) => matchesInstagramLeadSearch(lead, deferredSearchValue));
  const selectedThread = selectedThreadId ? threads.find((thread) => thread.id === selectedThreadId) ?? null : null;
  const selectedSubmission = selectedSubmissionId
    ? pendingFormSubmissions.find((submission) => submission.id === selectedSubmissionId) ?? null
    : null;
  const activeParticipantId =
    inboxTab === 'forms' ? selectedSubmission?.supporterId ?? null : selectedThread?.participantId ?? null;
  const activeParticipantFallbackName =
    inboxTab === 'forms'
      ? selectedSubmission?.supporterName ?? 'Syncrolly user'
      : selectedConversation?.participantName ?? selectedThread?.participantName ?? 'Conversation';
  const activeParticipantFallbackAvatar =
    inboxTab === 'forms'
      ? selectedSubmission?.supporterAvatarUrl
      : selectedParticipantProfile?.avatarUrl ?? selectedConversation?.participantAvatar ?? selectedThread?.participantAvatar;
  const activeParticipantFallbackRole =
    selectedParticipantProfile?.role === 'creator'
      ? 'Creator'
      : selectedParticipantProfile?.role === 'supporter'
        ? 'Supporter'
        : inboxTab === 'forms'
          ? 'Supporter'
          : '';

  function scheduleInboxRefresh() {
    if (!user) {
      return;
    }

    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      void loadViewerState(user.id);
    }, 180);
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
      let nextFeedback: string | null = null;

      if (hasCompletedProfile(nextProfile)) {
        const [threadsResult, formsResult, instagramConnectionResult, instagramLeadsResult] = await Promise.allSettled([
          listInboxThreads(supabase, currentUserId),
          nextProfile.role === 'creator'
            ? listCreatorInquiryFormSubmissions(supabase, currentUserId, { status: 'pending' })
            : Promise.resolve([] as InquiryFormSubmission[]),
          getInstagramAccountConnection(supabase, currentUserId),
          listInstagramLeads(supabase, currentUserId)
        ]);

        if (threadsResult.status === 'fulfilled') {
          nextThreads = threadsResult.value;
        } else {
          nextFeedback = getErrorMessage(threadsResult.reason);
        }

        if (formsResult.status === 'fulfilled') {
          nextPendingFormSubmissions = formsResult.value;
        } else if (!nextFeedback) {
          nextFeedback = getErrorMessage(formsResult.reason);
        }

        if (instagramConnectionResult.status === 'fulfilled') {
          nextInstagramConnection = instagramConnectionResult.value;
          if (nextInstagramConnection) {
            nextFeedback = nextFeedback;
          }
        } else if (!nextFeedback) {
          nextFeedback = getErrorMessage(instagramConnectionResult.reason);
        }

        if (instagramLeadsResult.status === 'fulfilled') {
          nextInstagramLeads = instagramLeadsResult.value;
        } else if (!nextFeedback) {
          nextFeedback = getErrorMessage(instagramLeadsResult.reason);
        }

        if (loadRequestIdRef.current !== requestId) {
          return;
        }
      }

      setViewerProfile(nextProfile);
      setThreads(nextThreads);
      setPendingFormSubmissions(nextPendingFormSubmissions);
      setInstagramConnection(nextInstagramConnection);
      setInstagramLeads(nextInstagramLeads);
      setInstagramDebug(
        nextInstagramConnection
          ? `loadViewerState: connected as ${nextInstagramConnection.instagramUsername ?? nextInstagramConnection.instagramUserId}`
          : 'loadViewerState: no instagram connection row returned'
      );
      if (!preserveFeedbackRef.current) {
        setFeedback(nextFeedback);
      }
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

  async function loadSelectedConversation(threadId: string, options?: { showLoader?: boolean }) {
    if (!supabase || !user) {
      return;
    }

    const showLoader = options?.showLoader ?? (selectedConversation == null || selectedConversation.id !== threadId);

    if (showLoader) {
      setLoadingConversation(true);
    }

    try {
      const nextConversation = await getConversationDetails(supabase, threadId, user.id);
      setSelectedConversation(nextConversation);
      setFeedback(null);
      pendingAutoScrollRef.current = true;

      const lastMessage = nextConversation?.messages[nextConversation.messages.length - 1];

      if (lastMessage) {
        await markConversationRead(supabase, {
          conversationId: threadId,
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

  useEffect(() => {
    if (!user) {
      threadIdsRef.current = new Set();

      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      if (conversationRefreshTimeoutRef.current) {
        clearTimeout(conversationRefreshTimeoutRef.current);
        conversationRefreshTimeoutRef.current = null;
      }

      loadRequestIdRef.current += 1;
      setLoadingView(false);
      setViewerProfile(null);
      setThreads([]);
      setPendingFormSubmissions([]);
      setInstagramConnection(null);
      setInstagramLeads([]);
      setSelectedConversation(null);
      setSelectedParticipantProfile(null);
      return;
    }

    void loadViewerState(user.id);
  }, [supabase, user?.id]);

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

    const staleChannelPrefix = 'realtime:web-inbox-live:';

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic.startsWith(staleChannelPrefix)) {
        void supabase.removeChannel(existingChannel);
      }
    }

    const scheduleConversationRefresh = () => {
      if (!selectedThreadId) {
        return;
      }

      if (conversationRefreshTimeoutRef.current) {
        clearTimeout(conversationRefreshTimeoutRef.current);
      }

      conversationRefreshTimeoutRef.current = setTimeout(() => {
        conversationRefreshTimeoutRef.current = null;
        void loadSelectedConversation(selectedThreadId, { showLoader: false });
      }, 140);
    };

    const channel = supabase
      .channel(`web-inbox-live:${user.id}:${Date.now()}`)
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

          scheduleInboxRefresh();

          if (nextConversationId === selectedThreadId) {
            scheduleConversationRefresh();
          }
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

          scheduleInboxRefresh();

          if (nextConversationId === selectedThreadId) {
            scheduleConversationRefresh();
          }
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
          scheduleInboxRefresh();
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
          scheduleInboxRefresh();
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
          scheduleInboxRefresh();
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
          scheduleInboxRefresh();
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      if (conversationRefreshTimeoutRef.current) {
        clearTimeout(conversationRefreshTimeoutRef.current);
        conversationRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [profileComplete, selectedThreadId, supabase, user?.id]);

  useEffect(() => {
    const nextInboxTab = searchParams.get('inboxTab');
    const status = searchParams.get('status');
    const message = searchParams.get('message');
    const instagramUsername = searchParams.get('instagramUsername');

    if (nextInboxTab === 'instagram') {
      setInboxTab('instagram');
    }

    if (!status) {
      return;
    }

    if (status === 'success') {
      preserveFeedbackRef.current = true;
      setFeedback(
        instagramUsername
          ? `Instagram connected as @${instagramUsername}.`
          : 'Instagram connected.'
      );
      setInboxTab('instagram');
    } else {
      preserveFeedbackRef.current = true;
      setFeedback(message || 'Instagram connect failed.');
      setInboxTab('instagram');
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('status');
    nextParams.delete('message');
    nextParams.delete('instagramUsername');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/?${nextQuery}` : '/');
  }, [router, searchParams]);

  useEffect(() => {
    if (inboxTab === 'forms') {
      setSelectedConversation(null);
      setDraft('');

      if (!visiblePendingFormSubmissions.length) {
        if (selectedSubmissionId !== null) {
          setSelectedSubmissionId(null);
        }
        return;
      }

      if (!selectedSubmissionId || !visiblePendingFormSubmissions.some((submission) => submission.id === selectedSubmissionId)) {
        setSelectedSubmissionId(visiblePendingFormSubmissions[0].id);
      }

      return;
    }

    if (inboxTab === 'instagram') {
      if (selectedThreadId !== null) {
        setSelectedThreadId(null);
      }
      setSelectedConversation(null);
      setDraft('');
      return;
    }

    const nextThreads =
      inboxTab === 'unread' ? visibleUnreadThreads : inboxTab === 'other' ? visibleOtherThreads : visibleAllThreads;

    if (!nextThreads.length) {
      if (selectedThreadId !== null) {
        setSelectedThreadId(null);
      }
      setSelectedConversation(null);
      setDraft('');
      return;
    }

    if (!selectedThreadId || !nextThreads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(nextThreads[0].id);
    }
  }, [
    inboxTab,
    selectedSubmissionId,
    selectedThreadId,
    visibleAllThreads,
    visibleOtherThreads,
    visiblePendingFormSubmissions,
    visibleUnreadThreads
  ]);

  useEffect(() => {
    if (!selectedThreadId || inboxTab === 'forms' || inboxTab === 'instagram') {
      return;
    }

    void loadSelectedConversation(selectedThreadId, { showLoader: true });
  }, [inboxTab, selectedThreadId, supabase, user?.id]);

  useEffect(() => {
    if (!activeParticipantId || !supabase) {
      setSelectedParticipantProfile(null);
      return;
    }

    let cancelled = false;
    setLoadingParticipantProfile(true);

    getPublicProfile(supabase, activeParticipantId)
      .then((profile) => {
        if (!cancelled) {
          setSelectedParticipantProfile(profile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedParticipantProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingParticipantProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeParticipantId, supabase]);

  useEffect(() => {
    if (!supabase || !user || inboxTab !== 'instagram' || instagramConnection) {
      return;
    }

    let cancelled = false;
    setInstagramDebug(`direct tab query starting for creator_id ${user.id}`);

    supabase
      .from('instagram_account_connections')
      .select(
        'id, creator_id, instagram_user_id, instagram_username, instagram_profile_picture_url, status, last_synced_at, created_at, updated_at'
      )
      .eq('creator_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) {
          return;
        }

        if (error) {
          setInstagramDebug(`direct tab query error: ${error.message}`);
          setFeedback(error.message);
          return;
        }

        if (!data) {
          setInstagramDebug(`direct tab query returned null for creator_id ${user.id}`);
          return;
        }

        setInstagramDebug(`direct tab query found row ${data.id} for creator_id ${data.creator_id}`);
        setInstagramConnection({
          id: data.id,
          creatorId: data.creator_id,
          instagramUserId: data.instagram_user_id,
          instagramUsername: data.instagram_username ?? undefined,
          instagramProfilePictureUrl: data.instagram_profile_picture_url ?? undefined,
          status: data.status,
          lastSyncedAt: data.last_synced_at ?? undefined,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        });
      });

    return () => {
      cancelled = true;
    };
  }, [inboxTab, instagramConnection, supabase, user]);

  useEffect(() => {
    setAvatarFailed(false);
    setParticipantAvatarFailed(false);
  }, [selectedConversation?.participantAvatar, activeParticipantFallbackAvatar, activeParticipantId]);

  useEffect(() => {
    if (!pendingAutoScrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      scrollPanelRef.current?.scrollTo({
        top: scrollPanelRef.current.scrollHeight,
        behavior: 'auto'
      });
      pendingAutoScrollRef.current = false;
    });
  }, [selectedConversation?.messages]);

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

  function handleWelcomeAuth(nextMode: AuthMode) {
    setAuthMode(nextMode);
    window.requestAnimationFrame(() => {
      document.getElementById('welcome-auth')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    });
  }

  function renderWelcomeAuthCard() {
    return (
      <section className="auth-card welcome-auth-card">
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`auth-tab${authMode === 'sign-in' ? ' active' : ''}`}
            onClick={() => setAuthMode('sign-in')}
          >
            <span className={`auth-tab-text${authMode === 'sign-in' ? ' active' : ''}`}>Sign In</span>
          </button>
          <button
            type="button"
            className={`auth-tab${authMode === 'sign-up' ? ' active' : ''}`}
            onClick={() => setAuthMode('sign-up')}
          >
            <span className={`auth-tab-text${authMode === 'sign-up' ? ' active' : ''}`}>Create Account</span>
          </button>
        </div>

        <LabeledField label="Email">
          <input
            className="text-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </LabeledField>

        <LabeledField label="Password">
          <input
            className="text-input"
            type="password"
            autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
          />
        </LabeledField>

        {authMode === 'sign-up' ? (
          <>
            <LabeledField label="Display name">
              <input
                className="text-input"
                type="text"
                value={authDisplayName}
                onChange={(event) => setAuthDisplayName(event.target.value)}
                placeholder="Your name or brand"
              />
            </LabeledField>

            <RolePicker role={authRole} onChange={setAuthRole} />
          </>
        ) : null}

        {feedback ? <p className="feedback-text">{feedback}</p> : null}

        <button type="button" className="primary-action" onClick={handleAuthSubmit} disabled={authSubmitting}>
          {authSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
          <span>{authMode === 'sign-in' ? 'Sign In' : 'Create Account'}</span>
        </button>
      </section>
    );
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
      setComposeVisible(false);
      setComposeSearch('');
      setComposeResults([]);
      router.push(`/profile/${profile.id}`);
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
      await loadViewerState(user.id);
      setInboxTab('all');
      setSelectedThreadId(conversation.id);
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
      setSelectedThreadId(conversationId);
      setSelectedSubmissionId(null);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setOpeningSubmissionId(null);
    }
  }

  async function handleConnectInstagram() {
    if (!supabase || !user || typeof window === 'undefined') {
      return;
    }

    setConnectingInstagram(true);
    setFeedback(null);

    try {
      const redirectUrl = new URL(window.location.origin + window.location.pathname);
      redirectUrl.searchParams.set('inboxTab', 'instagram');

      const connectUrl = await startInstagramOAuth(supabase, {
        redirectUri: redirectUrl.toString()
      });

      window.location.assign(connectUrl);
    } catch (error) {
      setFeedback(getErrorMessage(error));
      setConnectingInstagram(false);
    }
  }

  async function handleApproveRequest() {
    if (!supabase || !selectedConversation?.canApproveRequest) {
      return;
    }

    setApprovingRequest(true);
    setFeedback(null);

    try {
      await approveConversationRequest(supabase, {
        conversationId: selectedConversation.id
      });

      await Promise.all([
        loadViewerState(user!.id),
        loadSelectedConversation(selectedConversation.id, { showLoader: false })
      ]);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setApprovingRequest(false);
    }
  }

  async function handleSend() {
    if (!supabase || !user || !selectedConversation) {
      return;
    }

    const nextText = draft.trim();

    if (!nextText || !selectedConversation.canSendMessage) {
      return;
    }

    setSending(true);
    setFeedback(null);
    pendingAutoScrollRef.current = true;

    try {
      if (selectedConversation.canApproveRequest) {
        await approveConversationRequest(supabase, {
          conversationId: selectedConversation.id
        });
      }

      await sendMessage(supabase, {
        conversationId: selectedConversation.id,
        senderId: user.id,
        body: nextText
      });

      setDraft('');
      await Promise.all([
        loadViewerState(user.id),
        loadSelectedConversation(selectedConversation.id, { showLoader: false })
      ]);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  function toggleFormSubmissionExpanded(submissionId: string) {
    setExpandedFormSubmissionIds((current) =>
      current.includes(submissionId)
        ? current.filter((id) => id !== submissionId)
        : [...current, submissionId]
    );
  }

  function renderSyncrollyWordmark() {
    return (
      <span className="desktop-app-brand-content">
        <span className="welcome-brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>Syncrolly</span>
      </span>
    );
  }

  function renderHeader(wide = false) {
    const navItems = [
      { label: 'Messages', active: true, onClick: () => router.push('/') },
      { label: 'Feed', active: false, onClick: () => router.push('/') },
      {
        label: 'Profile',
        active: false,
        onClick: () => router.push(viewerProfile?.id ? `/profile/${viewerProfile.id}` : '/settings/profile')
      },
      { label: 'Settings', active: false, onClick: () => router.push('/settings') },
      { label: 'Calendar', active: false, onClick: () => router.push('/') }
    ];

    return (
      <header className="shell-header">
        <div className={`shell-header-inner${wide ? ' shell-header-inner-wide' : ''}`}>
          <button type="button" className="desktop-app-brand" onClick={() => router.push('/')} aria-label="Syncrolly home">
            {renderSyncrollyWordmark()}
          </button>

          {wide ? (
            <nav className="desktop-header-nav" aria-label="Primary">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`desktop-header-link${item.active ? ' active' : ''}`}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          ) : null}

          <div className="shell-header-actions">
            {wide ? (
              <div className="desktop-header-utility">
                <button className="desktop-header-icon-button" type="button" aria-label="Notifications">
                  <Icon name="notifications" />
                </button>
              </div>
            ) : null}

            {!wide ? (
              <button className="settings-button" type="button" aria-label="Notifications">
                <Icon name="notifications" />
              </button>
            ) : null}

            {!wide ? (
              <button
                className="settings-button"
                type="button"
                aria-label="Settings"
                onClick={() => {
                  if (user) {
                    router.push('/settings');
                  }
                }}
              >
                <Icon name="settings" />
              </button>
            ) : null}

            {wide && viewerProfile ? (
              <button
                type="button"
                className="desktop-header-profile-button"
                aria-label="Open account settings"
                onClick={() => router.push('/settings')}
              >
                <div className="desktop-header-avatar-frame">
                  {viewerProfile.avatarUrl ? (
                    <img src={viewerProfile.avatarUrl} alt={viewerProfile.displayName} className="desktop-header-avatar" />
                  ) : (
                    <span className="desktop-header-avatar-text">{viewerProfile.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </button>
            ) : null}
          </div>
        </div>
      </header>
    );
  }

  function renderListThread(thread: InboxThreadSummary) {
    const isSelected = inboxTab !== 'forms' && selectedThreadId === thread.id;

    return (
      <button
        key={thread.id}
        type="button"
        className={`desktop-thread-row${thread.unread ? ' unread' : ''}${isSelected ? ' selected' : ''}`}
        onClick={() => {
          setSelectedThreadId(thread.id);
          pendingAutoScrollRef.current = true;
        }}
      >
        <div className="desktop-thread-avatar-wrap">
          <div className="desktop-thread-avatar-frame">
            {thread.participantAvatar ? (
              <img src={thread.participantAvatar} alt={thread.participantName} className="desktop-thread-avatar" />
            ) : (
              <div className="desktop-thread-avatar-fallback">
                <span>{thread.participantInitials}</span>
              </div>
            )}
          </div>
          {thread.unread ? <span className="desktop-thread-dot" /> : null}
        </div>

        <div className="desktop-thread-copy">
          <div className="desktop-thread-top">
            <div className="desktop-thread-title-wrap">
              <h2 className={`desktop-thread-name${thread.unread ? ' unread' : ''}`}>{thread.participantName}</h2>
              {thread.status === 'request' ? (
                <span className="desktop-thread-status">{getRequestLabel(viewerProfile?.role)}</span>
              ) : null}
            </div>
            <span className={`desktop-thread-time${thread.unread ? ' unread' : ''}`}>{thread.relativeTime}</span>
          </div>

          <p className={`desktop-thread-preview${thread.unread ? ' unread' : ''}`}>{thread.preview}</p>
        </div>
      </button>
    );
  }

  function renderListSubmission(submission: InquiryFormSubmission) {
    const isSelected = inboxTab === 'forms' && selectedSubmissionId === submission.id;
    const isExpanded = expandedFormSubmissionIds.includes(submission.id);

    return (
      <div key={submission.id} className={`desktop-form-row${isSelected ? ' selected' : ''}`}>
        <button
          type="button"
          className="desktop-form-row-main"
          onClick={() => setSelectedSubmissionId(submission.id)}
        >
          <div className="desktop-thread-avatar-wrap">
            <div className="desktop-thread-avatar-frame">
              {submission.supporterAvatarUrl ? (
                <img src={submission.supporterAvatarUrl} alt={submission.supporterName} className="desktop-thread-avatar" />
              ) : (
                <div className="desktop-thread-avatar-fallback">
                  <span>{getInitials(submission.supporterName)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="desktop-thread-copy">
            <div className="desktop-thread-top">
              <div className="desktop-thread-title-wrap">
                <h2 className="desktop-thread-name">{submission.supporterName}</h2>
              </div>
              <span className="desktop-thread-time">{formatTimeline(submission.createdAt)}</span>
            </div>

            <p className="desktop-thread-preview">
              {submission.answers[0]?.answerText ?? 'Inquiry form submission'}
            </p>
          </div>
        </button>

        <button
          type="button"
          className="desktop-form-disclosure"
          onClick={() => toggleFormSubmissionExpanded(submission.id)}
          aria-label={isExpanded ? 'Collapse answers' : 'Expand answers'}
        >
          <Icon name="more" />
        </button>

        {isExpanded ? (
          <div className="desktop-form-inline-preview">
            {submission.answers.slice(0, 2).map((answer, index) => (
              <div key={`${submission.id}-${index}`} className="desktop-form-inline-answer">
                <span className="desktop-form-inline-label">Q{index + 1}</span>
                <p>{answer.answerText}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderInstagramLead(lead: InstagramLeadSummary) {
    return (
      <div key={lead.id} className="desktop-instagram-row">
        <div className="desktop-instagram-avatar">
          {lead.profilePictureUrl ? (
            <img src={lead.profilePictureUrl} alt={lead.displayName} className="desktop-instagram-avatar-image" />
          ) : (
            <span className="desktop-instagram-avatar-text">{getInitials(lead.displayName)}</span>
          )}
          {lead.unreadCount ? <span className="desktop-instagram-dot" /> : null}
        </div>

        <div className="desktop-instagram-copy">
          <div className="desktop-instagram-top">
            <div className="desktop-instagram-title-wrap">
              <h2 className={`desktop-instagram-name${lead.unreadCount ? ' unread' : ''}`}>{lead.displayName}</h2>
              <span className="desktop-instagram-status">{lead.leadStatus}</span>
            </div>
            <span className="desktop-instagram-time">{formatTimeline(lead.lastMessageAt)}</span>
          </div>

          <p className={`desktop-instagram-preview${lead.unreadCount ? ' unread' : ''}`}>{lead.lastMessageText}</p>

          <div className="desktop-instagram-meta">
            <span>{lead.instagramUsername ? `@${lead.instagramUsername}` : 'Instagram lead'}</span>
            {lead.unreadCount ? <span className="desktop-instagram-unread">{lead.unreadCount}</span> : null}
          </div>
        </div>
      </div>
    );
  }

  function renderInboxList() {
    if (inboxTab === 'forms') {
      if (!visiblePendingFormSubmissions.length) {
        return (
          <div className="desktop-sidebar-empty">
            <h2>No forms yet</h2>
            <p>Pending inquiry submissions will show up here when supporters send them.</p>
          </div>
        );
      }

      return visiblePendingFormSubmissions.map(renderListSubmission);
    }

    if (inboxTab === 'instagram') {
      if (!instagramConnection) {
        return (
          <div className="desktop-sidebar-empty desktop-instagram-empty">
            <h2>Connect Instagram</h2>
            <p>Finish Instagram business login here in the browser, then new leads will land in this lane.</p>
            <button
              type="button"
              className="desktop-instagram-connect"
              onClick={() => void handleConnectInstagram()}
              disabled={connectingInstagram}
            >
              {connectingInstagram ? 'Opening Instagram...' : 'Connect Instagram'}
            </button>
            {instagramDebug ? <p className="desktop-instagram-debug">{instagramDebug}</p> : null}
          </div>
        );
      }

      if (!visibleInstagramLeads.length) {
        return (
          <div className="desktop-sidebar-empty desktop-instagram-empty">
            <h2>Instagram connected</h2>
            <p>
              {instagramConnection.instagramUsername
                ? `Connected as @${instagramConnection.instagramUsername}.`
                : 'Your Instagram account is connected.'}
            </p>
            <button
              type="button"
              className="desktop-instagram-secondary"
              onClick={() => void handleConnectInstagram()}
              disabled={connectingInstagram}
            >
              {connectingInstagram ? 'Opening Instagram...' : 'Reconnect'}
            </button>
          </div>
        );
      }

      return visibleInstagramLeads.map(renderInstagramLead);
    }

    const activeThreads =
      inboxTab === 'unread' ? visibleUnreadThreads : inboxTab === 'other' ? visibleOtherThreads : visibleAllThreads;

    if (!activeThreads.length) {
      const body =
        inboxTab === 'unread'
          ? 'Unread accepted conversations will show up here.'
          : inboxTab === 'other'
            ? 'Request threads and future special states will live here.'
            : 'Start a new thread and it will appear here.';

      return (
        <div className="desktop-sidebar-empty">
          <h2>Nothing here yet</h2>
          <p>{body}</p>
        </div>
      );
    }

    return activeThreads.map(renderListThread);
  }

  function renderInquirySubmissionMessage(message: ConversationMessage) {
    if (message.kind !== 'inquiry_submission' || !message.inquirySubmissionCard) {
      return (
        <p className={`message-text ${message.isFromCreator ? 'outgoing' : 'incoming'}`}>{message.text}</p>
      );
    }

    return (
      <div className="web-inquiry-card">
        <div className="web-inquiry-card-header">
          <span className="web-inquiry-card-badge">Form intake</span>
          <span className="web-inquiry-card-meta">{formatSubmissionCardTime(message.inquirySubmissionCard.submittedAt)}</span>
        </div>

        <h3 className="web-inquiry-card-title">{message.inquirySubmissionCard.formTitle}</h3>
        <p className="web-inquiry-card-body">{message.inquirySubmissionCard.supporterName} answered your inquiry form.</p>

        <div className="web-inquiry-answer-stack">
          {message.inquirySubmissionCard.answers.map((answer, index) => (
            <div key={`${message.id}-${index}`} className="web-inquiry-answer-row">
              <span className="web-inquiry-answer-label">Question {index + 1}</span>
              <p className="web-inquiry-answer-prompt">{answer.questionPrompt}</p>
              <p className="web-inquiry-answer-value">{answer.answerText}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderConversationPanel() {
    if (inboxTab === 'forms') {
      if (!selectedSubmission) {
        return (
          <section className="desktop-message-panel empty">
            <div className="desktop-message-empty">
              <h2>Select a form submission</h2>
              <p>Pick a pending form on the left to review it and decide whether to reply in DM.</p>
            </div>
          </section>
        );
      }

      const isOpening = openingSubmissionId === selectedSubmission.id;

      return (
        <section className="desktop-message-panel">
          <header className="desktop-conversation-header">
            <div className="desktop-conversation-title-group">
              <h2 className="desktop-conversation-title">{selectedSubmission.supporterName}</h2>
              <span className="desktop-conversation-pill">Pending form</span>
            </div>
            <span className="desktop-conversation-subtitle">{formatTimeline(selectedSubmission.createdAt)}</span>
          </header>

          <div className="desktop-form-review-body">
            <div className="desktop-form-review-card">
              <div className="desktop-form-review-kicker">Inquiry intake</div>
              <h3 className="desktop-form-review-title">Submission answers</h3>
              <p className="desktop-form-review-body-copy">
                Review the supporter&apos;s responses, then open a DM thread to continue the conversation.
              </p>

              <div className="desktop-form-review-answers">
                {selectedSubmission.answers.map((answer, index) => (
                  <div key={answer.id} className="desktop-form-review-answer">
                    <span className="desktop-form-review-label">Question {index + 1}</span>
                    <p className="desktop-form-review-prompt">{answer.questionPrompt}</p>
                    <p className="desktop-form-review-value">{answer.answerText}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="desktop-form-review-actions">
              <button
                type="button"
                className="compose-button desktop-primary-button"
                onClick={() => void handleOpenInquirySubmission(selectedSubmission)}
                disabled={isOpening}
              >
                {isOpening ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="send" />}
                <span>{isOpening ? 'Opening...' : 'Reply in DM'}</span>
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (inboxTab === 'instagram') {
      return (
        <section className="desktop-message-panel">
          <header className="desktop-conversation-header">
            <div className="desktop-conversation-title-group">
              <h2 className="desktop-conversation-title">Instagram Leads</h2>
              <span className="desktop-conversation-pill">
                {instagramConnection ? 'Connected' : 'Browser flow'}
              </span>
            </div>
          </header>

          <div className="desktop-form-review-body">
            <div className="desktop-form-review-card">
              <div className="desktop-form-review-kicker">Instagram lane</div>
              <h3 className="desktop-form-review-title">
                {instagramConnection ? 'Connection is live' : 'Connect inside the browser'}
              </h3>
              <p className="desktop-form-review-body-copy">
                {instagramConnection
                  ? 'This flow now runs completely in the browser. Once Instagram approves the connection, this lane will refresh and future DMs will land here without going through your native inbox.'
                  : 'Use the Connect Instagram button on the left. The OAuth flow will stay in the browser, return here, and then Syncrolly will read the saved connection from Supabase.'}
              </p>
              {instagramDebug ? <p className="desktop-instagram-debug">{instagramDebug}</p> : null}

              <div className="desktop-instagram-summary-grid">
                <div className="desktop-instagram-summary-card">
                  <span className="desktop-instagram-summary-label">Connection</span>
                  <strong className="desktop-instagram-summary-value">
                    {instagramConnection ? 'Active' : 'Not connected'}
                  </strong>
                </div>
                <div className="desktop-instagram-summary-card">
                  <span className="desktop-instagram-summary-label">Leads</span>
                  <strong className="desktop-instagram-summary-value">{instagramLeads.length}</strong>
                </div>
                <div className="desktop-instagram-summary-card">
                  <span className="desktop-instagram-summary-label">Unread</span>
                  <strong className="desktop-instagram-summary-value">
                    {instagramLeads.reduce((sum, lead) => sum + lead.unreadCount, 0)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (loadingConversation && !selectedConversation) {
      return (
        <section className="desktop-message-panel empty">
          <div className="center-stage compact">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading conversation...</p>
          </div>
        </section>
      );
    }

    if (!selectedConversation) {
      return (
        <section className="desktop-message-panel empty">
          <div className="desktop-message-empty">
            <h2>Select a conversation</h2>
            <p>Choose a thread from the left to read messages and reply here.</p>
          </div>
        </section>
      );
    }

    const requestBannerTitle = selectedConversation.canApproveRequest
      ? 'Message request'
      : selectedConversation.canSendMessage
        ? 'Send your first request'
        : 'Pending approval';
    const requestBannerBody = selectedConversation.canApproveRequest
      ? 'Approve this request to move the conversation into the active inbox, or reply to approve it automatically.'
      : selectedConversation.canSendMessage
        ? 'This creator gates access. Your first message will be sent as a request for approval.'
        : 'Your request has been sent. You can send more messages after the creator approves the conversation.';
    const composerPlaceholder = !selectedConversation.canSendMessage
      ? 'Waiting for creator approval...'
      : selectedConversation.status === 'request'
        ? 'Send your request...'
        : 'Write a message...';
    const conversationAvatar = selectedParticipantProfile?.avatarUrl ?? selectedConversation.participantAvatar;
    const conversationRole =
      selectedParticipantProfile?.role === 'creator'
        ? selectedParticipantProfile.creatorProfile?.headline || selectedParticipantProfile.creatorProfile?.niche || 'Creator'
        : selectedParticipantProfile?.role === 'supporter'
          ? 'Supporter'
          : 'Direct thread';

    return (
      <section className="desktop-message-panel">
        <header className="desktop-conversation-header">
          <div className="desktop-conversation-identity">
            <div className="desktop-conversation-avatar-frame">
              {conversationAvatar ? (
                <img src={conversationAvatar} alt={selectedConversation.participantName} className="desktop-conversation-avatar" />
              ) : (
                <span>{getInitials(selectedConversation.participantName)}</span>
              )}
            </div>

            <div className="desktop-conversation-title-group">
              <div className="desktop-conversation-name-row">
                <h2 className="desktop-conversation-title">{selectedConversation.participantName}</h2>
                <span className="desktop-conversation-pill">
                  {selectedConversation.status === 'request' ? selectedConversation.statusLabel : conversationRole}
                </span>
              </div>
              <span className="desktop-conversation-subtitle">
                {selectedParticipantProfile?.role === 'creator'
                  ? selectedParticipantProfile.creatorProfile?.niche || 'Creator workspace'
                  : 'Syncrolly conversation'}
              </span>
            </div>
          </div>

          <div className="desktop-conversation-actions">
            <button type="button" className="icon-button subtle" aria-label="Start video call">
              <Icon name="camera" />
            </button>
            <button type="button" className="icon-button subtle" aria-label="Search conversation">
              <Icon name="search" />
            </button>
            <button type="button" className="icon-button subtle" aria-label="Conversation options">
              <Icon name="more" />
            </button>
          </div>
        </header>

        <div ref={scrollPanelRef} className="desktop-message-scroll">
          <div className="desktop-message-stack">
            {selectedConversation.status === 'request' ? (
              <div className="request-banner">
                <div className="request-banner-header">
                  <span className="request-badge">{selectedConversation.statusLabel}</span>
                  {selectedConversation.canApproveRequest ? (
                    <button
                      type="button"
                      className="request-approve-button"
                      onClick={() => void handleApproveRequest()}
                      disabled={approvingRequest}
                    >
                      {approvingRequest ? <span className="button-spinner" aria-hidden="true" /> : 'Approve'}
                    </button>
                  ) : null}
                </div>

                <h2 className="request-banner-title">{requestBannerTitle}</h2>
                <p className="request-banner-body">{requestBannerBody}</p>
              </div>
            ) : null}

            {feedback ? <p className="feedback-inline">{feedback}</p> : null}

            {selectedConversation.messages.map((message) => (
              <div key={message.id} className="message-block">
                {message.dayLabel ? (
                  <div className="day-pill-wrap">
                    <div className="day-pill">
                      <span className="day-pill-text">{message.dayLabel.toUpperCase()}</span>
                    </div>
                  </div>
                ) : null}

                <div className={`message-row ${message.isFromCreator ? 'outgoing' : 'incoming'}`}>
                  <div
                    className={`message-bubble ${message.isFromCreator ? 'outgoing' : 'incoming'}${
                      message.kind === 'inquiry_submission' ? ' inquiry' : ''
                    }`}
                  >
                    {renderInquirySubmissionMessage(message)}
                  </div>

                  <div className={`message-meta-row ${message.isFromCreator ? 'outgoing' : ''}`}>
                    <span className="message-meta-text">{message.timeLabel}</span>
                    {message.isFromCreator ? <span className="message-meta-check">✓✓</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="desktop-thread-composer">
          <input
            className={`thread-input${!selectedConversation.canSendMessage ? ' disabled' : ''}`}
            type="text"
            value={draft}
            disabled={!selectedConversation.canSendMessage}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => {
              pendingAutoScrollRef.current = true;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={composerPlaceholder}
          />

          <div className="desktop-composer-action-row">
            <div className="desktop-composer-attachments">
              <button type="button" className="media-button" aria-label="Attach camera content">
                <Icon name="camera" />
              </button>
              <button type="button" className="media-button" aria-label="Attach image">
                <Icon name="image" />
              </button>
            </div>

            <div className="desktop-composer-send-row">
              <span>Return to send</span>
              <button
                type="button"
                className={`send-button${!draft.trim() || sending || !selectedConversation.canSendMessage ? ' disabled' : ''}`}
                onClick={() => void handleSend()}
                disabled={!draft.trim() || sending || !selectedConversation.canSendMessage}
                aria-label="Send message"
              >
                {sending ? <span className="button-spinner" aria-hidden="true" /> : <><span>Send</span><Icon name="send" /></>}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderProfileSidebar() {
    if (inboxTab === 'instagram') {
      return (
        <aside className="desktop-profile-panel">
          <div className="desktop-profile-card desktop-instagram-profile-card">
            <div className="desktop-instagram-profile-badge">Instagram</div>
            <h2 className="desktop-profile-name">
              {instagramConnection?.instagramUsername ? `@${instagramConnection.instagramUsername}` : 'Browser connect'}
            </h2>
            <p className="desktop-profile-role">
              {instagramConnection
                ? 'Leads stay separate from your main Syncrolly DMs.'
                : 'Connect once in the browser, then refresh this tab.'}
            </p>
          </div>

          <div className="desktop-profile-section">
            <span className="desktop-profile-section-label">Status</span>
            <p className="desktop-profile-section-body">
              {instagramConnection
                ? `Connected${instagramConnection.lastSyncedAt ? ` and last synced ${formatTimeline(instagramConnection.lastSyncedAt)}` : '.'}`
                : 'No Instagram account is connected yet.'}
            </p>
            {instagramDebug ? <p className="desktop-instagram-debug">{instagramDebug}</p> : null}
          </div>

          <div className="desktop-profile-action-row">
            <button
              type="button"
              className="desktop-profile-cta"
              onClick={() => void handleConnectInstagram()}
              disabled={connectingInstagram}
            >
              {connectingInstagram ? 'Opening Instagram...' : instagramConnection ? 'Reconnect' : 'Connect Instagram'}
            </button>
          </div>
        </aside>
      );
    }

    if (!activeParticipantId && !selectedConversation && !selectedSubmission) {
      return (
        <aside className="desktop-profile-panel empty">
          <div className="desktop-profile-empty">
            <h2>No profile selected</h2>
            <p>Open a conversation or form on the left to see who you&apos;re talking to.</p>
          </div>
        </aside>
      );
    }

    const profile = selectedParticipantProfile;
    const roleLine =
      profile?.role === 'creator'
        ? profile.creatorProfile?.headline || profile.creatorProfile?.niche || 'Creator'
        : activeParticipantFallbackRole || 'Supporter';
    const avatarUrl = !participantAvatarFailed ? profile?.avatarUrl ?? activeParticipantFallbackAvatar : undefined;
    const profileName = profile?.displayName ?? activeParticipantFallbackName;
    const aboutText =
      profile?.bio ||
      (profile?.role === 'creator'
        ? profile.creatorProfile?.headline || 'Creator profile'
        : inboxTab === 'forms'
          ? 'Submitted an inquiry form and is waiting for your review.'
          : 'Part of your inbox.');

    return (
      <aside className="desktop-profile-panel">
        <div className="desktop-profile-card">
          <div className="desktop-profile-avatar-frame">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profileName}
                className="desktop-profile-avatar"
                onError={() => setParticipantAvatarFailed(true)}
              />
            ) : (
              <span className="desktop-profile-avatar-text">{getInitials(profileName)}</span>
            )}
          </div>

          <h2 className="desktop-profile-name">{profileName}</h2>
          <p className="desktop-profile-role">{roleLine}</p>

          <div className="desktop-profile-stats">
            <div className="desktop-profile-stat">
              <div className="desktop-profile-stat-value">
                {selectedThread ? selectedThread.accessLabel : profile?.presence ?? 'Live'}
              </div>
              <div className="desktop-profile-stat-label">Access</div>
            </div>
            <div className="desktop-profile-stat">
              <div className="desktop-profile-stat-value">
                {inboxTab === 'forms' ? 'Pending' : selectedThread?.unread ? 'Unread' : 'Open'}
              </div>
              <div className="desktop-profile-stat-label">Thread</div>
            </div>
          </div>
        </div>

        <div className="desktop-profile-section">
          <span className="desktop-profile-section-label">About</span>
          <p className="desktop-profile-section-body">{loadingParticipantProfile ? 'Loading profile...' : aboutText}</p>
        </div>

        {profile?.role === 'creator' && profile.creatorProfile ? (
          <div className="desktop-profile-section">
            <span className="desktop-profile-section-label">Creator Focus</span>
            <p className="desktop-profile-section-body">
              {profile.creatorProfile.niche || profile.creatorProfile.headline || 'No creator focus added yet.'}
            </p>
          </div>
        ) : null}

        {activeParticipantId ? (
          <div className="desktop-profile-action-row">
            <button
              type="button"
              className="desktop-profile-cta"
              onClick={() => router.push(`/profile/${activeParticipantId}`)}
            >
              Open profile
            </button>

            {profile?.role === 'creator' ? (
              <button
                type="button"
                className="desktop-profile-cta secondary"
                onClick={() => router.push(`/profile/${activeParticipantId}/form`)}
              >
                Open form
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="desktop-profile-section">
          <div className="desktop-profile-section-header">
            <span className="desktop-profile-section-label">Shared Media</span>
            <button type="button" className="desktop-profile-link-button">
              View All
            </button>
          </div>

          <div className="desktop-shared-media-grid">
            <div className="desktop-shared-media-card media-one" />
            <div className="desktop-shared-media-card media-two" />
            <div className="desktop-shared-media-wide">
              <span>Inquiry_Overview.pdf</span>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Supabase isn&apos;t configured yet</h1>
            <p className="stage-body">Add the project URL and publishable key in `apps/web/.env.local`, then restart Next.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || loadingView) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Syncing your workspace...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="welcome-page">
        <nav className="welcome-nav">
          <div className="welcome-nav-inner">
            <a className="welcome-brand" href="#welcome-top" aria-label="Syncrolly home">
              <span className="welcome-brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>Syncrolly</span>
            </a>

            <div className="welcome-nav-links" aria-label="Welcome page sections">
              <a href="#solutions">Solutions</a>
              <a href="#platform">Platform</a>
              <a href="#pricing">Pricing</a>
              <a href="#about">About</a>
            </div>

            <div className="welcome-nav-actions">
              <button type="button" className="welcome-login-button" onClick={() => handleWelcomeAuth('sign-in')}>
                Login
              </button>
              <button type="button" className="welcome-small-cta" onClick={() => handleWelcomeAuth('sign-up')}>
                Get Started
              </button>
            </div>
          </div>
        </nav>

        <main id="welcome-top" className="welcome-main">
          <section className="welcome-hero">
            <div className="welcome-hero-glow welcome-hero-glow-blue" />
            <div className="welcome-hero-glow welcome-hero-glow-purple" />

            <div className="welcome-hero-content">
              <div className="welcome-badge">
                <span />
                <strong>The Future of Creator Operations</strong>
              </div>

              <h1>
                The Ultimate <span>Creator Ecosystem</span>
              </h1>

              <p>
                Unify your workflow. From first message to forms, scheduling, programs, and monetization, Syncrolly is
                the operating layer behind your creator business.
              </p>

              <div className="welcome-hero-actions">
                <button type="button" className="welcome-primary-cta" onClick={() => handleWelcomeAuth('sign-up')}>
                  Start Building Free
                  <span aria-hidden="true">→</span>
                </button>
                <a className="welcome-secondary-cta" href="#platform">
                  <span aria-hidden="true">▶</span>
                  Watch Demo
                </a>
              </div>

              <div className="welcome-capability-strip" aria-label="Syncrolly capabilities">
                <div className="welcome-capability-card">
                  <span className="welcome-capability-icon profile" aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <rect x="6" y="5" width="20" height="22" rx="4" />
                      <circle cx="16" cy="13" r="3.5" />
                      <path d="M10.5 22c1.2-3 3-4.5 5.5-4.5s4.3 1.5 5.5 4.5" />
                      <path d="M22.5 8.5h5M25 6v5" />
                    </svg>
                  </span>
                  <strong>Customizable Profile Builder</strong>
                  <div className="welcome-capability-preview profile-preview" aria-hidden="true">
                    <div className="mini-cover" />
                    <div className="mini-profile-row">
                      <span />
                      <div>
                        <i />
                        <i />
                      </div>
                    </div>
                    <div className="mini-profile-blocks">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>

                <div className="welcome-capability-card">
                  <span className="welcome-capability-icon messaging" aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <path d="M6 9.5A4.5 4.5 0 0 1 10.5 5h11A4.5 4.5 0 0 1 26 9.5v6A4.5 4.5 0 0 1 21.5 20H16l-6 5v-5.2A4.5 4.5 0 0 1 6 15.4z" />
                      <path d="M11 11.5h10M11 15h6" />
                    </svg>
                  </span>
                  <strong>Fan & Client Messaging</strong>
                  <div className="welcome-capability-preview messaging-preview" aria-hidden="true">
                    <div className="mini-inbox-row active">
                      <span />
                      <div>
                        <i />
                        <i />
                      </div>
                    </div>
                    <div className="mini-chat-bubble incoming" />
                    <div className="mini-chat-bubble outgoing" />
                  </div>
                </div>

                <div className="welcome-capability-card">
                  <span className="welcome-capability-icon forms" aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <rect x="7" y="4.5" width="18" height="23" rx="4" />
                      <path d="M12 11h8M12 16h8M12 21h5" />
                      <path d="M22.5 21.5 25 24l4-5" />
                    </svg>
                  </span>
                  <strong>AI-Powered Intake Forms</strong>
                  <div className="welcome-capability-preview forms-preview" aria-hidden="true">
                    <div className="mini-form-progress">
                      <span />
                    </div>
                    <i />
                    <i />
                    <div className="mini-form-option selected" />
                    <div className="mini-form-option" />
                  </div>
                </div>

                <div className="welcome-capability-card">
                  <span className="welcome-capability-icon content" aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <path d="M6 10.5 16 5l10 5.5-10 5.5z" />
                      <path d="M6 16.5 16 22l10-5.5" />
                      <path d="M6 22.5 16 28l10-5.5" />
                    </svg>
                  </span>
                  <strong>Content Delivery</strong>
                  <div className="welcome-capability-preview content-preview" aria-hidden="true">
                    <div className="mini-video-card">
                      <span />
                    </div>
                    <div className="mini-lesson-row done" />
                    <div className="mini-lesson-row" />
                  </div>
                </div>

                <div className="welcome-capability-card">
                  <span className="welcome-capability-icon monetization" aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <rect x="5" y="8" width="22" height="16" rx="4" />
                      <circle cx="16" cy="16" r="4" />
                      <path d="M10 13v6M22 13v6" />
                    </svg>
                  </span>
                  <strong>Monetization</strong>
                  <div className="welcome-capability-preview monetization-preview" aria-hidden="true">
                    <div className="mini-revenue">$245</div>
                    <div className="mini-revenue-line">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="mini-paywall-row" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="platform" className="welcome-pipeline-section">
            <div className="welcome-section-heading">
              <h2>The Unified Pipeline</h2>
              <p>A seamless flow designed to maximize your time, attention, and revenue.</p>
            </div>

            <div id="solutions" className="welcome-pipeline-grid">
              <article className="welcome-pipeline-card blue">
                <div className="welcome-card-corner" />
                <div className="welcome-card-icon">↗</div>
                <h3>1. Engage</h3>
                <p>Build your audience with direct connection tools, branded profiles, and an inbox designed for real relationships.</p>
                <div className="welcome-card-visual welcome-engage-visual">
                  <span />
                  <span />
                  <span />
                </div>
              </article>

              <article className="welcome-pipeline-card purple">
                <div className="welcome-card-corner" />
                <div className="welcome-card-icon">▣</div>
                <h3>2. Schedule</h3>
                <p>Turn qualified replies into booked calls with structured intake, review flows, and calendar-ready call invitations.</p>
                <div className="welcome-card-visual welcome-schedule-visual">
                  {Array.from({ length: 21 }).map((_, index) => (
                    <span key={index} className={index === 9 ? 'active' : ''} />
                  ))}
                </div>
              </article>

              <article className="welcome-pipeline-card green">
                <div className="welcome-card-corner" />
                <div className="welcome-card-icon">$</div>
                <h3>3. Monetize</h3>
                <p>Package paid access, programs, forms, and creator services into one clean system your supporters can act on.</p>
                <div className="welcome-card-visual welcome-money-visual">
                  <strong>+$2,450</strong>
                  <span>Today&apos;s Revenue</span>
                </div>
              </article>
            </div>
          </section>

          <section id="pricing" className="welcome-auth-section">
            <div className="welcome-auth-copy">
              <p>Start here</p>
              <h2>Sign in or create your creator workspace.</h2>
              <span>
                This connects to the same Supabase auth flow we already use for messages, forms, profiles, and programs.
              </span>
            </div>
            <div id="welcome-auth">{renderWelcomeAuthCard()}</div>
          </section>
        </main>

        <footer id="about" className="welcome-footer">
          <div className="welcome-footer-brand">
            <span className="welcome-brand-mark mini" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <strong>Syncrolly</strong>
          </div>
          <div className="welcome-footer-links">
            <a href="#about">Privacy</a>
            <a href="#about">Terms</a>
            <a href="#about">Security</a>
            <a href="#about">Careers</a>
          </div>
          <p>© 2026 Syncrolly. Creator operations in one precise flow.</p>
        </footer>
      </div>
    );
  }

  if (!profileComplete) {
    return (
      <div className="syncrolly-page">
        {renderHeader()}
        <main className="auth-shell">
          <div className="auth-content">
            <section className="auth-hero">
              <p className="auth-eyebrow">Profile setup</p>
              <h1 className="auth-title">Finish your account</h1>
              <p className="auth-body">
                Choose how you show up in Syncrolly so the inbox, profile, and new-message search all use real data.
              </p>
            </section>

            <section className="auth-card">
              <RolePicker role={profileRole} onChange={setProfileRole} />

              <LabeledField label="Display name">
                <input
                  className="text-input"
                  type="text"
                  value={profileDisplayName}
                  onChange={(event) => setProfileDisplayName(event.target.value)}
                  placeholder="Your name or brand"
                />
              </LabeledField>

              {profileRole === 'creator' ? (
                <>
                  <LabeledField label="Niche">
                    <input
                      className="text-input"
                      type="text"
                      value={profileNiche}
                      onChange={(event) => setProfileNiche(event.target.value)}
                      placeholder="Fitness, sales, wellness..."
                    />
                  </LabeledField>

                  <LabeledField label="Headline">
                    <textarea
                      className="text-input multiline-input"
                      value={profileHeadline}
                      onChange={(event) => setProfileHeadline(event.target.value)}
                      placeholder="Tell people what you help them achieve"
                    />
                  </LabeledField>

                  <div className="option-group">
                    <p className="field-label">Who can message you?</p>
                    <div className="option-row">
                      {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => {
                        const isSelected = profileDmAccess === value;
                        const label = value === 'free' ? 'Everyone' : value === 'subscriber_only' ? 'Subscribers' : 'Paid only';

                        return (
                          <button
                            key={value}
                            type="button"
                            className={`option-chip${isSelected ? ' active' : ''}`}
                            onClick={() => setProfileDmAccess(value)}
                          >
                            <span className={`option-chip-text${isSelected ? ' active' : ''}`}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="supporter-note">
                  <h2 className="supporter-note-title">Supporter profile</h2>
                  <p className="supporter-note-body">
                    Your access level starts as free by default. We can connect subscriptions and purchases later.
                  </p>
                </div>
              )}

              {feedback ? <p className="feedback-text">{feedback}</p> : null}

              <button
                type="button"
                className="primary-action"
                onClick={handleCompleteProfile}
                disabled={profileSaving}
              >
                {profileSaving ? <span className="button-spinner" aria-hidden="true" /> : null}
                <span>Save Profile</span>
              </button>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="syncrolly-page">
      {renderHeader(true)}

      <main className="desktop-inbox-main">
        <section className="desktop-inbox-shell">
          <aside className="desktop-inbox-sidebar">
            <div className="desktop-sidebar-header">
              <div className="desktop-sidebar-title-row">
                <h1>Messages</h1>
                <button
                  type="button"
                  className="desktop-compose-icon-button"
                  onClick={() => setComposeVisible(true)}
                  aria-label="New message"
                >
                  <Icon name="compose" />
                </button>
              </div>

              <label className="search-field desktop-search-field">
                <Icon name="search" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={
                    inboxTab === 'forms'
                      ? 'Search forms...'
                      : inboxTab === 'instagram'
                        ? 'Search Instagram leads...'
                      : inboxTab === 'unread'
                        ? 'Search unread...'
                        : inboxTab === 'other'
                          ? 'Search other...'
                          : 'Search direct messages...'
                  }
                />
              </label>

              <div className="desktop-tab-row" role="tablist" aria-label="Inbox tabs">
                {([
                  { key: 'all' as const, label: 'All' },
                  { key: 'unread' as const, label: 'Unread' },
                  { key: 'forms' as const, label: 'Forms' },
                  { key: 'instagram' as const, label: 'Instagram' },
                  { key: 'other' as const, label: 'Other' }
                ]).map((item) => {
                  const isActive = inboxTab === item.key;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`desktop-tab-button${isActive ? ' active' : ''}`}
                      onClick={() => setInboxTab(item.key)}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {feedback ? <p className="feedback-inline">{feedback}</p> : null}

            <div className="desktop-thread-list" aria-label="Conversation list">
              {renderInboxList()}
            </div>
          </aside>

          {renderConversationPanel()}
        </section>
      </main>

      {composeVisible ? (
        <div className="modal-backdrop" role="presentation">
          <button
            type="button"
            className="modal-backdrop-button"
            aria-label="Close new message"
            onClick={() => setComposeVisible(false)}
          />
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-message-title">
            <div className="modal-header">
              <h2 className="modal-title" id="new-message-title">
                New Message
              </h2>
              <button type="button" className="modal-close-button" onClick={() => setComposeVisible(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>

            <label className="search-field">
              <Icon name="search" />
              <input
                type="search"
                value={composeSearch}
                onChange={(event) => setComposeSearch(event.target.value)}
                placeholder="Find a creator or supporter"
              />
            </label>

            <div className="modal-results">
              {composeLoading ? (
                <div className="modal-state">
                  <div className="spinner" aria-hidden="true" />
                </div>
              ) : composeResults.length ? (
                composeResults.map((profile) => {
                  const isCreating = creatingConversationId === profile.id;

                  return (
                    <button
                      key={profile.id}
                      type="button"
                      className="result-row"
                      onClick={() => void handleStartConversation(profile)}
                      disabled={isCreating}
                    >
                      <div className="result-avatar" style={{ backgroundColor: `${profile.accentColor}18` }}>
                        {profile.avatarUrl ? (
                          <img src={profile.avatarUrl} alt={profile.displayName} className="brand-avatar" />
                        ) : (
                          <span className="result-avatar-text" style={{ color: profile.accentColor }}>
                            {profile.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="result-copy">
                        <p className="result-name">{profile.displayName}</p>
                        <p className="result-meta">
                          {profile.role === 'creator'
                            ? `Creator - open profile`
                            : `Supporter - ${profile.presence}`}
                        </p>
                      </div>

                      {isCreating ? <span className="button-spinner button-spinner-dark" aria-hidden="true" /> : <span className="result-chevron">›</span>}
                    </button>
                  );
                })
              ) : (
                <div className="modal-state">
                  <p className="modal-state-text">Search for another user to start a real conversation.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav activeKey="inbox" />
    </div>
  );
}

function LabeledField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      {children}
    </label>
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
    <div className="option-group">
      <p className="field-label">I am joining as a...</p>
      <div className="option-row">
        {(['creator', 'supporter'] as const).map((value) => {
          const isSelected = role === value;

          return (
            <button
              key={value}
              type="button"
              className={`option-chip${isSelected ? ' active' : ''}`}
              onClick={() => onChange(value)}
            >
              <span className={`option-chip-text${isSelected ? ' active' : ''}`}>
                {value === 'creator' ? 'Creator' : 'Supporter'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
