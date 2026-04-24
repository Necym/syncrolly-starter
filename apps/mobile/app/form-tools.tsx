import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@syncrolly/config';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const toolCards = [
  {
    key: 'build',
    title: 'Build Form',
    body: 'Customize the questions, answer types, and option sets for the inquiry flow.',
    icon: 'construct-outline' as const,
    route: '/form-builder' as const
  },
  {
    key: 'preview',
    title: 'Preview Form',
    body: 'Open the live preview and experience the form exactly as a supporter would see it.',
    icon: 'sparkles-outline' as const,
    route: '/inquiry-preview' as const
  },
  {
    key: 'responses',
    title: 'Form Responses',
    body: 'See the real inquiry submissions that supporters have sent through your saved form.',
    icon: 'mail-open-outline' as const,
    route: '/form-responses' as const
  }
];

export default function FormToolsScreen() {
  const router = useRouter();

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
            <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Settings</Text>
            <Text style={styles.headerTitle}>Form</Text>
          </View>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Form Tools</Text>
            <Text style={styles.heroBody}>
              Build and preview the inquiry experience that appears before a creator conversation begins.
            </Text>
          </View>

          <View style={styles.toolStack}>
            {toolCards.map((card) => (
              <Pressable
                key={card.key}
                onPress={() => router.push(card.route)}
                style={styles.toolCard}
              >
                <View style={styles.toolCardIcon}>
                  <Ionicons name={card.icon} size={20} color={theme.colors.textPrimary} />
                </View>

                <View style={styles.toolCardCopy}>
                  <Text style={styles.toolCardTitle}>{card.title}</Text>
                  <Text style={styles.toolCardBody}>{card.body}</Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>
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
    width: 260,
    height: 260,
    top: 70,
    right: -70,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 142, 255, 0.12)'
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    width: 220,
    height: 220,
    bottom: 120,
    left: -60,
    borderRadius: 999,
    backgroundColor: 'rgba(120, 93, 255, 0.12)'
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
    backgroundColor: theme.colors.surfaceContainerHighest,
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
  container: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 18
  },
  heroCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    gap: 8
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    fontFamily: theme.typography.headline
  },
  heroBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 23
  },
  toolStack: {
    gap: 12
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    shadowColor: '#050910',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 3
  },
  toolCardIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toolCardCopy: {
    flex: 1,
    gap: 3
  },
  toolCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800'
  },
  toolCardBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  }
});
