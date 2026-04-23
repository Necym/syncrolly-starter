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
    background: '#0b1326',
    surface: '#131b2e',
    surfaceMuted: '#171f33',
    surfaceRaised: '#222a3d',
    surfaceBorder: '#424754',
    surfaceContainerLowest: '#131b2e',
    surfaceContainerLow: '#171f33',
    surfaceContainerHigh: '#222a3d',
    surfaceContainerHighest: '#2d3449',
    textPrimary: '#f2f6ff',
    textSecondary: '#d6dcef',
    textMuted: '#aab3c8',
    onSurfaceVariant: '#d0d6e8',
    primary: '#4d8eff',
    primaryStrong: '#4d8eff',
    primarySoft: 'rgba(77, 142, 255, 0.16)',
    accent: '#571bc1',
    accentStrong: '#571bc1',
    accentSoft: 'rgba(87, 27, 193, 0.18)',
    outline: '#8c909f',
    outlineSoft: 'rgba(255,255,255,0.08)',
    onPrimary: '#ffffff',
    success: '#59d5a0',
    successSoft: 'rgba(89, 213, 160, 0.16)',
    warning: '#f5c16c',
    warningSoft: 'rgba(245, 193, 108, 0.16)',
    danger: '#ff9b9b',
    dangerSoft: 'rgba(255, 155, 155, 0.16)'
  },
  gradients: {
    brand: ['#4d8eff', '#571bc1'],
    metallic: ['#8392a6', '#2d3449']
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
