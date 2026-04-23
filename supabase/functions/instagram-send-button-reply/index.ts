import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

type Database = {
  public: {
    Enums: {
      instagram_lead_status: 'new' | 'replied' | 'qualified' | 'archived';
      instagram_message_direction: 'inbound' | 'outbound';
    };
    Tables: {
      instagram_leads: {
        Row: {
          id: string;
          creator_id: string;
          connection_id: string;
          instagram_scoped_user_id: string;
          lead_status: Database['public']['Enums']['instagram_lead_status'];
          last_message_text: string;
          last_message_at: string;
          unread_count: number;
          updated_at: string;
        };
      };
      instagram_account_connections: {
        Row: {
          id: string;
          creator_id: string;
          instagram_user_id: string;
          last_synced_at: string | null;
        };
      };
      instagram_connection_secrets: {
        Row: {
          connection_id: string;
          page_access_token: string;
        };
      };
      instagram_lead_messages: {
        Row: {
          id: string;
          lead_id: string;
          connection_id: string;
          meta_message_id: string | null;
          direction: Database['public']['Enums']['instagram_message_direction'];
          message_type: string;
          text_body: string;
          raw_payload: Record<string, unknown>;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          lead_id: string;
          connection_id: string;
          meta_message_id?: string | null;
          direction: Database['public']['Enums']['instagram_message_direction'];
          message_type: string;
          text_body: string;
          raw_payload?: Record<string, unknown>;
          sent_at?: string;
        };
      };
    };
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Instagram's button template expects a text field, even when we want the
// message to behave like a button-only CTA.
const BUTTON_ONLY_PLACEHOLDER = '\u200B';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

async function fetchJson(url: URL | string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json: Record<string, unknown> | null = null;

  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(
      typeof json?.error === 'object' &&
        json?.error !== null &&
        typeof (json.error as { message?: unknown }).message === 'string'
        ? (json.error as { message: string }).message
        : typeof json?.error_message === 'string'
          ? json.error_message
          : typeof json?.error === 'string'
            ? json.error
            : `Instagram request failed with ${response.status}.`
    );
  }

  return json ?? {};
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Button links must use http or https.');
    }

    return url.toString();
  } catch {
    throw new Error('Enter a valid button URL.');
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      error: 'Method not allowed.'
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publishableKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = request.headers.get('Authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
  const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v23.0';

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    return jsonResponse(500, {
      error: 'Supabase Edge Function environment is not configured.'
    });
  }

  if (!accessToken) {
    return jsonResponse(401, {
      error: 'Missing authorization token.'
    });
  }

  let payload: {
    leadId?: unknown;
    text?: unknown;
    buttonTitle?: unknown;
    buttonUrl?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse(400, {
      error: 'Invalid JSON body.'
    });
  }

  const leadId = typeof payload.leadId === 'string' ? payload.leadId : null;
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const buttonTitle = typeof payload.buttonTitle === 'string' ? payload.buttonTitle.trim() : '';

  if (!leadId) {
    return jsonResponse(400, {
      error: 'Lead id is required.'
    });
  }

  if (!buttonTitle) {
    return jsonResponse(400, {
      error: 'Button title is required.'
    });
  }

  let buttonUrl: string;

  try {
    buttonUrl = normalizeUrl(typeof payload.buttonUrl === 'string' ? payload.buttonUrl : '');
  } catch (error) {
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : 'Enter a valid button URL.'
    });
  }

  const verificationClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: userData,
    error: userError
  } = await verificationClient.auth.getUser(accessToken);

  const viewerId = typeof userData?.user?.id === 'string' ? userData.user.id : null;

  if (userError || !viewerId) {
    return jsonResponse(401, {
      error: userError?.message ?? 'Not authenticated.'
    });
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data: lead, error: leadError } = await adminClient
    .from('instagram_leads')
    .select('*')
    .eq('id', leadId)
    .eq('creator_id', viewerId)
    .maybeSingle();

  if (leadError) {
    return jsonResponse(500, {
      error: leadError.message
    });
  }

  if (!lead) {
    return jsonResponse(404, {
      error: 'Instagram lead not found.'
    });
  }

  const { data: connection, error: connectionError } = await adminClient
    .from('instagram_account_connections')
    .select('*')
    .eq('id', lead.connection_id)
    .eq('creator_id', viewerId)
    .maybeSingle();

  if (connectionError) {
    return jsonResponse(500, {
      error: connectionError.message
    });
  }

  if (!connection) {
    return jsonResponse(404, {
      error: 'Instagram connection not found.'
    });
  }

  const { data: connectionSecret, error: secretError } = await adminClient
    .from('instagram_connection_secrets')
    .select('page_access_token')
    .eq('connection_id', connection.id)
    .maybeSingle();

  if (secretError) {
    return jsonResponse(500, {
      error: secretError.message
    });
  }

  if (!connectionSecret?.page_access_token) {
    return jsonResponse(400, {
      error: 'Instagram access token is missing for this connection.'
    });
  }

  const sendText = text || BUTTON_ONLY_PLACEHOLDER;
  const leadPreviewText = text || buttonTitle;

  const outboundPayload = {
    recipient: {
      id: lead.instagram_scoped_user_id
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: sendText,
          buttons: [
            {
              type: 'web_url',
              url: buttonUrl,
              title: buttonTitle
            }
          ]
        }
      }
    }
  };

  try {
    const sendUrl = new URL(`https://graph.instagram.com/${graphVersion}/${connection.instagram_user_id}/messages`);
    const sendResult = await fetchJson(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connectionSecret.page_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(outboundPayload)
    });

    const nowIso = new Date().toISOString();
    const nextLeadStatus = lead.lead_status === 'new' ? 'replied' : lead.lead_status;

    const { data: insertedMessage, error: insertMessageError } = await adminClient
      .from('instagram_lead_messages')
      .insert({
        lead_id: lead.id,
        connection_id: lead.connection_id,
        meta_message_id: typeof sendResult.message_id === 'string' ? sendResult.message_id : null,
        direction: 'outbound',
        message_type: 'button_template',
        text_body: text,
        raw_payload: {
          ...outboundPayload,
          instagram_response: sendResult
        },
        sent_at: nowIso
      })
      .select('*')
      .single();

    if (insertMessageError) {
      return jsonResponse(500, {
        error: insertMessageError.message
      });
    }

    const { error: updateLeadError } = await adminClient
      .from('instagram_leads')
      .update({
        last_message_text: leadPreviewText,
        last_message_at: nowIso,
        unread_count: 0,
        lead_status: nextLeadStatus
      })
      .eq('id', lead.id);

    if (updateLeadError) {
      return jsonResponse(500, {
        error: updateLeadError.message
      });
    }

    await adminClient
      .from('instagram_account_connections')
      .update({
        last_synced_at: nowIso
      })
      .eq('id', connection.id);

    return jsonResponse(200, {
      message: insertedMessage
    });
  } catch (error) {
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : 'Instagram reply failed.'
    });
  }
});
