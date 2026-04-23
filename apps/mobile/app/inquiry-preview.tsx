import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { getCreatorInquiryForm, submitInquiryForm } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { type InquiryForm, type InquiryFormDraft, type InquiryFormDraftQuestion } from '@syncrolly/core';
import { getDefaultFormDraft, getDraftFromInquiryForm } from '../lib/formBuilder';
import { useMobileSession } from '../lib/session';

type AnswerMap = Record<string, string>;

const baseContentBottomPadding = 132;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading the inquiry form.';
}

function getQuestionHelper(question: InquiryFormDraftQuestion): string {
  if (question.type === 'multiple_choice') {
    return 'Choose one option to keep moving.';
  }

  if (question.type === 'short_text') {
    return 'A quick one-line answer is enough here.';
  }

  return 'Share a bit more detail so the creator has good context.';
}

function isAnswerComplete(question: InquiryFormDraftQuestion, answer: string | undefined): boolean {
  const trimmedAnswer = answer?.trim() ?? '';

  if (question.type === 'multiple_choice') {
    return Boolean(trimmedAnswer);
  }

  if (question.type === 'short_text') {
    return trimmedAnswer.length >= 2;
  }

  return trimmedAnswer.length >= 12;
}

function getAnswerSummary(question: InquiryFormDraftQuestion, answer: string | undefined): string {
  const trimmedAnswer = answer?.trim() ?? '';

  if (trimmedAnswer) {
    return trimmedAnswer;
  }

  if (question.type === 'multiple_choice') {
    return 'Not selected yet';
  }

  return 'Waiting for a response';
}

function SummaryRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryMarker} />
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function InquiryPreviewScreen() {
  const router = useRouter();
  const { creatorId } = useLocalSearchParams<{ creatorId?: string | string[] }>();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef<Record<number, number>>({});
  const focusTargetLayoutsRef = useRef<Record<number, { relativeY: number; height: number }>>({});
  const formViewportHeightRef = useRef(0);
  const activeSectionRef = useRef<number | null>(null);
  const revealValuesRef = useRef<Animated.Value[]>([]);
  const keyboardInsetRef = useRef(0);
  const headerEntrance = useRef(new Animated.Value(0)).current;
  const progressValue = useRef(new Animated.Value(0)).current;
  const backgroundDrift = useRef(new Animated.Value(0)).current;
  const backgroundFloat = useRef(new Animated.Value(0)).current;
  const backgroundPulse = useRef(new Animated.Value(0)).current;
  const resolvedCreatorId = Array.isArray(creatorId) ? creatorId[0] : creatorId;
  const targetCreatorId = resolvedCreatorId ?? user?.id ?? null;
  const isOwnerPreview = Boolean(user && targetCreatorId && user.id === targetCreatorId);

  const [draft, setDraft] = useState<InquiryFormDraft | null>(null);
  const [persistedForm, setPersistedForm] = useState<InquiryForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [visibleSectionCount, setVisibleSectionCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const totalQuestionCount = draft?.questions.length ?? 0;
  const revealValues = revealValuesRef.current;
  const canSubmitInquiry = Boolean(user && persistedForm && !isOwnerPreview);

  const answeredCount = useMemo(() => {
    if (!draft) {
      return 0;
    }

    return draft.questions.reduce((count, question) => (
      isAnswerComplete(question, answers[question.id]) ? count + 1 : count
    ), 0);
  }, [answers, draft]);

  const progressTarget = totalQuestionCount ? answeredCount / totalQuestionCount : 0;

  const summaryItems = useMemo(() => {
    if (!draft) {
      return [];
    }

    return draft.questions.map((question, index) => ({
      label: `Question ${index + 1}`,
      value: getAnswerSummary(question, answers[question.id])
    }));
  }, [answers, draft]);

  useEffect(() => {
    keyboardInsetRef.current = keyboardInset;
  }, [keyboardInset]);

  useEffect(() => {
    if (!supabase || !user || !targetCreatorId) {
      setLoading(false);
      return;
    }

    const currentSupabase = supabase;
    const currentTargetCreatorId = targetCreatorId;
    let isMounted = true;

    async function loadForm() {
      setLoading(true);
      setFeedback(null);

      try {
        const nextForm = await getCreatorInquiryForm(currentSupabase, currentTargetCreatorId);

        if (!isMounted) {
          return;
        }

        if (nextForm) {
          setPersistedForm(nextForm);
          setDraft(getDraftFromInquiryForm(nextForm));
        } else if (isOwnerPreview) {
          setPersistedForm(null);
          setDraft(getDefaultFormDraft());
          setFeedback('No saved form yet. You are previewing the starter layout until you save one.');
        } else {
          setPersistedForm(null);
          setDraft(null);
          setFeedback('This creator has not published an inquiry form yet.');
        }

        setAnswers({});
        setSubmitted(false);
        setVisibleSectionCount(1);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (isOwnerPreview) {
          setPersistedForm(null);
          setDraft(getDefaultFormDraft());
        } else {
          setPersistedForm(null);
          setDraft(null);
        }

        setFeedback(getErrorMessage(error));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadForm();

    return () => {
      isMounted = false;
    };
  }, [isOwnerPreview, supabase, targetCreatorId, user?.id]);

  useEffect(() => {
    if (!draft) {
      return;
    }

    const totalSections = draft.questions.length + 1;
    revealValuesRef.current = Array.from({ length: totalSections }, (_, index) => (
      revealValuesRef.current[index] ?? new Animated.Value(0)
    ));

    headerEntrance.setValue(0);
    revealValuesRef.current.slice(0, totalSections).forEach((value) => value.setValue(0));

    Animated.stagger(80, [
      Animated.timing(headerEntrance, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(revealValuesRef.current[0], {
        toValue: 1,
        damping: 18,
        stiffness: 180,
        mass: 0.92,
        useNativeDriver: true
      })
    ]).start();
  }, [draft, headerEntrance]);

  useEffect(() => {
    Animated.timing(progressValue, {
      toValue: progressTarget,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [progressTarget, progressValue]);

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(backgroundDrift, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(backgroundDrift, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(backgroundFloat, {
          toValue: 1,
          duration: 7600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(backgroundFloat, {
          toValue: 0,
          duration: 7600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(backgroundPulse, {
          toValue: 1,
          duration: 6200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(backgroundPulse, {
          toValue: 0,
          duration: 6200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    driftLoop.start();
    floatLoop.start();
    pulseLoop.start();

    return () => {
      driftLoop.stop();
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, [backgroundDrift, backgroundFloat, backgroundPulse]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const nextInset = Math.max(event.endCoordinates.height - insets.bottom, 0);
      keyboardInsetRef.current = nextInset;
      setKeyboardInset(nextInset);

      if (activeSectionRef.current !== null) {
        setTimeout(() => {
          scrollToFocusTarget(activeSectionRef.current!, nextInset);
        }, Platform.OS === 'ios' ? 40 : 90);
      }
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardInsetRef.current = 0;
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  function scrollToSection(sectionIndex: number) {
    const nextY = sectionOffsetsRef.current[sectionIndex];

    if (typeof nextY !== 'number') {
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(nextY - 92, 0),
      animated: true
    });
  }

  function scrollToFocusTarget(sectionIndex: number, insetOverride?: number) {
    const sectionY = sectionOffsetsRef.current[sectionIndex];
    const targetLayout = focusTargetLayoutsRef.current[sectionIndex];
    const viewportHeight = formViewportHeightRef.current;

    if (typeof sectionY !== 'number' || !targetLayout || viewportHeight <= 0) {
      scrollToSection(sectionIndex);
      return;
    }

    const fieldTop = sectionY + targetLayout.relativeY;
    const fieldBottom = fieldTop + targetLayout.height;
    const visibleHeight = Math.max(viewportHeight - (insetOverride ?? keyboardInsetRef.current) - 28, 0);

    if (visibleHeight <= 0) {
      scrollToSection(sectionIndex);
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(fieldBottom - visibleHeight + 18, 0),
      animated: true
    });
  }

  function revealSection(nextVisibleCount: number) {
    if (nextVisibleCount <= visibleSectionCount) {
      return;
    }

    setVisibleSectionCount(nextVisibleCount);

    const animationValue = revealValuesRef.current[nextVisibleCount - 1];

    if (!animationValue) {
      return;
    }

    animationValue.setValue(0);
    Animated.spring(animationValue, {
      toValue: 1,
      damping: 18,
      stiffness: 180,
      mass: 0.9,
      useNativeDriver: true
    }).start();
  }

  function handleChoiceAnswer(question: InquiryFormDraftQuestion, questionIndex: number, value: string) {
    setAnswers((current) => ({
      ...current,
      [question.id]: value
    }));

    revealSection(questionIndex + 2);
  }

  function handleFieldFocus(sectionIndex: number) {
    activeSectionRef.current = sectionIndex;

    setTimeout(() => {
      scrollToFocusTarget(sectionIndex);
    }, 60);
  }

  async function handleSubmitPreview() {
    if (!supabase || !persistedForm || !user || isOwnerPreview || answeredCount !== persistedForm.questions.length || submitting) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await submitInquiryForm(supabase, {
        formId: persistedForm.id,
        answers: persistedForm.questions.map((question) => {
          const answerValue = answers[question.id] ?? '';

          if (question.type === 'multiple_choice') {
            const selectedOption = question.options.find((option) => option.label === answerValue);

            return {
              questionId: question.id,
              selectedOptionId: selectedOption?.id,
              answerText: selectedOption?.label
            };
          }

          return {
            questionId: question.id,
            answerText: answerValue.trim()
          };
        })
      });

      setSubmitted(true);
      setFeedback('Inquiry sent. The creator will see your answers tied to your profile.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Add your Supabase keys in `apps/mobile/.env` to load real inquiry forms.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.loadingText}>Loading form preview...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Sign in to preview or submit inquiry forms.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!draft) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <View style={styles.topBackWrap}>
            <Pressable onPress={() => router.back()} style={styles.topBackButton}>
              <Ionicons name="arrow-back" size={20} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <View style={styles.loadingState}>
            <Text style={styles.emptyTitle}>No inquiry form yet</Text>
            <Text style={styles.loadingText}>{feedback ?? 'This creator has not published an inquiry form yet.'}</Text>
          </View>
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
          <LinearGradient
            colors={['rgba(77, 142, 255, 0.16)', 'rgba(77, 142, 255, 0.05)', 'rgba(11, 19, 38, 0)']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0.05, y: 0 }}
            style={styles.backgroundWash}
          />
          <LinearGradient
            colors={['rgba(87, 27, 193, 0.18)', 'rgba(77, 142, 255, 0.08)', 'rgba(11, 19, 38, 0)']}
            end={{ x: 0.9, y: 0.9 }}
            start={{ x: 0.15, y: 0.1 }}
            style={styles.backgroundRibbon}
          />
          <Animated.View
            style={[
              styles.backgroundOrbPrimary,
              {
                opacity: backgroundPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.34, 0.54]
                }),
                transform: [
                  {
                    translateX: backgroundDrift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 18]
                    })
                  },
                  {
                    translateY: backgroundFloat.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -16]
                    })
                  }
                ]
              }
            ]}
          />
          <Animated.View
            style={[
              styles.backgroundOrbSecondary,
              {
                opacity: backgroundPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.24, 0.4]
                }),
                transform: [
                  {
                    translateX: backgroundDrift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -12]
                    })
                  },
                  {
                    translateY: backgroundFloat.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 10]
                    })
                  }
                ]
              }
            ]}
          />
          <LinearGradient
            colors={['rgba(11, 19, 38, 0)', 'rgba(11, 19, 38, 0.78)', '#0b1326']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0.5, y: 0.2 }}
            style={styles.backgroundFade}
          />
        </View>

        <Animated.View
          style={[
            styles.floatingHeader,
            {
              opacity: headerEntrance,
              transform: [
                {
                  translateY: headerEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.headerIconButton}>
              <Ionicons name="close" size={22} color={theme.colors.onSurfaceVariant} />
            </Pressable>

            <Text style={styles.headerTitle}>{draft.title}</Text>

            {isOwnerPreview ? (
              <Pressable onPress={() => router.push('/form-builder')} style={styles.headerHelpButton}>
                <Text style={styles.headerHelpText}>Edit</Text>
              </Pressable>
            ) : (
              <View style={styles.headerHelpSpacer} />
            )}
          </View>

          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%']
                  })
                }
              ]}
            />
          </View>
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.formArea}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          onLayout={(event) => {
            formViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={[styles.content, { paddingBottom: baseContentBottomPadding + keyboardInset }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <View style={styles.introCard}>
              <Text style={styles.introEyebrow}>{isOwnerPreview ? 'Preview' : 'Inquiry'}</Text>
              <Text style={styles.introTitle}>Inquiry form</Text>
              <Text style={styles.introBody}>{draft.intro}</Text>
            </View>

            {feedback ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>{feedback}</Text>
              </View>
            ) : null}

            {draft.questions.map((question, questionIndex) => {
              const sectionIndex = questionIndex + 1;
              const isVisible = sectionIndex <= visibleSectionCount;
              const currentAnswer = answers[question.id] ?? '';
              const canContinue = isAnswerComplete(question, currentAnswer);
              const isLastQuestion = questionIndex === draft.questions.length - 1;
              const revealValue = revealValues[questionIndex] ?? new Animated.Value(1);

              if (!isVisible) {
                return null;
              }

              return (
                <Animated.View
                  key={question.id}
                  onLayout={(event) => {
                    sectionOffsetsRef.current[sectionIndex] = event.nativeEvent.layout.y;
                  }}
                  style={[
                    styles.sectionBlock,
                    {
                      opacity: revealValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1]
                      }),
                      transform: [
                        {
                          translateY: revealValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [34, 0]
                          })
                        }
                      ]
                    }
                  ]}
                >
                  <View style={styles.questionIntro}>
                    <Text style={styles.questionEyebrow}>
                      <Text style={styles.questionEyebrowLine}>- </Text>
                      Question {sectionIndex}
                    </Text>
                    <Text style={[styles.questionTitle, question.type === 'long_text' && styles.longQuestionTitle]}>
                      {question.prompt}
                    </Text>
                    <Text style={styles.questionBody}>{getQuestionHelper(question)}</Text>
                  </View>

                  {question.type === 'multiple_choice' ? (
                    <View style={styles.optionStack}>
                      {question.options.map((option) => {
                        const isSelected = currentAnswer === option;

                        return (
                          <Pressable
                            key={option}
                            onPress={() => handleChoiceAnswer(question, questionIndex, option)}
                            style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                          >
                            <View style={styles.optionCopy}>
                              <Text style={styles.optionLabel}>Option</Text>
                              <Text style={[styles.optionValue, isSelected && styles.optionValueSelected]}>{option}</Text>
                            </View>

                            <View style={[styles.optionMarker, isSelected && styles.optionMarkerSelected]}>
                              {isSelected ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <>
                      <View
                        style={styles.textFieldWrap}
                        onLayout={(event) => {
                          focusTargetLayoutsRef.current[sectionIndex] = {
                            relativeY: event.nativeEvent.layout.y,
                            height: event.nativeEvent.layout.height
                          };
                        }}
                      >
                        <Text style={styles.textFieldLabel}>
                          {question.type === 'short_text' ? 'Short response' : 'Detailed response'}
                        </Text>
                        <TextInput
                          multiline={question.type === 'long_text'}
                          value={currentAnswer}
                          onChangeText={(value) => {
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: value
                            }));
                          }}
                          onFocus={() => {
                            handleFieldFocus(sectionIndex);
                          }}
                          onBlur={() => {
                            activeSectionRef.current = null;
                          }}
                          placeholder={question.placeholder}
                          placeholderTextColor={theme.colors.textMuted}
                          style={[
                            styles.textInput,
                            question.type === 'short_text' ? styles.shortTextInput : styles.longTextInput
                          ]}
                          textAlignVertical="top"
                          blurOnSubmit={question.type === 'short_text'}
                          returnKeyType={isLastQuestion ? 'done' : 'next'}
                        />
                      </View>

                      <View style={styles.briefFooter}>
                        <Text style={styles.briefHint}>
                          {canContinue
                            ? 'Nice. You can keep moving.'
                            : question.type === 'short_text'
                              ? 'Add a quick answer to unlock the next step.'
                              : 'Write a sentence or two to unlock the next step.'}
                        </Text>

                        <Pressable
                          disabled={!canContinue}
                          onPress={() => revealSection(sectionIndex + 1)}
                          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
                        >
                          <LinearGradient
                            colors={theme.gradients.brand}
                            end={{ x: 1, y: 1 }}
                            start={{ x: 0, y: 0 }}
                            style={styles.continueButtonFill}
                          >
                            <Text style={styles.continueButtonText}>{isLastQuestion ? 'Review answers' : 'Continue'}</Text>
                            <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                          </LinearGradient>
                        </Pressable>
                      </View>
                    </>
                  )}
                </Animated.View>
              );
            })}

            {visibleSectionCount >= draft.questions.length + 1 ? (
              <Animated.View
                style={[
                  styles.sectionBlock,
                  {
                    opacity: (revealValues[draft.questions.length] ?? new Animated.Value(1)).interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1]
                    }),
                    transform: [
                      {
                        translateY: (revealValues[draft.questions.length] ?? new Animated.Value(1)).interpolate({
                          inputRange: [0, 1],
                          outputRange: [34, 0]
                        })
                      }
                    ]
                  }
                ]}
              >
                <View style={styles.finalStepIntro}>
                  <Text style={styles.questionEyebrow}>
                    <Text style={styles.questionEyebrowLine}>- </Text>
                    Final Step
                  </Text>
                  <Text style={styles.finalStepTitle}>{isOwnerPreview ? 'Preview ready.' : 'Almost there.'}</Text>
                  <Text style={styles.finalStepBody}>
                    {isOwnerPreview
                      ? 'This is how the saved inquiry flow will feel before a message thread begins.'
                      : 'Review the answers once, then send the inquiry through to the creator.'}
                  </Text>
                </View>

                <View style={styles.summaryCard}>
                  <Text style={styles.summaryEyebrow}>Summary</Text>
                  <Text style={styles.summaryHeading}>Your selections</Text>

                  <View style={styles.summaryStack}>
                    {summaryItems.map((item) => (
                      <SummaryRow key={item.label} label={item.label} value={item.value} />
                    ))}
                  </View>
                </View>

                <View style={styles.finalActionRow}>
                  <Pressable onPress={() => scrollToSection(1)} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={18} color={theme.colors.onSurfaceVariant} />
                  </Pressable>

                  <Pressable
                    disabled={!canSubmitInquiry || answeredCount !== draft.questions.length || submitting}
                    onPress={handleSubmitPreview}
                    style={[
                      styles.submitButton,
                      (!canSubmitInquiry || answeredCount !== draft.questions.length || submitting) && styles.submitButtonDisabled
                    ]}
                  >
                    <LinearGradient
                      colors={theme.gradients.brand}
                      end={{ x: 1, y: 1 }}
                      start={{ x: 0, y: 0 }}
                      style={styles.submitButtonFill}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Text style={styles.submitButtonText}>
                            {isOwnerPreview
                              ? 'Preview only'
                              : persistedForm
                                ? 'Send Inquiry'
                                : 'Save form first'}
                          </Text>
                          <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>

                {submitted ? (
                  <View style={styles.successCard}>
                    <Ionicons name="sparkles" size={18} color={theme.colors.primaryStrong} />
                    <Text style={styles.successText}>Inquiry sent. The creator will see it tied to your profile.</Text>
                  </View>
                ) : null}
              </Animated.View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
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
  topBackWrap: {
    paddingHorizontal: 18,
    paddingTop: 8
  },
  topBackButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundWash: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundRibbon: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundOrbPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    top: 84,
    right: -88,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.2)'
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    width: 240,
    height: 240,
    bottom: 140,
    left: -76,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.16)'
  },
  backgroundFade: {
    ...StyleSheet.absoluteFillObject
  },
  floatingHeader: {
    backgroundColor: 'rgba(11,19,38,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineSoft,
    shadowColor: 'rgba(2, 6, 23, 0.48)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  headerRow: {
    minHeight: 62,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    color: theme.colors.primaryStrong,
    fontSize: 18,
    fontStyle: 'italic',
    fontFamily: theme.typography.headline
  },
  headerHelpButton: {
    minWidth: 54,
    alignItems: 'flex-end'
  },
  headerHelpSpacer: {
    width: 54
  },
  headerHelpText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.primaryStrong
  },
  formArea: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: baseContentBottomPadding,
    gap: 28
  },
  introCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8
  },
  introEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  introTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  introBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  noticeCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(77, 142, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(77, 142, 255, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  noticeText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700'
  },
  sectionBlock: {
    gap: 16
  },
  questionIntro: {
    gap: 8,
    width: '100%',
    alignSelf: 'stretch'
  },
  questionEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  questionEyebrowLine: {
    color: '#88aef2'
  },
  questionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontFamily: theme.typography.headline,
    width: '100%',
    maxWidth: '100%'
  },
  longQuestionTitle: {
    maxWidth: 300
  },
  questionBody: {
    maxWidth: 320,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24
  },
  optionStack: {
    gap: 10
  },
  optionCard: {
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: 'rgba(2, 6, 23, 0.42)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  optionCardSelected: {
    backgroundColor: 'rgba(77, 142, 255, 0.14)',
    borderColor: 'rgba(77, 142, 255, 0.34)'
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  optionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  optionValue: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    fontFamily: theme.typography.headline
  },
  optionValueSelected: {
    color: theme.colors.primaryStrong
  },
  optionMarker: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  optionMarkerSelected: {
    backgroundColor: theme.colors.primaryStrong
  },
  textFieldWrap: {
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: 'rgba(19,27,46,0.96)',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: 'rgba(2, 6, 23, 0.42)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  textFieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  textInput: {
    paddingHorizontal: 2,
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontFamily: theme.typography.body,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(77, 142, 255, 0.42)'
  },
  shortTextInput: {
    minHeight: 46,
    paddingTop: 6,
    paddingBottom: 10,
    lineHeight: 22
  },
  longTextInput: {
    minHeight: 150,
    paddingTop: 8,
    paddingBottom: 12,
    lineHeight: 28
  },
  briefFooter: {
    gap: 12
  },
  briefHint: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  continueButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    borderRadius: 11,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  continueButtonFill: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center'
  },
  continueButtonDisabled: {
    opacity: 0.45
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  finalStepIntro: {
    gap: 8
  },
  finalStepTitle: {
    color: theme.colors.textPrimary,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  finalStepBody: {
    maxWidth: 326,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24
  },
  summaryCard: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: 'rgba(2, 6, 23, 0.42)',
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  summaryEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9
  },
  summaryHeading: {
    marginTop: 6,
    color: theme.colors.textPrimary,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  summaryStack: {
    marginTop: 18,
    gap: 14
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12
  },
  summaryMarker: {
    width: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.outlineSoft
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  summaryValue: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    fontFamily: theme.typography.headline
  },
  finalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(2, 6, 23, 0.42)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  submitButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 13,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  submitButtonFill: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  submitButtonDisabled: {
    opacity: 0.55
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(77, 142, 255, 0.28)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  successText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700'
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: theme.typography.headline,
    textAlign: 'center'
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22
  }
});

