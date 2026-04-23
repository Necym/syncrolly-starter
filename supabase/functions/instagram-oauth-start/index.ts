import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

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

function isAllowedRedirectUri(value: string) {
  return (
    value.startsWith('browser://') ||
    value.startsWith('syncrolly://') ||
    value.startsWith('exp://') ||
    value.startsWith('exps://') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  );
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
  const instagramAppId = Deno.env.get('INSTAGRAM_APP_ID');
  const authHeader = request.headers.get('Authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!supabaseUrl || !serviceRoleKey || !publishableKey || !instagramAppId) {
    return jsonResponse(500, {
      error: 'Instagram connect environment is not configured. Set INSTAGRAM_APP_ID.'
    });
  }

  const callbackUrl = new URL('/functions/v1/instagram-oauth-callback', supabaseUrl).toString();

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
      error: 'Unauthorized.'
    });
  }

  let payload: {
    redirectUri?: string;
  };

  try {
    payload = (await request.json()) as {
      redirectUri?: string;
    };
  } catch {
    return jsonResponse(400, {
      error: 'Invalid JSON body.'
    });
  }

  const redirectUri = typeof payload.redirectUri === 'string' ? payload.redirectUri.trim() : '';

  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return jsonResponse(400, {
      error: 'A valid redirectUri is required.'
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error: stateError } = await adminClient.from('instagram_oauth_states').insert({
    state,
    creator_id: viewerId,
    redirect_uri: redirectUri,
    expires_at: expiresAt
  });

  if (stateError) {
    return jsonResponse(500, {
      error: stateError.message
    });
  }

  const authUrl = new URL('https://www.instagram.com/oauth/authorize');
  authUrl.searchParams.set('force_reauth', 'true');
  authUrl.searchParams.set('client_id', instagramAppId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set(
    'scope',
    [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
      'instagram_business_manage_insights'
    ].join(',')
  );

  return jsonResponse(200, {
    connectUrl: authUrl.toString()
  });
});
