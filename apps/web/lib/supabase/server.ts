import type { Database } from '@syncrolly/data';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireWebSupabaseEnv } from './env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = requireWebSupabaseEnv();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions);
          });
        } catch {
          // Server components can read cookies but may not be able to persist them here.
        }
      }
    }
  });
}
