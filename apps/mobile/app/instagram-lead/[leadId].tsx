import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type InstagramLeadDetail, type InstagramLeadStatus } from '@syncrolly/core';
import { getInstagramLeadDetail, markInstagramLeadRead, sendInstagramButtonReply, updateInstagramLeadStatus } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileSession } from '../../lib/session';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function formatLeadTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function hasVisibleText(value: string | undefined) {
  return Boolean(value?.trim());
}

const DEFAULT_BUTTON_REPLY_TEXT = '';
const DEFAULT_BUTTON_REPLY_TITLE = 'Open Syncrolly';
const DEFAULT_BUTTON_REPLY_URL = 'https://syncrolly.com';

export default function InstagramLeadScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ leadId?: string | string[] }>();
  const leadId = Array.isArray(params.leadId) ? params.leadId[0] : params.leadId;
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [lead, setLead] = useState<InstagramLeadDetail | null>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<InstagramLeadStatus | null>(null);
  const [buttonReplyVisible, setButtonReplyVisible] = useState(false);
  const [buttonReplyText, setButtonReplyText] = useState(DEFAULT_BUTTON_REPLY_TEXT);
  const [buttonReplyTitle, setButtonReplyTitle] = useState(DEFAULT_BUTTON_REPLY_TITLE);
  const [buttonReplyUrl, setButtonReplyUrl] = useState(DEFAULT_BUTTON_REPLY_URL);
  const [sendingButtonReply, setSendingButtonReply] = useState(false);

  useEffect(() => {
    if (!supabase || !user || !leadId) {
      setLead(null);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    const currentLeadId = leadId;
    let isActive = true;

    async function loadLead() {
      setLoadingLead(true);

      try {
        const nextLead = await getInstagramLeadDetail(currentSupabase, currentUser.id, currentLeadId);

        if (!isActive) {
          return;
        }

        setLead(nextLead);
        setFeedback(null);

        if (nextLead?.unreadCount) {
          await markInstagramLeadRead(currentSupabase, currentUser.id, currentLeadId);

          if (isActive) {
            setLead({
              ...nextLead,
              unreadCount: 0
            });
          }
        }
      } catch (error) {
        if (isActive) {
          setFeedback(getErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setLoadingLead(false);
        }
      }
    }

    void loadLead();

    return () => {
      isActive = false;
    };
  }, [leadId, pathname, supabase, user?.id]);

  async function handleStatusChange(nextStatus: InstagramLeadStatus) {
    if (!supabase || !user || !lead || lead.leadStatus === nextStatus) {
      return;
    }

    setSavingStatus(nextStatus);
    setFeedback(null);

    try {
      await updateInstagramLeadStatus(supabase, user.id, lead.id, nextStatus);
      setLead({
        ...lead,
        leadStatus: nextStatus
      });
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSavingStatus(null);
    }
  }

  async function handleSendButtonReply() {
    if (!supabase || !user || !lead) {
      return;
    }

    setSendingButtonReply(true);
    setFeedback(null);

    try {
      const sentMessage = await sendInstagramButtonReply(supabase, {
        leadId: lead.id,
        text: buttonReplyText,
        buttonTitle: buttonReplyTitle,
        buttonUrl: buttonReplyUrl
      });

      setLead((currentLead) => {
        if (!currentLead) {
          return currentLead;
        }

        return {
          ...currentLead,
          leadStatus: currentLead.leadStatus === 'new' ? 'replied' : currentLead.leadStatus,
          lastMessageText: sentMessage.textBody || sentMessage.buttonTitle || currentLead.lastMessageText,
          lastMessageAt: sentMessage.sentAt,
          messages: [...currentLead.messages, sentMessage]
        };
      });

      setButtonReplyVisible(false);
      setFeedback('Instagram button reply sent.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSendingButtonReply(false);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Instagram Lead</Text>
          <Text style={styles.centerBody}>Add your Supabase keys in `apps/mobile/.env` to load Instagram leads.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingLead) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerBody}>Loading Instagram lead...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!lead) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Lead not found</Text>
          <Text style={styles.centerBody}>This Instagram lead is not available anymore.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={['#fbfcff', '#f6f8fc', '#fdfefe']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.backgroundBase}
          />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <LinearGradient colors={['#20113a', '#b91c9c', '#f97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
            <View style={styles.heroBadge}>
              <Ionicons name="logo-instagram" size={14} color="#ffffff" />
              <Text style={styles.heroBadgeText}>Instagram lead</Text>
            </View>
            <Text style={styles.heroTitle}>{lead.displayName}</Text>
            <Text style={styles.heroBody}>
              {lead.instagramUsername ? `@${lead.instagramUsername}` : `Scoped user ${lead.instagramScopedUserId}`}
            </Text>
          </LinearGradient>

          <View style={styles.statusCard}>
            <Text style={styles.sectionEyebrow}>Lead Status</Text>
            <View style={styles.statusRow}>
              {(['new', 'replied', 'qualified', 'archived'] as const).map((status) => {
                const isActive = lead.leadStatus === status;
                const isSaving = savingStatus === status;

                return (
                  <Pressable
                    key={status}
                    style={[styles.statusChip, isActive && styles.statusChipActive]}
                    onPress={() => void handleStatusChange(status)}
                    disabled={isSaving}
                  >
                    <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                      {isSaving ? 'Saving...' : status}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.statusMeta}>Last message {formatLeadTime(lead.lastMessageAt)}</Text>
          </View>

          <View style={styles.replyCard}>
            <Text style={styles.sectionEyebrow}>Button Reply</Text>
            <Text style={styles.replyTitle}>Send a clean CTA</Text>
            <Text style={styles.replyBody}>
              Leave the message blank if you want to test a near button-only Instagram reply.
            </Text>
            <Pressable style={styles.replyPrimaryButton} onPress={() => setButtonReplyVisible(true)}>
              <Ionicons name="send-outline" size={16} color="#ffffff" />
              <Text style={styles.replyPrimaryButtonText}>Send Button Reply</Text>
            </Pressable>
          </View>

          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

          <View style={styles.messageList}>
            {lead.messages.length ? (
              lead.messages.map((message) => {
                const isInbound = message.direction === 'inbound';

                return (
                  <View
                    key={message.id}
                    style={[styles.messageCard, isInbound ? styles.messageCardInbound : styles.messageCardOutbound]}
                  >
                    <Text style={styles.messageLabel}>{isInbound ? 'Lead' : 'You'}</Text>
                    {hasVisibleText(message.textBody) ? (
                      <Text style={styles.messageText}>{message.textBody}</Text>
                    ) : !message.buttonTitle ? (
                      <Text style={styles.messageText}>{`[${message.messageType}]`}</Text>
                    ) : null}
                    {message.buttonTitle && message.buttonUrl ? (
                      <Pressable style={styles.messageCtaButton} onPress={() => void Linking.openURL(message.buttonUrl!)}>
                        <Text style={styles.messageCtaButtonText}>{message.buttonTitle}</Text>
                        <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                      </Pressable>
                    ) : null}
                    <Text style={styles.messageTime}>{formatLeadTime(message.sentAt)}</Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyBody}>Inbound Instagram lead messages will show up here once Meta starts delivering them.</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Modal visible={buttonReplyVisible} transparent animationType="fade" onRequestClose={() => setButtonReplyVisible(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setButtonReplyVisible(false)} />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Send button reply</Text>
                <Pressable style={styles.modalCloseButton} onPress={() => setButtonReplyVisible(false)}>
                  <Ionicons name="close" size={18} color="#667085" />
                </Pressable>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Message (optional)</Text>
                <TextInput
                  value={buttonReplyText}
                  onChangeText={setButtonReplyText}
                  multiline
                  placeholder="Leave blank for a button-only feel"
                  placeholderTextColor="rgba(102, 112, 133, 0.8)"
                  style={[styles.textInput, styles.multilineInput]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Button Title</Text>
                <TextInput
                  value={buttonReplyTitle}
                  onChangeText={setButtonReplyTitle}
                  placeholder="Open Syncrolly"
                  placeholderTextColor="rgba(102, 112, 133, 0.8)"
                  style={styles.textInput}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Button Link</Text>
                <TextInput
                  value={buttonReplyUrl}
                  onChangeText={setButtonReplyUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://syncrolly.com"
                  placeholderTextColor="rgba(102, 112, 133, 0.8)"
                  style={styles.textInput}
                />
              </View>

              <View style={styles.previewCard}>
                <Text style={styles.previewEyebrow}>Syncrolly Preview</Text>
                <LinearGradient
                  colors={['#115cb9', '#1d4ed8', '#4f46e5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.previewBubble}
                >
                  {hasVisibleText(buttonReplyText) ? (
                    <Text style={styles.previewText}>{buttonReplyText}</Text>
                  ) : null}
                  <View style={styles.previewButton}>
                    <Text style={styles.previewButtonText}>{buttonReplyTitle || DEFAULT_BUTTON_REPLY_TITLE}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#115cb9" />
                  </View>
                </LinearGradient>
                <Text style={styles.previewNote}>
                  Instagram still requires a hidden body field for button templates, but this should feel closer to a button-only CTA.
                </Text>
              </View>

              <Pressable
                style={[styles.replyPrimaryButton, sendingButtonReply && styles.replyPrimaryButtonDisabled]}
                onPress={() => void handleSendButtonReply()}
                disabled={sendingButtonReply}
              >
                {sendingButtonReply ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="paper-plane-outline" size={16} color="#ffffff" />}
                <Text style={styles.replyPrimaryButtonText}>{sendingButtonReply ? 'Sending...' : 'Send to Instagram'}</Text>
              </Pressable>
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
    backgroundColor: '#f7f8fb'
  },
  screen: {
    flex: 1,
    backgroundColor: '#f7f8fb'
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject
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
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
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
    lineHeight: 23
  },
  statusCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 18,
    gap: 12
  },
  sectionEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  statusChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#f1f4f8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusChipActive: {
    backgroundColor: '#eff4ff'
  },
  statusChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize'
  },
  statusChipTextActive: {
    color: theme.colors.primaryStrong
  },
  statusMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13
  },
  replyCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 18,
    gap: 10
  },
  replyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800'
  },
  replyBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  replyPrimaryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  replyPrimaryButtonDisabled: {
    opacity: 0.7
  },
  replyPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  feedbackText: {
    color: '#b42318',
    fontSize: 13,
    lineHeight: 20
  },
  messageList: {
    gap: 12
  },
  messageCard: {
    borderRadius: 22,
    padding: 16,
    gap: 8
  },
  messageCardInbound: {
    backgroundColor: 'rgba(255,255,255,0.96)'
  },
  messageCardOutbound: {
    backgroundColor: '#eef4ff'
  },
  messageLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  messageText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 23
  },
  messageCtaButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  messageCtaButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  messageTime: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: 22,
    padding: 18,
    gap: 14,
    maxHeight: '82%'
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
  fieldGroup: {
    gap: 8
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  textInput: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#f4f7fb',
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    fontSize: 14
  },
  multilineInput: {
    minHeight: 92,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top'
  },
  previewCard: {
    borderRadius: 18,
    backgroundColor: '#f7f9fd',
    padding: 14,
    gap: 10
  },
  previewEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  previewBubble: {
    borderRadius: 18,
    padding: 16,
    gap: 12
  },
  previewText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700'
  },
  previewButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  previewButtonText: {
    color: '#115cb9',
    fontSize: 13,
    fontWeight: '800'
  },
  previewNote: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 19
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
    fontSize: 26,
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

