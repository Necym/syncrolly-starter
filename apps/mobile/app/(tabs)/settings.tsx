import { theme } from '@syncrolly/config';
import { hasCompletedProfile, type ViewerProfile } from '@syncrolly/core';
import { getViewerProfile, saveCreatorProfile, saveSupporterProfile, unregisterPushDevice } from '@syncrolly/data';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearPushRegistration, getSavedPushRegistration } from '../../lib/pushRegistration';
import { getDefaultDisplayName, useMobileSession } from '../../lib/session';

type DmAccess = 'free' | 'subscriber_only' | 'paid_only';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export default function ProfileScreen() {
  const { user, loading: sessionLoading, supabase, isConfigured } = useMobileSession();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [niche, setNiche] = useState('');
  const [headline, setHeadline] = useState('');
  const [dmAccess, setDmAccess] = useState<DmAccess>('subscriber_only');

  async function loadProfile() {
    if (!supabase || !user) {
      return;
    }

    setLoadingProfile(true);

    try {
      const profile = await getViewerProfile(supabase, user.id);
      setViewerProfile(profile);
      setDisplayName(profile?.displayName ?? getDefaultDisplayName(user));
      setNiche(profile?.creatorProfile?.niche ?? '');
      setHeadline(profile?.creatorProfile?.headline ?? '');
      setDmAccess(profile?.creatorProfile?.dmAccess ?? 'subscriber_only');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setViewerProfile(null);
      return;
    }

    void loadProfile();
  }, [supabase, user?.id]);

  async function handleSave() {
    if (!supabase || !user || !viewerProfile) {
      return;
    }

    const nextDisplayName = displayName.trim();

    if (!nextDisplayName) {
      setFeedback('Display name is required.');
      return;
    }

    setSavingProfile(true);
    setFeedback(null);

    try {
      const nextProfile =
        viewerProfile.role === 'creator'
          ? await saveCreatorProfile(supabase, {
              userId: user.id,
              displayName: nextDisplayName,
              niche: niche.trim(),
              headline: headline.trim(),
              dmAccess
            })
          : await saveSupporterProfile(supabase, {
              userId: user.id,
              displayName: nextDisplayName,
              accessLevel: viewerProfile.supporterProfile?.accessLevel ?? 'free',
              totalSpend: viewerProfile.supporterProfile?.totalSpend ?? 0
            });

      setViewerProfile(nextProfile);
      setFeedback('Profile saved.');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    setFeedback(null);

    try {
      const savedRegistration = await getSavedPushRegistration();

      if (savedRegistration && user && savedRegistration.userId === user.id) {
        await unregisterPushDevice(supabase, {
          expoPushToken: savedRegistration.expoPushToken
        });

        await clearPushRegistration();
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.emptyBody}>Add your Supabase keys in `apps/mobile/.env` to load the real profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sessionLoading || loadingProfile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
          <Text style={styles.emptyBody}>Loading your profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user || !viewerProfile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.emptyBody}>Sign in from the inbox tab to create and save your real profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {hasCompletedProfile(viewerProfile)
            ? 'This is now backed by your real Supabase profile.'
            : 'Finish onboarding from the inbox tab, then come back here to edit your details.'}
        </Text>

        <View style={styles.heroCard}>
          <View style={styles.avatarFrame}>
            {viewerProfile.avatarUrl ? (
              <Image source={{ uri: viewerProfile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{viewerProfile.displayName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.name}>{viewerProfile.displayName}</Text>
          <Text style={styles.roleBadge}>{viewerProfile.role === 'creator' ? 'Creator account' : 'Supporter account'}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.detailLabel}>Display name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} />
        </View>

        {viewerProfile.role === 'creator' ? (
          <>
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Niche</Text>
              <TextInput value={niche} onChangeText={setNiche} style={styles.input} />
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Headline</Text>
              <TextInput
                value={headline}
                onChangeText={setHeadline}
                style={[styles.input, styles.multilineInput]}
                multiline
              />
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>DM access</Text>
              <View style={styles.optionRow}>
                {(['free', 'subscriber_only', 'paid_only'] as const).map((value) => {
                  const isSelected = dmAccess === value;
                  const label = value === 'free' ? 'Everyone' : value === 'subscriber_only' ? 'Subscribers' : 'Paid only';

                  return (
                    <Pressable
                      key={value}
                      style={[styles.optionChip, isSelected && styles.optionChipActive]}
                      onPress={() => setDmAccess(value)}
                    >
                      <Text style={[styles.optionChipText, isSelected && styles.optionChipTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Access level</Text>
            <Text style={styles.detailValue}>{viewerProfile.supporterProfile?.accessLevel ?? 'free'}</Text>
          </View>
        )}

        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

        <Pressable style={[styles.primaryAction, savingProfile && styles.primaryActionDisabled]} onPress={handleSave} disabled={savingProfile}>
          {savingProfile ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.primaryActionText}>Save Changes</Text>}
        </Pressable>

        <Pressable style={styles.secondaryAction} onPress={handleSignOut}>
          <Text style={styles.secondaryActionText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
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
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    paddingBottom: 120
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: '800'
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm
  },
  avatarFrame: {
    width: 78,
    height: 78,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800'
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800'
  },
  roleBadge: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  detailCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  detailLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  detailValue: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700'
  },
  input: {
    minHeight: 46,
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
  secondaryAction: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8dcef',
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryActionText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10
  },
  emptyBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  }
});
