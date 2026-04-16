export const APP_NAME = 'Syncrolly';

export const inboxFilters = [
  { key: 'all', label: 'All' },
  { key: 'vip', label: 'VIP' },
  { key: 'paid', label: 'Paid' },
  { key: 'requests', label: 'Requests' }
] as const;

export const appSections = [
  { key: 'feed', label: 'Feed' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'stats', label: 'Stats' },
  { key: 'profile', label: 'Profile' }
] as const;

export const theme = {
  colors: {
    background: '#f9f9ff',
    surface: '#ffffff',
    surfaceMuted: '#ededf6',
    surfaceRaised: '#e7e8f0',
    surfaceBorder: '#c2c6d4',
    surfaceContainerLow: '#f2f3fc',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerHigh: '#e7e8f0',
    textPrimary: '#191c21',
    textSecondary: '#556072',
    textMuted: '#727784',
    onSurfaceVariant: '#424752',
    primary: '#003f87',
    primaryStrong: '#0056b3',
    primarySoft: '#d7e2ff',
    accent: '#115cb9',
    accentSoft: '#eff4ff',
    success: '#1d925f',
    danger: '#ba1a1a'
  },
  radii: {
    sm: 4,
    md: 8,
    lg: 12,
    pill: 999
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32
  },
  typography: {
    headline: '"Manrope", "Avenir Next", "Segoe UI", sans-serif',
    body: '"Inter", "Segoe UI", sans-serif'
  },
  shadows: {
    floating: '0 12px 32px rgba(25, 28, 33, 0.05)',
    card: '0 18px 40px rgba(25, 28, 33, 0.04)'
  }
} as const;

export const bookingTypes = ['Quick Call', 'Consultation', 'Coaching Session'] as const;
