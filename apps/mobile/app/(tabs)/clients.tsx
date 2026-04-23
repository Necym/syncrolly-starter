import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type InboxThreadSummary, type ScheduledCall } from '@syncrolly/core';
import {
  createScheduledCall,
  deleteScheduledCall,
  listInboxThreads,
  listScheduledCalls,
  rescheduleScheduledCall,
  sendMessage,
  updateInquirySubmissionStatus
} from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileSession } from '../../lib/session';

type CalendarDay = {
  key: string;
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

const WEEKDAY_LABELS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const CALL_DOT_COLORS = [theme.colors.primaryStrong, '#5d6c86', '#ab5c6b'];
const DURATION_OPTIONS = [5, 15, 30] as const;
const DEFAULT_DURATION_MINUTES = 30;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 480;
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
type DurationPreset = (typeof DURATION_OPTIONS)[number];
type DurationMode = 'preset' | 'custom';
type PickerTarget = 'create' | 'edit';
type PickerMode = 'date' | 'time';
type SessionSupabaseClient = NonNullable<ReturnType<typeof useMobileSession>['supabase']>;

async function loadScheduleData(supabase: SessionSupabaseClient, userId: string, monthDate: Date) {
  const [contacts, scheduledCalls] = await Promise.all([
    listInboxThreads(supabase, userId),
    listScheduledCalls(supabase, userId, {
      startsAt: getMonthRangeStartIso(monthDate),
      endsAt: getMonthRangeEndIso(monthDate)
    })
  ]);

  return { contacts, scheduledCalls };
}

export default function CalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    openCreate?: string | string[];
    attendeeId?: string | string[];
    attendeeName?: string | string[];
    conversationId?: string | string[];
    submissionId?: string | string[];
    title?: string | string[];
  }>();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [displayMonth, setDisplayMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState(() => {
    const today = new Date();
    return toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [contacts, setContacts] = useState<InboxThreadSummary[]>([]);
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>([]);
  const [loadingView, setLoadingView] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [newCallTitle, setNewCallTitle] = useState('');
  const [newCallStartAt, setNewCallStartAt] = useState(() => buildLocalDateFromDateKeyAndMinutes(selectedDateKey, 11 * 60));
  const [newCallDurationMode, setNewCallDurationMode] = useState<DurationMode>('preset');
  const [newCallPresetDurationMinutes, setNewCallPresetDurationMinutes] =
    useState<DurationPreset>(DEFAULT_DURATION_MINUTES);
  const [newCallCustomDuration, setNewCallCustomDuration] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string | null>(null);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const [creatingCall, setCreatingCall] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [editCallTitle, setEditCallTitle] = useState('');
  const [editCallStartAt, setEditCallStartAt] = useState(() => new Date());
  const [editCallDurationMode, setEditCallDurationMode] = useState<DurationMode>('preset');
  const [editCallPresetDurationMinutes, setEditCallPresetDurationMinutes] =
    useState<DurationPreset>(DEFAULT_DURATION_MINUTES);
  const [editCallCustomDuration, setEditCallCustomDuration] = useState('');
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const [savingCallEdit, setSavingCallEdit] = useState(false);
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);
  const [pickerState, setPickerState] = useState<{ target: PickerTarget; mode: PickerMode } | null>(null);
  const [pickerDraftValue, setPickerDraftValue] = useState(() => new Date());
  const [durationInputFocus, setDurationInputFocus] = useState<PickerTarget | null>(null);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumedPrefillKeyRef = useRef<string | null>(null);

  const resolvedOpenCreate = Array.isArray(params.openCreate) ? params.openCreate[0] : params.openCreate;
  const resolvedAttendeeId = Array.isArray(params.attendeeId) ? params.attendeeId[0] : params.attendeeId;
  const resolvedAttendeeName = Array.isArray(params.attendeeName) ? params.attendeeName[0] : params.attendeeName;
  const resolvedConversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
  const resolvedSubmissionId = Array.isArray(params.submissionId) ? params.submissionId[0] : params.submissionId;
  const resolvedTitle = Array.isArray(params.title) ? params.title[0] : params.title;

  const availableContacts = dedupeContacts(contacts).filter((contact) => contact.status === 'active');
  const filteredContacts = availableContacts.filter((contact) => matchesAttendeeSearch(contact, attendeeSearch));
  const calendarDays = buildCalendarDays(displayMonth);
  const bookedMinutesByDate = getBookedMinutesByDate(scheduledCalls);
  const selectedEntries = scheduledCalls
    .filter((call) => toDateKeyFromIso(call.startsAt) === selectedDateKey)
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  function scheduleCalendarRefresh(delayMs = 90) {
    if (!supabase || !user) {
      return;
    }

    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;

      loadScheduleData(supabase, user.id, displayMonth)
        .then(({ contacts: nextContacts, scheduledCalls: nextCalls }) => {
          setContacts(nextContacts);
          setScheduledCalls(nextCalls);
          setFeedback(null);
        })
        .catch((error) => {
          setFeedback(getErrorMessage(error));
        });
    }, delayMs);
  }

  useEffect(() => {
    if (!supabase || !user) {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      setContacts([]);
      setScheduledCalls([]);
      setLoadingView(false);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isActive = true;

    async function loadScheduleState() {
      setLoadingView(true);

      try {
        const { contacts: nextContacts, scheduledCalls: nextCalls } = await loadScheduleData(
          currentSupabase,
          currentUser.id,
          displayMonth
        );

        if (!isActive) {
          return;
        }

        setContacts(nextContacts);
        setScheduledCalls(nextCalls);
        setFeedback(null);
      } catch (error) {
        if (isActive) {
          setFeedback(getErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setLoadingView(false);
        }
      }
    }

    void loadScheduleState();

    return () => {
      isActive = false;
    };
  }, [displayMonth, supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user) {
      return;
    }

    const staleChannelPrefix = 'realtime:calendar-live:';

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic.startsWith(staleChannelPrefix)) {
        void supabase.removeChannel(existingChannel);
      }
    }

    const channel = supabase
      .channel(`calendar-live:${user.id}:${displayMonth.getTime()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_calls',
          filter: `owner_id=eq.${user.id}`
        },
        () => {
          scheduleCalendarRefresh(45);
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
          scheduleCalendarRefresh(45);
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
  }, [displayMonth, supabase, user?.id]);

  useEffect(() => {
    if (resolvedOpenCreate !== '1') {
      consumedPrefillKeyRef.current = null;
      return;
    }

    if (loadingView) {
      return;
    }

    const prefillKey = [resolvedOpenCreate, resolvedAttendeeId, resolvedConversationId, resolvedSubmissionId, resolvedTitle].join('|');

    if (consumedPrefillKeyRef.current === prefillKey) {
      return;
    }

    consumedPrefillKeyRef.current = prefillKey;

    openCreateModal({
      attendeeId: resolvedAttendeeId ?? null,
      attendeeName: resolvedAttendeeName ?? null,
      conversationId: resolvedConversationId ?? null,
      title: resolvedTitle ?? null
    });
  }, [
    loadingView,
    resolvedAttendeeId,
    resolvedAttendeeName,
    resolvedConversationId,
    resolvedOpenCreate,
    resolvedSubmissionId,
    resolvedTitle
  ]);

  function handleMonthChange(offset: number) {
    const nextMonth = addMonths(displayMonth, offset);
    setDisplayMonth(nextMonth);
    setSelectedDateKey(getSelectedDateForMonth(selectedDateKey, nextMonth));
  }

  function openCreateModal(prefill?: {
    attendeeId?: string | null;
    attendeeName?: string | null;
    conversationId?: string | null;
    title?: string | null;
  }) {
    const today = new Date();
    const todayDateKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const prefilledContact =
      availableContacts.find((contact) => contact.participantId === prefill?.attendeeId) ??
      availableContacts.find((contact) => contact.id === prefill?.conversationId) ??
      null;

    setDisplayMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDateKey(todayDateKey);
    setCreateVisible(true);
    setCreateFeedback(null);
    setNewCallTitle(prefill?.title?.trim() || '');
    setNewCallStartAt(buildLocalDateFromDateKeyAndMinutes(todayDateKey, 11 * 60));
    setNewCallDurationMode('preset');
    setNewCallPresetDurationMinutes(DEFAULT_DURATION_MINUTES);
    setNewCallCustomDuration('');
    setAttendeeSearch(prefilledContact?.participantName ?? prefill?.attendeeName?.trim() ?? '');
    setSelectedAttendeeId(prefilledContact?.participantId ?? availableContacts[0]?.participantId ?? null);
  }

  function closeCreateModal() {
    if (creatingCall) {
      return;
    }

    Keyboard.dismiss();
    setDurationInputFocus(null);
    closeNativePicker();
    setCreateVisible(false);
    setCreateFeedback(null);
  }

  function openEditModal(call: ScheduledCall) {
    const durationDraft = getDurationDraftForCall(call);

    setEditingCallId(call.id);
    setEditCallTitle(call.title);
    setEditCallStartAt(new Date(call.startsAt));
    setEditCallDurationMode(durationDraft.mode);
    setEditCallPresetDurationMinutes(durationDraft.presetDuration);
    setEditCallCustomDuration(durationDraft.customDuration);
    setEditFeedback(null);
    setEditVisible(true);
  }

  function closeEditModal() {
    if (savingCallEdit) {
      return;
    }

    Keyboard.dismiss();
    setDurationInputFocus(null);
    closeNativePicker();
    setEditVisible(false);
    setEditingCallId(null);
    setEditFeedback(null);
  }

  function openNativePicker(target: PickerTarget, mode: PickerMode) {
    const nextValue = target === 'create' ? newCallStartAt : editCallStartAt;
    Keyboard.dismiss();
    setDurationInputFocus(null);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: nextValue,
        mode,
        display: 'default',
        onValueChange: (_, value) => {
          const currentValue = target === 'create' ? newCallStartAt : editCallStartAt;
          const nextPickerValue = mode === 'date' ? mergeDatePart(currentValue, value) : mergeTimePart(currentValue, value);

          if (target === 'create') {
            setNewCallStartAt(nextPickerValue);
          } else {
            setEditCallStartAt(nextPickerValue);
          }
        }
      });
      return;
    }

    setPickerState({ target, mode });
    setPickerDraftValue(new Date(nextValue.getTime()));
  }

  function closeNativePicker() {
    setPickerState(null);
  }

  function handleNativePickerValueChange(_: unknown, value: Date) {
    if (!pickerState) {
      return;
    }

    if (Platform.OS === 'android') {
      const currentValue = pickerState.target === 'create' ? newCallStartAt : editCallStartAt;
      const nextValue =
        pickerState.mode === 'date' ? mergeDatePart(currentValue, value) : mergeTimePart(currentValue, value);

      if (pickerState.target === 'create') {
        setNewCallStartAt(nextValue);
      } else {
        setEditCallStartAt(nextValue);
      }

      closeNativePicker();
      return;
    }

    setPickerDraftValue(value);
  }

  function handleNativePickerDismiss() {
    closeNativePicker();
  }

  function applyNativePickerSelection() {
    if (!pickerState) {
      return;
    }

    const currentValue = pickerState.target === 'create' ? newCallStartAt : editCallStartAt;
    const nextValue =
      pickerState.mode === 'date'
        ? mergeDatePart(currentValue, pickerDraftValue)
        : mergeTimePart(currentValue, pickerDraftValue);

    if (pickerState.target === 'create') {
      setNewCallStartAt(nextValue);
    } else {
      setEditCallStartAt(nextValue);
    }

    closeNativePicker();
  }

  function renderInlinePicker(target: PickerTarget) {
    if (Platform.OS !== 'ios' || pickerState?.target !== target) {
      return null;
    }

    return (
      <View style={styles.inlinePickerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeNativePicker} />

        <View style={styles.inlinePickerCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{pickerState.mode === 'date' ? 'Pick Date' : 'Pick Time'}</Text>
              <Text style={styles.modalSubtitle}>Local time • {LOCAL_TIME_ZONE}</Text>
            </View>

            <Pressable style={styles.modalCloseButton} onPress={closeNativePicker}>
              <Ionicons name="close" size={18} color="#6b7280" />
            </Pressable>
          </View>

          <DateTimePicker
            value={pickerDraftValue}
            mode={pickerState.mode}
            display="spinner"
            onValueChange={handleNativePickerValueChange}
            onDismiss={handleNativePickerDismiss}
            themeVariant="light"
            textColor={theme.colors.textPrimary}
            accentColor={theme.colors.primaryStrong}
            style={styles.nativePicker}
          />

          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={closeNativePicker}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>

            <Pressable style={styles.primaryButton} onPress={applyNativePickerSelection}>
              <LinearGradient colors={theme.gradients.brand} style={styles.primaryButtonGradient}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  function selectCreateDuration(duration: DurationPreset) {
    Keyboard.dismiss();
    setDurationInputFocus(null);
    setNewCallDurationMode('preset');
    setNewCallPresetDurationMinutes(duration);
    setNewCallCustomDuration('');
  }

  function handleCreateCustomDurationChange(value: string) {
    const normalizedValue = normalizeDurationInput(value);
    setNewCallCustomDuration(normalizedValue);
    setNewCallDurationMode(normalizedValue ? 'custom' : 'preset');
  }

  function selectEditDuration(duration: DurationPreset) {
    Keyboard.dismiss();
    setDurationInputFocus(null);
    setEditCallDurationMode('preset');
    setEditCallPresetDurationMinutes(duration);
    setEditCallCustomDuration('');
  }

  function handleEditCustomDurationChange(value: string) {
    const normalizedValue = normalizeDurationInput(value);
    setEditCallCustomDuration(normalizedValue);
    setEditCallDurationMode(normalizedValue ? 'custom' : 'preset');
  }

  function dismissDurationKeyboard() {
    Keyboard.dismiss();
    setDurationInputFocus(null);
  }

  async function handleCreateCall() {
    if (!supabase || !user) {
      return;
    }

    if (!newCallTitle.trim()) {
      setCreateFeedback('Add a call title.');
      return;
    }

    if (!selectedAttendeeId) {
      setCreateFeedback('Pick a client for this call.');
      return;
    }

    const selectedConversation = availableContacts.find((contact) => contact.participantId === selectedAttendeeId);

    if (!selectedConversation) {
      setCreateFeedback('Pick someone from an active conversation.');
      return;
    }

    const durationMinutes = resolveDurationMinutes(
      newCallDurationMode,
      newCallPresetDurationMinutes,
      newCallCustomDuration
    );

    if (durationMinutes == null) {
      setCreateFeedback('Enter a valid duration in minutes.');
      return;
    }

    const scheduleValidationError = validateScheduledCallDraft(newCallStartAt, durationMinutes);

    if (scheduleValidationError) {
      setCreateFeedback(scheduleValidationError);
      return;
    }

    setCreatingCall(true);
    setCreateFeedback(null);

    try {
      const createDateKey = toDateKeyFromDate(newCallStartAt);
      await createScheduledCall(supabase, {
        ownerId: user.id,
        attendeeProfileId: selectedAttendeeId,
        conversationId: selectedConversation.id,
        senderId: user.id,
        title: newCallTitle,
        startsAt: newCallStartAt.toISOString(),
        endsAt: addMinutesToDate(newCallStartAt, durationMinutes).toISOString()
      });

      if (resolvedSubmissionId) {
        try {
          await updateInquirySubmissionStatus(supabase, {
            submissionId: resolvedSubmissionId,
            status: 'booked'
          });
        } catch {
          // Scheduling should still succeed even if the linked inquiry status fails to update.
        }
      }

      const { contacts: nextContacts, scheduledCalls: nextCalls } = await loadScheduleData(
        supabase,
        user.id,
        getMonthDateFromDateKey(createDateKey)
      );

      setContacts(nextContacts);
      setScheduledCalls(nextCalls);
      setDisplayMonth(getMonthDateFromDateKey(createDateKey));
      setSelectedDateKey(createDateKey);
      setCreateVisible(false);
      setFeedback(null);
    } catch (error) {
      setCreateFeedback(getErrorMessage(error));
    } finally {
      setCreatingCall(false);
    }
  }

  async function handleSaveCallEdit() {
    if (!supabase || !user || !editingCallId) {
      return;
    }

    if (!editCallTitle.trim()) {
      setEditFeedback('Add a call title.');
      return;
    }

    const durationMinutes = resolveDurationMinutes(
      editCallDurationMode,
      editCallPresetDurationMinutes,
      editCallCustomDuration
    );

    if (durationMinutes == null) {
      setEditFeedback('Enter a valid duration in minutes.');
      return;
    }

    const scheduleValidationError = validateScheduledCallDraft(editCallStartAt, durationMinutes);

    if (scheduleValidationError) {
      setEditFeedback(scheduleValidationError);
      return;
    }

    setSavingCallEdit(true);
    setEditFeedback(null);

    try {
      const updatedCall = await rescheduleScheduledCall(supabase, user.id, {
        callId: editingCallId,
        title: editCallTitle,
        startsAt: editCallStartAt.toISOString(),
        endsAt: addMinutesToDate(editCallStartAt, durationMinutes).toISOString()
      });

      const nextMonth = getMonthDateFromDateKey(toDateKeyFromDate(editCallStartAt));
      const updateMessageFeedback = await sendScheduleUpdateMessage({
        action: 'rescheduled',
        call: updatedCall
      });

      const { contacts: nextContacts, scheduledCalls: nextCalls } = await loadScheduleData(
        supabase,
        user.id,
        nextMonth
      );

      setContacts(nextContacts);
      setScheduledCalls(nextCalls);
      setDisplayMonth(nextMonth);
      setSelectedDateKey(toDateKeyFromDate(editCallStartAt));
      setEditVisible(false);
      setEditingCallId(null);
      setFeedback(updateMessageFeedback);
    } catch (error) {
      setEditFeedback(getErrorMessage(error));
    } finally {
      setSavingCallEdit(false);
    }
  }

  function handleDeleteCall(call: ScheduledCall) {
    if (!supabase || !user || deletingCallId) {
      return;
    }

    Alert.alert('Delete call?', 'This will remove it from both calendars.', [
      {
        text: 'Keep',
        style: 'cancel'
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDeleteCall(call);
        }
      }
    ]);
  }

  async function confirmDeleteCall(call: ScheduledCall) {
    if (!supabase || !user) {
      return;
    }

    setDeletingCallId(call.id);

    try {
      await deleteScheduledCall(supabase, user.id, { callId: call.id });
      const updateMessageFeedback = await sendScheduleUpdateMessage({
        action: 'canceled',
        call
      });

      const { contacts: nextContacts, scheduledCalls: nextCalls } = await loadScheduleData(
        supabase,
        user.id,
        displayMonth
      );

      setContacts(nextContacts);
      setScheduledCalls(nextCalls);
      setFeedback(updateMessageFeedback);
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setDeletingCallId(null);
    }
  }

  async function sendScheduleUpdateMessage(input: {
    action: 'rescheduled' | 'canceled';
    call: ScheduledCall;
  }) {
    if (!supabase || !user || !input.call.conversationId) {
      return null;
    }

    const messageBody =
      input.action === 'rescheduled'
        ? `Call rescheduled: ${input.call.title} • ${formatMessageScheduleWindow(input.call.startsAt, input.call.endsAt)}`
        : `Call canceled: ${input.call.title}`;

    try {
      await sendMessage(supabase, {
        conversationId: input.call.conversationId,
        senderId: user.id,
        body: messageBody
      });

      return null;
    } catch (error) {
      return `Call updated, but the DM update could not be sent: ${getErrorMessage(error)}`;
    }
  }

  function handleOpenProfile(profileId?: string) {
    if (!profileId) {
      return;
    }

    router.push({
      pathname: '/profile/[profileId]',
      params: { profileId }
    });
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerStageTitle}>Calendar</Text>
          <Text style={styles.centerStageBody}>
            Add your Supabase keys in `apps/mobile/.env` to load and save scheduled calls.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.centerStageBody}>Loading schedule...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerStageTitle}>Calendar</Text>
          <Text style={styles.centerStageBody}>Sign in from Inbox to manage your saved calls.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <View>
              <Text style={styles.calendarMonth}>{formatMonthLabel(displayMonth)}</Text>
              <Text style={styles.calendarYear}>{displayMonth.getFullYear()}</Text>
            </View>

            <View style={styles.calendarArrows}>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleMonthChange(-1)}
                style={({ pressed }) => [styles.calendarArrowButton, pressed && styles.calendarArrowButtonPressed]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.textSecondary} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => handleMonthChange(1)}
                style={({ pressed }) => [styles.calendarArrowButton, pressed && styles.calendarArrowButtonPressed]}
              >
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {calendarDays.map((day) => {
              const isSelected = day.dateKey === selectedDateKey;
              const bookedMinutes = bookedMinutesByDate[day.dateKey] ?? 0;
              const isInteractive = day.inCurrentMonth;
              const dayHeatStyle =
                bookedMinutes > 0 && day.inCurrentMonth && !isSelected
                  ? { backgroundColor: getCalendarHeatColor(bookedMinutes) }
                  : null;

              return (
                <View key={day.key} style={styles.dayCell}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!isInteractive}
                    onPress={() => setSelectedDateKey(day.dateKey)}
                    style={({ pressed }) => [
                      styles.dayButton,
                      day.isToday && !isSelected && styles.dayButtonToday,
                      dayHeatStyle,
                      isSelected && styles.dayButtonSelected,
                      !day.inCurrentMonth && styles.dayButtonDisabled,
                      pressed && isInteractive && !isSelected && styles.dayButtonPressed
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        !day.inCurrentMonth && styles.dayLabelDisabled,
                        day.isToday && !isSelected && styles.dayLabelToday,
                        isSelected && styles.dayLabelSelected
                      ]}
                    >
                      {day.dayNumber}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Selected day</Text>
            <Text style={styles.sectionTitle}>{formatLongDate(selectedDateKey)}</Text>
          </View>

          <View style={styles.sectionActions}>
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>
                {selectedEntries.length === 1 ? '1 call' : `${selectedEntries.length} calls`}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => openCreateModal()}
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            >
              <LinearGradient colors={theme.gradients.brand} style={styles.addButtonGradient}>
                <Ionicons name="add" size={18} color={theme.colors.onPrimary} />
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        {loadingView ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          </View>
        ) : selectedEntries.length ? (
          <View style={styles.agendaCard}>
            <View style={styles.agendaHeader}>
              <Text style={styles.scheduleTitle}>Schedule</Text>
            </View>

            <View style={styles.agendaList}>
              {selectedEntries.map((call, index) => {
                const isLast = index === selectedEntries.length - 1;
                const toneColor = CALL_DOT_COLORS[index % CALL_DOT_COLORS.length];

                return (
                  <View key={call.id} style={styles.agendaRow}>
                    <View style={styles.agendaRail}>
                      <View style={[styles.agendaDot, { backgroundColor: toneColor }]} />
                      {!isLast ? <View style={styles.agendaLine} /> : null}
                    </View>

                    <View style={styles.agendaCopy}>
                      <View style={styles.agendaTopRow}>
                        <Text style={styles.agendaTime}>{formatTimeRange(call.startsAt, call.endsAt)}</Text>
                        <View style={styles.agendaTopActions}>
                          <View
                            style={[
                              styles.callStatusIconWrap,
                              call.status === 'pending'
                                ? styles.callStatusIconWrapPending
                                : styles.callStatusIconWrapConfirmed
                            ]}
                          >
                            <Ionicons
                              name={getCallConfirmationIconName(call)}
                              size={14}
                              color={call.status === 'pending' ? '#8c6510' : '#16643a'}
                            />
                          </View>

                          <Pressable
                            accessibilityRole="button"
                            onPress={() => openEditModal(call)}
                            disabled={savingCallEdit || deletingCallId === call.id}
                            hitSlop={8}
                            style={({ pressed }) => [
                              styles.scheduleEventActionButton,
                              pressed && !savingCallEdit && deletingCallId !== call.id && styles.scheduleEventActionButtonPressed
                            ]}
                          >
                            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            onPress={() => handleDeleteCall(call)}
                            disabled={savingCallEdit || deletingCallId === call.id}
                            hitSlop={8}
                            style={({ pressed }) => [
                              styles.scheduleEventActionButton,
                              pressed && !savingCallEdit && deletingCallId !== call.id && styles.scheduleEventActionButtonPressed
                            ]}
                          >
                            {deletingCallId === call.id ? (
                              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            ) : (
                              <Ionicons name="trash-outline" size={14} color={theme.colors.textSecondary} />
                            )}
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.scheduleEventRow}>
                        <Text style={styles.scheduleEventName} numberOfLines={2}>
                          {call.title}
                        </Text>
                      </View>

                      <View style={styles.attendeeLine}>
                        <Text style={styles.attendeeLabel}>With:</Text>
                        {call.counterpartProfileId ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => handleOpenProfile(call.counterpartProfileId)}
                            style={({ pressed }) => [
                              styles.attendeeNameWrap,
                              pressed && styles.attendeeNameWrapPressed
                            ]}
                          >
                            <Text style={[styles.attendeeName, styles.attendeeNameLink]}>
                              {call.counterpartName ?? 'Client'}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.attendeeName}>{call.counterpartName ?? 'Client'}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No calls scheduled</Text>
            <Text style={styles.emptyBody}>Tap the plus button to create a real call for this day.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={closeCreateModal}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCreateModal} />

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New Call</Text>
                <Text style={styles.modalSubtitle}>{formatLongDate(toDateKeyFromDate(newCallStartAt))}</Text>
              </View>

              <Pressable style={styles.modalCloseButton} onPress={closeCreateModal} disabled={creatingCall}>
                <Ionicons name="close" size={18} color="#6b7280" />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Call title</Text>
              <TextInput
                value={newCallTitle}
                onChangeText={setNewCallTitle}
                placeholder="Brand collaboration sync"
                placeholderTextColor="rgba(66, 71, 82, 0.55)"
                style={styles.textInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Pressable style={styles.pickerFieldButton} onPress={() => openNativePicker('create', 'date')}>
                <Text style={styles.pickerFieldValue}>{formatPickerDate(newCallStartAt)}</Text>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Start time</Text>
              <Pressable style={styles.pickerFieldButton} onPress={() => openNativePicker('create', 'time')}>
                <Text style={styles.pickerFieldValue}>{formatPickerTime(newCallStartAt)}</Text>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((duration) => {
                  const isSelected =
                    newCallDurationMode === 'preset' && newCallPresetDurationMinutes === duration;

                  return (
                    <Pressable
                      key={duration}
                      onPress={() => selectCreateDuration(duration)}
                      style={[styles.durationChip, isSelected && styles.durationChipActive]}
                    >
                      <Text style={[styles.durationChipText, isSelected && styles.durationChipTextActive]}>
                        {duration}m
                      </Text>
                    </Pressable>
                  );
                })}

                <View
                  style={[
                    styles.durationChip,
                    styles.durationCustomChip,
                    newCallDurationMode === 'custom' && styles.durationChipActive
                  ]}
                >
                  <TextInput
                    value={newCallCustomDuration}
                    onChangeText={handleCreateCustomDurationChange}
                    onFocus={() => {
                      setNewCallDurationMode('custom');
                      setDurationInputFocus('create');
                    }}
                    onBlur={() => setDurationInputFocus((current) => (current === 'create' ? null : current))}
                    placeholder="..."
                    keyboardType="number-pad"
                    placeholderTextColor="rgba(66, 71, 82, 0.55)"
                    style={[
                      styles.durationCustomInputInline,
                      newCallDurationMode === 'custom' && styles.durationCustomInputInlineActive
                    ]}
                  />
                </View>

                {durationInputFocus === 'create' ? (
                  <Pressable style={[styles.durationChip, styles.durationDoneChip]} onPress={dismissDurationKeyboard}>
                    <Text style={styles.durationDoneText}>Done</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.fieldNote}>Local time • {LOCAL_TIME_ZONE}</Text>
            </View>

            {renderInlinePicker('create')}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Client</Text>
              {availableContacts.length ? (
                <>
                  <TextInput
                    value={attendeeSearch}
                    onChangeText={setAttendeeSearch}
                    placeholder="Search active conversations"
                    placeholderTextColor="rgba(66, 71, 82, 0.55)"
                    style={styles.textInput}
                  />

                  <ScrollView style={styles.attendeeList} showsVerticalScrollIndicator={false}>
                    {filteredContacts.length ? filteredContacts.map((contact) => {
                      const isSelected = selectedAttendeeId === contact.participantId;

                      return (
                        <Pressable
                          key={contact.participantId}
                          onPress={() => setSelectedAttendeeId(contact.participantId)}
                          style={[styles.attendeeOption, isSelected && styles.attendeeOptionSelected]}
                        >
                          <View style={styles.attendeeOptionCopy}>
                            <Text style={[styles.attendeeOptionName, isSelected && styles.attendeeOptionNameSelected]}>
                              {contact.participantName}
                            </Text>
                            <Text style={styles.attendeeOptionMeta}>{contact.subject || contact.accessLabel}</Text>
                          </View>

                          {isSelected ? <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryStrong} /> : null}
                        </Pressable>
                      );
                    }) : (
                      <View style={styles.modalEmptyState}>
                        <Text style={styles.modalEmptyText}>No active conversation matches that search.</Text>
                      </View>
                    )}
                  </ScrollView>
                </>
              ) : (
                <View style={styles.modalEmptyState}>
                  <Text style={styles.modalEmptyText}>No active conversations yet. Start a message thread first, then add calls here.</Text>
                </View>
              )}
            </View>

            {createFeedback ? <Text style={styles.feedbackText}>{createFeedback}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={closeCreateModal} disabled={creatingCall}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryButton, creatingCall && styles.primaryButtonDisabled]}
                onPress={() => void handleCreateCall()}
                disabled={creatingCall || !availableContacts.length}
              >
                <LinearGradient colors={theme.gradients.brand} style={styles.primaryButtonGradient}>
                  {creatingCall ? (
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create call</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={closeEditModal}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditModal} />

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Reschedule Call</Text>
                <Text style={styles.modalSubtitle}>Update the meeting details</Text>
              </View>

              <Pressable style={styles.modalCloseButton} onPress={closeEditModal} disabled={savingCallEdit}>
                <Ionicons name="close" size={18} color="#6b7280" />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Call title</Text>
              <TextInput
                value={editCallTitle}
                onChangeText={setEditCallTitle}
                placeholder="Brand collaboration sync"
                placeholderTextColor="rgba(66, 71, 82, 0.55)"
                style={styles.textInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Pressable style={styles.pickerFieldButton} onPress={() => openNativePicker('edit', 'date')}>
                <Text style={styles.pickerFieldValue}>{formatPickerDate(editCallStartAt)}</Text>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Start time</Text>
              <Pressable style={styles.pickerFieldButton} onPress={() => openNativePicker('edit', 'time')}>
                <Text style={styles.pickerFieldValue}>{formatPickerTime(editCallStartAt)}</Text>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((duration) => {
                  const isSelected =
                    editCallDurationMode === 'preset' && editCallPresetDurationMinutes === duration;

                  return (
                    <Pressable
                      key={`edit-${duration}`}
                      onPress={() => selectEditDuration(duration)}
                      style={[styles.durationChip, isSelected && styles.durationChipActive]}
                    >
                      <Text style={[styles.durationChipText, isSelected && styles.durationChipTextActive]}>
                        {duration}m
                      </Text>
                    </Pressable>
                  );
                })}

                <View
                  style={[
                    styles.durationChip,
                    styles.durationCustomChip,
                    editCallDurationMode === 'custom' && styles.durationChipActive
                  ]}
                >
                  <TextInput
                    value={editCallCustomDuration}
                    onChangeText={handleEditCustomDurationChange}
                    onFocus={() => {
                      setEditCallDurationMode('custom');
                      setDurationInputFocus('edit');
                    }}
                    onBlur={() => setDurationInputFocus((current) => (current === 'edit' ? null : current))}
                    placeholder="..."
                    keyboardType="number-pad"
                    placeholderTextColor="rgba(66, 71, 82, 0.55)"
                    style={[
                      styles.durationCustomInputInline,
                      editCallDurationMode === 'custom' && styles.durationCustomInputInlineActive
                    ]}
                  />
                </View>

                {durationInputFocus === 'edit' ? (
                  <Pressable style={[styles.durationChip, styles.durationDoneChip]} onPress={dismissDurationKeyboard}>
                    <Text style={styles.durationDoneText}>Done</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.fieldNote}>Local time • {LOCAL_TIME_ZONE}</Text>
            </View>

            {renderInlinePicker('edit')}

            {editFeedback ? <Text style={styles.feedbackText}>{editFeedback}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={closeEditModal} disabled={savingCallEdit}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryButton, savingCallEdit && styles.primaryButtonDisabled]}
                onPress={() => void handleSaveCallEdit()}
                disabled={savingCallEdit}
              >
                <LinearGradient colors={theme.gradients.brand} style={styles.primaryButtonGradient}>
                  {savingCallEdit ? (
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Save</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={false}
        transparent
        animationType="fade"
        onRequestClose={closeNativePicker}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNativePicker} />

          <View style={styles.pickerModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {pickerState?.mode === 'date' ? 'Pick Date' : 'Pick Time'}
                </Text>
                <Text style={styles.modalSubtitle}>Local time • {LOCAL_TIME_ZONE}</Text>
              </View>

              <Pressable style={styles.modalCloseButton} onPress={closeNativePicker}>
                <Ionicons name="close" size={18} color="#6b7280" />
              </Pressable>
            </View>

            <DateTimePicker
              value={pickerDraftValue}
              mode={pickerState?.mode ?? 'date'}
              display="spinner"
              onValueChange={handleNativePickerValueChange}
              onDismiss={handleNativePickerDismiss}
              style={styles.nativePicker}
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={closeNativePicker}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable style={styles.primaryButton} onPress={applyNativePickerSelection}>
                <LinearGradient colors={theme.gradients.brand} style={styles.primaryButtonGradient}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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

function dedupeContacts(contacts: InboxThreadSummary[]) {
  const seenIds = new Set<string>();

  return contacts.filter((contact) => {
    if (seenIds.has(contact.participantId)) {
      return false;
    }

    seenIds.add(contact.participantId);
    return true;
  });
}

function matchesAttendeeSearch(contact: InboxThreadSummary, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    contact.participantName.toLowerCase().includes(normalizedSearch) ||
    contact.subject.toLowerCase().includes(normalizedSearch)
  );
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function getSelectedDateForMonth(selectedDateKey: string, monthDate: Date) {
  const day = Number.parseInt(selectedDateKey.split('-')[2] ?? '1', 10);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  return toDateKey(monthDate.getFullYear(), monthDate.getMonth(), Math.min(day, daysInMonth));
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstDayOffset = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - firstDayOffset);
  const today = new Date();
  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    days.push({
      key: `${date.toISOString()}-${index}`,
      dateKey: toDateKey(date.getFullYear(), date.getMonth(), date.getDate()),
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    });
  }

  return days;
}

function getMonthRangeStartIso(monthDate: Date) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString();
}

function getMonthRangeEndIso(monthDate: Date) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString();
}

function toDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${`${monthIndex + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

function toDateKeyFromIso(value: string) {
  const date = new Date(value);
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
}

function formatLongDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${formatTime(startsAt)} - ${formatTimeWithZone(endsAt)}`;
}

function formatTimeWithZone(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

function getCallConfirmationIconName(call: ScheduledCall): 'checkmark' | 'hourglass-outline' {
  return call.status === 'pending' ? 'hourglass-outline' : 'checkmark';
}

function formatPickerDate(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(value);
}

function formatPickerTime(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(value);
}

function formatMessageScheduleWindow(startsAt: string, endsAt: string) {
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);

  return `${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(startDate)} - ${new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(endDate)}`;
}

function getCallDurationMinutes(startsAt: string, endsAt: string) {
  return Math.max(Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000), 1);
}

function getDurationDraftForCall(call: ScheduledCall): {
  mode: DurationMode;
  presetDuration: DurationPreset;
  customDuration: string;
} {
  const callDuration = getCallDurationMinutes(call.startsAt, call.endsAt);
  const matchingPreset = DURATION_OPTIONS.find((duration) => duration === callDuration);

  return {
    mode: matchingPreset ? 'preset' : 'custom',
    presetDuration: matchingPreset ?? DEFAULT_DURATION_MINUTES,
    customDuration: matchingPreset ? '' : String(callDuration)
  };
}

function normalizeDurationInput(value: string) {
  return value.replace(/[^0-9]/g, '').slice(0, 4);
}

function parseDurationMinutes(value: string) {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function resolveDurationMinutes(mode: DurationMode, presetDuration: number, customDuration: string) {
  if (mode === 'custom') {
    const customMinutes = parseDurationMinutes(customDuration);

    if (customMinutes == null || customMinutes < MIN_DURATION_MINUTES || customMinutes > MAX_DURATION_MINUTES) {
      return null;
    }

    return customMinutes;
  }

  return presetDuration > 0 ? presetDuration : null;
}

function getMonthDateFromDateKey(dateKey: string) {
  const [year, month] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  return new Date(year, month - 1, 1);
}

function toDateKeyFromDate(value: Date) {
  return toDateKey(value.getFullYear(), value.getMonth(), value.getDate());
}

function buildLocalDateFromDateKeyAndMinutes(dateKey: string, totalMinutes: number) {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const normalizedMinutes = Math.max(totalMinutes, 0);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function mergeDatePart(currentValue: Date, nextDate: Date) {
  return new Date(
    nextDate.getFullYear(),
    nextDate.getMonth(),
    nextDate.getDate(),
    currentValue.getHours(),
    currentValue.getMinutes(),
    0,
    0
  );
}

function mergeTimePart(currentValue: Date, nextTime: Date) {
  return new Date(
    currentValue.getFullYear(),
    currentValue.getMonth(),
    currentValue.getDate(),
    nextTime.getHours(),
    nextTime.getMinutes(),
    0,
    0
  );
}

function addMinutesToDate(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60000);
}

function validateScheduledCallDraft(startAt: Date, durationMinutes: number) {
  if (durationMinutes < MIN_DURATION_MINUTES) {
    return `Calls must be at least ${MIN_DURATION_MINUTES} minutes.`;
  }

  if (durationMinutes > MAX_DURATION_MINUTES) {
    return `Calls cannot be longer than ${Math.floor(MAX_DURATION_MINUTES / 60)} hours.`;
  }

  if (startAt.getTime() < Date.now()) {
    return 'Choose a time in the future.';
  }

  return null;
}

function getBookedMinutesByDate(calls: ScheduledCall[]) {
  return calls.reduce<Record<string, number>>((result, call) => {
    const dateKey = toDateKeyFromIso(call.startsAt);
    result[dateKey] = (result[dateKey] ?? 0) + getCallDurationMinutes(call.startsAt, call.endsAt);
    return result;
  }, {});
}

function getCalendarHeatColor(bookedMinutes: number) {
  const intensity = Math.min(bookedMinutes / 240, 1);
  const alpha = 0.08 + intensity * 0.28;
  return `rgba(198, 40, 40, ${alpha.toFixed(2)})`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 16
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12
  },
  centerStageTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  centerStageBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  calendarCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#161b24',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 5
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  calendarMonth: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  calendarYear: {
    marginTop: 2,
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  calendarArrows: {
    flexDirection: 'row',
    gap: 8
  },
  calendarArrowButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center'
  },
  calendarArrowButtonPressed: {
    opacity: 0.82
  },
  weekdayRow: {
    marginTop: 14,
    flexDirection: 'row'
  },
  weekdayLabel: {
    width: '14.2857%',
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.65,
    textAlign: 'center'
  },
  dayGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  dayCell: {
    width: '14.2857%',
    paddingVertical: 2,
    alignItems: 'center'
  },
  dayButton: {
    width: 36,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 7,
    paddingBottom: 5
  },
  dayButtonSelected: {
    backgroundColor: theme.colors.primaryStrong
  },
  dayButtonToday: {
    backgroundColor: theme.colors.primarySoft
  },
  dayButtonDisabled: {
    opacity: 0.34
  },
  dayButtonPressed: {
    backgroundColor: theme.colors.primarySoft
  },
  dayLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  dayLabelDisabled: {
    color: theme.colors.textMuted
  },
  dayLabelToday: {
    color: theme.colors.primaryStrong
  },
  dayLabelSelected: {
    color: '#ffffff'
  },
  feedbackText: {
    color: theme.colors.primaryStrong,
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
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  sectionTitle: {
    marginTop: 2,
    color: theme.colors.textPrimary,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  sectionCount: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionCountText: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800'
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    overflow: 'hidden'
  },
  addButtonPressed: {
    opacity: 0.82
  },
  addButtonGradient: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  agendaCard: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#161b24',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 5
  },
  agendaHeader: {
    gap: 6
  },
  scheduleTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  agendaList: {
    gap: 14
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12
  },
  agendaRail: {
    width: 16,
    alignItems: 'center'
  },
  agendaDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginTop: 6
  },
  agendaLine: {
    width: 1,
    flex: 1,
    marginTop: 5,
    backgroundColor: theme.colors.outlineSoft
  },
  agendaCopy: {
    flex: 1,
    paddingBottom: 2
  },
  agendaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  agendaTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  agendaTime: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800'
  },
  callStatusIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  callStatusIconWrapPending: {
    backgroundColor: theme.colors.warningSoft
  },
  callStatusIconWrapConfirmed: {
    backgroundColor: theme.colors.successSoft
  },
  scheduleEventName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    flex: 1
  },
  scheduleEventRow: {
    marginTop: 2,
  },
  scheduleEventActionButton: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scheduleEventActionButtonPressed: {
    opacity: 0.78
  },
  attendeeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4
  },
  attendeeLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase'
  },
  attendeeNameWrap: {
    borderRadius: 999,
    paddingVertical: 2
  },
  attendeeNameWrapPressed: {
    opacity: 0.82
  },
  attendeeName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  attendeeNameLink: {
    color: theme.colors.primaryStrong
  },
  emptyCard: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#161b24',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center'
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
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  modalSubtitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 13
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
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
  pickerFieldButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  pickerFieldValue: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600'
  },
  fieldNote: {
    marginTop: 8,
    color: theme.colors.textSecondary,
    fontSize: 12
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  durationChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  durationChipActive: {
    backgroundColor: theme.colors.primarySoft
  },
  durationChipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  durationChipTextActive: {
    color: theme.colors.primaryStrong
  },
  durationCustomChip: {
    minWidth: 58,
    paddingHorizontal: 0
  },
  durationCustomInputInline: {
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 0,
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  durationCustomInputInlineActive: {
    color: theme.colors.primaryStrong
  },
  durationDoneChip: {
    backgroundColor: theme.colors.primarySoft
  },
  durationDoneText: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800'
  },
  inlinePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.16)',
    zIndex: 20
  },
  inlinePickerCard: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#161b24',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 8
  },
  pickerModalCard: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft
  },
  nativePicker: {
    alignSelf: 'stretch'
  },
  attendeeList: {
    maxHeight: 190
  },
  attendeeOption: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8
  },
  attendeeOptionSelected: {
    backgroundColor: theme.colors.primarySoft
  },
  attendeeOptionCopy: {
    flex: 1,
    minWidth: 0
  },
  attendeeOptionName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  attendeeOptionNameSelected: {
    color: theme.colors.primaryStrong
  },
  attendeeOptionMeta: {
    marginTop: 3,
    color: theme.colors.textSecondary,
    fontSize: 12
  },
  modalEmptyState: {
    minHeight: 88,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center'
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    overflow: 'hidden'
  },
  primaryButtonDisabled: {
    opacity: 0.72
  },
  primaryButtonGradient: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 5
  },
  primaryButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 14,
    fontWeight: '800'
  }
});

