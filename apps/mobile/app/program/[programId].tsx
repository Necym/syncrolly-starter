import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { type ProgramDetail } from '@syncrolly/core';
import { getProgramDetails, markProgramLessonComplete, saveProgramLessonProgress } from '@syncrolly/data';
import { VideoView, type VideoPlayer } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import InlineNotice, { type InlineNoticeTone } from '../../components/InlineNotice';
import SkeletonBlock from '../../components/SkeletonBlock';
import { getProgramFallbackGradient } from '../../lib/programs';
import { getPreferredRole, useMobileSession } from '../../lib/session';

const NativeVideoModule = require('expo-video/build/NativeVideoModule').default as {
  VideoPlayer: new (...args: any[]) => VideoPlayer;
};

const EDITORIAL_SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif'
});
type NoticeState = {
  tone: InlineNoticeTone;
  message: string;
};
type ActiveLessonVideo = {
  lessonId: string;
  title: string;
  url: string;
};
type ActiveLessonDocument = {
  lessonId: string;
  title: string;
  url: string;
  viewerUrl: string;
};
type WatchSession = {
  lessonId: string | null;
  naturalWatchSeconds: number;
  furthestNaturalTime: number;
  lastPlayerTime: number;
  lastWallTime: number;
};
const COMPLETION_CONFETTI = [
  { id: 'c1', color: '#8eb7ff', x: -58, y: -54, rotate: '-18deg', size: 8 },
  { id: 'c2', color: '#ffffff', x: -28, y: -72, rotate: '14deg', size: 6 },
  { id: 'c3', color: '#4f88ff', x: 8, y: -68, rotate: '-10deg', size: 8 },
  { id: 'c4', color: '#cfe0ff', x: 34, y: -52, rotate: '20deg', size: 7 },
  { id: 'c5', color: '#ffffff', x: 62, y: -28, rotate: '-16deg', size: 6 },
  { id: 'c6', color: '#8eb7ff', x: -52, y: -12, rotate: '24deg', size: 7 },
  { id: 'c7', color: '#4f88ff', x: 48, y: -6, rotate: '-8deg', size: 8 },
  { id: 'c8', color: '#dce8ff', x: 18, y: -20, rotate: '28deg', size: 6 }
] as const;

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

  return 'Lesson draft';
}

