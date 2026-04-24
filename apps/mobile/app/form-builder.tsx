import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { getCreatorInquiryForm, saveCreatorInquiryForm } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type FormQuestionType, type InquiryFormDraft, type InquiryFormDraftQuestion } from '@syncrolly/core';
import { createQuestion, getDefaultFormDraft, getDraftFromInquiryForm, normalizeFormDraft } from '../lib/formBuilder';
import { useMobileSession } from '../lib/session';

function getQuestionTypeLabel(type: FormQuestionType): string {
  if (type === 'multiple_choice') {
    return 'Multiple choice';
  }

  if (type === 'short_text') {
    return 'Short text';
  }

  return 'Long form';
}

function getQuestionTypeHint(type: FormQuestionType): string {
  if (type === 'multiple_choice') {
    return 'Choose up to four options for this prompt.';
  }

  if (type === 'short_text') {
    return 'Single-line response. Best for quick factual answers.';
  }

  return 'Larger text area for thoughtful responses.';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while saving the form.';
}

export default function FormBuilderScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [draft, setDraft] = useState<InquiryFormDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isMounted = true;

    async function loadDraft() {
      setLoading(true);
      setFeedback(null);

      try {
        const savedForm = await getCreatorInquiryForm(currentSupabase, currentUser.id);

        if (!isMounted) {
          return;
        }

        setDraft(savedForm ? getDraftFromInquiryForm(savedForm) : getDefaultFormDraft());
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDraft(getDefaultFormDraft());
        setFeedback(getErrorMessage(error));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadDraft();

    return () => {
      isMounted = false;
    };
  }, [supabase, user?.id]);

  function updateDraft(updater: (current: InquiryFormDraft) => InquiryFormDraft) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return updater(current);
    });
  }

  function updateQuestion(questionId: string, updater: (question: InquiryFormDraftQuestion) => InquiryFormDraftQuestion) {
    updateDraft((current) => ({
      ...current,
      questions: current.questions.map((question) => (
        question.id === questionId ? updater(question) : question
      ))
    }));
  }

  function handleQuestionTypeChange(questionId: string, type: FormQuestionType) {
    updateQuestion(questionId, (question) => ({
      ...question,
      type,
      placeholder:
        type === 'multiple_choice'
          ? ''
          : type === 'short_text'
            ? question.placeholder || 'Type a short answer'
            : question.placeholder || 'Share more detail here',
      options:
        type === 'multiple_choice'
          ? (question.options.length ? question.options.slice(0, 4) : ['Option 1', 'Option 2'])
          : []
    }));
  }

  function handleAddQuestion(type: FormQuestionType) {
    updateDraft((current) => ({
      ...current,
      questions: [...current.questions, createQuestion(type)]
    }));
  }

  function handleRemoveQuestion(questionId: string) {
    updateDraft((current) => ({
      ...current,
      questions: current.questions.length <= 1
        ? current.questions
        : current.questions.filter((question) => question.id !== questionId)
    }));
  }

  function handleAddOption(questionId: string) {
    updateQuestion(questionId, (question) => ({
      ...question,
      options: question.options.length >= 4
        ? question.options
        : [...question.options, `Option ${question.options.length + 1}`]
    }));
  }

  function handleRemoveOption(questionId: string, optionIndex: number) {
    updateQuestion(questionId, (question) => ({
      ...question,
      options:
        question.options.length <= 2
          ? question.options
          : question.options.filter((_, index) => index !== optionIndex)
    }));
  }

  async function handleSave() {
    if (!draft || !supabase || !user || saving) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const normalizedDraft = normalizeFormDraft(draft);
      const savedForm = await saveCreatorInquiryForm(supabase, {
        creatorId: user.id,
        title: normalizedDraft.title,
        intro: normalizedDraft.intro,
        questions: normalizedDraft.questions
      });

      setDraft(getDraftFromInquiryForm(savedForm));
      setFeedback('Form saved to Supabase.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Add your Supabase keys in `apps/mobile/.env` to build real forms.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loading || !draft) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.loadingText}>Loading form builder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Sign in to build and save inquiry forms.</Text>
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
            <Text style={styles.headerTitle}>Build inquiry form</Text>
          </View>

          <Pressable onPress={() => router.push('/inquiry-preview')} style={styles.previewButton}>
            <LinearGradient
              colors={theme.gradients.brand}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.previewButtonFill}
            >
              <Text style={styles.previewButtonText}>Preview</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>Shape the intake before the DM starts.</Text>
            <Text style={styles.introBody}>
              This now saves the creator’s live form in Supabase, so preview and submissions use the same source of truth.
            </Text>
          </View>

          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Form title</Text>
            <TextInput
              value={draft.title}
              onChangeText={(value) => {
                updateDraft((current) => ({
                  ...current,
                  title: value
                }));
              }}
              placeholder="Curated Inquiry"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.metaInput}
            />

            <Text style={styles.metaLabel}>Intro</Text>
            <TextInput
              value={draft.intro}
              onChangeText={(value) => {
                updateDraft((current) => ({
                  ...current,
                  intro: value
                }));
              }}
              placeholder="Set the tone before the first question."
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.metaInput, styles.metaInputLarge]}
              multiline
              textAlignVertical="top"
            />
          </View>

          {draft.questions.map((question, index) => (
            <View key={question.id} style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <View style={styles.questionMeta}>
                  <Text style={styles.questionIndex}>Question {index + 1}</Text>
                  <Text style={styles.questionHint}>{getQuestionTypeHint(question.type)}</Text>
                </View>

                <Pressable
                  onPress={() => handleRemoveQuestion(question.id)}
                  style={[styles.removeQuestionButton, draft.questions.length <= 1 && styles.disabledButton]}
                  disabled={draft.questions.length <= 1}
                >
                  <Ionicons name="trash-outline" size={17} color={theme.colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <TextInput
                value={question.prompt}
                onChangeText={(value) => {
                  updateQuestion(question.id, (current) => ({
                    ...current,
                    prompt: value
                  }));
                }}
                placeholder="Question prompt"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.promptInput}
              />

              <View style={styles.typePickerRow}>
                {(['multiple_choice', 'short_text', 'long_text'] as const).map((type) => {
                  const isSelected = question.type === type;

                  return (
                    <Pressable
                      key={type}
                      onPress={() => handleQuestionTypeChange(question.id, type)}
                      style={[styles.typeChip, isSelected && styles.typeChipActive]}
                    >
                      <Text style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                        {getQuestionTypeLabel(type)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {question.type === 'multiple_choice' ? (
                <View style={styles.optionStack}>
                  {question.options.map((option, optionIndex) => (
                    <View key={`${question.id}-${optionIndex}`} style={styles.optionRow}>
                      <TextInput
                        value={option}
                        onChangeText={(value) => {
                          updateQuestion(question.id, (current) => ({
                            ...current,
                            options: current.options.map((currentOption, currentIndex) => (
                              currentIndex === optionIndex ? value : currentOption
                            ))
                          }));
                        }}
                        placeholder={`Option ${optionIndex + 1}`}
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.optionInput}
                      />

                      <Pressable
                        onPress={() => handleRemoveOption(question.id, optionIndex)}
                        style={[
                          styles.optionActionButton,
                          question.options.length <= 2 && styles.disabledButton
                        ]}
                        disabled={question.options.length <= 2}
                      >
                        <Ionicons name="remove" size={18} color={theme.colors.onSurfaceVariant} />
                      </Pressable>
                    </View>
                  ))}

                  <Pressable
                    onPress={() => handleAddOption(question.id)}
                    style={[styles.addOptionButton, question.options.length >= 4 && styles.disabledButton]}
                    disabled={question.options.length >= 4}
                  >
                    <Ionicons name="add" size={18} color={theme.colors.primaryStrong} />
                    <Text style={styles.addOptionText}>
                      {question.options.length >= 4 ? 'Maximum options reached' : 'Add option'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <TextInput
                  value={question.placeholder}
                  onChangeText={(value) => {
                    updateQuestion(question.id, (current) => ({
                      ...current,
                      placeholder: value
                    }));
                  }}
                  placeholder={question.type === 'short_text' ? 'Short answer placeholder' : 'Long-form placeholder'}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline={question.type === 'long_text'}
                  style={[styles.placeholderInput, question.type === 'long_text' && styles.placeholderInputLarge]}
                  textAlignVertical="top"
                />
              )}
            </View>
          ))}

          <View style={styles.addQuestionCard}>
            <Text style={styles.addQuestionTitle}>Add question</Text>
            <Text style={styles.addQuestionBody}>
              Drop in another step whenever you want to expand the form.
            </Text>

            <View style={styles.addQuestionRow}>
              {(['multiple_choice', 'short_text', 'long_text'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => handleAddQuestion(type)}
                  style={styles.addQuestionButton}
                >
                  <Ionicons
                    name={
                      type === 'multiple_choice'
                        ? 'checkbox-outline'
                        : type === 'short_text'
                          ? 'text-outline'
                          : 'document-text-outline'
                    }
                    size={18}
                    color={theme.colors.primaryStrong}
                  />
                  <Text style={styles.addQuestionButtonText}>{getQuestionTypeLabel(type)}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

          <Pressable onPress={handleSave} style={[styles.saveButton, saving && styles.disabledButton]} disabled={saving}>
            <LinearGradient
              colors={theme.gradients.brand}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.saveButtonFill}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save form</Text>
              )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
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
    backgroundColor: 'rgba(19,27,46,0.98)',
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
  previewButton: {
    minHeight: 40,
    borderRadius: 14,
    overflow: 'hidden'
  },
  previewButtonFill: {
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
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
  introCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 8
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
  metaCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 10
  },
  metaLabel: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  metaInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  metaInputLarge: {
    minHeight: 96,
    lineHeight: 22
  },
  questionCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 14,
    shadowColor: 'rgba(2, 6, 23, 0.42)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  questionMeta: {
    flex: 1,
    gap: 4
  },
  questionIndex: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  questionHint: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  removeQuestionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  promptInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  typePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  typeChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  typeChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: 'rgba(77,142,255,0.34)'
  },
  typeChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  typeChipTextActive: {
    color: theme.colors.textPrimary
  },
  optionStack: {
    gap: 10
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  optionInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  optionActionButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addOptionButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  addOptionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  placeholderInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  placeholderInputLarge: {
    minHeight: 128,
    lineHeight: 22
  },
  addQuestionCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: 'rgba(19,27,46,0.94)',
    gap: 12
  },
  addQuestionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  addQuestionBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  addQuestionRow: {
    gap: 10
  },
  addQuestionButton: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  addQuestionButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700'
  },
  feedbackText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonFill: {
    width: '100%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  disabledButton: {
    opacity: 0.45
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center'
  }
});
