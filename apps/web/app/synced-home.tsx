'use client';

import type { ReactNode } from 'react';

type SyncedHomeProps = {
  authCard: ReactNode;
  onAuth: (mode: 'sign-in' | 'sign-up') => void;
};

export function SyncedHome({ authCard, onAuth }: SyncedHomeProps) {
  return (
    <div className="synced-home-page">
      <nav className="synced-home-nav">
        <div className="synced-home-nav-inner">
          <a className="synced-home-brand" href="#synced-home-top" aria-label="Synced-In home">
            <img src="/synced-in-logo.png" alt="" className="welcome-brand-logo" aria-hidden="true" />
            <span>Synced-In</span>
          </a>

          <div className="synced-home-nav-links" aria-label="Welcome page sections">
            <a href="#workflow">Workflow</a>
            <a href="#toolkit">Creator toolkit</a>
            <a href="#why-synced">Why Synced-In</a>
          </div>

          <div className="synced-home-nav-actions">
            <button type="button" className="synced-home-login" onClick={() => onAuth('sign-in')}>
              Log in
            </button>
            <button type="button" className="synced-home-nav-cta" onClick={() => onAuth('sign-up')}>
              Start creating
            </button>
          </div>
        </div>
      </nav>

      <main id="synced-home-top" className="synced-home-main">
        <section className="synced-home-hero">
          <div className="synced-home-grid-glow" aria-hidden="true" />
          <div className="synced-home-hero-inner">
            <div className="synced-home-hero-copy">
              <div className="synced-home-eyebrow">
                <span aria-hidden="true" />
                The creator business operating system
              </div>
              <h1>
                Your audience is moving. <em>Run the business at their speed.</em>
              </h1>
              <p>
                Turn attention into conversations, qualified opportunities, paid programs, and long-term clients
                without stitching together five different tools.
              </p>
              <div className="synced-home-hero-actions">
                <button type="button" className="synced-home-primary" onClick={() => onAuth('sign-up')}>
                  Build your creator hub
                  <span aria-hidden="true">&rarr;</span>
                </button>
                <a className="synced-home-text-link" href="#workflow">
                  See the workflow
                  <span aria-hidden="true">&darr;</span>
                </a>
              </div>
              <div className="synced-home-capability-line" aria-label="Included capabilities">
                <span>Profiles</span>
                <span>Messages</span>
                <span>Intake</span>
                <span>Programs</span>
                <span>Calendar</span>
              </div>
            </div>

            <div className="synced-home-command-stage" aria-label="Preview of the Synced-In creator workspace">
              <div className="synced-home-stage-orbit orbit-one" aria-hidden="true" />
              <div className="synced-home-stage-orbit orbit-two" aria-hidden="true" />
              <div className="synced-home-stage-panel">
                <div className="synced-home-stage-header">
                  <div>
                    <span className="synced-home-stage-kicker">LIVE WORKSPACE</span>
                    <strong>Creator command center</strong>
                  </div>
                  <span className="synced-home-live-status"><i /> Systems live</span>
                </div>

                <div className="synced-home-stage-body">
                  <aside className="synced-home-mini-rail" aria-hidden="true">
                    <span className="active">SI</span>
                    <i />
                    <i />
                    <i />
                    <i />
                  </aside>

                  <div className="synced-home-signal-canvas">
                    <div className="synced-home-canvas-heading">
                      <span>Today&apos;s flow</span>
                      <b>Everything in motion</b>
                    </div>
                    <div className="synced-home-flow-line flow-line-one" aria-hidden="true" />
                    <div className="synced-home-flow-line flow-line-two" aria-hidden="true" />
                    <div className="synced-home-flow-line flow-line-three" aria-hidden="true" />

                    <div className="synced-home-signal-card signal-message">
                      <span className="synced-home-signal-label">NEW MESSAGE</span>
                      <div className="synced-home-person-row">
                        <span className="synced-home-avatar">MJ</span>
                        <div><strong>Maya Jensen</strong><small>Brand partnership inquiry</small></div>
                      </div>
                    </div>

                    <div className="synced-home-signal-card signal-intake">
                      <span className="synced-home-signal-label">INTAKE COMPLETE</span>
                      <strong>Campaign fit: strong</strong>
                      <div className="synced-home-fit-meter"><span /></div>
                      <small>4 answers reviewed</small>
                    </div>

                    <div className="synced-home-core-node">
                      <span>QUALIFIED</span>
                      <strong>New opportunity</strong>
                      <small>Ready for your reply</small>
                    </div>

                    <div className="synced-home-signal-card signal-call">
                      <span className="synced-home-signal-label">CALL BOOKED</span>
                      <strong>Creative direction</strong>
                      <small>Thursday, 2:30 PM</small>
                    </div>

                    <div className="synced-home-signal-card signal-program">
                      <span className="synced-home-signal-label">PROGRAM</span>
                      <strong>Creator Launch Lab</strong>
                      <small>Lesson 3 delivered</small>
                    </div>
                  </div>
                </div>
              </div>

              <div className="synced-home-floating-card floating-revenue">
                <span>PAID ACCESS</span>
                <strong>$245.00</strong>
                <small>Program enrollment</small>
              </div>
              <div className="synced-home-floating-card floating-profile">
                <span className="synced-home-profile-dot">AR</span>
                <div><strong>Your profile is live</strong><small>Everything starts here</small></div>
              </div>
            </div>
          </div>
        </section>

        <div className="synced-home-activity-rail" aria-label="Example creator activity">
          <div className="synced-home-activity-track">
            {['Inquiry qualified', 'New supporter joined', 'Program lesson delivered', 'Call booked', 'Profile shared', 'Form response received', 'Inquiry qualified', 'New supporter joined', 'Program lesson delivered', 'Call booked', 'Profile shared', 'Form response received'].map((item, index) => (
              <span key={`${item}-${index}`}><i /> {item}</span>
            ))}
          </div>
        </div>

        <section id="workflow" className="synced-home-workflow">
          <div className="synced-home-section-intro">
            <span>ONE CONNECTED JOURNEY</span>
            <h2>A business system shaped like a conversation.</h2>
            <p>Synced-In keeps the human part personal while the operational part quietly takes care of itself.</p>
          </div>

          <div className="synced-home-workflow-grid">
            <article className="synced-home-workflow-step step-discover">
              <div className="synced-home-step-index">01</div>
              <span className="synced-home-step-tag">DISCOVER</span>
              <h3>Make your profile feel like a destination.</h3>
              <p>Show your work, services, programs, and personality in one branded place built to convert interest.</p>
              <div className="synced-home-profile-mock" aria-hidden="true">
                <div className="synced-home-profile-cover" />
                <span className="synced-home-profile-photo">AR</span>
                <strong>Amara Reed</strong>
                <small>Creative strategist</small>
                <div className="synced-home-profile-actions"><i /><i /></div>
              </div>
            </article>

            <article className="synced-home-workflow-step step-qualify">
              <div className="synced-home-step-index">02</div>
              <span className="synced-home-step-tag">QUALIFY</span>
              <h3>Let the right requests rise to the top.</h3>
              <p>Use intelligent intake forms to collect the context you need before you spend time in a DM or call.</p>
              <div className="synced-home-form-mock" aria-hidden="true">
                <div><span>QUESTION 3 OF 4</span><b>75%</b></div>
                <i><em /></i>
                <strong>What would make this project a win?</strong>
                <span className="synced-home-form-answer">A launch that feels unmistakably ours.</span>
              </div>
            </article>

            <article className="synced-home-workflow-step step-grow">
              <div className="synced-home-step-index">03</div>
              <span className="synced-home-step-tag">DELIVER</span>
              <h3>Turn your knowledge into an experience.</h3>
              <p>Package lessons, resources, calls, and follow-up into programs people can actually complete.</p>
              <div className="synced-home-program-mock" aria-hidden="true">
                <span className="synced-home-program-art"><i /></span>
                <div>
                  <small>CREATOR LAUNCH LAB</small>
                  <strong>Build a magnetic offer</strong>
                  <span><i /> 3 of 6 lessons</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="toolkit" className="synced-home-toolkit">
          <div className="synced-home-toolkit-heading">
            <div>
              <span>YOUR WORK, IN CONTEXT</span>
              <h2>Stop switching tools.<br />Start seeing the whole relationship.</h2>
            </div>
            <p>Messages, submissions, bookings, content, and paid access stay connected to the person they belong to.</p>
          </div>

          <div className="synced-home-product-wall">
            <article className="synced-home-product-pane product-messages">
              <div className="synced-home-pane-topline"><span>MESSAGES</span><b>Open conversations</b></div>
              <div className="synced-home-inbox-preview">
                <aside>
                  <div className="active"><span>MJ</span><p><strong>Maya Jensen</strong><small>Form response received</small></p></div>
                  <div><span>NC</span><p><strong>Noah Cole</strong><small>Thanks for the lesson!</small></p></div>
                  <div><span>SK</span><p><strong>Sienna Kim</strong><small>Call invitation</small></p></div>
                </aside>
                <section>
                  <div className="synced-home-chat-header"><span className="synced-home-avatar">MJ</span><strong>Maya Jensen</strong></div>
                  <p className="incoming">I filled out your project form. The launch window is late August.</p>
                  <p className="outgoing">Perfect. I reviewed it and would love to talk through the direction.</p>
                  <div className="synced-home-chat-input">Write a message... <span>&rarr;</span></div>
                </section>
              </div>
            </article>

            <article className="synced-home-product-pane product-calendar">
              <div className="synced-home-pane-topline"><span>CALENDAR</span><b>Your week, protected</b></div>
              <div className="synced-home-calendar-preview" aria-hidden="true">
                <div className="synced-home-calendar-days">
                  <span>M<small>18</small></span><span>T<small>19</small></span><span className="active">W<small>20</small></span><span>T<small>21</small></span><span>F<small>22</small></span>
                </div>
                <div className="synced-home-calendar-event"><i /><div><strong>Brand direction call</strong><small>2:30 PM - Maya Jensen</small></div></div>
                <div className="synced-home-calendar-event muted"><i /><div><strong>Launch Lab office hours</strong><small>4:00 PM - 8 attendees</small></div></div>
              </div>
            </article>

            <article className="synced-home-product-pane product-form">
              <div className="synced-home-pane-topline"><span>INTAKE</span><b>Context before conversation</b></div>
              <div className="synced-home-response-preview">
                <span className="synced-home-avatar">TK</span>
                <div><small>NEW RESPONSE</small><strong>Talia wants help launching a paid community.</strong></div>
                <b>Strong fit</b>
              </div>
              <div className="synced-home-response-lines" aria-hidden="true"><span /><span /><span /></div>
            </article>
          </div>
        </section>

        <section id="why-synced" className="synced-home-belief">
          <div className="synced-home-belief-mark" aria-hidden="true">
            <img src="/synced-in-logo.png" alt="" />
          </div>
          <div className="synced-home-belief-copy">
            <span>BUILT FOR THE WAY CREATORS ACTUALLY WORK</span>
            <h2>Your business should feel as considered as your content.</h2>
            <p>
              The audience sees a beautiful profile and effortless experience. You see the messages, context,
              schedule, and delivery system that keeps every opportunity moving.
            </p>
            <button type="button" className="synced-home-primary" onClick={() => onAuth('sign-up')}>
              Create your space
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </section>

        <section id="pricing" className="synced-home-access">
          <div className="synced-home-access-copy">
            <span>YOUR NEXT CHAPTER</span>
            <h2>Bring the audience.<br />We&apos;ll help organize the opportunity.</h2>
            <p>Create your workspace, shape your public presence, and start connecting every part of the business.</p>
            <div className="synced-home-access-points">
              <span><i /> One public creator hub</span>
              <span><i /> Forms, messages, and programs connected</span>
              <span><i /> Built for web and mobile</span>
            </div>
          </div>
          <div id="welcome-auth" className="synced-home-auth-shell">{authCard}</div>
        </section>
      </main>

      <footer className="synced-home-footer">
        <a className="synced-home-brand" href="#synced-home-top" aria-label="Back to top">
          <img src="/synced-in-logo.png" alt="" className="welcome-brand-logo mini" aria-hidden="true" />
          <span>Synced-In</span>
        </a>
        <p>Creator operations, without the operational drag.</p>
        <span>© 2026 Synced-In</span>
      </footer>
    </div>
  );
}
