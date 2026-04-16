import { theme } from '@syncrolly/config';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const statCards = [
  { label: 'Unread priority threads', value: '2', tone: '#dce9ff' },
  { label: 'Paid supporters this month', value: '38', tone: '#e8f7ef' },
  { label: 'Average reply time', value: '42m', tone: '#fff1ef' }
];

export default function StatsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Stats</Text>
        <Text style={styles.subtitle}>
          This is a clean placeholder for creator analytics, reply performance, and revenue-driving inbox insights.
        </Text>

        <View style={styles.grid}>
          {statCards.map((card) => (
            <View key={card.label} style={styles.card}>
              <View style={[styles.tone, { backgroundColor: card.tone }]} />
              <Text style={styles.value}>{card.value}</Text>
              <Text style={styles.label}>{card.label}</Text>
            </View>
          ))}
        </View>
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
    gap: theme.spacing.lg
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
  grid: {
    gap: theme.spacing.md
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  tone: {
    width: 44,
    height: 44,
    borderRadius: 14
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: 34,
    fontWeight: '800'
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  }
});
