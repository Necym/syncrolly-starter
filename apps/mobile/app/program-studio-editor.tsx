import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type InboxThreadSummary, type ProgramDetail, type ProgramLearner } from '@syncrolly/core';
import {
  createProgram,
  createProgramLesson,
  createProgramModule,
  deleteProgramLesson,
  deleteProgramModule,
  enrollStudentInProgram,
  getProgramDetails,
  listInboxThreads,
  removeStudentFromProgram,
  reorderProgramModule,
  reorderProgramLesson,
  updateProgram,
  updateProgramLesson,
  updateProgramModule,
  uploadProgramLessonAsset,
  uploadProgramThumbnail
} from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InlineNotice, { type InlineNoticeTone } from '../components/InlineNotice';
import SkeletonBlock from '../components/SkeletonBlock';
import {
  type PendingUploadImage,
  type PendingUploadLessonAsset,
  base64ToArrayBuffer,
  fileUriToArrayBuffer,
  pickImageForUpload,
  pickLessonDocumentForUpload,
  pickLessonVideoForUpload
} from '../lib/media';
import { getProgramFallbackGradient } from '../lib/programs';
import { getPreferredRole, useMobileSession } from '../lib/session';

type NoticeState = {
  tone: InlineNoticeTone;
  message: string;
};

type StudioTab = 'description' | 'structure' | 'learners';

const EDITORIAL_SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif'
});

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
  const seen = new Set<string>();

  return contacts.filter((contact) => {
    if (seen.has(contact.participantId)) {
      return false;
    }

    seen.add(contact.participantId);
    return true;
  });
}

function matchesContactSearch(contact: InboxThreadSummary, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return (
    contact.participantName.toLowerCase().includes(normalizedSearch) ||
    contact.subject.toLowerCase().includes(normalizedSearch) ||
    contact.accessLabel.toLowerCase().includes(normalizedSearch)
  );
}

function isDuplicateEnrollmentError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('program_enrollments_program_student_key') || message.includes('duplicate key');
}

function isMissingProgramMediaBucketError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('bucket not found') || message.includes('program-media');
}

function getUrlExtension(url?: string) {
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('.');
    return (segments.pop() || '').trim().toLowerCase();
  } catch {
    const sanitizedUrl = url.split('?')[0];
    const segments = sanitizedUrl.split('.');
    return (segments.pop() || '').trim().toLowerCase();
  }
}

function getLessonAssetKind(url?: string) {
  if (!url) {
    return 'draft' as const;
  }

  const extension = getUrlExtension(url);
  if (extension === 'pdf' || extension === 'doc' || extension === 'docx') {
    return 'document' as const;
  }

  return 'video' as const;
}

function getLessonAssetLabel(url?: string, durationLabel?: string) {
  if (durationLabel?.trim()) {
    return durationLabel.trim();
  }

  const assetKind = getLessonAssetKind(url);
  if (assetKind === 'document') {
    const extension = getUrlExtension(url);

    if (extension === 'pdf') {
      return 'PDF document';
    }

    if (extension === 'doc' || extension === 'docx') {
      return 'Word document';
    }

    return 'Document';
  }

  if (assetKind === 'video') {
    return 'Video lesson';
  }

  return 'Attachment needed';
}

