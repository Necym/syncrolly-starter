import { APP_NAME, theme } from '@syncrolly/config';
import type { CSSProperties, ReactNode } from 'react';
import './globals.css';
import { RealtimeVoiceWidget } from './realtime-voice-widget';

export const metadata = {
  title: `${APP_NAME} | Creator Inbox`,
  description: 'Premium inbox shell for Syncrolly creators across mobile and web.'
};

const rootVariables = {
  '--color-background': theme.colors.background,
  '--color-surface': theme.colors.surface,
  '--color-surface-muted': theme.colors.surfaceMuted,
  '--color-surface-raised': theme.colors.surfaceRaised,
  '--color-surface-border': theme.colors.surfaceBorder,
  '--color-surface-container-low': theme.colors.surfaceContainerLow,
  '--color-surface-container-lowest': theme.colors.surfaceContainerLowest,
  '--color-surface-container-high': theme.colors.surfaceContainerHigh,
  '--color-text-primary': theme.colors.textPrimary,
  '--color-text-secondary': theme.colors.textSecondary,
  '--color-text-muted': theme.colors.textMuted,
  '--color-on-surface-variant': theme.colors.onSurfaceVariant,
  '--color-primary': theme.colors.primary,
  '--color-primary-strong': theme.colors.primaryStrong,
  '--color-primary-soft': theme.colors.primarySoft,
  '--color-accent': theme.colors.accent,
  '--color-accent-soft': theme.colors.accentSoft,
  '--color-success': theme.colors.success,
  '--color-danger': theme.colors.danger,
  '--shadow-floating': theme.shadows.floating,
  '--shadow-card': theme.shadows.card,
  '--font-headline': theme.typography.headline,
  '--font-body': theme.typography.body
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="syncrolly-body" style={rootVariables}>
        {children}
        <RealtimeVoiceWidget />
      </body>
    </html>
  );
}
