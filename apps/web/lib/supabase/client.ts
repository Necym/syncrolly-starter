import type { Database } from '@syncrolly/data';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireWebSupabaseEnv } from './env';

let browserClient: SupabaseClient<Database> | null = null;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const env = requireWebSupabaseEnv();

  browserClient = createBrowserClient<Database>(env.url, env.publishableKey);
  return browserClient;
}
