'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '../ui';

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
    subtitle: 'Creator niche, headline, DM rules',
    icon: 'profile' as const,
    route: '/settings/profile'
  },
  {
    key: 'monetization',
    title: 'Monetization',
    subtitle: 'Products, paid access, revenue tools',
    icon: 'stats' as const,
    route: null
  },
  {
    key: 'programs',
    title: 'Programs',
    subtitle: 'Lessons, modules, learner progress',
    icon: 'stats' as const,
    route: '/program-studio'
  },
  {
    key: 'privacy',
    title: 'Privacy',
    subtitle: 'Visibility and contact controls',
    icon: 'settings' as const,
    route: null
  },
  {
    key: 'notifications',
    title: 'Notifications',
    subtitle: 'Inbox, forms, calls, and lead alerts',
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
    subtitle: 'Sessions, devices, account protection',
    icon: 'settings' as const,
    route: null
  },
  {
    key: 'support',
    title: 'Help & Support',
    subtitle: 'Guides, contact, and product help',
    icon: 'more' as const,
    route: null
  }
];

const activeRows = settingRows.filter((row) => row.route);
const dormantRows = settingRows.filter((row) => !row.route);

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="settings-desktop-page">
      <header className="settings-desktop-topbar">
        <button type="button" className="settings-desktop-back" onClick={() => router.push('/')}>
          <Icon name="back" />
          <span>Messages</span>
        </button>
        <p>Creator controls</p>
      </header>

      <main className="settings-desktop-main">
        <section className="settings-desktop-hero">
          <p>Settings</p>
          <h1>Manage the creator operating system.</h1>
          <span>Profile, form intake, monetization, privacy, and account controls live here as the web app catches up to mobile.</span>
        </section>

        <section className="settings-desktop-layout">
          <div className="settings-desktop-primary">
            <div className="settings-desktop-section-heading">
              <span>Available now</span>
              <p>These screens are wired on web and share data with the mobile app.</p>
            </div>

            <div className="settings-desktop-action-grid">
              {activeRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className="settings-desktop-action"
                  onClick={() => router.push(row.route ?? '/settings')}
                >
                  <span className="settings-desktop-action-icon">
                    <Icon name={row.icon} />
                  </span>
                  <span className="settings-desktop-action-copy">
                    <strong>{row.title}</strong>
                    <small>{row.subtitle}</small>
                  </span>
                  <span className="settings-desktop-action-arrow">Open</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="settings-desktop-secondary">
            <div className="settings-desktop-section-heading">
              <span>Coming next</span>
              <p>Visible for parity, not wired yet.</p>
            </div>

            <div className="settings-desktop-list">
              {dormantRows.map((row) => (
                <div key={row.key} className="settings-desktop-list-row">
                  <span className="settings-desktop-list-icon">
                    <Icon name={row.icon} />
                  </span>
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.subtitle}</small>
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
