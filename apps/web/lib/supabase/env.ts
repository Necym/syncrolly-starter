export function getWebSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;

  return url && publishableKey
    ? {
        url,
        publishableKey
      }
    : null;
}

export function requireWebSupabaseEnv() {
  const env = getWebSupabaseEnv();

  if (!env) {
    throw new Error(
      'Missing web Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  return env;
}
