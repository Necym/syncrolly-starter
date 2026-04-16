import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import { getConversationDetails, markConversationRead, sendMessage } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileSession } from '../../lib/session';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading the conversation.';
}

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string | string[] }>();
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const pendingAutoScrollRef = useRef(true);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedThreadId = Array.isArray(threadId) ? threadId[0] : threadId;
  const [draft, setDraft] = useState('');
  const [composerHeight, setComposerHeight] = useState(72);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversation, setConversation] = useState<Awaited<ReturnType<typeof getConversationDetails>>>(null);

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

  useEffect(() => {
    if (!user || !resolvedThreadId || !supabase) {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      setConversation(null);
      return;
    }

    void loadConversation({ showLoader: true });
  }, [resolvedThreadId, supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !resolvedThreadId) {
      return;
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
      .channel(`thread-live:${resolvedThreadId}:${user.id}`)
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

    if (!nextText) {
      return;
    }

    setSending(true);
    setFeedback(null);
    pendingAutoScrollRef.current = true;

    try {
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

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.primaryStrong} />
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
        <StatusBar style="dark" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.primaryStrong} />
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
            <Text style={styles.emptyBody}>Loading conversation…</Text>
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
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.primaryStrong} />
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
        <StatusBar style="dark" />
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.primaryStrong} />
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

  const activityLabel = conversation.activityLabel.toUpperCase();
  const presenceColor = conversation.participantPresence === 'online' ? theme.colors.success : theme.colors.textMuted;
  const showAvatarImage = Boolean(conversation.participantAvatar && !avatarFailed);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.primaryStrong} />
          </Pressable>

          <View style={styles.headerIdentity}>
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
          </View>

          <Pressable style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={20} color="#5f6878" />
          </Pressable>
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
            {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

            {conversation.messages.map((message) => (
              <View key={message.id} style={styles.messageBlock}>
                {message.dayLabel ? (
                  <View style={styles.dayPillWrap}>
                    <View style={styles.dayPill}>
                      <Text style={styles.dayPillText}>{message.dayLabel.toUpperCase()}</Text>
                    </View>
                  </View>
                ) : null}

                <View
                  style={[styles.messageRow, message.isFromCreator ? styles.messageRowOutgoing : styles.messageRowIncoming]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      message.isFromCreator ? styles.messageBubbleOutgoing : styles.messageBubbleIncoming
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        message.isFromCreator ? styles.messageTextOutgoing : styles.messageTextIncoming
                      ]}
                    >
                      {message.text}
                    </Text>
                  </View>

                  <View style={[styles.messageMetaRow, message.isFromCreator && styles.messageMetaRowOutgoing]}>
                    <Text style={styles.messageMetaText}>{message.timeLabel}</Text>
                    {message.isFromCreator ? (
                      <Ionicons name="checkmark-done" size={12} color="rgba(66, 71, 82, 0.5)" />
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
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
            <Pressable style={styles.mediaButton}>
              <Ionicons name="camera" size={18} color="#7f89a1" />
            </Pressable>
            <Pressable style={styles.mediaButton}>
              <Ionicons name="image" size={18} color="#7f89a1" />
            </Pressable>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message..."
              placeholderTextColor="rgba(114, 119, 132, 0.7)"
              style={styles.composerInput}
              onFocus={() => scrollToLatest(false)}
            />

            <Pressable
              style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="send" size={18} color="#ffffff" />
              )}
            </Pressable>
          </View>
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
  threadShell: {
    flex: 1
  },
  topBar: {
    minHeight: 70,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden'
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
    borderColor: theme.colors.surface
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  headerName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  headerMeta: {
    color: '#7d8493',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.45,
    marginTop: 2
  },
  scrollView: {
    flex: 1
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 10
  },
  feedbackText: {
    color: theme.colors.primaryStrong,
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
    backgroundColor: '#eef0fa'
  },
  dayPillText: {
    color: '#959eb0',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.55
  },
  messageRow: {
    maxWidth: '82%'
  },
  messageRowIncoming: {
    alignSelf: 'flex-start'
  },
  messageRowOutgoing: {
    alignSelf: 'flex-end'
  },
  messageBubble: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  messageBubbleIncoming: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#101828',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 1
  },
  messageBubbleOutgoing: {
    backgroundColor: theme.colors.primaryStrong
  },
  messageText: {
    fontSize: 15,
    lineHeight: 24
  },
  messageTextIncoming: {
    color: theme.colors.textPrimary,
    fontWeight: '500'
  },
  messageTextOutgoing: {
    color: '#ffffff',
    fontWeight: '500'
  },
  messageMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2
  },
  messageMetaRowOutgoing: {
    justifyContent: 'flex-end'
  },
  messageMetaText: {
    color: '#7d8493',
    fontSize: 12,
    fontWeight: '500'
  },
  composerShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(194, 198, 212, 0.35)',
    backgroundColor: theme.colors.background,
    zIndex: 10
  },
  mediaButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#f1f3fe',
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#7ea9e1'
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22
  }
});
