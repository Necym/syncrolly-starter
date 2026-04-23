'use client';

import { useRouter } from 'next/navigation';
import { BrandMark, Icon } from '../../ui';

const toolCards = [
  {
    key: 'build',
    title: 'Build Form',
    body: 'Customize the questions, answer types, and option sets for the inquiry flow.',
    route: '/settings/form/builder'
  },
  {
    key: 'preview',
    title: 'Preview Form',
    body: 'Open the live preview and experience the form exactly as a supporter would see it.',
    route: '/settings/form/preview'
  },
  {
    key: 'responses',
    title: 'Form Responses',
    body: 'See the real inquiry submissions that supporters have sent through your saved form.',
    route: '/settings/form/responses'
  }
];

export default function FormToolsPage() {
  const router = useRouter();

  return (
    <div className="thread-page web-settings-page">
      <header className="settings-menu-header form-tools-header">
        <div className="settings-menu-header-inner form-tools-header-inner">
          <button type="button" className="icon-button" onClick={() => router.push('/settings')} aria-label="Go back">
            <Icon name="back" />
          </button>

          <div className="brand brand-wordmark settings-menu-brand">
            <BrandMark />
          </div>

          <div className="settings-menu-spacer" />
        </div>
      </header>

      <main className="form-tools-main">
        <div className="form-tools-shell">
          <section className="form-tools-hero">
            <span className="public-form-kicker">Settings</span>
            <h1>Form</h1>
            <p>
              Build and preview the inquiry experience that appears before a creator conversation begins.
            </p>
          </section>

          <section className="form-tools-stack">
            {toolCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className="form-tools-card"
                onClick={() => router.push(card.route)}
              >
                <div className="form-tools-card-icon">
                  <Icon name={card.key === 'build' ? 'settings' : card.key === 'preview' ? 'compose' : 'inbox'} />
                </div>

                <div className="form-tools-card-copy">
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </div>

                <span className="form-tools-card-chevron">›</span>
              </button>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
