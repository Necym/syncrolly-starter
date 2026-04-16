import { APP_NAME, theme } from '@syncrolly/config';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const feedCards = [
  {
    title: 'Transformation Reel',
    description: 'Pinned post concept for this week with social proof, CTA framing, and premium DM funnel.',
    accent: '#dce9ff'
  },
  {
    title: 'Subscriber Story Carousel',
    description: 'Turn a client win into a 5-slide timeline that pushes high-intent supporters toward paid access.',
    accent: '#e8f7ef'
  },
  {
    title: 'Coach POV Clip',
    description: 'Short-form talking head about boundaries, premium access, and why direct replies should stay gated.',
    accent: '#fff1ef'
  }
];

export default function FeedScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{APP_NAME} timeline</Text>
        <Text style={styles.title}>Feed</Text>
        <Text style={styles.subtitle}>
          This can become the creator timeline surface where posts, social proof, launches, and gated content live.
        </Text>

        {feedCards.map((card) => (
          <View key={card.title} style={styles.card}>
            <View style={[styles.accentBar, { backgroundColor: card.accent }]} />
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardText}>{card.description}</Text>
          </View>
        ))}
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
    gap: theme.spacing.md
  },
  eyebrow: {
    color: theme.colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  accentBar: {
    width: 52,
    height: 8,
    borderRadius: theme.radii.pill
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  cardText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21
  }
});
