import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

type Database = {
  public: {
    Tables: {
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          user_id: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
        };
      };
      push_devices: {
        Row: {
          expo_push_token: string;
          user_id: string;
        };
      };
    };
  };
};

type NotifyPayload = {
  messageId?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      error: 'Method not allowed'
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publishableKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = request.headers.get('Authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

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
      error: 'Unauthorized'
    });
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  let payload: NotifyPayload;

  try {
    payload = (await request.json()) as NotifyPayload;
  } catch {
    return jsonResponse(400, {
      error: 'Invalid JSON body.'
    });
  }

  if (!payload.messageId) {
    return jsonResponse(400, {
      error: 'messageId is required.'
    });
  }

  const { data: message, error: messageError } = await adminClient
    .from('messages')
    .select('*')
    .eq('id', payload.messageId)
    .maybeSingle();

  if (messageError) {
    return jsonResponse(500, {
      error: messageError.message
    });
  }

  if (!message) {
    return jsonResponse(404, {
      error: 'Message not found.'
    });
  }

  if (message.sender_id !== viewerId) {
    return jsonResponse(403, {
      error: 'You can only notify recipients for your own messages.'
    });
  }

  const [{ data: participants, error: participantsError }, { data: senderProfile, error: senderError }] =
    await Promise.all([
      adminClient
        .from('conversation_participants')
        .select('*')
        .eq('conversation_id', message.conversation_id),
      adminClient.from('profiles').select('*').eq('id', message.sender_id).maybeSingle()
    ]);

  if (participantsError) {
    return jsonResponse(500, {
      error: participantsError.message
    });
  }

  if (senderError) {
    return jsonResponse(500, {
      error: senderError.message
    });
  }

  const recipientIds = (participants ?? [])
    .map((participant) => participant.user_id)
    .filter((participantUserId) => participantUserId !== message.sender_id);

  if (!recipientIds.length) {
    return jsonResponse(200, {
      success: true,
      delivered: 0
    });
  }

  const { data: devices, error: devicesError } = await adminClient
    .from('push_devices')
    .select('*')
    .in('user_id', recipientIds);

  if (devicesError) {
    return jsonResponse(500, {
      error: devicesError.message
    });
  }

  const pushTokens = [...new Set((devices ?? []).map((device) => device.expo_push_token).filter(Boolean))];

  if (!pushTokens.length) {
    return jsonResponse(200, {
      success: true,
      delivered: 0
    });
  }

  const senderName = senderProfile?.display_name?.trim() || 'New message';
  const pushBody = {
    to: pushTokens,
    title: senderName,
    body: message.body,
    sound: 'default',
    data: {
      threadId: message.conversation_id
    }
  };

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(pushBody)
  });

  const expoResult = (await expoResponse.json().catch(() => null)) as unknown;

  if (!expoResponse.ok) {
    return jsonResponse(502, {
      error: 'Expo push request failed.',
      expoResult
    });
  }

  return jsonResponse(200, {
    success: true,
    delivered: pushTokens.length,
    expoResult
  });
});