function buildDocumentViewerUrl(url: string) {
  const extension = getUrlExtension(url);

  if (extension === 'doc' || extension === 'docx') {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
}

export default function ProgramDetailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ programId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const role = getPreferredRole(user);
  const programId = Array.isArray(params.programId) ? params.programId[0] : params.programId;
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [feedback, setFeedback] = useState<NoticeState | null>(null);
  const [completingLessonId, setCompletingLessonId] = useState<string | null>(null);
  const [activeLessonVideo, setActiveLessonVideo] = useState<ActiveLessonVideo | null>(null);
  const [activeLessonDocument, setActiveLessonDocument] = useState<ActiveLessonDocument | null>(null);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const [showVideoCompletionCard, setShowVideoCompletionCard] = useState(false);
  const [isSeekingVideo, setIsSeekingVideo] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState({
    currentTime: 0,
    duration: 0,
    playing: false,
    muted: false
  });
  const videoPlayer = useMemo<VideoPlayer>(() => new NativeVideoModule.VideoPlayer(), []);
  const autoCompletedLessonIdsRef = useRef<Set<string>>(new Set());
  const completionCardAnimation = useRef(new Animated.Value(0)).current;
  const completionConfettiAnimation = useRef(new Animated.Value(0)).current;
  const seekTouchAreaRef = useRef<View | null>(null);
  const seekBoundsRef = useRef({
    pageX: 0,
    width: 0
  });
  const seekPreviewTimeRef = useRef<number | null>(null);
  const wasPlayingBeforeSeekRef = useRef(false);
  const watchSessionRef = useRef<WatchSession>({
    lessonId: null,
    naturalWatchSeconds: 0,
    furthestNaturalTime: 0,
    lastPlayerTime: 0,
    lastWallTime: 0
  });

  const currentLessonId = useMemo(() => {
    if (!program || role === 'creator') {
      return null;
    }

    return program.lessons.find((lesson) => !lesson.isCompleted)?.id ?? null;
  }, [program, role]);

  useEffect(() => {
    if (!supabase || !user || !programId) {
      setProgram(null);
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    const currentProgramId = programId;
    let isActive = true;

    async function loadScreen() {
      setLoadingScreen(true);

      try {
        const nextProgram = await getProgramDetails(currentSupabase, currentUser.id, role, currentProgramId);

        if (!isActive) {
          return;
        }

        setProgram(nextProgram);
        setFeedback(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setFeedback({
          tone: 'error',
          message: getErrorMessage(error)
        });
      } finally {
        if (isActive) {
          setLoadingScreen(false);
        }
      }
    }

    void loadScreen();

    return () => {
      isActive = false;
    };
  }, [pathname, programId, role, supabase, user?.id]);

  const activeLessonId = activeLessonVideo?.lessonId ?? activeLessonDocument?.lessonId ?? null;

  const activeLessonRecord = useMemo(() => {
    if (!program || !activeLessonId) {
      return null;
    }

    return program.lessons.find((lesson) => lesson.id === activeLessonId) ?? null;
  }, [activeLessonId, program]);

  const nextLessonRecord = useMemo(() => {
    if (!program || !activeLessonRecord) {
      return null;
    }

    const currentIndex = program.lessons.findIndex((lesson) => lesson.id === activeLessonRecord.id);

    if (currentIndex < 0) {
      return null;
    }

    return program.lessons[currentIndex + 1] ?? null;
  }, [activeLessonRecord, program]);
  const effectiveCurrentTime = isSeekingVideo && seekPreviewTime !== null ? seekPreviewTime : videoProgress.currentTime;

  useEffect(() => {
    videoPlayer.timeUpdateEventInterval = 0.25;
    videoPlayer.loop = false;

    return () => {
      videoPlayer.pause();
      (videoPlayer as VideoPlayer & { release?: () => void }).release?.();
    };
  }, [videoPlayer]);

  useEffect(() => {
    let isActive = true;

    async function syncPlayerSource() {
      try {
        if (activeLessonVideo?.url) {
          setShowVideoCompletionCard(false);
          completionCardAnimation.setValue(0);
          completionConfettiAnimation.setValue(0);
          await videoPlayer.replaceAsync({
            uri: activeLessonVideo.url
          });

          if (!isActive) {
            return;
          }

          const resumeTime =
            activeLessonRecord && !activeLessonRecord.isCompleted
              ? Math.max(activeLessonRecord.lastPositionSeconds ?? 0, 0)
              : 0;
          videoPlayer.currentTime = resumeTime;
          setVideoProgress((current) => ({
            ...current,
            currentTime: resumeTime
          }));
          videoPlayer.play();
        } else {
          videoPlayer.pause();
          await videoPlayer.replaceAsync(null);

          if (!isActive) {
            return;
          }

          videoPlayer.currentTime = 0;
        }
      } catch {
        if (isActive) {
          setFeedback({
            tone: 'error',
            message: 'That video could not be loaded in the app.'
          });
        }
      }
    }

    void syncPlayerSource();

    return () => {
      isActive = false;
    };
  }, [
    activeLessonRecord,
    activeLessonVideo?.url,
    completionCardAnimation,
    completionConfettiAnimation,
    videoPlayer
  ]);

  useEffect(() => {
    if (!activeLessonVideo) {
      watchSessionRef.current = {
        lessonId: null,
        naturalWatchSeconds: 0,
        furthestNaturalTime: 0,
        lastPlayerTime: 0,
        lastWallTime: 0
      };
      setVideoProgress({
        currentTime: 0,
        duration: 0,
        playing: false,
        muted: false
      });
      setIsSeekingVideo(false);
      setSeekPreviewTime(null);
      return;
    }

    const interval = setInterval(() => {
      setVideoProgress((current) => ({
        currentTime: isSeekingVideo ? current.currentTime : videoPlayer.currentTime,
        duration: videoPlayer.duration,
        playing: videoPlayer.playing,
        muted: videoPlayer.muted
      }));
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [activeLessonVideo, isSeekingVideo, videoPlayer]);

  useEffect(() => {
    if (!activeLessonVideo || role !== 'supporter' || !program) {
      return;
    }

    const watchSession = watchSessionRef.current;
    const now = Date.now();

    if (watchSession.lessonId !== activeLessonVideo.lessonId) {
      watchSession.lessonId = activeLessonVideo.lessonId;
      watchSession.naturalWatchSeconds = 0;
      watchSession.furthestNaturalTime = 0;
      watchSession.lastPlayerTime = videoProgress.currentTime;
      watchSession.lastWallTime = now;
      return;
    }

    if (!isSeekingVideo && videoProgress.playing && videoProgress.duration > 0 && watchSession.lastWallTime > 0) {
      const playerDelta = videoProgress.currentTime - watchSession.lastPlayerTime;
      const wallDelta = (now - watchSession.lastWallTime) / 1000;

      if (playerDelta > 0 && playerDelta <= Math.max(1.4, wallDelta + 0.85)) {
        watchSession.naturalWatchSeconds += Math.min(playerDelta, wallDelta + 0.35);
        watchSession.furthestNaturalTime = Math.max(watchSession.furthestNaturalTime, videoProgress.currentTime);
      }
    }

    watchSession.lastPlayerTime = videoProgress.currentTime;
    watchSession.lastWallTime = now;

    const lesson = program.lessons.find((item) => item.id === activeLessonVideo.lessonId);

    if (!lesson || lesson.isCompleted || completingLessonId === lesson.id || autoCompletedLessonIdsRef.current.has(lesson.id)) {
      return;
    }

    const duration = videoProgress.duration;
    if (!duration) {
      return;
    }

    const nearEndThreshold = Math.max(duration * 0.95, duration - 2.5);
    const watchThreshold = Math.max(duration * 0.82, Math.min(duration - 12, duration * 0.9));
    const reachedEnd = videoProgress.currentTime >= nearEndThreshold;
    const watchedEnough = watchSession.naturalWatchSeconds >= watchThreshold;

    if (!reachedEnd || !watchedEnough) {
      return;
    }

    autoCompletedLessonIdsRef.current.add(lesson.id);
    void handleMarkComplete(lesson.id, 'auto');
  }, [activeLessonVideo, completingLessonId, isSeekingVideo, program, role, videoProgress]);

  useEffect(() => {
    if (!activeLessonVideo || showVideoCompletionCard) {
      return;
    }

    const duration = videoProgress.duration;
    if (!duration || videoProgress.playing) {
      return;
    }

    const reachedVideoEnd = videoProgress.currentTime >= Math.max(duration - 0.45, duration * 0.995);
    if (!reachedVideoEnd) {
      return;
    }

    setShowVideoControls(false);
    setShowVideoCompletionCard(true);
  }, [activeLessonVideo, showVideoCompletionCard, videoProgress]);

  useEffect(() => {
    if (!showVideoCompletionCard) {
      completionCardAnimation.setValue(0);
      completionConfettiAnimation.setValue(0);
      return;
    }

    Animated.spring(completionCardAnimation, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 150,
      mass: 0.8
    }).start();

    Animated.timing(completionConfettiAnimation, {
      toValue: 1,
      duration: 850,
      useNativeDriver: true
    }).start();
  }, [completionCardAnimation, completionConfettiAnimation, showVideoCompletionCard]);

  useEffect(() => {
    if (!activeLessonVideo || !showVideoControls || !videoProgress.playing || showVideoCompletionCard) {
      return;
    }

    const timeout = setTimeout(() => {
      setShowVideoControls(false);
    }, 3800);

    return () => {
      clearTimeout(timeout);
    };
  }, [activeLessonVideo, showVideoControls, showVideoCompletionCard, videoProgress.playing]);

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

  async function refreshProgramState() {
    if (!supabase || !user || !programId) {
      return null;
    }

    const nextProgram = await getProgramDetails(supabase, user.id, role, programId);
    if (!nextProgram) {
      throw new Error('The program could not be refreshed after saving progress.');
    }

    setProgram(nextProgram);
    return nextProgram;
  }

  async function persistPartialLessonProgress(input: {
    lessonId: string;
    progressPercent: number;
    lastPositionSeconds: number;
    isCompleted: boolean;
  }) {
    if (!supabase || !user || role !== 'supporter' || !programId || input.isCompleted) {
      return;
    }

    const clampedProgressPercent = Math.min(Math.max(Math.round(input.progressPercent), 0), 99);
    const clampedLastPosition = Math.max(input.lastPositionSeconds, 0);

    if (clampedProgressPercent <= 0 && clampedLastPosition <= 0) {
      return;
    }

    await saveProgramLessonProgress(supabase, {
      lessonId: input.lessonId,
      studentId: user.id,
      progressPercent: clampedProgressPercent,
      lastPositionSeconds: clampedLastPosition
    });

    await refreshProgramState();
  }

  async function handleMarkComplete(lessonId: string, source: 'manual' | 'auto' = 'manual') {
    if (!supabase || !user) {
      return;
    }

    setCompletingLessonId(lessonId);
    setFeedback(null);

    try {
      await markProgramLessonComplete(supabase, {
        lessonId,
        studentId: user.id
      });

      const nextProgram = await refreshProgramState();
      if (!nextProgram) {
        return;
      }

      const nextIncompleteLesson = nextProgram.lessons.find((lesson) => !lesson.isCompleted);
      setFeedback({
        tone: 'success',
        message: nextIncompleteLesson
          ? source === 'auto'
            ? `Nice. ${nextIncompleteLesson.title} is ready next.`
            : `Lesson complete. ${nextIncompleteLesson.title} is ready next.`
          : source === 'auto'
            ? 'Nice. You finished this program.'
            : 'Lesson complete. You finished this program.'
      });
    } catch (error) {
      autoCompletedLessonIdsRef.current.delete(lessonId);
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error)
      });
    } finally {
      setCompletingLessonId(null);
    }
  }

  function handleOpenLessonVideo(lessonId: string, title: string, videoUrl: string) {
    setFeedback(null);
    setShowVideoControls(true);
    setShowVideoCompletionCard(false);
    completionConfettiAnimation.setValue(0);
    setActiveLessonDocument(null);
    setActiveLessonVideo({
      lessonId,
      title,
      url: videoUrl
    });
  }

  function handleOpenLessonDocument(lessonId: string, title: string, documentUrl: string) {
    setFeedback(null);
    setActiveLessonVideo(null);
    setActiveLessonDocument({
      lessonId,
      title,
      url: documentUrl,
      viewerUrl: buildDocumentViewerUrl(documentUrl)
    });
  }

  function handleOpenLessonAsset(lessonId: string, title: string, lessonUrl: string) {
    if (getLessonAssetKind(lessonUrl) === 'document') {
      handleOpenLessonDocument(lessonId, title, lessonUrl);
      return;
    }

    handleOpenLessonVideo(lessonId, title, lessonUrl);
  }

  function handleCloseVideoPlayer() {
    const currentTime = seekPreviewTimeRef.current ?? videoPlayer.currentTime ?? videoProgress.currentTime;
    const duration = videoPlayer.duration || videoProgress.duration;
    const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
    const lessonSnapshot = activeLessonRecord
      ? {
          lessonId: activeLessonRecord.id,
          progressPercent: Math.max(progressPercent, activeLessonRecord.progressPercent),
          lastPositionSeconds: Math.max(currentTime, activeLessonRecord.lastPositionSeconds),
          isCompleted: activeLessonRecord.isCompleted
        }
      : null;

    videoPlayer.pause();
    setShowVideoControls(false);
    setShowVideoCompletionCard(false);
    setIsSeekingVideo(false);
    setSeekPreviewTime(null);
    seekPreviewTimeRef.current = null;
    wasPlayingBeforeSeekRef.current = false;
    setActiveLessonVideo(null);

    if (lessonSnapshot) {
      void persistPartialLessonProgress(lessonSnapshot).catch((error) => {
        setFeedback({
          tone: 'error',
          message: getErrorMessage(error)
        });
      });
    }
  }

  function handleCloseDocumentViewer() {
    setActiveLessonDocument(null);
  }

  function handleReplayVideo() {
    setShowVideoCompletionCard(false);
    setShowVideoControls(true);
    videoPlayer.currentTime = 0;
    videoPlayer.play();
    setVideoProgress((current) => ({
      ...current,
      currentTime: 0,
      playing: true
    }));
  }

  function handleContinueToNextLesson() {
    if (!nextLessonRecord?.videoUrl) {
      return;
    }

    handleOpenLessonAsset(nextLessonRecord.id, nextLessonRecord.title, nextLessonRecord.videoUrl);
  }

  function handleTogglePlayback() {
    setShowVideoControls(true);
    if (videoPlayer.playing) {
      videoPlayer.pause();
      return;
    }

    videoPlayer.play();
  }

  function handleToggleMute() {
    setShowVideoControls(true);
    videoPlayer.muted = !videoPlayer.muted;
    setVideoProgress((current) => ({
      ...current,
      muted: videoPlayer.muted
    }));
  }

  function handleToggleVideoChrome() {
    if (isSeekingVideo) {
      return;
    }

    setShowVideoControls((current) => !current);
  }

  function handleSeekBarLayout(event: LayoutChangeEvent) {
    const layoutWidth = event.nativeEvent.layout.width;
    seekBoundsRef.current.width = layoutWidth;

    requestAnimationFrame(() => {
      seekTouchAreaRef.current?.measureInWindow((pageX, _pageY, measuredWidth) => {
        seekBoundsRef.current = {
          pageX,
          width: measuredWidth || layoutWidth
        };
      });
    });
  }

  function getSeekTimeForPageX(pageX: number) {
    const { pageX: trackPageX, width } = seekBoundsRef.current;

    if (!width || !videoProgress.duration) {
      return null;
    }

    const localX = pageX - trackPageX;
    const nextRatio = Math.min(Math.max(localX / width, 0), 1);
    return nextRatio * videoProgress.duration;
  }

  function handleSeekStart(event: GestureResponderEvent) {
    const nextTime = getSeekTimeForPageX(event.nativeEvent.pageX);
    if (nextTime === null) {
      return;
    }

    setShowVideoControls(true);
    wasPlayingBeforeSeekRef.current = videoPlayer.playing;
    if (videoPlayer.playing) {
      videoPlayer.pause();
    }
    setIsSeekingVideo(true);
    setSeekPreviewTime(nextTime);
    seekPreviewTimeRef.current = nextTime;
    setVideoProgress((current) => ({
      ...current,
      playing: false,
      currentTime: nextTime
    }));
  }

  function handleSeek(event: GestureResponderEvent) {
    const nextTime = getSeekTimeForPageX(event.nativeEvent.pageX);
    if (nextTime === null) {
      return;
    }

    setShowVideoControls(true);
    setSeekPreviewTime(nextTime);
    seekPreviewTimeRef.current = nextTime;
    setVideoProgress((current) => ({
      ...current,
      currentTime: nextTime
    }));
  }

  function commitSeek() {
    const nextSeekTime = seekPreviewTimeRef.current;

    if (nextSeekTime === null) {
      setIsSeekingVideo(false);
      return;
    }

    videoPlayer.currentTime = nextSeekTime;
    setVideoProgress((current) => ({
      ...current,
      currentTime: nextSeekTime
    }));
    setSeekPreviewTime(null);
    seekPreviewTimeRef.current = null;
    setIsSeekingVideo(false);

    if (wasPlayingBeforeSeekRef.current) {
      videoPlayer.play();
    }

    wasPlayingBeforeSeekRef.current = false;
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Programs</Text>
          <Text style={styles.centerBody}>Add your Supabase keys in `apps/mobile/.env` to load the real program detail.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingScreen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <ProgramDetailLoadingState />
      </SafeAreaView>
    );
  }

  if (!user || !program) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.centerStage}>
          <Text style={styles.centerTitle}>Program not found</Text>
          <Text style={styles.centerBody}>This program is not available or you do not have access to it yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const gradientColors = getProgramFallbackGradient(program.id);
  const spotlightLesson =
    role === 'creator'
      ? program.lessons[0] ?? null
      : program.lessons.find((lesson) => !lesson.isCompleted) ?? program.lessons[program.lessons.length - 1] ?? null;
  const spotlightAssetKind = getLessonAssetKind(spotlightLesson?.videoUrl);
  const spotlightLessonIndex = spotlightLesson ? program.lessons.findIndex((lesson) => lesson.id === spotlightLesson.id) + 1 : 0;
  const spotlightState =
    role === 'creator'
      ? spotlightLesson?.videoUrl
        ? 'live'
        : 'draft'
      : spotlightLesson?.isCompleted
        ? 'complete'
        : currentLessonId === spotlightLesson?.id
          ? 'current'
          : 'locked';
  const spotlightCanOpenAsset =
    Boolean(spotlightLesson?.videoUrl) &&
    (role === 'creator' || spotlightState === 'current' || spotlightState === 'complete' || spotlightState === 'live');
  const spotlightIntro = truncateText(
    spotlightLesson?.summary || program.description || program.subtitle || 'Move through the next lesson in this program.',
    150
  );
  const heroEyebrowLabel =
    role === 'creator'
      ? 'Program preview'
      : spotlightLessonIndex
        ? `Program - Lesson ${spotlightLessonIndex}`
        : 'Program';
  const curriculumModules = program.modules.length
    ? program.modules
    : [
        {
          id: 'fallback-module',
          programId: program.id,
          title: 'Lessons',
          summary: '',
          position: 1,
          lessonCount: program.lessons.length,
          completedLessons: program.completedLessons,
          progressPercent: program.progressPercent,
          lessons: program.lessons,
          createdAt: program.createdAt,
          updatedAt: program.updatedAt
        }
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

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
            </Pressable>

            {role === 'creator' ? (
              <Pressable
                style={styles.studioButton}
                onPress={() =>
                  router.push({
                    pathname: '/program-studio-editor',
                    params: {
                      programId: program.id
                    }
                  })
                }
              >
                <LinearGradient
                  colors={theme.gradients.brand}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.studioButtonFill}
                >
                  <Text style={styles.studioButtonText}>Studio</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={styles.topBarSpacer} />
            )}
          </View>

          <Pressable
            style={styles.editorialMediaCard}
            onPress={() => {
              if (spotlightLesson?.videoUrl && spotlightCanOpenAsset) {
                handleOpenLessonAsset(spotlightLesson.id, spotlightLesson.title, spotlightLesson.videoUrl);
              }
            }}
            disabled={!spotlightLesson?.videoUrl || !spotlightCanOpenAsset}
          >
            {program.thumbnailUrl ? (
              <>
                <Image source={{ uri: program.thumbnailUrl }} style={styles.heroMediaImage} />
                <View style={styles.editorialMediaOverlay} />
              </>
            ) : (
              <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editorialMediaFallback} />
            )}

            {spotlightLesson?.videoUrl ? (
              <View style={styles.heroPlayButton}>
                <Ionicons name={spotlightAssetKind === 'document' ? 'document-text' : 'play'} size={30} color="#ffffff" />
              </View>
            ) : null}
          </Pressable>

          <View style={styles.editorialLessonHeader}>
            <Text style={styles.editorialLessonEyebrow}>{heroEyebrowLabel}</Text>
            <Text style={styles.editorialLessonTitle}>{spotlightLesson?.title || program.title}</Text>
            <Text style={styles.editorialLessonBody}>{spotlightIntro}</Text>

            <View style={styles.editorialLessonActions}>
              {spotlightLesson?.videoUrl && spotlightCanOpenAsset ? (
                <Pressable
                  style={styles.lessonPrimaryAction}
                  onPress={() => handleOpenLessonAsset(spotlightLesson.id, spotlightLesson.title, spotlightLesson.videoUrl!)}
                >
                  <LinearGradient
                    colors={theme.gradients.brand}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={styles.lessonPrimaryActionFill}
                  >
                    <Ionicons name={spotlightAssetKind === 'document' ? 'document-text' : 'play-circle'} size={16} color="#ffffff" />
                    <Text style={styles.lessonPrimaryActionText}>
                      {spotlightAssetKind === 'document' ? 'Open Lesson' : 'Watch Lesson'}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ) : null}

              {role === 'supporter' && spotlightLesson && spotlightState === 'current' ? (
                <Pressable
                  style={styles.lessonSecondaryAction}
                  onPress={() => void handleMarkComplete(spotlightLesson.id)}
                  disabled={completingLessonId === spotlightLesson.id}
                >
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.textPrimary} />
                  <Text style={styles.lessonSecondaryActionText}>
                    {completingLessonId === spotlightLesson.id ? 'Saving...' : 'Mark complete'}
                  </Text>
                </Pressable>
              ) : null}

              {role === 'creator' ? (
                <Pressable
                  style={styles.lessonSecondaryAction}
                  onPress={() =>
                    router.push({
                      pathname: '/program-studio-editor',
                      params: {
                        programId: program.id
                      }
                    })
                  }
                >
                  <Ionicons name="create-outline" size={16} color={theme.colors.textPrimary} />
                  <Text style={styles.lessonSecondaryActionText}>Open Studio</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {feedback ? <InlineNotice tone={feedback.tone} message={feedback.message} /> : null}

          <View style={styles.progressPanel}>
            <View style={styles.progressPanelInline}>
              <View style={styles.progressPanelLabelWrap}>
                <Text style={styles.progressPanelEyebrow}>Your Journey</Text>
                <Text style={styles.progressPanelValueInline}>{program.progressPercent}%</Text>
              </View>

              <View style={styles.progressTrackCompact}>
                <View style={[styles.progressFill, { width: `${program.progressPercent}%` }]} />
              </View>

              <Ionicons name="trophy" size={18} color={theme.colors.textPrimary} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>{role === 'creator' ? 'Program preview' : 'Program'}</Text>
              <Text style={styles.sectionTitle}>Modules</Text>
            </View>
          </View>

          {program.lessons.length ? (
            <View style={styles.editorialCurriculumList}>
              {curriculumModules.map((module) => (
                <View key={module.id} style={styles.curriculumModuleCard}>
                  <View style={styles.curriculumModuleHeader}>
                    <View>
                      <Text style={styles.curriculumModuleEyebrow}>
                        Module {module.position} - {module.lessonCount === 1 ? '1 lesson' : `${module.lessonCount} lessons`}
                      </Text>
                      <Text style={styles.curriculumModuleTitle}>{module.title}</Text>
                    </View>

                    <View style={styles.curriculumModuleProgressPill}>
                      <Text style={styles.curriculumModuleProgressText}>{module.progressPercent}%</Text>
                    </View>
                  </View>

                  <View style={styles.curriculumModuleLessons}>
                    {module.lessons.map((lesson, index) => {
                      const lessonAssetKind = getLessonAssetKind(lesson.videoUrl);
                      const state =
                        role === 'creator'
                          ? lesson.videoUrl
                            ? 'live'
                            : 'draft'
                          : lesson.isCompleted
                            ? 'complete'
                            : currentLessonId === lesson.id
                              ? 'current'
                              : 'locked';
                      const canOpenAsset =
                        Boolean(lesson.videoUrl) &&
                        (role === 'creator' || state === 'current' || state === 'complete' || state === 'live');

                      return (
                        <Pressable
                          key={lesson.id}
                          style={[
                            styles.editorialCurriculumCard,
                            state === 'current' && styles.editorialCurriculumCardCurrent,
                            (state === 'locked' || state === 'draft') && styles.editorialCurriculumCardMuted
                          ]}
                          onPress={() => {
                            if (lesson.videoUrl && canOpenAsset) {
                              handleOpenLessonAsset(lesson.id, lesson.title, lesson.videoUrl);
                            }
                          }}
                          disabled={!lesson.videoUrl || !canOpenAsset}
                        >
                          {state === 'current' ? <View style={styles.editorialCurrentRail} /> : null}

                          <View
                            style={[
                              styles.editorialCurriculumIcon,
                              state === 'current' && styles.editorialCurriculumIconCurrent,
                              state === 'complete' && styles.editorialCurriculumIconComplete
                            ]}
                          >
                            <Ionicons
                              name={
                                state === 'complete'
                                  ? 'checkmark'
                                  : state === 'current'
                                    ? lessonAssetKind === 'document'
                                      ? 'document-text'
                                      : 'play'
                                    : state === 'locked' || state === 'draft'
                                      ? 'lock-closed'
                                      : lessonAssetKind === 'document'
                                        ? 'document-text'
                                        : 'play'
                              }
                              size={16}
                              color={
                                state === 'current'
                                  ? '#ffffff'
                                  : state === 'complete'
                                    ? theme.colors.textPrimary
                                    : '#8a93a5'
                              }
                            />
                          </View>

                          <View style={styles.editorialCurriculumCopy}>
                            <Text style={[styles.editorialCurriculumEyebrow, state === 'current' && styles.editorialCurriculumEyebrowCurrent]}>
                              Lesson {index + 1}
                              {state === 'current' ? ' - Now Playing' : state === 'complete' ? ' - Complete' : ''}
                            </Text>
                            <Text style={styles.editorialCurriculumTitle}>{lesson.title}</Text>
                            <Text style={[styles.editorialCurriculumMeta, state === 'current' && styles.editorialCurriculumMetaCurrent]}>
                              {getLessonAssetLabel(lesson.videoUrl, lesson.durationLabel)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No lessons yet</Text>
              <Text style={styles.emptyBody}>
                {role === 'creator'
                  ? 'Open Studio to add the first lesson in the program.'
                  : 'This program exists, but the creator has not added any lessons yet.'}
              </Text>
            </View>
          )}
        </ScrollView>

        <Modal visible={activeLessonVideo !== null} transparent animationType="fade" onRequestClose={handleCloseVideoPlayer}>
          <View style={styles.videoModalBackdrop}>
            <View style={styles.videoModalCard}>
              <Pressable style={styles.videoFrame} onPress={handleToggleVideoChrome}>
                <VideoView
                  player={videoPlayer}
                  nativeControls={false}
                  contentFit="cover"
                  style={styles.videoView}
                  allowsPictureInPicture={false}
                />

                {showVideoCompletionCard ? (
                  <Animated.View
                    style={[
                      styles.videoCompletionCardWrap,
                      {
                        paddingBottom: Math.max(insets.bottom + 18, 26),
                        opacity: completionCardAnimation,
                        transform: [
                          {
                            translateY: completionCardAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [24, 0]
                            })
                          },
                          {
                            scale: completionCardAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.96, 1]
                            })
                          }
                        ]
                      }
                    ]}
                  >
                    <View style={styles.videoCompletionCard}>
                      <View pointerEvents="none" style={styles.videoCompletionConfettiLayer}>
                        {COMPLETION_CONFETTI.map((piece) => (
                          <Animated.View
                            key={piece.id}
                            style={[
                              styles.videoCompletionConfettiPiece,
                              {
                                backgroundColor: piece.color,
                                width: piece.size,
                                height: piece.size * 1.8,
                                transform: [
                                  {
                                    translateX: completionConfettiAnimation.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [0, piece.x]
                                    })
                                  },
                                  {
                                    translateY: completionConfettiAnimation.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [0, piece.y]
                                    })
                                  },
                                  {
                                    scale: completionConfettiAnimation.interpolate({
                                      inputRange: [0, 0.2, 1],
                                      outputRange: [0.2, 1, 0.76]
                                    })
                                  },
                                  {
                                    rotate: completionConfettiAnimation.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: ['0deg', piece.rotate]
                                    })
                                  }
                                ],
                                opacity: completionConfettiAnimation.interpolate({
                                  inputRange: [0, 0.12, 0.82, 1],
                                  outputRange: [0, 0.9, 0.32, 0]
                                })
                              }
                            ]}
                          />
                        ))}
                      </View>

                      <View style={styles.videoCompletionTopRow}>
                        <View style={styles.videoCompletionBadge}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                        <View style={styles.videoCompletionCopy}>
                          <Text style={styles.videoCompletionEyebrow}>Lesson complete</Text>
                          <Text style={styles.videoCompletionTitle} numberOfLines={2}>
                            {nextLessonRecord?.title ? 'Ready for the next lesson?' : 'Nice work. You made it to the end.'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.videoCompletionActions}>
                        {nextLessonRecord?.videoUrl ? (
                          <Pressable style={styles.videoCompletionPrimaryButton} onPress={handleContinueToNextLesson}>
                            <LinearGradient
                              colors={theme.gradients.brand}
                              end={{ x: 1, y: 1 }}
                              start={{ x: 0, y: 0 }}
                              style={styles.videoCompletionPrimaryButtonFill}
                            >
                              <Text style={styles.videoCompletionPrimaryButtonText}>Next lesson</Text>
                              <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                            </LinearGradient>
                          </Pressable>
                        ) : null}

                        <Pressable style={styles.videoCompletionSecondaryButton} onPress={handleReplayVideo}>
                          <Ionicons name="refresh" size={14} color={theme.colors.textPrimary} />
                          <Text style={styles.videoCompletionSecondaryButtonText}>Replay</Text>
                        </Pressable>

                        <Pressable style={styles.videoCompletionSecondaryButton} onPress={handleCloseVideoPlayer}>
                          <Ionicons name="close" size={14} color={theme.colors.textPrimary} />
                          <Text style={styles.videoCompletionSecondaryButtonText}>Exit</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
                ) : null}

                {showVideoControls && !showVideoCompletionCard ? (
                  <>
                    <View style={[styles.videoOverlayTopRow, { paddingTop: Math.max(insets.top + 8, 18) }]}>
                      <View style={styles.videoModalTitleWrap}>
                        <Text style={styles.videoModalEyebrow}>Lesson video</Text>
                        <Text style={styles.videoModalTitle} numberOfLines={2}>
                          {activeLessonVideo?.title ?? 'Video'}
                        </Text>
                      </View>
                      <Pressable style={styles.videoCloseButton} onPress={handleCloseVideoPlayer}>
                        <LinearGradient
                          colors={theme.gradients.brand}
                          end={{ x: 1, y: 1 }}
                          start={{ x: 0, y: 0 }}
                          style={styles.videoCloseButtonFill}
                        >
                          <Ionicons name="close" size={18} color="#ffffff" />
                        </LinearGradient>
                      </Pressable>
                    </View>

                    <View style={styles.videoOverlayCenter}>
                      <Pressable style={styles.videoCenterControl} onPress={handleTogglePlayback}>
                        <LinearGradient
                          colors={theme.gradients.brand}
                          end={{ x: 1, y: 1 }}
                          start={{ x: 0, y: 0 }}
                          style={styles.videoCenterControlFill}
                        >
                          <Ionicons name={videoProgress.playing ? 'pause' : 'play'} size={26} color="#ffffff" />
                        </LinearGradient>
                      </Pressable>
                    </View>

                    <View style={[styles.videoOverlayBottom, { paddingBottom: Math.max(insets.bottom + 10, 18) }]}>
                      <View style={styles.videoBottomRow}>
                        <Pressable style={styles.videoIconButton} onPress={handleTogglePlayback}>
                          <LinearGradient
                            colors={theme.gradients.brand}
                            end={{ x: 1, y: 1 }}
                            start={{ x: 0, y: 0 }}
                            style={styles.videoIconButtonFill}
                          >
                            <Ionicons name={videoProgress.playing ? 'pause' : 'play'} size={15} color="#ffffff" />
                          </LinearGradient>
                        </Pressable>

                        <Pressable style={styles.videoIconButton} onPress={handleToggleMute}>
                          <LinearGradient
                            colors={theme.gradients.brand}
                            end={{ x: 1, y: 1 }}
                            start={{ x: 0, y: 0 }}
                            style={styles.videoIconButtonFill}
                          >
                            <Ionicons name={videoProgress.muted ? 'volume-mute' : 'volume-high'} size={15} color="#ffffff" />
                          </LinearGradient>
                        </Pressable>

                        <Text style={styles.seekTimestamp}>
                          {formatPlaybackTime(effectiveCurrentTime)} / {formatPlaybackTime(videoProgress.duration)}
                        </Text>

                        <View
                          ref={seekTouchAreaRef}
                          style={styles.seekTouchArea}
                          onLayout={handleSeekBarLayout}
                          onTouchEnd={commitSeek}
                          onTouchCancel={commitSeek}
                          onStartShouldSetResponder={() => true}
                          onMoveShouldSetResponder={() => true}
                          onResponderTerminationRequest={() => true}
                          onResponderGrant={handleSeekStart}
                          onResponderMove={handleSeek}
                          onResponderRelease={commitSeek}
                          onResponderTerminate={commitSeek}
                        >
                          <View style={styles.seekTrack}>
                            <View style={styles.seekRail} />
                            <LinearGradient
                              colors={theme.gradients.brand}
                              end={{ x: 1, y: 0 }}
                              start={{ x: 0, y: 0 }}
                              style={[styles.seekFill, { width: `${getPlaybackPercent(effectiveCurrentTime, videoProgress.duration)}%` }]}
                            />
                            <View
                              style={[
                                styles.seekThumbTouchTarget,
                                { left: `${getPlaybackPercent(effectiveCurrentTime, videoProgress.duration)}%` }
                              ]}
                            />
                            <LinearGradient
                              colors={theme.gradients.brand}
                              end={{ x: 1, y: 1 }}
                              start={{ x: 0, y: 0 }}
                              style={[styles.seekThumb, { left: `${getPlaybackPercent(effectiveCurrentTime, videoProgress.duration)}%` }]}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  </>
                ) : null}
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={activeLessonDocument !== null} transparent animationType="fade" onRequestClose={handleCloseDocumentViewer}>
          <View style={styles.videoModalBackdrop}>
            <View style={styles.documentModalCard}>
              <View style={[styles.documentTopRow, { paddingTop: Math.max(insets.top + 10, 18) }]}>
                <View style={styles.videoModalTitleWrap}>
                  <Text style={styles.videoModalEyebrow}>Lesson document</Text>
                  <Text style={styles.videoModalTitle} numberOfLines={2}>
                    {activeLessonDocument?.title ?? 'Document'}
                  </Text>
                </View>

                <View style={styles.documentTopActions}>
                  {role === 'supporter' && activeLessonRecord && !activeLessonRecord.isCompleted ? (
                    <Pressable
                      style={styles.documentActionButton}
                      onPress={() => void handleMarkComplete(activeLessonRecord.id)}
                      disabled={completingLessonId === activeLessonRecord.id}
                    >
                      <Ionicons name="checkmark-circle" size={15} color={theme.colors.textPrimary} />
                      <Text style={styles.documentActionButtonText}>
                        {completingLessonId === activeLessonRecord.id ? 'Saving...' : 'Mark complete'}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable style={styles.videoCloseButton} onPress={handleCloseDocumentViewer}>
                    <LinearGradient
                      colors={theme.gradients.brand}
                      end={{ x: 1, y: 1 }}
                      start={{ x: 0, y: 0 }}
                      style={styles.videoCloseButtonFill}
                    >
                      <Ionicons name="close" size={18} color="#ffffff" />
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>

              <View style={styles.documentWebViewWrap}>
                <WebView
                  source={{ uri: activeLessonDocument?.viewerUrl ?? activeLessonDocument?.url ?? '' }}
                  style={styles.documentWebView}
                  setBuiltInZoomControls={false}
                  originWhitelist={['*']}
                />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function ProgramDetailLoadingState() {
  return (
    <View style={styles.loadingShell}>
      <SkeletonBlock width={42} height={42} radius={21} />
      <SkeletonBlock height={224} radius={30} />

      <View style={styles.loadingHeaderBlock}>
        <SkeletonBlock width={120} height={12} />
        <SkeletonBlock width="70%" height={38} radius={14} />
        <SkeletonBlock width="88%" height={16} />
        <SkeletonBlock width="72%" height={16} />
      </View>

      <View style={styles.loadingActionRow}>
        <SkeletonBlock width={132} height={44} radius={16} />
        <SkeletonBlock width={144} height={44} radius={16} />
      </View>

      <SkeletonBlock height={72} radius={20} />

      <View style={styles.loadingLessonList}>
        <SkeletonBlock height={88} radius={22} />
        <SkeletonBlock height={88} radius={22} />
        <SkeletonBlock height={88} radius={22} />
      </View>
    </View>
  );
}

function getStatusLabel(state: 'complete' | 'current' | 'locked' | 'live' | 'draft') {
  if (state === 'complete') return 'Complete';
  if (state === 'current') return 'Current';
  if (state === 'locked') return 'Locked';
  if (state === 'live') return 'Live';
  return 'Draft';
}

function getLessonAccent(state: 'complete' | 'current' | 'locked' | 'live' | 'draft') {
  if (state === 'complete') return '#dff3e8';
  if (state === 'current') return '#e6efff';
  if (state === 'locked') return '#f0f2f6';
  if (state === 'live') return '#e5f7ea';
  return '#fdf0e1';
}

function getStatusBackground(state: 'complete' | 'current' | 'locked' | 'live' | 'draft') {
  if (state === 'complete') return '#e5f7ea';
  if (state === 'current') return '#e8f0ff';
  if (state === 'locked') return '#f1f3f7';
  if (state === 'live') return '#e5f7ea';
  return '#fdf0e1';
}

function getStatusText(state: 'complete' | 'current' | 'locked' | 'live' | 'draft') {
  if (state === 'complete') return '#16643a';
  if (state === 'current') return theme.colors.primaryStrong;
  if (state === 'locked') return '#6b7280';
  if (state === 'live') return '#16643a';
  return '#8c6510';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (
      error.message.includes('lesson_progress') &&
      error.message.toLowerCase().includes('row-level security')
    ) {
      return 'This account needs to be enrolled in the program before lesson progress can be saved.';
    }

    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message;

    if (message.includes('lesson_progress') && message.toLowerCase().includes('row-level security')) {
      return 'This account needs to be enrolled in the program before lesson progress can be saved.';
    }

    return message;
  }

  return 'Something went wrong. Please try again.';
}

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getPlaybackPercent(currentTime: number, duration: number) {
  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.min(Math.max((currentTime / duration) * 100, 0), 100);
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
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
    bottom: 90,
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
    alignItems: 'center',
    justifyContent: 'space-between'
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
  topBarSpacer: {
    width: 38,
    height: 38
  },
  studioButton: {
    minHeight: 38,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  studioButtonFill: {
    minHeight: 38,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  studioButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  editorialMediaCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  editorialMediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 24, 40, 0.18)'
  },
  editorialMediaFallback: {
    ...StyleSheet.absoluteFillObject
  },
  heroPlayButton: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: theme.colors.primaryStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050910',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4
  },
  editorialLessonHeader: {
    gap: 10
  },
  editorialLessonEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  editorialLessonTitle: {
    color: theme.colors.textPrimary,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  editorialLessonBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 330
  },
  editorialLessonActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4
  },
  lessonPrimaryAction: {
    minHeight: 42,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  lessonPrimaryActionFill: {
    minHeight: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  lessonPrimaryActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  lessonSecondaryAction: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#050910',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 2
  },
  lessonSecondaryActionText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
  progressPanel: {
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#050910',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  progressPanelInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  progressPanelLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  progressPanelEyebrow: {
    color: '#697489',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.75,
    textTransform: 'uppercase'
  },
  progressPanelValueInline: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    fontFamily: EDITORIAL_SERIF
  },
  progressTrackCompact: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    overflow: 'hidden'
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHighest,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong
  },
  heroMediaFrame: {
    minHeight: 280,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end'
  },
  heroMediaImage: {
    ...StyleSheet.absoluteFillObject
  },
  heroMediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 16, 28, 0.42)'
  },
  heroContent: {
    padding: 22,
    gap: 10
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 310
  },
  heroPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  heroPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  summaryCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 18,
    gap: 10,
    shadowColor: '#050910',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14
    },
    elevation: 4
  },
  sectionEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase'
  },
  summaryTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800'
  },
  summaryBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  creatorActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4
  },
  creatorActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.primarySoft
  },
  creatorActionText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
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
  loadingActionRow: {
    flexDirection: 'row',
    gap: 12
  },
  loadingLessonList: {
    gap: 14
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    marginTop: 4,
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  progressBadge: {
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  progressBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  editorialCurriculumList: {
    gap: 14
  },
  curriculumModuleCard: {
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerLow,
    padding: 14
  },
  curriculumModuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  curriculumModuleEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  curriculumModuleTitle: {
    marginTop: 3,
    color: theme.colors.textPrimary,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  curriculumModuleProgressPill: {
    minWidth: 48,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  curriculumModuleProgressText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900'
  },
  curriculumModuleLessons: {
    gap: 10
  },
  editorialCurriculumCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 16
  },
  editorialCurriculumCardCurrent: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    shadowColor: '#050910',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  editorialCurriculumCardMuted: {
    opacity: 0.72
  },
  editorialCurrentRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: theme.colors.primaryStrong
  },
  editorialCurriculumIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorialCurriculumIconCurrent: {
    backgroundColor: theme.colors.primaryStrong
  },
  editorialCurriculumIconComplete: {
    backgroundColor: theme.colors.primarySoft
  },
  editorialCurriculumCopy: {
    flex: 1,
    gap: 3
  },
  editorialCurriculumEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  editorialCurriculumEyebrowCurrent: {
    color: theme.colors.textPrimary
  },
  editorialCurriculumTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700'
  },
  editorialCurriculumMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  editorialCurriculumMetaCurrent: {
    color: theme.colors.textPrimary
  },
  lessonList: {
    gap: 14
  },
  lessonCard: {
    flexDirection: 'row',
    gap: 12
  },
  lessonRail: {
    width: 28,
    alignItems: 'center'
  },
  lessonNumberWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lessonNumberText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  lessonRailLine: {
    marginTop: 6,
    width: 2,
    flex: 1,
    minHeight: 44,
    backgroundColor: theme.colors.outlineSoft
  },
  lessonCopy: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 16,
    gap: 8,
    shadowColor: '#050910',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  lessonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  lessonMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceContainerHigh
  },
  lessonMetaText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800'
  },
  lessonStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  lessonStatusText: {
    fontSize: 11,
    fontWeight: '800'
  },
  lessonTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800'
  },
  lessonSummary: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  lessonFooter: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  lessonDuration: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    flex: 1
  },
  lessonActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8
  },
  videoButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5
  },
  videoButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800'
  },
  videoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.78)',
    justifyContent: 'center'
  },
  videoModalCard: {
    flex: 1,
    borderRadius: 0,
    backgroundColor: '#050b16',
    padding: 0
  },
  documentModalCard: {
    flex: 1,
    borderRadius: 0,
    backgroundColor: '#050b16',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12
  },
  documentTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  documentTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  documentActionButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  documentActionButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  documentWebViewWrap: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceContainerLowest
  },
  documentWebView: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerLowest
  },
  videoModalTitleWrap: {
    flex: 1,
    gap: 4
  },
  videoModalEyebrow: {
    color: 'rgba(226, 232, 240, 0.7)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  videoModalTitle: {
    color: '#f8fafc',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  videoCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryStrong,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 3
  },
  videoCloseButtonFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoFrame: {
    flex: 1,
    backgroundColor: '#020617',
    position: 'relative'
  },
  videoView: {
    flex: 1
  },
  videoCompletionCardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14
  },
  videoCompletionCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(8, 15, 28, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
    overflow: 'hidden'
  },
  videoCompletionConfettiLayer: {
    position: 'absolute',
    top: 22,
    left: '50%',
    width: 0,
    height: 0
  },
  videoCompletionConfettiPiece: {
    position: 'absolute',
    borderRadius: 999
  },
  videoCompletionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  videoCompletionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoCompletionCopy: {
    flex: 1,
    gap: 2
  },
  videoCompletionEyebrow: {
    color: 'rgba(226, 232, 240, 0.68)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  videoCompletionTitle: {
    color: '#f8fafc',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700'
  },
  videoCompletionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  videoCompletionPrimaryButton: {
    minHeight: 36,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: theme.colors.primaryStrong,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 7
    },
    elevation: 3
  },
  videoCompletionPrimaryButtonFill: {
    minHeight: 36,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  videoCompletionPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  videoCompletionSecondaryButton: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  videoCompletionSecondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  videoOverlayTopRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14
  },
  videoOverlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoCenterControl: {
    width: 62,
    height: 62,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryStrong,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 4
  },
  videoCenterControlFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoOverlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: 'rgba(2, 6, 23, 0.16)'
  },
  videoBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  videoIconButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryStrong,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5
    },
    elevation: 2
  },
  videoIconButtonFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  seekTimestamp: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 72
  },
  seekTouchArea: {
    flex: 1,
    height: 28,
    justifyContent: 'center'
  },
  seekTrack: {
    width: '100%',
    height: 14,
    borderRadius: 999,
    backgroundColor: 'transparent',
    justifyContent: 'center'
  },
  seekRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 5.5,
    bottom: 5.5,
    borderRadius: 999,
    backgroundColor: 'rgba(54, 43, 103, 0.82)'
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: 5.5,
    bottom: 5.5,
    borderRadius: 999
  },
  seekThumb: {
    position: 'absolute',
    top: '50%',
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: theme.colors.primaryStrong,
    shadowOpacity: 0.42,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3
    },
    elevation: 3
  },
  seekThumbTouchTarget: {
    position: 'absolute',
    top: '50%',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 999,
    backgroundColor: 'transparent'
  },
  completeButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  completeButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800'
  },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(19,27,46,0.96)',
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    padding: 18,
    gap: 10
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: EDITORIAL_SERIF
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
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
    fontFamily: EDITORIAL_SERIF
  },
  centerBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center'
  }
});

