import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-mini';
const DEFAULT_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'alloy';

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'Missing OPENAI_API_KEY. Add it to apps/web/.env.local before testing realtime voice on the web.'
      },
      { status: 500 }
    );
  }

  const sessionConfig = {
    expires_after: {
      anchor: 'created_at',
      seconds: 60
    },
    session: {
      type: 'realtime',
      model: DEFAULT_REALTIME_MODEL,
      instructions:
        'You are Synced-In’s experimental realtime web voice assistant. Speak naturally, keep responses concise, and be helpful.',
      audio: {
        input: {
          transcription: {
            model: 'gpt-4o-mini-transcribe'
          },
          turn_detection: {
            type: 'server_vad',
            create_response: true,
            interrupt_response: true
          }
        },
        output: {
          voice: DEFAULT_REALTIME_VOICE
        }
      }
    }
  };

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionConfig),
      cache: 'no-store'
    });

    const raw = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: raw || 'Failed to mint a realtime client secret.'
        },
        { status: response.status }
      );
    }

    const data = JSON.parse(raw) as {
      value?: string;
      expires_at?: number;
      client_secret?: {
        value?: string;
        expires_at?: number;
      };
      session?: {
        model?: string;
        audio?: {
          output?: {
            voice?: string;
          };
        };
      };
    };

    const clientSecret = data.value ?? data.client_secret?.value ?? null;
    const expiresAt = data.expires_at ?? data.client_secret?.expires_at ?? null;

    if (!clientSecret) {
      return NextResponse.json(
        {
          error: 'OpenAI returned a realtime session response without a client secret.'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clientSecret,
      expiresAt,
      model: data.session?.model ?? DEFAULT_REALTIME_MODEL,
      voice: data.session?.audio?.output?.voice ?? DEFAULT_REALTIME_VOICE
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create realtime session.';

    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
