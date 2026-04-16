'use client';

import type { Database } from '@syncrolly/data';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from './supabase/client';

let webSupabase: SupabaseClient<Database> | null = null;

try {
  webSupabase = createBrowserSupabaseClient();
} catch {
  webSupabase = null;
}

export function useWebSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!webSupabase) {
      setLoading(false);
      return;
    }

    webSupabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const {
      data: { subscription }
    } = webSupabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    supabase: webSupabase,
    isConfigured: webSupabase !== null
  };
}

export function getDefaultDisplayName(user: User | null | undefined): string {
  if (!user) {
    return '';
  }

  const metadataName =
    typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '';

  if (metadataName) {
    return metadataName;
  }

  return user.email?.split('@')[0] ?? '';
}

export function getPreferredRole(user: User | null | undefined): 'creator' | 'supporter' {
  return user?.user_metadata?.role === 'supporter' ? 'supporter' : 'creator';
}