export default function ProgramStudioEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ programId?: string | string[] }>();
  const routeProgramId = Array.isArray(params.programId) ? params.programId[0] : params.programId;
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const role = getPreferredRole(user);

  const [activeProgram, setActiveProgram] = useState<ProgramDetail | null>(null);
  const [contacts, setContacts] = useState<InboxThreadSummary[]>([]);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>('description');

  const [programTitle, setProgramTitle] = useState('');
  const [programSubtitle, setProgramSubtitle] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(undefined);
  const [pendingThumbnail, setPendingThumbnail] = useState<PendingUploadImage | null>(null);
  const [savingProgram, setSavingProgram] = useState(false);

  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonSummary, setLessonSummary] = useState('');
  const [pendingLessonAsset, setPendingLessonAsset] = useState<PendingUploadLessonAsset | null>(null);
  const [lessonDurationLabel, setLessonDurationLabel] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [savingLesson, setSavingLesson] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [movingLessonId, setMovingLessonId] = useState<string | null>(null);
  const [removeCurrentLessonAsset, setRemoveCurrentLessonAsset] = useState(false);
  const [moduleDrafts, setModuleDrafts] = useState<Record<string, { title: string; summary: string }>>({});
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null);
  const [creatingModule, setCreatingModule] = useState(false);
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);
  const [movingModuleId, setMovingModuleId] = useState<string | null>(null);

  const [contactSearch, setContactSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [enrollingStudent, setEnrollingStudent] = useState(false);
  const [removingLearnerId, setRemovingLearnerId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lessonComposerOffsetRef = useRef(0);

  const availableContacts = useMemo(
    () => dedupeContacts(contacts).filter((contact) => contact.status === 'active'),
    [contacts]
  );
  const enrolledStudentIds = useMemo(
    () => new Set((activeProgram?.learners ?? []).map((learner) => learner.studentId)),
    [activeProgram?.learners]
  );
  const filteredContacts = useMemo(
    () =>
      availableContacts.filter(
        (contact) =>
          !enrolledStudentIds.has(contact.participantId) && matchesContactSearch(contact, contactSearch)
      ),
    [availableContacts, contactSearch, enrolledStudentIds]
  );
  const selectedStudent = availableContacts.find((contact) => contact.participantId === selectedStudentId) ?? null;
  const editingLesson = activeProgram?.lessons.find((lesson) => lesson.id === editingLessonId) ?? null;
  const resolvedModules = activeProgram?.modules ?? [];
  const selectedModule = resolvedModules.find((module) => module.id === selectedModuleId) ?? resolvedModules[0] ?? null;

  useEffect(() => {
    if (!supabase || !user || role !== 'creator') {
      setContacts([]);
      setActiveProgram(null);
      return;
    }

    void loadEditor(routeProgramId ?? null);
  }, [role, routeProgramId, supabase, user?.id]);

  useEffect(() => {
    if (!activeProgram) {
      setModuleDrafts({});
      setSelectedModuleId(null);
      return;
    }

    setModuleDrafts(
      Object.fromEntries(
        activeProgram.modules.map((module) => [
          module.id,
          {
            title: module.title,
            summary: module.summary
          }
        ])
      )
    );

    setSelectedModuleId((current) =>
      current && activeProgram.modules.some((module) => module.id === current)
        ? current
        : activeProgram.modules[0]?.id ?? null
    );
  }, [activeProgram?.id, activeProgram?.modules]);

  useEffect(() => {
    if (!feedback || feedback.tone === 'error') {
      return;
    }

    const timeout = setTimeout(() => {
      setFeedback((current) => (current === feedback ? null : current));
    }, 3200);

    return () => {
      clearTimeout(timeout);
    };
  }, [feedback]);

  function syncProgramDraft(program: ProgramDetail | null) {
    setProgramTitle(program?.title ?? '');
    setProgramSubtitle(program?.subtitle ?? '');
    setProgramDescription(program?.description ?? '');
    setThumbnailUrl(program?.thumbnailUrl);
    setPendingThumbnail(null);
  }

  function resetLessonComposer() {
    setEditingLessonId(null);
    setLessonTitle('');
    setLessonSummary('');
    setPendingLessonAsset(null);
    setLessonDurationLabel('');
    setRemoveCurrentLessonAsset(false);
  }

  async function loadEditor(targetProgramId: string | null) {
    if (!supabase || !user) {
      return;
    }

    setLoadingScreen(true);

    if (!targetProgramId) {
      setActiveTab('description');
      setSelectedStudentId(null);
      setContactSearch('');
      resetLessonComposer();
    }

    try {
      const [nextContacts, nextProgram] = await Promise.all([
        listInboxThreads(supabase, user.id),
        targetProgramId ? getProgramDetails(supabase, user.id, 'creator', targetProgramId) : Promise.resolve(null)
      ]);

      setContacts(nextContacts);
      setActiveProgram(nextProgram);
      syncProgramDraft(nextProgram);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setLoadingScreen(false);
    }
  }

  async function handlePickThumbnail() {
    setFeedback(null);

    try {
      const pickedImage = await pickImageForUpload({
        aspect: [16, 9],
        quality: 0.84
      });

      if (!pickedImage) {
        return;
      }

      setPendingThumbnail(pickedImage);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    }
  }

  async function handleSaveProgram() {
    if (!supabase || !user) {
      return;
    }

    if (!programTitle.trim()) {
      setFeedback({
        tone: 'error',
        message: 'Add a program title.'
      });
      return;
    }

    setSavingProgram(true);
    setFeedback(null);

    try {
      let nextThumbnailUrl = thumbnailUrl;
      let thumbnailFeedback: string | null = null;

      if (pendingThumbnail) {
        try {
          nextThumbnailUrl = await uploadProgramThumbnail(supabase, {
            userId: user.id,
            fileData: base64ToArrayBuffer(pendingThumbnail.base64),
            contentType: pendingThumbnail.contentType,
            fileExtension: pendingThumbnail.fileExtension
          });
        } catch (error) {
          if (!isMissingProgramMediaBucketError(error)) {
            throw error;
          }

          thumbnailFeedback =
            activeProgram && thumbnailUrl
              ? 'Program updated, but the new thumbnail could not be uploaded because the program-media bucket is missing.'
              : 'Program saved without a thumbnail because the program-media bucket is missing.';
          nextThumbnailUrl = thumbnailUrl;
        }
      }

      const savedProgram = activeProgram
        ? await updateProgram(supabase, {
            programId: activeProgram.id,
            creatorId: user.id,
            title: programTitle,
            subtitle: programSubtitle,
            description: programDescription,
            thumbnailUrl: nextThumbnailUrl
          })
        : await createProgram(supabase, {
            creatorId: user.id,
            title: programTitle,
            subtitle: programSubtitle,
            description: programDescription,
            thumbnailUrl: nextThumbnailUrl
          });

      setFeedback({
        tone: thumbnailFeedback ? 'info' : 'success',
        message: thumbnailFeedback ?? (activeProgram ? 'Program updated.' : 'Program created.')
      });
      setActiveTab('description');
      router.replace({
        pathname: '/program-studio-editor',
        params: {
          programId: savedProgram.id
        }
      });
      await loadEditor(savedProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setSavingProgram(false);
    }
  }

  async function handleCreateLesson() {
    if (!supabase || !activeProgram || !user) {
      return;
    }

    if (!lessonTitle.trim()) {
      setFeedback({
        tone: 'error',
        message: 'Add a lesson title.'
      });
      return;
    }

    const targetModuleId = selectedModuleId ?? activeProgram.modules[0]?.id;

    if (!targetModuleId) {
      setFeedback({
        tone: 'error',
        message: 'Add a module before adding lessons.'
      });
      return;
    }

    if (!pendingLessonAsset && !editingLesson) {
      setFeedback({
        tone: 'error',
        message: 'Add a lesson video or document.'
      });
      return;
    }

    setSavingLesson(true);
    setFeedback(null);

    try {
      let uploadedAssetUrl = removeCurrentLessonAsset ? undefined : editingLesson?.videoUrl;

      if (pendingLessonAsset) {
        uploadedAssetUrl = await uploadProgramLessonAsset(supabase, {
          userId: user.id,
          fileData: await fileUriToArrayBuffer(pendingLessonAsset.uri),
          contentType: pendingLessonAsset.contentType,
          fileExtension: pendingLessonAsset.fileExtension
        });
      }

      if (editingLesson) {
        await updateProgramLesson(supabase, {
          lessonId: editingLesson.id,
          moduleId: targetModuleId,
          title: lessonTitle,
          summary: lessonSummary,
          videoUrl: uploadedAssetUrl,
          durationLabel: lessonDurationLabel || pendingLessonAsset?.displayLabel || editingLesson.durationLabel
        });
      } else {
        await createProgramLesson(supabase, {
          programId: activeProgram.id,
          moduleId: targetModuleId,
          title: lessonTitle,
          summary: lessonSummary,
          videoUrl: uploadedAssetUrl,
          durationLabel: lessonDurationLabel || pendingLessonAsset?.displayLabel
        });
      }

      resetLessonComposer();
      setFeedback({
        tone: 'success',
        message: editingLesson ? 'Lesson updated.' : 'Lesson added.'
      });
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setSavingLesson(false);
    }
  }

  function handleEditLesson(lesson: ProgramDetail['lessons'][number]) {
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title);
    setLessonSummary(lesson.summary);
    setLessonDurationLabel(lesson.durationLabel ?? '');
    setSelectedModuleId(lesson.moduleId);
    setPendingLessonAsset(null);
    setRemoveCurrentLessonAsset(false);
    setActiveTab('structure');
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(lessonComposerOffsetRef.current - 24, 0),
        animated: true
      });
    });
  }

  function handleDeleteLesson(lesson: ProgramDetail['lessons'][number]) {
    if (!supabase || !activeProgram || deletingLessonId) {
      return;
    }

    Alert.alert('Delete lesson?', 'This will remove the lesson and its saved progress.', [
      {
        text: 'Keep',
        style: 'cancel'
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDeleteLesson(lesson);
        }
      }
    ]);
  }

  async function confirmDeleteLesson(lesson: ProgramDetail['lessons'][number]) {
    if (!supabase || !activeProgram) {
      return;
    }

    setDeletingLessonId(lesson.id);
    setFeedback(null);

    try {
      await deleteProgramLesson(supabase, {
        lessonId: lesson.id
      });

      if (editingLessonId === lesson.id) {
        resetLessonComposer();
      }

      setFeedback({
        tone: 'success',
        message: 'Lesson deleted.'
      });
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setDeletingLessonId(null);
    }
  }

  async function handleMoveLesson(moduleId: string, lessonId: string, direction: -1 | 1) {
    if (!supabase || !activeProgram || movingLessonId) {
      return;
    }

    const moduleLessons = activeProgram.lessons
      .filter((lesson) => lesson.moduleId === moduleId)
      .sort((left, right) => left.position - right.position);
    const currentIndex = moduleLessons.findIndex((lesson) => lesson.id === lessonId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= moduleLessons.length) {
      return;
    }

    const currentLesson = moduleLessons[currentIndex];
    const targetLesson = moduleLessons[targetIndex];

    setMovingLessonId(lessonId);
    setFeedback(null);

    try {
      await reorderProgramLesson(supabase, {
        lessonId: currentLesson.id,
        swapLessonId: targetLesson.id,
        currentPosition: currentLesson.position,
        targetPosition: targetLesson.position
      });

      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setMovingLessonId(null);
    }
  }

  async function handleCreateModule() {
    if (!supabase || !activeProgram || creatingModule) {
      return;
    }

    if (!newModuleTitle.trim()) {
      setFeedback({
        tone: 'error',
        message: 'Add a module title.'
      });
      return;
    }

    setCreatingModule(true);
    setFeedback(null);

    try {
      const createdModule = await createProgramModule(supabase, {
        programId: activeProgram.id,
        title: newModuleTitle
      });

      setNewModuleTitle('');
      setSelectedModuleId(createdModule.id);
      setFeedback({
        tone: 'success',
        message: 'Module added.'
      });
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setCreatingModule(false);
    }
  }

  async function handleSaveModule(moduleId: string) {
    if (!supabase || !activeProgram || savingModuleId) {
      return;
    }

    const draft = moduleDrafts[moduleId];
    const currentModule = activeProgram.modules.find((module) => module.id === moduleId);

    if (!draft || !currentModule) {
      return;
    }

    if (!draft.title.trim()) {
      setFeedback({
        tone: 'error',
        message: 'Module title cannot be empty.'
      });
      return;
    }

    if (draft.title.trim() === currentModule.title && draft.summary.trim() === currentModule.summary) {
      return;
    }

    setSavingModuleId(moduleId);
    setFeedback(null);

    try {
      await updateProgramModule(supabase, {
        moduleId,
        title: draft.title,
        summary: draft.summary
      });

      setFeedback({
        tone: 'success',
        message: 'Module updated.'
      });
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setSavingModuleId(null);
    }
  }

  function handleDeleteModule(moduleId: string) {
    if (!activeProgram || deletingModuleId) {
      return;
    }

    const currentModule = activeProgram.modules.find((module) => module.id === moduleId);

    if (!currentModule) {
      return;
    }

    Alert.alert(
      'Delete module?',
      currentModule.lessonCount
        ? 'This will delete the module and all lessons inside it, including saved progress.'
        : 'This will delete the empty module.',
      [
        {
          text: 'Keep',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void confirmDeleteModule(moduleId);
          }
        }
      ]
    );
  }

  async function confirmDeleteModule(moduleId: string) {
    if (!supabase || !activeProgram) {
      return;
    }

    setDeletingModuleId(moduleId);
    setFeedback(null);

    try {
      await deleteProgramModule(supabase, {
        moduleId,
        programId: activeProgram.id
      });

      if (selectedModuleId === moduleId) {
        setSelectedModuleId(null);
      }

      setFeedback({
        tone: 'success',
        message: 'Module deleted.'
      });
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setDeletingModuleId(null);
    }
  }

  async function handleMoveModule(moduleId: string, direction: -1 | 1) {
    if (!supabase || !activeProgram || movingModuleId) {
      return;
    }

    const modules = [...activeProgram.modules].sort((left, right) => left.position - right.position);
    const currentIndex = modules.findIndex((module) => module.id === moduleId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= modules.length) {
      return;
    }

    const currentModule = modules[currentIndex];
    const targetModule = modules[targetIndex];

    setMovingModuleId(moduleId);
    setFeedback(null);

    try {
      await reorderProgramModule(supabase, {
        moduleId: currentModule.id,
        swapModuleId: targetModule.id,
        currentPosition: currentModule.position,
        targetPosition: targetModule.position
      });

      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setMovingModuleId(null);
    }
  }

  async function handleEnrollStudent() {
    if (!supabase || !activeProgram) {
      return;
    }

    if (!selectedStudentId) {
      setFeedback({
        tone: 'error',
        message: 'Pick a learner from an active conversation.'
      });
      return;
    }

    setEnrollingStudent(true);
    setFeedback(null);

    try {
      await enrollStudentInProgram(supabase, {
        programId: activeProgram.id,
        studentId: selectedStudentId
      });

      setFeedback({
        tone: 'success',
        message: `${selectedStudent?.participantName ?? 'Learner'} enrolled.`
      });
      setSelectedStudentId(null);
      setContactSearch('');
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: isDuplicateEnrollmentError(error)
          ? 'That learner already has access to this program.'
          : getErrorMessage(error)
      });
    } finally {
      setEnrollingStudent(false);
    }
  }

  function handleRemoveLearner(learner: ProgramLearner) {
    if (!supabase || !activeProgram || removingLearnerId) {
      return;
    }

    Alert.alert('Remove learner?', `Remove ${learner.displayName} from this program?`, [
      {
        text: 'Keep',
        style: 'cancel'
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void confirmRemoveLearner(learner);
        }
      }
    ]);
  }

  async function confirmRemoveLearner(learner: ProgramLearner) {
    if (!supabase || !activeProgram) {
      return;
    }

    setRemovingLearnerId(learner.enrollmentId);
    setFeedback(null);

    try {
      await removeStudentFromProgram(supabase, {
        enrollmentId: learner.enrollmentId
      });

      setFeedback({
        tone: 'success',
        message: `${learner.displayName} removed from the program.`
      });
      await loadEditor(activeProgram.id);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setRemovingLearnerId(null);
    }
  }

  async function handlePickLessonVideo() {
    setFeedback(null);

    try {
      const pickedVideo = await pickLessonVideoForUpload();

      if (!pickedVideo) {
        return;
      }

      setPendingLessonAsset(pickedVideo);
      setRemoveCurrentLessonAsset(false);

      if (!lessonDurationLabel && pickedVideo.displayLabel) {
        setLessonDurationLabel(pickedVideo.displayLabel);
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    }
  }

  async function handlePickLessonDocument() {
    setFeedback(null);

    try {
      const pickedDocument = await pickLessonDocumentForUpload();

      if (!pickedDocument) {
        return;
      }

      setPendingLessonAsset(pickedDocument);
      setRemoveCurrentLessonAsset(false);

      if (!lessonDurationLabel && pickedDocument.displayLabel) {
        setLessonDurationLabel(pickedDocument.displayLabel);
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    }
  }

  function handleJumpToLessonComposer() {
    if (!activeProgram) {
      setFeedback({
        tone: 'info',
        message: 'Save the program first, then add lessons.'
      });
      return;
    }

    setActiveTab('structure');
    setSelectedModuleId((current) => current ?? activeProgram.modules[0]?.id ?? null);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(lessonComposerOffsetRef.current - 24, 0),
        animated: true
      });
    });
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program Studio</Text>
          <Text style={styles.centerBody}>Add your Supabase keys in `apps/mobile/.env` to create real programs.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingScreen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <ProgramStudioEditorLoadingState />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program Studio</Text>
          <Text style={styles.centerBody}>Sign in to create programs, lessons, and enrollments.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'creator') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program Studio</Text>
          <Text style={styles.centerBody}>This space is for creators. Students will see their programs inside Feed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const thumbnailPreviewUri = pendingThumbnail?.previewUri ?? thumbnailUrl;
  const thumbnailGradient = getProgramFallbackGradient((activeProgram?.id ?? programTitle.trim()) || 'program-studio');
  const draftProgramTitle = programTitle.trim() || activeProgram?.title || 'Untitled Program';
  const moduleCountLabel = activeProgram?.moduleCount === 1 ? '1 module' : `${activeProgram?.moduleCount ?? 0} modules`;
  const lessonCountLabel = activeProgram?.lessonCount === 1 ? '1 lesson' : `${activeProgram?.lessonCount ?? 0} lessons`;
  const resolvedLessons = activeProgram?.lessons ?? [];
  const readyLessonCount = resolvedLessons.filter((lesson) => Boolean(lesson.videoUrl)).length;
  const draftLessonCount = resolvedLessons.length - readyLessonCount;
  const videoLessonCount = resolvedLessons.filter((lesson) => getLessonAssetKind(lesson.videoUrl) === 'video').length;
  const documentLessonCount = resolvedLessons.filter((lesson) => getLessonAssetKind(lesson.videoUrl) === 'document').length;
  const tabItems: Array<{ key: StudioTab; label: string; requiresSavedProgram?: boolean }> = [
    { key: 'description', label: 'Description' },
    { key: 'structure', label: 'Structure', requiresSavedProgram: true },
    { key: 'learners', label: 'Learners', requiresSavedProgram: true }
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={['#08101f', '#0b1326', '#111a2f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.backgroundBase}
          />
          <View style={styles.backgroundGlowTop} />
          <View style={styles.backgroundGlowBottom} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.editorialHero}>
            <Text style={styles.editorialEyebrow}>{activeProgram ? 'Program editor' : 'New program'}</Text>
            <Text style={styles.editorialTitle}>{draftProgramTitle}</Text>
          </View>

          {feedback ? <InlineNotice tone={feedback.tone} message={feedback.message} /> : null}

          <View style={styles.studioTabRow}>
            {tabItems.map((tab) => {
              const disabled = Boolean(tab.requiresSavedProgram && !activeProgram);
              const isActive = activeTab === tab.key;

              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    if (!disabled) {
                      setActiveTab(tab.key);
                    }
                  }}
                  style={styles.studioTabButton}
                >
                  <Text
                    style={[
                      styles.studioTabText,
                      isActive && styles.studioTabTextActive,
                      disabled && styles.studioTabTextDisabled
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {isActive ? <View style={styles.studioTabUnderline} /> : null}
                </Pressable>
              );
            })}
          </View>

          {activeTab === 'description' ? (
            <>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>Description</Text>
                    <Text style={styles.cardTitle}>Program details</Text>
                  </View>
                </View>

                <Pressable style={styles.thumbnailFrame} onPress={() => void handlePickThumbnail()}>
                  {thumbnailPreviewUri ? (
                    <Image source={{ uri: thumbnailPreviewUri }} style={styles.thumbnailImage} />
                  ) : (
                    <LinearGradient colors={thumbnailGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.thumbnailFallback}>
                      <Text style={styles.thumbnailFallbackText}>{programTitle.trim() || 'Program thumbnail'}</Text>
                    </LinearGradient>
                  )}
                  <View style={styles.thumbnailOverlay}>
                    <View style={styles.thumbnailOverlayChip}>
                      <Ionicons name="image-outline" size={14} color="#ffffff" />
                      <Text style={styles.thumbnailOverlayText}>{thumbnailPreviewUri ? 'Change thumbnail' : 'Add thumbnail'}</Text>
                    </View>
                  </View>
                </Pressable>

                <View style={styles.thumbnailActionRow}>
                  <Pressable style={styles.secondaryButton} onPress={() => void handlePickThumbnail()}>
                    <Text style={styles.secondaryButtonText}>{thumbnailPreviewUri ? 'Replace' : 'Choose image'}</Text>
                  </Pressable>
                  {thumbnailPreviewUri ? (
                    <Pressable
                      style={styles.ghostButton}
                      onPress={() => {
                        setPendingThumbnail(null);
                        setThumbnailUrl(undefined);
                      }}
                    >
                      <Text style={styles.ghostButtonText}>Use gradient</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Title</Text>
                  <TextInput
                    value={programTitle}
                    onChangeText={setProgramTitle}
                    placeholder="6-Week Content Accelerator"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.textInput}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Subtitle</Text>
                  <TextInput
                    value={programSubtitle}
                    onChangeText={setProgramSubtitle}
                    placeholder="Short promise or framing line"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.textInput}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Description</Text>
                  <TextInput
                    value={programDescription}
                    onChangeText={setProgramDescription}
                    placeholder="A short introduction to the program."
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.textInput, styles.textArea]}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <Pressable style={styles.primaryButton} onPress={() => void handleSaveProgram()} disabled={savingProgram}>
                  <LinearGradient
                    colors={theme.gradients.brand}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={styles.primaryButtonFill}
                  >
                    <Text style={styles.primaryButtonText}>{savingProgram ? 'Saving...' : activeProgram ? 'Save changes' : 'Create program'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          ) : null}

          {activeTab === 'structure' ? (
            activeProgram ? (
              <>
                <View style={styles.programOutlineCard}>
                  <View style={styles.programOutlineHeader}>
                    <View style={styles.programOutlineGrip}>
                      <Ionicons name="albums-outline" size={18} color="#7c8496" />
                    </View>

                    <View style={styles.programOutlineHeaderCopy}>
                      <Text style={styles.programOutlineTitle}>Program structure</Text>
                      <Text style={styles.programOutlineMeta}>{moduleCountLabel} - {lessonCountLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.structureSummaryRow}>
                    <View style={styles.structureSummaryChip}>
                      <Text style={styles.structureSummaryValue}>{readyLessonCount}</Text>
                      <Text style={styles.structureSummaryLabel}>Ready</Text>
                    </View>
                    <View style={styles.structureSummaryChip}>
                      <Text style={styles.structureSummaryValue}>{draftLessonCount}</Text>
                      <Text style={styles.structureSummaryLabel}>Draft</Text>
                    </View>
                    <View style={styles.structureSummaryChip}>
                      <Text style={styles.structureSummaryValue}>{videoLessonCount}</Text>
                      <Text style={styles.structureSummaryLabel}>Videos</Text>
                    </View>
                    <View style={styles.structureSummaryChip}>
                      <Text style={styles.structureSummaryValue}>{documentLessonCount}</Text>
                      <Text style={styles.structureSummaryLabel}>Docs</Text>
                    </View>
                  </View>

                  <View style={styles.programOutlineSheet}>
                    {resolvedModules.length ? (
                      resolvedModules.map((module, moduleIndex) => {
                        const moduleDraft = moduleDrafts[module.id] ?? { title: module.title, summary: module.summary };

                        return (
                          <View key={module.id} style={styles.programModuleCard}>
                            <View style={styles.programModuleHeader}>
                              <View style={styles.programModuleNumber}>
                                <Text style={styles.programModuleNumberText}>{moduleIndex + 1}</Text>
                              </View>

                              <View style={styles.programModuleCopy}>
                                <TextInput
                                  value={moduleDraft.title}
                                  onChangeText={(value) =>
                                    setModuleDrafts((current) => ({
                                      ...current,
                                      [module.id]: {
                                        title: value,
                                        summary: current[module.id]?.summary ?? module.summary
                                      }
                                    }))
                                  }
                                  onBlur={() => void handleSaveModule(module.id)}
                                  placeholder="Module title"
                                  placeholderTextColor={theme.colors.textMuted}
                                  style={styles.programModuleTitleInput}
                                />
                                <Text style={styles.programModuleMeta}>
                                  {module.lessonCount === 1 ? '1 lesson' : `${module.lessonCount} lessons`} - {module.progressPercent}% built
                                </Text>
                              </View>

                              <View style={styles.programModuleActions}>
                                <Pressable
                                  style={styles.lessonActionButton}
                                  onPress={() => void handleMoveModule(module.id, -1)}
                                  disabled={moduleIndex === 0 || movingModuleId === module.id}
                                >
                                  <Ionicons
                                    name="chevron-up"
                                    size={16}
                                    color={moduleIndex === 0 ? '#c6ccda' : theme.colors.textSecondary}
                                  />
                                </Pressable>
                                <Pressable
                                  style={styles.lessonActionButton}
                                  onPress={() => void handleMoveModule(module.id, 1)}
                                  disabled={moduleIndex === resolvedModules.length - 1 || movingModuleId === module.id}
                                >
                                  <Ionicons
                                    name="chevron-down"
                                    size={16}
                                    color={moduleIndex === resolvedModules.length - 1 ? '#c6ccda' : theme.colors.textSecondary}
                                  />
                                </Pressable>
                                <Pressable
                                  style={styles.lessonActionButton}
                                  onPress={() => void handleSaveModule(module.id)}
                                  disabled={savingModuleId === module.id}
                                >
                                  {savingModuleId === module.id ? (
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                  ) : (
                                    <Ionicons name="checkmark" size={15} color={theme.colors.textSecondary} />
                                  )}
                                </Pressable>
                                <Pressable
                                  style={styles.lessonActionButton}
                                  onPress={() => handleDeleteModule(module.id)}
                                  disabled={deletingModuleId === module.id || resolvedModules.length <= 1}
                                >
                                  {deletingModuleId === module.id ? (
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                  ) : (
                                    <Ionicons
                                      name="trash-outline"
                                      size={15}
                                      color={resolvedModules.length <= 1 ? '#c6ccda' : theme.colors.textSecondary}
                                    />
                                  )}
                                </Pressable>
                              </View>
                            </View>

                            <View style={styles.programModuleLessonList}>
                              {module.lessons.length ? (
                                module.lessons.map((lesson, index) => (
                                  <View key={lesson.id} style={styles.programLessonRow}>
                                    <View style={styles.programLessonDrag}>
                                      <Text style={styles.programLessonPosition}>{index + 1}</Text>
                                    </View>

                                    <View
                                      style={[
                                        styles.programLessonIcon,
                                        getLessonAssetKind(lesson.videoUrl) === 'video'
                                          ? styles.programLessonIconVideo
                                          : getLessonAssetKind(lesson.videoUrl) === 'document'
                                            ? styles.programLessonIconDocument
                                            : styles.programLessonIconDraft
                                      ]}
                                    >
                                      <Ionicons
                                        name={
                                          getLessonAssetKind(lesson.videoUrl) === 'video'
                                            ? 'play'
                                            : getLessonAssetKind(lesson.videoUrl) === 'document'
                                              ? 'document-text'
                                              : 'document-text-outline'
                                        }
                                        size={16}
                                        color={getLessonAssetKind(lesson.videoUrl) === 'video' ? theme.colors.primaryStrong : '#677489'}
                                      />
                                    </View>

                                    <View style={styles.programLessonCopy}>
                                      <Text style={styles.programLessonTitle}>{lesson.title}</Text>
                                      <View style={styles.programLessonMetaRow}>
                                        <Text style={styles.programLessonMeta}>{getLessonAssetLabel(lesson.videoUrl, lesson.durationLabel)}</Text>
                                        <View
                                          style={[
                                            styles.lessonStatusPill,
                                            lesson.videoUrl ? styles.lessonStatusPillReady : styles.lessonStatusPillDraft
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.lessonStatusText,
                                              lesson.videoUrl ? styles.lessonStatusTextReady : null
                                            ]}
                                          >
                                            {lesson.videoUrl ? 'Ready' : 'Draft'}
                                          </Text>
                                        </View>
                                      </View>
                                    </View>

                                    <View style={styles.programLessonActions}>
                                      <Pressable
                                        style={styles.lessonActionButton}
                                        onPress={() => void handleMoveLesson(module.id, lesson.id, -1)}
                                        disabled={index === 0 || movingLessonId === lesson.id}
                                      >
                                        <Ionicons
                                          name="chevron-up"
                                          size={16}
                                          color={index === 0 ? '#c6ccda' : theme.colors.textSecondary}
                                        />
                                      </Pressable>
                                      <Pressable
                                        style={styles.lessonActionButton}
                                        onPress={() => void handleMoveLesson(module.id, lesson.id, 1)}
                                        disabled={index === module.lessons.length - 1 || movingLessonId === lesson.id}
                                      >
                                        <Ionicons
                                          name="chevron-down"
                                          size={16}
                                          color={index === module.lessons.length - 1 ? '#c6ccda' : theme.colors.textSecondary}
                                        />
                                      </Pressable>
                                      <Pressable style={styles.lessonActionButton} onPress={() => handleEditLesson(lesson)}>
                                        <Ionicons name="create-outline" size={15} color={theme.colors.textSecondary} />
                                      </Pressable>
                                      <Pressable
                                        style={styles.lessonActionButton}
                                        onPress={() => handleDeleteLesson(lesson)}
                                        disabled={deletingLessonId === lesson.id}
                                      >
                                        {deletingLessonId === lesson.id ? (
                                          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                        ) : (
                                          <Ionicons name="trash-outline" size={15} color={theme.colors.textSecondary} />
                                        )}
                                      </Pressable>
                                    </View>
                                  </View>
                                ))
                              ) : (
                                <View style={styles.emptyInset}>
                                  <Text style={styles.emptyInsetText}>No lessons in this module yet.</Text>
                                </View>
                              )}
                            </View>

                            <Pressable
                              style={styles.outlineAddLessonRow}
                              onPress={() => {
                                setSelectedModuleId(module.id);
                                handleJumpToLessonComposer();
                              }}
                            >
                              <Ionicons name="add-circle" size={16} color="#6b7280" />
                              <Text style={styles.outlineAddLessonText}>Add lesson to this module</Text>
                            </Pressable>
                          </View>
                        );
                      })
                    ) : (
                      <View style={styles.emptyInset}>
                        <Text style={styles.emptyInsetText}>No modules yet. Add the first module below.</Text>
                      </View>
                    )}

                    <View style={styles.addModuleRow}>
                      <TextInput
                        value={newModuleTitle}
                        onChangeText={setNewModuleTitle}
                        placeholder="Module 2: Foundations"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.addModuleInput}
                      />
                      <Pressable
                        style={[styles.addModuleButton, creatingModule && styles.primaryButtonDisabled]}
                        onPress={() => void handleCreateModule()}
                        disabled={creatingModule}
                      >
                        {creatingModule ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Ionicons name="add" size={18} color="#ffffff" />
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View
                  style={styles.card}
                  onLayout={(event) => {
                    lessonComposerOffsetRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>Structure</Text>
                      <Text style={styles.cardTitle}>{editingLesson ? 'Edit lesson' : 'Add a lesson'}</Text>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Module</Text>
                    <View style={styles.modulePickerRow}>
                      {resolvedModules.map((module) => {
                        const isSelected = selectedModule?.id === module.id;

                        return (
                          <Pressable
                            key={module.id}
                            style={[styles.modulePickerChip, isSelected && styles.modulePickerChipActive]}
                            onPress={() => setSelectedModuleId(module.id)}
                          >
                            <Text style={[styles.modulePickerChipText, isSelected && styles.modulePickerChipTextActive]}>
                              {module.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Lesson title</Text>
                    <TextInput
                      value={lessonTitle}
                      onChangeText={setLessonTitle}
                      placeholder="Lesson 1: Positioning your offer"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.textInput}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Summary</Text>
                    <TextInput
                      value={lessonSummary}
                      onChangeText={setLessonSummary}
                      placeholder="One short paragraph on what the learner should focus on."
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.textInput, styles.textAreaSmall]}
                      multiline
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Lesson media</Text>
                    <Pressable
                      style={styles.uploadField}
                      onPress={() =>
                        void (pendingLessonAsset?.kind === 'document' ? handlePickLessonDocument() : handlePickLessonVideo())
                      }
                    >
                      <View style={styles.uploadFieldIcon}>
                        <Ionicons
                          name={pendingLessonAsset?.kind === 'document' ? 'document-text-outline' : 'videocam-outline'}
                          size={18}
                          color={theme.colors.primaryStrong}
                        />
                      </View>
                      <View style={styles.uploadFieldCopy}>
                        <Text style={styles.uploadFieldTitle}>
                          {pendingLessonAsset ? pendingLessonAsset.fileName : 'Choose a video, PDF, or Word document'}
                        </Text>
                        <Text style={styles.uploadFieldMeta}>
                          {pendingLessonAsset
                            ? `${pendingLessonAsset.displayLabel ?? 'Media ready'}${
                                pendingLessonAsset.fileSize
                                  ? ` - ${Math.max(1, Math.round(pendingLessonAsset.fileSize / (1024 * 1024)))} MB`
                                  : ''
                              }`
                            : 'Upload once, then learners open it inside the app.'}
                        </Text>
                      </View>
                      <Ionicons name="cloud-upload-outline" size={18} color="#6b7280" />
                    </Pressable>
                    {pendingLessonAsset ? (
                      <View style={styles.uploadActionRow}>
                        <Pressable style={styles.secondaryButton} onPress={() => void handlePickLessonVideo()}>
                          <Text style={styles.secondaryButtonText}>
                            {pendingLessonAsset.kind === 'video' ? 'Replace video' : 'Choose video'}
                          </Text>
                        </Pressable>
                        <Pressable style={styles.secondaryButton} onPress={() => void handlePickLessonDocument()}>
                          <Text style={styles.secondaryButtonText}>
                            {pendingLessonAsset.kind === 'document' ? 'Replace document' : 'Choose document'}
                          </Text>
                        </Pressable>
                        <Pressable style={styles.secondaryButton} onPress={() => setPendingLessonAsset(null)}>
                          <Text style={styles.secondaryButtonText}>Remove</Text>
                        </Pressable>
                      </View>
                    ) : editingLesson && editingLesson.videoUrl && !removeCurrentLessonAsset ? (
                      <>
                        <View style={styles.currentAssetCard}>
                          <View style={styles.currentAssetIcon}>
                            <Ionicons
                              name={getLessonAssetKind(editingLesson.videoUrl) === 'document' ? 'document-text-outline' : 'videocam-outline'}
                              size={18}
                              color={theme.colors.primaryStrong}
                            />
                          </View>
                          <View style={styles.currentAssetCopy}>
                            <Text style={styles.currentAssetTitle}>Current asset</Text>
                            <Text style={styles.currentAssetMeta}>
                              {getLessonAssetLabel(editingLesson.videoUrl, editingLesson.durationLabel)}
                            </Text>
                          </View>
                          <View style={[styles.lessonStatusPill, styles.lessonStatusPillReady]}>
                            <Text style={[styles.lessonStatusText, styles.lessonStatusTextReady]}>Attached</Text>
                          </View>
                        </View>
                        <View style={styles.uploadActionRow}>
                          <Pressable
                            style={styles.secondaryButton}
                            onPress={() => setRemoveCurrentLessonAsset(true)}
                          >
                            <Text style={styles.secondaryButtonText}>Remove current media</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : editingLesson && removeCurrentLessonAsset ? (
                      <View style={styles.currentAssetWarning}>
                        <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
                        <Text style={styles.currentAssetWarningText}>
                          This lesson will save without media unless you upload a replacement.
                        </Text>
                      </View>
                    ) : editingLesson ? (
                      <Text style={styles.inlineHintText}>
                        Keep the current media, or upload a new file to replace it.
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Length or label</Text>
                    <TextInput
                      value={lessonDurationLabel}
                      onChangeText={setLessonDurationLabel}
                      placeholder="12 min or PDF document"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.textInput}
                    />
                  </View>

                  <View style={styles.lessonComposerActions}>
                    <Pressable style={styles.primaryButton} onPress={() => void handleCreateLesson()} disabled={savingLesson}>
                      <LinearGradient
                        colors={theme.gradients.brand}
                        end={{ x: 1, y: 1 }}
                        start={{ x: 0, y: 0 }}
                        style={styles.primaryButtonFill}
                      >
                        <Text style={styles.primaryButtonText}>
                          {savingLesson ? (editingLesson ? 'Saving lesson...' : 'Adding lesson...') : editingLesson ? 'Save lesson' : 'Add lesson'}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                    {editingLesson ? (
                      <Pressable style={styles.secondaryButton} onPress={resetLessonComposer} disabled={savingLesson}>
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Save the program first</Text>
                <Text style={styles.cardBody}>
                  Once the program exists, the structure tab becomes the place to sequence lessons and upload content.
                </Text>
              </View>
            )
          ) : null}

          {activeTab === 'learners' ? (
            activeProgram ? (
              <>
                <View style={[styles.card, styles.compactCard]}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>Learners</Text>
                      <Text style={styles.cardTitle}>Active learners and progress</Text>
                    </View>
                  </View>

                  {activeProgram.learners.length ? (
                    <View style={styles.learnerList}>
                      {activeProgram.learners.map((learner) => (
                        <StudioLearnerProgressRow
                          key={learner.enrollmentId}
                          learner={learner}
                          removing={removingLearnerId === learner.enrollmentId}
                          onRemove={() => handleRemoveLearner(learner)}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyInset}>
                      <Text style={styles.emptyInsetText}>No learners yet. Add someone from your conversations below to give them access.</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.card, styles.compactCard]}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>Add learners</Text>
                      <Text style={styles.cardTitle}>Invite from conversations</Text>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Search</Text>
                    <TextInput
                      value={contactSearch}
                      onChangeText={setContactSearch}
                      placeholder="Search active conversations"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.textInput}
                    />
                  </View>

                  {filteredContacts.length ? (
                    <View style={styles.contactList}>
                      {filteredContacts.map((contact) => {
                        const isSelected = selectedStudentId === contact.participantId;

                        return (
                          <Pressable
                            key={contact.participantId}
                            onPress={() => setSelectedStudentId(contact.participantId)}
                            style={[styles.contactRow, isSelected && styles.contactRowSelected]}
                          >
                            <View style={styles.contactAvatar}>
                              <Text style={styles.contactAvatarText}>{contact.participantInitials}</Text>
                            </View>
                            <View style={styles.contactCopy}>
                              <Text style={styles.contactName}>{contact.participantName}</Text>
                              <Text style={styles.contactMeta}>{contact.subject || contact.accessLabel}</Text>
                            </View>
                            {isSelected ? <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryStrong} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.emptyInset}>
                      <Text style={styles.emptyInsetText}>
                        {availableContacts.length
                          ? 'Everyone matching this search is already enrolled, or no contact matches the query.'
                          : 'No active conversations yet. Start a DM thread first, then enroll from here.'}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    style={[styles.primaryButton, !selectedStudentId && styles.primaryButtonDisabled]}
                    onPress={() => void handleEnrollStudent()}
                    disabled={!selectedStudentId || enrollingStudent}
                  >
                    <LinearGradient
                      colors={theme.gradients.brand}
                      end={{ x: 1, y: 1 }}
                      start={{ x: 0, y: 0 }}
                      style={styles.primaryButtonFill}
                    >
                      <Text style={styles.primaryButtonText}>
                        {enrollingStudent ? 'Enrolling...' : selectedStudent ? `Enroll ${selectedStudent.participantName}` : 'Enroll learner'}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Save the program first</Text>
                <Text style={styles.cardBody}>
                  Once the program exists, the learners tab will show each enrollee, their progress, and who you can add next.
                </Text>
              </View>
            )
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function StudioLearnerProgressRow({
  learner,
  removing,
  onRemove
}: {
  learner: ProgramLearner;
  removing: boolean;
  onRemove: () => void;
}) {
  const initials = learner.displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={styles.learnerRow}>
      {learner.avatarUrl ? (
        <Image source={{ uri: learner.avatarUrl }} style={styles.learnerAvatarImage} />
      ) : (
        <View style={[styles.learnerAvatarFallback, learner.accentColor ? { backgroundColor: learner.accentColor } : null]}>
          <Text style={styles.learnerAvatarFallbackText}>{initials || 'L'}</Text>
        </View>
      )}

      <View style={styles.learnerCopy}>
        <View style={styles.learnerTopRow}>
          <Text style={styles.learnerName}>{learner.displayName}</Text>
          <View style={styles.learnerTopActions}>
            <Text style={styles.learnerPercent}>{learner.progressPercent}%</Text>
            <Pressable style={styles.learnerRemoveButton} onPress={onRemove} disabled={removing}>
              {removing ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : (
                <Ionicons name="close-outline" size={16} color={theme.colors.textSecondary} />
              )}
            </Pressable>
          </View>
        </View>
        <Text style={styles.learnerMeta}>
          {learner.completedLessons} of {Math.max(learner.lessonCount, 1)} lessons complete
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(learner.progressPercent, 4)}%` }]} />
        </View>
      </View>
    </View>
  );
}

function ProgramStudioEditorLoadingState() {
  return (
    <View style={styles.loadingShell}>
      <View style={styles.loadingHeaderBlock}>
        <SkeletonBlock width={42} height={42} radius={21} />
        <SkeletonBlock width={120} height={12} />
        <SkeletonBlock width="56%" height={40} radius={14} />
        <SkeletonBlock width="84%" height={16} />
      </View>

      <SkeletonBlock height={54} radius={20} />
      <SkeletonBlock height={260} radius={26} />
      <SkeletonBlock height={320} radius={26} />
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
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundGlowTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: 56,
    right: -92,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.16)'
  },
  backgroundGlowBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    bottom: 80,
    left: -110,
    borderRadius: 999,
    backgroundColor: 'rgba(87, 27, 193, 0.16)'
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
    backgroundColor: 'rgba(19,27,46,0.98)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorialHero: {
    gap: 6,
    paddingTop: 2
  },
  editorialEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.05,
    textTransform: 'uppercase'
  },
  editorialTitle: {
    color: theme.colors.textPrimary,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  sectionEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  sectionTitle: {
    marginTop: 4,
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  studioTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineSoft
  },
  studioTabButton: {
    position: 'relative',
    paddingTop: 2,
    paddingBottom: 12
  },
  studioTabText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '700'
  },
  studioTabTextActive: {
    color: theme.colors.primaryStrong
  },
  studioTabTextDisabled: {
    color: '#6f7890'
  },
  studioTabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  card: {
    borderRadius: 24,
    backgroundColor: 'rgba(19,27,46,0.98)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 18,
    gap: 14,
    shadowColor: '#050910',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  compactCard: {
    padding: 16,
    gap: 12
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  cardTitle: {
    marginTop: 4,
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  cardBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  thumbnailFrame: {
    height: 188,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'flex-end'
  },
  thumbnailImage: {
    ...StyleSheet.absoluteFillObject
  },
  thumbnailFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 18
  },
  thumbnailFallbackText: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  thumbnailOverlay: {
    padding: 16
  },
  thumbnailOverlayChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(10, 16, 28, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  thumbnailOverlayText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  thumbnailActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap'
  },
  secondaryButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800'
  },
  ghostButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ghostButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800'
  },
  fieldGroup: {
    gap: 7
  },
  fieldLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
  textInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  textArea: {
    minHeight: 116
  },
  textAreaSmall: {
    minHeight: 88
  },
  uploadField: {
    minHeight: 74,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  uploadFieldIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadFieldCopy: {
    flex: 1,
    gap: 3
  },
  uploadFieldTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  uploadFieldMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  uploadActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap'
  },
  currentAssetCard: {
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  currentAssetIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  currentAssetCopy: {
    flex: 1,
    gap: 3
  },
  currentAssetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  currentAssetMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  currentAssetWarning: {
    borderRadius: 16,
    backgroundColor: 'rgba(245, 193, 108, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 193, 108, 0.28)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  currentAssetWarningText: {
    flex: 1,
    color: theme.colors.warning,
    fontSize: 12,
    lineHeight: 18
  },
  inlineHintText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  primaryButtonFill: {
    width: '100%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  primaryButtonDisabled: {
    opacity: 0.6
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  lessonComposerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap'
  },
  modulePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  modulePickerChip: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modulePickerChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primaryStrong
  },
  modulePickerChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800'
  },
  modulePickerChipTextActive: {
    color: theme.colors.textPrimary
  },
  programOutlineCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    overflow: 'hidden',
    shadowColor: '#050910',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  programOutlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  programOutlineGrip: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  programOutlineHeaderCopy: {
    flex: 1,
    gap: 4
  },
  structureSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  structureSummaryChip: {
    minWidth: 72,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2
  },
  structureSummaryValue: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  structureSummaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  programOutlineTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  programOutlineMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  programOutlineSheet: {
    gap: 2,
    padding: 6,
    backgroundColor: theme.colors.surfaceContainerLowest
  },
  programModuleCard: {
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 8,
    gap: 8
  },
  programModuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 4
  },
  programModuleNumber: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  programModuleNumberText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900'
  },
  programModuleCopy: {
    flex: 1,
    gap: 2
  },
  programModuleTitleInput: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    paddingVertical: 0
  },
  programModuleMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700'
  },
  programModuleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  programModuleLessonList: {
    gap: 6
  },
  addModuleRow: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  addModuleInput: {
    flex: 1,
    minHeight: 38,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 6
  },
  addModuleButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  programLessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  programLessonDrag: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  programLessonPosition: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900'
  },
  programLessonIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  programLessonIconVideo: {
    backgroundColor: theme.colors.primarySoft
  },
  programLessonIconDocument: {
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  programLessonIconDraft: {
    backgroundColor: theme.colors.warningSoft
  },
  programLessonCopy: {
    flex: 1,
    gap: 3
  },
  programLessonTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700'
  },
  programLessonMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  programLessonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  lessonStatusPill: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerHighest
  },
  lessonStatusPillReady: {
    backgroundColor: theme.colors.successSoft
  },
  lessonStatusPillDraft: {
    backgroundColor: theme.colors.warningSoft
  },
  lessonStatusText: {
    color: theme.colors.warning,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase'
  },
  lessonStatusTextReady: {
    color: theme.colors.success
  },
  programLessonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  lessonActionButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  outlineAddLessonRow: {
    minHeight: 52,
    marginHorizontal: 10,
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  outlineAddLessonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700'
  },
  learnerList: {
    gap: 10
  },
  learnerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  learnerAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 999
  },
  learnerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  learnerAvatarFallbackText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  learnerCopy: {
    flex: 1,
    gap: 4
  },
  learnerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center'
  },
  learnerTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  learnerName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    flex: 1
  },
  learnerPercent: {
    color: theme.colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800'
  },
  learnerRemoveButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  learnerMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  contactList: {
    gap: 8
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  contactRowSelected: {
    backgroundColor: theme.colors.primarySoft
  },
  contactAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  contactAvatarText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '800'
  },
  contactCopy: {
    flex: 1,
    gap: 2
  },
  contactName: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
  contactMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16
  },
  emptyInset: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceContainerHigh,
    padding: 14
  },
  emptyInsetText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  loadingShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 18
  },
  loadingHeaderBlock: {
    gap: 10
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
    fontSize: 28,
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

