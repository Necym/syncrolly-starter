'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWebSession } from '../lib/session';

type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';
type TranscriptRole = 'user' | 'assistant' | 'system';

type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
};

type ClientSecretResponse = {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  voice: string;
};

type RealtimeResponseOutputContent = {
  type?: string;
  text?: string;
  transcript?: string;
};

type RealtimeResponseOutput = {
  content?: RealtimeResponseOutputContent[];
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  response?: {
    output?: Array<
      RealtimeResponseOutput & {
        type?: string;
        name?: string;
        call_id?: string;
        arguments?: string;
      }
    >;
  } | null;
  error?: {
    message?: string;
  } | null;
  [key: string]: unknown;
};

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 14.6a3.1 3.1 0 0 0 3.1-3.1V7.3a3.1 3.1 0 0 0-6.2 0v4.2A3.1 3.1 0 0 0 12 14.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M6.8 11.5a5.2 5.2 0 1 0 10.4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 16.8v3.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.3 20.1h5.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7.5" y="7.5" width="9" height="9" rx="2" fill="currentColor" />
    </svg>
  );
}

export function RealtimeVoiceWidget() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [muted, setMuted] = useState(false);
  const [modelLabel, setModelLabel] = useState('gpt-realtime-mini');
  const { user } = useWebSession();

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const handledFunctionCallsRef = useRef<Set<string>>(new Set());

  const statusLabel = useMemo(() => {
    if (status === 'connecting') {
      return 'Connecting';
    }

    if (status === 'live') {
      return muted ? 'Live, mic muted' : 'Live, listening';
    }

    if (status === 'error') {
      return 'Connection issue';
    }

    return 'Ready';
  }, [muted, status]);

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  function appendMessage(role: TranscriptRole, text: string) {
    const normalized = text.trim();

    if (!normalized) {
      return;
    }

    setMessages((current) => [
      ...current.slice(-5),
      {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text: normalized
      }
    ]);
  }

  function extractAssistantTranscript(event: RealtimeEvent): string | null {
    const outputs = event.response?.output ?? [];

    for (const output of outputs) {
      for (const content of output.content ?? []) {
        const transcript = typeof content.transcript === 'string' ? content.transcript.trim() : '';
        const text = typeof content.text === 'string' ? content.text.trim() : '';

        if (transcript) {
          return transcript;
        }

        if (text) {
          return text;
        }
      }
    }

    return null;
  }

  function extractFunctionCalls(event: RealtimeEvent) {
    const outputs = event.response?.output ?? [];

    return outputs
      .filter((output) => output.type === 'function_call' && output.call_id && output.name)
      .map((output) => {
        let parsedArguments: Record<string, unknown> = {};

        try {
          parsedArguments =
            typeof output.arguments === 'string' && output.arguments.trim()
              ? (JSON.parse(output.arguments) as Record<string, unknown>)
              : {};
        } catch {
          parsedArguments = {};
        }

        return {
          callId: output.call_id as string,
          name: output.name as string,
          arguments: parsedArguments
        };
      });
  }

  function sendRealtimeEvent(event: Record<string, unknown>) {
    const dataChannel = dataChannelRef.current;

    if (!dataChannel || dataChannel.readyState !== 'open') {
      return;
    }

    dataChannel.send(JSON.stringify(event));
  }

  function configureSession() {
    sendRealtimeEvent({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions:
          "You are Syncrolly's realtime web assistant inside a creator monetization platform. The signed-in user is speaking from inside their own authenticated account. If they ask about messages, inbox activity, conversations, DMs, forms, submissions, leads, coaching requests, brand opportunities, or recent asks, use the available tools before answering. Do not claim that you cannot access private information when those tools are available. Be concise, warm, and practical.",
        tools: [
          {
            type: 'function',
            name: 'get_recent_conversations',
            description:
              "Load the user's most recent conversations with participant names and recent messages. Use this for inbox summaries, recent messages, who reached out, and who needs a reply.",
            parameters: {
              type: 'object',
              properties: {
                limit: {
                  type: 'integer'
                },
                messages_per_conversation: {
                  type: 'integer'
                }
              },
              required: ['limit', 'messages_per_conversation']
            }
          },
          {
            type: 'function',
            name: 'get_thread_messages',
            description:
              'Load deeper message history for a specific conversation after you know the conversation_id.',
            parameters: {
              type: 'object',
              properties: {
                conversation_id: {
                  type: 'string'
                },
                limit: {
                  type: 'integer'
                }
              },
              required: ['conversation_id', 'limit']
            }
          },
          {
            type: 'function',
            name: 'get_recent_form_submissions',
            description:
              "Load the creator's recent inquiry form submissions. Use this for pending forms, leads, monetization opportunities, and what supporters have asked through forms.",
            parameters: {
              type: 'object',
              properties: {
                limit: {
                  type: 'integer'
                },
                answers_per_submission: {
                  type: 'integer'
                },
                status_filter: {
                  type: 'string',
                  enum: ['pending', 'opened', 'all']
                }
              },
              required: ['limit', 'answers_per_submission', 'status_filter']
            }
          },
          {
            type: 'function',
            name: 'get_form_submission_details',
            description:
              'Load the full answers for a specific inquiry form submission after you know the submission_id.',
            parameters: {
              type: 'object',
              properties: {
                submission_id: {
                  type: 'string'
                }
              },
              required: ['submission_id']
            }
          }
        ],
        tool_choice: 'auto'
      }
    });
  }

  async function executeRealtimeToolCall(toolName: string, args: Record<string, unknown>) {
    const response = await fetch('/api/realtime/context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        toolName,
        args
      })
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load Syncrolly context.');
    }

    return data;
  }

  async function handleFunctionCalls(event: RealtimeEvent) {
    const functionCalls = extractFunctionCalls(event).filter(
      (call) => !handledFunctionCallsRef.current.has(call.callId)
    );

    if (!functionCalls.length) {
      return false;
    }

    for (const call of functionCalls) {
      handledFunctionCallsRef.current.add(call.callId);

      try {
        const toolOutput = await executeRealtimeToolCall(call.name, call.arguments);

        sendRealtimeEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call.callId,
            output: JSON.stringify(toolOutput)
          }
        });
      } catch (toolError) {
        sendRealtimeEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call.callId,
            output: JSON.stringify({
              error: toolError instanceof Error ? toolError.message : 'Tool execution failed.'
            })
          }
        });
      }
    }

    sendRealtimeEvent({
      type: 'response.create'
    });

    return true;
  }

  async function handleRealtimeEvent(payload: string) {
    try {
      const event = JSON.parse(payload) as RealtimeEvent;

      if (event.type === 'session.created') {
        appendMessage('system', "Voice session connected. Start speaking when you're ready.");
        return;
      }

      if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string') {
        appendMessage('user', event.transcript);
        return;
      }

      if (event.type === 'response.done') {
        if (await handleFunctionCalls(event)) {
          return;
        }

        const assistantTranscript = extractAssistantTranscript(event);

        if (assistantTranscript) {
          appendMessage('assistant', assistantTranscript);
        }

        return;
      }

      if (event.type === 'error') {
        const message = typeof event.error?.message === 'string' ? event.error.message : 'Realtime session error.';
        setError(message);
        setStatus('error');
      }
    } catch {
      // Ignore malformed events from the data channel.
    }
  }

  function cleanupSession() {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
  }

  async function startSession() {
    if (status === 'connecting' || status === 'live') {
      setExpanded(true);
      return;
    }

    if (!user) {
      setExpanded(true);
      setStatus('error');
      setError('Sign in first so the assistant can read your messages and forms.');
      return;
    }

    setExpanded(true);
    setError(null);
    setMessages([]);
    setMuted(false);
    setStatus('connecting');
    handledFunctionCallsRef.current = new Set();

    try {
      const tokenResponse = await fetch('/api/openai/realtime/client-secret', {
        method: 'POST'
      });

      const tokenData = (await tokenResponse.json()) as Partial<ClientSecretResponse> & {
        error?: string;
      };

      if (!tokenResponse.ok || !tokenData.clientSecret) {
        throw new Error(tokenData.error ?? 'Failed to create a realtime client secret.');
      }

      setModelLabel(tokenData.model ?? 'gpt-realtime-mini');

      const peerConnection = new RTCPeerConnection();
      const remoteAudio = document.createElement('audio');
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;
      peerConnectionRef.current = peerConnection;

      peerConnection.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          setStatus('live');
          return;
        }

        if (
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'closed'
        ) {
          cleanupSession();
          setStatus((current) => (current === 'error' ? current : 'idle'));
        }
      };

      const dataChannel = peerConnection.createDataChannel('oai-events');
      dataChannelRef.current = dataChannel;
      dataChannel.addEventListener('open', () => {
        configureSession();
      });
      dataChannel.addEventListener('message', (event) => {
        void handleRealtimeEvent(event.data);
      });

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error('Failed to create a valid WebRTC offer.');
      }

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.clientSecret}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      });

      if (!sdpResponse.ok) {
        const responseText = await sdpResponse.text();
        throw new Error(responseText || 'Failed to establish realtime WebRTC connection.');
      }

      const answerSdp = await sdpResponse.text();

      await peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });

      appendMessage('system', 'Voice session started. Speak naturally and the assistant will answer aloud.');
      setStatus('live');
    } catch (nextError) {
      cleanupSession();
      setStatus('error');
      setError(nextError instanceof Error ? nextError.message : 'Failed to start realtime voice.');
    }
  }

  function stopSession() {
    cleanupSession();
    setStatus('idle');
    setMuted(false);
    setError(null);
    appendMessage('system', 'Voice session ended.');
  }

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);

    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
  }

  return (
    <div className={`realtime-widget${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className={`realtime-widget-trigger${status === 'live' ? ' live' : ''}${status === 'connecting' ? ' connecting' : ''}`}
        aria-label={status === 'live' ? 'Open realtime voice assistant' : 'Start realtime voice assistant'}
        onClick={() => {
          if (!expanded) {
            void startSession();
            return;
          }

          setExpanded((current) => !current);
        }}
      >
        <span className="realtime-widget-trigger-ring" />
        <span className="realtime-widget-trigger-icon">
          <MicGlyph />
        </span>
      </button>

      {expanded ? (
        <section className="realtime-widget-panel" aria-label="Realtime voice assistant">
          <div className="realtime-widget-panel-header">
            <div className="realtime-widget-panel-copy">
              <p className="realtime-widget-kicker">Realtime Voice</p>
              <h2>Web Assistant</h2>
            </div>

            <button
              type="button"
              className="realtime-widget-close"
              aria-label="Collapse voice assistant"
              onClick={() => setExpanded(false)}
            >
              <span />
              <span />
            </button>
          </div>

          <div className="realtime-widget-status-row">
            <div className={`realtime-widget-status-dot status-${status}`} />
            <div className="realtime-widget-status-copy">
              <strong>{statusLabel}</strong>
              <span>{modelLabel}</span>
            </div>
          </div>

          {error ? <p className="realtime-widget-error">{error}</p> : null}

          <div className="realtime-widget-transcript">
            {messages.length ? (
              messages.map((message) => (
                <div key={message.id} className={`realtime-widget-line role-${message.role}`}>
                  <span>{message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'You' : 'Status'}</span>
                  <p>{message.text}</p>
                </div>
              ))
            ) : (
              <div className="realtime-widget-line role-system">
                <span>Status</span>
                <p>Click the mic to start a browser-based realtime voice session.</p>
              </div>
            )}
          </div>

          <div className="realtime-widget-actions">
            {status === 'live' ? (
              <>
                <button type="button" className="realtime-widget-secondary" onClick={toggleMute}>
                  {muted ? 'Unmute mic' : 'Mute mic'}
                </button>

                <button type="button" className="realtime-widget-danger" onClick={stopSession}>
                  <StopGlyph />
                  <span>End call</span>
                </button>
              </>
            ) : (
              <button type="button" className="realtime-widget-primary" onClick={() => void startSession()}>
                <MicGlyph />
                <span>{status === 'connecting' ? 'Connecting...' : 'Start voice chat'}</span>
              </button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
