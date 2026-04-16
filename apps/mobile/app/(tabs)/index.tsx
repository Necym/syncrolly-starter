import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import {
  hasCompletedProfile,
  type DirectoryProfile,
  type InboxThreadSummary,
  type UserRole,
  type ViewerProfile
} from '@syncrolly/core';
import {
  createDirectConversation,
  getViewerProfile,
  listInboxThreads,
  saveCreatorProfile,
  saveSupporterProfile,
  searchProfiles
} from '@syncrolly/data';
import { useRouter } from 'expo-router';
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

const BRAND_NAME = 'Synchrolly';

type AuthMode = 'sign-in' | 'sign-up';
type DmAccess = 'free' | 'subscriber_only' | 'paid_only';

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

export default function InboxScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [loadingView, setLoadingView] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');

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
  const loadRequestIdRef = useRef(0);
  const threadIdsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleThreads = threads.filter((thread) => matchesSearch(thread, searchValue));
  const profileComplete = hasCompletedProfile(viewerProfile);

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
      if (hasCompletedProfile(nextProfile)) {
        nextThreads = await listInboxThreads(supabase, currentUserId);

        if (loadRequestIdRef.current !== requestId) {
          return;
        }
      }

      setViewerProfile(nextProfile);
      setThreads(nextThreads);
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
          setComposeResults(results);
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

    const channel = supabase
      .channel(`inbox-live:${user.id}`)
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
          dmAccess: profileDmAccess
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
    if (!supabase || !user) {
      return;
    }

    setCreatingConversationId(profile.id);
    setFeedback(null);

    try {
      const conversation = await createDirectConversation(supabase, {
        createdBy: user.id,
        counterpartUserId: profile.id,
        subject: profile.role === 'creator' ? 'Creator outreach' : 'Direct message'
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

  function renderHeader() {
    return (
      <View style={styles.topBar}>
        <View style={styles.brandWrap}>
          <View style={styles.brandMark}>
            <View style={styles.brandMarkSheen} />
            <View style={styles.brandMarkDot} />
            <Text style={styles.brandMarkGlyph}>S</Text>
          </View>
          <Text style={styles.brandName}>{BRAND_NAME}</Text>
        </View>

        <Pressable
          style={styles.settingsButton}
          onPress={() => {
            if (user) {
              router.push('/settings');
            }
          }}
        >
          <Ionicons name="settings-sharp" size={22} color="#6b7280" />
        </Pressable>
      </View>
    );
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
                  placeholderTextColor="rgba(114, 119, 132, 0.7)"
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                />
              </LabeledField>

              <LabeledField label="Password">
                <TextInput
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor="rgba(114, 119, 132, 0.7)"
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
                      placeholderTextColor="rgba(114, 119, 132, 0.7)"
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
                {authSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryActionText}>
                    {authMode === 'sign-in' ? 'Sign In' : 'Create Account'}
                  </Text>
                )}
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
                  placeholderTextColor="rgba(114, 119, 132, 0.7)"
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
                      placeholderTextColor="rgba(114, 119, 132, 0.7)"
                      style={styles.textInput}
                      value={profileNiche}
                      onChangeText={setProfileNiche}
                    />
                  </LabeledField>

                  <LabeledField label="Headline">
                    <TextInput
                      placeholder="Tell people what you help them achieve"
                      placeholderTextColor="rgba(114, 119, 132, 0.7)"
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
                {profileSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryActionText}>Save Profile</Text>
                )}
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
          <View style={styles.headerRow}>
            <Text style={styles.title}>Inbox</Text>

            <Pressable style={styles.composeButton} onPress={() => setComposeVisible(true)}>
              <Ionicons name="create-outline" size={18} color="#ffffff" />
              <Text style={styles.composeButtonText}>New Message</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <TextInput
              value={searchValue}
              onChangeText={setSearchValue}
              placeholder="Search conversations..."
              placeholderTextColor="rgba(66, 71, 82, 0.6)"
              style={styles.searchInput}
            />
          </View>

          {feedback ? <Text style={styles.feedbackInline}>{feedback}</Text> : null}

          <View style={styles.threadList}>
            {visibleThreads.length ? (
              visibleThreads.map((thread, index) => {
                const isLast = index === visibleThreads.length - 1;

                return (
                  <Pressable
                    key={thread.id}
                    style={[styles.threadItem, thread.unread ? styles.threadItemUnread : styles.threadItemRead]}
                    onPress={() =>
                      router.push({
                        pathname: '/thread/[threadId]',
                        params: { threadId: thread.id }
                      })
                    }
                  >
                    <View style={styles.avatarWrap}>
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
                    </View>

                    <View style={[styles.threadBody, !thread.unread && !isLast && styles.threadBodyDivider]}>
                      <View style={styles.threadTopRow}>
                        <Text style={[styles.threadName, thread.unread && styles.threadNameUnread]} numberOfLines={1}>
                          {thread.participantName}
                        </Text>
                        <Text style={[styles.threadTime, thread.unread && styles.threadTimeUnread]}>
                          {thread.relativeTime}
                        </Text>
                      </View>

                      <Text
                        numberOfLines={1}
                        style={[styles.threadPreview, thread.unread ? styles.threadPreviewUnread : styles.threadPreviewRead]}
                      >
                        {thread.preview}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>No conversations yet</Text>
                <Text style={styles.emptyCardBody}>
                  Start a new thread and we&apos;ll save every message to Supabase from here on out.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Modal visible={composeVisible} transparent animationType="fade" onRequestClose={() => setComposeVisible(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setComposeVisible(false)} />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Message</Text>
                <Pressable style={styles.modalCloseButton} onPress={() => setComposeVisible(false)}>
                  <Ionicons name="close" size={18} color="#6b7280" />
                </Pressable>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
                <TextInput
                  value={composeSearch}
                  onChangeText={setComposeSearch}
                  placeholder="Find a creator or supporter"
                  placeholderTextColor="rgba(66, 71, 82, 0.6)"
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
                      <Pressable
                        key={profile.id}
                        style={styles.resultRow}
                        onPress={() => handleStartConversation(profile)}
                        disabled={isCreating}
                      >
                        <View style={[styles.resultAvatar, { backgroundColor: `${profile.accentColor}18` }]}>
                          <Text style={[styles.resultAvatarText, { color: profile.accentColor }]}>
                            {profile.displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.resultCopy}>
                          <Text style={styles.resultName}>{profile.displayName}</Text>
                          <Text style={styles.resultMeta}>
                            {profile.role === 'creator' ? 'Creator' : 'Supporter'} · {profile.presence}
                          </Text>
                        </View>

                        {isCreating ? (
                          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
                        ) : (
                          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                        )}
                      </Pressable>
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
    backgroundColor: '#eef2ff',
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
    backgroundColor: '#ffffff'
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
    backgroundColor: '#ffffff'
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
    backgroundColor: '#f4f6fd',
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
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryActionDisabled: {
    opacity: 0.7
  },
  primaryActionText: {
    color: '#ffffff',
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 39 / 1.6,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  composeButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.primaryStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  composeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  searchWrap: {
    height: 44,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: 8,
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
  threadItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 12,
    borderRadius: 12
  },
  threadItemUnread: {
    backgroundColor: theme.colors.surfaceContainerLowest
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
    borderBottomColor: theme.colors.surfaceContainerLow,
    paddingBottom: 12
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2
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
  threadTime: {
    color: 'rgba(66, 71, 82, 0.6)',
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
    color: 'rgba(66, 71, 82, 0.7)',
    fontWeight: '400'
  },
  emptyCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 20,
    gap: 8
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
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    gap: 14,
    maxHeight: '72%'
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
  resultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
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
  }
});
