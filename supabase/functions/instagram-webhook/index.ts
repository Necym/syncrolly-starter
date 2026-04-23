import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

function textResponse(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
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

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function fetchInstagramLeadProfile(senderId: string, accessToken: string, graphVersion: string) {
  try {
    const profileUrl = new URL(`https://graph.instagram.com/${graphVersion}/${senderId}`);
    profileUrl.searchParams.set('fields', 'name,username,profile_pic');
    profileUrl.searchParams.set('access_token', accessToken);

    const payload = await fetchJson(profileUrl);
    const name = getOptionalString(payload.name);
    const username = getOptionalString(payload.username);
    const profilePictureUrl = getOptionalString(payload.profile_pic);

    return {
      displayName: name ?? (username ? `@${username}` : null),
      instagramUsername: username,
      profilePictureUrl
    };
  } catch {
    return null;
  }
}

async function createSignature(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const bytes = Array.from(new Uint8Array(signatureBuffer));
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getMessageText(message: Record<string, unknown>) {
  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const firstAttachment = attachments[0];

  if (typeof firstAttachment === 'object' && firstAttachment !== null && typeof (firstAttachment as { type?: unknown }).type === 'string') {
    return `[${(firstAttachment as { type: string }).type}]`;
  }

  return '[Message]';
}

Deno.serve(async (request) => {
  const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');
  const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v23.0';

  if (!verifyToken || !appSecret || !supabaseUrl || !serviceRoleKey) {
    return textResponse(500, 'Instagram webhook environment is not configured. Set INSTAGRAM_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN.');
  }

  if (request.method === 'GET') {
    const requestUrl = new URL(request.url);
    const mode = requestUrl.searchParams.get('hub.mode');
    const challenge = requestUrl.searchParams.get('hub.challenge');
    const requestToken = requestUrl.searchParams.get('hub.verify_token');

    if (mode === 'subscribe' && requestToken === verifyToken && challenge) {
      return textResponse(200, challenge);
    }

    return textResponse(403, 'Token verification failed.');
  }

  if (request.method !== 'POST') {
    return textResponse(405, 'Method not allowed.');
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-hub-signature-256');

  if (signatureHeader) {
    const expectedSignature = `sha256=${await createSignature(appSecret, rawBody)}`;

    if (signatureHeader !== expectedSignature) {
      return textResponse(401, 'Invalid signature.');
    }
  }

  let payload: {
    object?: unknown;
    entry?: unknown;
  };

  try {
    payload = JSON.parse(rawBody) as {
      object?: unknown;
      entry?: unknown;
    };
  } catch {
    return textResponse(400, 'Invalid JSON payload.');
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const objectType = typeof payload.object === 'string' ? payload.object : 'instagram';
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  let processedEvents = 0;

  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const entryRecord = entry as {
      id?: unknown;
      messaging?: unknown;
      time?: unknown;
    };

    const entryId = typeof entryRecord.id === 'string' ? entryRecord.id : null;
    const messagingEvents = Array.isArray(entryRecord.messaging) ? entryRecord.messaging : [];

    for (const rawEvent of messagingEvents) {
      if (typeof rawEvent !== 'object' || rawEvent === null) {
        continue;
      }

      const event = rawEvent as {
        sender?: { id?: unknown };
        recipient?: { id?: unknown };
        message?: Record<string, unknown>;
        postback?: unknown;
        reaction?: unknown;
        read?: unknown;
        delivery?: unknown;
        timestamp?: unknown;
      };

      const recipientId =
        typeof event.recipient?.id === 'string'
          ? event.recipient.id
          : entryId;
      const senderId = typeof event.sender?.id === 'string' ? event.sender.id : null;
      const message = typeof event.message === 'object' && event.message !== null ? event.message : null;
      const metaMessageId = message && typeof message.mid === 'string' ? message.mid : null;
      const occurredAt =
        typeof event.timestamp === 'number'
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString();
      const eventType = message
        ? 'message'
        : event.reaction
          ? 'reaction'
          : event.read
            ? 'read'
            : event.delivery
              ? 'delivery'
              : event.postback
                ? 'postback'
                : 'unknown';

      const { data: connection, error: connectionError } = recipientId
        ? await adminClient
            .from('instagram_account_connections')
            .select('*')
            .eq('instagram_user_id', recipientId)
            .maybeSingle()
        : { data: null, error: null };

      if (connectionError) {
        return jsonResponse(500, {
          error: connectionError.message
        });
      }

      await adminClient.from('instagram_webhook_events').insert({
        connection_id: connection?.id ?? null,
        object_type: objectType,
        event_type: eventType,
        meta_event_id: metaMessageId,
        payload: rawEvent,
        processed_at: new Date().toISOString()
      });

      if (!connection || !message || !senderId) {
        processedEvents += 1;
        continue;
      }

      if (senderId === connection.instagram_user_id) {
        processedEvents += 1;
        continue;
      }

      const { data: connectionSecret, error: connectionSecretError } = await adminClient
        .from('instagram_connection_secrets')
        .select('page_access_token')
        .eq('connection_id', connection.id)
        .maybeSingle();

      if (connectionSecretError) {
        return jsonResponse(500, {
          error: connectionSecretError.message
        });
      }

      const senderProfile =
        typeof connectionSecret?.page_access_token === 'string' && connectionSecret.page_access_token
          ? await fetchInstagramLeadProfile(senderId, connectionSecret.page_access_token, graphVersion)
          : null;

      const { data: existingMessage, error: existingMessageError } = metaMessageId
        ? await adminClient
            .from('instagram_lead_messages')
            .select('id')
            .eq('meta_message_id', metaMessageId)
            .maybeSingle()
        : { data: null, error: null };

      if (existingMessageError) {
        return jsonResponse(500, {
          error: existingMessageError.message
        });
      }

      if (existingMessage) {
        processedEvents += 1;
        continue;
      }

      const threadKey = senderId;
      const { data: existingLead, error: leadLookupError } = await adminClient
        .from('instagram_leads')
        .select('*')
        .eq('connection_id', connection.id)
        .eq('instagram_thread_key', threadKey)
        .maybeSingle();

      if (leadLookupError) {
        return jsonResponse(500, {
          error: leadLookupError.message
        });
      }

      const messageText = getMessageText(message);
      let lead = existingLead;

      if (!lead) {
        const { data: insertedLead, error: insertLeadError } = await adminClient
          .from('instagram_leads')
          .insert({
            creator_id: connection.creator_id,
            connection_id: connection.id,
            instagram_thread_key: threadKey,
            instagram_scoped_user_id: senderId,
            instagram_username: senderProfile?.instagramUsername ?? null,
            display_name: senderProfile?.displayName ?? `IG ${senderId.slice(-6)}`,
            profile_picture_url: senderProfile?.profilePictureUrl ?? null,
            last_message_text: messageText,
            last_message_at: occurredAt,
            unread_count: 1,
            lead_status: 'new'
          })
          .select('*')
          .single();

        if (insertLeadError) {
          return jsonResponse(500, {
            error: insertLeadError.message
          });
        }

        lead = insertedLead;
      } else {
        const leadUpdate: Record<string, unknown> = {
          last_message_text: messageText,
          last_message_at: occurredAt,
          unread_count: lead.unread_count + 1
        };

        if (senderProfile?.displayName) {
          leadUpdate.display_name = senderProfile.displayName;
        }

        if (senderProfile?.instagramUsername) {
          leadUpdate.instagram_username = senderProfile.instagramUsername;
        }

        if (senderProfile?.profilePictureUrl) {
          leadUpdate.profile_picture_url = senderProfile.profilePictureUrl;
        }

        const { error: updateLeadError } = await adminClient
          .from('instagram_leads')
          .update(leadUpdate)
          .eq('id', lead.id);

        if (updateLeadError) {
          return jsonResponse(500, {
            error: updateLeadError.message
          });
        }
      }

      const { error: insertMessageError } = await adminClient.from('instagram_lead_messages').insert({
        lead_id: lead.id,
        connection_id: connection.id,
        meta_message_id: metaMessageId,
        direction: 'inbound',
        message_type: typeof message.type === 'string' ? message.type : 'text',
        text_body: messageText,
        raw_payload: rawEvent,
        sent_at: occurredAt
      });

      if (insertMessageError) {
        return jsonResponse(500, {
          error: insertMessageError.message
        });
      }

      await adminClient
        .from('instagram_account_connections')
        .update({
          last_synced_at: occurredAt
        })
        .eq('id', connection.id);

      processedEvents += 1;
    }
  }

  return jsonResponse(200, {
    received: true,
    processedEvents
  });
});
