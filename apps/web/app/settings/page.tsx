'use client';

import { useRouter } from 'next/navigation';
import { BrandMark, Icon } from '../ui';

const settingRows = [
  {
    key: 'account',
    title: 'Account',
    subtitle: 'Personal info, email, password',
    icon: 'profile' as const,
    route: null
  },
  {
    key: 'profile',
    title: 'Profile',
    subtitle: '',
    icon: 'profile' as const,
    route: '/settings/profile'
  },
  {
    key: 'monetization',
    title: 'Monetization',
    subtitle: '',
    icon: 'stats' as const,
    route: null
  },
  {
    key: 'privacy',
    title: 'Privacy',
    subtitle: '',
    icon: 'notifications' as const,
    route: null
  },
  {
    key: 'notifications',
    title: 'Notifications',
    subtitle: '',
    icon: 'notifications' as const,
    route: null
  },
  {
    key: 'form',
    title: 'Form',
    subtitle: 'Build form, preview, responses',
    icon: 'compose' as const,
    route: '/settings/form'
  },
  {
    key: 'security',
    title: 'Security',
    subtitle: '',
    icon: 'settings' as const,
    route: null
  },
  {
    key: 'support',
    title: 'Help & Support',
    subtitle: '',
    icon: 'more' as const,
    route: null
  }
];

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="thread-page web-settings-page">
      <header className="settings-menu-header">
        <div className="settings-menu-header-inner">
          <button type="button" className="icon-button" onClick={() => router.push('/')} aria-label="Go back">
            <Icon name="back" />
          </button>
          <h1>Settings</h1>
          <div className="settings-menu-spacer" />
        </div>
      </header>

      <main className="settings-menu-main">
        <div className="settings-menu-shell">
          <div className="brand brand-wordmark settings-menu-brand">
            <BrandMark />
          </div>

          <section className="settings-menu-card">
            {settingRows.map((row) => {
              const isActive = Boolean(row.route);

              return (
                <button
                  key={row.key}
                  type="button"
                  className={`settings-menu-row${isActive ? ' active' : ''}`}
                  disabled={!row.route}
                  onClick={row.route ? () => router.push(row.route) : undefined}
                >
                  <div className={`settings-menu-row-icon${isActive ? ' active' : ''}`}>
                    <Icon name={row.icon} />
                  </div>

                  <div className="settings-menu-row-copy">
                    <h2>{row.title}</h2>
                    {row.subtitle ? <p>{row.subtitle}</p> : null}
                  </div>

                  <span className="settings-menu-row-chevron">›</span>
                </button>
              );
            })}
          </section>
        </div>
      </main>
    </div>
  );
}
