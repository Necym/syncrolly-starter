import type { Database } from '@syncrolly/data';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getWebSupabaseEnv } from './env';

export async function updateSession(request: NextRequest) {
  const env = getWebSupabaseEnv();
  let response = NextResponse.next({
    request
  });

  if (!env) {
    return response;
  }

  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  try {
    await supabase.auth.getClaims();
  } catch {
    // A transient auth refresh issue should not take down the public app shell.
  }

  return response;
}
