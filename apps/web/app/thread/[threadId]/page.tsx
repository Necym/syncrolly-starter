'use client';

import { approveConversationRequest, getConversationDetails, markConversationRead, sendMessage } from '@syncrolly/data';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useWebSession } from '../../../lib/session';
import { getErrorMessage } from '../../ui';

type ChatIconName = 'back' | 'more' | 'send' | 'image' | 'camera' | 'check' | 'info';

function ChatIcon({ name, className = '' }: { name: ChatIconName; className?: string }) {
  const icons: Record<ChatIconName, ReactNode> = {
    back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
    more: (
      <>
        <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    send: <path d="M4 4 20 12 4 20l3-8-3-8Z" fill="currentColor" stroke="currentColor" />,
    image: (
      <>
        <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
        <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
        <path d="m4.5 17 4.5-4.6 3 2.9 2.2-2.2 5.3 5.1" />
      </>
    ),
    camera: (
      <>
        <path d="M8 7.5h8l1 1.5h3a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 9h3z" />
        <circle cx="12" cy="13.5" r="3" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5" />
        <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
      </>
    )
  };

  return (
    <svg className={`chat-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

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
  const [approvingRequest, setApprovingRequest] = useState(false);
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

    const staleChannelPrefix = `realtime:web-thread-live:${resolvedThreadId}:${user.id}`;

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic.startsWith(staleChannelPrefix)) {
        void supabase.removeChannel(existingChannel);
      }
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
      .channel(`web-thread-live:${resolvedThreadId}:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${resolvedThreadId}`
        },
        () => {
          scheduleThreadRefresh();
        }
      )
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

    if (!nextText || !conversation.canSendMessage) {
      return;
    }

    setSending(true);
    setFeedback(null);
    pendingAutoScrollRef.current = true;

    try {
      if (conversation.canApproveRequest) {
        await approveConversationRequest(supabase, {
          conversationId: conversation.id
        });
      }

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

  async function handleApproveRequest() {
    if (!supabase || !conversation?.canApproveRequest) {
      return;
    }

    setApprovingRequest(true);
    setFeedback(null);

    try {
      await approveConversationRequest(supabase, {
        conversationId: conversation.id
      });

      await loadConversation({ showLoader: false });
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Something went wrong while updating the request.'));
    } finally {
      setApprovingRequest(false);
    }
  }

  function ChatShell({ children }: { children: ReactNode }) {
    return (
      <div className="chat-page">
        <div className="chat-glow chat-glow-blue" />
        <div className="chat-glow chat-glow-purple" />
        {children}
      </div>
    );
  }

  if (!isConfigured || !supabase) {
    return (
      <ChatShell>
        <header className="chat-topbar">
          <button type="button" className="chat-icon-button" onClick={handleBack} aria-label="Go back">
            <ChatIcon name="back" />
          </button>
        </header>
        <main className="chat-state">
          <h1>Supabase isn&apos;t configured</h1>
          <p>Add the web environment keys, then restart Next.</p>
        </main>
      </ChatShell>
    );
  }

  if (sessionLoading || (loadingConversation && !conversation)) {
    return (
      <ChatShell>
        <header className="chat-topbar">
          <button type="button" className="chat-icon-button" onClick={handleBack} aria-label="Go back">
            <ChatIcon name="back" />
          </button>
        </header>
        <main className="chat-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading conversation...</p>
        </main>
      </ChatShell>
    );
  }

  if (!user) {
    return (
      <ChatShell>
        <header className="chat-topbar">
          <button type="button" className="chat-icon-button" onClick={handleBack} aria-label="Go back">
            <ChatIcon name="back" />
          </button>
        </header>
        <main className="chat-state">
          <h1>Sign in first</h1>
          <p>This conversation is tied to your Synced-In account.</p>
        </main>
      </ChatShell>
    );
  }

  if (!conversation) {
    return (
      <ChatShell>
        <header className="chat-topbar">
          <button type="button" className="chat-icon-button" onClick={handleBack} aria-label="Go back">
            <ChatIcon name="back" />
          </button>
        </header>
        <main className="chat-state">
          <h1>Conversation not found</h1>
          <p>{feedback ?? 'Go back to the inbox and start a new message from there.'}</p>
        </main>
      </ChatShell>
    );
  }

  const showAvatarImage = Boolean(conversation.participantAvatar && !avatarFailed);
  const isOnline = conversation.participantPresence === 'online';
  const presenceText = isOnline ? 'Active now' : conversation.activityLabel;
  const composerPlaceholder = !conversation.canSendMessage
    ? 'Waiting for approval...'
    : conversation.status === 'request'
      ? 'Send your request...'
      : 'Message';

  const requestBannerTitle = conversation.canApproveRequest
    ? 'Message request'
    : conversation.canSendMessage
      ? 'First message'
      : 'Pending approval';
  const requestBannerBody = conversation.canApproveRequest
    ? 'Approve to move this into your active inbox, or reply to approve automatically.'
    : conversation.canSendMessage
      ? 'Your first message will be sent as a request.'
      : 'Waiting for approval. You can send more once accepted.';

  return (
    <ChatShell>
      <header className="chat-topbar">
        <button type="button" className="chat-icon-button" onClick={handleBack} aria-label="Go back">
          <ChatIcon name="back" />
        </button>

        <div className="chat-identity">
          <div className="chat-avatar">
            {showAvatarImage ? (
              <img
                src={conversation.participantAvatar}
                alt={conversation.participantName}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span style={{ color: conversation.participantAccentColor }}>
                {conversation.participantInitials}
              </span>
            )}
            {isOnline ? <span className="chat-avatar-dot" aria-hidden="true" /> : null}
          </div>
          <div className="chat-identity-copy">
            <strong>{conversation.participantName}</strong>
            <span className={isOnline ? 'chat-presence online' : 'chat-presence'}>{presenceText}</span>
          </div>
        </div>

        <button type="button" className="chat-icon-button" aria-label="Conversation options">
          <ChatIcon name="more" />
        </button>
      </header>

      <main ref={scrollPanelRef} className="chat-scroll">
        <div className="chat-messages">
          {conversation.status === 'request' ? (
            <div className="chat-request">
              <div className="chat-request-head">
                <ChatIcon name="info" />
                <span>{conversation.statusLabel}</span>
                {conversation.canApproveRequest ? (
                  <button
                    type="button"
                    className="chat-request-approve"
                    onClick={() => void handleApproveRequest()}
                    disabled={approvingRequest}
                  >
                    {approvingRequest ? <span className="button-spinner" aria-hidden="true" /> : 'Approve'}
                  </button>
                ) : null}
              </div>
              <strong>{requestBannerTitle}</strong>
              <p>{requestBannerBody}</p>
            </div>
          ) : null}

          {feedback ? <p className="chat-feedback">{feedback}</p> : null}

          {conversation.messages.map((message, index) => {
            const prev = conversation.messages[index - 1];
            const next = conversation.messages[index + 1];
            const isOutgoing = message.isFromCreator;
            const isGroupStart = !prev || prev.isFromCreator !== isOutgoing || Boolean(message.dayLabel);
            const isGroupEnd = !next || next.isFromCreator !== isOutgoing || Boolean(next.dayLabel);

            return (
              <div key={message.id}>
                {message.dayLabel ? (
                  <div className="chat-day">
                    <span>{message.dayLabel}</span>
                  </div>
                ) : null}

                <div
                  className={`chat-bubble-row ${isOutgoing ? 'out' : 'in'}${
                    isGroupStart ? ' group-start' : ''
                  }${isGroupEnd ? ' group-end' : ''}`}
                >
                  <div className="chat-bubble">
                    <p>{message.text}</p>
                  </div>
                  {isGroupEnd ? (
                    <div className="chat-bubble-meta">
                      <span>{message.timeLabel}</span>
                      {isOutgoing ? <ChatIcon name="check" className="chat-meta-check" /> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <button type="button" className="chat-icon-button ghost" aria-label="Attach image">
          <ChatIcon name="image" />
        </button>

        <div className="chat-input-wrap">
          <input
            className="chat-input"
            type="text"
            value={draft}
            disabled={!conversation.canSendMessage}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => {
              pendingAutoScrollRef.current = true;
            }}
            placeholder={composerPlaceholder}
          />
        </div>

        <button
          type="submit"
          className="chat-send"
          disabled={!draft.trim() || sending || !conversation.canSendMessage}
          aria-label="Send message"
        >
          {sending ? <span className="button-spinner" aria-hidden="true" /> : <ChatIcon name="send" />}
        </button>
      </form>
    </ChatShell>
  );
}
