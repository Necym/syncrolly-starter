import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { mobileSupabase } from './supabase';

export function useMobileSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mobileSupabase) {
      setLoading(false);
      return;
    }

    mobileSupabase.auth
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
    } = mobileSupabase.auth.onAuthStateChange((_event, nextSession) => {
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
    supabase: mobileSupabase,
    isConfigured: mobileSupabase !== null
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
