import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const settingRows = [
  {
    key: 'account',
    title: 'Account',
    subtitle: 'Personal info, email, password',
    icon: 'person-outline' as const,
    route: null
  },
  {
    key: 'profile',
    title: 'Profile',
    subtitle: 'Creator niche, headline, DM rules',
    icon: 'person-circle-outline' as const,
    route: '/profile-settings' as const
  },
  {
    key: 'monetization',
    title: 'Monetization',
    subtitle: '',
    icon: 'cash-outline' as const,
    route: null
  },
  {
    key: 'privacy',
    title: 'Privacy',
    subtitle: '',
    icon: 'lock-closed-outline' as const,
    route: null
  },
  {
    key: 'notifications',
    title: 'Notifications',
    subtitle: '',
    icon: 'notifications-outline' as const,
    route: null
  },
  {
    key: 'form',
    title: 'Form',
    subtitle: 'Build form, preview, responses',
    icon: 'document-text-outline' as const,
    route: '/form-tools' as const
  },
  {
    key: 'security',
    title: 'Security',
    subtitle: '',
    icon: 'shield-checkmark-outline' as const,
    route: null
  },
  {
    key: 'support',
    title: 'Help & Support',
    subtitle: '',
    icon: 'help-circle-outline' as const,
    route: null
  }
];

export default function SettingsMenuScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={['#fbfcff', '#f7f9fd', '#fdfefe']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.backgroundBase}
          />
          <View style={styles.backgroundGlowTop} />
          <View style={styles.backgroundGlowBottom} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {settingRows.map((row, index) => {
              const isActive = Boolean(row.route);
              const isFirst = index === 0;
              const isLast = index === settingRows.length - 1;

              return (
                <Pressable
                  key={row.key}
                  disabled={!row.route}
                  onPress={row.route ? () => router.push(row.route) : undefined}
                  style={[
                    styles.row,
                    isFirst && styles.rowFirst,
                    isLast && styles.rowLast,
                    isActive && styles.rowActive
                  ]}
                >
                  <View style={[styles.rowIconWrap, isActive && styles.rowIconWrapActive]}>
                    <Ionicons
                      name={row.icon}
                      size={20}
                      color={isActive ? theme.colors.primaryStrong : '#5c6472'}
                    />
                  </View>

                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    {row.subtitle ? <Text style={styles.rowSubtitle}>{row.subtitle}</Text> : null}
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#8b93a3" />
                </Pressable>
              );
            })}
          </View>
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
    top: 36,
    right: -96,
    borderRadius: 999,
    backgroundColor: 'rgba(91, 133, 255, 0.07)'
  },
  backgroundGlowBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    bottom: 80,
    left: -110,
    borderRadius: 999,
    backgroundColor: 'rgba(188, 204, 255, 0.10)'
  },
  header: {
    minHeight: 62,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(218, 223, 232, 0.7)'
  },
  headerSpacer: {
    width: 28
  },
  headerTitle: {
    color: theme.colors.primaryStrong,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 120
  },
  card: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingVertical: 6,
    shadowColor: 'rgba(29, 41, 57, 0.08)',
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12
    },
    elevation: 4
  },
  row: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  rowFirst: {
    marginTop: 2
  },
  rowLast: {
    marginBottom: 2
  },
  rowActive: {
    backgroundColor: '#f6f8fd'
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f1f2f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  rowIconWrapActive: {
    backgroundColor: '#eaf1ff'
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  rowTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  rowSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  }
});
