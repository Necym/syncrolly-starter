'use client';

import { getConversationDetails, markConversationRead, sendMessage } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useWebSession } from '../../../lib/session';
import { BrandMark, Icon, getErrorMessage } from '../../ui';

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const { user, loading: sessionLoading, supabase, isConfigured } = useWebSession();
  const scrollPanelRef = useRef<HTMLDivElement>(null);
  const pendingAutoScrollRef = useRef(true);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedThreadId = params?.threadId;
  const [draft, setDraft] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversation, setConversation] = useState<Awaited<ReturnType<typeof getConversationDetails>>>(null);

  useEffect(() => {
    setAvatarFailed(false);
  }, [conversation?.participantAvatar]);

  async function loadConversation(options?: { showLoader?: boolean }) {
    if (!supabase || !user || !resolvedThreadId) {
      return;
    }

    const showLoader = options?.showLoader ?? conversation == null;

    if (showLoader) {
      setLoadingConversation(true);
    }

    setFeedback(null);

    try {
      const nextConversation = await getConversationDetails(supabase, resolvedThreadId, user.id);
      setConversation(nextConversation);
      pendingAutoScrollRef.current = true;

      const lastMessage = nextConversation?.messages[nextConversation.messages.length - 1];

      if (lastMessage) {
        await markConversationRead(supabase, {
          conversationId: resolvedThreadId,
          userId: user.id,
          readAt: lastMessage.createdAt
        });
      }
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Something went wrong while loading the conversation.'));
    } finally {
      if (showLoader) {
        setLoadingConversation(false);
      }
    }
  }

  useEffect(() => {
    if (!user || !resolvedThreadId || !supabase) {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      setConversation(null);
      return;
    }

    void loadConversation({ showLoader: true });
  }, [resolvedThreadId, supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user || !resolvedThreadId) {
      return;
    }

    const scheduleThreadRefresh = () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
      }

      realtimeRefreshTimeoutRef.current = setTimeout(() => {
        realtimeRefreshTimeoutRef.current = null;
        void loadConversation({ showLoader: false });
      }, 150);
    };

    const channel = supabase
      .channel(`web-thread-live:${resolvedThreadId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${resolvedThreadId}`
        },
        (payload) => {
          const senderId =
            typeof payload.new === 'object' &&
            payload.new !== null &&
            'sender_id' in payload.new &&
            typeof (payload.new as { sender_id?: unknown }).sender_id === 'string'
              ? (payload.new as { sender_id: string }).sender_id
              : null;

          if (senderId === user.id) {
            return;
          }

          scheduleThreadRefresh();
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [resolvedThreadId, supabase, user?.id]);

  useEffect(() => {
    if (!pendingAutoScrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      scrollPanelRef.current?.scrollTo({
        top: scrollPanelRef.current.scrollHeight,
        behavior: 'auto'
      });
      pendingAutoScrollRef.current = false;
    });
  }, [conversation?.messages]);

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  }

  async function handleSend() {
    if (!supabase || !user || !conversation) {
      return;
    }

    const nextText = draft.trim();

    if (!nextText) {
      return;
    }

    setSending(true);
    setFeedback(null);
    pendingAutoScrollRef.current = true;

    try {
      await sendMessage(supabase, {
        conversationId: conversation.id,
        senderId: user.id,
        body: nextText
      });

      setDraft('');
      await loadConversation({ showLoader: false });
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Something went wrong while loading the conversation.'));
    } finally {
      setSending(false);
    }
  }

  if (!isConfigured || !supabase) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
            <div className="brand brand-compact">
              <BrandMark />
              <span className="brand-name">Synchrolly</span>
            </div>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Supabase isn&apos;t configured</h1>
            <p className="stage-body">Add the web environment keys, then restart Next.</p>
          </div>
        </main>
      </div>
    );
  }

  if (sessionLoading || (loadingConversation && !conversation)) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <div className="spinner" aria-hidden="true" />
            <p className="stage-body">Loading conversation...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Sign in first</h1>
            <p className="stage-body">This conversation is tied to your real Syncrolly account.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="thread-page">
        <header className="thread-topbar-shell">
          <div className="thread-topbar">
            <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          </div>
        </header>

        <main className="center-stage-page">
          <div className="center-stage">
            <h1 className="stage-title">Conversation not found</h1>
            <p className="stage-body">{feedback ?? 'Go back to the inbox and start a new message from there.'}</p>
          </div>
        </main>
      </div>
    );
  }

  const activityLabel = conversation.activityLabel.toUpperCase();
  const presenceColor = conversation.participantPresence === 'online' ? 'var(--color-success)' : 'var(--color-text-muted)';
  const showAvatarImage = Boolean(conversation.participantAvatar && !avatarFailed);

  return (
    <div className="thread-page">
      <header className="thread-topbar-shell">
        <div className="thread-topbar">
          <button type="button" className="icon-button" onClick={handleBack} aria-label="Go back">
            <Icon name="back" />
          </button>

          <div className="header-identity">
            <div className="header-avatar" style={{ borderColor: `${conversation.participantAccentColor}33` }}>
              {showAvatarImage ? (
                <img
                  src={conversation.participantAvatar}
                  alt={conversation.participantName}
                  className="header-avatar-image"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="header-avatar-text" style={{ color: conversation.participantAccentColor }}>
                  {conversation.participantInitials}
                </span>
              )}
              <span className="header-presence-dot" style={{ backgroundColor: presenceColor }} />
            </div>

            <div className="header-copy">
              <h1 className="header-name">{conversation.participantName}</h1>
              <p className="header-meta">{activityLabel}</p>
            </div>
          </div>

          <button type="button" className="icon-button" aria-label="Conversation options">
            <Icon name="more" />
          </button>
        </div>
      </header>

      <main className="thread-main">
        <section className="thread-shell">
          <div ref={scrollPanelRef} className="thread-scroll-panel">
            <div className="thread-messages">
              {feedback ? <p className="feedback-inline">{feedback}</p> : null}

              {conversation.messages.map((message) => (
                <div key={message.id} className="message-block">
                  {message.dayLabel ? (
                    <div className="day-pill-wrap">
                      <div className="day-pill">
                        <span className="day-pill-text">{message.dayLabel.toUpperCase()}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className={`message-row ${message.isFromCreator ? 'outgoing' : 'incoming'}`}>
                    <div className={`message-bubble ${message.isFromCreator ? 'outgoing' : 'incoming'}`}>
                      <p className={`message-text ${message.isFromCreator ? 'outgoing' : 'incoming'}`}>{message.text}</p>
                    </div>

                    <div className={`message-meta-row ${message.isFromCreator ? 'outgoing' : ''}`}>
                      <span className="message-meta-text">{message.timeLabel}</span>
                      {message.isFromCreator ? <span className="message-meta-check">✓✓</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="thread-composer">
            <button type="button" className="media-button" aria-label="Attach camera content">
              <Icon name="camera" />
            </button>
            <button type="button" className="media-button" aria-label="Attach image">
              <Icon name="image" />
            </button>

            <input
              className="thread-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                pendingAutoScrollRef.current = true;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Write a message..."
            />

            <button
              type="button"
              className={`send-button${!draft.trim() || sending ? ' disabled' : ''}`}
              onClick={() => void handleSend()}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
            >
              {sending ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="send" />}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
