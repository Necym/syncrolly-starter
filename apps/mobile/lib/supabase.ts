import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@syncrolly/data';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

let autoRefreshRegistered = false;

function getMobileSupabaseEnv() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? null;
  const publishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null;

  return url && publishableKey
    ? {
        url,
        publishableKey
      }
    : null;
}

export function isMobileSupabaseConfigured(): boolean {
  return getMobileSupabaseEnv() !== null;
}

export function createMobileSupabaseClient(): SupabaseClient<Database> {
  const env = getMobileSupabaseEnv();

  if (!env) {
    throw new Error(
      'Missing Expo Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  return createClient<Database>(env.url, env.publishableKey, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock
    }
  });
}

export const mobileSupabase = isMobileSupabaseConfigured() ? createMobileSupabaseClient() : null;

if (mobileSupabase && Platform.OS !== 'web' && !autoRefreshRegistered) {
  autoRefreshRegistered = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      mobileSupabase.auth.startAutoRefresh();
      return;
    }

    mobileSupabase.auth.stopAutoRefresh();
  });
}
