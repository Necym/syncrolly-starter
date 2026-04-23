import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import { getViewerProfile, saveCreatorProfile, saveSupporterProfile } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildStarterCreatorPageBlocks, getEffectiveCreatorPageBlocks } from '../lib/profilePageBuilder';
import { getDefaultDisplayName, useMobileSession } from '../lib/session';

type DmAccess = 'free' | 'subscriber_only' | 'paid_only';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function getDmAccessLabel(value: DmAccess): string {
  if (value === 'free') return 'Everyone';
  if (value === 'subscriber_only') return 'Subscribers';
  return 'Paid only';
}

function getDmIntakePolicyLabel(value: 'direct_message' | 'form' | 'paid_fee') {
  if (value === 'form') return 'Fill form';
  if (value === 'paid_fee') return 'Pay fee';
  return 'Direct DM';
}

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [loadingScreen, setLoadingScreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [role, setRole] = useState<'creator' | 'supporter'>('creator');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [niche, setNiche] = useState('');
  const [headline, setHeadline] = useState('');
  const [dmAccess, setDmAccess] = useState<DmAccess>('subscriber_only');
  const [dmIntakePolicy, setDmIntakePolicy] = useState<'direct_message' | 'form' | 'paid_fee'>('direct_message');
  const [dmFeeUsd, setDmFeeUsd] = useState('25');
  const [supporterAccessLevel, setSupporterAccessLevel] = useState<'free' | 'subscriber' | 'paid' | 'vip'>('free');
  const [supporterTotalSpend, setSupporterTotalSpend] = useState(0);
  const [existingPageBlocks, setExistingPageBlocks] = useState<ReturnType<typeof getEffectiveCreatorPageBlocks>>([]);

  useEffect(() => {
    if (!supabase || !user) {
      return;
    }

    const currentSupabase = supabase;
    const currentUser = user;
    let isActive = true;

    async function loadProfileSettings() {
      setLoadingScreen(true);
      setFeedback(null);

      try {
        const profile = await getViewerProfile(currentSupabase, currentUser.id);

        if (!isActive || !profile) {
          return;
        }

        setRole(profile.role);
        setDisplayName(profile.displayName);
        setBio(profile.bio ?? '');
        setNiche(profile.creatorProfile?.niche ?? '');
        setHeadline(profile.creatorProfile?.headline ?? '');
        setDmAccess(profile.creatorProfile?.dmAccess ?? 'subscriber_only');
        setDmIntakePolicy(profile.creatorProfile?.dmIntakePolicy ?? 'direct_message');
        setDmFeeUsd(String(profile.creatorProfile?.dmFeeUsd ?? 25));
        setSupporterAccessLevel(profile.supporterProfile?.accessLevel ?? 'free');
        setSupporterTotalSpend(profile.supporterProfile?.totalSpend ?? 0);
        setExistingPageBlocks(
          getEffectiveCreatorPageBlocks(profile.creatorProfile?.pageBlocks, profile.creatorProfile?.dmIntakePolicy ?? 'direct_message')
        );
      } catch (error) {
        if (isActive) {
          setFeedback(getErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setLoadingScreen(false);
        }
      }
    }

    void loadProfileSettings();

    return () => {
      isActive = false;
    };
  }, [supabase, user?.id]);

  async function handleSave() {
    if (!supabase || !user) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      if (role === 'creator') {
        await saveCreatorProfile(supabase, {
          userId: user.id,
          displayName: displayName.trim() || getDefaultDisplayName(user) || 'Syncrolly User',
          bio: bio.trim(),
          niche: niche.trim(),
          headline: headline.trim(),
          dmAccess,
          dmIntakePolicy,
          dmFeeUsd: Math.max(1, Number.parseInt(dmFeeUsd.trim() || '25', 10) || 25),
          pageBlocks: existingPageBlocks.length ? existingPageBlocks : buildStarterCreatorPageBlocks(dmIntakePolicy)
        });
      } else {
        await saveSupporterProfile(supabase, {
          userId: user.id,
          displayName: displayName.trim() || getDefaultDisplayName(user) || 'Syncrolly User',
          bio: bio.trim(),
          accessLevel: supporterAccessLevel,
          totalSpend: supporterTotalSpend
        });
      }

      setFeedback('Profile settings updated.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Profile settings</Text>
          <Text style={styles.emptyBody}>Add your Supabase keys in `apps/mobile/.env` to load account settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingScreen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.emptyBody}>Loading profile settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Profile settings</Text>
          <Text style={styles.emptyBody}>Sign in to Syncrolly first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.primaryStrong} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>Creator profile</Text>
            <Text style={styles.cardTitle}>Studio details</Text>
            <Text style={styles.cardBody}>
              These settings shape how your creator profile behaves. Your page layout stays in the profile builder.
            </Text>

            <TextInput
              value={niche}
              onChangeText={setNiche}
              placeholder="Creative niche"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={headline}
              onChangeText={setHeadline}
              placeholder="Short headline"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.fieldCaption}>Who can reach you directly</Text>
            <View style={styles.chipRow}>
              {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => {
                const isSelected = dmAccess === value;

                return (
                  <Pressable key={value} onPress={() => setDmAccess(value)} style={[styles.chip, isSelected && styles.chipActive]}>
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{getDmAccessLabel(value)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldCaption}>New-message gate</Text>
            <View style={styles.chipRow}>
              {(['direct_message', 'form', 'paid_fee'] as const).map((value) => {
                const isSelected = dmIntakePolicy === value;

                return (
                  <Pressable key={value} onPress={() => setDmIntakePolicy(value)} style={[styles.chip, isSelected && styles.chipActive]}>
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{getDmIntakePolicyLabel(value)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {dmIntakePolicy === 'paid_fee' ? (
              <TextInput
                value={dmFeeUsd}
                onChangeText={setDmFeeUsd}
                placeholder="Fee in USD"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                style={styles.input}
              />
            ) : (
              <Text style={styles.helperText}>
                {dmIntakePolicy === 'form'
                  ? 'New senders will be routed through your inquiry form first.'
                  : 'New senders can start a direct DM thread if they meet your access rules.'}
              </Text>
            )}
          </View>

          {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

          <Pressable onPress={handleSave} disabled={saving} style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.saveButtonText}>Save settings</Text>}
          </Pressable>
        </ScrollView>
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
  header: {
    minHeight: 62,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    color: theme.colors.primaryStrong,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  headerSpacer: {
    width: 38
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 14
  },
  card: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 18,
    gap: 14
  },
  cardEyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  cardBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#f0f1fb',
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: 15
  },
  fieldCaption: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: theme.radii.pill,
    backgroundColor: '#f5f6fb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipActive: {
    backgroundColor: theme.colors.primarySoft
  },
  chipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  chipTextActive: {
    color: theme.colors.primaryStrong
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  feedbackText: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    lineHeight: 20
  },
  saveButton: {
    minHeight: 50,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryStrong
  },
  saveButtonDisabled: {
    opacity: 0.7
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center'
  }
});

