import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import { StyleSheet, Text, View } from 'react-native';

export type InlineNoticeTone = 'success' | 'error' | 'info';

const NOTICE_MAP: Record<
  InlineNoticeTone,
  {
    icon: string;
    label: string;
    backgroundColor: string;
    borderColor: string;
    iconBackgroundColor: string;
    iconColor: string;
  }
> = {
  success: {
    icon: 'checkmark-circle',
    label: 'Saved',
    backgroundColor: 'rgba(89, 213, 160, 0.12)',
    borderColor: 'rgba(89, 213, 160, 0.22)',
    iconBackgroundColor: 'rgba(89, 213, 160, 0.16)',
    iconColor: theme.colors.success
  },
  error: {
    icon: 'alert-circle',
    label: 'Needs attention',
    backgroundColor: 'rgba(255, 155, 155, 0.12)',
    borderColor: 'rgba(255, 155, 155, 0.18)',
    iconBackgroundColor: 'rgba(255, 155, 155, 0.14)',
    iconColor: theme.colors.danger
  },
  info: {
    icon: 'information-circle',
    label: 'Good to know',
    backgroundColor: 'rgba(77, 142, 255, 0.12)',
    borderColor: 'rgba(77, 142, 255, 0.2)',
    iconBackgroundColor: 'rgba(77, 142, 255, 0.16)',
    iconColor: theme.colors.primaryStrong
  }
};

export default function InlineNotice({
  tone,
  message
}: {
  tone: InlineNoticeTone;
  message: string;
}) {
  const config = NOTICE_MAP[tone];

  return (
    <View style={[styles.card, { backgroundColor: config.backgroundColor, borderColor: config.borderColor }]}>
      <View style={[styles.iconWrap, { backgroundColor: config.iconBackgroundColor }]}>
        <Ionicons name={config.icon as any} size={18} color={config.iconColor} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.label}>{config.label}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  copy: {
    flex: 1,
    gap: 2
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.textPrimary
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textSecondary
  }
});
