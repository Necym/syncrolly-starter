import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import type { VoiceAssistantTurn } from '@syncrolly/core';
import { requestVoiceAssistantTurn } from '@syncrolly/data';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileSession } from '../lib/session';
import {
  deleteLocalAudioFile,
  readRecordingAsBase64,
  writeAssistantAudioToCache
} from '../lib/voiceAssistant';

type LocalVoiceAssistantTurn = VoiceAssistantTurn & {
  id: string;
  createdAt: string;
  audioUri: string;
};

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

  return 'Something went wrong while talking to Syncrolly AI.';
}

function formatDuration(durationMillis: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function formatCreatedAtLabel(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return 'Just now';
  }
}

export default function AssistantScreen() {
  const router = useRouter();
  const { user, supabase, isConfigured, loading: sessionLoading } = useMobileSession();
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 150);

  const [turns, setTurns] = useState<LocalVoiceAssistantTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnAudioUrisRef = useRef<string[]>([]);

  const player = useAudioPlayer(playbackUri, {
    keepAudioSessionActive: true
  });
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!shouldAutoplay || !playbackUri || !playerStatus.isLoaded) {
      return;
    }

    let isCancelled = false;

    async function autoplayResponse() {
      try {
        await player.seekTo(0);

        if (!isCancelled) {
          player.play();
        }
      } catch {
        if (!isCancelled) {
          player.play();
        }
      } finally {
        if (!isCancelled) {
          setShouldAutoplay(false);
        }
      }
    }

    void autoplayResponse();

    return () => {
      isCancelled = true;
    };
  }, [player, playerStatus.isLoaded, playbackUri, shouldAutoplay]);

  useEffect(() => {
    turnAudioUrisRef.current = turns.map((turn) => turn.audioUri);
  }, [turns]);

  useEffect(() => {
    return () => {
      turnAudioUrisRef.current.forEach((audioUri) => {
        deleteLocalAudioFile(audioUri);
      });
    };
  }, []);

  async function beginRecording() {
    setErrorMessage(null);

    try {
      if (!user || !supabase || !isConfigured) {
        throw new Error('Sign in from the Inbox tab before using the voice assistant.');
      }

      if (isProcessing || recorderState.isRecording) {
        return;
      }

      player.pause();

      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error('Microphone access is required to talk with Syncrolly AI.');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function stopRecordingAndSend() {
    setErrorMessage(null);

    if (!user || !supabase || !isConfigured) {
      setErrorMessage('Sign in from the Inbox tab before using the voice assistant.');
      return;
    }

    if (!recorderState.isRecording || isProcessing) {
      return;
    }

    let recordedUri: string | null = null;

    try {
      setIsProcessing(true);

      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true
      });

      recordedUri = recorder.getStatus().url ?? recorderState.url ?? recorder.uri;

      if (!recordedUri) {
        throw new Error('The recording could not be saved. Please try again.');
      }

      const recordingPayload = await readRecordingAsBase64(recordedUri);
      const assistantTurn = await requestVoiceAssistantTurn(supabase, recordingPayload);
      const localReplyUri = await writeAssistantAudioToCache(
        assistantTurn.audioBase64,
        assistantTurn.audioMimeType
      );

      const nextTurn: LocalVoiceAssistantTurn = {
        ...assistantTurn,
        id: `assistant-turn-${Date.now()}`,
        createdAt: new Date().toISOString(),
        audioUri: localReplyUri
      };

      setTurns((currentTurns) => [nextTurn, ...currentTurns]);
      setActiveTurnId(nextTurn.id);
      setPlaybackUri(nextTurn.audioUri);
      setShouldAutoplay(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      deleteLocalAudioFile(recordedUri);
      setIsProcessing(false);

      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true
      }).catch(() => undefined);
    }
  }

  async function handleReplay(turn: LocalVoiceAssistantTurn) {
    setErrorMessage(null);

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true
      });

      if (activeTurnId === turn.id) {
        if (playerStatus.playing) {
          player.pause();
          return;
        }

        if (playerStatus.didJustFinish) {
          await player.seekTo(0);
        }

        player.play();
        return;
      }

      setActiveTurnId(turn.id);
      setPlaybackUri(turn.audioUri);
      setShouldAutoplay(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  const primaryButtonLabel = recorderState.isRecording ? 'Stop and send' : 'Tap to talk';
  const primaryButtonIcon = recorderState.isRecording ? 'stop' : 'mic';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressedButton]}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.primaryStrong} />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerEyebrow}>Voice assistant</Text>
          <Text style={styles.headerTitle}>Syncrolly AI</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="sparkles" size={14} color={theme.colors.primaryStrong} />
            <Text style={styles.heroBadgeText}>Expo-friendly push-to-talk</Text>
          </View>

          <Text style={styles.heroTitle}>Talk out an idea, reply, or strategy question.</Text>
          <Text style={styles.heroText}>
            This first version records a short voice note, sends it to the assistant, and plays back an AI-generated reply.
          </Text>
          <Text style={styles.heroDisclaimer}>Voice replies are AI-generated.</Text>
        </View>

        <View style={styles.controlCard}>
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>
              {recorderState.isRecording ? 'Recording now' : isProcessing ? 'Thinking...' : 'Ready'}
            </Text>
            <Text style={styles.timerValue}>{formatDuration(recorderState.durationMillis)}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isProcessing || sessionLoading}
            onPress={recorderState.isRecording ? () => void stopRecordingAndSend() : () => void beginRecording()}
            style={({ pressed }) => [
              styles.recordButton,
              recorderState.isRecording ? styles.recordButtonActive : null,
              (isProcessing || sessionLoading) && styles.recordButtonDisabled,
              pressed && !isProcessing && !sessionLoading ? styles.pressedRecordButton : null
            ]}
          >
            <Ionicons
              name={primaryButtonIcon}
              size={30}
              color={recorderState.isRecording ? theme.colors.danger : '#ffffff'}
            />
            <Text
              style={[
                styles.recordButtonText,
                recorderState.isRecording ? styles.recordButtonTextActive : null
              ]}
            >
              {primaryButtonLabel}
            </Text>
          </Pressable>

          <Text style={styles.controlHint}>
            Keep each note short for now. The prototype is tuned for quick coaching, content, and message-draft help.
          </Text>
        </View>

        {sessionLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.stateText}>Loading your session...</Text>
          </View>
        ) : null}

        {!sessionLoading && (!isConfigured || !supabase) ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={22} color={theme.colors.textMuted} />
            <Text style={styles.stateText}>
              Add your mobile Supabase env vars before testing the assistant.
            </Text>
          </View>
        ) : null}

        {!sessionLoading && isConfigured && supabase && !user ? (
          <View style={styles.stateCard}>
            <Ionicons name="person-circle-outline" size={22} color={theme.colors.textMuted} />
            <Text style={styles.stateText}>
              Sign in from the Inbox tab first, then come back here to use voice mode.
            </Text>
          </View>
        ) : null}

        {isProcessing ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.primaryStrong} />
            <Text style={styles.stateText}>Transcribing, thinking, and generating audio...</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent turns</Text>
          <Text style={styles.sectionSubtitle}>Newest first</Text>
        </View>

        {turns.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No voice turns yet</Text>
            <Text style={styles.emptyText}>
              Try asking for a reply draft, a content idea, or help phrasing a professional follow-up.
            </Text>
          </View>
        ) : null}

        {turns.map((turn) => {
          const isActiveTurn = activeTurnId === turn.id;
          const isPlayingThisTurn = isActiveTurn && playerStatus.playing;

          return (
            <View key={turn.id} style={styles.turnCard}>
              <View style={styles.turnHeader}>
                <View style={styles.turnPill}>
                  <Ionicons name="mic" size={12} color={theme.colors.primaryStrong} />
                  <Text style={styles.turnPillText}>You said</Text>
                </View>
                <Text style={styles.turnTimestamp}>{formatCreatedAtLabel(turn.createdAt)}</Text>
              </View>

              <Text style={styles.turnTranscript}>{turn.transcript}</Text>

              <View style={styles.replyCard}>
                <View style={styles.replyHeader}>
                  <View style={styles.turnPill}>
                    <Ionicons name="sparkles" size={12} color={theme.colors.primaryStrong} />
                    <Text style={styles.turnPillText}>Syncrolly AI</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleReplay(turn)}
                    style={({ pressed }) => [
                      styles.replyAction,
                      pressed && styles.pressedButton
                    ]}
                  >
                    <Ionicons
                      name={isPlayingThisTurn ? 'pause' : 'play'}
                      size={14}
                      color={theme.colors.primaryStrong}
                    />
                    <Text style={styles.replyActionText}>
                      {isPlayingThisTurn ? 'Pause' : 'Play'}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.replyText}>{turn.replyText}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface
  },
  pressedButton: {
    opacity: 0.8
  },
  headerText: {
    flex: 1
  },
  headerEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800'
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.lg
  },
  heroCard: {
    backgroundColor: '#eef4ff',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#d8e5ff'
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceContainerLowest
  },
  heroBadgeText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700'
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800'
  },
  heroText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  heroDisclaimer: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  controlCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  timerLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700'
  },
  timerValue: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  recordButton: {
    minHeight: 76,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg
  },
  recordButtonActive: {
    backgroundColor: '#ffe8e5',
    borderWidth: 1,
    borderColor: '#ffcec8'
  },
  pressedRecordButton: {
    transform: [{ scale: 0.985 }]
  },
  recordButtonDisabled: {
    opacity: 0.7
  },
  recordButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800'
  },
  recordButtonTextActive: {
    color: theme.colors.danger
  },
  controlHint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20
  },
  stateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder
  },
  stateText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: 'rgba(255, 155, 155, 0.12)',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: '#ffd0c7'
  },
  errorText: {
    flex: 1,
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800'
  },
  sectionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    borderStyle: 'dashed'
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  turnCard: {
    gap: theme.spacing.md
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm
  },
  turnPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: '#eff4ff',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  turnPillText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700'
  },
  turnTimestamp: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  turnTranscript: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder
  },
  replyCard: {
    backgroundColor: '#0d59b2',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm
  },
  replyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceContainerLowest,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  replyActionText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700'
  },
  replyText: {
    color: '#ffffff',
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600'
  }
});

