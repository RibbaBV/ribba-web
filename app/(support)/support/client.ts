'use client';

// Gedeelde supabase-client en sessiecontrole voor de supportschermen.
//
// De client wordt lui aangemaakt: tijdens het prerenderen bestaat er geen
// browser en zou createBrowserClient de build laten klappen.

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { hasFreshSupportMfa } from '@/lib/support-session';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}

export type SessieStatus = 'laden' | 'ok' | 'geen-toegang';

/**
 * Geeft het access token terug, maar alleen als de tweede factor in deze
 * sessie daadwerkelijk én maximaal acht uur geleden is gebruikt (aal2).
 *
 * Dit is gemak, geen beveiliging: de API controleert aal2 en de MFA-tijd zelf. Deze
 * hook voorkomt alleen dat je een leeg scherm met een 403 te zien krijgt.
 */
export function useSupportToken(): { token: string | null; status: SessieStatus } {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SessieStatus>('laden');

  useEffect(() => {
    let afgebroken = false;
    let revision = 0;
    let currentSession: Session | null = null;
    const supabase = getSupabase();
    const update = (session: Session | null) => {
      if (afgebroken) return;
      currentSession = session;
      const fresh = session && hasFreshSupportMfa(session.access_token);
      setToken(fresh ? session.access_token : null);
      setStatus(fresh ? 'ok' : 'geen-toegang');
    };
    // Geen async auth-aanroepen in de callback: die kunnen de auth-lock blokkeren.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      revision += 1;
      update(session);
    });
    const initialRevision = revision;
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (revision === initialRevision) update(error ? null : session);
    }).catch(() => {
      if (revision === initialRevision) update(null);
    });
    // Ook zonder netwerkverkeer verdwijnt de data wanneer MFA verloopt.
    // De API bewaakt dezelfde deadline onafhankelijk van deze browserklok.
    const recheck = () => update(currentSession);
    const timer = window.setInterval(recheck, 1000);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      afgebroken = true;
      subscription.unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  return { token, status };
}
