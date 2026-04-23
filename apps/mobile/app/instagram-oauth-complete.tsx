import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function InstagramOAuthCompleteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string | string[];
    message?: string | string[];
    instagramUsername?: string | string[];
  }>();

  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const message = Array.isArray(params.message) ? params.message[0] : params.message;
  const instagramUsername = Array.isArray(params.instagramUsername)
    ? params.instagramUsername[0]
    : params.instagramUsername;
  const isSuccess = status === 'success';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={[styles.iconWrap, isSuccess ? styles.iconWrapSuccess : styles.iconWrapError]}>
          <Ionicons
            name={isSuccess ? 'logo-instagram' : 'alert-circle-outline'}
            size={28}
            color={isSuccess ? '#16643a' : '#b42318'}
          />
        </View>

        <Text style={styles.title}>{isSuccess ? 'Instagram connected' : 'Instagram connect failed'}</Text>
        <Text style={styles.body}>
          {isSuccess
            ? instagramUsername
              ? `Connected as @${instagramUsername}. Your Instagram Leads tab can now receive incoming leads.`
              : 'Your Instagram account is connected. Your Instagram Leads tab can now receive incoming leads.'
            : message || 'Instagram did not complete the connection flow.'}
        </Text>

        <Pressable style={styles.primaryButton} onPress={() => router.replace('/')}>
          <Text style={styles.primaryButtonText}>Back to inbox</Text>
        </Pressable>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconWrapSuccess: {
    backgroundColor: '#e8f7ee'
  },
  iconWrapError: {
    backgroundColor: 'rgba(255, 155, 155, 0.12)'
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: theme.typography.headline
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center'
  },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  }
});

