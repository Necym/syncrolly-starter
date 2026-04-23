import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function redirectTo(location: string) {
  if (location.startsWith('http://') || location.startsWith('https://')) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: location
      }
    });
  }

  const escapedLocation = escapeHtml(location);

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Return to Syncrolly</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f8fb;
        color: #101828;
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 380px;
        background: #ffffff;
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 18px 40px rgba(16, 24, 40, 0.08);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 18px;
        line-height: 1.5;
        color: #475467;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 14px;
        background: #115cb9;
        color: #ffffff;
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Returning to Syncrolly</h1>
      <p>If the app does not open automatically, tap below.</p>
      <a href="${escapedLocation}">Open Syncrolly</a>
    </div>
    <script>
      window.location.replace(${JSON.stringify(location)});
      setTimeout(function () {
        window.location.href = ${JSON.stringify(location)};
      }, 600);
    </script>
  </body>
</html>`,
    {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
    }
  );
}

function browserStatusPage(params: Record<string, string>) {
  const isSuccess = params.status === 'success';
  const title = isSuccess ? 'Instagram connected' : 'Instagram connect failed';
  const body = isSuccess
    ? typeof params.instagramUsername === 'string' && params.instagramUsername.trim()
      ? `@${params.instagramUsername.trim()} is now connected. You can close this page and return to Syncrolly.`
      : 'Your Instagram account is connected. You can close this page and return to Syncrolly.'
    : typeof params.message === 'string' && params.message.trim()
      ? params.message.trim()
      : 'Please return to Syncrolly and try again.';

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f8fb;
        color: #101828;
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 400px;
        background: #ffffff;
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 18px 40px rgba(16, 24, 40, 0.08);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.5;
        color: #475467;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border: 0;
        border-radius: 14px;
        background: #115cb9;
        color: #ffffff;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }
      .note {
        font-size: 13px;
        color: #667085;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      <p class="note">Return to the Instagram tab in Syncrolly. It will refresh after the browser closes.</p>
      <button class="button" onclick="window.close()">Done</button>
    </div>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}

function textResponse(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

function appendParams(urlValue: string, params: Record<string, string>) {
  const separator = urlValue.includes('?') ? '&' : '?';
  const nextQuery = new URLSearchParams(params).toString();
  return `${urlValue}${separator}${nextQuery}`;
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
          : typeof json?.message === 'string'
            ? json.message
            : text.trim() || `Instagram request failed with ${response.status}.`
    );
  }

  return json ?? {};
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') {
    return textResponse(405, 'Method not allowed.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const instagramAppId = Deno.env.get('INSTAGRAM_APP_ID');
  const instagramAppSecret = Deno.env.get('INSTAGRAM_APP_SECRET');

  if (!supabaseUrl || !serviceRoleKey || !instagramAppId || !instagramAppSecret) {
    return textResponse(500, 'Instagram OAuth callback environment is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET.');
  }

  const requestUrl = new URL(request.url);
  const callbackUrl = new URL('/functions/v1/instagram-oauth-callback', supabaseUrl).toString();
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const oauthError = requestUrl.searchParams.get('error_message') ?? requestUrl.searchParams.get('error_description');

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const oauthStateQuery = adminClient.from('instagram_oauth_states').select('*');

  const { data: oauthState, error: stateError } = state
    ? await oauthStateQuery.eq('state', state).maybeSingle()
    : await oauthStateQuery
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  if (stateError) {
    return textResponse(500, stateError.message);
  }

  if (!oauthState) {
    return textResponse(400, state ? 'OAuth state was not found.' : 'Missing OAuth state and no pending Instagram connect request was found.');
  }

  const respondToClient = (params: Record<string, string>) => {
    if (oauthState.redirect_uri.startsWith('browser://')) {
      return browserStatusPage(params);
    }

    return redirectTo(appendParams(oauthState.redirect_uri, params));
  };

  const finishWithRedirect = async (params: Record<string, string>) => {
    return respondToClient(params);
  };

  if (oauthState.used_at) {
    return respondToClient({
      status: 'error',
      message: 'This Instagram connect link has already been used.'
    });
  }

  if (new Date(oauthState.expires_at).getTime() < Date.now()) {
    return respondToClient({
      status: 'error',
      message: 'This Instagram connect link expired. Please try again.'
    });
  }

  const claimedAt = new Date().toISOString();
  const { data: claimedState, error: claimError } = await adminClient
    .from('instagram_oauth_states')
    .update({
      used_at: claimedAt
    })
    .eq('state', oauthState.state)
    .is('used_at', null)
    .select('state')
    .maybeSingle();

  if (claimError) {
    return textResponse(500, claimError.message);
  }

  if (!claimedState) {
    return respondToClient({
      status: 'error',
      message: 'This Instagram connect link has already been used.'
    });
  }

  if (oauthError) {
    return finishWithRedirect({
      status: 'error',
      message: oauthError
    });
  }

  if (!code) {
    return finishWithRedirect({
      status: 'error',
      message: 'Instagram did not return an authorization code.'
    });
  }

  try {
    const shortLivedTokenBody = new URLSearchParams();
    shortLivedTokenBody.set('client_id', instagramAppId);
    shortLivedTokenBody.set('client_secret', instagramAppSecret);
    shortLivedTokenBody.set('grant_type', 'authorization_code');
    shortLivedTokenBody.set('redirect_uri', callbackUrl);
    shortLivedTokenBody.set('code', code);

    const shortTokenPayload = await fetchJson('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: shortLivedTokenBody.toString()
    });

    const shortLivedAccessToken =
      typeof shortTokenPayload.access_token === 'string' ? shortTokenPayload.access_token : null;
    const shortLivedUserId =
      typeof shortTokenPayload.user_id === 'string'
        ? shortTokenPayload.user_id
        : typeof shortTokenPayload.user_id === 'number'
          ? String(shortTokenPayload.user_id)
          : null;

    if (!shortLivedAccessToken) {
      throw new Error('Instagram did not return an access token.');
    }

    const tokenExpiresIn =
      typeof shortTokenPayload.expires_in === 'number' && Number.isFinite(shortTokenPayload.expires_in)
        ? shortTokenPayload.expires_in
        : null;

    const longLivedTokenUrl = new URL('https://graph.instagram.com/access_token');
    longLivedTokenUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedTokenUrl.searchParams.set('client_secret', instagramAppSecret);
    longLivedTokenUrl.searchParams.set('access_token', shortLivedAccessToken);

    const longTokenPayload = await fetchJson(longLivedTokenUrl).catch(() => shortTokenPayload);
    const userAccessToken =
      typeof longTokenPayload.access_token === 'string' ? longTokenPayload.access_token : shortLivedAccessToken;
    const userTokenExpiresIn =
      typeof longTokenPayload.expires_in === 'number' && Number.isFinite(longTokenPayload.expires_in)
        ? longTokenPayload.expires_in
        : tokenExpiresIn;

    let profilePayload: Record<string, unknown> = {};
    const profileFieldSets = [
      'user_id,username,name,profile_picture_url',
      'user_id,username,profile_pic',
      'id,username'
    ];

    for (const fieldSet of profileFieldSets) {
      try {
        const profileUrl = new URL('https://graph.instagram.com/me');
        profileUrl.searchParams.set('fields', fieldSet);
        profileUrl.searchParams.set('access_token', userAccessToken);
        profilePayload = await fetchJson(profileUrl);
        break;
      } catch {
        continue;
      }
    }

    const instagramUserId =
      typeof profilePayload.user_id === 'string'
        ? profilePayload.user_id
        : typeof profilePayload.user_id === 'number'
          ? String(profilePayload.user_id)
          : typeof profilePayload.id === 'string'
            ? profilePayload.id
            : typeof profilePayload.id === 'number'
              ? String(profilePayload.id)
              : shortLivedUserId;

    if (!instagramUserId) {
      throw new Error('Instagram did not return an account id.');
    }

    const instagramUsername = typeof profilePayload.username === 'string' ? profilePayload.username : null;
    const instagramProfilePictureUrl =
      typeof profilePayload.profile_picture_url === 'string'
        ? profilePayload.profile_picture_url
        : typeof profilePayload.profile_pic === 'string'
          ? profilePayload.profile_pic
          : null;

    const nowIso = new Date().toISOString();
    const tokenExpiresAt =
      typeof userTokenExpiresIn === 'number'
        ? new Date(Date.now() + userTokenExpiresIn * 1000).toISOString()
        : null;

    const { data: connection, error: connectionError } = await adminClient
      .from('instagram_account_connections')
      .upsert(
        {
          creator_id: oauthState.creator_id,
          facebook_user_id: null,
          page_id: instagramUserId,
          page_name: instagramUsername,
          instagram_user_id: instagramUserId,
          instagram_username: instagramUsername,
          instagram_profile_picture_url: instagramProfilePictureUrl,
          status: 'active',
          last_synced_at: nowIso
        },
        {
          onConflict: 'creator_id'
        }
      )
      .select('*')
      .single();

    if (connectionError) {
      throw new Error(connectionError.message);
    }

    const { error: secretError } = await adminClient.from('instagram_connection_secrets').upsert(
      {
        connection_id: connection.id,
        page_access_token: userAccessToken,
        token_expires_at: tokenExpiresAt
      },
      {
        onConflict: 'connection_id'
      }
    );

    if (secretError) {
      throw new Error(secretError.message);
    }

    return finishWithRedirect({
      status: 'success',
      instagramUsername: instagramUsername ?? 'instagram'
    });
  } catch (error) {
    return finishWithRedirect({
      status: 'error',
      message: error instanceof Error ? error.message : 'Instagram connect failed.'
    });
  }
});
